/**
 * Recommendations API Routes
 * مسارات API للتوصيات
 * Plan Solution 10: محرك التوصيات الذكي
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { authMiddleware } from '../../../middleware/auth';
import { RecommendationEngine } from '../../../lib/services/RecommendationEngine';

const recommendationsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Get personalized recommendations (requires auth)
 * GET /api/recommendations
 */
recommendationsRoutes.get('/', authMiddleware({ required: true }), async (c) => {
    const user = c.get('user') as any;
    const limit = parseInt(c.req.query('limit') || '20');
    const offset = parseInt(c.req.query('offset') || '0');

    const engine = new RecommendationEngine(c.env.DB);
    const recommendations = await engine.getRecommendations(user.id, limit, offset);

    return c.json({ success: true, data: recommendations });
});

/**
 * Get trending competitions (no auth required)
 * GET /api/recommendations/trending
 */
recommendationsRoutes.get('/trending', async (c) => {
    const limit = parseInt(c.req.query('limit') || '10');
    const engine = new RecommendationEngine(c.env.DB);
    const trending = await engine.getTrending(limit);

    return c.json({ success: true, data: trending });
});

/**
 * Record a view
 * POST /api/recommendations/view
 */
recommendationsRoutes.post('/view', authMiddleware({ required: true }), async (c) => {
    const user = c.get('user') as any;
    const { competition_id, duration } = await c.req.json();

    if (!competition_id) {
        return c.json({ success: false, error: 'competition_id required' }, 422);
    }

    const engine = new RecommendationEngine(c.env.DB);
    await engine.recordView(user.id, competition_id, duration || 0);

    return c.json({ success: true });
});

/**
 * Hide a competition from recommendations
 * POST /api/recommendations/hide
 */
recommendationsRoutes.post('/hide', authMiddleware({ required: true }), async (c) => {
    const user = c.get('user') as any;
    const { competition_id } = await c.req.json();

    if (!competition_id) {
        return c.json({ success: false, error: 'competition_id required' }, 422);
    }

    const engine = new RecommendationEngine(c.env.DB);
    await engine.hideCompetition(user.id, competition_id);

    return c.json({ success: true });
});

export default recommendationsRoutes;
