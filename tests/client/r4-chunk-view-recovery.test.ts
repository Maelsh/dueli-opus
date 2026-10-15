/**
 * R4-CHUNK-VIEW-RECOVERY-1 (row 28.4) — chunk readiness + playlist authority
 * first-failure-point trace, focused T/B.
 *
 * SPEC: dueli-completion-plan 15 §11 (28.4). ORDER: 14 (28.4 owns symptoms
 * A = غياب 0001, B = ملفات لا تعرض at the discovery layer, E = lease/drop,
 * and the player half of J = wrong LIVE state / spinner). OWNER DECISIONS: 08
 * (downloaded chunks WORK — the platform must discover/request them, never
 * assume corruption; no server FFmpeg / deletion / overwrite).
 *
 * This file is an EXECUTABLE record of the pipeline trace
 *   dataavailable → enqueue → register → upload → ack/receipt → measured
 *   duration / D1 ready → playlist → player request → decode/play
 * at the boundary that decides which chunks the audience can discover &
 * request (mergePlaylistWithIndex → served playlist). Each block names the
 * symptom it classifies (CONFIRMED-correct / first-failure-point) with the
 * assertion that pins it. No media is fabricated and no healthy behavior is
 * rewritten.
 */
import { describe, expect, it } from 'vitest';
import {
    mergePlaylistWithIndex,
    type ProxyChunk,
} from '../../src/lib/services/ChunkIndexPlaylist';
import type { RecordingChunk } from '../../src/models/ChunkIndexModel';

const BASE = 'https://ff.example';
const mp4 = (path = 'live/match_2225') => (n: number) => `${BASE}/stream.php?path=${path}/chunk_${String(n).padStart(4, '0')}.mp4`;

/** Minimal RecordingChunk (index authority row). */
function row(
    sequence: number,
    state: 'uploaded' | 'ready' | 'failed',
    opts: { duration_ms?: number | null; declared_duration_ms?: number | null; bytes?: number | null; object_path?: string } = {},
): RecordingChunk {
    return {
        id: sequence,
        competition_id: 2225,
        sequence,
        generation: 1,
        object_path: opts.object_path ?? mp4()(sequence),
        object_hash: null,
        container: 'mp4',
        codec_video: null,
        codec_audio: null,
        bytes: opts.bytes ?? null,
        declared_duration_ms: opts.declared_duration_ms ?? null,
        duration_ms: opts.duration_ms ?? null,
        state,
        created_at: 't',
        updated_at: 't',
    } as unknown as RecordingChunk;
}

/** A proxy entry as the normalized playlist route emits (0-based index). */
function proxy(indexZeroBased: number, seq: number): ProxyChunk {
    return { index: indexZeroBased, url: mp4()(seq), size: 30000 };
}

const urls = (chunks: { index: number; url: string }[]) => chunks.map((c) => c.url);

describe('R4-CHUNK-VIEW-RECOVERY-1 — playlist authority / first failure point', () => {
    it('A: proxy drops 0001 but D1 holds it (ready) → authority RECOVERS it (no loss)', () => {
        // First-failure-point classification for symptom A: the UPSTREAM proxy
        // omits chunk 0001, yet the audience must still discover & request it.
        // D1 is the authority: a ready row with no proxy match is APPENDED as a
        // built entry (object_path), ordered at index 0.
        const proxyEntries = [proxy(1, 2), proxy(2, 3), proxy(3, 4)]; // 0001 missing upstream
        const indexRows = [row(1, 'ready', { duration_ms: 5000 }), row(2, 'ready', { duration_ms: 5000 }), row(3, 'ready', { duration_ms: 5000 }), row(4, 'ready', { duration_ms: 5000 })];
        const { chunks, metadata } = mergePlaylistWithIndex(proxyEntries, indexRows, BASE, false);
        // 0001 recovered (index 0), full unbroken sequence, no fabricated gap.
        expect(chunks[0].index).toBe(0);
        expect(chunks[0].url).toContain('chunk_0001.mp4');
        expect(chunks.map((c) => c.index)).toEqual([0, 1, 2, 3]);
        expect(metadata.gaps).toEqual([]);
        expect(metadata.ready_count).toBe(4);
    });

    it('A: 0001 absent from BOTH proxy and D1 → explicit gap, NO fabricated chunk', () => {
        // A genuinely missing first sequence MUST surface as a gap, never be
        // invented from media that was never stored (15 §11: "لا تملأ فجوة
        // بوسائط وهمية"). The served list stays honest (no index-0 entry).
        const proxyEntries = [proxy(1, 2), proxy(2, 3)];
        const indexRows = [row(2, 'ready', { duration_ms: 5000 }), row(3, 'ready', { duration_ms: 5000 })];
        const { chunks, metadata } = mergePlaylistWithIndex(proxyEntries, indexRows, BASE, false);
        expect(metadata.gaps).toContain(1);
        expect(chunks.some((c) => c.index === 0)).toBe(false);
        expect(chunks.every((c) => c.url.includes('chunk_0001') === false)).toBe(true);
    });

    it('A: resumeBase / prior-session — D1 starts at seq 6, proxy covers 1..5 → served is COMPLETE 1..10', () => {
        // Distinguish resumeBase / another session from a real loss: the proxy
        // still serves the pre-index head (legacy, unannotated) and D1 supplies
        // the tail as ordered orphans. The audience request sequence is whole.
        const proxyEntries = [proxy(0, 1), proxy(1, 2), proxy(2, 3), proxy(3, 4), proxy(4, 5)];
        const indexRows = [6, 7, 8, 9, 10].map((n) => row(n, 'ready', { duration_ms: 5000 }));
        const { chunks, metadata } = mergePlaylistWithIndex(proxyEntries, indexRows, BASE, false);
        expect(chunks.map((c) => c.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        expect(urls(chunks)[9]).toContain('chunk_0010.mp4');
        // No chunk in the union is dropped; only index-scope absence is reported.
        expect(metadata.gaps).toEqual([1, 2, 3, 4, 5]); // index has no rows 1..5 (served via proxy)
        expect(metadata.ready_count).toBe(5);
    });

    it('E: a terminally-failed chunk is SUPPRESSED from the served playlist (never played, never resurrected)', () => {
        // A failed receipt is a loud, terminal fate — its proxy entry is
        // suppressed so the sequential player is not stalled by a poisoned
        // segment. This is the anti-"silent drop" guarantee: failed is EXPLICIT
        // and removed, not hidden.
        const proxyEntries = [proxy(0, 1), proxy(1, 2), proxy(2, 3)];
        const indexRows = [row(1, 'ready', { duration_ms: 5000 }), row(2, 'failed'), row(3, 'ready', { duration_ms: 5000 })];
        const { chunks } = mergePlaylistWithIndex(proxyEntries, indexRows, BASE, false);
        expect(chunks.map((c) => c.index)).toEqual([0, 2]); // seq 2 (index 1) suppressed
        expect(chunks.some((c) => c.url.includes('chunk_0002'))).toBe(false);
    });

    it('ready/duration honesty: stored-but-unmeasured is served (ready:false) but NOT dropped', () => {
        // receipt saved the bytes but the platform could not measure → slot
        // stays `uploaded` (fail-closed: never ready, never invented). The
        // chunk is still DISCOVERABLE (url present) so a later identical receipt
        // can promote it; it is only marked unready, never silently dropped.
        const proxyEntries = [proxy(0, 1), proxy(1, 2)];
        const indexRows = [row(1, 'uploaded', { declared_duration_ms: 5000 }), row(2, 'ready', { duration_ms: 4200 })];
        const { chunks, metadata } = mergePlaylistWithIndex(proxyEntries, indexRows, BASE, false);
        const first = chunks.find((c) => c.index === 0)!;
        expect(first.ready).toBe(false);
        expect(first.url).toContain('chunk_0001.mp4'); // still requested, not dropped
        // verified duration (seconds-domain for the player) wins for the ready row
        expect(chunks.find((c) => c.index === 1)!.duration).toBe(4.2);
        expect(metadata.uploaded_count).toBe(2);
    });

    it('timeline (VOD seek): confirmed-prefix timeline_start_ms is monotonic and measured-duration derived', () => {
        // VOD seek correctness: timeline positions are computed from MEASURED
        // (verified) durations over the confirmed (ready) prefix only, in ms.
        const proxyEntries = [proxy(0, 1), proxy(1, 2), proxy(2, 3)];
        const indexRows = [row(1, 'ready', { duration_ms: 5000 }), row(2, 'ready', { duration_ms: 7000 }), row(3, 'ready', { duration_ms: 6000 })];
        const { chunks, metadata } = mergePlaylistWithIndex(proxyEntries, indexRows, BASE, false);
        expect(chunks[0].timeline_start_ms).toBe(0);
        expect(chunks[1].timeline_start_ms).toBe(5000);
        expect(chunks[2].timeline_start_ms).toBe(12000);
        expect(metadata.total_ready_ms).toBe(18000);
        // An unconfirmed tail does not advance the confirmed timeline.
        const mixed = mergePlaylistWithIndex(
            [proxy(0, 1), proxy(1, 2)],
            [row(1, 'ready', { duration_ms: 5000 }), row(2, 'uploaded', { declared_duration_ms: 9999 })],
            BASE, false,
        );
        expect(mixed.metadata.total_ready_ms).toBe(5000); // uploaded 9999ms NOT counted
    });

    it('finalized marker: a recorded end surfaces finalized=true to the player', () => {
        const indexRows = [row(1, 'ready', { duration_ms: 5000 })];
        const { metadata } = mergePlaylistWithIndex([proxy(0, 1)], indexRows, BASE, true);
        expect(metadata.finalized).toBe(true);
    });
});
