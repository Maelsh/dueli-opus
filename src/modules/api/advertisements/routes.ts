/**
 * @file src/modules/api/advertisements/routes.ts
 * @description Routes for advertisements management
 * @module api/advertisements
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { AdvertisementModel } from '../../../models/AdvertisementModel';
import { AdCampaignManager } from '../../../lib/services/AdCampaignManager';
import { authMiddleware } from '../../../middleware/auth';
import { t, DEFAULT_LANGUAGE } from '../../../i18n';

const advertisementsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply optional auth middleware
advertisementsRoutes.use('*', authMiddleware({ required: false }));

/**
 * Get active advertisements
 * GET /api/advertisements
 */
advertisementsRoutes.get('/', async (c) => {
    try {
        const limit = parseInt(c.req.query('limit') || '5');

        const adModel = new AdvertisementModel(c.env.DB);
        const ads = await adModel.getActiveAds(limit);

        return c.json({
            success: true,
            data: ads
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

        const campaignManager = new AdCampaignManager(c.env.DB);
        const result = await campaignManager.chargeImpression(adId, body.competition_id, body.user_id || null);

        if (!result.served) {
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
