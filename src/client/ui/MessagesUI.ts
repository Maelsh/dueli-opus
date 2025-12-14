/**
 * @file src/client/ui/MessagesUI.ts
 * @description واجهة الرسائل
 * @module client/ui/MessagesUI
 */

import { State } from '../core/State';
import { ApiClient } from '../core/ApiClient';
import { translations, getUILanguage } from '../../i18n';

interface Message {
    id: number;
    sender_id: number;
    sender_name?: string;
    sender_avatar?: string;
    content: string;
    is_read: boolean;
    created_at: string;
}

/**
 * Messages UI Class
 * واجهة الرسائل
 */
export class MessagesUI {
    private static unreadCount: number = 0;
    private static messages: Message[] = [];

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
            if (response.success && typeof response.data?.count === 'number') {
                this.unreadCount = response.data.count;
                this.updateBadge();
            }
        } catch (error) {
            console.error('Failed to load unread messages count:', error);
        }
    }

    /**
     * Load unread messages for dropdown
     */
    static async loadMessages(): Promise<void> {
        try {
            const response = await ApiClient.get('/api/messages/unread-list');
            if (response.success && Array.isArray(response.data?.messages)) {
                this.messages = response.data.messages;
                this.renderList();
            }
        } catch (error) {
            console.error('Failed to load messages:', error);
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
     * Render messages list
     */
    static renderList(): void {
        const container = document.getElementById('messagesList');
        if (!container) return;

        const tr = translations[getUILanguage(State.lang || 'en')];

        if (this.messages.length === 0) {
            container.innerHTML = `
                <div class="p-4 text-center text-gray-400 text-sm">
                    <i class="fas fa-envelope-open text-2xl mb-2"></i>
                    <p>${tr.no_messages || 'No messages'}</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.messages.map(msg => `
            <a href="/messages?id=${msg.id}" class="block p-3 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-800">
                <div class="flex items-start gap-3">
                    <img src="${msg.sender_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.sender_id}`}" 
                         alt="" class="w-10 h-10 rounded-full flex-shrink-0">
                    <div class="flex-1 min-w-0">
                        <p class="font-medium text-gray-900 dark:text-white text-sm">${msg.sender_name || 'User'}</p>
                        <p class="text-gray-500 text-xs truncate">${msg.content}</p>
                        <p class="text-gray-400 text-xs mt-1">${this.formatTime(msg.created_at)}</p>
                    </div>
                    ${!msg.is_read ? '<span class="w-2 h-2 bg-purple-500 rounded-full flex-shrink-0"></span>' : ''}
                </div>
            </a>
        `).join('');
    }

    /**
     * Mark all messages as read
     */
    static async markAllRead(): Promise<void> {
        try {
            await ApiClient.post('/api/messages/mark-all-read');
            this.unreadCount = 0;
            this.updateBadge();
            this.messages = this.messages.map(m => ({ ...m, is_read: true }));
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
        const date = new Date(dateStr);
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

