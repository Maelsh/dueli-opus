/**
 * @file src/modules/api/earnings/routes.ts
 * @description Routes for earnings management
 * @module api/earnings
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { EarningsModel } from '../../../models/AdvertisementModel';
import { authMiddleware } from '../../../middleware/auth';

const earningsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply optional auth middleware
earningsRoutes.use('*', authMiddleware({ required: false }));

/**
 * Get user's earnings summary
 * GET /api/earnings
 */
earningsRoutes.get('/', async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return c.json({ error: 'Unauthorized' }, 401);
        }

        const earningsModel = new EarningsModel(c.env.DB);
        const summary = await earningsModel.getUserTotalEarnings(user.id);

        return c.json({
            success: true,
            data: summary
        });
    } catch (error) {
        console.error('Error fetching earnings:', error);
        return c.json({ error: 'Failed to fetch earnings' }, 500);
    }
});

/**
 * Get user's earnings history
 * GET /api/earnings/history
 */
earningsRoutes.get('/history', async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return c.json({ error: 'Unauthorized' }, 401);
        }

        const limit = parseInt(c.req.query('limit') || '20');
        const offset = parseInt(c.req.query('offset') || '0');

        const earningsModel = new EarningsModel(c.env.DB);
        const history = await earningsModel.getUserEarnings(user.id, limit, offset);

        return c.json({
            success: true,
            data: history
        });
    } catch (error) {
        console.error('Error fetching earnings history:', error);
        return c.json({ error: 'Failed to fetch earnings history' }, 500);
    }
});

/**
 * Get earnings by competition
 * GET /api/earnings/competition/:id
 */
earningsRoutes.get('/competition/:id', async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return c.json({ error: 'Unauthorized' }, 401);
        }

        const competitionId = parseInt(c.req.param('id'));

        const earningsModel = new EarningsModel(c.env.DB);
        const result = await c.env.DB.prepare(`
            SELECT * FROM user_earnings 
            WHERE competition_id = ? AND user_id = ?
        `).bind(competitionId, user.id).first();

        return c.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error fetching competition earnings:', error);
        return c.json({ error: 'Failed to fetch competition earnings' }, 500);
    }
});

export default earningsRoutes;
