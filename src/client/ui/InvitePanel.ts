/**
 * @file src/client/ui/InvitePanel.ts
 * @description Dynamic floating Invite Opponent panel (Task 10)
 * لوحة دعوة الخصم العائمة الديناميكية
 * 
 * A highly flexible floating modal that the competition creator can open/close at will.
 * It auto-updates the list of online users, ranks by recommendation compatibility,
 * filters out blocked users, and disables the "Send Invite" button dynamically.
 */

import { ApiClient } from '../core/ApiClient';
import { State } from '../core/State';
import { Toast } from './Toast';
import { t } from '../../i18n';

interface OnlineUser {
    id: number;
    username: string;
    display_name: string;
    avatar_url: string | null;
    country: string;
    language: string;
    is_online: number;
    last_seen_at: string | null;
    is_busy: number;
    is_verified: number;
    average_rating: number;
    total_competitions: number;
    total_wins: number;
    compatibility_score: number;
}

interface OnlineUsersResponse {
    success: boolean;
    data: {
        users: OnlineUser[];
        total: number;
        limit: number;
        offset: number;
    };
}

/**
 * InvitePanel - Floating Dynamic Invite Modal
 * لوحة دعوة الخصم العائمة
 */
export class InvitePanel {
    private static competitionId: number = 0;
    private static isOpen: boolean = false;
    private static pollInterval: ReturnType<typeof setInterval> | null = null;
    private static sentInvites: Set<number> = new Set();
    private static searchQuery: string = '';
    private static users: OnlineUser[] = [];
    private static total: number = 0;
    private static isLoading: boolean = false;
    // T2.1: hover profile cards
    private static statsCache: Map<number, any> = new Map();
    private static hoverTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Open the invite panel for a specific competition
     */
    static open(competitionId: number): void {
        this.competitionId = competitionId;
        this.isOpen = true;
        this.sentInvites.clear();
        this.searchQuery = '';
        this.users = [];

        this.render();
        this.fetchUsers();
        this.startPolling();

        // Send heartbeat to mark self as online
        ApiClient.post('/api/matchmaking/heartbeat').catch(() => {});
    }

    /**
     * Close the invite panel
     */
    static close(): void {
        this.isOpen = false;
        this.stopPolling();

        const panel = document.getElementById('invitePanelOverlay');
        if (panel) {
            panel.classList.add('opacity-0', 'pointer-events-none');
            setTimeout(() => panel.remove(), 300);
        }
    }

    /**
     * Toggle the panel open/closed
     */
    static toggle(competitionId: number): void {
        if (this.isOpen && this.competitionId === competitionId) {
            this.close();
        } else {
            this.open(competitionId);
        }
    }

    /**
     * Start auto-polling every 10 seconds
     */
    private static startPolling(): void {
        this.stopPolling();
        this.pollInterval = setInterval(() => {
            if (this.isOpen) {
                this.fetchUsers();
                // Also keep heartbeat alive
                ApiClient.post('/api/matchmaking/heartbeat').catch(() => {});
            }
        }, 10000);
    }

    /**
     * Stop auto-polling
     */
    private static stopPolling(): void {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    /**
     * Fetch online users from the API
     */
    private static async fetchUsers(): Promise<void> {
        if (this.isLoading) return;
        this.isLoading = true;

        try {
            const searchParam = this.searchQuery ? `&search=${encodeURIComponent(this.searchQuery)}` : '';
            const res = await ApiClient.get<OnlineUsersResponse>(
                `/api/matchmaking/online-users?competition_id=${this.competitionId}&limit=50${searchParam}`
            );

            if (res.success && res.data) {
                this.users = res.data.users;
                this.total = res.data.total;
                this.renderUserList();
            }
        } catch (err) {
            console.error('[InvitePanel] fetchUsers error:', err);
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Send an invite to a user
     */
    private static async sendInvite(userId: number): Promise<void> {
        if (this.sentInvites.has(userId)) return;

        // Immediately disable the button
        const btn = document.getElementById(`invite-btn-${userId}`);
        if (btn) {
            btn.setAttribute('disabled', 'true');
            btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-1"></i>${t('matchmaking.sending', State.lang)}`;
            btn.classList.add('opacity-60', 'cursor-not-allowed');
        }

        try {
            const res = await ApiClient.post(`/api/competitions/${this.competitionId}/invite`, {
                invitee_id: userId
            });

            if (res.success) {
                this.sentInvites.add(userId);
                Toast.show(t('matchmaking.invite_sent', State.lang), 'success');

                // Update button to "Sent" state
                if (btn) {
                    btn.innerHTML = `<i class="fas fa-check mr-1"></i>${t('matchmaking.invite_sent', State.lang)}`;
                    btn.classList.remove('bg-purple-600', 'hover:bg-purple-700');
                    btn.classList.add('bg-green-600');
                }
            } else {
                Toast.show(res.error || t('errors.something_wrong', State.lang), 'error');
                // Re-enable button on failure
                if (btn) {
                    btn.removeAttribute('disabled');
                    btn.innerHTML = `<i class="fas fa-paper-plane mr-1"></i>${t('matchmaking.send_invite', State.lang)}`;
                    btn.classList.remove('opacity-60', 'cursor-not-allowed');
                }
            }
        } catch (err) {
            Toast.show(t('errors.something_wrong', State.lang), 'error');
            if (btn) {
                btn.removeAttribute('disabled');
                btn.innerHTML = `<i class="fas fa-paper-plane mr-1"></i>${t('matchmaking.send_invite', State.lang)}`;
                btn.classList.remove('opacity-60', 'cursor-not-allowed');
            }
        }
    }

    /**
     * Handle search input changes (debounced)
     */
    private static handleSearch(query: string): void {
        this.searchQuery = query;
        // Debounced fetch
        if ((this as any)._searchTimeout) clearTimeout((this as any)._searchTimeout);
        (this as any)._searchTimeout = setTimeout(() => {
            this.fetchUsers();
        }, 400);
    }

    /**
     * Get online status indicator
     */
    private static getStatusDot(user: OnlineUser): string {
        if (user.is_online) {
            return '<span class="w-3 h-3 rounded-full bg-green-500 shadow-sm shadow-green-400 animate-pulse"></span>';
        }
        if (user.last_seen_at) {
            return '<span class="w-3 h-3 rounded-full bg-yellow-400"></span>';
        }
        return '<span class="w-3 h-3 rounded-full bg-gray-400"></span>';
    }

    /**
     * Get online status text
     */
    private static getStatusText(user: OnlineUser): string {
        if (user.is_online) return t('matchmaking.online_now', State.lang);
        if (user.last_seen_at) return t('matchmaking.recently_active', State.lang);
        return t('matchmaking.offline', State.lang);
    }

    /**
     * Get compatibility bar width %
     */
    private static getCompatibilityPercent(score: number): number {
        // Max possible score â‰ˆ 100 (30+25+20+15+10+5), normalize to percentage
        return Math.min(Math.round((score / 100) * 100), 100);
    }

    /**
     * Render the entire panel overlay
     */
    private static render(): void {
        // Remove existing if any
        const existing = document.getElementById('invitePanelOverlay');
        if (existing) existing.remove();

        const isRtl = State.lang === 'ar' || State.lang === 'fa' || State.lang === 'he' || State.lang === 'ur';

        const overlay = document.createElement('div');
        overlay.id = 'invitePanelOverlay';
        overlay.className = 'fixed inset-0 z-[9999] flex items-end sm:items-center justify-center transition-opacity duration-300';
        overlay.style.background = 'rgba(0,0,0,0.5)';
        overlay.style.backdropFilter = 'blur(4px)';

        overlay.innerHTML = `
            <div id="invitePanel" class="relative w-full max-w-lg max-h-[85vh] bg-white dark:bg-[#1a1a2e] rounded-t-3xl sm:rounded-3xl shadow-2xl border border-gray-200/20 dark:border-purple-900/30 overflow-hidden flex flex-col transform transition-all duration-300 animate-slide-up" dir="${isRtl ? 'rtl' : 'ltr'}">
                <!-- Header -->
                <div class="bg-gradient-to-r from-purple-600 to-indigo-600 p-5 flex items-center justify-between gap-3">
                    <div class="flex items-center gap-3 min-w-0">
                        <div class="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                            <i class="fas fa-user-plus text-white text-lg"></i>
                        </div>
                        <div class="min-w-0">
                            <h2 class="text-white font-bold text-lg truncate">${t('matchmaking.panel_title', State.lang)}</h2>
                            <p class="text-white/70 text-xs">${t('matchmaking.auto_updating', State.lang)}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                        <button onclick="window._invitePanelRefresh()" class="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-all" title="${t('matchmaking.refresh', State.lang)}">
                            <i class="fas fa-sync-alt text-sm"></i>
                        </button>
                        <button onclick="window._invitePanelClose()" class="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-all" title="${t('matchmaking.close_panel', State.lang)}">
                            <i class="fas fa-times text-sm"></i>
                        </button>
                    </div>
                </div>

                <!-- Search Bar -->
                <div class="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                    <div class="relative">
                        <input 
                            type="text" 
                            id="invitePanelSearch"
                            placeholder="${t('matchmaking.search_users', State.lang)}"
                            class="w-full bg-gray-100 dark:bg-gray-800 rounded-xl py-2.5 ${isRtl ? 'pr-10 pl-4' : 'pl-10 pr-4'} text-sm text-gray-900 dark:text-white placeholder-gray-400 border-0 focus:ring-2 focus:ring-purple-400 transition-all outline-none"
                            oninput="window._invitePanelSearch(this.value)"
                        />
                        <i class="fas fa-search absolute top-1/2 -translate-y-1/2 ${isRtl ? 'right-3' : 'left-3'} text-gray-400 text-sm"></i>
                    </div>
                </div>

                <!-- Users List -->
                <div id="invitePanelUserList" class="flex-1 overflow-y-auto p-3 space-y-2" style="min-height: 200px; max-height: 55vh;">
                    <div class="flex items-center justify-center py-12">
                        <i class="fas fa-spinner fa-spin text-3xl text-purple-400"></i>
                    </div>
                </div>

                <!-- Footer Status -->
                <div class="px-4 py-2 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-800 text-center">
                    <span id="invitePanelStatus" class="text-xs text-gray-400">
                        <i class="fas fa-circle text-green-500 text-[6px] mr-1 animate-pulse"></i>
                        ${t('matchmaking.auto_updating', State.lang)}
                    </span>
                </div>
            </div>
        `;

        // Clicking backdrop closes panel
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                InvitePanel.close();
            }
        });

        document.body.appendChild(overlay);

        // Add CSS animation if not present
        if (!document.getElementById('invitePanelStyles')) {
            const style = document.createElement('style');
            style.id = 'invitePanelStyles';
            style.textContent = `
                @keyframes slideUp {
                    from { transform: translateY(30px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .animate-slide-up { animation: slideUp 0.3s ease-out; }
                
                @keyframes fadeInCard {
                    from { transform: translateY(8px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .animate-fade-in-card { animation: fadeInCard 0.2s ease-out; }
            `;
            document.head.appendChild(style);
        }
    }

    /**
     * Render the users list inside the panel
     */
    private static renderUserList(): void {
        const container = document.getElementById('invitePanelUserList');
        if (!container) return;

        if (this.users.length === 0) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center py-12 text-center">
                    <div class="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                        <i class="fas fa-users-slash text-2xl text-gray-400"></i>
                    </div>
                    <p class="text-gray-400 text-sm font-medium">${t('matchmaking.no_users_available', State.lang)}</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.users.map((user, index) => {
            const isSent = this.sentInvites.has(user.id);
            const compatPercent = this.getCompatibilityPercent(user.compatibility_score);
            const avatar = user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.display_name || user.username)}&background=7c3aed&color=fff&size=80`;
            const rating = user.average_rating ? user.average_rating.toFixed(1) : '—';

            return `
                <div class="bg-gray-50 dark:bg-gray-800/60 rounded-2xl p-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all animate-fade-in-card relative"
                     style="animation-delay: ${index * 50}ms"
                     onmouseenter="window._invitePanelHover(${user.id}, this)"
                     onmouseleave="window._invitePanelHoverEnd()">
                <div class="flex items-center gap-3">
                        <!-- Avatar + Status -->
                        <div class="relative flex-shrink-0">
                            <img 
                                src="${avatar}" 
                                alt="${user.display_name}" 
                                class="w-12 h-12 rounded-full object-cover border-2 ${user.is_online ? 'border-green-400' : 'border-gray-300 dark:border-gray-600'}"
                                onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(user.display_name || user.username)}&background=7c3aed&color=fff&size=80'"
                            />
                            <div class="absolute -bottom-0.5 -right-0.5">
                                ${this.getStatusDot(user)}
                            </div>
                        </div>

                        <!-- User Info -->
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-1.5">
                                <span class="font-semibold text-sm text-gray-900 dark:text-white truncate">
                                    ${user.display_name || user.username}
                                </span>
                                ${user.is_verified ? '<i class="fas fa-check-circle text-blue-500 text-xs flex-shrink-0"></i>' : ''}
                            </div>
                            <div class="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                                <span>${this.getStatusText(user)}</span>
                                <span>آ·</span>
                                <span>â­گ ${rating}</span>
                                <span>آ·</span>
                                <span>ًںڈ† ${user.total_wins || 0}</span>
                            </div>
                            <!-- Compatibility Bar -->
                            <div class="flex items-center gap-2 mt-1.5">
                                <div class="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                    <div class="h-full rounded-full transition-all duration-500 ${compatPercent > 60 ? 'bg-green-500' : compatPercent > 30 ? 'bg-yellow-500' : 'bg-gray-400'}" style="width: ${compatPercent}%"></div>
                                </div>
                                <span class="text-[10px] text-gray-400 font-medium flex-shrink-0">${compatPercent}%</span>
                            </div>
                        </div>

                        <!-- Invite Button -->
                        <button 
                            id="invite-btn-${user.id}"
                            onclick="window._invitePanelSendInvite(${user.id})"
                            class="flex-shrink-0 px-3 py-2 text-xs font-bold rounded-xl transition-all ${isSent
                                ? 'bg-green-600 text-white opacity-60 cursor-not-allowed'
                                : 'bg-purple-600 hover:bg-purple-700 text-white hover:shadow-lg hover:shadow-purple-500/20 active:scale-95'
                            }"
                            ${isSent ? 'disabled' : ''}
                        >
                            ${isSent
                                ? `<i class="fas fa-check mr-1"></i>${t('matchmaking.invite_sent', State.lang)}`
                                : `<i class="fas fa-paper-plane mr-1"></i>${t('matchmaking.send_invite', State.lang)}`
                            }
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Update status
        const statusEl = document.getElementById('invitePanelStatus');
        if (statusEl) {
            statusEl.innerHTML = `
                <i class="fas fa-circle text-green-500 text-[6px] mr-1 animate-pulse"></i>
                ${this.total} ${t('users', State.lang)} آ· ${t('matchmaking.auto_updating', State.lang)}
            `;
        }
    }

    /**
     * T2.1: Show detailed hover card with competitor stats (delayed to avoid flicker)
     */
    static showHoverCard(userId: number, anchorEl: HTMLElement): void {
        this.hideHoverCard();
        this.hoverTimer = setTimeout(() => { void this.renderHoverCard(userId, anchorEl); }, 350);
    }

    /**
     * T2.1: Hide the hover card
     */
    static hideHoverCard(): void {
        if (this.hoverTimer) {
            clearTimeout(this.hoverTimer);
            this.hoverTimer = null;
        }
        document.getElementById('inviteHoverCard')?.remove();
    }

    private static async renderHoverCard(userId: number, anchorEl: HTMLElement): Promise<void> {
        const user = this.users.find(u => u.id === userId);
        if (!user) return;

        let stats: any = this.statsCache.get(userId);
        if (!stats) {
            try {
                const res = await ApiClient.get<any>(`/api/recommendations/competitor-stats/${userId}`);
                stats = res?.data || { wins: 0, losses: 0, top_categories: [] };
                this.statsCache.set(userId, stats);
            } catch {
                stats = { wins: 0, losses: 0, top_categories: [] };
            }
        }

        const lang = State.lang;
        const isRtl = lang === 'ar';
        const rect = anchorEl.getBoundingClientRect();
        const cardWidth = 280;
        // RTL: card goes left of cursor; LTR: right (flip when near edge)
        let left = isRtl ? rect.left - cardWidth - 12 : rect.right + 12;
        if (!isRtl && left + cardWidth > window.innerWidth - 8) left = rect.left - cardWidth - 12;
        if (isRtl && left < 8) left = rect.right + 12;
        const top = Math.min(Math.max(8, rect.top - 20), window.innerHeight - 320);

        const total = (stats.wins || 0) + (stats.losses || 0);
        const winRate = total > 0 ? Math.round(((stats.wins || 0) / total) * 100) : null;
        const cats = (stats.top_categories || []).slice(0, 3);

        const card = document.createElement('div');
        card.id = 'inviteHoverCard';
        card.dir = isRtl ? 'rtl' : 'ltr';
        card.style.cssText = `position:fixed; top:${top}px; left:${left}px; width:${cardWidth}px; z-index:70;`;
        card.className = 'bg-white dark:bg-[#1a1a2e] rounded-2xl shadow-2xl border border-gray-200 dark:border-purple-900/40 p-4 animate-fade-in-card pointer-events-auto';
        card.onmouseleave = () => this.hideHoverCard();

        card.innerHTML = `
            <div class="flex items-center gap-3 mb-3">
                <img src="${user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.display_name || user.username)}&background=7c3aed&color=fff&size=80`}"
                     class="w-12 h-12 rounded-full object-cover border-2 ${user.is_online ? 'border-green-400' : 'border-gray-300 dark:border-gray-600'}" alt="">
                <div class="min-w-0">
                    <div class="flex items-center gap-1">
                        <span class="font-bold text-sm text-gray-900 dark:text-white truncate">${user.display_name || user.username}</span>
                        ${user.is_verified ? '<i class="fas fa-check-circle text-blue-500 text-xs"></i>' : ''}
                    </div>
                    <span class="text-xs text-gray-400">@${user.username}</span>
                </div>
            </div>

            <div class="grid grid-cols-3 gap-2 text-center mb-3">
                <div class="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-2">
                    <div class="text-lg font-black text-purple-600 dark:text-purple-400">${user.average_rating ? user.average_rating.toFixed(1) : '—'}</div>
                    <div class="text-[10px] text-gray-500">â­گ ${t('matchmaking.rating_label', lang)}</div>
                </div>
                <div class="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-2">
                    <div class="text-lg font-black text-blue-600 dark:text-blue-400">${user.total_competitions ?? total}</div>
                    <div class="text-[10px] text-gray-500">ًںژ¯ ${t('matchmaking.competitions_label', lang)}</div>
                </div>
                <div class="bg-green-50 dark:bg-green-900/20 rounded-xl p-2">
                    <div class="text-lg font-black text-green-600 dark:text-green-400">${winRate !== null ? winRate + '%' : '—'}</div>
                    <div class="text-[10px] text-gray-500">ًںڈ† ${t('matchmaking.stats_winrate', lang)}</div>
                </div>
            </div>

            <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-3 px-1">
                <span>âœ… ${stats.wins || 0} ${t('matchmaking.wins_label', lang)}</span>
                <span>â‌Œ ${stats.losses || 0} ${t('matchmaking.stats_losses', lang)}</span>
            </div>

            ${cats.length ? `
            <div class="mb-3">
                <p class="text-[10px] font-bold text-gray-400 uppercase mb-1.5">${t('matchmaking.stats_top_categories', lang)}</p>
                <div class="flex flex-wrap gap-1.5">
                    ${cats.map((c: any) => `
                        <span class="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-white" style="background:${c.color || '#7c3aed'}">
                            <i class="fas ${c.icon || 'fa-star'}"></i>${lang === 'ar' ? c.name_ar : c.name_en}
                        </span>
                    `).join('')}
                </div>
            </div>` : ''}

            <a href="/profile/${user.username}?lang=${lang}"
               onclick="window._invitePanelClose()"
               class="block text-center py-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-purple-100 dark:hover:bg-purple-900/30 text-xs font-bold text-purple-600 dark:text-purple-400 transition-colors">
                ${t('matchmaking.view_profile', lang)} <i class="fas fa-arrow-${isRtl ? 'left' : 'right'} ml-1"></i>
            </a>
        `;

        document.body.appendChild(card);
    }

    /**
     * Register global window functions for inline handlers
     */
    static registerGlobals(): void {
        (window as any)._invitePanelClose = () => InvitePanel.close();
        (window as any)._invitePanelRefresh = () => InvitePanel.fetchUsers();
        (window as any)._invitePanelSearch = (q: string) => InvitePanel.handleSearch(q);
        (window as any)._invitePanelSendInvite = (userId: number) => InvitePanel.sendInvite(userId);
        // T2.1: hover card globals
        (window as any)._invitePanelHover = (userId: number, el: HTMLElement) => InvitePanel.showHoverCard(userId, el);
        (window as any)._invitePanelHoverEnd = () => InvitePanel.hideHoverCard();
        (window as any).openInvitePanel = (competitionId: number) => InvitePanel.open(competitionId);
        (window as any).closeInvitePanel = () => InvitePanel.close();
        (window as any).toggleInvitePanel = (competitionId: number) => InvitePanel.toggle(competitionId);
    }
}

// Auto-register globals
InvitePanel.registerGlobals();

export default InvitePanel;
