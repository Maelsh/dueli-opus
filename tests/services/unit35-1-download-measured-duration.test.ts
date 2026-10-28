/**
 * UNIT35.1 — MP4 remux prefers fragment byte measurement over inflated D1 duration.
 */
import { describe, expect, it } from 'vitest';
import {
    assembleFragmentedMp4,
    type Mp4ChunkInput,
} from '../../src/lib/media/Mp4FragmentAssembler';
import {
    buildDownloadFmp4Chunk,
    buildDownloadFmp4Init,
    type Fmp4TrackSpec,
} from '../helpers/media-fixtures';

const tracks: Fmp4TrackSpec[] = [
    { id: 1, handler: 'vide', timescale: 30000, sampleEntry: 'avc1' },
];

const init = buildDownloadFmp4Init(tracks);

function chunk(seq: number, startMs: number, realMs: number, manifestMs: number): Mp4ChunkInput {
    return {
        sequence: seq,
        timelineStartMs: startMs,
        durationMs: manifestMs,
        data: buildDownloadFmp4Chunk(init, tracks, {
            sequence: seq,
            timelineStartMs: startMs,
            durationMs: realMs,
            withMfra: true,
        }),
    };
}

describe('UNIT35.1 download duration alignment', () => {
    it('documents manifest vs byte mismatch (assembly uses caller-supplied durationMs)', () => {
        const inputs = [chunk(1, 0, 5000, 60000), chunk(2, 60000, 5000, 60000)];
        expect(() => assembleFragmentedMp4(inputs)).not.toThrow();
        const inflated = assembleFragmentedMp4(inputs);
        expect(inflated.durationMs).toBe(120000);
        const corrected = assembleFragmentedMp4([
            chunk(1, 0, 5000, 5000),
            chunk(2, 5000, 5000, 5000),
        ]);
        expect(corrected.durationMs).toBe(10000);
    });
});
