/**
 * Test Stream Main Module
 * الـ Handlers وتوليد الصفحات
 * يستورد مباشرة من views و scripts (بدون تبعية دائرية مع index.ts)
 */

import type { Context } from 'hono';
import type { Bindings, Variables, Language } from '../../../config/types';
import { translations, getUILanguage } from '../../../i18n';
import { getNavigation, getLoginModal, getFooter } from '../../../shared/components';
import { generateHTML } from '../../../shared/templates/layout';

// استيراد مباشر من Views
import { getLandingContent, getLandingScript } from './views/landing';
import { getHostContent } from './views/host';
import { getGuestContent } from './views/guest';
import { getViewerContent } from './views/viewer';

// استيراد مباشر من Client Scripts
import { getClientSharedScript } from './scripts/client/shared';
import { getHostScript } from './scripts/client/host';
import { getGuestScript } from './scripts/client/guest';
import { getViewerScript } from './scripts/client/viewer';

// ===== Styles =====
const testStyles = `
/* Video Container */
.video-container { background: #000; border-radius: 12px; overflow: hidden; }

/* Log Entries */
.log-entry { font-family: monospace; font-size: 12px; padding: 2px 0; }
.log-info { color: #60a5fa; }
.log-success { color: #34d399; }
.log-error { color: #f87171; }
.log-warn { color: #fbbf24; }

/* Mode Badge (Viewer) */
.mode-badge { position: absolute; top: 10px; right: 10px; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; z-index: 10; }
.mode-hls { background: linear-gradient(135deg, #8b5cf6, #6366f1); color: white; }
.mode-mse { background: linear-gradient(135deg, #10b981, #059669); color: white; }
.mode-vod { background: linear-gradient(135deg, #f59e0b, #d97706); color: white; }
.pulse { animation: pulse 2s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }

/* Test Page Cards */
.test-card { background: linear-gradient(135deg, var(--card-from), var(--card-to)); padding: 1.5rem; border-radius: 12px; transition: transform 0.2s; color: white; display: block; }
.test-card:hover { transform: scale(1.05); }
.test-card-host { --card-from: #2563eb; --card-to: #1e40af; }
.test-card-guest { --card-from: #16a34a; --card-to: #166534; }
.test-card-viewer { --card-from: #9333ea; --card-to: #7e22ce; }

/* Control Buttons */
.control-btn { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: background-color 0.2s; }
.control-btn-lg { width: 48px; height: 48px; }

/* Video Wrapper */
.video-wrapper { transition: all 0.3s ease; }
.video-wrapper-hidden { opacity: 0; pointer-events: none; position: absolute; width: 0; }

/* Utility Classes (TailwindCSS compatibility) */
.hidden { display: none !important; }
`;

/**
 * Generate Test Page - توليد صفحة اختبار مع الغلاف المشترك
 */
export function generateTestPage(
    content: string,
    pageScript: string,
    title: string,
    lang: Language
): string {
    const fullContent = `
        ${getNavigation(lang)}
        ${getLoginModal(lang)}
        
        <style>${testStyles}</style>
        
        <main class="flex-1 bg-gray-100 dark:bg-[#0f0f0f] py-4">
            <div class="container mx-auto px-4 max-w-4xl">
                ${content}
            </div>
        </main>
        
        ${getFooter(lang)}
        
        <!-- Client Shared Script -->
        <script>
            ${getClientSharedScript()}
        </script>
        
        <!-- Page Specific Script -->
        <script>
            ${pageScript}
        </script>
    `;

    return generateHTML(fullContent, lang, title);
}

/**
 * Test Stream Landing Page
 */
export const testMainPage = async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
    const lang = (c.get('lang') || c.req.query('lang') || 'ar') as Language;
    const tr = translations[getUILanguage(lang)];

    const content = getLandingContent(lang);
    const pageScript = getLandingScript();

    return c.html(generateTestPage(content, pageScript, tr.test_stream, lang));
};

/**
 * Test Host Page
 */
export const testHostPage = async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
    const lang = (c.get('lang') || c.req.query('lang') || 'ar') as Language;
    const tr = translations[getUILanguage(lang)];

    const content = getHostContent(lang);
    const pageScript = getHostScript(lang);

    return c.html(generateTestPage(content, pageScript, `${tr.host} - ${tr.test_stream}`, lang));
};

/**
 * Test Guest Page
 */
export const testGuestPage = async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
    const lang = (c.get('lang') || c.req.query('lang') || 'ar') as Language;
    const tr = translations[getUILanguage(lang)];

    const content = getGuestContent(lang);
    const pageScript = getGuestScript(lang);

    return c.html(generateTestPage(content, pageScript, `${tr.guest} - ${tr.test_stream}`, lang));
};

/**
 * Test Viewer Page
 */
export const testViewerPage = async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
    const lang = (c.get('lang') || c.req.query('lang') || 'ar') as Language;
    const tr = translations[getUILanguage(lang)];

    const content = getViewerContent(lang);
    const pageScript = getViewerScript(lang);

    return c.html(generateTestPage(content, pageScript, `${tr.viewer} - ${tr.test_stream}`, lang));
};
