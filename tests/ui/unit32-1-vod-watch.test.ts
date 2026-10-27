/**
 * UNIT32.1 — VOD watch-history timing regression.
 *
 * The competition page is server-rendered with an inline script. Extract the
 * real `embeddedReportVodWatch` block and run it in the test realm so the
 * assertions cover the shipped implementation, not a copied reimplementation.
 *
 * Pins:
 *  - currentTime alone is never proof: starting at >5s does not report;
 *  - five seconds of confirmed forward playback reports exactly once;
 *  - pause, buffering, seeking and position jumps do not count;
 *  - a failed history request cannot break playback or retry forever.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const PAGE = readFileSync(join(ROOT, 'src/modules/pages/competition-page.ts'), 'utf8');
const BLOCK_START = '// UNIT32.1: a real VOD watch event';
const BLOCK_END = '// ===== VOD Seekbar Controls =====';

interface VodState {
    progress: number;
    lastTime: number | null;
    reported: boolean;
}

interface FakeVideo {
    currentTime: number;
    paused: boolean;
    ended: boolean;
    seeking: boolean;
    readyState: number;
    __dueliVodWatchState?: VodState;
    addEventListener(name: string, fn: () => void): void;
    emit(name: string): void;
}

interface VodApi {
    embeddedReportVodWatch(video: FakeVideo): void;
    embeddedResetVodWatchClock(video: FakeVideo): void;
    embeddedWireVodWatch(video: FakeVideo): void;
}

function loadVodApi(status: string, fetchImpl: (url: string, init?: unknown) => Promise<unknown>): VodApi {
    const start = PAGE.indexOf(BLOCK_START);
    const end = PAGE.indexOf(BLOCK_END, start);
    if (start < 0 || end < 0) throw new Error('VOD watch block markers were not found');
    const source = PAGE.slice(start, end);
    const factory = new Function(
        'competitionData',
        'competitionId',
        'fetch',
        `${source}
return {
  embeddedReportVodWatch: embeddedReportVodWatch,
  embeddedResetVodWatchClock: embeddedResetVodWatchClock,
  embeddedWireVodWatch: embeddedWireVodWatch
};`
    ) as (data: { status: string }, id: number, fetchFn: typeof fetchImpl) => VodApi;
    return factory({ status }, 42, fetchImpl);
}

function createVideo(currentTime = 0, overrides: Partial<FakeVideo> = {}): FakeVideo {
    const listeners = new Map<string, Array<() => void>>();
    const video: FakeVideo = {
        currentTime,
        paused: false,
        ended: false,
        seeking: false,
        readyState: 4,
        addEventListener(name, fn) {
            const bucket = listeners.get(name) || [];
            bucket.push(fn);
            listeners.set(name, bucket);
        },
        emit(name) {
            for (const fn of listeners.get(name) || []) fn();
        },
        ...overrides,
    };
    return video;
}

function begin(video: FakeVideo, api: VodApi): void {
    api.embeddedWireVodWatch(video);
    // The first tick establishes the baseline. It must never be mistaken for
    // five seconds merely because the recording starts at a large offset.
    video.emit('timeupdate');
}

function play(video: FakeVideo, seconds: number, step = 0.25): void {
    const ticks = Math.round(seconds / step);
    for (let i = 0; i < ticks; i += 1) {
        video.currentTime += step;
        video.emit('timeupdate');
    }
}

describe('UNIT32.1 VOD watch-history timing', () => {
    it('does not treat a start position greater than five seconds as playback', () => {
        const fetchMock = vi.fn(async () => ({ ok: true }));
        const api = loadVodApi('completed', fetchMock);
        const video = createVideo(125);

        begin(video, api);
        expect(fetchMock, 'opening the player must not create history').not.toHaveBeenCalled();

        play(video, 4.75);
        expect(fetchMock, '4.75s of real progress is below the threshold').not.toHaveBeenCalled();

        play(video, 0.25);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toBe('/api/watch/history/42');

        play(video, 5);
        expect(fetchMock, 'one report per page load').toHaveBeenCalledTimes(1);
    });

    it('does not count paused time and only reports after accumulated live playback', () => {
        const fetchMock = vi.fn(async () => ({ ok: true }));
        const api = loadVodApi('completed', fetchMock);
        const video = createVideo(0);

        begin(video, api);
        play(video, 2);
        expect(fetchMock).not.toHaveBeenCalled();

        video.paused = true;
        video.emit('pause');
        video.currentTime = 40; // media position is irrelevant while paused
        video.emit('timeupdate');
        expect(fetchMock, 'a paused player cannot report history').not.toHaveBeenCalled();

        video.paused = false;
        video.emit('play');
        video.emit('timeupdate');
        play(video, 2.75);
        expect(fetchMock, 'the paused jump must not count toward five seconds').not.toHaveBeenCalled();

        play(video, 0.25);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not count a seek/jump as watch progress', () => {
        const fetchMock = vi.fn(async () => ({ ok: true }));
        const api = loadVodApi('completed', fetchMock);
        const video = createVideo(0);

        begin(video, api);
        play(video, 2);

        video.seeking = true;
        video.emit('seeking');
        video.currentTime = 100;
        video.emit('timeupdate');
        video.seeking = false;
        video.emit('seeked');
        video.emit('timeupdate');
        expect(fetchMock, 'the 98s jump is not watch time').not.toHaveBeenCalled();

        play(video, 2.75);
        expect(fetchMock).not.toHaveBeenCalled();
        play(video, 0.25);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('discards large position jumps even without a seeking event', () => {
        const fetchMock = vi.fn(async () => ({ ok: true }));
        const api = loadVodApi('completed', fetchMock);
        const video = createVideo(0);

        begin(video, api);
        play(video, 2);
        video.currentTime += 60;
        video.emit('timeupdate');
        expect(fetchMock, 'a large unexpected delta is not playback').not.toHaveBeenCalled();

        play(video, 2.75);
        expect(fetchMock).not.toHaveBeenCalled();
        play(video, 0.25);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not count time while buffering or before the player is ready', () => {
        const fetchMock = vi.fn(async () => ({ ok: true }));
        const api = loadVodApi('completed', fetchMock);
        const video = createVideo(0, { readyState: 1 });

        begin(video, api);
        video.emit('waiting');
        play(video, 10);
        expect(fetchMock, 'a buffering video has no confirmed playback').not.toHaveBeenCalled();

        video.readyState = 4;
        video.emit('playing');
        video.emit('timeupdate');
        play(video, 5);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('never reports for a live competition', () => {
        const fetchMock = vi.fn(async () => ({ ok: true }));
        const api = loadVodApi('live', fetchMock);
        const video = createVideo(0);

        begin(video, api);
        play(video, 10);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not retry or throw when the history request fails', async () => {
        const fetchMock = vi.fn(async () => {
            throw new Error('offline');
        });
        const api = loadVodApi('completed', fetchMock);
        const video = createVideo(0);

        begin(video, api);
        play(video, 5);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        // Let the caught rejection settle; playback continues without another
        // request or an unhandled rejection.
        await Promise.resolve();
        play(video, 5);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
