/**
 * Test Pages Router
 * المدخل الرئيسي لصفحات الاختبار
 */

import { Hono } from 'hono';
import { testHostPage } from './host-page';
import { testGuestPage } from './guest-page';
import { testViewerPage } from './viewer-page';

const testRoutes = new Hono();

// Landing page
testRoutes.get('/', async (c) => {
    return c.html(`
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
    </style>
</head>
<body class="text-white">
    <div class="max-w-4xl mx-auto p-8">
        <h1 class="text-4xl font-bold text-center mb-4">🧪 Test Stream Pages</h1>
        <p class="text-center text-gray-400 mb-8">اختبار البث - WebRTC + Canvas + Upload</p>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <!-- Host -->
            <a href="/test/host" class="bg-gradient-to-br from-blue-600 to-blue-800 p-6 rounded-xl hover:scale-105 transition transform">
                <div class="text-4xl mb-3">🎬</div>
                <h2 class="text-2xl font-bold mb-2">Host</h2>
                <p class="text-sm text-blue-200">يبدأ البث ويشارك الشاشة</p>
                <ul class="text-xs mt-3 text-blue-100 space-y-1">
                    <li>✓ Screen share</li>
                    <li>✓ WebRTC</li>
                    <li>✓ Canvas recording</li>
                    <li>✓ Upload chunks</li>
                </ul>
            </a>
            
            <!-- Guest -->
            <a href="/test/guest" class="bg-gradient-to-br from-green-600 to-green-800 p-6 rounded-xl hover:scale-105 transition transform">
                <div class="text-4xl mb-3">👤</div>
                <h2 class="text-2xl font-bold mb-2">Guest</h2>
                <p class="text-sm text-green-200">ينضم للبث كمنافس</p>
                <ul class="text-xs mt-3 text-green-100 space-y-1">
                    <li>✓ Screen share</li>
                    <li>✓ WebRTC answer</li>
                    <li>✓ P2P connection</li>
                </ul>
            </a>
            
            <!-- Viewer -->
            <a href="/test/viewer" class="bg-gradient-to-br from-purple-600 to-purple-800 p-6 rounded-xl hover:scale-105 transition transform">
                <div class="text-4xl mb-3">👁️</div>
                <h2 class="text-2xl font-bold mb-2">Viewer</h2>
                <p class="text-sm text-purple-200">يشاهد البث (مباشר أو مسجل)</p>
                <ul class="text-xs mt-3 text-purple-100 space-y-1">
                    <li>✓ Live Sequential</li>
                    <li>✓ MSE VOD</li>
                    <li>✓ Double buffering</li>
                    <li>✓ Adaptive polling</li>
                </ul>
            </a>
        </div>
        
        <div class="mt-8 p-4 bg-gray-800 rounded-lg">
            <h3 class="font-bold mb-2 text-yellow-400"><i class="fas fa-info-circle mr-2"></i>ملاحظات:</h3>
            <ul class="text-sm space-y-1 text-gray-300">
                <li>• الصفحات الثلاث تستخدم <code class="bg-gray-700 px-1 rounded">core.ts</code> المشترك</li>
                <li>• Host: يسجل Canvas (local + remote) ويرفع chunks</li>
                <li>• Guest: يشارك شاشته ويجيب على Offer من Host</li>
                <li>• Viewer: مشغل ذكي مع State Machine + Adaptive polling</li>
            </ul>
        </div>
        
        <div class="text-center mt-6">
            <a href="/" class="text-blue-400 hover:underline"><i class="fas fa-home mr-1"></i>العودة للصفحة الرئيسية</a>
        </div>
    </div>
</body>
</html>
    `);
});

// Routes
testRoutes.get('/host', testHostPage);
testRoutes.get('/guest', testGuestPage);
testRoutes.get('/viewer', testViewerPage);

export default testRoutes;
