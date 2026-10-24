/**
 * R4-LIVE-ENTRY-RECOVERY-REM1 (unit 28.3.1) — FV20-SIG / FV20-TOAST / FV20-OFFER.
 *
 * FV20-SIG is driven through the real SignalingManager against a mocked
 * fetch: a filtered page (signals: []) with a server cursor must advance the
 * client cursor, so the next poll reaches the signal behind it.
 *
 * FV20-TOAST executes the page's REAL showToast + publishMedia source with
 * mocked dependencies. On BASE, showToast is absent and publishMedia throws
 * ReferenceError after attaching tracks — proving FV20-OFFER is the same
 * defect (the offer/reoffer never runs), not a separate offer race.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SignalingManager } from '../../src/client/services/SignalingManager';
import {
    setupClientHarness, okJson, sig, fetchCalls, setFetchHandler,
} from './signaling-harness';

setupClientHarness();

const root = resolve(__dirname, '../..');
const PAGE = readFileSync(resolve(root, 'src/modules/pages/competition-page.ts'), 'utf-8');

function between(src: string, start: string, end: string): string {
    const a = src.indexOf(start);
    expect(a, `marker exists: ${start}`).toBeGreaterThanOrEqual(0);
    const b = src.indexOf(end, a + start.length);
    expect(b, `marker after ${start}: ${end}`).toBeGreaterThanOrEqual(0);
    return src.slice(a, b);
}

const lastPollSince = () => {
    const polls = fetchCalls.filter((c) => c.url.includes('/poll?'));
    const m = polls.length > 0 ? polls[polls.length - 1].url.match(/since=(\d+)/) : null;
    return m ? Number(m[1]) : null;
};

async function connectHost(signals: any[] = [], cursor?: number) {
    const seen: any[] = [];
    setFetchHandler(async (url) => {
        if (url.includes('/api/signaling/verify')) return okJson({ valid: true });
        if (url.includes('/session/join')) return okJson({ success: true, data: { role: 'host', peer: 'host' } });
        if (url.includes('/poll')) {
            return okJson({ success: true, data: { role: 'host', peer: 'host', signals, cursor } });
        }
        return okJson({ success: true, data: {} });
    });
    const mgr = new SignalingManager({
        roomId: 'comp_7401', role: 'host', token: 'test-sid', logger: () => {},
        onSignal: (d) => seen.push(d),
    });
    await mgr.connect();
    return { mgr, seen };
}

describe('FV20-SIG — client advances over a filtered server page', () => {
    it('adopts the server cursor with zero visible signals and continues after it', async () => {
        const { mgr, seen } = await connectHost([], 50);
        await mgr.pollOnce();
        expect(seen).toEqual([]);
        expect(mgr.snapshot().lastTimestamp).toBe(50);

        await mgr.pollOnce();
        expect(lastPollSince()).toBe(50);
        await mgr.disconnect();
    });

    it('reaches a later signal behind the filtered page (no permanent re-read)', async () => {
        const { mgr, seen } = await connectHost([], 50);
        await mgr.pollOnce();
        expect(mgr.snapshot().lastTimestamp).toBe(50);

        setFetchHandler(async (url) => {
            if (url.includes('/poll')) {
                return okJson({
                    success: true,
                    data: {
                        role: 'host', peer: 'host', cursor: 51,
                        signals: [sig(51, 'answer', { sdp: 'behind-the-page' }, 'guest')],
                    },
                });
            }
            return okJson({ success: true, data: {} });
        });
        await mgr.pollOnce();
        expect(seen.map((s) => s.signalData)).toEqual([{ sdp: 'behind-the-page' }]);
        expect(mgr.snapshot().lastTimestamp).toBe(51);
        await mgr.disconnect();
    });

    it('never rewinds the cursor when a stale response carries a lower cursor', async () => {
        const { mgr } = await connectHost([], 50);
        await mgr.pollOnce();
        setFetchHandler(async (url) => {
            if (url.includes('/poll')) return okJson({ success: true, data: { role: 'host', peer: 'host', signals: [], cursor: 40 } });
            return okJson({ success: true, data: {} });
        });
        await mgr.pollOnce();
        expect(mgr.snapshot().lastTimestamp).toBe(50);
        await mgr.disconnect();
    });

    it('viewer poll uses the same cursor contract', async () => {
        setFetchHandler(async (url) => {
            if (url.includes('/session/join')) return okJson({ success: true, data: { role: 'viewer', peer: 'viewer:9' } });
            if (url.includes('/viewer/poll')) return okJson({ success: true, data: { role: 'viewer', peer: 'viewer:9', signals: [], cursor: 64 } });
            return okJson({ success: true, data: {} });
        });
        const mgr = new SignalingManager({ roomId: 'comp_7401', mode: 'viewer', token: 'test-sid', logger: () => {} });
        await mgr.connect();
        await mgr.pollOnce();
        expect(mgr.snapshot().lastTimestamp).toBe(64);
        await mgr.pollOnce();
        expect(lastPollSince()).toBe(64);
        await mgr.disconnect();
    });
});

type PublisherOptions = {
    role: 'host' | 'opponent';
    stream: any;
    publishResult?: boolean;
    status?: any;
    connected?: boolean;
    windowMock?: any;
    documentMock?: any;
};

function loadPublisher(opts: PublisherOptions) {
    const toastSrc = between(
        PAGE,
        'function showToast(message, type = \'info\')',
        '// R4-CHUNK-VIEW-RECOVERY-1 REM1 (28.4.1 / O19-21): ONE player badge.'
    );
    const publishSrc = between(
        PAGE,
        'async function publishMedia()',
        'window.publishMedia = publishMedia'
    );

    const calls = {
        toasts: [] as Array<[string, string]>,
        states: [] as string[],
        logs: [] as Array<[string, string]>,
        offers: 0,
        reoffers: 0,
        watch: 0,
        record: 0,
        paint: 0,
    };
    const p2p = {
        getLocalStream: () => opts.stream,
        publishLocalStream: () => opts.publishResult !== false,
        getRoomStatus: async () => opts.status ?? null,
        isP2PConnected: () => opts.connected === true,
        createOffer: async () => { calls.offers++; },
        requestReoffer: async () => { calls.reoffers++; },
    };
    const tr = {
        nothing_to_publish: 'nothing-to-publish',
        media_none: 'media-none',
        prep_publishing: 'publishing',
        camera_error: 'camera-error',
        prep_published: 'published',
        prep_waiting_guest: 'waiting-host',
    };
    const windowMock = opts.windowMock ?? {
        dueli: { showToast: (message: string, type: string) => calls.toasts.push([message, type]) },
    };
    const documentMock = opts.documentMock ?? { getElementById: () => null };

    // The extracted functions are the page's real bodies, not copies. They run
    // in one scope so publishMedia sees the page-local showToast definition.
    const factory = new Function(
        'p2p', 'mediaPublished', 'publishInFlight', 'tr', 'setPublishState', 'log', 'userRole',
        'watchCompetitorOpponent', 'maybeStartRecording', 'paintCompetitorControls',
        'document', 'window', 'isRTL',
        `${toastSrc}\n${publishSrc}\n` +
        'return { publishMedia: publishMedia, isPublished: function() { return mediaPublished; } };'
    );
    const api = factory(
        p2p, false, false, tr,
        (state: string) => calls.states.push(state),
        (msg: string, type: string) => calls.logs.push([msg, type]),
        opts.role,
        () => calls.watch++,
        () => calls.record++,
        () => calls.paint++,
        documentMock,
        windowMock,
        false,
    );
    return { api, calls, tr };
}

describe('FV20-TOAST / FV20-OFFER — publish path executes without ReferenceError', () => {
    const stream = { getTracks: () => [{ kind: 'video' }, { kind: 'audio' }] };

    it('host: publish success toasts and THEN creates the offer (no silent drop)', async () => {
        const run = loadPublisher({
            role: 'host', stream,
            status: { opponent_joined: true },
            connected: false,
        });
        await run.api.publishMedia();

        expect(run.api.isPublished()).toBe(true);
        expect(run.calls.toasts).toEqual([['published', 'success']]);
        expect(run.calls.offers, 'offer must follow the successful publish').toBe(1);
        expect(run.calls.reoffers).toBe(0);
        expect(run.calls.watch).toBe(1);
        expect(run.calls.record).toBe(1);
    });

    it('guest: publish success asks the host for a fresh offer after toasting', async () => {
        const run = loadPublisher({ role: 'opponent', stream });
        await run.api.publishMedia();

        expect(run.api.isPublished()).toBe(true);
        expect(run.calls.toasts).toEqual([
            ['published', 'success'],
            ['waiting-host', 'info'],
        ]);
        expect(run.calls.reoffers).toBe(1);
        expect(run.calls.offers).toBe(0);
    });

    it('error path keeps the ORIGINAL publish error and never hides it behind a toast failure', async () => {
        const run = loadPublisher({ role: 'host', stream, publishResult: false });
        await expect(run.api.publishMedia()).resolves.toBeUndefined();

        expect(run.api.isPublished()).toBe(false);
        expect(run.calls.toasts).toEqual([['camera-error', 'error']]);
        expect(run.calls.logs.some(([msg, type]) =>
            type === 'error' && msg.includes('publishLocalStream returned false')
        )).toBe(true);
        expect(run.calls.offers).toBe(0);
        expect(run.calls.reoffers).toBe(0);
    });

    it('no tracks: honest refusal toasts and publishes nothing', async () => {
        const run = loadPublisher({
            role: 'host',
            stream: { getTracks: () => [] },
        });
        await run.api.publishMedia();

        expect(run.api.isPublished()).toBe(false);
        expect(run.calls.toasts).toEqual([['nothing-to-publish', 'error']]);
        expect(run.calls.states).toContain('media-none');
        expect(run.calls.offers).toBe(0);
        expect(run.calls.reoffers).toBe(0);
    });

    it('toast bridge failure is contained: legacy/global fallback still conveys it', async () => {
        const fallback: Array<[string, string]> = [];
        const run = loadPublisher({
            role: 'opponent', stream,
            windowMock: {
                dueli: { showToast: () => { throw new Error('bridge down'); } },
                showToast: (message: string, type: string) => fallback.push([message, type]),
            },
        });
        await run.api.publishMedia();

        expect(run.api.isPublished()).toBe(true);
        expect(fallback).toContainEqual(['published', 'success']);
        expect(run.calls.reoffers).toBe(1);
    });
});
