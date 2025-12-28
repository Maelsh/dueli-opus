/**
 * Guest Page Client Script
 * الـ JavaScript الخاص بصفحة الضيف
 */

import { STREAM_SERVER_URL, TEST_ROOM_ID } from '../server/core';
import type { Language } from '../../../../../config/types';
import { translations, getUILanguage } from '../../../../../i18n';

/**
 * Get Guest Script - توليد الـ JavaScript الخاص بصفحة الضيف
 */
export function getGuestScript(lang: Language): string {
    const tr = translations[getUILanguage(lang)];

    return `
        // ===== Guest Page Script =====
        const { testLog: log, updateStatus, detectDeviceCapabilities, toggleFullscreen, toggleLocalVideoVisibility } = window;
        
        const roomId = '${TEST_ROOM_ID}';
        const streamServerUrl = '${STREAM_SERVER_URL}';
        
        // قراءة رقم المنافسة من URL
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
        let isConnected = false;
        
        // ملء حقل الإدخال تلقائياً من URL
        if (urlCompId) {
            document.getElementById('compIdInput').value = urlCompId;
            updateStatus('${tr.competition_number}: ' + urlCompId + ' - ${tr.share_then_join}', 'green');
        }
        
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
                updateStatus('${tr.share_screen} ✓', 'green');
                
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
            updateStatus('${tr.toggle_camera}', 'yellow');
            
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
                updateStatus('${tr.toggle_camera} ✓ - ${tr.join}', 'green');
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
            document.getElementById('joinBtn').classList.toggle('hidden', connected);
            document.getElementById('reconnectBtn').classList.toggle('hidden', !connected);
        }
        
        // ===== Join Room =====
        window.joinRoom = async function() {
            const compIdInput = document.getElementById('compIdInput');
            const competitionId = compIdInput.value.trim();
            
            if (!competitionId) {
                log('${tr.enter_number}!', 'error');
                updateStatus('${tr.enter_number}!', 'red');
                return;
            }
            
            if (!localStream) {
                log('${tr.share_screen}!', 'warn');
                return;
            }
            
            updateStatus('${tr.join}: ' + competitionId + '...', 'yellow');
            
            try {
                const actualRoom = 'comp_' + competitionId;
                await fetch(streamServerUrl + '/api/signaling/room/join', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ room_id: actualRoom, user_id: 999, role: 'opponent' })
                });
                window.actualRoomId = actualRoom;
            } catch (err) {
                log('${tr.error}: ' + err.message, 'error');
            }
            
            pc = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'turn:maelsh.pro:3000?transport=tcp', username: 'dueli', credential: 'dueli-turn-secret-2024' },
                    { urls: 'turn:maelsh.pro:3000', username: 'dueli', credential: 'dueli-turn-secret-2024' }
                ]
            });
            
            localStream.getTracks().forEach(function(track) { pc.addTrack(track, localStream); });
            
            pc.ontrack = function(event) {
                if (event.streams[0]) {
                    document.getElementById('remoteVideo').srcObject = event.streams[0];
                    updateStatus('${tr.live} ✓', 'green');
                }
            };
            
            pc.onicecandidate = async function(event) {
                if (event.candidate) await sendSignal('ice', event.candidate);
            };
            
            pc.onconnectionstatechange = function() {
                log('📡 ' + pc.connectionState, pc.connectionState === 'connected' ? 'success' : 'info');
                if (pc.connectionState === 'connected') {
                    updateStatus('${tr.live} ✓', 'green');
                    updateConnectionButtons(true);
                } else if (pc.connectionState === 'failed') {
                    updateStatus('${tr.error}', 'red');
                    updateConnectionButtons(false);
                }
            };
            
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
                        from_role: 'opponent',
                        signal_type: type,
                        signal_data: data
                    })
                });
            } catch (err) {}
        }
        
        function startPolling() {
            pollingInterval = setInterval(async function() {
                try {
                    const res = await fetch(streamServerUrl + '/api/signaling/poll?room_id=' + (window.actualRoomId || roomId) + '&role=opponent');
                    const data = await res.json();
                    if (data.success && data.data && data.data.signals) {
                        for (const signal of data.data.signals) {
                            if (signal.type === 'offer') {
                                await pc.setRemoteDescription(new RTCSessionDescription(signal.data));
                                const answer = await pc.createAnswer();
                                await pc.setLocalDescription(answer);
                                await sendSignal('answer', answer);
                            } else if (signal.type === 'ice') {
                                await pc.addIceCandidate(new RTCIceCandidate(signal.data));
                            }
                        }
                    }
                } catch (err) {}
            }, 1000);
        }
        
        // ===== Reconnect & Disconnect =====
        window.reconnect = async function() {
            log('${tr.reconnect}...', 'info');
            if (pc) { pc.close(); pc = null; }
            if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
            document.getElementById('remoteVideo').srcObject = null;
            setTimeout(function() { if (localStream) window.joinRoom(); }, 1000);
        }
        
        window.disconnect = function() {
            log('${tr.disconnect}...');
            if (pollingInterval) clearInterval(pollingInterval);
            if (pc) pc.close();
            if (localStream) localStream.getTracks().forEach(function(t) { t.stop(); });
            document.getElementById('localVideo').srcObject = null;
            document.getElementById('remoteVideo').srcObject = null;
            updateStatus('${tr.disconnect}', 'gray');
            log('${tr.disconnect} ✓', 'success');
        }
        
        // Init
        log('${tr.page_loaded}');
        if (!urlCompId) updateStatus('${tr.share_then_join}', 'blue');
    `;
}
