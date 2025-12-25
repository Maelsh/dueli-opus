/**
 * Chunk Player Service
 * مشغل القطع - للبث المباشر و VOD
 * 
 * Sequential mode: للبث المباشر (live)
 * MSE mode: للتسجيل (VOD)
 */

export interface ChunkPlayerConfig {
    competitionId: number;
    videoElement: HTMLVideoElement;
    serverUrl?: string;
    mode?: 'live' | 'vod'; // default: live
    onChunkChange?: (index: number, total: number) => void;
    onStatus?: (status: string) => void;
    onError?: (error: Error) => void;
}

interface Playlist {
    competition_id: number;
    status: string;
    chunks: ChunkInfo[];
    total_duration: number;
    extension: string;
}

interface ChunkInfo {
    index: number;
    file: string;
    url: string;
    duration: number;
    size: number;
}

export class ChunkPlayer {
    private config: ChunkPlayerConfig;
    private video: HTMLVideoElement;
    private playlist: Playlist | null = null;
    private currentChunkIndex: number = 0;
    private isPlaying: boolean = false;
    private mediaSource: MediaSource | null = null;
    private sourceBuffer: SourceBuffer | null = null;

    constructor(config: ChunkPlayerConfig) {
        this.config = {
            serverUrl: 'https://maelsh.pro/ffmpeg',
            mode: 'live',
            ...config
        };
        this.video = config.videoElement;
    }

    /**
     * بدء التشغيل
     */
    async start(): Promise<void> {
        try {
            // تحميل playlist
            await this.loadPlaylist();

            if (!this.playlist || this.playlist.chunks.length === 0) {
                throw new Error('No chunks available');
            }

            // اختيار الوضع
            if (this.config.mode === 'vod') {
                await this.startMSEPlayback();
            } else {
                await this.startSequentialPlayback();
            }

            this.isPlaying = true;
        } catch (error) {
            this.config.onError?.(error as Error);
            throw error;
        }
    }

    /**
     * تحميل playlist من السيرفر
     */
    private async loadPlaylist(): Promise<void> {
        const url = `${this.config.serverUrl}/playlist.php?id=${this.config.competitionId}`;
        const res = await fetch(url);

        if (!res.ok) {
            throw new Error('Failed to load playlist');
        }

        this.playlist = await res.json();
        console.log(`[ChunkPlayer] Loaded ${this.playlist!.chunks.length} chunks (${this.playlist!.extension})`);
    }

    /**
     * Sequential Playback - للبث المباشر
     * يشغل chunks واحدة تلو الأخرى
     */
    private async startSequentialPlayback(): Promise<void> {
        this.config.onStatus?.('▶️ جار التشغيل...');
        await this.playNextChunk();
    }

    /**
     * تشغيل القطعة التالية
     */
    private async playNextChunk(): Promise<void> {
        if (!this.playlist) return;

        // تحقق من وجود قطع جديدة
        if (this.currentChunkIndex >= this.playlist.chunks.length) {
            // انتظر قطعة جديدة (للبث المباشر)
            this.config.onStatus?.('⏸️ انتظار قطع جديدة...');
            setTimeout(() => this.checkForNewChunks(), 2000);
            return;
        }

        const chunk = this.playlist.chunks[this.currentChunkIndex];
        this.config.onChunkChange?.(this.currentChunkIndex + 1, this.playlist.chunks.length);

        try {
            // تعيين المصدر
            this.video.src = chunk.url;
            await this.video.play();

            // عند انتهاء القطعة → التالية
            this.video.onended = () => {
                this.currentChunkIndex++;
                this.playNextChunk();
            };

        } catch (error) {
            console.error('[ChunkPlayer] Playback error:', error);
            // إعادة المحاولة بعد ثانية
            setTimeout(() => this.playNextChunk(), 1000);
        }
    }

    /**
     * فحص وجود قطع جديدة (للبث المباشر)
     */
    private async checkForNewChunks(): Promise<void> {
        if (!this.isPlaying) return;

        try {
            await this.loadPlaylist();

            if (this.currentChunkIndex < this.playlist!.chunks.length) {
                // وُجدت قطع جديدة
                this.playNextChunk();
            } else {
                // لا جديد - أعد المحاولة
                setTimeout(() => this.checkForNewChunks(), 2000);
            }
        } catch (error) {
            setTimeout(() => this.checkForNewChunks(), 3000);
        }
    }

    /**
     * MSE Playback - للتسجيل (VOD)
     * يدمج كل chunks سلساً
     */
    private async startMSEPlayback(): Promise<void> {
        if (!this.playlist) return;

        const ext = this.playlist.extension;
        const mimeType = ext === 'mp4'
            ? 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'
            : 'video/webm; codecs="vp8, opus"';

        // تحقق من الدعم
        if (!MediaSource.isTypeSupported(mimeType)) {
            // Fallback إلى sequential
            console.warn('[ChunkPlayer] MSE not supported, using sequential');
            await this.startSequentialPlayback();
            return;
        }

        this.mediaSource = new MediaSource();
        this.video.src = URL.createObjectURL(this.mediaSource);

        this.mediaSource.addEventListener('sourceopen', async () => {
            try {
                this.sourceBuffer = this.mediaSource!.addSourceBuffer(mimeType);
                this.config.onStatus?.('⬇️ جار تحميل القطع...');

                // تحميل كل chunks بالترتيب
                for (let i = 0; i < this.playlist!.chunks.length; i++) {
                    await this.appendChunk(i);
                    this.config.onChunkChange?.(i + 1, this.playlist!.chunks.length);
                }

                this.mediaSource!.endOfStream();
                this.config.onStatus?.('✅ جاهز للتشغيل');
                this.video.play();

            } catch (error) {
                this.config.onError?.(error as Error);
            }
        });
    }

    /**
     * إضافة chunk إلى source buffer
     */
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

            // Wait if buffer is updating
            if (this.sourceBuffer.updating) {
                this.sourceBuffer.addEventListener('updateend', () => {
                    this.appendBufferData(arrayBuffer, resolve, reject);
                }, { once: true });
            } else {
                this.appendBufferData(arrayBuffer, resolve, reject);
            }
        });
    }

    /**
     * إضافة البيانات إلى buffer
     */
    private appendBufferData(
        data: ArrayBuffer,
        resolve: () => void,
        reject: (error: Error) => void
    ): void {
        if (!this.sourceBuffer) {
            reject(new Error('No source buffer'));
            return;
        }

        try {
            this.sourceBuffer.appendBuffer(data);
            this.sourceBuffer.addEventListener('updateend', () => resolve(), { once: true });
            this.sourceBuffer.addEventListener('error', (e) => reject(new Error('Buffer error')), { once: true });
        } catch (error) {
            reject(error as Error);
        }
    }

    /**
     * إيقاف التشغيل
     */
    stop(): void {
        this.isPlaying = false;
        this.video.pause();
        this.video.src = '';

        if (this.mediaSource) {
            if (this.mediaSource.readyState === 'open') {
                this.mediaSource.endOfStream();
            }
            this.mediaSource = null;
        }

        this.sourceBuffer = null;
    }

    /**
     * إعادة تحميل playlist (للتحديث)
     */
    async refresh(): Promise<void> {
        await this.loadPlaylist();
    }
}

export default ChunkPlayer;
