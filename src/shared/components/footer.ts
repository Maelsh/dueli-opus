/**
 * Footer Component
 * مكون التذييل
 */

import type { Language } from '../../config/types';
import { translations, getUILanguage } from '../../i18n';

/**
 * Get Footer HTML - الحصول على HTML التذييل
 */
export function getFooter(lang: Language): string {
  const tr = translations[getUILanguage(lang)];

  return `
    <footer class="bg-gray-50 dark:bg-[#0a0a0a] border-t border-gray-200 dark:border-gray-800 py-6 mt-auto">
      <div class="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-gray-500 dark:text-gray-400">
        <div class="flex items-center gap-2">
          <img src="/static/dueli-icon.png" alt="Dueli" class="w-8 h-8 object-contain opacity-70 grayscale hover:grayscale-0 transition-all">
          <span class="font-bold text-gray-700 dark:text-white">${tr.app_title}</span>
        </div>
        <p>${tr.footer}</p>
        <nav aria-label="${tr.help || 'Help'}" class="flex items-center gap-4">
          <a href="/help?lang=${lang}" class="hover:text-purple-600 dark:hover:text-purple-400 font-semibold">${tr.help || 'Help'}</a>
          <a href="/docs?lang=${lang}" class="hover:text-purple-600 dark:hover:text-purple-400 font-semibold">${tr.docs || 'Documents'}</a>
          <a href="/messages?tab=admin&lang=${lang}" class="hover:text-purple-600 dark:hover:text-purple-400">${tr.contact_admin || 'Contact'}</a>
        </nav>
      </div>
    </footer>
  `;
}
