/**
 * @file src/controllers/InteractionController.ts
 * @description متحكم التفاعلات (الإعجابات والبلاغات)
 * @module controllers/InteractionController
 */

import { Context } from 'hono';
import { Bindings, Variables } from '../config/types';
import { BaseController } from './base/BaseController';
import { LikeModel } from '../models/LikeModel';
import { ReportModel, CreateReportData, REPORT_REASONS, ReportTargetType } from '../models/ReportModel';

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
     */
    async likeCompetition(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);

            const competitionId = this.getParamInt(c, 'id');
            if (!competitionId) {
                return this.validationError(c, this.t('errors.invalid_id', c));
            }

            const likeModel = new LikeModel(c.env.DB);

            // Check if already liked
            if (await likeModel.hasLiked(user.id, competitionId)) {
                return this.error(c, this.t('like.already_liked', c), 400);
            }

            const like = await likeModel.addLike(user.id, competitionId);
            if (!like) {
                return this.serverError(c, new Error('Failed to add like'));
            }

            const likeCount = await likeModel.getLikeCount(competitionId);

            return this.success(c, {
                liked: true,
                likeCount
            });
        } catch (error) {
            console.error('Like competition error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Unlike a competition
     * DELETE /api/competitions/:id/like
     */
    async unlikeCompetition(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);

            const competitionId = this.getParamInt(c, 'id');
            if (!competitionId) {
                return this.validationError(c, this.t('errors.invalid_id', c));
            }

            const likeModel = new LikeModel(c.env.DB);
            const removed = await likeModel.removeLike(user.id, competitionId);

            if (!removed) {
                return this.error(c, this.t('like.not_found', c), 404);
            }

            const likeCount = await likeModel.getLikeCount(competitionId);

            return this.success(c, {
                liked: false,
                likeCount
            });
        } catch (error) {
            console.error('Unlike competition error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get like status and count
     * GET /api/competitions/:id/like
     */
    async getLikeStatus(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const competitionId = this.getParamInt(c, 'id');
            if (!competitionId) {
                return this.validationError(c, this.t('errors.invalid_id', c));
            }

            const likeModel = new LikeModel(c.env.DB);
            const user = this.getCurrentUser(c);

            const likeCount = await likeModel.getLikeCount(competitionId);
            const liked = user ? await likeModel.hasLiked(user.id, competitionId) : false;

            return this.success(c, { liked, likeCount });
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
            if (!['user', 'competition', 'comment'].includes(body.target_type)) {
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
