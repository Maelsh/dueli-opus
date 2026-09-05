/**
 * Session Model
 * نموذج الجلسة
 */

import type { Session } from '../config/types';

/**
 * Session Model Class
 * Note: Sessions use string IDs (UUID), so we don't extend BaseModel<Session>
 */
export class SessionModel {
    protected readonly db: D1Database;

    /**
     * Session lifetime (B+: shortened from 30 days — no HttpOnly yet, so a
     * shorter window limits the blast radius of a leaked Bearer token).
     */
    static readonly TTL_DAYS = 7;

    /** Max concurrent sessions kept per user (rotation prunes older ones). */
    static readonly MAX_SESSIONS_PER_USER = 5;

    constructor(db: D1Database) {
        this.db = db;
    }

    /**
     * Execute query returning single result
     */
    private async queryOne<R = any>(sql: string, ...params: any[]): Promise<R | null> {
        return await this.db.prepare(sql).bind(...params).first() as R | null;
    }

    /**
     * Find session by ID (string UUID)
     */
    async findBySessionId(sessionId: string): Promise<Session | null> {
        return this.queryOne<Session>(
            'SELECT * FROM sessions WHERE id = ? AND expires_at > datetime("now")',
            sessionId
        );
    }

    /**
     * Find valid session with user
     */
    async findValidSession(sessionId: string): Promise<{ session: Session; user: any } | null> {
        const result = await this.queryOne<Session & { user_id: number }>(
            'SELECT * FROM sessions WHERE id = ? AND expires_at > datetime("now")',
            sessionId
        );

        if (!result) return null;

        // T1.4: Banned users (is_active = 0) lose their sessions immediately
        const user = await this.queryOne(
            'SELECT * FROM users WHERE id = ? AND is_active = 1',
            result.user_id
        );

        if (!user) {
            // Clean up the orphaned session of a banned/deleted user
            await this.deleteBySessionId(sessionId);
            return null;
        }

        return { session: result, user };
    }

    /**
     * Create session
     */
    async create(data: Partial<Session>): Promise<Session> {
        const sessionId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + SessionModel.TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

        await this.db.prepare(`
            INSERT INTO sessions (id, user_id, expires_at, created_at)
            VALUES (?, ?, ?, datetime('now'))
        `).bind(sessionId, data.user_id, expiresAt).run();

        return (await this.findBySessionId(sessionId))!;
    }

    /**
     * Update session - extend expiry
     */
    async update(id: number, data: Partial<Session>): Promise<Session | null> {
        // Sessions use string IDs, so this isn't typically used
        return null;
    }

    /**
     * Delete session by ID
     */
    async deleteBySessionId(sessionId: string): Promise<boolean> {
        const result = await this.db.prepare(
            'DELETE FROM sessions WHERE id = ?'
        ).bind(sessionId).run();
        return result.meta.changes > 0;
    }

    /**
     * Delete all sessions for user
     */
    async deleteByUser(userId: number): Promise<number> {
        const result = await this.db.prepare(
            'DELETE FROM sessions WHERE user_id = ?'
        ).bind(userId).run();
        return result.meta.changes;
    }

    /**
     * Rotation: keep only the N most recent sessions per user.
     * Called on every successful login so a fresh session is issued
     * while stale ones (other devices beyond the cap, leaked tokens)
     * are pruned instead of accumulating forever.
     */
    async pruneOldSessions(userId: number, keep: number = SessionModel.MAX_SESSIONS_PER_USER): Promise<number> {
        const result = await this.db.prepare(
            `DELETE FROM sessions WHERE user_id = ? AND id NOT IN (
                SELECT id FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
            )`
        ).bind(userId, userId, keep).run();
        return result.meta.changes;
    }

    /**
     * Clean expired sessions
     */
    async cleanExpired(): Promise<number> {
        const result = await this.db.prepare(
            'DELETE FROM sessions WHERE expires_at < datetime("now")'
        ).run();
        return result.meta.changes;
    }
}

export default SessionModel;
