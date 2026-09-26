/**
 * @file src/client/ui/MessagesUI.ts
 * @description واجهة الرسائل
 * @module client/ui/MessagesUI
 */

import { State } from '../core/State';
import { ApiClient } from '../core/ApiClient';
import { translations, getUILanguage } from '../../i18n';

/** Conversation row served by GET /api/conversations (ConversationModel.getUserConversations). */
interface ConversationPreview {
    id: number;
    other_user_id: number;
    other_username: string;
    other_display_name?: string;
    other_avatar?: string | null;
    last_message?: string | null;
    last_message_at?: string | null;
    created_at?: string;
    unread_count: number;
}

/**
 * Messages UI Class
 * واجهة الرسائل
 */
export class MessagesUI {
    private static unreadCount: number = 0;
    private static conversations: ConversationPreview[] = [];
    private static loadFailed: boolean = false;

    /**
     * Initialize messages badge
     */
    static async init(): Promise<void> {
        if (!State.currentUser || !State.sessionId) return;
        await this.loadUnreadCount();
    }

    /**
     * Load unread messages count
     */
    static async loadUnreadCount(): Promise<void> {
        try {
            const response = await ApiClient.get('/api/messages/unread');
            const unread = response.data?.unread ?? response.data?.count;
            if (response.success && typeof unread === 'number') {
                this.unreadCount = unread;
                this.updateBadge();
            }
        } catch (error) {
            console.error('Failed to load unread messages count:', error);
        }
    }

    /**
     * Load conversations preview for the header dropdown.
     * Contract (backend, unchanged): GET /api/conversations (mounted at /api by
     * messagesRoutes.get('/conversations')) -> { success, data: { conversations:
     * ConversationWithUser[] } } — flat rows with other_user_id / other_username /
     * other_display_name / other_avatar / last_message / unread_count.
     */
    static async loadMessages(): Promise<void> {
        try {
            const response = await ApiClient.get('/api/conversations?limit=10&offset=0');
            const list = response?.data?.conversations;
            if (response?.success && Array.isArray(list)) {
                // Genuine result (possibly empty inbox).
                this.loadFailed = false;
                this.conversations = list as ConversationPreview[];
                this.renderList();
            } else if (response && typeof response.success === 'boolean') {
                // API envelope answered (e.g. success:false on 404/empty):
                // genuine empty state, not a transport failure.
                this.loadFailed = false;
                this.conversations = [];
                this.renderList();
            } else {
                // Malformed/missing envelope: cannot prove an empty inbox.
                this.loadFailed = true;
                this.conversations = [];
                this.renderList();
            }
        } catch (error) {
            console.error('Failed to load messages:', error);
            // Network failure is NOT an empty inbox: keep the error state
            // distinct so the UI never lies about "no messages".
            this.loadFailed = true;
            this.conversations = [];
            this.renderList();
        }
    }

    /**
     * Toggle messages dropdown
     */
    static toggle(): void {
        const dropdown = document.getElementById('messagesDropdown');
        if (dropdown) {
            const isHidden = dropdown.classList.contains('hidden');

            // Close other dropdowns
            document.getElementById('userMenu')?.classList.remove('show');
            document.getElementById('countryMenu')?.classList.add('hidden');
            document.getElementById('notificationsDropdown')?.classList.add('hidden');

            dropdown.classList.toggle('hidden');

            if (isHidden) {
                this.loadMessages();
            }
        }
    }

    /**
     * Render conversations list (header dropdown preview)
     */
    static renderList(): void {
        const container = document.getElementById('messagesList');
        if (!container) return;

        const tr = translations[getUILanguage(State.lang || 'en')];

        if (this.loadFailed) {
            container.innerHTML = `
                <div class="p-4 text-center text-gray-400 text-sm" role="alert" data-messages-state="error">
                    <i class="fas fa-exclamation-triangle text-2xl mb-2"></i>
                    <p>${(tr as any).messages_load_failed || (tr as any).error_loading || 'Failed to load messages'}</p>
                </div>
            `;
            return;
        }

        if (this.conversations.length === 0) {
            container.innerHTML = `
                <div class="p-4 text-center text-gray-400 text-sm" data-messages-state="empty">
                    <i class="fas fa-envelope-open text-2xl mb-2"></i>
                    <p>${tr.no_messages || 'No messages'}</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.conversations.map(conv => `
            <a href="/messages?conversation=${conv.id}" class="block p-3 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-800">
                <div class="flex items-start gap-3">
                    <img src="${conv.other_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${conv.other_username}`}" 
                         alt="${conv.other_display_name || conv.other_username || ''}" class="w-10 h-10 rounded-full flex-shrink-0" loading="lazy"
                         ${conv.other_username ? `role="link" tabindex="0" class="cursor-pointer" aria-label="${conv.other_display_name || conv.other_username}" data-csp-on="click" data-csp-fn="__navigateProfile" data-csp-args='["${conv.other_username}"]' data-csp-stop="1"` : ''}>
                    <div class="flex-1 min-w-0">
                        <p class="font-medium text-gray-900 dark:text-white text-sm">${conv.other_display_name || conv.other_username}</p>
                        <p class="text-gray-500 text-xs truncate">${conv.last_message || ''}</p>
                        <p class="text-gray-400 text-xs mt-1">${this.formatTime(conv.last_message_at || conv.created_at || '')}</p>
                    </div>
                    ${conv.unread_count > 0 ? '<span class="w-2 h-2 bg-purple-500 rounded-full flex-shrink-0"></span>' : ''}
                </div>
            </a>
        `).join('');
    }

    /**
     * Mark all messages as read
     */
    static async markAllRead(): Promise<void> {
        try {
            // No dedicated mark-all-read endpoint exists on the backend
            // (MessageController marks a conversation read only when its thread
            // is opened via GET /api/conversations/:id/messages). The header
            // dropdown is a preview of conversations, so clearing here is a
            // local badge reset only — it never fabricates a server state.
            this.unreadCount = 0;
            this.updateBadge();
            this.conversations = this.conversations.map(c => ({ ...c, unread_count: 0 }));
            this.renderList();
        } catch (error) {
            console.error('Failed to mark messages as read:', error);
        }
    }

    /**
     * Update messages badge
     */
    static updateBadge(): void {
        const badge = document.getElementById('messagesBadge');
        if (badge) {
            if (this.unreadCount > 0) {
                badge.textContent = this.unreadCount > 99 ? '99+' : String(this.unreadCount);
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    }

    /**
     * Format time for display
     */
    private static formatTime(dateStr: string): string {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        if (Number.isNaN(date.getTime())) return '';
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m`;
        if (hours < 24) return `${hours}h`;
        if (days < 7) return `${days}d`;
        return date.toLocaleDateString();
    }

    /**
     * Get unread count
     */
    static getUnreadCount(): number {
        return this.unreadCount;
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    (window as any).MessagesUI = MessagesUI;
}

export default MessagesUI;

