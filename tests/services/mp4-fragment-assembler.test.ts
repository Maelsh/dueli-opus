import { describe, expect, it } from 'vitest';
import {
    assembleFragmentedMp4,
    inspectMp4Tracks,
    Mp4AssemblyError,
    parseTopLevelBoxes,
    readMp4DurationMs,
    serializeBox,
    type Mp4Box,
    type Mp4ChunkInput,
} from '../../src/lib/media/Mp4FragmentAssembler';
import {
    buildDownloadFmp4Chunk,
    buildDownloadFmp4Init,
    type Fmp4TrackSpec,
} from '../helpers/media-fixtures';

const tracks: Fmp4TrackSpec[] = [
    { id: 1, handler: 'vide', timescale: 30000, sampleEntry: 'avc1' },
    { id: 2, handler: 'soun', timescale: 48000, sampleEntry: 'mp4a' },
];

const init = buildDownloadFmp4Init(tracks);

function input(sequence: number, timelineStartMs: number, durationMs = 5000): Mp4ChunkInput {
    return {
        sequence,
        timelineStartMs,
        durationMs,
        data: buildDownloadFmp4Chunk(init, tracks, { sequence, timelineStartMs, durationMs, withMfra: true }),
    };
}

function findChild(box: Mp4Box, type: string): Mp4Box | null {
    return box.children?.find((child) => child.type === type) ?? null;
}

describe('R4-CHUNK-DOWNLOAD-1 structural fMP4 remux', () => {
    it('keeps one init, one moof+mdat per chunk, drops mfra and patches durations/timeline', () => {
        const chunks = [input(1, 0), input(2, 5000), input(3, 10000)];
        const result = assembleFragmentedMp4(chunks);
        expect(result.durationMs).toBe(15000);
        expect(result.fragmentCount).toBe(3);
        expect(result.trackCount).toBe(2);
        expect(result.videoTrackCount).toBe(1);
        expect(result.audioTrackCount).toBe(1);
        expect(result.byteLength).toBe(result.parts.reduce((sum, p) => sum + p.length, 0));

        const output = new Uint8Array(result.byteLength);
        let offset = 0;
        for (const part of result.parts) {
            output.set(part, offset);
            offset += part.length;
        }
        const boxes = parseTopLevelBoxes(output);
        expect(boxes.filter((b) => b.type === 'ftyp')).toHaveLength(1);
        expect(boxes.filter((b) => b.type === 'moov')).toHaveLength(1);
        expect(boxes.filter((b) => b.type === 'moof')).toHaveLength(3);
        expect(boxes.filter((b) => b.type === 'mdat')).toHaveLength(3);
        expect(boxes.some((b) => b.type === 'mfra')).toBe(false);

        const moov = boxes.find((b) => b.type === 'moov')!;
        const mehd = findChild(findChild(moov, 'mvex')!, 'mehd')!;
        expect(mehd).toBeTruthy();
        expect(readMp4DurationMs(output)).toBe(15000);

        expect(inspectMp4Tracks(output)).toEqual([
            { id: 1, handler: 'vide', timescale: 30000, sampleEntry: 'avc1' },
            { id: 2, handler: 'soun', timescale: 48000, sampleEntry: 'mp4a' },
        ]);

        const moofs = boxes.filter((b) => b.type === 'moof');
        for (let i = 0; i < moofs.length; i++) {
            const moof = moofs[i];
            const mfhd = findChild(moof, 'mfhd')!;
            expect(mfhd.data[7]).toBe(i + 1);
            const trafs = moof.children?.filter((child) => child.type === 'traf') ?? [];
            expect(trafs).toHaveLength(2);
            for (const traf of trafs) {
                const tfhd = findChild(traf, 'tfhd')!;
                const trackId = ((tfhd.data[4] << 24) | (tfhd.data[5] << 16) | (tfhd.data[6] << 8) | tfhd.data[7]) >>> 0;
                const tfdt = findChild(traf, 'tfdt')!;
                const baseHi = ((tfdt.data[4] << 24) | (tfdt.data[5] << 16) | (tfdt.data[6] << 8) | tfdt.data[7]) >>> 0;
                const baseLo = ((tfdt.data[8] << 24) | (tfdt.data[9] << 16) | (tfdt.data[10] << 8) | tfdt.data[11]) >>> 0;
                const base = baseHi * 0x100000000 + baseLo;
                const track = tracks.find((t) => t.id === trackId)!;
                expect(base).toBe(Math.round(((i * 5000) * track.timescale) / 1000));
            }
        }
    });

    it('rejects a different init segment instead of mixing incompatible movies', () => {
        const otherInit = buildDownloadFmp4Init([
            { ...tracks[0], sampleEntry: 'hvc1' },
            tracks[1],
        ]);
        const second = buildDownloadFmp4Chunk(otherInit, tracks, {
            sequence: 2, timelineStartMs: 5000, durationMs: 5000,
        });
        let caught: unknown = null;
        try {
            assembleFragmentedMp4([input(1, 0), { sequence: 2, timelineStartMs: 5000, durationMs: 5000, data: second }]);
        } catch (error) {
            caught = error;
        }
        expect(caught).toBeInstanceOf(Mp4AssemblyError);
        expect((caught as Mp4AssemblyError).code).toBe('init_mismatch');
    });

    it('refuses a chunk with no verified duration (never invents one)', () => {
        expect(() => assembleFragmentedMp4([{ ...input(1, 0), durationMs: 0 }]))
            .toThrowError(/no verified duration/);
    });

    it('refuses non-monotonic timeline origins', () => {
        expect(() => assembleFragmentedMp4([input(1, 0), input(2, 2000)]))
            .toThrowError(/not monotonic/);
    });

    it('reads tracks and duration from a finalized (non-fragmented) MP4', () => {
        const boxes = parseTopLevelBoxes(init);
        const ftyp = boxes.find((b) => b.type === 'ftyp')!;
        const moov = boxes.find((b) => b.type === 'moov')!;
        const withoutMvex: Mp4Box = { ...moov, children: (moov.children ?? []).filter((c) => c.type !== 'mvex') };
        const finalized = new Uint8Array([...serializeBox(ftyp), ...serializeBox(withoutMvex)]);
        // mvhd duration is zero in this fixture; the important part is that
        // inspection does not require mvex/trex for a regular MP4.
        expect(inspectMp4Tracks(finalized).map((t) => t.handler)).toEqual(['vide', 'soun']);
        expect(readMp4DurationMs(finalized)).toBe(0);
    });
});
