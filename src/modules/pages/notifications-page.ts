/**
 * Notifications Page
 * صفحة الإشعارات
 *
 * Post-R1 acceptance (D): the header "View All" links to /notifications but
 * no user-facing page existed. This page renders the authenticated inbox via
 * the existing GET /api/notifications contract (presented title/message/link
 * + unread state) and the existing read / read-all actions only.
 */

import type { Context } from 'hono';
import type { Bindings, Variables, Language } from '../../config/types';
import { translations, getUILanguage, isRTL as checkRTL } from '../../i18n';
import { getNavigation, getLoginModal, getFooter } from '../../shared/components';
import { generateHTML } from '../../shared/templates/layout';

/**
 * Notifications Page Handler
 */
export const notificationsPage = async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
    const lang = c.get('lang') as Language;
    const tr = translations[getUILanguage(lang)];
    const rtl = checkRTL(lang);

    const content = `
        ${getNavigation(lang)}
        ${getLoginModal(lang)}

        <div class="flex-1 bg-gray-50 dark:bg-[#0f0f0f]">
            <div class="container mx-auto px-4 py-8 max-w-3xl">
                <div class="flex items-center justify-between mb-6">
                    <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
                        <i class="fas fa-bell ${rtl ? 'ml-3' : 'mr-3'} text-purple-600"></i>
                        ${tr.notifications || 'Notifications'}
                    </h1>
                    <button data-csp-on="click" data-csp-fn="markAllNotificationsPageRead" data-csp-args='[]' id="markAllBtn" class="hidden px-5 py-2 rounded-full text-sm font-bold text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors" title="${tr.mark_all_read || 'Mark all read'}">
                        ${tr.mark_all_read || 'Mark all read'}
                    </button>
                </div>

                <div id="notificationsContent">
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-12 text-center shadow-lg">
                        <i class="fas fa-spinner fa-spin text-4xl text-purple-400 mb-4"></i>
                        <p class="text-gray-500">${tr.loading || 'Loading...'}</p>
                    </div>
                </div>
            </div>
        </div>

        ${getFooter(lang)}

        <script nonce="${(c.get('cspNonce') as string) ?? ''}">
            const lang = ${JSON.stringify(getUILanguage(lang))};
            const isRTL = ${rtl};
            const tr = ${JSON.stringify(tr)};

            document.addEventListener('DOMContentLoaded', initPageAuth);

            // Post-R1 acceptance: canonical auth lifecycle shared with
            // App.init — transient 'unknown' renders retrying, never a false
            // Login Required; login updates this page without a reload.
            async function initPageAuth() {
                try {
                    await checkAuth();
                } catch (err) {
                    console.error('Auth check failed:', err);
                }
                if (window.currentUser) {
                    loadNotifications();
                } else if (typeof authStatus === 'function' && authStatus() === 'unknown') {
                    showAuthPending();
                } else {
                    showLoginRequired();
                }
            }
            window.addEventListener('dueli:auth-success', () => {
                if (window.currentUser) loadNotifications();
                else initPageAuth();
            });
            window.retryPageAuth = initPageAuth;
            window.loadNotifications = loadNotifications;
            window.markNotificationRead = markNotificationRead;
            // PR #69 blocker 1: this name must stay unambiguous — the deferred
            // bundle owns window.markAllNotificationsRead (navbar dropdown).
            window.markAllNotificationsPageRead = markAllNotificationsPageRead;

            function esc(value) {
                return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
                    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
                }[ch]));
            }

            function authHeaders() {
                return {
                    'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId'))
                };
            }

            function showLoginRequired() {
                document.getElementById('markAllBtn').classList.add('hidden');
                document.getElementById('notificationsContent').innerHTML = \`
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-12 text-center shadow-lg">
                        <i class="fas fa-lock text-5xl text-gray-300 mb-4"></i>
                        <p class="text-gray-500 text-lg">\${tr.login_required || 'Please login to view notifications'}</p>
                        <button data-csp-on="click" data-csp-fn="showLoginModal" data-csp-args='[]' class="mt-6 px-8 py-3 bg-purple-600 text-white rounded-full font-bold">
                            \${tr.login || 'Login'}
                        </button>
                    </div>
                \`;
            }

            function showAuthPending() {
                document.getElementById('markAllBtn').classList.add('hidden');
                document.getElementById('notificationsContent').innerHTML = \`
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-12 text-center shadow-lg">
                        <i class="fas fa-spinner fa-spin text-5xl text-purple-400 mb-4"></i>
                        <p class="text-gray-500 text-lg">\${tr.loading || 'Checking your session...'}</p>
                        <button data-csp-on="click" data-csp-fn="retryPageAuth" data-csp-args='[]' class="mt-6 px-8 py-3 bg-purple-600 text-white rounded-full font-bold">
                            \${(tr.discovery && tr.discovery.retry) || tr.retry || 'Retry'}
                        </button>
                    </div>
                \`;
            }

            function showError() {
                document.getElementById('markAllBtn').classList.add('hidden');
                document.getElementById('notificationsContent').innerHTML = \`
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-12 text-center shadow-lg">
                        <i class="fas fa-exclamation-triangle text-5xl text-yellow-400 mb-4"></i>
                        <p class="text-gray-500 text-lg">\${(tr.errors && tr.errors.service_unavailable) || 'Could not load notifications'}</p>
                        <button data-csp-on="click" data-csp-fn="loadNotifications" data-csp-args='[]' class="mt-6 px-8 py-3 bg-purple-600 text-white rounded-full font-bold">
                            <i class="fas fa-rotate-right me-1"></i>\${(tr.discovery && tr.discovery.retry) || tr.retry || 'Retry'}
                        </button>
                    </div>
                \`;
            }

            function showEmpty() {
                document.getElementById('markAllBtn').classList.add('hidden');
                document.getElementById('notificationsContent').innerHTML = \`
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-12 text-center shadow-lg">
                        <i class="fas fa-bell-slash text-5xl text-gray-300 mb-4"></i>
                        <p class="text-gray-500 text-lg">\${tr.no_notifications || 'No notifications'}</p>
                    </div>
                \`;
            }

            function iconFor(type) {
                const icons = {
                    message: 'fa-envelope', follow: 'fa-heart', request: 'fa-user-plus',
                    invitation: 'fa-ticket-alt', rating: 'fa-star', comment: 'fa-comment',
                    post_like: 'fa-thumbs-up', post_comment: 'fa-comments', system: 'fa-info-circle'
                };
                return icons[type] || 'fa-bell';
            }

            function formatTime(dateStr) {
                const diff = Date.now() - new Date(dateStr).getTime();
                const minutes = Math.floor(diff / 60000);
                const hours = Math.floor(diff / 3600000);
                const days = Math.floor(diff / 86400000);
                if (!Number.isFinite(minutes) || minutes < 1) return lang === 'ar' ? 'الآن' : 'now';
                if (minutes < 60) return lang === 'ar' ? \`منذ \${minutes} دقيقة\` : \`\${minutes}m ago\`;
                if (hours < 24) return lang === 'ar' ? \`منذ \${hours} ساعة\` : \`\${hours}h ago\`;
                return lang === 'ar' ? \`منذ \${days} يوم\` : \`\${days}d ago\`;
            }

            async function loadNotifications() {
                const container = document.getElementById('notificationsContent');
                try {
                    const res = await fetch('/api/notifications?lang=' + encodeURIComponent(lang), {
                        headers: authHeaders()
                    });
                    if (res.status === 401) {
                        showLoginRequired();
                        return;
                    }
                    if (!res.ok) {
                        showError();
                        return;
                    }
                    const data = await res.json();
                    const items = data.data?.notifications || data.notifications || [];
                    if (data.success && items.length > 0) {
                        renderList(items);
                    } else if (data.success) {
                        showEmpty();
                    } else {
                        showError();
                    }
                } catch (err) {
                    console.error('Failed to load notifications:', err);
                    showError();
                }
            }

            function renderList(items) {
                const container = document.getElementById('notificationsContent');
                const hasUnread = items.some((n) => !n.is_read);
                document.getElementById('markAllBtn').classList.toggle('hidden', !hasUnread);
                container.innerHTML = \`
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-lg overflow-hidden divide-y divide-gray-100 dark:divide-gray-800" role="list" aria-label="\${esc(tr.notifications || 'Notifications')}">
                        \${items.map((n) => renderRow(n)).join('')}
                    </div>
                \`;
            }

            function renderRow(n) {
                const username = n.payload && typeof n.payload.username === 'string' ? n.payload.username.trim() : '';
                const actor = n.payload && typeof n.payload.actor === 'string' ? n.payload.actor.trim() : '';
                const profileHref = username ? \`/profile/\${encodeURIComponent(username)}?lang=\${encodeURIComponent(lang)}\` : null;
                const targetHref = typeof n.link === 'string' && n.link ? n.link : null;
                const markLabel = esc((tr.notifications_page && tr.notifications_page.mark_read) || 'Mark read');
                return \`
                    <div role="listitem" class="p-4 flex items-start gap-3 transition-colors \${n.is_read ? '' : 'bg-purple-50 dark:bg-purple-900/20'}">
                        <div class="w-10 h-10 shrink-0 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-600 flex items-center justify-center" aria-hidden="true">
                            <i class="fas \${iconFor(n.type)}"></i>
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-sm text-gray-900 dark:text-white \${n.is_read ? '' : 'font-bold'}">\${esc(n.title)}</p>
                            \${n.message ? \`<p class="text-sm text-gray-500 mt-0.5">\${esc(n.message)}</p>\` : ''}
                            <p class="text-xs text-gray-400 mt-1">\${esc(formatTime(n.created_at))}</p>
                            <div class="flex items-center gap-3 mt-1">
                                \${profileHref ? \`<a href="\${profileHref}" class="text-xs font-bold text-purple-600 hover:underline">\${esc(actor || username)}</a>\` : (actor ? \`<span class="text-xs text-gray-500">\${esc(actor)}</span>\` : '')}
                                \${targetHref ? \`<a href="\${esc(targetHref)}" class="text-xs font-bold text-purple-600 hover:underline">\${esc(tr.view || 'View')}</a>\` : ''}
                            </div>
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                            \${n.is_read ? '' : \`<button data-csp-on="click" data-csp-fn="markNotificationRead" data-csp-args='[\${n.id}]' class="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-600 hover:bg-purple-200 dark:hover:bg-purple-900/60 flex items-center justify-center transition-colors" title="\${markLabel}" aria-label="\${markLabel}"><i class="fas fa-check text-xs"></i></button>\`}
                            \${n.is_read ? '' : '<span class="w-2 h-2 rounded-full bg-purple-600" aria-hidden="true"></span>'}
                        </div>
                    </div>
                \`;
            }

            async function markNotificationRead(id) {
                try {
                    const res = await fetch('/api/notifications/' + id + '/read?lang=' + encodeURIComponent(lang), {
                        method: 'POST',
                        headers: authHeaders()
                    });
                    if (res.status === 401) {
                        showLoginRequired();
                        return;
                    }
                    if (res.ok) {
                        loadNotifications();
                        syncNavbarNotifications();
                    }
                } catch (err) {
                    console.error('Failed to mark notification as read:', err);
                }
            }

            async function markAllNotificationsPageRead() {
                try {
                    const res = await fetch('/api/notifications/read-all?lang=' + encodeURIComponent(lang), {
                        method: 'POST',
                        headers: authHeaders()
                    });
                    if (res.status === 401) {
                        showLoginRequired();
                        return;
                    }
                    if (res.ok) {
                        loadNotifications();
                        syncNavbarNotifications();
                    }
                } catch (err) {
                    console.error('Failed to mark all notifications as read:', err);
                }
            }

            // Best-effort navbar badge/dropdown refresh when the client bundle
            // is present. Guarded so the page stays fully correct standalone.
            function syncNavbarNotifications() {
                try {
                    const ui = window.NotificationsUI;
                    if (ui && typeof ui.loadNotifications === 'function') {
                        ui.loadNotifications();
                    }
                } catch (err) {
                    console.error('Navbar notifications sync failed:', err);
                }
            }
        </script>
    `;

    return c.html(generateHTML(content, lang, tr.notifications || 'Notifications', (c.get('cspNonce') as string) ?? ''));
};

export default notificationsPage;
