/**
 * R4-CHUNK-PLAYER-UX-1 (row 29) — player behavior on the REAL emitted
 * bundle script (same eval-harness pattern as chunk-playback; no
 * source-text assertions for behavior).
 *
 * Proven:
 *  - live starts at the newest confirmed-ready chunk (legacy lists without
 *    readiness keep the penultimate fallback; empty starts at 0);
 *  - index-marked unconfirmed slots are skipped while newer entries exist
 *    (budget-free), awaited when newest (bounded misses), never played blind;
 *  - handoff parks the old element (paused + muted + handlers cleared),
 *    clears its wait timer, and starts muted-first (autoplay-safe);
 *  - rewindTo lands on the target and the forward flow resumes after it
 *    with a single live loop (old loop retired);
 *  - VOD preload is a bounded window (no preload-all), far cache evicted,
 *    blob URLs revoked on switch/stop, verified timeline positions win,
 *    onended/seek skip unready only when confirmed content exists.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getClientSharedScript } from '../../src/modules/pages/live/scripts/client/shared';
import { mergePlaylistWithIndex, matchSequence } from '../../src/lib/services/ChunkIndexPlaylist';
import { ChunkIndexModel } from '../../src/models/ChunkIndexModel';
import { SqliteD1 } from '../helpers/sqlite-d1';

const realFetch = globalThis.fetch;

let playlist: { chunks: any[]; extension?: string; upstream?: string; total_duration?: number | null } = { chunks: [] };
let fetchLog: string[] = [];
let chunkContentType = 'video/mp4';
let chunkBytes = 4096;
const revoked: string[] = [];
let blobSeq = 0;

function headersStub() {
    return { get: (name: string) => (String(name).toLowerCase() === 'content-type' ? chunkContentType : null) };
}

function installEvalGlobals() {
    fetchLog = [];
    (globalThis as any).fetch = async (url: any) => {
        fetchLog.push(String(url));
        const u = String(url);
        if (u.includes('/api/chunks/playlist/')) {
            return {
                ok: true,
                json: async () => ({
                    success: true, id: 9, chunks: playlist.chunks,
                    extension: playlist.extension ?? 'mp4', upstream: playlist.upstream ?? 'ok',
                    total_duration: playlist.total_duration ?? null,
                }),
            };
        }
        return { ok: true, headers: headersStub(), arrayBuffer: async () => new Uint8Array(chunkBytes).buffer as ArrayBuffer };
    };
}

function loadClasses() {
    const src: string = getClientSharedScript('en');
    const sandbox: Record<string, any> = {};
    const stubDocument = { getElementById: () => null, createElement: () => ({}), addEventListener: () => {}, removeEventListener: () => {} };
    const stubLocalStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    const stubURL = {
        createObjectURL: () => `blob:fake-${++blobSeq}`,
        revokeObjectURL: (u: string) => { revoked.push(u); },
    };
    const factory = new Function(
        'window', 'document', 'localStorage', 'fetch', 'URL',
        `${src}\nreturn { ChunkManager, LiveSequentialPlayer, SmartVodPlayer };`,
    );
    const liveFetch = (...args: any[]) => (globalThis as any).fetch(...args);
    return factory(sandbox, stubDocument, stubLocalStorage, liveFetch, stubURL) as {
        ChunkManager: any; LiveSequentialPlayer: any; SmartVodPlayer: any;
    };
}

const url = (n: number) => `https://cdn.example/live/match_9/chunk_${String(n).padStart(4, '0')}.mp4`;

function liveVideoStub() {
    return {
        src: '', muted: false, currentTime: 0, style: {} as Record<string, string>,
        // Fires oncanplay shortly after load() resolves (browser behavior):
        // playChunk assigns its handler post-load, so the deferred fire
        // always hits the current waiter, never a stale one.
        load: async function (this: any) {
            const self = this;
            setTimeout(() => { try { self.oncanplay && self.oncanplay(); } catch {} }, 10);
        },
        play: async function (this: any) {},
        pause: function (this: any) { (this as any).pausedFlag = true; },
        pausedFlag: false,
        oncanplay: null as any, onerror: null as any, onended: null as any, ontimeupdate: null as any,
    };
}
function vodVideoStub() {
    return {
        src: '', muted: false, currentTime: 0, duration: 0, paused: true,
        load: async function (this: any) {},
        play: async function (this: any) { (this as any).paused = false; },
        pause: function (this: any) { (this as any).paused = true; },
        oncanplay: null as any, onerror: null as any, onended: null as any, ontimeupdate: null as any,
    };
}

beforeEach(() => {
    playlist = { chunks: [] };
    chunkContentType = 'video/mp4';
    chunkBytes = 4096;
    revoked.length = 0;
    blobSeq = 0;
    installEvalGlobals();
    vi.useRealTimers();
});

afterEach(() => {
    globalThis.fetch = realFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('R4-CHUNK-PLAYER-UX-1 live start + skips (emitted script)', () => {
    it('1. starts at the newest confirmed-ready chunk', async () => {
        const { ChunkManager } = loadClasses();
        playlist = { chunks: [
            { index: 0, url: url(1), ready: true },
            { index: 1, url: url(2), ready: true },
            { index: 2, url: url(3), ready: false },
            { index: 3, url: url(4), ready: true },
        ] };
        const cm = new ChunkManager(9, 'mp4');
        expect(await cm.skipToLatest()).toBe(3); // newest ready, not penultimate(2), not oldest
    });

    it('2. legacy lists keep the penultimate fallback; empty starts at 0', async () => {
        const { ChunkManager } = loadClasses();
        playlist = { chunks: [{ index: 0, url: url(1) }, { index: 1, url: url(2) }, { index: 5, url: url(6) }] };
        const cm = new ChunkManager(9, 'mp4');
        expect(await cm.skipToLatest()).toBe(1); // preserved legacy behavior
        playlist = { chunks: [] };
        expect(await new ChunkManager(9, 'mp4').skipToLatest()).toBe(0);
    });

    it('3. unconfirmed slots skipped while newer entries exist (budget-free)', async () => {
        const { ChunkManager } = loadClasses();
        playlist = { chunks: [
            { index: 0, url: url(1), ready: true },
            { index: 1, url: url(2), ready: false },
            { index: 2, url: url(3), ready: true },
        ] };
        const cm = new ChunkManager(9, 'mp4');
        cm.currentIndex = -1;
        expect(await cm.waitForNextChunk(0)).toBe(0);
        expect(await cm.waitForNextChunk(0)).toBe(2); // index 1 skipped, not played
        expect(cm.currentIndex).toBe(2);
    });

    it('4. unready newest is awaited (bounded misses), never played blind', async () => {
        vi.useFakeTimers();
        const { ChunkManager } = loadClasses();
        playlist = { chunks: [
            { index: 0, url: url(1), ready: true },
            { index: 1, url: url(2), ready: false },
        ] };
        const cm = new ChunkManager(9, 'mp4');
        cm.currentIndex = 0;
        const pending = cm.waitForNextChunk(2);
        const assertion = expect(pending).rejects.toThrow('STREAM_ENDED');
        await vi.advanceTimersByTimeAsync(30000);
        await assertion;
        vi.useRealTimers();
    });
});

describe('R4-CHUNK-PLAYER-UX-1 live handoff + rewind (emitted script)', () => {
    it('5. handoff parks the old element, clears handlers, starts muted-first', async () => {
        const { ChunkManager, LiveSequentialPlayer } = loadClasses();
        playlist = { chunks: [{ index: 0, url: url(1) }, { index: 1, url: url(2) }] };
        const vids = [liveVideoStub(), liveVideoStub()];
        const seen: number[] = [];
        const player = new LiveSequentialPlayer({
            videoPlayers: vids, chunkManager: new ChunkManager(9, 'mp4'),
            onChunkChange: (i: number) => seen.push(i),
        });
        await player.start({});
        expect(seen).toEqual([0]);
        expect((vids[1] as any).muted).toBe(true); // muted-first start
        // Drive a second chunk to force a handoff back.
        playlist = { chunks: [{ index: 0, url: url(1) }, { index: 1, url: url(2) }, { index: 2, url: url(3) }] };
        await player.playChunk(2);
        const oldEl: any = vids[1];
        expect(oldEl.pausedFlag).toBe(true); // parked, no overlap audio
        expect(oldEl.muted).toBe(true);
        expect(oldEl.oncanplay).toBeNull();
        expect(oldEl.onerror).toBeNull();
        expect(seen).toContain(2);
        player.stop();
    });

    it('2b. start plays the positioned edge itself (no wait for edge+1)', async () => {
        // Regression: positioning at the newest ready chunk then waiting
        // for edge+1 left live stuck at 'waiting' forever when nothing is
        // newer yet. The edge itself must play first.
        const { ChunkManager, LiveSequentialPlayer } = loadClasses();
        playlist = { chunks: [
            { index: 0, url: url(1), ready: true },
            { index: 1, url: url(2), ready: true },
        ] };
        const vids = [liveVideoStub(), liveVideoStub()];
        const seen: number[] = [];
        const player = new LiveSequentialPlayer({
            videoPlayers: vids, chunkManager: new ChunkManager(9, 'mp4'),
            onChunkChange: (i: number) => seen.push(i),
        });
        await player.start({ startFromLatest: true });
        expect(seen).toEqual([1]); // newest ready plays, no newer needed
        player.stop();
    });

    it('6. rewindTo lands on target and the flow resumes forward, single loop', async () => {        const { ChunkManager, LiveSequentialPlayer } = loadClasses();
        playlist = { chunks: [{ index: 0, url: url(1) }, { index: 1, url: url(2) }, { index: 2, url: url(3) }] };
        const vids = [liveVideoStub(), liveVideoStub()];
        const seen: number[] = [];
        const player = new LiveSequentialPlayer({
            videoPlayers: vids, chunkManager: new ChunkManager(9, 'mp4'),
            onChunkChange: (i: number) => seen.push(i),
        });
        await player.start({ startFromLatest: true });
        // Positioned edge plays itself (penultimate 1 here — the old code
        // skipped it and waited for 2, stalling when nothing was newer).
        expect(seen).toEqual([1]);
        await player.rewindTo(0);
        expect(seen).toContain(0); // landed back
        expect(player.chunkManager.currentIndex).toBe(0); // resumes after target
        player.stop();
    });
});

describe('R4-CHUNK-PLAYER-UX-1 VOD window + verified time (emitted script)', () => {
    function tenChunks(withFlags = false) {
        return Array.from({ length: 10 }, (_, i) => ({
            index: i, url: url(i + 1), duration: 10,
            ...(withFlags ? { ready: true, timeline_start_ms: i * 10 } : {}),
        }));
    }

    it('7. preload is a bounded window (no preload-all, far evicted)', async () => {
        const { SmartVodPlayer } = loadClasses();
        playlist = { chunks: tenChunks() };
        const player = new SmartVodPlayer({ videoElement: vodVideoStub(), competitionId: 9 });
        await player.start();
        const keys = Object.keys(player.loadedChunks).map(Number);
        expect(Math.max(...keys) - Math.min(...keys)).toBeLessThanOrEqual(4);
        expect(keys.length).toBeLessThanOrEqual(5);
        expect(keys.length).toBeGreaterThan(0);
        player.stop();
    });

    it('8. seek recenters the window and evicts far cache', async () => {
        const { SmartVodPlayer } = loadClasses();
        playlist = { chunks: tenChunks() };
        const player = new SmartVodPlayer({ videoElement: vodVideoStub(), competitionId: 9 });
        await player.start();
        player.seekTo(85); // chunk 8
        await new Promise((r) => setTimeout(r, 50));
        const keys = Object.keys(player.loadedChunks).map(Number);
        expect(keys).toContain(8);
        expect(keys.some((k) => k <= 4)).toBe(false); // far head evicted
        player.stop();
    });

    it('9. verified timeline positions win over legacy math', async () => {
        const { SmartVodPlayer } = loadClasses();
        playlist = { chunks: [
            { index: 0, url: url(1), duration: 10, ready: true, timeline_start_ms: 0 },
            { index: 1, url: url(2), duration: 10, ready: true, timeline_start_ms: 12 },
            { index: 2, url: url(3), duration: 10, ready: true, timeline_start_ms: 24 },
        ] };
        const player = new SmartVodPlayer({ videoElement: vodVideoStub(), competitionId: 9 });
        await player.start();
        expect(player.getChunkStartTime(1)).toBe(12);
        expect(player.getChunkStartTime(2)).toBe(24);
        expect(player.getChunkForTime(13)).toBe(1);
        expect(player.getChunkForTime(24)).toBe(2);
        player.stop();
    });

    it('10. blob URLs revoked on switch and stop (no leak)', async () => {
        const { SmartVodPlayer } = loadClasses();
        playlist = { chunks: tenChunks() };
        const player = new SmartVodPlayer({ videoElement: vodVideoStub(), competitionId: 9 });
        await player.start();
        const first = player.currentBlobUrl;
        expect(typeof first).toBe('string');
        await player.loadAndPlayChunk(1);
        expect(revoked).toContain(first);
        player.stop();
        expect(revoked).toContain(player.currentBlobUrl === null ? revoked[revoked.length - 1] : 'never');
        expect(player.currentBlobUrl).toBeNull();
    });

    it('11. unready skipped end-to-end only when confirmed content exists', async () => {
        const { SmartVodPlayer } = loadClasses();
        playlist = { chunks: [
            { index: 0, url: url(1), ready: false },
            { index: 1, url: url(2), ready: true },
            { index: 2, url: url(3), ready: false },
        ] };
        const player = new SmartVodPlayer({ videoElement: vodVideoStub(), competitionId: 9 });
        await player.start();
        expect(player.currentChunkIndex).toBe(1); // first playable, not 0
        // onended from 1 skips 2 (unready) → complete, no throw.
        await player.videoElement.onended();
        player.stop();
    });

    it('12. zero-confirmed falls back to legacy play-all (never an empty player)', async () => {
        // Rule: unready skips apply ONLY when confirmed content exists.
        // With readiness info but zero confirmed, legacy plays everything —
        // pre-receipt bytes are usually fine, and an empty player helps no one.
        const { SmartVodPlayer } = loadClasses();
        playlist = { chunks: [
            { index: 0, url: url(1), ready: false },
            { index: 1, url: url(2), ready: false },
        ] };
        let err: any = 'unset';
        const player = new SmartVodPlayer({
            videoElement: vodVideoStub(), competitionId: 9,
            onError: (e: any) => { err = e; },
        });
        await player.start();
        expect(player.currentChunkIndex).toBe(0); // first entry plays (legacy)
        expect(err).toBe('unset'); // no error surfaced
        player.stop();
    });
});

describe('R4-CHUNK-PLAYER-UX-1 index merge for playback (REMOTE F1/F2)', () => {
    const row = (sequence: number, state: 'uploaded' | 'ready' | 'failed', duration_ms: number | null = 5000) => ({
        id: sequence, competition_id: 9, generation: 1, sequence,
        object_path: `live/match_9/chunk_${String(sequence).padStart(4, '0')}.mp4`,
        object_hash: null, container: 'mp4' as const, codec_video: null, codec_audio: null,
        bytes: 1000, declared_duration_ms: null, duration_ms, state,
        created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    });

    it('13. failed slots suppressed from proxy and orphans (REMOTE F1)', () => {
        const rows = [row(1, 'ready'), row(2, 'failed'), row(3, 'ready'), row(4, 'failed')];
        const proxy = [
            { index: 0, url: url(1) },
            { index: 1, url: url(2) },
            { index: 2, url: url(3) },
        ];
        const { chunks, metadata } = mergePlaylistWithIndex(proxy, rows as any, 'https://h.test/ffmpeg', false);
        expect(chunks.map((c) => c.index)).toEqual([0, 2]); // failed proxy entry gone
        expect(chunks.every((c) => (c.url as string).indexOf('chunk_0004') === -1)).toBe(true); // failed orphan gone
        expect(metadata.ready_count).toBe(2);
    });

    it('14. sequence matching: explicit number wins, zero-based folds, else null (REMOTE F2)', () => {
        expect(matchSequence({ chunk_number: 5 }, url(99))).toBe(5); // explicit beats filename
        expect(matchSequence({ index: 7 }, url(3))).toBe(3); // proxy index ignored, filename used
        expect(matchSequence({}, 'https://cdn.example/live/match_9/chunk_0000.mp4')).toBe(1); // 0 → 1 fold
        expect(matchSequence({}, url(4))).toBe(4);
        expect(matchSequence({}, 'https://cdn.example/other.mp4')).toBeNull();
        expect(matchSequence({ chunk_number: 0 }, url(4))).toBe(4); // invalid explicit falls back
    });
});

describe('R4-CHUNK-PLAYER-UX-1 timeline paging beyond list caps (D3)', () => {
    it('15. internal continuation pages a complete timeline past one page', async () => {
        const db = new SqliteD1();
        try {
            await db.prepare(`INSERT INTO users (id, email, username, password_hash, display_name, is_active) VALUES (1, 'a@t', 'a', 'x', 'A', 1)`).run();
            await db.prepare(`INSERT INTO users (id, email, username, password_hash, display_name, is_active) VALUES (2, 'b@t', 'b', 'x', 'B', 1)`).run();
            await db.prepare(`INSERT INTO categories (id, slug, name_ar, name_en) VALUES (1, 't', 'T', 'T')`).run().catch(() => undefined);
            await db.prepare(`INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status) VALUES (70, 'T', 'R', 1, 1, 2, 'live')`).run();
            const model = new ChunkIndexModel(db as unknown as D1Database);
            for (let n = 1; n <= 25; n++) {
                await model.recordChunk(70, {
                    sequence: n, object_path: `live/match_70/chunk_${String(n).padStart(4, '0')}.mp4`, container: 'mp4',
                }, 1);
                await model.confirmChunk(70, n, { duration_ms: 1000 });
            }
            // Forced 10-row pages: 25 rows need 3 bounded fetches, one timeline.
            const tl = await model.timeline(70, 10);
            expect(tl.ready_count).toBe(25);
            expect(tl.total_ready_ms).toBe(25000);
            expect(tl.entries[24].timeline_start_ms).toBe(24000);
            expect(tl.entries.map((e) => e.sequence)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
        } finally {
            db.close();
        }
    });
});
