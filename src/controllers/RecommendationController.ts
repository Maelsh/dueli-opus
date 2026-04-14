/**
 * @file src/controllers/RecommendationController.ts
 * @description Recommendation controller with graceful degradation and mini-stats
 * @module controllers/RecommendationController
 */

import { Context } from 'hono';
import { Bindings, Variables } from '../config/types';
import { BaseController } from './base/BaseController';
import { CompetitionModel } from '../models/CompetitionModel';
import { WatchHistoryModel } from '../models/WatchHistoryModel';
import { RecommendationEngine } from '../lib/services/RecommendationEngine';

/**
 * Recommendation Controller Class
 * Task 7: Advanced Recommendation Engine with graceful degradation
 */
export class RecommendationController extends BaseController {

    /**
     * Get personalized recommendations
     * GET /api/recommendations
     *
     * Query params:
     * - limit: results per page (default 20)
     * - offset: pagination offset (default 0)
     */
    async getRecommendations(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const user = this.getCurrentUser(c);
            const limit = this.getQueryInt(c, 'limit') || 20;
            const offset = this.getQueryInt(c, 'offset') || 0;
            const lang = c.get('lang') || 'ar';

            if (!user) {
                return await this.getGuestRecommendations(c, limit, offset, lang);
            }

            return await this.getUserRecommendations(c, user.id, limit, offset, lang);
        } catch (error) {
            console.error('Recommendations error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get competitor mini-stats for a user profile
     * GET /api/recommendations/competitor-stats/:userId
     */
    async getCompetitorStats(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const userId = this.getQueryInt(c, 'userId') || parseInt(c.req.param('userId') || '0');
            if (!userId) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }

            const engine = new RecommendationEngine(c.env.DB);
            const stats = await engine.getCompetitorMiniStats(userId);
            return this.success(c, stats);
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Guest recommendations (no login) - newest + most viewed with graceful degradation
     */
    private async getGuestRecommendations(
        c: Context<{ Bindings: Bindings; Variables: Variables }>,
        limit: number,
        offset: number,
        lang: string
    ) {
        const db = c.env.DB;

        const competitions = await db.prepare(`
            SELECT c.*,
                   cat.name_${lang} as category_name,
                   cat.slug as category_slug,
                   cat.icon as category_icon,
                   cat.color as category_color,
                   u.username as creator_username,
                   u.display_name as creator_name,
                   u.avatar_url as creator_avatar,
                   CASE WHEN c.language = ? THEN 25 ELSE 0 END
                   + COALESCE(c.total_views, 0) * 0.01
                   + CASE WHEN c.created_at > datetime('now', '-1 day') THEN 10
                          WHEN c.created_at > datetime('now', '-3 days') THEN 7
                          WHEN c.created_at > datetime('now', '-7 days') THEN 4
                          ELSE 0 END
                   as score
            FROM competitions c
            JOIN categories cat ON c.category_id = cat.id
            JOIN users u ON c.creator_id = u.id
            WHERE c.status = 'completed'
            AND c.vod_url IS NOT NULL
            ORDER BY score DESC, c.created_at DESC
            LIMIT ? OFFSET ?
        `).bind(lang, limit, offset).all();

        const totalCount = await db.prepare(`
            SELECT COUNT(*) as total FROM competitions
            WHERE status = 'completed' AND vod_url IS NOT NULL
        `).first<{ total: number }>();

        return this.success(c, {
            competitions: competitions.results || [],
            hasMore: (offset + limit) < (totalCount?.total || 0),
            totalAvailable: totalCount?.total || 0
        });
    }

    /**
     * Personalized user recommendations with graceful degradation for infinite scroll
     */
    private async getUserRecommendations(
        c: Context<{ Bindings: Bindings; Variables: Variables }>,
        userId: number,
        limit: number,
        offset: number,
        lang: string
    ) {
        const engine = new RecommendationEngine(c.env.DB);
        const result = await engine.getRecommendations(userId, limit, offset);

        const competitions = result.results.map((item: any) => ({
            ...item,
            category_name: item[`category_name_${lang}`] || item.category_name_en,
            category_slug: item.category_slug,
            category_icon: item.category_icon,
            category_color: item.category_color,
            creator_name: item.creator_display_name || item.creator_name,
            creator_username: item.creator_username,
            creator_avatar: item.creator_avatar,
            opponent_name: item.opponent_display_name || item.opponent_name,
            opponent_username: item.opponent_username,
            opponent_avatar: item.opponent_avatar,
        }));

        return this.success(c, {
            competitions,
            hasMore: result.hasMore,
            totalAvailable: result.totalAvailable
        });
    }
}

export default RecommendationController;
