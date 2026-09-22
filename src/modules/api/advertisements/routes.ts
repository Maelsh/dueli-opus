/**
 * @file src/modules/api/advertisements/routes.ts
 * @description Routes for advertisements management
 * @module api/advertisements
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { AdvertisementModel } from '../../../models/AdvertisementModel';
import { AdCampaignManager } from '../../../lib/services/AdCampaignManager';
import { AdServingService, AD_FREQUENCY_CAP_PER_USER_PER_AD_PER_DAY } from '../../../lib/services/AdServingService';
import { AdClickService } from '../../../lib/services/AdClickService';
import { authMiddleware } from '../../../middleware/auth';
import { t, DEFAULT_LANGUAGE } from '../../../i18n';

const advertisementsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply optional auth middleware
advertisementsRoutes.use('*', authMiddleware({ required: false }));

/**
 * Targeted ad serving (Phase 9.B).
 * GET /api/advertisements?competition_id=&context=&limit=
 *
 * Targeting (language + country + category) is resolved SERVER-SIDE from the
 * competition row — the client never decides which ad matches. AdBlockModel
 * exclusions, the per-user frequency cap, and the sensitive-context ban
 * (context=private_messages → always []) are enforced in AdServingService.
 * Every served ad carries the i18n sponsored/why/hide labels (ads.*) — never
 * hard-coded text.
 */
advertisementsRoutes.get('/', async (c) => {
    try {
        const lang = c.get('lang') || DEFAULT_LANGUAGE;
        const limit = Math.max(1, Math.min(parseInt(c.req.query('limit') || '5') || 5, 50));
        const competitionRaw = c.req.query('competition_id');
        const competitionId = competitionRaw ? parseInt(competitionRaw) : null;
        const context = c.req.query('context') || null;
        const viewer = c.get('user') as { id: number } | null;

        const serving = new AdServingService(c.env.DB);
        const ads = await serving.serve({
            competitionId: competitionId && Number.isInteger(competitionId) && competitionId > 0 ? competitionId : null,
            language: lang,
            viewerUserId: viewer?.id ?? null,
            context,
            limit,
        });

        return c.json({
            success: true,
            data: ads.map((ad) => ({
                ...ad,
                sponsored_label: t('ads.sponsored_label', lang),
                why_this_ad: t('ads.why_this_ad', lang),
                hide_ad: t('ads.hide_ad', lang),
            }))
        });
    } catch (error) {
        console.error('Error fetching advertisements:', error);
        return c.json({ error: 'Failed to fetch advertisements' }, 500);
    }
});

/**
 * Record ad impression — atomic budget charge via AdCampaignManager.
 * The debit (LedgerService = money SSOT) and the serving-state check happen
 * in ONE guarded SQL batch: a depleted or unapproved campaign is never
 * charged and never served.
 *
 * 9.C: an optional client idempotency key (`idempotency_key`) makes delivery
 * retries safe — the same key for the same ad + session identity replays the
 * stored result WITHOUT a second ledger charge (24h approved window).
 * Callers that send no key keep exact 9.A/9.B behavior. A successful charge
 * also mints a single-use click token (click anti-fraud) in the response.
 * POST /api/advertisements/:id/impression
 */
advertisementsRoutes.post('/:id/impression', async (c) => {
    try {
        const lang = c.get('lang') || DEFAULT_LANGUAGE;
        const adId = parseInt(c.req.param('id'));
        const body = await c.req.json<{
            competition_id: number;
            /** 9.E N-3: legacy field, ALWAYS ignored — session (or NULL) is the identity. */
            user_id?: number;
            idempotency_key?: string;
        }>();

        if (!adId || !body?.competition_id) {
            return c.json({ success: false, error: t('errors.missing_fields', lang) }, 422);
        }
        if (body.idempotency_key !== undefined && (
            typeof body.idempotency_key !== 'string' ||
            body.idempotency_key.length === 0 ||
            body.idempotency_key.length > 128
        )) {
            return c.json({ success: false, error: t('errors.missing_fields', lang) }, 422);
        }

        // 9.E (N-3): the session identity is the ONLY user identity — never
        // trust body.user_id. Authenticated callers are their session user
        // (a forged id cannot move attribution or touch another user's
        // frequency cap). Anonymous callers are ALWAYS the NULL identity:
        // a supplied user_id (real or nonexistent) is ignored outright, so it
        // can neither consume a victim's cap, forge attribution, nor trip an
        // FK failure that would mask the real outcome. Legacy clients may
        // still send the field; it has zero effect.
        const viewer = c.get('user') as { id: number } | null;
        const effectiveUserId = viewer?.id ?? null;

        const adModel = new AdvertisementModel(c.env.DB);
        const clickService = new AdClickService(c.env.DB);
        const key = body.idempotency_key ?? null;
        const mintKey = mintRateIdentity(c, viewer);

        const mintClickToken = async () => {
            // Graceful under stockpile pressure: the impression already
            // succeeded server-side, so a hit cap yields success WITHOUT a
            // token (null) rather than failing the verified delivery.
            const minted = await clickService.mint(adId, effectiveUserId, mintKey);
            return minted?.token ?? null;
        };

        if (key) {
            const prior = await adModel.findImpressionKey(key, adId, effectiveUserId);
            if (prior && prior.served === 1) {
                // Duplicate delivery inside the window: replay, never re-charge.
                return c.json({
                    success: true,
                    data: {
                        served: true,
                        budgetExhausted: false,
                        spentCents: prior.spent_cents,
                        frequencyCapped: false,
                        deduped: true,
                        click_token: await mintClickToken()
                    }
                });
            }
            if (!prior) {
                const claimed = await adModel.claimImpressionKey(key, adId, effectiveUserId);
                if (!claimed) {
                    // Lost a concurrent claim race: another delivery is in
                    // flight or already settled — never charge blindly.
                    const raced = await adModel.findImpressionKey(key, adId, effectiveUserId);
                    if (raced && raced.served === 1) {
                        return c.json({
                            success: true,
                            data: {
                                served: true,
                                budgetExhausted: false,
                                spentCents: raced.spent_cents,
                                frequencyCapped: false,
                                deduped: true,
                                click_token: await mintClickToken()
                            }
                        });
                    }
                    return c.json({
                        success: false,
                        error: t('errors.invalid_request', lang),
                        code: 'duplicate_delivery'
                    }, 409);
                }
            }
        }

        const campaignManager = new AdCampaignManager(c.env.DB);
        const result = await campaignManager.chargeImpression(
            adId,
            body.competition_id,
            effectiveUserId,
            viewer ? { frequencyCap: AD_FREQUENCY_CAP_PER_USER_PER_AD_PER_DAY } : undefined
        );

        if (key) {
            // 9.E (N-1): settle is scoped to this request's full identity —
            // adId + effectiveUserId are in scope and passed through.
            await adModel.settleImpressionKey(key, adId, effectiveUserId, result.served, result.served ? result.spentCents : 0);
        }

        if (!result.served) {
            // 9.B frequency cap is enforced atomically INSIDE chargeImpression
            // (F-2: cap count + reserve + write in one batch — no COUNT-then-INSERT).
            if (result.frequencyCapped) {
                return c.json({
                    success: false,
                    error: t('ads.frequency_cap_reached', lang),
                    code: 'frequency_cap_reached'
                }, 429);
            }
            return c.json({
                success: false,
                error: t('ads.budget_exhausted', lang),
                code: 'budget_exhausted'
            }, 409);
        }

        return c.json({
            success: true,
            data: { ...result, deduped: key ? false : undefined, click_token: await mintClickToken() }
        });
    } catch (error) {
        console.error('Error recording impression:', error);
        return c.json({ error: t('server_error', c.get('lang') || DEFAULT_LANGUAGE) }, 500);
    }
});

/**
 * Mint rate identity (9.C remediation): authenticated callers are keyed by
 * their SESSION user id — body parameters are never consulted, so spoofing
 * `user_id` cannot escape the caller's own quota. Anonymous callers are keyed
 * by the server-observed client IP (same source as the platform rate limiter
 * in middleware/security.ts — never a client counter).
 */
function mintRateIdentity(
    c: { req: { header: (name: string) => string | undefined } },
    viewer: { id: number } | null
): string {
    if (viewer) return `user:${viewer.id}`;
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
    return `ip:${ip}`;
}

/**
 * Mint a single-use click token (Phase 9.C anti-fraud + remediation cap).
 * The token is an opaque server-side bearer bound to (ad, session identity),
 * expiring after AD_CLICK_TOKEN_TTL_SECONDS. Every countable click must
 * present one on POST /:id/click. No secret material is ever exposed.
 * Minting is free (no ledger movement) but NOT unlimited: at most
 * AD_CLICK_TOKEN_MAX_LIVE_PER_IDENTITY live tokens per (ad, rate identity)
 * (429 `click_token_limit` beyond that). The body is ignored for identity.
 * POST /api/advertisements/:id/click-token
 */
advertisementsRoutes.post('/:id/click-token', async (c) => {
    try {
        const lang = c.get('lang') || DEFAULT_LANGUAGE;
        const adId = parseInt(c.req.param('id'));
        if (!adId) {
            return c.json({ success: false, error: t('errors.missing_fields', lang) }, 422);
        }
        const viewer = c.get('user') as { id: number } | null;
        const adModel = new AdvertisementModel(c.env.DB);
        if (!(await adModel.findById(adId))) {
            return c.json({ success: false, error: t('not_found', lang) }, 404);
        }
        const clickService = new AdClickService(c.env.DB);
        const minted = await clickService.mint(adId, viewer?.id ?? null, mintRateIdentity(c, viewer));
        if (!minted) {
            return c.json({
                success: false,
                error: t('errors.rate_limited', lang),
                code: 'click_token_limit'
            }, 429);
        }
        return c.json({
            success: true,
            data: { click_token: minted.token, expires_in_seconds: minted.expiresInSeconds }
        });
    } catch (error) {
        console.error('Error minting click token:', error);
        return c.json({ error: t('server_error', c.get('lang') || DEFAULT_LANGUAGE) }, 500);
    }
});

/**
 * Record ad click — countable ONLY with a valid server-issued token (9.C).
 * Rejected without counting: missing token (422), unknown/foreign token
 * (403), expired token (403), consumed token replay (409). The counted click
 * is written atomically with the token consumption, so 100 concurrent
 * replays of one token count exactly one click.
 * POST /api/advertisements/:id/click
 */
advertisementsRoutes.post('/:id/click', async (c) => {
    try {
        const lang = c.get('lang') || DEFAULT_LANGUAGE;
        const adId = parseInt(c.req.param('id'));
        if (!adId) {
            return c.json({ success: false, error: t('errors.missing_fields', lang) }, 422);
        }
        const body = await c.req.json<{ click_token?: string }>().catch(() => null);
        if (!body?.click_token || typeof body.click_token !== 'string') {
            return c.json({
                success: false,
                error: t('errors.missing_fields', lang),
                code: 'missing_click_token'
            }, 422);
        }

        const viewer = c.get('user') as { id: number } | null;
        const clickService = new AdClickService(c.env.DB);
        const outcome = await clickService.redeem(adId, body.click_token, viewer?.id ?? null);

        if (outcome === 'ok') {
            return c.json({ success: true, data: { counted: true } });
        }
        if (outcome === 'reused') {
            return c.json({
                success: false,
                error: t('errors.invalid_request', lang),
                code: 'click_token_reused'
            }, 409);
        }
        if (outcome === 'expired') {
            return c.json({
                success: false,
                error: t('errors.invalid_request', lang),
                code: 'click_token_expired'
            }, 403);
        }
        return c.json({
            success: false,
            error: t('errors.invalid_request', lang),
            code: 'click_token_invalid'
        }, 403);
    } catch (error) {
        console.error('Error recording click:', error);
        return c.json({ error: t('server_error', c.get('lang') || DEFAULT_LANGUAGE) }, 500);
    }
});

/**
 * Get ad by ID
 * GET /api/advertisements/:id
 */
advertisementsRoutes.get('/:id', async (c) => {
    try {
        const adId = parseInt(c.req.param('id'));

        const adModel = new AdvertisementModel(c.env.DB);
        const ad = await adModel.findById(adId);

        if (!ad) {
            return c.json({ error: 'Advertisement not found' }, 404);
        }

        return c.json({
            success: true,
            data: ad
        });
    } catch (error) {
        console.error('Error fetching advertisement:', error);
        return c.json({ error: 'Failed to fetch advertisement' }, 500);
    }
});

/**
 * Get competition revenue
 * GET /api/advertisements/competition/:id/revenue
 */
advertisementsRoutes.get('/competition/:id/revenue', async (c) => {
    try {
        const competitionId = parseInt(c.req.param('id'));

        const adModel = new AdvertisementModel(c.env.DB);
        const revenue = await adModel.getCompetitionRevenue(competitionId);

        return c.json({
            success: true,
            data: { competition_id: competitionId, revenue }
        });
    } catch (error) {
        console.error('Error fetching competition revenue:', error);
        return c.json({ error: 'Failed to fetch competition revenue' }, 500);
    }
});

export default advertisementsRoutes;
