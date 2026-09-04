/**
 * @file src/modules/api/schedule/routes.ts
 * @description مسارات الجدولة والتذكيرات
 * @module api/schedule/routes
 */

import { Hono } from 'hono';
import { Bindings, Variables } from '../../../config/types';
import { ScheduleController } from '../../../controllers/ScheduleController';
import { authMiddleware } from '../../../middleware/auth';
const scheduleRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const controller = new ScheduleController();
// T3.4 FIX: controllers read c.get('user') — mount optional auth so requireAuth works
scheduleRoutes.use('*', authMiddleware({ required: false }));

/**
 * GET /api/schedule
 * Get user's upcoming scheduled competitions
 */
scheduleRoutes.get('/', async (c) => {
    return controller.getSchedule(c);
});

/**
 * GET /api/reminders
 * Get user's reminders
 */
scheduleRoutes.get('/reminders', async (c) => {
    return controller.getReminders(c);
});

/**
 * POST /api/competitions/:id/remind
 * Add reminder for competition
 */
scheduleRoutes.post('/competitions/:id/remind', async (c) => {
    return controller.addReminder(c);
});

/**
 * DELETE /api/competitions/:id/remind
 * Remove reminder
 */
scheduleRoutes.delete('/competitions/:id/remind', async (c) => {
    return controller.removeReminder(c);
});

/**
 * GET /api/competitions/:id/remind
 * Check if user has reminder
 */
scheduleRoutes.get('/competitions/:id/remind', async (c) => {
    return controller.hasReminder(c);
});

export default scheduleRoutes;
