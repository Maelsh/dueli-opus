/**
 * UNIT28 acceptance follow-up — A28-TIME.
 *
 * Behavioral tests against the REAL emitted audience bundle
 * (getClientSharedScript) and the player the competition page actually uses
 * (`SmartVodPlayer` for completed VOD; `LiveSequentialPlayer` for LIVE).
 *
 * Owner-reported symptom: the running VOD clock exceeded the total
 * (1:58 shown against a 1:06 recording). Root shape: the element reports an
 * ABSOLUTE media timeline (fragmented MP4 first timestamp ≈ 517.743s) while
 * the verification index has its own global start (517.539s). If the media
 * origin is not observed at metadata time (Blink can still read 0 there),
 * `getGlobalTime` adds the raw absolute currentTime and double-counts.
 *
 * Contract pinned here (one conversion, no clamp hiding it):
 *  - origin is derived from the resource (seekable start, or duration minus
 *    the verified chunk duration) when currentTime itself is not observable;
 *  - global time = verified chunk start + (media time − origin), exactly once;
 *  - seek writes origin + chunk-local offset on an absolute timeline;
 *  - zero-origin media keeps the legacy conversion;
 *  - global position never exceeds the verified total on a healthy timeline.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { getClientSharedScript } from '../../src/modules/pages/live/scripts/client/shared';

const realFetch = globalThis.fetch;

const RAW_ORIGIN = 517.743533;
const INDEX_START = 517.539;
const INDEX_DURATION = 10.384;
const INDEX_TOTAL = 527.923;

type Classes = { SmartVodPlayer: any; LiveSequentialPlayer: any };

/**
 * Media-resource registry for the multi-chunk tests: the player creates one
 * blob URL per loaded chunk, so a test can hand the element the absolute
 * first presentation time of the resource it is about to decode.
 */
type MediaRegistry = { origins: number[]; cursor: number; byUrl: Map<string, number> };

function mediaRegistry(origins: number[]): MediaRegistry {
    return { origins, cursor: 0, byUrl: new Map() };
}

function loadClasses(lang = 'en', media?: MediaRegistry): Classes {
    const src: string = getClientSharedScript(lang as any);
    const sandbox: Record<string, any> = {};
    const stubDocument = {
        getElementById: () => null,
        createElement: () => ({}),
        addEventListener: () => {},
        removeEventListener: () => {},
    };
    const stubLocalStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    let seq = 0;
    const stubURL = {
        createObjectURL: () => {
            const url = `blob:fake-${++seq}`;
            if (media) {
                const origin = media.origins[media.cursor] ?? 0;
                media.cursor++;
                media.byUrl.set(url, origin);
            }
            return url;
        },
        revokeObjectURL: () => {},
    };
    const factory = new Function(
        'window', 'document', 'localStorage', 'fetch', 'URL',
        `${src}\nreturn { SmartVodPlayer, LiveSequentialPlayer };`,
    );
    const liveFetch = (...args: any[]) => (globalThis as any).fetch(...args);
    return factory(sandbox, stubDocument, stubLocalStorage, liveFetch, stubURL);
}

const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));

function playlistData() {
    return {
        success: true,
        id: 2242,
        extension: 'mp4',
        upstream: 'ok',
        chunks: [{
            index: 49,
            url: 'https://cdn.example/live/match_2242/chunk_0050.mp4',
            duration: INDEX_DURATION,
            ready: true,
            timeline_start_ms: Math.round(INDEX_START * 1000),
        }],
        index_metadata: {
            ready_count: 1,
            uploaded_count: 1,
            gaps: [],
            total_ready_ms: Math.round(INDEX_TOTAL * 1000),
            finalized: true,
        },
    };
}

/**
 * A standalone fragmented-MP4 element:
 *  - currentTime reads 0 while metadata is being announced (the real Blink
 *    race), then jumps to the absolute first timestamp on play();
 *  - duration is absolute (origin + verified chunk duration);
 *  - seekable is either absent or reports the absolute range start.
 */
function absoluteElement(opts: { seekable?: number | null } = {}) {
    let current = 0;
    let played = false;
    let readyState = 0;
    const listeners: Array<() => void> = [];
    const el: any = {
        src: '', muted: false, paused: true, duration: 0,
        readyState: 0, style: {},
        oncanplay: null as any, onerror: null as any, onended: null as any,
        ontimeupdate: null as any, onloadedmetadata: null as any,
        addEventListener: (name: string, cb: () => void) => {
            if (name === 'loadedmetadata') listeners.push(cb);
        },
        removeEventListener: () => {},
        load: async function (this: any) {
            setTimeout(() => {
                readyState = 1;
                this.readyState = readyState;
                this.duration = RAW_ORIGIN + INDEX_DURATION;
                current = 0; // the racy value at the event
                if (this.onloadedmetadata) this.onloadedmetadata();
                listeners.forEach((cb) => cb());
                // Blink may expose the absolute origin just after dispatch.
                if (played) current = RAW_ORIGIN;
                if (this.oncanplay) this.oncanplay();
            }, 0);
        },
        play: async function (this: any) {
            played = true;
            this.paused = false;
            // A real element starts at its first presentation time on the
            // first play and never rewinds an explicit seek on later plays.
            if (current === 0) current = RAW_ORIGIN;
        },
        pause: function (this: any) { this.paused = true; },
    };
    Object.defineProperty(el, 'currentTime', {
        configurable: true,
        get: () => current,
        set: (value: number) => {
            current = (!isFinite(value) || value < RAW_ORIGIN) ? RAW_ORIGIN : value;
        },
    });
    if (opts.seekable !== null) {
        const start = opts.seekable ?? RAW_ORIGIN;
        el.seekable = { length: 1, start: () => start, end: () => RAW_ORIGIN + INDEX_DURATION };
    }
    return el;
}

function zeroOriginElement() {
    let current = 0;
    const listeners: Array<() => void> = [];
    const el: any = {
        src: '', muted: false, paused: true, duration: INDEX_DURATION,
        readyState: 1, style: {},
        oncanplay: null, onerror: null, onended: null, ontimeupdate: null, onloadedmetadata: null,
        addEventListener: (name: string, cb: () => void) => {
            if (name === 'loadedmetadata') listeners.push(cb);
        },
        removeEventListener: () => {},
        load: async function (this: any) {
            setTimeout(() => {
                this.readyState = 1;
                this.duration = INDEX_DURATION;
                if (this.onloadedmetadata) this.onloadedmetadata();
                listeners.forEach((cb) => cb());
                if (this.oncanplay) this.oncanplay();
            }, 0);
        },
        play: async function (this: any) { this.paused = false; },
        pause: function (this: any) { this.paused = true; },
        seekable: { length: 1, start: () => 0, end: () => INDEX_DURATION },
    };
    Object.defineProperty(el, 'currentTime', {
        configurable: true,
        get: () => current,
        set: (v: number) => { current = Math.max(0, v); },
    });
    return el;
}

/**
 * Production-faithful standalone fMP4 element:
 *  - duration is NaN at `loadedmetadata` (real Chromium can expose the
 *    duration only after the final fragment is parsed);
 *  - currentTime reads 0 at the event, then play() parks it at the resource's
 *    absolute first timestamp;
 *  - seekable.start(0) is 0 (the production probe), so it is not evidence;
 *  - a later `durationchange` makes duration finite.
 *
 * Writing currentTime below the absolute origin is clamped to the origin,
 * exactly like a real media timeline: the bare chunk-local offset lands on
 * the chunk start.
 */
type DeferredMediaOptions = {
    duration: number;
    origin?: number;
    reveal?: 'manual' | 'auto';
    revealDelayMs?: number;
    seekableStart?: number;
    durationKnownAtMetadata?: boolean;
};

function deferredTimelineElement(media: MediaRegistry | null, opts: DeferredMediaOptions) {
    let current = 0;
    let played = false;
    let origin = 0;
    let durationValue: number | null = null;
    const listeners: Record<string, Array<(ev?: any) => void>> = {};
    const add = (type: string, cb: any) => { (listeners[type] ||= []).push(cb); };
    const remove = (type: string, cb: any) => {
        listeners[type] = (listeners[type] || []).filter((x) => x !== cb);
    };
    const el: any = {
        src: '', muted: false, paused: true, duration: NaN, readyState: 0, style: {},
        oncanplay: null, onerror: null, onended: null, ontimeupdate: null, onloadedmetadata: null,
        addEventListener: add, removeEventListener: remove,
        load: async function (this: any) {
            origin = (typeof opts.origin === 'number') ? opts.origin : (media?.byUrl.get(this.src) ?? 0);
            durationValue = null;
            this.duration = NaN;
            // A real element load() resets the resource state synchronously:
            // readyState drops to 0 and the element pauses. Without this, the
            // previous chunk's currentTime can be mistaken for an origin.
            this.readyState = 0;
            this.paused = true;
            played = false;
            current = 0;
            setTimeout(() => {
                this.readyState = 1;
                current = 0;
                if (opts.durationKnownAtMetadata) {
                    durationValue = origin + opts.duration;
                    this.duration = durationValue;
                }
                if (this.onloadedmetadata) this.onloadedmetadata();
                dispatch('loadedmetadata');
                if (opts.durationKnownAtMetadata) {
                    dispatch('durationchange');
                    dispatch('loadeddata');
                }
                if (opts.reveal !== 'manual') {
                    setTimeout(revealDuration, opts.revealDelayMs ?? 5);
                }
                if (this.oncanplay) this.oncanplay();
            }, 0);
        },
        play: async function (this: any) {
            played = true;
            this.paused = false;
            if (current === 0) current = origin;
            dispatch('canplay');
        },
        pause: function (this: any) { this.paused = true; },
        revealDuration: () => revealDuration(),
    };
    const dispatch = (type: string) => {
        const ev = { type };
        (listeners[type] || []).slice().forEach((cb) => cb(ev));
        const handler = el['on' + type];
        if (typeof handler === 'function') handler.call(el, ev);
    };
    const revealDuration = () => {
        if (durationValue !== null) return;
        durationValue = origin + opts.duration;
        el.duration = durationValue;
        if (played && current === 0) current = origin;
        dispatch('durationchange');
        dispatch('loadeddata');
        dispatch('canplay');
    };
    Object.defineProperty(el, 'currentTime', {
        configurable: true,
        get: () => current,
        set: (value: number) => {
            current = (!isFinite(value) || value < origin) ? origin : value;
        },
    });
    const seekStart = opts.seekableStart ?? 0;
    el.seekable = { length: 1, start: () => seekStart, end: () => origin + opts.duration };
    return el;
}

const REC_START = 150.959;
const REC_DURATION = 10.484;
const REC_TOTAL = REC_START + REC_DURATION;

const A_COUNT = 24;
const A_TOTAL = 255.863;
const A_STEP = A_TOTAL / A_COUNT;
const B_COUNT = 25;
const B_TOTAL = 271.347;
const B_TAIL_DURATION = B_TOTAL - A_TOTAL;

function servedChunk(i: number, start: number, duration: number, ready = true) {
    return {
        index: i,
        url: `https://cdn.example/live/match_2244/chunk_${String(i + 1).padStart(4, '0')}.mp4`,
        duration,
        ready,
        timeline_start_ms: Math.round(start * 1000),
    };
}

type PlaylistTimes = {
    finalizedAt?: string | null;
    checkedAt?: string | null;
};

function playlistWith(
    entries: any[],
    total: number,
    finalized: boolean,
    uploaded: number,
    times: PlaylistTimes = {},
) {
    const body: any = {
        success: true,
        id: 2244,
        extension: 'mp4',
        upstream: 'ok',
        chunk_duration: A_STEP,
        chunks: entries,
        index_metadata: {
            ready_count: entries.length,
            uploaded_count: uploaded,
            gaps: [],
            total_ready_ms: Math.round(total * 1000),
            finalized,
        },
    };
    if ('finalizedAt' in times) body.index_metadata.finalized_at = times.finalizedAt;
    if ('checkedAt' in times) body.checked_at = times.checkedAt;
    return body;
}

/** Fixed server-clock fixtures: the verification window uses these values. */
const TAIL_CLOCK = Date.parse('2026-10-21T18:00:00.000Z');
function at(ms: number) {
    return new Date(TAIL_CLOCK + ms).toISOString();
}

function jsonResponse(data: any) {
    return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    });
}

function installPlaylistFetch(
    handler: (call: number, init?: any) => Response | Promise<Response>,
) {
    let calls = 0;
    (globalThis as any).fetch = async (url: any, init?: any) => {
        if (String(url) === '/api/chunks/playlist/2244') {
            calls++;
            return handler(calls, init);
        }
        if (String(url).startsWith('https://cdn.example/')) {
            return chunkBytesResponse();
        }
        return realFetch(url);
    };
    return () => calls;
}

function completeTailPlaylist(finalizedAt: string, checkedAt: string) {
    const chunks = Array.from({ length: A_COUNT }, (_, i) => servedChunk(i, i * A_STEP, A_STEP));
    return playlistWith(chunks, A_TOTAL, true, A_COUNT, { finalizedAt, checkedAt });
}

function finalTailPlaylist(finalizedAt: string, checkedAt: string) {
    const chunks = Array.from({ length: A_COUNT }, (_, i) => servedChunk(i, i * A_STEP, A_STEP));
    chunks.push(servedChunk(A_COUNT, A_TOTAL, B_TAIL_DURATION));
    return playlistWith(chunks, B_TOTAL, true, B_COUNT, { finalizedAt, checkedAt });
}

function aPlaylist() {
    const chunks = Array.from({ length: A_COUNT }, (_, i) => servedChunk(i, i * A_STEP, A_STEP));
    return playlistWith(chunks, A_TOTAL, false, B_COUNT);
}

function bPlaylist() {
    const chunks = Array.from({ length: A_COUNT }, (_, i) => servedChunk(i, i * A_STEP, A_STEP));
    chunks.push(servedChunk(A_COUNT, A_TOTAL, B_TAIL_DURATION));
    return playlistWith(chunks, B_TOTAL, true, B_COUNT);
}

function singleChunkPlaylist(start: number, duration: number, total: number) {
    return playlistWith([servedChunk(0, start, duration)], total, true, 1);
}

function twoChunkPlaylist() {
    return playlistWith([
        servedChunk(0, 0, 10),
        servedChunk(1, 10, 10),
    ], 20, true, 2);
}

function chunkBytesResponse() {
    return new Response(new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]), {
        status: 200,
        headers: { 'content-type': 'video/mp4' },
    });
}

beforeEach(() => {
    // SmartVodPlayer fetches the chunk bytes before decoding. Serve a tiny
    // non-empty mp4 (the parser only requires bytes + a video content type).
    (globalThis as any).fetch = async (url: any) => {
        if (String(url).startsWith('https://cdn.example/')) {
            return chunkBytesResponse();
        }
        return realFetch(url);
    };
});

afterEach(() => {
    globalThis.fetch = realFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('A28-TIME — VOD (SmartVodPlayer) absolute media origin', () => {
    it('1. origin unobservable at metadata: duration derives it, no double offset', async () => {
        const { SmartVodPlayer } = loadClasses();
        const el = absoluteElement(); // currentTime reads 0 until play()
        const player = new SmartVodPlayer({
            videoElement: el,
            competitionId: 2242,
            playlistData: playlistData(),
        });
        await player.start();
        await wait();

        expect(player.getGlobalTime()).toBeCloseTo(INDEX_START, 3);
        expect(player.getGlobalTime()).toBeLessThanOrEqual(player.getGlobalDuration());
        expect(player.getGlobalDuration()).toBeCloseTo(INDEX_TOTAL, 3);
        player.stop();
    });

    it('2. seek on the absolute timeline writes origin + chunk-local offset', async () => {
        const { SmartVodPlayer } = loadClasses();
        const el = absoluteElement();
        const player = new SmartVodPlayer({
            videoElement: el,
            competitionId: 2242,
            playlistData: playlistData(),
        });
        await player.start();
        await wait();

        player.seekTo(INDEX_START + 2.5);
        await wait();
        expect(el.currentTime).toBeCloseTo(RAW_ORIGIN + 2.5, 3);
        expect(player.getGlobalTime()).toBeCloseTo(INDEX_START + 2.5, 3);
        expect(player.getGlobalTime()).toBeLessThanOrEqual(player.getGlobalDuration());
        player.stop();
    });

    it('3. seekable.start is used when it is the only absolute-origin signal', async () => {
        const { SmartVodPlayer } = loadClasses();
        // duration intentionally reports chunk-local, currentTime stays 0
        // until play(); only seekable.start proves the absolute origin.
        const el = absoluteElement({ seekable: RAW_ORIGIN });
        let d = 0;
        Object.defineProperty(el, 'duration', {
            configurable: true,
            get: () => (d === 0 ? INDEX_DURATION : d),
            set: (v: number) => { d = v; },
        });
        const player = new SmartVodPlayer({
            videoElement: el,
            competitionId: 2242,
            playlistData: playlistData(),
        });
        await player.start();
        await wait();
        expect(player.getGlobalTime()).toBeCloseTo(INDEX_START, 3);
        player.stop();
    });

    it('4. zero-origin media keeps the legacy conversion (no invented offset)', async () => {
        const { SmartVodPlayer } = loadClasses();
        const el = zeroOriginElement();
        const player = new SmartVodPlayer({
            videoElement: el,
            competitionId: 2242,
            playlistData: {
                ...playlistData(),
                chunks: [{
                    index: 0, url: 'https://cdn.example/live/match_2242/chunk_0001.mp4',
                    duration: 10, ready: true, timeline_start_ms: 30000,
                }],
                index_metadata: { ready_count: 1, uploaded_count: 1, gaps: [], total_ready_ms: 40000, finalized: true },
            },
        });
        await player.start();
        await wait();
        expect(player.getGlobalTime()).toBeCloseTo(30, 3);
        player.seekTo(35);
        await wait();
        expect(el.currentTime).toBeCloseTo(5, 3);
        expect(player.getGlobalTime()).toBeCloseTo(35, 3);
        player.stop();
    });
});

describe('A28-TIME — LIVE (LiveSequentialPlayer) same single conversion', () => {
    function absoluteLiveManager() {
        return {
            currentIndex: -1,
            entryFor: (i: number) => (i === 0
                ? { index: 0, ready: true, duration: INDEX_DURATION }
                : null),
            getUrl: () => 'https://cdn.example/live/match_2242/chunk_0050.mp4',
            getChunkStartTime: (i: number) => (i === 0 ? INDEX_START : INDEX_START + INDEX_DURATION),
            getChunkForTime: () => 0,
            getTotalDuration: () => INDEX_TOTAL,
            getLiveEdgeTime: () => INDEX_TOTAL,
            latestReadyIndex: () => 0,
            maxIndex: () => 0,
            waitForNextChunk: () => new Promise(() => {}),
        };
    }

    it('5. rewind to the chunk start uses the derived origin, not the raw absolute time', async () => {
        const { LiveSequentialPlayer } = loadClasses();
        const vids = [absoluteElement(), absoluteElement()];
        const player = new LiveSequentialPlayer({
            videoPlayers: vids,
            chunkManager: absoluteLiveManager(),
        });
        await player.rewindTo(0);
        await wait();
        expect(player.currentIndex).toBe(0);
        expect(vids[player.activePlayerIndex].currentTime).toBeCloseTo(RAW_ORIGIN, 3);
        expect(player.getGlobalTime()).toBeCloseTo(INDEX_START, 3);
        expect(player.getGlobalTime()).toBeLessThanOrEqual(player.getAvailableDuration());
        player.stop();
    });
});

/**
 * Production 2244 forensics. The production probe recorded:
 *   media.seekable.start(0) = 0, chunk 23 duration = 244.965 (absolute end),
 *   displayed clock = raw currentTime + chunk start, seeks clamped to chunk
 *   starts, and a 24-chunk / 255.863s snapshot while the final 25th chunk
 *   (271.347s) was draining.
 *
 * These tests reproduce the media semantics, not the arithmetic: the element
 * does not know its duration at loadedmetadata and only reveals it on a later
 * durationchange. cc7bed7 stores origin=0 at that first capture and never
 * re-derives it, so the failures below are the production failures.
 */
describe('A28-TIME — production 2244 forensic reproduction', () => {
    it('6. absolute fMP4 with late duration: current time stays one timeline', async () => {
        const media = mediaRegistry([REC_START]);
        const { SmartVodPlayer } = loadClasses('en', media);
        const el = deferredTimelineElement(media, { duration: REC_DURATION, reveal: 'manual' });
        const player = new SmartVodPlayer({
            videoElement: el,
            competitionId: 2244,
            playlistData: singleChunkPlaylist(REC_START, REC_DURATION, REC_TOTAL),
        });
        await player.start();
        await wait();
        el.revealDuration();
        await wait();

        expect(el.currentTime).toBeCloseTo(REC_START, 3);
        expect(player.getGlobalTime()).toBeCloseTo(REC_START, 3);
        expect(player.getGlobalTime()).toBeLessThanOrEqual(player.getGlobalDuration());
        player.stop();
    });

    it('7. seek requested before duration is known is re-applied, never clamped to the chunk start', async () => {
        const media = mediaRegistry([REC_START]);
        const { SmartVodPlayer } = loadClasses('en', media);
        const el = deferredTimelineElement(media, { duration: REC_DURATION, reveal: 'manual' });
        const player = new SmartVodPlayer({
            videoElement: el,
            competitionId: 2244,
            playlistData: singleChunkPlaylist(REC_START, REC_DURATION, REC_TOTAL),
        });
        await player.start();
        await wait();

        player.seekTo(REC_START + 3.9);
        await wait();
        el.revealDuration();
        await wait(60);

        expect(el.currentTime).toBeCloseTo(REC_START + 3.9, 2);
        expect(player.getGlobalTime()).toBeCloseTo(REC_START + 3.9, 2);
        player.stop();
    });

    it('8. total duration includes the final ready chunk after the drain tail', async () => {
        const { SmartVodPlayer } = loadClasses();
        const el = zeroOriginElement();
        const finalPlaylist = bPlaylist();
        let playlistFetches = 0;
        (globalThis as any).fetch = async (url: any) => {
            if (String(url) === '/api/chunks/playlist/2244') {
                playlistFetches++;
                return new Response(JSON.stringify(finalPlaylist), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                });
            }
            if (String(url).startsWith('https://cdn.example/')) return chunkBytesResponse();
            return realFetch(url);
        };
        const onTimeUpdate = vi.fn();
        const player = new SmartVodPlayer({
            videoElement: el,
            competitionId: 2244,
            playlistData: aPlaylist(),
            playlistRefreshMs: 5,
            playlistRefreshMaxAttempts: 5,
            onTimeUpdate,
        });
        await player.start();
        // The snapshot is the pre-drain one; the bounded refresh has not
        // fired yet (5ms timer), so assert it before any wait.
        expect(player.getGlobalDuration()).toBeCloseTo(A_TOTAL, 3);

        el.currentTime = 5;
        await wait(80);

        expect(playlistFetches).toBeGreaterThanOrEqual(1);
        expect(player.getGlobalDuration()).toBeCloseTo(B_TOTAL, 3);
        expect(player.chunks.length).toBe(B_COUNT);
        expect(player.currentChunkIndex).toBe(0);
        expect(el.currentTime).toBeCloseTo(5, 3);
        expect(onTimeUpdate).toHaveBeenCalled();
        const lastCall = onTimeUpdate.mock.calls[onTimeUpdate.mock.calls.length - 1];
        expect(lastCall[1]).toBeCloseTo(B_TOTAL, 3);

        const settled = playlistFetches;
        await wait(80);
        expect(playlistFetches).toBe(settled); // finalized playlist: no loop
        player.stop();
    });

    it('9. 60% and 92% seeks land at their offsets on the final 25-chunk total', async () => {
        const media = mediaRegistry([0, 159.914, 245.202]);
        const { SmartVodPlayer } = loadClasses('en', media);
        const el = deferredTimelineElement(media, { duration: A_STEP, reveal: 'manual' });
        const player = new SmartVodPlayer({
            videoElement: el,
            competitionId: 2244,
            playlistData: bPlaylist(),
        });
        await player.start();
        await wait();
        el.revealDuration();
        await wait();
        expect(player.getGlobalDuration()).toBeCloseTo(B_TOTAL, 3);

        const target60 = B_TOTAL * 0.60;
        player.seekTo(target60);
        await wait(30);
        el.revealDuration();
        await wait(60);
        expect.soft(el.currentTime).toBeCloseTo(target60, 2);
        expect.soft(player.getGlobalTime()).toBeCloseTo(target60, 2);

        const target92 = B_TOTAL * 0.92;
        player.seekTo(target92);
        await wait(30);
        el.revealDuration();
        await wait(60);
        expect.soft(el.currentTime).toBeCloseTo(target92, 2);
        expect.soft(player.getGlobalTime()).toBeCloseTo(target92, 2);
        expect(player.currentChunkIndex).toBe(23);
        player.stop();
    });

    it('10. chunk boundary keeps one continuous global timeline on absolute media', async () => {
        const media = mediaRegistry([0, 10]);
        const { SmartVodPlayer } = loadClasses('en', media);
        const el = deferredTimelineElement(media, { duration: 10, reveal: 'manual' });
        const player = new SmartVodPlayer({
            videoElement: el,
            competitionId: 2244,
            playlistData: twoChunkPlaylist(),
        });
        await player.start();
        await wait();
        el.revealDuration();
        await wait();
        expect(player.getGlobalTime()).toBeCloseTo(0, 3);

        el.currentTime = 9.5;
        el.onended();
        await wait(30);
        el.revealDuration();
        await wait(60);

        expect(player.currentChunkIndex).toBe(1);
        expect(el.currentTime).toBeCloseTo(10, 3);
        expect(player.getGlobalTime()).toBeCloseTo(10, 3);
        player.stop();
    });

    it('11. zero-origin media with a late duration keeps the legacy conversion', async () => {
        const media = mediaRegistry([0]);
        const { SmartVodPlayer } = loadClasses('en', media);
        const el = deferredTimelineElement(media, { duration: 10, reveal: 'manual' });
        const player = new SmartVodPlayer({
            videoElement: el,
            competitionId: 2244,
            playlistData: singleChunkPlaylist(30, 10, 40),
        });
        await player.start();
        await wait();
        el.revealDuration();
        await wait();

        expect(player.getGlobalTime()).toBeCloseTo(30, 3);
        player.seekTo(35);
        await wait();
        expect(el.currentTime).toBeCloseTo(5, 3);
        expect(player.getGlobalTime()).toBeCloseTo(35, 3);
        player.stop();
    });

    it('12. LIVE absolute media with a late duration keeps one conversion', async () => {
        const { LiveSequentialPlayer } = loadClasses();
        const manager = {
            currentIndex: -1,
            entryFor: (i: number) => (i === 0
                ? { index: 0, ready: true, duration: INDEX_DURATION }
                : null),
            getUrl: () => 'https://cdn.example/live/match_2242/chunk_0050.mp4',
            getChunkStartTime: (i: number) => (i === 0 ? INDEX_START : INDEX_START + INDEX_DURATION),
            getChunkForTime: () => 0,
            getTotalDuration: () => INDEX_TOTAL,
            getLiveEdgeTime: () => INDEX_TOTAL,
            latestReadyIndex: () => 0,
            maxIndex: () => 0,
            waitForNextChunk: () => new Promise(() => {}),
        };
        const vids = [
            deferredTimelineElement(null, { origin: RAW_ORIGIN, duration: INDEX_DURATION, reveal: 'manual' }),
            deferredTimelineElement(null, { origin: RAW_ORIGIN, duration: INDEX_DURATION, reveal: 'manual' }),
        ];
        const player = new LiveSequentialPlayer({ videoPlayers: vids, chunkManager: manager });
        await player.rewindTo(0);
        await wait();
        const active = vids[player.activePlayerIndex];
        active.revealDuration();
        await wait(60);

        expect(active.currentTime).toBeCloseTo(RAW_ORIGIN, 3);
        expect(player.getGlobalTime()).toBeCloseTo(INDEX_START, 3);
        player.stop();
    });
});

describe('A28-TIME-3 — finalized snapshot must not hide the drain tail', () => {
    it('13. a finalized+complete initial snapshot is rechecked and the later tail is incorporated without restarting playback', async () => {
        const { SmartVodPlayer } = loadClasses();
        const el = zeroOriginElement();
        const finalizedAt = at(0);
        const checkedAt = at(0);
        let lastTotal = 0;
        const calls = installPlaylistFetch(() => jsonResponse(finalTailPlaylist(finalizedAt, checkedAt)));
        const player = new SmartVodPlayer({
            videoElement: el,
            competitionId: 2244,
            playlistData: completeTailPlaylist(finalizedAt, checkedAt),
            playlistRefreshMs: 5,
            playlistRefreshMaxAttempts: 10,
            onTimeUpdate: (_time: number, total: number) => { lastTotal = total; },
        });
        await player.start();
        el.currentTime = 5;
        const srcBefore = el.src;

        expect(player.getGlobalDuration()).toBeCloseTo(A_TOTAL, 3);
        await wait(40);

        expect(calls()).toBeGreaterThan(0);
        expect(player.chunks.length).toBe(B_COUNT);
        expect(player.getGlobalDuration()).toBeCloseTo(B_TOTAL, 3);
        expect(lastTotal).toBeCloseTo(B_TOTAL, 3);
        expect(player.currentChunkIndex).toBe(0);
        expect(el.currentTime).toBeCloseTo(5, 3);
        expect(el.src).toBe(srcBefore);
        player.stop();
    });

    it('14. an already-settled finalized playlist is not polled', async () => {
        const { SmartVodPlayer } = loadClasses();
        const el = zeroOriginElement();
        const finalizedAt = at(0);
        const checkedAt = at(3_600_000);
        const calls = installPlaylistFetch(
            () => jsonResponse(completeTailPlaylist(finalizedAt, checkedAt)),
        );
        const player = new SmartVodPlayer({
            videoElement: el,
            competitionId: 2244,
            playlistData: completeTailPlaylist(finalizedAt, checkedAt),
            playlistRefreshMs: 5,
            playlistRefreshMaxAttempts: 10,
        });
        await player.start();
        await wait(40);

        expect(calls()).toBe(0);
        expect(player.getGlobalDuration()).toBeCloseTo(A_TOTAL, 3);
        player.stop();
    });

    it('15. a recent complete snapshot stops after the bounded verification window', async () => {
        const { SmartVodPlayer } = loadClasses();
        const el = zeroOriginElement();
        const finalizedAt = at(0);
        const checkedAt = at(0);
        const calls = installPlaylistFetch(
            () => jsonResponse(completeTailPlaylist(finalizedAt, checkedAt)),
        );
        const player = new SmartVodPlayer({
            videoElement: el,
            competitionId: 2244,
            playlistData: completeTailPlaylist(finalizedAt, checkedAt),
            playlistRefreshMs: 5,
            playlistRefreshMaxAttempts: 5,
        });
        await player.start();
        await wait(80);

        const settled = calls();
        expect(settled).toBeGreaterThanOrEqual(1);
        expect(settled).toBeLessThanOrEqual(5);
        expect(player.playlistRefreshTimer).toBeNull();
        expect(player.playlistRefreshInFlight).toBe(false);
        await wait(30);
        expect(calls()).toBe(settled);
        player.stop();
    });

    it('16. the tail is discovered after one or more no-growth refresh responses', async () => {
        const { SmartVodPlayer } = loadClasses();
        const el = zeroOriginElement();
        const finalizedAt = at(0);
        const checkedAt = at(0);
        const calls = installPlaylistFetch((call) => jsonResponse(
            call < 3
                ? completeTailPlaylist(finalizedAt, checkedAt)
                : finalTailPlaylist(finalizedAt, checkedAt),
        ));
        const player = new SmartVodPlayer({
            videoElement: el,
            competitionId: 2244,
            playlistData: completeTailPlaylist(finalizedAt, checkedAt),
            playlistRefreshMs: 5,
            playlistRefreshMaxAttempts: 10,
        });
        await player.start();
        await wait(40);

        expect(calls()).toBeGreaterThanOrEqual(3);
        expect(player.chunks.length).toBe(B_COUNT);
        expect(player.getGlobalDuration()).toBeCloseTo(B_TOTAL, 3);
        player.stop();
    });

    it('17. stop aborts pending verification and prevents further refresh activity', async () => {
        const { SmartVodPlayer } = loadClasses();
        const el = zeroOriginElement();
        const finalizedAt = at(0);
        const checkedAt = at(0);
        let aborted = false;
        const calls = installPlaylistFetch((_call, init) => new Promise<Response>((_resolve, reject) => {
            const signal = init && init.signal;
            if (!signal) return;
            if (signal.aborted) {
                aborted = true;
                reject(new Error('aborted'));
                return;
            }
            signal.addEventListener('abort', () => {
                aborted = true;
                reject(new Error('aborted'));
            });
        }));
        const player = new SmartVodPlayer({
            videoElement: el,
            competitionId: 2244,
            playlistData: completeTailPlaylist(finalizedAt, checkedAt),
            playlistRefreshMs: 5,
            playlistRefreshMaxAttempts: 10,
        });
        await player.start();
        await wait(15);

        expect(calls()).toBe(1);
        player.stop();
        await wait(30);

        expect(aborted).toBe(true);
        expect(calls()).toBe(1);
        expect(player.playlistRefreshTimer).toBeNull();
        expect(player.playlistRefreshInFlight).toBe(false);
    });

    it('18. a stale response cannot roll the playlist back to an older snapshot', async () => {
        const { SmartVodPlayer } = loadClasses();
        const el = zeroOriginElement();
        const fresh = playlistWith(
            Array.from({ length: A_COUNT }, (_, i) => servedChunk(i, i * A_STEP, A_STEP)),
            A_TOTAL,
            false,
            A_COUNT,
            { checkedAt: at(1000) },
        );
        const stale = finalTailPlaylist(at(0), at(0));
        const calls = installPlaylistFetch(() => jsonResponse(stale));
        const player = new SmartVodPlayer({
            videoElement: el,
            competitionId: 2244,
            playlistData: fresh,
            playlistRefreshMs: 1000,
            playlistRefreshMaxAttempts: 30,
        });
        await player.start();
        await player.refreshPlaylist();

        expect(calls()).toBe(1);
        expect(player.chunks.length).toBe(A_COUNT);
        expect(player.getGlobalDuration()).toBeCloseTo(A_TOTAL, 3);
        player.stop();
    });

    it('19. repeated start replaces the verification loop instead of creating a competing one', async () => {
        const { SmartVodPlayer } = loadClasses();
        const el = zeroOriginElement();
        const finalizedAt = at(0);
        const checkedAt = at(0);
        let aborted = 0;
        const calls = installPlaylistFetch((_call, init) => new Promise<Response>((_resolve, reject) => {
            const signal = init && init.signal;
            if (!signal) return;
            signal.addEventListener('abort', () => {
                aborted++;
                reject(new Error('aborted'));
            });
        }));
        const player = new SmartVodPlayer({
            videoElement: el,
            competitionId: 2244,
            playlistData: completeTailPlaylist(finalizedAt, checkedAt),
            playlistRefreshMs: 5,
            playlistRefreshMaxAttempts: 10,
        });
        await player.start();
        await wait(15);
        expect(calls()).toBe(1);

        await player.start();
        await wait(15);
        expect(aborted).toBe(1);
        expect(calls()).toBe(2);

        player.stop();
        await wait(30);
        expect(calls()).toBe(2);
    });
});
