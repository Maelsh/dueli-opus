/**
 * Test Stream Client Shared Script
 * الدوال والـ Classes المشتركة بين جميع صفحات الاختبار
 * يُحقن في كل صفحة عبر main.ts
 */

const FFMPEG_URL = 'https://maelshpro.com/ffmpeg';

/**
 * Get Client Shared Script - توليد الـ JavaScript المشترك
 */
export function getClientSharedScript(): string {
    return `
// ===== Utility Functions =====

/**
 * testLog - طباعة رسالة في السجل والـ console
 */
function testLog(msg, type = 'info') {
    const logEl = document.getElementById('log');
    if (!logEl) return;

    const time = new Date().toLocaleTimeString();
    const div = document.createElement('div');
    div.className = 'log-entry log-' + type;
    div.innerHTML = '[' + time + '] ' + msg;
    logEl.appendChild(div);

    if (logEl.parentElement) {
        logEl.parentElement.scrollTop = logEl.parentElement.scrollHeight;
    }

    console.log('[' + type.toUpperCase() + ']', msg);
}

window.testLog = testLog;

// ===== Session & Authentication =====

/**
 * getSessionToken - الحصول على توكن الجلسة
 * يُقرأ من localStorage (يُحفظ عند تسجيل الدخول)
 */
function getSessionToken() {
    return localStorage.getItem('sessionId');
}

window.getSessionToken = getSessionToken;

/**
 * fetchIceServers - جلب إعدادات ICE من المنصة
 */
async function fetchIceServers() {
    try {
        const response = await fetch('/api/signaling/ice-servers');
        const data = await response.json();
        if (data.success && data.data.iceServers) {
            testLog('✅ ICE servers fetched (' + data.data.iceServers.length + ')', 'success');
            return data.data.iceServers;
        }
    } catch (error) {
        testLog('⚠️ ICE servers fallback to STUN only', 'warn');
    }
    // Fallback
    return [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ];
}

window.fetchIceServers = fetchIceServers;

// ===== Signaling Manager (HTTP Polling with Verification) =====

/**
 * SignalingManager - إدارة الإشارات عبر HTTP Polling مع التأمين
 */
class SignalingManager {
    constructor(config) {
        this.signalingUrl = config.signalingUrl;
        this.roomId = config.roomId;
        this.competitionId = config.roomId.replace('comp_', '');
        this.role = config.role;
        this.token = config.token;
        this.onSignal = config.onSignal || function() {};
        this.onPeerJoined = config.onPeerJoined || function() {};
        this.onPeerLeft = config.onPeerLeft || function() {};
        this.onError = config.onError || function() {};
        this.onConnected = config.onConnected || function() {};
        this.pollInterval = null;
        this.lastTimestamp = 0;
        this.peerWasConnected = false;
        this.isConnected = false;
    }
    
    async connect() {
        testLog('🔌 Connecting to signaling (Polling)...', 'info');
        
        try {
            const res = await fetch(this.signalingUrl + '/api/signaling/room/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    competition_id: this.competitionId,
                    role: this.role,
                    token: this.token
                })
            });
            
            const data = await res.json();
            
            if (!data.success) {
                testLog('❌ Join failed: ' + (data.error || 'Unknown'), 'error');
                this.onError(new Error(data.error));
                return;
            }
            
            testLog('✅ Joined room as ' + this.role, 'success');
            this.isConnected = true;
            this.onConnected();
            this.startPolling();
            
        } catch (err) {
            testLog('❌ Connection error: ' + err.message, 'error');
            this.onError(err);
        }
    }
    
    startPolling() {
        if (this.pollInterval) clearInterval(this.pollInterval);
        
        this.pollInterval = setInterval(async () => {
            if (!this.isConnected) return;
            
            try {
                const res = await fetch(this.signalingUrl + '/api/signaling/poll', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        room_id: this.roomId,
                        role: this.role,
                        token: this.token,
                        last_timestamp: this.lastTimestamp
                    })
                });
                
                const data = await res.json();
                if (!data.success) return;
                
                if (data.data.peer_connected && !this.peerWasConnected) {
                    this.peerWasConnected = true;
                    testLog('👋 Peer connected', 'info');
                    this.onPeerJoined({ role: this.role === 'host' ? 'opponent' : 'host' });
                } else if (!data.data.peer_connected && this.peerWasConnected) {
                    this.peerWasConnected = false;
                    testLog('👋 Peer disconnected', 'warn');
                    this.onPeerLeft({ role: this.role === 'host' ? 'opponent' : 'host' });
                }
                
                if (data.data.signals && data.data.signals.length > 0) {
                    for (const signal of data.data.signals) {
                        this.lastTimestamp = Math.max(this.lastTimestamp, signal.timestamp);
                        this.onSignal({ signalType: signal.signalType, signalData: signal.signalData });
                    }
                }
            } catch (err) {
                console.error('Poll error:', err);
            }
        }, 1000);
    }
    
    async sendSignal(signalType, signalData) {
        if (!this.isConnected) return;
        try {
            await fetch(this.signalingUrl + '/api/signaling/signal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    room_id: this.roomId,
                    role: this.role,
                    token: this.token,
                    signal_type: signalType,
                    signal_data: signalData
                })
            });
        } catch (err) {
            console.error('Send signal error:', err);
        }
    }
    
    async disconnect() {
        this.isConnected = false;
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        try {
            await fetch(this.signalingUrl + '/api/signaling/room/leave', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ room_id: this.roomId, role: this.role, token: this.token })
            });
        } catch (err) { console.error('Leave error:', err); }
        testLog('🔌 Signaling disconnected', 'warn');
    }
}

window.SignalingManager = SignalingManager;

/**
 * updateStatus - تحديث حالة الصفحة
 */
function updateStatus(text, color = 'yellow') {
    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.innerHTML =
            '<span class="text-' + color + '-600 dark:text-' + color + '-400"><i class="fas fa-circle mr-2" aria-hidden="true"></i>' + text + '</span>';
    }
}

window.updateStatus = updateStatus;

/**
 * setMode - تحديث شارة الوضع (للمشاهد)
 */
function setMode(mode, text) {
    const modeBadge = document.getElementById('modeBadge');
    if (!modeBadge) return;

    modeBadge.classList.remove('hidden', 'mode-hls', 'mode-mse', 'mode-vod');

    if (mode === 'hls') {
        modeBadge.classList.add('mode-hls', 'pulse');
        modeBadge.innerHTML = '<i class="fas fa-broadcast-tower mr-1" aria-hidden="true"></i>HLS';
    } else if (mode === 'mse') {
        modeBadge.classList.add('mode-mse', 'pulse');
        modeBadge.innerHTML = '<i class="fas fa-puzzle-piece mr-1" aria-hidden="true"></i>MSE';
    } else if (mode === 'vod') {
        modeBadge.classList.add('mode-vod');
        modeBadge.innerHTML = '<i class="fas fa-film mr-1" aria-hidden="true"></i>VOD';
    } else {
        modeBadge.classList.add('hidden');
    }
}

window.setMode = setMode;

/**
 * detectDeviceCapabilities - كشف قدرات الجهاز
 */
function detectDeviceCapabilities() {
    const capabilities = {
        isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
        supportsScreenShare: !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia),
        supportsCamera: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
    };
    
    testLog('📱 Device:', 'info');
    testLog('   - Mobile: ' + capabilities.isMobile, capabilities.isMobile ? 'warn' : 'info');
    testLog('   - Screen: ' + capabilities.supportsScreenShare, capabilities.supportsScreenShare ? 'success' : 'error');
    testLog('   - Camera: ' + capabilities.supportsCamera, capabilities.supportsCamera ? 'success' : 'error');
    
    return capabilities;
}

window.detectDeviceCapabilities = detectDeviceCapabilities;

/**
 * drawVideoProportional - رسم فيديو بشكل متناسب
 */
function drawVideoProportional(ctx, video, x, y, maxWidth, maxHeight, label) {
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

    ctx.strokeStyle = '#4f46e5';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, maxWidth, maxHeight);

    if (label) {
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(x + 10, y + maxHeight - 35, 80, 25);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px Arial';
        ctx.fillText(label, x + 20, y + maxHeight - 15);
    }
}

window.drawVideoProportional = drawVideoProportional;

/**
 * detectBestMimeType - كشف أفضل صيغة مدعومة
 * يفضل MP4 مع H.264/AAC للتوافق مع Safari/iOS + Chrome 2024+
 */
function detectBestMimeType() {
    const options = [
        // MP4 مع H.264 + AAC (الأكثر توافقاً)
        'video/mp4; codecs="avc1.424028, mp4a.40.2"',  // H.264 Constrained Baseline Level 4 + AAC
        'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',  // H.264 Baseline + AAC
        'video/mp4; codecs="avc1.4d002a, mp4a.40.2"',  // H.264 Main Profile + AAC
        'video/mp4;codecs="avc1,mp4a.40.2"',           // Generic H.264 + AAC
        // ⚠️ لا نستخدم video/mp4 العام لأنه قد يختار VP9
        // WebM كخيار أخير
        'video/webm; codecs=vp9,opus',
        'video/webm; codecs=vp8,opus',
        'video/webm'
    ];

    for (const type of options) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
            const extension = type.includes('mp4') ? 'mp4' : 'webm';
            const codec = type.includes('avc1') ? 'H.264' : (type.includes('vp9') ? 'VP9' : 'VP8');
            console.log('[detectBestMimeType] ✅ Using: ' + extension.toUpperCase() + ' with ' + codec);
            console.log('[detectBestMimeType] Full mimeType: ' + type);
            
            if (extension === 'webm') {
                console.warn('⚠️ Recording in WebM - Safari/iPhone viewers will NOT be able to watch!');
            }
            
            return { mimeType: type, extension: extension };
        } else {
            console.log('[detectBestMimeType] ❌ Not supported: ' + type);
        }
    }

    // Fallback
    console.warn('[detectBestMimeType] No preferred format supported, using default webm');
    return { mimeType: 'video/webm', extension: 'webm' };
}

window.detectBestMimeType = detectBestMimeType;

// ===== Quality Presets =====

const qualityPresets = {
    excellent: { name: 'Excellent', width: 1280, height: 360, fps: 30, segment: 4000, bitrate: 2000000 },
    good:      { name: 'Good', width: 854,  height: 240, fps: 24, segment: 6000, bitrate: 1000000 },
    medium:    { name: 'Medium', width: 640,  height: 180, fps: 15, segment: 10000, bitrate: 500000 },
    low:       { name: 'Low', width: 426,  height: 120, fps: 10, segment: 20000, bitrate: 250000 },
    minimal:   { name: 'Minimal', width: 320,  height: 90,  fps: 10, segment: 30000, bitrate: 150000 }
};

window.qualityPresets = qualityPresets;

// ===== Classes =====

/**
 * UploadQueue - إدارة رفع القطع
 */
class UploadQueue {
    constructor(competitionId, onProgress, extension) {
        this.queue = [];
        this.isUploading = false;
        this.competitionId = competitionId;
        this.droppedChunks = 0;
        this.corruptedChunks = 0;
        this.ffmpegUrl = '${FFMPEG_URL}';
        this.onProgress = onProgress;
        this.extension = extension || 'webm';
    }

    setExtension(ext) {
        this.extension = ext;
        console.log('[UploadQueue] Extension set to: ' + ext);
    }

    validateChunk(blob, index) {
        if (blob.size < 1024) {
            return { valid: false, reason: 'Chunk too small (<1KB)' };
        }

        if (blob.size > 50 * 1024 * 1024) {
            return { valid: false, reason: 'Chunk too large (>50MB)' };
        }

        if (!blob.type || !blob.type.includes('video')) {
            return { valid: false, reason: 'Invalid type (not video)' };
        }

        try {
            const testUrl = URL.createObjectURL(blob);
            URL.revokeObjectURL(testUrl);
        } catch (e) {
            return { valid: false, reason: 'Corrupted chunk' };
        }

        return { valid: true };
    }

    add(blob, index) {
        const validation = this.validateChunk(blob, index);

        if (!validation.valid) {
            this.corruptedChunks++;
            testLog('⚠️ Chunk ' + index + ' rejected: ' + validation.reason + ' (Total: ' + this.corruptedChunks + ')', 'warn');
            return;
        }

        this.queue.push({ blob, index });
        this.processQueue();
    }

    async processQueue() {
        if (this.isUploading || this.queue.length === 0) return;

        while (this.queue.length > 3) {
            this.queue.shift();
            this.droppedChunks++;
            testLog('⚠️ Dropped chunk - Total: ' + this.droppedChunks, 'warn');
        }

        this.isUploading = true;
        const { blob, index } = this.queue.shift();

        try {
            await this.uploadChunk(blob, index);
            if (this.onProgress) this.onProgress(index + 1, -1);
        } catch (error) {
            testLog('Upload error: ' + error.message, 'error');
        } finally {
            this.isUploading = false;
            this.processQueue();
        }
    }

    async uploadChunk(blob, index) {
        const formData = new FormData();
        formData.append('chunk', blob, 'chunk_' + String(index).padStart(4, '0') + '.' + this.extension);
        formData.append('competition_id', this.competitionId);
        formData.append('chunk_number', (index + 1).toString());
        formData.append('extension', this.extension);

        const uploadStart = performance.now();

        const res = await fetch(this.ffmpegUrl + '/upload.php', {
            method: 'POST',
            body: formData
        });

        const result = await res.json();
        const latency = performance.now() - uploadStart;

        testLog('Chunk ' + index + ': ' + (result.success ? '✓' : '✗') + ' (' + Math.round(latency) + 'ms)', result.success ? 'success' : 'error');

        if (!res.ok) throw new Error('Upload failed');
    }

    async waitForCompletion() {
        while (this.queue.length > 0 || this.isUploading) {
            await this.delay(500);
        }
    }

    getStats() {
        return {
            dropped: this.droppedChunks,
            corrupted: this.corruptedChunks
        };
    }

    delay(ms) {
        return new Promise(function(resolve) { setTimeout(resolve, ms); });
    }
}

window.UploadQueue = UploadQueue;

/**
 * ChunkManager - إدارة القطع للمشاهد
 */
class ChunkManager {
    constructor(competitionId, extension = 'webm') {
        this.currentIndex = 0;
        this.misses = 0;
        this.competitionId = competitionId;
        this.extension = extension;
        this.basePath = '${FFMPEG_URL}/stream.php?path=live/match_' + competitionId;
    }

    getUrl(index) {
        const chunkNumber = index + 1;
        const paddedIndex = String(chunkNumber).padStart(4, '0');
        return this.basePath + '/chunk_' + paddedIndex + '.' + this.extension;
    }

    async exists(index) {
        try {
            const url = this.getUrl(index);
            const res = await fetch(url, { method: 'HEAD' });
            return res.ok;
        } catch (e) {
            return false;
        }
    }

    async waitForNextChunk() {
        const targetIndex = this.currentIndex + 1;

        while (true) {
            const exists = await this.exists(targetIndex);
            if (exists) {
                this.currentIndex = targetIndex;
                this.misses = 0;
                return targetIndex;
            }

            this.misses++;
            const delay = Math.min(1000 + this.misses * 500, 5000);
            await new Promise(function(r) { setTimeout(r, delay); });
        }
    }

    async getAvailableChunks() {
        const chunks = [];
        let index = 0;

        while (true) {
            const exists = await this.exists(index);
            if (!exists) break;
            chunks.push({
                index: index,
                url: this.getUrl(index)
            });
            index++;
        }

        return chunks;
    }
}

window.ChunkManager = ChunkManager;

/**
 * LiveSequentialPlayer - مشغل البث المباشر
 */
class LiveSequentialPlayer {
    constructor(options) {
        this.videoPlayers = options.videoPlayers;
        this.chunkManager = options.chunkManager;
        this.onChunkChange = options.onChunkChange;
        this.onStatus = options.onStatus;
        this.onError = options.onError;

        this.activePlayerIndex = 0;
        this.isRunning = false;
        this.preloadedChunks = new Map();
    }

    async start() {
        this.isRunning = true;
        this.onStatus && this.onStatus('Starting live stream...');

        const firstChunk = await this.chunkManager.waitForNextChunk();
        this.onStatus && this.onStatus('Found first chunk: ' + firstChunk);

        await this.playChunk(firstChunk);
        this.runLoop();
    }

    async runLoop() {
        while (this.isRunning) {
            try {
                const nextIndex = await this.chunkManager.waitForNextChunk();
                await this.playChunk(nextIndex);
            } catch (error) {
                this.onError && this.onError(error);
                await new Promise(function(r) { setTimeout(r, 2000); });
            }
        }
    }

    async playChunk(index) {
        const url = this.chunkManager.getUrl(index);
        const nextPlayerIndex = (this.activePlayerIndex + 1) % 2;
        const nextPlayer = this.videoPlayers[nextPlayerIndex];
        const currentPlayer = this.videoPlayers[this.activePlayerIndex];

        nextPlayer.src = url;
        await nextPlayer.load();

        await new Promise(function(resolve, reject) {
            nextPlayer.oncanplay = resolve;
            nextPlayer.onerror = reject;
            setTimeout(resolve, 3000);
        });

        nextPlayer.style.opacity = '1';
        nextPlayer.style.zIndex = '2';
        currentPlayer.style.opacity = '0';
        currentPlayer.style.zIndex = '1';

        nextPlayer.play().catch(function() {});
        this.activePlayerIndex = nextPlayerIndex;

        this.onChunkChange && this.onChunkChange(index, -1);
    }

    stop() {
        this.isRunning = false;
        this.videoPlayers.forEach(function(v) {
            v.pause();
            v.src = '';
        });
    }
}

window.LiveSequentialPlayer = LiveSequentialPlayer;

/**
 * VodMsePlayer - مشغل الفيديو عند الطلب
 */
class VodMsePlayer {
    constructor(options) {
        this.videoElement = options.videoElement;
        this.chunkManager = options.chunkManager;
        this.onProgress = options.onProgress;

        this.mediaSource = null;
        this.sourceBuffer = null;
        this.chunks = [];
    }

    async start() {
        this.chunks = await this.chunkManager.getAvailableChunks();

        if (this.chunks.length === 0) {
            throw new Error('No chunks available');
        }

        // اختيار mimeType بناءً على extension
        const ext = this.chunkManager.extension || 'webm';
        const mimeType = ext === 'mp4' 
            ? 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'
            : 'video/webm; codecs="vp8, opus"';
        
        console.log('[VodMsePlayer] Using format: ' + ext + ' (' + mimeType + ')');

        this.mediaSource = new MediaSource();
        this.videoElement.src = URL.createObjectURL(this.mediaSource);

        await new Promise(function(resolve) {
            this.mediaSource.addEventListener('sourceopen', resolve, { once: true });
        }.bind(this));

        this.sourceBuffer = this.mediaSource.addSourceBuffer(mimeType);

        for (let i = 0; i < this.chunks.length; i++) {
            await this.appendChunk(this.chunks[i]);
            this.onProgress && this.onProgress(i + 1, this.chunks.length);
        }

        this.mediaSource.endOfStream();
    }

    async appendChunk(chunk) {
        const response = await fetch(chunk.url);
        const buffer = await response.arrayBuffer();

        await new Promise(function(resolve) {
            if (this.sourceBuffer.updating) {
                this.sourceBuffer.addEventListener('updateend', resolve, { once: true });
            } else {
                resolve();
            }
        }.bind(this));

        this.sourceBuffer.appendBuffer(buffer);

        await new Promise(function(resolve) {
            this.sourceBuffer.addEventListener('updateend', resolve, { once: true });
        }.bind(this));
    }

    stop() {
        if (this.videoElement) {
            this.videoElement.pause();
            this.videoElement.src = '';
        }
    }
}

window.VodMsePlayer = VodMsePlayer;

// ===== Common UI Functions =====

/**
 * toggleFullscreen - تبديل ملء الشاشة
 */
window.toggleFullscreen = function() {
    const remoteContainer = document.getElementById('remoteVideoContainer');
    if (!remoteContainer) return;
    
    if (!document.fullscreenElement) {
        if (remoteContainer.requestFullscreen) {
            remoteContainer.requestFullscreen();
        } else if (remoteContainer.webkitRequestFullscreen) {
            remoteContainer.webkitRequestFullscreen();
        } else if (remoteContainer.msRequestFullscreen) {
            remoteContainer.msRequestFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }
}

// استماع لتغيير حالة ملء الشاشة
document.addEventListener('fullscreenchange', function() {
    const icon = document.getElementById('fullscreenIcon');
    if (icon) {
        icon.className = document.fullscreenElement ? 
            'fas fa-compress text-white text-sm' : 
            'fas fa-expand text-white text-sm';
    }
});

/**
 * toggleLocalVideoVisibility - تبديل رؤية الفيديو المحلي
 */
window.toggleLocalVideoVisibility = function() {
    const localWrapper = document.getElementById('localVideoWrapper');
    const remoteWrapper = document.getElementById('remoteVideoWrapper');
    const icon = document.getElementById('hideLocalIcon');
    
    if (!localWrapper || !remoteWrapper) return;
    
    const isVisible = !localWrapper.classList.contains('video-wrapper-hidden');
    
    if (isVisible) {
        localWrapper.classList.add('video-wrapper-hidden');
        localWrapper.classList.remove('w-full', 'md:w-[48%]');
        remoteWrapper.classList.remove('w-full', 'md:w-[48%]');
        remoteWrapper.classList.add('w-full', 'md:w-[80%]');
        if (icon) icon.className = 'fas fa-eye-slash text-white';
    } else {
        localWrapper.classList.remove('video-wrapper-hidden');
        localWrapper.classList.add('w-full', 'md:w-[48%]');
        remoteWrapper.classList.remove('w-full', 'md:w-[80%]');
        remoteWrapper.classList.add('w-full', 'md:w-[48%]');
        if (icon) icon.className = 'fas fa-eye text-white';
    }
}
// ===== Shared State Variables =====
// متغيرات الحالة المشتركة بين host و guest
let localStream = null;
let pc = null;
let pollingInterval = null;
let isScreenSharing = false;
let isCameraOn = false;
let currentFacing = 'user';
let isMicOn = true;
let isSpeakerOn = true;
let isConnected = false;

// تصدير للـ window
window.mediaState = {
    get localStream() { return localStream; },
    set localStream(v) { localStream = v; },
    get pc() { return pc; },
    set pc(v) { pc = v; },
    get pollingInterval() { return pollingInterval; },
    set pollingInterval(v) { pollingInterval = v; },
    get isScreenSharing() { return isScreenSharing; },
    set isScreenSharing(v) { isScreenSharing = v; },
    get isCameraOn() { return isCameraOn; },
    set isCameraOn(v) { isCameraOn = v; },
    get currentFacing() { return currentFacing; },
    set currentFacing(v) { currentFacing = v; },
    get isMicOn() { return isMicOn; },
    set isMicOn(v) { isMicOn = v; },
    get isSpeakerOn() { return isSpeakerOn; },
    set isSpeakerOn(v) { isSpeakerOn = v; },
    get isConnected() { return isConnected; },
    set isConnected(v) { isConnected = v; }
};

// ===== Common Media Functions =====

/**
 * updateButtonStates - تحديث حالة أزرار الشاشة والكاميرا
 */
function updateButtonStates() {
    const screenBtn = document.getElementById('screenBtn');
    const cameraBtn = document.getElementById('cameraBtn');
    const cameraIcon = document.getElementById('cameraIcon');
    const screenIcon = document.getElementById('screenIcon');
    
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
    if (screenIcon) {
        screenIcon.className = isScreenSharing ? 'fas fa-desktop text-white' : 'fas fa-desktop text-white';
    }
}
window.updateButtonStates = updateButtonStates;

/**
 * window.toggleSpeaker - تبديل السماعة
 */
window.toggleSpeaker = function() {
    const remoteVideo = document.getElementById('remoteVideo');
    isSpeakerOn = !isSpeakerOn;
    if (remoteVideo) remoteVideo.muted = !isSpeakerOn;
    const icon = document.getElementById('speakerIcon');
    if (icon) icon.className = isSpeakerOn ? 'fas fa-volume-up text-white' : 'fas fa-volume-mute text-white';
};

/**
 * window.toggleLocalVideo - تبديل رؤية الفيديو المحلي
 */
window.toggleLocalVideo = function() {
    toggleLocalVideoVisibility();
};

/**
 * window.switchCamera - تبديل الكاميرا أمامية/خلفية
 */
window.switchCamera = async function() {
    if (!localStream || isScreenSharing) return;
    currentFacing = currentFacing === 'user' ? 'environment' : 'user';
    await window.useCamera(currentFacing);
};

/**
 * window.toggleMic - تبديل الميكروفون (بدون log)
 */
window.toggleMic = function() {
    if (!localStream) return;
    isMicOn = !isMicOn;
    localStream.getAudioTracks().forEach(function(track) { track.enabled = isMicOn; });
    const icon = document.getElementById('micIcon');
    if (icon) icon.className = isMicOn ? 'fas fa-microphone text-white' : 'fas fa-microphone-slash text-white';
};

/**
 * window.toggleScreen - تبديل مشاركة الشاشة
 * إذا كانت الكاميرا مفعلة، أغلقها أولاً
 */
window.toggleScreen = async function() {
    if (isScreenSharing) {
        // إيقاف مشاركة الشاشة
        if (localStream) localStream.getTracks().forEach(function(t) { t.stop(); });
        localStream = null;
        const localVideo = document.getElementById('localVideo');
        if (localVideo) localVideo.srcObject = null;
        isScreenSharing = false;
        testLog('Screen share stopped', 'info');
        updateStatus('Share screen or use camera', 'yellow');
    } else {
        // إغلاق الكاميرا أولاً إن كانت مفعلة
        if (isCameraOn && localStream) {
            localStream.getTracks().forEach(function(t) { t.stop(); });
            localStream = null;
            isCameraOn = false;
        }
        // بدء مشاركة الشاشة
        await window.shareScreen();
        if (localStream) {
            isScreenSharing = true;
            isCameraOn = false;
        }
    }
    updateButtonStates();
};

/**
 * window.toggleCamera - تبديل الكاميرا
 * إذا كانت مشاركة الشاشة مفعلة، أغلقها أولاً
 */
window.toggleCamera = async function() {
    if (isCameraOn) {
        // إيقاف الكاميرا
        if (localStream) localStream.getTracks().forEach(function(t) { t.stop(); });
        localStream = null;
        const localVideo = document.getElementById('localVideo');
        if (localVideo) localVideo.srcObject = null;
        isCameraOn = false;
        testLog('Camera stopped', 'info');
        updateStatus('Share screen or use camera', 'yellow');
    } else {
        // إغلاق مشاركة الشاشة أولاً إن كانت مفعلة
        if (isScreenSharing && localStream) {
            localStream.getTracks().forEach(function(t) { t.stop(); });
            localStream = null;
            isScreenSharing = false;
        }
        // بدء الكاميرا
        await window.useCamera(currentFacing);
        if (localStream) {
            isCameraOn = true;
            isScreenSharing = false;
        }
    }
    updateButtonStates();
};

/**
 * showMobileAlternative - عرض أزرار بديلة للموبايل
 */
function showMobileAlternative(frontLabel, backLabel) {
    let cameraBtns = document.getElementById('cameraButtons');
    if (!cameraBtns) {
        cameraBtns = document.createElement('div');
        cameraBtns.id = 'cameraButtons';
        cameraBtns.className = 'flex flex-wrap gap-2 justify-center mb-4';
        
        const frontBtn = document.createElement('button');
        frontBtn.className = 'px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition';
        frontBtn.innerHTML = '<i class="fas fa-camera mr-2"></i>' + frontLabel;
        frontBtn.onclick = function() { window.useCamera('user'); };
        
        const backBtn = document.createElement('button');
        backBtn.className = 'px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition';
        backBtn.innerHTML = '<i class="fas fa-camera-retro mr-2"></i>' + backLabel;
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
window.showMobileAlternative = showMobileAlternative;
/**
 * window.shareScreen - مشاركة الشاشة
 */
window.shareScreen = async function() {
    const caps = detectDeviceCapabilities();
    
    if (caps.isMobile || !caps.supportsScreenShare) {
        testLog('Screen share not supported', 'warn');
        if (window._showMobileAlternativeCallback) {
            window._showMobileAlternativeCallback();
        }
        return;
    }
    
    try {
        testLog('Starting screen share...');
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: 'always' },
            audio: true
        });
        
        console.log('[DEBUG] shareScreen - localStream assigned:', localStream);
        console.log('[DEBUG] shareScreen - window.mediaState.localStream:', window.mediaState.localStream);
        
        const localVideo = document.getElementById('localVideo');
        if (localVideo) localVideo.srcObject = localStream;
        testLog('Screen share started ✓', 'success');
        updateStatus('Screen share ✓', 'green');
        
        localStream.getVideoTracks()[0].onended = function() {
            testLog('Screen share stopped', 'warn');
            updateStatus('Share screen to continue', 'yellow');
        };
    } catch (err) {
        testLog('Error: ' + err.message, 'warn');
        if (window._showMobileAlternativeCallback) {
            window._showMobileAlternativeCallback();
        }
    }
};

/**
 * window.useCamera - استخدام الكاميرا
 */
window.useCamera = async function(facingMode) {
    try {
        testLog('Starting camera: ' + facingMode + '...');
        
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
        const localVideo = document.getElementById('localVideo');
        if (localVideo) localVideo.srcObject = localStream;
        
        const cameraBtns = document.getElementById('cameraButtons');
        if (cameraBtns) cameraBtns.style.display = 'none';
        
        isCameraOn = true;
        isScreenSharing = false;
        currentFacing = facingMode;
        
        testLog('Camera started ✓', 'success');
        updateStatus('Camera ✓ - Ready to connect', 'green');
    } catch (err) {
        testLog('Error: ' + err.message, 'error');
    }
};

/**
 * updateConnectionButtons - تحديث أزرار الاتصال
 * تعمل مع كلا الـ host (connectBtn) و guest (joinBtn)
 */
function updateConnectionButtons(connected) {
    console.log('[DEBUG] updateConnectionButtons called with:', connected);
    isConnected = connected;
    
    // Host uses connectBtn, Guest uses joinBtn
    const connectBtn = document.getElementById('connectBtn');
    const joinBtn = document.getElementById('joinBtn');
    const reconnectBtn = document.getElementById('reconnectBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    
    console.log('[DEBUG] Buttons found:', {
        connectBtn: !!connectBtn,
        joinBtn: !!joinBtn,
        reconnectBtn: !!reconnectBtn,
        disconnectBtn: !!disconnectBtn
    });
    
    if (connectBtn) {
        connectBtn.classList.toggle('hidden', connected);
        console.log('[DEBUG] connectBtn hidden:', connected);
    }
    if (joinBtn) {
        joinBtn.classList.toggle('hidden', connected);
        console.log('[DEBUG] joinBtn hidden:', connected);
    }
    if (reconnectBtn) {
        reconnectBtn.classList.toggle('hidden', !connected);
        console.log('[DEBUG] reconnectBtn hidden:', !connected);
    }
    if (disconnectBtn) {
        disconnectBtn.classList.toggle('hidden', !connected);
        console.log('[DEBUG] disconnectBtn hidden:', !connected);
    }
}
window.updateConnectionButtons = updateConnectionButtons;

console.log('[Client Shared] Loaded successfully');
    `;
}