import { BaseModel } from './base/BaseModel';
import { ConflictError } from '../lib/errors/AppError';

export interface UserBlock {
    id: number;
    blocker_id: number;
    blocked_id: number;
    reason?: string;
    created_at: string;
}

export class UserBlockModel extends BaseModel<UserBlock> {
    protected readonly tableName = 'user_blocks';

    /**
     * Block a user
     * حظر مستخدم
     */
    async block(blockerId: number, blockedId: number, reason?: string): Promise<{ id: number }> {
        // Check if already blocked
        const existing = await this.isBlocked(blockerId, blockedId);
        if (existing) {
            throw new ConflictError('هذا المستخدم محظور بالفعل');
        }

        // Cannot block yourself
        if (blockerId === blockedId) {
            throw new ConflictError('لا يمكنك حظر نفسك');
        }

        // Block user
        const result = await this.db.prepare(`
            INSERT INTO user_blocks (blocker_id, blocked_id, reason, created_at)
            VALUES (?, ?, ?, datetime('now'))
        `).bind(blockerId, blockedId, reason || null).run();

        // Delete any active conversations
        await this.db.prepare(`
            DELETE FROM conversations 
            WHERE (participant1_id = ? AND participant2_id = ?) 
               OR (participant1_id = ? AND participant2_id = ?)
        `).bind(
            Math.min(blockerId, blockedId),
            Math.max(blockerId, blockedId),
            Math.min(blockerId, blockedId),
            Math.max(blockerId, blockedId)
        ).run();

        // Delete any pending invitations
        await this.db.prepare(`
            DELETE FROM competition_invitations 
            WHERE (inviter_id = ? AND invitee_id = ?) OR (inviter_id = ? AND invitee_id = ?)
        `).bind(blockerId, blockedId, blockedId, blockerId).run();

        // Delete any pending requests between them
        await this.db.prepare(`
            DELETE FROM competition_requests cr
            WHERE cr.requester_id = ? 
            AND cr.competition_id IN (SELECT id FROM competitions WHERE creator_id = ?)
        `).bind(blockedId, blockerId).run();

        return { id: result.meta.last_row_id as number };
    }

    /**
     * Unblock a user
     * إلغاء حظر مستخدم
     */
    async unblock(blockerId: number, blockedId: number): Promise<void> {
        const result = await this.db.prepare(`
            DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?
        `).bind(blockerId, blockedId).run();

        if (result.meta.changes === 0) {
            throw new ConflictError('هذا المستخدم غير محظور');
        }
    }

    /**
     * Check if user is blocked
     * التحقق من الحظر
     */
    async isBlocked(userId1: number, userId2: number): Promise<boolean> {
        const result = await this.db.prepare(`
            SELECT 1 FROM user_blocks 
            WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
        `).bind(userId1, userId2, userId2, userId1).first();

        return result !== null;
    }

    /**
     * Get list of blocked users
     * قائمة المستخدمين المحظورين
     */
    async getBlockedUsers(blockerId: number): Promise<any[]> {
        const result = await this.db.prepare(`
            SELECT b.*, 
                   u.username, u.display_name, u.avatar_url, u.country_code
            FROM user_blocks b
            JOIN users u ON b.blocked_id = u.id
            WHERE b.blocker_id = ?
            ORDER BY b.created_at DESC
        `).bind(blockerId).all();

        return result.results || [];
    }

    /**
     * Get list of users who blocked this user
     * من حظرني
     */
    async getBlockedBy(userId: number): Promise<any[]> {
        const result = await this.db.prepare(`
            SELECT b.*, 
                   u.username, u.display_name, u.avatar_url
            FROM user_blocks b
            JOIN users u ON b.blocker_id = u.id
            WHERE b.blocked_id = ?
            ORDER BY b.created_at DESC
        `).bind(userId).all();

        return result.results || [];
    }
}
