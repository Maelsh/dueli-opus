/**
 * @file src/lib/services/UserStatusService.ts
 * @description User busy status management (Plan Solution 9)
 * @module lib/services
 * 
 * خدمة إدارة حالة المستخدم - مشغول/متاح
 */

export class UserStatusService {
    constructor(private db: D1Database) { }

    /**
     * Set user as busy (when going live)
     */
    async setBusy(userId: number, competitionId: number): Promise<void> {
        await this.db.prepare(`
            UPDATE users 
            SET is_busy = 1, 
                current_competition_id = ?,
                busy_since = datetime('now')
            WHERE id = ?
        `).bind(competitionId, userId).run();
    }

    /**
     * Set user as free (when competition ends)
     */
    async setFree(userId: number): Promise<void> {
        await this.db.prepare(`
            UPDATE users 
            SET is_busy = 0, 
                current_competition_id = NULL,
                busy_since = NULL
            WHERE id = ?
        `).bind(userId).run();
    }

    /**
     * Check if user is available
     */
    async checkAvailability(userId: number): Promise<{
        available: boolean;
        currentCompetitionId?: number;
        since?: string;
        wasAutoFreed?: boolean;
    }> {
        const user = await this.db.prepare(`
            SELECT is_busy, current_competition_id, busy_since 
            FROM users WHERE id = ?
        `).bind(userId).first() as any;

        if (!user) return { available: false };

        if (!user.is_busy) {
            return { available: true };
        }

        // Check heartbeat - if no heartbeat for 2+ minutes, auto-free
        if (user.current_competition_id) {
            const heartbeat = await this.db.prepare(`
                SELECT last_seen FROM competition_heartbeats 
                WHERE competition_id = ? AND user_id = ?
            `).bind(user.current_competition_id, userId).first() as any;

            if (heartbeat) {
                const lastSeen = new Date(heartbeat.last_seen).getTime();
                const now = Date.now();
                const diffSeconds = (now - lastSeen) / 1000;

                if (diffSeconds > 120) {
                    // Auto-free: no heartbeat for 2 minutes
                    await this.setFree(userId);
                    return { available: true, wasAutoFreed: true };
                }
            }
        }

        return {
            available: false,
            currentCompetitionId: user.current_competition_id,
            since: user.busy_since,
        };
    }

    /**
     * Record heartbeat for a user in a competition
     */
    async heartbeat(competitionId: number, userId: number): Promise<void> {
        await this.db.prepare(`
            INSERT INTO competition_heartbeats (competition_id, user_id, last_seen)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(competition_id, user_id) 
            DO UPDATE SET last_seen = datetime('now')
        `).bind(competitionId, userId).run();
    }

    /**
     * Check if user is blocked by another user
     * Plan Solution 6: حظر المستخدمين
     */
    async isBlocked(user1Id: number, user2Id: number): Promise<boolean> {
        const block = await this.db.prepare(`
            SELECT 1 FROM user_blocks 
            WHERE (blocker_id = ? AND blocked_id = ?)
            OR (blocker_id = ? AND blocked_id = ?)
        `).bind(user1Id, user2Id, user2Id, user1Id).first();
        return block !== null;
    }

    /**
     * Block a user
     */
    async blockUser(blockerId: number, blockedId: number, reason?: string): Promise<void> {
        await this.db.prepare(`
            INSERT OR IGNORE INTO user_blocks (blocker_id, blocked_id, reason, created_at)
            VALUES (?, ?, ?, datetime('now'))
        `).bind(blockerId, blockedId, reason || null).run();

        // Delete any mutual competition requests
        await this.db.prepare(`
            DELETE FROM competition_requests 
            WHERE (requester_id = ? AND competition_id IN (
                SELECT id FROM competitions WHERE creator_id = ?
            )) OR (requester_id = ? AND competition_id IN (
                SELECT id FROM competitions WHERE creator_id = ?
            ))
        `).bind(blockerId, blockedId, blockedId, blockerId).run();
    }

    /**
     * Unblock a user
     */
    async unblockUser(blockerId: number, blockedId: number): Promise<boolean> {
        const result = await this.db.prepare(`
            DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?
        `).bind(blockerId, blockedId).run();
        return result.meta.changes > 0;
    }

    /**
     * Get list of blocked users
     */
    async getBlockedUsers(userId: number): Promise<any[]> {
        const result = await this.db.prepare(`
            SELECT b.*, u.username, u.display_name, u.avatar_url
            FROM user_blocks b
            JOIN users u ON b.blocked_id = u.id
            WHERE b.blocker_id = ?
            ORDER BY b.created_at DESC
        `).bind(userId).all();
        return result.results;
    }
}

export default UserStatusService;
