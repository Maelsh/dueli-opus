/**
 * Explore Page
 * صفحة الاستكشاف
 */

import type { Context } from 'hono';
import type { Bindings, Variables } from '../../config/types';
import { translations, getUILanguage, isRTL } from '../../i18n';
import { getNavigation, getLoginModal, getFooter } from '../../shared/components';
import { generateHTML } from '../../shared/templates/layout';

export function explorePage(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
  const lang = c.get('lang');
  const tr = translations[getUILanguage(lang)];
  const rtl = isRTL(lang);

  const content = `
    ${getNavigation(lang)}
    ${getLoginModal(lang)}
    
    <div class="container mx-auto px-4 py-8">
      <div class="flex items-center gap-4 mb-6">
        <a href="/?lang=${lang}" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-all">
          <i class="fas fa-arrow-${rtl ? 'right' : 'left'} text-xl text-gray-600 dark:text-gray-300"></i>
        </a>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">${tr.explore}</h1>
      </div>
      <div id="exploreContent">
        <div class="flex flex-col items-center justify-center py-16">
          <i class="fas fa-spinner fa-spin text-4xl text-purple-400 mb-4"></i>
        </div>
      </div>
    </div>
    
    ${getFooter(lang)}
    
    <script>
      const lang = '${lang}';
      const tr = ${JSON.stringify(tr)};
      const search = new URLSearchParams(window.location.search).get('search') || '';
      
      document.addEventListener('DOMContentLoaded', async () => {
        checkAuth();
        
        let url = '/api/competitions?limit=50';
        if (search) url += '&search=' + encodeURIComponent(search);
        
        const res = await fetch(url);
        const data = await res.json();
        
        if (!data.success || !data.data?.length) {
          document.getElementById('exploreContent').innerHTML = \`
            <div class="text-center py-16">
              <div class="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
                <i class="fas fa-search text-3xl text-gray-300 dark:text-gray-600"></i>
              </div>
              <p class="text-gray-500">\${tr.no_duels}</p>
            </div>
          \`;
          return;
        }
        
        document.getElementById('exploreContent').innerHTML = \`
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            \${data.data.map(item => {
              const bgColors = {
                1: 'from-purple-600 to-purple-800',
                2: 'from-cyan-500 to-cyan-700',
                3: 'from-amber-500 to-orange-600'
              };
              const bgColor = bgColors[item.category_id] || 'from-gray-600 to-gray-800';
              
              return \`
                <a href="/competition/\${item.id}?lang=\${lang}" class="card card-hover overflow-hidden">
                  <div class="aspect-video bg-gradient-to-br \${bgColor} relative flex items-center justify-center">
                    <span class="text-white font-black text-3xl vs-text">VS</span>
                    \${item.status === 'live' ? '<div class="absolute top-2 left-2 badge-live"><span class="w-1.5 h-1.5 rounded-full bg-red-500 live-pulse"></span> LIVE</div>' : ''}
                  </div>
                  <div class="p-4">
                    <h3 class="font-bold text-gray-900 dark:text-white line-clamp-2">\${item.title}</h3>
                    <div class="flex items-center gap-2 mt-2 text-sm text-gray-500">
                      <span>\${item.creator_name}</span>
                      <span>vs</span>
                      <span>\${item.opponent_name || '?'}</span>
                    </div>
                    <div class="flex items-center gap-2 mt-2 text-xs text-gray-400">
                      <i class="fas fa-eye"></i>
                      <span>\${item.total_views || 0}</span>
                    </div>
                  </div>
                </a>
              \`;
            }).join('')}
          </div>
        \`;
      });
    </script>
  `;

  return c.html(generateHTML(content, lang, tr.explore));
}
