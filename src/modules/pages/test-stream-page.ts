/**
 * Test Stream Pages - Simple WebRTC & HLS Testing
 * صفحات اختبار البث - بدون قاعدة بيانات أو تسجيل
 */

import type { Context } from 'hono';
import type { Bindings, Variables } from '../../config/types';

const streamServerUrl = 'https://stream.maelsh.pro';
const testRoomId = 'test_room_001';

/**
 * Host Page - الطرف الأول (يبدأ البث)
 */
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
            <button onclick="shareScreen()" id="shareBtn" class="px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition">
                <i class="fas fa-desktop mr-2"></i>مشاركة الشاشة
            </button>
            <button onclick="connect()" id="connectBtn" class="px-4 py-2 bg-green-600 rounded-lg hover:bg-green-700 transition">
                <i class="fas fa-plug mr-2"></i>اتصال
            </button>
            <button onclick="disconnect()" id="disconnectBtn" class="px-4 py-2 bg-red-600 rounded-lg hover:bg-red-700 transition">
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
            <a href="/test/guest" class="text-purple-400 hover:underline mx-2">صفحة الضيف</a>
            <a href="/test/viewer" class="text-purple-400 hover:underline mx-2">صفحة المشاهد</a>
        </div>
    </div>
    
    <script>
        const roomId = '${testRoomId}';
        const role = 'host';
        const streamServerUrl = '${streamServerUrl}';
        
        let pc = null;
        let localStream = null;
        let remoteStream = null;
        let pollingInterval = null;
        let mediaRecorder = null;
        let chunkIndex = 0;
        let canvasStream = null;
        const competitionId = Math.floor(Math.random() * 900000 + 100000); // رقم عشوائي 6 أرقام
        const ffmpegUrl = 'https://maelsh.pro/ffmpeg';
        
        // Logging
        function log(msg, type = 'info') {
            const logEl = document.getElementById('log');
            const time = new Date().toLocaleTimeString();
            const div = document.createElement('div');
            div.className = 'log-entry log-' + type;
            div.innerHTML = '[' + time + '] ' + msg;
            logEl.appendChild(div);
            logEl.parentElement.scrollTop = logEl.parentElement.scrollHeight;
            console.log('[' + type.toUpperCase() + ']', msg);
        }
        
        function updateStatus(text, color = 'yellow') {
            document.getElementById('status').innerHTML = 
                '<span class="text-' + color + '-400"><i class="fas fa-circle mr-2"></i>' + text + '</span>';
        }
        
        // إظهار رقم المنافسة
        document.getElementById('compIdDisplay').textContent = 'رقم المنافسة: ' + competitionId + ' (شاركه مع المنافس)';
        log('تم تحميل صفحة Host - المنافسة: ' + competitionId);
        
        // Share Screen
        async function shareScreen() {
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
                
                // Handle stream end
                localStream.getVideoTracks()[0].onended = () => {
                    log('تم إيقاف مشاركة الشاشة', 'warn');
                    disconnect();
                };
            } catch (err) {
                log('فشل: ' + err.message, 'error');
            }
        }
        
        // Create signaling room
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
                
                // ✅ استخدم room_id الذي أرجعه السيرفر
                if (data.success && data.data.room_id) {
                    window.actualRoomId = data.data.room_id; // حفظ المعرف الحقيقي
                }
                return data.success;
            } catch (err) {
                log('خطأ في إنشاء الغرفة: ' + err.message, 'error');
                return false;
            }
        }
        
        // Connect
        async function connect() {
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
            
            // Handle remote stream
            pc.ontrack = (event) => {
                log('📥 ontrack fired!', 'success');
                log('   - event.track.kind: ' + event.track.kind);
                log('   - event.streams.length: ' + event.streams.length);
                if (event.streams[0]) {
                    log('   - stream.id: ' + event.streams[0].id);
                    log('   - stream tracks: ' + event.streams[0].getTracks().length);
                    remoteStream = event.streams[0]; // حفظ للـ Canvas
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
                    updateStatus('متصل ✓ - جاري التسجيل', 'green');
                    startRecording();
                } else if (pc.connectionState === 'failed') {
                    updateStatus('فشل الاتصال', 'red');
                }
            };
            
            // ICE connection state
            pc.oniceconnectionstatechange = () => {
                log('🧊 ICE Connection: ' + pc.iceConnectionState, 
                    pc.iceConnectionState === 'connected' ? 'success' : 
                    pc.iceConnectionState === 'failed' ? 'error' : 'info');
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
        
        // Start recording and upload chunks (with Canvas merge)
        function startRecording() {
            if (!localStream || mediaRecorder) return;
            
            log('بدء التسجيل وإرسال القطع... (المنافسة: ' + competitionId + ')');
            
            // إنشاء Canvas لدمج الفيديوهين
            const canvas = document.createElement('canvas');
            canvas.width = 1280;
            canvas.height = 360;
            const ctx = canvas.getContext('2d');
            
            const localVideo = document.getElementById('localVideo');
            const remoteVideo = document.getElementById('remoteVideo');
            
            let animationId = null;
            
            // رسم الفيديوهين على Canvas
            function drawFrame() {
                // خلفية سوداء
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // الفيديو المحلي (يسار)
                if (localVideo && localVideo.videoWidth > 0) {
                    ctx.drawImage(localVideo, 0, 0, 640, 360);
                }
                
                // الفيديو البعيد (يمين) - إذا متاح
                if (remoteVideo && remoteVideo.videoWidth > 0) {
                    ctx.drawImage(remoteVideo, 640, 0, 640, 360);
                }
                
                // تسميات
                ctx.fillStyle = 'rgba(0,0,0,0.6)';
                ctx.fillRect(5, 335, 50, 20);
                ctx.fillRect(645, 335, 60, 20);
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 12px Arial';
                ctx.fillText('أنت', 15, 349);
                ctx.fillText('المنافس', 650, 349);
                
                animationId = requestAnimationFrame(drawFrame);
            }
            drawFrame();
            
            // الحصول على stream من Canvas
            const canvasStream = canvas.captureStream(30);
            
            // إضافة audio tracks
            localStream.getAudioTracks().forEach(track => {
                canvasStream.addTrack(track);
            });
            
            // إضافة صوت المنافس إذا متاح
            if (remoteStream) {
                remoteStream.getAudioTracks().forEach(track => {
                    canvasStream.addTrack(track.clone());
                });
            }
            
            try {
                mediaRecorder = new MediaRecorder(canvasStream, {
                    mimeType: 'video/webm;codecs=vp9,opus'
                });
            } catch (e) {
                mediaRecorder = new MediaRecorder(canvasStream, {
                    mimeType: 'video/webm'
                });
            }
            
            mediaRecorder.ondataavailable = async (e) => {
                if (e.data.size > 0) {
                    const formData = new FormData();
                    formData.append('chunk', e.data, 'chunk_' + chunkIndex + '.webm');
                    formData.append('competition_id', competitionId.toString());
                    formData.append('chunk_number', (chunkIndex + 1).toString());
                    formData.append('extension', 'webm');
                    
                    try {
                        const res = await fetch(ffmpegUrl + '/upload.php', {
                            method: 'POST',
                            body: formData
                        });
                        const result = await res.json();
                        log('قطعة ' + chunkIndex + ': ' + (result.success ? '✓' : '✗'), result.success ? 'success' : 'error');
                        chunkIndex++;
                    } catch (err) {
                        log('خطأ في رفع القطعة: ' + err.message, 'error');
                    }
                }
            };
            
            // حفظ animationId للإيقاف لاحقاً
            window.canvasAnimationId = animationId;
            
            mediaRecorder.start(10000); // قطعة كل 10 ثوان
            log('التسجيل بدأ (10 ثوان/قطعة) - Canvas دمج ✅', 'success');
        }
        
        
        // Send signal
        async function sendSignal(type, data) {
            try {
                const actualRoom = window.actualRoomId || roomId;
                await fetch(streamServerUrl + '/api/signaling/signal', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        room_id: actualRoom, // ✅ استخدم المعرف الحقيقي
                        from_role: 'host',
                        signal_type: type,
                        signal_data: data
                    })
                });
            } catch (err) {
                log('خطأ في الإرسال: ' + err.message, 'error');
            }
        }
        
        // Poll for signals
        function startPolling() {
            log('بدء انتظار الرد...');
            pollingInterval = setInterval(async () => {
                try {
                    // ✅ استخدم المعرف الحقيقي من السيرفر
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
        
        // Handle incoming signal
        async function handleSignal(signal) {
            log('إشارة واردة: ' + signal.type);
            
            if (signal.type === 'answer') {
                log('تم استقبال Answer!', 'success');
                await pc.setRemoteDescription(new RTCSessionDescription(signal.data));
            } else if (signal.type === 'ice') {
                await pc.addIceCandidate(new RTCIceCandidate(signal.data));
            }
        }
        
        // Disconnect
        async function disconnect() {
            log('إنهاء الاتصال...');
            
            // Stop recording and finalize
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                log('إيقاف التسجيل...');
                
                // انتظار رفع آخر قطعة
                mediaRecorder.onstop = async () => {
                    log('انتظار رفع آخر قطعة (5 ثوان)...');
                    await new Promise(r => setTimeout(r, 5000));
                    
                    // إرسال طلب الدمج
                    try {
                        log('بدء الدمج للمنافسة: ' + competitionId);
                        const res = await fetch(ffmpegUrl + '/finalize.php', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ competition_id: competitionId })
                        });
                        const result = await res.json();
                        if (result.success) {
                            log('🎬 الفيديو: ' + result.vod_url, 'success');
                        } else {
                            log('خطأ في الدمج: ' + result.error, 'error');
                        }
                    } catch (err) {
                        log('خطأ في finalize: ' + err.message, 'error');
                    }
                };
                
                mediaRecorder.stop();
            }
            mediaRecorder = null;
            
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
        
        // Init
        log('تم تحميل صفحة Host');
        updateStatus('اضغط "مشاركة الشاشة" للبدء', 'blue');
    </script>
</body>
</html>
    `;

    return c.html(html);
};

/**
 * Guest Page - الطرف الثاني (ينضم للبث)
 */
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
            <div>
                <p class="text-sm text-gray-400 mb-2">📹 شاشتك (Local)</p>
                <div class="video-container aspect-video">
                    <video id="localVideo" autoplay muted playsinline class="w-full h-full object-cover"></video>
                </div>
            </div>
            <div>
                <p class="text-sm text-gray-400 mb-2">🏠 الـ Host (Remote)</p>
                <div class="video-container aspect-video">
                    <video id="remoteVideo" autoplay playsinline class="w-full h-full object-cover"></video>
                </div>
            </div>
        </div>
        
        <!-- Controls -->
        <div class="flex flex-wrap gap-2 justify-center mb-4">
            <button onclick="shareScreen()" id="shareBtn" class="px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition">
                <i class="fas fa-desktop mr-2"></i>مشاركة الشاشة
            </button>
            <button onclick="joinRoom()" id="joinBtn" class="px-4 py-2 bg-green-600 rounded-lg hover:bg-green-700 transition">
                <i class="fas fa-sign-in-alt mr-2"></i>الانضمام
            </button>
            <button onclick="disconnect()" id="disconnectBtn" class="px-4 py-2 bg-red-600 rounded-lg hover:bg-red-700 transition">
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
            <a href="/test/host" class="text-purple-400 hover:underline mx-2">صفحة الـ Host</a>
            <a href="/test/viewer" class="text-purple-400 hover:underline mx-2">صفحة المشاهد</a>
        </div>
    </div>
    
    <script>
        const roomId = '${testRoomId}';
        const role = 'guest';
        const streamServerUrl = '${streamServerUrl}';
        
        let pc = null;
        let localStream = null;
        let pollingInterval = null;
        
        // Logging
        function log(msg, type = 'info') {
            const logEl = document.getElementById('log');
            const time = new Date().toLocaleTimeString();
            const div = document.createElement('div');
            div.className = 'log-entry log-' + type;
            div.innerHTML = '[' + time + '] ' + msg;
            logEl.appendChild(div);
            logEl.parentElement.scrollTop = logEl.parentElement.scrollHeight;
            console.log('[' + type.toUpperCase() + ']', msg);
        }
        
        function updateStatus(text, color = 'yellow') {
            document.getElementById('status').innerHTML = 
                '<span class="text-' + color + '-400"><i class="fas fa-circle mr-2"></i>' + text + '</span>';
        }
        
        // Share Screen
        async function shareScreen() {
            try {
                log('طلب مشاركة الشاشة...');
                localStream = await navigator.mediaDevices.getDisplayMedia({
                    video: { cursor: 'always' },
                    audio: true
                });
                document.getElementById('localVideo').srcObject = localStream;
                log('تم الحصول على الشاشة ✓', 'success');
                updateStatus('الشاشة جاهزة - اضغط الانضمام', 'green');
            } catch (err) {
                log('فشل: ' + err.message, 'error');
            }
        }
        
        // Join Room
        async function joinRoom() {
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
            };
            
            // ICE connection state
            pc.oniceconnectionstatechange = () => {
                log('🧊 ICE Connection: ' + pc.iceConnectionState, 
                    pc.iceConnectionState === 'connected' ? 'success' : 
                    pc.iceConnectionState === 'failed' ? 'error' : 'info');
            };
            
            // Signaling state
            pc.onsignalingstatechange = () => {
                log('🔔 Signaling State: ' + pc.signalingState);
            };
            
            // Start polling for offer
            log('انتظار Offer من الـ Host...');
            startPolling();
        }
        
        // Send signal
        async function sendSignal(type, data) {
            try {
                const actualRoom = window.actualRoomId || roomId;
                await fetch(streamServerUrl + '/api/signaling/signal', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        room_id: actualRoom, // ✅ استخدم المعرف الحقيقي
                        from_role: 'opponent',
                        signal_type: type,
                        signal_data: data
                    })
                });
            } catch (err) {
                log('خطأ في الإرسال: ' + err.message, 'error');
            }
        }
        
        // Poll for signals
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
        
        // Handle incoming signal
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
        
        // Disconnect
        function disconnect() {
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
        
        // Init
        log('تم تحميل صفحة Guest');
        updateStatus('اضغط "مشاركة الشاشة" ثم "الانضمام"', 'blue');
    </script>
</body>
</html>
    `;

    return c.html(html);
};

/**
 * Viewer Page - المشاهد (يشاهد عبر HLS)
 */
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
        .video-container { background: #000; border-radius: 12px; overflow: hidden; }
    </style>
</head>
<body class="text-white p-4">
    <div class="max-w-4xl mx-auto">
        <div class="text-center mb-6">
            <h1 class="text-3xl font-bold mb-2">👁️ اختبار البث - مشاهد</h1>
            <p class="text-gray-400">مشاهدة البث عبر HLS</p>
        </div>
        
        <!-- Status -->
        <div id="status" class="bg-gray-800 rounded-lg p-4 mb-4 text-center">
            <span class="text-yellow-400"><i class="fas fa-circle-notch fa-spin mr-2"></i>جاري الاتصال...</span>
        </div>
        
        <!-- Video -->
        <div class="video-container aspect-video mb-4">
            <video id="hlsPlayer" controls autoplay playsinline class="w-full h-full"></video>
        </div>
        
        <!-- Info -->
        <div class="bg-gray-800 rounded-lg p-4 text-sm">
            <p class="text-gray-400 mb-2">📡 رابط البث HLS:</p>
            <code class="text-purple-400 break-all">${streamServerUrl}/storage/live/match_${testRoomId.replace('test_room_', '')}/playlist.m3u8</code>
        </div>
        
        <!-- Links -->
        <div class="mt-4 text-center text-sm text-gray-500">
            <a href="/test/host" class="text-purple-400 hover:underline mx-2">صفحة الـ Host</a>
            <a href="/test/guest" class="text-purple-400 hover:underline mx-2">صفحة الضيف</a>
        </div>
    </div>
    
    <script>
        const hlsUrl = '${streamServerUrl}/storage/live/match_${testRoomId.replace('test_room_', '')}/playlist.m3u8';
        const hlsPlayer = document.getElementById('hlsPlayer');
        const statusEl = document.getElementById('status');
        
        function updateStatus(text, color) {
            statusEl.innerHTML = '<span class="text-' + color + '-400"><i class="fas fa-circle mr-2"></i>' + text + '</span>';
        }
        
        if (Hls.isSupported()) {
            const hls = new Hls({
                liveSyncDuration: 3,
                liveMaxLatencyDuration: 10
            });
            
            hls.loadSource(hlsUrl);
            hls.attachMedia(hlsPlayer);
            
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                updateStatus('البث متاح ✓', 'green');
                hlsPlayer.play().catch(() => {});
            });
            
            hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    updateStatus('البث غير متاح حالياً - جرب لاحقاً', 'red');
                }
            });
        } else if (hlsPlayer.canPlayType('application/vnd.apple.mpegurl')) {
            hlsPlayer.src = hlsUrl;
            hlsPlayer.addEventListener('loadedmetadata', () => {
                updateStatus('البث متاح ✓', 'green');
            });
        } else {
            updateStatus('المتصفح لا يدعم HLS', 'red');
        }
    </script>
</body>
</html>
    `;

    return c.html(html);
};
