/**
 * Test Stream Client Shared Script
 * الدوال والـ Classes المشتركة بين جميع صفحات الاختبار
 * يُحقن في كل صفحة عبر main.ts
 */

const FFMPEG_URL = 'https://maelsh.pro/ffmpeg';

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
    constructor(competitionId, onProgress) {
        this.queue = [];
        this.isUploading = false;
        this.competitionId = competitionId;
        this.droppedChunks = 0;
        this.corruptedChunks = 0;
        this.ffmpegUrl = '${FFMPEG_URL}';
        this.onProgress = onProgress;
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
        formData.append('chunk', blob, 'chunk_' + String(index).padStart(4, '0') + '.webm');
        formData.append('competition_id', this.competitionId);
        formData.append('chunk_number', (index + 1).toString());
        formData.append('extension', 'webm');

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

        this.mediaSource = new MediaSource();
        this.videoElement.src = URL.createObjectURL(this.mediaSource);

        await new Promise(function(resolve) {
            this.mediaSource.addEventListener('sourceopen', resolve, { once: true });
        }.bind(this));

        this.sourceBuffer = this.mediaSource.addSourceBuffer('video/webm; codecs="vp8, opus"');

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

console.log('[Client Shared] Loaded successfully');
    `;
}
