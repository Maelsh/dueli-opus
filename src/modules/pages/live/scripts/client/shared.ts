/**
 * Test Stream Client Shared Script
 * الدوال والـ Classes المشتركة بين جميع صفحات الاختبار
 * يُحقن في كل صفحة عبر main.ts
 */

const FFMPEG_URL = 'https://maelshpro.com/ffmpeg';

import type { Language } from '../../../../../config/types';
import { translations, getUILanguage } from '../../../../../i18n';

/**
 * Get Client Shared Script - توليد الـ JavaScript المشترك
 * @param lang UI language — used to bake translated TURN/network messages
 *             (7.D: TURN failure must never produce a black screen).
 */
export function getClientSharedScript(lang: Language = 'en'): string {
    const tr = translations[getUILanguage(lang)];
    const TURN_UNAVAILABLE = tr.live_signaling.turn_unavailable;
    const NETWORK_RESTRICTED = tr.live_signaling.network_restricted;

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
 * debugLog - console.log مشروط بوضع التصحيح فقط
 * فُعّل بتشغيل: localStorage.setItem('dueli_debug', '1') من الـ devtools console
 */
window.DUELI_DEBUG = (typeof localStorage !== 'undefined' && localStorage.getItem('dueli_debug') === '1');
function debugLog() {
    if (window.DUELI_DEBUG) {
        console.log.apply(console, arguments);
    }
}
window.debugLog = debugLog;

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
 * 7.D: credentials are short-lived and per-session — the request must be
 * authenticated. Any failure degrades gracefully to STUN with translated,
 * understandable messages (never a black screen).
 */
async function fetchIceServers() {
    const TURN_UNAVAILABLE_MSG = '${TURN_UNAVAILABLE}';
    const NETWORK_RESTRICTED_MSG = '${NETWORK_RESTRICTED}';
    try {
        const headers = {};
        const token = getSessionToken();
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const response = await fetch('/api/signaling/ice-servers', { headers: headers });
        const data = await response.json();
        if (response.ok && data.success && data.data && data.data.iceServers) {
            window.DUELI_TURN_STATE = {
                available: !!data.data.turn_available,
                expires_at: data.data.expires_at || null
            };
            if (data.data.turn_available) {
                testLog('✅ ICE servers fetched (' + data.data.iceServers.length + ') + TURN relay', 'success');
            } else {
                testLog('✅ ICE servers fetched (STUN only)', 'success');
                testLog('⚠️ ' + TURN_UNAVAILABLE_MSG, 'warn');
            }
            return data.data.iceServers;
        }
        // 401 / 5xx — TURN backend failed or session expired: translated message
        testLog('⚠️ ' + TURN_UNAVAILABLE_MSG, 'warn');
    } catch (error) {
        testLog('⚠️ ' + TURN_UNAVAILABLE_MSG, 'warn');
    }
    window.DUELI_TURN_STATE = { available: false, expires_at: null };
    // 7.D graceful degradation: understandable message + fallback option
    // (direct STUN connection) instead of a dead/black stream.
    testLog('ℹ️ ' + NETWORK_RESTRICTED_MSG, 'info');
    // Fallback
    return [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ];
}

window.fetchIceServers = fetchIceServers;

// ===== Signaling transport: the single shared implementation =====
// R4-LIVE-INT-1: the signaling transport lives in exactly one place —
// src/client/services/SignalingManager.ts, shipped in the site-wide app
// bundle (/static/app.js, loaded with defer on every page including these
// test pages) and exposed as window.SignalingManager. The retry bounds come
// from the shared server/browser SSOT (SignalingReconnectPolicy), so the
// client can never retry unbounded. Test pages consume it via
// 'new window.SignalingManager({...})' (same config shape as before);
// diagnostics (testLog) are injected as the 'logger', never bundled into
// production behavior.

// (constructor + connect live in the shared bundle module now — see note above)

// (presence + heartbeat + polling live in the shared bundle module now — see note above)

// (send + recovery + disconnect live in the shared bundle module now — see note above)

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
 *
 * R4-CHUNK-PLAY-1: playlist-driven. The single CORS-safe proxy read
 * (/api/chunks/playlist/:id, normalized server-side: validated, deduped,
 * index-sorted) replaces per-chunk CORS-blocked HEAD probes against the
 * external ffmpeg host — those could never succeed cross-origin, so live
 * playback stalled before the first chunk. Entry indices come from the
 * playlist (gaps tolerated, see waitForNextChunk); the constructed URL is
 * only a fallback for legacy list shapes without absolute URLs.
 */
class ChunkManager {
    constructor(competitionId, extension = 'webm') {
        this.currentIndex = -1;  // -1 so waitForNextChunk() finds the first chunk first
        this.misses = 0;
        this.competitionId = competitionId;
        this.extension = extension;
        // Normalized playlist entries {index, url, duration?, size?}.
        this.entries = [];
        // Consecutive missing indices tolerated while the server already
        // lists LATER chunks (a deep hole means a broken stream, not a gap).
        this.MAX_GAP_SKIP = 50;
        this.basePath = '${FFMPEG_URL}/stream.php?path=live/match_' + competitionId;
    }

    async refreshPlaylist() {
        try {
            const res = await fetch('/api/chunks/playlist/' + this.competitionId);
            // 429/5xx from our own edge (rate limit) → transient miss, never
            // fatal: the caller backs off and retries within its bounds.
            if (!res.ok) return false;
            const data = await res.json();
            if (!data || !Array.isArray(data.chunks)) return false;
            this.entries = data.chunks;
            if (typeof data.extension === 'string' && data.extension && data.extension !== this.extension) {
                testLog('🔎 Format detected: .' + data.extension + ' (was looking for .' + this.extension + ')', 'info');
                this.extension = data.extension;
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    entryFor(index) {
        for (const entry of this.entries) {
            if (entry && entry.index === index) return entry;
        }
        return null;
    }

    /**
     * R4-CHUNK-PLAYER-UX-1: index readiness (additive playlist fields).
     * hasReadyInfo = at least one entry carries ready===true. Entries
     * flagged ready===false are skipped ONLY then; legacy lists without
     * any flags play everything (old VOD compatibility preserved).
     */
    hasReadyInfo() {
        for (const entry of this.entries) {
            if (entry && entry.ready === true) return true;
        }
        return false;
    }

    isSkippable(entry) {
        return !!entry && entry.ready === false && this.hasReadyInfo();
    }

    latestReadyIndex() {
        let top = -1;
        for (const entry of this.entries) {
            if (entry && typeof entry.index === 'number' && entry.ready === true && entry.index > top) top = entry.index;
        }
        return top;
    }

    maxIndex() {
        let top = -1;
        for (const entry of this.entries) {
            if (entry && typeof entry.index === 'number' && entry.index > top) top = entry.index;
        }
        return top;
    }

    getUrl(index) {
        const entry = this.entryFor(index);
        if (entry && typeof entry.url === 'string' && entry.url) return entry.url;
        const chunkNumber = index + 1;
        const paddedIndex = String(chunkNumber).padStart(4, '0');
        return this.basePath + '/chunk_' + paddedIndex + '.' + this.extension;
    }

    async exists(index) {
        await this.refreshPlaylist();
        return !!this.entryFor(index);
    }

    async waitForNextChunk(maxMisses) {
        let targetIndex = this.currentIndex + 1;
        maxMisses = maxMisses || 0; // 0 = wait forever (for live), >0 = stop after N misses
        let localMisses = 0;
        let gapSkips = 0;

        while (true) {
            await this.refreshPlaylist();
            // R4-CHUNK-PLAYER-UX-1: playable entries return immediately;
            // index-marked unconfirmed slots are SKIPPED only when newer
            // entries exist (authoritative, budget-free); an unready newest
            // or a hole falls through to the bounded wait below (never
            // played blind, never skipped forever).
            const listed = this.entryFor(targetIndex);
            if (listed && !this.isSkippable(listed)) {
                this.currentIndex = targetIndex;
                this.misses = 0;
                return targetIndex;
            }
            if (listed && this.isSkippable(listed) && this.maxIndex() > targetIndex) {
                testLog('Skipping unconfirmed chunk ' + (targetIndex + 1) + ' (index authority)', 'warn');
                this.currentIndex = targetIndex;
                targetIndex++;
                continue;
            }

            // Gap support: the server already lists LATER chunks, so the
            // missing index was dropped or is late — skip it (counted) and
            // keep the tail flowing instead of stalling forever.
            if (this.maxIndex() > targetIndex) {
                gapSkips++;
                testLog('⏭️ Gap at chunk ' + (targetIndex + 1) + ' (skip ' + gapSkips + ')', 'warn');
                if (gapSkips > this.MAX_GAP_SKIP) {
                    throw new Error('STREAM_ENDED');
                }
                this.currentIndex = targetIndex;
                targetIndex++;
                continue;
            }

            localMisses++;
            this.misses = localMisses;

            // إذا وصلت المحاولات للحد الأقصى → انتهى البث
            if (maxMisses > 0 && localMisses >= maxMisses) {
                throw new Error('STREAM_ENDED');
            }

            // Backoff grows 1s → 5s cap while nothing new arrives: bounded,
            // 429-friendly polling instead of a fixed hot loop.
            const delay = Math.min(1000 + localMisses * 500, 5000);
            await new Promise(function(r) { setTimeout(r, delay); });
        }
    }

    async getAvailableChunks() {
        await this.refreshPlaylist();
        return this.entries
            .filter(function(entry) { return entry && typeof entry.index === 'number'; })
            .map(function(entry) {
                return {
                    index: entry.index,
                    url: (typeof entry.url === 'string' && entry.url) ? entry.url : null
                };
            });
    }

    /**
     * الانتقال لآخر chunk موجود حالياً (للبث المباشر)
     * R4-CHUNK-PLAYER-UX-1 (15 §5): start at the NEWEST confirmed-ready
     * chunk — never the oldest, and not the penultimate by default. A
     * ready flag means finalized bytes, so the newest ready is safe to
     * play immediately. Only legacy lists without ANY readiness info keep
     * the penultimate fallback (their last chunk may be a partial write).
     */
    async skipToLatest() {
        try {
            await this.refreshPlaylist();
            const readyTop = this.latestReadyIndex();
            if (readyTop >= 0) {
                this.currentIndex = readyTop;
                testLog('Starting at newest confirmed-ready chunk ' + (readyTop + 1), 'info');
                return readyTop;
            }
            if (this.entries.length > 1) {
                // نبدأ من آخر chunk كاملة (ما قبل الأخيرة لضمان اكتمالها) —
                // بالفهرس الفعلي للمدخل، لا بطول القائمة (الفجوات مسموحة).
                const sorted = this.entries.slice().sort(function(a, b) { return a.index - b.index; });
                const latestIndex = sorted[sorted.length - 2].index;
                if (latestIndex > 0) {
                    this.currentIndex = latestIndex;
                    testLog('⏭️ Skipping to chunk ' + (latestIndex + 1) + '/' + this.entries.length, 'info');
                    return latestIndex;
                }
            }
        } catch (e) {
            testLog('⚠️ Could not skip to latest, starting from beginning', 'warn');
        }
        return 0;
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
        this.onStreamEnd = options.onStreamEnd; // يُستدعى عند انتهاء البث

        this.activePlayerIndex = 0;
        this.isRunning = false;
        this.preloadedChunks = new Map();
        this.MAX_MISSES = 25; // ~25 * متوسط 3ث = ~75ث بدون قطعة جديدة = انتهى البث
        // R4-CHUNK-PLAY-1: consecutive chunk-playback failures are bounded —
        // a poisoned chunk must surface a fatal error (with manual retry on
        // the page), never an endless error/retry loop.
        this.consecutiveErrors = 0;
        this.MAX_CONSECUTIVE_ERRORS = 10;
        // R4-CHUNK-PLAY-1: a single poisoned (undecodable) chunk must be
        // SKIPPED after a few retries so the tail keeps flowing — retrying
        // the same bytes forever would kill an otherwise healthy stream.
        this.lastFailedIndex = null;
        this.lastFailedCount = 0;
        this.MAX_CHUNK_RETRIES = 3;
    }

    async start(options) {
        options = options || {};
        this.isRunning = true;
        // Run-loop generation: rewindTo() retires the old loop so two loops
        // can never drive the elements concurrently.
        this.loopGen = (this.loopGen || 0) + 1;
        this.onStatus && this.onStatus('Starting live stream...');

        // إذا طُلب البدء من آخر chunk (للعرض المباشر للزوار)
        if (options.startFromLatest) {
            this.onStatus && this.onStatus('Finding latest chunk...');
            const edge = await this.chunkManager.skipToLatest();
            // R4-CHUNK-PLAYER-UX-1: play the positioned edge ITSELF — the
            // old code only waited for edge+1, which never arrives when the
            // edge is the newest confirmed chunk (live would sit at
            // 'waiting' forever). Falls through to the wait path only when
            // the playlist is still empty.
            if (edge > 0 || this.chunkManager.entryFor(edge)) {
                this.onStatus && this.onStatus('Found chunk: ' + (edge + 1));
                await this.playChunk(edge);
                this.runLoop(this.loopGen);
                return;
            }
        }

        const firstChunk = await this.chunkManager.waitForNextChunk();
        this.onStatus && this.onStatus('Found chunk: ' + (firstChunk + 1));

        await this.playChunk(firstChunk);
        this.runLoop(this.loopGen);
    }

    /**
     * R4-CHUNK-PLAYER-UX-1 (scope 3): reliable rewind — jump back to an
     * earlier chunk, then resume the forward flow from there. Retires the
     * running loop first (generation token) so the old position cannot
     * fight the new one; the next wait continues after the target.
     */
    async rewindTo(index) {
        if (!this.videoPlayers || this.videoPlayers.length === 0) return;
        if (typeof index !== 'number' || !isFinite(index) || index < 0) return;
        this.loopGen = (this.loopGen || 0) + 1;
        const gen = this.loopGen;
        this.isRunning = false;
        try {
            await this.playChunk(Math.floor(index));
        } catch (e) {
            this.onError && this.onError(e);
            return;
        }
        this.chunkManager.currentIndex = Math.floor(index);
        this.isRunning = true;
        this.runLoop(gen);
    }

    async runLoop(gen) {
        var myGen = gen === undefined ? this.loopGen : gen;
        while (this.isRunning && myGen === this.loopGen) {
            var target = null;
            try {
                target = await this.chunkManager.waitForNextChunk(this.MAX_MISSES);
                await this.playChunk(target);
                this.consecutiveErrors = 0;
                this.lastFailedIndex = null;
                this.lastFailedCount = 0;
            } catch (error) {
                if (error.message === 'STREAM_ENDED') {
                    this.isRunning = false;
                    this.onStatus && this.onStatus('Stream ended');
                    this.onStreamEnd && this.onStreamEnd();
                    break;
                }
                // Poisoned-chunk skip: the same index failing repeatedly is a
                // bad segment, not a bad stream — skip it (counted gap) and
                // keep the tail flowing.
                if (target !== null && target === this.lastFailedIndex) {
                    this.lastFailedCount++;
                } else {
                    this.lastFailedIndex = target;
                    this.lastFailedCount = 1;
                }
                if (target !== null && this.lastFailedCount >= this.MAX_CHUNK_RETRIES) {
                    this.onStatus && this.onStatus('Skipping unplayable chunk ' + (target + 1));
                    this.chunkManager.currentIndex = target;
                    this.lastFailedIndex = null;
                    this.lastFailedCount = 0;
                    // NOTE: consecutiveErrors is deliberately NOT reset here —
                    // an all-poisoned stream must still trip the fatal bound
                    // below instead of skipping forever.
                    continue;
                }
                this.consecutiveErrors++;
                if (this.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
                    this.isRunning = false;
                    this.onError && this.onError(new Error('Too many consecutive playback errors'));
                    break;
                }
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

        // R4-CHUNK-PLAYER-UX-1 handoff: arm the next element MUTED
        // (autoplay policy can block audible starts — a blocked audible
        // start looks exactly like a stall), with a bounded wait whose
        // timer is always cleaned up (the old code leaked it on every
        // chunk and never cleared stale handlers).
        nextPlayer.muted = true;
        nextPlayer.src = url;
        await nextPlayer.load();

        const settled = await new Promise(function(resolve) {
            var done = false;
            var timer = setTimeout(function() { if (!done) { done = true; resolve('timeout'); } }, 3000);
            nextPlayer.oncanplay = function() { if (!done) { done = true; clearTimeout(timer); resolve('canplay'); } };
            // Resolve errors as data (not bare events) so upstream handlers
            // log a meaningful message instead of 'undefined'.
            nextPlayer.onerror = function() { if (!done) { done = true; clearTimeout(timer); resolve('error'); } };
        });
        if (settled === 'error') {
            throw new Error('Chunk playback failed');
        }

        // Swap first, then silence + park the old element: no overlap
        // audio, no wasted buffering, and stale callbacks die here (the
        // historical double-buffer cleanup the current code was missing).
        nextPlayer.style.opacity = '1';
        nextPlayer.style.zIndex = '2';
        currentPlayer.style.opacity = '0';
        currentPlayer.style.zIndex = '1';
        try { currentPlayer.pause(); } catch (e) {}
        currentPlayer.muted = true;
        currentPlayer.oncanplay = null;
        currentPlayer.onerror = null;
        currentPlayer.onended = null;

        nextPlayer.play().then(function() {
            setTimeout(function() { try { nextPlayer.muted = false; } catch (e) {} }, 100);
        }).catch(function() {
            // Audible blocked but muted flows — keep video, note it.
            testLog('Muted playback continues (autoplay policy)', 'warn');
        });
        this.activePlayerIndex = nextPlayerIndex;

        this.onChunkChange && this.onChunkChange(index, -1);
    }

    stop() {
        this.isRunning = false;
        this.loopGen = (this.loopGen || 0) + 1;
        this.videoPlayers.forEach(function(v) {
            try { v.pause(); } catch (e) {}
            v.oncanplay = null;
            v.onerror = null;
            v.onended = null;
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

/**
 * SmartVodPlayer - مشغل VOD ذكي مع seeking ودمج وتحميل
 * 
 * المميزات:
 * - جلب metadata وحساب المدة الإجمالية
 * - Seeking ذكي (القفز للـ chunk المناسبة)
 * - تحميل مسبق في الخلفية
 * - عدم حذف chunks محملة
 * - دمج وتحميل الفيديو كملف واحد
 * - دعم تحويل WebM→MP4 عبر FFmpeg.wasm
 */
class SmartVodPlayer {
    constructor(options) {
        this.videoElement = options.videoElement;
        this.competitionId = options.competitionId;
        this.playlistData = options.playlistData || null; // بيانات محملة مسبقاً (اختياري)
        this.ffmpegUrl = options.ffmpegUrl || '${FFMPEG_URL}';
        this.onProgress = options.onProgress;
        this.onReady = options.onReady;
        this.onError = options.onError;
        this.onChunkLoaded = options.onChunkLoaded;
        
        // حالة المشغل
        this.playlist = null;
        this.chunks = [];           // metadata
        this.loadedChunks = {};     // ArrayBuffer مخزنة
        this.totalDuration = 0;
        this.chunkDurations = [];   // مدة كل chunk
        this.extension = 'webm';
        this.isLoading = false;
        this.currentChunkIndex = 0;

        // R4-CHUNK-PLAYER-UX-1: verified per-entry starts (D1 timeline)
        // override legacy math where present; bounded preload window
        // (no preload-all, no full retention) + tracked blob URL.
        this.verifiedStarts = {};
        this.PRELOAD_AHEAD = 2;
        this.RETAIN_DISTANCE = 3;
        this.currentBlobUrl = null;
        // Fetch-window guard (inactive until the first ensureWindow): a
        // load that resolves AFTER its index was evicted is dropped instead
        // of re-polluting the cache (async-evict race).
        this.windowLo = -1;
        this.windowHi = -1;
        
        // للـ seeking
        this.seekPending = null;
    }

    /**
     * بدء المشغل - جلب metadata وتشغيل أول chunk
     */
    async start() {
        try {
            // 1. استخدام البيانات المحملة مسبقاً أو جلب playlist جديد
            if (this.playlistData) {
                testLog('📥 Using pre-loaded playlist...', 'info');
                this.playlist = this.playlistData;
            } else {
                testLog('📥 Loading playlist...', 'info');
                // T1.3: CORS-safe proxy
                const playlistUrl = '/api/chunks/playlist/' + this.competitionId;
                const res = await fetch(playlistUrl);
                if (!res.ok) throw new Error('Failed to load playlist');
                this.playlist = await res.json();
            }
            
            this.chunks = this.playlist.chunks || [];
            this.extension = this.playlist.extension || 'webm';

            // R4-CHUNK-PLAY-1: an upstream failure is NOT a recording — fail
            // loudly instead of playing an empty list or an error page as
            // video. (No 'upstream' field = legacy proxy shape: proceed.)
            if (this.playlist.upstream === 'error') {
                throw new Error('Recording service unavailable (upstream error)');
            }
            if (this.playlist.upstream === 'invalid') {
                throw new Error('Playlist is not a recording (invalid upstream response)');
            }

            if (this.chunks.length === 0) {
                throw new Error('No chunks available');
            }
            
            testLog('📊 Found ' + this.chunks.length + ' chunks (' + this.extension + ')', 'success');
            
            // 2. حساب المدة الإجمالية
            this.calculateDurations();
            // 2b. verified time map (D1 authority wins per entry)
            this.buildTimeMap();
            
            // 3. تحميل أول chunk قابلة للتشغيل (الأولى المؤكدة عند توفر
            // الفهرس، وإلا الأولى — توافق القديم محفوظ).
            const firstPlayable = this.nextPlayableIndex(0);
            if (firstPlayable === null) throw new Error('No playable chunks yet');
            await this.loadAndPlayChunk(firstPlayable);
            
            // 4. تحميل مسبق محدود حول الموضع الحالي (نافذة، لا الكل)
            this.ensureWindow(this.currentChunkIndex);
            
            // 5. إعداد الـ seekbar
            this.setupSeekbar();
            
            this.onReady && this.onReady({
                totalDuration: this.totalDuration,
                chunks: this.chunks.length,
                extension: this.extension
            });
            
        } catch (error) {
            testLog('❌ ' + error.message, 'error');
            this.onError && this.onError(error);
        }
    }

    /**
     * حساب مدة كل chunk والمدة الإجمالية
     */
    calculateDurations() {
        // استخدام total_duration من playlist إذا موجود
        if (this.playlist.total_duration && this.playlist.total_duration > 0) {
            this.totalDuration = this.playlist.total_duration;
            // توزيع المدة على الـ chunks بالتساوي
            const perChunk = this.totalDuration / this.chunks.length;
            this.chunkDurations = this.chunks.map(function() { return perChunk; });
        } else {
            // حساب من duration كل chunk
            const defaultDuration = this.playlist.chunk_duration || 10; // ثواني
            this.chunkDurations = this.chunks.map(function(chunk) {
                return chunk.duration || defaultDuration;
            });
            this.totalDuration = this.chunkDurations.reduce(function(sum, d) { return sum + d; }, 0);
        }
        
        testLog('⏱️ Total duration: ' + Math.round(this.totalDuration) + 's (' + this.chunks.length + ' chunks)', 'info');
    }

    /**
     * R4-CHUNK-PLAYER-UX-1: verified time map. Per-entry timeline_start_ms
     * (D1 authority) wins where present; entries without one keep legacy
     * math. hasReadyInfo/nextPlayableIndex gate unconfirmed skipping with
     * legacy fallback (play-all when nothing is confirmed).
     */
    buildTimeMap() {
        this.verifiedStarts = {};
        for (let i = 0; i < this.chunks.length; i++) {
            const t = this.chunks[i] && this.chunks[i].timeline_start_ms;
            if (typeof t === 'number' && isFinite(t) && t >= 0) this.verifiedStarts[i] = t;
        }
    }

    hasReadyInfo() {
        for (let i = 0; i < this.chunks.length; i++) {
            if (this.chunks[i] && this.chunks[i].ready === true) return true;
        }
        return false;
    }

    /**
     * Positional index of the next playable chunk at/after the given start
     * (positions, not chunk ids). Unconfirmed entries are skipped only when
     * confirmed content exists; otherwise the first entry plays (legacy).
     */
    nextPlayableIndex(from) {
        const skipUnready = this.hasReadyInfo();
        for (let i = from; i < this.chunks.length; i++) {
            const e = this.chunks[i];
            if (skipUnready && e && e.ready === false) continue;
            return i;
        }
        return null;
    }

    /**
     * تحميل وتشغيل chunk معينة
     */
    async loadAndPlayChunk(index) {
        if (index < 0 || index >= this.chunks.length) return;
        
        this.currentChunkIndex = index;
        const chunk = this.chunks[index];
        
        testLog('▶️ Playing chunk ' + (index + 1) + '/' + this.chunks.length, 'info');
        
        // تحميل إذا لم تكن محملة
        if (!this.loadedChunks[index]) {
            await this.loadChunk(index);
        }
        
        // إنشاء Blob URL وتشغيل (السابق يُسحَب لتفادي تسرب الذاكرة —
        // كل chunk كانت تترك object URL خلفها).
        if (this.currentBlobUrl) {
            try { URL.revokeObjectURL(this.currentBlobUrl); } catch (e) {}
            this.currentBlobUrl = null;
        }
        const blob = new Blob([this.loadedChunks[index]], { 
            type: this.extension === 'mp4' ? 'video/mp4' : 'video/webm' 
        });
        const blobUrl = URL.createObjectURL(blob);
        this.currentBlobUrl = blobUrl;
        
        // حفظ الوقت الحالي إذا كان هناك seek pending
        const seekTime = this.seekPending;
        this.seekPending = null;
        
        this.videoElement.src = blobUrl;
        await this.videoElement.load();
        
        // القفز للوقت المحدد داخل الـ chunk
        if (seekTime !== null) {
            const chunkStartTime = this.getChunkStartTime(index);
            const timeInChunk = seekTime - chunkStartTime;
            this.videoElement.currentTime = Math.max(0, timeInChunk);
        }
        
        // حل مشكلة autoplay policy - البدء muted ثم محاولة unmute
        this.videoElement.muted = true;
        try {
            await this.videoElement.play();
            // محاولة unmute بعد بدء التشغيل
            setTimeout(function() {
                this.videoElement.muted = false;
            }.bind(this), 100);
        } catch (e) {
            testLog('⚠️ Autoplay blocked, waiting for user interaction', 'warn');
            // إضافة listener لأول تفاعل
            const self = this;
            const playOnInteraction = function() {
                self.videoElement.play().then(function() {
                    self.videoElement.muted = false;
                });
                document.removeEventListener('click', playOnInteraction);
                document.removeEventListener('touchstart', playOnInteraction);
            };
            document.addEventListener('click', playOnInteraction, { once: true });
            document.addEventListener('touchstart', playOnInteraction, { once: true });
        }
        
        // عند انتهاء الـ chunk، انتقل للتالية القابلة للتشغيل (تخطي
        // غير المؤكدة عند توفر المؤكدة — نفس قاعدة البدء).
        this.videoElement.onended = function() {
            const nxt = this.nextPlayableIndex(this.currentChunkIndex + 1);
            if (nxt !== null) {
                this.ensureWindow(nxt);
                this.loadAndPlayChunk(nxt).catch(function(err) {
                    this.onError && this.onError(err);
                }.bind(this));
            } else {
                testLog('✅ Playback complete', 'success');
            }
        }.bind(this);
        
        this.onProgress && this.onProgress(index + 1, this.chunks.length);
    }

    /**
     * تحميل chunk وتخزينها
     */
    async loadChunk(index) {
        if (this.loadedChunks[index]) return; // محملة مسبقاً

        const chunk = this.chunks[index];

        try {
            const response = await fetch(chunk.url);
            if (!response.ok) throw new Error('Chunk fetch failed');

            // R4-CHUNK-PLAY-1: a 200-with-HTML soft-404 is not video — reject
            // it loudly instead of storing garbage that stalls playback.
            // ffmpeg serves video/* (mp4/webm); octet-stream is accepted as
            // a generic binary container. Anything textual is rejected.
            // (String matching on purpose: regex slashes do not survive the
            // server-side template emission intact.)
            var rawCt = response.headers.get('content-type') || '';
            var ct = (rawCt || '').toLowerCase();
            if (ct.indexOf('text/html') !== -1) {
                throw new Error('Chunk URL returned HTML, not video');
            }
            if (ct && ct.indexOf('video/') !== 0
                && ct.indexOf('application/octet-stream') !== 0
                && ct.indexOf('binary/octet-stream') !== 0) {
                throw new Error('Chunk URL returned non-video content: ' + rawCt);
            }

            const buffer = await response.arrayBuffer();
            if (!buffer || buffer.byteLength === 0) throw new Error('Chunk is empty');
            // Evicted while fetching (a later ensureWindow moved on):
            // drop instead of re-polluting the bounded cache.
            if (this.windowLo >= 0 && (index < this.windowLo || index > this.windowHi)) return;
            this.loadedChunks[index] = buffer;

            this.onChunkLoaded && this.onChunkLoaded(index, this.getLoadedCount());

        } catch (error) {
            testLog('❌ Failed to load chunk ' + index + ': ' + error.message, 'error');
            throw error;
        }
    }

    /**
     * R4-CHUNK-PLAYER-UX-1: bounded preload window around the playhead
     * (replaces preload-all — a full recording must never sit in RAM).
     * Fetches center-1..center+2, evicts everything outside ±3.
     */
    ensureWindow(centerIndex) {
        var self = this;
        var lo = Math.max(0, centerIndex - 1);
        var hi = Math.min(this.chunks.length - 1, centerIndex + this.PRELOAD_AHEAD);
        for (let i = lo; i <= hi; i++) {
            if (!this.loadedChunks[i]) {
                this.loadChunk(i).catch(function() {});
            }
        }
        var keepLo = Math.max(0, centerIndex - this.RETAIN_DISTANCE);
        var keepHi = Math.min(this.chunks.length - 1, centerIndex + this.RETAIN_DISTANCE + 1);
        this.windowLo = keepLo;
        this.windowHi = keepHi;
        for (const k in this.loadedChunks) {
            const n = parseInt(k, 10);
            if (n < keepLo || n > keepHi) delete this.loadedChunks[k];
        }
    }

    /**
     * إعداد الـ seekbar
     */
    setupSeekbar() {
        const self = this;
        
        // تحديث الـ seekbar أثناء التشغيل
        this.videoElement.ontimeupdate = function() {
            const chunkStart = self.getChunkStartTime(self.currentChunkIndex);
            const currentGlobalTime = chunkStart + self.videoElement.currentTime;
            
            // تحديث الـ seekbar إذا موجود
            const seekbar = document.getElementById('vodSeekbar');
            if (seekbar) {
                seekbar.value = (currentGlobalTime / self.totalDuration) * 100;
            }
            
            // تحديث عرض الوقت
            const timeDisplay = document.getElementById('vodTimeDisplay');
            if (timeDisplay) {
                timeDisplay.textContent = self.formatTime(currentGlobalTime) + ' / ' + self.formatTime(self.totalDuration);
            }
        };
    }

    /**
     * Seek ذكي - القفز لوقت معين (نافذة التحميل تتبع الهدف، والقفز يتخطى
     * غير المؤكدة عند توفر المؤكدة).
     */
    seekTo(globalTime) {
        if (globalTime < 0) globalTime = 0;
        if (globalTime > this.totalDuration) globalTime = this.totalDuration;
        
        // حساب الـ chunk المناسبة
        let targetChunk = this.getChunkForTime(globalTime);
        const playable = this.nextPlayableIndex(targetChunk);
        if (playable !== null) targetChunk = playable;
        
        testLog('🎯 Seeking to ' + this.formatTime(globalTime) + ' (chunk ' + (targetChunk + 1) + ')', 'info');
        
        if (targetChunk === this.currentChunkIndex) {
            // نفس الـ chunk - seek مباشر
            const chunkStart = this.getChunkStartTime(targetChunk);
            this.videoElement.currentTime = globalTime - chunkStart;
        } else {
            // chunk مختلفة - تحميل وتشغيل
            this.seekPending = globalTime;
            this.ensureWindow(targetChunk);
            this.loadAndPlayChunk(targetChunk).catch(function(err) {
                this.onError && this.onError(err);
            }.bind(this));
        }
    }

    /**
     * الحصول على chunk المناسبة لوقت معين — حدود موثقة (verified) أولًا،
     * ثم الحساب القديم. كل chunk تغطي [بدايتها، بداية التالية).
     */
    getChunkForTime(globalTime) {
        const n = this.chunks.length;
        if (n === 0) return 0;
        for (let i = 0; i < n; i++) {
            const start = this.getChunkStartTime(i);
            const nextStart = (i + 1 < n) ? this.getChunkStartTime(i + 1) : null;
            const end = (nextStart !== null && nextStart > start)
                ? nextStart
                : start + (this.chunkDurations[i] || 0);
            if (globalTime < end) {
                return i;
            }
        }
        return n - 1;
    }

    /**
     * الحصول على وقت بداية chunk معينة — timeline_start_ms الموثق (D1)
     * يغلب الحساب القديم حيث يوجد.
     */
    getChunkStartTime(chunkIndex) {
        if (this.verifiedStarts && this.verifiedStarts[chunkIndex] !== undefined) {
            return this.verifiedStarts[chunkIndex];
        }
        let start = 0;
        for (let i = 0; i < chunkIndex; i++) {
            start += this.chunkDurations[i] || 0;
        }
        return start;
    }

    /**
     * عدد الـ chunks المحملة
     */
    getLoadedCount() {
        return Object.keys(this.loadedChunks).length;
    }

    /**
     * هل كل الـ chunks محملة؟
     */
    isFullyLoaded() {
        return this.getLoadedCount() === this.chunks.length;
    }

    /**
     * تنسيق الوقت
     */
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return mins + ':' + (secs < 10 ? '0' : '') + secs;
    }

    /**
     * دمج كل الـ chunks في Blob واحد
     */
    async mergeChunks() {
        if (!this.isFullyLoaded()) {
            testLog('⏳ Waiting for all chunks to load...', 'warn');
            // انتظار اكتمال التحميل
            while (!this.isFullyLoaded()) {
                await new Promise(function(r) { setTimeout(r, 500); });
            }
        }
        
        testLog('🔗 Merging ' + this.chunks.length + ' chunks...', 'info');
        
        const buffers = [];
        for (let i = 0; i < this.chunks.length; i++) {
            buffers.push(this.loadedChunks[i]);
        }
        
        const mergedBlob = new Blob(buffers, { 
            type: this.extension === 'mp4' ? 'video/mp4' : 'video/webm' 
        });
        
        testLog('✅ Merged! Size: ' + Math.round(mergedBlob.size / 1024 / 1024) + ' MB', 'success');
        
        return mergedBlob;
    }

    /**
     * تحميل الفيديو كملف
     */
    async downloadVideo(filename) {
        const blob = await this.mergeChunks();
        
        const defaultFilename = 'competition_' + this.competitionId + '.' + this.extension;
        const finalFilename = filename || defaultFilename;
        
        // إنشاء رابط تحميل
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = finalFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        testLog('📥 Download started: ' + finalFilename, 'success');
    }

    /**
     * تحويل WebM إلى MP4 باستخدام FFmpeg.wasm
     */
    async convertToMp4(onProgress) {
        if (this.extension === 'mp4') {
            testLog('ℹ️ Already MP4, no conversion needed', 'info');
            return await this.mergeChunks();
        }
        
        testLog('🔄 Converting WebM to MP4...', 'info');
        testLog('⚠️ This may take a while and use significant memory', 'warn');
        
        try {
            onProgress && onProgress('loading', 0);
            
            // تحميل FFmpeg.wasm 0.12 من CDN
            const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
            
            // تحميل الـ script إذا لم يكن محملاً
            if (!window.FFmpegWASM) {
                testLog('📦 Loading FFmpeg.wasm core...', 'info');
                
                // تحميل FFmpeg module
                const { FFmpeg } = await import('https://unpkg.com/@ffmpeg/ffmpeg@0.12.6/+esm');
                window.FFmpegWASM = { FFmpeg };
            }
            
            const { FFmpeg } = window.FFmpegWASM;
            const ffmpeg = new FFmpeg();
            
            // تحميل core files
            testLog('📦 Loading FFmpeg core files...', 'info');
            await ffmpeg.load({
                coreURL: baseURL + '/ffmpeg-core.js',
                wasmURL: baseURL + '/ffmpeg-core.wasm',
            });
            
            testLog('✅ FFmpeg loaded!', 'success');
            
            // كتابة ملف الإدخال
            onProgress && onProgress('converting', 30);
            const webmBlob = await this.mergeChunks();
            const webmData = new Uint8Array(await webmBlob.arrayBuffer());
            await ffmpeg.writeFile('input.webm', webmData);
            
            testLog('🔄 Converting... (this may take a while)', 'info');
            onProgress && onProgress('converting', 50);
            
            // تحويل - استخدام copy للسرعة إذا ممكن، وإلا libx264
            await ffmpeg.exec([
                '-i', 'input.webm',
                '-c:v', 'libx264',
                '-preset', 'fast',
                '-crf', '23',
                '-c:a', 'aac',
                '-b:a', '128k',
                'output.mp4'
            ]);
            
            // قراءة الناتج
            onProgress && onProgress('finishing', 90);
            const mp4Data = await ffmpeg.readFile('output.mp4');
            const mp4Blob = new Blob([mp4Data], { type: 'video/mp4' });
            
            // تنظيف الذاكرة
            ffmpeg.terminate();
            
            onProgress && onProgress('done', 100);
            
            testLog('✅ Conversion complete! Size: ' + Math.round(mp4Blob.size / 1024 / 1024) + ' MB', 'success');
            
            return mp4Blob;
            
        } catch (error) {
            testLog('❌ Conversion failed: ' + error.message, 'error');
            testLog('💡 Tip: Try downloading the WebM file instead', 'info');
            throw error;
        }
    }

    /**
     * تحميل كـ MP4 (مع تحويل إذا لزم)
     */
    async downloadAsMp4(filename, onProgress) {
        let blob;
        
        if (this.extension === 'mp4') {
            blob = await this.mergeChunks();
        } else {
            blob = await this.convertToMp4(onProgress);
        }
        
        const defaultFilename = 'competition_' + this.competitionId + '.mp4';
        const finalFilename = filename || defaultFilename;
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = finalFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        testLog('📥 Download started: ' + finalFilename, 'success');
    }

    /**
     * إيقاف المشغل
     */
    stop() {
        this.videoElement.pause();
        this.videoElement.src = '';
        this.videoElement.onended = null;
        this.videoElement.ontimeupdate = null;
        // R4-CHUNK-PLAYER-UX-1: revoke the blob URL (no leak across
        // switches — every chunk used to leave one behind).
        if (this.currentBlobUrl) {
            try { URL.revokeObjectURL(this.currentBlobUrl); } catch (e) {}
            this.currentBlobUrl = null;
        }
    }

    /**
     * تنظيف الذاكرة
     */
    destroy() {
        this.stop();
        this.loadedChunks = {};
        this.chunks = [];
    }
}

window.SmartVodPlayer = SmartVodPlayer;

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
        
        debugLog('[DEBUG] shareScreen - localStream assigned:', localStream);
        debugLog('[DEBUG] shareScreen - window.mediaState.localStream:', window.mediaState.localStream);
        
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
    debugLog('[DEBUG] updateConnectionButtons called with:', connected);
    isConnected = connected;
    
    // Host uses connectBtn, Guest uses joinBtn
    const connectBtn = document.getElementById('connectBtn');
    const joinBtn = document.getElementById('joinBtn');
    const reconnectBtn = document.getElementById('reconnectBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    
    debugLog('[DEBUG] Buttons found:', {
        connectBtn: !!connectBtn,
        joinBtn: !!joinBtn,
        reconnectBtn: !!reconnectBtn,
        disconnectBtn: !!disconnectBtn
    });
    
    if (connectBtn) {
        connectBtn.classList.toggle('hidden', connected);
        debugLog('[DEBUG] connectBtn hidden:', connected);
    }
    if (joinBtn) {
        joinBtn.classList.toggle('hidden', connected);
        debugLog('[DEBUG] joinBtn hidden:', connected);
    }
    if (reconnectBtn) {
        reconnectBtn.classList.toggle('hidden', !connected);
        debugLog('[DEBUG] reconnectBtn hidden:', !connected);
    }
    if (disconnectBtn) {
        disconnectBtn.classList.toggle('hidden', !connected);
        debugLog('[DEBUG] disconnectBtn hidden:', !connected);
    }
}
window.updateConnectionButtons = updateConnectionButtons;

console.log('[Client Shared] Loaded successfully');
    `;
}

