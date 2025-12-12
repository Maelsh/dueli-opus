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

// Apply auth middleware to all messages routes
messagesRoutes.use('*', authMiddleware({ required: true }));

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
 */
messagesRoutes.post('/users/:id/message', async (c) => {
    return controller.startConversation(c);
});

/**
 * GET /api/messages/unread
 * Get unread message count
 */
messagesRoutes.get('/messages/unread', async (c) => {
    return controller.getUnreadCount(c);
});

export default messagesRoutes;
