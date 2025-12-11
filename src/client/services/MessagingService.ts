/**
 * @file src/client/services/MessagingService.ts
 * @description خدمة المراسلة على جانب العميل
 * @module client/services/MessagingService
 */

import { ApiClient } from '../core/ApiClient';
import { State } from '../core/State';
import { Toast } from '../ui/Toast';
import { t } from '../../i18n';

/**
 * Messaging Service Class
 * خدمة المراسلة
 */
export class MessagingService {

    /**
     * Get user's conversations
     */
    static async getConversations(limit: number = 20, offset: number = 0): Promise<any[]> {
        if (!State.currentUser) return [];

        try {
            const response = await ApiClient.get(`/api/conversations?limit=${limit}&offset=${offset}`);
            return response.success ? response.data?.conversations || [] : [];
        } catch (error) {
            console.error('Get conversations error:', error);
            return [];
        }
    }

    /**
     * Get messages in a conversation
     */
    static async getMessages(conversationId: number, limit: number = 50, offset: number = 0): Promise<any[]> {
        if (!State.currentUser) return [];

        try {
            const response = await ApiClient.get(
                `/api/conversations/${conversationId}/messages?limit=${limit}&offset=${offset}`
            );
            return response.success ? response.data?.messages || [] : [];
        } catch (error) {
            console.error('Get messages error:', error);
            return [];
        }
    }

    /**
     * Send a message
     */
    static async sendMessage(conversationId: number, content: string): Promise<{ success: boolean; message?: any }> {
        if (!State.currentUser) {
            Toast.warning(t('auth.login_required', State.lang));
            return { success: false };
        }

        if (!content.trim()) {
            return { success: false };
        }

        try {
            const response = await ApiClient.post(`/api/conversations/${conversationId}/messages`, {
                content: content.trim()
            });

            if (response.success) {
                return { success: true, message: response.data?.message };
            }
            return { success: false };
        } catch (error) {
            console.error('Send message error:', error);
            return { success: false };
        }
    }

    /**
     * Start new conversation with user
     */
    static async startConversation(userId: number, content: string): Promise<{ success: boolean; conversationId?: number }> {
        if (!State.currentUser) {
            Toast.warning(t('auth.login_required', State.lang));
            return { success: false };
        }

        if (!content.trim()) {
            return { success: false };
        }

        try {
            const response = await ApiClient.post(`/api/users/${userId}/message`, {
                content: content.trim()
            });

            if (response.success) {
                Toast.success(t('message.sent', State.lang));
                return {
                    success: true,
                    conversationId: response.data?.conversation?.id
                };
            }
            Toast.error(response.error || t('errors.something_wrong', State.lang));
            return { success: false };
        } catch (error) {
            console.error('Start conversation error:', error);
            Toast.error(t('errors.connection_failed', State.lang));
            return { success: false };
        }
    }

    /**
     * Get unread message count
     */
    static async getUnreadCount(): Promise<number> {
        if (!State.currentUser) return 0;

        try {
            const response = await ApiClient.get('/api/messages/unread');
            return response.success ? response.data?.unread || 0 : 0;
        } catch (error) {
            console.error('Get unread count error:', error);
            return 0;
        }
    }
}

export default MessagingService;
