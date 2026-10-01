import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { RecommendationController } from '../../../controllers/RecommendationController';
import { authMiddleware } from '../../../middleware/auth';

const recommendationRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const controller = new RecommendationController();

recommendationRoutes.use('*', authMiddleware({ required: false }));

recommendationRoutes.get('/', (c) => controller.getRecommendations(c));

/**
 * R3-GUEST-1: frozen guest suggestion sessions (Home «مقترح لك» rail pages
 * to real exhaustion through these instead of a single LIMIT batch).
 */
recommendationRoutes.post('/suggested-sessions', (c) => controller.createSuggestedSession(c));

recommendationRoutes.get('/suggested-sessions/:id/page', (c) => controller.readSuggestedSessionPage(c));

recommendationRoutes.get('/competitor-stats/:userId', (c) => controller.getCompetitorStats(c));

export default recommendationRoutes;
