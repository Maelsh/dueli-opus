/**
 * Live Room Page - New P2P Streaming System
 * صفحة غرفة البث المباشر - نظام البث الجديد
 * 
 * Uses WebRTC P2P for competitors and HLS for viewers
 */

import type { Context } from 'hono';
import type { Bindings, Variables, Language } from '../../config/types';
import { translations, getUILanguage, isRTL as checkRTL } from '../../i18n';
import { getNavigation, getLoginModal, getFooter } from '../../shared/components';
import { generateHTML } from '../../shared/templates/layout';

/**
 * Live Room Page Handler
 */
export const liveRoomPage = async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
    const lang = c.get('lang') as Language;
    const tr = translations[getUILanguage(lang)];
    const rtl = checkRTL(lang);
    const competitionId = c.req.param('id');

    // Fetch competition details
    let competition: any = null;
    try {
        const compRes = await fetch(`${new URL(c.req.url).origin}/api/competitions/${competitionId}`);
        const compData = await compRes.json() as any;
        if (compData.success) {
            competition = compData.data;
        }
    } catch (err) {
        console.error('Failed to fetch competition:', err);
    }

    // Server URL for streaming
    const streamServerUrl = 'https://maelsh.pro/ffmpeg';

    const content = `
        ${getNavigation(lang)}
        ${getLoginModal(lang)}
        
        <div class="flex-1 bg-gray-900">
            ${competition ? `
                <div class="h-screen flex flex-col">
                    <!-- Header -->
                    <div class="bg-gray-900 px-4 py-3 flex items-center justify-between z-10 border-b border-gray-800">
                        <div class="flex items-center gap-4">
                            <a href="/competition/${competitionId}?lang=${lang}" class="text-white hover:text-gray-300 transition-colors">
                                <i class="fas fa-arrow-${rtl ? 'right' : 'left'} text-xl"></i>
                            </a>
                            <div>
                                <h1 class="text-white font-bold text-lg line-clamp-1">${competition.title}</h1>
                                <div class="flex items-center gap-2 text-sm">
                                    <span class="flex items-center gap-1 text-red-500" id="liveIndicator">
                                        <span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                                        ${tr.status_live || 'LIVE'}
                                    </span>
                                    <span class="text-gray-400" id="viewerCount">0 ${tr.viewers || 'viewers'}</span>
                                    <span class="text-gray-500 hidden" id="recordingIndicator">
                                        <i class="fas fa-circle text-red-500 animate-pulse"></i>
                                        ${tr.recording || 'Recording'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="flex items-center gap-2">
                            <button onclick="shareScreen()" id="screenBtn" class="p-3 rounded-full bg-gray-800 text-white hover:bg-gray-700 transition-colors" title="${tr.share_screen || 'Share Screen'}">
                                <i class="fas fa-desktop"></i>
                            </button>
                            <button onclick="toggleAudio()" id="audioBtn" class="p-3 rounded-full bg-gray-800 text-white hover:bg-gray-700 transition-colors" title="${tr.toggle_mic || 'Toggle Microphone'}">
                                <i class="fas fa-microphone"></i>
                            </button>
                            <button onclick="toggleVideo()" id="videoBtn" class="p-3 rounded-full bg-gray-800 text-white hover:bg-gray-700 transition-colors" title="${tr.toggle_camera || 'Toggle Camera'}">
                                <i class="fas fa-video"></i>
                            </button>
                            <button onclick="endStream()" id="endBtn" class="p-3 rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors" title="${tr.end_stream || 'End Stream'}">
                                <i class="fas fa-phone-slash"></i>
                            </button>
                            <button onclick="toggleDebug()" id="debugBtn" class="p-3 rounded-full bg-gray-800 text-yellow-400 hover:bg-gray-700 transition-colors" title="Debug Panel">
                                <i class="fas fa-bug"></i>
                            </button>
                        </div>
                    </div>
                    
                    <!-- Video Container -->
                    <div class="flex-1 relative bg-black">
                        <!-- Competitor View (P2P) -->
                        <div id="competitorView" class="absolute inset-0 flex">
                            <!-- Local Video -->
                            <div class="flex-1 relative bg-gray-900 border-r border-gray-800">
                                <video id="localVideo" class="w-full h-full object-cover" autoplay muted playsinline></video>
                                <div class="absolute bottom-4 ${rtl ? 'right-4' : 'left-4'} bg-black/50 px-3 py-1 rounded-full text-white text-sm">
                                    ${tr.you || 'You'}
                                </div>
                            </div>
                            <!-- Remote Video -->
                            <div class="flex-1 relative bg-gray-900">
                                <video id="remoteVideo" class="w-full h-full object-cover" autoplay playsinline></video>
                                <div id="waitingOverlay" class="absolute inset-0 flex items-center justify-center bg-gray-900/80">
                                    <div class="text-center text-white">
                                        <i class="fas fa-spinner fa-spin text-4xl mb-4"></i>
                                        <p class="text-lg">${tr.waiting_opponent || 'Waiting for opponent...'}</p>
                                    </div>
                                </div>
                                <div class="absolute bottom-4 ${rtl ? 'right-4' : 'left-4'} bg-black/50 px-3 py-1 rounded-full text-white text-sm">
                                    ${tr.opponent || 'Opponent'}
                                </div>
                            </div>
                        </div>
                        
                        <!-- Viewer View (HLS) -->
                        <div id="viewerView" class="absolute inset-0 hidden">
                            <video id="hlsPlayer" class="w-full h-full object-contain" controls playsinline></video>
                        </div>
                        
                        <!-- Canvas for recording (hidden, host only) -->
                        <canvas id="compositeCanvas" class="hidden" width="1280" height="480"></canvas>
                        
                        <!-- Connection Status -->
                        <div id="connectionStatus" class="absolute top-4 ${rtl ? 'left-4' : 'right-4'} px-3 py-1 rounded-full text-sm hidden">
                            <i class="fas fa-wifi mr-2"></i>
                            <span>Connecting...</span>
                        </div>
                    </div>
                    
                    <!-- Stream Stats (Host only) -->
                    <div id="streamStats" class="hidden bg-gray-800 px-4 py-2 text-sm text-gray-400 flex items-center justify-between">
                        <div>
                            <span id="chunkCount">0</span> ${tr.chunks_uploaded || 'chunks uploaded'}
                        </div>
                        <div>
                            <span id="streamDuration">00:00</span>
                        </div>
                    </div>
                    
                    <!-- Debug Panel -->
                    <div id="debugPanel" class="hidden fixed bottom-0 left-0 right-0 bg-gray-900/95 border-t border-gray-700 p-4 max-h-64 overflow-y-auto z-50 font-mono text-xs">
                        <div class="flex justify-between items-center mb-2">
                            <span class="text-yellow-400 font-bold">🔧 DEBUG PANEL</span>
                            <button onclick="toggleDebug()" class="text-gray-400 hover:text-white">&times;</button>
                        </div>
                        <div id="debugLog" class="space-y-1 text-gray-300">
                            <div class="text-gray-500">Initializing...</div>
                        </div>
                    </div>
                </div>
            ` : `
                <div class="min-h-screen flex items-center justify-center text-white text-center">
                    <div>
                        <i class="fas fa-video-slash text-6xl text-gray-600 mb-4"></i>
                        <h2 class="text-2xl font-bold mb-2">${tr.not_found || 'Competition Not Found'}</h2>
                        <a href="/?lang=${lang}" class="mt-4 inline-block px-6 py-3 bg-purple-600 rounded-full font-semibold hover:bg-purple-700 transition-colors">
                            ${tr.back_to_home || 'Back to Home'}
                        </a>
                    </div>
                </div>
            `}
        </div>
        
        <!-- HLS.js for viewers -->
        <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
        
        ${competition ? `
        <script>
            // Streaming services are loaded from the main bundle (app.js)
            // They are available on window after DOMContentLoaded
            
            // Configuration
            const lang = '${lang}';
            const isRTL = ${rtl};
            const competitionId = ${competitionId};
            const streamServerUrl = '${streamServerUrl}';
            const tr = ${JSON.stringify(tr)};
            
            // State
            let p2p = null;
            let compositor = null;
            let userRole = null; // 'host', 'opponent', or 'viewer'
            let audioMuted = false;
            let videoMuted = false;
            let streamStartTime = null;
            let isScreenSharing = false;
            let debugVisible = false;
            
            // Debug log function
            function debugLog(msg, type = 'info') {
                const debugLogEl = document.getElementById('debugLog');
                const time = new Date().toLocaleTimeString();
                const colors = {
                    info: 'text-blue-400',
                    success: 'text-green-400',
                    error: 'text-red-400',
                    warn: 'text-yellow-400'
                };
                const icons = {
                    info: '📡',
                    success: '✅',
                    error: '❌',
                    warn: '⚠️'
                };
                const div = document.createElement('div');
                div.className = colors[type];
                div.innerHTML = '<span class="text-gray-500">[' + time + ']</span> ' + icons[type] + ' ' + msg;
                debugLogEl.appendChild(div);
                debugLogEl.scrollTop = debugLogEl.scrollHeight;
                console.log('[' + type.toUpperCase() + ']', msg);
            }
            
            // Toggle debug panel
            window.toggleDebug = function() {
                debugVisible = !debugVisible;
                document.getElementById('debugPanel').classList.toggle('hidden', !debugVisible);
            };
            
            // DOM elements
            const localVideo = document.getElementById('localVideo');
            const remoteVideo = document.getElementById('remoteVideo');
            const waitingOverlay = document.getElementById('waitingOverlay');
            const competitorView = document.getElementById('competitorView');
            const viewerView = document.getElementById('viewerView');
            const hlsPlayer = document.getElementById('hlsPlayer');
            const connectionStatus = document.getElementById('connectionStatus');
            const streamStats = document.getElementById('streamStats');
            const recordingIndicator = document.getElementById('recordingIndicator');
            
            // Wait for streaming services to be available from app.js
            function waitForBundle() {
                return new Promise((resolve, reject) => {
                    let attempts = 0;
                    const maxAttempts = 50; // 5 seconds max
                    const interval = setInterval(() => {
                        attempts++;
                        if (window.P2PConnection && window.VideoCompositor && window.ChunkUploader) {
                            clearInterval(interval);
                            console.log('[LiveRoom] Streaming services loaded successfully');
                            resolve();
                        } else if (attempts >= maxAttempts) {
                            clearInterval(interval);
                            reject(new Error('Streaming services failed to load after 5 seconds'));
                        }
                    }, 100);
                });
            }
            
            // Initialize on page load
            document.addEventListener('DOMContentLoaded', async () => {
                // Wait for bundle to load streaming services
                try {
                    await waitForBundle();
                } catch (err) {
                    console.error('[LiveRoom] Bundle loading failed:', err);
                    showMessage('فشل تحميل خدمات البث. يرجى إعادة تحميل الصفحة.', 'error');
                    return;
                }
                
                await checkAuth();
                
                if (!window.currentUser) {
                    showLoginModal();
                    return;
                }
                
                // Determine user role
                const userId = window.currentUser.id;
                const creatorId = ${competition.creator_id};
                const opponentId = ${competition.opponent_id || 'null'};
                
                if (userId === creatorId) {
                    userRole = 'host';
                } else if (userId === opponentId) {
                    userRole = 'opponent';
                } else {
                    userRole = 'viewer';
                }
                
                console.log('[LiveRoom] User role:', userRole);
                
                if (userRole === 'viewer') {
                    await initViewerMode();
                } else {
                    await initCompetitorMode();
                }
            });
            
            // Initialize viewer mode (HLS)
            async function initViewerMode() {
                competitorView.classList.add('hidden');
                viewerView.classList.remove('hidden');
                
                // Hide competitor controls
                document.getElementById('audioBtn').classList.add('hidden');
                document.getElementById('videoBtn').classList.add('hidden');
                document.getElementById('endBtn').classList.add('hidden');
                
                const hlsUrl = streamServerUrl + '/storage/live/match_' + competitionId + '/playlist.m3u8';
                
                if (Hls.isSupported()) {
                    const hls = new Hls({
                        liveSyncDuration: 3,
                        liveMaxLatencyDuration: 10
                    });
                    hls.loadSource(hlsUrl);
                    hls.attachMedia(hlsPlayer);
                    hls.on(Hls.Events.MANIFEST_PARSED, () => {
                        hlsPlayer.play().catch(e => console.log('Autoplay blocked'));
                    });
                    hls.on(Hls.Events.ERROR, (event, data) => {
                        if (data.fatal) {
                            showMessage(tr.stream_not_available || 'Stream not available yet. Please wait...', 'warning');
                        }
                    });
                } else if (hlsPlayer.canPlayType('application/vnd.apple.mpegurl')) {
                    // Safari native HLS
                    hlsPlayer.src = hlsUrl;
                    hlsPlayer.addEventListener('loadedmetadata', () => {
                        hlsPlayer.play().catch(e => console.log('Autoplay blocked'));
                    });
                } else {
                    showMessage(tr.hls_not_supported || 'Your browser does not support HLS playback', 'error');
                }
            }
            
            // Initialize competitor mode (P2P)
            async function initCompetitorMode() {
                const roomId = 'comp_' + competitionId;
                debugLog('Starting competitor mode. Room: ' + roomId + ', Role: ' + userRole, 'info');
                
                // Create room if host
                if (userRole === 'host') {
                    debugLog('Creating signaling room...', 'info');
                    const createRes = await fetch('/api/signaling/room/create', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            competition_id: competitionId,
                            user_id: window.currentUser.id
                        })
                    });
                    const createData = await createRes.json();
                    debugLog('Room create response: ' + JSON.stringify(createData), createRes.ok ? 'success' : 'error');
                }
                
                // Initialize P2P connection
                debugLog('Initializing P2P connection...', 'info');
                p2p = new window.P2PConnection({
                    roomId: roomId,
                    role: userRole,
                    userId: window.currentUser.id,
                    onRemoteStream: (stream) => {
                        debugLog('🎬 REMOTE STREAM RECEIVED! Tracks: ' + stream.getTracks().length, 'success');
                        remoteVideo.srcObject = stream;
                        waitingOverlay.classList.add('hidden');
                        
                        // If host, start recording after we have both streams
                        if (userRole === 'host' && compositor) {
                            debugLog('Starting recording in 1 second...', 'info');
                            setTimeout(() => {
                                startRecording();
                            }, 1000);
                        }
                    },
                    onConnectionStateChange: (state) => {
                        debugLog('Connection state: ' + state, state === 'connected' ? 'success' : 'info');
                        updateConnectionStatus(state);
                    },
                    onError: (error) => {
                        debugLog('P2P Error: ' + error.message, 'error');
                        showMessage(error.message, 'error');
                    }
                });
                
                debugLog('Calling p2p.initialize()...', 'info');
                await p2p.initialize();
                debugLog('P2P initialized. Joining room...', 'info');
                await p2p.joinRoom();
                debugLog('Joined room successfully', 'success');
                
                // Get local media
                try {
                    debugLog('Getting local media (camera/microphone or mock)...', 'info');
                    const localStream = await p2p.initLocalStream();
                    localVideo.srcObject = localStream;
                    debugLog('Local stream acquired. Tracks: ' + localStream.getTracks().map(t => t.kind).join(', '), 'success');
                    
                    // If host, initialize compositor
                    if (userRole === 'host') {
                        debugLog('Initializing compositor (host only)...', 'info');
                        initCompositor();
                    }
                    
                    // Check if opponent is already in room
                    const status = await p2p.getRoomStatus();
                    debugLog('Room status: Host=' + status?.host_joined + ', Opponent=' + status?.opponent_joined, 'info');
                    
                    if (status) {
                        if (userRole === 'host' && status.opponent_joined) {
                            debugLog('Opponent already in room! Creating offer...', 'info');
                            await p2p.createOffer();
                            debugLog('Offer created and sent', 'success');
                        } else if (userRole === 'opponent' && status.host_joined) {
                            debugLog('Host already in room. Waiting for offer...', 'info');
                        }
                    }
                    
                    // If host, watch for opponent
                    if (userRole === 'host') {
                        debugLog('Starting opponent watcher...', 'info');
                        watchForOpponent();
                    }
                    
                } catch (error) {
                    debugLog('Media access failed: ' + error.message, 'error');
                    showMessage(tr.camera_error || 'Failed to access camera/microphone', 'error');
                }
            }
            
            // Watch for opponent to join (host only)
            function watchForOpponent() {
                const interval = setInterval(async () => {
                    const status = await p2p.getRoomStatus();
                    if (status && status.opponent_joined && !p2p.isP2PConnected()) {
                        console.log('[LiveRoom] Opponent joined, creating offer');
                        await p2p.createOffer();
                        clearInterval(interval);
                    }
                }, 2000);
            }
            
            // Initialize video compositor (host only)
            function initCompositor() {
                const canvas = document.getElementById('compositeCanvas');
                
                compositor = new window.VideoCompositor({
                    competitionId: competitionId,
                    localVideo: localVideo,
                    remoteVideo: remoteVideo,
                    canvas: canvas,
                    chunkDuration: 10000, // 10 seconds
                    serverUrl: streamServerUrl,
                    onChunkUploaded: (num) => {
                        document.getElementById('chunkCount').textContent = num;
                    },
                    onRecordingStarted: () => {
                        recordingIndicator.classList.remove('hidden');
                        streamStats.classList.remove('hidden');
                        streamStartTime = Date.now();
                        updateDuration();
                    },
                    onRecordingStopped: () => {
                        recordingIndicator.classList.add('hidden');
                    },
                    onError: (error) => {
                        console.error('[LiveRoom] Compositor error:', error);
                    }
                });
                
                compositor.startCompositing();
            }
            
            // Start recording
            function startRecording() {
                if (compositor && !compositor.getStats().isRecording) {
                    console.log('[LiveRoom] Starting recording');
                    compositor.startRecording();
                }
            }
            
            // Update duration display
            function updateDuration() {
                if (!streamStartTime) return;
                
                const elapsed = Math.floor((Date.now() - streamStartTime) / 1000);
                const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
                const secs = (elapsed % 60).toString().padStart(2, '0');
                document.getElementById('streamDuration').textContent = mins + ':' + secs;
                
                setTimeout(updateDuration, 1000);
            }
            
            // Update connection status
            function updateConnectionStatus(state) {
                const el = connectionStatus;
                el.classList.remove('hidden');
                
                switch (state) {
                    case 'connecting':
                        el.className = 'absolute top-4 ' + (isRTL ? 'left-4' : 'right-4') + ' px-3 py-1 rounded-full text-sm bg-yellow-600 text-white';
                        el.innerHTML = '<i class="fas fa-wifi mr-2"></i>Connecting...';
                        break;
                    case 'connected':
                        el.className = 'absolute top-4 ' + (isRTL ? 'left-4' : 'right-4') + ' px-3 py-1 rounded-full text-sm bg-green-600 text-white';
                        el.innerHTML = '<i class="fas fa-check mr-2"></i>Connected';
                        setTimeout(() => el.classList.add('hidden'), 3000);
                        break;
                    case 'disconnected':
                    case 'failed':
                        el.className = 'absolute top-4 ' + (isRTL ? 'left-4' : 'right-4') + ' px-3 py-1 rounded-full text-sm bg-red-600 text-white';
                        el.innerHTML = '<i class="fas fa-exclamation-triangle mr-2"></i>Disconnected';
                        break;
                }
            }
            
            // Toggle audio
            window.toggleAudio = function() {
                if (!p2p) return;
                const stream = p2p.getLocalStream();
                if (!stream) return;
                
                const audioTrack = stream.getAudioTracks()[0];
                if (audioTrack) {
                    audioMuted = !audioMuted;
                    audioTrack.enabled = !audioMuted;
                    
                    const btn = document.getElementById('audioBtn');
                    if (audioMuted) {
                        btn.classList.add('bg-red-600');
                        btn.classList.remove('bg-gray-800');
                        btn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
                    } else {
                        btn.classList.remove('bg-red-600');
                        btn.classList.add('bg-gray-800');
                        btn.innerHTML = '<i class="fas fa-microphone"></i>';
                    }
                }
            };
            
            // Toggle video
            window.toggleVideo = function() {
                if (!p2p) return;
                const stream = p2p.getLocalStream();
                if (!stream) return;
                
                const videoTrack = stream.getVideoTracks()[0];
                if (videoTrack) {
                    videoMuted = !videoMuted;
                    videoTrack.enabled = !videoMuted;
                    
                    const btn = document.getElementById('videoBtn');
                    if (videoMuted) {
                        btn.classList.add('bg-red-600');
                        btn.classList.remove('bg-gray-800');
                        btn.innerHTML = '<i class="fas fa-video-slash"></i>';
                    } else {
                        btn.classList.remove('bg-red-600');
                        btn.classList.add('bg-gray-800');
                        btn.innerHTML = '<i class="fas fa-video"></i>';
                    }
                }
            };
            
            // Share screen instead of camera
            window.shareScreen = async function() {
                if (!p2p) {
                    debugLog('P2P not initialized', 'error');
                    return;
                }
                
                try {
                    debugLog('Requesting screen share...', 'info');
                    const screenStream = await navigator.mediaDevices.getDisplayMedia({
                        video: { 
                            cursor: 'always',
                            displaySurface: 'monitor'
                        },
                        audio: true
                    });
                    
                    // Replace video track in P2P connection
                    const videoTrack = screenStream.getVideoTracks()[0];
                    const sender = p2p.pc.getSenders().find(s => s.track && s.track.kind === 'video');
                    
                    if (sender) {
                        await sender.replaceTrack(videoTrack);
                        localVideo.srcObject = screenStream;
                        isScreenSharing = true;
                        
                        // Update button
                        const btn = document.getElementById('screenBtn');
                        btn.classList.add('bg-green-600');
                        btn.classList.remove('bg-gray-800');
                        
                        debugLog('Screen sharing started!', 'success');
                        
                        // Handle screen share ended
                        videoTrack.onended = () => {
                            debugLog('Screen sharing ended by user', 'info');
                            isScreenSharing = false;
                            btn.classList.remove('bg-green-600');
                            btn.classList.add('bg-gray-800');
                            // Optionally switch back to camera
                            p2p.initLocalStream().then(stream => {
                                localVideo.srcObject = stream;
                            });
                        };
                    }
                } catch (err) {
                    debugLog('Screen share failed: ' + err.message, 'error');
                }
            };
            
            // End stream
            window.endStream = async function() {
                if (!confirm(tr.confirm_end_call || 'Are you sure you want to end the stream?')) {
                    return;
                }
                
                const vodUrl = streamServerUrl + '/storage/vod/match_' + competitionId + '.mp4';
                
                try {
                    // Stop recording if host (this triggers finalization on server)
                    if (userRole === 'host' && compositor) {
                        await compositor.destroy();
                        
                        // Call end API with VOD URL
                        await fetch('/api/competitions/' + competitionId + '/end', {
                            method: 'POST',
                            headers: {
                                'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId')),
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ vod_url: vodUrl })
                        });
                    }
                    
                    // Disconnect P2P
                    if (p2p) {
                        await p2p.disconnect();
                    }
                } catch (err) {
                    console.error('[LiveRoom] End stream error:', err);
                }
                
                window.location.href = '/competition/' + competitionId + '?lang=' + lang;
            };
            
            // Show message
            function showMessage(msg, type) {
                // TODO: Implement toast notification
                console.log('[' + type + ']', msg);
                alert(msg);
            }
            
            // Cleanup on page unload
            window.addEventListener('beforeunload', async () => {
                if (compositor) {
                    await compositor.destroy();
                }
                if (p2p) {
                    await p2p.disconnect();
                }
            });
        </script>
        ` : ''}
    `;

    return c.html(generateHTML(content, lang, competition?.title || 'Live Room'));
};

export default liveRoomPage;
