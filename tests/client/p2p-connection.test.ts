/**
 * R4-LIVE-INT-1 REMEDIATION — behavioral tests for the production adapter
 * (src/client/services/P2PConnection.ts).
 *
 * The adapter owns ONLY the RTCPeerConnection lifecycle and media tracks;
 * all transport comes from the shared SignalingManager (tested in
 * signaling-manager.test.ts). These tests instantiate the adapter with a
 * mocked RTCPeerConnection/fetch and drive its REAL logic:
 *  - ICE queueing before setRemoteDescription + ordered drain (B2 pattern
 *    mirrored from the proven test flows);
 *  - failing candidates surface without aborting the drain or leaking;
 *  - no leaks across connection attempts;
 *  - host re-offers on request_offer; guests never offer;
 *  - reconnect/heartbeat/disconnect delegate to the shared transport.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { P2PConnection } from '../../src/client/services/P2PConnection';
import {
    setupClientHarness, okJson, sig, posted, MockPC, setFetchHandler,
} from './signaling-harness';

setupClientHarness();

const clients: P2PConnection[] = [];
afterEach(async () => {
    setFetchHandler(async () => okJson({ success: true, data: {} }));
    for (const c of clients.splice(0)) {
        try { await c.disconnect(); } catch { /* ignore */ }
    }
});

function makeClient(role: 'host' | 'opponent' | 'viewer', errors: Error[]) {
    const c = new P2PConnection({
        roomId: 'comp_7201', role, userId: role === 'host' ? 1 : role === 'opponent' ? 2 : 9,
        onError: (e) => errors.push(e),
    });
    clients.push(c);
    return c;
}

const managerOf = (c: P2PConnection): any => (c as any).signaling;

async function joinAs(client: P2PConnection, role: string, peer: string) {
    setFetchHandler(async (url) => {
        if (url.includes('/ice-servers')) return okJson({ success: true, data: { iceServers: [] } });
        if (url.includes('/api/signaling/verify')) return okJson({ valid: true });
        if (url.includes('/session/join')) return okJson({ success: true, data: { role, peer } });
        if (url.includes('/poll')) return okJson({ success: true, data: { role, peer, signals: [] } });
        return okJson({ success: true, data: {} });
    });
    await client.initialize();
    const ok = await client.joinRoom();
    expect(ok).toBe(true);
}

/* ---------- RTC ICE ordering (adapter layer) ---------- */

describe('adapter ICE ordering', () => {
    it('candidates before the offer are queued and drained FIFO after setRemoteDescription', async () => {
        const errors: Error[] = [];
        const guest = makeClient('opponent', errors);
        await joinAs(guest, 'guest', 'guest');
        const pc = MockPC.instances[MockPC.instances.length - 1];
        const mgr = managerOf(guest);
        setFetchHandler(async (url) => {
            if (url.includes('/poll')) return okJson({
                success: true, data: {
                    role: 'guest', peer: 'guest',
                    signals: [sig(1, 'ice', { candidate: 'c1' }, 'host'), sig(2, 'ice', { candidate: 'c2' }, 'host')],
                },
            });
            return okJson({ success: true, data: {} });
        });
        await mgr.pollOnce();
        expect(pc.addedCandidates).toEqual([]);

        setFetchHandler(async (url) => {
            if (url.includes('/poll')) return okJson({
                success: true, data: { role: 'guest', peer: 'guest', signals: [sig(3, 'offer', { sdp: 'o' }, 'host')] },
            });
            return okJson({ success: true, data: {} });
        });
        await mgr.pollOnce();
        expect(pc.remoteDescription?.sdp).toBe('o');
        expect(pc.addedCandidates.map((c: any) => c.candidate)).toEqual(['c1', 'c2']);
        expect(pc.createdAnswers).toBe(1);
        expect(errors).toEqual([]);
    });

    it('a failing candidate neither aborts the drain nor disappears silently', async () => {
        const errors: Error[] = [];
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const guest = makeClient('opponent', errors);
        await joinAs(guest, 'guest', 'guest');
        const pc = MockPC.instances[MockPC.instances.length - 1];
        const mgr = managerOf(guest);
        setFetchHandler(async (url) => {
            if (url.includes('/poll')) return okJson({
                success: true, data: {
                    role: 'guest', peer: 'guest',
                    signals: [
                        sig(1, 'ice', { candidate: 'c1' }, 'host'),
                        sig(2, 'ice', { candidate: 'bad' }, 'host'),
                        sig(3, 'ice', { candidate: 'c3' }, 'host'),
                        sig(4, 'offer', { sdp: 'o' }, 'host'),
                    ],
                },
            });
            return okJson({ success: true, data: {} });
        });
        await mgr.pollOnce();
        expect(pc.addedCandidates.map((c: any) => c.candidate)).toEqual(['c1', 'c3']);
        expect(errSpy).toHaveBeenCalled();
        expect(errors.length).toBe(1);
        expect(errors[0].message).toMatch(/ICE candidate/);
    });

    it('queued candidates never leak across connection attempts', async () => {
        const errors: Error[] = [];
        const guest = makeClient('opponent', errors);
        await joinAs(guest, 'guest', 'guest');
        const pc1 = MockPC.instances[MockPC.instances.length - 1];
        const mgr1 = managerOf(guest);
        setFetchHandler(async (url) => {
            if (url.includes('/ice-servers')) return okJson({ success: true, data: { iceServers: [] } });
            if (url.includes('/poll')) return okJson({
                success: true, data: { role: 'guest', peer: 'guest', signals: [sig(1, 'ice', { candidate: 'stale' }, 'host')] },
            });
            return okJson({ success: true, data: {} });
        });
        await mgr1.pollOnce();
        expect(pc1.addedCandidates).toEqual([]);

        await guest.disconnect();
        await guest.initialize(); // new generation — stale queue must die
        const pc2 = MockPC.instances[MockPC.instances.length - 1];
        expect(pc2).not.toBe(pc1);
        setFetchHandler(async (url) => {
            if (url.includes('/api/signaling/verify')) return okJson({ valid: true });
            if (url.includes('/session/join')) return okJson({ success: true, data: { role: 'guest', peer: 'guest' } });
            if (url.includes('/poll')) return okJson({ success: true, data: { role: 'guest', peer: 'guest', signals: [] } });
            return okJson({ success: true, data: {} });
        });
        expect(await guest.joinRoom()).toBe(true);
        const mgr2 = managerOf(guest);
        setFetchHandler(async (url) => {
            if (url.includes('/poll')) return okJson({
                success: true, data: { role: 'guest', peer: 'guest', signals: [sig(2, 'offer', { sdp: 'fresh' }, 'host')] },
            });
            return okJson({ success: true, data: {} });
        });
        await mgr2.pollOnce();
        expect(pc2.addedCandidates).toEqual([]);
        expect(pc2.remoteDescription?.sdp).toBe('fresh');
    });
});

/* ---------- Adapter transport wiring ---------- */

describe('adapter transport wiring', () => {
    it('host re-offers on request_offer; guest never offers', async () => {
        const errors: Error[] = [];
        const host = makeClient('host', errors);
        await joinAs(host, 'host', 'host');
        const hpc = MockPC.instances[MockPC.instances.length - 1];
        setFetchHandler(async (url) => {
            if (url.includes('/poll')) return okJson({
                success: true, data: { role: 'host', peer: 'host', signals: [sig(4, 'request_offer', {}, 'guest')] },
            });
            return okJson({ success: true, data: {} });
        });
        await managerOf(host).pollOnce();
        expect(hpc.createdOffers).toBe(1);
        expect(posted('/api/signaling/offer').length).toBe(1);

        const guest = makeClient('opponent', errors);
        await joinAs(guest, 'guest', 'guest');
        setFetchHandler(async (url) => {
            if (url.includes('/poll')) return okJson({
                success: true, data: { role: 'guest', peer: 'guest', signals: [sig(5, 'request_offer', {}, 'host')] },
            });
            return okJson({ success: true, data: {} });
        });
        await managerOf(guest).pollOnce();
        expect(posted('/api/signaling/offer').length).toBe(1); // still only the host's
    });

    it('reconnect delegates to the shared transport (true/false preserved)', async () => {
        const errors: Error[] = [];
        const guest = makeClient('opponent', errors);
        await joinAs(guest, 'guest', 'guest');
        setFetchHandler(async (url) => {
            if (url.includes('/signaling/reconnect')) {
                return okJson({ success: true, data: { role: 'guest', peer: 'guest', last_event_id: 9 } });
            }
            if (url.includes('/poll')) return okJson({ success: true, data: { role: 'guest', peer: 'guest', signals: [] } });
            return okJson({ success: true, data: {} });
        });
        expect(await guest.reconnect()).toBe(true);

        setFetchHandler(async (url) => {
            if (url.includes('/signaling/reconnect')) {
                return okJson({ success: false, error: 'forbidden' }, true, 403);
            }
            return okJson({ success: true, data: {} });
        });
        expect(await guest.reconnect()).toBe(false);
    });

    it('joinRoom fails closed when verification rejects; getRoomStatus maps presence', async () => {
        const errors: Error[] = [];
        const guest = makeClient('opponent', errors);
        setFetchHandler(async (url) => {
            if (url.includes('/ice-servers')) return okJson({ success: true, data: { iceServers: [] } });
            if (url.includes('/api/signaling/verify')) return okJson({ valid: false, error: 'role_mismatch' });
            return okJson({ success: true, data: {} });
        });
        await guest.initialize();
        expect(await guest.joinRoom()).toBe(false);

        const host = makeClient('host', errors);
        await joinAs(host, 'host', 'host');
        setFetchHandler(async (url) => {
            if (url.includes('/api/signaling/session?')) {
                return okJson({
                    success: true,
                    data: { presence: { host: true, guest: true, viewers: [], viewer_count: 0, last_event_id: 3 } },
                });
            }
            return okJson({ success: true, data: {} });
        });
        expect(await host.getRoomStatus()).toEqual({ host_joined: true, opponent_joined: true, viewer_count: 0 });
    });

    it('disconnect withdraws presence, closes media, and stops the heartbeat', async () => {
        vi.useFakeTimers();
        const errors: Error[] = [];
        const host = makeClient('host', errors);
        await joinAs(host, 'host', 'host');
        const pc = MockPC.instances[MockPC.instances.length - 1];
        await vi.advanceTimersByTimeAsync(30000);
        const joins = posted('/api/signaling/session/join').length;
        expect(joins).toBeGreaterThanOrEqual(3);

        await host.disconnect();
        expect(posted('/api/signaling/session/leave').length).toBe(1);
        expect(pc.closed).toBe(true);
        expect(host.getLocalStream()).toBeNull();
        await vi.advanceTimersByTimeAsync(60000);
        expect(posted('/api/signaling/session/join').length).toBe(joins); // heartbeat stopped
    });
});
