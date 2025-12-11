/**
 * @file src/modules/api/likes/routes.ts
 * @description مسارات الإعجابات
 * @module api/likes/routes
 */

import { Hono } from 'hono';
import { Bindings, Variables } from '../../../config/types';
import { InteractionController } from '../../../controllers/InteractionController';

const likesRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const controller = new InteractionController();

/**
 * POST /api/competitions/:id/like
 * Like a competition
 */
likesRoutes.post('/competitions/:id/like', async (c) => {
    return controller.likeCompetition(c);
});

/**
 * DELETE /api/competitions/:id/like
 * Unlike a competition
 */
likesRoutes.delete('/competitions/:id/like', async (c) => {
    return controller.unlikeCompetition(c);
});

/**
 * GET /api/competitions/:id/like
 * Get like status for current user
 */
likesRoutes.get('/competitions/:id/like', async (c) => {
    return controller.getLikeStatus(c);
});

/**
 * GET /api/competitions/:id/likes
 * Get users who liked a competition
 */
likesRoutes.get('/competitions/:id/likes', async (c) => {
    return controller.getLikers(c);
});

export default likesRoutes;
