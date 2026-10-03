/**
 * Home Rails Controller — R3-RAILS-1A
 * متحكم صفوف الرئيسية
 *
 * Freezes one result session per Home rail (Suggested Guest/User,
 * Dialogue/Science/Talents and every subcategory, each crossed with
 * Live/Recorded/Upcoming) on the shared #75 session store, and pages it to
 * real exhaustion. MVC: no SQL here — persistence lives in the Models +
 * ExploreSessionService; this controller only canonicalizes the rail context,
 * binds the identity, and maps session failures to HTTP semantics
 * (404 foreign/missing, 410 lapsed with a refresh path, 409 building or
 * context drift, 422 validation).
 *
 * No `#private` fields (Cloudflare Workers compat).
 */

import { BaseController, type AppContext } from './base/BaseController';
import {
    ExploreSessionService,
    type ResultSessionProvider,
} from '../lib/services/ExploreSessionService';
import { normalizeContentLanguage } from '../i18n';
import {
    canonicalizeRailRequest,
    loadRailExclusions,
    SuggestedGuestRailProvider,
    SuggestedUserRailProvider,
    CategoryRailProvider,
} from '../models/HomeRailProviders';

export class HomeRailsController extends BaseController {
    /**
     * Build the rail provider for a canonical request + identity.
     * Suggested rails split by identity (guest keeps the #76 surface family
     * with a status-aware provider; users get their own surface + exclusion
     * narrowing). Category rails split by identity kind only — the creator
     * block list narrows logged-in snapshots.
     */
    private async providerFor(
        db: D1Database,
        raw: { kind?: unknown; category?: unknown; subcategory?: unknown; status?: unknown },
        lang: string,
        userId: number | null
    ): Promise<{ provider: ResultSessionProvider } | { validationError: string }> {
        const parsed = canonicalizeRailRequest(raw);
        if (!parsed.ok) return { validationError: parsed.error };
        const rail = parsed.value;
        if (rail.kind === 'suggested') {
            if (userId === null) {
                return { provider: new SuggestedGuestRailProvider(rail.status, lang) };
            }
            const exclusions = await loadRailExclusions(db, userId);
            return { provider: new SuggestedUserRailProvider(rail.status, lang, exclusions) };
        }
        const exclusions = await loadRailExclusions(db, userId);
        return {
            provider: new CategoryRailProvider({
                category: rail.category,
                subcategory: rail.subcategory,
                status: rail.status,
                lang,
                identityKind: userId === null ? 'guest' : 'user',
                excludedCreatorIds: exclusions.creatorIds,
            }),
        };
    }

    /**
     * Freeze one Home rail session.
     * POST /api/home-rails/sessions { kind, category?, subcategory?, status }
     */
    async createRailSession(c: AppContext) {
        try {
            const lang = normalizeContentLanguage(c.get('lang') || 'ar');
            const body = await this.getBody<{
                kind?: unknown;
                category?: unknown;
                subcategory?: unknown;
                status?: unknown;
            }>(c);
            const raw = body ?? {};
            for (const key of ['kind', 'category', 'subcategory', 'status'] as const) {
                const value = raw[key];
                if (value !== undefined && value !== null && typeof value !== 'string') {
                    return this.validationError(c, this.t('errors.invalid_request', c));
                }
                if (typeof value === 'string' && value.length > 64) {
                    return this.validationError(c, this.t('errors.invalid_request', c));
                }
            }

            const currentUser = this.getCurrentUser(c);
            const userId = typeof currentUser?.id === 'number' ? currentUser.id : null;
            const presentedGuest = c.req.header('X-Guest-Token') ?? null;
            const { identity, issuedGuestToken } = ExploreSessionService.identityForCreate(userId, presentedGuest);

            const built = await this.providerFor(c.env.DB, raw, lang, userId);
            if ('validationError' in built) {
                return this.validationError(c, this.t('errors.invalid_request', c));
            }

            const service = new ExploreSessionService(c.env.DB);
            const { session } = await service.createSessionWithProvider(identity, built.provider, lang);

            return this.success(c, {
                session: { id: session.id, total: session.total_count, expires_at: session.expires_at },
                guest_token: issuedGuestToken,
            }, 201);
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Read one page of a frozen Home rail session.
     * GET /api/home-rails/sessions/:id/page?kind&category&subcategory&status&cursor&limit
     *
     * The context echo must reproduce the creation context exactly; any drift
     * (tab/category/language/identity change) is a 409 so the rail resets to
     * a fresh session instead of mixing two snapshots.
     */
    async readRailSessionPage(c: AppContext) {
        try {
            const sessionId = this.getParam(c, 'id');
            const lang = normalizeContentLanguage(c.get('lang') || 'ar');

            const currentUser = this.getCurrentUser(c);
            const userId = typeof currentUser?.id === 'number' ? currentUser.id : null;
            const presentedGuest = c.req.header('X-Guest-Token') ?? null;
            const identity = ExploreSessionService.identityForRead(userId, presentedGuest);

            const built = await this.providerFor(
                c.env.DB,
                {
                    kind: c.req.query('kind'),
                    category: c.req.query('category'),
                    subcategory: c.req.query('subcategory'),
                    status: c.req.query('status'),
                },
                lang,
                userId
            );
            if ('validationError' in built) {
                return this.validationError(c, this.t('errors.invalid_request', c));
            }

            const service = new ExploreSessionService(c.env.DB);
            const outcome = await service.readPageWithProvider(identity, sessionId, {
                cursor: c.req.query('cursor') ?? null,
                limit: c.req.query('limit') ?? undefined,
                provider: built.provider,
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
}

export default HomeRailsController;
