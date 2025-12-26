/**
 * Test Pages Index
 * المدخل لصفحات الاختبار
 */

import { Hono } from 'hono';
import { testHostPage } from './host-page';
import { testGuestPage } from './guest-page';
import { testViewerPage } from './viewer-page';

const testRoutes = new Hono();

// Routes
testRoutes.get('/host', testHostPage);
testRoutes.get('/guest', testGuestPage);
testRoutes.get('/viewer', testViewerPage);

// Landing page
testRoutes.get('/', async (c) => {
    const html = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Stream Pages</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <style>
        body { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); min-height: 100vh; }
        .card { transition: transform 0.3s, box-shadow 0.3s; }
        .card:hover { transform: translateY(-4px); box-shadow: 0 8px 16px rgba(0,0,0,0.3); }
    </style>
</head>
<body class="text-white p-8">
    <div class="max-w-4xl mx-auto">
        <div class="text-center mb-12">
            <h1 class="text-5xl font-bold mb-4">🎬 Test Stream Pages</h1>
            <p class="text-gray-400 text-lg">اختبار البث المباشر والتسجيل</p>
            <p class="text-gray-500 text-sm mt-2">Sequential Playback + MSE VOD</p>
        </div>

        <div class="grid md:grid-cols-3 gap-6">
            <!-- Host Card -->
            <a href="/test/host" class="card bg-gradient-to-br from-green-600 to-green-800 rounded-xl p-6 block text-center">
                <div class="text-6xl mb-4">🎥</div>
                <h2 class="text-2xl font-bold mb-2">المضيف</h2>
                <p class="text-green-100 text-sm">يبدأ البث ويسجل</p>
                <div class="mt-4 text-xs text-green-200">
                    <i class="fas fa-check mr-1"></i>WebRTC<br/>
                    <i class="fas fa-check mr-1"></i>Canvas Recording<br/>
                    <i class="fas fa-check mr-1"></i>Chunk Upload
                </div>
            </a>

            <!-- Guest Card -->
            <a href="/test/guest" class="card bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl p-6 block text-center">
                <div class="text-6xl mb-4">🎮</div>
                <h2 class="text-2xl font-bold mb-2">الضيف</h2>
                <p class="text-blue-100 text-sm">ينضم للبث</p>
                <div class="mt-4 text-xs text-blue-200">
                    <i class="fas fa-check mr-1"></i>WebRTC Only<br/>
                    <i class="fas fa-check mr-1"></i>Simple Connection
                </div>
            </a>

            <!-- Viewer Card -->
            <a href="/test/viewer" class="card bg-gradient-to-br from-purple-600 to-purple-800 rounded-xl p-6 block text-center">
                <div class="text-6xl mb-4">👁️</div>
                <h2 class="text-2xl font-bold mb-2">المشاهد</h2>
                <p class="text-purple-100 text-sm">يشاهد البث/التسجيل</p>
                <div class="mt-4 text-xs text-purple-200">
                    <i class="fas fa-check mr-1"></i>Sequential Live<br/>
                    <i class="fas fa-check mr-1"></i>MSE VOD<br/>
                    <i class="fas fa-check mr-1"></i>Double Buffering
                </div>
            </a>
        </div>

        <!-- Features -->
        <div class="mt-12 bg-gray-800 rounded-xl p-6">
            <h3 class="text-xl font-bold mb-4 text-center">✨ المميزات</h3>
            <div class="grid md:grid-cols-2 gap-4 text-sm">
                <div>
                    <h4 class="font-bold text-green-400 mb-2">Live Streaming</h4>
                    <ul class="text-gray-400 space-y-1">
                        <li><i class="fas fa-caret-left mr-2"></i>Sequential MP4 playback</li>
                        <li><i class="fas fa-caret-left mr-2"></i>Adaptive polling</li>
                        <li><i class="fas fa-caret-left mr-2"></i>Smooth transitions</li>
                        <li><i class="fas fa-caret-left mr-2"></i>Low latency (5s chunks)</li>
                    </ul>
                </div>
                <div>
                    <h4 class="font-bold text-purple-400 mb-2">VOD Playback</h4>
                    <ul class="text-gray-400 space-y-1">
                        <li><i class="fas fa-caret-left mr-2"></i>MSE for seekable playback</li>
                        <li><i class="fas fa-caret-left mr-2"></i>Full video controls</li>
                        <li><i class="fas fa-caret-left mr-2"></i>No server-side merge</li>
                    </ul>
                </div>
            </div>
        </div>

        <!-- Footer -->
        <div class="mt-8 text-center text-sm text-gray-500">
            <p>Test Environment - Modular Architecture</p>
            <p class="mt-2">core.ts | host-page.ts | guest-page.ts | viewer-page.ts</p>
        </div>
    </div>
</body>
</html>
    `;
    return c.html(html);
});

export default testRoutes;
