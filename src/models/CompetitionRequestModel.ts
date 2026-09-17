import type { D1Result } from '@cloudflare/workers-types';
import { BaseModel } from './base/BaseModel';
import { ConflictError, NotFoundError, AuthorizationError } from '../lib/errors/AppError';

export interface CompetitionRequest {
    id: number;
    competition_id: number;
    requester_id: number;
    message?: string;
    status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired';
    expires_at: string;
    created_at: string;
    updated_at: string;
}

export class CompetitionRequestModel extends BaseModel<CompetitionRequest> {
    protected readonly tableName = 'competition_requests';

    /**
     * Create - required by BaseModel
     */
    async create(data: Partial<CompetitionRequest>): Promise<CompetitionRequest> {
        const result = await this.createRequest({
            competition_id: data.competition_id!,
            requester_id: data.requester_id!,
            message: data.message
        });
        return (await this.findById(result.id))!;
    }

    /**
     * Update - required by BaseModel
     */
    async update(id: number, data: Partial<CompetitionRequest>): Promise<CompetitionRequest | null> {
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
     * Create a new competition request
     * إنشاء طلب انضمام جديد
     */
    async createRequest(data: {
        competition_id: number;
        requester_id: number;
        message?: string;
    }): Promise<{ id: number }> {
        // Check if request already exists
        const existing = await this.findPending(data.competition_id, data.requester_id);
        if (existing) {
            throw new ConflictError('لديك طلب معلق بالفعل لهذه المنافسة');
        }

        // Check pending requests count (max 10)
        const pendingCount = await this.getUserPendingCount(data.requester_id);
        if (pendingCount >= 10) {
            throw new ConflictError('لديك 10 طلبات معلقة كحد أقصى. احذف بعضها أولاً.');
        }

        // Check if competition still accepts requests
        const competition = await this.db.prepare(`
            SELECT status, opponent_id FROM competitions WHERE id = ?
        `).bind(data.competition_id).first<{ status: string; opponent_id: number | null }>();

        if (!competition) {
            throw new NotFoundError('المنافسة');
        }

        if (competition.status !== 'pending') {
            throw new ConflictError('المنافسة لا تقبل طلبات جديدة');
        }

        if (competition.opponent_id) {
            throw new ConflictError('المنافسة لديها خصم بالفعل');
        }

        // Create request
        const result = await this.db.prepare(`
            INSERT INTO competition_requests 
            (competition_id, requester_id, message, status, expires_at, created_at, updated_at)
            VALUES (?, ?, ?, 'pending', datetime('now', '+24 hours'), datetime('now'), datetime('now'))
        `).bind(data.competition_id, data.requester_id, data.message || null).run();

        return { id: result.meta.last_row_id as number };
    }

    /**
     * Accept a request (atomic operation)
     * قبول طلب (عملية ذرية)
     */
    async accept(requestId: number, accepterId: number): Promise<void> {
        const request = await this.findById(requestId);
        if (!request) {
            throw new NotFoundError('الطلب');
        }

        if (request.status !== 'pending') {
            throw new ConflictError('هذا الطلب تمت معالجته بالفعل');
        }

        // Check if accepter is the competition creator
        const competition = await this.db.prepare(`
            SELECT creator_id, opponent_id, status FROM competitions WHERE id = ?
        `).bind(request.competition_id).first<any>();

        if (!competition) {
            throw new NotFoundError('المنافسة');
        }

        if (competition.creator_id !== accepterId) {
            throw new AuthorizationError('فقط منشئ المنافسة يمكنه قبول الطلبات');
        }

        if (competition.opponent_id) {
            throw new ConflictError('المنافسة لديها خصم بالفعل');
        }

        // Atomic operation: accept request + update competition + delete other requests
        await this.db.batch([
            // 1. Update competition with opponent
            this.db.prepare(`
                UPDATE competitions 
                SET opponent_id = ?, status = 'accepted', accepted_at = datetime('now'), updated_at = datetime('now')
                WHERE id = ? AND opponent_id IS NULL
            `).bind(request.requester_id, request.competition_id),

            // 2. Mark this request as accepted
            this.db.prepare(`
                UPDATE competition_requests 
                SET status = 'accepted', updated_at = datetime('now')
                WHERE id = ?
            `).bind(requestId),

            // 3. Delete all other pending requests for this competition
            this.db.prepare(`
                DELETE FROM competition_requests 
                WHERE competition_id = ? AND id != ?
            `).bind(request.competition_id, requestId),

            // 4. Notify requester
            this.db.prepare(`
                INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, created_at)
                VALUES (?, 'request_accepted', 'تم قبول طلبك', 'تم قبولك كمتنافس في المنافسة', 'competition', ?, datetime('now'))
            `).bind(request.requester_id, request.competition_id),

            // 5. Notify rejected requesters
            this.db.prepare(`
                INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, created_at)
                SELECT requester_id, 'request_declined', 'تم اختيار متنافس آخر', 
                       'تم قبول متنافس آخر في المنافسة', 'competition', ?, datetime('now')
                FROM competition_requests 
                WHERE competition_id = ? AND id != ? AND status = 'pending'
            `).bind(request.competition_id, request.competition_id, requestId)
        ]);
    }

    /**
     * Reject a request
     * رفض طلب
     */
    async reject(requestId: number, rejecterId: number, reason?: string): Promise<void> {
        const request = await this.findById(requestId);
        if (!request) {
            throw new NotFoundError('الطلب');
        }

        // Verify rejector is competition creator
        const competition = await this.db.prepare(`
            SELECT creator_id FROM competitions WHERE id = ?
        `).bind(request.competition_id).first<{ creator_id: number }>();

        if (!competition) {
            throw new NotFoundError('المنافسة');
        }

        if (competition.creator_id !== rejecterId) {
            throw new AuthorizationError('فقط منشئ المنافسة يمكنه رفض الطلبات');
        }

        // Update request status
        await this.db.prepare(`
            UPDATE competition_requests 
            SET status = 'rejected', updated_at = datetime('now')
            WHERE id = ?
        `).bind(requestId).run();

        // Notify requester
        await this.db.prepare(`
            INSERT INTO notifications (user_id, type, title, message, created_at)
            VALUES (?, 'request_declined', 'تم رفض طلبك', ?, datetime('now'))
        `).bind(request.requester_id, reason || 'تم رفض طلبك للانضمام للمنافسة').run();
    }

    /**
     * Cancel a request (by requester)
     * إلغاء طلب
     */
    async cancel(requestId: number, requesterId: number): Promise<void> {
        const request = await this.findById(requestId);
        if (!request) {
            throw new NotFoundError('الطلب');
        }

        if (request.requester_id !== requesterId) {
            throw new AuthorizationError('لا يمكنك إلغاء طلب لم ترسله');
        }

        if (request.status !== 'pending') {
            throw new ConflictError('لا يمكن إلغاء طلب تمت معالجته');
        }

        // Delete request
        await this.db.prepare(`
            DELETE FROM competition_requests WHERE id = ?
        `).bind(requestId).run();
    }

    /**
     * Get pending request count for user
     * عدد الطلبات المعلقة للمستخدم
     */
    async getUserPendingCount(userId: number): Promise<number> {
        const result = await this.db.prepare(`
            SELECT COUNT(*) as count FROM competition_requests 
            WHERE requester_id = ? AND status = 'pending'
        `).bind(userId).first<{ count: number }>();

        return result?.count || 0;
    }

    /**
     * Find pending request
     * البحث عن طلب معلق
     */
    async findPending(competitionId: number, requesterId: number): Promise<CompetitionRequest | null> {
        return await this.db.prepare(`
            SELECT * FROM competition_requests 
            WHERE competition_id = ? AND requester_id = ? AND status = 'pending'
        `).bind(competitionId, requesterId).first<CompetitionRequest>();
    }

    /**
     * Get all requests for a competition
     * الحصول على كل طلبات منافسة
     */
    async findByCompetition(competitionId: number): Promise<any[]> {
        const result = await this.db.prepare(`
            SELECT r.*, 
                   u.username, u.display_name, u.avatar_url, u.country_code, u.elo_rating,
                   (SELECT COUNT(*) FROM competitions WHERE creator_id = u.id AND status = 'completed') as total_competitions
            FROM competition_requests r
            JOIN users u ON r.requester_id = u.id
            WHERE r.competition_id = ? AND r.status = 'pending'
            ORDER BY r.created_at DESC
        `).bind(competitionId).all();

        return result.results || [];
    }

    /**
     * Get user's sent requests
     * طلبات المستخدم المرسلة
     */
    async findByRequester(requesterId: number): Promise<any[]> {
        const result = await this.db.prepare(`
            SELECT r.*, 
                   c.title, c.category_id, c.status as competition_status,
                   cat.name_ar as category_name,
                   u.username as creator_username, u.display_name as creator_name
            FROM competition_requests r
            JOIN competitions c ON r.competition_id = c.id
            JOIN categories cat ON c.category_id = cat.id
            JOIN users u ON c.creator_id = u.id
            WHERE r.requester_id = ?
            ORDER BY r.created_at DESC
        `).bind(requesterId).all();

        return result.results || [];
    }

    /**
     * Insert a pending request row (lightweight insert used by CompetitionController).
     * إدراج طلب معلق
     */
    async insertPendingRequest(
        competitionId: number,
        requesterId: number,
        message?: string
    ): Promise<{ id: number }> {
        const result = await this.db.prepare(`
            INSERT INTO competition_requests (competition_id, requester_id, message, status, created_at)
            VALUES (?, ?, ?, 'pending', datetime('now'))
        `).bind(competitionId, requesterId, message || null).run();
        return { id: result.meta.last_row_id as number };
    }

    /**
     * Update a request status.
     * تحديث حالة الطلب
     */
    async updateStatus(id: number, status: string): Promise<boolean> {
        const result = await this.db.prepare(
            'UPDATE competition_requests SET status = ? WHERE id = ?'
        ).bind(status, id).run();
        return result.meta.changes > 0;
    }

    /**
     * Delete a user's pending request on a competition (cancel).
     * حذف طلب معلق
     */
    async deletePendingByRequester(competitionId: number, requesterId: number): Promise<boolean> {
        const result = await this.db.prepare(
            "DELETE FROM competition_requests WHERE competition_id = ? AND requester_id = ? AND status = 'pending'"
        ).bind(competitionId, requesterId).run();
        return result.meta.changes > 0;
    }

    /**
     * Pending requests of a competition + requester summary (light payload used
     * by GET /api/competitions/:id/requests).
     * طلبات معلقة مع ملخص مقدم الطلب
     */
    async findPendingWithRequester(competitionId: number): Promise<any[]> {
        const result = await this.db.prepare(`
            SELECT r.*, u.display_name, u.avatar_url, u.username
            FROM competition_requests r
            JOIN users u ON r.requester_id = u.id
            WHERE r.competition_id = ? AND r.status = 'pending'
            ORDER BY r.created_at DESC
        `).bind(competitionId).all();
        return result.results;
    }

    /**
     * Count a competition's pending requests (competition detail payload).
     * عدد الطلبات المعلقة لمنافسة
     */
    async countPendingByCompetition(competitionId: number): Promise<number> {
        const row = await this.db.prepare(
            "SELECT COUNT(*) AS n FROM competition_requests WHERE competition_id = ? AND status = 'pending'"
        ).bind(competitionId).first<{ n: number }>();
        return row?.n || 0;
    }

    /**
     * Whether the user already has a pending request on this competition.
     * هل لدى المستخدم طلب معلق على هذه المنافسة
     */
    async hasPendingForRequester(competitionId: number, requesterId: number): Promise<boolean> {
        const row = await this.db.prepare(
            "SELECT 1 FROM competition_requests WHERE competition_id = ? AND requester_id = ? AND status = 'pending'"
        ).bind(competitionId, requesterId).first<{ '1': number }>();
        return row !== null;
    }

    /**
     * Decline all pending requests for a competition except one
     * رفض جميع الطلبات المعلقة للمنافسة باستثناء طلب واحد
     */
    async declineAllOther(competitionId: number, exceptRequestId: number): Promise<number> {
        const result = await this.db.prepare(`
            UPDATE competition_requests 
            SET status = 'auto_declined' 
            WHERE competition_id = ? AND id != ? AND status = 'pending'
        `).bind(competitionId, exceptRequestId).run();
        return result.meta.changes;
    }

    /**
     * Delete pending requests from user on time-conflicting competitions
     * حذف الطلبات المعلقة من المستخدم على منافسات متعارضة بالوقت
     */
    async deleteConflictingRequests(requesterId: number, scheduledAt: string | null): Promise<number> {
        if (!scheduledAt) return 0;

        // Delete pending requests from this user on competitions scheduled within 2 hours
        const result = await this.db.prepare(`
            DELETE FROM competition_requests 
            WHERE requester_id = ? 
            AND status = 'pending' 
            AND competition_id IN (
                SELECT id FROM competitions 
                WHERE scheduled_at IS NOT NULL 
                AND abs(strftime('%s', scheduled_at) - strftime('%s', ?)) < 7200
            )
        `).bind(requesterId, scheduledAt).run();
        return result.meta.changes;
    }

    /**
     * Delete a user's pending requests on immediate (unscheduled) competitions.
     * حذف طلبات المستخدم المعلقة على المنافسات الفورية
     */
    async deletePendingImmediate(requesterId: number): Promise<number> {
        const result = await this.db.prepare(`
            DELETE FROM competition_requests 
            WHERE requester_id = ? 
            AND competition_id IN (SELECT id FROM competitions WHERE scheduled_at IS NULL)
        `).bind(requesterId).run();
        return result.meta.changes;
    }

    /**
     * Delete a user's pending requests on competitions scheduled within a window (seconds).
     * حذف الطلبات المعلقة داخل نافذة زمنية
     */
    async deletePendingInTimeWindow(
        requesterId: number,
        scheduledAt: string,
        windowSeconds: number
    ): Promise<number> {
        const result = await this.db.prepare(`
            DELETE FROM competition_requests 
            WHERE requester_id = ? 
            AND competition_id IN (
                SELECT id FROM competitions 
                WHERE scheduled_at IS NOT NULL 
                AND ABS(strftime('%s', scheduled_at) - strftime('%s', ?)) < ?
            )
        `).bind(requesterId, scheduledAt, windowSeconds).run();
        return result.meta.changes;
    }

    /**
     * Accept a request atomically: guarded setOpponent + accept this request +
     * decline the competing requests/invitations — ONE serialized db.batch().
     * The caller inspects results[0].meta.changes to detect a lost race; the
     * dependent steps re-check competitions.opponent_id because db.batch()
     * never short-circuits on changes = 0.
     */
    async acceptRequestAtomic(
        competitionId: number,
        requestId: number,
        requesterId: number
    ): Promise<D1Result[]> {
        return this.db.batch([
            // 1. Atomically set opponent (only if opponent_id IS NULL)
            this.db.prepare(
                'UPDATE competitions SET opponent_id = ?, status = \'accepted\' WHERE id = ? AND opponent_id IS NULL'
            ).bind(requesterId, competitionId),
            // 2. Accept this request — ONLY if step 1 actually won the opponent slot
            this.db.prepare(
                `UPDATE competition_requests SET status = 'accepted', updated_at = datetime('now')
                 WHERE id = ? AND EXISTS (
                     SELECT 1 FROM competitions WHERE id = ? AND opponent_id = ?
                 )`
            ).bind(requestId, competitionId, requesterId),
            // 3. Decline all other pending requests for this competition — same guard
            this.db.prepare(
                `UPDATE competition_requests SET status = 'rejected', updated_at = datetime('now')
                 WHERE competition_id = ? AND id != ? AND status = 'pending' AND EXISTS (
                     SELECT 1 FROM competitions WHERE id = ? AND opponent_id = ?
                 )`
            ).bind(competitionId, requestId, competitionId, requesterId),
            // 4. Decline all pending invitations for this competition — same guard
            this.db.prepare(
                `UPDATE competition_invitations SET status = 'declined'
                 WHERE competition_id = ? AND status = 'pending' AND EXISTS (
                     SELECT 1 FROM competitions WHERE id = ? AND opponent_id = ?
                 )`
            ).bind(competitionId, competitionId, requesterId),
        ]);
    }

    /**
     * Expire old requests (cron job)
     * إنهاء الطلبات القديمة
     */
    async expireOldRequests(): Promise<number> {
        const result = await this.db.prepare(`
            UPDATE competition_requests 
            SET status = 'expired', updated_at = datetime('now')
            WHERE status = 'pending' AND expires_at < datetime('now')
        `).run();

        return result.meta.changes || 0;
    }
}
