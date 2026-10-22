import { describe, expect, it } from 'vitest';
import {
    buildDownloadManifest,
    rightsFor,
    roleFor,
    streamUrlFor,
    type ManifestCompetition,
} from '../../src/lib/services/ChunkDownloadManifest';
import type { FinalMarker, RecordingChunk } from '../../src/models/ChunkIndexModel';
import { MAX_GAP_SCAN } from '../../src/models/ChunkIndexModel';

const competition: ManifestCompetition = {
    id: 70,
    creator_id: 1,
    opponent_id: 2,
    status: 'completed',
};

const finalMarker: FinalMarker = {
    competition_id: 70,
    finalized_at: '2026-10-22T10:00:00.000Z',
    uploaded_count: 3,
    ready_count: 3,
    total_ready_ms: 15_000,
    marker_generation: 1,
};

function row(sequence: number, overrides: Partial<RecordingChunk> = {}): RecordingChunk {
    return {
        id: sequence,
        competition_id: 70,
        generation: 1,
        sequence,
        object_path: `live/match_70/chunk_${String(sequence).padStart(4, '0')}.mp4`,
        object_hash: null,
        container: 'mp4',
        codec_video: 'h264',
        codec_audio: 'aac',
        bytes: 1000,
        declared_duration_ms: null,
        duration_ms: 5000,
        state: 'ready',
        created_at: '2026-10-22T09:00:00.000Z',
        updated_at: '2026-10-22T09:00:00.000Z',
        ...overrides,
    };
}

function manifest(rows: RecordingChunk[], opts: { final?: FinalMarker | null; truncated?: boolean } = {}) {
    return buildDownloadManifest({
        competition,
        viewerUserId: 3,
        rows,
        finalMarker: opts.final === undefined ? finalMarker : opts.final,
        baseUrl: 'https://upload.example.com',
        truncated: opts.truncated,
        now: new Date('2026-10-22T10:01:00.000Z'),
    });
}

describe('R4-CHUNK-DOWNLOAD-1 manifest', () => {
    it('marks a finalized contiguous ready recording complete and orders the timeline', () => {
        const result = manifest([row(3), row(1), row(2)]);
        expect(result.complete).toBe(true);
        expect(result.finalized).toBe(true);
        expect(result.role).toBe('viewer');
        expect(result.rights).toEqual({
            can_download: true,
            republication: 'platform_permission_required',
            notice_key: 'download_ui.rights_viewer',
        });
        expect(result.chunks.map((c) => c.sequence)).toEqual([1, 2, 3]);
        expect(result.chunks.map((c) => c.timeline_start_ms)).toEqual([0, 5000, 10000]);
        expect(result.total_duration_ms).toBe(15000);
        expect(result.total_bytes).toBe(3000);
        expect(result.mode).toBe('mp4-remux');
        expect(result.format).toBe('mp4');
        expect(result.filename_hint).toBe('dueli_competition_70.mp4');
        expect(result.blockers).toEqual([]);
    });

    it('never claims completeness when finalized but gapped/unready/failed', () => {
        const result = manifest([
            row(1),
            row(2, { state: 'uploaded', duration_ms: null }),
            row(3, { state: 'failed', duration_ms: null }),
            row(5),
        ]);
        expect(result.complete).toBe(false);
        expect(result.gaps).toEqual([4]);
        expect(result.unready_sequences).toEqual([2]);
        expect(result.failed_sequences).toEqual([3]);
        expect(result.counts).toMatchObject({ ready: 2, uploaded: 1, failed: 1, missing: 1, total_sequences: 5 });
        expect(result.filename_hint).toBe('dueli_competition_70_partial.mp4');
        expect(result.blockers).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'recording_incomplete', sequences: [4] }),
            expect.objectContaining({ code: 'unready_chunks', sequences: [2] }),
            expect.objectContaining({ code: 'failed_chunks', sequences: [3] }),
        ]));
    });

    it('does not invent a duration for a ready row with no verified measurement', () => {
        const result = manifest([row(1, { duration_ms: null }), row(2)]);
        expect(result.complete).toBe(false);
        expect(result.chunks.map((c) => c.sequence)).toEqual([2]);
        expect(result.blockers).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'duration_unknown', sequences: [1] }),
        ]));
    });

    it('is partial (not complete) before the final marker', () => {
        const result = manifest([row(1), row(2)], { final: null });
        expect(result.finalized).toBe(false);
        expect(result.complete).toBe(false);
        expect(result.blockers).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'recording_not_finalized' }),
        ]));
    });

    it('is partial when the bounded read was truncated', () => {
        const result = manifest([row(1), row(2)], { truncated: true });
        expect(result.truncated).toBe(true);
        expect(result.complete).toBe(false);
    });

    it('marks an unscanable gap space truncated instead of silently complete', () => {
        const result = manifest([row(MAX_GAP_SCAN + 1)]);
        expect(result.complete).toBe(false);
        expect(result.truncated).toBe(true);
        expect(result.counts.missing).toBe(MAX_GAP_SCAN);
        expect(result.blockers).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'recording_incomplete' }),
        ]));
    });

    it('selects ffmpeg for webm and mixed containers', () => {
        expect(manifest([row(1, { container: 'webm' })]).mode).toBe('ffmpeg');
        expect(manifest([row(1), row(2, { container: 'webm' })]).format).toBe('mixed');
        expect(manifest([row(1), row(2, { container: 'webm' })]).mode).toBe('ffmpeg');
    });

    it('infers SHA-256 only from a 64-hex digest', () => {
        const sha = 'a'.repeat(64);
        expect(manifest([row(1, { object_hash: sha })]).chunks[0].hash_algorithm).toBe('sha256');
        expect(manifest([row(1, { object_hash: 'abc' })]).chunks[0].hash_algorithm).toBeNull();
        expect(manifest([row(1, { object_hash: null })]).chunks[0].hash_algorithm).toBeNull();
    });

    it('assigns roles and rights from competition participation', () => {
        expect(roleFor(competition, 1)).toBe('creator');
        expect(roleFor(competition, 2)).toBe('opponent');
        expect(roleFor(competition, 99)).toBe('viewer');
        expect(roleFor({ ...competition, opponent_id: null }, 99)).toBe('viewer');
        expect(rightsFor('creator')).toEqual({
            can_download: true,
            republication: 'competitors_may_republish_and_monetize',
            notice_key: 'download_ui.rights_competitor',
        });
        expect(rightsFor('opponent').notice_key).toBe('download_ui.rights_competitor');
        expect(rightsFor('viewer').notice_key).toBe('download_ui.rights_viewer');
    });

    it('builds stream URLs without losing path separators', () => {
        expect(streamUrlFor('https://upload.example.com/', 'live/match_70/chunk_0001.mp4'))
            .toBe('https://upload.example.com/stream.php?path=live/match_70/chunk_0001.mp4');
        expect(streamUrlFor('https://upload.example.com', 'https://cdn.example.com/a.mp4'))
            .toBe('https://cdn.example.com/a.mp4');
    });

    it('reports no chunks and no mode for an empty recording', () => {
        const result = manifest([], { final: null });
        expect(result.mode).toBe('none');
        expect(result.format).toBe('none');
        expect(result.chunks).toEqual([]);
        expect(result.blockers).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'no_chunks' }),
            expect.objectContaining({ code: 'recording_not_finalized' }),
        ]));
    });
});
