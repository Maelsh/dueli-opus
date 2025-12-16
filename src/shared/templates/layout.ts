/**
 * Layout Templates
 * قوالب التخطيط
 */

import type { Language } from '../../config/types';
import { translations, getUILanguage, getDir, isRTL } from '../../i18n';

// Font mapping per language
const fontMap: Record<string, string> = {
  'ar': "'Cairo'",
  'en': "'Inter'",
};

/**
 * Generate base HTML wrapper - توليد غلاف HTML الأساسي
 */
export function generateHTML(content: string, lang: Language, title: string = 'Dueli'): string {
  const dir = getDir(lang);
  const tr = translations[getUILanguage(lang)];
  const fontFamily = fontMap[lang] || "'Inter'";

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}" class="scroll-smooth">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <meta name="theme-color" content="#6366f1">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="Dueli">
    <title>${title} - ${tr.app_title}</title>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
    <link href="/static/styles.css" rel="stylesheet">
    <link rel="icon" type="image/x-icon" href="/static/favicon.ico">
    <link rel="manifest" href="/manifest.json">
    <link rel="apple-touch-icon" href="/static/icons/icon-192.png">
    
    <style>
      body { font-family: ${fontFamily}, system-ui, sans-serif; }
    </style>
</head>
<body class="bg-white dark:bg-[#0f0f0f] text-gray-900 dark:text-gray-100 min-h-screen flex flex-col transition-colors duration-300">
    ${content}
    <script src="/static/app.js"></script>
    <script>
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
