/**
 * Test Guest Page Client Script - نسخة سليمة
 * صفحة الضيف - تستخدم الدوال المشتركة من shared_fixed.ts
 */

import type { Context } from 'hono';
import type { Bindings, Variables } from '../../../config/types';

const STREAM_SERVER_URL = 'https://stream.maelsh.pro';
const TEST_ROOM_ID = 'test_room_001';

export const testGuestPage = async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
    const html = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>اختبار البث - Guest</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <style>
        body { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); min-height: 100vh; }
        .video-container { background: #000; border-radius: 12px; overflow: hidden; }
        .log-entry { font-family: monospace; font-size: 12px; padding: 2px 0; }
        .log-info { color: #60a5fa; }
        .log-success { color: #34d399; }
        .log-error { color: #f87171; }
        .log-warn { color: #fbbf24; }
    </style>
</head>
<body class="text-white p-4">
    <div class="max-w-4xl mx-auto">
        <div class="text-center mb-6">
            <h1 class="text-3xl font-bold mb-2">👤 اختبار البث - Guest</h1>
            <p class="text-gray-400">الطرف الثاني - ينضم للبث</p>
            <div class="mt-3 flex items-center justify-center gap-2">
                <label class="text-sm text-gray-300">رقم المنافسة:</label>
                <input type="number" id="compIdInput" class="bg-gray-700 text-white px-3 py-2 rounded-lg w-40 text-center font-mono" placeholder="أدخل الرقم">
            </div>
        </div>
        
        <!-- Status -->
        <div id="status" class="bg-gray-800 rounded-lg p-4 mb-4 text-center">
            <span class="text-yellow-400"><i class="fas fa-circle-notch fa-spin mr-2"></i>أدخل رقم المنافسة ثم اضغط الانضمام</span>
        </div>
        
        <!-- Videos -->
        <div class="flex flex-col md:flex-row justify-center gap-4 mb-4" id="videosContainer">
            <!-- Local Video -->
            <div class="relative transition-all duration-300 w-full md:w-[48%]" id="localVideoWrapper">
                <div class="video-container aspect-video" id="localVideoContainer">
                    <video id="localVideo" autoplay muted playsinline class="w-full h-full object-cover"></video>
                </div>
            </div>
            <!-- Remote Video -->
            <div class="relative transition-all duration-300 w-full md:w-[48%]" id="remoteVideoWrapper">
                <div class="video-container aspect-video relative" id="remoteVideoContainer">
                    <video id="remoteVideo" autoplay playsinline class="w-full h-full object-cover"></video>
                    <!-- Fullscreen Button -->
                    <button onclick="window.toggleFullscreen()" id="fullscreenBtn" title="ملء الشاشة"
                        class="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 transition flex items-center justify-center">
                        <i class="fas fa-expand text-white text-sm" id="fullscreenIcon"></i>
                    </button>
                </div>
            </div>
        </div>
        
        <!-- Media Controls - أزرار الوسائط -->
        <div class="flex flex-wrap gap-3 justify-center mb-3">
            <!-- مشاركة الشاشة -->
            <div class="relative">
                <button onclick="window.toggleScreen()" id="screenBtn" title="مشاركة الشاشة" 
                    class="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-700 transition flex items-center justify-center">
                    <i class="fas fa-desktop text-white"></i>
                </button>
                <span id="screenUnavailable" class="hidden absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-red-400 whitespace-nowrap">غير متاح</span>
            </div>
            
            <!-- الكاميرا -->
            <button onclick="window.toggleCamera()" id="cameraBtn" title="تشغيل/إيقاف الكاميرا"
                class="w-10 h-10 rounded-full bg-purple-600 hover:bg-purple-700 transition flex items-center justify-center">
                <i class="fas fa-video text-white" id="cameraIcon"></i>
            </button>
            
            <!-- تبديل الكاميرا -->
            <button onclick="window.switchCamera()" id="switchCamBtn" title="تبديل أمامية/خلفية"
                class="w-10 h-10 rounded-full bg-indigo-600 hover:bg-indigo-700 transition flex items-center justify-center">
                <i class="fas fa-sync-alt text-white"></i>
            </button>
            
            <!-- الميكروفون -->
            <button onclick="window.toggleMic()" id="micBtn" title="تشغيل/إيقاف الميكروفون"
                class="w-10 h-10 rounded-full bg-green-600 hover:bg-green-700 transition flex items-center justify-center">
                <i class="fas fa-microphone text-white" id="micIcon"></i>
            </button>
            
            <!-- السماعة -->
            <button onclick="window.toggleSpeaker()" id="speakerBtn" title="تشغيل/إيقاف السماعة"
                class="w-10 h-10 rounded-full bg-teal-600 hover:bg-teal-700 transition flex items-center justify-center">
                <i class="fas fa-volume-up text-white" id="speakerIcon"></i>
            </button>
            
            <!-- إظهار/إخفاء الفيديو المحلي -->
            <button onclick="window.toggleLocalVideo()" id="hideLocalBtn" title="إظهار/إخفاء صورتك"
                class="w-10 h-10 rounded-full bg-gray-600 hover:bg-gray-700 transition flex items-center justify-center">
                <i class="fas fa-eye text-white" id="hideLocalIcon"></i>
            </button>
        </div>
        
        <!-- Connection Controls - أزرار الاتصال -->
        <div class="flex flex-wrap gap-3 justify-center mb-4">
            <!-- انضمام (يظهر قبل الاتصال) -->
            <button onclick="window.joinRoom()" id="joinBtn" title="الانضمام للمنافسة"
                class="w-12 h-12 rounded-full bg-green-600 hover:bg-green-700 transition flex items-center justify-center">
                <i class="fas fa-sign-in-alt text-white text-lg"></i>
            </button>
            
            <!-- تحديث (يظهر بعد الاتصال) -->
            <button onclick="window.reconnect()" id="reconnectBtn" title="تحديث الاتصال"
                class="w-12 h-12 rounded-full bg-yellow-600 hover:bg-yellow-700 transition flex items-center justify-center hidden">
                <i class="fas fa-sync text-white text-lg"></i>
            </button>
            
            <!-- إنهاء -->
            <button onclick="window.disconnect()" id="disconnectBtn" title="إنهاء الاتصال"
                class="w-12 h-12 rounded-full bg-red-600 hover:bg-red-700 transition flex items-center justify-center hidden">
                <i class="fas fa-phone-slash text-white text-lg"></i>
            </button>
        </div>
        
        <!-- Log -->
        <div class="bg-gray-900 rounded-lg p-4 max-h-64 overflow-y-auto" id="logContainer">
            <p class="text-gray-500 text-sm mb-2">📋 سجل الأحداث:</p>
            <div id="log"></div>
        </div>
        
        <!-- Links -->
        <div class="mt-4 text-center text-sm text-gray-500">
            <a href="/test" class="text-purple-400 hover:underline mx-2">← العودة</a>
            <a href="/test/host" class="text-purple-400 hover:underline mx-2">صفحة الـ Host</a>
            <a href="/test/viewer" class="text-purple-400 hover:underline mx-2">صفحة المشاهد</a>
        </div>
    </div>
    
    <script src="/static/app.js"></script>
    <script>
        // ===== تهيئة المتغيرات العالمية =====
        window.role = 'guest';
        window.roomId = '${TEST_ROOM_ID}';
        window.streamServerUrl = '${STREAM_SERVER_URL}';
        
        // قراءة رقم المنافسة من URL
        const urlParams = new URLSearchParams(window.location.search);
        const urlCompId = urlParams.get('comp');
        
        // ملء حقل الإدخال تلقائياً من URL
        if (urlCompId) {
            document.getElementById('compIdInput').value = urlCompId;
            updateStatus('المنافسة: ' + urlCompId + ' - شارك الشاشة ثم اضغط الانضمام', 'green');
        }
        
        // ===== Device Capabilities Detection =====
        function detectDeviceCapabilities() {
            const capabilities = {
                isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
                supportsScreenShare: !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia),
                supportsCamera: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
            };
            
            testLog('📱 قدرات الجهاز: Mobile=' + capabilities.isMobile + ', ScreenShare=' + capabilities.supportsScreenShare);
            return capabilities;
        }
        
        // ===== Join Room =====
        window.joinRoom = async function() {
            const ms = window.mediaState;
            testLog('🔘 window.joinRoom called', 'info');
            
            const compIdInput = document.getElementById('compIdInput');
            const competitionId = compIdInput.value.trim();
            
            if (!competitionId) {
                testLog('أدخل رقم المنافسة أولاً!', 'error');
                updateStatus('أدخل رقم المنافسة!', 'red');
                return;
            }
            
            if (!ms.localStream) {
                testLog('شارك الشاشة أولاً!', 'warn');
                updateStatus('شارك الشاشة أو الكاميرا أولاً!', 'yellow');
                return;
            }
            
            updateStatus('جاري الانضمام إلى المنافسة ' + competitionId + '...', 'yellow');
            
            // Join signaling room
            try {
                testLog('الانضمام إلى المنافسة: ' + competitionId);
                const actualRoom = 'comp_' + competitionId;
                const res = await fetch(window.streamServerUrl + '/api/signaling/room/join', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        room_id: actualRoom,
                        user_id: 999,
                        role: 'opponent'
                    })
                });
                const data = await res.json();
                testLog('النتيجة: ' + JSON.stringify(data), data.success ? 'success' : 'error');
                
                if (data.success) {
                    window.actualRoomId = actualRoom;
                }
            } catch (err) {
                testLog('خطأ: ' + err.message, 'error');
            }
            
            // Create peer connection
            ms.pc = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'turn:maelsh.pro:3000?transport=tcp', username: 'dueli', credential: 'dueli-turn-secret-2024' },
                    { urls: 'turn:maelsh.pro:3000', username: 'dueli', credential: 'dueli-turn-secret-2024' }
                ]
            });
            
            testLog('تم إنشاء RTCPeerConnection');
            
            // Add local tracks
            ms.localStream.getTracks().forEach(function(track) {
                ms.pc.addTrack(track, ms.localStream);
                testLog('تمت إضافة track: ' + track.kind);
            });
            
            // Handle remote stream
            ms.pc.ontrack = function(event) {
                testLog('📥 ontrack fired!', 'success');
                if (event.streams[0]) {
                    document.getElementById('remoteVideo').srcObject = event.streams[0];
                    testLog('Remote video loaded', 'success');
                    updateStatus('متصل ✓', 'green');
                }
            };
            
            // Handle ICE candidates
            ms.pc.onicecandidate = async function(event) {
                if (event.candidate) {
                    testLog('ICE Candidate: ' + event.candidate.candidate.substring(0, 50) + '...');
                    await window.sendSignal('ice', event.candidate);
                }
            };
            
            // Connection state
            ms.pc.onconnectionstatechange = function() {
                testLog('📡 Connection State: ' + ms.pc.connectionState, 
                    ms.pc.connectionState === 'connected' ? 'success' : 
                    ms.pc.connectionState === 'failed' ? 'error' : 'info');
                
                if (ms.pc.connectionState === 'connected') {
                    updateStatus('متصل ✓', 'green');
                    updateConnectionButtons(true);
                } else if (ms.pc.connectionState === 'failed') {
                    testLog('❌ فشل الاتصال', 'error');
                    updateStatus('فشل الاتصال - اضغط انضمام للمحاولة مجدداً', 'red');
                    updateConnectionButtons(false);
                    window.handleConnectionFailure();
                }
            };
            
            // ICE connection state
            ms.pc.oniceconnectionstatechange = function() {
                testLog('🧊 ICE Connection: ' + ms.pc.iceConnectionState);
                if (ms.pc.iceConnectionState === 'failed') {
                    testLog('⚠️ ICE فشل - محاولة إعادة التفاوض...', 'warn');
                    ms.pc.restartIce();
                }
            };
            
            // Start polling for offer
            testLog('انتظار Offer من الـ Host...');
            startPolling();
        };
        
        // ===== Start Polling =====
        function startPolling() {
            const ms = window.mediaState;
            ms.pollingInterval = setInterval(async function() {
                try {
                    const actualRoom = window.actualRoomId || window.roomId;
                    const res = await fetch(window.streamServerUrl + '/api/signaling/poll?room_id=' + actualRoom + '&role=opponent');
                    const data = await res.json();
                    
                    if (data.success && data.data && data.data.signals && data.data.signals.length > 0) {
                        for (const signal of data.data.signals) {
                            await handleSignal(signal);
                        }
                    }
                } catch (err) {
                    // Silent
                }
            }, 1000);
        }
        
        // ===== Handle Signal =====
        async function handleSignal(signal) {
            const ms = window.mediaState;
            testLog('إشارة واردة: ' + signal.type);
            
            if (signal.type === 'offer') {
                testLog('تم استقبال Offer!', 'success');
                await ms.pc.setRemoteDescription(new RTCSessionDescription(signal.data));
                
                // Create answer
                testLog('إنشاء Answer...');
                const answer = await ms.pc.createAnswer();
                await ms.pc.setLocalDescription(answer);
                await window.sendSignal('answer', answer);
                testLog('تم إرسال Answer', 'success');
                
            } else if (signal.type === 'ice') {
                await ms.pc.addIceCandidate(new RTCIceCandidate(signal.data));
            }
        }
        
        // ===== Reconnect - تحديث الاتصال بدون تحديث الصفحة =====
        window.reconnect = async function() {
            const ms = window.mediaState;
            testLog('🔄 تحديث الاتصال...', 'info');
            updateStatus('جاري تحديث الاتصال...', 'yellow');
            
            // إغلاق الـ peer connection
            if (ms.pc) {
                ms.pc.close();
                ms.pc = null;
            }
            
            // إيقاف الـ polling
            if (ms.pollingInterval) {
                clearInterval(ms.pollingInterval);
                ms.pollingInterval = null;
            }
            
            // مسح الفيديو البعيد
            document.getElementById('remoteVideo').srcObject = null;
            
            // إعادة الانضمام بعد ثانية
            testLog('⏳ انتظار ثانية ثم إعادة الانضمام...', 'info');
            setTimeout(function() {
                if (ms.localStream) {
                    window.joinRoom();
                } else {
                    updateStatus('شارك الشاشة أو الكاميرا أولاً', 'yellow');
                }
            }, 1000);
        };
        
        // ===== Init =====
        testLog('تم تحميل صفحة Guest');
        if (!urlCompId) {
            updateStatus('اضغط "مشاركة الشاشة" ثم "الانضمام"', 'blue');
        }
    </script>
</body>
</html>
    `;

    return c.html(html);
};
