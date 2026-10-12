/**
 * ROW28 D3 — server-side media duration measurement from the REAL stored
 * bytes. These tests drive the parser with MediaRecorder-shaped fixtures
 * (tests/helpers/media-fixtures.ts): a WebM object whose Segment Info has
 * NO Duration element (the getID3-blind case), init-prepended clusters,
 * multi-cluster timelines, custom TimecodeScale, missing cluster
 * timestamps, BlockDuration blocks, and both supported MP4 forms. The
 * frame-tolerance test reproduces a 5s / 30fps Chromium-style chunk and
 * proves the measurement lands within ONE video frame — never invented,
 * never over-reported, and fail-closed when nothing is verifiable.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
    measureDurationMs, measureWebmDurationMs, measureMp4DurationMs,
    measureStoredChunkDuration, MAX_MEASURE_BYTES,
} from '../../src/lib/services/MediaDuration';
import {
    buildWebmObject, buildWebmWithBlockDurations,
    buildMp4WithMovieDuration, buildFragmentedMp4,
} from '../helpers/media-fixtures';

describe('ROW28 D3 — WebM (MediaRecorder fragment shape)', () => {
    it('1. measures the stored object whose Info has NO Duration element', () => {
        // 5s chunk, one keyframe block per second (last block ends the media).
        const bytes = buildWebmObject([
            [0, [0]],
            [1000, [0]],
            [2000, [0]],
            [3000, [0]],
            [4000, [0]],
            [5000, [0]],
        ]);
        expect(measureWebmDurationMs(bytes)).toBe(5000); // last block timestamp
    });

    it('2. real 5s @30fps Chromium-style chunk lands within ONE video frame', () => {
        // MediaRecorder emits per-frame blocks (~33ms); the stored end is the
        // LAST block start, so the measurement may under-report by at most
        // one frame — and never over-reports.
        const FRAME_MS = 33;
        const blockTs: number[] = [];
        for (let t = 0; t < 5000; t += FRAME_MS) blockTs.push(t);
        const bytes = buildWebmObject([[0, blockTs]]);
        const measured = measureWebmDurationMs(bytes) as number;
        expect(measured).toBeGreaterThanOrEqual(5000 - FRAME_MS);
        expect(measured).toBeLessThanOrEqual(5000);
    });

    it('3. honors TimecodeScale (0.5ms units) and multi-cluster accumulation', () => {
        const bytes = buildWebmObject([
            [0, [0, 2000, 4000]],
            [4000, [0, 2000, 4000]],
        ], { timecodeScaleNs: 500_000 }); // 0.5ms per unit
        // last block absolute end = 8000 units * 0.5ms = 4000ms
        expect(measureWebmDurationMs(bytes)).toBe(4000);
    });

    it('4. omitted TimecodeScale falls back to the spec default (1ms)', () => {
        const bytes = buildWebmObject([[0, [0, 2500]]], { omitTimecodeScale: true });
        expect(measureWebmDurationMs(bytes)).toBe(2500);
    });

    it('5. missing cluster timestamp defaults to 0 (spec) and still measures', () => {
        const bytes = buildWebmObject([[null, [0, 1200, 2400]]]);
        expect(measureWebmDurationMs(bytes)).toBe(2400);
    });

    it('6. BlockDuration extends the measured end; later clusters win', () => {
        const bytes = buildWebmWithBlockDurations([
            [0, [[0, 1000]]],                       // block at 0 lasting 1000
            [4000, [[0, 1000], [1000, 1000]]],      // cluster 4000: blocks end 5000/6000
        ]);
        expect(measureWebmDurationMs(bytes)).toBe(6000);
    });

    it('7. unknown-size Segment and raw-cluster fragments both parse', () => {
        const unknown = buildWebmObject([[0, [0, 5000]]], { unknownSegmentSize: true });
        expect(measureWebmDurationMs(unknown)).toBe(5000);
        const raw = buildWebmObject([[0, [0, 5000]]], { omitSegment: true });
        expect(measureWebmDurationMs(raw)).toBe(5000);
    });

    it('8. fails closed: no block, empty, or non-media bytes → null', () => {
        expect(measureWebmDurationMs(new Uint8Array(0))).toBeNull();
        expect(measureWebmDurationMs(new Uint8Array([1, 2, 3]))).toBeNull();
        // Header + Info but zero clusters (pure init blob — nothing measured).
        expect(measureWebmDurationMs(buildWebmObject([]))).toBeNull();
        // Garbage after a valid header must not yield a duration.
        expect(measureWebmDurationMs(buildWebmObject([[0, []]]))).toBeNull();
    });
});

describe('ROW28 D3 — MP4 (supported behavior, fail closed otherwise)', () => {
    it('9. finalized movie duration (mvhd timescale) is measured', () => {
        expect(measureMp4DurationMs(buildMp4WithMovieDuration(1000, 7500))).toBe(7500);
        expect(measureMp4DurationMs(buildMp4WithMovieDuration(90000, 270000))).toBe(3000);
    });

    it('10. fragmented recording (tfdt + trun sample durations) is measured', () => {
        const bytes = buildFragmentedMp4(90000, [
            { baseTime: 0, sampleDurations: [3000, 3000, 3000] },       // 3000 units
            { baseTime: 90000, sampleDurations: [60000, 30000] },      // 90000 + 90000
        ]);
        expect(measureMp4DurationMs(bytes)).toBe(2000); // ms at 90kHz
    });

    it('11. fragmented MP4 without a derivable duration → null (fail closed)', () => {
        // No moof at all and a zeroed movie duration: nothing to verify.
        expect(measureDurationMs(buildFragmentedMp4(90000, []), 'mp4')).toBeNull();
        expect(measureMp4DurationMs(new Uint8Array([0, 0, 0, 8, 102, 114, 101, 101]))).toBeNull(); // 'free'
    });

    it('12. container dispatch + oversized guard behave', () => {
        const webm = buildWebmObject([[0, [0, 1000]]]);
        expect(measureDurationMs(webm, 'webm')).toBe(1000);
        expect(measureDurationMs(webm, 'mp4')).toBeNull(); // wrong parser, fail closed
    });
});

describe('ROW28 D3 — measureStoredChunkDuration (real stored bytes)', () => {
    const realFetch = globalThis.fetch;
    afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

    it('13. fetches the stored object and measures it', async () => {
        const bytes = buildWebmObject([[0, [0, 2000, 4000]]]);
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(bytes));
        const ms = await measureStoredChunkDuration(
            { FFMPEG_SERVER_URL: 'https://host.test/ffmpeg/' },
            'live/match_70/chunk_0001.webm', 'webm',
        );
        expect(ms).toBe(4000);
        const called = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
        expect(String(called[0])).toBe('https://host.test/ffmpeg/stream.php?path=live%2Fmatch_70%2Fchunk_0001.webm');
    });

    it('14. unreachable host, non-200, empty, oversized → null (fail closed)', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
        expect(await measureStoredChunkDuration({}, 'live/match_70/chunk_0001.webm', 'webm')).toBeNull();
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 404 }));
        expect(await measureStoredChunkDuration({}, 'live/match_70/chunk_0001.webm', 'webm')).toBeNull();
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Uint8Array(0)));
        expect(await measureStoredChunkDuration({}, 'live/match_70/chunk_0001.webm', 'webm')).toBeNull();
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(new Uint8Array(MAX_MEASURE_BYTES + 1)));
        expect(await measureStoredChunkDuration({}, 'live/match_70/chunk_0001.webm', 'webm')).toBeNull();
    });
});
