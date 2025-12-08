/**
 * Footer Component
 * مكون التذييل
 */

import type { Language } from '../../config/types';
import { translations } from '../../i18n';

/**
 * Get Footer HTML - الحصول على HTML التذييل
 */
export function getFooter(lang: Language): string {
  const tr = translations[lang];

  return `
    <footer class="bg-gray-50 dark:bg-[#0a0a0a] border-t border-gray-200 dark:border-gray-800 py-6 mt-auto">
      <div class="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-gray-500 dark:text-gray-400">
        <div class="flex items-center gap-2">
          <img src="/static/dueli-icon.png" alt="Dueli" class="w-8 h-8 object-contain opacity-70 grayscale hover:grayscale-0 transition-all">
          <span class="font-bold text-gray-700 dark:text-white">${tr.app_title}</span>
        </div>
        <p>${tr.footer}</p>
      </div>
    </footer>
  `;
}
