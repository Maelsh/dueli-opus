/**
 * My Competitions Page
 * صفحة منافساتي
 */

import type { Context } from 'hono';
import type { Bindings, Variables, Language } from '../../config/types';
import { translations, getUILanguage, isRTL as checkRTL } from '../../i18n';
import { getNavigation, getLoginModal, getFooter } from '../../shared/components';
import { generateHTML } from '../../shared/templates/layout';

/**
 * My Competitions Page Handler
 */
export const myCompetitionsPage = async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
    const lang = c.get('lang') as Language;
    const tr = translations[getUILanguage(lang)];
    const rtl = checkRTL(lang);

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
                    <button onclick="setTab('all')" id="tab-all" class="px-5 py-2 rounded-lg font-semibold transition-colors bg-purple-600 text-white">
                        ${tr.all || 'All'}
                    </button>
                    <button onclick="setTab('pending')" id="tab-pending" class="px-5 py-2 rounded-lg font-semibold transition-colors text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800">
                        <i class="fas fa-clock ${rtl ? 'ml-1' : 'mr-1'} text-amber-500"></i>
                        ${tr.status_pending || 'Pending'}
                    </button>
                    <button onclick="setTab('live')" id="tab-live" class="px-5 py-2 rounded-lg font-semibold transition-colors text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800">
                        <span class="w-2 h-2 rounded-full bg-red-500 inline-block ${rtl ? 'ml-1' : 'mr-1'}"></span>
                        ${tr.status_live || 'Live'}
                    </button>
                    <button onclick="setTab('completed')" id="tab-completed" class="px-5 py-2 rounded-lg font-semibold transition-colors text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800">
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
        
        <script>
            const lang = '${lang}';
            const isRTL = ${rtl};
            const tr = ${JSON.stringify(tr)};
            let currentTab = 'all';
            
            document.addEventListener('DOMContentLoaded', async () => {
                await checkAuth();
                if (window.currentUser) {
                    loadCompetitions();
                } else {
                    showLoginRequired();
                }
            });
            
            function showLoginRequired() {
                document.getElementById('competitionsContent').innerHTML = \`
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-12 text-center shadow-lg">
                        <i class="fas fa-lock text-5xl text-gray-300 mb-4"></i>
                        <p class="text-gray-500 text-lg">\${tr.login_required || 'Please login to view your competitions'}</p>
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
                loadCompetitions();
            }
            
            async function loadCompetitions() {
                const container = document.getElementById('competitionsContent');
                container.innerHTML = '<div class="text-center py-12"><i class="fas fa-spinner fa-spin text-4xl text-purple-400"></i></div>';
                
                try {
                    let url = '/api/competitions?creator=' + window.currentUser.id;
                    if (currentTab !== 'all') {
                        url += '&status=' + currentTab;
                    }
                    
                    const res = await fetch(url);
                    const data = await res.json();
                    
                    if (data.success && data.data?.length > 0) {
                        container.innerHTML = \`
                            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                \${data.data.map(comp => renderCompetitionCard(comp)).join('')}
                            </div>
                        \`;
                    } else {
                        container.innerHTML = \`
                            <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-12 text-center shadow-lg">
                                <i class="fas fa-trophy text-5xl text-gray-300 mb-4"></i>
                                <p class="text-gray-500 text-lg">\${tr.no_competitions || 'No competitions yet'}</p>
                                <a href="/create?lang=\${lang}" class="inline-block mt-6 px-8 py-3 bg-purple-600 text-white rounded-full font-bold">
                                    \${tr.create_competition || 'Create your first competition'}
                                </a>
                            </div>
                        \`;
                    }
                } catch (err) {
                    console.error('Failed to load competitions:', err);
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

    return c.html(generateHTML(content, lang, tr.my_competitions || 'My Competitions'));
};

export default myCompetitionsPage;
