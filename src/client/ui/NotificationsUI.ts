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
    reference_type?: string;
    reference_id?: number;
    /** Server-rendered deep link (NotificationPresenter.linkFor). Preferred over reconstruction. */
    link?: string | null;
    /** Server-persisted star (notifications.is_starred). `data.starred` is the legacy in-memory shape. */
    starred?: boolean;
}

/**
 * Notifications UI Class
 * واجهة الإشعارات
 */
export class NotificationsUI {
    private static notifications: Notification[] = [];
    private static unreadCount: number = 0;
    /**
     * R4-EVENTS-NOTIFY-1 (N-06): single-flight for the inbox fetch. Auth
     * refresh, SSE bursts and page syncs all call init()/loadNotifications
     * concurrently on load — they share ONE GET instead of racing duplicates.
     * Updates are never disabled: every caller still awaits the same result.
     */
    private static pendingLoad: Promise<void> | null = null;
    /**
     * R4-EVENTS-NOTIFY-1 (M-5): true after the first successful load. The
     * dropdown renders a loading state before that, the empty state only
     * after — `no_notifications` must never flash while fetching.
     */
    private static loaded = false;

    /**
     * Initialize notifications
     */
    static async init(): Promise<void> {
        if (!State.currentUser || !State.sessionId) return;
        await this.loadNotifications();
        this.updateBadge();
    }

    /**
     * Load notifications from API (single-flight — concurrent callers share
     * one request; the badge always reflects the server's unreadCount).
     */
    static async loadNotifications(): Promise<void> {
        if (this.pendingLoad) {
            await this.pendingLoad;
            return;
        }
        this.pendingLoad = this.fetchNotifications();
        try {
            await this.pendingLoad;
        } finally {
            this.pendingLoad = null;
        }
    }

    private static async fetchNotifications(): Promise<void> {
        try {
            const response = await ApiClient.get('/api/notifications');
            if (response.success && response.data) {
                // API returns { notifications: [], unreadCount: number }
                this.notifications = response.data.notifications || [];
                this.unreadCount = response.data.unreadCount || 0;
                this.loaded = true;
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
            document.getElementById('userMenu')?.classList.remove('show');
            document.getElementById('countryMenu')?.classList.add('hidden');
            document.getElementById('messagesDropdown')?.classList.add('hidden');

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

        // M-5: loading and empty are distinct states with their own labels.
        if (!this.loaded) {
            container.innerHTML = `
                <div class="p-8 text-center text-gray-400">
                    <i class="fas fa-spinner fa-spin text-3xl mb-2"></i>
                    <p class="text-sm">${t('loading', State.lang) || 'Loading...'}</p>
                </div>
            `;
            return;
        }

        if (this.notifications.length === 0) {
            container.innerHTML = `
                <div class="p-8 text-center text-gray-400">
                    <i class="fas fa-bell-slash text-3xl mb-2"></i>
                    <p class="text-sm">${t('no_notifications', State.lang) || 'No notifications'}</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.notifications.slice(0, 10).map(notification => {
            // N-05: `starred` is the server-persisted flag (is_starred);
            // `data.starred` is the legacy in-memory shape, kept as fallback.
            const starred = notification.starred ?? notification.data?.starred ?? false;
            const starLabel = starred
                ? (t('notification.unstar', State.lang) || 'Unstar')
                : (t('notification.star', State.lang) || 'Star');
            return `
            <div class="p-3 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors ${!notification.is_read ? 'bg-purple-50 dark:bg-purple-900/20' : ''}"
                 data-csp-on="click" data-csp-fn="NotificationsUI.handleNotificationClick" data-csp-args='[${notification.id}]'>
                <div class="flex items-start gap-3">
                    <div class="w-10 h-10 rounded-full ${this.getNotificationColor(notification.type)} flex items-center justify-center">
                        <i class="fas ${this.getNotificationIcon(notification.type)}"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm text-gray-900 dark:text-white ${!notification.is_read ? 'font-semibold' : ''}">${notification.message}</p>
                        <p class="text-xs text-gray-400 mt-1">${this.formatTime(notification.created_at)}</p>
                    </div>
                    <div class="flex items-center gap-1">
                        <button data-csp-stop="1" data-csp-on="click" data-csp-fn="NotificationsUI.toggleStar" data-csp-args='[${notification.id}]'
                                class="p-1 hover:text-amber-500 ${starred ? 'text-amber-500' : 'text-gray-400'}"
                                title="${starLabel}" aria-label="${starLabel}">
                            <i class="fas fa-star text-xs"></i>
                        </button>
                        ${!notification.is_read ? '<span class="w-2 h-2 rounded-full bg-purple-600"></span>' : ''}
                    </div>
                </div>
            </div>
        `;}).join('');
    }

    /**
     * Get notification icon based on type
     */
    private static getNotificationIcon(type: string): string {
        const icons: Record<string, string> = {
            'join_request': 'fa-user-plus',
            'request': 'fa-user-plus',
            'request_accepted': 'fa-check-circle',
            'invitation': 'fa-ticket-alt',
            'invitation_accepted': 'fa-check-circle',
            'request_declined': 'fa-times-circle',
            'new_follower': 'fa-heart',
            'new_message': 'fa-envelope',
            'message': 'fa-envelope',
            'admin_message': 'fa-shield-alt',
            'competition_started': 'fa-play-circle',
            'competition_ended': 'fa-flag-checkered',
            'competition_reminder': 'fa-clock',
            'warning': 'fa-exclamation-triangle',
            'earnings': 'fa-coins',
            'report': 'fa-flag',
            'system': 'fa-info-circle',
            'default': 'fa-bell'
        };
        return icons[type] || icons['default'];
    }

    /**
     * Get notification color based on type
     */
    private static getNotificationColor(type: string): string {
        const colors: Record<string, string> = {
            'join_request': 'bg-blue-100 dark:bg-blue-900/40 text-blue-600',
            'request': 'bg-blue-100 dark:bg-blue-900/40 text-blue-600',
            'request_accepted': 'bg-green-100 dark:bg-green-900/40 text-green-600',
            'invitation': 'bg-purple-100 dark:bg-purple-900/40 text-purple-600',
            'invitation_accepted': 'bg-green-100 dark:bg-green-900/40 text-green-600',
            'request_declined': 'bg-red-100 dark:bg-red-900/40 text-red-600',
            'new_follower': 'bg-pink-100 dark:bg-pink-900/40 text-pink-600',
            'admin_message': 'bg-amber-100 dark:bg-amber-900/40 text-amber-600',
            'warning': 'bg-amber-100 dark:bg-amber-900/40 text-amber-600',
            'earnings': 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600',
            'report': 'bg-orange-100 dark:bg-orange-900/40 text-orange-600',
            'competition_reminder': 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600',
            'default': 'bg-purple-100 dark:bg-purple-900/40 text-purple-600'
        };
        return colors[type] || colors['default'];
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
     * T2.2: Handle clicking a notification — mark read + navigate to target.
     *
     * R4-EVENTS-NOTIFY-1 (N-02): the read POST is awaited (bounded) BEFORE
     * navigating. The old fire-and-forget + immediate location.href let the
     * browser cancel the POST, so opening a notification never persisted
     * is_read. Navigation still happens if the POST fails or times out — a
     * failed mark correctly leaves the row unread for the next load.
     *
     * N-03: the server-provided `link` (NotificationPresenter.linkFor) wins —
     * new join-request notifications land on the /my-requests decision
     * surface, everything else keeps its existing target. Reconstruction from
     * reference_type is the fallback for rows without a link.
     */
    static async handleNotificationClick(id: number): Promise<void> {
        const notification = this.notifications.find(n => n.id === id);
        // Mark as read (awaited — see above)
        if (notification && !notification.is_read) {
            await this.markAsRead(id);
        }
        // Navigate to the referenced target when applicable
        const serverLink = typeof notification?.link === 'string' ? notification.link : null;
        if (serverLink) {
            window.location.href = serverLink;
            return;
        }
        const refType = notification?.reference_type || notification?.data?.reference_type;
        const refId = notification?.reference_id ?? notification?.data?.reference_id;
        if ((refType === 'competition' || notification?.type === 'invitation') && refId) {
            window.location.href = `/competition/${refId}?lang=${State.lang}`;
        } else if (refType === 'conversation' && refId) {
            window.location.href = `/messages?conversation=${refId}&lang=${State.lang}`;
        } else if (refType === 'support_thread' && refId) {
            window.location.href = `/messages?tab=admin&thread=${refId}&lang=${State.lang}`;
        } else {
            this.renderList();
        }
    }

    /**
     * Mark notification as read.
     *
     * Returns true only when the server confirmed the write — the badge and
     * the local row are updated from that trusted confirmation, never
     * optimistically (N-02/M-4).
     */
    static async markAsRead(id: number): Promise<boolean> {
        try {
            const attempt = ApiClient.post<{ success?: boolean }>(`/api/notifications/${id}/read`);
            const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000));
            const response = await Promise.race([attempt, timeout]);
            if (!response || response.success === false) return false;
            const notification = this.notifications.find(n => n.id === id);
            if (notification && !notification.is_read) {
                notification.is_read = true;
                this.unreadCount = Math.max(0, this.unreadCount - 1);
                this.updateBadge();
                this.renderList();
            }
            return true;
        } catch (error) {
            console.error('Failed to mark notification as read:', error);
            return false;
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

    /**
     * Toggle star/favorite on notification.
     *
     * R4-EVENTS-NOTIFY-1 (N-05): persisted server-side (notifications
     * .is_starred via POST /api/notifications/:id/star). Local state changes
     * only after the server confirms — a failed POST leaves the row as-is
     * instead of a star that vanishes on reload.
     */
    static async toggleStar(id: number): Promise<void> {
        try {
            const notification = this.notifications.find(n => n.id === id);
            if (notification) {
                const starred = notification.starred ?? notification.data?.starred ?? false;
                const next = !starred;
                const response = await ApiClient.post<{ success?: boolean }>(
                    `/api/notifications/${id}/star`, { starred: next }
                );
                if (!response || response.success === false) return;
                notification.starred = next;
                notification.data = { ...notification.data, starred: next };
                this.renderList();
            }
        } catch (error) {
            console.error('Failed to toggle star:', error);
        }
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    (window as any).NotificationsUI = NotificationsUI;
}

export default NotificationsUI;
