/**
 * Test Guest Page
 * صفحة الضيف - مُستخرجة من test-stream-page.ts (lines 805-1151)
 */

import type { Context } from 'hono';
import type { Bindings, Variables } from '../../../config/types';

const streamServerUrl = 'https://stream.maelsh.pro';
const testRoomId = 'test_room_001';

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
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div class="relative">
                <div class="video-container aspect-video" id="localVideoContainer">
                    <video id="localVideo" autoplay muted playsinline class="w-full h-full object-cover"></video>
                </div>
            </div>
            <div>
                <div class="video-container aspect-video">
                    <video id="remoteVideo" autoplay playsinline class="w-full h-full object-cover"></video>
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
                class="w-12 h-12 rounded-full bg-red-600 hover:bg-red-700 transition flex items-center justify-center">
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
        // استيراد الدوال من core.ts عبر window (تصحيح الأسماء)
        const { testLog: log, updateStatus } = window;
        
        const roomId = '${testRoomId}';
        const role = 'guest';
        const streamServerUrl = '${streamServerUrl}';
        
        // قراءة رقم المنافسة من URL (من الأصلي - السطر 888-903)
        const urlParams = new URLSearchParams(window.location.search);
        const urlCompId = urlParams.get('comp');
        
        let pc = null;
        let localStream = null;
        let pollingInterval = null;
        
        // حالة الأزرار
        let isScreenSharing = false;
        let isCameraOn = false;
        let currentFacing = 'user';
        let isMicOn = true;
        let isSpeakerOn = true;
        let isLocalVideoVisible = true;
        let isConnected = false;
        
        // ملء حقل الإدخال تلقائياً من URL
        if (urlCompId) {
            document.addEventListener('DOMContentLoaded', () => {
                document.getElementById('compIdInput').value = urlCompId;
                document.getElementById('status').innerHTML = 
                    '<span class="text-green-400"><i class="fas fa-check mr-2"></i>المنافسة: ' + urlCompId + ' - شارك الشاشة ثم اضغط الانضمام</span>';
            });
        }
        
        // ===== Device Capabilities Detection =====
        function detectDeviceCapabilities() {
            const capabilities = {
                isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
                supportsScreenShare: !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia),
                supportsCamera: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
            };
            
            log('قدرات الجهاز: Mobile=' + capabilities.isMobile + ', ScreenShare=' + capabilities.supportsScreenShare);
            return capabilities;
        }
        
        // ===== Share Screen مع دعم الموبايل =====
        window.shareScreen = async function() {
            const caps = detectDeviceCapabilities();
            
            if (caps.isMobile || !caps.supportsScreenShare) {
                log('مشاركة الشاشة غير مدعومة - استخدام الكاميرا', 'warn');
                showMobileAlternative();
                return;
            }
            
            try {
                log('طلب مشاركة الشاشة...');
                localStream = await navigator.mediaDevices.getDisplayMedia({
                    video: { cursor: 'always' },
                    audio: true
                });
                document.getElementById('localVideo').srcObject = localStream;
                log('تم الحصول على الشاشة ✓', 'success');
                updateStatus('الشاشة جاهزة - اضغط الانضمام', 'green');
                
                // ⚠️ لا تفصل تلقائياً - قد يكون المستخدم يُبدّل الكاميرا
                localStream.getVideoTracks()[0].onended = () => {
                    log('تم إيقاف مشاركة الشاشة من قِبل المستخدم', 'warn');
                    updateStatus('الشاشة متوقفة - شارك شاشة جديدة أو استخدم الكاميرا', 'yellow');
                };
            } catch (err) {
                log('فشل: ' + err.message, 'warn');
                showMobileAlternative();
            }
        }
        
        // ===== Mobile Camera Alternative =====
        function showMobileAlternative() {
            updateStatus('استخدم الكاميرا بدلاً من مشاركة الشاشة', 'yellow');
            
            let cameraBtns = document.getElementById('cameraButtons');
            if (!cameraBtns) {
                cameraBtns = document.createElement('div');
                cameraBtns.id = 'cameraButtons';
                cameraBtns.className = 'flex flex-wrap gap-2 justify-center mb-4';
                
                const frontBtn = document.createElement('button');
                frontBtn.className = 'px-4 py-2 bg-green-600 rounded-lg hover:bg-green-700 transition';
                frontBtn.innerHTML = '<i class="fas fa-camera mr-2"></i>الكاميرا الأمامية';
                frontBtn.onclick = () => window.useCamera('user');
                
                const backBtn = document.createElement('button');
                backBtn.className = 'px-4 py-2 bg-purple-600 rounded-lg hover:bg-purple-700 transition';
                backBtn.innerHTML = '<i class="fas fa-camera-retro mr-2"></i>الكاميرا الخلفية';
                backBtn.onclick = () => window.useCamera('environment');
                
                cameraBtns.appendChild(frontBtn);
                cameraBtns.appendChild(backBtn);
                
                const controlsDiv = document.querySelector('.flex.flex-wrap.gap-2.justify-center.mb-4');
                controlsDiv.parentElement.insertBefore(cameraBtns, controlsDiv);
            }
            cameraBtns.style.display = 'flex';
        }
        
        window.useCamera = async function(facingMode) {
            try {
                log('طلب الكاميرا ' + (facingMode === 'user' ? 'الأمامية' : 'الخلفية') + '...');
                
                // حفظ الـ stream القديم
                const oldStream = localStream;
                
                // الحصول على stream جديد
                const newStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
                    audio: true
                });
                
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
                document.getElementById('localVideo').srcObject = localStream;
                
                const cameraBtns = document.getElementById('cameraButtons');
                if (cameraBtns) cameraBtns.style.display = 'none';
                
                log('تم الحصول على الكاميرا ✓', 'success');
                updateStatus('الكاميرا جاهزة - اضغط الانضمام', 'green');
            } catch (err) {
                log('فشل الكاميرا: ' + err.message, 'error');
                if (err.name === 'NotAllowedError') {
                    updateStatus('الرجاء السماح بالوصول للكاميرا', 'red');
                } else if (err.name === 'NotFoundError') {
                    updateStatus('لا توجد كاميرا', 'red');
                }
            }
        }
        
        // ===== Toggle Screen Sharing =====
        window.toggleScreen = async function() {
            const caps = detectDeviceCapabilities();
            
            if (!caps.supportsScreenShare) {
                document.getElementById('screenUnavailable').classList.remove('hidden');
                setTimeout(() => document.getElementById('screenUnavailable').classList.add('hidden'), 2000);
                return;
            }
            
            if (isScreenSharing) {
                if (localStream) {
                    localStream.getTracks().forEach(t => t.stop());
                    localStream = null;
                }
                document.getElementById('localVideo').srcObject = null;
                document.getElementById('screenBtn').classList.remove('bg-blue-800');
                document.getElementById('screenBtn').classList.add('bg-blue-600');
                isScreenSharing = false;
                isCameraOn = false;
                log('تم إيقاف مشاركة الشاشة', 'info');
            } else {
                await window.shareScreen();
                if (localStream) {
                    isScreenSharing = true;
                    isCameraOn = false;
                    document.getElementById('screenBtn').classList.remove('bg-blue-600');
                    document.getElementById('screenBtn').classList.add('bg-blue-800');
                    document.getElementById('cameraBtn').classList.remove('bg-purple-800');
                    document.getElementById('cameraBtn').classList.add('bg-purple-600');
                    document.getElementById('cameraIcon').className = 'fas fa-video text-white';
                }
            }
        }
        
        // ===== Toggle Camera =====
        window.toggleCamera = async function() {
            if (isCameraOn) {
                if (localStream) {
                    localStream.getTracks().forEach(t => t.stop());
                    localStream = null;
                }
                document.getElementById('localVideo').srcObject = null;
                document.getElementById('cameraBtn').classList.remove('bg-purple-800');
                document.getElementById('cameraBtn').classList.add('bg-purple-600');
                document.getElementById('cameraIcon').className = 'fas fa-video-slash text-white';
                isCameraOn = false;
                isScreenSharing = false;
                log('تم إيقاف الكاميرا', 'info');
            } else {
                await window.useCamera(currentFacing);
                if (localStream) {
                    isCameraOn = true;
                    isScreenSharing = false;
                    document.getElementById('cameraBtn').classList.remove('bg-purple-600');
                    document.getElementById('cameraBtn').classList.add('bg-purple-800');
                    document.getElementById('cameraIcon').className = 'fas fa-video text-white';
                    document.getElementById('screenBtn').classList.remove('bg-blue-800');
                    document.getElementById('screenBtn').classList.add('bg-blue-600');
                }
            }
        }
        
        // ===== Switch Camera =====
        window.switchCamera = async function() {
            if (!localStream) {
                log('شغّل الكاميرا أولاً', 'warn');
                return;
            }
            
            if (isScreenSharing) {
                log('التبديل متاح للكاميرا فقط', 'warn');
                return;
            }
            
            currentFacing = currentFacing === 'user' ? 'environment' : 'user';
            await window.useCamera(currentFacing);
            isCameraOn = true;
            log('✅ تم التبديل إلى الكاميرا ' + (currentFacing === 'user' ? 'الأمامية' : 'الخلفية'), 'success');
        }
        
        // ===== Toggle Microphone =====
        window.toggleMic = function() {
            if (!localStream) return;
            
            const audioTracks = localStream.getAudioTracks();
            audioTracks.forEach(track => { track.enabled = !track.enabled; });
            
            isMicOn = !isMicOn;
            document.getElementById('micIcon').className = isMicOn ? 
                'fas fa-microphone text-white' : 'fas fa-microphone-slash text-white';
            document.getElementById('micBtn').classList.toggle('bg-green-800', isMicOn);
            document.getElementById('micBtn').classList.toggle('bg-red-600', !isMicOn);
            log(isMicOn ? 'تم تشغيل الميكروفون' : 'تم إيقاف الميكروفون', 'info');
        }
        
        // ===== Toggle Speaker =====
        window.toggleSpeaker = function() {
            const remoteVideo = document.getElementById('remoteVideo');
            remoteVideo.muted = !remoteVideo.muted;
            
            isSpeakerOn = !remoteVideo.muted;
            document.getElementById('speakerIcon').className = isSpeakerOn ? 
                'fas fa-volume-up text-white' : 'fas fa-volume-mute text-white';
            document.getElementById('speakerBtn').classList.toggle('bg-teal-600', isSpeakerOn);
            document.getElementById('speakerBtn').classList.toggle('bg-red-600', !isSpeakerOn);
            log(isSpeakerOn ? 'تم تشغيل السماعة' : 'تم إيقاف السماعة', 'info');
        }
        
        // ===== Toggle Local Video Visibility =====
        window.toggleLocalVideo = function() {
            const container = document.getElementById('localVideoContainer');
            isLocalVideoVisible = !isLocalVideoVisible;
            
            container.style.display = isLocalVideoVisible ? 'block' : 'none';
            document.getElementById('hideLocalIcon').className = isLocalVideoVisible ? 
                'fas fa-eye text-white' : 'fas fa-eye-slash text-white';
            log(isLocalVideoVisible ? 'صورتك مرئية' : 'صورتك مخفية', 'info');
        }
        
        // ===== Update Connection Buttons =====
        function updateConnectionButtons(connected) {
            isConnected = connected;
            document.getElementById('joinBtn').classList.toggle('hidden', connected);
            document.getElementById('reconnectBtn').classList.toggle('hidden', !connected);
        }
        
        // ===== Join Room (من الأصلي - السطر 939-1057) =====
        window.joinRoom = async function() {
            // التحقق من رقم المنافسة
            const compIdInput = document.getElementById('compIdInput');
            const competitionId = compIdInput.value.trim();
            
            if (!competitionId) {
                log('أدخل رقم المنافسة أولاً!', 'error');
                updateStatus('أدخل رقم المنافسة!', 'red');
                return;
            }
            
            if (!localStream) {
                log('شارك الشاشة أولاً!', 'warn');
                return;
            }
            
            updateStatus('جاري الانضمام إلى المنافسة ' + competitionId + '...', 'yellow');
            
            // Join signaling room
            try {
                log('الانضمام إلى المنافسة: ' + competitionId);
                const actualRoom = 'comp_' + competitionId;
                const res = await fetch(streamServerUrl + '/api/signaling/room/join', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        room_id: actualRoom,
                        user_id: 999,
                        role: 'opponent'
                    })
                });
                const data = await res.json();
                log('النتيجة: ' + JSON.stringify(data), data.success ? 'success' : 'error');
                
                // حفظ المعرف الحقيقي
                if (data.success) {
                    window.actualRoomId = actualRoom;
                }
            } catch (err) {
                log('خطأ: ' + err.message, 'error');
            }
            
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
            
            // Handle remote stream
            pc.ontrack = (event) => {
                log('📥 ontrack fired!', 'success');
                log('   - event.track.kind: ' + event.track.kind);
                log('   - event.streams.length: ' + event.streams.length);
                if (event.streams[0]) {
                    log('   - stream.id: ' + event.streams[0].id);
                    log('   - stream tracks: ' + event.streams[0].getTracks().length);
                    const remoteVideo = document.getElementById('remoteVideo');
                    remoteVideo.srcObject = event.streams[0];
                    remoteVideo.onloadedmetadata = () => {
                        log('   ✅ Remote video loaded: ' + remoteVideo.videoWidth + 'x' + remoteVideo.videoHeight, 'success');
                    };
                    updateStatus('متصل ✓', 'green');
                } else {
                    log('   ⚠️ No stream in event!', 'error');
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
                    updateStatus('متصل ✓', 'green');
                    updateConnectionButtons(true);
                } else if (pc.connectionState === 'disconnected') {
                    log('⚠️ الاتصال انقطع مؤقتاً...', 'warn');
                    updateStatus('انقطع الاتصال - جاري المحاولة...', 'yellow');
                } else if (pc.connectionState === 'failed') {
                    log('❌ فشل الاتصال', 'error');
                    updateStatus('فشل الاتصال - اضغط انضمام للمحاولة مجدداً', 'red');
                    updateConnectionButtons(false);
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
            
            // Signaling state
            pc.onsignalingstatechange = () => {
                log('🔔 Signaling State: ' + pc.signalingState);
            };
            
            // Start polling for offer
            log('انتظار Offer من الـ Host...');
            startPolling();
        }
        
        // ===== Signaling (من الأصلي - السطر 1059-1115) =====
        async function sendSignal(type, data) {
            try {
                const actualRoom = window.actualRoomId || roomId;
                await fetch(streamServerUrl + '/api/signaling/signal', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        room_id: actualRoom,
                        from_role: 'opponent',
                        signal_type: type,
                        signal_data: data
                    })
                });
            } catch (err) {
                log('خطأ في الإرسال: ' + err.message, 'error');
            }
        }
        
        function startPolling() {
            pollingInterval = setInterval(async () => {
                try {
                    const actualRoom = window.actualRoomId || roomId;
                    const res = await fetch(streamServerUrl + '/api/signaling/poll?room_id=' + actualRoom + '&role=opponent');
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
            
            if (signal.type === 'offer') {
                log('تم استقبال Offer!', 'success');
                await pc.setRemoteDescription(new RTCSessionDescription(signal.data));
                
                // Create answer
                log('إنشاء Answer...');
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await sendSignal('answer', answer);
                log('تم إرسال Answer', 'success');
                
            } else if (signal.type === 'ice') {
                await pc.addIceCandidate(new RTCIceCandidate(signal.data));
            }
        }
        
        // ===== Handle Connection Failure =====
        function handleConnectionFailure() {
            log('🔄 تنظيف الاتصال الفاشل...', 'warn');
            
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
            
            log('✅ جاهز لإعادة الاتصال - اضغط زر "الانضمام"', 'info');
        }
        
        // ===== Reconnect - تحديث الاتصال بدون تحديث الصفحة =====
        window.reconnect = async function() {
            log('🔄 تحديث الاتصال...', 'info');
            updateStatus('جاري تحديث الاتصال...', 'yellow');
            
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
            
            // مسح الفيديو البعيد
            document.getElementById('remoteVideo').srcObject = null;
            
            // إعادة الانضمام بعد ثانية
            log('⏳ انتظار ثانية ثم إعادة الانضمام...', 'info');
            setTimeout(() => {
                if (localStream) {
                    window.joinRoom();
                } else {
                    updateStatus('شارك الشاشة أو الكاميرا أولاً', 'yellow');
                }
            }, 1000);
        }
        
        // ===== Disconnect (من الأصلي - السطر 1118-1141) =====
        window.disconnect = function() {
            log('إنهاء الاتصال...');
            
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
            
            document.getElementById('localVideo').srcObject = null;
            document.getElementById('remoteVideo').srcObject = null;
            
            updateStatus('غير متصل', 'gray');
            log('تم الإنهاء ✓', 'success');
        }
        
        // Init (من الأصلي - السطر 1144-1145)
        log('تم تحميل صفحة Guest');
        updateStatus('اضغط "مشاركة الشاشة" ثم "الانضمام"', 'blue');
    </script>
</body>
</html>
    `;

    return c.html(html);
};
