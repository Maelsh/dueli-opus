/**
 * Test Host Page  
 * صفحة المضيف - مُستخرجة من test-stream-page.ts
 */

import type { Context } from 'hono';
import type { Bindings, Variables } from '../../../config/types';

const streamServerUrl = 'https://stream.maelsh.pro';
const testRoomId = 'test_room_001';

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
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
                <p class="text-sm text-gray-400 mb-2">📹 شاشتك (Local)</p>
                <div class="video-container aspect-video">
                    <video id="localVideo" autoplay muted playsinline class="w-full h-full object-cover"></video>
                </div>
            </div>
            <div>
                <p class="text-sm text-gray-400 mb-2">👤 الطرف الآخر (Remote)</p>
                <div class="video-container aspect-video">
                    <video id="remoteVideo" autoplay playsinline class="w-full h-full object-cover"></video>
                </div>
            </div>
        </div>
        
        <!-- Controls -->
        <div class="flex flex-wrap gap-2 justify-center mb-4">
            <button onclick="window.shareScreen()" id="shareBtn" class="px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition">
                <i class="fas fa-desktop mr-2"></i>مشاركة الشاشة
            </button>
            <button onclick="window.connect()" id="connectBtn" class="px-4 py-2 bg-green-600 rounded-lg hover:bg-green-700 transition">
                <i class="fas fa-plug mr-2"></i>اتصال
            </button>
            <button onclick="window.disconnect()" id="disconnectBtn" class="px-4 py-2 bg-red-600 rounded-lg hover:bg-red-700 transition">
                <i class="fas fa-stop mr-2"></i>إنهاء
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
        // استيراد الدوال من core.ts عبر window (تصحيح الأسماء)
        const { testLog: log, updateStatus, UploadQueue, drawVideoProportional } = window;
        
        const roomId = '${testRoomId}';
        const role = 'host';
        const streamServerUrl = '${streamServerUrl}';
        
        // Global state (من الأصلي - السطر 101-108)
        let pc = null;
        let localStream = null;
        let remoteStream = new MediaStream(); // ✅ وعاء ثابت لاستقبال المسارات
        let pollingInterval = null;
        let mediaRecorder = null;
        let chunkIndex = 0;
        let canvasStream = null;
        
        // قراءة رقم المنافسة من URL أو إنشاء عشوائي (السطر 110-116)
        const urlParams = new URLSearchParams(window.location.search);
        let competitionId = urlParams.get('comp') ? parseInt(urlParams.get('comp')) : Math.floor(Math.random() * 900000 + 100000);
        
        // تحديث URL إذا لم يكن موجوداً
        if (!urlParams.get('comp')) {
            history.replaceState(null, '', window.location.pathname + '?comp=' + competitionId);
        }
        
        const ffmpegUrl = 'https://maelsh.pro/ffmpeg';
        
        // إظهار رقم المنافسة مع الروابط (السطر 138-147)
        const baseUrl = window.location.origin;
        const guestLink = baseUrl + '/test/guest?comp=' + competitionId;
        const viewerLink = baseUrl + '/test/viewer?comp=' + competitionId;
        
        document.getElementById('compIdDisplay').innerHTML = 
            'رقم المنافسة: <strong>' + competitionId + '</strong><br>' +
            '<small class="text-gray-400">' +
            '👤 <a href="' + guestLink + '" class="text-blue-400 hover:underline" target="_blank">رابط المنافس</a> | ' +
            '👁️ <a href="' + viewerLink + '" class="text-purple-400 hover:underline" target="_blank">رابط المشاهدة</a>' +
            '</small>';
        
        log('تم تحميل صفحة Host - المنافسة: ' + competitionId);
        log('رابط المنافس: ' + guestLink);
        log('رابط المشاهدة: ' + viewerLink);
        
        // Quality presets (من الأصلي - السطر 322-328)
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
        let probeResults = null;
        
        // ===== Device Capabilities Detection =====
        function detectDeviceCapabilities() {
            const capabilities = {
                isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
                supportsScreenShare: !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia),
                supportsCamera: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
            };
            
            log('📱 قدرات الجهاز:', 'info');
            log('   - Mobile: ' + capabilities.isMobile, capabilities.isMobile ? 'warn' : 'info');
            log('   - Screen Share: ' + capabilities.supportsScreenShare, capabilities.supportsScreenShare ? 'success' : 'error');
            log('   - Camera: ' + capabilities.supportsCamera, capabilities.supportsCamera ? 'success' : 'error');
            
            return capabilities;
        }
        
        // ===== Share Screen مع دعم الموبايل =====
        window.shareScreen = async function() {
            const caps = detectDeviceCapabilities();
            
            // على الموبايل أو إذا كانت مشاركة الشاشة غير مدعومة
            if (caps.isMobile || !caps.supportsScreenShare) {
                log('⚠️ مشاركة الشاشة غير متاحة - عرض خيارات الكاميرا', 'warn');
                showMobileAlternative();
                return;
            }
            
            try {
                log('طلب مشاركة الشاشة...');
                localStream = await navigator.mediaDevices.getDisplayMedia({
                    video: { cursor: 'always' },
                    audio: true
                });
                
                log('Stream ID: ' + localStream.id);
                log('Video tracks: ' + localStream.getVideoTracks().length);
                log('Audio tracks: ' + localStream.getAudioTracks().length);
                
                const videoElement = document.getElementById('localVideo');
                videoElement.srcObject = localStream;
                
                videoElement.onloadedmetadata = () => {
                    log('Video loaded: ' + videoElement.videoWidth + 'x' + videoElement.videoHeight);
                };
                
                log('تم الحصول على الشاشة ✓', 'success');
                updateStatus('الشاشة جاهزة - اضغط اتصال', 'green');
                
                localStream.getVideoTracks()[0].onended = () => {
                    log('تم إيقاف مشاركة الشاشة', 'warn');
                    disconnect();
                };
            } catch (err) {
                log('⚠️ مشاركة الشاشة فشلت: ' + err.message, 'warn');
                log('📹 عرض خيارات الكاميرا البديلة...', 'info');
                showMobileAlternative();
            }
        }
        
        // ===== عرض خيار الموبايل البديل =====
        function showMobileAlternative() {
            log('📱 تفعيل وضع الموبايل (كاميرا)', 'info');
            updateStatus('استخدم الكاميرا للبث 📹', 'yellow');
            
            let cameraBtns = document.getElementById('cameraButtons');
            if (!cameraBtns) {
                log('إنشاء أزرار الكاميرا...', 'info');
                cameraBtns = document.createElement('div');
                cameraBtns.id = 'cameraButtons';
                cameraBtns.className = 'flex flex-wrap gap-2 justify-center mb-4';
                cameraBtns.style.display = 'flex'; // ✅ Force display
                
                // Create front camera button
                const frontBtn = document.createElement('button');
                frontBtn.className = 'px-4 py-2 bg-green-600 rounded-lg hover:bg-green-700 transition';
                frontBtn.innerHTML = '<i class="fas fa-camera mr-2"></i>الكاميرا الأمامية';
                frontBtn.onclick = () => window.useCamera('user');
                
                // Create back camera button
                const backBtn = document.createElement('button');
                backBtn.className = 'px-4 py-2 bg-purple-600 rounded-lg hover:bg-purple-700 transition';
                backBtn.innerHTML = '<i class="fas fa-camera-retro mr-2"></i>الكاميرا الخلفية';
                backBtn.onclick = () => window.useCamera('environment');
                
                cameraBtns.appendChild(frontBtn);
                cameraBtns.appendChild(backBtn);
                
                const controlsDiv = document.querySelector('.flex.flex-wrap.gap-2.justify-center.mb-4');
                if (controlsDiv && controlsDiv.parentElement) {
                    controlsDiv.parentElement.insertBefore(cameraBtns, controlsDiv);
                    log('✅ أزرار الكاميرا تم إضافتها', 'success');
                } else {
                    log('❌ لم يتم العثور على مكان لإضافة الأزرار', 'error');
                }
            } else {
                cameraBtns.style.display = 'flex';
                log('✅ أزرار الكاميرا معروضة', 'success');
            }
        }
        
        // ===== استخدام الكاميرا كبديل =====
        window.useCamera = async function(facingMode) {
            try {
                log('طلب الوصول للكاميرا ' + (facingMode === 'user' ? 'الأمامية' : 'الخلفية') + '...');
                
                // حفظ الـ stream القديم
                const oldStream = localStream;
                
                // الحصول على stream جديد
                const newStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: facingMode,
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    },
                    audio: true
                });
                
                log('Camera stream ID: ' + newStream.id);
                
                // ✅ إذا كان الاتصال قائماً - استبدال الـ tracks
                if (pc && pc.connectionState === 'connected') {
                    log('🔄 استبدال المسارات في الاتصال القائم...');
                    
                    const senders = pc.getSenders();
                    
                    // استبدال video track
                    const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                    const newVideoTrack = newStream.getVideoTracks()[0];
                    if (videoSender && newVideoTrack) {
                        await videoSender.replaceTrack(newVideoTrack);
                        log('   ✅ تم استبدال video track', 'success');
                    }
                    
                    // استبدال audio track
                    const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
                    const newAudioTrack = newStream.getAudioTracks()[0];
                    if (audioSender && newAudioTrack) {
                        await audioSender.replaceTrack(newAudioTrack);
                        log('   ✅ تم استبدال audio track', 'success');
                    }
                }
                
                // إيقاف الـ stream القديم
                if (oldStream) {
                    oldStream.getTracks().forEach(t => t.stop());
                }
                
                // تحديث المتغير والعرض
                localStream = newStream;
                const videoElement = document.getElementById('localVideo');
                videoElement.srcObject = localStream;
                
                const cameraBtns = document.getElementById('cameraButtons');
                if (cameraBtns) {
                    cameraBtns.style.display = 'none';
                }
                
                log('تم الحصول على الكاميرا ✓', 'success');
                updateStatus('الكاميرا جاهزة - اضغط اتصال', 'green');
                
            } catch (err) {
                log('فشل الوصول للكاميرا: ' + err.message, 'error');
                
                if (err.name === 'NotAllowedError') {
                    updateStatus('الرجاء السماح بالوصول للكاميرا من إعدادات المتصفح', 'red');
                } else if (err.name === 'NotFoundError') {
                    updateStatus('لا توجد كاميرا متاحة', 'red');
                } else {
                    updateStatus('خطأ في الكاميرا', 'red');
                }
            }
        }
        
        // ===== Create signaling room (من الأصلي - السطر 187-210) =====
        async function createRoom() {
            try {
                log('إنشاء غرفة الإشارات...');
                const res = await fetch(streamServerUrl + '/api/signaling/room/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        competition_id: competitionId.toString(),
                        user_id: 1
                    })
                });
                const data = await res.json();
                log('الغرفة: ' + JSON.stringify(data), data.success ? 'success' : 'error');
                
                // استخدم room_id الذي أرجعه السيرفر
                if (data.success && data.data.room_id) {
                    window.actualRoomId = data.data.room_id; // حفظ المعرف الحقيقي
                }
                return data.success;
            } catch (err) {
                log('خطأ في إنشاء الغرفة: ' + err.message, 'error');
                return false;
            }
        }
        
        // ===== Connect (من الأصلي - السطر 213-319) =====
        window.connect = async function() {
            if (!localStream) {
                log('شارك الشاشة أولاً!', 'warn');
                return;
            }
            
            updateStatus('جاري الاتصال...', 'yellow');
            
            // Create room first
            await createRoom();
            
            // Create peer connection
            pc = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    // Dueli TURN server
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
            
            log('تم إنشاء RTCPeerConnection');
            
            // Add local tracks
            localStream.getTracks().forEach(track => {
                pc.addTrack(track, localStream);
                log('تمت إضافة track: ' + track.kind);
            });
            
            // Handle remote stream - إضافة المسارات للوعاء الثابت
            pc.ontrack = (event) => {
                log('📥 ontrack fired: ' + event.track.kind, 'success');
                
                // ✅ إضافة المسار للوعاء الثابت بدلاً من استبداله
                if (!remoteStream.getTracks().find(t => t.id === event.track.id)) {
                    remoteStream.addTrack(event.track);
                    log('   ✅ تمت إضافة ' + event.track.kind + ' track للوعاء', 'success');
                }
                
                // تحديث عدد المسارات
                log('   - إجمالي المسارات في remoteStream: ' + remoteStream.getTracks().length);
                log('   - Video tracks: ' + remoteStream.getVideoTracks().length);
                log('   - Audio tracks: ' + remoteStream.getAudioTracks().length);
                
                // ربط الفيديو بالعنصر
                const remoteVideo = document.getElementById('remoteVideo');
                if (remoteVideo.srcObject !== remoteStream) {
                    remoteVideo.srcObject = remoteStream;
                }
                
                remoteVideo.onloadedmetadata = () => {
                    log('   ✅ Remote video loaded: ' + remoteVideo.videoWidth + 'x' + remoteVideo.videoHeight, 'success');
                };
                
                // تحديث الحالة عند وصول الصوت
                if (event.track.kind === 'audio') {
                    log('🎤 صوت الضيف وصل!', 'success');
                    updateStatus('متصل ✓ (صوت + فيديو)', 'green');
                }
            };
            
            // Handle ICE candidates
            pc.onicecandidate = async (event) => {
                if (event.candidate) {
                    log('ICE Candidate: ' + event.candidate.candidate.substring(0, 50) + '...');
                    await sendSignal('ice', event.candidate);
                }
            };
            
            // Connection state
            pc.onconnectionstatechange = () => {
                log('📡 Connection State: ' + pc.connectionState, 
                    pc.connectionState === 'connected' ? 'success' : 
                    pc.connectionState === 'failed' ? 'error' : 'info');
                
                if (pc.connectionState === 'connected') {
                    updateStatus('متصل ✓ - جاري التسجيل', 'green');
                    startRecording();
                } else if (pc.connectionState === 'disconnected') {
                    log('⚠️ الاتصال انقطع مؤقتاً...', 'warn');
                    updateStatus('انقطع الاتصال - جاري المحاولة...', 'yellow');
                } else if (pc.connectionState === 'failed') {
                    log('❌ فشل الاتصال', 'error');
                    updateStatus('فشل الاتصال - اضغط اتصال للمحاولة مجدداً', 'red');
                    handleConnectionFailure();
                }
            };
            
            // ICE connection state
            pc.oniceconnectionstatechange = () => {
                log('🧊 ICE Connection: ' + pc.iceConnectionState, 
                    pc.iceConnectionState === 'connected' ? 'success' : 
                    pc.iceConnectionState === 'failed' ? 'error' : 'info');
                
                if (pc.iceConnectionState === 'failed') {
                    log('⚠️ ICE فشل - محاولة إعادة التفاوض...', 'warn');
                    pc.restartIce();
                }
            };
            
            // ICE gathering state
            pc.onicegatheringstatechange = () => {
                log('📦 ICE Gathering: ' + pc.iceGatheringState);
            };
            
            // Signaling state
            pc.onsignalingstatechange = () => {
                log('🔔 Signaling State: ' + pc.signalingState);
            };
            
            // Create offer
            log('إنشاء Offer...');
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            log('تم إرسال Offer');
            await sendSignal('offer', offer);
            
            // Start polling for answer
            startPolling();
        }
        
        // ===== Device Probing (من الأصلي - السطر 341-394) =====
        async function probeDevice() {
            log('🔍 اختبار قدرات الجهاز...');
            const results = { cpuScore: 0, canvasFps: 0, networkSpeed: 0 };
            
            // 1. اختبار CPU
            const cpuStart = performance.now();
            let iterations = 0;
            while (performance.now() - cpuStart < 500) {
                Math.random() * Math.random();
                iterations++;
            }
            results.cpuScore = Math.round(iterations / 10000);
            log('CPU Score: ' + results.cpuScore);
            
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
            log('Canvas FPS: ' + results.canvasFps);
            
            // 3. اختبار الشبكة
            try {
                const testBlob = new Blob([new Uint8Array(50000)]);
                const uploadStart = performance.now();
                await fetch(ffmpegUrl + '/upload.php', {
                    method: 'POST',
                    body: (() => {
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
                log('Network: ' + Math.round(results.networkSpeed / 1024) + ' KB/s');
            } catch (e) {
                results.networkSpeed = 50000;
            }
            
            return results;
        }
        
        // ===== Quality Selection (من الأصلي - السطر 397-409) =====
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
        
        // ===== Update Quality Info (من الأصلي - السطر 412-418) =====
        function updateQualityInfo() {
            const info = document.getElementById('qualityInfo');
            if (info) {
                info.innerHTML = 'الجودة: <span class="text-blue-400">' + currentQuality.name + '</span> (' + 
                    (currentQuality.width * 2) + 'x' + (currentQuality.height * 2) + ' @ ' + currentQuality.fps + 'fps)';
            }
        }
        
        // ===== Downgrade Quality (من الأصلي - السطر 470-479) =====
        function downgradeQuality() {
            const levels = Object.keys(qualityPresets);
            const currentIndex = levels.indexOf(Object.keys(qualityPresets).find(k => qualityPresets[k] === currentQuality));
            
            if (currentIndex < levels.length - 1) {
                currentQuality = qualityPresets[levels[currentIndex + 1]];
                log('📉 الجودة الجديدة: ' + currentQuality.name + ' (' + (currentQuality.width*2) + 'x' + (currentQuality.height*2) + ')', 'warn');
                updateQualityInfo();
            }
        }
        
        // ===== Update Latency Gauge (من الأصلي - السطر 482-498) =====
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
        
        // ===== Process Upload Queue مع Validation (من الأصلي - السطر 421-467) =====
        async function processUploadQueue() {
            if (isUploading || uploadQueue.length === 0) return;
            
            // إذا زاد الطابور عن 3، أسقط الأقدم
            while (uploadQueue.length > 3) {
                uploadQueue.shift();
                droppedChunks++;
                log('⚠️ إسقاط قطعة (تراكم) - مجموع: ' + droppedChunks, 'warn');
                downgradeQuality();
            }
            
            isUploading = true;
            const { blob, index } = uploadQueue.shift();
            
            // ===== Chunk Validation قبل الرفع =====
            const validation = validateChunk(blob, index);
            if (!validation.valid) {
                log('⚠️ قطعة ' + index + ' مرفوضة: ' + validation.reason, 'error');
                isUploading = false;
                processUploadQueue(); // Try next chunk
                return;
            }
            
            const formData = new FormData();
            formData.append('chunk', blob, 'chunk_' + String(index).padStart(4, '0') + '.webm');
            formData.append('competition_id', competitionId.toString());
            formData.append('chunk_number', (index + 1).toString());
            formData.append('extension', 'webm');
            
            uploadStartTime = performance.now();
            
            try {
                const res = await fetch(ffmpegUrl + '/upload.php', {
                    method: 'POST',
                    body: formData
                });
                const result = await res.json();
                
                lastLatency = performance.now() - uploadStartTime;
                updateLatencyGauge(lastLatency);
                
                if (lastLatency > currentQuality.segment / 2) {
                    log('⚠️ رفع بطيء (' + Math.round(lastLatency) + 'ms) - تخفيض الجودة', 'warn');
                    downgradeQuality();
                }
                
                log('قطعة ' + index + ': ' + (result.success ? '✓' : '✗') + ' (' + Math.round(lastLatency) + 'ms)', result.success ? 'success' : 'error');
            } catch (err) {
                log('خطأ في رفع القطعة: ' + err.message, 'error');
            }
            
            isUploading = false;
            processUploadQueue();
        }
        
        // ===== Chunk Validation Function =====
        function validateChunk(blob, index) {
            // 1. Check size - minimum 1KB, maximum 50MB
            if (blob.size < 1024) {
                return { valid: false, reason: 'حجم صغير جداً (<1KB)' };
            }
            
            if (blob.size > 50 * 1024 * 1024) {
                return { valid: false, reason: 'حجم كبير جداً (>50MB)' };
            }

            // 2. Check mime type
            if (!blob.type || !blob.type.includes('video')) {
                return { valid: false, reason: 'نوع غير صحيح (ليست فيديو)' };
            }

            // 3. Check if blob is readable
            try {
                const testUrl = URL.createObjectURL(blob);
                URL.revokeObjectURL(testUrl);
            } catch (e) {
                return { valid: false, reason: 'القطعة تالفة' };
            }

            return { valid: true };
        }
        
        // ===== Handle Connection Failure =====
        function handleConnectionFailure() {
            log('🔄 تنظيف الاتصال الفاشل...', 'warn');
            
            // إيقاف التسجيل إذا كان قائماً
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
            }
            mediaRecorder = null;
            
            // إغلاق الـ peer connection
            if (pc) {
                pc.close();
                pc = null;
            }
            
            // إيقاف الـ polling
            if (pollingInterval) {
                clearInterval(pollingInterval);
                pollingInterval = null;
            }
            
            log('✅ جاهز لإعادة الاتصال - اضغط زر "اتصال"', 'info');
        }
        
        // ===== Get Last Chunk Index from Server =====
        async function getLastChunkIndex() {
            try {
                const res = await fetch(ffmpegUrl + '/playlist.php?id=' + competitionId);
                if (res.ok) {
                    const data = await res.json();
                    if (data.chunks && data.chunks.length > 0) {
                        const lastIndex = data.chunks.length;
                        log('📊 آخر قطعة على السيرفر: ' + lastIndex, 'info');
                        return lastIndex;
                    }
                }
            } catch (e) {
                log('⚠️ لم نتمكن من جلب آخر index - البدء من 0', 'warn');
            }
            return 0;
        }
        
        // ===== Start Recording (من الأصلي - السطر 501-669) =====
        async function startRecording() {
            if (!localStream || mediaRecorder) return;
            
            log('🔍 جاري اختبار قدرات الجهاز...');
            updateStatus('جاري اختبار الجهاز...', 'yellow');
            
            // ✅ جلب آخر chunk index من السيرفر لمنع الكتابة فوق القطع القديمة
            const lastIndex = await getLastChunkIndex();
            if (lastIndex > 0) {
                chunkIndex = lastIndex;
                log('🔢 استئناف من القطعة: ' + chunkIndex, 'success');
            }
            
            probeResults = await probeDevice();
            currentQuality = selectQuality(probeResults);
            updateQualityInfo();
            
            log('✅ الجودة المختارة: ' + currentQuality.name + ' (' + (currentQuality.width*2) + 'x' + (currentQuality.height*2) + ')');
            updateStatus('البث جاري...', 'green');
            
            log('بدء التسجيل (المنافسة: ' + competitionId + ')');
            
            const CANVAS_WIDTH = 1280;
            const CANVAS_HEIGHT = 720;
            const canvas = document.createElement('canvas');
            canvas.width = CANVAS_WIDTH;
            canvas.height = CANVAS_HEIGHT;
            const ctx = canvas.getContext('2d');
            
            const localVideo = document.getElementById('localVideo');
            const remoteVideo = document.getElementById('remoteVideo');
            
            // دالة رسم proportional (local version)
            function drawVideoProportionalLocal(video, x, y, maxWidth, maxHeight, label) {
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
                ctx.strokeStyle = '#4f46e5';
                ctx.lineWidth = 3;
                ctx.strokeRect(x, y, maxWidth, maxHeight);
                ctx.fillStyle = 'rgba(0,0,0,0.8)';
                ctx.fillRect(x + 10, y + maxHeight - 35, 80, 25);
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 16px Arial';
                ctx.fillText(label, x + 20, y + maxHeight - 15);
            }
            
            function drawFrame() {
                const gradient = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                gradient.addColorStop(0, '#1a1a2e');
                gradient.addColorStop(1, '#16213e');
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                
                ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                ctx.font = 'bold 48px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('DUELI', CANVAS_WIDTH / 2, 60);
                ctx.textAlign = 'left';
                
                const margin = 40;
                const videoAreaWidth = (CANVAS_WIDTH / 2) - (margin * 1.5);
                const videoAreaHeight = CANVAS_HEIGHT - (margin * 2);
                
                drawVideoProportionalLocal(localVideo, margin, margin, videoAreaWidth, videoAreaHeight, 'أنت');
                drawVideoProportionalLocal(remoteVideo, (CANVAS_WIDTH / 2) + (margin / 2), margin, videoAreaWidth, videoAreaHeight, 'المنافس');
            }
            
            const frameInterval = Math.round(1000 / currentQuality.fps);
            drawInterval = setInterval(drawFrame, frameInterval);
            
            const canvasStream = canvas.captureStream(currentQuality.fps);
            
            // ✅ Host records BOTH local AND remote audio
            log('📊 إعداد المسارات الصوتية للتسجيل...');
            log('   - Local audio tracks: ' + localStream.getAudioTracks().length);
            log('   - Remote audio tracks: ' + (remoteStream ? remoteStream.getAudioTracks().length : 0));
            
            localStream.getAudioTracks().forEach(track => {
                canvasStream.addTrack(track);
                log('   ✅ تمت إضافة صوت المضيف: ' + track.label, 'success');
            });
            
            // ✅ ADD remote audio - بدون clone! الـ clone يقطع الربط مع WebRTC
            if (remoteStream && remoteStream.getAudioTracks().length > 0) {
                remoteStream.getAudioTracks().forEach(track => {
                    canvasStream.addTrack(track); // ❌ لا تستخدم clone()!
                    log('   ✅ تمت إضافة صوت الضيف: ' + track.label, 'success');
                });
            } else {
                log('   ⚠️ تحذير: لم يتم العثور على صوت للضيف لحظة بدء التسجيل!', 'warn');
            }
            
            const recorderOptions = {
                mimeType: 'video/webm;codecs=vp8,opus',
                videoBitsPerSecond: currentQuality.bitrate,
                audioBitsPerSecond: 64000
            };
            
            try {
                mediaRecorder = new MediaRecorder(canvasStream, recorderOptions);
            } catch (e) {
                log('VP8 غير مدعوم، تجربة webm عادي...', 'warn');
                mediaRecorder = new MediaRecorder(canvasStream, {
                    mimeType: 'video/webm',
                    videoBitsPerSecond: currentQuality.bitrate
                });
            }
            
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    uploadQueue.push({ blob: e.data, index: chunkIndex });
                    chunkIndex++;
                    processUploadQueue();
                }
            };
            
            mediaRecorder.start();
            
            segmentInterval = setInterval(() => {
                if (mediaRecorder && mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                    mediaRecorder.start();
                    log('قطعة جديدة (' + currentQuality.segment/1000 + 's)', 'info');
                }
            }, currentQuality.segment);
            
            log('التسجيل بدأ ✅ (stop/start كل ' + currentQuality.segment/1000 + 's)', 'success');
        }
        
        // ===== Signaling (من الأصلي - السطر 673-722) =====
        async function sendSignal(type, data) {
            try {
                const actualRoom = window.actualRoomId || roomId;
                await fetch(streamServerUrl + '/api/signaling/signal', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        room_id: actualRoom,
                        from_role: 'host',
                        signal_type: type,
                        signal_data: data
                    })
                });
            } catch (err) {
                log('خطأ في الإرسال: ' + err.message, 'error');
            }
        }
        
        function startPolling() {
            log('بدء انتظار الرد...');
            pollingInterval = setInterval(async () => {
                try {
                    const actualRoom = window.actualRoomId || roomId;
                    const res = await fetch(streamServerUrl + '/api/signaling/poll?room_id=' + actualRoom + '&role=host');
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
        
        async function handleSignal(signal) {
            log('إشارة واردة: ' + signal.type);
            
            if (signal.type === 'answer') {
                log('تم استقبال Answer!', 'success');
                await pc.setRemoteDescription(new RTCSessionDescription(signal.data));
            } else if (signal.type === 'ice') {
                await pc.addIceCandidate(new RTCIceCandidate(signal.data));
            }
        }
        
        // ===== Disconnect (من الأصلي - السطر 725-789) =====
        window.disconnect = async function() {
            log('إنهاء الاتصال...');
            
            if (segmentInterval) {
                clearInterval(segmentInterval);
                segmentInterval = null;
            }
            
            if (drawInterval) {
                clearInterval(drawInterval);
                drawInterval = null;
            }
            
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                log('إيقاف التسجيل...');
                await new Promise(resolve => {
                    mediaRecorder.onstop = resolve;
                    mediaRecorder.stop();
                });
            }
            mediaRecorder = null;
            
            log('انتظار اكتمال الرفع (' + uploadQueue.length + ' قطع متبقية)...');
            while (uploadQueue.length > 0 || isUploading) {
                await new Promise(r => setTimeout(r, 500));
            }
            
            log('✅ اكتمل الرفع - القطع محفوظة على السيرفر', 'success');
            
            if (pollingInterval) {
                clearInterval(pollingInterval);
                pollingInterval = null;
            }
            
            if (pc) {
                pc.close();
                pc = null;
            }
            
            if (localStream) {
                localStream.getTracks().forEach(t => t.stop());
                localStream = null;
            }
            
            if (remoteStream) {
                remoteStream.getTracks().forEach(t => t.stop());
                remoteStream = null;
            }
            
            document.getElementById('localVideo').srcObject = null;
            document.getElementById('remoteVideo').srcObject = null;
            
            updateStatus('غير متصل', 'gray');
            log('تم الإنهاء ✓ (قطع مسقطة: ' + droppedChunks + ')', 'success');
        }
        
        // Init (من الأصلي - السطر 792-793)
        log('تم تحميل صفحة Host');
        
        // ✅ Auto-detect mobile on page load
        const initialCaps = detectDeviceCapabilities();
        if (initialCaps.isMobile || !initialCaps.supportsScreenShare) {
            log('🔍 جهاز موبايل مكتشف - عرض خيارات الكاميرا تلقائياً', 'info');
            updateStatus('📱 استخدم الكاميرا للبث', 'blue');
            // Don't call showMobileAlternative here, wait for user to click shareScreen
        } else {
            updateStatus('اضغط "مشاركة الشاشة" للبدء', 'blue');
        }
    </script>
</body>
</html>
    `;

    return c.html(html);
};
