/**
 * Notifications API Routes
 * مسارات API للإشعارات
 * 
 * MVC-compliant: Routes delegate to UserController
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { UserController } from '../../../controllers';
import { authMiddleware } from '../../../middleware/auth';

const notificationsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const controller = new UserController();

// Apply auth middleware to all notifications routes
notificationsRoutes.use('*', authMiddleware({ required: true }));

/**
 * Get notifications
 * GET /api/notifications
 */
notificationsRoutes.get('/', (c) => controller.getNotifications(c));

/**
 * Mark notification as read
 * POST /api/notifications/:id/read
 */
notificationsRoutes.post('/:id/read', (c) => controller.markNotificationRead(c));

/**
 * Mark all notifications as read
 * POST /api/notifications/read-all
 */
notificationsRoutes.post('/read-all', (c) => controller.markAllNotificationsRead(c));

export default notificationsRoutes;

