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
    
    <script nonce="${(c.get('cspNonce') as string) ?? ''}">
      (function() {
        const lang = '${lang}';
        const tr = ${JSON.stringify(tr)};
        const rtl = ${rtl};
        const search = new URLSearchParams(window.location.search).get('search') || '';
        
        // Display search query (R1.1: safe sink — untrusted value via textContent only)
        if (search) {
          const display = document.getElementById('searchQueryDisplay');
          if (display) {
            display.textContent = '';
            const box = document.createElement('div');
            box.className = 'bg-purple-50 dark:bg-purple-900/20 rounded-xl px-4 py-3 flex items-center gap-3';
            const icon = document.createElement('i');
            icon.className = 'fas fa-search text-purple-500';
            icon.setAttribute('aria-hidden', 'true');
            const label = document.createElement('span');
            label.className = 'text-gray-700 dark:text-gray-300';
            label.textContent = (tr.search_results_for || 'Search results for') + ': ';
            const strong = document.createElement('strong');
            strong.className = 'break-words';
            strong.setAttribute('dir', 'auto');
            strong.textContent = search;
            label.appendChild(strong);
            box.appendChild(icon);
            box.appendChild(label);
            display.appendChild(box);
          }
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
        
        // B13: translated error fallback with a retry button — never a blank screen
        function showDiscoveryError(containerId) {
          const el = document.getElementById(containerId);
          if (!el) return;
          el.innerHTML = \`
            <div class="text-center py-8 text-red-500 dark:text-red-400" role="alert">
              <i class="fas fa-exclamation-triangle mb-2" aria-hidden="true"></i>
              <p>\${tr.errors?.service_unavailable || tr.error_occurred || 'Error'}</p>
              <button type="button" class="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-400 text-white rounded-full text-sm font-semibold transition-colors" data-action="retry-discovery" aria-label="\${tr.discovery?.retry || 'Retry'}">
                <i class="fas fa-rotate-right" aria-hidden="true"></i>
                \${tr.discovery?.retry || 'Retry'}
              </button>
            </div>
          \`;
          const retryBtn = el.querySelector('[data-action="retry-discovery"]');
          if (retryBtn) retryBtn.addEventListener('click', loadSearchResults);
        }

        // B7: progressive loading state for competitions.
        // GET /api/competitions supports limit/offset, so "view all" is
        // replaced by appending the next batch at the current offset.
        const COMP_BATCH = 12;
        let compOffset = 0;
        const compSeen = new Set();
        let compLoading = false;
        let compDone = false;
        let compObserver = null;

        function compCardHtml(items) {
          const fresh = items.filter(c => c && c.id != null && !compSeen.has(c.id));
          fresh.forEach(c => compSeen.add(c.id));
          return fresh.map(c => window.renderCompetitionCard(c, lang)).join('');
        }

        function ensureCompShell() {
          const container = document.getElementById('competitionsContainer');
          if (!container) return null;
          if (!document.getElementById('competitionsGrid')) {
            container.innerHTML = '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" id="competitionsGrid"></div>' +
                                  '<div id="competitionsStatus" class="text-center mt-4"></div>';
          }
          return container;
        }

        function setCompStatus(state) {
          const status = document.getElementById('competitionsStatus');
          if (!status) return;
          if (state === 'loading') {
            status.innerHTML = \`<div class="py-4" role="status" aria-live="polite" data-explore-state="loading">
              <i class="fas fa-spinner fa-spin text-purple-500" aria-hidden="true"></i>
              <span class="sr-only">\${tr.loading || 'Loading...'}</span>
            </div>\`;
            return;
          }
          if (state === 'error') {
            status.innerHTML = \`<div class="py-4 text-red-500 dark:text-red-400" role="alert" data-explore-state="error">
              <p>\${tr.errors?.service_unavailable || tr.error_occurred || 'Error'}</p>
              <button type="button" class="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full text-sm font-semibold" data-action="retry-competitions">
                <i class="fas fa-rotate-right" aria-hidden="true"></i>\${tr.discovery?.retry || 'Retry'}
              </button>
            </div>\`;
            const btn = status.querySelector('[data-action="retry-competitions"]');
            if (btn) btn.addEventListener('click', () => loadCompetitions({ append: true }));
            return;
          }
          if (state === 'end') {
            status.innerHTML = \`<p class="text-sm text-gray-400" data-explore-state="end">\${tr.discovery?.no_more_results || 'No more results'}</p>\`;
            return;
          }
          status.innerHTML = \`<button type="button" class="inline-flex items-center gap-2 px-4 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full text-sm font-semibold" data-action="load-more-competitions">
            \${tr.load_more || 'Load more'}
          </button>\`;
          const more = status.querySelector('[data-action="load-more-competitions"]');
          if (more) more.addEventListener('click', () => loadCompetitions({ append: true }));
        }

        // Auto-append near the end of the list; the button above is the
        // keyboard-accessible fallback, so it is never IO-only.
        function observeCompEnd() {
          if (compObserver || typeof IntersectionObserver === 'undefined') return;
          const status = document.getElementById('competitionsStatus');
          if (!status) return;
          compObserver = new IntersectionObserver((entries) => {
            if (entries.some(e => e.isIntersecting)) loadCompetitions({ append: true });
          }, { rootMargin: '200px' });
          compObserver.observe(status);
        }

        async function loadCompetitions(opts) {
          const append = !!(opts && opts.append);
          if (compLoading) return;
          const container = ensureCompShell();
          if (!container) return;
          if (append && compDone) { setCompStatus('end'); return; }

          compLoading = true;
          setCompStatus('loading');

          try {
            let url = '/api/competitions?limit=' + COMP_BATCH + '&offset=' + compOffset;
            if (search) url += '&search=' + encodeURIComponent(search);
            // The query stays in the URL params: this is not a navigation.
            const res = await fetch(url);
            if (!res.ok) throw new Error('status ' + res.status);
            const data = await res.json();

            const items = (data && data.success && data.data) ? data.data : [];
            const countEl = document.getElementById('compsCount');
            if (countEl) countEl.textContent = '(' + compSeen.size + ')';

            if (compOffset === 0 && items.length === 0) {
              container.innerHTML = \`
                <div class="text-center py-12 bg-gray-100 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
                  <div class="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center mx-auto mb-4">
                    <i class="fas fa-trophy text-2xl text-gray-400 dark:text-gray-500" aria-hidden="true"></i>
                  </div>
                  <p class="text-gray-500 dark:text-gray-400">\${tr.no_competitions || 'No competitions found'}</p>
                </div>
              \`;
              compDone = true;
              return;
            }

            const grid = document.getElementById('competitionsGrid');
            if (grid) {
              const html = compCardHtml(items);
              if (html) grid.insertAdjacentHTML('beforeend', html);
            }

            compOffset += items.length;
            // A short batch means the result set is exhausted.
            compDone = items.length < COMP_BATCH;
            if (compDone) {
              setCompStatus('end');
            } else {
              setCompStatus('more');
              observeCompEnd();
            }
          } catch (err) {
            console.error('Failed to load competitions:', err);
            if (compOffset === 0) {
              showDiscoveryError('competitionsContainer');
            } else {
              setCompStatus('error');
            }
          } finally {
            compLoading = false;
          }
        }

        // B7: progressive loading for users. /api/search/users accepts
        // limit/offset, so the batch is appended instead of reloading the page.
        const USER_BATCH = 9;
        let userOffset = 0;
        const userSeen = new Set();
        let userLoading = false;
        let userDone = false;
        let userObserver = null;

        function ensureUserShell() {
          const container = document.getElementById('usersContainer');
          if (!container) return null;
          if (!document.getElementById('usersGrid')) {
            container.innerHTML = '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" id="usersGrid"></div>' +
                                  '<div id="usersStatus" class="text-center mt-4"></div>';
          }
          return container;
        }

        function setUserStatus(state) {
          const status = document.getElementById('usersStatus');
          if (!status) return;
          if (state === 'loading') {
            status.innerHTML = \`<div class="py-4" role="status" aria-live="polite" data-explore-state="loading">
              <i class="fas fa-spinner fa-spin text-blue-500" aria-hidden="true"></i>
              <span class="sr-only">\${tr.loading || 'Loading...'}</span>
            </div>\`;
            return;
          }
          if (state === 'error') {
            status.innerHTML = \`<div class="py-4 text-red-500 dark:text-red-400" role="alert" data-explore-state="error">
              <p>\${tr.errors?.service_unavailable || tr.error_occurred || 'Error'}</p>
              <button type="button" class="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full text-sm font-semibold" data-action="retry-users">
                <i class="fas fa-rotate-right" aria-hidden="true"></i>\${tr.discovery?.retry || 'Retry'}
              </button>
            </div>\`;
            const btn = status.querySelector('[data-action="retry-users"]');
            if (btn) btn.addEventListener('click', () => loadUsers({ append: true }));
            return;
          }
          if (state === 'end') {
            status.innerHTML = \`<p class="text-sm text-gray-400" data-explore-state="end">\${tr.discovery?.no_more_results || 'No more results'}</p>\`;
            return;
          }
          status.innerHTML = \`<button type="button" class="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full text-sm font-semibold" data-action="load-more-users">
            \${tr.load_more || 'Load more'}
          </button>\`;
          const more = status.querySelector('[data-action="load-more-users"]');
          if (more) more.addEventListener('click', () => loadUsers({ append: true }));
        }

        function observeUserEnd() {
          if (userObserver || typeof IntersectionObserver === 'undefined') return;
          const status = document.getElementById('usersStatus');
          if (!status) return;
          userObserver = new IntersectionObserver((entries) => {
            if (entries.some(e => e.isIntersecting)) loadUsers({ append: true });
          }, { rootMargin: '200px' });
          userObserver.observe(status);
        }

        // Renders one user result card (unchanged markup, now reusable per item).
        function formatRating(rating) {
          const stars = Math.round((rating || 0) / 20); // 0-100 to 0-5 stars
          return '★'.repeat(stars) + '☆'.repeat(5 - stars);
        }

        function renderUserCard(user) {
          return \`
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
            \`;
        }

        async function loadUsers(opts) {
          const append = !!(opts && opts.append);
          // Both /api/search/users and /api/users require q
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
          if (userLoading) return;
          const container = ensureUserShell();
          if (!container) return;
          if (append && userDone) { setUserStatus('end'); return; }

          userLoading = true;
          setUserStatus('loading');

          try {
            const url = '/api/search/users?q=' + encodeURIComponent(search) +
                        '&limit=' + USER_BATCH + '&offset=' + userOffset;
            const res = await fetch(url);
            if (!res.ok) throw new Error('status ' + res.status);
            const data = await res.json();

            const users = (data.data && data.data.items) ? data.data.items : (data.data || []);
            const countEl = document.getElementById('usersCount');
            if (countEl) countEl.textContent = '(' + userSeen.size + ')';

            if (userOffset === 0 && users.length === 0) {
              container.innerHTML = \`
                <div class="text-center py-12 bg-gray-100 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
                  <div class="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center mx-auto mb-4">
                    <i class="fas fa-users text-2xl text-gray-400 dark:text-gray-500" aria-hidden="true"></i>
                  </div>
                  <p class="text-gray-500 dark:text-gray-400">\${tr.discovery?.no_results || tr.no_users || 'No users found'}</p>
                </div>
              \`;
              userDone = true;
              return;
            }

            const grid = document.getElementById('usersGrid');
            if (grid) {
              const fresh = users.filter(u => u && u.username && !userSeen.has(u.username));
              fresh.forEach(u => userSeen.add(u.username));
              const html = fresh.map(renderUserCard).join('');
              if (html) grid.insertAdjacentHTML('beforeend', html);
            }

            userOffset += users.length;
            userDone = users.length < USER_BATCH;
            if (userDone) {
              setUserStatus('end');
            } else {
              setUserStatus('more');
              observeUserEnd();
            }
          } catch (err) {
            console.error('Failed to load users:', err);
            if (userOffset === 0) {
              showDiscoveryError('usersContainer');
            } else {
              setUserStatus('error');
            }
          } finally {
            userLoading = false;
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

  return c.html(generateHTML(content, lang, tr.explore || 'Explore', (c.get('cspNonce') as string) ?? ''));
}
