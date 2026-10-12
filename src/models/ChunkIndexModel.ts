/**
 * @file src/models/ChunkIndexModel.ts
 * @description D1 chunk metadata authority — R4-CHUNK-INDEX-1 (row 27), 15 §3.
 * @module models/ChunkIndexModel
 *
 * The platform (D1), not the external playlist.php/metadata.json, is the
 * source of truth for recording order, readiness, timing and finalization.
 * Video bytes NEVER enter D1 — only locators (object_path) plus facts.
 *
 * Authoritative metadata per chunk: competition, generation (lease lineage),
 * sequence (1-based uploader chunk_number), immutable object identity
 * (object_path, never rewritten), container/codec (declared), bytes,
 * VERIFIED duration_ms (trusted receipt only), timeline position (computed
 * on read from the confirmed prefix — never stored, so it cannot drift),
 * and upload/ready/failed states. Client-declared duration/size live in
 * declared_* columns and can NEVER mark a chunk ready (15 §3).
 *
 * Competition ended (competitions.status = 'completed') is DISTINCT from
 * recording finalized (recording_finals row): the marker records what
 * existed at end — it never blocks cutoff/payouts and never deletes.
 *
 * Writers in THIS unit: none over HTTP (no new upload route — SAFE28 owns
 * receipts). recordChunk enforces the host-only + live guards itself so a
 * future route cannot mis-wire them; confirmChunk is the receipt interface
 * SAFE28 will call (source-labelled, never client-callable directly).
 *
 * Portable-SQL discipline (future MySQL moves in its own UNIT): standard
 * types, positional binds, no datetime('now')/RETURNING — timestamps come
 * from nowIso() bound as TEXT. MySQL field mapping: INTEGER→INT (PKs gain
 * AUTO_INCREMENT there), TEXT→TEXT, INTEGER→INT, CHECK→enforced identically
 * on MySQL 8; UNIQUE/INDEX/FK translate 1:1.
 */

import { D1Database } from '@cloudflare/workers-types';
import { BaseModel } from './base/BaseModel';

export type ChunkState = 'uploaded' | 'ready' | 'failed';

export interface RecordingChunk {
    readonly id: number;
    competition_id: number;
    generation: number;
    sequence: number;
    object_path: string;
    object_hash: string | null;
    container: 'mp4' | 'webm';
    codec_video: string | null;
    codec_audio: string | null;
    bytes: number | null;
    declared_duration_ms: number | null;
    duration_ms: number | null;
    state: ChunkState;
    created_at: string;
    updated_at: string;
}

export interface FinalMarker {
    competition_id: number;
    finalized_at: string;
    uploaded_count: number;
    ready_count: number;
    total_ready_ms: number;
    marker_generation: number | null;
}

export interface RecordChunkInput {
    sequence: number;
    generation?: number;
    object_path: string;
    object_hash?: string | null;
    container: 'mp4' | 'webm';
    codec_video?: string | null;
    codec_audio?: string | null;
    bytes?: number | null;
    /** Client claim — stored as declared ONLY, never marks ready. */
    declared_duration_ms?: number | null;
}

/** Trusted measurement (a future SAFE28 receipt, never a client claim). */
export interface ChunkReceipt {
    duration_ms: number;
    bytes?: number | null;
    object_hash?: string | null;
}

/**
 * R4-CHUNK-UPLOAD-SAFE-1: sanity ceiling for sequence numbers. Realistic
 * traffic stays far below (2h at one chunk per 5s = 1440); an absurd value
 * is a client or corruption bug, rejected loudly instead of opening a
 * billion-row gap scan.
 */
export const MAX_SEQUENCE = 1000000;

/** Gap scans above this many slots report truncated (bounded iteration). */
export const MAX_GAP_SCAN = 10000;

/**
 * ROW28.1 / R4-RELEASE-RECOVERY-C: sanity ceiling for a VERIFIED chunk
 * duration (ms). The trusted source is the HMAC-authenticated upload-host
 * receipt — never client-declared duration. Realistic segments are ~5–30s;
 * 10 minutes per chunk is already absurd for a single recorder segment.
 * confirmReceipt/confirmChunk reject a receipt duration above this bound
 * (fail-closed) so a corrupt or spoofed-but-signed oversized value cannot
 * silently poison the timeline (cursor += duration_ms on read).
 */
export const MAX_DURATION_MS = 600000;

export interface TimelineEntry {
    sequence: number;
    duration_ms: number;
    timeline_start_ms: number;
    state: ChunkState;
    object_path: string;
}

/** ISO-8601 UTC clock bound as TEXT (portable — no datetime('now')). */
export function nowIso(): string {
    return new Date().toISOString();
}

function asInt(v: unknown): number | null {
    return typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : null;
}

export class ChunkIndexModel extends BaseModel<RecordingChunk> {
    protected readonly tableName = 'recording_chunks';

    constructor(db: D1Database) {
        super(db);
    }

    /** Required by BaseModel (use recordChunk — guarded + idempotent). */
    async create(data: Partial<RecordingChunk>): Promise<RecordingChunk> {
        throw new Error('Use recordChunk() for chunk metadata');
    }

    /** Required by BaseModel (state moves via confirmChunk/failChunk). */
    async update(id: number, _data: Partial<RecordingChunk>): Promise<RecordingChunk | null> {
        return this.findById(id);
    }

    private row(mapped: Record<string, unknown>): RecordingChunk {
        return {
            id: mapped['id'] as number,
            competition_id: mapped['competition_id'] as number,
            generation: mapped['generation'] as number,
            sequence: mapped['sequence'] as number,
            object_path: mapped['object_path'] as string,
            object_hash: (mapped['object_hash'] as string | null) ?? null,
            container: mapped['container'] as 'mp4' | 'webm',
            codec_video: (mapped['codec_video'] as string | null) ?? null,
            codec_audio: (mapped['codec_audio'] as string | null) ?? null,
            bytes: asInt(mapped['bytes']),
            declared_duration_ms: asInt(mapped['declared_duration_ms']),
            duration_ms: asInt(mapped['duration_ms']),
            state: mapped['state'] as ChunkState,
            created_at: mapped['created_at'] as string,
            updated_at: mapped['updated_at'] as string,
        };
    }

    /**
     * Record one chunk slot. Guards (no HTTP in this unit — enforced here so
     * SAFE28 routes inherit them): competition exists + is live + writer is
     * its creator (host-only recording, 08). Idempotent: same sequence with
     * identical (object_path, bytes) returns the existing row; different
     * bytes for the same sequence is a CONFLICT (never overwrites).
     */
    async recordChunk(competitionId: number, input: RecordChunkInput, writerUserId: number): Promise<RecordingChunk> {
        const seq = asInt(input.sequence);
        if (!seq || seq < 1 || seq > MAX_SEQUENCE) {
            throw Object.assign(new Error('BAD_INPUT: sequence must be a positive integer within bounds'), { code: 'BAD_INPUT' });
        }
        if (!input.object_path || typeof input.object_path !== 'string') {
            throw Object.assign(new Error('BAD_INPUT: object_path is required'), { code: 'BAD_INPUT' });
        }
        if (input.container !== 'mp4' && input.container !== 'webm') {
            throw Object.assign(new Error('BAD_INPUT: container must be mp4 or webm'), { code: 'BAD_INPUT' });
        }
        if (input.declared_duration_ms !== undefined && input.declared_duration_ms !== null
            && (!(typeof input.declared_duration_ms === 'number') || !Number.isFinite(input.declared_duration_ms) || input.declared_duration_ms < 0)) {
            throw Object.assign(new Error('BAD_INPUT: declared_duration_ms must be a non-negative number'), { code: 'BAD_INPUT' });
        }
        const comp = await this.db.prepare(
            'SELECT id, creator_id, status FROM competitions WHERE id = ?'
        ).bind(competitionId).first<{ id: number; creator_id: number; status: string } | null>();
        if (!comp) {
            throw Object.assign(new Error('NO_COMPETITION'), { code: 'NO_COMPETITION' });
        }
        if (comp.status !== 'live') {
            throw Object.assign(new Error('NOT_LIVE'), { code: 'NOT_LIVE' });
        }
        if (comp.creator_id !== writerUserId) {
            throw Object.assign(new Error('FORBIDDEN: only the host records'), { code: 'FORBIDDEN' });
        }

        const existing = await this.db.prepare(
            `SELECT * FROM ${this.tableName} WHERE competition_id = ? AND sequence = ?`
        ).bind(competitionId, seq).first<Record<string, unknown> | null>();
        if (existing) {
            const row = this.row(existing);
            const samePath = row.object_path === input.object_path;
            const sameBytes = (row.bytes ?? null) === (asInt(input.bytes) ?? null);
            if (samePath && sameBytes) return row; // idempotent retry
            throw Object.assign(
                new Error(`CONFLICT: sequence ${seq} already recorded with different bytes`),
                { code: 'CONFLICT', existing: row }
            );
        }

        const now = nowIso();
        try {
            await this.db.prepare(
                `INSERT INTO ${this.tableName}
                 (competition_id, generation, sequence, object_path, object_hash,
                  container, codec_video, codec_audio, bytes, declared_duration_ms,
                  duration_ms, state, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'uploaded', ?, ?)`
            ).bind(
                competitionId,
                asInt(input.generation) ?? 1,
                seq,
                input.object_path,
                input.object_hash ?? null,
                input.container,
                input.codec_video ?? null,
                input.codec_audio ?? null,
                asInt(input.bytes),
                asInt(input.declared_duration_ms),
                now, now
            ).run();
        } catch (error: unknown) {
            // Lost an insert race on UNIQUE(competition_id, sequence):
            // normalize to the same outcome as the pre-check path instead
            // of leaking a raw D1 constraint error (row 28 scope 9).
            const raced = await this.db.prepare(
                `SELECT * FROM ${this.tableName} WHERE competition_id = ? AND sequence = ?`
            ).bind(competitionId, seq).first<Record<string, unknown> | null>();
            if (!raced) throw error;
            const winner = this.row(raced);
            const samePath = winner.object_path === input.object_path;
            const sameBytes = (winner.bytes ?? null) === (asInt(input.bytes) ?? null);
            if (samePath && sameBytes) return winner;
            throw Object.assign(
                new Error(`CONFLICT: sequence ${seq} already recorded with different bytes`),
                { code: 'CONFLICT', existing: winner }
            );
        }
        const created = await this.db.prepare(
            `SELECT * FROM ${this.tableName} WHERE competition_id = ? AND sequence = ?`
        ).bind(competitionId, seq).first<Record<string, unknown> | null>();
        if (!created) throw new Error('Chunk record lost after insert');
        return this.row(created);
    }

    /**
     * R4-CHUNK-UPLOAD-SAFE-1 receipt interface: create-or-confirm from
     * SERVER-measured facts (upload host receipt — never client data).
     *  - no row + measured duration → INSERT ready (measured = verified);
     *  - no row without duration → INSERT uploaded (facts kept, never ready);
     *  - uploaded row + duration → confirm (same rules as confirmChunk);
     *  - uploaded row without duration → facts noted, stays uploaded;
     *  - ready row → idempotent same-identity, CONFLICT on divergent bytes;
     *  - failed row → FINAL. Never overwrites, never invents.
     */
    async confirmReceipt(
        competitionId: number, sequence: number,
        facts: { bytes?: number | null; object_hash?: string | null; duration_ms?: number | null }
    ): Promise<RecordingChunk> {
        const seq = asInt(sequence);
        if (!seq || seq < 1 || seq > MAX_SEQUENCE) {
            throw Object.assign(new Error('BAD_INPUT: sequence out of bounds'), { code: 'BAD_INPUT' });
        }
        const dur = asInt(facts.duration_ms);
        if (dur !== null && dur <= 0) {
            throw Object.assign(new Error('BAD_INPUT: verified duration_ms must be positive'), { code: 'BAD_INPUT' });
        }
        if (dur !== null && dur > MAX_DURATION_MS) {
            throw Object.assign(new Error(`BAD_INPUT: verified duration_ms exceeds sanity ceiling (${MAX_DURATION_MS}ms)`), { code: 'BAD_INPUT' });
        }
        const existing = await this.db.prepare(
            `SELECT * FROM ${this.tableName} WHERE competition_id = ? AND sequence = ?`
        ).bind(competitionId, seq).first<Record<string, unknown> | null>();
        if (!existing) {
            if (dur === null) {
                const now = nowIso();
                await this.db.prepare(
                    `INSERT INTO ${this.tableName}
                     (competition_id, generation, sequence, object_path, object_hash,
                      container, codec_video, codec_audio, bytes, declared_duration_ms,
                      duration_ms, state, created_at, updated_at)
                     VALUES (?, 1, ?, ?, ?, 'mp4', NULL, NULL, ?, NULL, NULL, 'uploaded', ?, ?)`
                ).bind(
                    competitionId, seq,
                    `live/match_${competitionId}/chunk_${String(seq).padStart(4, '0')}.mp4`,
                    facts.object_hash ?? null, asInt(facts.bytes), now, now
                ).run();
            } else {
                const now = nowIso();
                await this.db.prepare(
                    `INSERT INTO ${this.tableName}
                     (competition_id, generation, sequence, object_path, object_hash,
                      container, codec_video, codec_audio, bytes, declared_duration_ms,
                      duration_ms, state, created_at, updated_at)
                     VALUES (?, 1, ?, ?, ?, 'mp4', NULL, NULL, ?, NULL, ?, 'ready', ?, ?)`
                ).bind(
                    competitionId, seq,
                    `live/match_${competitionId}/chunk_${String(seq).padStart(4, '0')}.mp4`,
                    facts.object_hash ?? null, asInt(facts.bytes), dur, now, now
                ).run();
            }
            const created = await this.db.prepare(
                `SELECT * FROM ${this.tableName} WHERE competition_id = ? AND sequence = ?`
            ).bind(competitionId, seq).first<Record<string, unknown> | null>();
            if (!created) throw new Error('Chunk record lost after receipt insert');
            return this.row(created);
        }
        const row = this.row(existing);
        if (row.state === 'failed') {
            throw Object.assign(new Error('FINAL: failed chunks stay failed'), { code: 'FINAL' });
        }
        // Identity check: NULL means "unknown" (compatible), never a fact.
        // Conflict ONLY when both sides know and disagree — never overwrite.
        const factBytes = asInt(facts.bytes);
        const factHash = facts.object_hash ?? null;
        const clash = (row.bytes ?? null) !== null && factBytes !== null && row.bytes !== factBytes
            || (row.object_hash ?? null) !== null && factHash !== null && row.object_hash !== factHash;
        if (row.state === 'ready') {
            if ((dur !== null && dur !== row.duration_ms) || clash) {
                throw Object.assign(new Error('CONFLICT: receipt disagrees with confirmed facts'), { code: 'CONFLICT', existing: row });
            }
            return row;
        }
        if (clash) {
            throw Object.assign(new Error('CONFLICT: receipt disagrees with recorded facts'), { code: 'CONFLICT', existing: row });
        }
        // Uploaded row: note facts; confirm only with a measured duration.
        await this.db.prepare(
            `UPDATE ${this.tableName}
             SET bytes = COALESCE(?, bytes),
                 object_hash = COALESCE(?, object_hash),
                 updated_at = ?
             WHERE competition_id = ? AND sequence = ?`
        ).bind(asInt(facts.bytes), facts.object_hash ?? null, nowIso(), competitionId, seq).run();
        if (dur === null) {
            const noted = await this.db.prepare(
                `SELECT * FROM ${this.tableName} WHERE competition_id = ? AND sequence = ?`
            ).bind(competitionId, seq).first<Record<string, unknown> | null>();
            return this.row(noted!);
        }
        return this.confirmChunk(competitionId, seq, {
            duration_ms: dur,
            bytes: asInt(facts.bytes),
            object_hash: facts.object_hash ?? null,
        });
    }

    /**
     * Receipt interface for SAFE28 (trusted measurer — storage proof +
     * measured duration). Transitions uploaded → ready exactly once; a
     * ready row stays ready (idempotent); a failed row is terminal (FINAL).
     * Client data can never reach this path in INDEX (no route calls it).
     */
    async confirmChunk(
        competitionId: number, sequence: number,
        receipt: ChunkReceipt, _source: 'receipt' = 'receipt'
    ): Promise<RecordingChunk> {
        const dur = asInt(receipt.duration_ms);
        if (!dur || dur <= 0) {
            throw Object.assign(new Error('BAD_INPUT: verified duration_ms must be positive'), { code: 'BAD_INPUT' });
        }
        if (dur > MAX_DURATION_MS) {
            throw Object.assign(new Error(`BAD_INPUT: verified duration_ms exceeds sanity ceiling (${MAX_DURATION_MS}ms)`), { code: 'BAD_INPUT' });
        }
        const existing = await this.db.prepare(
            `SELECT * FROM ${this.tableName} WHERE competition_id = ? AND sequence = ?`
        ).bind(competitionId, sequence).first<Record<string, unknown> | null>();
        if (!existing) {
            throw Object.assign(new Error('NOT_FOUND: no such chunk slot'), { code: 'NOT_FOUND' });
        }
        const row = this.row(existing);
        if (row.state === 'failed') {
            throw Object.assign(new Error('FINAL: failed chunks stay failed'), { code: 'FINAL' });
        }
        if (row.state === 'ready') return row; // idempotent
        await this.db.prepare(
            `UPDATE ${this.tableName}
             SET state = 'ready', duration_ms = ?,
                 bytes = COALESCE(?, bytes),
                 object_hash = COALESCE(?, object_hash),
                 updated_at = ?
             WHERE competition_id = ? AND sequence = ? AND state = 'uploaded'`
        ).bind(dur, asInt(receipt.bytes), receipt.object_hash ?? null, nowIso(), competitionId, sequence).run();
        const updated = await this.db.prepare(
            `SELECT * FROM ${this.tableName} WHERE competition_id = ? AND sequence = ?`
        ).bind(competitionId, sequence).first<Record<string, unknown> | null>();
        if (!updated) throw new Error('Chunk record lost after confirm');
        return this.row(updated);
    }

    /** Terminal failure for one slot (keeps locator + declared facts). */
    async failChunk(competitionId: number, sequence: number): Promise<RecordingChunk> {
        await this.db.prepare(
            `UPDATE ${this.tableName}
             SET state = 'failed', updated_at = ?
             WHERE competition_id = ? AND sequence = ? AND state = 'uploaded'`
        ).bind(nowIso(), competitionId, sequence).run();
        const row = await this.db.prepare(
            `SELECT * FROM ${this.tableName} WHERE competition_id = ? AND sequence = ?`
        ).bind(competitionId, sequence).first<Record<string, unknown> | null>();
        if (!row) {
            throw Object.assign(new Error('NOT_FOUND: no such chunk slot'), { code: 'NOT_FOUND' });
        }
        return this.row(row);
    }

    /** Ordered read (bounded LIMIT — callers page via limit/offset). */
    async listOrdered(
        competitionId: number,
        opts?: { states?: ChunkState[]; limit?: number; offset?: number }
    ): Promise<RecordingChunk[]> {
        const limit = Math.min(Math.max(asInt(opts?.limit) ?? 500, 1), 2000);
        const offset = Math.max(asInt(opts?.offset) ?? 0, 0);
        const states = (opts?.states ?? []).filter((s) => s === 'uploaded' || s === 'ready' || s === 'failed');
        let sql = `SELECT * FROM ${this.tableName} WHERE competition_id = ?`;
        const binds: unknown[] = [competitionId];
        if (states.length > 0) {
            sql += ` AND state IN (${states.map(() => '?').join(',')})`;
            binds.push(...states);
        }
        sql += ' ORDER BY sequence ASC LIMIT ? OFFSET ?';
        binds.push(limit, offset);
        const res = await this.db.prepare(sql).bind(...binds).all<Record<string, unknown>>();
        return (res.results || []).map((r) => this.row(r));
    }

    /** Bounded range read (both bounds required — never a full scan). */
    async listRange(competitionId: number, fromSequence: number, toSequence: number): Promise<RecordingChunk[]> {
        const from = asInt(fromSequence);
        const to = asInt(toSequence);
        if (!from || !to || from < 1 || to < from) {
            throw Object.assign(new Error('BAD_INPUT: range needs 1 <= from <= to'), { code: 'BAD_INPUT' });
        }
        const res = await this.db.prepare(
            `SELECT * FROM ${this.tableName}
             WHERE competition_id = ? AND sequence >= ? AND sequence <= ?
             ORDER BY sequence ASC`
        ).bind(competitionId, from, to).all<Record<string, unknown>>();
        return (res.results || []).map((r) => this.row(r));
    }

    /** Incremental continuation for live-edge polling (cursor = afterSeq). */
    async continuation(competitionId: number, afterSequence: number, limit = 50): Promise<RecordingChunk[]> {
        const after = Math.max(asInt(afterSequence) ?? 0, 0);
        const lim = Math.min(Math.max(asInt(limit) ?? 50, 1), 500);
        const res = await this.db.prepare(
            `SELECT * FROM ${this.tableName}
             WHERE competition_id = ? AND sequence > ?
             ORDER BY sequence ASC LIMIT ?`
        ).bind(competitionId, after, lim).all<Record<string, unknown>>();
        return (res.results || []).map((r) => this.row(r));
    }

    /** Highest recorded sequence (0 when empty) — resume base for uploaders. */
    async resumeBase(competitionId: number): Promise<number> {
        const row = await this.db.prepare(
            `SELECT MAX(sequence) AS top FROM ${this.tableName} WHERE competition_id = ?`
        ).bind(competitionId).first<{ top: number | null } | null>();
        return row?.top ?? 0;
    }

    /** Present sequences only (single narrow column — gap math runs in JS). */
    async sequences(competitionId: number): Promise<number[]> {
        const res = await this.db.prepare(
            `SELECT sequence FROM ${this.tableName} WHERE competition_id = ? ORDER BY sequence ASC`
        ).bind(competitionId).all<{ sequence: number }>();
        return (res.results || []).map((r) => r.sequence);
    }

    /** Documented gaps in 1..max (a host gap stays a gap — never invented). */
    async detectGaps(competitionId: number): Promise<{ max: number; missing: number[]; truncated: boolean }> {
        const present = await this.sequences(competitionId);
        if (present.length === 0) return { max: 0, missing: [], truncated: false };
        const have = new Set(present);
        const max = present[present.length - 1];
        // Bounded iteration (row 28 scope 9): absurd maxima (corrupt or
        // hostile sequence numbers) report truncated instead of scanning
        // billions of slots. Realistic traffic (2h at 5s/chunk = 1440)
        // never approaches the bound.
        const ceiling = Math.min(max, MAX_GAP_SCAN);
        const missing: number[] = [];
        for (let n = 1; n <= ceiling; n++) {
            if (!have.has(n)) missing.push(n);
        }
        return { max, missing, truncated: max > MAX_GAP_SCAN };
    }

    /**
     * The single timing reference: confirmed-ready prefix only, timeline
     * positions computed on read (no stored drift). Unconfirmed tails and
     * gaps contribute no duration — comments/video_offset and seek map onto
     * this timeline, never onto guesses.
     */
    async timeline(competitionId: number): Promise<{ entries: TimelineEntry[]; total_ready_ms: number; ready_count: number }> {
        const rows = await this.listOrdered(competitionId, { states: ['ready'], limit: 2000 });
        const entries: TimelineEntry[] = [];
        let cursor = 0;
        for (const row of rows) {
            const dur = row.duration_ms ?? 0;
            entries.push({
                sequence: row.sequence,
                duration_ms: dur,
                timeline_start_ms: cursor,
                state: row.state,
                object_path: row.object_path,
            });
            cursor += dur;
        }
        return { entries, total_ready_ms: cursor, ready_count: entries.length };
    }

    /**
     * time → {sequence, offset_ms} on the confirmed timeline. Returns null
     * past the end or when nothing is confirmed (never invents a chunk).
     */
    async timeLookup(competitionId: number, timeMs: number): Promise<{ sequence: number; offset_ms: number } | null> {
        const t = asInt(timeMs);
        if (t === null || t < 0) return null;
        const { entries } = await this.timeline(competitionId);
        for (const e of entries) {
            if (t < e.timeline_start_ms + e.duration_ms) {
                return { sequence: e.sequence, offset_ms: t - e.timeline_start_ms };
            }
        }
        return null;
    }

    /**
     * Final marker: snapshots index state at competition end. Idempotent
     * (one row per competition — repeats return the existing marker).
     * Ended ≠ finalized: callers combine this with competitions.status.
     */
    async getFinalMarker(competitionId: number): Promise<FinalMarker | null> {
        return this.db.prepare(
            'SELECT * FROM recording_finals WHERE competition_id = ?'
        ).bind(competitionId).first<FinalMarker | null>();
    }

    /**
     * Write the final marker (snapshot of index state at competition end).
     * Best-effort and idempotent — end/cron callers must never fail their
     * transition when marking fails. Repeats return the existing marker.
     */
    async recordFinalMarker(competitionId: number, markerGeneration?: number): Promise<FinalMarker> {
        const existing = await this.db.prepare(
            'SELECT * FROM recording_finals WHERE competition_id = ?'
        ).bind(competitionId).first<FinalMarker | null>();
        if (existing) return existing;
        const counts = await this.db.prepare(
            `SELECT
                 SUM(CASE WHEN state = 'uploaded' OR state = 'ready' THEN 1 ELSE 0 END) AS uploaded_count,
                 SUM(CASE WHEN state = 'ready' THEN 1 ELSE 0 END) AS ready_count,
                 COALESCE(SUM(CASE WHEN state = 'ready' THEN duration_ms ELSE 0 END), 0) AS total_ready_ms
             FROM ${this.tableName} WHERE competition_id = ?`
        ).bind(competitionId).first<{ uploaded_count: number | null; ready_count: number | null; total_ready_ms: number | null } | null>();
        const now = nowIso();
        try {
            await this.db.prepare(
                `INSERT INTO recording_finals
                 (competition_id, finalized_at, uploaded_count, ready_count, total_ready_ms, marker_generation)
                 VALUES (?, ?, ?, ?, ?, ?)`
            ).bind(
                competitionId, now,
                counts?.uploaded_count ?? 0, counts?.ready_count ?? 0, counts?.total_ready_ms ?? 0,
                asInt(markerGeneration)
            ).run();
        } catch {
            // Lost a marker race — the winner's row is the truth.
        }
        const marker = await this.db.prepare(
            'SELECT * FROM recording_finals WHERE competition_id = ?'
        ).bind(competitionId).first<FinalMarker | null>();
        if (!marker) throw new Error('Final marker lost after insert');
        return marker;
    }

    /** Ended (lifecycle) vs finalized (index) + counts + gaps in one call. */
    async recordingStatus(competitionId: number): Promise<{
        ended: boolean; finalized: boolean;
        uploaded: number; ready: number; failed: number;
        gaps: number[]; total_ready_ms: number;
    }> {
        const comp = await this.db.prepare(
            'SELECT status FROM competitions WHERE id = ?'
        ).bind(competitionId).first<{ status: string } | null>();
        const counts = await this.db.prepare(
            `SELECT
                 SUM(CASE WHEN state = 'uploaded' OR state = 'ready' THEN 1 ELSE 0 END) AS uploaded,
                 SUM(CASE WHEN state = 'ready' THEN 1 ELSE 0 END) AS ready,
                 SUM(CASE WHEN state = 'failed' THEN 1 ELSE 0 END) AS failed,
                 COALESCE(SUM(CASE WHEN state = 'ready' THEN duration_ms ELSE 0 END), 0) AS total_ready_ms
             FROM ${this.tableName} WHERE competition_id = ?`
        ).bind(competitionId).first<{ uploaded: number | null; ready: number | null; failed: number | null; total_ready_ms: number | null } | null>();
        const marker = await this.db.prepare(
            'SELECT competition_id FROM recording_finals WHERE competition_id = ?'
        ).bind(competitionId).first<{ competition_id: number } | null>();
        const { missing } = await this.detectGaps(competitionId);
        return {
            ended: comp?.status === 'completed',
            finalized: !!marker,
            uploaded: counts?.uploaded ?? 0,
            ready: counts?.ready ?? 0,
            failed: counts?.failed ?? 0,
            gaps: missing,
            total_ready_ms: counts?.total_ready_ms ?? 0,
        };
    }

    /**
     * Read-only legacy mapping for the future backfill runbook (SAFE28):
     * proxy-shaped entries → uploaded rows with declared facts ONLY (never
     * ready). Sequence comes from the stored filename number (chunk_NNNN);
     * entries without one are skipped (never guessed). NOT wired to any
     * route in INDEX.
     */
    async importFromPlaylist(
        competitionId: number, entries: Array<Record<string, unknown>>, writerUserId: number
    ): Promise<{ imported: number; skipped: number }> {
        let imported = 0;
        let skipped = 0;
        for (const entry of entries) {
            const url = typeof entry['url'] === 'string' ? entry['url'] as string
                : typeof entry['file'] === 'string' ? entry['file'] as string : '';
            const file = url.match(/(chunk_\d+\.(mp4|webm))/i);
            if (!file) { skipped++; continue; }
            const num = file[1].match(/chunk_(\d+)/i);
            const sequence = num ? parseInt(num[1], 10) : NaN;
            if (!Number.isFinite(sequence) || sequence < 1) { skipped++; continue; }
            const container = file[2].toLowerCase() === 'mp4' ? 'mp4' : 'webm';
            const duration = entry['duration'];
            const size = (entry['size'] ?? entry['filesize']);
            try {
                await this.recordChunk(competitionId, {
                    sequence,
                    object_path: `live/match_${competitionId}/${file[1]}`,
                    container: container as 'mp4' | 'webm',
                    bytes: typeof size === 'number' && Number.isFinite(size) ? Math.floor(size) : null,
                    declared_duration_ms: typeof duration === 'number' && Number.isFinite(duration)
                        ? Math.floor(duration * 1000) : null,
                }, writerUserId);
                imported++;
            } catch {
                skipped++;
            }
        }
        return { imported, skipped };
    }
}

export default ChunkIndexModel;
