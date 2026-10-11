/**
 * R4-CHUNK-DOWNLOAD-1 (row 27, A) — download assembly logic in the REAL
 * emitted player script (same eval-harness pattern as chunk-playback).
 *
 * Proven without FFmpeg.wasm (fetch-first ordering keeps error paths
 * network-free; the re-encode leg itself is proven in MEDIA S):
 *  - ftyp proof accepts real MP4 heads, rejects short/garbage bytes;
 *  - gap detection reports missing indices explicitly (never silent);
 *  - fetch retry is bounded (fail→fail→ok = 3 fetches, then success);
 *  - poisoned chunks (HTML/empty) fail loudly after bounded retries;
 *  - abort cancels between attempts (no unbounded loop);
 *  - mergeChunks no longer waits forever (bounded, MERGE_INCOMPLETE);
 *  - assemble rejects empty playlists and cancelled runs before FFmpeg.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getClientSharedScript } from '../../src/modules/pages/live/scripts/client/shared';

const realFetch = globalThis.fetch;

let chunkContentType = 'video/mp4';
let chunkBytes = 4096;
let fetchPlan: Array<'ok' | 'fail' | 'html' | 'empty'> = [];
let fetchCalls = 0;

function headersStub() {
    return { get: (name: string) => (String(name).toLowerCase() === 'content-type' ? chunkContentType : null) };
}

function installEvalGlobals() {
    fetchCalls = 0;
    (globalThis as any).fetch = async (url: any, init?: any) => {
        fetchCalls++;
        if (init?.signal?.aborted) {
            const err = new Error('aborted');
            (err as any).name = 'AbortError';
            throw err;
        }
        const step = fetchPlan.length > 0 ? fetchPlan.shift()! : 'ok';
        if (step === 'fail') {
            return { ok: false, status: 500, headers: headersStub(), arrayBuffer: async () => new ArrayBuffer(0) };
        }
        if (step === 'html') {
            return {
                ok: true,
                headers: { get: () => 'text/html; charset=utf-8' },
                arrayBuffer: async () => new TextEncoder().encode('<html>nope</html>').buffer as ArrayBuffer,
            };
        }
        if (step === 'empty') {
            return { ok: true, headers: headersStub(), arrayBuffer: async () => new ArrayBuffer(0) };
        }
        return { ok: true, headers: headersStub(), arrayBuffer: async () => new Uint8Array(chunkBytes).buffer as ArrayBuffer };
    };
}

function loadAssembly() {
    const src: string = getClientSharedScript('en');
    const sandbox: Record<string, any> = {};
    const stubDocument = { getElementById: () => null, createElement: () => ({}), addEventListener: () => {}, removeEventListener: () => {} };
    const stubLocalStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    const stubURL = { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} };
    const factory = new Function(
        'window', 'document', 'localStorage', 'fetch', 'URL',
        `${src}\nreturn { SmartVodPlayer, isValidMp4Bytes };`,
    );
    const liveFetch = (...args: any[]) => (globalThis as any).fetch(...args);
    return factory(sandbox, stubDocument, stubLocalStorage, liveFetch, stubURL) as {
        SmartVodPlayer: any; isValidMp4Bytes: (b: Uint8Array) => boolean;
    };
}

function makePlayer(SmartVodPlayer: any, chunks: any[], extension = 'mp4') {
    const v = { src: '', load: async () => {}, play: async () => {}, pause: () => {}, muted: false };
    const p = new SmartVodPlayer({ videoElement: v, competitionId: 9, playlistData: { chunks, extension, upstream: 'ok' } });
    p.chunks = chunks;
    p.extension = extension;
    return p;
}

const url = (n: number) => `https://cdn.example/live/match_9/chunk_${n}.mp4`;

beforeEach(() => {
    chunkContentType = 'video/mp4';
    chunkBytes = 4096;
    fetchPlan = [];
    fetchCalls = 0;
    installEvalGlobals();
    vi.useRealTimers();
});

afterEach(() => {
    globalThis.fetch = realFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('R4-CHUNK-DOWNLOAD-1 assembly (emitted script)', () => {
    it('1. ftyp proof: real MP4 head passes, short/garbage fail', () => {
        const { isValidMp4Bytes } = loadAssembly();
        const good = new Uint8Array(32);
        good[4] = 102; good[5] = 116; good[6] = 121; good[7] = 112; // 'ftyp'
        expect(isValidMp4Bytes(good)).toBe(true);
        expect(isValidMp4Bytes(new Uint8Array(8))).toBe(false);
        expect(isValidMp4Bytes(new Uint8Array(32))).toBe(false);
        expect(isValidMp4Bytes(null as any)).toBe(false);
    });

    it('2. gaps are explicit: missing indices reported, order sorted', () => {
        const { SmartVodPlayer } = loadAssembly();
        const p = makePlayer(SmartVodPlayer, [
            { index: 3, url: url(3) }, { index: 1, url: url(1) }, { index: 5, url: url(5) },
        ]);
        expect(p.sortedPresentIndices()).toEqual([1, 3, 5]);
        expect(p.findMissingIndices()).toEqual([2, 4]);
        const full = makePlayer(SmartVodPlayer, [{ index: 1, url: url(1) }, { index: 2, url: url(2) }]);
        expect(full.findMissingIndices()).toEqual([]);
    });

    it('3. fetch retry bounded: fail→fail→ok uploads on the 3rd attempt', async () => {
        const { SmartVodPlayer } = loadAssembly();
        fetchPlan = ['fail', 'fail', 'ok'];
        const p = makePlayer(SmartVodPlayer, [{ index: 1, url: url(1) }]);
        const buf = await p.fetchChunkWithRetry(0, null, 3);
        expect(buf.byteLength).toBe(chunkBytes);
        expect(fetchCalls).toBe(3);
    });

    it('4. poisoned chunks fail loudly after bounded retries (HTML + empty)', async () => {
        const { SmartVodPlayer } = loadAssembly();
        fetchPlan = ['html', 'html', 'html'];
        const p = makePlayer(SmartVodPlayer, [{ index: 1, url: url(1) }]);
        await expect(p.fetchChunkWithRetry(0, null, 3)).rejects.toThrow('HTML, not video');
        expect(fetchCalls).toBe(3);
        fetchPlan = ['empty', 'empty'];
        await expect(p.fetchChunkWithRetry(0, null, 2)).rejects.toThrow('empty');
        expect(fetchCalls).toBe(5);
    });

    it('5. abort cancels between attempts (no unbounded loop)', async () => {
        const { SmartVodPlayer } = loadAssembly();
        fetchPlan = ['fail', 'fail', 'fail', 'fail'];
        const p = makePlayer(SmartVodPlayer, [{ index: 1, url: url(1) }, { index: 2, url: url(2) }]);
        const controller = new AbortController();
        const pending = p.fetchChunkWithRetry(0, controller.signal, 10);
        controller.abort();
        await expect(pending).rejects.toThrow('cancelled');
        expect(fetchCalls).toBeLessThan(10);
    });

    it('6. mergeChunks is bounded: missing chunks → MERGE_INCOMPLETE, not forever', async () => {
        vi.useFakeTimers();
        const { SmartVodPlayer } = loadAssembly();
        const p = makePlayer(SmartVodPlayer, [{ index: 1, url: url(1) }, { index: 2, url: url(2) }]);
        // One chunk preloaded, one missing forever (fetch always fails).
        fetchPlan = new Array(200).fill('fail');
        p.loadedChunks[0] = new Uint8Array(16).buffer;
        const pending = p.mergeChunks();
        const assertion = expect(pending).rejects.toThrow('MERGE_INCOMPLETE');
        await vi.advanceTimersByTimeAsync(31000);
        await assertion;
        vi.useRealTimers();
    });

    it('7. assemble rejects empty/upstream-bad/cancelled runs before FFmpeg', async () => {
        const { SmartVodPlayer } = loadAssembly();
        const empty = makePlayer(SmartVodPlayer, []);
        await expect(empty.assembleRecording({})).rejects.toThrow('NO_CHUNKS');
        const badUpstream = makePlayer(SmartVodPlayer, [{ index: 1, url: url(1) }]);
        badUpstream.playlist = { chunks: [{ index: 1, url: url(1) }], upstream: 'error' };
        await expect(badUpstream.assembleRecording({})).rejects.toThrow('ASSEMBLE_FAILED');
        const cancelled = makePlayer(SmartVodPlayer, [{ index: 1, url: url(1) }]);
        const controller = new AbortController();
        controller.abort();
        await expect(cancelled.assembleRecording({ abortSignal: controller.signal })).rejects.toThrow('CANCELLED');
        // No chunk fetch happened for the pre-cancelled run.
        expect(fetchCalls).toBe(0);
    });
});
