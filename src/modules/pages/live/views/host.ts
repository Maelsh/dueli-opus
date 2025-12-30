/**
 * Host Page View
 * صفحة المضيف - HTML فقط
 */

import type { Language } from '../../../../config/types';
import { translations, getUILanguage } from '../../../../i18n';

/**
 * Get Host Content - الحصول على محتوى صفحة المضيف
 */
export function getHostContent(lang: Language): string {
    const tr = translations[getUILanguage(lang)];

    return `
        <div class="text-center mb-6">
            <h1 class="text-3xl font-bold mb-2 text-gray-900 dark:text-white">🎬 ${tr.test_stream} - ${tr.host}</h1>
            <p class="text-gray-600 dark:text-gray-400">${tr.host_desc}</p>
            <p id="compIdDisplay" class="text-lg text-green-600 dark:text-green-400 mt-2 font-mono">${tr.competition_number}: ${tr.loading}...</p>
        </div>
        
        <!-- Status -->
        <div id="status" class="bg-gray-200 dark:bg-gray-800 rounded-lg p-4 mb-4 text-center">
            <span class="text-yellow-600 dark:text-yellow-400"><i class="fas fa-circle-notch fa-spin mr-2" aria-hidden="true"></i>${tr.initializing}...</span>
        </div>
        
        <!-- Latency Gauge & Quality Info -->
        <div class="flex justify-between items-center bg-gray-200 dark:bg-gray-900 rounded-lg p-3 mb-4 text-sm">
            <div id="latencyGauge"><span class="text-gray-600 dark:text-gray-400">● ${tr.waiting}...</span></div>
            <div id="qualityInfo" class="text-gray-600 dark:text-gray-400">${tr.quality}: ${tr.loading}...</div>
        </div>
        
        <!-- Videos -->
        <div class="flex flex-col md:flex-row justify-center gap-4 mb-4" id="videosContainer">
            <!-- Local Video -->
            <div class="video-wrapper w-full md:w-[48%]" id="localVideoWrapper">
                <div class="video-container aspect-video" id="localVideoContainer">
                    <video id="localVideo" autoplay muted playsinline class="w-full h-full object-cover"></video>
                </div>
            </div>
            <!-- Remote Video -->
            <div class="video-wrapper w-full md:w-[48%]" id="remoteVideoWrapper">
                <div class="video-container aspect-video relative" id="remoteVideoContainer">
                    <video id="remoteVideo" autoplay playsinline class="w-full h-full object-cover"></video>
                    <button onclick="window.toggleFullscreen()" id="fullscreenBtn" title="${tr.fullscreen}"
                        class="absolute top-2 right-2 control-btn bg-black/50 hover:bg-black/70">
                        <i class="fas fa-expand text-white text-sm" id="fullscreenIcon" aria-hidden="true"></i>
                    </button>
                </div>
            </div>
        </div>
        
        <!-- Media Controls -->
        <div class="flex flex-wrap gap-3 justify-center mb-3">
            <div class="relative">
                <button onclick="window.toggleScreen()" id="screenBtn" title="${tr.share_screen}" 
                    class="control-btn bg-blue-600 hover:bg-blue-700">
                    <i class="fas fa-desktop text-white" aria-hidden="true"></i>
                </button>
                <span id="screenUnavailable" class="hidden absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-red-400 whitespace-nowrap">${tr.error}</span>
            </div>
            
            <button onclick="window.toggleCamera()" id="cameraBtn" title="${tr.toggle_camera}"
                class="control-btn bg-purple-600 hover:bg-purple-700">
                <i class="fas fa-video text-white" id="cameraIcon" aria-hidden="true"></i>
            </button>
            
            <button onclick="window.switchCamera()" id="switchCamBtn" title="${tr.switch_camera}"
                class="control-btn bg-indigo-600 hover:bg-indigo-700">
                <i class="fas fa-sync-alt text-white" aria-hidden="true"></i>
            </button>
            
            <button onclick="window.toggleMic()" id="micBtn" title="${tr.toggle_mic}"
                class="control-btn bg-green-600 hover:bg-green-700">
                <i class="fas fa-microphone text-white" id="micIcon" aria-hidden="true"></i>
            </button>
            
            <button onclick="window.toggleSpeaker()" id="speakerBtn" title="${tr.toggle_speaker}"
                class="control-btn bg-teal-600 hover:bg-teal-700">
                <i class="fas fa-volume-up text-white" id="speakerIcon" aria-hidden="true"></i>
            </button>
            
            <button onclick="window.toggleLocalVideo()" id="hideLocalBtn" title="${tr.toggle_my_video}"
                class="control-btn bg-gray-600 hover:bg-gray-700">
                <i class="fas fa-eye text-white" id="hideLocalIcon" aria-hidden="true"></i>
            </button>
        </div>
        
        <!-- Connection Controls -->
        <div class="flex flex-wrap gap-3 justify-center mb-4">
            <button onclick="window.connect()" id="connectBtn" title="${tr.connect}"
                class="control-btn control-btn-lg bg-green-600 hover:bg-green-700">
                <i class="fas fa-play text-white text-lg" aria-hidden="true"></i>
            </button>
            
            <button onclick="window.reconnect()" id="reconnectBtn" title="${tr.reconnect}"
                class="control-btn control-btn-lg bg-amber-600 hover:bg-amber-700 hidden">
                <i class="fas fa-redo text-white text-lg" aria-hidden="true"></i>
            </button>
            
            <button onclick="window.disconnect()" id="disconnectBtn" title="${tr.disconnect}"
                class="control-btn control-btn-lg bg-red-600 hover:bg-red-700 hidden">
                <i class="fas fa-stop text-white text-lg" aria-hidden="true"></i>
            </button>
        </div>
        
        <!-- Log -->
        <div class="bg-gray-200 dark:bg-gray-900 rounded-lg p-4 max-h-64 overflow-y-auto" id="logContainer">
            <p class="text-gray-500 dark:text-gray-400 text-sm mb-2">📋 ${tr.notes}:</p>
            <div id="log"></div>
        </div>
        
        <!-- Links -->
        <div class="mt-4 text-center text-sm">
            <a href="/live?lang=${lang}" class="text-purple-600 dark:text-purple-400 hover:underline mx-2" title="${tr.back}">← ${tr.back}</a>
            <a href="/live/guest?lang=${lang}" class="text-purple-600 dark:text-purple-400 hover:underline mx-2" title="${tr.guest}">${tr.guest}</a>
            <a href="/live/viewer?lang=${lang}" class="text-purple-600 dark:text-purple-400 hover:underline mx-2" title="${tr.viewer}">${tr.viewer}</a>
        </div>
    `;
}

