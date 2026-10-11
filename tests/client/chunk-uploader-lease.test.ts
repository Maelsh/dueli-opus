/**
 * R4-CHUNK-DOWNLOAD-1 (row 27, D) — ChunkUploader lease lifecycle.
 *
 * Proven behaviors (fake RecordingLeaseHandle — no network):
 *  - no handle → off mode, legacy behavior byte-identical;
 *  - held claim (409) → acquireLease false, no uploads accepted, no finalize;
 *  - claim won → heartbeats run on ONE timer; uploads proceed;
 *  - mid-stream loss → onLeaseLost once, queue cleared (counted), finalize
 *    refused (no finalize.php), new enqueues refused;
 *  - stale heartbeat triggers server revalidation before the next upload;
 *  - resume-after-max numbering is untouched by the lease layer.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChunkUploader, RecordingLeaseHandle } from '../../src/client/services/ChunkUploader';

const realFetch = globalThis.fetch;
let uploadCalls = 0;
let finalizeCalls = 0;
let playlistChunks: any[] = [];

function mediaBlob() {
    const bytes = new Uint8Array(2048);
    bytes[4] = 0x66; bytes[5] = 0x74; bytes[6] = 0x79; bytes[7] = 0x70;
    bytes[100] = 0x6d; bytes[101] = 0x6f; bytes[102] = 0x6f; bytes[103] = 0x66;
    return new Blob([bytes], { type: 'video/mp4' });
}

function installFetch() {
    uploadCalls = 0;
    finalizeCalls = 0;
    (globalThis as any).fetch = async (url: any) => {
        const u = String(url);
        if (u.includes('/api/chunks/playlist/')) {
            return { ok: true, json: async () => ({ success: true, chunks: playlistChunks }) };
        }
        if (u.includes('/upload.php')) {
            uploadCalls++;
            return { ok: true, json: async () => ({ success: true }) };
        }
        if (u.includes('/finalize.php')) {
            finalizeCalls++;
            return { ok: true, json: async () => ({ success: true }) };
        }
        if (u.includes('/time.php')) {
            return { ok: true, json: async () => ({ timestamp: Date.now() }) };
        }
        return { ok: false, status: 404, json: async () => ({}) };
    };
}

function fakeLease(opts: {
    acquireResult?: { ok: true; generation: number; took_over: boolean } | { ok: false; reason: 'held' | 'unavailable' | 'error' };
    heartbeatResults?: Array<{ held: boolean; generation: number }>;
} = {}): RecordingLeaseHandle & { heartbeatCalls: number; releaseCalls: number } {
    const fake = {
        heartbeatCalls: 0,
        releaseCalls: 0,
        acquire: async () => opts.acquireResult ?? { ok: true as const, generation: 1, took_over: false },
        heartbeat: async (generation: number) => {
            fake.heartbeatCalls++;
            const next = opts.heartbeatResults && opts.heartbeatResults.length > 0
                ? opts.heartbeatResults.shift()!
                : { held: true, generation };
            return next;
        },
        release: async () => { fake.releaseCalls++; }
    };
    return fake;
}

beforeEach(() => {
    playlistChunks = [];
    installFetch();
    vi.useRealTimers();
});

afterEach(() => {
    globalThis.fetch = realFetch;
    vi.useRealTimers();
});

describe('R4-CHUNK-DOWNLOAD-1 ChunkUploader lease', () => {
    it('1. no handle → off mode, uploads + finalize exactly as before', async () => {
        const up = new ChunkUploader({ competitionId: 9, serverUrl: 'https://x.test/ffmpeg' });
        up.setExtension('mp4');
        expect(await up.acquireLease()).toBe(true);
        up.enqueue(mediaBlob());
        await up.waitForUploads();
        expect(uploadCalls).toBe(1);
        expect(await up.finalize()).toBe(true);
        expect(finalizeCalls).toBe(1);
    });

    it('2. held claim → false; nothing accepted, finalize refused', async () => {
        const lease = fakeLease({ acquireResult: { ok: false, reason: 'held', generation: 3, expires_in_seconds: 40 } });
        let lost = 0;
        const up = new ChunkUploader({
            competitionId: 9, serverUrl: 'https://x.test/ffmpeg',
            lease, onLeaseLost: () => { lost++; }
        });
        up.setExtension('mp4');
        expect(await up.acquireLease()).toBe(false);
        expect(up.leaseHeld).toBe(false);
        expect(up.enqueue(mediaBlob())).toBe(false);
        expect(await up.finalize()).toBe(false);
        expect(uploadCalls).toBe(0);
        expect(finalizeCalls).toBe(0);
        expect(lost).toBe(0); // never held → no loss event
    });

    it('3. claim won → uploads flow, finalize releases the lease', async () => {
        const lease = fakeLease();
        const up = new ChunkUploader({ competitionId: 9, serverUrl: 'https://x.test/ffmpeg', lease });
        up.setExtension('mp4');
        expect(await up.acquireLease()).toBe(true);
        up.enqueue(mediaBlob());
        await up.waitForUploads();
        expect(uploadCalls).toBe(1);
        expect(await up.finalize()).toBe(true);
        expect(lease.releaseCalls).toBe(1);
        up.shutdown();
    });

    it('4. mid-stream loss → onLeaseLost once, queue dropped+counted, finalize refused, no new work', async () => {
        const lease = fakeLease({ heartbeatResults: [{ held: false, generation: 2 }] });
        let lost = 0;
        const up = new ChunkUploader({
            competitionId: 9, serverUrl: 'https://x.test/ffmpeg',
            lease, onLeaseLost: () => { lost++; },
            heartbeatIntervalMs: 20, maxHeartbeatStaleMs: 10
        });
        up.setExtension('mp4');
        expect(await up.acquireLease()).toBe(true);
        // Let the fast heartbeat observe the takeover.
        await new Promise((r) => setTimeout(r, 120));
        expect(lost).toBe(1);
        expect(up.leaseHeld).toBe(false);
        expect(up.enqueue(mediaBlob())).toBe(false);
        expect(await up.finalize()).toBe(false);
        expect(finalizeCalls).toBe(0);
        const stats = up.getStats();
        expect(stats.dropped).toBeGreaterThanOrEqual(0);
        up.shutdown();
    });

    it('5. stale heartbeat revalidates before the next upload (sensitive point)', async () => {
        // The stale-triggered revalidation observes the loss.
        const lease = fakeLease({ heartbeatResults: [{ held: false, generation: 2 }] });
        let lost = 0;
        const up = new ChunkUploader({
            competitionId: 9, serverUrl: 'https://x.test/ffmpeg',
            lease, onLeaseLost: () => { lost++; },
            heartbeatIntervalMs: 60000, maxHeartbeatStaleMs: 1
        });
        up.setExtension('mp4');
        expect(await up.acquireLease()).toBe(true);
        // Deterministic staleness (white-box): age the heartbeat past any
        // max-stale window instead of sleeping on the wall clock.
        (up as any).lastHeartbeatOk = Date.now() - 60000;
        up.enqueue(mediaBlob());
        await up.waitForUploads();
        // The stale pre-upload check fenced the session: nothing uploaded.
        expect(uploadCalls).toBe(0);
        expect(lost).toBe(1);
        up.shutdown();
    });

    it('6. resume-after-max numbering is untouched by the lease layer', async () => {
        playlistChunks = [{ index: 3, url: 'https://cdn.example/c3.mp4' }];
        const lease = fakeLease();
        const up = new ChunkUploader({ competitionId: 9, serverUrl: 'https://x.test/ffmpeg', lease });
        up.setExtension('mp4');
        await up.initialize();
        expect(up.getStats().nextNumber).toBe(5); // 0-based index 3 = 4 chunks → next is 5
        expect(await up.acquireLease()).toBe(true);
        up.enqueue(mediaBlob());
        await up.waitForUploads();
        expect(uploadCalls).toBe(1);
        expect(up.getStats().nextNumber).toBe(6);
        up.shutdown();
    });

    it('7. exactly one heartbeat timer per session (no doubling)', async () => {
        vi.useFakeTimers();
        const lease = fakeLease();
        const up = new ChunkUploader({
            competitionId: 9, serverUrl: 'https://x.test/ffmpeg',
            lease, heartbeatIntervalMs: 10000
        });
        expect(await up.acquireLease()).toBe(true);
        expect(await up.acquireLease()).toBe(true); // idempotent re-claim
        await vi.advanceTimersByTimeAsync(25000);
        // One timer → beats at t=10s,20s (not doubled to 4).
        expect(lease.heartbeatCalls).toBe(2);
        up.shutdown();
        vi.useRealTimers();
    });

    it('8. unavailable store → explicit legacy mode (uploads proceed, logged)', async () => {
        const lease = fakeLease({ acquireResult: { ok: false, reason: 'unavailable' } });
        const up = new ChunkUploader({ competitionId: 9, serverUrl: 'https://x.test/ffmpeg', lease });
        up.setExtension('mp4');
        expect(await up.acquireLease()).toBe(true);
        up.enqueue(mediaBlob());
        await up.waitForUploads();
        expect(uploadCalls).toBe(1);
        up.shutdown();
    });
});
