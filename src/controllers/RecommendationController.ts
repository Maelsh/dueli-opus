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
import { RecommendationModel, GuestSuggestedProvider } from '../models/RecommendationModel';
import { RecommendationEngine } from '../lib/services/RecommendationEngine';
import { ExploreSessionService } from '../lib/services/ExploreSessionService';
import { normalizeContentLanguage } from '../i18n';

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
            // Post-R1 acceptance (E): the request language is user input and
            // only ar/en have backing columns — normalize BEFORE any SQL
            // interpolation so unsupported values can never become identifiers.
            const lang = normalizeContentLanguage(c.get('lang') || 'ar');

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
     * Guest recommendations (no login) — newest + most viewed with graceful degradation.
     *
     * R3-GUEST-1: the query lives in RecommendationModel (MVC); the eligible
     * set is every PUBLIC competition (pending/accepted/live + completed with
     * a playable recording — 05 §4), scored with the unchanged weights. The
     * Home guest rail pages this same set to exhaustion through the frozen
     * suggested-sessions below instead of a single LIMIT batch.
     */
    private async getGuestRecommendations(
        c: Context<{ Bindings: Bindings; Variables: Variables }>,
        limit: number,
        offset: number,
        lang: string
    ) {
        const model = new RecommendationModel(c.env.DB);

        const competitions = await model.findGuestSuggestedPage(lang, limit, offset);
        const total = await model.countGuestSuggested();

        return this.success(c, {
            competitions: competitions || [],
            hasMore: (offset + limit) < total,
            totalAvailable: total
        });
    }

    /**
     * R3-GUEST-1: freeze one guest suggestion session (stable scored order).
     * POST /api/recommendations/suggested-sessions
     *
     * Public (auth-optional): caller is the logged-in user when a valid
     * session is present, otherwise a first-party guest token — issued here
     * on first visit, persisted in the caller's own storage, never an IP.
     * MVC: all persistence lives in the Models + ExploreSessionService.
     */
    async createSuggestedSession(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const lang = normalizeContentLanguage(c.get('lang') || 'ar');

            const currentUser = this.getCurrentUser(c);
            const userId = typeof currentUser?.id === 'number' ? currentUser.id : null;
            const presentedGuest = c.req.header('X-Guest-Token') ?? null;
            const { identity, issuedGuestToken } = ExploreSessionService.identityForCreate(userId, presentedGuest);

            const service = new ExploreSessionService(c.env.DB);
            const { session } = await service.createSessionWithProvider(
                identity,
                new GuestSuggestedProvider(),
                lang
            );

            return this.success(c, {
                session: { id: session.id, total: session.total_count, expires_at: session.expires_at },
                guest_token: issuedGuestToken,
            }, 201);
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * R3-GUEST-1: read one page of a frozen guest suggestion session.
     * GET /api/recommendations/suggested-sessions/:id/page?cursor&limit
     */
    async readSuggestedSessionPage(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const sessionId = this.getParam(c, 'id');
            const lang = normalizeContentLanguage(c.get('lang') || 'ar');

            const currentUser = this.getCurrentUser(c);
            const userId = typeof currentUser?.id === 'number' ? currentUser.id : null;
            const presentedGuest = c.req.header('X-Guest-Token') ?? null;
            const identity = ExploreSessionService.identityForRead(userId, presentedGuest);

            const service = new ExploreSessionService(c.env.DB);
            const outcome = await service.readPageWithProvider(identity, sessionId, {
                cursor: c.req.query('cursor') ?? null,
                limit: c.req.query('limit') ?? undefined,
                provider: new GuestSuggestedProvider(),
                lang,
            });

            if ('failure' in outcome) {
                const code = outcome.failure;
                if (code === 'session_not_found') return this.notFound(c);
                if (code === 'session_expired') return this.error(c, this.t('errors.session_expired', c), 410);
                if (code === 'session_building') return this.error(c, this.t('errors.retry', c), 409);
                if (code === 'session_context_mismatch') {
                    return this.error(c, this.t('errors.invalid_request', c), 409);
                }
                return this.validationError(c, this.t('errors.invalid_request', c));
            }

            return this.success(c, {
                items: outcome.page.items,
                nextCursor: outcome.page.nextCursor,
                hasMore: outcome.page.hasMore,
                session: outcome.page.session,
            });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
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
