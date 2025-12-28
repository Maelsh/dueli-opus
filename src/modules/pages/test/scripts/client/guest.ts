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
        (function() {
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
        
        // Use shared state from window.mediaState
        const state = window.mediaState;
        
        // ملء حقل الإدخال تلقائياً من URL
        if (urlCompId) {
            document.getElementById('compIdInput').value = urlCompId;
            updateStatus('${tr.competition_number}: ' + urlCompId + ' - ${tr.share_then_join}', 'green');
        }
                // ===== Media Functions (from shared.ts) =====
        // shareScreen, useCamera, toggleScreen, toggleCamera, switchCamera
        // toggleMic, toggleSpeaker, toggleLocalVideo, updateButtonStates, updateConnectionButtons
        
        // Set mobile alternative callback for translated messages
        window._showMobileAlternativeCallback = function() {
            updateStatus('${tr.toggle_camera}', 'yellow');
            window.showMobileAlternative('${tr.toggle_camera}', '${tr.switch_camera}');
        };
        
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
                    handleConnectionFailure();
                }
            };
            
            startPolling();
        }
        
        // ===== Handle Connection Failure =====
        function handleConnectionFailure() {
            log('🔄 Cleaning failed connection...', 'warn');
            
            if (pc) {
                pc.close();
                pc = null;
            }
            
            if (pollingInterval) {
                clearInterval(pollingInterval);
                pollingInterval = null;
            }
            
            log('✅ Ready to reconnect - press join', 'info');
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
        })();
    `;
}
