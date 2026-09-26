/**
 * My Competitions Page
 * صفحة منافساتي
 */

import type { Context } from 'hono';
import type { Bindings, Variables, Language } from '../../config/types';
import { translations, getUILanguage, isRTL as checkRTL } from '../../i18n';
import { getNavigation, getLoginModal, getFooter } from '../../shared/components';
import { DUELI_PRIMARY_BTN, DUELI_TAB_ACTIVE, DUELI_TAB_INACTIVE } from '../../shared/constants';
import { generateHTML } from '../../shared/templates/layout';

/**
 * My Competitions Page Handler
 */
export const myCompetitionsPage = async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
    const lang = c.get('lang') as Language;
    const tr = translations[getUILanguage(lang)];
    const rtl = checkRTL(lang);
    // B4: canonical Dueli gradient, exposed to the inline script so tab/CTA
    // class swaps stay identical before and after a client rerender.
    const PRIMARY_BTN = DUELI_PRIMARY_BTN;
    const ACTIVE_TAB = DUELI_TAB_ACTIVE;
    const INACTIVE_TAB = DUELI_TAB_INACTIVE;

    const content = `
        ${getNavigation(lang)}
        ${getLoginModal(lang)}
        
        <div class="flex-1 bg-gray-50 dark:bg-[#0f0f0f]">
            <div class="container mx-auto px-4 py-8">
                <div class="flex items-center justify-between mb-8">
                    <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
                        <i class="fas fa-trophy ${rtl ? 'ml-3' : 'mr-3'} text-amber-500"></i>
                        ${tr.my_competitions || 'My Competitions'}
                    </h1>
                    <a href="/create?lang=${lang}" class="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-full font-bold hover:opacity-90 transition-opacity shadow-lg">
                        <i class="fas fa-plus ${rtl ? 'ml-2' : 'mr-2'}"></i>
                        ${tr.create_competition || 'Create Competition'}
                    </a>
                </div>
                
                <!-- Tabs -->
                <div class="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-lg mb-6 p-2 inline-flex gap-2">
                    <button data-csp-on="click" data-csp-fn="setTab" data-csp-args='["all"]' id="tab-all" class="px-5 py-2 rounded-lg font-semibold transition-colors ${ACTIVE_TAB}">
                        ${tr.all || 'All'}
                    </button>
                    <button data-csp-on="click" data-csp-fn="setTab" data-csp-args='["pending"]' id="tab-pending" class="px-5 py-2 rounded-lg font-semibold transition-colors ${INACTIVE_TAB}">
                        <i class="fas fa-clock ${rtl ? 'ml-1' : 'mr-1'} text-amber-500"></i>
                        ${tr.status_pending || 'Pending'}
                    </button>
                    <button data-csp-on="click" data-csp-fn="setTab" data-csp-args='["live"]' id="tab-live" class="px-5 py-2 rounded-lg font-semibold transition-colors ${INACTIVE_TAB}">
                        <span class="w-2 h-2 rounded-full bg-red-500 inline-block ${rtl ? 'ml-1' : 'mr-1'}"></span>
                        ${tr.status_live || 'Live'}
                    </button>
                    <button data-csp-on="click" data-csp-fn="setTab" data-csp-args='["completed"]' id="tab-completed" class="px-5 py-2 rounded-lg font-semibold transition-colors ${INACTIVE_TAB}">
                        <i class="fas fa-check-circle ${rtl ? 'ml-1' : 'mr-1'} text-green-500"></i>
                        ${tr.completed || 'Completed'}
                    </button>
                </div>
                
                <!-- Content -->
                <div id="competitionsContent">
                    <div class="text-center py-12">
                        <i class="fas fa-spinner fa-spin text-4xl text-purple-400"></i>
                    </div>
                </div>
            </div>
        </div>
        
        ${getFooter(lang)}
        
        <script nonce="${(c.get('cspNonce') as string) ?? ''}">
            const lang = '${lang}';
            const isRTL = ${rtl};
            const tr = ${JSON.stringify(tr)};
            const PRIMARY_BTN = ${JSON.stringify(PRIMARY_BTN)};
            const ACTIVE_TAB = ${JSON.stringify(ACTIVE_TAB)};
            const INACTIVE_TAB = ${JSON.stringify(INACTIVE_TAB)};
            const ACTIVE_TAB_CLASSES = ACTIVE_TAB.split(' ').filter(Boolean);
            const INACTIVE_TAB_CLASSES = INACTIVE_TAB.split(' ').filter(Boolean);
            let currentTab = 'all';
            
            // B1: a successful modal login must update this page immediately,
            // with no manual refresh and no full reload.
            window.addEventListener('dueli:auth-success', () => {
                loadCompetitions();
            });

            // CSP-delegated handlers must be reachable from window.
            window.setTab = setTab;
            window.loadCompetitions = loadCompetitions;

            document.addEventListener('DOMContentLoaded', async () => {
                try {
                    await checkAuth();
                } catch (err) {
                    // Bounded/transient auth check: fall through to a definite
                    // state instead of an endless spinner.
                    console.error('Auth check failed:', err);
                }
                if (window.currentUser) {
                    loadCompetitions();
                } else {
                    showLoginRequired();
                }
            });
            
            function renderInto(html) {
                const container = document.getElementById('competitionsContent');
                if (container) container.innerHTML = html;
            }
            
            function showLoginRequired() {
                renderInto(\`
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-12 text-center shadow-lg" data-competitions-state="login-required">
                        <i class="fas fa-lock text-5xl text-gray-300 mb-4"></i>
                        <p class="text-gray-500 text-lg">\${tr.login_required || 'Please login to view your competitions'}</p>
                        <button data-csp-on="click" data-csp-fn="showLoginModal" data-csp-args='[]' class="mt-6 px-8 py-3 \${PRIMARY_BTN}">
                            \${tr.login || 'Login'}
                        </button>
                    </div>
                \`);
            }
            
            // B1/B4: every load attempt ends in a definite state: content,
            // empty, login-required, or a recoverable error with retry.
            function showError() {
                renderInto(\`
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-12 text-center shadow-lg" data-competitions-state="error">
                        <i class="fas fa-exclamation-triangle text-5xl text-yellow-400 mb-4"></i>
                        <p class="text-gray-500 text-lg">\${tr.errors?.service_unavailable || tr.load_failed || 'Could not load your competitions'}</p>
                        <button data-csp-on="click" data-csp-fn="loadCompetitions" data-csp-args='[]' class="mt-6 px-8 py-3 \${PRIMARY_BTN}">
                            <i class="fas fa-rotate-right me-1"></i>\${(tr.discovery && tr.discovery.retry) || tr.retry || 'Retry'}
                        </button>
                    </div>
                \`);
            }
            
            function showEmpty() {
                renderInto(\`
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-12 text-center shadow-lg" data-competitions-state="empty">
                        <i class="fas fa-trophy text-5xl text-gray-300 mb-4"></i>
                        <p class="text-gray-500 text-lg">\${tr.no_competitions || 'No competitions yet'}</p>
                        <a href="/create?lang=\${lang}" class="inline-block mt-6 px-8 py-3 \${PRIMARY_BTN}">
                            \${tr.create_competition || 'Create your first competition'}
                        </a>
                    </div>
                \`);
            }
            
            function setTab(tab) {
                currentTab = tab;
                document.querySelectorAll('[id^="tab-"]').forEach(el => {
                    el.classList.remove(...ACTIVE_TAB_CLASSES);
                    el.classList.add(...INACTIVE_TAB_CLASSES);
                });
                const active = document.getElementById('tab-' + tab);
                if (active) {
                    active.classList.remove(...INACTIVE_TAB_CLASSES);
                    active.classList.add(...ACTIVE_TAB_CLASSES);
                }
                loadCompetitions();
            }
            
            async function loadCompetitions() {
                const container = document.getElementById('competitionsContent');
                if (!container || !window.currentUser) return;
                container.innerHTML = '<div class="text-center py-12" data-competitions-state="loading"><i class="fas fa-spinner fa-spin text-4xl text-purple-400"></i></div>';
                
                try {
                    // استخدام user= لجلب المنافسات التي يكون فيها المستخدم creator أو opponent
                    let url = '/api/competitions?user=' + window.currentUser.id;
                    if (currentTab !== 'all') {
                        url += '&status=' + currentTab;
                    }
                    
                    const res = await fetch(url);
                    
                    // B1: a genuine 401 shows login-required; 429/5xx/network are
                    // transient and must render a recoverable state, not logout.
                    if (res.status === 401) {
                        showLoginRequired();
                        return;
                    }
                    if (!res.ok) {
                        showError();
                        return;
                    }
                    
                    const data = await res.json();
                    
                    if (data.success && data.data?.length > 0) {
                        container.innerHTML = \`
                            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-competitions-state="content">
                                \${data.data.map(comp => renderCompetitionCard(comp)).join('')}
                            </div>
                        \`;
                    } else {
                        showEmpty();
                    }
                } catch (err) {
                    console.error('Failed to load competitions:', err);
                    showError();
                }
            }
            
            function renderCompetitionCard(comp) {
                // Use the shared OOP component from client bundle
                return window.renderCompetitionCard(comp, lang, { showDeleteButton: true });
            }
            
            async function deleteCompetition(id) {
                if (!confirm(\`\${tr.confirm_delete || 'Are you sure?'}\`)) return;
                
                try {
                    const res = await fetch(\`/api/competitions/\${id}\`, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId'))
                        }
                    });
                    if (res.ok) {
                        loadCompetitions();
                    }
                } catch (err) {
                    console.error('Failed to delete:', err);
                }
            }
        </script>
    `;

    return c.html(generateHTML(content, lang, tr.my_competitions || 'My Competitions', (c.get('cspNonce') as string) ?? ''));
};

export default myCompetitionsPage;
