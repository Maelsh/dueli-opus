/**
 * Chunk Uploader Service
 * خدمة رفع القطع
 * 
 * Handles uploading video chunks to shared server
 * يتعامل مع رفع قطع الفيديو للسيرفر المشترك
 */

export interface ChunkUploaderConfig {
    competitionId: number;
    serverUrl: string;
    onChunkUploaded?: (chunkNumber: number) => void;
    onError?: (error: Error) => void;
}

// API Response types
interface TimeResponse {
    timestamp?: number;
}

interface UploadResponse {
    success: boolean;
    error?: string;
    chunk?: string;
}

interface FinalizeResponse {
    success: boolean;
    error?: string;
    video_url?: string;
}

export class ChunkUploader {
    private config: ChunkUploaderConfig;
    private serverTimestamp: number = 0;
    private startTimestamp: number = 0;
    private extension: string = 'webm';
    private uploadQueue: Promise<void>[] = [];

    constructor(config: ChunkUploaderConfig) {
        this.config = config;
    }

    /**
     * Set file extension (webm or mp4)
     */
    setExtension(ext: string): void {
        this.extension = ext;
    }

    /**
     * Sync time with server for timestamp alignment
     */
    async syncTime(): Promise<void> {
        try {
            // Get server time
            const response = await fetch(`${this.config.serverUrl}/time.php`);
            const data: TimeResponse = await response.json();

            if (data.timestamp) {
                this.serverTimestamp = data.timestamp;
            } else {
                // Fallback: use response time
                this.serverTimestamp = Date.now();
            }

            this.startTimestamp = Date.now();
            console.log(`[ChunkUploader] Time synced. Server: ${this.serverTimestamp}, Local: ${this.startTimestamp}`);
        } catch (error) {
            console.warn('[ChunkUploader] Time sync failed, using local time');
            this.serverTimestamp = Date.now();
            this.startTimestamp = Date.now();
        }
    }

    /**
     * Get time offset (for video sync during merge)
     */
    getOffset(): number {
        return this.startTimestamp - this.serverTimestamp;
    }

    /**
     * Upload a chunk to the server
     */
    async uploadChunk(blob: Blob, chunkNumber: number): Promise<boolean> {
        const uploadPromise = this.doUpload(blob, chunkNumber);
        this.uploadQueue.push(uploadPromise);

        try {
            await uploadPromise;
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Perform the actual upload
     */
    private async doUpload(blob: Blob, chunkNumber: number): Promise<void> {
        const formData = new FormData();

        // Create filename with correct extension
        const filename = `chunk_${String(chunkNumber).padStart(4, '0')}.${this.extension}`;
        formData.append('chunk', blob, filename);
        formData.append('competition_id', this.config.competitionId.toString());
        formData.append('chunk_number', chunkNumber.toString());
        formData.append('extension', this.extension);
        formData.append('offset', this.getOffset().toString());

        try {
            const response = await fetch(`${this.config.serverUrl}/upload.php`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.status}`);
            }

            const result: UploadResponse = await response.json();

            if (result.success) {
                console.log(`[ChunkUploader] Chunk ${chunkNumber} uploaded successfully`);
                this.config.onChunkUploaded?.(chunkNumber);
            } else {
                throw new Error(result.error || 'Upload failed');
            }
        } catch (error) {
            console.error(`[ChunkUploader] Failed to upload chunk ${chunkNumber}:`, error);
            this.config.onError?.(error as Error);
            throw error;
        }
    }

    /**
     * Wait for all pending uploads to complete
     */
    async waitForUploads(): Promise<void> {
        await Promise.allSettled(this.uploadQueue);
        this.uploadQueue = [];
    }

    /**
     * Notify server that streaming is complete and trigger finalization
     */
    async finalize(): Promise<boolean> {
        // Wait for pending uploads
        await this.waitForUploads();

        try {
            const response = await fetch(`${this.config.serverUrl}/finalize.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    competition_id: this.config.competitionId,
                    extension: this.extension
                })
            });

            if (!response.ok) {
                throw new Error(`Finalize failed: ${response.status}`);
            }

            const result: FinalizeResponse = await response.json();
            console.log('[ChunkUploader] Finalization triggered:', result);
            return result.success === true;
        } catch (error) {
            console.error('[ChunkUploader] Failed to finalize:', error);
            this.config.onError?.(error as Error);
            return false;
        }
    }

    /**
     * Get upload stats
     */
    getStats(): { uploaded: number; pending: number } {
        return {
            uploaded: this.uploadQueue.filter(p => p).length,
            pending: this.uploadQueue.length
        };
    }
}

export default ChunkUploader;
