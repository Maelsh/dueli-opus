/**
 * Support API Routes (R2-M H6, user side).
 * Own support threads only — independent storage/routes from personal
 * messaging (/api/conversations, /api/users/:id/message).
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { SupportController } from '../../../controllers/SupportController';
import { authMiddleware } from '../../../middleware/auth';

const supportRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
supportRoutes.use('/threads', authMiddleware({ required: true }));
supportRoutes.use('/threads/*', authMiddleware({ required: true }));
supportRoutes.use('/unread', authMiddleware({ required: true }));
const controller = new SupportController();

supportRoutes.get('/threads', (c) => controller.listThreads(c));
supportRoutes.post('/threads', (c) => controller.createThread(c));
supportRoutes.get('/threads/:id', (c) => controller.getThread(c));
supportRoutes.post('/threads/:id/messages', (c) => controller.postMessage(c));
supportRoutes.get('/unread', (c) => controller.getUnread(c));

export default supportRoutes;
