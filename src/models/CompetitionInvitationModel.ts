import type { D1Result } from '@cloudflare/workers-types';
import { BaseModel } from './base/BaseModel';
import { ConflictError, NotFoundError, AuthorizationError } from '../lib/errors/AppError';
import { UserBlockModel } from './UserBlockModel';

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
     * Create - required by BaseModel (delegates to createInvitation logic)
     */
    async create(data: Partial<CompetitionInvitation>): Promise<CompetitionInvitation> {
        const result = await this.createInvitation({
            competition_id: data.competition_id!,
            inviter_id: data.inviter_id!,
            invitee_id: data.invitee_id!
        });
        return (await this.findById(result.id))!;
    }

    /**
     * Update - required by BaseModel
     */
    async update(id: number, data: Partial<CompetitionInvitation>): Promise<CompetitionInvitation | null> {
        const updates: string[] = [];
        const values: any[] = [];
        if (data.status !== undefined) { updates.push('status = ?'); values.push(data.status); }
        if (updates.length === 0) return this.findById(id);
        values.push(id);
        await this.db.prepare(
            `UPDATE ${this.tableName} SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`
        ).bind(...values).run();
        return this.findById(id);
    }

    /**
     * Create invitation
     * إنشاء دعوة
     */
    async createInvitation(data: {
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
     * Whether a pending invitation already exists for this invitee.
     * هل توجد دعوة معلقة لهذا المدعو
     */
    async hasPendingInvitation(competitionId: number, inviteeId: number): Promise<boolean> {
        const row = await this.db.prepare(`
            SELECT id FROM competition_invitations 
            WHERE competition_id = ? AND invitee_id = ? AND status = 'pending'
        `).bind(competitionId, inviteeId).first();
        return row !== null;
    }

    /**
     * Insert a pending invitation (lightweight insert used by CompetitionController).
     * إدراج دعوة معلقة
     */
    async insertPendingInvitation(
        competitionId: number,
        inviterId: number,
        inviteeId: number,
        message?: string
    ): Promise<{ id: number }> {
        const result = await this.db.prepare(`
            INSERT INTO competition_invitations (competition_id, inviter_id, invitee_id, message, status, created_at)
            VALUES (?, ?, ?, ?, 'pending', datetime('now'))
        `).bind(competitionId, inviterId, inviteeId, message || null).run();
        return { id: result.meta.last_row_id as number };
    }

    /**
     * Pending invitation of an invitee on a competition.
     * الدعوة المعلقة للمدعو
     */
    async findPendingByInvitee(competitionId: number, inviteeId: number): Promise<CompetitionInvitation | null> {
        return await this.db.prepare(`
            SELECT * FROM competition_invitations 
            WHERE competition_id = ? AND invitee_id = ? AND status = 'pending'
        `).bind(competitionId, inviteeId).first<CompetitionInvitation>();
    }

    /**
     * Pending invitation + competition title (the inviter push needs the title).
     * دعوة معلقة مع عنوان المنافسة
     */
    async findPendingWithCompetitionTitle(
        competitionId: number,
        inviteeId: number
    ): Promise<{ id: number; inviter_id: number; title: string } | null> {
        return await this.db.prepare(`
            SELECT ci.id, ci.inviter_id, c.title
            FROM competition_invitations ci
            JOIN competitions c ON c.id = ci.competition_id
            WHERE ci.competition_id = ? AND ci.invitee_id = ? AND ci.status = 'pending'
        `).bind(competitionId, inviteeId).first<{ id: number; inviter_id: number; title: string }>();
    }

    /**
     * Mark an invitation as declined. Returns false when nothing was updated.
     * تعليم الدعوة كمرفوضة
     */
    async markDeclined(invitationId: number): Promise<boolean> {
        const result = await this.db.prepare(`
            UPDATE competition_invitations 
            SET status = 'declined', responded_at = datetime('now') 
            WHERE id = ?
        `).bind(invitationId).run();
        return result.meta.changes > 0;
    }

    /**
     * Expire a user's pending invitations on immediate (unscheduled) competitions.
     * إنهاء الدعوات المعلقة على المنافسات الفورية
     */
    async expirePendingImmediate(inviteeId: number): Promise<number> {
        const result = await this.db.prepare(`
            UPDATE competition_invitations SET status = 'expired' 
            WHERE invitee_id = ? AND status = 'pending' 
            AND competition_id IN (SELECT id FROM competitions WHERE scheduled_at IS NULL)
        `).bind(inviteeId).run();
        return result.meta.changes;
    }

    /**
     * Accept an invitation atomically: guarded setOpponent + accept this
     * invitation + decline the competing invitations/requests — ONE serialized
     * db.batch(). The caller inspects results[0].meta.changes to detect a lost
     * race; the dependent steps re-check competitions.opponent_id because
     * db.batch() never short-circuits on changes = 0.
     */
    async acceptInvitationAtomic(
        competitionId: number,
        invitationId: number,
        inviteeId: number
    ): Promise<D1Result[]> {
        return this.db.batch([
            // 1. Atomically set opponent (only if opponent_id IS NULL)
            this.db.prepare(
                'UPDATE competitions SET opponent_id = ?, status = \'accepted\' WHERE id = ? AND opponent_id IS NULL'
            ).bind(inviteeId, competitionId),
            // 2. Accept this invitation — ONLY if step 1 actually won the opponent slot
            this.db.prepare(
                `UPDATE competition_invitations SET status = 'accepted', responded_at = datetime('now')
                 WHERE id = ? AND EXISTS (
                     SELECT 1 FROM competitions WHERE id = ? AND opponent_id = ?
                 )`
            ).bind(invitationId, competitionId, inviteeId),
            // 3. Decline all other pending invitations for this competition — same guard
            this.db.prepare(
                `UPDATE competition_invitations SET status = 'declined'
                 WHERE competition_id = ? AND id != ? AND status = 'pending' AND EXISTS (
                     SELECT 1 FROM competitions WHERE id = ? AND opponent_id = ?
                 )`
            ).bind(competitionId, invitationId, competitionId, inviteeId),
            // 4. Decline all pending requests for this competition — same guard
            this.db.prepare(
                `UPDATE competition_requests SET status = 'auto_declined'
                 WHERE competition_id = ? AND status = 'pending' AND EXISTS (
                     SELECT 1 FROM competitions WHERE id = ? AND opponent_id = ?
                 )`
            ).bind(competitionId, competitionId, inviteeId),
        ]);
    }

    /**
     * Check if users are blocking each other
     * التحقق من الحظر
     */
    private async checkBlock(userId1: number, userId2: number): Promise<boolean> {
        // B6: unified on UserBlockModel.isBlockedBetween — no duplicate SQL.
        return new UserBlockModel(this.db).isBlockedBetween(userId1, userId2);
    }
}
