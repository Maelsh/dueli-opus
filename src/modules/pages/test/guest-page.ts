/**
 * Test Guest Page
 * صفحة الضيف - WebRTC only
 */

import type { Context } from 'hono';
import type { Bindings, Variables } from '../../../config/types';

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
    </style>
</head>
<body class="text-white p-4">
    <div class="max-w-4xl mx-auto">
        <div class="text-center mb-6">
            <h1 class="text-3xl font-bold mb-2">🎮 اختبار البث - Guest</h1>
            <p class="text-gray-400">الطرف الثاني - ينضم للبث</p>
        </div>
        
        <!-- Status -->
        <div id="status" class="bg-gray-800 rounded-lg p-4 mb-4 text-center">
            <span class="text-yellow-400"><i class="fas fa-circle-notch fa-spin mr-2"></i>جاري التهيئة...</span>
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
        <div class="grid grid-cols-2 gap-2 mb-4">
            <button id="joinBtn" onclick="joinRoom()" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 rounded-lg">
                <i class="fas fa-sign-in-alt mr-1"></i>الانضمام
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
            <a href="/test/host" class="text-purple-400 hover:underline mx-2">صفحة الـ Host</a>
        </div>
    </div>

    <script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>
    <script type="module">
        import { log } from '/static/test-core.js';

        const streamServerUrl = 'https://stream.maelsh.pro';
        const testRoomId = 'test_room_001';
        
        let localStream = null;
        let peerConnection = null;
        let socket = null;

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
                document.getElementById('remoteVideo').srcObject = event.streams[0];
            };

            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('ice-candidate', { roomId: testRoomId, candidate: event.candidate });
                }
            };
        }

        window.joinRoom = async function() {
            if (!localStream) {
                log('انتظر تهيئة الكاميرا', 'warn');
                return;
            }

            // Initialize socket
            socket = io(streamServerUrl);
            
            socket.on('connect', () => {
                log('✅ اتصال بالسيرفر نجح');
                socket.emit('join-room', { roomId: testRoomId, role: 'guest' });
            });

            socket.on('offer', async (data) => {
                log('📥 استلام offer من المضيف');
                createPeerConnection();
                await peerConnection.setRemoteDescription(data.offer);
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                socket.emit('answer', { roomId: testRoomId, answer });
                log('📤 إرسال answer');
            });

            socket.on('ice-candidate', async (data) => {
                if (peerConnection) {
                    await peerConnection.addIceCandidate(data.candidate);
                }
            });

            log('🎮 انتظار اتصال المضيف...');
        };

        window.disconnect = function() {
            if (peerConnection) peerConnection.close();
            if (socket) socket.disconnect();
            log('قطع الاتصال');
        };

        // Initialize
        initLocalStream();
        log('🎮 Guest page ready');
    </script>
</body>
</html>
    `;

    return c.html(html);
};
