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
                            <button onclick="toggleAudio()" id="audioBtn" class="p-3 rounded-full bg-gray-800 text-white hover:bg-gray-700 transition-colors" title="${tr.toggle_mic || 'Toggle Microphone'}">
                                <i class="fas fa-microphone"></i>
                            </button>
                            <button onclick="toggleVideo()" id="videoBtn" class="p-3 rounded-full bg-gray-800 text-white hover:bg-gray-700 transition-colors" title="${tr.toggle_camera || 'Toggle Camera'}">
                                <i class="fas fa-video"></i>
                            </button>
                            <button onclick="endStream()" id="endBtn" class="p-3 rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors" title="${tr.end_stream || 'End Stream'}">
                                <i class="fas fa-phone-slash"></i>
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
        <script type="module">
            import { P2PConnection, VideoCompositor, ChunkUploader } from '/assets/client/services/index.js';
            
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
            
            // Initialize on page load
            document.addEventListener('DOMContentLoaded', async () => {
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
                
                // Create room if host
                if (userRole === 'host') {
                    await fetch('/api/signaling/room/create', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            competition_id: competitionId,
                            user_id: window.currentUser.id
                        })
                    });
                }
                
                // Initialize P2P connection
                p2p = new P2PConnection({
                    roomId: roomId,
                    role: userRole,
                    userId: window.currentUser.id,
                    onRemoteStream: (stream) => {
                        console.log('[LiveRoom] Remote stream received');
                        remoteVideo.srcObject = stream;
                        waitingOverlay.classList.add('hidden');
                        
                        // If host, start recording after we have both streams
                        if (userRole === 'host' && compositor) {
                            setTimeout(() => {
                                startRecording();
                            }, 1000);
                        }
                    },
                    onConnectionStateChange: (state) => {
                        console.log('[LiveRoom] Connection state:', state);
                        updateConnectionStatus(state);
                    },
                    onError: (error) => {
                        console.error('[LiveRoom] P2P Error:', error);
                        showMessage(error.message, 'error');
                    }
                });
                
                await p2p.initialize();
                await p2p.joinRoom();
                
                // Get local media
                try {
                    const localStream = await p2p.initLocalStream();
                    localVideo.srcObject = localStream;
                    
                    // If host, initialize compositor
                    if (userRole === 'host') {
                        initCompositor();
                    }
                    
                    // Check if opponent is already in room
                    const status = await p2p.getRoomStatus();
                    if (status) {
                        if (userRole === 'host' && status.opponent_joined) {
                            await p2p.createOffer();
                        } else if (userRole === 'opponent' && status.host_joined) {
                            // Wait for offer from host
                        }
                    }
                    
                    // If host, watch for opponent
                    if (userRole === 'host') {
                        watchForOpponent();
                    }
                    
                } catch (error) {
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
                
                compositor = new VideoCompositor({
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
            
            // End stream
            window.endStream = async function() {
                if (!confirm(tr.confirm_end_call || 'Are you sure you want to end the stream?')) {
                    return;
                }
                
                // Stop recording if host
                if (userRole === 'host' && compositor) {
                    await compositor.destroy();
                }
                
                // Disconnect P2P
                if (p2p) {
                    await p2p.disconnect();
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
