/**
 * @file src/client/ui/NotificationsUI.ts
 * @description واجهة الإشعارات
 * @module client/ui/NotificationsUI
 */

import { State } from '../core/State';
import { ApiClient } from '../core/ApiClient';
import { t } from '../../i18n';

/**
 * Notification Interface
 */
interface Notification {
    id: number;
    type: string;
    message: string;
    is_read: boolean;
    created_at: string;
    data?: any;
}

/**
 * Notifications UI Class
 * واجهة الإشعارات
 */
export class NotificationsUI {
    private static notifications: Notification[] = [];
    private static unreadCount: number = 0;

    /**
     * Initialize notifications
     */
    static async init(): Promise<void> {
        if (!State.currentUser || !State.sessionId) return;
        await this.loadNotifications();
        this.updateBadge();
    }

    /**
     * Load notifications from API
     */
    static async loadNotifications(): Promise<void> {
        try {
            const response = await ApiClient.get('/api/notifications');
            if (response.success && response.data) {
                // API returns { notifications: [], unreadCount: number }
                this.notifications = response.data.notifications || [];
                this.unreadCount = response.data.unreadCount || 0;
                this.updateBadge();
            }
        } catch (error) {
            console.error('Failed to load notifications:', error);
        }
    }

    /**
     * Update notification badge
     */
    static updateBadge(): void {
        const badge = document.getElementById('notificationBadge');
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
     * Toggle notifications dropdown
     */
    static toggle(): void {
        const dropdown = document.getElementById('notificationsDropdown');
        if (dropdown) {
            const isHidden = dropdown.classList.contains('hidden');

            // Close other dropdowns
            document.getElementById('userMenu')?.classList.add('hidden');
            document.getElementById('countryMenu')?.classList.add('hidden');

            dropdown.classList.toggle('hidden');

            if (isHidden) {
                this.renderList();
            }
        }
    }

    /**
     * Render notifications list
     */
    static renderList(): void {
        const container = document.getElementById('notificationsList');
        if (!container) return;

        if (this.notifications.length === 0) {
            container.innerHTML = `
                <div class="p-8 text-center text-gray-400">
                    <i class="fas fa-bell-slash text-3xl mb-2"></i>
                    <p class="text-sm">${t('notification.no_notifications', State.lang) || 'No notifications'}</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.notifications.slice(0, 10).map(notification => `
            <div class="p-3 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors ${!notification.is_read ? 'bg-purple-50 dark:bg-purple-900/20' : ''}"
                 onclick="NotificationsUI.markAsRead(${notification.id})">
                <div class="flex items-start gap-3">
                    <div class="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center text-purple-600">
                        <i class="fas ${this.getNotificationIcon(notification.type)}"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm text-gray-900 dark:text-white ${!notification.is_read ? 'font-semibold' : ''}">${notification.message}</p>
                        <p class="text-xs text-gray-400 mt-1">${this.formatTime(notification.created_at)}</p>
                    </div>
                    ${!notification.is_read ? '<span class="w-2 h-2 rounded-full bg-purple-600"></span>' : ''}
                </div>
            </div>
        `).join('');
    }

    /**
     * Get notification icon based on type
     */
    private static getNotificationIcon(type: string): string {
        const icons: Record<string, string> = {
            'join_request': 'fa-user-plus',
            'request_accepted': 'fa-check-circle',
            'request_declined': 'fa-times-circle',
            'new_follower': 'fa-heart',
            'new_message': 'fa-envelope',
            'competition_started': 'fa-play-circle',
            'competition_ended': 'fa-flag-checkered',
            'default': 'fa-bell'
        };
        return icons[type] || icons['default'];
    }

    /**
     * Format notification time
     */
    private static formatTime(dateStr: string): string {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return State.lang === 'ar' ? 'الآن' : 'now';
        if (minutes < 60) return State.lang === 'ar' ? `منذ ${minutes} دقيقة` : `${minutes}m ago`;
        if (hours < 24) return State.lang === 'ar' ? `منذ ${hours} ساعة` : `${hours}h ago`;
        return State.lang === 'ar' ? `منذ ${days} يوم` : `${days}d ago`;
    }

    /**
     * Mark notification as read
     */
    static async markAsRead(id: number): Promise<void> {
        try {
            await ApiClient.post(`/api/notifications/${id}/read`);
            const notification = this.notifications.find(n => n.id === id);
            if (notification && !notification.is_read) {
                notification.is_read = true;
                this.unreadCount = Math.max(0, this.unreadCount - 1);
                this.updateBadge();
                this.renderList();
            }
        } catch (error) {
            console.error('Failed to mark notification as read:', error);
        }
    }

    /**
     * Mark all notifications as read
     */
    static async markAllAsRead(): Promise<void> {
        try {
            await ApiClient.post('/api/notifications/read-all');
            this.notifications.forEach(n => n.is_read = true);
            this.unreadCount = 0;
            this.updateBadge();
            this.renderList();
        } catch (error) {
            console.error('Failed to mark all notifications as read:', error);
        }
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    (window as any).NotificationsUI = NotificationsUI;
}

export default NotificationsUI;
