/**
 * Viewer Page View
 * صفحة المشاهد - HTML فقط
 */

import type { Language } from '../../../../config/types';
import { translations, getUILanguage } from '../../../../i18n';

/**
 * Get Viewer Content - الحصول على محتوى صفحة المشاهد
 */
export function getViewerContent(lang: Language): string {
    const tr = translations[getUILanguage(lang)];

    return `
        <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
        
        <div class="text-center mb-6">
            <h1 class="text-3xl font-bold mb-2 text-gray-900 dark:text-white">👁️ ${tr.viewer}</h1>
            <p class="text-gray-600 dark:text-gray-400" id="viewerSubtitle">${tr.smart_viewer}</p>
        </div>
        
        <!-- Status -->
        <div id="status" class="bg-gray-200 dark:bg-gray-800 rounded-lg p-4 mb-4 text-center">
            <span class="text-yellow-600 dark:text-yellow-400"><i class="fas fa-circle-notch fa-spin mr-2" aria-hidden="true"></i>${tr.initializing}</span>
        </div>
        
        <!-- Info Bar -->
        <div class="flex justify-between items-center bg-gray-200 dark:bg-gray-900 rounded-lg p-3 mb-4 text-sm">
            <div id="modeInfo" class="text-gray-600 dark:text-gray-400"><i class="fas fa-satellite-dish mr-1" aria-hidden="true"></i>${tr.mode}: ${tr.waiting}</div>
            <div id="statsInfo" class="text-gray-600 dark:text-gray-400">${tr.chunks}: 0</div>
        </div>
        
        <!-- Competition ID Input (سيختفي بعد تحديد المنافسة) -->
        <div id="compInputSection" class="mb-4 text-center flex flex-wrap justify-center items-center gap-2">
            <input type="number" id="compIdInput" class="bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 rounded-lg w-32 text-center font-mono" placeholder="${tr.enter_number}" title="${tr.competition_number}">
            <button onclick="window.checkAndLoad()" class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition" title="${tr.start_watching}">
                <i class="fas fa-play" aria-hidden="true"></i>
            </button>
            <button onclick="window.stopStream()" class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition" title="${tr.stop_watching}">
                <i class="fas fa-stop" aria-hidden="true"></i>
            </button>
        </div>
        
        <!-- Video Container -->
        <div id="videoContainer" class="video-container aspect-video mb-4" style="position: relative;">
            <div id="modeBadge" class="mode-badge hidden"></div>
            <video id="videoPlayer1" autoplay playsinline style="position: absolute; width: 100%; height: 100%; transition: opacity 0.3s; opacity: 1; z-index: 2; background: #000;"></video>
            <video id="videoPlayer2" autoplay playsinline style="position: absolute; width: 100%; height: 100%; transition: opacity 0.3s; opacity: 0; z-index: 1; background: #000;"></video>
        </div>  
        
        <!-- Custom VOD Controls (Hidden by default) -->
        <div id="vodControls" class="hidden bg-gray-200 dark:bg-gray-800 rounded-lg p-3 mb-4">
            <div class="flex items-center gap-3">
                <!-- Play/Pause -->
                <button id="playPauseBtn" onclick="window.togglePlayPause()" class="w-10 h-10 flex items-center justify-center bg-purple-600 text-white rounded-full hover:bg-purple-700" title="Play/Pause">
                    <i id="playPauseIcon" class="fas fa-play"></i>
                </button>
                <!-- Time Display -->
                <span id="vodTimeDisplay" class="text-sm font-mono text-gray-600 dark:text-gray-300 min-w-20">0:00 / 0:00</span>
                <!-- Seekbar -->
                <input type="range" id="vodSeekbar" min="0" max="100" value="0" 
                    class="flex-1 h-2 bg-gray-400 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-purple-600"
                    title="Seek" />
                <!-- Loading Info -->
                <span id="vodLoadingInfo" class="text-xs text-gray-500 min-w-12">0/0</span>
                <!-- Fullscreen -->
                <button onclick="window.toggleVideoFullscreen()" class="w-10 h-10 flex items-center justify-center bg-gray-600 text-white rounded-full hover:bg-gray-700" title="${tr.fullscreen}">
                    <i id="fullscreenIcon" class="fas fa-expand"></i>
                </button>
            </div>
        </div>
        
        <!-- Download Buttons Container (Hidden until fully loaded) -->
        <div id="downloadContainer" class="hidden mb-4 flex flex-wrap justify-center gap-2"></div>
        
        <!-- Log -->
        <div class="bg-gray-200 dark:bg-gray-900 rounded-lg p-4 max-h-40 overflow-y-auto" id="logContainer">
            <p class="text-gray-500 text-sm mb-2">📋 ${tr.notes}:</p>
            <div id="log"></div>
        </div>
        
        <!-- Links -->
        <div class="mt-4 text-center text-sm">
            <a href="/live?lang=${lang}" class="text-purple-600 dark:text-purple-400 hover:underline mx-2" title="${tr.back}">← ${tr.back}</a>
        </div>
    `;
}

