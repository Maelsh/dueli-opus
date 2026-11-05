/**
 * UNIT41.1 — the friendly "money/ads locked" page body shown to non-admin
 * visitors while `public_monetization_enabled = '0'`.
 *
 * Renders the owner's exact translated sentence (i18n `monetization_locked`),
 * a single way back home, in the standard page chrome (nav + footer, RTL/LTR,
 * dark mode). Pages serve it with HTTP 403 and noindex.
 */

import type { Language } from '../../config/types';
import { getUILanguage, getDir, t } from '../../i18n';
import { getNavigation, getFooter } from './index';

export function renderMonetizationLocked(lang: Language): string {
    const uiLang = getUILanguage(lang);
    const dir = getDir(lang);
    const message = t('monetization_locked', lang);
    const homeHref = `/?lang=${encodeURIComponent(uiLang)}`;

    return `
    ${getNavigation(lang)}
    <div class="flex-1 flex items-center justify-center py-24 px-4" dir="${dir}">
        <div class="max-w-md text-center">
            <i class="fas fa-lock text-5xl text-purple-400 dark:text-purple-500 mb-6" aria-hidden="true"></i>
            <h1 class="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white leading-relaxed">${message}</h1>
            <a href="${homeHref}" class="inline-block mt-8 px-6 py-3 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-sm font-bold hover:opacity-90 transition-opacity">${t('home', lang)}</a>
        </div>
    </div>
    ${getFooter(lang)}`;
}
