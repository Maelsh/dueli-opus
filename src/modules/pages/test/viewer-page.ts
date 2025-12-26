/**
 * Test Viewer Page
 * صفحة المشاهد - مُستخرجة من test-stream-page.ts مع تحسينات ChatGPT
 */

import type { Context } from 'hono';
import type { Bindings, Variables } from '../../../config/types';

export const testViewerPage = async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
    const html = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>اختبار البث - مشاهد</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <style>
        body { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); min-height: 100vh; }
        .video-container { background: #000; border-radius: 12px; overflow: hidden; position: relative; }
        .log-entry { font-size: 11px; font-family: monospace; padding: 2px 0; }
        .log-info { color: #94a3b8; }
        .log-success { color: #4ade80; }
        .log-error { color: #f87171; }
        .log-warn { color: #fbbf24; }
        .mode-badge { position: absolute; top: 10px; right: 10px; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; z-index: 10; }
        .mode-hls { background: linear-gradient(135deg, #8b5cf6, #6366f1); }
        .mode-mse { background: linear-gradient(135deg, #10b981, #059669); }
        .mode-vod { background: linear-gradient(135deg, #f59e0b, #d97706); }
        .pulse { animation: pulse 2s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
    </style>
</head>
<body class="text-white p-4">
    <div class="max-w-4xl mx-auto">
        <div class="text-center mb-6">
            <h1 class="text-3xl font-bold mb-2">👁️ اختبار البث - مشاهد</h1>
            <p class="text-gray-400">مشاهد ذكي: HLS أولاً، MSE احتياطي</p>
        </div>
        
        <!-- Status -->
        <div id="status" class="bg-gray-800 rounded-lg p-4 mb-4 text-center">
            <span class="text-yellow-400"><i class="fas fa-circle-notch fa-spin mr-2"></i>جاري التهيئة...</span>
        </div>
        
        <!-- Info Bar -->
        <div class="flex justify-between items-center bg-gray-900 rounded-lg p-3 mb-4 text-sm">
            <div id="modeInfo" class="text-gray-400"><i class="fas fa-satellite-dish mr-1"></i>الوضع: انتظار</div>
            <div id="statsInfo" class="text-gray-400">القطع: 0 | Buffer: 0s</div>
        </div>
        
        <!-- Competition ID Input -->
        <div class="mb-4 text-center">
            <label class="text-sm text-gray-300 ml-2">رقم المنافسة:</label>
            <input type="number" id="compIdInput" class="bg-gray-700 text-white px-3 py-2 rounded-lg w-40 text-center font-mono" placeholder="أدخل الرقم">
            <button onclick="window.startMSEStream()" class="px-4 py-2 bg-green-600 rounded-lg hover:bg-green-700 transition mr-2">
                <i class="fas fa-play mr-1"></i>مباشر
            </button>
            <button onclick="window.loadVOD()" class="px-4 py-2 bg-purple-600 rounded-lg hover:bg-purple-700 transition mr-2">
                <i class="fas fa-film mr-1"></i>تسجيل
            </button>
            <button onclick="window.stopStream()" class="px-4 py-2 bg-red-600 rounded-lg hover:bg-red-700 transition">
                <i class="fas fa-stop mr-1"></i>إيقاف
            </button>
        </div>
        
        <!-- Double Buffering Videos (ChatGPT Improvement) -->
        <div class="video-container aspect-video mb-4" style="position: relative;">
            <div id="modeBadge" class="mode-badge hidden"></div>
            <video id="videoPlayer1" controls autoplay playsinline style="position: absolute; width: 100%; height: 100%; transition: opacity 0.3s; opacity: 1; z-index: 2;"></video>
            <video id="videoPlayer2" autoplay playsinline style="position: absolute; width: 100%; height: 100%; transition: opacity 0.3s; opacity: 0; z-index: 1;"></video>
        </div>  
        
        <!-- Log -->
        <div id="log" class="bg-gray-900 rounded-lg p-3 h-40 overflow-y-auto text-xs font-mono"></div>
        
        <!-- Links -->
        <div class="mt-4 text-center text-sm text-gray-500">
            <a href="/test" class="text-purple-400 hover:underline mx-2">← العودة</a>
            <a href="/test/host" class="text-purple-400 hover:underline mx-2">صفحة الـ Host</a>
            <a href="/test/guest" class="text-purple-400 hover:underline mx-2">صفحة الضيف</a>
        </div>
    </div>
    
    <script src="/static/app.js"></script>
    <script>
        // استيراد من core.ts عبر window (تصحيح الأسماء)
        const { ChunkManager, LiveSequentialPlayer, VodMsePlayer, testLog: log, updateStatus, setMode } = window;
        
        // Setup (من الأصلي - السطر 1235-1248)
        const ffmpegUrl = 'https://maelsh.pro/ffmpeg';
        const videoPlayers = [
            document.getElementById('videoPlayer1'),
            document.getElementById('videoPlayer2')
        ];
        let activePlayerIndex = 0;
        const videoPlayer = videoPlayers[0];
        const modeBadge = document.getElementById('modeBadge');
        
        const urlParams = new URLSearchParams(window.location.search);
        const urlCompId = urlParams.get('comp');
        if (urlCompId) {
            document.getElementById('compIdInput').value = urlCompId;
        }
        
        // Global state
        let currentPlayer = null;
        let chunkManager = null;
        let currentMode = null;
        
        // ===== Start MSE Stream (استخدام LiveSequentialPlayer المُحسّن) =====
        window.startMSEStream = async function() {
            const compIdInput = document.getElementById('compIdInput');
            const competitionId = compIdInput.value.trim();
            
            if (!competitionId) {
                log('أدخل رقم المنافسة!', 'error');
                updateStatus('أدخل رقم المنافسة!', 'red');
                return;
            }
            
            try {
                stopStream(); // إيقاف أي تشغيل سابق
                
                log('بدء البث المباشر للمنافسة: ' + competitionId);
                updateStatus('جاري تحميل البث...', 'yellow');
                setMode('mse', 'MSE Live');
                
                // إنشاء ChunkManager و LiveSequentialPlayer (مع التحسينات)
                chunkManager = new ChunkManager(competitionId, 'webm');
                
                currentPlayer = new LiveSequentialPlayer({
                    videoPlayers: videoPlayers,
                    chunkManager: chunkManager,
                    onChunkChange: (index, total) => {
                        document.getElementById('statsInfo').textContent = 
                            'القطع: ' + index + (total > 0 ? '/' + total : '');
                    },
                    onStatus: (status) => {
                        log(status, 'info');
                    },
                    onError: (error) => {
                        log('خطأ: ' + error.message, 'error');
                        updateStatus('خطأ في التشغيل', 'red');
                    }
                });
                
                await currentPlayer.start();
                updateStatus('البث مباشر ✓', 'green');
                currentMode = 'live';
                
            } catch (error) {
                log('فشل البدء: ' + error.message, 'error');
                updateStatus('فشل البث', 'red');
            }
        }
        
        // ===== Load VOD (استخدام VodMsePlayer المُحسّن) =====
        window.loadVOD = async function() {
            const compIdInput = document.getElementById('compIdInput');
            const competitionId = compIdInput.value.trim();
            
            if (!competitionId) {
                log('أدخل رقم المنافسة!', 'error');
                updateStatus('أدخل رقم المنافسة!', 'red');
                return;
            }
            
            try {
                stopStream();
                
                log('تحميل التسجيل للمنافسة: ' + competitionId);
                updateStatus('جاري تحميل التسجيل...', 'yellow');
                setMode('vod', 'VOD');
                
                chunkManager = new ChunkManager(competitionId, 'webm');
                
                currentPlayer = new VodMsePlayer({
                    videoElement: videoPlayers[0],
                    chunkManager: chunkManager,
                    onProgress: (current, total) => {
                        document.getElementById('statsInfo').textContent = 
                            'التحميل: ' + current + '/' + total;
                    }
                });
                
                await currentPlayer.start();
                updateStatus('التسجيل جاهز ✓', 'green');
                currentMode = 'vod';
                
            } catch (error) {
                log('فشل التحميل: ' + error.message, 'error');
                updateStatus('فشل التحميل', 'red');
            }
        }
        
        // ===== Stop Stream =====
        window.stopStream = function() {
            if (currentPlayer) {
                currentPlayer.stop();
                currentPlayer = null;
            }
            
            videoPlayers.forEach(v => {
                v.src = '';
                v.load();
            });
            
            setMode('', '');
            updateStatus('متوقف', 'gray');
            currentMode = null;
        }
        
        // Init
        log('تم تحميل صفحة المشاهد');
        updateStatus('أدخل رقم المنافسة لبدء المشاهدة', 'blue');
    </script>
</body>
</html>
    `;

    return c.html(html);
};
