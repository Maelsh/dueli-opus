/**
 * Test Landing Page View
 * الصفحة الرئيسية للاختبار - HTML فقط
 */

import type { Language } from '../../../../config/types';
import { translations, getUILanguage } from '../../../../i18n';

/**
 * Get Landing Content - الحصول على محتوى الصفحة الرئيسية
 */
export function getLandingContent(lang: Language): string {
    const tr = translations[getUILanguage(lang)];

    return `
        <div class="text-center mb-8">
            <h1 class="text-4xl font-bold mb-4 text-gray-900 dark:text-white">🧪 ${tr.test_stream}</h1>
            <p class="text-gray-600 dark:text-gray-400">${tr.test_stream_desc}</p>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <!-- Host -->
            <a href="/test/host?lang=${lang}" class="test-card test-card-host" title="${tr.host}">
                <div class="text-4xl mb-3" aria-hidden="true">🎬</div>
                <h2 class="text-2xl font-bold mb-2">${tr.host}</h2>
                <p class="text-sm opacity-80">${tr.host_desc}</p>
                <ul class="text-xs mt-3 opacity-70 space-y-1">
                    <li>✓ ${tr.screen_share}</li>
                    <li>✓ WebRTC</li>
                    <li>✓ ${tr.canvas_recording}</li>
                    <li>✓ ${tr.upload_chunks}</li>
                </ul>
            </a>
            
            <!-- Guest -->
            <a href="/test/guest?lang=${lang}" class="test-card test-card-guest" title="${tr.guest}">
                <div class="text-4xl mb-3" aria-hidden="true">👤</div>
                <h2 class="text-2xl font-bold mb-2">${tr.guest}</h2>
                <p class="text-sm opacity-80">${tr.guest_desc}</p>
                <ul class="text-xs mt-3 opacity-70 space-y-1">
                    <li>✓ ${tr.screen_share}</li>
                    <li>✓ WebRTC</li>
                    <li>✓ P2P</li>
                </ul>
            </a>
            
            <!-- Viewer -->
            <a href="/test/viewer?lang=${lang}" class="test-card test-card-viewer" title="${tr.viewer}">
                <div class="text-4xl mb-3" aria-hidden="true">👁️</div>
                <h2 class="text-2xl font-bold mb-2">${tr.viewer}</h2>
                <p class="text-sm opacity-80">${tr.viewer_desc}</p>
                <ul class="text-xs mt-3 opacity-70 space-y-1">
                    <li>✓ HLS</li>
                    <li>✓ MSE</li>
                    <li>✓ ${tr.adaptive_streaming}</li>
                </ul>
            </a>
        </div>
        
        <div class="mt-8 p-4 bg-gray-200 dark:bg-gray-800 rounded-lg">
            <h3 class="font-bold mb-2 text-yellow-600 dark:text-yellow-400">
                <i class="fas fa-info-circle mr-2" aria-hidden="true"></i>${tr.notes}:
            </h3>
            <ul class="text-sm space-y-1 text-gray-700 dark:text-gray-300">
                <li>• ${tr.test_note_1}</li>
                <li>• ${tr.test_note_2}</li>
                <li>• ${tr.test_note_3}</li>
                <li>• ${tr.test_note_4}</li>
            </ul>
        </div>
        
        <div class="text-center mt-6">
            <a href="/?lang=${lang}" class="text-purple-600 dark:text-purple-400 hover:underline" title="${tr.back_to_home}">
                <i class="fas fa-home mr-1" aria-hidden="true"></i>${tr.back_to_home}
            </a>
        </div>
    `;
}

/**
 * Get Landing Script - Script بسيط للصفحة الرئيسية
 */
export function getLandingScript(): string {
    return `
        console.log('[Test] Landing page loaded');
    `;
}
