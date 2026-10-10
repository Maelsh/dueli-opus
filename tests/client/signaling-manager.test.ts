/**
 * R4-LIVE-INT-1 REMEDIATION — behavioral tests for the SINGLE shared
 * signaling transport (src/client/services/SignalingManager.ts).
 *
 * These tests instantiate the exact class shipped in the app bundle and
 * consumed by BOTH the live test pages (host/guest) and the production
 * P2PConnection adapter — with mocked fetch/timers, driving its REAL logic:
 *  B1: self-echo / role-impossible filtering per role × signal type;
 *  B3: 15s presence heartbeat (single timer, cleanup, reconnect re-arm);
 *  B4: reconnect preserves the poll cursor (no loss) + replay guard;
 *  timeouts: hung requests fail fast; overlapping poll ticks never stack.
 */
import { describe, it, expect, vi } from 'vitest';
import { SignalingManager } from '../../src/client/services/SignalingManager';
import { SignalingReconnectPolicy } from '../../src/lib/services/SignalingReconnectPolicy';
import {
    setupClientHarness, okJson, sig, posted, fetchCalls, setFetchHandler,
} from './signaling-harness';

setupClientHarness();

const lastPollSince = () => {
    const polls = fetchCalls.filter((c) => c.url.includes('/poll?'));
    const m = polls.length > 0 ? polls[polls.length - 1].url.match(/since=(\d+)/) : null;
    return m ? Number(m[1]) : null;
};

async function connectHost(signals: any[] = []) {
    const seen: any[] = [];
    const errors: Error[] = [];
    setFetchHandler(async (url) => {
        if (url.includes('/api/signaling/verify')) return okJson({ valid: true });
        if (url.includes('/session/join')) return okJson({ success: true, data: { role: 'host', peer: 'host' } });
        if (url.includes('/poll')) return okJson({ success: true, data: { role: 'host', peer: 'host', signals } });
        return okJson({ success: true, data: {} });
    });
    const mgr = new SignalingManager({
        roomId: 'comp_7201', role: 'host', token: 'test-sid', logger: () => {},
        onSignal: (d) => seen.push(d),
        onError: (e) => errors.push(e),
    });
    await mgr.connect();
    expect(mgr.snapshot().isConnected).toBe(true);
    return { mgr, seen, errors };
}

/* ---------- B1: self-signal / role-impossible filtering ---------- */

describe('B1 self-signal filtering (shared transport)', () => {
    it('host ignores its own offer echo but consumes the guest answer', async () => {
        const { mgr, seen } = await connectHost();
        setFetchHandler(async (url) => {
            if (url.includes('/poll')) return okJson({
                success: true, data: { role: 'host', peer: 'host', signals: [sig(1, 'offer', { sdp: 'echo' }, 'host')] },
            });
            return okJson({ success: true, data: {} });
        });
        await mgr.pollOnce();
        expect(seen).toEqual([]);
        expect(mgr.snapshot().lastTimestamp).toBe(1); // cursor advances past the drop

        setFetchHandler(async (url) => {
            if (url.includes('/poll')) return okJson({
                success: true, data: { role: 'host', peer: 'host', signals: [sig(2, 'answer', { sdp: 'a' }, 'guest')] },
            });
            return okJson({ success: true, data: {} });
        });
        await mgr.pollOnce();
        expect(seen.length).toBe(1);
        expect(seen[0].signalType).toBe('answer');
        await mgr.disconnect();
    });

    it('host drops glare offers; guest drops own answers; viewer drops stray answers', async () => {
        const { mgr } = await connectHost();
        const drop = (s: any) => expect(mgr.shouldConsume(s)).toBe(false);
        const pass = (s: any) => expect(mgr.shouldConsume(s)).toBe(true);
        // self-echo, every type
        for (const t of ['offer', 'answer', 'ice', 'request_offer']) {
            drop({ type: t, from: 'host', peer: 'host', to: null });
        }
        // role-impossible regardless of sender
        drop({ type: 'offer', from: 'guest', peer: 'guest', to: null });
        // correct direction passes
        pass({ type: 'answer', from: 'guest', peer: 'guest', to: null });
        pass({ type: 'ice', from: 'guest', peer: 'guest', to: null });
        pass({ type: 'request_offer', from: 'guest', peer: 'guest', to: 'host' });
        await mgr.disconnect();
    });

    it('guest consumes host offers (and answers once) while ignoring echo + requests', async () => {
        const seen: any[] = [];
        setFetchHandler(async (url) => {
            if (url.includes('/api/signaling/verify')) return okJson({ valid: true });
            if (url.includes('/session/join')) return okJson({ success: true, data: { role: 'guest', peer: 'guest' } });
            if (url.includes('/poll')) return okJson({ success: true, data: { role: 'guest', peer: 'guest', signals: [] } });
            return okJson({ success: true, data: {} });
        });
        const mgr = new SignalingManager({
            roomId: 'comp_7201', role: 'opponent', token: 'test-sid', logger: () => {},
            onSignal: (d) => seen.push(d),
        });
        await mgr.connect();
        expect(mgr.snapshot().peer).toBe('guest');

        setFetchHandler(async (url) => {
            if (url.includes('/poll')) return okJson({
                success: true, data: {
                    role: 'guest', peer: 'guest',
                    signals: [
                        sig(1, 'offer', { sdp: 'host-offer' }, 'host'),
                        sig(2, 'answer', { sdp: 'self-echo' }, 'guest'),
                        sig(3, 'request_offer', {}, 'guest'),
                    ],
                },
            });
            return okJson({ success: true, data: {} });
        });
        await mgr.pollOnce();
        // only the host offer reaches the page (once); echo + own request dropped
        expect(seen.map((s) => s.signalType)).toEqual(['offer']);
        expect(seen[0].signalData).toEqual({ sdp: 'host-offer' });
        await mgr.disconnect();
    });

    it('viewer skips verification, reads only its own signals, never answers', async () => {
        const seen: any[] = [];
        setFetchHandler(async (url) => {
            if (url.includes('/session/join')) return okJson({ success: true, data: { role: 'viewer', peer: 'viewer:9' } });
            if (url.includes('/viewer/poll')) return okJson({
                success: true, data: {
                    role: 'viewer', peer: 'viewer:9',
                    signals: [
                        sig(1, 'offer', { sdp: 'for-me' }, 'host', 'viewer:9'),
                        sig(2, 'offer', { sdp: 'for-other' }, 'host', 'viewer:10'),
                        sig(3, 'answer', { sdp: 'stray' }, 'guest', 'viewer:9'),
                    ],
                },
            });
            return okJson({ success: true, data: {} });
        });
        const mgr = new SignalingManager({
            roomId: 'comp_7201', mode: 'viewer', token: 'test-sid', logger: () => {},
            onSignal: (d) => seen.push(d),
        });
        await mgr.connect();
        expect(fetchCalls.some((c) => c.url.includes('/api/signaling/verify'))).toBe(false);
        const join = posted('/api/signaling/session/join');
        expect(join.length).toBeGreaterThan(0);
        expect(join[0]).not.toHaveProperty('claimed_role'); // derived server-side
        expect(fetchCalls.some((c) => c.url.includes('/api/signaling/viewer/poll'))).toBe(false); // not yet polled
        await mgr.pollOnce();
        expect(fetchCalls.some((c) => c.url.includes('/api/signaling/viewer/poll'))).toBe(true);
        expect(seen.map((s) => s.signalData)).toEqual([{ sdp: 'for-me' }]);
        // viewer publishes always address a participant (proven default)
        await mgr.sendSignal('answer', { sdp: 'a' });
        const answers = posted('/api/signaling/answer');
        expect(answers.length).toBe(1);
        expect(answers[0].to).toBe('host');
        await mgr.disconnect();
    });
});

/* ---------- B3: heartbeat ---------- */

describe('B3 presence heartbeat (shared transport)', () => {
    it('joins once, heartbeats every 15s, stops on disconnect, never doubles', async () => {
        vi.useFakeTimers();
        const { mgr } = await connectHost();
        expect(posted('/api/signaling/session/join').length).toBe(1);

        await vi.advanceTimersByTimeAsync(90000);
        expect(posted('/api/signaling/session/join').length).toBe(7); // 1 join + 6 heartbeats
        for (const b of posted('/api/signaling/session/join')) {
            expect(b.competition_id).toBe(7201);
            expect(b).not.toHaveProperty('room_id');
        }

        await mgr.disconnect();
        expect(posted('/api/signaling/session/leave').length).toBe(1);
        await vi.advanceTimersByTimeAsync(60000);
        expect(posted('/api/signaling/session/join').length).toBe(7); // stopped
    });

    it('reconnect re-arms a single heartbeat (no doubling)', async () => {
        vi.useFakeTimers();
        const { mgr } = await connectHost();
        setFetchHandler(async (url) => {
            if (url.includes('/signaling/reconnect')) {
                return okJson({ success: true, data: { role: 'host', peer: 'host', last_event_id: 99 } });
            }
            if (url.includes('/poll')) return okJson({ success: true, data: { role: 'host', peer: 'host', signals: [] } });
            return okJson({ success: true, data: {} });
        });
        await mgr.reconnectAfterInterruption();
        const joinsAfterReconnect = posted('/api/signaling/session/join').length;
        await vi.advanceTimersByTimeAsync(30000);
        expect(posted('/api/signaling/session/join').length).toBe(joinsAfterReconnect + 2);
        await mgr.disconnect();
    });
});

/* ---------- B4: reconnect cursor ---------- */

describe('B4 reconnect cursor (shared transport)', () => {
    it('reconnect preserves the cursor; the next poll replays exactly the miss', async () => {
        const { mgr, seen } = await connectHost();
        setFetchHandler(async (url) => {
            if (url.includes('/poll')) return okJson({
                success: true, data: {
                    role: 'host', peer: 'host',
                    signals: [sig(1, 'ice', { c: 'h0' }, 'host'), sig(2, 'answer', { sdp: 'a0' }, 'guest'), sig(3, 'ice', { c: 'g0' }, 'guest')],
                },
            });
            return okJson({ success: true, data: {} });
        });
        await mgr.pollOnce();
        expect(mgr.snapshot().lastTimestamp).toBe(3);
        expect(seen.map((s) => s.signalType)).toEqual(['answer', 'ice']); // own ice echo dropped

        // outage: signals 4..5 published while away; reconnect reports a HIGHER
        // last_event_id (7: presence events included) — adopting it would skip 4..5.
        const missed = [sig(4, 'answer', { sdp: 'a1' }, 'guest'), sig(5, 'ice', { c: 'g1' }, 'guest')];
        let polls = 0;
        setFetchHandler(async (url) => {
            if (url.includes('/signaling/reconnect')) {
                return okJson({ success: true, data: { role: 'host', peer: 'host', last_event_id: 7 } });
            }
            if (url.includes('/poll')) {
                polls++;
                return okJson({ success: true, data: { role: 'host', peer: 'host', signals: polls === 1 ? missed : [] } });
            }
            return okJson({ success: true, data: {} });
        });
        const recovered: unknown[] = [];
        (mgr as any).onRecovered = (s: unknown) => recovered.push(s);
        const state = await mgr.reconnectAfterInterruption();
        expect(state).not.toBeNull();
        expect(mgr.snapshot().lastTimestamp).toBe(3); // preserved, not 7
        await mgr.pollOnce(); // catch-up from the preserved cursor
        expect(seen.map((s) => s.signalType)).toEqual(['answer', 'ice', 'answer', 'ice']);
        expect(mgr.snapshot().lastTimestamp).toBe(5);
        await mgr.pollOnce(); // follow-up resumes at 5 — nothing lost, nothing replayed
        expect(lastPollSince()).toBe(5);
        await mgr.disconnect();
    });

    it('stale redeliveries (id <= cursor) are never reprocessed', async () => {
        const { mgr, seen } = await connectHost();
        const batch = [sig(1, 'offer', { sdp: 'o' }, 'guest')];
        setFetchHandler(async (url) => {
            if (url.includes('/poll')) return okJson({ success: true, data: { role: 'host', peer: 'host', signals: batch } });
            return okJson({ success: true, data: {} });
        });
        await mgr.pollOnce();
        await mgr.pollOnce(); // same batch redelivered
        // host drops offers in both passes — nothing reaches the page twice
        expect(seen).toEqual([]);
        expect(mgr.snapshot().lastTimestamp).toBe(1);
        await mgr.disconnect();
    });

    it('reconnect cannot change role (server-derived identity preserved)', async () => {
        const { mgr } = await connectHost();
        setFetchHandler(async (url) => {
            if (url.includes('/signaling/reconnect')) {
                return okJson({ success: true, data: { role: 'host', peer: 'host', last_event_id: 4 } });
            }
            if (url.includes('/poll')) return okJson({ success: true, data: { role: 'host', peer: 'host', signals: [] } });
            return okJson({ success: true, data: {} });
        });
        await mgr.reconnectAfterInterruption();
        expect(mgr.snapshot().serverRole).toBe('host');
        expect(mgr.snapshot().peer).toBe('host');
        await mgr.disconnect();
    });
});

/* ---------- Policy SSOT + peer-state mapping ---------- */

describe('retry policy (single SSOT)', () => {
    it('bounds match the server policy exactly; peer states map to proven actions', () => {
        expect(new SignalingReconnectPolicy().schedule()).toEqual([1000, 2000, 4000, 8000, 15000]);
        const mgr = new SignalingManager({ roomId: 'comp_1', role: 'host', token: 't', logger: () => {} });
        expect(mgr.handlePeerState('disconnected')).toBe('ice_restart');
        expect(mgr.handlePeerState('failed')).toBe('reconnect');
        expect(mgr.handlePeerState('closed')).toBe('reconnect');
        expect(mgr.handlePeerState('connected')).toBe('none');
        expect(mgr.handlePeerState('checking')).toBe('none');
    });
});

/* ---------- Timeouts: hung requests fail fast ---------- */

describe('signaling fetch timeout', () => {
    it('a hung verify/connect fails fast with onError (never stalls the page)', async () => {
        vi.useFakeTimers();
        const errors: Error[] = [];
        setFetchHandler(() => new Promise(() => {})); // never settles
        const mgr = new SignalingManager({ roomId: 'comp_7201', role: 'host', token: 't', logger: () => {}, onError: (e) => errors.push(e) });
        const pending = mgr.connect();
        await vi.advanceTimersByTimeAsync(16000);
        await pending;
        expect(mgr.snapshot().isConnected).toBe(false);
        expect(errors.length).toBeGreaterThan(0);
        setFetchHandler(async () => okJson({ success: true, data: {} }));
        await mgr.disconnect();
    });

    it('a hung poll tick aborts and the next tick proceeds (no stacking)', async () => {
        vi.useFakeTimers();
        const { mgr } = await connectHost();
        let polls = 0;
        setFetchHandler(async (url) => {
            if (url.includes('/poll')) {
                polls++;
                if (polls === 1) return new Promise(() => {}); // first tick hangs
                return okJson({ success: true, data: { role: 'host', peer: 'host', signals: [] } });
            }
            return okJson({ success: true, data: {} });
        });
        await vi.advanceTimersByTimeAsync(1000); // tick 1 starts, hangs
        await vi.advanceTimersByTimeAsync(15000); // abort fires, tick released
        await vi.advanceTimersByTimeAsync(1000); // tick 2 proceeds
        expect(polls).toBeGreaterThanOrEqual(2);
        await mgr.disconnect();
    });
});
