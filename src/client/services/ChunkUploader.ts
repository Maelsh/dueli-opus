/**
 * Chunk Uploader Service
 * خدمة رفع القطع
 *
 * Host-only: uploads recorded video chunks to the shared ffmpeg server.
 * يتعامل مع رفع قطع الفيديو للسيرفر المشترك (المضيف فقط)
 *
 * R4-CHUNK-PLAY-1:
 *  - numbering resumes AFTER the highest saved server index (playlist base),
 *    so a host gap/refresh appends without overwriting previous chunks;
 *  - the queue is BOUNDED (proven UploadQueue pattern): overflow drops the
 *    oldest with an explicit counter, never unbounded memory;
 *  - numbering advances only on success and retries reuse the SAME number
 *    (idempotent overwrite), so failures can never open numbering gaps;
 *  - finalize() runs once per session (cached result on repeat — the page
 *    must not call finalize.php directly anymore).
 */

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

interface PlaylistEntry {
    index?: number;
    chunk_number?: number;
    url?: string;
    [key: string]: unknown;
}

interface QueuedChunk {
    blob: Blob;
    number: number;
    attempts: number;
}

export interface ChunkUploaderConfig {
    competitionId: number;
    serverUrl: string;
    onChunkUploaded?: (chunkNumber: number) => void;
    onError?: (error: Error) => void;
}

export interface ChunkUploadStats {
    uploaded: number;
    pending: number;
    dropped: number;
    failed: number;
    nextNumber: number;
}

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

import { findInitEnd } from '../../lib/services/ChunkInitSegment';

export class ChunkUploader {
    private config: ChunkUploaderConfig;
    private serverTimestamp: number = 0;
    private startTimestamp: number = 0;
    private extension: string = 'webm';
    private queue: QueuedChunk[] = [];
    private pumping = false;
    private nextNumber = 1;
    private uploadedCount = 0;
    private droppedChunks = 0;
    private failedChunks = 0;
    private finalized = false;
    private finalizeResult = false;
    /**
     * Init bytes prepended to every fragment so each stored chunk decodes
     * standalone (see ChunkInitSegment). Sourced from the first local blob
     * (fresh session) or the platform init route (resume).
     */
    private initSegment: { format: string; bytes: Uint8Array } | null = null;
    private formatWarned = false;

    /** Max queued chunks (proven bound); overflow drops the oldest, counted. */
    private readonly maxQueue: number;
    /** Upload attempts per chunk (same number retried — idempotent). */
    private readonly maxAttempts: number;

    constructor(config: ChunkUploaderConfig, options?: { maxQueue?: number; maxAttempts?: number }) {
        this.config = config;
        this.maxQueue = options?.maxQueue ?? 3;
        this.maxAttempts = options?.maxAttempts ?? 3;
    }

    /**
     * Set file extension (webm or mp4)
     */
    setExtension(ext: string): void {
        this.extension = ext;
    }

    /**
     * Resolve the resume base from the server playlist: new chunks are
     * numbered AFTER the highest saved index, so a host gap or page refresh
     * appends without overwriting previous chunks. Fail-open (base 0 with a
     * warning) — an unreachable playlist must not block recording.
     */
    async initialize(): Promise<void> {
        this.nextNumber = 1;
        this.finalized = false;
        this.finalizeResult = false;
        this.initSegment = null;
        this.formatWarned = false;
        try {
            const res = await fetch(`/api/chunks/playlist/${this.config.competitionId}`);
            if (!res.ok) {
                debugLog('[ChunkUploader] Playlist unavailable, numbering from 1');
                return;
            }
            const data = await res.json() as { chunks?: PlaylistEntry[] } | null;
            let top = 0;
            const entries = data && Array.isArray(data.chunks) ? data.chunks : [];
            for (const entry of entries) {
                const n = typeof entry?.index === 'number' && Number.isFinite(entry.index)
                    ? Math.floor(entry.index) + 1
                    : typeof entry?.chunk_number === 'number' && Number.isFinite(entry.chunk_number)
                        ? Math.floor(entry.chunk_number)
                        : 0;
                if (n > top) top = n;
            }
            this.nextNumber = top + 1;
            debugLog(`[ChunkUploader] Resume base: server has ${top} chunk(s), next is ${this.nextNumber}`);
            if (top > 0) {
                await this.loadServerInit();
            }
        } catch (error) {
            debugLog('[ChunkUploader] Resume lookup failed, numbering from 1');
        }
    }

    /**
     * Load the recording init segment for a resume (fail-open: without it
     * the session still records, fragments upload raw, and the audience
     * skips undecodable chunks).
     */
    private async loadServerInit(): Promise<void> {
        try {
            const res = await fetch(`/api/chunks/init/${this.config.competitionId}`);
            if (!res.ok) return;
            const data = await res.json() as {
                success?: boolean; format?: string; init?: string;
            } | null;
            if (!data || !data.success || typeof data.init !== 'string' || !data.format) return;
            if (data.format !== this.extension) {
                debugLog(`[ChunkUploader] Server init is .${data.format}, local is .${this.extension} — prepending disabled`);
                return;
            }
            const binary = atob(data.init);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            this.initSegment = { format: data.format, bytes };
            debugLog(`[ChunkUploader] Server init loaded (${bytes.length} bytes)`);
        } catch {
            debugLog('[ChunkUploader] Server init unavailable — fragments upload raw');
        }
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
            debugLog(`[ChunkUploader] Time synced. Server: ${this.serverTimestamp}, Local: ${this.startTimestamp}`);
        } catch (error) {
            debugLog('[ChunkUploader] Time sync failed, using local time');
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
     * Enqueue a chunk for upload. Numbers are assigned LAZILY when processing
     * starts (see pump): a pure-init first blob is held as the init source
     * WITHOUT consuming a number, so numbering stays dense from the first
     * real media chunk. Returns true when accepted, false when validation
     * rejects the blob.
     */
    enqueue(blob: Blob): boolean {
        if (!blob || blob.size < 1024) {
            this.failedChunks++;
            debugLog('[ChunkUploader] Rejected chunk (<1KB, likely empty recorder flush)');
            return false;
        }
        if (blob.size > 50 * 1024 * 1024) {
            this.failedChunks++;
            debugLog('[ChunkUploader] Rejected chunk (>50MB)');
            return false;
        }
        this.queue.push({ blob, number: -1, attempts: 0 });
        // Trim AFTER push: the bound counts waiting items, so a burst that
        // arrives while one upload is in flight keeps the newest maxQueue.
        const waiting = () => this.queue.length - (this.pumping ? 1 : 0);
        while (waiting() > this.maxQueue) {
            const victim = this.pumping ? 1 : 0;
            this.queue.splice(victim, 1);
            this.droppedChunks++;
            debugLog(`[ChunkUploader] Queue full — dropped chunk (total dropped: ${this.droppedChunks})`);
        }
        void this.pump();
        return true;
    }

    private async pump(): Promise<void> {
        if (this.pumping) return;
        this.pumping = true;
        try {
            while (this.queue.length > 0) {
                const item = this.queue[0];
                item.attempts++;
                try {
                    const payload = await this.preparePayload(item.blob);
                    if (payload === null) {
                        // Pure-init first blob held as the init source: no
                        // number consumed, no failure counted — numbering
                        // stays dense from the first media chunk.
                        this.queue.shift();
                        debugLog('[ChunkUploader] Holding first blob as init source (not uploaded)');
                        continue;
                    }
                    // Number is assigned at processing time (after any hold),
                    // and a failed chunk retries with the SAME number
                    // (idempotent server overwrite) — dense, no gaps.
                    if (item.number < 0) item.number = this.nextNumber++;
                    await this.doUpload(payload, item.number);
                    this.queue.shift();
                    this.uploadedCount++;
                    this.config.onChunkUploaded?.(item.number);
                } catch (error) {
                    if (item.attempts >= this.maxAttempts) {
                        this.queue.shift();
                        this.failedChunks++;
                        console.error(`[ChunkUploader] Dropping chunk ${item.number} after ${item.attempts} attempts:`, error);
                        this.config.onError?.(error as Error);
                        // Numbering stays dense by construction (assigned at
                        // enqueue); a dropped slot is an explicit, counted
                        // gap visible in the playlist — never a silent skip.
                    } else {
                        const backoff = 500 * item.attempts;
                        await new Promise((r) => setTimeout(r, backoff));
                    }
                }
            }
        } finally {
            this.pumping = false;
        }
    }

    /**
     * Build uploadable bytes for a queued blob: the first local blob yields
     * the session init (pure-init blobs are held, self-contained first blobs
     * upload whole); every later fragment gets init prepended so each stored
     * chunk decodes standalone. Returns null ONLY for a held pure-init blob.
     */
    private async preparePayload(blob: Blob): Promise<Blob | null> {
        const buf = new Uint8Array(await blob.arrayBuffer());
        if (buf.length === 0) throw new Error('empty chunk');
        if (!this.initSegment) {
            const cut = findInitEnd(buf, this.extension);
            if (cut === -1) {
                this.initSegment = { format: this.extension, bytes: buf };
                return null;
            }
            this.initSegment = { format: this.extension, bytes: buf.subarray(0, cut) };
            return blob;
        }
        if (this.initSegment.format !== this.extension) {
            if (!this.formatWarned) {
                this.formatWarned = true;
                debugLog('[ChunkUploader] Init format mismatch — uploading raw fragments');
            }
            return blob;
        }
        const combined = new Uint8Array(this.initSegment.bytes.length + buf.length);
        combined.set(this.initSegment.bytes, 0);
        combined.set(buf, this.initSegment.bytes.length);
        return new Blob([combined as BlobPart], { type: blob.type || (this.extension === 'mp4' ? 'video/mp4' : 'video/webm') });
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
                debugLog(`[ChunkUploader] Chunk ${chunkNumber} uploaded successfully`);
            } else {
                throw new Error(result.error || 'Upload failed');
            }
        } catch (error) {
            console.error(`[ChunkUploader] Failed to upload chunk ${chunkNumber}:`, error);
            throw error;
        }
    }

    /**
     * Wait for all pending uploads to complete (queue drained AND no worker
     * in flight — safe to call before finalize/stop).
     */
    async waitForUploads(): Promise<void> {
        while (this.queue.length > 0 || this.pumping) {
            await Promise.allSettled([new Promise((r) => setTimeout(r, 100))]);
            // Give a scheduled-but-waiting pump a chance to start.
            if (this.queue.length > 0 && !this.pumping) {
                await this.pump();
            }
        }
    }

    /**
     * Notify server that streaming is complete and trigger finalization.
     * Runs ONCE per session: repeats return the cached result instead of
     * sending finalize.php again (the page must not call finalize.php
     * directly anymore — single path, idempotent).
     */
    async finalize(force = false): Promise<boolean> {
        if (this.finalized && !force) {
            return this.finalizeResult;
        }
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
            debugLog('[ChunkUploader] Finalization triggered:', result);
            this.finalized = true;
            this.finalizeResult = result.success === true;
            return this.finalizeResult;
        } catch (error) {
            console.error('[ChunkUploader] Failed to finalize:', error);
            this.config.onError?.(error as Error);
            return false;
        }
    }

    /**
     * Get upload stats (all counters explicit — no unobservable state).
     */
    getStats(): ChunkUploadStats {
        return {
            uploaded: this.uploadedCount,
            pending: this.queue.length,
            dropped: this.droppedChunks,
            failed: this.failedChunks,
            nextNumber: this.nextNumber
        };
    }
}

export default ChunkUploader;
