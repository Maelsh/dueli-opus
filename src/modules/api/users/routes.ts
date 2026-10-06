/**
 * Users API Routes
 * مسارات API للمستخدمين
 * 
 * MVC-compliant: Routes delegate to UserController
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { UserController, UserDiscoveryController } from '../../../controllers';
import { authMiddleware } from '../../../middleware/auth';
const usersRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const controller = new UserController();
const discovery = new UserDiscoveryController();
// T3.4 FIX: controllers read c.get('user') — mount optional auth so requireAuth works
usersRoutes.use('*', authMiddleware({ required: false }));

/**
 * R3-D2: frozen H7 follow-suggestion sessions (auth required inside).
 * POST /api/users/follow-sessions
 * GET /api/users/follow-sessions/:id/page
 */
usersRoutes.post('/follow-sessions', (c) => discovery.createFollowSession(c));
usersRoutes.get('/follow-sessions/:id/page', (c) => discovery.readFollowSessionPage(c));

// ============================================
// User Profile Routes
// ============================================

/**
 * List users
 * GET /api/users
 */
usersRoutes.get('/', (c) => controller.index(c));

/**
 * Get user profile
 * GET /api/users/:username
 */
usersRoutes.get('/:username', (c) => controller.show(c));

/**
 * Get user's pending requests
 * GET /api/users/:id/requests
 */
usersRoutes.get('/:id/requests', (c) => controller.getRequests(c));

// ============================================
// Preferences
// ============================================

/**
 * Update user preferences
 * PUT /api/users/preferences
 */
usersRoutes.put('/preferences', (c) => controller.updatePreferences(c));

// ============================================
// Follow System
// ============================================

/**
 * Follow user
 * POST /api/users/:id/follow
 */
usersRoutes.post('/:id/follow', (c) => controller.follow(c));

/**
 * Unfollow user
 * DELETE /api/users/:id/follow
 */
usersRoutes.delete('/:id/follow', (c) => controller.unfollow(c));

export default usersRoutes;
