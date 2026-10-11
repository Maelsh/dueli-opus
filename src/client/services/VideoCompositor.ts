/**
 * Video Compositor Service
 * خدمة دمج الفيديو
 * 
 * Merges local and remote video streams on canvas,
 * records chunks, and uploads to server.
 * يدمج بثي الفيديو المحلي والبعيد على Canvas،
 * يسجل قطع ويرفعها للسيرفر.
 */

import { ChunkUploader, RecordingLeaseHandle } from './ChunkUploader';

/**
 * Conditional debug logger (same pattern as
 * src/modules/pages/live/scripts/client/shared.ts:42).
 * Enable in devtools: localStorage.setItem('dueli_debug', '1').
 * console.error stays for real errors; everything else goes through here
 * so production consoles stay clean.
 */
function debugLog(...args: unknown[]): void {
    try {
        if (typeof localStorage !== 'undefined' && localStorage.getItem('dueli_debug') === '1') {
            console.log.apply(console, args);
        }
    } catch { /* storage unavailable */ }
}

export interface VideoCompositorConfig {
    competitionId: number;
    localVideo: HTMLVideoElement;
    remoteVideo: HTMLVideoElement;
    canvas?: HTMLCanvasElement;
    chunkDuration?: number; // in milliseconds, default 10000 (10s)
    serverUrl?: string;
    /**
     * R4-COMP-UNIFIED-1: original test-page identity, drawn INSIDE the
     * recorded frames (not a page overlay). platformName is the host-language
     * app title (e.g. 'Dueli' / 'ديولي'), rtl mirrors the whole layout.
     */
    platformName?: string;
    rtl?: boolean;
    logoUrl?: string;
    onChunkUploaded?: (chunkNumber: number) => void;
    onRecordingStarted?: () => void;
    onRecordingStopped?: () => void;
    onError?: (error: Error) => void;
    /**
     * R4-CHUNK-DOWNLOAD-1 (D): exclusive recorder ownership. When present,
     * startRecording acquires the lease first and refuses to record when
     * another session holds it; losing the lease mid-recording aborts the
     * recorder without finalizing (the new holder owns the merge).
     */
    lease?: RecordingLeaseHandle;
    /** Fired once when this session is fenced out mid-recording. */
    onLeaseLost?: (info: { generation: number }) => void;
}

export interface RecordingStats {
    chunksRecorded: number;
    chunksUploaded: number;
    totalDuration: number;
    isRecording: boolean;
}

export class VideoCompositor {
    private config: VideoCompositorConfig;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private mediaRecorder: MediaRecorder | null = null;
    private uploader: ChunkUploader;
    private animationFrameId: number | null = null;
    private isCompositing: boolean = false;
    private isRecording: boolean = false;
    /** Guards concurrent startRecording() calls (page fires it per track). */
    private startPending: boolean = false;
    private chunkNumber: number = 0;
    private chunksUploaded: number = 0;
    private startTime: number = 0;
    private mimeType: string = '';
    private fileExtension: string = 'webm';
    /** Original Dueli logo image (drawn into the recorded frames). */
    private logoImage: HTMLImageElement | null = null;
    /**
     * R4-CHUNK-PLAY-1: in-flight ondataavailable handlers. stop() must wait
     * for the final handler to ENQUEUE its blob before finalize() drains —
     * otherwise the last chunk is uploaded after finalization (lost from the
     * merge) or never at all.
     */
    private pendingSaves = 0;

    // Canvas dimensions — original test-page design (1280×720).
    private readonly CANVAS_WIDTH = 1280;
    private readonly CANVAS_HEIGHT = 720;

    constructor(config: VideoCompositorConfig) {
        this.config = {
            chunkDuration: 5000, // ⭐ 5s بدلاً من 10s (تقليل latency)
            serverUrl: 'https://maelshpro.com/ffmpeg',
            platformName: 'Dueli',
            rtl: false,
            logoUrl: '/static/dueli-icon.png',
            ...config
        };

        // Original identity asset (same-origin: no canvas taint).
        try {
            const logo = new Image();
            logo.crossOrigin = 'anonymous';
            logo.src = this.config.logoUrl as string;
            this.logoImage = logo;
        } catch {
            this.logoImage = null;
        }

        // Create or use provided canvas
        if (config.canvas) {
            this.canvas = config.canvas;
        } else {
            this.canvas = document.createElement('canvas');
            this.canvas.width = this.CANVAS_WIDTH;
            this.canvas.height = this.CANVAS_HEIGHT;
        }

        this.ctx = this.canvas.getContext('2d')!;

        // Initialize uploader
        this.uploader = new ChunkUploader({
            competitionId: config.competitionId,
            serverUrl: this.config.serverUrl!,
            onChunkUploaded: (num) => {
                this.chunksUploaded++;
                this.config.onChunkUploaded?.(num);
            },
            onError: config.onError,
            lease: config.lease,
            onLeaseLost: (info) => {
                // Fenced out: abort the recorder WITHOUT finalizing, then
                // tell the page (toast/status) via the same callback.
                void this.abortRecording();
                try {
                    this.config.onLeaseLost?.(info);
                } catch { /* listener must never break fencing */ }
            }
        });

        // Determine best mime type for recording (prioritize MP4 for iOS)
        this.detectMimeType();
    }

    /**
     * Detect best supported mime type
     * Prioritize MP4 for iOS compatibility
     */
    private detectMimeType(): void {
        const options = [
            'video/mp4; codecs="avc1.42E01E, mp4a.40.2"', // Safari & Modern Chrome
            'video/mp4',                                   // Generic MP4
            'video/webm; codecs=vp9,opus',                  // Best WebM
            'video/webm; codecs=vp8,opus',                 // Fallback WebM
            'video/webm'                                   // Basic WebM
        ];

        for (const type of options) {
            if (MediaRecorder.isTypeSupported(type)) {
                this.mimeType = type;
                this.fileExtension = type.includes('mp4') ? 'mp4' : 'webm';
                debugLog(`[VideoCompositor] Using format: ${this.fileExtension} (${type})`);
                break;
            }
        }

        if (!this.mimeType) {
            this.mimeType = 'video/webm';
            this.fileExtension = 'webm';
            debugLog('[VideoCompositor] No preferred format supported, using default webm');
        }

        // ⭐ تحذير إذا WebM - Safari لن يشغلها
        if (this.fileExtension === 'webm') {
            debugLog('⚠️ Recording in WebM - Safari/iPhone viewers will NOT be able to watch!');
            debugLog('💡 Recommend using Chrome/Edge for hosting to get MP4 format');
        }

        // Update uploader with detected extension
        this.uploader.setExtension(this.fileExtension);
    }

    /**
     * Get the canvas element for display
     */
    getCanvas(): HTMLCanvasElement {
        return this.canvas;
    }

    /**
     * R4-COMP-UNIFIED-1: resolved recording format (MP4 when the browser
     * supports it, real WebM fallback otherwise — never mislabeled).
     */
    getFormat(): { mimeType: string; extension: string } {
        return { mimeType: this.mimeType, extension: this.fileExtension };
    }

    /**
     * Start compositing (drawing both videos to canvas)
     */
    startCompositing(): void {
        if (this.isCompositing) return;

        this.isCompositing = true;
        this.drawFrame();
        debugLog('[VideoCompositor] Compositing started');
    }

    /**
     * Draw both videos side by side on canvas — ORIGINAL test-page design,
     * reused literally: gradient background, Dueli logo + host-language
     * platform name (RTL-mirrored), both competitors with Dueli gradient
     * borders in RTL-aware order. This is what lands INSIDE recorded frames.
     */
    private drawFrame(): void {
        if (!this.isCompositing) return;

        const ctx = this.ctx;
        const CANVAS_WIDTH = this.CANVAS_WIDTH;
        const CANVAS_HEIGHT = this.CANVAS_HEIGHT;
        const isRTL = this.config.rtl === true;
        const platformName = this.config.platformName as string;

        // خلفية متدرجة (original)
        const gradient = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        gradient.addColorStop(0, '#1a1a2e');
        gradient.addColorStop(1, '#16213e');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Dueli Logo + Text (original, RTL-mirrored)
        const logoSize = 40;
        const logoY = 10;

        if (isRTL) {
            // RTL: النص يسار الشعار
            const logoX = (CANVAS_WIDTH / 2) + 30;

            if (this.logoImage && this.logoImage.complete && this.logoImage.naturalWidth > 0) {
                ctx.drawImage(this.logoImage, logoX, logoY, logoSize, logoSize);
            }

            const logoGradient = ctx.createLinearGradient(logoX - 100, 0, logoX, 0);
            logoGradient.addColorStop(0, '#f59e0b');
            logoGradient.addColorStop(1, '#9333ea');
            ctx.fillStyle = logoGradient;
            ctx.font = 'bold 32px Cairo, Arial';
            ctx.textAlign = 'right';
            ctx.fillText(platformName, logoX - 25, logoY + 32);
        } else {
            // LTR: النص يمين الشعار
            const logoX = (CANVAS_WIDTH / 2) - 70;

            if (this.logoImage && this.logoImage.complete && this.logoImage.naturalWidth > 0) {
                ctx.drawImage(this.logoImage, logoX, logoY, logoSize, logoSize);
            }

            const logoGradient = ctx.createLinearGradient(logoX + logoSize, 0, logoX + logoSize + 100, 0);
            logoGradient.addColorStop(0, '#9333ea');
            logoGradient.addColorStop(1, '#f59e0b');
            ctx.fillStyle = logoGradient;
            ctx.font = 'bold 32px Inter, Arial';
            ctx.textAlign = 'left';
            ctx.fillText(platformName, logoX + logoSize + 10, logoY + 32);
        }

        const margin = 40;
        const videoAreaWidth = (CANVAS_WIDTH / 2) - (margin * 1.5);
        const videoAreaHeight = CANVAS_HEIGHT - (margin * 2);

        // رسم الفيديوهات (الترتيب حسب الاتجاه — original)
        if (isRTL) {
            // RTL: المضيف يمين، الضيف يسار
            this.drawVideoFit(this.config.localVideo, (CANVAS_WIDTH / 2) + (margin / 2), margin + 20, videoAreaWidth, videoAreaHeight - 20);
            this.drawVideoFit(this.config.remoteVideo, margin, margin + 20, videoAreaWidth, videoAreaHeight - 20);
        } else {
            // LTR: المضيف يسار، الضيف يمين
            this.drawVideoFit(this.config.localVideo, margin, margin + 20, videoAreaWidth, videoAreaHeight - 20);
            this.drawVideoFit(this.config.remoteVideo, (CANVAS_WIDTH / 2) + (margin / 2), margin + 20, videoAreaWidth, videoAreaHeight - 20);
        }

        // Continue animation loop
        this.animationFrameId = requestAnimationFrame(() => this.drawFrame());
    }

    /**
     * Draw video maintaining aspect ratio + original Dueli gradient border.
     * Videos that are not flowing yet are skipped (background shows through),
     * exactly like the original test-page renderer.
     */
    private drawVideoFit(
        video: HTMLVideoElement,
        x: number,
        y: number,
        maxWidth: number,
        maxHeight: number
    ): void {
        if (!video || video.readyState < 2 || video.videoWidth === 0) return;

        const videoWidth = video.videoWidth || maxWidth;
        const videoHeight = video.videoHeight || maxHeight;
        const videoRatio = videoWidth / videoHeight;
        const containerRatio = maxWidth / maxHeight;

        let drawWidth = maxWidth;
        let drawHeight = maxHeight;
        let offsetX = x;
        let offsetY = y;

        if (videoRatio > containerRatio) {
            // Video is wider - fit to width
            drawHeight = maxWidth / videoRatio;
            offsetY = y + (maxHeight - drawHeight) / 2;
        } else {
            // Video is taller - fit to height
            drawWidth = maxHeight * videoRatio;
            offsetX = x + (maxWidth - drawWidth) / 2;
        }

        const ctx = this.ctx;
        ctx.fillStyle = '#000';
        ctx.fillRect(x, y, maxWidth, maxHeight);
        ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);

        // إطار بألوان Dueli (original: purple-600 → amber-500 diagonal)
        const borderGradient = ctx.createLinearGradient(x, y, x + maxWidth, y + maxHeight);
        borderGradient.addColorStop(0, '#9333ea');
        borderGradient.addColorStop(1, '#f59e0b');
        ctx.strokeStyle = borderGradient;
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, maxWidth, maxHeight);
    }

    /**
     * Start recording the canvas.
     * With a lease configured, ownership is claimed FIRST (acquireLease):
     * a session that loses the claim never builds a recorder, so two host
     * tabs can never record the same competition at once.
     */
    async startRecording(): Promise<void> {
        if (this.isRecording || this.startPending) return;
        this.startPending = true;
        try {
            // Sync time with server first
            await this.uploader.syncTime();

            // R4-CHUNK-PLAY-1: resume AFTER the highest saved server index so a
            // host gap/refresh appends without overwriting previous chunks.
            await this.uploader.initialize();

            // R4-CHUNK-DOWNLOAD-1 (D): claim exclusive ownership BEFORE the
            // recorder exists. False = another session holds it; the page
            // surfaces "recording in another tab" (with bounded retry).
            if (!(await this.uploader.acquireLease())) {
                debugLog('[VideoCompositor] Recording refused — lease held by another session');
                return;
            }

            await this.beginCapture();
        } finally {
            this.startPending = false;
        }
    }

    /**
     * Explicit claim (for pages that want the held/not-held answer before
     * wiring the recorder). Pass-through to the uploader.
     */
    async acquireRecordingLease(): Promise<boolean> {
        return this.uploader.acquireLease();
    }

    /** True while this session provably owns the recorder role. */
    get recordingLeaseHeld(): boolean {
        return this.uploader.leaseHeld;
    }

    /**
     * Capture setup extracted so the startPending guard above covers every
     * await (a second concurrent start can never build a second recorder).
     */
    private async beginCapture(): Promise<void> {
        // Get canvas stream
        const canvasStream = this.canvas.captureStream(30); // 30 FPS

        // Add audio from local video if available
        const audioTracks = this.config.localVideo.srcObject instanceof MediaStream
            ? (this.config.localVideo.srcObject as MediaStream).getAudioTracks()
            : [];

        // Add remote audio if available
        const remoteAudioTracks = this.config.remoteVideo.srcObject instanceof MediaStream
            ? (this.config.remoteVideo.srcObject as MediaStream).getAudioTracks()
            : [];

        // Create combined audio context for mixing
        if (audioTracks.length > 0 || remoteAudioTracks.length > 0) {
            try {
                const audioContext = new AudioContext();
                const destination = audioContext.createMediaStreamDestination();

                // Add local audio
                if (audioTracks.length > 0) {
                    const localSource = audioContext.createMediaStreamSource(
                        new MediaStream(audioTracks)
                    );
                    localSource.connect(destination);
                }

                // Add remote audio
                if (remoteAudioTracks.length > 0) {
                    const remoteStream = this.config.remoteVideo.srcObject as MediaStream;
                    const remoteSource = audioContext.createMediaStreamSource(
                        new MediaStream(remoteAudioTracks)
                    );
                    remoteSource.connect(destination);
                }

                // Add mixed audio to canvas stream
                destination.stream.getAudioTracks().forEach(track => {
                    canvasStream.addTrack(track);
                });
            } catch (e) {
                debugLog('[VideoCompositor] Audio mixing failed:', e);
            }
        }

        // Create MediaRecorder
        try {
            this.mediaRecorder = new MediaRecorder(canvasStream, {
                mimeType: this.mimeType,
                videoBitsPerSecond: 2500000 // 2.5 Mbps
            });
        } catch (e) {
            // Fallback without mimeType specification
            this.mediaRecorder = new MediaRecorder(canvasStream);
        }

        this.chunkNumber = 0;
        this.chunksUploaded = 0;
        this.startTime = Date.now();

        // Handle chunk data — the uploader assigns dense numbers at
        // processing time and holds pure-init blobs without consuming any,
        // so failures can never open numbering gaps here.
        this.mediaRecorder.ondataavailable = async (event) => {
            if (event.data.size > 0) {
                this.pendingSaves++;
                try {
                    if (this.uploader.enqueue(event.data)) {
                        this.chunkNumber++;
                        debugLog(`[VideoCompositor] Chunk accepted (${event.data.size} bytes)`);
                    }
                } finally {
                    this.pendingSaves--;
                }
            }
        };

        // Start recording with chunk duration
        this.mediaRecorder.start(this.config.chunkDuration);
        this.isRecording = true;

        debugLog('[VideoCompositor] Recording started');
        this.config.onRecordingStarted?.();
    }

    /**
     * Stop recording — drains the final in-flight save, then the upload
     * queue, then finalizes exactly once (via the uploader's idempotent
     * finalize). Resolves only when the last chunk is safely queued for
     * upload, so end-of-stream never loses the tail.
     */
    async stopRecording(): Promise<void> {
        if (!this.isRecording || !this.mediaRecorder) return;

        return new Promise((resolve) => {
            this.mediaRecorder!.onstop = async () => {
                // A lease loss that lands mid-stop must not finalize.
                if (this.aborting) {
                    this.aborting = false;
                    this.isRecording = false;
                    this.uploader.shutdown();
                    debugLog('[VideoCompositor] Recording aborted (no finalize)');
                    this.config.onRecordingStopped?.();
                    resolve();
                    return;
                }
                this.isRecording = false;

                // Wait for the final ondataavailable handler to enqueue.
                while (this.pendingSaves > 0) {
                    await new Promise((r) => setTimeout(r, 50));
                }

                // Drain uploads, then finalize on server (single path).
                await this.uploader.finalize();

                debugLog('[VideoCompositor] Recording stopped');
                this.config.onRecordingStopped?.();
                resolve();
            };

            this.mediaRecorder!.stop();
        });
    }

    /**
     * R4-CHUNK-DOWNLOAD-1 (D): emergency stop WITHOUT finalize. A session
     * fenced out by a takeover must never trigger the merge — the new
     * holder owns it. stopRecording()'s onstop honors `aborting` (shutdown,
     * no finalize); the timeout below bounds a dead recorder.
     */
    private aborting = false;

    async abortRecording(): Promise<void> {
        if (!this.isRecording || !this.mediaRecorder) {
            this.uploader.shutdown();
            return;
        }
        this.aborting = true;
        const stop = this.stopRecording();
        const timeout = new Promise<void>((resolve) => setTimeout(() => {
            this.aborting = false;
            this.isRecording = false;
            this.uploader.shutdown();
            resolve();
        }, 3000));
        await Promise.race([stop, timeout]);
    }

    /**
     * Stop compositing
     */
    stopCompositing(): void {
        this.isCompositing = false;

        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        debugLog('[VideoCompositor] Compositing stopped');
    }

    /**
     * Get recording stats
     */
    getStats(): RecordingStats {
        return {
            chunksRecorded: this.chunkNumber,
            chunksUploaded: this.chunksUploaded,
            totalDuration: this.isRecording ? Date.now() - this.startTime : 0,
            isRecording: this.isRecording
        };
    }

    /**
     * Complete cleanup
     */
    async destroy(): Promise<void> {
        await this.stopRecording();
        this.stopCompositing();
    }
}

export default VideoCompositor;
