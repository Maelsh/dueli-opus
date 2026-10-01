/**
 * Explore Result Session Model
 * نموذج جلسة النتائج
 *
 * R3-B7: persistent store for ONE frozen ordered result set. The session row
 * carries identity + canonical context + total; the ordered ids live in
 * explore_result_chunks (see ExploreResultChunkModel).
 *
 * Standalone data-access class (TEXT primary key), same reason SessionModel
 * does not extend BaseModel<>: BaseModel assumes an INTEGER id workflow.
 * No `#private` fields (Cloudflare Workers compat).
 */

export type ExploreSurface = string;

export type ExploreIdentityKind = 'user' | 'guest';

export type ExploreSessionStatus = 'building' | 'ready';

export interface ExploreResultSession {
    id: string;
    surface: ExploreSurface;
    identity_kind: ExploreIdentityKind;
    identity_key: string;
    filters_canonical: string;
    lang: string;
    status: ExploreSessionStatus;
    total_count: number;
    chunk_size: number;
    created_at: string;
    expires_at: string;
}

export interface CreateExploreSessionData {
    surface: ExploreSurface;
    identityKind: ExploreIdentityKind;
    identityKey: string;
    filtersCanonical: string;
    lang: string;
    chunkSize: number;
    ttlSeconds: number;
}

export class ExploreResultSessionModel {
    protected readonly db: D1Database;

    constructor(db: D1Database) {
        this.db = db;
    }

    async create(data: CreateExploreSessionData): Promise<ExploreResultSession> {
        const id = crypto.randomUUID();
        await this.db.prepare(
            `INSERT INTO explore_result_sessions
                (id, surface, identity_kind, identity_key, filters_canonical, lang, status, total_count, chunk_size, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, 'building', 0, ?, datetime('now', ?))`
        ).bind(
            id,
            data.surface,
            data.identityKind,
            data.identityKey,
            data.filtersCanonical,
            data.lang,
            data.chunkSize,
            `+${data.ttlSeconds} seconds`
        ).run();
        const row = await this.findById(id);
        if (!row) throw new Error('explore session insert did not persist');
        return row;
    }

    async findById(id: string): Promise<ExploreResultSession | null> {
        if (typeof id !== 'string' || id.length === 0 || id.length > 64) return null;
        return await this.db.prepare(
            `SELECT * FROM explore_result_sessions WHERE id = ?`
        ).bind(id).first<ExploreResultSession>();
    }

    /**
     * The session row only when the database clock still honours it.
     * Expiry is decided by datetime('now') inside the engine — callers must
     * never parse expires_at in JS (the stored 'YYYY-MM-DD HH:MM:SS' form is
     * not reliably parseable across runtimes).
     */
    async findFreshById(id: string): Promise<ExploreResultSession | null> {
        if (typeof id !== 'string' || id.length === 0 || id.length > 64) return null;
        return await this.db.prepare(
            `SELECT * FROM explore_result_sessions WHERE id = ? AND expires_at > datetime('now')`
        ).bind(id).first<ExploreResultSession>();
    }

    async markReady(id: string, totalCount: number): Promise<void> {
        await this.db.prepare(
            `UPDATE explore_result_sessions SET status = 'ready', total_count = ? WHERE id = ?`
        ).bind(totalCount, id).run();
    }

    async deleteById(id: string): Promise<void> {
        await this.db.prepare(
            `DELETE FROM explore_result_sessions WHERE id = ?`
        ).bind(id).run();
    }

    /**
     * Lazy TTL cleanup (no cron gate by design): drop every session whose
     * expiry passed. Chunks follow via ON DELETE CASCADE.
     */
    async deleteExpired(): Promise<number> {
        const result = await this.db.prepare(
            `DELETE FROM explore_result_sessions WHERE expires_at <= datetime('now')`
        ).run();
        return result.meta.changes;
    }
}

export default ExploreResultSessionModel;
