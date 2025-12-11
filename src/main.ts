/**
 * Dueli Platform - Main Entry Point
 * نقطة الدخول الرئيسية لمنصة ديولي
 * 
 * هذا الملف هو نقطة الدخول الرئيسية للتطبيق
 * تم تفكيك الكود إلى وحدات منفصلة لتحسين الصيانة والقراءة
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Bindings, Variables, Language } from './config/types';
import { translations, getDir, getUILanguage, isRTL, DEFAULT_LANGUAGE, TRANSLATED_LANGUAGES } from './i18n';

// Import API Routes - استيراد مسارات API
import categoriesRoutes from './modules/api/categories/routes';
import competitionsRoutes from './modules/api/competitions/routes';
import usersRoutes from './modules/api/users/routes';
import notificationsRoutes from './modules/api/notifications/routes';
import authRoutes from './modules/api/auth/routes';
import oauthRoutes from './modules/api/auth/oauth-routes';
import countriesRoutes from './modules/api/countries/routes';
import jitsiRoutes from './modules/api/jitsi/routes';

// Import New Feature Routes - استيراد مسارات الميزات الجديدة
import searchRoutes from './modules/api/search/routes';
import likesRoutes from './modules/api/likes/routes';
import reportsRoutes from './modules/api/reports/routes';
import messagesRoutes from './modules/api/messages/routes';
import adminRoutes from './modules/api/admin/routes';
import settingsRoutes from './modules/api/settings/routes';
import scheduleRoutes from './modules/api/schedule/routes';

// Import Page Routes - استيراد مسارات الصفحات
import staticPagesRoutes from './modules/pages/static-pages';

// Import Components - استيراد المكونات
import { getNavigation, getLoginModal, getFooter } from './shared/components';
import { generateHTML } from './shared/templates/layout';

// Create Hono App - إنشاء تطبيق Hono
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ============================================
// Middleware - البرمجيات الوسيطة
// ============================================

// CORS Middleware
app.use('/api/*', cors());

// Language Middleware - برنامج اللغة الوسيط
app.use('*', async (c, next) => {
  const langParam = c.req.query('lang');
  const cookieLang = c.req.header('Cookie')?.match(/lang=(\w+)/)?.[1];

  // Priority: URL param > Cookie > DEFAULT_LANGUAGE
  let lang: Language = DEFAULT_LANGUAGE;

  if (langParam) {
    lang = langParam;
  } else if (cookieLang) {
    lang = cookieLang as Language;
  }

  c.set('lang', lang);
  await next();
});

// ============================================
// Mount API Routes - تركيب مسارات API
// ============================================

app.route('/api/categories', categoriesRoutes);
app.route('/api/competitions', competitionsRoutes);
app.route('/api/users', usersRoutes);
app.route('/api/notifications', notificationsRoutes);
app.route('/api/auth', authRoutes);
app.route('/api/auth/oauth', oauthRoutes);
app.route('/api/countries', countriesRoutes);
app.route('/api/jitsi', jitsiRoutes);

// Mount New Feature Routes - تركيب مسارات الميزات الجديدة
app.route('/api/search', searchRoutes);
app.route('/api', likesRoutes);
app.route('/api/reports', reportsRoutes);
app.route('/api', messagesRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api', scheduleRoutes);

// Mount Static Pages - تركيب الصفحات الثابتة
app.route('/', staticPagesRoutes);

// ============================================
// Page Routes - مسارات الصفحات
// ============================================

// Home Page - الصفحة الرئيسية
app.get('/', (c) => {
  const lang = c.get('lang');
  const tr = translations[getUILanguage(lang)];
  const rtl = isRTL(lang);

  const content = `
    ${getNavigation(lang)}
    ${getLoginModal(lang)}
    
    <div class="flex-1">
      <!-- Search Bar Section -->
      <div class="py-6 px-4">
        <div class="container mx-auto max-w-2xl">
          <div class="relative">
            <input 
              type="text" 
              id="searchInput"
              placeholder="${tr.search_placeholder}"
              class="search-input"
            />
            <div class="absolute top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none ${rtl ? 'right-4' : 'left-4'}">
              <i class="fas fa-search text-lg"></i>
            </div>
          </div>
        </div>
      </div>

      <!-- Main Tabs (Live / Recorded) -->
      <div class="container mx-auto px-4 mb-6">
        <div class="flex justify-center">
          <div class="bg-gray-100 dark:bg-gray-800 p-1 rounded-full inline-flex gap-1">
            <button onclick="setMainTab('live')" id="tab-live" class="px-6 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 tab-active">
              <span class="w-2 h-2 rounded-full bg-red-500 live-pulse"></span>
              ${tr.live}
            </button>
            <button onclick="setMainTab('recorded')" id="tab-recorded" class="px-6 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 tab-inactive">
              <i class="fas fa-play-circle"></i>
              ${tr.recorded}
            </button>
          </div>
        </div>
      </div>

      <!-- Category Tabs -->
      <div class="container mx-auto px-4 mb-8">
        <div class="flex justify-center gap-2 flex-wrap">
          <button onclick="setSubTab('all')" id="subtab-all" class="px-5 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 category-tab-active">
            <i class="fas fa-star text-xs"></i>
            ${tr.all}
          </button>
          <button onclick="setSubTab('dialogue')" id="subtab-dialogue" class="px-5 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 category-tab-inactive">
            <i class="fas fa-comments text-xs"></i>
            ${tr.dialogue}
          </button>
          <button onclick="setSubTab('science')" id="subtab-science" class="px-5 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 category-tab-inactive">
            <i class="fas fa-flask text-xs"></i>
            ${tr.science}
          </button>
          <button onclick="setSubTab('talents')" id="subtab-talents" class="px-5 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 category-tab-inactive">
            <i class="fas fa-star text-xs"></i>
            ${tr.talents}
          </button>
        </div>
      </div>

      <!-- Main Content -->
      <main class="container mx-auto px-4 pb-24 space-y-10" id="mainContent">
        <div class="flex flex-col items-center justify-center py-16">
          <i class="fas fa-spinner fa-spin text-4xl text-purple-400 mb-4"></i>
          <p class="text-gray-500">${tr.loading}</p>
        </div>
      </main>
    </div>
    
    <!-- Create Competition FAB (hidden for visitors) -->
    <div id="createCompBtn" class="hidden fixed bottom-6 ${rtl ? 'left-6' : 'right-6'} z-40">
      <a href="/create?lang=${lang}" class="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-full shadow-xl shadow-purple-500/30 hover:shadow-2xl hover:scale-105 transition-all font-bold">
        <i class="fas fa-plus"></i>
        <span class="hidden sm:inline">${tr.create_competition}</span>
      </a>
    </div>

    ${getFooter(lang)}
    
    <script>
      const lang = '${lang}';
      const isRTL = ${rtl};
      const tr = ${JSON.stringify(tr)};
      let currentMainTab = 'live';
      let currentSubTab = 'all';
      
      document.addEventListener('DOMContentLoaded', () => {
        checkAuth();
        loadCompetitions();
      });
      
      async function loadCompetitions() {
        const container = document.getElementById('mainContent');
        container.innerHTML = '<div class="flex flex-col items-center justify-center py-16"><i class="fas fa-spinner fa-spin text-4xl text-purple-400 mb-4"></i></div>';
        
        try {
          let url = '/api/competitions?limit=24';
          if (currentMainTab === 'live') url += '&status=live';
          else if (currentMainTab === 'recorded') url += '&status=recorded';
          
          if (currentSubTab !== 'all') {
            const categoryMap = { dialogue: '1', science: '2', talents: '3' };
            url += '&category=' + (categoryMap[currentSubTab] || currentSubTab);
          }
          
          const res = await fetch(url);
          const data = await res.json();
          
          if (!data.success || !data.data?.length) {
            container.innerHTML = renderEmptyState();
            return;
          }
          
          const dialogueItems = data.data.filter(c => c.category_id === 1 || c.category_slug === 'dialogue');
          const scienceItems = data.data.filter(c => c.category_id === 2 || c.category_slug === 'science');
          const talentsItems = data.data.filter(c => c.category_id === 3 || c.category_slug === 'talents');
          
          let html = '';
          
          if (currentSubTab === 'all' && data.data.length > 0) {
            html += renderSection(tr.sections?.suggested || tr.loading, data.data.slice(0, 8), 'fas fa-fire', 'purple');
          }
          
          if ((currentSubTab === 'all' || currentSubTab === 'dialogue') && dialogueItems.length > 0) {
            html += renderSection(tr.sections?.dialogue || tr.dialogue, dialogueItems, 'fas fa-comments', 'purple');
          }
          
          if ((currentSubTab === 'all' || currentSubTab === 'science') && scienceItems.length > 0) {
            html += renderSection(tr.sections?.science || tr.science, scienceItems, 'fas fa-flask', 'cyan');
          }
          
          if ((currentSubTab === 'all' || currentSubTab === 'talents') && talentsItems.length > 0) {
            html += renderSection(tr.sections?.talents || tr.talents, talentsItems, 'fas fa-star', 'amber');
          }
          
          if (!html) {
            html = renderEmptyState();
          }
          
          container.innerHTML = html;
        } catch (err) {
          console.error(err);
          container.innerHTML = '<div class="text-center py-16 text-red-500">' + tr.error_loading + '</div>';
        }
      }
      
      function renderEmptyState() {
        return \`
          <div class="flex flex-col items-center justify-center py-16 text-center">
            <div class="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
              <i class="fas fa-search text-3xl text-gray-300 dark:text-gray-600"></i>
            </div>
            <p class="text-lg font-medium text-gray-400">\${tr.no_duels}</p>
            <p class="text-sm text-gray-400 mt-1">\${tr.try_different_filter}</p>
          </div>
        \`;
      }
      
      function renderSection(title, items, icon, color = 'purple') {
        const colorClasses = {
          purple: 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400',
          cyan: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-400',
          amber: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400'
        };
        
        return \`
          <section class="animate-fade-in">
            <div class="section-header">
              <div class="section-icon \${colorClasses[color] || colorClasses.purple}">
                <i class="\${icon}"></i>
              </div>
              <h2 class="text-lg font-bold text-gray-900 dark:text-white">\${title}</h2>
            </div>
            
            <div class="flex overflow-x-auto pb-4 -mx-4 px-4 gap-4 scrollbar-hide snap-x snap-mandatory">
              \${items.map(item => renderDuelCard(item)).join('')}
            </div>
          </section>
        \`;
      }
      
      function renderDuelCard(item) {
        const bgColors = {
          1: 'duel-bg-dialogue',
          2: 'duel-bg-science',
          3: 'duel-bg-talents'
        };
        const bgColor = bgColors[item.category_id] || 'duel-bg-dialogue';
        const isLive = item.status === 'live';
        const isPending = item.status === 'pending';
        
        return \`
          <a href="/competition/\${item.id}?lang=\${lang}" class="duel-card snap-start">
            <div class="duel-thumbnail \${bgColor} shadow-lg">
              <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20"></div>
              
              <div class="absolute \${isRTL ? 'right-4' : 'left-4'} bottom-4 opacity-20">
                <i class="\${item.category_icon || 'fas fa-trophy'} text-5xl text-white"></i>
              </div>

              <div class="absolute inset-0 flex items-center justify-center gap-3 z-10 p-4">
                <div class="flex flex-col items-center">
                  <div class="competitor-avatar p-0.5">
                    <img src="\${item.creator_avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + item.creator_name}" alt="" class="w-full h-full rounded-full bg-white object-cover">
                  </div>
                </div>

                <div class="w-12 h-12 bg-white rounded-full shadow-lg z-20 flex items-center justify-center">
                  <img src="/static/dueli-icon.png" alt="VS" class="w-full h-full object-contain">
                </div>

                <div class="flex flex-col items-center">
                  <div class="competitor-avatar p-0.5">
                    \${item.opponent_avatar ? 
                      \`<img src="\${item.opponent_avatar}" alt="" class="w-full h-full rounded-full bg-white object-cover">\` :
                      \`<div class="w-full h-full rounded-full bg-white/80 flex items-center justify-center text-gray-400 text-2xl font-bold">?</div>\`
                    }
                  </div>
                </div>
              </div>

              <div class="absolute top-3 \${isRTL ? 'right-3' : 'left-3'} z-20">
                \${isLive ? \`<span class="badge-live"><span class="w-1.5 h-1.5 rounded-full bg-red-500 live-pulse"></span>\${tr.status_live}</span>\` : 
                  isPending ? \`<span class="badge-pending">\${tr.status_pending}</span>\` : 
                  \`<span class="badge-recorded"><i class="fas fa-play text-xs"></i>\${tr.recorded}</span>\`}
              </div>

              <div class="absolute bottom-3 \${isRTL ? 'left-3' : 'right-3'} z-20">
                <span class="px-2 py-1 rounded-lg bg-black/50 backdrop-blur-sm text-white text-xs font-medium flex items-center gap-1">
                  <i class="fas fa-eye"></i>
                  \${(item.total_views || 0).toLocaleString()}
                </span>
              </div>
            </div>

            <div class="mt-3 px-1">
              <h3 class="text-sm font-bold text-gray-900 dark:text-white line-clamp-2 leading-tight">\${item.title}</h3>
              <div class="flex items-center gap-1 mt-1.5 text-xs text-gray-500">
                <span>\${item.creator_name}</span>
                <span class="mx-1">vs</span>
                <span>\${item.opponent_name || '?'}</span>
              </div>
            </div>
          </a>
        \`;
      }
      
      function setMainTab(tab) {
        currentMainTab = tab;
        const liveTab = document.getElementById('tab-live');
        const recordedTab = document.getElementById('tab-recorded');
        
        if (tab === 'live') {
          liveTab.className = 'px-6 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 tab-active';
          recordedTab.className = 'px-6 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 tab-inactive';
          liveTab.innerHTML = '<span class="w-2 h-2 rounded-full bg-red-500 live-pulse"></span> ${tr.live}';
        } else {
          liveTab.className = 'px-6 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 tab-inactive';
          recordedTab.className = 'px-6 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 tab-active';
          liveTab.innerHTML = '<span class="w-2 h-2 rounded-full bg-gray-400"></span> ${tr.live}';
        }
        
        loadCompetitions();
      }
      
      function setSubTab(tab) {
        currentSubTab = tab;
        const tabs = ['all', 'dialogue', 'science', 'talents'];
        tabs.forEach(t => {
          const el = document.getElementById('subtab-' + t);
          if (el) {
            el.className = t === tab
              ? 'px-5 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 category-tab-active'
              : 'px-5 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 category-tab-inactive';
          }
        });
        
        loadCompetitions();
      }
      
      const searchInput = document.getElementById('searchInput');
      if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
          clearTimeout(searchTimeout);
          searchTimeout = setTimeout(() => {
            const query = e.target.value.trim();
            if (query.length >= 2) {
              window.location.href = '/explore?search=' + encodeURIComponent(query) + '&lang=' + lang;
            }
          }, 500);
        });
      }
    </script>
  `;

  return c.html(generateHTML(content, lang, tr.home));
});

// Import remaining page routes
import { aboutPage, verifyPage, competitionPage, createPage, explorePage } from './modules/pages';

// Mount page routes
app.get('/about', aboutPage);
app.get('/verify', verifyPage);
app.get('/competition/:id', competitionPage);
app.get('/create', createPage);
app.get('/explore', explorePage);

// ============================================
// Error Handling - معالجة الأخطاء
// ============================================

app.notFound((c) => {
  const lang = c.get('lang') || DEFAULT_LANGUAGE;
  const tr = translations[getUILanguage(lang)];

  const content = `
    ${getNavigation(lang)}
    <div class="flex-1 flex items-center justify-center py-20">
      <div class="text-center">
        <h1 class="text-6xl font-black text-gray-200 dark:text-gray-800 mb-4">404</h1>
        <p class="text-xl text-gray-600 dark:text-gray-400 mb-8">${tr.page_not_found}</p>
        <a href="/?lang=${lang}" class="btn-primary inline-block">
          ${tr.back_to_home}
        </a>
      </div>
    </div>
    ${getFooter(lang)}
  `;

  return c.html(generateHTML(content, lang, '404'));
});

app.onError((err, c) => {
  console.error(err);
  const lang = c.get('lang') || DEFAULT_LANGUAGE;
  const tr = translations[getUILanguage(lang)];
  return c.text(tr.error_occurred || 'Internal Server Error', 500);
});

export default app;
