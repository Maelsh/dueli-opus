/**
 * @file src/lib/services/ChunkIndexPlaylist.ts
 * @description Merge the external proxy playlist with D1 index authority —
 *              R4-CHUNK-INDEX-1 (row 27), 15 §3.
 * @module lib/services/ChunkIndexPlaylist
 *
 * Pure response shaping (no SQL, no fetch): the route supplies proxy entries
 * (today's normalized shape) plus D1 rows, this returns the served playlist.
 *
 * Rules:
 *  - D1 rows are the authority for ORDER and READINESS; the proxy stays the
 *    bytes locator for legacy chunks with no D1 row (never erased).
 *  - Proxy index convention is 0-based (first chunk = index 0); D1 sequence
 *    is the 1-based uploader chunk_number. Matching is by stored filename
 *    number (chunk_NNNN) only — entries without one stay legacy-unannotated
 *    (never guessed).
 *  - Verified D1 durations (ready rows) override proxy claims; unconfirmed
 *    rows keep proxy durations as fallback.
 *  - D1 rows with no proxy match are APPENDED as built entries (authority
 *    wins over a dead/empty proxy — e.g. the known-empty playlist.php).
 *  - Additive fields only (`ready`, `timeline_start_ms`, `index_source`,
 *    `index_metadata`); legacy responses without D1 rows are byte-identical
 *    to the pre-INDEX shape.
 */

import type { RecordingChunk } from '../../models/ChunkIndexModel';

export interface ProxyChunk {
    index: number;
    url: string;
    duration?: number;
    size?: number;
}

export interface ServedChunk extends ProxyChunk {
    ready?: boolean;
    timeline_start_ms?: number;
}

export interface IndexMetadata {
    ready_count: number;
    uploaded_count: number;
    gaps: number[];
    total_ready_ms: number;
    finalized: boolean;
}

/**
 * R4-CHUNK-PLAYER-UX-1 (REMOTE F2): normalize an entry to its D1 sequence.
 * Explicit uploader numbering (`chunk_number`, 1-based) wins — both the
 * production and the test-path uploaders agree on it. Otherwise the stored
 * filename decides, with the established zero-based test-path first chunk
 * (`chunk_0000`, which uploader numbering calls 1) folding to sequence 1
 * (production never emits 0: recordChunk requires >= 1, so the fold is
 * collision-free). Anything else is unmatchable (never guessed).
 */
export function matchSequence(entry: { index?: unknown; chunk_number?: unknown; chunkNumber?: unknown }, url: string): number | null {
    for (const key of ['chunk_number', 'chunkNumber'] as const) {
        const v = entry[key];
        if (typeof v === 'number' && Number.isFinite(v) && v >= 1) return Math.floor(v);
    }
    const m = url.match(/chunk_(\d+)/i);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    if (!Number.isFinite(n) || n < 0) return null;
    return n === 0 ? 1 : n;
}

function streamUrlFor(base: string, objectPath: string): string {
    const p = objectPath.trim();
    if (/^https?:\/\//i.test(p)) return p;
    const cleanBase = base.replace(/\/+$/, '');
    const cleanPath = p.replace(/^\/+/, '');
    return `${cleanBase}/stream.php?path=${cleanPath}`;
}

function containerOf(objectPath: string, fallback: string | null): string | null {
    const m = objectPath.match(/\.(mp4|webm)(?=[?#]|$)/i);
    if (m) return m[1].toLowerCase();
    return fallback;
}

/**
 * Merge proxy entries with D1 rows. Returns served entries (index-sorted)
 * plus metadata. Pure — fully unit-testable without DB or network.
 */
export function mergePlaylistWithIndex(
    proxy: ProxyChunk[],
    indexRows: RecordingChunk[],
    base: string,
    finalized: boolean
): { chunks: ServedChunk[]; metadata: IndexMetadata } {
    const bySequence = new Map<number, RecordingChunk>();
    for (const row of indexRows) {
        if (!bySequence.has(row.sequence)) bySequence.set(row.sequence, row);
    }

    const gaps: number[] = [];
    if (indexRows.length > 0) {
        const seqs = [...bySequence.keys()].sort((a, b) => a - b);
        const have = new Set(seqs);
        for (let n = 1; n <= seqs[seqs.length - 1]; n++) {
            if (!have.has(n)) gaps.push(n);
        }
    }

    // Confirmed timeline (ready rows only, sequence order).
    const readyRows = [...bySequence.values()]
        .filter((r) => r.state === 'ready')
        .sort((a, b) => a.sequence - b.sequence);
    const timelineStart = new Map<number, number>();
    let cursor = 0;
    for (const r of readyRows) {
        timelineStart.set(r.sequence, cursor);
        cursor += r.duration_ms ?? 0;
    }
    let uploadedCount = 0;
    for (const r of bySequence.values()) {
        if (r.state === 'uploaded' || r.state === 'ready') uploadedCount++;
    }

    const served: ServedChunk[] = [];
    const consumed = new Set<number>();
    // R4-CHUNK-PLAYER-UX-1 (REMOTE F1): failed slots are terminal — their
    // proxy entries are suppressed (not merely annotated), because players
    // play every returned entry and one failed chunk stalls the stream.
    const failed = new Set<number>();
    for (const row of indexRows) {
        if (row.state === 'failed') failed.add(row.sequence);
    }
    for (const entry of proxy) {
        const seq = matchSequence(
            entry as { index?: unknown; chunk_number?: unknown; chunkNumber?: unknown },
            entry.url
        );
        if (seq !== null && failed.has(seq)) continue; // failed: suppressed
        const out: ServedChunk = { index: entry.index, url: entry.url };
        if (entry.duration !== undefined) out.duration = entry.duration;
        if (entry.size !== undefined) out.size = entry.size;
        const row = seq !== null ? bySequence.get(seq) : undefined;
        if (row) {
            consumed.add(row.sequence);
            out.ready = row.state === 'ready';
            if (row.state === 'ready') {
                if (row.duration_ms !== null && row.duration_ms > 0) {
                    out.duration = row.duration_ms / 1000; // verified truth wins
                }
                const start = timelineStart.get(row.sequence);
                if (start !== undefined) out.timeline_start_ms = start;
            }
        }
        served.push(out);
    }

    // Authority rows with no proxy match: append built entries (ordered).
    // Failed rows stay suppressed here too (terminal — never resurrected).
    const orphans = [...bySequence.values()]
        .filter((r) => !consumed.has(r.sequence) && r.state !== 'failed')
        .sort((a, b) => a.sequence - b.sequence);
    for (const row of orphans) {
        const out: ServedChunk = {
            index: row.sequence - 1, // proxy convention: first chunk = 0
            url: streamUrlFor(base, row.object_path),
        };
        if (row.bytes !== null && row.bytes !== undefined) out.size = row.bytes;
        out.ready = row.state === 'ready';
        if (row.state === 'ready') {
            if (row.duration_ms !== null && row.duration_ms > 0) {
                out.duration = row.duration_ms / 1000;
            }
            const start = timelineStart.get(row.sequence);
            if (start !== undefined) out.timeline_start_ms = start;
        } else if (row.declared_duration_ms !== null && row.declared_duration_ms !== undefined) {
            out.duration = row.declared_duration_ms / 1000;
        }
        served.push(out);
    }
    served.sort((a, b) => a.index - b.index);

    return {
        chunks: served,
        metadata: {
            ready_count: readyRows.length,
            uploaded_count: uploadedCount,
            gaps,
            total_ready_ms: cursor,
            finalized,
        },
    };
}

export default mergePlaylistWithIndex;
