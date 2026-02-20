import { BaseModel } from './base/BaseModel';
import { ConflictError, NotFoundError, AuthorizationError } from '../lib/errors/AppError';

export interface CompetitionInvitation {
    id: number;
    competition_id: number;
    inviter_id: number;
    invitee_id: number;
    status: 'pending' | 'accepted' | 'rejected' | 'expired';
    expires_at: string;
    created_at: string;
    updated_at: string;
}

export class CompetitionInvitationModel extends BaseModel<CompetitionInvitation> {
    protected readonly tableName = 'competition_invitations';

    /**
     * Create invitation
     * إنشاء دعوة
     */
    async create(data: {
        competition_id: number;
        inviter_id: number;
        invitee_id: number;
    }): Promise<{ id: number }> {
        // Check if invitation already exists
        const existing = await this.db.prepare(`
            SELECT id FROM competition_invitations 
            WHERE competition_id = ? AND invitee_id = ? AND status = 'pending'
        `).bind(data.competition_id, data.invitee_id).first();

        if (existing) {
            throw new ConflictError('تم إرسال دعوة لهذا المستخدم بالفعل');
        }

        // Verify inviter is competition creator
        const competition = await this.db.prepare(`
            SELECT creator_id, opponent_id, status FROM competitions WHERE id = ?
        `).bind(data.competition_id).first<any>();

        if (!competition) {
            throw new NotFoundError('المنافسة');
        }

        if (competition.creator_id !== data.inviter_id) {
            throw new AuthorizationError('فقط منشئ المنافسة يمكنه إرسال دعوات');
        }

        if (competition.opponent_id) {
            throw new ConflictError('المنافسة لديها خصم بالفعل');
        }

        if (competition.status !== 'pending') {
            throw new ConflictError('المنافسة لا تقبل دعوات جديدة');
        }

        // Check if users are blocking each other
        const isBlocked = await this.checkBlock(data.inviter_id, data.invitee_id);
        if (isBlocked) {
            throw new ConflictError('لا يمكنك دعوة هذا المستخدم');
        }

        // Create invitation
        const result = await this.db.prepare(`
            INSERT INTO competition_invitations 
            (competition_id, inviter_id, invitee_id, status, expires_at, created_at, updated_at)
            VALUES (?, ?, ?, 'pending', datetime('now', '+24 hours'), datetime('now'), datetime('now'))
        `).bind(data.competition_id, data.inviter_id, data.invitee_id).run();

        return { id: result.meta.last_row_id as number };
    }

    /**
     * Accept invitation (atomic operation)
     * قبول دعوة
     */
    async accept(invitationId: number, accepterId: number): Promise<void> {
        const invitation = await this.findById(invitationId);
        if (!invitation) {
            throw new NotFoundError('الدعوة');
        }

        if (invitation.invitee_id !== accepterId) {
            throw new AuthorizationError('هذه الدعوة ليست لك');
        }

        if (invitation.status !== 'pending') {
            throw new ConflictError('هذه الدعوة تمت معالجتها بالفعل');
        }

        // Check if competition still available
        const competition = await this.db.prepare(`
            SELECT opponent_id, status FROM competitions WHERE id = ?
        `).bind(invitation.competition_id).first<any>();

        if (!competition) {
            throw new NotFoundError('المنافسة');
        }

        if (competition.opponent_id) {
            throw new ConflictError('تم قبول متنافس آخر بالفعل');
        }

        // Atomic operation
        await this.db.batch([
            // 1. Update competition
            this.db.prepare(`
                UPDATE competitions 
                SET opponent_id = ?, status = 'accepted', accepted_at = datetime('now'), updated_at = datetime('now')
                WHERE id = ? AND opponent_id IS NULL
            `).bind(accepterId, invitation.competition_id),

            // 2. Accept invitation
            this.db.prepare(`
                UPDATE competition_invitations 
                SET status = 'accepted', updated_at = datetime('now')
                WHERE id = ?
            `).bind(invitationId),

            // 3. Delete other invitations
            this.db.prepare(`
                DELETE FROM competition_invitations 
                WHERE competition_id = ? AND id != ?
            `).bind(invitation.competition_id, invitationId),

            // 4. Delete pending requests
            this.db.prepare(`
                DELETE FROM competition_requests 
                WHERE competition_id = ?
            `).bind(invitation.competition_id),

            // 5. Notify inviter
            this.db.prepare(`
                INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, created_at)
                VALUES (?, 'request_accepted', 'تم قبول دعوتك', 'قبل المستخدم دعوتك للمنافسة', 'competition', ?, datetime('now'))
            `).bind(invitation.inviter_id, invitation.competition_id)
        ]);
    }

    /**
     * Reject invitation
     * رفض دعوة
     */
    async reject(invitationId: number, rejecterId: number): Promise<void> {
        const invitation = await this.findById(invitationId);
        if (!invitation) {
            throw new NotFoundError('الدعوة');
        }

        if (invitation.invitee_id !== rejecterId) {
            throw new AuthorizationError('هذه الدعوة ليست لك');
        }

        // Update invitation
        await this.db.prepare(`
            UPDATE competition_invitations 
            SET status = 'rejected', updated_at = datetime('now')
            WHERE id = ?
        `).bind(invitationId).run();

        // Notify inviter
        await this.db.prepare(`
            INSERT INTO notifications (user_id, type, title, message, created_at)
            VALUES (?, 'request_declined', 'تم رفض دعوتك', 'رفض المستخدم دعوتك للمنافسة', datetime('now'))
        `).bind(invitation.inviter_id).run();
    }

    /**
     * Get user's received invitations
     * الدعوات المستلمة
     */
    async findByInvitee(inviteeId: number): Promise<any[]> {
        const result = await this.db.prepare(`
            SELECT i.*, 
                   c.title, c.category_id, c.scheduled_at,
                   cat.name_ar as category_name,
                   u.username as inviter_username, u.display_name as inviter_name, u.avatar_url as inviter_avatar
            FROM competition_invitations i
            JOIN competitions c ON i.competition_id = c.id
            JOIN categories cat ON c.category_id = cat.id
            JOIN users u ON i.inviter_id = u.id
            WHERE i.invitee_id = ? AND i.status = 'pending'
            ORDER BY i.created_at DESC
        `).bind(inviteeId).all();

        return result.results || [];
    }

    /**
     * Expire old invitations
     * إنهاء الدعوات القديمة
     */
    async expireOld(): Promise<number> {
        const result = await this.db.prepare(`
            UPDATE competition_invitations 
            SET status = 'expired', updated_at = datetime('now')
            WHERE status = 'pending' AND expires_at < datetime('now')
        `).run();

        return result.meta.changes || 0;
    }

    /**
     * Check if users are blocking each other
     * التحقق من الحظر
     */
    private async checkBlock(userId1: number, userId2: number): Promise<boolean> {
        const result = await this.db.prepare(`
            SELECT 1 FROM user_blocks 
            WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
        `).bind(userId1, userId2, userId2, userId1).first();

        return result !== null;
    }
}
