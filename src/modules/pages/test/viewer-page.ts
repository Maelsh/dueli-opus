/**
 * Test Viewer Page
 * صفحة المشاهد - Live Sequential + VOD MSE
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
    <title>اختبار البث - Viewer</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <style>
        body { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); min-height: 100vh; }
        .video-container { background: #000; border-radius: 12px; overflow: hidden; position: relative; }
        .log-entry { font-family: monospace; font-size: 12px; padding: 2px 0; }
        .log-info { color: #60a5fa; }
        .log-success { color: #34d399; }
        .log-warn { color: #fbbf24; }
        .log-error { color: #f87171; }
        .mode-badge {
            position: absolute;
            top: 10px;
            left: 10px;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            backdrop-filter: blur(10px);
            z-index: 10;
        }
        .mode-hls { background: rgba(59, 130, 246, 0.9); }
        .mode-mse { background: rgba(139, 92, 246, 0.9); }
        .mode-vod { background: rgba(236, 72, 153, 0.9); }
        .pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: .7; }
        }
    </style>
</head>
<body class="p-4">
    <div class="max-w-4xl mx-auto">
        <!-- Header -->
        <div class="flex items-center justify-between mb-6">
            <h1 class="text-3xl font-bold text-white flex items-center gap-2">
                <i class="fas fa-eye text-blue-400"></i>
                صفحة المشاهد
            </h1>
            <a href="/test" class="text-blue-400 hover:underline">← العودة</a>
        </div>

        <!-- Input -->
        <div class="bg-gray-800 rounded-lg p-4 mb-4 flex gap-2">
            <input 
                type="text" 
                id="compIdInput" 
                placeholder="رقم المنافسة"
                class="flex-1 bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
        </div>

        <!-- Buttons -->
        <div class="grid grid-cols-3 gap-2 mb-4">
            <button 
                onclick="startLive()"
                class="bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition flex items-center justify-center gap-2"
            >
                <i class="fas fa-circle text-red-500"></i>Live مباشر
            </button>
            <button 
                onclick="loadVod()"
                class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-lg transition flex items-center justify-center gap-2"
            >
                <i class="fas fa-film"></i>التسجيل
            </button>
            <button 
                onclick="stopPlayback()"
                class="bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg transition flex items-center justify-center gap-2"
            >
                <i class="fas fa-stop"></i>إيقاف
            </button>
        </div>

        <!-- Status -->
        <div id="status" class="bg-gray-800 rounded-lg p-4 mb-4 text-center text-lg"></div>

        <!-- Video Container (Double Buffering) -->
        <div class="video-container aspect-video mb-4">
            <div id="modeBadge" class="mode-badge hidden"></div>
            <video 
                id="videoPlayer1" 
                controls 
                autoplay 
                playsinline 
                style="position: absolute; width: 100%; height: 100%; transition: opacity 0.3s; opacity: 1; z-index: 2;"
            ></video>
            <video 
                id="videoPlayer2" 
                autoplay 
                playsinline 
                style="position: absolute; width: 100%; height: 100%; transition: opacity 0.3s; opacity: 0; z-index: 1;"
            ></video>
        </div>

        <!-- Stats & Log -->
        <div class="grid grid-cols-2 gap-4 mb-4">
            <div class="bg-gray-800 rounded-lg p-3">
                <div id="modeInfo" class="text-sm text-gray-400 mb-1">الوضع: منتظر</div>
                <div id="statsInfo" class="text-sm text-gray-400">القطع: 0</div>
            </div>
            <div class="bg-gray-800 rounded-lg p-3 text-right">
                <div class="text-sm text-gray-400">Buffer: <span id="bufferInfo">0s</span></div>
            </div>
        </div>

        <!-- Log -->
        <div id="log" class="bg-gray-900 rounded-lg p-3 h-40 overflow-y-auto text-xs font-mono"></div>

        <!-- Links -->
        <div class="mt-4 text-center text-sm text-gray-500">
            <a href="/test/host" class="text-purple-400 hover:underline mx-2">صفحة الـ Host</a>
            <a href="/test/guest" class="text-purple-400 hover:underline mx-2">صفحة الضيف</a>
        </div>
    </div>

    <script type="module">
        // Import من core.ts (سيتم تحويله بواسطة Vite)
        import {
            ChunkManager,
            LiveSequentialPlayer,
            VodMsePlayer,
            log,
            updateStatus,
            setMode
        } from '/static/test-core.js';

        // Global state
        let currentPlayer = null;
        let competitionId = null;

        // Read comp ID from URL
        const urlParams = new URLSearchParams(window.location.search);
        const urlCompId = urlParams.get('comp');
        if (urlCompId) {
            document.getElementById('compIdInput').value = urlCompId;
        }

        // Initialize
        log('🎬 صفحة المشاهد جاهزة');
        updateStatus('أدخل رقم المنافسة', 'blue');
        setMode('idle');

        // ===== Live Playback =====
        window.startLive = async function() {
            competitionId = document.getElementById('compIdInput').value.trim();
            if (!competitionId) {
                updateStatus('أدخل رقم المنافسة!', 'red');
                return;
            }

            stopPlayback();
            history.replaceState(null, '', window.location.pathname + '?comp=' + competitionId);

            const chunkManager = new ChunkManager(competitionId);
            const videoPlayers = [
                document.getElementById('videoPlayer1'),
                document.getElementById('videoPlayer2')
            ];

            currentPlayer = new LiveSequentialPlayer({
                videoPlayers,
                chunkManager,
                onChunkChange: (index, total) => {
                    document.getElementById('statsInfo').textContent = \`القطعة \${index}\`;
                },
                onStatus: (status) => updateStatus(status, 'yellow'),
                onError: (error) => {
                    log('خطأ: ' + error.message, 'error');
                    updateStatus('خطأ في التشغيل', 'red');
                }
            });

            try {
                log('بدء البث المباشر للمنافسة: ' + competitionId);
                updateStatus('جار التحميل...', 'yellow');
                await currentPlayer.start();
                updateStatus('البث مباشر ●', 'green');
                setMode('mse', 'Sequential Live');
            } catch (error) {
                log('فشل بدء البث: ' + error.message, 'error');
                updateStatus('خطأ', 'red');
            }
        };

        // ===== VOD Playback =====
        window.loadVod = async function() {
            competitionId = document.getElementById('compIdInput').value.trim();
            if (!competitionId) {
                updateStatus('أدخل رقم المنافسة!', 'red');
                return;
            }

            stopPlayback();

            const chunkManager = new ChunkManager(competitionId);
            const videoPlayer = document.getElementById('videoPlayer1');

            currentPlayer = new VodMsePlayer({
                videoElement: videoPlayer,
                chunkManager,
                onProgress: (current, total) => {
                    document.getElementById('statsInfo').textContent = \`القطعة \${current}/\${total}\`;
                }
            });

            try {
                log('تحميل التسجيل للمنافسة: ' + competitionId);
                updateStatus('جار التحميل...', 'purple');
                await currentPlayer.start();
                updateStatus('التسجيل جاهز', 'purple');
                setMode('vod', 'MSE VOD');
            } catch (error) {
                log('فشل تحميل التسجيل: ' + error.message, 'error');
                updateStatus('خطأ', 'red');
            }
        };

        // ===== Stop =====
        window.stopPlayback = function() {
            if (currentPlayer) {
                currentPlayer.stop();
                currentPlayer = null;
            }

            const player1 = document.getElementById('videoPlayer1');
            const player2 = document.getElementById('videoPlayer2');
            player1.src = '';
            player2.src = '';
            player1.style.opacity = '1';
            player1.style.zIndex = '2';
            player2.style.opacity = '0';
            player2.style.zIndex = '1';

            setMode('idle');
            updateStatus('تم الإيقاف', 'gray');
            log('تم إيقاف التشغيل');
        };

        // Cleanup on unload
        window.addEventListener('beforeunload', stopPlayback);
    </script>
</body>
</html>
    `;

    return c.html(html);
};
