/**
 * Dueli Platform - Main Entry Point
 * نقطة الدخول الرئيسية لمنصة ديولي
 * 
 * هذا الملف هو نقطة الدخول الرئيسية للتطبيق
 * تم تفكيك الكود إلى وحدات منفصلة لتحسين الصيانة والقراءة
 * This file is now strictly a Server-Side Entry Point (Hono App)
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Bindings, Variables, Language } from './config/types';
import { translations, getDir, getUILanguage, isRTL, DEFAULT_LANGUAGE } from './i18n';

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
              class="search-input ${rtl ? 'pl-12 pr-12' : 'pr-12 pl-12'}"
              title="${tr.search_placeholder}"
            />
            <div class="absolute top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none ${rtl ? 'right-4' : 'left-4'}">
              <i class="fas fa-search text-lg"></i>
            </div>
            <button id="searchBtn" onclick="performSearch()" class="absolute top-1/2 -translate-y-1/2 ${rtl ? 'left-2' : 'right-2'} p-2 bg-purple-600 hover:bg-purple-700 text-white rounded-full transition-colors" title="${tr.search || 'Search'}">
              <i class="fas fa-arrow-${rtl ? 'left' : 'right'}"></i>
            </button>
            <!-- Search Results Dropdown -->
            <div id="searchDropdown" class="hidden absolute top-full mt-2 w-full bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 z-50 overflow-hidden max-h-96 overflow-y-auto">
              <div id="searchResults" class="p-2">
                <div class="p-4 text-center text-gray-400 text-sm">
                  <i class="fas fa-search text-2xl mb-2"></i>
                  <p>${tr.search?.no_results || 'Start typing to search...'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Main Tabs (Live / Upcoming / Recorded) -->
      <div class="container mx-auto px-4 mb-6">
        <div class="flex justify-center">
          <div class="bg-gray-100 dark:bg-gray-800 p-1 rounded-full inline-flex gap-1">
            <button onclick="setMainTab('live')" id="tab-live" class="px-6 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 tab-active" title="${tr.live}">
              <span class="w-2 h-2 rounded-full bg-red-500 live-pulse"></span>
              ${tr.live}
            </button>
            <button onclick="setMainTab('recorded')" id="tab-recorded" class="px-6 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 tab-inactive" title="${tr.recorded}">
              <i class="fas fa-play-circle"></i>
              ${tr.recorded}
            </button>
            <button onclick="setMainTab('upcoming')" id="tab-upcoming" data-auth-required="true" class="px-6 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 tab-inactive hidden" title="${tr.upcoming}">
              <i class="fas fa-clock"></i>
              ${tr.upcoming}
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
            ${tr.categories.dialogue}
          </button>
          <button onclick="setSubTab('science')" id="subtab-science" class="px-5 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 category-tab-inactive">
            <i class="fas fa-flask text-xs"></i>
            ${tr.categories.science}
          </button>
          <button onclick="setSubTab('talents')" id="subtab-talents" class="px-5 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 category-tab-inactive">
            <i class="fas fa-star text-xs"></i>
            ${tr.categories.talents}
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
      // Global initialization variables for client-side hydration
      window.lang = '${lang}';
      window.isRTL = ${rtl};
      // Logic has been moved to src/client/pages/HomePage.ts
    </script>
  `;

  return c.html(generateHTML(content, lang, tr.home));
});

// Import remaining page routes
import { aboutPage, verifyPage, competitionPage, createPage, explorePage, profilePage, messagesPage, settingsPage, myCompetitionsPage, myRequestsPage, liveRoomPage, earningsPage, reportsPage, donatePage } from './modules/pages';

// Mount page routes
app.get('/about', aboutPage);
app.get('/verify', verifyPage);
app.get('/competition/:id', competitionPage);
app.get('/create', createPage);
app.get('/explore', explorePage);
app.get('/profile', profilePage); // Own profile
app.get('/profile/:username', profilePage);
app.get('/messages', messagesPage);
app.get('/settings', settingsPage);
app.get('/my-competitions', myCompetitionsPage);
app.get('/my-requests', myRequestsPage);
app.get('/live/:id', liveRoomPage);
app.get('/earnings', earningsPage);
app.get('/reports', reportsPage);
app.get('/donate', donatePage);

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
