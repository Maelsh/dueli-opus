/**
 * R4-CHUNK-VIEW-RECOVERY-1 REM1 (row 28.4.1) — O19-07/12/13/14/21.
 *
 * Behavioral tests against the REAL emitted audience bundle
 * (getClientSharedScript): no source-text assertions for player behavior.
 * Proven on the consumer level:
 *  - global time = verified chunk start + offset; total comes from the
 *    recording index (total_ready_ms), never element.duration and never an
 *    equal split of chunk count;
 *  - variable chunk durations / gaps / readiness are preserved;
 *  - boundary, distant and return seeks land on the right chunk+offset;
 *  - rapid seeks: late responses cannot steal the element, the window is
 *    recentered and old entries stay evicted;
 *  - in-flight requests are deduped (one fetch per chunk) and cached chunks
 *    are not re-fetched;
 *  - LIVE progress/seek/jump-to-live use the same full timeline, not the
 *    current chunk duration;
 *  - player state labels are AR/EN translated (never 'media:*').
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getClientSharedScript } from '../../src/modules/pages/live/scripts/client/shared';

const realFetch = globalThis.fetch;

type Playlist = {
    chunks: any[];
    extension?: string;
    total_duration?: number | null;
    chunk_duration?: number;
    index_metadata?: any;
};

let playlist: Playlist = { chunks: [] };
let fetchLog: string[] = [];
let chunkContentType = 'video/mp4';
let chunkBytes = 4096;
const revoked: string[] = [];
let blobSeq = 0;

const url = (n: number) => `https://cdn.example/live/match_9/chunk_${String(n).padStart(4, '0')}.mp4`;

function headersStub() {
    return { get: (name: string) => (String(name).toLowerCase() === 'content-type' ? chunkContentType : null) };
}

function playlistResponse() {
    return {
        ok: true,
        json: async () => ({
            success: true,
            id: 9,
            chunks: playlist.chunks,
            extension: playlist.extension ?? 'mp4',
            upstream: 'ok',
            total_duration: playlist.total_duration ?? null,
            chunk_duration: playlist.chunk_duration,
            index_metadata: playlist.index_metadata,
        }),
    };
}

function chunkResponse() {
    return {
        ok: true,
        headers: headersStub(),
        arrayBuffer: async () => new Uint8Array(chunkBytes).buffer as ArrayBuffer,
    };
}

function installEvalGlobals() {
    fetchLog = [];
    (globalThis as any).fetch = async (raw: any) => {
        const u = String(raw);
        fetchLog.push(u);
        if (u.includes('/api/chunks/playlist/')) return playlistResponse();
        return chunkResponse();
    };
}

function loadClasses(lang = 'en') {
    const src: string = getClientSharedScript(lang as any);
    const sandbox: Record<string, any> = {};
    const stubDocument = {
        getElementById: () => null,
        createElement: () => ({}),
        addEventListener: () => {},
        removeEventListener: () => {},
    };
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
    const classes = factory(sandbox, stubDocument, stubLocalStorage, liveFetch, stubURL);
    return {
        ...classes,
        playerStateLabel: sandbox.playerStateLabel as (state: string) => string,
    } as {
        ChunkManager: any;
        LiveSequentialPlayer: any;
        SmartVodPlayer: any;
        playerStateLabel: (state: string) => string;
    };
}

function vodVideoStub() {
    return {
        src: '', muted: false, currentTime: 0, duration: 0, paused: true,
        load: async function (this: any) {},
        play: async function (this: any) { (this as any).paused = false; },
        pause: function (this: any) { (this as any).paused = true; },
        oncanplay: null as any, onerror: null as any, onended: null as any, ontimeupdate: null as any,
        addEventListener: () => {},
    };
}

function liveVideoStub() {
    return {
        src: '', muted: false, currentTime: 0, paused: true, style: {} as Record<string, string>,
        load: async function (this: any) {
            const self = this;
            setTimeout(() => { try { self.oncanplay && self.oncanplay(); } catch {} }, 5);
        },
        play: async function (this: any) { (this as any).paused = false; },
        pause: function (this: any) { (this as any).paused = true; },
        oncanplay: null as any, onerror: null as any, onended: null as any, ontimeupdate: null as any,
    };
}

function meta(totalReadyMs: number, extra: Record<string, any> = {}) {
    return {
        ready_count: playlist.chunks.length,
        uploaded_count: 0,
        gaps: [],
        total_ready_ms: totalReadyMs,
        finalized: false,
        ...extra,
    };
}

const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));

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

describe('R4-CHUNK-VIEW-RECOVERY-1 REM1 — one global VOD timeline', () => {
    it('1. variable durations: starts and total come from the index, never equal split', async () => {
        playlist = {
            chunks: [
                { index: 0, url: url(1), duration: 5, ready: true, timeline_start_ms: 0 },
                { index: 1, url: url(2), duration: 7, ready: true, timeline_start_ms: 5000 },
                { index: 2, url: url(3), duration: 13, ready: true, timeline_start_ms: 12000 },
            ],
            // A misleading served-total must NOT become the timeline length.
            total_duration: 999,
            index_metadata: meta(25000),
        };
        const { SmartVodPlayer } = loadClasses();
        const el = vodVideoStub();
        const player = new SmartVodPlayer({ videoElement: el, competitionId: 9 });
        await player.start();

        expect(player.getGlobalDuration()).toBe(25);
        expect(player.totalDuration).toBe(25);
        expect(player.chunkDurations).toEqual([5, 7, 13]); // real, unequal
        expect(player.getChunkStartTime(0)).toBe(0);
        expect(player.getChunkStartTime(1)).toBe(5);
        expect(player.getChunkStartTime(2)).toBe(12);
        expect(player.getChunkForTime(4.99)).toBe(0);
        expect(player.getChunkForTime(5)).toBe(1); // exact boundary → next
        expect(player.getChunkForTime(11.99)).toBe(1);
        expect(player.getChunkForTime(12)).toBe(2);

        // global position = verified start + element offset
        el.currentTime = 3;
        expect(player.getGlobalTime()).toBe(3);
        player.currentChunkIndex = 2;
        el.currentTime = 4;
        expect(player.getGlobalTime()).toBe(16);
        player.stop();
    });

    it('2. readiness/gaps are respected: unready slots are skipped, no fabricated duration', async () => {
        playlist = {
            chunks: [
                { index: 0, url: url(1), duration: 8, ready: true, timeline_start_ms: 0 },
                // 2s hole at 8..10: listed but never confirmed ready.
                { index: 1, url: url(2), duration: 2, ready: false },
                { index: 2, url: url(3), duration: 8, ready: true, timeline_start_ms: 10000 },
                // Unconfirmed tail beyond the ready total: never played, but
                // seeking to the end must still land at the last real end.
                { index: 3, url: url(4), duration: 5, ready: false },
            ],
            index_metadata: meta(18000, { gaps: [2] }),
        };
        const { SmartVodPlayer } = loadClasses();
        const el = vodVideoStub();
        const player = new SmartVodPlayer({ videoElement: el, competitionId: 9 });
        await player.start();
        expect(player.getGlobalDuration()).toBe(18); // ready rows only
        expect(player.nextPlayableIndex(0)).toBe(0);
        expect(player.nextPlayableIndex(1)).toBe(2); // unready skipped
        // A target inside the unready slot lands on the NEXT confirmed chunk
        // at its real start — nothing is fabricated for the missing bytes.
        player.seekTo(9);
        await wait();
        expect(player.currentChunkIndex).toBe(2);
        expect(player.getGlobalTime()).toBe(10); // did not fabricate second 9
        expect(el.currentTime).toBe(0);
        // Seek to the very end: the unready tail is not played; the confirmed
        // chunk lands exactly at its real end.
        player.seekTo(18);
        await wait();
        expect(player.currentChunkIndex).toBe(2);
        expect(el.currentTime).toBe(8);
        expect(player.getGlobalTime()).toBe(18);
        player.stop();
    });

    it('3. seek crosses boundaries, distant positions, and returns to earlier ones', async () => {
        playlist = {
            chunks: [
                { index: 0, url: url(1), duration: 10, ready: true, timeline_start_ms: 0 },
                { index: 1, url: url(2), duration: 20, ready: true, timeline_start_ms: 10000 },
                { index: 2, url: url(3), duration: 5, ready: true, timeline_start_ms: 30000 },
                { index: 3, url: url(4), duration: 15, ready: true, timeline_start_ms: 35000 },
                { index: 4, url: url(5), duration: 10, ready: true, timeline_start_ms: 50000 },
            ],
            index_metadata: meta(60000),
        };
        const { SmartVodPlayer } = loadClasses();
        const el = vodVideoStub();
        const player = new SmartVodPlayer({ videoElement: el, competitionId: 9 });
        await player.start();

        player.seekTo(30); // exact boundary: chunk 2 at 0
        await wait();
        expect(player.currentChunkIndex).toBe(2);
        expect(el.currentTime).toBe(0);
        expect(player.getGlobalTime()).toBe(30);

        player.seekTo(42); // distant: chunk 3 at 7
        await wait();
        expect(player.currentChunkIndex).toBe(3);
        expect(el.currentTime).toBe(7);
        expect(player.getGlobalTime()).toBe(42);

        player.seekTo(12); // return to a prior position: chunk 1 at 2
        await wait();
        expect(player.currentChunkIndex).toBe(1);
        expect(el.currentTime).toBe(2);
        expect(player.getGlobalTime()).toBe(12);

        player.seekTo(60); // end: last chunk at its duration
        await wait();
        expect(player.currentChunkIndex).toBe(4);
        expect(el.currentTime).toBe(10);

        player.seekTo(0); // beginning
        await wait();
        expect(player.currentChunkIndex).toBe(0);
        expect(el.currentTime).toBe(0);
        player.stop();
    });

    it('4. rapid seeks: a late response cannot steal the element or restore an old window', async () => {
        playlist = {
            chunks: Array.from({ length: 10 }, (_, i) => ({
                index: i, url: url(i + 1), duration: 10, ready: true, timeline_start_ms: i * 10000,
            })),
            index_metadata: meta(100000),
        };
        const { SmartVodPlayer } = loadClasses();
        const el = vodVideoStub();
        const player = new SmartVodPlayer({ videoElement: el, competitionId: 9 });
        await player.start();

        let releaseSlow: (() => void) | null = null;
        (globalThis as any).fetch = (raw: any) => {
            const u = String(raw);
            fetchLog.push(u);
            if (u.includes('/api/chunks/playlist/')) return Promise.resolve(playlistResponse());
            if (u.includes('chunk_0010')) { // target index 9
                return new Promise((resolve) => { releaseSlow = () => resolve(chunkResponse()); });
            }
            return Promise.resolve(chunkResponse());
        };

        player.seekTo(95); // index 9, slow fetch
        player.seekTo(45); // index 4, fast; recenters window 1..8
        await wait(80);

        expect(player.currentChunkIndex).toBe(4);
        expect(el.currentTime).toBe(5);
        expect(player.getGlobalTime()).toBe(45);
        expect(player.loadedChunks[9]).toBeUndefined(); // late target out of window
        const settledSrc = el.src;

        expect(typeof releaseSlow).toBe('function');
        releaseSlow!();
        await wait(40);
        // The superseded response must not repaint the player.
        expect(player.currentChunkIndex).toBe(4);
        expect(el.src).toBe(settledSrc);
        expect(player.loadedChunks[9]).toBeUndefined();
        player.stop();
    });

    it('5. in-flight dedupe + bounded cache + no re-fetch of cached chunks', async () => {
        playlist = {
            chunks: Array.from({ length: 12 }, (_, i) => ({
                index: i, url: url(i + 1), duration: 10, ready: true, timeline_start_ms: i * 10000,
            })),
            index_metadata: meta(120000),
        };
        const { SmartVodPlayer } = loadClasses();
        const el = vodVideoStub();
        const player = new SmartVodPlayer({ videoElement: el, competitionId: 9 });
        await player.start();

        // Two concurrent requests for the same chunk share ONE fetch.
        player.windowLo = 0;
        player.windowHi = 11;
        fetchLog.length = 0;
        const [a, b] = await Promise.all([player.loadChunk(7), player.loadChunk(7)]);
        expect(a).toBeUndefined();
        expect(b).toBeUndefined();
        expect(fetchLog.filter((u) => u.includes('chunk_0008')).length).toBe(1);
        expect(player.loadedChunks[7]).toBeDefined();

        // Recenter far away: bounded window, far entries evicted.
        player.seekTo(115);
        await wait(60);
        const keys = Object.keys(player.loadedChunks).map(Number);
        expect(keys).toContain(11);
        expect(keys.some((k) => k <= 7)).toBe(false);
        expect(keys.length).toBeLessThanOrEqual(5);

        // Seeking again inside the cached target performs no chunk fetch.
        const before = fetchLog.length;
        player.seekTo(115);
        await wait(40);
        expect(fetchLog.length).toBe(before);
        player.stop();
    });

    it('6. global progress stays separate from the loaded-file count', async () => {
        playlist = {
            chunks: Array.from({ length: 10 }, (_, i) => ({
                index: i, url: url(i + 1), duration: 10, ready: true, timeline_start_ms: i * 10000,
            })),
            index_metadata: meta(100000),
        };
        const { SmartVodPlayer } = loadClasses();
        const el = vodVideoStub();
        const progress: Array<[number, number]> = [];
        const loaded: number[] = [];
        const updates: Array<[number, number, number]> = [];
        const player = new SmartVodPlayer({
            videoElement: el, competitionId: 9,
            onProgress: (cur: number, total: number) => progress.push([cur, total]),
            onChunkLoaded: (_i: number, count: number) => loaded.push(count),
            onTimeUpdate: (t: number, total: number, idx: number) => updates.push([t, total, idx]),
        });
        await player.start();
        await wait(40); // let the bounded preload window (1, 2) settle
        // Chunk/file callbacks: bounded window loaded 3 files, chunk switch is
        // 1 of 10. Neither is the global playback position.
        expect(player.getLoadedCount()).toBe(3);
        expect(progress[0]).toEqual([1, 10]);
        expect(loaded.length).toBeGreaterThan(0);
        expect(progress[0][0]).not.toBe(player.getLoadedCount());
        // The page progress/time bar consumes only this global callback.
        el.currentTime = 6;
        el.ontimeupdate && el.ontimeupdate();
        expect(updates[updates.length - 1]).toEqual([6, 100, 0]);
        player.stop();
    });

    it('7. player state labels are translated AR/EN and never a media:* token', () => {
        const en = loadClasses('en');
        const ar = loadClasses('ar');
        const states = ['waiting', 'playing', 'processing', 'error', 'ready', 'unavailable'];
        for (const state of states) {
            const enLabel = en.playerStateLabel(state);
            const arLabel = ar.playerStateLabel(state);
            expect(enLabel, `en.${state}`).toBeTruthy();
            expect(arLabel, `ar.${state}`).toBeTruthy();
            expect(enLabel).not.toContain('media:');
            expect(arLabel).not.toContain('media:');
            expect(arLabel, `${state} translated`).not.toBe(enLabel);
        }
        expect(en.playerStateLabel('waiting')).toMatch(/Waiting/i);
    });
});

describe('R4-CHUNK-VIEW-RECOVERY-1 REM1 — LIVE global timeline', () => {
    function fakeLiveManager() {
        return {
            currentIndex: -1,
            entryFor: (i: number) => ({ index: i, ready: true, duration: 10 }),
            getUrl: (i: number) => url(i + 1),
            getChunkStartTime: (i: number) => i * 10,
            getChunkForTime: (t: number) => Math.floor(t / 10),
            getTotalDuration: () => 50,
            getLiveEdgeTime: () => 50,
            latestReadyIndex: () => 4,
            maxIndex: () => 4,
            // Hold the forward loop so assertions observe the seek target.
            waitForNextChunk: () => new Promise(() => {}),
        };
    }

    it('8. ChunkManager parses the index timeline for LIVE (starts, total, edge)', async () => {
        playlist = {
            chunks: Array.from({ length: 5 }, (_, i) => ({
                index: i, url: url(i + 1), duration: 10, ready: true, timeline_start_ms: i * 10000,
            })),
            index_metadata: meta(50000),
        };
        const { ChunkManager } = loadClasses();
        const cm = new ChunkManager(9, 'mp4');
        await cm.exists(0);
        expect(cm.getChunkStartTime(0)).toBe(0);
        expect(cm.getChunkStartTime(3)).toBe(30);
        expect(cm.getChunkForTime(35)).toBe(3);
        expect(cm.getTotalDuration()).toBe(50);
        expect(cm.getLiveEdgeTime()).toBe(50);
    });

    it('8b. legacy lists without readiness flags keep a real live edge', async () => {
        playlist = {
            chunks: [
                { index: 0, url: url(1), duration: 10 },
                { index: 1, url: url(2), duration: 10 },
                { index: 2, url: url(3), duration: 10 },
            ],
            chunk_duration: 10,
        };
        const { ChunkManager } = loadClasses();
        const cm = new ChunkManager(9, 'mp4');
        await cm.exists(0);
        expect(cm.hasReadyInfo()).toBe(false);
        // latestReadyIndex keeps its legacy contract (-1 = no confirmed flag)
        // so skipToLatest() may still use its penultimate fallback; the
        // playback edge is the newest listed chunk.
        expect(cm.latestReadyIndex()).toBe(-1);
        expect(cm.liveEdgeIndex()).toBe(2);
        expect(cm.getLiveEdgeTime()).toBe(30);
        expect(cm.getTotalDuration()).toBe(30);
    });

    it('9. LIVE seek/rewind/jump-to-live stay on the full recording timeline', async () => {
        const { LiveSequentialPlayer } = loadClasses();
        const vids = [liveVideoStub(), liveVideoStub()];
        const updates: Array<[number, number, number]> = [];
        const player = new LiveSequentialPlayer({
            videoPlayers: vids,
            chunkManager: fakeLiveManager(),
            onTimeUpdate: (t: number, total: number, idx: number) => updates.push([t, total, idx]),
        });

        await player.rewindTo(4); // live edge
        expect(player.currentIndex).toBe(4);
        expect(player.isBehindLive()).toBe(false);
        expect(player.getAvailableDuration()).toBe(50);
        expect(player.getGlobalTime()).toBe(40);

        await player.seekTo(15); // rewind into the recording
        expect(player.currentIndex).toBe(1);
        expect(player.isBehindLive()).toBe(true);
        expect(player.getGlobalTime()).toBe(15);

        // Timeupdate from the ACTIVE element publishes global, not chunk-local.
        const active = vids[player.activePlayerIndex];
        active.currentTime = 4;
        active.ontimeupdate && active.ontimeupdate();
        expect(updates[updates.length - 1]).toEqual([14, 50, 1]);

        await player.seekTo(20); // boundary → chunk 2 at 0
        expect(player.currentIndex).toBe(2);
        expect(player.getGlobalTime()).toBe(20);

        await player.jumpToLive();
        expect(player.currentIndex).toBe(4);
        expect(player.isBehindLive()).toBe(false);
        expect(player.getGlobalTime()).toBe(40);
        player.stop();
    });

    it('10. rapid LIVE seeks: the newest target wins over slow older loads', async () => {
        const { LiveSequentialPlayer } = loadClasses();
        const vids = [liveVideoStub(), liveVideoStub()];
        const player = new LiveSequentialPlayer({
            videoPlayers: vids,
            chunkManager: fakeLiveManager(),
        });
        const first = player.seekTo(5);
        const second = player.seekTo(35);
        await second;
        await first;
        expect(player.currentIndex).toBe(3);
        expect(player.getGlobalTime()).toBe(35);
        expect(player.isBehindLive()).toBe(true);
        player.stop();
    });

    it('11. an unconfirmed LIVE tail is clamped to the confirmed edge, never played', async () => {
        const { LiveSequentialPlayer } = loadClasses();
        const cm = fakeLiveManager();
        cm.getTotalDuration = () => 50; // index lists an unconfirmed 50s tail
        cm.getLiveEdgeTime = () => 40;
        cm.latestReadyIndex = () => 3;
        cm.entryFor = (i: number) => (i === 4
            ? { index: 4, ready: false, duration: 10 }
            : { index: i, ready: true, duration: 10 });
        cm.getChunkForTime = () => 4; // time 50 maps to the unready tail
        const player = new LiveSequentialPlayer({
            videoPlayers: [liveVideoStub(), liveVideoStub()],
            chunkManager: cm,
        });
        await player.seekTo(50);
        expect(player.currentIndex).toBe(3); // confirmed edge, not unready 4
        expect(player.getGlobalTime()).toBe(30);
        expect(player.isBehindLive()).toBe(false);
        player.stop();
    });
});

describe('R4-CHUNK-VIEW-RECOVERY-1 REM1 — FV20-TIME absolute media timestamps', () => {
    // Real production sample chunk_0050 (match_2230): MP4 tfdt starts at
    // 15,532,306 / 30,000 = 517.743533s while the recording index start is
    // 517.539s and the verified duration is 10.384s. Blink exposes that
    // absolute media time as element.currentTime and element.duration =
    // 528.127467; seeking below the origin clamps to 517.743533.
    const RAW_ORIGIN = 517.743533;
    const INDEX_START = 517.539;
    const INDEX_DURATION = 10.384;

    function absoluteMediaElement(base: any, origins: number[], durations: number[]) {
        let loadIndex = 0;
        let origin = origins[0];
        let duration = durations[0];
        let current = origin;
        Object.defineProperty(base, 'currentTime', {
            configurable: true,
            get: () => current,
            set: (value: number) => {
                current = (!isFinite(value) || value < origin) ? origin : value;
            },
        });
        base.duration = origin + duration;
        base.readyState = 1;
        const originalLoad = base.load;
        base.load = async function (this: any) {
            const i = Math.min(loadIndex, origins.length - 1);
            origin = origins[i];
            duration = durations[i];
            loadIndex++;
            current = origin;
            this.duration = origin + duration;
            if (this.onloadedmetadata) this.onloadedmetadata();
            if (originalLoad) await originalLoad.call(this);
        };
        return base;
    }

    function absoluteLiveManager() {
        const starts = [INDEX_START, 527.923, 538.172];
        const durations = [INDEX_DURATION, 10.249, 10.398];
        return {
            currentIndex: -1,
            entryFor: (i: number) => (i >= 0 && i < starts.length
                ? { index: i, ready: true, duration: durations[i] } : null),
            getUrl: (i: number) => url(i + 50),
            getChunkStartTime: (i: number) => starts[i] ?? 0,
            getChunkForTime: (t: number) => {
                if (t >= starts[2]) return 2;
                if (t >= starts[1]) return 1;
                return 0;
            },
            getTotalDuration: () => 548.57,
            getLiveEdgeTime: () => 548.57,
            latestReadyIndex: () => 2,
            maxIndex: () => 2,
            waitForNextChunk: () => new Promise(() => {}),
        };
    }

    it('12. VOD: index start + absolute currentTime is converted once (no double offset)', async () => {
        playlist = {
            chunks: [
                { index: 49, url: url(50), duration: INDEX_DURATION, ready: true, timeline_start_ms: 517539 },
                { index: 50, url: url(51), duration: 10.249, ready: true, timeline_start_ms: 527923 },
                { index: 51, url: url(52), duration: 10.398, ready: true, timeline_start_ms: 538172 },
            ],
            index_metadata: meta(548570),
        };
        const { SmartVodPlayer } = loadClasses();
        const el = absoluteMediaElement(
            vodVideoStub(),
            [RAW_ORIGIN, 528.131083, 538.5],
            [INDEX_DURATION, 10.249, 10.398],
        );
        const player = new SmartVodPlayer({ videoElement: el, competitionId: 9 });
        await player.start();

        // Media time is 517.743, index time is 517.539: subtract the origin,
        // never add the raw currentTime to the global start.
        expect(player.getGlobalTime()).toBeCloseTo(INDEX_START, 6);
        expect(el.currentTime).toBeCloseTo(RAW_ORIGIN, 6);

        player.seekTo(520.039); // 2.5s into chunk 49
        await wait();
        expect(player.currentChunkIndex).toBe(0);
        expect(el.currentTime).toBeCloseTo(RAW_ORIGIN + 2.5, 6);
        expect(player.getGlobalTime()).toBeCloseTo(520.039, 6);

        player.seekTo(527.923); // exact boundary -> chunk 50
        await wait();
        expect(player.currentChunkIndex).toBe(1);
        expect(el.currentTime).toBeCloseTo(528.131083, 6);
        expect(player.getGlobalTime()).toBeCloseTo(527.923, 6);

        player.seekTo(538.172); // distant -> chunk 51
        await wait();
        expect(player.currentChunkIndex).toBe(2);
        expect(el.currentTime).toBeCloseTo(538.5, 6);
        expect(player.getGlobalTime()).toBeCloseTo(538.172, 6);
        player.stop();
    });

    it('13. LIVE: rewind and edge use the same origin-corrected global timeline', async () => {
        const { LiveSequentialPlayer } = loadClasses();
        // The first play starts on element 1 (element 0 is the initial active).
        const vids = [
            // Element 0: chunk 49 for the in-chunk seek, then chunk 51 for edge.
            absoluteMediaElement(liveVideoStub(), [RAW_ORIGIN, 538.5], [INDEX_DURATION, 10.398]),
            // Element 1: chunk 49 on rewind, then chunk 50 at the boundary.
            absoluteMediaElement(liveVideoStub(), [RAW_ORIGIN, 528.131083], [INDEX_DURATION, 10.249]),
        ];
        const updates: Array<[number, number, number]> = [];
        const player = new LiveSequentialPlayer({
            videoPlayers: vids,
            chunkManager: absoluteLiveManager(),
            onTimeUpdate: (t: number, total: number, idx: number) => updates.push([t, total, idx]),
        });

        await player.rewindTo(0); // chunk 49 at its start
        expect(player.currentIndex).toBe(0);
        expect(vids[player.activePlayerIndex].currentTime).toBeCloseTo(RAW_ORIGIN, 6);
        expect(player.getGlobalTime()).toBeCloseTo(INDEX_START, 6);

        await player.seekTo(520.039); // 2.5s into chunk 49
        expect(player.currentIndex).toBe(0);
        expect(vids[player.activePlayerIndex].currentTime).toBeCloseTo(RAW_ORIGIN + 2.5, 6);
        expect(player.getGlobalTime()).toBeCloseTo(520.039, 6);

        await player.seekTo(527.923); // boundary -> chunk 50
        expect(player.currentIndex).toBe(1);
        expect(vids[player.activePlayerIndex].currentTime).toBeCloseTo(528.131083, 6);
        expect(player.getGlobalTime()).toBeCloseTo(527.923, 6);

        // The active element's timeupdate publishes the origin-corrected
        // global position, not the raw absolute media time.
        const active = vids[player.activePlayerIndex];
        active.ontimeupdate && active.ontimeupdate();
        expect(updates[updates.length - 1][0]).toBeCloseTo(527.923, 6);
        player.stop();
    });

    it('14. zero-origin media (MSE/WebM/other engines) keeps the legacy conversion', async () => {
        playlist = {
            chunks: [
                { index: 0, url: url(1), duration: 10, ready: true, timeline_start_ms: 30000 },
            ],
            index_metadata: meta(40000),
        };
        const { SmartVodPlayer } = loadClasses();
        const el = vodVideoStub(); // currentTime starts at 0
        const player = new SmartVodPlayer({ videoElement: el, competitionId: 9 });
        await player.start();
        expect(player.getGlobalTime()).toBe(30);
        player.seekTo(35);
        await wait();
        expect(el.currentTime).toBe(5);
        expect(player.getGlobalTime()).toBe(35);
        player.stop();
    });

    it('15. VOD: origin is read after loadedmetadata dispatch, before play() advances it', async () => {
        playlist = {
            chunks: [
                { index: 49, url: url(50), duration: INDEX_DURATION, ready: true, timeline_start_ms: 517539 },
            ],
            index_metadata: meta(527923),
        };
        const { SmartVodPlayer } = loadClasses();
        const el = vodVideoStub();
        let current = 0;
        const metadataListeners: Array<() => void> = [];
        Object.defineProperty(el, 'currentTime', {
            configurable: true,
            get: () => current,
            set: (value: number) => {
                current = (!isFinite(value) || value < RAW_ORIGIN) ? RAW_ORIGIN : value;
            },
        });
        el.readyState = 0;
        el.duration = 0;
        el.addEventListener = (name: string, cb: () => void) => {
            if (name === 'loadedmetadata') metadataListeners.push(cb);
        };
        // Blink can report currentTime=0 AT the loadedmetadata callback and
        // only expose the absolute origin immediately after dispatch. Play
        // must not start until that origin is observable.
        el.load = async function (this: any) {
            setTimeout(() => {
                this.readyState = 1;
                this.duration = RAW_ORIGIN + INDEX_DURATION;
                if (this.onloadedmetadata) this.onloadedmetadata();
                metadataListeners.forEach((cb) => cb());
                current = RAW_ORIGIN;
            }, 0);
        };

        const player = new SmartVodPlayer({ videoElement: el, competitionId: 9 });
        await player.start();
        expect(player.getGlobalTime()).toBeCloseTo(INDEX_START, 6);
        expect(el.currentTime).toBeCloseTo(RAW_ORIGIN, 6);
        player.stop();
    });
});
