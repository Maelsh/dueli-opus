/**
 * My Requests Page
 * صفحة طلباتي
 */

import type { Context } from 'hono';
import type { Bindings, Variables, Language } from '../../config/types';
import { translations, getUILanguage, isRTL as checkRTL } from '../../i18n';
import { getNavigation, getLoginModal, getFooter } from '../../shared/components';
import { generateHTML } from '../../shared/templates/layout';

/**
 * My Requests Page Handler
 */
export const myRequestsPage = async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
    const lang = c.get('lang') as Language;
    const tr = translations[getUILanguage(lang)];
    const rtl = checkRTL(lang);

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
                <div class="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-lg mb-6 p-2 inline-flex gap-2">
                    <button onclick="setTab('received')" id="tab-received" class="px-5 py-2 rounded-lg font-semibold transition-colors bg-purple-600 text-white">
                        <i class="fas fa-inbox ${rtl ? 'ml-1' : 'mr-1'}"></i>
                        ${tr.received_requests || 'Received'}
                    </button>
                    <button onclick="setTab('sent')" id="tab-sent" class="px-5 py-2 rounded-lg font-semibold transition-colors text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800">
                        <i class="fas fa-paper-plane ${rtl ? 'ml-1' : 'mr-1'}"></i>
                        ${tr.sent_requests || 'Sent'}
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
        
        <script>
            const lang = '${lang}';
            const isRTL = ${rtl};
            const tr = ${JSON.stringify(tr)};
            let currentTab = 'received';
            
            document.addEventListener('DOMContentLoaded', async () => {
                await checkAuth();
                if (window.currentUser) {
                    loadRequests();
                } else {
                    showLoginRequired();
                }
            });
            
            function showLoginRequired() {
                document.getElementById('requestsContent').innerHTML = \`
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-12 text-center shadow-lg">
                        <i class="fas fa-lock text-5xl text-gray-300 mb-4"></i>
                        <p class="text-gray-500 text-lg">\${tr.login_required || 'Please login to view your requests'}</p>
                        <button onclick="showLoginModal()" class="mt-6 px-8 py-3 bg-purple-600 text-white rounded-full font-bold">
                            \${tr.login || 'Login'}
                        </button>
                    </div>
                \`;
            }
            
            function setTab(tab) {
                currentTab = tab;
                document.querySelectorAll('[id^="tab-"]').forEach(el => {
                    el.classList.remove('bg-purple-600', 'text-white');
                    el.classList.add('text-gray-600');
                });
                document.getElementById('tab-' + tab).classList.add('bg-purple-600', 'text-white');
                document.getElementById('tab-' + tab).classList.remove('text-gray-600');
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
                const user = isReceived ? req.requester : req.competition?.creator;
                const statusColors = {
                    pending: 'text-amber-600 bg-amber-100',
                    accepted: 'text-green-600 bg-green-100',
                    declined: 'text-red-600 bg-red-100'
                };
                
                return \`
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-lg p-6">
                        <div class="flex items-start gap-4">
                            <img src="\${user?.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + (user?.username || 'user')}" 
                                 class="w-14 h-14 rounded-full">
                            <div class="flex-1">
                                <div class="flex items-center gap-2 mb-1">
                                    <span class="font-bold text-gray-900 dark:text-white">\${user?.display_name || user?.username || 'User'}</span>
                                    <span class="px-2 py-0.5 text-xs font-semibold rounded-full \${statusColors[req.status] || 'text-gray-600 bg-gray-100'}">
                                        \${tr['status_' + req.status] || req.status}
                                    </span>
                                </div>
                                <p class="text-gray-600 dark:text-gray-400">
                                    \${isReceived 
                                        ? (tr.wants_to_join || 'Wants to join your competition') 
                                        : (tr.you_requested || 'You requested to join')}:
                                </p>
                                <a href="/competition/\${req.competition_id}?lang=\${lang}" 
                                   class="text-purple-600 hover:underline font-semibold">\${req.competition?.title || 'Competition'}</a>
                                <p class="text-sm text-gray-400 mt-2">\${new Date(req.created_at).toLocaleString()}</p>
                            </div>
                            \${isReceived && req.status === 'pending' ? \`
                                <div class="flex gap-2">
                                    <button onclick="handleRequest(\${req.competition_id}, \${req.id}, 'accept')" 
                                        class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                                        <i class="fas fa-check \${isRTL ? 'ml-1' : 'mr-1'}"></i>
                                        \${tr.accept || 'Accept'}
                                    </button>
                                    <button onclick="handleRequest(\${req.competition_id}, \${req.id}, 'decline')" 
                                        class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                                        <i class="fas fa-times \${isRTL ? 'ml-1' : 'mr-1'}"></i>
                                        \${tr.decline || 'Decline'}
                                    </button>
                                </div>
                            \` : ''}
                            \${!isReceived && req.status === 'pending' ? \`
                                <button onclick="cancelRequest(\${req.competition_id})" 
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

    return c.html(generateHTML(content, lang, tr.my_requests || 'My Requests'));
};

export default myRequestsPage;
