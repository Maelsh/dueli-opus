/**
 * Test Host Page
 * صفحة المضيف - WebRTC + Recording + Upload
 */

import type { Context } from 'hono';
import type { Bindings, Variables } from '../../../config/types';

export const testHostPage = async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
    const streamServerUrl = 'https://stream.maelsh.pro';
    const testRoomId = 'test_room_001';

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
        
        <!-- Quality & Latency -->
        <div class="flex justify-between items-center bg-gray-900 rounded-lg p-3 mb-4 text-sm">
            <div id="latencyGauge"><span class="text-gray-400">● انتظار...</span></div>
            <div id="qualityInfo" class="text-gray-400">الجودة: --</div>
        </div>
        
        <!-- Videos -->
        <div class="grid grid-cols-2 gap-2 mb-4">
            <div class="video-container aspect-video">
                <video id="localVideo" autoplay muted playsinline class="w-full h-full"></video>
            </div>
            <div class="video-container aspect-video">
                <video id="remoteVideo" autoplay playsinline class="w-full h-full"></video>
            </div>
        </div>
        
        <!-- Controls -->
        <div class="grid grid-cols-3 gap-2 mb-4">
            <button id="startBtn" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 rounded-lg" onclick="start()">
                <i class="fas fa-play mr-1"></i>بدء البث
            </button>
            <button id="stopBtn" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg" onclick="stop()" disabled>
                <i class="fas fa-stop mr-1"></i>إيقاف
            </button>
            <button onclick="disconnect()" class="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 rounded-lg">
                <i class="fas fa-sign-out-alt mr-1"></i>قطع الاتصال
            </button>
        </div>
        
        <!-- Log -->
        <div id="log" class="bg-gray-900 rounded-lg p-3 h-40 overflow-y-auto text-xs font-mono"></div>
        
        <!-- Links -->
        <div class="mt-4 text-center text-sm text-gray-500">
            <a href="/test" class="text-purple-400 hover:underline mx-2">← العودة</a>
            <a href="/test/guest" class="text-purple-400 hover:underline mx-2">صفحة الضيف</a>
            <a href="/test/viewer" class="text-purple-400 hover:underline mx-2">صفحة المشاهد</a>
        </div>
    </div>

    <script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>
    <script type="module">
        import { UploadQueue, drawVideoProportional, log } from './core.ts';

        const streamServerUrl = '${streamServerUrl}';
        const testRoomId = '${testRoomId}';
        
        // Generate competition ID
        const competitionId = Date.now().toString();
        document.getElementById('compIdDisplay').textContent = 'رقم المنافسة: ' + competitionId;

        // Global state
        let localStream = null;
        let remoteStream = null;
        let peerConnection = null;
        let socket = null;
        let mediaRecorder = null;
        let uploadQueue = null;
        let chunkIndex = 0;
        let recordingInterval = null;

        // Canvas recording
        const CANVAS_WIDTH = 1280;
        const CANVAS_HEIGHT = 720;

        // Initialize socket
        socket = io(streamServerUrl);
        
        socket.on('connect', () => {
            log('✅ اتصال بالسيرفر نجح');
            socket.emit('join-room', { roomId: testRoomId, role: 'host' });
        });

        socket.on('guest-joined', () => {
            log('🎉 ضيف انضم للغرفة');
            createOffer();
        });

        socket.on('offer', async (data) => {
            log('📥 استلام offer');
            await handleOffer(data.offer);
        });

        socket.on('answer', async (data) => {
            log('📥 استلام answer');
            await peerConnection.setRemoteDescription(data.answer);
        });

        socket.on('ice-candidate', async (data) => {
            await peerConnection.addIceCandidate(data.candidate);
        });

        // Get local stream
        async function initLocalStream() {
            try {
                localStream = await navigator.mediaDevices.getUserMedia({
                    video: { width: 1280, height: 720 },
                    audio: true
                });
                document.getElementById('localVideo').srcObject = localStream;
                log('✅ Camera & microphone ready');
            } catch (error) {
                log('خطأ في الوصول للكاميرا: ' + error.message, 'error');
            }
        }

        // Create peer connection
        function createPeerConnection() {
            peerConnection = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });

            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });

            peerConnection.ontrack = (event) => {
                log('📺 استلام remote stream');
                remoteStream = event.streams[0];
                document.getElementById('remoteVideo').srcObject = remoteStream;
            };

            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('ice-candidate', { roomId: testRoomId, candidate: event.candidate });
                }
            };
        }

        async function createOffer() {
            if (!peerConnection) createPeerConnection();
            
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('offer', { roomId: testRoomId, offer });
        }

        async function handleOffer(offer) {
            if (!peerConnection) createPeerConnection();
            
            await peerConnection.setRemoteDescription(offer);
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('answer', { roomId: testRoomId, answer });
        }

        // Recording with canvas
        window.start = async function() {
            if (!localStream) {
                log('انتظر تهيئة الكاميرا', 'warn');
                return;
            }

            uploadQueue = new UploadQueue(competitionId);
            chunkIndex = 0;

            // Create canvas
            const canvas = document.createElement('canvas');
            canvas.width = CANVAS_WIDTH;
            canvas.height = CANVAS_HEIGHT;
            const ctx = canvas.getContext('2d');

            const localVideo = document.getElementById('localVideo');
            const remoteVideo = document.getElementById('remoteVideo');

            // Draw frame with proportional
            function drawFrame() {
                // Background gradient
                const gradient = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                gradient.addColorStop(0, '#1a1a2e');
                gradient.addColorStop(1, '#16213e');
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

                // Logo
                ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                ctx.font = 'bold 48px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('DUELI', CANVAS_WIDTH / 2, 60);
                ctx.textAlign = 'left';

                const margin = 40;
                const videoAreaWidth = (CANVAS_WIDTH / 2) - (margin * 1.5);
                const videoAreaHeight = CANVAS_HEIGHT - (margin * 2);

                // Local (left)
                drawVideoProportional(ctx, localVideo, margin, margin, videoAreaWidth, videoAreaHeight, 'أنت');

                // Remote (right)
                drawVideoProportional(ctx, remoteVideo, (CANVAS_WIDTH / 2) + (margin / 2), margin, videoAreaWidth, videoAreaHeight, 'المنافس');
            }

            const frameInterval = Math.round(1000 / 30);
            recordingInterval = setInterval(drawFrame, frameInterval);

            // Get canvas stream
            const canvasStream = canvas.captureStream(30);
            localStream.getAudioTracks().forEach(track => canvasStream.addTrack(track));
            if (remoteStream) {
                remoteStream.getAudioTracks().forEach(track => canvasStream.addTrack(track.clone()));
            }

            // MediaRecorder
            try {
                mediaRecorder = new MediaRecorder(canvasStream, {
                    mimeType: 'video/webm;codecs=vp8,opus',
                    videoBitsPerSecond: 2000000
                });
            } catch {
                mediaRecorder = new MediaRecorder(canvasStream);
            }

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    uploadQueue.add(e.data, chunkIndex);
                    chunkIndex++;
                    log(\`📤 Chunk \${chunkIndex} queued\`);
                }
            };

            mediaRecorder.start(5000); // 5s chunks
            log('🔴 التسجيل بدأ');

            document.getElementById('startBtn').disabled = true;
            document.getElementById('stopBtn').disabled = false;
        };

        window.stop = async function() {
            if (mediaRecorder) {
                mediaRecorder.stop();
                clearInterval(recordingInterval);
            }
            if (uploadQueue) {
                await uploadQueue.waitForCompletion();
            }
            log('⏹️ التسجيل توقف');

            document.getElementById('startBtn').disabled = false;
            document.getElementById('stopBtn').disabled = true;
        };

        window.disconnect = function() {
            stop();
            if (peerConnection) peerConnection.close();
            if (socket) socket.disconnect();
            log('قطع الاتصال');
        };

        // Initialize
        initLocalStream();
        log('🎬 Host page ready');
    </script>
</body>
</html>
    `;

    return c.html(html);
};
