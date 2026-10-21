/**
 * @file src/models/RecordingLeaseModel.ts
 * @description Server-backed exclusive recorder ownership (lease/fencing)
 *              for one competition — R4-CHUNK-DOWNLOAD-1 (row 27), section D.
 * @module models/RecordingLeaseModel
 *
 * A single row per competition arbitrates which host session may record and
 * upload. Two tabs/browsers/devices of the same host run the same client
 * fence logic, but only the session whose (holder_hash, generation) matches
 * the row may proceed; every other session must stop its recorder/uploads.
 *
 * Atomicity: every state change is ONE conditional UPDATE (or an INSERT
 * guarded by a PK-conflict retry) — the database, never the client,
 * decides who wins a race. D1 executes batches serially, so a conditional
 * UPDATE that reports changes=1 is an atomic claim.
 *
 * Liveness: holders heartbeat; a row whose last_heartbeat_at is older than
 * ttl_seconds is EXPIRED and may be taken over. Expiry never ends the
 * competition and never deletes chunks — it only frees the recorder role.
 * A clean end/release marks released_at so takeover is instant.
 */

import { D1Database } from '@cloudflare/workers-types';
import { BaseModel } from './base/BaseModel';

export interface RecordingLease {
    // BaseEntity compatibility: the primary key IS the competition id
    // (one lease row per competition) — see primaryKey override below.
    readonly id: number;
    competition_id: number;
    holder_hash: string;
    generation: number;
    acquired_at: string;
    last_heartbeat_at: string;
    ttl_seconds: number;
    released_at: string | null;
}

export type LeaseAcquireResult =
    | { acquired: true; generation: number; took_over: boolean }
    | { acquired: false; reason: 'held'; generation: number; expires_in_seconds: number };

export type LeaseHeartbeatResult =
    | { held: true; generation: number }
    | {
        held: false;
        generation: number;
        expires_in_seconds: number;
        /**
         * A28-LEASE: why the beat failed. The client must not collapse these
         * into one "lost" state:
         *  - expired  → no active owner; the same holder may re-acquire;
         *  - released → clean end/handover; the authorized drain tail stays
         *               valid under the released generation;
         *  - lost     → another holder/generation owns the row (fenced).
         */
        reason: 'expired' | 'released' | 'lost';
    };

/**
 * SQLite datetime('now') yields UTC text 'YYYY-MM-DD HH:MM:SS'. Parsing it
 * with `new Date(s)` is timezone-broken (V8 reads space-separated stamps as
 * LOCAL time — correct on UTC workers, 3h off in UTC+3 test/dev machines).
 * Parse explicitly as UTC so TTL math is identical everywhere.
 */
export function parseSqliteUtc(ts: string): number {
    const s = String(ts || '').trim();
    if (!s) return NaN;
    if (s.includes('T')) {
        return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z').getTime();
    }
    return new Date(s.replace(' ', 'T') + 'Z').getTime();
}

export class RecordingLeaseModel extends BaseModel<RecordingLease> {
    protected readonly tableName = 'recording_leases';
    /** One row per competition — the competition id is the primary key. */
    protected readonly primaryKey: string = 'competition_id';

    constructor(db: D1Database) {
        super(db);
    }

    /** Required by BaseModel (leases are managed via acquire/heartbeat/release). */
    async create(data: Partial<RecordingLease>): Promise<RecordingLease> {
        throw new Error('Use acquire() for recording leases');
    }

    /** Required by BaseModel (no direct updates — see heartbeat()). */
    async update(id: number, _data: Partial<RecordingLease>): Promise<RecordingLease | null> {
        return this.findById(id);
    }

    private secondsSince(ts: string): number {
        const t = parseSqliteUtc(ts);
        if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
        return Math.max(0, Math.floor((Date.now() - t) / 1000));
    }

    private rowState(row: RecordingLease): { active: boolean; expires_in_seconds: number } {
        if (row.released_at) return { active: false, expires_in_seconds: 0 };
        const age = this.secondsSince(row.last_heartbeat_at);
        const ttl = row.ttl_seconds > 0 ? row.ttl_seconds : 45;
        if (age >= ttl) return { active: false, expires_in_seconds: 0 };
        return { active: true, expires_in_seconds: ttl - age };
    }

    async get(competitionId: number): Promise<RecordingLease | null> {
        const row = await this.db.prepare(
            `SELECT * FROM ${this.tableName} WHERE competition_id = ?`
        ).bind(competitionId).first<RecordingLease>();
        // The table's PK is competition_id — expose it as `id` so the row
        // honestly satisfies BaseEntity at runtime, not just in types.
        return row ? { ...row, id: row.competition_id } : null;
    }

    /**
     * Claim (or reaffirm) the recorder lease for a session.
     * - no row → INSERT as generation 1 (PK race: on conflict, re-read and
     *   report the winner instead of throwing);
     * - row released or expired → atomic conditional UPDATE to this holder
     *   with generation+1 (takeover);
     * - row actively held by this holder → heartbeat refresh (idempotent);
     * - row actively held by another holder → {acquired:false, reason:'held'}.
     */
    async acquire(competitionId: number, holderHash: string, ttlSeconds = 45): Promise<LeaseAcquireResult> {
        const ttl = ttlSeconds > 0 ? Math.floor(ttlSeconds) : 45;
        const existing = await this.get(competitionId);

        if (!existing) {
            try {
                await this.db.prepare(
                    `INSERT INTO ${this.tableName}
                     (competition_id, holder_hash, generation, acquired_at, last_heartbeat_at, ttl_seconds, released_at)
                     VALUES (?, ?, 1, datetime('now'), datetime('now'), ?, NULL)`
                ).bind(competitionId, holderHash, ttl).run();
                return { acquired: true, generation: 1, took_over: false };
            } catch {
                // Lost an INSERT race — whoever won owns the row; report it.
                const winner = await this.get(competitionId);
                if (!winner) throw new Error('Recording lease claim failed');
                return this.describeHeld(winner);
            }
        }

        const state = this.rowState(existing);
        if (!state.active) {
            const claimed = await this.db.prepare(
                `UPDATE ${this.tableName}
                 SET holder_hash = ?, generation = generation + 1,
                     acquired_at = datetime('now'), last_heartbeat_at = datetime('now'),
                     ttl_seconds = ?, released_at = NULL
                 WHERE competition_id = ?
                   AND (released_at IS NOT NULL
                        OR last_heartbeat_at < datetime('now', '-' || ? || ' seconds'))`
            ).bind(holderHash, ttl, competitionId, existing.ttl_seconds).run();
            if (claimed.meta.changes === 1) {
                const row = (await this.get(competitionId))!;
                return { acquired: true, generation: row.generation, took_over: true };
            }
            // Lost a takeover race — report the actual winner.
            const winner = (await this.get(competitionId))!;
            return this.describeHeld(winner);
        }

        if (existing.holder_hash === holderHash) {
            await this.db.prepare(
                `UPDATE ${this.tableName}
                 SET last_heartbeat_at = datetime('now'), ttl_seconds = ?
                 WHERE competition_id = ?`
            ).bind(ttl, competitionId).run();
            return { acquired: true, generation: existing.generation, took_over: false };
        }

        return this.describeHeld(existing);
    }

    private describeHeld(row: RecordingLease): LeaseAcquireResult {
        const state = this.rowState(row);
        return {
            acquired: false,
            reason: 'held',
            generation: row.generation,
            expires_in_seconds: state.expires_in_seconds
        };
    }

    /**
     * Refresh a held lease. Succeeds ONLY when (holder, generation) still
     * match an unreleased row — any mismatch means this session was fenced
     * out (takeover/release) and must stop recording/uploading.
     */
    async heartbeat(competitionId: number, holderHash: string, generation: number): Promise<LeaseHeartbeatResult> {
        const res = await this.db.prepare(
            `UPDATE ${this.tableName}
             SET last_heartbeat_at = datetime('now')
             WHERE competition_id = ? AND holder_hash = ?
               AND generation = ? AND released_at IS NULL
               AND last_heartbeat_at >= datetime('now', '-' || ttl_seconds || ' seconds')`
        ).bind(competitionId, holderHash, generation).run();
        if (res.meta.changes === 1) {
            return { held: true, generation };
        }
        const row = await this.get(competitionId);
        if (!row) return { held: false, generation: 0, expires_in_seconds: 0, reason: 'expired' };
        const state = this.rowState(row);
        // Identity/generation mismatch is a REAL loss: another session owns
        // the row (takeover) or this session already re-acquired under a
        // newer generation. Never report it as a retryable expiry.
        if (row.holder_hash !== holderHash || row.generation !== generation) {
            return { held: false, generation: row.generation, expires_in_seconds: state.expires_in_seconds, reason: 'lost' };
        }
        // Same holder+generation but the row is released: clean end. The
        // bounded drain tail remains valid under this generation.
        if (row.released_at) {
            return { held: false, generation: row.generation, expires_in_seconds: 0, reason: 'released' };
        }
        // Same owner, heartbeat aged past TTL: EXPIRED, not silently renewed.
        // The client must re-acquire (generation-checked) before uploading.
        return { held: false, generation: row.generation, expires_in_seconds: state.expires_in_seconds, reason: 'expired' };
    }

    /** Voluntary handover by the holder (clean stop / end). */
    async release(competitionId: number, holderHash: string): Promise<boolean> {
        const res = await this.db.prepare(
            `UPDATE ${this.tableName}
             SET released_at = datetime('now')
             WHERE competition_id = ? AND holder_hash = ? AND released_at IS NULL`
        ).bind(competitionId, holderHash).run();
        return res.meta.changes === 1;
    }

    /** Unconditional release (competition end — any holder, any state). */
    async releaseForCompetition(competitionId: number): Promise<void> {
        await this.db.prepare(
            `UPDATE ${this.tableName}
             SET released_at = datetime('now')
             WHERE competition_id = ? AND released_at IS NULL`
        ).bind(competitionId).run();
    }

    /** Public status: does an ACTIVE holder exist? (No secret is exposed.) */
    async status(competitionId: number): Promise<{ held: boolean; generation: number; expires_in_seconds: number }> {
        const row = await this.get(competitionId);
        if (!row) return { held: false, generation: 0, expires_in_seconds: 0 };
        const state = this.rowState(row);
        return { held: state.active, generation: row.generation, expires_in_seconds: state.expires_in_seconds };
    }
}

export default RecordingLeaseModel;
