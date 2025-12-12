/**
 * @file src/client/ui/MessagesUI.ts
 * @description واجهة الرسائل
 * @module client/ui/MessagesUI
 */

import { State } from '../core/State';
import { ApiClient } from '../core/ApiClient';

/**
 * Messages UI Class
 * واجهة الرسائل
 */
export class MessagesUI {
    private static unreadCount: number = 0;

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
