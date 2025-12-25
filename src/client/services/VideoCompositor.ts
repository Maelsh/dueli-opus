/**
 * Video Compositor Service
 * خدمة دمج الفيديو
 * 
 * Merges local and remote video streams on canvas,
 * records chunks, and uploads to server.
 * يدمج بثي الفيديو المحلي والبعيد على Canvas،
 * يسجل قطع ويرفعها للسيرفر.
 */

import { ChunkUploader } from './ChunkUploader';

export interface VideoCompositorConfig {
    competitionId: number;
    localVideo: HTMLVideoElement;
    remoteVideo: HTMLVideoElement;
    canvas?: HTMLCanvasElement;
    chunkDuration?: number; // in milliseconds, default 10000 (10s)
    serverUrl?: string;
    onChunkUploaded?: (chunkNumber: number) => void;
    onRecordingStarted?: () => void;
    onRecordingStopped?: () => void;
    onError?: (error: Error) => void;
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
    private chunkNumber: number = 0;
    private chunksUploaded: number = 0;
    private startTime: number = 0;
    private mimeType: string = '';
    private fileExtension: string = 'webm';

    // Canvas dimensions
    private readonly CANVAS_WIDTH = 1280;
    private readonly CANVAS_HEIGHT = 480;
    private readonly VIDEO_WIDTH = 640;
    private readonly VIDEO_HEIGHT = 480;

    constructor(config: VideoCompositorConfig) {
        this.config = {
            chunkDuration: 5000, // ⭐ 5s بدلاً من 10s (تقليل latency)
            serverUrl: 'https://maelsh.pro/ffmpeg',
            ...config
        };

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
            onError: config.onError
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
                console.log(`[VideoCompositor] Using format: ${this.fileExtension} (${type})`);
                break;
            }
        }

        if (!this.mimeType) {
            this.mimeType = 'video/webm';
            this.fileExtension = 'webm';
            console.warn('[VideoCompositor] No preferred format supported, using default webm');
        }

        // ⭐ تحذير إذا WebM - Safari لن يشغلها
        if (this.fileExtension === 'webm') {
            console.warn('⚠️ Recording in WebM - Safari/iPhone viewers will NOT be able to watch!');
            console.warn('💡 Recommend using Chrome/Edge for hosting to get MP4 format');
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
     * Start compositing (drawing both videos to canvas)
     */
    startCompositing(): void {
        if (this.isCompositing) return;

        this.isCompositing = true;
        this.drawFrame();
        console.log('[VideoCompositor] Compositing started');
    }

    /**
     * Draw both videos side by side on canvas
     */
    private drawFrame(): void {
        if (!this.isCompositing) return;

        // Clear canvas
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.CANVAS_WIDTH, this.CANVAS_HEIGHT);

        // Draw local video (left side)
        if (this.config.localVideo.readyState >= 2) {
            this.drawVideoFit(this.config.localVideo, 0, 0, this.VIDEO_WIDTH, this.VIDEO_HEIGHT);
        } else {
            this.drawPlaceholder(0, 0, this.VIDEO_WIDTH, this.VIDEO_HEIGHT, 'Waiting for camera...');
        }

        // Draw remote video (right side)
        if (this.config.remoteVideo.readyState >= 2) {
            this.drawVideoFit(this.config.remoteVideo, this.VIDEO_WIDTH, 0, this.VIDEO_WIDTH, this.VIDEO_HEIGHT);
        } else {
            this.drawPlaceholder(this.VIDEO_WIDTH, 0, this.VIDEO_WIDTH, this.VIDEO_HEIGHT, 'Waiting for opponent...');
        }

        // Draw separator line
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(this.VIDEO_WIDTH, 0);
        this.ctx.lineTo(this.VIDEO_WIDTH, this.VIDEO_HEIGHT);
        this.ctx.stroke();

        // Continue animation loop
        this.animationFrameId = requestAnimationFrame(() => this.drawFrame());
    }

    /**
     * Draw video maintaining aspect ratio
     */
    private drawVideoFit(
        video: HTMLVideoElement,
        x: number,
        y: number,
        maxWidth: number,
        maxHeight: number
    ): void {
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

        this.ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);
    }

    /**
     * Draw placeholder when video not ready
     */
    private drawPlaceholder(x: number, y: number, width: number, height: number, text: string): void {
        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(x, y, width, height);

        this.ctx.fillStyle = '#666';
        this.ctx.font = '16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(text, x + width / 2, y + height / 2);
    }

    /**
     * Start recording the canvas
     */
    async startRecording(): Promise<void> {
        if (this.isRecording) return;

        // Sync time with server first
        await this.uploader.syncTime();

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
                console.warn('[VideoCompositor] Audio mixing failed:', e);
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

        // Handle chunk data
        this.mediaRecorder.ondataavailable = async (event) => {
            if (event.data.size > 0) {
                this.chunkNumber++;
                console.log(`[VideoCompositor] Chunk ${this.chunkNumber} ready (${event.data.size} bytes)`);
                await this.uploader.uploadChunk(event.data, this.chunkNumber);
            }
        };

        // Start recording with chunk duration
        this.mediaRecorder.start(this.config.chunkDuration);
        this.isRecording = true;

        console.log('[VideoCompositor] Recording started');
        this.config.onRecordingStarted?.();
    }

    /**
     * Stop recording
     */
    async stopRecording(): Promise<void> {
        if (!this.isRecording || !this.mediaRecorder) return;

        return new Promise((resolve) => {
            this.mediaRecorder!.onstop = async () => {
                this.isRecording = false;

                // Finalize on server
                await this.uploader.finalize();

                console.log('[VideoCompositor] Recording stopped');
                this.config.onRecordingStopped?.();
                resolve();
            };

            this.mediaRecorder!.stop();
        });
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

        console.log('[VideoCompositor] Compositing stopped');
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
