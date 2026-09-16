/**
 * Leaderboard API Routes
 * مسارات API للترتيب — ربط HTTP فقط (B13: المنطق في LeaderboardController/Model)
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { LeaderboardController } from '../../../controllers/LeaderboardController';

const leaderboardRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const controller = new LeaderboardController();

/**
 * Get leaderboard
 * GET /api/leaderboard
 */
leaderboardRoutes.get('/', (c) => controller.getLeaderboard(c));

export default leaderboardRoutes;
