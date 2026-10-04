/**
 * Home rail section markup — R3-RAILS-1B
 * ترميز أقسام الصفوف الرئيسية
 *
 * Pure string builders (no DOM, no fetch) for the horizontal Home rails.
 * Every rail owns an independent scroller + near-end sentinel; the sentinel
 * visual state (loading / retry / end) is always translated (ar/en) via the
 * existing `discovery` + root keys — no new i18n keys were needed.
 *
 * - loading: spinner + screen-reader text (`loading`).
 * - retry:   native <button> (keyboard/pointer accessible) with
 *   `discovery.retry`; a retry re-reads the SAME cursor, never appends twice.
 * - end:     terminal marker (`discovery.no_more_results`) — the end of a
 *   rail comes ONLY from the server hasMore flag, never from batch length.
 * - RTL/LTR: the sentinel is the last flex child of the scroller, so it
 *   works in both directions; the header arrows scroll direction-aware.
 * - dark:    every state carries dark: variants.
 */

import { translations, getUILanguage, isRTL, t } from '../../i18n';
import type { Language } from '../../config/types';

export type RailSentinelMode = 'loading' | 'idle' | 'retry' | 'end';

/** Rail keys are built from validated slugs only — safe for id use. */
export function homeRailSectionId(railKey: string): string {
    return `home-rail-${railKey}`;
}

export function homeRailScrollerId(railKey: string): string {
    return `${homeRailSectionId(railKey)}-scroll`;
}

export function homeRailSentinelId(railKey: string): string {
    return `${homeRailSectionId(railKey)}-sentinel`;
}

/**
 * Inner HTML of a rail sentinel for one visual state.
 * `data-home-rail-retry="<railKey>"` marks the retry button so the page can
 * delegate/wire it without global handlers.
 */
export function getRailSentinelHTML(railKey: string, mode: RailSentinelMode, lang: Language): string {
    const tr = translations[getUILanguage(lang)];
    if (mode === 'retry') {
        const label = tr.discovery?.retry || 'Retry';
        return `<button type="button" data-home-rail-retry="${railKey}" class="px-4 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full text-sm font-semibold hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors cursor-pointer" aria-label="${label}">${label}</button>`;
    }
    if (mode === 'end') {
        const label = tr.discovery?.no_more_results || tr.no_more || 'No more results';
        return `<span class="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">${label}</span>`;
    }
    if (mode === 'loading') {
        const label = tr.loading || 'Loading...';
        return `<i class="fas fa-spinner fa-spin text-purple-400 text-xl" aria-hidden="true"></i><span class="sr-only">${label}</span>`;
    }
    return '';
}

export interface HomeRailSectionOptions {
    railKey: string;
    title: string;
    icon: string;
    lang: Language;
    color: string;
    cardsHtml: string;
    sentinelMode: RailSentinelMode;
    /**
     * R3-EXPLORE-CONTEXT-1: typed rail context carried to Explore
     * (category + subcategory when present + status + lang +
     * view=competitions). Built by the caller via railViewAllHref — the
     * component never parses railKey or translated titles.
     */
    viewAllHref: string;
}

/**
 * R3-EXPLORE-CONTEXT-1: View All href from typed rail context.
 * - suggested rails carry their status bucket only (no invented category);
 * - main-category rails carry category + status;
 * - subcategory rails carry category + subcategory + status.
 * Translated labels never become query keys; URLSearchParams owns encoding.
 */
export function railViewAllHref(opts: {
    kind: 'suggested' | 'category';
    category: string;
    subcategory: string;
    status: 'live' | 'recorded' | 'upcoming';
    lang: Language;
}): string {
    const p = new URLSearchParams();
    if (opts.kind === 'category') {
        if (opts.category) p.set('category', opts.category);
        if (opts.subcategory) p.set('subcategory', opts.subcategory);
    }
    if (opts.status) p.set('status', opts.status);
    p.set('view', 'competitions');
    p.set('lang', opts.lang);
    return `/explore?${p.toString()}`;
}

function escapeHref(value: string): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Full <section> for one rail: header (title + direction-aware scroll
 * arrows, keyboard-focusable scroller region) + horizontal scroller whose
 * last child is the continuation sentinel.
 */
export function getHomeRailSection(opts: HomeRailSectionOptions): string {
    const { railKey, title, icon, lang, color, cardsHtml, sentinelMode, viewAllHref } = opts;
    const tr = translations[getUILanguage(lang)];
    const rtl = isRTL(lang);
    const sectionId = homeRailSectionId(railKey);
    const scrollerId = homeRailScrollerId(railKey);
    const sentinelId = homeRailSentinelId(railKey);

    return `
      <section class="py-6 animate-fade-in relative group" id="${sectionId}" aria-label="${title}">
        <div class="flex items-center justify-between mb-4 px-2">
          <div class="flex items-center gap-3">
             <div class="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transform rotate-3 transition-transform hover:rotate-0" data-csp-style="background: linear-gradient(135deg, ${color}, ${color}dd)">
                <i class="${icon} text-white text-lg"></i>
             </div>
             <div>
               <h2 class="text-xl font-bold text-gray-900 dark:text-white leading-tight">${title}</h2>
               <div class="h-1 w-12 rounded-full mt-1" data-csp-style="background-color: ${color}"></div>
             </div>
          </div>

          <div class="flex items-center gap-2">
            <button class="section-prev p-2 rounded-full bg-white dark:bg-gray-800 shadow-md transform scale-90 opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-all duration-300 hover:bg-purple-50 dark:hover:bg-gray-700 z-10 disabled:opacity-0 disabled:cursor-not-allowed max-sm:opacity-100 max-sm:scale-100" aria-label="${t('previous', lang)}" data-csp-on="click" data-csp-fn="__byIdScroll" data-csp-args='["${scrollerId}",${rtl ? 300 : -300},"smooth"]'>
              <i class="fas fa-chevron-${rtl ? 'right' : 'left'} text-gray-600 dark:text-gray-300"></i>
            </button>
            <button class="section-next p-2 rounded-full bg-white dark:bg-gray-800 shadow-md transform scale-90 opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-all duration-300 hover:bg-purple-50 dark:hover:bg-gray-700 z-10 disabled:opacity-0 disabled:cursor-not-allowed max-sm:opacity-100 max-sm:scale-100" aria-label="${t('next', lang)}" data-csp-on="click" data-csp-fn="__byIdScroll" data-csp-args='["${scrollerId}",${rtl ? -300 : 300},"smooth"]'>
              <i class="fas fa-chevron-${rtl ? 'left' : 'right'} text-gray-600 dark:text-gray-300"></i>
            </button>
            <a href="${escapeHref(viewAllHref)}" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all hover:bg-gray-100 dark:hover:bg-gray-800" data-csp-style="color: ${color}">
              <span>${tr.view_all || 'View All'}</span>
              <i class="fas fa-arrow-${rtl ? 'left' : 'right'} text-xs transform transition-transform group-hover:translate-x-1"></i>
            </a>
          </div>
        </div>

        <div class="relative -mx-4 px-4">
           <div class="absolute left-0 top-0 bottom-4 w-12 bg-gradient-to-r from-white dark:from-[#121212] to-transparent z-10 pointer-events-none hidden sm:block"></div>
           <div class="absolute right-0 top-0 bottom-4 w-12 bg-gradient-to-l from-white dark:from-[#121212] to-transparent z-10 pointer-events-none hidden sm:block"></div>

           <div id="${scrollerId}" tabindex="0" role="region" aria-label="${title}" class="flex overflow-x-auto pb-8 -mx-4 px-4 gap-5 scrollbar-hide snap-x snap-mandatory scroll-smooth [scroll-padding-left:1rem] [scroll-padding-right:1rem]">
             ${cardsHtml}
             <div id="${sentinelId}" aria-live="polite" class="snap-start flex-shrink-0 w-24 flex items-center justify-center p-4">${getRailSentinelHTML(railKey, sentinelMode, lang)}</div>
           </div>
        </div>
      </section>
    `;
}

/**
 * A rail that failed before its first paint: title + translated retry.
 * Never a silent 15-row list presented as complete — the rail stays in an
 * explicit retry state until the server answers.
 */
export function getHomeRailErrorSection(
    railKey: string,
    title: string,
    icon: string,
    lang: Language,
    color: string
): string {
    const sectionId = homeRailSectionId(railKey);
    return `
      <section class="py-6 animate-fade-in relative group" id="${sectionId}" aria-label="${title}">
        <div class="flex items-center justify-between mb-4 px-2">
          <div class="flex items-center gap-3">
             <div class="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transform rotate-3 transition-transform hover:rotate-0" data-csp-style="background: linear-gradient(135deg, ${color}, ${color}dd)">
                <i class="${icon} text-white text-lg"></i>
             </div>
             <div>
               <h2 class="text-xl font-bold text-gray-900 dark:text-white leading-tight">${title}</h2>
               <div class="h-1 w-12 rounded-full mt-1" data-csp-style="background-color: ${color}"></div>
             </div>
          </div>
        </div>
        <div class="flex items-center justify-center py-10" aria-live="polite">${getRailSentinelHTML(railKey, 'retry', lang)}</div>
      </section>
    `;
}
