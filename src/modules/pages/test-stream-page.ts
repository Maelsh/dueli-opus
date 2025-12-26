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
        
        // قراءة رقم المنافسة من URL أو إنشاء عشوائي
        const urlParams = new URLSearchParams(window.location.search);
        let competitionId = urlParams.get('comp') ? parseInt(urlParams.get('comp')) : Math.floor(Math.random() * 900000 + 100000);
        
        // تحديث URL إذا لم يكن موجوداً
        if (!urlParams.get('comp')) {
            history.replaceState(null, '', window.location.pathname + '?comp=' + competitionId);
        }
        
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
        
        log('تم تحميل صفحة Host - المنافسة: ' + competitionId);
        log('رابط المنافس: ' + guestLink);
        log('رابط المشاهدة: ' + viewerLink);
        
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
        
        // ===== إعدادات الجودة التكيفية =====
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
        
        // ===== اختبار قدرات الجهاز =====
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
            
            // 3. اختبار الشبكة (رفع ملف صغير)
            try {
                const testBlob = new Blob([new Uint8Array(50000)]); // 50KB
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
                results.networkSpeed = Math.round(50000 / (uploadTime / 1000)); // bytes/sec
                log('Network: ' + Math.round(results.networkSpeed / 1024) + ' KB/s');
            } catch (e) {
                results.networkSpeed = 50000; // افتراضي
            }
            
            return results;
        }
        
        // ===== اختيار الجودة بناءً على الاختبار =====
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
        
        // ===== تحديث عرض الجودة =====
        function updateQualityInfo() {
            const info = document.getElementById('qualityInfo');
            if (info) {
                info.innerHTML = 'الجودة: <span class="text-blue-400">' + currentQuality.name + '</span> (' + 
                    (currentQuality.width * 2) + 'x' + (currentQuality.height * 2) + ' @ ' + currentQuality.fps + 'fps)';
            }
        }
        
        // ===== إدارة طابور الرفع =====
        async function processUploadQueue() {
            if (isUploading || uploadQueue.length === 0) return;
            
            // إذا زاد الطابور عن 3، أسقط الأقدم وخفض الجودة
            while (uploadQueue.length > 3) {
                uploadQueue.shift();
                droppedChunks++;
                log('⚠️ إسقاط قطعة (تراكم) - مجموع: ' + droppedChunks, 'warn');
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
                const res = await fetch(ffmpegUrl + '/upload.php', {
                    method: 'POST',
                    body: formData
                });
                const result = await res.json();
                
                // حساب زمن التأخير
                lastLatency = performance.now() - uploadStartTime;
                updateLatencyGauge(lastLatency);
                
                // إذا كان الرفع أبطأ من نصف مدة القطعة → خفض الجودة
                if (lastLatency > currentQuality.segment / 2) {
                    log('⚠️ رفع بطيء (' + Math.round(lastLatency) + 'ms) - تخفيض الجودة', 'warn');
                    downgradeQuality();
                }
                
                log('قطعة ' + index + ': ' + (result.success ? '✓' : '✗') + ' (' + Math.round(lastLatency) + 'ms)', result.success ? 'success' : 'error');
            } catch (err) {
                log('خطأ في رفع القطعة: ' + err.message, 'error');
            }
            
            isUploading = false;
            processUploadQueue(); // معالجة القطعة التالية
        }
        
        // ===== تخفيض الجودة =====
        function downgradeQuality() {
            const levels = Object.keys(qualityPresets);
            const currentIndex = levels.indexOf(Object.keys(qualityPresets).find(k => qualityPresets[k] === currentQuality));
            
            if (currentIndex < levels.length - 1) {
                currentQuality = qualityPresets[levels[currentIndex + 1]];
                log('📉 الجودة الجديدة: ' + currentQuality.name + ' (' + (currentQuality.width*2) + 'x' + (currentQuality.height*2) + ')', 'warn');
                updateQualityInfo();
            }
        }
        
        // ===== عداد التأخير =====
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
        
        // ===== بدء التسجيل =====
        async function startRecording() {
            if (!localStream || mediaRecorder) return;
            
            // اختبار الجهاز أولاً
            log('🔍 جاري اختبار قدرات الجهاز...');
            updateStatus('جاري اختبار الجهاز...', 'yellow');
            
            probeResults = await probeDevice();
            currentQuality = selectQuality(probeResults);
            updateQualityInfo();
            
            log('✅ الجودة المختارة: ' + currentQuality.name + ' (' + (currentQuality.width*2) + 'x' + (currentQuality.height*2) + ')');
            updateStatus('البث جاري...', 'green');
            
            log('بدء التسجيل (المنافسة: ' + competitionId + ')');
            
            // إنشاء Canvas بجودة ثابتة 1280x720 (16:9)
            const CANVAS_WIDTH = 1280;
            const CANVAS_HEIGHT = 720;
            const canvas = document.createElement('canvas');
            canvas.width = CANVAS_WIDTH;
            canvas.height = CANVAS_HEIGHT;
            const ctx = canvas.getContext('2d');
            
            const localVideo = document.getElementById('localVideo');
            const remoteVideo = document.getElementById('remoteVideo');
            
            // ===== دالة رسم فيديو proportional =====
            function drawVideoProportional(video, x, y, maxWidth, maxHeight, label) {
                if (!video || video.readyState < 2 || video.videoWidth === 0) return;
                
                const videoRatio = video.videoWidth / video.videoHeight;
                const targetRatio = maxWidth / maxHeight;
                let drawW, drawH;
                
                if (videoRatio > targetRatio) {
                    // Video أعرض - fit to width
                    drawW = maxWidth;
                    drawH = maxWidth / videoRatio;
                } else {
                    // Video أطول - fit to height
                    drawH = maxHeight;
                    drawW = maxHeight * videoRatio;
                }
                
                // Center video in allocated space
                const offsetX = x + (maxWidth - drawW) / 2;
                const offsetY = y + (maxHeight - drawH) / 2;
                
                // رسم خلفية سوداء للمساحة الفارغة
                ctx.fillStyle = '#000';
                ctx.fillRect(x, y, maxWidth, maxHeight);
                
                // رسم الفيديو
                ctx.drawImage(video, offsetX, offsetY, drawW, drawH);
                
                // إطار حول الفيديو
                ctx.strokeStyle = '#4f46e5';
                ctx.lineWidth = 3;
                ctx.strokeRect(x, y, maxWidth, maxHeight);
                
                // Label
                ctx.fillStyle = 'rgba(0,0,0,0.8)';
                ctx.fillRect(x + 10, y + maxHeight - 35, 80, 25);
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 16px Arial';
                ctx.fillText(label, x + 20, y + maxHeight - 15);
            }
            
            // ===== رسم الإطار =====
            function drawFrame() {
                // Background gradient
                const gradient = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                gradient.addColorStop(0, '#1a1a2e');
                gradient.addColorStop(1, '#16213e');
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                
                // Logo/Watermark (optional)
                ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                ctx.font = 'bold 48px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('DUELI', CANVAS_WIDTH / 2, 60);
                ctx.textAlign = 'left'; // reset
                
                // Define video areas (with margins)
                const margin = 40;
                const videoAreaWidth = (CANVAS_WIDTH / 2) - (margin * 1.5);
                const videoAreaHeight = CANVAS_HEIGHT - (margin * 2);
                
                // الفيديو المحلي (يسار)
                drawVideoProportional(
                    localVideo,
                    margin,
                    margin,
                    videoAreaWidth,
                    videoAreaHeight,
                    'أنت'
                );
                
                // الفيديو البعيد (يمين)
                drawVideoProportional(
                    remoteVideo,
                    (CANVAS_WIDTH / 2) + (margin / 2),
                    margin,
                    videoAreaWidth,
                    videoAreaHeight,
                    'المنافس'
                );
            }
            
            // setInterval بدلاً من requestAnimationFrame
            const frameInterval = Math.round(1000 / currentQuality.fps);
            drawInterval = setInterval(drawFrame, frameInterval);
            
            // الحصول على stream من Canvas
            const canvasStream = canvas.captureStream(currentQuality.fps);
            
            // إضافة audio tracks
            localStream.getAudioTracks().forEach(track => {
                canvasStream.addTrack(track);
            });
            
            if (remoteStream) {
                remoteStream.getAudioTracks().forEach(track => {
                    canvasStream.addTrack(track.clone());
                });
            }
            
            // إنشاء MediaRecorder
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
            
            // عند توفر بيانات → إضافة للطابور
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    uploadQueue.push({ blob: e.data, index: chunkIndex });
                    chunkIndex++;
                    processUploadQueue();
                }
            };
            
            // بدء التسجيل
            mediaRecorder.start();
            
            // دورة stop/start لضمان keyframes في كل قطعة
            segmentInterval = setInterval(() => {
                if (mediaRecorder && mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                    mediaRecorder.start();
                    log('قطعة جديدة (' + currentQuality.segment/1000 + 's)', 'info');
                }
            }, currentQuality.segment);
            
            log('التسجيل بدأ ✅ (stop/start كل ' + currentQuality.segment/1000 + 's)', 'success');
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
        
        // Disconnect with proper cleanup
        async function disconnect() {
            log('إنهاء الاتصال...');
            
            // 1. إيقاف دورة stop/start
            if (segmentInterval) {
                clearInterval(segmentInterval);
                segmentInterval = null;
            }
            
            // 2. إيقاف رسم Canvas
            if (drawInterval) {
                clearInterval(drawInterval);
                drawInterval = null;
            }
            
            // 3. إيقاف التسجيل وانتظار آخر قطعة
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                log('إيقاف التسجيل...');
                
                await new Promise(resolve => {
                    mediaRecorder.onstop = resolve;
                    mediaRecorder.stop();
                });
            }
            mediaRecorder = null;
            
            // 4. انتظار اكتمال طابور الرفع
            log('انتظار اكتمال الرفع (' + uploadQueue.length + ' قطع متبقية)...');
            while (uploadQueue.length > 0 || isUploading) {
                await new Promise(r => setTimeout(r, 500));
            }
            
            // 5. انتهى! Chunks محفوظة للأبد
            log('✅ اكتمل الرفع - القطع محفوظة على السيرفر', 'success');
            
            // 6. إيقاف polling
            if (pollingInterval) {
                clearInterval(pollingInterval);
                pollingInterval = null;
            }
            
            // 8. إغلاق WebRTC
            if (pc) {
                pc.close();
                pc = null;
            }
            
            // 9. إيقاف streams
            if (localStream) {
                localStream.getTracks().forEach(t => t.stop());
                localStream = null;
            }
            
            if (remoteStream) {
                remoteStream.getTracks().forEach(t => t.stop());
                remoteStream = null;
            }
            
            // 10. تنظيف UI
            document.getElementById('localVideo').srcObject = null;
            document.getElementById('remoteVideo').srcObject = null;
            
            updateStatus('غير متصل', 'gray');
            log('تم الإنهاء ✓ (قطع مسقطة: ' + droppedChunks + ')', 'success');
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
        
        // قراءة رقم المنافسة من URL
        const urlParams = new URLSearchParams(window.location.search);
        const urlCompId = urlParams.get('comp');
        
        let pc = null;
        let localStream = null;
        let pollingInterval = null;
        
        // ملء حقل الإدخال تلقائياً من URL
        if (urlCompId) {
            document.addEventListener('DOMContentLoaded', () => {
                document.getElementById('compIdInput').value = urlCompId;
                document.getElementById('status').innerHTML = 
                    '<span class="text-green-400"><i class="fas fa-check mr-2"></i>المنافسة: ' + urlCompId + ' - شارك الشاشة ثم اضغط الانضمام</span>';
            });
        }
        
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
 * Viewer Page - المشاهد (Hybrid HLS → MSE Player)
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
            <button onclick="startMSEStream()" class="px-4 py-2 bg-green-600 rounded-lg hover:bg-green-700 transition mr-2">
                <i class="fas fa-play mr-1"></i>مباشر
            </button>
            <button onclick="loadVOD()" class="px-4 py-2 bg-purple-600 rounded-lg hover:bg-purple-700 transition mr-2">
                <i class="fas fa-film mr-1"></i>تسجيل
            </button>
            <button onclick="stopStream()" class="px-4 py-2 bg-red-600 rounded-lg hover:bg-red-700 transition">
                <i class="fas fa-stop mr-1"></i>إيقاف
            </button>
        </div>
        
        <div class="video-container aspect-video mb-4" style="position: relative;">
            <div id="modeBadge" class="mode-badge hidden"></div>
            <video id="videoPlayer1" controls autoplay playsinline style="position: absolute; width: 100%; height: 100%; transition: opacity 0.3s; opacity: 1; z-index: 2;"></video>
            <video id="videoPlayer2" autoplay playsinline style="position: absolute; width: 100%; height: 100%; transition: opacity 0.3s; opacity: 0; z-index: 1;"></video>
        </div>  
        
        <!-- Log -->
        <div id="log" class="bg-gray-900 rounded-lg p-3 h-40 overflow-y-auto text-xs font-mono"></div>
        
        <!-- Links -->
        <div class="mt-4 text-center text-sm text-gray-500">
            <a href="/test/host" class="text-purple-400 hover:underline mx-2">صفحة الـ Host</a>
            <a href="/test/guest" class="text-purple-400 hover:underline mx-2">صفحة الضيف</a>
        </div>
    </div>
    
    <script>
    // ===== إعدادات =====
    const ffmpegUrl = 'https://maelsh.pro/ffmpeg';
    const videoPlayers = [
        document.getElementById('videoPlayer1'),
        document.getElementById('videoPlayer2')
    ];
    let activePlayerIndex = 0;
    const videoPlayer = videoPlayers[0]; // للتوافق مع الكود القديم
    const modeBadge = document.getElementById('modeBadge');
    // قراءة رقم المنافسة من URL
    const urlParams = new URLSearchParams(window.location.search);
    const urlCompId = urlParams.get('comp');
    if (urlCompId) {
        document.getElementById('compIdInput').value = urlCompId;
    }
    // ===== Logging =====
    function log(msg, type = 'info') {
        const logEl = document.getElementById('log');
        const time = new Date().toLocaleTimeString();
        const div = document.createElement('div');
        div.className = 'log-entry log-' + type;
        div.textContent = '[' + time + '] ' + msg;
        logEl.appendChild(div);
        logEl.scrollTop = logEl.scrollHeight;
        while (logEl.children.length > 100) {
            logEl.removeChild(logEl.firstChild);
        }
    }
    function updateStatus(text, color) {
        document.getElementById('status').innerHTML =
            '<span class="text-' + color + '-400"><i class="fas fa-circle mr-2"></i>' + text + '</span>';
    }
    function setMode(mode, text) {
        modeBadge.classList.remove('hidden', 'mode-hls', 'mode-mse', 'mode-vod');
        if (mode === 'hls') {
            modeBadge.classList.add('mode-hls', 'pulse');
            modeBadge.innerHTML = '<i class="fas fa-broadcast-tower mr-1"></i>HLS';
        } else if (mode === 'mse') {
            modeBadge.classList.add('mode-mse', 'pulse');
            modeBadge.innerHTML = '<i class="fas fa-puzzle-piece mr-1"></i>MSE';
        } else if (mode === 'vod') {
            modeBadge.classList.add('mode-vod');
            modeBadge.innerHTML = '<i class="fas fa-film mr-1"></i>VOD';
        } else {
            modeBadge.classList.add('hidden');
        }
    }
    // ===== ChunkPlayer Class =====
    class ChunkPlayer {
        constructor(config) {
            this.config = {
                serverUrl: 'https://maelsh.pro/ffmpeg',
                mode: 'live',
                ...config
            };
            this.video = config.videoElement;
            this.playlist = null;
            this.currentChunkIndex = 0;
            this.isPlaying = false;
            this.mediaSource = null;
            this.sourceBuffer = null;
        }
        async start() {
            await this.loadPlaylist();
            if (!this.playlist || this.playlist.chunks.length === 0) {
                throw new Error('No chunks available');
            }
            const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
            if (this.playlist.extension === 'webm' && isSafari) {
                throw new Error('Safari does not support WebM chunks');
            }
            if (this.config.mode === 'vod') {
                await this.startMSEPlayback();
            } else {
                await this.startSequentialPlayback();
            }
            this.isPlaying = true;
        }
        async loadPlaylist() {
            const url = \`\${this.config.serverUrl}/playlist.php?id=\${this.config.competitionId}\`;
                const res = await fetch(url);
                if (!res.ok) throw new Error('Failed to load playlist');
                this.playlist = await res.json();
                log(\`تم تحميل \${this.playlist.chunks.length} قطعة (\${this.playlist.extension})\`);
            }
            async startSequentialPlayback() {
                this.config.onStatus?.('▶️ جار التشغيل...');
                await this.playNextChunk();
            }
            async playNextChunk() {
                if (!this.playlist) return;
                if (this.currentChunkIndex >= this.playlist.chunks.length) {
                    this.config.onStatus?.('⏸️ انتظار قطع جديدة...');
                    setTimeout(() => this.checkForNewChunks(), 2000);
                    return;
                }
                
                const chunk = this.playlist.chunks[this.currentChunkIndex];
                this.config.onChunkChange?.(this.currentChunkIndex + 1, this.playlist.chunks.length);
                
                // Double buffering logic
                const currentPlayer = videoPlayers[activePlayerIndex];
                const nextPlayerIndex = (activePlayerIndex + 1) % 2;
                const nextPlayer = videoPlayers[nextPlayerIndex];
                
                try {
                    // حمّل القطعة التالية في المشغل الخفي مسبقاً
                    if (this.currentChunkIndex + 1 < this.playlist.chunks.length) {
                        const nextChunk = this.playlist.chunks[this.currentChunkIndex + 1];
                        nextPlayer.src = nextChunk.url;
                        await nextPlayer.load();
                    }
                    
                    // شغّل القطعة الحالية
                    currentPlayer.src = chunk.url;
                    await currentPlayer.play();
                    
                    // بدّل قبل النهاية بـ 0.3s
                    currentPlayer.ontimeupdate = () => {
                        const remaining = currentPlayer.duration - currentPlayer.currentTime;
                        if (remaining < 0.3 && remaining > 0 && nextPlayer.readyState >= 3) {
                            // بدّل العرض
                            currentPlayer.style.opacity = '0';
                            currentPlayer.style.zIndex = '1';
                            nextPlayer.style.opacity = '1';
                            nextPlayer.style.zIndex = '2';
                            nextPlayer.play();
                            activePlayerIndex = nextPlayerIndex;
                        }
                    };
                    
                    currentPlayer.onended = () => {
                        this.currentChunkIndex++;
                        this.playNextChunk();
                    };
                    
                } catch (error) {
                    log('خطأ في التشغيل: ' + error.message, 'error');
                    setTimeout(() => this.playNextChunk(), 1000);
                }
            }
            async checkForNewChunks() {
                if (!this.isPlaying) return;
                try {
                    await this.loadPlaylist();
                    if (this.currentChunkIndex < this.playlist.chunks.length) {
                        this.playNextChunk();
                    } else {
                        setTimeout(() => this.checkForNewChunks(), 2000);
                    }
                } catch (error) {
                    setTimeout(() => this.checkForNewChunks(), 3000);
                }
            }
            async startMSEPlayback() {
                if (!this.playlist) return;
                const ext = this.playlist.extension;
                const mimeType = ext === 'mp4' 
                    ? 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'
                    : 'video/webm; codecs="vp8, opus"';
                if (!MediaSource.isTypeSupported(mimeType)) {
                    log('MSE غير مدعوم، استخدام sequential', 'warn');
                    return this.startSequentialPlayback();
                }
                this.mediaSource = new MediaSource();
                this.video.src = URL.createObjectURL(this.mediaSource);
                this.mediaSource.addEventListener('sourceopen', async () => {
                    try {
                        this.sourceBuffer = this.mediaSource.addSourceBuffer(mimeType);
                        this.config.onStatus?.('⬇️ جار تحميل القطع...');
                        for (let i = 0; i < this.playlist.chunks.length; i++) {
                            await this.appendChunk(i);
                            this.config.onChunkChange?.(i + 1, this.playlist.chunks.length);
                        }
                        this.mediaSource.endOfStream();
                        this.config.onStatus?.('✅ جاهز للتشغيل');
                        this.video.play();
                    } catch (error) {
                        this.config.onError?.(error);
                    }
                });
            }
            async appendChunk(index) {
                if (!this.sourceBuffer || !this.playlist) return;
                const chunk = this.playlist.chunks[index];
                const res = await fetch(chunk.url);
                const arrayBuffer = await res.arrayBuffer();
                return new Promise((resolve, reject) => {
                    if (!this.sourceBuffer) {
                        reject(new Error('No source buffer'));
                        return;
                    }
                    const doAppend = () => {
                        try {
                            this.sourceBuffer.appendBuffer(arrayBuffer);
                            this.sourceBuffer.addEventListener('updateend', () => resolve(), { once: true });
                            this.sourceBuffer.addEventListener('error', () => reject(new Error('Buffer error')), { once: true });
                        } catch (error) {
                            reject(error);
                        }
                    };
                    if (this.sourceBuffer.updating) {
                        this.sourceBuffer.addEventListener('updateend', doAppend, { once: true });
                    } else {
                        doAppend();
                    }
                });
            }
            stop() {
                this.isPlaying = false;
                this.video.pause();
                this.video.src = '';
                if (this.mediaSource && this.mediaSource.readyState === 'open') {
                    this.mediaSource.endOfStream();
                }
                this.mediaSource = null;
                this.sourceBuffer = null;
            }
        }
        
        // ===== Viewer State =====
        let player = null;
        let compId = null;
        
        // ===== البث المباشر =====
        async function startMSEStream() {
            compId = document.getElementById('compIdInput').value.trim();
            if (!compId) {
                updateStatus('أدخل رقم المنافسة!', 'red');
                return;
            }
            stopStream();
            history.replaceState(null, '', window.location.pathname + '?comp=' + compId);
            player = new ChunkPlayer({
                competitionId: compId,
                videoElement: videoPlayer,
                mode: 'live',
                onChunkChange: (index, total) => {
                    document.getElementById('statsInfo').textContent = \`القطعة \${index}/\${total}\`;
                },
                onStatus: (status) => updateStatus(status, 'yellow'),
                onError: (error) => log('خطأ: ' + error.message, 'error')
            });
            try {
                log('بدء البث المباشر للمنافسة: ' + compId);
                updateStatus('جار التحميل...', 'yellow');
                await player.start();
                updateStatus('البث مباشر ●', 'green');
                setMode('mse', 'Sequential Live');
            } catch (error) {
                log('فشل بدء البث: ' + error.message, 'error');
                updateStatus('خطأ', 'red');
            }
        }
        
        // ===== VOD =====
        async function loadVOD() {
            compId = document.getElementById('compIdInput').value.trim();
            if (!compId) {
                updateStatus('أدخل رقم المنافسة!', 'red');
                return;
            }
            stopStream();
            player = new ChunkPlayer({
                competitionId: compId,
                videoElement: videoPlayer,
                mode: 'vod',
                onChunkChange: (index, total) => {
                    document.getElementById('statsInfo').textContent = \`القطعة \${index}/\${total}\`;
                },
                onStatus: (status) => updateStatus(status, 'purple'),
                onError: (error) => log('خطأ: ' + error.message, 'error')
            });
            try {
                log('تحميل التسجيل للمنافسة: ' + compId);
                updateStatus('جار التحميل...', 'purple');
                await player.start();
                updateStatus('التسجيل جاهز', 'purple');
                setMode('vod', 'MSE VOD');
            } catch (error) {
                log('فشل تحميل التسجيل: ' + error.message, 'error');
                updateStatus('خطأ', 'red');
            }
        }
        
        // ===== Stop =====
        function stopStream() {
            if (player) {
                player.stop();
                player = null;
            }
            videoPlayer.src = '';
            setMode('idle');
            log('تم إيقاف التشغيل');
        }
        
        // ===== تهيئة =====
        window.addEventListener('beforeunload', stopStream);
        log('🎬 صفحة المشاهد جاهزة - ChunkPlayer');
        updateStatus('أدخل رقم المنافسة', 'blue');
        setMode('idle');
</script>
</body>
</html>    `;

    return c.html(html);
};
