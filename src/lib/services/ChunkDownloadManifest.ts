/**
 * @file src/lib/services/ChunkDownloadManifest.ts
 * @description R4-CHUNK-DOWNLOAD-1: authoritative, rights-aware manifest for a
 *              complete independent recording download.
 * @module lib/services/ChunkDownloadManifest
 *
 * Pure response shaping (no SQL, no fetch, no DOM): the route supplies the
 * competition row, the D1 chunk rows and the final marker; this module decides
 * role, order, timeline, completeness and the download mode.
 *
 * Contract:
 *  - Every authenticated user may download (creator/opponent/viewer); the
 *    rights notice differs. Guests are rejected by the route, never here.
 *  - Only `ready` rows are downloadable chunks. `uploaded` (unverified) and
 *    `failed` rows are reported as blockers, never silently omitted.
 *  - `complete` is true ONLY for a finalized recording whose sequence is
 *    contiguous 1..max and every slot is ready. A partial recording is
 *    reported as partial (its available ready chunks stay downloadable as a
 *    clearly labelled clip).
 *  - Timeline positions are the same confirmed-prefix positions the player
 *    uses (ready rows only, sequence order). No duration is invented.
 *  - `mode` selects the client path: structural fMP4 remux (all MP4) or
 *    FFmpeg.wasm (WebM / mixed containers). Nothing here depends on
 *    SmartVodPlayer.loadedChunks.
 */

import type { FinalMarker, RecordingChunk } from '../../models/ChunkIndexModel';
import { MAX_GAP_SCAN } from '../../models/ChunkIndexModel';

export type DownloadRole = 'creator' | 'opponent' | 'viewer';
export type DownloadFormat = 'mp4' | 'webm' | 'mixed' | 'none';
export type DownloadMode = 'mp4-remux' | 'ffmpeg' | 'none';

export type DownloadBlockerCode =
    | 'no_chunks'
    | 'recording_not_finalized'
    | 'recording_incomplete'
    | 'unready_chunks'
    | 'failed_chunks'
    | 'duration_unknown'
    | 'unsupported_container';

export interface DownloadBlocker {
    code: DownloadBlockerCode;
    /** Sequences that caused the blocker (empty when not sequence-specific). */
    sequences: number[];
}

export interface DownloadChunk {
    sequence: number;
    url: string;
    bytes: number | null;
    duration_ms: number;
    timeline_start_ms: number;
    object_hash: string | null;
    /**
     * Only declared when the stored digest shape proves SHA-256 (64 hex).
     * A different/unknown digest is never guessed or treated as verified.
     */
    hash_algorithm: 'sha256' | null;
    container: 'mp4' | 'webm';
    codec_video: string | null;
    codec_audio: string | null;
}

export interface DownloadRights {
    can_download: true;
    /** Competitors may republish/monetize; viewers need platform permission. */
    republication: 'competitors_may_republish_and_monetize' | 'platform_permission_required';
    notice_key: 'download_ui.rights_competitor' | 'download_ui.rights_viewer';
}

export interface DownloadManifest {
    version: 1;
    competition_id: number;
    role: DownloadRole;
    rights: DownloadRights;
    status: string;
    finalized: boolean;
    finalized_at: string | null;
    complete: boolean;
    /** True when the D1 read hit its bound; completeness is never claimed. */
    truncated: boolean;
    format: DownloadFormat;
    mode: DownloadMode;
    chunks: DownloadChunk[];
    counts: {
        ready: number;
        uploaded: number;
        failed: number;
        missing: number;
        total_sequences: number;
    };
    /** Absent sequence numbers in 1..max (bounded scan). */
    gaps: number[];
    /** Uploaded but not verified/ready — cannot be in a complete file. */
    unready_sequences: number[];
    failed_sequences: number[];
    blockers: DownloadBlocker[];
    total_duration_ms: number;
    total_bytes: number;
    unknown_bytes: boolean;
    /** Deterministic filename hint; partial is marked explicitly. */
    filename_hint: string;
    generated_at: string;
}

export interface ManifestCompetition {
    id: number;
    creator_id: number;
    opponent_id: number | null;
    status: string;
}

export interface BuildManifestInput {
    competition: ManifestCompetition;
    viewerUserId: number;
    rows: RecordingChunk[];
    finalMarker: FinalMarker | null;
    baseUrl: string;
    truncated?: boolean;
    now?: Date;
}

/** Absolute or base-relative object URL (same shape the playlist serves). */
export function streamUrlFor(base: string, objectPath: string): string {
    const p = objectPath.trim();
    if (/^https?:\/\//i.test(p)) return p;
    const cleanBase = base.replace(/\/+$/, '');
    const cleanPath = p.replace(/^\/+/, '');
    return `${cleanBase}/stream.php?path=${encodeURIComponent(cleanPath).replace(/%2F/gi, '/')}`;
}

export function roleFor(competition: ManifestCompetition, userId: number): DownloadRole {
    if (competition.creator_id === userId) return 'creator';
    if (competition.opponent_id !== null && competition.opponent_id === userId) return 'opponent';
    return 'viewer';
}

export function rightsFor(role: DownloadRole): DownloadRights {
    if (role === 'creator' || role === 'opponent') {
        return {
            can_download: true,
            republication: 'competitors_may_republish_and_monetize',
            notice_key: 'download_ui.rights_competitor',
        };
    }
    return {
        can_download: true,
        republication: 'platform_permission_required',
        notice_key: 'download_ui.rights_viewer',
    };
}

function sha256Shape(value: string | null): 'sha256' | null {
    return value !== null && /^[a-f0-9]{64}$/i.test(value.trim()) ? 'sha256' : null;
}

function uniqueSorted(values: number[]): number[] {
    return [...new Set(values)].sort((a, b) => a - b);
}

/**
 * Build the manifest. Deterministic except `generated_at` (injectable clock).
 */
export function buildDownloadManifest(input: BuildManifestInput): DownloadManifest {
    const { competition, viewerUserId, rows, finalMarker, baseUrl } = input;
    const role = roleFor(competition, viewerUserId);
    const rights = rightsFor(role);

    // One row per sequence (D1 enforces UNIQUE; first wins defensively).
    const bySequence = new Map<number, RecordingChunk>();
    for (const row of rows) {
        if (!bySequence.has(row.sequence)) bySequence.set(row.sequence, row);
    }
    const ordered = [...bySequence.values()].sort((a, b) => a.sequence - b.sequence);
    const maxSequence = ordered.length > 0 ? ordered[ordered.length - 1].sequence : 0;
    const present = new Set(ordered.map((r) => r.sequence));

    const gaps: number[] = [];
    const scanCeiling = Math.min(maxSequence, MAX_GAP_SCAN);
    for (let n = 1; n <= scanCeiling; n++) {
        if (!present.has(n)) gaps.push(n);
    }
    const unreadySequences = ordered.filter((r) => r.state === 'uploaded').map((r) => r.sequence);
    const failedSequences = ordered.filter((r) => r.state === 'failed').map((r) => r.sequence);
    const allReadyRows = ordered.filter((r) => r.state === 'ready');
    const readyRows = allReadyRows.filter((r) => r.duration_ms !== null && r.duration_ms > 0);
    const unmeasuredSequences = allReadyRows
        .filter((r) => r.duration_ms === null || r.duration_ms <= 0)
        .map((r) => r.sequence);

    const chunks: DownloadChunk[] = [];
    let cursor = 0;
    for (const row of readyRows) {
        const duration = row.duration_ms ?? 0;
        chunks.push({
            sequence: row.sequence,
            url: streamUrlFor(baseUrl, row.object_path),
            bytes: row.bytes,
            duration_ms: duration,
            timeline_start_ms: cursor,
            object_hash: row.object_hash,
            hash_algorithm: sha256Shape(row.object_hash),
            container: row.container,
            codec_video: row.codec_video,
            codec_audio: row.codec_audio,
        });
        cursor += duration;
    }

    const containers = new Set(chunks.map((c) => c.container));
    const format: DownloadFormat = chunks.length === 0
        ? 'none'
        : containers.size > 1
            ? 'mixed'
            : chunks[0].container;
    const mode: DownloadMode = format === 'none'
        ? 'none'
        : format === 'mp4'
            ? 'mp4-remux'
            : 'ffmpeg';

    const gapScanTruncated = maxSequence > MAX_GAP_SCAN;
    const truncated = input.truncated === true || gapScanTruncated;
    const finalized = finalMarker !== null;
    const totalSequences = Math.max(maxSequence, ordered.length);
    const totalDuration = chunks.reduce((sum, c) => sum + c.duration_ms, 0);
    const knownBytes = chunks.reduce((sum, c) => sum + (c.bytes ?? 0), 0);
    const unknownBytes = chunks.some((c) => c.bytes === null);

    const blockers: DownloadBlocker[] = [];
    if (chunks.length === 0) blockers.push({ code: 'no_chunks', sequences: [] });
    if (!finalized) blockers.push({ code: 'recording_not_finalized', sequences: [] });
    if (gaps.length > 0) blockers.push({ code: 'recording_incomplete', sequences: gaps });
    if (unreadySequences.length > 0) blockers.push({ code: 'unready_chunks', sequences: unreadySequences });
    if (failedSequences.length > 0) blockers.push({ code: 'failed_chunks', sequences: failedSequences });
    if (unmeasuredSequences.length > 0) blockers.push({ code: 'duration_unknown', sequences: unmeasuredSequences });
    if (truncated) blockers.push({ code: 'recording_incomplete', sequences: [] });
    if (chunks.length > 0 && format === 'none') {
        blockers.push({ code: 'unsupported_container', sequences: [] });
    }

    const complete = finalized
        && !truncated
        && chunks.length > 0
        && gaps.length === 0
        && unreadySequences.length === 0
        && failedSequences.length === 0
        && unmeasuredSequences.length === 0
        && ordered.length === maxSequence
        && readyRows.length === ordered.length;

    const stamp = (input.now ?? new Date()).toISOString();
    return {
        version: 1,
        competition_id: competition.id,
        role,
        rights,
        status: competition.status,
        finalized,
        finalized_at: finalMarker ? finalMarker.finalized_at : null,
        complete,
        truncated,
        format,
        mode,
        chunks,
        counts: {
            ready: allReadyRows.length,
            uploaded: unreadySequences.length,
            failed: failedSequences.length,
            missing: Math.max(0, maxSequence - ordered.length),
            total_sequences: totalSequences,
        },
        gaps: uniqueSorted(gaps),
        unready_sequences: uniqueSorted(unreadySequences),
        failed_sequences: uniqueSorted(failedSequences),
        blockers,
        total_duration_ms: totalDuration,
        total_bytes: knownBytes,
        unknown_bytes: unknownBytes,
        filename_hint: `dueli_competition_${competition.id}${complete ? '' : '_partial'}.mp4`,
        generated_at: stamp,
    };
}

export default buildDownloadManifest;
