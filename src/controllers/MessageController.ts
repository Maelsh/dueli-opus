/**
 * @file src/controllers/MessageController.ts
 * @description متحكم الرسائل
 * @module controllers/MessageController
 */

import { Context } from 'hono';
import { Bindings, Variables } from '../config/types';
import { BaseController } from './base/BaseController';
import { MessageModel, ConversationModel } from '../models/MessageModel';
import { NotificationModel } from '../models/NotificationModel';
import { UserModel } from '../models/UserModel';

/**
 * Message Controller Class
 * متحكم الرسائل والمحادثات
 */
export class MessageController extends BaseController {

    /**
     * Get user's conversations
     * GET /api/conversations
     */
    async getConversations(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);

            const limit = this.getQueryInt(c, 'limit') || 20;
            const offset = this.getQueryInt(c, 'offset') || 0;

            const conversationModel = new ConversationModel(c.env.DB);
            const conversations = await conversationModel.getUserConversations(user.id, limit, offset);

            return this.success(c, { conversations });
        } catch (error) {
            console.error('Get conversations error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get messages in a conversation
     * GET /api/conversations/:id/messages
     */
    async getMessages(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);

            const conversationId = this.getParamInt(c, 'id');
            if (!conversationId) {
                return this.validationError(c, this.t('errors.invalid_id', c));
            }

            // Check access
            const conversationModel = new ConversationModel(c.env.DB);
            const hasAccess = await conversationModel.userHasAccess(conversationId, user.id);
            if (!hasAccess) {
                return this.forbidden(c);
            }

            const limit = this.getQueryInt(c, 'limit') || 50;
            const offset = this.getQueryInt(c, 'offset') || 0;

            const messageModel = new MessageModel(c.env.DB);

            // Mark messages as read
            await messageModel.markAsRead(conversationId, user.id);

            const messages = await messageModel.getConversationMessages(conversationId, limit, offset);

            return this.success(c, { messages });
        } catch (error) {
            console.error('Get messages error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Send a message
     * POST /api/conversations/:id/messages
     */
    async sendMessage(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);

            const conversationId = this.getParamInt(c, 'id');
            if (!conversationId) {
                return this.validationError(c, this.t('errors.invalid_id', c));
            }

            const body = await this.getBody<{ content: string }>(c);
            if (!body || !body.content || body.content.trim().length === 0) {
                return this.validationError(c, this.t('message.content_required', c));
            }

            // Check access
            const conversationModel = new ConversationModel(c.env.DB);
            const hasAccess = await conversationModel.userHasAccess(conversationId, user.id);
            if (!hasAccess) {
                return this.forbidden(c);
            }

            const messageModel = new MessageModel(c.env.DB);
            const message = await messageModel.create({
                conversation_id: conversationId,
                sender_id: user.id,
                content: body.content.trim()
            });

            // Get conversation to find recipient
            const conversation = await conversationModel.findById(conversationId);
            if (conversation) {
                const recipientId = conversation.user1_id === user.id
                    ? conversation.user2_id
                    : conversation.user1_id;

                // Create notification for recipient
                const notificationModel = new NotificationModel(c.env.DB);
                await notificationModel.create({
                    user_id: recipientId,
                    type: 'comment', // Valid NotificationType
                    title: this.t('notification.new_message', c),
                    message: `${user.display_name || user.username}: ${body.content.substring(0, 100)}...`,
                    reference_type: 'conversation',
                    reference_id: conversationId
                });
            }

            return this.success(c, { message });
        } catch (error) {
            console.error('Send message error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Start new conversation with user
     * POST /api/users/:id/message
     */
    async startConversation(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);

            const targetUserId = this.getParamInt(c, 'id');
            if (!targetUserId || targetUserId === user.id) {
                return this.validationError(c, this.t('message.invalid_recipient', c));
            }

            const body = await this.getBody<{ content: string }>(c);
            if (!body || !body.content || body.content.trim().length === 0) {
                return this.validationError(c, this.t('message.content_required', c));
            }

            // Check if target user exists
            const userModel = new UserModel(c.env.DB);
            const targetUser = await userModel.findById(targetUserId);
            if (!targetUser) {
                return this.notFound(c, this.t('user_errors.not_found', c));
            }

            // Find or create conversation
            const conversationModel = new ConversationModel(c.env.DB);
            const conversation = await conversationModel.findOrCreate(user.id, targetUserId);

            // Send message
            const messageModel = new MessageModel(c.env.DB);
            const message = await messageModel.create({
                conversation_id: conversation.id,
                sender_id: user.id,
                content: body.content.trim()
            });

            // Create notification
            const notificationModel = new NotificationModel(c.env.DB);
            await notificationModel.create({
                user_id: targetUserId,
                type: 'comment', // Valid NotificationType
                title: this.t('notification.new_message', c),
                message: `${user.display_name || user.username}: ${body.content.substring(0, 100)}...`,
                reference_type: 'conversation',
                reference_id: conversation.id
            });

            return this.success(c, { conversation, message });
        } catch (error) {
            console.error('Start conversation error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get unread message count
     * GET /api/messages/unread
     */
    async getUnreadCount(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);

            const messageModel = new MessageModel(c.env.DB);
            const count = await messageModel.getUnreadCount(user.id);

            return this.success(c, { unread: count });
        } catch (error) {
            console.error('Get unread count error:', error);
            return this.serverError(c, error as Error);
        }
    }
}

export default MessageController;
