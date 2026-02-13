/**
 * Competition Controller
 * متحكم المنافسات
 * 
 * Full MVC-compliant controller for all competition operations.
 */

import { BaseController, AppContext } from './base/BaseController';
import {
    CompetitionModel,
    CompetitionFilters,
    CommentModel,
    NotificationModel,
    UserModel
} from '../models';

/**
 * Competition Request Model (inline - should be in separate file)
 */
class CompetitionRequestModel {
    constructor(private db: D1Database) { }

    async create(competitionId: number, requesterId: number, message?: string): Promise<{ id: number }> {
        const result = await this.db.prepare(`
            INSERT INTO competition_requests (competition_id, requester_id, message, status, created_at)
            VALUES (?, ?, ?, 'pending', datetime('now'))
        `).bind(competitionId, requesterId, message || null).run();
        return { id: result.meta.last_row_id as number };
    }

    async findPending(competitionId: number, requesterId: number): Promise<any> {
        return await this.db.prepare(`
            SELECT * FROM competition_requests 
            WHERE competition_id = ? AND requester_id = ? AND status = 'pending'
        `).bind(competitionId, requesterId).first();
    }

    async findById(id: number): Promise<any> {
        return await this.db.prepare('SELECT * FROM competition_requests WHERE id = ?').bind(id).first();
    }

    async updateStatus(id: number, status: string): Promise<boolean> {
        const result = await this.db.prepare(
            'UPDATE competition_requests SET status = ? WHERE id = ?'
        ).bind(status, id).run();
        return result.meta.changes > 0;
    }

    async delete(competitionId: number, requesterId: number): Promise<boolean> {
        const result = await this.db.prepare(
            'DELETE FROM competition_requests WHERE competition_id = ? AND requester_id = ? AND status = "pending"'
        ).bind(competitionId, requesterId).run();
        return result.meta.changes > 0;
    }

    async findByCompetition(competitionId: number): Promise<any[]> {
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
}

/**
 * Rating Model (inline)
 */
class RatingModel {
    constructor(private db: D1Database) { }

    async create(competitionId: number, userId: number, competitorId: number, rating: number): Promise<{ id: number }> {
        const result = await this.db.prepare(`
            INSERT INTO ratings (competition_id, user_id, competitor_id, rating, created_at)
            VALUES (?, ?, ?, ?, datetime('now'))
        `).bind(competitionId, userId, competitorId, rating).run();
        return { id: result.meta.last_row_id as number };
    }

    async hasRated(competitionId: number, userId: number, competitorId: number): Promise<boolean> {
        const result = await this.db.prepare(`
            SELECT 1 FROM ratings WHERE competition_id = ? AND user_id = ? AND competitor_id = ?
        `).bind(competitionId, userId, competitorId).first();
        return result !== null;
    }

    async findByCompetition(competitionId: number): Promise<any[]> {
        const result = await this.db.prepare(`
            SELECT r.*, u.display_name, u.avatar_url
            FROM ratings r
            JOIN users u ON r.user_id = u.id
            WHERE r.competition_id = ?
            ORDER BY r.created_at DESC
        `).bind(competitionId).all();
        return result.results;
    }
}

/**
 * Competition Controller Class
 * متحكم المنافسات
 */
export class CompetitionController extends BaseController {

    /**
     * List competitions with filters
     * GET /api/competitions
     */
    async list(c: AppContext) {
        try {
            const model = new CompetitionModel(c.env.DB);
            const filters: CompetitionFilters = {
                status: this.getQuery(c, 'status') as any || undefined,
                category: this.getQuery(c, 'category') || undefined,
                subcategory: this.getQuery(c, 'subcategory') || undefined,
                country: this.getQuery(c, 'country') || undefined,
                language: this.getQuery(c, 'language') || undefined,
                search: this.getQuery(c, 'search') || undefined,
                creatorId: this.getQueryInt(c, 'creator') || undefined,
                userId: this.getQueryInt(c, 'user') || undefined, // creator OR opponent
                limit: this.getQueryInt(c, 'limit', 20),
                offset: this.getQueryInt(c, 'offset', 0)
            };

            const competitions = await model.findByFilters(filters);
            return this.success(c, competitions);
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get single competition with details
     * GET /api/competitions/:id
     */
    async show(c: AppContext) {
        try {
            const model = new CompetitionModel(c.env.DB);
            const commentModel = new CommentModel(c.env.DB);
            const requestModel = new CompetitionRequestModel(c.env.DB);
            const ratingModel = new RatingModel(c.env.DB);

            const id = this.getParamInt(c, 'id');
            const competition = await model.findWithDetails(id);

            if (!competition) {
                return this.notFound(c, this.t('competition_errors.not_found', c));
            }

            await model.incrementViews(id);

            const comments = await commentModel.findByCompetition(id);
            const requests = await requestModel.findByCompetition(id);
            const ratings = await ratingModel.findByCompetition(id);

            return this.success(c, {
                ...competition,
                comments,
                requests,
                ratings
            });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Create competition
     * POST /api/competitions
     */
    async create(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);

            const body = await this.getBody<{
                title: string;
                description?: string;
                rules: string;
                category_id: number;
                subcategory_id?: number;
                language?: string;
                country?: string;
                scheduled_at?: string;
            }>(c);

            if (!body?.title || !body?.rules || !body?.category_id) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }

            const model = new CompetitionModel(c.env.DB);
            const competition = await model.create({
                ...body,
                creator_id: user.id,
                language: body.language || this.getLanguage(c)
            });

            return this.success(c, competition, 201);
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Update competition
     * PUT /api/competitions/:id
     */
    async update(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const id = this.getParamInt(c, 'id');

            const model = new CompetitionModel(c.env.DB);
            const competition = await model.findById(id);

            if (!competition) {
                return this.notFound(c);
            }

            if (competition.creator_id !== user.id) {
                return this.forbidden(c);
            }

            const body = await this.getBody<Partial<{
                title: string;
                description: string;
                rules: string;
            }>>(c);

            const updated = await model.update(id, body || {});
            return this.success(c, updated);
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Delete competition
     * DELETE /api/competitions/:id
     */
    async delete(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const id = this.getParamInt(c, 'id');

            const model = new CompetitionModel(c.env.DB);
            const competition = await model.findById(id);

            if (!competition) {
                return this.notFound(c);
            }

            if (competition.creator_id !== user.id) {
                return this.forbidden(c);
            }

            await model.delete(id);
            return this.success(c, { deleted: true });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Request to join competition
     * POST /api/competitions/:id/request
     */
    async requestJoin(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const competitionId = this.getParamInt(c, 'id');

            const model = new CompetitionModel(c.env.DB);
            const requestModel = new CompetitionRequestModel(c.env.DB);
            const notificationModel = new NotificationModel(c.env.DB);

            const competition = await model.findById(competitionId);
            if (!competition) {
                return this.notFound(c);
            }

            if (competition.creator_id === user.id) {
                return this.error(c, this.t('competition_errors.cannot_join_own', c));
            }

            const existing = await requestModel.findPending(competitionId, user.id);
            if (existing) {
                return this.error(c, this.t('competition_errors.already_requested', c));
            }

            const body = await this.getBody<{ message?: string }>(c);
            const request = await requestModel.create(competitionId, user.id, body?.message);

            await notificationModel.create({
                user_id: competition.creator_id,
                type: 'request',
                title: this.t('notification.new_join_request', c),
                message: `${user.display_name || user.username}: ${competition.title}`,
                reference_type: 'competition',
                reference_id: competitionId
            });

            return this.success(c, request, 201);
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Cancel join request
     * DELETE /api/competitions/:id/request
     */
    async cancelRequest(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const competitionId = this.getParamInt(c, 'id');

            const requestModel = new CompetitionRequestModel(c.env.DB);
            const deleted = await requestModel.delete(competitionId, user.id);

            if (!deleted) {
                return this.notFound(c);
            }

            return this.success(c, { cancelled: true });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Accept join request
     * POST /api/competitions/:id/accept-request
     */
    async acceptRequest(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const competitionId = this.getParamInt(c, 'id');

            const model = new CompetitionModel(c.env.DB);
            const requestModel = new CompetitionRequestModel(c.env.DB);
            const notificationModel = new NotificationModel(c.env.DB);

            const competition = await model.findById(competitionId);
            if (!competition) {
                return this.notFound(c);
            }

            if (competition.creator_id !== user.id) {
                return this.forbidden(c);
            }

            const body = await this.getBody<{ request_id: number }>(c);
            if (!body?.request_id) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }

            const request = await requestModel.findById(body.request_id);
            if (!request || request.competition_id !== competitionId) {
                return this.notFound(c);
            }

            await requestModel.updateStatus(body.request_id, 'accepted');
            await model.setOpponent(competitionId, request.requester_id);

            // Auto-decline all other pending requests on this competition
            const declinedCount = await requestModel.declineAllOther(competitionId, body.request_id);

            // Decline all pending invitations for this competition
            await c.env.DB.prepare(`
                UPDATE competition_invitations SET status = 'declined' 
                WHERE competition_id = ? AND status = 'pending'
            `).bind(competitionId).run();

            // AUTO-DELETE LOGIC: Delete accepted user's conflicting competitions and requests
            const autoDeletedCount = await this.handleAutoDeleteOnJoin(c, request.requester_id, competition);

            await notificationModel.create({
                user_id: request.requester_id,
                type: 'request',
                title: this.t('notification.request_accepted', c),
                message: this.t('notification.request_accepted_message', c),
                reference_type: 'competition',
                reference_id: competitionId
            });

            return this.success(c, {
                accepted: true,
                otherDeclined: declinedCount,
                autoDeleted: autoDeletedCount
            });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Decline join request
     * POST /api/competitions/:id/decline-request
     */
    async declineRequest(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const competitionId = this.getParamInt(c, 'id');

            const model = new CompetitionModel(c.env.DB);
            const requestModel = new CompetitionRequestModel(c.env.DB);

            const competition = await model.findById(competitionId);
            if (!competition || competition.creator_id !== user.id) {
                return this.forbidden(c);
            }

            const body = await this.getBody<{ request_id: number }>(c);
            if (!body?.request_id) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }

            await requestModel.updateStatus(body.request_id, 'declined');
            return this.success(c, { declined: true });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Start competition (go live) - supports YouTube and P2P
     * POST /api/competitions/:id/start
     */
    async start(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const id = this.getParamInt(c, 'id');

            const model = new CompetitionModel(c.env.DB);
            const competition = await model.findById(id);

            if (!competition) {
                return this.notFound(c);
            }

            // Allow both creator and opponent to start
            if (competition.creator_id !== user.id && competition.opponent_id !== user.id) {
                return this.forbidden(c);
            }

            // Must have opponent to start
            if (!competition.opponent_id) {
                return this.error(c, 'Cannot start without opponent');
            }

            const body = await this.getBody<{
                youtube_live_id?: string;
                live_url?: string;
            }>(c);

            await model.startLive(id, {
                youtubeLiveId: body?.youtube_live_id,
                liveUrl: body?.live_url
            });

            return this.success(c, { started: true, status: 'live' });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * End competition - supports YouTube and P2P
     * POST /api/competitions/:id/end
     */
    async end(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const id = this.getParamInt(c, 'id');

            const model = new CompetitionModel(c.env.DB);
            const competition = await model.findById(id);

            if (!competition) {
                return this.notFound(c);
            }

            if (competition.creator_id !== user.id) {
                return this.forbidden(c);
            }

            const body = await this.getBody<{
                youtube_video_url?: string;
                vod_url?: string;
            }>(c);

            await model.complete(id, {
                youtubeVideoUrl: body?.youtube_video_url,
                vodUrl: body?.vod_url
            });

            // Delete chunk keys when competition ends (live → completed)
            // حذف مفاتيح القطع عند تحول المنافسة من حية لمسجلة
            await c.env.DB.prepare(
                'DELETE FROM chunk_keys WHERE competition_id = ?'
            ).bind(id).run();

            return this.success(c, { ended: true, status: 'completed' });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Update VOD URL after finalization
     * POST /api/competitions/:id/update-vod
     */
    async updateVod(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const id = this.getParamInt(c, 'id');

            const model = new CompetitionModel(c.env.DB);
            const competition = await model.findById(id);

            if (!competition) {
                return this.notFound(c);
            }

            if (competition.creator_id !== user.id) {
                return this.forbidden(c);
            }

            const body = await this.getBody<{ vod_url: string }>(c);
            if (!body?.vod_url) {
                return this.validationError(c, 'vod_url is required');
            }

            await model.setVodUrl(id, body.vod_url);

            return this.success(c, { updated: true, vod_url: body.vod_url });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Add comment
     * POST /api/competitions/:id/comments
     */
    async addComment(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const competitionId = this.getParamInt(c, 'id');

            const body = await this.getBody<{ content: string; is_live?: boolean }>(c);
            if (!body?.content) {
                return this.validationError(c, this.t('errors.content_required', c));
            }

            const model = new CompetitionModel(c.env.DB);
            const competition = await model.findById(competitionId);
            if (!competition) {
                return this.notFound(c);
            }

            const commentModel = new CommentModel(c.env.DB);
            const comment = await commentModel.create({
                competition_id: competitionId,
                user_id: user.id,
                content: body.content,
                is_live: body.is_live || false
            });

            return this.success(c, comment, 201);
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Delete comment
     * DELETE /api/competitions/:competitionId/comments/:commentId
     */
    async deleteComment(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const competitionId = this.getParamInt(c, 'competitionId');
            const commentId = this.getParamInt(c, 'commentId');

            const model = new CompetitionModel(c.env.DB);
            const commentModel = new CommentModel(c.env.DB);

            const competition = await model.findById(competitionId);
            const comment = await commentModel.findById(commentId);

            if (!competition || !comment) {
                return this.notFound(c);
            }

            // Can delete if owner of comment or competition creator
            if (comment.user_id !== user.id && competition.creator_id !== user.id) {
                return this.forbidden(c);
            }

            await commentModel.delete(commentId);
            return this.success(c, { deleted: true });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Rate competitor
     * POST /api/competitions/:id/rate
     */
    async rate(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const competitionId = this.getParamInt(c, 'id');

            const body = await this.getBody<{
                competitor_id: number;
                rating: number;
            }>(c);

            if (!body?.competitor_id || !body?.rating) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }

            if (body.rating < 1 || body.rating > 5) {
                return this.validationError(c, this.t('errors.invalid_rating', c));
            }

            const model = new CompetitionModel(c.env.DB);
            const ratingModel = new RatingModel(c.env.DB);

            const competition = await model.findById(competitionId);
            if (!competition || competition.status !== 'completed') {
                return this.error(c, this.t('competition_errors.not_completed', c));
            }

            const hasRated = await ratingModel.hasRated(competitionId, user.id, body.competitor_id);
            if (hasRated) {
                return this.error(c, this.t('competition_errors.already_rated', c));
            }

            const rating = await ratingModel.create(
                competitionId,
                user.id,
                body.competitor_id,
                body.rating
            );

            return this.success(c, rating, 201);
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get competition requests
     * GET /api/competitions/:id/requests
     */
    async getRequests(c: AppContext) {
        try {
            const competitionId = this.getParamInt(c, 'id');
            const requestModel = new CompetitionRequestModel(c.env.DB);
            const requests = await requestModel.findByCompetition(competitionId);
            return this.success(c, requests);
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Invite user to competition
     * POST /api/competitions/:id/invite
     */
    async invite(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const competitionId = this.getParamInt(c, 'id');

            const model = new CompetitionModel(c.env.DB);
            const notificationModel = new NotificationModel(c.env.DB);
            const competition = await model.findById(competitionId);

            if (!competition) return this.notFound(c);
            if (competition.creator_id !== user.id) return this.forbidden(c);
            if (competition.opponent_id) return this.error(c, 'Competition already has opponent');

            const body = await this.getBody<{ invitee_id: number; message?: string }>(c);
            if (!body?.invitee_id) return this.validationError(c, 'invitee_id required');
            if (body.invitee_id === user.id) return this.error(c, 'Cannot invite yourself');

            // Check if already invited
            const existing = await c.env.DB.prepare(`
                SELECT id FROM competition_invitations 
                WHERE competition_id = ? AND invitee_id = ? AND status = 'pending'
            `).bind(competitionId, body.invitee_id).first();

            if (existing) return this.error(c, 'User already invited');

            // Create invitation
            const result = await c.env.DB.prepare(`
                INSERT INTO competition_invitations (competition_id, inviter_id, invitee_id, message, status, created_at)
                VALUES (?, ?, ?, ?, 'pending', datetime('now'))
            `).bind(competitionId, user.id, body.invitee_id, body.message || null).run();

            // Notify invitee
            await notificationModel.create({
                user_id: body.invitee_id,
                type: 'invitation',
                title: this.t('notification.competition_invite', c),
                message: `${user.display_name || user.username}: ${competition.title}`,
                reference_type: 'competition',
                reference_id: competitionId
            });

            return this.success(c, { id: result.meta.last_row_id, invited: true });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Accept invitation
     * POST /api/competitions/:id/accept-invite
     */
    async acceptInvite(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const competitionId = this.getParamInt(c, 'id');

            const model = new CompetitionModel(c.env.DB);
            const requestModel = new CompetitionRequestModel(c.env.DB);
            const notificationModel = new NotificationModel(c.env.DB);
            const competition = await model.findById(competitionId);

            if (!competition) return this.notFound(c);
            if (competition.opponent_id) return this.error(c, 'Competition already has opponent');

            // Verify invitation exists
            const invitation = await c.env.DB.prepare(`
                SELECT * FROM competition_invitations 
                WHERE competition_id = ? AND invitee_id = ? AND status = 'pending'
            `).bind(competitionId, user.id).first();

            if (!invitation) return this.error(c, 'No pending invitation found');

            // Set user as opponent
            await model.setOpponent(competitionId, user.id);

            // Update invitation status
            await c.env.DB.prepare(`
                UPDATE competition_invitations SET status = 'accepted', responded_at = datetime('now') 
                WHERE id = ?
            `).bind(invitation.id).run();

            // Decline all other invitations for this competition
            await c.env.DB.prepare(`
                UPDATE competition_invitations SET status = 'declined' 
                WHERE competition_id = ? AND id != ? AND status = 'pending'
            `).bind(competitionId, invitation.id).run();

            // Decline all pending requests for this competition
            await c.env.DB.prepare(`
                UPDATE competition_requests SET status = 'auto_declined' 
                WHERE competition_id = ? AND status = 'pending'
            `).bind(competitionId).run();

            // AUTO-DELETE LOGIC: Delete user's conflicting competitions and requests
            const deletedCount = await this.handleAutoDeleteOnJoin(c, user.id, competition);

            // Notify competition creator
            await notificationModel.create({
                user_id: competition.creator_id,
                type: 'request',
                title: this.t('notification.invitation_accepted', c),
                message: `${user.display_name || user.username}: ${competition.title}`,
                reference_type: 'competition',
                reference_id: competitionId
            });

            return this.success(c, { accepted: true, autoDeleted: deletedCount });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Decline invitation
     * POST /api/competitions/:id/decline-invite
     */
    async declineInvite(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const competitionId = this.getParamInt(c, 'id');

            const result = await c.env.DB.prepare(`
                UPDATE competition_invitations 
                SET status = 'declined', responded_at = datetime('now')
                WHERE competition_id = ? AND invitee_id = ? AND status = 'pending'
            `).bind(competitionId, user.id).run();

            if (result.meta.changes === 0) {
                return this.error(c, 'No pending invitation found');
            }

            return this.success(c, { declined: true });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Handle auto-delete logic when user joins a competition
     * Deletes conflicting competitions and requests
     */
    private async handleAutoDeleteOnJoin(c: AppContext, userId: number, joinedCompetition: any): Promise<number> {
        const notificationModel = new NotificationModel(c.env.DB);
        let deletedCount = 0;

        const isImmediate = !joinedCompetition.scheduled_at;
        const scheduledAt = joinedCompetition.scheduled_at;

        if (isImmediate) {
            // Immediate competition: delete all immediate competitions user created that don't have opponent
            const userImmediateComps = await c.env.DB.prepare(`
                SELECT id, title FROM competitions 
                WHERE creator_id = ? AND id != ? AND scheduled_at IS NULL AND opponent_id IS NULL AND status = 'pending'
            `).bind(userId, joinedCompetition.id).all();

            for (const comp of userImmediateComps.results as any[]) {
                await c.env.DB.prepare('DELETE FROM competitions WHERE id = ?').bind(comp.id).run();
                deletedCount++;

                await notificationModel.create({
                    user_id: userId,
                    type: 'system',
                    title: 'Competition Auto-Deleted',
                    message: `"${comp.title}" was deleted because you joined another competition`,
                    reference_type: 'competition',
                    reference_id: comp.id
                });
            }

            // Delete pending requests user made on other immediate competitions
            await c.env.DB.prepare(`
                DELETE FROM competition_requests 
                WHERE requester_id = ? 
                AND competition_id IN (SELECT id FROM competitions WHERE scheduled_at IS NULL)
            `).bind(userId).run();

            // Delete pending invitations user received for other immediate competitions
            await c.env.DB.prepare(`
                UPDATE competition_invitations SET status = 'expired'
                WHERE invitee_id = ? AND status = 'pending'
                AND competition_id IN (SELECT id FROM competitions WHERE scheduled_at IS NULL)
            `).bind(userId).run();

        } else {
            // Scheduled competition: delete conflicts within 2 hours
            const twoHours = 2 * 60 * 60; // seconds

            // Delete user's scheduled competitions that conflict
            const conflictingComps = await c.env.DB.prepare(`
                SELECT id, title FROM competitions 
                WHERE creator_id = ? AND id != ? AND scheduled_at IS NOT NULL AND opponent_id IS NULL
                AND ABS(strftime('%s', scheduled_at) - strftime('%s', ?)) < ?
            `).bind(userId, joinedCompetition.id, scheduledAt, twoHours).all();

            for (const comp of conflictingComps.results as any[]) {
                await c.env.DB.prepare('DELETE FROM competitions WHERE id = ?').bind(comp.id).run();
                deletedCount++;

                await notificationModel.create({
                    user_id: userId,
                    type: 'system',
                    title: 'Competition Auto-Deleted',
                    message: `"${comp.title}" was deleted due to time conflict`,
                    reference_type: 'competition',
                    reference_id: comp.id
                });
            }

            // Delete conflicting requests
            await c.env.DB.prepare(`
                DELETE FROM competition_requests 
                WHERE requester_id = ?
                AND competition_id IN (
                    SELECT id FROM competitions 
                    WHERE scheduled_at IS NOT NULL 
                    AND ABS(strftime('%s', scheduled_at) - strftime('%s', ?)) < ?
                )
            `).bind(userId, scheduledAt, twoHours).run();
        }

        return deletedCount;
    }

    /**
     * Start streaming - set user as busy
     * POST /api/competitions/:id/start-stream
     */
    async startStreaming(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            
            const id = this.getParamInt(c, 'id');
            if (!id) {
                return this.validationError(c, this.t('errors.invalid_id', c));
            }
            
            const competitionModel = new CompetitionModel(c.env.DB);
            const userModel = new UserModel(c.env.DB);
            
            const competition = await competitionModel.findById(id);
            if (!competition) {
                return this.notFound(c);
            }
            
            // Check user is participant
            if (competition.creator_id !== user.id && competition.opponent_id !== user.id) {
                return this.forbidden(c);
            }
            
            // Check user availability
            const availability = await userModel.checkAvailability(user.id);
            if (!availability.available && user.current_competition_id !== id) {
                return this.error(c, availability.reason || 'المستخدم غير متاح', 409);
            }
            
            // Set user as busy
            await userModel.setBusy(user.id, id);
            
            // Check if both are streaming → start live
            const bothStreaming = await c.env.DB.prepare(`
                SELECT 1 FROM users 
                WHERE (id = ? OR id = ?) 
                AND is_busy = 1 
                AND current_competition_id = ?
            `).bind(competition.creator_id, competition.opponent_id, id).all();
            
            if ((bothStreaming.results || []).length === 2 && competition.status !== 'live') {
                await competitionModel.updateStatus(id, 'live');
                
                // Cancel auto-delete, schedule auto-end (2 hours)
                await c.env.DB.prepare(`
                    UPDATE competition_scheduled_tasks 
                    SET status = 'cancelled' 
                    WHERE competition_id = ? AND task_type = 'auto_delete_if_not_live'
                `).bind(id).run();
                
                const endTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
                await c.env.DB.prepare(`
                    INSERT INTO competition_scheduled_tasks (competition_id, task_type, execute_at, created_at)
                    VALUES (?, 'auto_end_live', ?, datetime('now'))
                `).bind(id, endTime.toISOString()).run();
            }
            
            return this.success(c, { streaming: true });
        } catch (error) {
            console.error('Start streaming error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * End streaming - set user as free
     * POST /api/competitions/:id/end-stream
     */
    async endStreaming(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            
            const id = this.getParamInt(c, 'id');
            if (!id) {
                return this.validationError(c, this.t('errors.invalid_id', c));
            }
            
            const userModel = new UserModel(c.env.DB);
            const competitionModel = new CompetitionModel(c.env.DB);
            
            // Free user
            await userModel.setFree(user.id);
            
            const competition = await competitionModel.findById(id);
            
            // If live and other stopped → complete
            if (competition?.status === 'live') {
                const otherStillStreaming = await c.env.DB.prepare(`
                    SELECT 1 FROM users 
                    WHERE id = ? 
                    AND is_busy = 1 
                    AND current_competition_id = ?
                `).bind(
                    user.id === competition.creator_id ? competition.opponent_id : competition.creator_id,
                    id
                ).first();
                
                if (!otherStillStreaming) {
                    // Both stopped → complete
                    await competitionModel.updateStatus(id, 'completed');
                } else {
                    // Wait 3 minutes for reconnection
                    const checkTime = new Date(Date.now() + 3 * 60 * 1000);
                    await c.env.DB.prepare(`
                        INSERT INTO competition_scheduled_tasks (competition_id, task_type, execute_at, created_at)
                        VALUES (?, 'check_disconnection', ?, datetime('now'))
                    `).bind(id, checkTime.toISOString()).run();
                }
            }
            
            return this.success(c, { stopped: true });
        } catch (error) {
            console.error('End streaming error:', error);
            return this.serverError(c, error as Error);
        }
    }
}

export default CompetitionController;
