import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { RecommendationController } from '../../../controllers/RecommendationController';
import { authMiddleware } from '../../../middleware/auth';

const recommendationRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const controller = new RecommendationController();

recommendationRoutes.use('*', authMiddleware({ required: false }));

recommendationRoutes.get('/', (c) => controller.getRecommendations(c));

recommendationRoutes.get('/competitor-stats/:userId', (c) => controller.getCompetitorStats(c));

export default recommendationRoutes;
