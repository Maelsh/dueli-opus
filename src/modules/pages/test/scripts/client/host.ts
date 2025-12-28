/**
 * Test Host Page Client Script - نسخة سليمة
 * صفحة المضيف - تستخدم الدوال المشتركة من shared_fixed.ts
 */

import type { Context } from 'hono';
import type { Bindings, Variables } from '../../../config/types';

const STREAM_SERVER_URL = 'https://stream.maelsh.pro';
const TEST_ROOM_ID = 'test_room_001';
const FFMPEG_URL = 'https://maelsh.pro/ffmpeg';

export const testHostPage = async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
    const html = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>اختبار البث - Host</title>
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
            <h1 class="text-3xl font-bold mb-2">🎬 اختبار البث - Host</h1>
            <p class="text-gray-400">الطرف الأول - يبدأ البث ويشارك الشاشة</p>
            <p id="compIdDisplay" class="text-lg text-green-400 mt-2 font-mono">رقم المنافسة: جاري...</p>
        </div>
        
        <!-- Status -->
        <div id="status" class="bg-gray-800 rounded-lg p-4 mb-4 text-center">
            <span class="text-yellow-400"><i class="fas fa-circle-notch fa-spin mr-2"></i>جاري التهيئة...</span>
        </div>
        
        <!-- Latency Gauge & Quality Info -->
        <div class="flex justify-between items-center bg-gray-900 rounded-lg p-3 mb-4 text-sm">
            <div id="latencyGauge"><span class="text-gray-400">● انتظار...</span></div>
            <div id="qualityInfo" class="text-gray-400">الجودة: جاري التحديد...</div>
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
            <!-- اتصال (يظهر قبل الاتصال) -->
            <button onclick="window.connect()" id="connectBtn" title="بدء الاتصال"
                class="w-12 h-12 rounded-full bg-green-600 hover:bg-green-700 transition flex items-center justify-center">
                <i class="fas fa-plug text-white text-lg"></i>
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
            <a href="/test/guest" class="text-purple-400 hover:underline mx-2">صفحة الضيف</a>
            <a href="/test/viewer" class="text-purple-400 hover:underline mx-2">صفحة المشاهد</a>
        </div>
    </div>
    
    <script src="/static/app.js"></script>
    <script>
        // ===== تهيئة المتغيرات العالمية =====
        window.role = 'host';
        window.roomId = '${TEST_ROOM_ID}';
        window.streamServerUrl = '${STREAM_SERVER_URL}';
        window.ffmpegUrl = '${FFMPEG_URL}';
        
        // قراءة رقم المنافسة من URL أو إنشاء عشوائي
        const urlParams = new URLSearchParams(window.location.search);
        let competitionId = urlParams.get('comp') ? parseInt(urlParams.get('comp')) : Math.floor(Math.random() * 900000 + 100000);
        
        // تحديث URL إذا لم يكن موجوداً
        if (!urlParams.get('comp')) {
            history.replaceState(null, '', window.location.pathname + '?comp=' + competitionId);
        }
        
        // إظهار رقم المنافسة مع الروابط
        const baseUrl = window.location.origin;
        const guestLink = baseUrl + '/test/guest?comp=' + competitionId;
        const viewerLink = baseUrl + '/test/viewer?comp=' + competitionId;
        
        document.getElementById('compIdDisplay').innerHTML = 
            'رقم المنافسة: <strong>' + competitionId + '</strong><br>' +
            '<small class="text-gray-400">' +
            '👤 <a href="' + guestLink + '" class="text-blue-400 hover:underline" target="_blank">رابط المنافس</a> | ' +
            '👁️ <a href="' + viewerLink + '" class="text-purple-400 hover:underline" target="_blank">رابط المشاهدة</a>' +
            '</small>';
        
        testLog('تم تحميل صفحة Host - المنافسة: ' + competitionId);
        
        // Quality presets
        const qualityPresets = {
            excellent: { name: 'ممتاز', width: 1280, height: 360, fps: 30, segment: 4000, bitrate: 2000000 },
            good:      { name: 'جيد', width: 854,  height: 240, fps: 24, segment: 6000, bitrate: 1000000 },
            medium:    { name: 'متوسط', width: 640,  height: 180, fps: 15, segment: 10000, bitrate: 500000 },
            low:       { name: 'منخفض', width: 426,  height: 120, fps: 10, segment: 20000, bitrate: 250000 },
            minimal:   { name: 'أدنى', width: 320,  height: 90,  fps: 10, segment: 30000, bitrate: 150000 }
        };
        
        let currentQuality = qualityPresets.medium;
        let uploadQueue = [];
        let isUploading = false;
        let segmentInterval = null;
        let drawInterval = null;
        let droppedChunks = 0;
        let uploadStartTime = 0;
        let lastLatency = 0;
        let mediaRecorder = null;
        let chunkIndex = 0;
        
        // ===== Device Capabilities Detection =====
        function detectDeviceCapabilities() {
            const capabilities = {
                isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
                supportsScreenShare: !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia),
                supportsCamera: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
            };
            
            testLog('📱 قدرات الجهاز:', 'info');
            testLog('   - Mobile: ' + capabilities.isMobile, capabilities.isMobile ? 'warn' : 'info');
            testLog('   - Screen Share: ' + capabilities.supportsScreenShare, capabilities.supportsScreenShare ? 'success' : 'error');
            testLog('   - Camera: ' + capabilities.supportsCamera, capabilities.supportsCamera ? 'success' : 'error');
            
            return capabilities;
        }
        
        // ===== Create Room =====
        async function createRoom() {
            try {
                testLog('إنشاء غرفة الإشارات...');
                const res = await fetch(window.streamServerUrl + '/api/signaling/room/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        competition_id: competitionId.toString(),
                        user_id: 1
                    })
                });
                const data = await res.json();
                testLog('الغرفة: ' + JSON.stringify(data), data.success ? 'success' : 'error');
                
                if (data.success && data.data.room_id) {
                    window.actualRoomId = data.data.room_id;
                }
                return data.success;
            } catch (err) {
                testLog('خطأ في إنشاء الغرفة: ' + err.message, 'error');
                return false;
            }
        }
        
        // ===== Connect =====
        window.connect = async function() {
            const ms = window.mediaState;
            
            if (!ms.localStream) {
                testLog('شارك الشاشة أولاً!', 'warn');
                updateStatus('شارك الشاشة أولاً!', 'yellow');
                return;
            }
            
            updateStatus('جاري الاتصال...', 'yellow');
            
            // Create room first
            await createRoom();
            
            // Create peer connection
            ms.pc = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    {
                        urls: 'turn:maelsh.pro:3000?transport=tcp',
                        username: 'dueli',
                        credential: 'dueli-turn-secret-2024'
                    },
                    {
                        urls: 'turn:maelsh.pro:3000',
                        username: 'dueli',
                        credential: 'dueli-turn-secret-2024'
                    }
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
                testLog('📥 ontrack fired: ' + event.track.kind, 'success');
                
                // إضافة المسار للوعاء الثابت
                if (!ms.remoteStream) {
                    ms.remoteStream = new MediaStream();
                }
                if (!ms.remoteStream.getTracks().find(function(t) { return t.id === event.track.id; })) {
                    ms.remoteStream.addTrack(event.track);
                }
                
                document.getElementById('remoteVideo').srcObject = ms.remoteStream;
                
                if (event.track.kind === 'audio') {
                    testLog('🎤 صوت الضيف وصل!', 'success');
                    updateStatus('متصل ✓ (صوت + فيديو)', 'green');
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
                    updateStatus('متصل ✓ - جاري التسجيل', 'green');
                    updateConnectionButtons(true);
                    startRecording();
                } else if (ms.pc.connectionState === 'failed') {
                    testLog('❌ فشل الاتصال', 'error');
                    updateStatus('فشل الاتصال - اضغط اتصال للمحاولة مجدداً', 'red');
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
            
            // Create offer
            testLog('إنشاء Offer...');
            const offer = await ms.pc.createOffer();
            await ms.pc.setLocalDescription(offer);
            testLog('تم إرسال Offer');
            await window.sendSignal('offer', offer);
            
            // Start polling for answer
            startPolling();
        };
        
        // ===== Start Polling =====
        function startPolling() {
            const ms = window.mediaState;
            ms.pollingInterval = setInterval(async function() {
                try {
                    const actualRoom = window.actualRoomId || window.roomId;
                    const res = await fetch(window.streamServerUrl + '/api/signaling/poll?room_id=' + actualRoom + '&role=host');
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
            
            if (signal.type === 'answer') {
                testLog('تم استقبال Answer!', 'success');
                await ms.pc.setRemoteDescription(new RTCSessionDescription(signal.data));
            } else if (signal.type === 'ice') {
                await ms.pc.addIceCandidate(new RTCIceCandidate(signal.data));
            }
        }
        
        // ===== Device Probing =====
        async function probeDevice() {
            testLog('🔍 اختبار قدرات الجهاز...');
            const results = { cpuScore: 0, canvasFps: 0, networkSpeed: 0 };
            
            // 1. اختبار CPU
            const cpuStart = performance.now();
            let iterations = 0;
            while (performance.now() - cpuStart < 500) {
                Math.random() * Math.random();
                iterations++;
            }
            results.cpuScore = Math.round(iterations / 10000);
            testLog('CPU Score: ' + results.cpuScore);
            
            // 2. اختبار Canvas FPS
            const testCanvas = document.createElement('canvas');
            testCanvas.width = 640;
            testCanvas.height = 360;
            const testCtx = testCanvas.getContext('2d');
            
            let frames = 0;
            const fpsStart = performance.now();
            while (performance.now() - fpsStart < 1000) {
                testCtx.fillStyle = 'rgb(' + Math.random()*255 + ',' + Math.random()*255 + ',' + Math.random()*255 + ')';
                testCtx.fillRect(0, 0, 640, 360);
                frames++;
            }
            results.canvasFps = frames;
            testLog('Canvas FPS: ' + results.canvasFps);
            
            // 3. اختبار الشبكة
            try {
                const testBlob = new Blob([new Uint8Array(50000)]);
                const uploadStart = performance.now();
                await fetch(window.ffmpegUrl + '/upload.php', {
                    method: 'POST',
                    body: (function() {
                        const fd = new FormData();
                        fd.append('chunk', testBlob, 'speedtest.bin');
                        fd.append('competition_id', 'speedtest');
                        fd.append('chunk_number', '0');
                        fd.append('extension', 'bin');
                        return fd;
                    })()
                });
                const uploadTime = performance.now() - uploadStart;
                results.networkSpeed = Math.round(50000 / (uploadTime / 1000));
                testLog('Network: ' + Math.round(results.networkSpeed / 1024) + ' KB/s');
            } catch (e) {
                results.networkSpeed = 50000;
            }
            
            return results;
        }
        
        // ===== Quality Selection =====
        function selectQuality(probe) {
            if (probe.cpuScore > 80 && probe.canvasFps > 100 && probe.networkSpeed > 200000) {
                return qualityPresets.excellent;
            } else if (probe.cpuScore > 50 && probe.canvasFps > 60 && probe.networkSpeed > 100000) {
                return qualityPresets.good;
            } else if (probe.cpuScore > 30 && probe.canvasFps > 30 && probe.networkSpeed > 50000) {
                return qualityPresets.medium;
            } else if (probe.cpuScore > 15) {
                return qualityPresets.low;
            } else {
                return qualityPresets.minimal;
            }
        }
        
        // ===== Update Quality Info =====
        function updateQualityInfo() {
            const info = document.getElementById('qualityInfo');
            if (info) {
                info.innerHTML = 'الجودة: <span class="text-blue-400">' + currentQuality.name + '</span> (' + 
                    (currentQuality.width * 2) + 'x' + (currentQuality.height * 2) + ' @ ' + currentQuality.fps + 'fps)';
            }
        }
        
        // ===== Downgrade Quality =====
        function downgradeQuality() {
            const levels = Object.keys(qualityPresets);
            const currentIndex = levels.indexOf(Object.keys(qualityPresets).find(function(k) { return qualityPresets[k] === currentQuality; }));
            
            if (currentIndex < levels.length - 1) {
                currentQuality = qualityPresets[levels[currentIndex + 1]];
                testLog('📉 الجودة الجديدة: ' + currentQuality.name + ' (' + (currentQuality.width*2) + 'x' + (currentQuality.height*2) + ')', 'warn');
                updateQualityInfo();
            }
        }
        
        // ===== Update Latency Gauge =====
        function updateLatencyGauge(latency) {
            const gauge = document.getElementById('latencyGauge');
            if (!gauge) return;
            
            let color = 'green';
            let status = 'ممتاز';
            
            if (latency > 15000) {
                color = 'red';
                status = 'سيء';
            } else if (latency > 5000) {
                color = 'yellow';
                status = 'متوسط';
            }
            
            gauge.innerHTML = '<span class="text-' + color + '-400">● ' + status + ' (' + Math.round(latency/1000) + 's)</span>';
        }
        
        // ===== Start Recording =====
        async function startRecording() {
            const ms = window.mediaState;
            
            if (!ms.localStream || mediaRecorder) return;
            
            testLog('🔍 جاري اختبار قدرات الجهاز...');
            updateStatus('جاري اختبار الجهاز...', 'yellow');
            
            const probeResults = await probeDevice();
            currentQuality = selectQuality(probeResults);
            updateQualityInfo();
            
            testLog('✅ الجودة المختارة: ' + currentQuality.name + ' (' + (currentQuality.width*2) + 'x' + (currentQuality.height*2) + ')');
            updateStatus('البث جاري...', 'green');
            
            testLog('بدء التسجيل (المنافسة: ' + competitionId + ')');
            
            const CANVAS_WIDTH = 1280;
            const CANVAS_HEIGHT = 720;
            const canvas = document.createElement('canvas');
            canvas.width = CANVAS_WIDTH;
            canvas.height = CANVAS_HEIGHT;
            const ctx = canvas.getContext('2d');
            
            // تحميل شعار Dueli
            const dueliLogo = new Image();
            dueliLogo.crossOrigin = 'anonymous';
            dueliLogo.src = '/static/dueli-icon.png';
            
            const localVideo = document.getElementById('localVideo');
            const remoteVideo = document.getElementById('remoteVideo');
            
            // دالة رسم proportional
            function drawVideoProportionalLocal(video, x, y, maxWidth, maxHeight) {
                if (!video || video.readyState < 2 || video.videoWidth === 0) return;
                
                const videoRatio = video.videoWidth / video.videoHeight;
                const targetRatio = maxWidth / maxHeight;
                let drawW, drawH;
                
                if (videoRatio > targetRatio) {
                    drawW = maxWidth;
                    drawH = maxWidth / videoRatio;
                } else {
                    drawH = maxHeight;
                    drawW = maxHeight * videoRatio;
                }
                
                const offsetX = x + (maxWidth - drawW) / 2;
                const offsetY = y + (maxHeight - drawH) / 2;
                
                ctx.fillStyle = '#000';
                ctx.fillRect(x, y, maxWidth, maxHeight);
                ctx.drawImage(video, offsetX, offsetY, drawW, drawH);
                
                // إطار بألوان Dueli
                const borderGradient = ctx.createLinearGradient(x, y, x + maxWidth, y + maxHeight);
                borderGradient.addColorStop(0, '#9333ea');
                borderGradient.addColorStop(1, '#f59e0b');
                ctx.strokeStyle = borderGradient;
                ctx.lineWidth = 3;
                ctx.strokeRect(x, y, maxWidth, maxHeight);
            }
            
            function drawFrame() {
                const gradient = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                gradient.addColorStop(0, '#1a1a2e');
                gradient.addColorStop(1, '#16213e');
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                
                // Dueli Logo + Text
                const logoSize = 40;
                const logoX = (CANVAS_WIDTH / 2) - 70;
                const logoY = 10;
                
                if (dueliLogo.complete && dueliLogo.naturalWidth > 0) {
                    ctx.drawImage(dueliLogo, logoX, logoY, logoSize, logoSize);
                }
                
                const logoGradient = ctx.createLinearGradient(logoX + logoSize, 0, logoX + logoSize + 100, 0);
                logoGradient.addColorStop(0, '#9333ea');
                logoGradient.addColorStop(1, '#f59e0b');
                ctx.fillStyle = logoGradient;
                ctx.font = 'bold 32px Arial';
                ctx.textAlign = 'left';
                ctx.fillText('Dueli', logoX + logoSize + 10, logoY + 32);
                
                const margin = 40;
                const videoAreaWidth = (CANVAS_WIDTH / 2) - (margin * 1.5);
                const videoAreaHeight = CANVAS_HEIGHT - (margin * 2);
                
                drawVideoProportionalLocal(localVideo, margin, margin + 20, videoAreaWidth, videoAreaHeight - 20);
                drawVideoProportionalLocal(remoteVideo, (CANVAS_WIDTH / 2) + (margin / 2), margin + 20, videoAreaWidth, videoAreaHeight - 20);
            }
            
            const frameInterval = Math.round(1000 / currentQuality.fps);
            drawInterval = setInterval(drawFrame, frameInterval);
            
            const canvasStream = canvas.captureStream(currentQuality.fps);
            
            // دمج الصوت
            try {
                const audioContext = new AudioContext();
                const destination = audioContext.createMediaStreamDestination();
                
                if (ms.localStream.getAudioTracks().length > 0) {
                    const localSource = audioContext.createMediaStreamSource(ms.localStream);
                    localSource.connect(destination);
                }
                
                if (ms.remoteStream && ms.remoteStream.getAudioTracks().length > 0) {
                    const remoteSource = audioContext.createMediaStreamSource(ms.remoteStream);
                    remoteSource.connect(destination);
                }
                
                const mixedAudioTrack = destination.stream.getAudioTracks()[0];
                if (mixedAudioTrack) {
                    canvasStream.addTrack(mixedAudioTrack);
                }
                
                window.recordingAudioContext = audioContext;
            } catch (audioErr) {
                ms.localStream.getAudioTracks().forEach(function(track) {
                    canvasStream.addTrack(track);
                });
            }
            
            mediaRecorder = new MediaRecorder(canvasStream, {
                mimeType: 'video/webm;codecs=vp8,opus',
                videoBitsPerSecond: currentQuality.bitrate,
                audioBitsPerSecond: 128000
            });
            
            mediaRecorder.ondataavailable = function(e) {
                if (e.data.size > 0) {
                    uploadQueue.push({ blob: e.data, index: chunkIndex });
                    chunkIndex++;
                    processUploadQueue();
                }
            };
            
            mediaRecorder.start();
            
            segmentInterval = setInterval(function() {
                if (mediaRecorder && mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                    mediaRecorder.start();
                    testLog('قطعة جديدة (' + currentQuality.segment/1000 + 's)', 'info');
                }
            }, currentQuality.segment);
            
            testLog('التسجيل بدأ ✅', 'success');
        }
        
        // ===== Process Upload Queue =====
        async function processUploadQueue() {
            if (isUploading || uploadQueue.length === 0) return;
            
            while (uploadQueue.length > 3) {
                uploadQueue.shift();
                droppedChunks++;
                testLog('⚠️ إسقاط قطعة (تراكم) - مجموع: ' + droppedChunks, 'warn');
                downgradeQuality();
            }
            
            isUploading = true;
            const { blob, index } = uploadQueue.shift();
            
            const formData = new FormData();
            formData.append('chunk', blob, 'chunk_' + String(index).padStart(4, '0') + '.webm');
            formData.append('competition_id', competitionId.toString());
            formData.append('chunk_number', (index + 1).toString());
            formData.append('extension', 'webm');
            
            uploadStartTime = performance.now();
            
            try {
                const res = await fetch(window.ffmpegUrl + '/upload.php', {
                    method: 'POST',
                    body: formData
                });
                const result = await res.json();
                
                lastLatency = performance.now() - uploadStartTime;
                updateLatencyGauge(lastLatency);
                
                if (lastLatency > currentQuality.segment / 2) {
                    testLog('⚠️ رفع بطيء (' + Math.round(lastLatency) + 'ms) - تخفيض الجودة', 'warn');
                    downgradeQuality();
                }
                
                testLog('قطعة ' + index + ': ' + (result.success ? '✓' : '✗') + ' (' + Math.round(lastLatency) + 'ms)', result.success ? 'success' : 'error');
            } catch (err) {
                testLog('خطأ في رفع القطعة: ' + err.message, 'error');
            }
            
            isUploading = false;
            processUploadQueue();
        }
        
        // ===== Reconnect - تحديث الاتصال بدون تحديث الصفحة =====
        window.reconnect = async function() {
            const ms = window.mediaState;
            testLog('🔄 تحديث الاتصال...', 'info');
            updateStatus('جاري تحديث الاتصال...', 'yellow');
            
            // إيقاف التسجيل
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
            }
            mediaRecorder = null;
            
            if (drawInterval) {
                clearInterval(drawInterval);
                drawInterval = null;
            }
            
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
            
            // إعادة تهيئة remoteStream
            ms.remoteStream = new MediaStream();
            document.getElementById('remoteVideo').srcObject = null;
            
            // إعادة الاتصال بعد ثانية
            testLog('⏳ انتظار ثانية ثم إعادة الاتصال...', 'info');
            setTimeout(function() {
                if (ms.localStream) {
                    window.connect();
                } else {
                    updateStatus('شارك الشاشة أو الكاميرا أولاً', 'yellow');
                }
            }, 1000);
        };
        
        // ===== Init =====
        testLog('تم تحميل صفحة Host');
        
        const initialCaps = detectDeviceCapabilities();
        if (initialCaps.isMobile || !initialCaps.supportsScreenShare) {
            testLog('🔍 جهاز موبايل مكتشف - عرض خيارات الكاميرا تلقائياً', 'info');
            updateStatus('📱 استخدم الكاميرا للبث', 'blue');
        } else {
            updateStatus('اضغط "مشاركة الشاشة" للبدء', 'blue');
        }
    </script>
</body>
</html>
    `;

    return c.html(html);
};
