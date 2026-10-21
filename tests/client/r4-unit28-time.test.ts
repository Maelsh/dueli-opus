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

function loadClasses(lang = 'en'): Classes {
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
        createObjectURL: () => `blob:fake-${++seq}`,
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

beforeEach(() => {
    // SmartVodPlayer fetches the chunk bytes before decoding. Serve a tiny
    // non-empty mp4 (the parser only requires bytes + a video content type).
    (globalThis as any).fetch = async (url: any) => {
        if (String(url).startsWith('https://cdn.example/')) {
            return new Response(new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]), {
                status: 200,
                headers: { 'content-type': 'video/mp4' },
            });
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
