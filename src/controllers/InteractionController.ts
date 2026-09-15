/**
 * @file src/controllers/InteractionController.ts
 * @description متحكم التفاعلات (الإعجابات والبلاغات)
 * @module controllers/InteractionController
 */

import { Context } from 'hono';
import { Bindings, Variables } from '../config/types';
import { BaseController } from './base/BaseController';
import { LikeModel, ReactionType } from '../models/LikeModel';
import { ReportModel, CreateReportData, REPORT_REASONS, ReportTargetType } from '../models/ReportModel';
import { BlockedInteractionError } from '../lib/errors/AppError';

/**
 * Interaction Controller Class
 * متحكم التفاعلات
 */
export class InteractionController extends BaseController {

    // =====================================
    // Likes - الإعجابات
    // =====================================

    /**
     * Like a competition
     * POST /api/competitions/:id/like
     *
     * B8: this is now an atomic "set like" — if the user was disliking the
     * competition, the dislike is cleared in the same transaction. Repeating
     * the call is idempotent instead of a 400.
     */
    async likeCompetition(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        return this.setReaction(c, 'like');
    }

    /**
     * Dislike a competition
     * POST /api/competitions/:id/dislike
     *
     * B8: the missing half of the like/dislike pair — same atomic path as
     * `likeCompetition`, so a dislike clears an existing like.
     */
    async dislikeCompetition(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        return this.setReaction(c, 'dislike');
    }

    /**
     * Unlike a competition
     * DELETE /api/competitions/:id/like
     */
    async unlikeCompetition(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        return this.clearReaction(c, 'like', 'like.not_found');
    }

    /**
     * Remove a dislike
     * DELETE /api/competitions/:id/dislike
     */
    async undislikeCompetition(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        return this.clearReaction(c, 'dislike', 'interactions.dislike_not_found');
    }

    /**
     * B8: shared write path for both reactions — auth, id validation, then the
     * single atomic model call. Throws are mapped once, so like and dislike can
     * never drift apart in behaviour (both honour the central B6 block guard).
     */
    private async setReaction(c: Context<{ Bindings: Bindings; Variables: Variables }>, type: ReactionType) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);

            const competitionId = this.getParamInt(c, 'id');
            if (!competitionId) {
                return this.validationError(c, this.t('errors.invalid_id', c));
            }

            const likeModel = new LikeModel(c.env.DB);
            const status = await likeModel.setReaction(user.id, competitionId, type);

            return this.success(c, status);
        } catch (error) {
            if (error instanceof BlockedInteractionError) {
                return this.forbidden(c, this.t('errors.blocked_interaction', c));
            }
            console.error(`Set ${type} reaction error:`, error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * B8: shared delete path for both reactions.
     */
    private async clearReaction(
        c: Context<{ Bindings: Bindings; Variables: Variables }>,
        type: ReactionType,
        notFoundKey: string
    ) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);

            const competitionId = this.getParamInt(c, 'id');
            if (!competitionId) {
                return this.validationError(c, this.t('errors.invalid_id', c));
            }

            const likeModel = new LikeModel(c.env.DB);
            const { removed, ...status } = await likeModel.clearReaction(user.id, competitionId, type);

            if (!removed) {
                return this.error(c, this.t(notFoundKey, c), 404);
            }

            return this.success(c, status);
        } catch (error) {
            console.error(`Clear ${type} reaction error:`, error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get like/dislike status and counts
     * GET /api/competitions/:id/like
     *
     * B8: returns the four fields in one shape for both reactions.
     */
    async getLikeStatus(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const competitionId = this.getParamInt(c, 'id');
            if (!competitionId) {
                return this.validationError(c, this.t('errors.invalid_id', c));
            }

            const likeModel = new LikeModel(c.env.DB);
            const user = this.getCurrentUser(c);
            const status = await likeModel.getStatus(user?.id ?? null, competitionId);

            return this.success(c, status);
        } catch (error) {
            console.error('Get like status error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get users who liked a competition
     * GET /api/competitions/:id/likes
     */
    async getLikers(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const competitionId = this.getParamInt(c, 'id');
            if (!competitionId) {
                return this.validationError(c, this.t('errors.invalid_id', c));
            }

            const limit = this.getQueryInt(c, 'limit') || 20;
            const offset = this.getQueryInt(c, 'offset') || 0;

            const likeModel = new LikeModel(c.env.DB);
            const likers = await likeModel.getLikers(competitionId, limit, offset);
            const total = await likeModel.getLikeCount(competitionId);

            return this.success(c, {
                items: likers,
                total,
                hasMore: offset + limit < total
            });
        } catch (error) {
            console.error('Get likers error:', error);
            return this.serverError(c, error as Error);
        }
    }

    // =====================================
    // Reports - البلاغات
    // =====================================

    /**
     * Submit a report
     * POST /api/reports
     */
    async submitReport(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);

            const body = await this.getBody<{
                target_type: ReportTargetType;
                target_id: number;
                reason: string;
                description?: string;
            }>(c);

            if (!body || !body.target_type || !body.target_id || !body.reason) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }

            // Validate target type
            if (!['user', 'competition', 'comment', 'message', 'ad'].includes(body.target_type)) {
                return this.validationError(c, this.t('report.invalid_target', c));
            }

            // Validate reason
            const validReasons = REPORT_REASONS[body.target_type];
            if (!validReasons.includes(body.reason as any)) {
                return this.validationError(c, this.t('report.invalid_reason', c));
            }

            // Cannot report yourself
            if (body.target_type === 'user' && body.target_id === user.id) {
                return this.validationError(c, this.t('report.cannot_report_self', c));
            }

            const reportModel = new ReportModel(c.env.DB);

            // Check for duplicate
            if (await reportModel.hasReported(user.id, body.target_type, body.target_id)) {
                return this.error(c, this.t('report.already_reported', c), 400);
            }

            const reportData: CreateReportData = {
                reporter_id: user.id,
                target_type: body.target_type,
                target_id: body.target_id,
                reason: body.reason,
                description: body.description
            };

            const report = await reportModel.createReport(reportData);
            if (!report) {
                return this.serverError(c, new Error('Failed to create report'));
            }

            return this.success(c, {
                report_id: report.id
            });
        } catch (error) {
            console.error('Submit report error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get report reasons (for UI)
     * GET /api/reports/reasons
     */
    async getReportReasons(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        return this.success(c, { reasons: REPORT_REASONS });
    }
}

export default InteractionController;
