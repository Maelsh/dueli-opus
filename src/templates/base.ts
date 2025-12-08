/**
 * @file templates/base.ts
 * @description قالب HTML الأساسي للصفحات
 * @description_en Base HTML template for pages
 * @module templates/base
 * @version 1.0.0
 * @author Dueli Team
 */

import type { Language, Direction } from '../i18n';
import { getDir, t } from '../i18n';

// ============================================
// الأنواع - Types
// ============================================

/**
 * خيارات إنشاء الصفحة
 */
export interface PageOptions {
  /** عنوان الصفحة */
  title?: string;
  /** وصف الصفحة للـ SEO */
  description?: string;
  /** اللغة الحالية */
  lang: Language;
  /** محتوى الصفحة الرئيسي */
  content: string;
  /** سكريبتات إضافية */
  scripts?: string;
  /** أنماط CSS إضافية */
  styles?: string;
  /** هل تعرض الـ Footer */
  showFooter?: boolean;
}

// ============================================
// القالب الأساسي - Base Template
// ============================================

/**
 * إنشاء صفحة HTML كاملة
 * @param options - خيارات الصفحة
 * @returns كود HTML الكامل
 */
export function generateHTML(options: PageOptions): string {
  const { 
    title = t('general.app_title', options.lang), 
    description = t('general.app_tagline', options.lang),
    lang, 
    content,
    scripts = '',
    styles = '',
    showFooter = true
  } = options;

  const dir: Direction = getDir(lang);
  const appTitle = t('general.app_title', lang);
  const fontFamily = lang === 'ar' ? "'Cairo'" : "'Inter'";

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}" class="scroll-smooth">
<head>
    <!-- Meta Tags -->
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="${description}">
    <meta name="theme-color" content="#7c3aed">
    
    <!-- Title -->
    <title>${title} - ${appTitle}</title>
    
    <!-- Fonts & Icons -->
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
    
    <!-- Styles -->
    <link href="/static/styles.css" rel="stylesheet">
    <link rel="icon" type="image/x-icon" href="/static/favicon.ico">
    
    <!-- Dynamic Styles -->
    <style>
      body { font-family: ${fontFamily}, system-ui, sans-serif; }
      ${styles}
    </style>
    
    <!-- Open Graph -->
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:type" content="website">
    <meta property="og:image" content="/static/og-image.png">
</head>
<body class="bg-white dark:bg-[#0f0f0f] text-gray-900 dark:text-gray-100 min-h-screen transition-colors duration-300">
    ${content}
    
    <!-- Main Script -->
    <script src="/static/app.js"></script>
    
    <!-- Additional Scripts -->
    ${scripts}
</body>
</html>`;
}

// ============================================
// مكونات الصفحة - Page Components
// ============================================

/**
 * شعار ديولي SVG
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

/**
 * أيقونة التحميل
 */
export function getLoadingSpinner(lang: Language): string {
  return `
    <div class="flex flex-col items-center justify-center py-16">
      <i class="fas fa-spinner fa-spin text-4xl text-purple-400 mb-4"></i>
      <p class="text-gray-500">${t('general.loading', lang)}</p>
    </div>
  `;
}

/**
 * رسالة خطأ
 */
export function getErrorMessage(message: string, lang: Language): string {
  return `
    <div class="flex flex-col items-center justify-center py-16 text-center">
      <div class="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
        <i class="fas fa-exclamation-circle text-3xl text-red-500"></i>
      </div>
      <p class="text-lg font-medium text-gray-600 dark:text-gray-400">${message}</p>
      <button onclick="location.reload()" class="mt-4 px-6 py-2 bg-purple-600 text-white rounded-full hover:bg-purple-700 transition-colors">
        ${t('general.retry', lang)}
      </button>
    </div>
  `;
}

/**
 * رسالة "لا توجد نتائج"
 */
export function getEmptyState(message: string, subMessage: string, lang: Language): string {
  return `
    <div class="flex flex-col items-center justify-center py-16 text-center">
      <div class="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
        <i class="fas fa-search text-3xl text-gray-300 dark:text-gray-600"></i>
      </div>
      <p class="text-lg font-medium text-gray-400">${message}</p>
      <p class="text-sm text-gray-400 mt-1">${subMessage}</p>
    </div>
  `;
}

export default {
  generateHTML,
  DueliLogo,
  getLoadingSpinner,
  getErrorMessage,
  getEmptyState,
};
