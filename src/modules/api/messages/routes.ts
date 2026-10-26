/**
 * @file src/modules/api/messages/routes.ts
 * @description مسارات الرسائل
 * @module api/messages/routes
 */

import { Hono } from 'hono';
import { Bindings, Variables } from '../../../config/types';
import { MessageController } from '../../../controllers/MessageController';
import { authMiddleware } from '../../../middleware/auth';

const messagesRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const controller = new MessageController();

// Apply auth middleware to messages routes only.
// T1.5 FIX: was use('*') while mounted at /api — it hijacked EVERY /api/* path
// registered after it (recommendations, cron, ...) forcing authentication.
messagesRoutes.use('/conversations', authMiddleware({ required: true }));
messagesRoutes.use('/conversations/*', authMiddleware({ required: true }));
messagesRoutes.use('/users/*', authMiddleware({ required: true }));
messagesRoutes.use('/messages/*', authMiddleware({ required: true }));

/**
 * GET /api/conversations
 * Get user's conversations
 */
messagesRoutes.get('/conversations', async (c) => {
    return controller.getConversations(c);
});

/**
 * GET /api/conversations/:id/messages
 * Get messages in a conversation
 */
messagesRoutes.get('/conversations/:id/messages', async (c) => {
    return controller.getMessages(c);
});

/**
 * POST /api/conversations/:id/messages
 * Send a message
 */
messagesRoutes.post('/conversations/:id/messages', async (c) => {
    return controller.sendMessage(c);
});

/**
 * POST /api/users/:id/message
 * Start new conversation
 *
 * Explicit per-route guard (on top of the router wildcard above) so the
 * generated route inventory records the real protection instead of relying
 * on wildcard-prefix matching it cannot express (R4-MESSAGES-1).
 */
messagesRoutes.post('/users/:id/message', authMiddleware({ required: true }), async (c) => {
    return controller.startConversation(c);
});

/**
 * POST /api/messages/read-all
 * Persistently mark every received message as read (R4-MESSAGES-1 / M-05)
 */
messagesRoutes.post('/messages/read-all', authMiddleware({ required: true }), async (c) => {
    return controller.markAllRead(c);
});

/**
 * GET /api/messages/unread
 * Get unread message count
 */
messagesRoutes.get('/messages/unread', authMiddleware({ required: true }), async (c) => {
    return controller.getUnreadCount(c);
});

export default messagesRoutes;
