import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    assembleFragmentedMp4,
    inspectMp4Tracks,
    parseTopLevelBoxes,
    readMp4DurationMs,
    type Mp4ChunkInput,
} from '../../src/lib/media/Mp4FragmentAssembler';

/**
 * Optional real-media check. The repository does not vendor recordings; when
 * the local fixture directory is present (development/browser validation) this
 * proves the remux against actual recorder output. In CI it is reported as
 * skipped, never as passed.
 */
const FIXTURE_DIR = process.env.DUELI_MP4_FIXTURE_DIR ?? join(process.cwd(), '..', 'match_2201');
const hasFixture = existsSync(FIXTURE_DIR);

function readTrunDurationMs(data: Uint8Array): { durationMs: number; sampleCount: number; timescale: number } {
    const boxes = parseTopLevelBoxes(data);
    const moov = boxes.find((b) => b.type === 'moov');
    const moof = boxes.find((b) => b.type === 'moof');
    if (!moov || !moof) throw new Error('fixture has no moov/moof');
    const trak = moov.children?.find((c) => c.type === 'trak');
    const mdia = trak?.children?.find((c) => c.type === 'mdia');
    const mdhd = mdia?.children?.find((c) => c.type === 'mdhd');
    const traf = moof.children?.find((c) => c.type === 'traf');
    const trun = traf?.children?.find((c) => c.type === 'trun');
    if (!mdhd || !trun) throw new Error('fixture has no mdhd/trun');
    const timescale = ((mdhd.data[mdhd.data[0] === 1 ? 20 : 12] << 24)
        | (mdhd.data[(mdhd.data[0] === 1 ? 20 : 12) + 1] << 16)
        | (mdhd.data[(mdhd.data[0] === 1 ? 20 : 12) + 2] << 8)
        | mdhd.data[(mdhd.data[0] === 1 ? 20 : 12) + 3]) >>> 0;
    const flags = ((trun.data[1] << 16) | (trun.data[2] << 8) | trun.data[3]) >>> 0;
    const sampleCount = ((trun.data[4] << 24) | (trun.data[5] << 16) | (trun.data[6] << 8) | trun.data[7]) >>> 0;
    let offset = 8;
    if (flags & 0x1) offset += 4; // data_offset
    if (flags & 0x4) offset += 4; // first_sample_flags
    let sampleUnits = 0;
    for (let i = 0; i < sampleCount; i++) {
        if (flags & 0x100) {
            sampleUnits += ((trun.data[offset] << 24) | (trun.data[offset + 1] << 16)
                | (trun.data[offset + 2] << 8) | trun.data[offset + 3]) >>> 0;
            offset += 4;
        }
        if (flags & 0x200) offset += 4;
        if (flags & 0x400) offset += 4;
        if (flags & 0x800) offset += 4;
    }
    return { durationMs: (sampleUnits / timescale) * 1000, sampleCount, timescale };
}

describe.skipIf(!hasFixture)('R4-CHUNK-DOWNLOAD-1 real MP4 fixture (match_2201)', () => {
    it('remuxes all stored chunks into one seekable MP4 whose duration matches the chunks', () => {
        const files = readdirSync(FIXTURE_DIR)
            .filter((name) => /^chunk_\d+\.mp4$/.test(name))
            .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
        expect(files.length).toBeGreaterThan(0);

        let cumulative = 0;
        const inputs: Mp4ChunkInput[] = files.map((file, index) => {
            const data = new Uint8Array(readFileSync(join(FIXTURE_DIR, file)));
            const measured = readTrunDurationMs(data);
            expect(measured.timescale).toBe(30000);
            expect(measured.sampleCount).toBeGreaterThan(0);
            const input: Mp4ChunkInput = {
                sequence: index + 1,
                timelineStartMs: cumulative,
                durationMs: measured.durationMs,
                data,
            };
            cumulative += measured.durationMs;
            return input;
        });

        const tracks = inspectMp4Tracks(inputs[0].data);
        expect(tracks.length).toBeGreaterThanOrEqual(1);
        expect(tracks.some((track) => track.handler === 'vide' && track.sampleEntry === 'avc1')).toBe(true);

        const assembly = assembleFragmentedMp4(inputs);
        expect(assembly.fragmentCount).toBe(files.length);
        expect(assembly.videoTrackCount).toBeGreaterThanOrEqual(1);
        expect(assembly.durationMs).toBeGreaterThan(350_000);
        expect(Math.abs(assembly.durationMs - cumulative)).toBeLessThan(1);

        const output = new Uint8Array(assembly.byteLength);
        let offset = 0;
        for (const part of assembly.parts) {
            output.set(part, offset);
            offset += part.length;
        }
        const boxes = parseTopLevelBoxes(output);
        expect(boxes.filter((b) => b.type === 'ftyp')).toHaveLength(1);
        expect(boxes.filter((b) => b.type === 'moov')).toHaveLength(1);
        expect(boxes.filter((b) => b.type === 'moof')).toHaveLength(files.length);
        expect(boxes.filter((b) => b.type === 'mdat')).toHaveLength(files.length);
        expect(boxes.some((b) => b.type === 'mfra')).toBe(false);
        expect(readMp4DurationMs(output)).toBe(Math.round(assembly.durationMs));

        const moofs = boxes.filter((b) => b.type === 'moof');
        const firstTraf = moofs[0].children?.find((c) => c.type === 'traf');
        const lastTraf = moofs[moofs.length - 1].children?.find((c) => c.type === 'traf');
        const firstTfdt = firstTraf?.children?.find((c) => c.type === 'tfdt');
        const lastTfdt = lastTraf?.children?.find((c) => c.type === 'tfdt');
        expect(firstTfdt).toBeTruthy();
        expect(lastTfdt).toBeTruthy();
        const low = (box: { data: Uint8Array }) => (((box.data[8] << 24) | (box.data[9] << 16) | (box.data[10] << 8) | box.data[11]) >>> 0);
        expect(low(firstTfdt!)).toBe(0);
        expect(low(lastTfdt!)).toBeGreaterThan(0);
    });
});
