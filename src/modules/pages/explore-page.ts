/**
 * Explore Page
 * صفحة الاستكشاف والبحث
 * 
 * تعرض قسمين:
 * - القسم العلوي: المنافسات
 * - القسم السفلي: المستخدمين
 */

import type { Context } from 'hono';
import type { Bindings, Variables } from '../../config/types';
import { translations, getUILanguage, isRTL, type Language } from '../../i18n';
import { getNavigation, getLoginModal, getFooter, getCompetitionCard, getUserCard } from '../../shared/components';
import { generateHTML } from '../../shared/templates/layout';

export function explorePage(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
  const lang = c.get('lang') as Language;
  const tr = translations[getUILanguage(lang)];
  const rtl = isRTL(lang);

  const content = `
    ${getNavigation(lang)}
    ${getLoginModal(lang)}
    
    <div class="container mx-auto px-4 py-8">
      <!-- Header -->
      <div class="flex items-center gap-4 mb-6">
        <a href="/?lang=${lang}" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-all" title="${tr.back || 'Back'}">
          <i class="fas fa-arrow-${rtl ? 'right' : 'left'} text-xl text-gray-600 dark:text-gray-300" aria-hidden="true"></i>
          <span class="sr-only">${tr.back || 'Back'}</span>
        </a>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">${tr.explore || 'Explore'}</h1>
      </div>
      
      <!-- Search Query Display -->
      <div id="searchQueryDisplay" class="mb-6"></div>
      
      <!-- Competitions Section -->
      <section class="mb-10" aria-labelledby="comps-title">
        <div class="flex items-center justify-between mb-4">
          <h2 id="comps-title" class="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <i class="fas fa-trophy text-purple-500" aria-hidden="true"></i>
            ${tr.competitions || 'Competitions'}
            <span id="compsCount" class="text-sm font-normal text-gray-400"></span>
          </h2>
        </div>
        <div id="competitionsContainer">
          <div class="flex flex-col items-center justify-center py-12">
            <i class="fas fa-spinner fa-spin text-3xl text-purple-400 mb-3" aria-hidden="true"></i>
            <p class="text-gray-500">${tr.loading || 'Loading...'}</p>
          </div>
        </div>
      </section>
      
      <!-- Users Section -->
      <section aria-labelledby="users-title">
        <div class="flex items-center justify-between mb-4">
          <h2 id="users-title" class="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <i class="fas fa-users text-blue-500" aria-hidden="true"></i>
            ${tr.users || 'Users'}
            <span id="usersCount" class="text-sm font-normal text-gray-400"></span>
          </h2>
        </div>
        <div id="usersContainer">
          <div class="flex flex-col items-center justify-center py-12">
            <i class="fas fa-spinner fa-spin text-3xl text-blue-400 mb-3" aria-hidden="true"></i>
            <p class="text-gray-500">${tr.loading || 'Loading...'}</p>
          </div>
        </div>
      </section>
    </div>
    
    ${getFooter(lang)}
    
    <script>
      (function() {
        const lang = '${lang}';
        const tr = ${JSON.stringify(tr)};
        const rtl = ${rtl};
        const search = new URLSearchParams(window.location.search).get('search') || '';
        
        // Display search query
        if (search) {
          document.getElementById('searchQueryDisplay').innerHTML = \`
            <div class="bg-purple-50 dark:bg-purple-900/20 rounded-xl px-4 py-3 flex items-center gap-3">
              <i class="fas fa-search text-purple-500"></i>
              <span class="text-gray-700 dark:text-gray-300">\${tr.search_results_for || 'Search results for'}: <strong>\${search}</strong></span>
            </div>
          \`;
        }
        
        // Wait for client bundle to load (only need renderCompetitionCards - users are inline now)
        function waitForBundle(callback, maxAttempts = 50) {
          let attempts = 0;
          const check = setInterval(() => {
            attempts++;
            if (typeof window.renderCompetitionCards === 'function') {
              clearInterval(check);
              callback();
            } else if (attempts >= maxAttempts) {
              clearInterval(check);
              console.error('Bundle functions not available after ' + maxAttempts + ' attempts');
              callback();
            }
          }, 100);
        }
        
        async function loadSearchResults() {
          await Promise.all([
            loadCompetitions(),
            loadUsers()
          ]);
        }
        
        async function loadCompetitions() {
          try {
            let url = '/api/competitions?limit=50';
            if (search) url += '&search=' + encodeURIComponent(search);
            
            const res = await fetch(url);
            const data = await res.json();
            
            const container = document.getElementById('competitionsContainer');
            const countEl = document.getElementById('compsCount');
            
            if (!data.success || !data.data?.length) {
              container.innerHTML = \`
                <div class="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-2xl">
                  <div class="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mx-auto mb-4">
                    <i class="fas fa-trophy text-2xl text-gray-300 dark:text-gray-500"></i>
                  </div>
                  <p class="text-gray-500">\${tr.no_competitions || 'No competitions found'}</p>
                </div>
              \`;
              countEl.textContent = '(0)';
              return;
            }
            
            countEl.textContent = '(' + data.data.length + ')';
            
            // Responsive grid: 1 col mobile, 2 cols tablet, 3-4 cols desktop
            // Max rows: 2 on mobile, 3 on tablet/desktop
            const maxItems = window.innerWidth < 640 ? 2 : window.innerWidth < 1024 ? 6 : 12;
            const displayItems = data.data.slice(0, maxItems);
            const hasMore = data.data.length > maxItems;
            
            container.innerHTML = \`
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                \${window.renderCompetitionCards(displayItems, lang)}
              </div>
              \${hasMore ? \`
                <div class="text-center mt-4">
                  <a href="/explore?search=\${encodeURIComponent(search)}&type=competitions&lang=\${lang}" 
                     class="inline-flex items-center gap-2 px-4 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full text-sm font-semibold hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors">
                    \${tr.view_all || 'View all'} (\${data.data.length})
                    <i class="fas fa-arrow-\${rtl ? 'left' : 'right'}"></i>
                  </a>
                </div>
              \` : ''}
            \`;
          } catch (err) {
            console.error('Failed to load competitions:', err);
            document.getElementById('competitionsContainer').innerHTML = \`
              <div class="text-center py-8 text-red-500">
                <i class="fas fa-exclamation-triangle mb-2"></i>
                <p>\${tr.error_occurred || 'An error occurred'}</p>
              </div>
            \`;
          }
        }
        
        async function loadUsers() {
          try {
            // Both /api/search/users and /api/users require q parameter
            // Only fetch users if there's a search query (matching homepage behavior)
            if (!search || search.length < 2) {
              document.getElementById('usersContainer').innerHTML = \`
                <div class="text-center py-12 bg-gray-100 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
                  <div class="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center mx-auto mb-4">
                    <i class="fas fa-users text-2xl text-gray-400 dark:text-gray-500" aria-hidden="true"></i>
                  </div>
                  <p class="text-gray-500 dark:text-gray-400">\${tr.search_users_prompt || 'Enter a search term to find users'}</p>
                </div>
              \`;
              document.getElementById('usersCount').textContent = '';
              return;
            }
            
            // Use the same API that works in search dropdown
            const url = '/api/search/users?q=' + encodeURIComponent(search) + '&limit=20';
            const res = await fetch(url);
            const data = await res.json();
            
            const container = document.getElementById('usersContainer');
            const countEl = document.getElementById('usersCount');
            
            // API returns data.items (array) - same as homepage dropdown
            const users = data.data?.items || data.data || [];
            
            if (!data.success || !users.length) {
              container.innerHTML = \`
                <div class="text-center py-12 bg-gray-100 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
                  <div class="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center mx-auto mb-4">
                    <i class="fas fa-users text-2xl text-gray-400 dark:text-gray-500" aria-hidden="true"></i>
                  </div>
                  <p class="text-gray-500 dark:text-gray-400">\${tr.no_users || 'No users found'}</p>
                </div>
              \`;
              countEl.textContent = '(0)';
              return;
            }
            
            countEl.textContent = '(' + users.length + ')';
            
            // Responsive: 1 col mobile, 2 cols tablet, 3 cols desktop
            const maxItems = window.innerWidth < 640 ? 2 : window.innerWidth < 1024 ? 4 : 9;
            const displayItems = users.slice(0, maxItems);
            const hasMore = users.length > maxItems;
            
            // Helper function to format rating as stars
            function formatRating(rating) {
              const stars = Math.round((rating || 0) / 20); // 0-100 to 0-5 stars
              return '★'.repeat(stars) + '☆'.repeat(5 - stars);
            }
            
            // Build user cards HTML with full profile info
            const usersHtml = displayItems.map(user => \`
              <a href="/profile/\${user.username}?lang=\${lang}" 
                 class="user-card group block bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-md hover:shadow-xl transition-all duration-300 border border-gray-100 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600 relative">
                
                \${user.is_busy ? \`
                  <div class="absolute top-2 \${rtl ? 'left-2' : 'right-2'} flex items-center gap-1 px-2 py-1 bg-red-500 text-white text-xs rounded-full animate-pulse">
                    <span class="w-2 h-2 bg-white rounded-full"></span>
                    \${tr.live || 'LIVE'}
                  </div>
                \` : ''}
                
                <div class="flex items-center gap-4">
                  <!-- Avatar with verified badge -->
                  <div class="relative flex-shrink-0">
                    <img 
                      src="\${user.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + user.username}" 
                      alt="\${user.display_name || user.username}" 
                      class="w-16 h-16 rounded-full object-cover border-2 \${user.is_busy ? 'border-red-500' : 'border-purple-100 dark:border-purple-900'}"
                      loading="lazy"
                    >
                    \${user.is_verified ? \`
                      <div class="absolute -bottom-1 \${rtl ? '-left-1' : '-right-1'} bg-blue-500 rounded-full p-1" title="\${tr.verified || 'Verified'}">
                        <i class="fas fa-check text-white text-xs" aria-hidden="true"></i>
                      </div>
                    \` : ''}
                  </div>
                  
                  <!-- User Info -->
                  <div class="flex-1 min-w-0">
                    <h3 class="font-bold text-gray-900 dark:text-white truncate group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                      \${user.display_name || user.username}
                    </h3>
                    <p class="text-sm text-gray-500 dark:text-gray-400 truncate">@\${user.username}</p>
                    
                    <!-- Rating -->
                    <div class="text-yellow-500 text-sm mt-1" title="\${tr.average_rating || 'Rating'}: \${user.average_rating || 0}%">
                      \${formatRating(user.average_rating)}
                    </div>
                  </div>
                </div>
                
                <!-- Stats Row -->
                <div class="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
                  <span class="flex items-center gap-1" title="\${tr.followers || 'Followers'}">
                    <i class="fas fa-users" aria-hidden="true"></i>
                    \${user.followers_count || 0}
                  </span>
                  <span class="flex items-center gap-1" title="\${tr.competitions || 'Competitions'}">
                    <i class="fas fa-trophy" aria-hidden="true"></i>
                    \${user.total_competitions || 0}
                  </span>
                  <span class="flex items-center gap-1" title="\${tr.wins || 'Wins'}">
                    <i class="fas fa-medal" aria-hidden="true"></i>
                    \${user.total_wins || 0}
                  </span>
                  \${user.country ? \`
                    <span class="flex items-center gap-1" title="\${tr.country || 'Country'}">
                      <i class="fas fa-globe" aria-hidden="true"></i>
                      \${user.country}
                    </span>
                  \` : ''}
                </div>
              </a>
            \`).join('');
            
            container.innerHTML = \`
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                \${usersHtml}
              </div>
              \${hasMore ? \`
                <div class="text-center mt-4">
                  <a href="/explore?search=\${encodeURIComponent(search)}&type=users&lang=\${lang}" 
                     class="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full text-sm font-semibold hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors">
                    \${tr.view_all || 'View all'} (\${users.length})
                    <i class="fas fa-arrow-\${rtl ? 'left' : 'right'}" aria-hidden="true"></i>
                  </a>
                </div>
              \` : ''}
            \`;
          } catch (err) {
            console.error('Failed to load users:', err);
            document.getElementById('usersContainer').innerHTML = \`
              <div class="text-center py-8 text-red-500">
                <i class="fas fa-exclamation-triangle mb-2"></i>
                <p>\${tr.error_occurred || 'An error occurred'}</p>
              </div>
            \`;
          }
        }
        
        // Initialize
        document.addEventListener('DOMContentLoaded', function() {
          if (typeof checkAuth === 'function') checkAuth();
          waitForBundle(loadSearchResults);
        });
        
        // Also try immediately in case DOMContentLoaded already fired
        if (document.readyState !== 'loading') {
          if (typeof checkAuth === 'function') checkAuth();
          waitForBundle(loadSearchResults);
        }
      })();
    </script>
  `;

  return c.html(generateHTML(content, lang, tr.explore || 'Explore'));
}
