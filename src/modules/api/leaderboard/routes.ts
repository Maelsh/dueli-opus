/**
 * Leaderboard API Routes
 * مسارات API للترتيب
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { EloRatingService } from '../../../lib/services/EloRatingService';

const leaderboardRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Get leaderboard
 * GET /api/leaderboard
 */
leaderboardRoutes.get('/', async (c) => {
    const limit = parseInt(c.req.query('limit') || '50');
    const service = new EloRatingService(c.env.DB);
    const leaders = await service.getLeaderboard(limit);
    return c.json({ success: true, data: leaders });
});

export default leaderboardRoutes;
