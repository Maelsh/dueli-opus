/**
 * Layout Templates
 * قوالب التخطيط
 */

import type { Language } from '../../config/types';
import { translations, getUILanguage, getDir, isRTL } from '../../i18n';
import { Sanitize } from '../../lib/services/Sanitize';
import { buildSeoHead, type SeoInput } from './seo';

/**
 * Font mapping per language — UNIT 42.1 (R4-GLOBAL-I18N-ALL-LANGS-1).
 * Every UNIT 42.1 language has a script-appropriate primary font; Latin and
 * Cyrillic languages share Inter. Unknown codes fall back to Inter.
 */
const fontMap: Record<string, string> = {
  'ar': "'Cairo'",
  'en': "'Inter'",
  'es': "'Inter'",
  'fr': "'Inter'",
  'de': "'Inter'",
  'pt': "'Inter'",
  'ru': "'Inter'",
  'zh': "'Noto Sans SC'",
  'ja': "'Noto Sans JP'",
  'ko': "'Noto Sans KR'",
  'tr': "'Inter'",
  'hi': "'Noto Sans Devanagari'",
  'id': "'Inter'",
  'fa': "'Noto Naskh Arabic'",
  'ur': "'Noto Nastaliq Urdu'",
};

/** Google Fonts families needed by the language set above (one request). */
const GOOGLE_FONTS_URL = 'https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700;800;900&family=Noto+Sans+SC:wght@300;400;500;600;700&family=Noto+Sans+JP:wght@300;400;500;600;700&family=Noto+Sans+KR:wght@300;400;500;600;700&family=Noto+Sans+Devanagari:wght@300;400;500;600;700&family=Noto+Naskh+Arabic:wght@400;500;600;700&family=Noto+Nastaliq+Urdu:wght@400;500;600;700&display=swap';

/**
 * UNIT38 / R4-GUIDE-1 — per-page SEO overrides.
 *
 * Every surface keeps the default (site-wide description + no canonical
 * unless the page knows its own path), while a page that owns a public
 * path (like /guide) passes its own description/canonical so the head
 * stays unique and truthful.
 */
export type SeoOptions = Partial<Omit<SeoInput, 'lang' | 'title'>>;

/**
 * UNIT 42.1 — head inline injection of the resolved locale pack.
 *
 * When the SSR isolate resolved a non-bundled language (lazy-loaded from
 * /static/locales/<lang>.json), the exact pack is embedded here so the
 * client bundle needs NO dictionary of its own and no extra fetch:
 * src/i18n/index.ts registers it synchronously on load. `ar`/`en` are
 * bundled in app.js and injected for them is intentionally skipped.
 * `<` is escaped (\u003c) so the serialized pack can never close or spoof
 * the script tag in which it is served.
 */
function localePackScript(uiLang: string, nonce: string): string {
    if (!uiLang || uiLang === 'ar' || uiLang === 'en') return '';
    const pack = translations[uiLang];
    if (!pack) return ''; // never reached via getUILanguage — pure safety net
    const payload = JSON.stringify({ code: uiLang, pack }).replace(/</g, '\\u003c');
    return `<script nonce="${nonce}">window.__DUELI_LOCALE_PACK__ = ${payload};</script>`;
}

/**
 * Generate base HTML wrapper - توليد غلاف HTML الأساسي
 */
export function generateHTML(
  content: string,
  lang: Language,
  title: string = 'Dueli',
  nonce: string = '',
  seo?: SeoOptions
): string {
  const dir = getDir(lang);
  // UNIT 42.1: resolve ONCE — `uiLang` is `lang` when its pack is loaded in
  // memory, otherwise safe-fast English; everything below renders in uiLang
  // and the same pack travels into the head for the client.
  const uiLang = getUILanguage(lang);
  const tr = translations[uiLang];
  const fontFamily = fontMap[lang] || "'Inter'";
  const seoHead = buildSeoHead({ lang, title, ...(seo ?? {}) }, nonce);
  // UNIT39 owner revision: a page may supply the complete localized meta
  // title (from i18n). It is used verbatim; otherwise the page title keeps
  // the existing localized site suffix.
  const documentTitle = seo?.metaTitle
    ? Sanitize.escapeHtml(seo.metaTitle)
    : `${Sanitize.escapeHtml(title)} - ${Sanitize.escapeHtml(tr.app_title)}`;
  const localePack = localePackScript(uiLang, nonce);

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}" class="scroll-smooth">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#6366f1">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="Dueli">
    <title>${documentTitle}</title>
    ${seoHead}
    ${localePack}
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <link href="${GOOGLE_FONTS_URL}" rel="stylesheet">
    <link href="/static/styles.css" rel="stylesheet">
    <link rel="icon" type="image/x-icon" href="/static/favicon.ico">
    <!-- Owner acceptance (post-#71): the shared competition-card centre logo
         is the same single /static/dueli-icon.png on every surface. Preload it
         at parse time so SSR cards (profile) and client-injected cards
         (home / my-competitions / explore) never paint the blank white disc
         first. One URL => the preload de-duplicates, never multiplies. -->
    <link rel="preload" as="image" href="/static/dueli-icon.png" fetchpriority="high">
    <link rel="manifest" href="/manifest.json">
    <link rel="apple-touch-icon" href="/static/icons/apple-touch-icon.png">
    
    <!-- SEC-07: synchronous tiny accessor so inline SSR page scripts use the
         same canonical session precedence as the bundled client. -->
    <script src="/static/session-access.js"></script>
    <!-- Load client bundle in head with defer so it's ready when DOMContentLoaded fires -->
    <script src="/static/app.js" defer></script>
    
    <style nonce="${nonce}">
      body { font-family: ${fontFamily}, system-ui, sans-serif; }
    </style>
</head>
<body class="bg-white dark:bg-[#0f0f0f] text-gray-900 dark:text-gray-100 min-h-screen flex flex-col transition-colors duration-300">
    <a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:start-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-purple-600 focus:text-white focus:rounded-lg">${tr.skip_to_content || 'Skip to content'}</a>
    ${content}
    <script nonce="${nonce}">
      // Register Service Worker
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('[PWA] Service Worker registered'))
            .catch(err => console.log('[PWA] Service Worker registration failed:', err));
        });
      }
    </script>
</body>
</html>`;
}

/**
 * Dueli Logo SVG - شعار ديولي
 */
export const DueliLogo = `
<svg width="44" height="44" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g opacity="0.7">
    <path d="M90 100 L30 30" stroke="currentColor" stroke-width="6" stroke-linecap="round" class="text-gray-400"/>
    <path d="M85 95 L95 105" stroke="currentColor" stroke-width="10" stroke-linecap="round" class="text-gray-400"/>
    <path d="M30 100 L90 30" stroke="currentColor" stroke-width="6" stroke-linecap="round" class="text-gray-400"/>
    <path d="M35 95 L25 105" stroke="currentColor" stroke-width="10" stroke-linecap="round" class="text-gray-400"/>
  </g>
  <g>
    <path d="M28 65 C30 55, 40 50, 50 50 L55 50 C55 45, 45 40, 35 45 L28 65 Z" fill="#a78bfa" stroke="#8b5cf6" stroke-width="2"/>
    <path d="M92 65 C90 55, 80 50, 70 50 L65 50 C65 45, 75 40, 85 45 L92 65 Z" fill="#fcd34d" stroke="#f59e0b" stroke-width="2"/>
    <path d="M50 50 C55 50, 58 55, 60 55 L60 60 C58 60, 55 65, 50 65 Z" fill="#a78bfa" stroke="#8b5cf6" stroke-width="1"/>
    <path d="M70 50 C65 50, 62 55, 60 55 L60 60 C62 60, 65 65, 70 65 Z" fill="#fcd34d" stroke="#f59e0b" stroke-width="1"/>
  </g>
</svg>
`;
