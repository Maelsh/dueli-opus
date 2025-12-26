/**
 * Test Stream Core Module
 * العقل - كل المنطق المشترك
 */

// ===== Types & State Machine =====

export type PlayerState =
    | 'idle'
    | 'waiting'
    | 'playing'
    | 'preloading'
    | 'switching'
    | 'ended'
    | 'error';

export interface ChunkInfo {
    index: number;
    filename: string;
    url: string;
    duration?: number;
    size?: number;
}

export interface PlaylistData {
    competition_id: string;
    mode: 'sequential-mp4' | 'sequential-webm';
    extension: 'mp4' | 'webm';
    chunk_duration: number;
    chunks: ChunkInfo[];
    status: 'live' | 'finished';
}

// ===== Utilities =====

export function log(msg: string, type: 'info' | 'success' | 'warn' | 'error' = 'info'): void {
    const logEl = document.getElementById('log');
    if (!logEl) return;

    const time = new Date().toLocaleTimeString();
    const div = document.createElement('div');
    div.className = `log-entry log-${type}`;
    div.textContent = `[${time}] ${msg}`;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;

    // Keep only last 100 entries
    while (logEl.children.length > 100) {
        if (logEl.firstChild) {
            logEl.removeChild(logEl.firstChild);
        }
    }
}

export function updateStatus(text: string, color: string): void {
    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.innerHTML = `<span class="text-${color}-400"><i class="fas fa-circle mr-2"></i>${text}</span>`;
    }
}

export function setMode(mode: string, text?: string): void {
    const modeBadge = document.getElementById('modeBadge');
    if (!modeBadge) return;

    modeBadge.classList.remove('hidden', 'mode-hls', 'mode-mse', 'mode-vod');

    if (mode === 'hls') {
        modeBadge.classList.add('mode-hls', 'pulse');
        modeBadge.innerHTML = '<i class="fas fa-broadcast-tower mr-1"></i>HLS';
    } else if (mode === 'mse') {
        modeBadge.classList.add('mode-mse', 'pulse');
        modeBadge.innerHTML = '<i class="fas fa-puzzle-piece mr-1"></i>MSE';
    } else if (mode === 'vod') {
        modeBadge.classList.add('mode-vod');
        modeBadge.innerHTML = '<i class="fas fa-film mr-1"></i>VOD';
    } else {
        modeBadge.classList.add('hidden');
    }
}

// ===== ChunkManager Class =====

export class ChunkManager {
    currentIndex: number = 0;
    private misses: number = 0;
    private basePath: string;
    private extension: 'mp4' | 'webm';
    private competitionId: string;

    constructor(competitionId: string, extension: 'mp4' | 'webm' = 'webm') {
        this.competitionId = competitionId;
        this.extension = extension;
        this.basePath = `https://maelsh.pro/ffmpeg/stream.php?path=live/match_${competitionId}`;
    }

    getUrl(index: number): string {
        const chunkNumber = index + 1; // Files start at 0001
        const paddedIndex = String(chunkNumber).padStart(4, '0');
        return `${this.basePath}/chunk_${paddedIndex}.${this.extension}`;
    }

    async exists(index: number): Promise<boolean> {
        try {
            const url = this.getUrl(index);
            const res = await fetch(url, { method: 'HEAD' });
            return res.ok;
        } catch {
            return false;
        }
    }

    async waitForNextChunk(): Promise<string> {
        const targetIndex = this.currentIndex + 1;

        while (true) {
            const exists = await this.exists(targetIndex);

            if (exists) {
                this.misses = 0;
                return this.getUrl(targetIndex);
            }

            this.misses++;

            // Adaptive polling delay
            const delay = Math.min(3000, 1000 + this.misses * 500);

            // Too many misses = stream might have ended
            if (this.misses > 10) {
                throw new Error('Stream appears to have ended');
            }

            await this.delay(delay);
        }
    }

    async loadPlaylist(): Promise<PlaylistData> {
        const url = `https://maelsh.pro/ffmpeg/playlist.php?id=${this.competitionId}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to load playlist');
        return await res.json();
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ===== LiveSequentialPlayer Class =====

export class LiveSequentialPlayer {
    private state: PlayerState = 'idle';
    private videoPlayers: HTMLVideoElement[];
    private activePlayerIndex: number = 0;
    private chunkManager: ChunkManager;
    private onChunkChange?: (index: number, total: number) => void;
    private onStatus?: (status: string) => void;
    private onError?: (error: Error) => void;

    constructor(config: {
        videoPlayers: HTMLVideoElement[];
        chunkManager: ChunkManager;
        onChunkChange?: (index: number, total: number) => void;
        onStatus?: (status: string) => void;
        onError?: (error: Error) => void;
    }) {
        this.videoPlayers = config.videoPlayers;
        this.chunkManager = config.chunkManager;
        this.onChunkChange = config.onChunkChange;
        this.onStatus = config.onStatus;
        this.onError = config.onError;
    }

    async start(): Promise<void> {
        this.state = 'playing';
        await this.playNextChunk();
    }

    private async playNextChunk(): Promise<void> {
        if (this.state !== 'playing' && this.state !== 'switching') return;

        const currentPlayer = this.videoPlayers[this.activePlayerIndex];
        const nextPlayerIndex = (this.activePlayerIndex + 1) % 2;
        const nextPlayer = this.videoPlayers[nextPlayerIndex];

        try {
            // Preload next chunk in background
            this.state = 'preloading';
            const nextChunkUrl = await this.chunkManager.waitForNextChunk();
            nextPlayer.src = nextChunkUrl;
            await nextPlayer.load();

            // Play current chunk
            this.state = 'playing';
            const currentChunkUrl = this.chunkManager.getUrl(this.chunkManager.currentIndex);
            currentPlayer.src = currentChunkUrl;
            await currentPlayer.play();

            this.onChunkChange?.(this.chunkManager.currentIndex + 1, -1);

            // Switch BEFORE end using timeupdate
            currentPlayer.ontimeupdate = () => {
                const remaining = currentPlayer.duration - currentPlayer.currentTime;
                if (remaining < 0.6 && remaining > 0 && nextPlayer.readyState >= 3 && this.state === 'playing') {
                    this.switchPlayers();
                }
            };

            // Fallback to onended
            currentPlayer.onended = () => {
                if (this.state === 'playing') {
                    this.switchPlayers();
                }
            };

        } catch (error) {
            log('خطأ في التشغيل: ' + (error as Error).message, 'error');
            this.onError?.(error as Error);

            if (this.state === 'playing' || this.state === 'preloading' || this.state === 'switching') {
                // Retry after delay
                await this.delay(2000);
                this.playNextChunk();
            }
        }
    }

    private switchPlayers(): void {
        if (this.state !== 'playing') return;

        this.state = 'switching';

        const current = this.videoPlayers[this.activePlayerIndex];
        const nextIndex = (this.activePlayerIndex + 1) % 2;
        const next = this.videoPlayers[nextIndex];

        // Visual transition
        current.style.opacity = '0';
        current.style.zIndex = '1';
        next.style.opacity = '1';
        next.style.zIndex = '2';
        next.play();

        // Update indices
        this.activePlayerIndex = nextIndex;
        this.chunkManager.currentIndex++;

        this.state = 'playing';

        // Continue to next chunk
        this.playNextChunk();
    }

    stop(): void {
        this.state = 'ended';
        this.videoPlayers.forEach(v => {
            v.pause();
            v.src = '';
        });
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ===== VodMsePlayer Class =====

export class VodMsePlayer {
    private video: HTMLVideoElement;
    private mediaSource: MediaSource | null = null;
    private sourceBuffer: SourceBuffer | null = null;
    private playlist: PlaylistData | null = null;
    private chunkManager: ChunkManager;
    private onProgress?: (current: number, total: number) => void;

    constructor(config: {
        videoElement: HTMLVideoElement;
        chunkManager: ChunkManager;
        onProgress?: (current: number, total: number) => void;
    }) {
        this.video = config.videoElement;
        this.chunkManager = config.chunkManager;
        this.onProgress = config.onProgress;
    }

    async start(): Promise<void> {
        this.playlist = await this.chunkManager.loadPlaylist();

        if (!this.playlist || this.playlist.chunks.length === 0) {
            throw new Error('No chunks available');
        }

        const ext = this.playlist.extension;
        const mimeType = ext === 'mp4'
            ? 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'
            : 'video/webm; codecs="vp8, opus"';

        if (!MediaSource.isTypeSupported(mimeType)) {
            throw new Error('MSE not supported for ' + ext);
        }

        this.mediaSource = new MediaSource();
        this.video.src = URL.createObjectURL(this.mediaSource);

        return new Promise((resolve, reject) => {
            this.mediaSource!.addEventListener('sourceopen', async () => {
                try {
                    this.sourceBuffer = this.mediaSource!.addSourceBuffer(mimeType);

                    for (let i = 0; i < this.playlist!.chunks.length; i++) {
                        await this.appendChunk(i);
                        this.onProgress?.(i + 1, this.playlist!.chunks.length);
                    }

                    this.mediaSource!.endOfStream();
                    this.video.play();
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    private async appendChunk(index: number): Promise<void> {
        if (!this.sourceBuffer || !this.playlist) return;

        const chunk = this.playlist.chunks[index];
        const res = await fetch(chunk.url);
        const arrayBuffer = await res.arrayBuffer();

        return new Promise((resolve, reject) => {
            if (!this.sourceBuffer) {
                reject(new Error('No source buffer'));
                return;
            }

            const doAppend = () => {
                try {
                    this.sourceBuffer!.appendBuffer(arrayBuffer);
                    this.sourceBuffer!.addEventListener('updateend', () => resolve(), { once: true });
                    this.sourceBuffer!.addEventListener('error', () => reject(new Error('Buffer error')), { once: true });
                } catch (error) {
                    reject(error);
                }
            };

            if (this.sourceBuffer.updating) {
                this.sourceBuffer.addEventListener('updateend', doAppend, { once: true });
            } else {
                doAppend();
            }
        });
    }

    stop(): void {
        this.video.pause();
        this.video.src = '';

        if (this.mediaSource && this.mediaSource.readyState === 'open') {
            this.mediaSource.endOfStream();
        }

        this.mediaSource = null;
        this.sourceBuffer = null;
    }
}

// ===== Canvas Helpers =====

export function drawVideoProportional(
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    x: number,
    y: number,
    maxWidth: number,
    maxHeight: number,
    label: string
): void {
    if (!video || video.readyState < 2 || video.videoWidth === 0) return;

    const videoRatio = video.videoWidth / video.videoHeight;
    const targetRatio = maxWidth / maxHeight;
    let drawW: number, drawH: number;

    if (videoRatio > targetRatio) {
        drawW = maxWidth;
        drawH = maxWidth / videoRatio;
    } else {
        drawH = maxHeight;
        drawW = maxHeight * videoRatio;
    }

    const offsetX = x + (maxWidth - drawW) / 2;
    const offsetY = y + (maxHeight - drawH) / 2;

    // Background
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y, maxWidth, maxHeight);

    // Video
    ctx.drawImage(video, offsetX, offsetY, drawW, drawH);

    // Border
    ctx.strokeStyle = '#4f46e5';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, maxWidth, maxHeight);

    // Label
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(x + 10, y + maxHeight - 35, 80, 25);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(label, x + 20, y + maxHeight - 15);
}

// ===== Upload Queue =====

export class UploadQueue {
    private queue: Array<{ blob: Blob; index: number }> = [];
    private isUploading: boolean = false;
    private competitionId: string;
    private onProgress?: (uploaded: number, total: number) => void;

    constructor(competitionId: string, onProgress?: (uploaded: number, total: number) => void) {
        this.competitionId = competitionId;
        this.onProgress = onProgress;
    }

    add(blob: Blob, index: number): void {
        this.queue.push({ blob, index });
        this.processQueue();
    }

    private async processQueue(): Promise<void> {
        if (this.isUploading || this.queue.length === 0) return;

        this.isUploading = true;
        const { blob, index } = this.queue.shift()!;

        try {
            await this.uploadChunk(blob, index);
            this.onProgress?.(index + 1, -1);
        } catch (error) {
            log('Upload error: ' + (error as Error).message, 'error');
        } finally {
            this.isUploading = false;
            this.processQueue();
        }
    }

    private async uploadChunk(blob: Blob, index: number): Promise<void> {
        const formData = new FormData();
        formData.append('competition_id', this.competitionId);
        formData.append('chunk_number', String(index + 1));
        formData.append('chunk', blob);

        const res = await fetch('https://maelsh.pro/ffmpeg/upload.php', {
            method: 'POST',
            body: formData
        });

        if (!res.ok) throw new Error('Upload failed');
    }

    async waitForCompletion(): Promise<void> {
        while (this.queue.length > 0 || this.isUploading) {
            await this.delay(100);
        }
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
