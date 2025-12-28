/**
 * Host Page Client Script
 * الـ JavaScript الخاص بصفحة المضيف
 */

import { STREAM_SERVER_URL, TEST_ROOM_ID, FFMPEG_URL } from '../server/core';
import type { Language } from '../../../../../config/types';
import { translations, getUILanguage } from '../../../../../i18n';

/**
 * Get Host Script - توليد الـ JavaScript الخاص بصفحة المضيف
 */
export function getHostScript(lang: Language): string {
    const tr = translations[getUILanguage(lang)];

    return `
        (function() {
        // ===== Host Page Script =====
        const { testLog: log, updateStatus, detectDeviceCapabilities, qualityPresets, toggleFullscreen, toggleLocalVideoVisibility } = window;
        
        const roomId = '${TEST_ROOM_ID}';
        const role = 'host';
        const streamServerUrl = '${STREAM_SERVER_URL}';
        const ffmpegUrl = '${FFMPEG_URL}';
        
        // Global state
        let pc = null;
        let localStream = null;
        let remoteStream = new MediaStream();
        let pollingInterval = null;
        let mediaRecorder = null;
        let chunkIndex = 0;
        
        // قراءة رقم المنافسة من URL أو إنشاء عشوائي
        const urlParams = new URLSearchParams(window.location.search);
        let competitionId = urlParams.get('comp') ? parseInt(urlParams.get('comp')) : Math.floor(Math.random() * 900000 + 100000);
        
        if (!urlParams.get('comp')) {
            history.replaceState(null, '', window.location.pathname + '?comp=' + competitionId + '&lang=${lang}');
        }
        
        // إظهار رقم المنافسة مع الروابط
        const baseUrl = window.location.origin;
        const guestLink = baseUrl + '/test/guest?comp=' + competitionId + '&lang=${lang}';
        const viewerLink = baseUrl + '/test/viewer?comp=' + competitionId + '&lang=${lang}';
        
        document.getElementById('compIdDisplay').innerHTML = 
            '${tr.competition_number}: <strong>' + competitionId + '</strong><br>' +
            '<small class="text-gray-600 dark:text-gray-400">' +
            '👤 <a href="' + guestLink + '" class="text-blue-600 dark:text-blue-400 hover:underline" target="_blank">${tr.guest}</a> | ' +
            '👁️ <a href="' + viewerLink + '" class="text-purple-600 dark:text-purple-400 hover:underline" target="_blank">${tr.viewer}</a>' +
            '</small>';
        
        log('${tr.page_loaded} - ${tr.competition_number}: ' + competitionId);
        
        // Quality & Recording state
        const localQualityPresets = qualityPresets || {
            excellent: { name: '${tr.quality} ممتاز', width: 1280, height: 360, fps: 30, segment: 4000, bitrate: 2000000 },
            good:      { name: '${tr.quality} جيد', width: 854,  height: 240, fps: 24, segment: 6000, bitrate: 1000000 },
            medium:    { name: '${tr.quality} متوسط', width: 640,  height: 180, fps: 15, segment: 10000, bitrate: 500000 },
            low:       { name: '${tr.quality} منخفض', width: 426,  height: 120, fps: 10, segment: 20000, bitrate: 250000 },
            minimal:   { name: '${tr.quality} أدنى', width: 320,  height: 90,  fps: 10, segment: 30000, bitrate: 150000 }
        };
        
        let currentQuality = localQualityPresets.medium;
        let uploadQueue = [];
        let isUploading = false;
        let segmentInterval = null;
        let drawInterval = null;
        let droppedChunks = 0;
        
        // حالة الأزرار
        let isScreenSharing = false;
        let isCameraOn = false;
        let currentFacing = 'user';
        let isMicOn = true;
        let isSpeakerOn = true;
        let isConnected = false;
        
        // ===== Share Screen =====
        window.shareScreen = async function() {
            const caps = detectDeviceCapabilities();
            
            if (caps.isMobile || !caps.supportsScreenShare) {
                log('${tr.share_screen} - ${tr.error}', 'warn');
                showMobileAlternative();
                return;
            }
            
            try {
                log('${tr.share_screen}...');
                localStream = await navigator.mediaDevices.getDisplayMedia({
                    video: { cursor: 'always' },
                    audio: true
                });
                
                document.getElementById('localVideo').srcObject = localStream;
                log('${tr.share_screen} ✓', 'success');
                updateStatus('${tr.share_screen} ✓ - ${tr.connect}', 'green');
                
                localStream.getVideoTracks()[0].onended = function() {
                    log('${tr.share_screen} - ${tr.stop_watching}', 'warn');
                    updateStatus('${tr.share_then_join}', 'yellow');
                };
            } catch (err) {
                log('${tr.error}: ' + err.message, 'warn');
                showMobileAlternative();
            }
        }
        
        // ===== Mobile Alternative =====
        function showMobileAlternative() {
            updateStatus('${tr.toggle_camera} 📹', 'yellow');
            
            let cameraBtns = document.getElementById('cameraButtons');
            if (!cameraBtns) {
                cameraBtns = document.createElement('div');
                cameraBtns.id = 'cameraButtons';
                cameraBtns.className = 'flex flex-wrap gap-2 justify-center mb-4';
                
                const frontBtn = document.createElement('button');
                frontBtn.className = 'px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition';
                frontBtn.innerHTML = '<i class="fas fa-camera mr-2"></i>${tr.toggle_camera}';
                frontBtn.onclick = function() { window.useCamera('user'); };
                
                const backBtn = document.createElement('button');
                backBtn.className = 'px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition';
                backBtn.innerHTML = '<i class="fas fa-camera-retro mr-2"></i>${tr.switch_camera}';
                backBtn.onclick = function() { window.useCamera('environment'); };
                
                cameraBtns.appendChild(frontBtn);
                cameraBtns.appendChild(backBtn);
                
                const controlsDiv = document.querySelector('.flex.flex-wrap.gap-2.justify-center.mb-4');
                if (controlsDiv && controlsDiv.parentElement) {
                    controlsDiv.parentElement.insertBefore(cameraBtns, controlsDiv);
                }
            }
            cameraBtns.style.display = 'flex';
        }
        
        // ===== Use Camera =====
        window.useCamera = async function(facingMode) {
            try {
                log('${tr.toggle_camera}...');
                
                const oldStream = localStream;
                const newStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
                    audio: true
                });
                
                if (pc && pc.connectionState === 'connected') {
                    const senders = pc.getSenders();
                    const videoSender = senders.find(function(s) { return s.track && s.track.kind === 'video'; });
                    const audioSender = senders.find(function(s) { return s.track && s.track.kind === 'audio'; });
                    
                    if (videoSender) await videoSender.replaceTrack(newStream.getVideoTracks()[0]);
                    if (audioSender) await audioSender.replaceTrack(newStream.getAudioTracks()[0]);
                }
                
                if (oldStream) oldStream.getTracks().forEach(function(t) { t.stop(); });
                
                localStream = newStream;
                document.getElementById('localVideo').srcObject = localStream;
                
                const cameraBtns = document.getElementById('cameraButtons');
                if (cameraBtns) cameraBtns.style.display = 'none';
                
                isCameraOn = true;
                isScreenSharing = false;
                currentFacing = facingMode;
                
                log('${tr.toggle_camera} ✓', 'success');
                updateStatus('${tr.toggle_camera} ✓ - ${tr.connect}', 'green');
            } catch (err) {
                log('${tr.error}: ' + err.message, 'error');
            }
        }
        
        // ===== Toggle Functions =====
        window.toggleScreen = async function() {
            if (isScreenSharing) {
                if (localStream) localStream.getTracks().forEach(function(t) { t.stop(); });
                localStream = null;
                document.getElementById('localVideo').srcObject = null;
                isScreenSharing = false;
                isCameraOn = false;
                log('${tr.stop_watching}', 'info');
            } else {
                await window.shareScreen();
                if (localStream) {
                    isScreenSharing = true;
                    isCameraOn = false;
                }
            }
            updateButtonStates();
        }
        
        window.toggleCamera = async function() {
            if (isCameraOn) {
                if (localStream) localStream.getTracks().forEach(function(t) { t.stop(); });
                localStream = null;
                document.getElementById('localVideo').srcObject = null;
                isCameraOn = false;
                isScreenSharing = false;
                log('${tr.stop_watching}', 'info');
            } else {
                await window.useCamera(currentFacing);
                if (localStream) {
                    isCameraOn = true;
                    isScreenSharing = false;
                }
            }
            updateButtonStates();
        }
        
        window.switchCamera = async function() {
            if (!localStream || isScreenSharing) return;
            currentFacing = currentFacing === 'user' ? 'environment' : 'user';
            await window.useCamera(currentFacing);
        }
        
        window.toggleMic = function() {
            if (!localStream) return;
            isMicOn = !isMicOn;
            localStream.getAudioTracks().forEach(function(track) { track.enabled = isMicOn; });
            document.getElementById('micIcon').className = isMicOn ? 'fas fa-microphone text-white' : 'fas fa-microphone-slash text-white';
            log('${tr.toggle_mic}', 'info');
        }
        
        window.toggleSpeaker = function() {
            const remoteVideo = document.getElementById('remoteVideo');
            isSpeakerOn = !isSpeakerOn;
            remoteVideo.muted = !isSpeakerOn;
            document.getElementById('speakerIcon').className = isSpeakerOn ? 'fas fa-volume-up text-white' : 'fas fa-volume-mute text-white';
        }
        
        window.toggleLocalVideo = function() {
            toggleLocalVideoVisibility();
        }
        
        function updateButtonStates() {
            const screenBtn = document.getElementById('screenBtn');
            const cameraBtn = document.getElementById('cameraBtn');
            const cameraIcon = document.getElementById('cameraIcon');
            
            if (screenBtn) {
                screenBtn.classList.toggle('bg-blue-800', isScreenSharing);
                screenBtn.classList.toggle('bg-blue-600', !isScreenSharing);
            }
            if (cameraBtn) {
                cameraBtn.classList.toggle('bg-purple-800', isCameraOn);
                cameraBtn.classList.toggle('bg-purple-600', !isCameraOn);
            }
            if (cameraIcon) {
                cameraIcon.className = isCameraOn ? 'fas fa-video text-white' : 'fas fa-video-slash text-white';
            }
        }
        
        function updateConnectionButtons(connected) {
            isConnected = connected;
            document.getElementById('connectBtn').classList.toggle('hidden', connected);
            document.getElementById('reconnectBtn').classList.toggle('hidden', !connected);
            document.getElementById('disconnectBtn').classList.toggle('hidden', !connected);
        }
        
        // ===== Connection =====
        async function createRoom() {
            try {
                log('${tr.loading}...');
                const res = await fetch(streamServerUrl + '/api/signaling/room/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ competition_id: competitionId.toString(), user_id: 1 })
                });
                const data = await res.json();
                if (data.success && data.data.room_id) window.actualRoomId = data.data.room_id;
                return data.success;
            } catch (err) {
                log('${tr.error}: ' + err.message, 'error');
                return false;
            }
        }
        
        window.connect = async function() {
            if (!localStream) {
                log('${tr.share_screen}!', 'warn');
                return;
            }
            
            updateStatus('${tr.connect}...', 'yellow');
            await createRoom();
            
            pc = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'turn:maelsh.pro:3000?transport=tcp', username: 'dueli', credential: 'dueli-turn-secret-2024' },
                    { urls: 'turn:maelsh.pro:3000', username: 'dueli', credential: 'dueli-turn-secret-2024' }
                ]
            });
            
            localStream.getTracks().forEach(function(track) { pc.addTrack(track, localStream); });
            
            pc.ontrack = function(event) {
                if (!remoteStream.getTracks().find(function(t) { return t.id === event.track.id; })) {
                    remoteStream.addTrack(event.track);
                }
                document.getElementById('remoteVideo').srcObject = remoteStream;
                if (event.track.kind === 'audio') updateStatus('${tr.live} ✓', 'green');
            };
            
            pc.onicecandidate = async function(event) {
                if (event.candidate) await sendSignal('ice', event.candidate);
            };
            
            pc.onconnectionstatechange = function() {
                log('📡 ' + pc.connectionState, pc.connectionState === 'connected' ? 'success' : 'info');
                if (pc.connectionState === 'connected') {
                    updateStatus('${tr.live} ✓', 'green');
                    updateConnectionButtons(true);
                    startRecording();
                } else if (pc.connectionState === 'failed') {
                    updateStatus('${tr.error}', 'red');
                    updateConnectionButtons(false);
                }
            };
            
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await sendSignal('offer', offer);
            startPolling();
        }
        
        // ===== Signaling =====
        async function sendSignal(type, data) {
            try {
                await fetch(streamServerUrl + '/api/signaling/signal', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        room_id: window.actualRoomId || roomId,
                        from_role: 'host',
                        signal_type: type,
                        signal_data: data
                    })
                });
            } catch (err) {}
        }
        
        function startPolling() {
            pollingInterval = setInterval(async function() {
                try {
                    const res = await fetch(streamServerUrl + '/api/signaling/poll?room_id=' + (window.actualRoomId || roomId) + '&role=host');
                    const data = await res.json();
                    if (data.success && data.data && data.data.signals) {
                        for (const signal of data.data.signals) {
                            if (signal.type === 'answer') {
                                await pc.setRemoteDescription(new RTCSessionDescription(signal.data));
                            } else if (signal.type === 'ice') {
                                await pc.addIceCandidate(new RTCIceCandidate(signal.data));
                            }
                        }
                    }
                } catch (err) {}
            }, 1000);
        }
        
        // ===== Recording =====
        async function startRecording() {
            if (!localStream || mediaRecorder) return;
            
            log('${tr.canvas_recording}...');
            updateQualityInfo();
            
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
            
            // اللغة والاتجاه
            const isRTL = '${lang}' === 'ar';
            const platformName = isRTL ? 'دويلي' : 'Dueli';
            
            // دالة رسم الفيديو بشكل متناسب
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
                borderGradient.addColorStop(0, '#9333ea'); // purple-600
                borderGradient.addColorStop(1, '#f59e0b'); // amber-500
                ctx.strokeStyle = borderGradient;
                ctx.lineWidth = 3;
                ctx.strokeRect(x, y, maxWidth, maxHeight);
            }
            
            function drawFrame() {
                // خلفية متدرجة
                const gradient = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                gradient.addColorStop(0, '#1a1a2e');
                gradient.addColorStop(1, '#16213e');
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                
                // Dueli Logo + Text
                const logoSize = 40;
                const logoY = 10;
                
                if (isRTL) {
                    // RTL: النص يسار الشعار
                    const logoX = (CANVAS_WIDTH / 2) + 30;
                    
                    if (dueliLogo.complete && dueliLogo.naturalWidth > 0) {
                        ctx.drawImage(dueliLogo, logoX, logoY, logoSize, logoSize);
                    }
                    
                    const logoGradient = ctx.createLinearGradient(logoX - 100, 0, logoX, 0);
                    logoGradient.addColorStop(0, '#f59e0b');
                    logoGradient.addColorStop(1, '#9333ea');
                    ctx.fillStyle = logoGradient;
                    ctx.font = 'bold 32px Cairo, Arial';
                    ctx.textAlign = 'right';
                    ctx.fillText(platformName, logoX - 10, logoY + 32);
                } else {
                    // LTR: النص يمين الشعار
                    const logoX = (CANVAS_WIDTH / 2) - 70;
                    
                    if (dueliLogo.complete && dueliLogo.naturalWidth > 0) {
                        ctx.drawImage(dueliLogo, logoX, logoY, logoSize, logoSize);
                    }
                    
                    const logoGradient = ctx.createLinearGradient(logoX + logoSize, 0, logoX + logoSize + 100, 0);
                    logoGradient.addColorStop(0, '#9333ea');
                    logoGradient.addColorStop(1, '#f59e0b');
                    ctx.fillStyle = logoGradient;
                    ctx.font = 'bold 32px Inter, Arial';
                    ctx.textAlign = 'left';
                    ctx.fillText(platformName, logoX + logoSize + 10, logoY + 32);
                }
                
                const margin = 40;
                const videoAreaWidth = (CANVAS_WIDTH / 2) - (margin * 1.5);
                const videoAreaHeight = CANVAS_HEIGHT - (margin * 2);
                
                // رسم الفيديوهات (الترتيب حسب الاتجاه)
                if (isRTL) {
                    // RTL: المضيف يمين، الضيف يسار
                    drawVideoProportionalLocal(localVideo, (CANVAS_WIDTH / 2) + (margin / 2), margin + 20, videoAreaWidth, videoAreaHeight - 20);
                    drawVideoProportionalLocal(remoteVideo, margin, margin + 20, videoAreaWidth, videoAreaHeight - 20);
                } else {
                    // LTR: المضيف يسار، الضيف يمين
                    drawVideoProportionalLocal(localVideo, margin, margin + 20, videoAreaWidth, videoAreaHeight - 20);
                    drawVideoProportionalLocal(remoteVideo, (CANVAS_WIDTH / 2) + (margin / 2), margin + 20, videoAreaWidth, videoAreaHeight - 20);
                }
            }
            
            drawInterval = setInterval(drawFrame, Math.round(1000 / currentQuality.fps));
            
            const canvasStream = canvas.captureStream(currentQuality.fps);
            
            // دمج الصوت
            try {
                const audioContext = new AudioContext();
                const destination = audioContext.createMediaStreamDestination();
                if (localStream.getAudioTracks().length > 0) {
                    audioContext.createMediaStreamSource(localStream).connect(destination);
                    log('   ✅ ${tr.host} audio connected', 'success');
                }
                if (remoteStream && remoteStream.getAudioTracks().length > 0) {
                    audioContext.createMediaStreamSource(remoteStream).connect(destination);
                    log('   ✅ ${tr.guest} audio connected', 'success');
                }
                const mixedAudioTrack = destination.stream.getAudioTracks()[0];
                if (mixedAudioTrack) canvasStream.addTrack(mixedAudioTrack);
            } catch (e) {
                localStream.getAudioTracks().forEach(function(t) { canvasStream.addTrack(t); });
            }
            
            mediaRecorder = new MediaRecorder(canvasStream, {
                mimeType: 'video/webm;codecs=vp8,opus',
                videoBitsPerSecond: currentQuality.bitrate,
                audioBitsPerSecond: 128000
            });
            
            mediaRecorder.ondataavailable = function(e) {
                if (e.data.size > 0) {
                    uploadQueue.push({ blob: e.data, index: chunkIndex++ });
                    processUploadQueue();
                }
            };
            
            mediaRecorder.start();
            segmentInterval = setInterval(function() {
                if (mediaRecorder && mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                    mediaRecorder.start();
                    log('${tr.new_chunk} (' + currentQuality.segment/1000 + 's)', 'info');
                }
            }, currentQuality.segment);
            
            log('${tr.canvas_recording} ✅', 'success');
            updateStatus('${tr.live}...', 'green');
        }
        
        async function processUploadQueue() {
            if (isUploading || uploadQueue.length === 0) return;
            
            isUploading = true;
            const { blob, index } = uploadQueue.shift();
            
            const formData = new FormData();
            formData.append('chunk', blob, 'chunk_' + String(index).padStart(4, '0') + '.webm');
            formData.append('competition_id', competitionId.toString());
            formData.append('chunk_number', (index + 1).toString());
            formData.append('extension', 'webm');
            
            try {
                await fetch(ffmpegUrl + '/upload.php', { method: 'POST', body: formData });
                log('${tr.chunks} ' + index + ' ✓', 'success');
            } catch (err) {}
            
            isUploading = false;
            processUploadQueue();
        }
        
        function updateQualityInfo() {
            const info = document.getElementById('qualityInfo');
            if (info) info.textContent = '${tr.quality}: ' + currentQuality.name;
        }
        
        // ===== Reconnect & Disconnect =====
        window.reconnect = async function() {
            log('${tr.reconnect}...', 'info');
            if (mediaRecorder) { mediaRecorder.stop(); mediaRecorder = null; }
            if (drawInterval) { clearInterval(drawInterval); drawInterval = null; }
            if (pc) { pc.close(); pc = null; }
            if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
            remoteStream = new MediaStream();
            document.getElementById('remoteVideo').srcObject = null;
            setTimeout(function() { if (localStream) window.connect(); }, 1000);
        }
        
        window.disconnect = async function() {
            log('${tr.disconnect}...');
            if (segmentInterval) clearInterval(segmentInterval);
            if (drawInterval) clearInterval(drawInterval);
            if (mediaRecorder) mediaRecorder.stop();
            if (pollingInterval) clearInterval(pollingInterval);
            if (pc) pc.close();
            if (localStream) localStream.getTracks().forEach(function(t) { t.stop(); });
            document.getElementById('localVideo').srcObject = null;
            document.getElementById('remoteVideo').srcObject = null;
            updateStatus('${tr.disconnect}', 'gray');
            log('${tr.disconnect} ✓', 'success');
        }
        
        // Init
        const caps = detectDeviceCapabilities();
        if (caps.isMobile || !caps.supportsScreenShare) {
            updateStatus('📱 ${tr.toggle_camera}', 'blue');
        } else {
            updateStatus('${tr.share_screen}', 'blue');
        }
        })();
    `;
}
