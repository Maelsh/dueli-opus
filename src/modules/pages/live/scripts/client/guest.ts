/**
 * Guest Page Client Script
 * الـ JavaScript الخاص بصفحة الضيف
 */

import { STREAM_SERVER_URL, TEST_ROOM_ID, ICE_SERVERS } from '../server/core';
import type { Language } from '../../../../../config/types';
import { translations, getUILanguage } from '../../../../../i18n';

/**
 * Get Guest Script - توليد الـ JavaScript الخاص بصفحة الضيف
 */
export function getGuestScript(lang: Language): string {
    const tr = translations[getUILanguage(lang)];
    const iceServersJson = JSON.stringify(ICE_SERVERS);

    return `
        (function() {
        // ===== Guest Page Script =====
        const { testLog: log, updateStatus, detectDeviceCapabilities, toggleFullscreen, toggleLocalVideoVisibility, updateConnectionButtons } = window;
        const ms = window.mediaState;
        
        const roomId = '${TEST_ROOM_ID}';
        const streamServerUrl = '${STREAM_SERVER_URL}';
        const iceServers = ${iceServersJson};
        
        // قراءة رقم المنافسة من URL
        const urlParams = new URLSearchParams(window.location.search);
        const urlCompId = urlParams.get('comp');
        
        // ملء حقل الإدخال تلقائياً من URL
        if (urlCompId) {
            document.getElementById('compIdInput').value = urlCompId;
            updateStatus('${tr.competition_number}: ' + urlCompId + ' - ${tr.share_then_join}', 'green');
        }
        
        // Set mobile alternative callback for translated messages
        window._showMobileAlternativeCallback = function() {
            updateStatus('${tr.toggle_camera}', 'yellow');
            window.showMobileAlternative('${tr.toggle_camera}', '${tr.switch_camera}');
        };
        
        // Flag to prevent double clicks
        let isJoining = false;
        // تخزين ICE candidates حتى يتم setRemoteDescription
        let pendingIceCandidates = [];
        let hasRemoteDescription = false;

        // ===== Join Room =====
        window.joinRoom = async function() {
            if (isJoining) return;
            
            console.log('[DEBUG] window.joinRoom called');
            console.log('[DEBUG] ms.localStream:', ms.localStream);
            
            const compIdInput = document.getElementById('compIdInput');
            const competitionId = compIdInput.value.trim();
            
            if (!competitionId) {
                log('${tr.enter_number}!', 'error');
                updateStatus('${tr.enter_number}!', 'red');
                return;
            }
            
            if (!ms.localStream) {
                log('${tr.share_screen}!', 'warn');
                console.log('[DEBUG] No localStream - exiting joinRoom');
                return;
            }
            
            isJoining = true;
            const joinBtn = document.getElementById('joinBtn');
            if (joinBtn) joinBtn.style.opacity = '0.5';
            
            updateStatus('${tr.join}: ' + competitionId + '...', 'yellow');
            
            const token = window.getSessionToken();
            if (!token) {
                log('❌ يجب تسجيل الدخول أولاً', 'error');
                isJoining = false;
                if (joinBtn) joinBtn.style.opacity = '1';
                return;
            }
            
            const actualRoom = 'comp_' + competitionId;
            window.actualRoomId = actualRoom;
            
            // Fetch ICE servers dynamically
            const dynamicIceServers = await window.fetchIceServers();
            
            ms.pc = new RTCPeerConnection({
                iceServers: dynamicIceServers
            });
            console.log('[DEBUG] pc created:', ms.pc);
            
            // Add local tracks
            ms.localStream.getTracks().forEach(function(track) { 
                ms.pc.addTrack(track, ms.localStream); 
                console.log('[DEBUG] Added track:', track.kind);
            });
            
            // Handle remote track
            ms.pc.ontrack = function(event) {
                console.log('[DEBUG] ontrack:', event.track.kind);
                if (event.streams[0]) {
                    document.getElementById('remoteVideo').srcObject = event.streams[0];
                    updateStatus('${tr.live} ✓', 'green');
                }
            };
            
            // Handle ICE candidates
            ms.pc.onicecandidate = async function(event) {
                if (event.candidate) {
                    // console.log('[DEBUG] ICE candidate:', event.candidate.candidate.substring(0, 50));
                    await sendSignal('ice', event.candidate);
                }
            };
            
            // Connection state
            ms.pc.onconnectionstatechange = function() {
                console.log('[DEBUG] guest onconnectionstatechange:', ms.pc.connectionState);
                log('📡 ' + ms.pc.connectionState, ms.pc.connectionState === 'connected' ? 'success' : 'info');
                
                if (ms.pc.connectionState === 'connected') {
                    console.log('[DEBUG] Guest connection successful!');
                    updateStatus('${tr.live} ✓', 'green');
                    updateConnectionButtons(true);
                    isJoining = false; // Allow future re-joins
                } else if (ms.pc.connectionState === 'failed') {
                    console.log('[DEBUG] Guest connection failed!');
                    updateStatus('${tr.error}', 'red');
                    updateConnectionButtons(false);
                    isJoining = false;
                    const joinBtn = document.getElementById('joinBtn');
                    if (joinBtn) joinBtn.style.opacity = '1';
                    handleConnectionFailure();
                }
            };
            
            ms.pc.oniceconnectionstatechange = function() {
                console.log('[DEBUG] ICE connection state:', ms.pc.iceConnectionState);
            };
            
            // Setup WebSocket signaling
            signalingManager = new window.SignalingManager({
                signalingUrl: streamServerUrl,
                roomId: actualRoom,
                role: 'opponent',
                token: token,
                onSignal: async function(data) {
                    try {
                        if (data.signalType === 'offer') {
                            console.log('[DEBUG] Processing OFFER signal');
                            await ms.pc.setRemoteDescription(new RTCSessionDescription(data.signalData));
                            hasRemoteDescription = true;
                            
                            // معالجة ICE candidates المعلقة
                            while (pendingIceCandidates.length > 0) {
                                const ice = pendingIceCandidates.shift();
                                await ms.pc.addIceCandidate(new RTCIceCandidate(ice));
                                console.log('[DEBUG] Added pending ICE candidate');
                            }
                            
                            const answer = await ms.pc.createAnswer();
                            await ms.pc.setLocalDescription(answer);
                            sendSignal('answer', answer);
                            console.log('[DEBUG] Sent ANSWER');
                        } else if (data.signalType === 'ice') {
                            if (hasRemoteDescription) {
                                await ms.pc.addIceCandidate(new RTCIceCandidate(data.signalData));
                            } else {
                                // تخزين ICE حتى يتم setRemoteDescription
                                pendingIceCandidates.push(data.signalData);
                                console.log('[DEBUG] Queued ICE candidate (waiting for offer)');
                            }
                        }
                    } catch (err) {
                        console.error('[Signaling] Error:', err);
                    }
                },
                onPeerJoined: function(data) {
                    log('👋 المضيف متصل', 'success');
                },
                onPeerLeft: function(data) {
                    log('👋 المضيف غادر', 'warn');
                },
                onError: function(error) {
                    log('❌ خطأ في الاتصال', 'error');
                },
                onConnected: function() {
                    // طلب Offer من المضيف بعد اكتمال الاتصال
                    console.log('[DEBUG] Connected - requesting offer from host');
                    sendSignal('request_offer', {});
                }
            });
            
            signalingManager.connect();
        }
        
        // ===== Handle Connection Failure =====
        function handleConnectionFailure() {
            log('🔄 Cleaning failed connection...', 'warn');
            
            if (ms.pc) {
                ms.pc.close();
                ms.pc = null;
            }
            
            if (ms.pollingInterval) {
                clearInterval(ms.pollingInterval);
                ms.pollingInterval = null;
            }
            
            log('✅ Ready to reconnect - press join', 'info');
        }
        
        // ===== Signaling (WebSocket) =====
        let signalingManager = null;
        
        function sendSignal(type, data) {
            if (signalingManager) {
                signalingManager.sendSignal(type, data);
            }
        }
        
        // ===== Reconnect & Disconnect =====
        window.reconnect = async function() {
            log('${tr.reconnect}...', 'info');
            if (ms.pc) { ms.pc.close(); ms.pc = null; }
            if (ms.pollingInterval) { clearInterval(ms.pollingInterval); ms.pollingInterval = null; }
            document.getElementById('remoteVideo').srcObject = null;
            setTimeout(function() { if (ms.localStream) window.joinRoom(); }, 1000);
        }
        
        window.disconnect = function() {
            log('${tr.disconnect}...');
            if (signalingManager) signalingManager.disconnect();
            if (ms.pc) ms.pc.close();
            if (ms.localStream) ms.localStream.getTracks().forEach(function(t) { t.stop(); });
            ms.localStream = null;
            ms.pc = null;
            signalingManager = null;
            document.getElementById('localVideo').srcObject = null;
            document.getElementById('remoteVideo').srcObject = null;
            updateStatus('${tr.disconnect}', 'gray');
            log('${tr.disconnect} ✓', 'success');
            updateConnectionButtons(false);
        }
        
        // Init
        log('${tr.page_loaded}');
        if (!urlCompId) updateStatus('${tr.share_then_join}', 'blue');
        })();
    `;
}

