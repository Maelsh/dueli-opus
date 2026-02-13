/**
 * @file src/modules/api/advertisements/routes.ts
 * @description Routes for advertisements management
 * @module api/advertisements
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { AdvertisementModel } from '../../../models/AdvertisementModel';
import { authMiddleware } from '../../../middleware/auth';

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
 * Record ad impression
 * POST /api/advertisements/:id/impression
 */
advertisementsRoutes.post('/:id/impression', async (c) => {
    try {
        const adId = parseInt(c.req.param('id'));
        const body = await c.req.json<{
            competition_id: number;
            user_id?: number;
        }>();

        const adModel = new AdvertisementModel(c.env.DB);
        await adModel.recordImpression(adId, body.competition_id, body.user_id || null);

        return c.json({
            success: true
        });
    } catch (error) {
        console.error('Error recording impression:', error);
        return c.json({ error: 'Failed to record impression' }, 500);
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
