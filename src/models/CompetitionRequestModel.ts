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
     * Create a new competition request
     * إنشاء طلب انضمام جديد
     */
    async create(data: {
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
