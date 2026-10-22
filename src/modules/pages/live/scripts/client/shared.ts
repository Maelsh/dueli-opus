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
    // R4-CHUNK-VIEW-RECOVERY-1 (28.4): audience status shown when a recording
    // finalized with no playable chunk (the LIVE initial wait ENDED — not a
    // spinner, not a false error). Baked per language like the TURN messages.
    const RECORDING_ENDED = tr.live_signaling.recording_ended;
    // R4-CHUNK-VIEW-RECOVERY-1 REM1 (28.4.1 / O19-07, O19-21): audience
    // player states are translated here — the page never paints a raw
    // technical token such as 'media:waiting' or a chunk counter.
    const PLAYER_STATE_LABELS: Record<string, string> = {
        waiting: tr.player_state_waiting,
        playing: tr.player_state_playing,
        processing: tr.player_state_processing,
        error: tr.player_state_error,
        ready: tr.player_state_ready,
        unavailable: tr.player_state_unavailable,
    };

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

// ===== Audience recording-end message (R4-CHUNK-VIEW-RECOVERY-1, 28.4) =====
// Shown by the live player when a recording finalized with no playable chunk:
// a clear ended state (AR/EN baked per language), never an eternal spinner.
const RECORDING_ENDED_MSG = '${RECORDING_ENDED}';

// R4-CHUNK-VIEW-RECOVERY-1 REM1 (28.4.1): localized player-state labels baked
// per UI language (same pattern as TURN/RECORDING_ENDED). Consumers call
// window.playerStateLabel(state); the machine state stays in __mediaState.
const PLAYER_STATE_LABELS = ${JSON.stringify(PLAYER_STATE_LABELS)};
function playerStateLabel(state) {
    return PLAYER_STATE_LABELS[state] || PLAYER_STATE_LABELS.waiting || '';
}
window.playerStateLabel = playerStateLabel;

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
        // R4-CHUNK-VIEW-RECOVERY-1 (row 28.4): the recording's final marker rides
        // on the playlist response as index_metadata.finalized. It is the ONLY
        // positive end-of-recording signal: a live IN-VIDUAL wait consults it to
        // END (never to time out) when a recording finalizes with nothing
        // playable. Absence of chunks ALONE is never proof of end (a live
        // broadcast legitimately has no chunk yet).
        this.finalized = false;
        // R4-CHUNK-VIEW-RECOVERY-1 REM1 (28.4.1 / O19-12, O19-13): the same
        // playlist response carries the recording index timeline metadata
        // (ms). Parsed once here so LIVE and VOD share ONE global time
        // reference: verified per-entry starts, total_ready_ms total, real
        // per-entry durations. No equal-split / no current-chunk duration
        // masquerading as the recording length.
        this.indexMetadata = null;
        this.defaultChunkDuration = 10;
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
            // R4-CHUNK-VIEW-RECOVERY-1 (28.4): final marker from the D1 index
            // authority. Additive + optional (legacy proxies carry none) —
            // anything other than an explicit true is treated as "not ended".
            const meta = data.index_metadata;
            this.finalized = !!(meta && meta.finalized === true);
            this.indexMetadata = (meta && typeof meta === 'object') ? meta : null;
            if (typeof data.chunk_duration === 'number' && isFinite(data.chunk_duration) && data.chunk_duration > 0) {
                this.defaultChunkDuration = data.chunk_duration;
            }
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

    /**
     * Edge index for playback/progress. With readiness info this is exactly
     * the newest confirmed-ready chunk; a legacy list (NO readiness flags)
     * still has a real edge at its newest listed chunk. Kept separate from
     * latestReadyIndex() because skipToLatest() must preserve its historical
     * penultimate fallback for legacy lists (last file may be partial).
     */
    liveEdgeIndex() {
        const top = this.latestReadyIndex();
        if (top >= 0) return top;
        return this.hasReadyInfo() ? -1 : this.maxIndex();
    }

    maxIndex() {
        let top = -1;
        for (const entry of this.entries) {
            if (entry && typeof entry.index === 'number' && entry.index > top) top = entry.index;
        }
        return top;
    }

    /**
     * R4-CHUNK-VIEW-RECOVERY-1 REM1 (28.4.1): real per-entry duration — the
     * verified duration when the index supplied one, otherwise the entry's
     * own duration, never total/count equal splitting.
     */
    getChunkDuration(index) {
        const entry = this.entryFor(index);
        if (entry && typeof entry.duration === 'number' && isFinite(entry.duration) && entry.duration > 0) {
            return entry.duration;
        }
        return this.defaultChunkDuration;
    }

    /**
     * Verified global start (seconds) for an entry. D1 timeline_start_ms wins
     * (ms -> s exactly once here). Legacy lists without it accumulate REAL
     * durations of the entries before this one, maintaining gaps as gaps.
     */
    getChunkStartTime(index) {
        const entry = this.entryFor(index);
        if (entry && typeof entry.timeline_start_ms === 'number'
            && isFinite(entry.timeline_start_ms) && entry.timeline_start_ms >= 0) {
            return entry.timeline_start_ms / 1000;
        }
        const sorted = this.entries
            .filter(function(e) { return e && typeof e.index === 'number'; })
            .sort(function(a, b) { return a.index - b.index; });
        let start = 0;
        for (const e of sorted) {
            if (e.index >= index) break;
            start += (typeof e.duration === 'number' && isFinite(e.duration) && e.duration > 0)
                ? e.duration
                : this.defaultChunkDuration;
        }
        return start;
    }

    /** Entry index whose verified interval contains globalTime. */
    getChunkForTime(globalTime) {
        const sorted = this.entries
            .filter(function(e) { return e && typeof e.index === 'number'; })
            .sort(function(a, b) { return a.index - b.index; });
        if (sorted.length === 0) return 0;
        let chosen = sorted[0].index;
        for (const e of sorted) {
            if (globalTime >= this.getChunkStartTime(e.index)) chosen = e.index;
            else break;
        }
        return chosen;
    }

    /**
     * Recording total (seconds). The D1 index total_ready_ms is the authority;
     * a legacy list falls back to the sum of REAL durations / verified end.
     * Never videoEl.duration and never an equal split of total/count.
     */
    getTotalDuration() {
        const meta = this.indexMetadata;
        if (meta && typeof meta.total_ready_ms === 'number'
            && isFinite(meta.total_ready_ms) && meta.total_ready_ms > 0) {
            return meta.total_ready_ms / 1000;
        }
        const sorted = this.entries
            .filter(function(e) { return e && typeof e.index === 'number'; })
            .sort(function(a, b) { return a.index - b.index; });
        let sum = 0;
        for (const e of sorted) sum += this.getChunkDuration(e.index);
        if (sorted.length === 0) return 0;
        const last = sorted[sorted.length - 1];
        const end = this.getChunkStartTime(last.index) + this.getChunkDuration(last.index);
        return Math.max(sum, end);
    }

    /** End of the newest playable chunk (the live edge on the timeline). */
    getLiveEdgeTime() {
        const top = this.liveEdgeIndex();
        if (top < 0) return 0;
        return this.getChunkStartTime(top) + this.getChunkDuration(top);
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

            // R4-CHUNK-VIEW-RECOVERY-1 (28.4): the recording has FINALIZED and
            // there is STILL nothing reachable to request (no entry at the
            // target index, no later chunk to gap-skip to). This is the ONLY
            // place a live wait may END on its own: a final, positive marker
            // (index_metadata.finalized) means no chunk will ever arrive, so
            // stop and let the consumer surface a clear ended state INSTEAD of
            // an eternal spinner. A not-yet-finalized broadcast keeps waiting
            // to the right — absence of chunks alone is never end, and a
            // healthy-but-slow first chunk is never mistaken for an end.
            if (this.finalized) {
                throw new Error('RECORDING_ENDED');
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
 * A28-TIME: the media resource's OWN first presentation time (seconds).
 *
 * A standalone fragmented MP4 can present an ABSOLUTE timeline (real sample:
 * first frame at 517.743s) while the verified recording index has its own
 * global start (517.539s). Adding the absolute currentTime to the index start
 * double-counts and the player clock runs past the recording length.
 *
 * The origin is therefore DERIVED from the resource, in this order:
 *   1. the seekable range start (direct proof, covers a racy currentTime=0);
 *   2. duration minus the verified chunk duration (only when the duration
 *      clearly exceeds the chunk: a zero-origin file keeps the legacy math);
 *   3. a parked element's absolute currentTime at metadata;
 *   4. otherwise 0 (zero-origin resources are unchanged).
 * Every conversion (position/seek) subtracts or adds this origin exactly once.
 */
function dueliMediaOrigin(video, expectedDuration) {
    if (!video) return 0;
    var stored = video.__dueliMediaOrigin;
    // A POSITIVE origin is stable evidence. Zero is not: 0 is also the value
    // observed when the duration is not yet known, so a cached zero must be
    // re-evaluated on the next call (production 2244: loadedmetadata read 0,
    // then the finite absolute duration arrived on durationchange).
    if (typeof stored === 'number' && isFinite(stored) && stored > 0) {
        video.__dueliMediaOriginKnown = true;
        return stored;
    }

    var origin = 0;
    var known = false;
    var seekStart = null;
    try {
        var sk = video.seekable;
        if (sk && typeof sk.length === 'number' && sk.length > 0
            && typeof sk.start === 'function') {
            var s = sk.start(0);
            if (typeof s === 'number' && isFinite(s) && s >= 0) seekStart = s;
        }
    } catch (e) { seekStart = null; }
    // A ZERO seekable start is not proof of a zero origin (production 2244
    // reported exactly 0 on an absolute timeline); only a positive start is.
    if (seekStart !== null && seekStart > 0) {
        origin = seekStart;
        known = true;
    }

    var dur = video.duration;
    var expected = (typeof expectedDuration === 'number' && isFinite(expectedDuration) && expectedDuration > 0)
        ? expectedDuration : 0;
    var tolerance = expected > 0 ? Math.max(1, expected * 0.05) : 0;
    if (typeof dur === 'number' && isFinite(dur) && dur > 0 && expected > 0) {
        var diff = dur - expected;
        if (diff > tolerance) {
            // Duration clearly exceeds the chunk: the resource's timeline is
            // absolute and its origin is the end minus the verified span.
            origin = Math.max(origin, diff);
            known = true;
        } else if (Math.abs(diff) <= tolerance && !known) {
            // Duration matches the chunk span: this resource really starts at
            // 0. This is evidence too, but it is never returned from the
            // positive cache above, so a later positive signal can supersede
            // it instead of freezing a wrong zero forever.
            origin = 0;
            known = true;
        }
    }

    // Only a parked element at metadata: a playing element's currentTime is a
    // POSITION, not an origin — freezing it would silently zero the clock.
    if (!known) {
        var t = video.currentTime;
        var parked = video.paused === true || (typeof video.readyState === 'number' && video.readyState < 2);
        if (typeof t === 'number' && isFinite(t) && t > 0 && parked) {
            origin = Math.max(origin, t);
            known = true;
        }
    }

    if (known) {
        video.__dueliMediaOrigin = origin;
        video.__dueliMediaOriginKnown = true;
        return origin;
    }

    // Unknown: never cache 0 as if it were evidence. The next durationchange/
    // timeupdate/seek re-derives once the duration is usable.
    video.__dueliMediaOrigin = undefined;
    video.__dueliMediaOriginKnown = false;
    return 0;
}

/** True only when the origin above was derived from real resource evidence. */
function dueliMediaOriginKnown(video, expectedDuration) {
    if (!video) return false;
    dueliMediaOrigin(video, expectedDuration);
    return video.__dueliMediaOriginKnown === true;
}

/**
 * A28-TIME: apply a CHUNK-LOCAL seek on a resource whose media origin may not
 * be known yet. Writing the bare offset would clamp to the first presentation
 * time (production 2244 landed every seek on the chunk start), so an unknown
 * origin defers the write until durationchange/loadeddata/canplay provides
 * evidence. It never masks wrong math with a clamp; a superseded seek is
 * retired by the caller's generation predicate.
 */
function dueliApplyOriginSeek(video, localOffset, expectedDuration, isStillCurrent) {
    if (!video || typeof localOffset !== 'number' || !isFinite(localOffset)) return;
    if (typeof video.__dueliOriginSeekCleanup === 'function') {
        try { video.__dueliOriginSeekCleanup(); } catch (e) {}
    }
    var offset = Math.max(0, localOffset);

    // Immediate path when the origin is already evidence-backed.
    if (dueliMediaOriginKnown(video, expectedDuration)) {
        var knownOrigin = dueliMediaOrigin(video, expectedDuration);
        try { video.currentTime = knownOrigin + offset; } catch (e) {}
        return;
    }
    // Engines/shims without a media timeline (no readyState) have no
    // absolute-origin semantics to protect; keep the historical bare-offset
    // path instead of waiting for a durationchange that will never come.
    if (typeof video.readyState !== 'number') {
        try { video.currentTime = offset; } catch (e) {}
        return;
    }

    var timer = null;
    var done = false;
    var check = function() {
        if (done) return;
        if (typeof isStillCurrent === 'function' && !isStillCurrent()) { cleanup(); return; }
        if (!dueliMediaOriginKnown(video, expectedDuration)) return;
        var origin = dueliMediaOrigin(video, expectedDuration);
        try { video.currentTime = origin + offset; } catch (e) {}
        cleanup();
    };
    var cleanup = function() {
        if (done) return;
        done = true;
        try {
            video.removeEventListener('durationchange', check);
            video.removeEventListener('loadeddata', check);
            video.removeEventListener('canplay', check);
        } catch (e) {}
        if (timer !== null) { clearTimeout(timer); timer = null; }
        if (video.__dueliOriginSeekCleanup === cleanup) video.__dueliOriginSeekCleanup = null;
    };
    video.__dueliOriginSeekCleanup = cleanup;
    check();
    if (done) return;
    try {
        video.addEventListener('durationchange', check);
        video.addEventListener('loadeddata', check);
        video.addEventListener('canplay', check);
    } catch (e) {}
    if (done) return;
    timer = setTimeout(function() {
        if (done) return;
        if (typeof isStillCurrent === 'function' && !isStillCurrent()) {
            cleanup();
            return;
        }
        if (dueliMediaOriginKnown(video, expectedDuration)) {
            check();
        } else {
            // Bounded legacy fallback: a real element that never exposes a
            // usable duration keeps the historical bare-offset seek instead
            // of silently losing the request.
            try { video.currentTime = offset; } catch (e) {}
        }
        cleanup();
    }, 3000);
}

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
        // R4-CHUNK-VIEW-RECOVERY-1 REM1 (28.4.1 / O19-12, O19-14): one global
        // timeline shared by progress, seeking and rewind. The callback fires
        // from the ACTIVE element only, so handoff leftovers never move the
        // audience bar backwards.
        this.onTimeUpdate = options.onTimeUpdate;

        this.activePlayerIndex = 0;
        this.isRunning = false;
        this.currentIndex = -1;
        this.loopGen = 0;
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

        var self = this;
        (this.videoPlayers || []).forEach(function(v) {
            v.ontimeupdate = function() {
                if (self.videoPlayers[self.activePlayerIndex] !== v) return;
                self.emitTimeUpdate();
            };
        });
    }

    /**
     * Global playback position = verified chunk start + offset inside the
     * current chunk (seconds). Never a chunk-local currentTime sold as the
     * recording position.
     */
    getGlobalTime() {
        if (typeof this.currentIndex !== 'number' || this.currentIndex < 0) return 0;
        var active = this.videoPlayers && this.videoPlayers[this.activePlayerIndex];
        var origin = this.captureMediaOrigin(active, this.expectedChunkDuration(this.currentIndex));
        var offset = (active && typeof active.currentTime === 'number' && isFinite(active.currentTime))
            ? active.currentTime - origin : 0;
        if (!isFinite(offset) || offset < 0) offset = 0;
        return Math.max(0, this.chunkStart(this.currentIndex) + offset);
    }

    /** A28-TIME: the verified duration of the loaded chunk (origin derivation). */
    expectedChunkDuration(index) {
        var cm = this.chunkManager;
        if (!cm || typeof cm.entryFor !== 'function') return 0;
        var entry = cm.entryFor(index);
        var d = entry && entry.duration;
        return (typeof d === 'number' && isFinite(d) && d > 0) ? d : 0;
    }

    chunkStart(index) {
        var cm = this.chunkManager;
        if (cm && typeof cm.getChunkStartTime === 'function') {
            var start = cm.getChunkStartTime(index);
            return (typeof start === 'number' && isFinite(start)) ? start : 0;
        }
        return 0;
    }

    /**
     * R4-CHUNK-VIEW-RECOVERY-1 REM1 (28.4.1 / FV20-TIME): the media resource's
     * own first presentation time. A standalone fragmented MP4 may expose an
     * ABSOLUTE currentTime (real sample: 517.743s) while the recording index
     * uses its own global start (517.539s). Other engines/MSE expose 0. The
     * origin is captured from loadedmetadata, never assumed to be either.
     */
    mediaOriginFor(video) {
        if (!video) return 0;
        var origin = video.__dueliMediaOrigin;
        return (typeof origin === 'number' && isFinite(origin) && origin >= 0) ? origin : 0;
    }

    captureMediaOrigin(video, expectedDuration) {
        if (!video) return 0;
        // Re-evaluate a cached zero: it may be the "not known yet" value from
        // an earlier loadedmetadata, not proof of a zero-origin resource.
        return dueliMediaOrigin(video, expectedDuration);
    }

    /** Available recording duration for the live timeline (seconds). */
    getAvailableDuration() {
        var cm = this.chunkManager;
        if (cm && typeof cm.getTotalDuration === 'function') {
            var total = cm.getTotalDuration();
            return (typeof total === 'number' && isFinite(total) && total > 0) ? total : 0;
        }
        return this.getLiveEdgeTime();
    }

    getLiveEdgeTime() {
        var cm = this.chunkManager;
        if (cm && typeof cm.getLiveEdgeTime === 'function') {
            var end = cm.getLiveEdgeTime();
            return (typeof end === 'number' && isFinite(end) && end > 0) ? end : 0;
        }
        return 0;
    }

    latestReadyIndex() {
        var cm = this.chunkManager;
        if (cm && typeof cm.liveEdgeIndex === 'function') return cm.liveEdgeIndex();
        if (cm && typeof cm.latestReadyIndex === 'function') return cm.latestReadyIndex();
        if (cm && typeof cm.maxIndex === 'function') return cm.maxIndex();
        return -1;
    }

    isBehindLive() {
        var edge = this.latestReadyIndex();
        return edge >= 0 && typeof this.currentIndex === 'number' && this.currentIndex >= 0
            && this.currentIndex < edge;
    }

    emitTimeUpdate() {
        if (typeof this.onTimeUpdate !== 'function') return;
        this.onTimeUpdate(this.getGlobalTime(), this.getAvailableDuration(), this.currentIndex);
    }

    /**
     * Seek anywhere inside the AVAILABLE live recording. Recenters forward
     * flow at the target chunk and resumes from the offset inside it.
     */
    async seekTo(globalTime) {
        if (typeof globalTime !== 'number' || !isFinite(globalTime)) return;
        var total = this.getAvailableDuration();
        if (globalTime < 0) globalTime = 0;
        if (total > 0 && globalTime > total) globalTime = total;
        var cm = this.chunkManager;
        var target = (cm && typeof cm.getChunkForTime === 'function') ? cm.getChunkForTime(globalTime) : 0;
        if (target === null || target === undefined) return;
        // Never land on an unconfirmed slot while confirmed content exists.
        var entry = (cm && typeof cm.entryFor === 'function') ? cm.entryFor(target) : null;
        if (entry && entry.ready === false) {
            var edge = this.latestReadyIndex();
            var foundReady = false;
            for (var i = target + 1; i <= edge; i++) {
                var nextEntry = (cm && typeof cm.entryFor === 'function') ? cm.entryFor(i) : null;
                if (nextEntry && nextEntry.ready !== false) {
                    target = i;
                    globalTime = this.chunkStart(i);
                    foundReady = true;
                    break;
                }
            }
            // An unconfirmed TAIL beyond the newest ready chunk cannot be
            // played: clamp the seek to the confirmed live edge. Never attempt
            // to decode readiness the index has not confirmed.
            if (!foundReady) {
                if (edge < 0) return;
                target = edge;
                globalTime = this.chunkStart(edge);
            }
        }
        var offset = globalTime - this.chunkStart(target);
        if (!isFinite(offset) || offset < 0) offset = 0;
        await this._startAt(target, offset);
    }

    /** Return to the newest confirmed-ready chunk (live edge). */
    async jumpToLive() {
        var edge = this.latestReadyIndex();
        if (edge < 0) return;
        await this._startAt(edge, 0);
    }

    async _startAt(index, offsetSeconds) {
        if (!this.videoPlayers || this.videoPlayers.length === 0) return;
        if (typeof index !== 'number' || !isFinite(index) || index < 0) return;
        index = Math.floor(index);
        this.loopGen = (this.loopGen || 0) + 1;
        var gen = this.loopGen;
        this.isRunning = false;
        try {
            await this.playChunk(index, offsetSeconds, gen);
        } catch (e) {
            if (gen === this.loopGen) this.onError && this.onError(e);
            return;
        }
        // A newer seek/rewind retired this request while it was loading.
        if (gen !== this.loopGen) return;
        if (this.chunkManager) this.chunkManager.currentIndex = index;
        this.isRunning = true;
        this.runLoop(gen);
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
                await this.playChunk(edge, 0, this.loopGen);
                this.runLoop(this.loopGen);
                return;
            }
        }

        let firstChunk;
        try {
            firstChunk = await this.chunkManager.waitForNextChunk();
        } catch (error) {
            // R4-CHUNK-VIEW-RECOVERY-1 (28.4): the FIRST wait can now END when the
            // recording finalized with nothing playable (RECORDING_ENDED). Stop
            // cleanly with a clear AR/EN state and hand back to the consumer to
            // re-evaluate (→ VOD / not-available). Never an eternal spinner; a
            // healthy, not-yet-finalized broadcast never reaches this branch.
            this.isRunning = false;
            const recordingEnded = !!(error && error.message === 'RECORDING_ENDED');
            this.onStatus && this.onStatus(recordingEnded ? RECORDING_ENDED_MSG : 'Stream ended');
            this.onStreamEnd && this.onStreamEnd();
            return;
        }
        this.onStatus && this.onStatus('Found chunk: ' + (firstChunk + 1));

        await this.playChunk(firstChunk, 0, this.loopGen);
        this.runLoop(this.loopGen);
    }

    /**
     * R4-CHUNK-PLAYER-UX-1 (scope 3): reliable rewind — jump back to an
     * earlier chunk, then resume the forward flow from there. Retires the
     * running loop first (generation token) so the old position cannot
     * fight the new one; the next wait continues after the target.
     */
    async rewindTo(index) {
        // Preserved API (row 29 consumers): rewind to the START of a chunk.
        // Arbitrary in-recording positions use seekTo(globalTime) instead.
        await this._startAt(index, 0);
    }

    async runLoop(gen) {
        var myGen = gen === undefined ? this.loopGen : gen;
        while (this.isRunning && myGen === this.loopGen) {
            var target = null;
            try {
                target = await this.chunkManager.waitForNextChunk(this.MAX_MISSES);
                await this.playChunk(target, 0, myGen);
                this.consecutiveErrors = 0;
                this.lastFailedIndex = null;
                this.lastFailedCount = 0;
            } catch (error) {
                if (error.message === 'STREAM_ENDED' || error.message === 'RECORDING_ENDED') {
                    this.isRunning = false;
                    // R4-CHUNK-VIEW-RECOVERY-1 (28.4): a finalized recording with
                    // nothing further to play is a CLEAN end (not a playback
                    // error), so it must not count toward the consecutive-error
                    // fatal bound — it transitions the consumer instead.
                    this.onStatus && this.onStatus(error.message === 'RECORDING_ENDED' ? RECORDING_ENDED_MSG : 'Stream ended');
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

    async playChunk(index, offsetSeconds, gen) {
        // A newer seek/rewind may have retired this request before it even
        // started loading (rapid double-click / stale loop).
        if (gen !== undefined && gen !== this.loopGen) return;
        var self = this;
        const url = this.chunkManager.getUrl(index);
        const nextPlayerIndex = (this.activePlayerIndex + 1) % 2;
        const nextPlayer = this.videoPlayers[nextPlayerIndex];
        const currentPlayer = this.videoPlayers[this.activePlayerIndex];

        // R4-CHUNK-VIEW-RECOVERY-1 REM1 (28.4.1 / FV20-TIME): capture the
        // resource's own media origin before any seek. The offset supplied by
        // seekTo() is CHUNK-LOCAL; the element may expect origin+offset (real
        // MP4 sample starts at 517.743s). The loadedmetadata handler also
        // repairs the seek if metadata arrives after load() returns.
        if (typeof nextPlayer.__dueliOriginSeekCleanup === 'function') {
            try { nextPlayer.__dueliOriginSeekCleanup(); } catch (e) {}
        }
        nextPlayer.__dueliMediaOrigin = undefined;
        nextPlayer.__dueliMediaOriginKnown = false;
        var pendingOffset = (typeof offsetSeconds === 'number' && isFinite(offsetSeconds))
            ? Math.max(0, offsetSeconds) : null;
        var applyTarget = function() {
            if (gen !== undefined && gen !== self.loopGen) return;
            var expected = self.expectedChunkDuration(index);
            self.captureMediaOrigin(nextPlayer, expected);
            if (pendingOffset !== null) {
                // Same A28-TIME contract as VOD: never write the bare offset
                // before the resource origin is evidence-backed.
                dueliApplyOriginSeek(nextPlayer, pendingOffset, expected, function() {
                    return gen === undefined || gen === self.loopGen;
                });
            }
        };
        nextPlayer.onloadedmetadata = function() {
            // At the event itself currentTime can still read 0; defer one
            // task so an absolute origin is visible before it is captured.
            setTimeout(function() {
                if (gen !== undefined && gen !== self.loopGen) return;
                if (typeof nextPlayer.readyState === 'number' && nextPlayer.readyState < 1) return;
                applyTarget();
            }, 0);
        };

        // R4-CHUNK-PLAYER-UX-1 handoff: arm the next element MUTED
        // (autoplay policy can block audible starts — a blocked audible
        // start looks exactly like a stall), with a bounded wait whose
        // timer is always cleaned up (the old code leaked it on every
        // chunk and never cleared stale handlers).
        nextPlayer.muted = true;
        nextPlayer.src = url;
        await nextPlayer.load();

        // Stale response guard: the load above may resolve after the user
        // sought elsewhere. Never swap/play the superseded chunk.
        if (gen !== undefined && gen !== this.loopGen) return;

        const settled = await new Promise(function(resolve) {
            var done = false;
            var timer = setTimeout(function() { if (!done) { done = true; resolve('timeout'); } }, 3000);
            nextPlayer.oncanplay = function() { if (!done) { done = true; clearTimeout(timer); resolve('canplay'); } };
            // Resolve errors as data (not bare events) so upstream handlers
            // log a meaningful message instead of 'undefined'.
            nextPlayer.onerror = function() { if (!done) { done = true; clearTimeout(timer); resolve('error'); } };
        });
        if (gen !== undefined && gen !== this.loopGen) return;
        if (settled === 'error') {
            throw new Error('Chunk playback failed');
        }

        // canplay implies metadata; capture now too so a very fast
        // loadedmetadata that preceded the listener cannot leave the origin
        // unknown. The handler remains armed for engines that load later.
        applyTarget();

        // Swap first, then silence + park the old element: no overlap
        // audio, no wasted buffering, and stale callbacks die here (the
        // historical double-buffer cleanup the current code was missing).
        nextPlayer.style.opacity = '1';
        nextPlayer.style.zIndex = '2';
        currentPlayer.style.opacity = '0';
        currentPlayer.style.zIndex = '1';
        try { currentPlayer.pause(); } catch (e) {}
        if (typeof currentPlayer.__dueliOriginSeekCleanup === 'function') {
            try { currentPlayer.__dueliOriginSeekCleanup(); } catch (e) {}
        }
        currentPlayer.muted = true;
        currentPlayer.oncanplay = null;
        currentPlayer.onerror = null;
        currentPlayer.onended = null;
        currentPlayer.onloadedmetadata = null;

        // Seek inside the newly active chunk (live timeline / rewind). The
        // offset is chunk-local; applyTarget above already converted it with
        // the captured media origin (origin + offset) and re-applies it when
        // metadata arrives. Never write the bare local offset on an absolute
        // media timeline: 0 would clamp to 517.743 instead of the chunk start.

        nextPlayer.play().then(function() {
            setTimeout(function() { try { nextPlayer.muted = false; } catch (e) {} }, 100);
        }).catch(function() {
            // Audible blocked but muted flows — keep video, note it.
            testLog('Muted playback continues (autoplay policy)', 'warn');
        });
        this.activePlayerIndex = nextPlayerIndex;
        this.currentIndex = index;

        this.onChunkChange && this.onChunkChange(index, -1);
        this.emitTimeUpdate();
    }

    stop() {
        this.isRunning = false;
        this.currentIndex = -1;
        this.loopGen = (this.loopGen || 0) + 1;
        this.videoPlayers.forEach(function(v) {
            if (typeof v.__dueliOriginSeekCleanup === 'function') {
                try { v.__dueliOriginSeekCleanup(); } catch (e) {}
            }
            try { v.pause(); } catch (e) {}
            v.oncanplay = null;
            v.onerror = null;
            v.onended = null;
            v.onloadedmetadata = null;
            v.ontimeupdate = null;
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
        // R4-CHUNK-VIEW-RECOVERY-1 REM1 (28.4.1): progress/timed comments use
        // this ONE global timeline (verified start + offset), never the raw
        // element currentTime/duration of the currently loaded chunk.
        this.onTimeUpdate = options.onTimeUpdate;
        
        // حالة المشغل
        this.playlist = null;
        this.chunks = [];           // metadata
        this.loadedChunks = {};     // ArrayBuffer مخزنة
        // In-flight request registry: concurrent window/seek requests for the
        // same chunk share ONE fetch (no duplicate bytes, no double-store).
        this.inFlightLoads = {};
        // Generation token: a seek/switch retires older async loads so a late
        // response can never steal the element from the newest target.
        this.opGen = 0;
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

        // A28-TIME (production 2244): a completed surface can start before the
        // authorized drain tail's final chunk is ready. The playlist snapshot
        // used to be captured once, so the clock/total stayed at 24 chunks /
        // 255.863s after the 25th chunk (271.347s) landed. Refresh the SAME
        // player in a bounded window; never reload the element or reset the
        // playhead. Defaults: 2s × 30 = a 60s bounded window.
        this.playlistRefreshMs = (typeof options.playlistRefreshMs === 'number'
            && isFinite(options.playlistRefreshMs) && options.playlistRefreshMs >= 0)
            ? options.playlistRefreshMs : 2000;
        this.playlistRefreshMaxAttempts = (typeof options.playlistRefreshMaxAttempts === 'number'
            && isFinite(options.playlistRefreshMaxAttempts) && options.playlistRefreshMaxAttempts > 0)
            ? Math.floor(options.playlistRefreshMaxAttempts) : 30;
        this.playlistRefreshTimer = null;
        this.playlistRefreshAttempts = 0;
        this.playlistRefreshInFlight = false;
        // A28-TIME-3: /end writes the final marker BEFORE the authorized drain
        // tail is published. A finalized=true + ready==uploaded snapshot is
        // therefore not proof that the tail is absent. The marker timestamp
        // bounds an authoritative recheck after initialization; a lifecycle
        // epoch + request sequence keep a late/older response from reviving an
        // old player or overwriting a newer snapshot.
        this.playlistRefreshEpoch = 0;
        this.playlistRefreshRequestSeq = 0;
        this.playlistRefreshAbort = null;
        this.stopped = false;
    }

    /**
     * R4-CHUNK-VIEW-RECOVERY-1 REM1 (28.4.1 / FV20-TIME): first presentation
     * time of the loaded resource. Captured at loadedmetadata, never assumed:
     * a standalone fragmented MP4 may report an absolute currentTime while
     * the recording index uses a different global start; MSE/WebM may report
     * 0. All seek/global conversions subtract/add exactly this origin once.
     */
    mediaOriginFor(video) {
        if (!video) return 0;
        var origin = video.__dueliMediaOrigin;
        return (typeof origin === 'number' && isFinite(origin) && origin >= 0) ? origin : 0;
    }

    captureMediaOrigin(video, expectedDuration) {
        if (!video) return 0;
        // Re-evaluate a cached zero: it may be the "not known yet" value from
        // an earlier loadedmetadata, not proof of a zero-origin resource.
        return dueliMediaOrigin(video, expectedDuration);
    }

    /**
     * بدء المشغل - جلب metadata وتشغيل أول chunk
     */
    async start() {
        this.stopped = false;
        // Retire any previous start/stop lifecycle before reusing the player:
        // its timer is cleared, its in-flight request is aborted, and its late
        // response is ignored by the epoch/request-sequence checks below.
        this.playlistRefreshEpoch++;
        this.playlistRefreshRequestSeq++;
        this.playlistRefreshInFlight = false;
        if (this.playlistRefreshAbort) {
            try { this.playlistRefreshAbort.abort(); } catch (e) {}
            this.playlistRefreshAbort = null;
        }
        if (this.playlistRefreshTimer) {
            clearTimeout(this.playlistRefreshTimer);
            this.playlistRefreshTimer = null;
        }
        this.playlistRefreshAttempts = 0;
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
            
            // 2. verified time map FIRST (D1 authority wins per entry; ms -> s
            // exactly once), then real per-entry durations + total.
            this.buildTimeMap();
            this.calculateDurations();
            
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

            // A28-TIME: bounded final-chunk refresh, only when the index says
            // the recording is not final yet or a ready chunk is still missing.
            this.schedulePlaylistRefresh();
            
        } catch (error) {
            testLog('❌ ' + error.message, 'error');
            this.onError && this.onError(error);
        }
    }

    /**
     * حساب مدة كل chunk والمدة الإجمالية
     */
    calculateDurations() {
        // R4-CHUNK-VIEW-RECOVERY-1 REM1 (28.4.1 / O19-13): REAL durations only.
        // - verified timeline boundary (next_start - start) wins because it is
        //   the recording index truth for variable-length chunks;
        // - otherwise the entry's own verified duration;
        // - otherwise the configured per-chunk fallback (never total/count).
        const defaultDuration = (this.playlist && this.playlist.chunk_duration > 0)
            ? this.playlist.chunk_duration
            : 10;
        const n = this.chunks.length;
        this.chunkDurations = [];
        for (let i = 0; i < n; i++) {
            const entry = this.chunks[i] || {};
            const own = (typeof entry.duration === 'number' && isFinite(entry.duration) && entry.duration > 0)
                ? entry.duration
                : null;
            const start = this.verifiedStarts[i];
            const next = this.verifiedStarts[i + 1];
            let duration;
            if (typeof start === 'number' && typeof next === 'number' && next > start) {
                duration = next - start;
            } else if (own !== null) {
                duration = own;
            } else {
                duration = defaultDuration;
            }
            this.chunkDurations.push(duration);
        }

        // Total from the recording index (ms -> s once). The route's
        // total_duration is deliberately NOT used: it can be a sum of served
        // entries and hides gaps/readiness.
        const meta = this.playlist && this.playlist.index_metadata;
        if (meta && typeof meta.total_ready_ms === 'number'
            && isFinite(meta.total_ready_ms) && meta.total_ready_ms > 0) {
            this.totalDuration = meta.total_ready_ms / 1000;
        } else {
            let sum = 0;
            for (let i = 0; i < this.chunkDurations.length; i++) sum += this.chunkDurations[i] || 0;
            let verifiedEnd = 0;
            for (const key in this.verifiedStarts) {
                const idx = parseInt(key, 10);
                const end = this.verifiedStarts[key] + (this.chunkDurations[idx] || 0);
                if (end > verifiedEnd) verifiedEnd = end;
            }
            this.totalDuration = Math.max(sum, verifiedEnd);
        }
        if (!isFinite(this.totalDuration) || this.totalDuration < 0) this.totalDuration = 0;

        testLog('⏱️ Total duration: ' + Math.round(this.totalDuration) + 's (' + this.chunks.length + ' chunks)', 'info');
    }

    /**
     * R4-CHUNK-PLAYER-UX-1: verified time map. Per-entry timeline_start_ms
     * (D1 authority) wins where present; entries without one keep legacy
     * math.
     *
     * UNITS CONTRACT (REMOTE REJECT fix): timeline_start_ms arrives in
     * MILLISECONDS (server/model domain, like duration_ms), but every
     * player comparison runs in SECONDS (currentTime, totalDuration,
     * seek targets). The division happens HERE, once, at the boundary —
     * comparing raw ms against seconds resolved every indexed seek to
     * chunk zero.
     */
    buildTimeMap() {
        this.verifiedStarts = {};
        for (let i = 0; i < this.chunks.length; i++) {
            const t = this.chunks[i] && this.chunks[i].timeline_start_ms;
            if (typeof t === 'number' && isFinite(t) && t >= 0) this.verifiedStarts[i] = t / 1000;
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
    async loadAndPlayChunk(index, globalSeekTime) {
        if (index < 0 || index >= this.chunks.length) return;
        const self = this;
        // Every switch gets a fresh generation: a late load/seek for an older
        // target is dropped instead of stealing the element (rapid seek).
        const gen = ++this.opGen;
        const chunk = this.chunks[index];
        const pendingSeek = (typeof globalSeekTime === 'number' && isFinite(globalSeekTime))
            ? globalSeekTime
            : this.seekPending;
        
        testLog('▶️ Playing chunk ' + (index + 1) + '/' + this.chunks.length, 'info');
        
        // تحميل إذا لم تكن محملة
        if (this.loadedChunks[index] === undefined) {
            await this.loadChunk(index);
        }
        // Superseded while fetching — never apply this target.
        if (gen !== this.opGen) return;
        if (this.loadedChunks[index] === undefined) return;
        this.seekPending = null;
        this.currentChunkIndex = index;

        // R4-CHUNK-VIEW-RECOVERY-1 REM1 (28.4.1 / FV20-TIME): resolve the
        // chunk-local target BEFORE loading. The element may expose an
        // absolute media timeline, so the actual currentTime is
        // origin + local offset (origin captured at loadedmetadata below).
        let localSeekOffset = null;
        if (pendingSeek !== null && pendingSeek !== undefined) {
            const chunkStartTime = this.getChunkStartTime(index);
            const maxOffset = this.chunkDurations[index] || 0;
            let timeInChunk = pendingSeek - chunkStartTime;
            if (!isFinite(timeInChunk) || timeInChunk < 0) timeInChunk = 0;
            if (maxOffset > 0 && timeInChunk > maxOffset) timeInChunk = maxOffset;
            localSeekOffset = timeInChunk;
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

        if (typeof this.videoElement.__dueliOriginSeekCleanup === 'function') {
            try { this.videoElement.__dueliOriginSeekCleanup(); } catch (e) {}
        }
        this.videoElement.__dueliMediaOrigin = undefined;
        this.videoElement.__dueliMediaOriginKnown = false;
        const applyTarget = () => {
            if (gen !== self.opGen) return;
            // Do not capture/seek before metadata exists: at the
            // loadedmetadata EVENT currentTime can still read 0 even though
            // the resource's origin (e.g. 517.743) is applied immediately
            // after dispatch. The deferred handler below runs after that.
            if (typeof self.videoElement.readyState === 'number'
                && self.videoElement.readyState < 1) return;
            const expected = self.chunkDurations[index] || 0;
            self.captureMediaOrigin(self.videoElement, expected);
            if (localSeekOffset !== null) {
                // A28-TIME: never write the bare offset before the origin is
                // evidence-backed; it would clamp to the chunk start on an
                // absolute timeline. The helper re-applies once duration
                // (or the parked position) proves the origin.
                dueliApplyOriginSeek(self.videoElement, localSeekOffset, expected, function() {
                    return gen === self.opGen;
                });
            }
        };
        this.videoElement.onloadedmetadata = function() {
            setTimeout(applyTarget, 0);
        };

        this.videoElement.src = blobUrl;
        await this.videoElement.load();
        // A newer switch may have loaded while this one resolved.
        if (gen !== this.opGen) {
            if (this.currentBlobUrl === blobUrl) {
                try { URL.revokeObjectURL(blobUrl); } catch (e) {}
                this.currentBlobUrl = null;
            } else {
                try { URL.revokeObjectURL(blobUrl); } catch (e) {}
            }
            return;
        }

        // Wait (bounded) for metadata before starting playback. Otherwise
        // play() can begin before loadedmetadata, advancing currentTime past
        // the origin and making an absolute-timeline origin unknowable.
        // Stubs/engines without readyState keep the legacy immediate path.
        if (typeof this.videoElement.readyState === 'number' && this.videoElement.readyState < 1) {
            await new Promise(function(resolve) {
                var done = false;
                var timer = null;
                var finish = function() {
                    if (done) return;
                    done = true;
                    if (timer !== null) clearTimeout(timer);
                    resolve();
                };
                this.videoElement.addEventListener('loadedmetadata', function() {
                    setTimeout(finish, 0);
                }, { once: true });
                timer = setTimeout(finish, 3000);
            }.bind(this));
            if (gen !== this.opGen) return;
        }

        // A cached/cold blob can already expose metadata. Otherwise defer the
        // seek until the origin is known; writing the bare chunk-local offset
        // is exactly the clamp this A28-TIME correction removes.
        if (this.videoElement.readyState >= 1
            || (typeof this.videoElement.duration === 'number'
                && isFinite(this.videoElement.duration) && this.videoElement.duration > 0)) {
            applyTarget();
        } else if (localSeekOffset !== null) {
            dueliApplyOriginSeek(
                this.videoElement, localSeekOffset, this.chunkDurations[index] || 0,
                function() { return gen === self.opGen; }
            );
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
        // The play() promise may resolve after a newer seek took over.
        if (gen !== this.opGen) return;
        
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
        
        // Chunk-switch progress only (which file is now playing), never the
        // playback position: global seconds/total go through onTimeUpdate.
        // onChunkLoaded owns the loaded-file count.
        this.onProgress && this.onProgress(index + 1, this.chunks.length);
    }

    /**
     * تحميل chunk وتخزينها
     */
    loadChunk(index) {
        if (this.loadedChunks[index] !== undefined) return Promise.resolve(); // محملة مسبقاً
        // In-flight dedupe: a preload window and a seek can request the same
        // chunk together; both await the SAME fetch.
        if (this.inFlightLoads[index]) return this.inFlightLoads[index];
        const self = this;
        const request = this._loadChunk(index);
        this.inFlightLoads[index] = request;
        return request.then(
            function() { delete self.inFlightLoads[index]; },
            function(err) { delete self.inFlightLoads[index]; throw err; }
        );
    }

    async _loadChunk(index) {
        const chunk = this.chunks[index];
        if (!chunk || typeof chunk.url !== 'string' || !chunk.url) {
            throw new Error('Chunk has no URL');
        }

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
        // Move the retention bounds FIRST: a fetch that resolves after this
        // seek belongs to the new window, and anything evicted stays evicted
        // (late responses must not restore the old window).
        var keepLo = Math.max(0, centerIndex - this.RETAIN_DISTANCE);
        var keepHi = Math.min(this.chunks.length - 1, centerIndex + this.RETAIN_DISTANCE + 1);
        this.windowLo = keepLo;
        this.windowHi = keepHi;
        for (let i = lo; i <= hi; i++) {
            if (this.loadedChunks[i] === undefined) {
                this.loadChunk(i).catch(function() {});
            }
        }
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
        
        // تحديث الـ seekbar أثناء التشغيل — ONE global timeline
        this.videoElement.ontimeupdate = function() {
            const currentGlobalTime = self.getGlobalTime();
            const total = self.totalDuration;
            
            // تحديث الـ seekbar إذا موجود
            const seekbar = document.getElementById('vodSeekbar');
            if (seekbar) {
                seekbar.value = total > 0
                    ? Math.max(0, Math.min(100, (currentGlobalTime / total) * 100))
                    : 0;
            }
            
            // تحديث عرض الوقت
            const timeDisplay = document.getElementById('vodTimeDisplay');
            if (timeDisplay) {
                timeDisplay.textContent = self.formatTime(currentGlobalTime) + ' / ' + self.formatTime(total);
            }

            if (typeof self.onTimeUpdate === 'function') {
                self.onTimeUpdate(currentGlobalTime, total, self.currentChunkIndex);
            }
        };
    }

    /**
     * Seek ذكي - القفز لوقت معين (نافذة التحميل تتبع الهدف، والقفز يتخطى
     * غير المؤكدة عند توفر المؤكدة).
     */
    seekTo(globalTime) {
        if (typeof globalTime !== 'number' || !isFinite(globalTime)) return;
        if (globalTime < 0) globalTime = 0;
        if (this.totalDuration > 0 && globalTime > this.totalDuration) globalTime = this.totalDuration;
        
        // حساب الـ chunk المناسبة
        let targetChunk = this.getChunkForTime(globalTime);
        let playable = this.nextPlayableIndex(targetChunk);
        let targetTime;
        if (playable === null) {
            // Target is an unconfirmed TAIL with nothing playable after it:
            // clamp to the END of the previous confirmed chunk (seek-to-end),
            // never play undecoded bytes and never no-op silently.
            for (let i = targetChunk - 1; i >= 0; i--) {
                const e = this.chunks[i];
                if (!e || (this.hasReadyInfo() && e.ready === false)) continue;
                playable = i;
                break;
            }
            if (playable === null) return;
            targetTime = this.getChunkStartTime(playable) + (this.chunkDurations[playable] || 0);
        } else if (playable !== targetChunk) {
            // Target landed on an unconfirmed slot: play the next confirmed
            // chunk from ITS REAL start, never pretending the skipped bytes
            // exist.
            targetTime = this.getChunkStartTime(playable);
        } else {
            targetTime = globalTime;
        }
        targetChunk = playable;
        
        testLog('🎯 Seeking to ' + this.formatTime(targetTime) + ' (chunk ' + (targetChunk + 1) + ')', 'info');
        
        if (targetChunk === this.currentChunkIndex && this.videoElement.src) {
            // نفس الـ chunk - seek مباشر (يحبط أي تبديل قديم معلّق)
            const chunkStart = this.getChunkStartTime(targetChunk);
            const maxOffset = this.chunkDurations[targetChunk] || 0;
            let offset = targetTime - chunkStart;
            if (!isFinite(offset) || offset < 0) offset = 0;
            if (maxOffset > 0 && offset > maxOffset) offset = maxOffset;
            const seekGen = ++this.opGen;
            this.seekPending = null;
            // The element's media timeline may start at a non-zero origin;
            // seek to origin + chunk-local offset, never the bare offset.
            // If the origin is not known yet, the write is deferred instead
            // of clamping the bare offset to the chunk start.
            const player = this;
            dueliApplyOriginSeek(
                this.videoElement, offset, this.chunkDurations[targetChunk] || 0,
                function() { return seekGen === player.opGen; }
            );
            try {
                const p = this.videoElement.play();
                if (p && typeof p.catch === 'function') p.catch(function() {});
            } catch (e) {}
        } else {
            // chunk مختلفة - تحميل وتشغيل. The generation token + recentered
            // window make late responses from an older seek harmless.
            this.seekPending = targetTime;
            this.ensureWindow(targetChunk);
            this.loadAndPlayChunk(targetChunk, targetTime).catch(function(err) {
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
        // Anchor on the nearest VERIFIED earlier start, then add only the
        // real intervening durations. Legacy lists (no verified starts at all)
        // accumulate their own real per-entry durations.
        for (let i = chunkIndex - 1; i >= 0; i--) {
            if (this.verifiedStarts && this.verifiedStarts[i] !== undefined) {
                let anchored = this.verifiedStarts[i];
                for (let j = i; j < chunkIndex; j++) anchored += this.chunkDurations[j] || 0;
                return anchored;
            }
        }
        let start = 0;
        for (let i = 0; i < chunkIndex; i++) {
            start += this.chunkDurations[i] || 0;
        }
        return start;
    }

    /** One global position: verified chunk start + local offset (seconds). */
    getGlobalTime() {
        if (typeof this.currentChunkIndex !== 'number' || this.currentChunkIndex < 0
            || this.currentChunkIndex >= this.chunks.length) return 0;
        const origin = this.captureMediaOrigin(
            this.videoElement, this.chunkDurations[this.currentChunkIndex] || 0
        );
        let offset = (this.videoElement && typeof this.videoElement.currentTime === 'number'
            && isFinite(this.videoElement.currentTime)) ? this.videoElement.currentTime - origin : 0;
        if (!isFinite(offset) || offset < 0) offset = 0;
        return Math.max(0, this.getChunkStartTime(this.currentChunkIndex) + offset);
    }

    /** Recording length from the index timeline, never element.duration. */
    getGlobalDuration() {
        return this.totalDuration;
    }

    async togglePlayPause() {
        const v = this.videoElement;
        if (!v) return;
        try {
            if (v.paused) await v.play();
            else v.pause();
        } catch (e) { /* autoplay policy / detached element */ }
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
     * R4-CHUNK-DOWNLOAD-1: the legacy raw-Blob download path
     * (mergeChunks / downloadVideo / convertToMp4 / downloadAsMp4) was
     * removed on purpose. It concatenated player-cached chunks (including
     * repeated init segments and stale absolute indexes) and loaded FFmpeg
     * from a CDN. Downloads now go through RecordingDownloadPanel /
     * RecordingDownloadService, which uses the authenticated server manifest,
     * fetches every chunk independently, verifies it, and remuxes without
     * depending on loadedChunks.
     */

    /**
     * A28-TIME: refresh while the authoritative index says the recording is
     * not final, or a ready chunk is still missing.
     *
     * A28-TIME-3: finalized=true + ready==uploaded is NOT terminal. The final
     * marker is written at /end before the authorized drain tail is published,
     * so the tail can appear after this snapshot. Recheck only while the
     * server's own checked_at is still inside the bounded post-finalization
     * window. A legacy playlist without finalized_at keeps the old path (it
     * carries no evidence that would justify polling).
     */
    needsPlaylistRefresh() {
        var meta = this.playlist && this.playlist.index_metadata;
        if (!meta) return false;
        var missing = (typeof meta.ready_count === 'number'
            && typeof meta.uploaded_count === 'number'
            && meta.ready_count < meta.uploaded_count);
        if (meta.finalized !== true) return meta.finalized === false;
        if (missing) return true;

        var finalizedAt = (typeof meta.finalized_at === 'string')
            ? Date.parse(meta.finalized_at) : NaN;
        if (!isFinite(finalizedAt)) return false;
        // Use the server response timestamp (not the viewer's wall clock) so
        // clock skew cannot widen or close the window. checked_at exists on
        // every route response; tests may omit it.
        var observedAt = (this.playlist && typeof this.playlist.checked_at === 'string')
            ? Date.parse(this.playlist.checked_at) : NaN;
        if (!isFinite(observedAt)) observedAt = Date.now();
        var settleMs = this.playlistRefreshMs * this.playlistRefreshMaxAttempts;
        return (observedAt - finalizedAt) < settleMs;
    }

    /** Bounded timer; a timer/in-flight request never duplicates. */
    schedulePlaylistRefresh() {
        if (this.stopped || this.playlistRefreshTimer || this.playlistRefreshInFlight) return;
        if (this.playlistRefreshAttempts >= this.playlistRefreshMaxAttempts) return;
        if (!this.needsPlaylistRefresh()) return;
        var self = this;
        this.playlistRefreshTimer = setTimeout(function() {
            self.playlistRefreshTimer = null;
            self.refreshPlaylist();
        }, this.playlistRefreshMs);
    }

    /**
     * A28-TIME: fold the final drain-tail chunk into the SAME player. The
     * element, currentChunkIndex, loaded bytes and generation are untouched,
     * so playback never restarts or jumps; only the timeline/total metadata
     * and the appended tail are updated. Bounded by attempts + the
     * finalized/ready predicate (no infinite loop).
     *
     * A28-TIME-3: only apply a response from THIS lifecycle and only when it
     * is not older than the snapshot currently displayed. The epoch/request
     * sequence rejects a response that resolves after stop/start; the server
     * checked_at rejects an out-of-order older response. The append-only guard
     * still prevents an older/smaller list from shrinking playback.
     */
    async refreshPlaylist() {
        if (this.stopped || this.playlistRefreshInFlight) return;
        if (!this.needsPlaylistRefresh()) return;
        var epoch = this.playlistRefreshEpoch;
        var requestId = ++this.playlistRefreshRequestSeq;
        this.playlistRefreshInFlight = true;
        this.playlistRefreshAttempts++;
        var controller = (typeof AbortController === 'function') ? new AbortController() : null;
        this.playlistRefreshAbort = controller;
        try {
            var requestInit = { cache: 'no-store' };
            if (controller) requestInit.signal = controller.signal;
            var res = await fetch('/api/chunks/playlist/' + this.competitionId, requestInit);
            if (!res || !res.ok) return;
            var data = await res.json();
            if (this.stopped || epoch !== this.playlistRefreshEpoch) return;
            if (!data || !Array.isArray(data.chunks) || data.chunks.length === 0) return;
            if (data.upstream === 'error' || data.upstream === 'invalid') return;
            // A late older response must never overwrite the newer snapshot.
            var currentCheckedAt = this.playlist && this.playlist.checked_at;
            var incomingCheckedAt = data.checked_at;
            if (typeof currentCheckedAt === 'string' && typeof incomingCheckedAt === 'string') {
                var currentMs = Date.parse(currentCheckedAt);
                var incomingMs = Date.parse(incomingCheckedAt);
                if (isFinite(currentMs) && isFinite(incomingMs) && incomingMs < currentMs) return;
            }
            // Append-only authority: a stale/older snapshot must never shrink
            // the already playable list.
            if (data.chunks.length < this.chunks.length) return;
            this.playlist = data;
            this.chunks = data.chunks;
            this.extension = data.extension || this.extension;
            this.buildTimeMap();
            this.calculateDurations();
            if (this.currentChunkIndex >= this.chunks.length) {
                this.currentChunkIndex = Math.max(0, this.chunks.length - 1);
            }
            if (typeof this.onTimeUpdate === 'function') {
                this.onTimeUpdate(this.getGlobalTime(), this.totalDuration, this.currentChunkIndex);
            }
        } catch (e) {
            if (!this.stopped && epoch === this.playlistRefreshEpoch) {
                testLog('⚠️ Playlist refresh failed (bounded retry)', 'warn');
            }
        } finally {
            if (requestId === this.playlistRefreshRequestSeq) {
                this.playlistRefreshInFlight = false;
                if (this.playlistRefreshAbort === controller) this.playlistRefreshAbort = null;
                if (!this.stopped && epoch === this.playlistRefreshEpoch
                    && this.needsPlaylistRefresh()) {
                    this.schedulePlaylistRefresh();
                }
            }
        }
    }

    /**
     * إيقاف المشغل
     */
    stop() {
        this.stopped = true;
        // A28-TIME-3: make the stop authoritative for async work too. A
        // pending fetch is aborted and its late response can no longer apply
        // or reschedule (epoch/request sequence is retired).
        this.playlistRefreshEpoch++;
        this.playlistRefreshRequestSeq++;
        this.playlistRefreshInFlight = false;
        if (this.playlistRefreshAbort) {
            try { this.playlistRefreshAbort.abort(); } catch (e) {}
            this.playlistRefreshAbort = null;
        }
        if (this.playlistRefreshTimer) {
            clearTimeout(this.playlistRefreshTimer);
            this.playlistRefreshTimer = null;
        }
        if (this.videoElement && typeof this.videoElement.__dueliOriginSeekCleanup === 'function') {
            try { this.videoElement.__dueliOriginSeekCleanup(); } catch (e) {}
        }
        this.opGen++;
        this.seekPending = null;
        this.videoElement.pause();
        this.videoElement.src = '';
        this.videoElement.onended = null;
        this.videoElement.ontimeupdate = null;
        this.videoElement.onloadedmetadata = null;
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
        this.inFlightLoads = {};
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

