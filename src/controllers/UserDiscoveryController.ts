/**
 * User Discovery Controller â€” R3-D2 frozen sessions.
 * ظ…طھط­ظƒظ… ط§ظƒطھط´ط§ظپ ط§ظ„ظ…ط³طھط®ط¯ظ…ظٹظ†
 *
 * MVC: routes delegate here; SQL lives in the Models; ordering in
 * H7UserRankingService; store/cursor/TTL in the session services.
 *
 * Endpoints (all freeze the FULL eligible id set at T0 â€” no first-15/100):
 * - POST/GET /api/search/users-sessions[/:id/page] â€” H7 user search
 * - POST/GET /api/users/follow-sessions[/:id/page] â€” H7 follow suggestions
 * - POST/GET /api/matchmaking/opponent-sessions[/:id/page] â€” H7 opponent
 *   candidates for one competition (competitionâ†’user duel side)
 * - POST/GET /api/competitions/participation-sessions[/:id/page] â€”
 *   userâ†’competition eligible seats, H7 inside
 * - POST/GET /api/competitions/:id/candidate-sessions[/:id/page] â€”
 *   competitionâ†’user alias over the opponent provider (same H7 + layers)
 *
 * Session semantics (آ§7): frozen order during one session, new session
 * recalculates, presence/busy drift never reorders an old scroll,
 * hard-eligibility loss is skipped + filled, no duplicates, full
 * exhaustion, no RANDOM+OFFSET, no Math.random, no client-only ranking.
 */

import { BaseController, AppContext } from './base/BaseController';
import { ExploreSessionService } from '../lib/services/ExploreSessionService';
import { UserSessionService } from '../lib/services/UserSessionService';
import {
    FollowSuggestionProvider,
    OpponentProvider,
    ParticipationProvider,
    UserSearchProvider,
} from '../models/H7UserSessionProviders';
import { normalizeContentLanguage } from '../i18n';



export class UserDiscoveryController extends BaseController {
    /** 410 retry-with-refresh for an expired session. */
    sessionExpired(c: AppContext) {
        return this.error(c, this.t('errors.session_expired', c), 410);
    }

    /** 409 translation for a session still building. */
    sessionBuilding(c: AppContext) {
        return this.error(c, this.t('errors.retry', c), 409);
    }

    /** 409 translation for a stale-context cursor. */
    sessionMismatch(c: AppContext) {
        return this.error(c, this.t('errors.invalid_request', c), 409);
    }

    /** 422 translation for a malformed cursor/limit. */
    badRequest(c: AppContext) {
        return this.validationError(c, this.t('errors.invalid_request', c));
    }

    /** Map a session failure to the shared response contract (same as Explore reads). */
    private pageFailure(c: AppContext, failure: string) {
        if (failure === 'session_not_found') return this.notFound(c);
        if (failure === 'session_expired') return this.sessionExpired(c);
        if (failure === 'session_building') return this.sessionBuilding(c);
        if (failure === 'session_context_mismatch') return this.sessionMismatch(c);
        return this.badRequest(c);
    }

    // ---------------- user search sessions (auth-optional) ----------------

    async createUserSearchSession(c: AppContext) {
        try {
            const lang = normalizeContentLanguage(c.get('lang') || 'ar');
            const body = await this.getBody<{ q?: string }>(c);
            const q = String(body?.q ?? this.getQuery(c, 'q') ?? '').slice(0, 100);
            const currentUser = this.getCurrentUser(c);
            const userId = typeof currentUser?.id === 'number' ? currentUser.id : null;
            const presentedGuest = c.req.header('X-Guest-Token') ?? null;
            const { identity, issuedGuestToken } = ExploreSessionService.identityForCreate(userId, presentedGuest);
            const service = new UserSessionService(c.env.DB);
            const { session } = await service.createSessionWithProvider(
                identity,
                new UserSearchProvider(q, userId, lang),
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

    async readUserSearchSessionPage(c: AppContext) {
        try {
            const sessionId = this.getParam(c, 'id');
            const lang = normalizeContentLanguage(c.get('lang') || 'ar');
            const body = await this.getBody<{ q?: string }>(c).catch(() => null);
            const q = String(body?.q ?? this.getQuery(c, 'q') ?? '').slice(0, 100);
            const currentUser = this.getCurrentUser(c);
            const userId = typeof currentUser?.id === 'number' ? currentUser.id : null;
            const presentedGuest = c.req.header('X-Guest-Token') ?? null;
            const identity = ExploreSessionService.identityForRead(userId, presentedGuest);
            const service = new UserSessionService(c.env.DB);
            const outcome = await service.readPageWithProvider(identity, sessionId, {
                cursor: c.req.query('cursor') ?? null,
                limit: c.req.query('limit') ?? undefined,
                provider: new UserSearchProvider(q, userId, lang),
                lang,
            });
            if ('failure' in outcome) return this.pageFailure(c, outcome.failure);
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

    // ---------------- follow suggestion sessions (auth) ----------------

    async createFollowSession(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const lang = normalizeContentLanguage(c.get('lang') || 'ar');
            const service = new UserSessionService(c.env.DB);
            const { session } = await service.createSessionWithProvider(
                { kind: 'user', key: `user:${user.id}` },
                new FollowSuggestionProvider(user.id, lang),
                lang
            );
            return this.success(c, {
                session: { id: session.id, total: session.total_count, expires_at: session.expires_at },
            }, 201);
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    async readFollowSessionPage(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const sessionId = this.getParam(c, 'id');
            const lang = normalizeContentLanguage(c.get('lang') || 'ar');
            const service = new UserSessionService(c.env.DB);
            const outcome = await service.readPageWithProvider(
                { kind: 'user', key: `user:${user.id}` },
                sessionId,
                {
                    cursor: c.req.query('cursor') ?? null,
                    limit: c.req.query('limit') ?? undefined,
                    provider: new FollowSuggestionProvider(user.id, lang),
                    lang,
                }
            );
            if ('failure' in outcome) return this.pageFailure(c, outcome.failure);
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

    // ---------------- opponent sessions (auth, competition context) ----------------

    /**
     * Competition scope comes ONLY from the body/query (session routes carry
     * the SESSION id in :id — never confuse the two).
     */
    private async getCompetitionId(c: AppContext): Promise<number | null> {
        const body = await this.getBody<{ competition_id?: number }>(c).catch(() => null);
        const raw = body?.competition_id ?? this.getQuery(c, 'competition_id');
        const parsed = parseInt(String(raw ?? ''), 10);
        return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    }

    async createOpponentSession(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const competitionId = await this.getCompetitionId(c);
            if (competitionId === null) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }
            const lang = normalizeContentLanguage(c.get('lang') || 'ar');
            const service = new UserSessionService(c.env.DB);
            const { session } = await service.createSessionWithProvider(
                { kind: 'user', key: `user:${user.id}` },
                new OpponentProvider(competitionId, user.id, lang),
                lang
            );
            return this.success(c, {
                session: { id: session.id, total: session.total_count, expires_at: session.expires_at },
            }, 201);
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    async readOpponentSessionPage(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const sessionId = this.getParam(c, 'id');
            const competitionId = await this.getCompetitionId(c);
            if (competitionId === null) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }
            const lang = normalizeContentLanguage(c.get('lang') || 'ar');
            const service = new UserSessionService(c.env.DB);
            const outcome = await service.readPageWithProvider(
                { kind: 'user', key: `user:${user.id}` },
                sessionId,
                {
                    cursor: c.req.query('cursor') ?? null,
                    limit: c.req.query('limit') ?? undefined,
                    provider: new OpponentProvider(competitionId, user.id, lang),
                    lang,
                }
            );
            if ('failure' in outcome) return this.pageFailure(c, outcome.failure);
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

    // ---------------- participation sessions (auth, userâ†’competition) ----------------

    async createParticipationSession(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const lang = normalizeContentLanguage(c.get('lang') || 'ar');
            const service = new ExploreSessionService(c.env.DB);
            const { session } = await service.createSessionWithProvider(
                { kind: 'user', key: `user:${user.id}` },
                new ParticipationProvider(user.id, lang),
                lang
            );
            return this.success(c, {
                session: { id: session.id, total: session.total_count, expires_at: session.expires_at },
            }, 201);
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    async readParticipationSessionPage(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const sessionId = this.getParam(c, 'id');
            const lang = normalizeContentLanguage(c.get('lang') || 'ar');
            const service = new ExploreSessionService(c.env.DB);
            const outcome = await service.readPageWithProvider(
                { kind: 'user', key: `user:${user.id}` },
                sessionId,
                {
                    cursor: c.req.query('cursor') ?? null,
                    limit: c.req.query('limit') ?? undefined,
                    provider: new ParticipationProvider(user.id, lang),
                    lang,
                }
            );
            if ('failure' in outcome) {
                const code = outcome.failure;
                if (code === 'session_not_found') return this.notFound(c);
                if (code === 'session_expired') return this.error(c, this.t('errors.session_expired', c), 410);
                if (code === 'session_building') return this.error(c, this.t('errors.retry', c), 409);
                if (code === 'session_context_mismatch') return this.error(c, this.t('errors.invalid_request', c), 409);
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
}

export default UserDiscoveryController;
