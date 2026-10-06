/**
 * Matchmaking API Routes (Task 10)
 * مسارات API للمطابقة والدعوات
 * 
 * MVC-compliant: Routes delegate to MatchmakingController
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { MatchmakingController } from '../../../controllers/MatchmakingController';
import { UserDiscoveryController } from '../../../controllers/UserDiscoveryController';
import { authMiddleware } from '../../../middleware/auth';

const matchmakingRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const controller = new MatchmakingController();
const discovery = new UserDiscoveryController();

// All matchmaking routes require authentication
matchmakingRoutes.use('*', authMiddleware({ required: true }));

/**
 * R3-D2: frozen H7 opponent-candidate sessions for one competition.
 * POST /api/matchmaking/opponent-sessions {competition_id}
 * GET /api/matchmaking/opponent-sessions/:id/page?competition_id=
 */
matchmakingRoutes.post('/opponent-sessions', (c) => discovery.createOpponentSession(c));
matchmakingRoutes.get('/opponent-sessions/:id/page', (c) => discovery.readOpponentSessionPage(c));

/**
 * Get online available users for invite panel
 * GET /api/matchmaking/online-users
 */
matchmakingRoutes.get('/online-users', (c) => controller.getOnlineUsers(c));

/**
 * Heartbeat - keep user marked as online
 * POST /api/matchmaking/heartbeat
 */
matchmakingRoutes.post('/heartbeat', (c) => controller.heartbeat(c));

/**
 * Go offline
 * POST /api/matchmaking/offline
 */
matchmakingRoutes.post('/offline', (c) => controller.goOffline(c));

export default matchmakingRoutes;
