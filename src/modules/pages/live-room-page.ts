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
                    <div id="streamHeader" class="bg-gray-900/90 backdrop-blur-sm px-4 py-2 flex items-center justify-between z-50 border-b border-gray-800">
                        <div class="flex items-center gap-3">
                            <a href="/competition/${competitionId}?lang=${lang}" class="text-white hover:text-gray-300 transition-colors">
                                <i class="fas fa-arrow-${rtl ? 'right' : 'left'}"></i>
                            </a>
                            <div>
                                <h1 class="text-white font-bold text-base line-clamp-1">${competition.title}</h1>
                                <div class="flex items-center gap-2 text-xs">
                                    <span class="flex items-center gap-1 text-red-500" id="liveIndicator">
                                        <span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                                        ${tr.status_live || 'LIVE'}
                                    </span>
                                    <span class="text-gray-400" id="viewerCount">0 ${tr.viewers || 'viewers'}</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Control Buttons - All in one row, scrollable on mobile -->
                        <div class="flex items-center gap-1 overflow-x-auto">
                            <!-- Fullscreen - For Everyone -->
                            <button onclick="toggleFullscreen()" id="fullscreenBtn" class="p-2 rounded-lg bg-gray-800/80 text-white hover:bg-gray-700 transition-colors" title="${tr.fullscreen || 'Fullscreen'}">
                                <i class="fas fa-expand"></i>
                            </button>
                            
                            <!-- Swap Videos - For Everyone -->
                            <button onclick="swapVideos()" id="swapBtn" class="p-2 rounded-lg bg-gray-800/80 text-white hover:bg-gray-700 transition-colors" title="${tr.swap_videos || 'Swap Videos'}">
                                <i class="fas fa-exchange-alt"></i>
                            </button>
                            
                            <!-- Hide Comments - For Everyone -->
                            <button onclick="toggleComments()" id="commentsBtn" class="p-2 rounded-lg bg-gray-800/80 text-white hover:bg-gray-700 transition-colors" title="${tr.toggle_comments || 'Toggle Comments'}">
                                <i class="fas fa-comment"></i>
                            </button>
                            
                            <!-- Competitor-only controls -->
                            <div id="competitorControls" class="flex items-center gap-1">
                                <!-- Hide My Video -->
                                <button onclick="toggleLocalVideo()" id="localVideoBtn" class="p-2 rounded-lg bg-gray-800/80 text-white hover:bg-gray-700 transition-colors" title="${tr.toggle_my_video || 'Toggle My Video'}">
                                    <i class="fas fa-user-circle"></i>
                                </button>
                                
                                <!-- Switch Camera -->
                                <button onclick="switchCamera()" id="switchCamBtn" class="p-2 rounded-lg bg-gray-800/80 text-white hover:bg-gray-700 transition-colors" title="${tr.switch_camera || 'Switch Camera'}">
                                    <i class="fas fa-sync-alt"></i>
                                </button>
                                
                                <!-- Screen Share -->
                                <button onclick="shareScreen()" id="screenBtn" class="p-2 rounded-lg bg-gray-800/80 text-white hover:bg-gray-700 transition-colors" title="${tr.share_screen || 'Share Screen'}">
                                    <i class="fas fa-desktop"></i>
                                </button>
                                
                                <!-- Microphone -->
                                <button onclick="toggleAudio()" id="audioBtn" class="p-2 rounded-lg bg-gray-800/80 text-white hover:bg-gray-700 transition-colors" title="${tr.toggle_mic || 'Toggle Microphone'}">
                                    <i class="fas fa-microphone"></i>
                                </button>
                                
                                <!-- Camera -->
                                <button onclick="toggleVideo()" id="videoBtn" class="p-2 rounded-lg bg-gray-800/80 text-white hover:bg-gray-700 transition-colors" title="${tr.toggle_camera || 'Toggle Camera'}">
                                    <i class="fas fa-video"></i>
                                </button>
                                
                                <!-- End Stream - Better Design -->
                                <button onclick="endStream()" id="endBtn" class="px-3 py-2 rounded-lg bg-red-600/90 text-white hover:bg-red-700 transition-colors flex items-center gap-1" title="${tr.end_stream || 'End Stream'}">
                                    <i class="fas fa-stop-circle"></i>
                                    <span class="hidden sm:inline text-sm">${tr.end || 'End'}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Video Container - Redesigned Layout -->
                    <div id="videoContainer" class="flex-1 relative bg-black overflow-hidden">
                        <!-- Competitor View (P2P) -->
                        <div id="competitorView" class="absolute inset-0">
                            <!-- Remote Video - Full Screen Background (can be swapped) -->
                            <div id="remoteVideoWrapper" class="absolute inset-0 z-10">
                                <video id="remoteVideo" class="w-full h-full object-cover" autoplay playsinline></video>
                            </div>
                            
                            <!-- Waiting Overlay -->
                            <div id="waitingOverlay" class="absolute inset-0 flex items-center justify-center bg-gray-900/80 z-15">
                                <div class="text-center text-white">
                                    <i class="fas fa-spinner fa-spin text-4xl mb-4"></i>
                                    <p class="text-lg">${tr.waiting_opponent || 'Waiting for opponent...'}</p>
                                </div>
                            </div>
                            
                            <!-- Local Video - Small in Corner (can be hidden/swapped) -->
                            <div id="localVideoWrapper" class="absolute ${rtl ? 'left-4' : 'right-4'} top-4 z-20 transition-all duration-300">
                                <div class="relative w-28 h-20 md:w-40 md:h-28 rounded-xl overflow-hidden shadow-2xl border-2 border-purple-500 cursor-pointer hover:scale-105 transition-transform" onclick="swapVideos()">
                                    <video id="localVideo" class="w-full h-full object-cover" autoplay muted playsinline></video>
                                    <div class="absolute bottom-1 ${rtl ? 'right-1' : 'left-1'} bg-black/60 px-2 py-0.5 rounded text-white text-xs">
                                        ${tr.you || 'You'}
                                    </div>
                                    <div class="absolute top-1 ${rtl ? 'left-1' : 'right-1'} bg-black/60 p-1 rounded text-white text-xs">
                                        <i class="fas fa-arrows-alt"></i>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Opponent Label -->
                            <div id="opponentLabel" class="absolute top-4 ${rtl ? 'right-4' : 'left-4'} bg-black/50 px-3 py-1 rounded-full text-white text-sm z-20">
                                <i class="fas fa-user mr-1"></i> ${tr.opponent || 'Opponent'}
                            </div>
                            
                            <!-- Ad Banner - Can be closed by competitors only -->
                            <div id="adBanner" class="absolute top-1/2 ${rtl ? 'left-4' : 'right-4'} transform -translate-y-1/2 z-25 max-w-xs">
                                <div class="bg-gray-900/90 backdrop-blur-sm rounded-xl overflow-hidden shadow-xl border border-gray-700">
                                    <div class="relative">
                                        <img src="/static/images/ad-placeholder.png" alt="Ad" class="w-full h-auto" onerror="this.parentElement.parentElement.parentElement.style.display='none'">
                                        <div class="absolute top-1 ${rtl ? 'left-1' : 'right-1'} flex gap-1">
                                            <button onclick="closeAd()" id="closeAdBtn" class="bg-black/70 hover:bg-black text-white rounded-full w-6 h-6 flex items-center justify-center text-xs transition-colors" title="${tr.close_ad || 'Close Ad'}">
                                                <i class="fas fa-times"></i>
                                            </button>
                                            <button onclick="reportAd()" class="bg-black/70 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs transition-colors" title="${tr.report_ad || 'Report Ad'}">
                                                <i class="fas fa-flag"></i>
                                            </button>
                                        </div>
                                        <div class="absolute bottom-1 left-1 bg-black/70 px-1 rounded text-white text-xs">
                                            ${tr.ad || 'Ad'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Live Comments Overlay -->
                            <div id="commentsOverlay" class="absolute bottom-16 left-0 right-0 z-30 px-4 max-h-48 overflow-hidden pointer-events-none transition-opacity duration-300">
                                <div id="commentsContainer" class="space-y-1 max-h-48 overflow-y-auto pointer-events-auto">
                                    <!-- Comments will be inserted here -->
                                </div>
                            </div>
                            
                            <!-- Comment Input -->
                            <div id="commentInputArea" class="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent z-40">
                                <div class="flex gap-2 max-w-md mx-auto">
                                    <input type="text" id="commentInput" placeholder="${tr.add_comment || 'Add a comment...'}" 
                                        class="flex-1 bg-white/15 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2 text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                                        onkeypress="if(event.key==='Enter')sendComment()">
                                    <button onclick="sendComment()" class="bg-purple-600 hover:bg-purple-700 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors">
                                        <i class="fas fa-paper-plane text-sm"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Viewer View (HLS) -->
                        <div id="viewerView" class="absolute inset-0 hidden">
                            <video id="hlsPlayer" class="w-full h-full object-contain" controls playsinline></video>
                        </div>
                        
                        <!-- Canvas for recording (hidden, host only) -->
                        <canvas id="compositeCanvas" class="hidden" width="1280" height="720"></canvas>
                        
                        <!-- Connection Status -->
                        <div id="connectionStatus" class="absolute top-4 ${rtl ? 'left-4' : 'right-4'} px-3 py-1 rounded-full text-sm hidden z-50">
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
            let isFullscreen = false;
            let videosSwapped = false;
            let commentsVisible = true;
            let localVideoVisible = true;
            let currentFacingMode = 'user'; // 'user' or 'environment'
            
            // Simple console-only log
            function log(msg, type = 'info') {
                const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : '📡';
                console.log('[LiveRoom]', prefix, msg);
            }
            
            // DOM elements
            const localVideo = document.getElementById('localVideo');
            const remoteVideo = document.getElementById('remoteVideo');
            const localVideoWrapper = document.getElementById('localVideoWrapper');
            const remoteVideoWrapper = document.getElementById('remoteVideoWrapper');
            const waitingOverlay = document.getElementById('waitingOverlay');
            const competitorView = document.getElementById('competitorView');
            const viewerView = document.getElementById('viewerView');
            const hlsPlayer = document.getElementById('hlsPlayer');
            const connectionStatus = document.getElementById('connectionStatus');
            const streamStats = document.getElementById('streamStats');
            const videoContainer = document.getElementById('videoContainer');
            const commentsOverlay = document.getElementById('commentsOverlay');
            const commentInputArea = document.getElementById('commentInputArea');
            const adBanner = document.getElementById('adBanner');
            const competitorControls = document.getElementById('competitorControls');
            const closeAdBtn = document.getElementById('closeAdBtn');
            
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
                
                // Setup viewer restrictions (hide controls for viewers)
                setupViewerRestrictions();
                
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
                log('Starting competitor mode. Room: ' + roomId + ', Role: ' + userRole, 'info');
                
                // Create room if host
                if (userRole === 'host') {
                    log('Creating signaling room...', 'info');
                    const createRes = await fetch('/api/signaling/room/create', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            competition_id: competitionId,
                            user_id: window.currentUser.id
                        })
                    });
                    const createData = await createRes.json();
                    log('Room create response: ' + JSON.stringify(createData), createRes.ok ? 'success' : 'error');
                }
                
                // Initialize P2P connection
                log('Initializing P2P connection...', 'info');
                p2p = new window.P2PConnection({
                    roomId: roomId,
                    role: userRole,
                    userId: window.currentUser.id,
                    onRemoteStream: (stream) => {
                        log('🎬 REMOTE STREAM RECEIVED! Tracks: ' + stream.getTracks().length, 'success');
                        remoteVideo.srcObject = stream;
                        waitingOverlay.classList.add('hidden');
                        
                        // If host, start recording after we have both streams
                        if (userRole === 'host' && compositor) {
                            log('Starting recording in 1 second...', 'info');
                            setTimeout(() => {
                                startRecording();
                            }, 1000);
                        }
                    },
                    onConnectionStateChange: (state) => {
                        log('Connection state: ' + state, state === 'connected' ? 'success' : 'info');
                        updateConnectionStatus(state);
                    },
                    onError: (error) => {
                        log('P2P Error: ' + error.message, 'error');
                        showMessage(error.message, 'error');
                    }
                });
                
                log('Calling p2p.initialize()...', 'info');
                await p2p.initialize();
                log('P2P initialized. Joining room...', 'info');
                await p2p.joinRoom();
                log('Joined room successfully', 'success');
                
                // Get local media
                try {
                    log('Getting local media (camera/microphone or mock)...', 'info');
                    const localStream = await p2p.initLocalStream();
                    localVideo.srcObject = localStream;
                    log('Local stream acquired. Tracks: ' + localStream.getTracks().map(t => t.kind).join(', '), 'success');
                    
                    // If host, initialize compositor
                    if (userRole === 'host') {
                        log('Initializing compositor (host only)...', 'info');
                        initCompositor();
                    }
                    
                    // Check if opponent is already in room
                    const status = await p2p.getRoomStatus();
                    log('Room status: Host=' + status?.host_joined + ', Opponent=' + status?.opponent_joined, 'info');
                    
                    if (status) {
                        if (userRole === 'host' && status.opponent_joined) {
                            log('Opponent already in room! Creating offer...', 'info');
                            await p2p.createOffer();
                            log('Offer created and sent', 'success');
                        } else if (userRole === 'opponent' && status.host_joined) {
                            log('Host already in room. Waiting for offer...', 'info');
                        }
                    }
                    
                    // If host, watch for opponent
                    if (userRole === 'host') {
                        log('Starting opponent watcher...', 'info');
                        watchForOpponent();
                    }
                    
                } catch (error) {
                    log('Media access failed: ' + error.message, 'error');
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
            
            // ========== NEW CONTROL FUNCTIONS ==========
            
            // Toggle Fullscreen - For everyone
            window.toggleFullscreen = function() {
                const container = document.documentElement;
                
                if (!isFullscreen) {
                    if (container.requestFullscreen) {
                        container.requestFullscreen();
                    } else if (container.webkitRequestFullscreen) {
                        container.webkitRequestFullscreen();
                    } else if (container.msRequestFullscreen) {
                        container.msRequestFullscreen();
                    }
                    isFullscreen = true;
                    document.getElementById('fullscreenBtn').innerHTML = '<i class="fas fa-compress"></i>';
                } else {
                    if (document.exitFullscreen) {
                        document.exitFullscreen();
                    } else if (document.webkitExitFullscreen) {
                        document.webkitExitFullscreen();
                    } else if (document.msExitFullscreen) {
                        document.msExitFullscreen();
                    }
                    isFullscreen = false;
                    document.getElementById('fullscreenBtn').innerHTML = '<i class="fas fa-expand"></i>';
                }
            };
            
            // Listen for fullscreen change
            document.addEventListener('fullscreenchange', () => {
                isFullscreen = !!document.fullscreenElement;
                document.getElementById('fullscreenBtn').innerHTML = isFullscreen ? '<i class="fas fa-compress"></i>' : '<i class="fas fa-expand"></i>';
            });
            
            // Swap Videos - For everyone
            window.swapVideos = function() {
                videosSwapped = !videosSwapped;
                
                if (videosSwapped) {
                    // Local video becomes full screen, remote becomes small
                    localVideoWrapper.className = 'absolute inset-0 z-10';
                    localVideoWrapper.querySelector('.relative').className = 'w-full h-full';
                    localVideo.classList.add('w-full', 'h-full');
                    
                    remoteVideoWrapper.className = 'absolute ' + (isRTL ? 'left-4' : 'right-4') + ' top-4 z-20 transition-all duration-300';
                    remoteVideoWrapper.innerHTML = '<div class="relative w-28 h-20 md:w-40 md:h-28 rounded-xl overflow-hidden shadow-2xl border-2 border-purple-500 cursor-pointer hover:scale-105 transition-transform" onclick="swapVideos()"><video id="remoteVideo" class="w-full h-full object-cover" autoplay playsinline></video><div class="absolute top-1 ' + (isRTL ? 'left-1' : 'right-1') + ' bg-black/60 p-1 rounded text-white text-xs"><i class="fas fa-arrows-alt"></i></div></div>';
                    
                    remoteVideoWrapper.querySelector('video').srcObject = remoteVideo.srcObject;
                } else {
                    // Reset to original
                    location.reload(); // Simple reload for now
                }
                
                document.getElementById('swapBtn').classList.toggle('bg-purple-600', videosSwapped);
                document.getElementById('swapBtn').classList.toggle('bg-gray-800/80', !videosSwapped);
            };
            
            // Toggle Comments - For everyone
            window.toggleComments = function() {
                commentsVisible = !commentsVisible;
                commentsOverlay.style.opacity = commentsVisible ? '1' : '0';
                commentsOverlay.style.pointerEvents = commentsVisible ? 'auto' : 'none';
                commentInputArea.style.display = commentsVisible ? 'block' : 'none';
                
                const btn = document.getElementById('commentsBtn');
                btn.classList.toggle('bg-purple-600', commentsVisible);
                btn.classList.toggle('bg-gray-800/80', !commentsVisible);
                btn.innerHTML = commentsVisible ? '<i class="fas fa-comment"></i>' : '<i class="fas fa-comment-slash"></i>';
            };
            
            // Toggle Local Video - For competitors only
            window.toggleLocalVideo = function() {
                if (userRole === 'viewer') return;
                
                localVideoVisible = !localVideoVisible;
                localVideoWrapper.style.display = localVideoVisible ? 'block' : 'none';
                
                const btn = document.getElementById('localVideoBtn');
                btn.classList.toggle('bg-purple-600', localVideoVisible);
                btn.classList.toggle('bg-gray-800/80', !localVideoVisible);
                btn.innerHTML = localVideoVisible ? '<i class="fas fa-user-circle"></i>' : '<i class="fas fa-user-slash"></i>';
            };
            
            // Switch Camera (front/back) - For competitors only
            window.switchCamera = async function() {
                if (userRole === 'viewer' || !p2p) return;
                
                try {
                    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
                    log('Switching to ' + currentFacingMode + ' camera...', 'info');
                    
                    const newStream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: currentFacingMode },
                        audio: true
                    });
                    
                    const videoTrack = newStream.getVideoTracks()[0];
                    const sender = p2p.pc.getSenders().find(s => s.track && s.track.kind === 'video');
                    
                    if (sender) {
                        await sender.replaceTrack(videoTrack);
                        localVideo.srcObject = newStream;
                        log('Camera switched successfully', 'success');
                    }
                } catch (err) {
                    log('Failed to switch camera: ' + err.message, 'error');
                }
            };
            
            // Close Ad - For competitors only
            window.closeAd = function() {
                if (userRole === 'viewer') {
                    showMessage(tr.viewers_cannot_close_ads || 'Viewers cannot close ads', 'warning');
                    return;
                }
                adBanner.style.display = 'none';
            };
            
            // Report Ad
            window.reportAd = function() {
                if (confirm(tr.report_ad_confirm || 'Report this ad as inappropriate?')) {
                    // TODO: Send report to server
                    log('Ad reported', 'info');
                    adBanner.style.display = 'none';
                    showMessage(tr.ad_reported || 'Ad reported. Thank you!', 'success');
                }
            };
            
            // Hide competitor controls for viewers
            function setupViewerRestrictions() {
                if (userRole === 'viewer') {
                    competitorControls.style.display = 'none';
                    if (closeAdBtn) closeAdBtn.style.display = 'none';
                }
            }
            
            // ========== END NEW CONTROL FUNCTIONS ==========
            
            // Share screen instead of camera
            window.shareScreen = async function() {
                if (!p2p) {
                    log('P2P not initialized', 'error');
                    return;
                }
                
                try {
                    log('Requesting screen share...', 'info');
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
                        
                        log('Screen sharing started!', 'success');
                        
                        // Handle screen share ended
                        videoTrack.onended = () => {
                            log('Screen sharing ended by user', 'info');
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
                    log('Screen share failed: ' + err.message, 'error');
                }
            };
            
            // End stream - works from both host AND opponent
            window.endStream = async function() {
                if (!confirm(tr.confirm_end_call || 'Are you sure you want to end the stream?')) {
                    return;
                }
                
                log('Ending stream...', 'info');
                const vodUrl = streamServerUrl + '/storage/vod/match_' + competitionId + '.mp4';
                
                try {
                    // Stop compositor if host
                    if (userRole === 'host' && compositor) {
                        log('Stopping compositor and finalizing...', 'info');
                        await compositor.destroy();
                    }
                    
                    // Always call finalize on the streaming server (from either side)
                    log('Sending finalize request to streaming server...', 'info');
                    try {
                        const finalizeRes = await fetch(streamServerUrl + '/finalize.php', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ match_id: competitionId })
                        });
                        const finalizeData = await finalizeRes.json();
                        log('Finalize response: ' + JSON.stringify(finalizeData), finalizeRes.ok ? 'success' : 'error');
                    } catch (finErr) {
                        log('Finalize request failed: ' + finErr.message, 'error');
                    }
                    
                    // Update competition status to recorded
                    log('Updating competition status...', 'info');
                    await fetch('/api/competitions/' + competitionId + '/end', {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId')),
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ vod_url: vodUrl })
                    });
                    
                    // Leave signaling room
                    log('Leaving signaling room...', 'info');
                    await fetch('/api/signaling/room/leave', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            room_id: 'comp_' + competitionId,
                            user_id: window.currentUser?.id,
                            role: userRole
                        })
                    });
                    
                    // Disconnect P2P
                    if (p2p) {
                        log('Disconnecting P2P...', 'info');
                        await p2p.disconnect();
                    }
                    
                    log('Stream ended successfully!', 'success');
                } catch (err) {
                    log('End stream error: ' + err.message, 'error');
                }
                
                window.location.href = '/competition/' + competitionId + '?lang=' + lang;
            };
            
            // Send comment (placeholder - needs WebSocket for real-time)
            window.sendComment = function() {
                const input = document.getElementById('commentInput');
                const text = input.value.trim();
                if (!text) return;
                
                const container = document.getElementById('commentsContainer');
                const comment = document.createElement('div');
                comment.className = 'flex items-start gap-2 bg-black/50 rounded-lg px-3 py-2 backdrop-blur-sm';
                comment.innerHTML = 
                    '<span class="text-purple-400 font-semibold text-sm">' + (window.currentUser?.username || 'You') + ':</span>' +
                    '<span class="text-white text-sm">' + text + '</span>';
                container.appendChild(comment);
                container.scrollTop = container.scrollHeight;
                input.value = '';
                
                log('Comment sent: ' + text, 'info');
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
