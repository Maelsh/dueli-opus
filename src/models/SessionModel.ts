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

        const user = await this.queryOne(
            'SELECT * FROM users WHERE id = ?',
            result.user_id
        );

        return user ? { session: result, user } : null;
    }

    /**
     * Create session
     */
    async create(data: Partial<Session>): Promise<Session> {
        const sessionId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

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
