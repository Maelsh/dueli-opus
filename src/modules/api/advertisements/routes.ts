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
 * POST /api/advertisements/:id/impression
 */
advertisementsRoutes.post('/:id/impression', async (c) => {
    try {
        const adId = parseInt(c.req.param('id'));
        const body = await c.req.json<{
            competition_id: number;
            user_id?: number;
        }>();

        if (!adId || !body?.competition_id) {
            return c.json({ success: false, error: t('errors.missing_fields', c.get('lang') || DEFAULT_LANGUAGE) }, 422);
        }

        // F-1: the session identity is the ONLY identity for authenticated
        // callers — body.user_id is never trusted (it is self-asserted and
        // rotatable). The same effective id feeds the frequency-cap count AND
        // the impression row via chargeImpression, so omitting user_id cannot
        // bypass the cap and spoofing another id cannot touch their counter.
        // Anonymous callers keep 9.A attribution (body.user_id || null), uncapped.
        const viewer = c.get('user') as { id: number } | null;
        const effectiveUserId = viewer?.id ?? body.user_id ?? null;

        const campaignManager = new AdCampaignManager(c.env.DB);
        const result = await campaignManager.chargeImpression(
            adId,
            body.competition_id,
            effectiveUserId,
            viewer ? { frequencyCap: AD_FREQUENCY_CAP_PER_USER_PER_AD_PER_DAY } : undefined
        );

        if (!result.served) {
            // 9.B frequency cap is enforced atomically INSIDE chargeImpression
            // (F-2: cap count + reserve + write in one batch — no COUNT-then-INSERT).
            if (result.frequencyCapped) {
                return c.json({
                    success: false,
                    error: t('ads.frequency_cap_reached', c.get('lang') || DEFAULT_LANGUAGE),
                    code: 'frequency_cap_reached'
                }, 429);
            }
            return c.json({
                success: false,
                error: t('ads.budget_exhausted', c.get('lang') || DEFAULT_LANGUAGE),
                code: 'budget_exhausted'
            }, 409);
        }

        return c.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error recording impression:', error);
        return c.json({ error: t('server_error', c.get('lang') || DEFAULT_LANGUAGE) }, 500);
    }
});

/**
 * Record ad click
 * POST /api/advertisements/:id/click
 */
advertisementsRoutes.post('/:id/click', async (c) => {
    try {
        const adId = parseInt(c.req.param('id'));

        const adModel = new AdvertisementModel(c.env.DB);
        await adModel.recordClick(adId);

        return c.json({
            success: true
        });
    } catch (error) {
        console.error('Error recording click:', error);
        return c.json({ error: 'Failed to record click' }, 500);
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
