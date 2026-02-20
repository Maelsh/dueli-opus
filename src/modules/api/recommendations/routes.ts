import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { RecommendationController } from '../../../controllers/RecommendationController';

const recommendationRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const controller = new RecommendationController();

// Get personalized recommendations
recommendationRoutes.get('/', (c) => controller.getRecommendations(c));

export default recommendationRoutes;
