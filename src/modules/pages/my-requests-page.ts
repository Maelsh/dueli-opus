/**
 * My Requests Page
 * صفحة طلباتي
 */

import type { Context } from 'hono';
import type { Bindings, Variables, Language } from '../../config/types';
import { translations, getUILanguage, isRTL as checkRTL } from '../../i18n';
import { getNavigation, getLoginModal, getFooter } from '../../shared/components';
import { DUELI_PRIMARY_BTN, DUELI_TAB_ACTIVE, DUELI_TAB_INACTIVE } from '../../shared/constants';
import { generateHTML } from '../../shared/templates/layout';

/**
 * My Requests Page Handler
 */
export const myRequestsPage = async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
    const lang = c.get('lang') as Language;
    const tr = translations[getUILanguage(lang)];
    const rtl = checkRTL(lang);
    // One source of truth for the tab state: the server-rendered active tab and
    // setTab() both use these tokens, so a switch can never leave a tab holding
    // the legacy flat `bg-purple-600 text-white` next to the inactive token.
    const ACTIVE_TAB = DUELI_TAB_ACTIVE;
    const INACTIVE_TAB = DUELI_TAB_INACTIVE;

    const content = `
        ${getNavigation(lang)}
        ${getLoginModal(lang)}
        
        <div class="flex-1 bg-gray-50 dark:bg-[#0f0f0f]">
            <div class="container mx-auto px-4 py-8">
                <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-8">
                    <i class="fas fa-inbox ${rtl ? 'ml-3' : 'mr-3'} text-purple-600"></i>
                    ${tr.my_requests || 'My Requests'}
                </h1>
                
                <!-- Tabs -->
                <div class="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-lg mb-6 p-2 inline-flex gap-2 flex-wrap">
                    <button data-csp-on="click" data-csp-fn="setTab" data-csp-args='["received"]' id="tab-received" class="px-5 py-2 rounded-lg font-semibold transition-colors ${ACTIVE_TAB}">
                        <i class="fas fa-inbox ${rtl ? 'ml-1' : 'mr-1'}"></i>
                        ${tr.received_requests || 'Received'}
                    </button>
                    <button data-csp-on="click" data-csp-fn="setTab" data-csp-args='["sent"]' id="tab-sent" class="px-5 py-2 rounded-lg font-semibold transition-colors ${INACTIVE_TAB}">
                        <i class="fas fa-paper-plane ${rtl ? 'ml-1' : 'mr-1'}"></i>
                        ${tr.sent_requests || 'Sent'}
                    </button>
                    <button data-csp-on="click" data-csp-fn="setTab" data-csp-args='["invitations"]' id="tab-invitations" class="px-5 py-2 rounded-lg font-semibold transition-colors ${INACTIVE_TAB}">
                        <i class="fas fa-envelope-open-text ${rtl ? 'ml-1' : 'mr-1'}"></i>
                        ${tr.invitations || 'Invitations'}
                    </button>
                </div>
                
                <!-- Content -->
                <div id="requestsContent">
                    <div class="text-center py-12">
                        <i class="fas fa-spinner fa-spin text-4xl text-purple-400"></i>
                    </div>
                </div>
            </div>
        </div>
        
        ${getFooter(lang)}
        
        <script nonce="${(c.get('cspNonce') as string) ?? ''}">
            const lang = ${JSON.stringify(getUILanguage(lang))};
            const isRTL = ${rtl};
            const tr = ${JSON.stringify(tr)};
            const PRIMARY_BTN = ${JSON.stringify(DUELI_PRIMARY_BTN)};
            const ACTIVE_TAB = ${JSON.stringify(DUELI_TAB_ACTIVE)};
            const INACTIVE_TAB = ${JSON.stringify(DUELI_TAB_INACTIVE)};
            const ACTIVE_TAB_CLASSES = ACTIVE_TAB.split(' ').filter(Boolean);
            const INACTIVE_TAB_CLASSES = INACTIVE_TAB.split(' ').filter(Boolean);
            let currentTab = 'received';
            
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
                    loadRequests();
                } else if (typeof authStatus === 'function' && authStatus() === 'unknown') {
                    showAuthPending();
                } else {
                    showLoginRequired();
                }
            }
            window.addEventListener('dueli:auth-success', () => {
                if (window.currentUser) loadRequests();
                else initPageAuth();
            });
            window.retryPageAuth = initPageAuth;
            // CSP-delegated handlers must be reachable from window, otherwise
            // data-csp-fn="setTab" resolves to nothing and the tab strip is dead.
            window.setTab = setTab;

            function showAuthPending() {
                document.getElementById('requestsContent').innerHTML = \`
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-12 text-center shadow-lg">
                        <i class="fas fa-spinner fa-spin text-5xl text-purple-400 mb-4"></i>
                        <p class="text-gray-500 text-lg">\${tr.loading || 'Checking your session...'}</p>
                        <button data-csp-on="click" data-csp-fn="retryPageAuth" data-csp-args='[]' class="mt-6 px-8 py-3 \${PRIMARY_BTN}">
                            \${(tr.discovery && tr.discovery.retry) || tr.retry || 'Retry'}
                        </button>
                    </div>
                \`;
            }
            
            function showLoginRequired() {
                document.getElementById('requestsContent').innerHTML = \`
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-12 text-center shadow-lg">
                        <i class="fas fa-lock text-5xl text-gray-300 mb-4"></i>
                        <p class="text-gray-500 text-lg">\${tr.login_required || 'Please login to view your requests'}</p>
                        <button data-csp-on="click" data-csp-fn="showLoginModal" data-csp-args='[]' class="mt-6 px-8 py-3 \${PRIMARY_BTN}">
                            \${tr.login || 'Login'}
                        </button>
                    </div>
                \`;
            }
            
            function setTab(tab) {
                currentTab = tab;
                // Canonical Dueli gradient for the active tab (same token as the
                // CTAs); previously a flat solid purple background.
                document.querySelectorAll('[id^="tab-"]').forEach(el => {
                    el.classList.remove(...ACTIVE_TAB_CLASSES);
                    el.classList.add(...INACTIVE_TAB_CLASSES);
                });
                const active = document.getElementById('tab-' + tab);
                if (active) {
                    active.classList.add(...ACTIVE_TAB_CLASSES);
                    active.classList.remove(...INACTIVE_TAB_CLASSES);
                }
                loadRequests();
            }
            
            async function loadRequests() {
                const container = document.getElementById('requestsContent');
                container.innerHTML = '<div class="text-center py-12"><i class="fas fa-spinner fa-spin text-4xl text-purple-400"></i></div>';
                
                try {
                    const url = '/api/users/' + window.currentUser.id + '/requests?type=' + currentTab;
                    const res = await fetch(url, {
                        headers: {
                            'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId'))
                        }
                    });
                    const data = await res.json();
                    
                    if (data.success && data.data?.length > 0) {
                        container.innerHTML = \`
                            <div class="space-y-4">
                                \${data.data.map(req => renderRequestCard(req)).join('')}
                            </div>
                        \`;
                    } else {
                        container.innerHTML = \`
                            <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-12 text-center shadow-lg">
                                <i class="fas fa-inbox text-5xl text-gray-300 mb-4"></i>
                                <p class="text-gray-500 text-lg">\${tr.no_requests || 'No requests yet'}</p>
                            </div>
                        \`;
                    }
                } catch (err) {
                    console.error('Failed to load requests:', err);
                }
            }
            
            function renderRequestCard(req) {
                const isReceived = currentTab === 'received';
                const isInvitation = currentTab === 'invitations';
                
                // Determine which user to show based on tab
                let user, message;
                if (isReceived) {
                    user = { display_name: req.requester_name, avatar_url: req.requester_avatar, username: req.requester_username };
                    message = tr.wants_to_join || 'Wants to join your competition';
                } else if (isInvitation) {
                    user = { display_name: req.inviter_name, avatar_url: req.inviter_avatar, username: req.inviter_username };
                    message = tr.invites_you || 'Invites you to compete';
                } else {
                    user = { display_name: req.creator_name, avatar_url: req.creator_avatar, username: req.creator_username };
                    message = tr.you_requested || 'You requested to join';
                }
                
                const statusColors = {
                    pending: 'text-amber-600 bg-amber-100',
                    accepted: 'text-green-600 bg-green-100',
                    declined: 'text-red-600 bg-red-100',
                    expired: 'text-gray-600 bg-gray-100'
                };
                
                return \`
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-lg p-6">
                        <div class="flex items-start gap-4">
                            \${window.renderUserAvatar({
                                username: user?.username,
                                displayName: user?.display_name,
                                avatarUrl: user?.avatar_url,
                                fallbackSeed: user?.username || 'user',
                                lang,
                                className: 'shrink-0',
                                imgClassName: 'w-14 h-14 rounded-full'
                            })}
                            <div class="flex-1">
                                <div class="flex items-center gap-2 mb-1">
                                    <span class="font-bold text-gray-900 dark:text-white">\${user?.display_name || user?.username || 'User'}</span>
                                    <span class="px-2 py-0.5 text-xs font-semibold rounded-full \${statusColors[req.status] || 'text-gray-600 bg-gray-100'}">
                                        \${tr['status_' + req.status] || req.status}
                                    </span>
                                </div>
                                <p class="text-gray-600 dark:text-gray-400">\${message}:</p>
                                <a href="/competition/\${req.competition_id}?lang=\${lang}" 
                                   class="text-purple-600 hover:underline font-semibold">\${req.competition_title || 'Competition'}</a>
                                <p class="text-sm text-gray-400 mt-2">\${new Date(req.created_at).toLocaleString()}</p>
                            </div>
                            \${isReceived && req.status === 'pending' ? \`
                                <div class="flex gap-2">
                                    <button data-csp-on="click" data-csp-fn="handleRequest" data-csp-args='[\${req.competition_id},\${req.id},"accept"]' 
                                        class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                                        <i class="fas fa-check \${isRTL ? 'ml-1' : 'mr-1'}"></i>
                                        \${tr.accept || 'Accept'}
                                    </button>
                                    <button data-csp-on="click" data-csp-fn="handleRequest" data-csp-args='[\${req.competition_id},\${req.id},"decline"]' 
                                        class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                                        <i class="fas fa-times \${isRTL ? 'ml-1' : 'mr-1'}"></i>
                                        \${tr.decline || 'Decline'}
                                    </button>
                                </div>
                            \` : ''}
                            \${isInvitation && req.status === 'pending' ? \`
                                <div class="flex gap-2">
                                    <button data-csp-on="click" data-csp-fn="handleInvitation" data-csp-args='[\${req.competition_id},"accept"]' 
                                        class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                                        <i class="fas fa-check \${isRTL ? 'ml-1' : 'mr-1'}"></i>
                                        \${tr.accept || 'Accept'}
                                    </button>
                                    <button data-csp-on="click" data-csp-fn="handleInvitation" data-csp-args='[\${req.competition_id},"decline"]' 
                                        class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                                        <i class="fas fa-times \${isRTL ? 'ml-1' : 'mr-1'}"></i>
                                        \${tr.decline || 'Decline'}
                                    </button>
                                </div>
                            \` : ''}
                            \${currentTab === 'sent' && req.status === 'pending' ? \`
                                <button data-csp-on="click" data-csp-fn="cancelRequest" data-csp-args='[\${req.competition_id}]' 
                                    class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 transition-colors">
                                    <i class="fas fa-times \${isRTL ? 'ml-1' : 'mr-1'}"></i>
                                    \${tr.cancel || 'Cancel'}
                                </button>
                            \` : ''}
                        </div>
                    </div>
                \`;
            }
            
            async function handleRequest(compId, requestId, action) {
                try {
                    const res = await fetch(\`/api/competitions/\${compId}/\${action}-request\`, {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId')),
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ request_id: requestId })
                    });
                    
                    if (res.ok) {
                        loadRequests();
                    }
                } catch (err) {
                    console.error('Failed to ' + action + ' request:', err);
                }
            }
            
            async function handleInvitation(compId, action) {
                try {
                    const res = await fetch(\`/api/competitions/\${compId}/\${action}-invite\`, {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId')),
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    if (res.ok) {
                        const data = await res.json();
                        if (data.success && action === 'accept') {
                            // Redirect to competition page after accepting
                            window.location.href = '/competition/' + compId + '?lang=' + lang;
                        } else {
                            loadRequests();
                        }
                    }
                } catch (err) {
                    console.error('Failed to ' + action + ' invitation:', err);
                }
            }
            
            async function cancelRequest(compId) {
                try {
                    const res = await fetch(\`/api/competitions/\${compId}/request\`, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId'))
                        }
                    });
                    
                    if (res.ok) {
                        loadRequests();
                    }
                } catch (err) {
                    console.error('Failed to cancel request:', err);
                }
            }
        </script>
    `;

    return c.html(generateHTML(content, lang, tr.my_requests || 'My Requests', (c.get('cspNonce') as string) ?? ''));
};

export default myRequestsPage;
