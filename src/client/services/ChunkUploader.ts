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
    /**
     * R4-RELEASE-RECOVERY-C (ROW28 cutover): server-backed exclusive recorder
     * ownership. When absent the uploader works exactly as before (lease off).
     * When present, start claims first and refuses on a held lease; a
     * mid-recording loss stops the recorder WITHOUT finalizing; finalize is
     * refused after a loss. Issuance/verification/receipts are enforced
     * platform-side regardless of client.
     */
    lease?: RecordingLeaseHandle;
    /** Fired once when this session loses the lease (takeover/release). */
    onLeaseLost?: (info: { generation: number }) => void;
    /** Heartbeat period while holding the lease (default 10000ms). */
    heartbeatIntervalMs?: number;
}

/**
 * Server-backed exclusive recorder ownership (lease/fencing) handle.
 * Implemented by PlatformRecordingLease below (platform fetch contract);
 * tests inject fakes. Only the session whose (holder, generation) matches
 * the server row may record/upload.
 */
export interface RecordingLeaseHandle {
    /** Opaque per-tab holder label (server hashes it; never a secret). */
    holderNonce?: string;
    acquire(): Promise<
        | { ok: true; generation: number; took_over: boolean }
        | { ok: false; reason: 'held' | 'unavailable' | 'error'; generation?: number; expires_in_seconds?: number }
    >;
    heartbeat(generation: number): Promise<{ held: boolean; generation: number }>;
    release(): Promise<void>;
}

/**
 * Platform lease client: POST /api/chunks/lease/{acquire,heartbeat,release}.
 * Identity = server-hashed (session credential + per-tab holder_nonce).
 * The nonce lives in sessionStorage: per TAB (a second tab is a different
 * holder) and surviving reload (a reload resumes as the SAME holder).
 */
export class PlatformRecordingLease implements RecordingLeaseHandle {
    holderNonce: string;
    private readonly competitionId: number;

    constructor(competitionId: number) {
        this.competitionId = competitionId;
        this.holderNonce = PlatformRecordingLease.tabNonce();
    }

    private static tabNonce(): string {
        try {
            const k = 'dueli_lease_nonce';
            const s = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(k) : null;
            if (s && /^[0-9a-f]{16,64}$/.test(s)) return s;
            const bytes = new Uint8Array(16);
            crypto.getRandomValues(bytes);
            const n = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
            try { sessionStorage?.setItem(k, n); } catch { /* storage unavailable */ }
            return n;
        } catch {
            const bytes = new Uint8Array(16);
            crypto.getRandomValues(bytes);
            return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
        }
    }

    private headers(): Record<string, string> {
        const h: Record<string, string> = { 'Content-Type': 'application/json' };
        try {
            const sess = (typeof window !== 'undefined' && (window as unknown as { sessionId?: string }).sessionId)
                || (typeof localStorage !== 'undefined' && localStorage.getItem('sessionId'));
            if (sess) h['Authorization'] = 'Bearer ' + sess;
        } catch { /* storage unavailable — server will 401 */ }
        return h;
    }

    async acquire(): Promise<Awaited<ReturnType<RecordingLeaseHandle['acquire']>>> {
        try {
            const res = await fetch('/api/chunks/lease/acquire', {
                method: 'POST',
                headers: this.headers(),
                body: JSON.stringify({ competition_id: this.competitionId, holder_nonce: this.holderNonce }),
            });
            const data = await res.json().catch(() => ({})) as {
                success?: boolean; error?: string; data?: { generation?: number; took_over?: boolean; expires_in_seconds?: number };
            };
            if (res.ok && data?.success) {
                return { ok: true, generation: data.data?.generation ?? 1, took_over: data.data?.took_over === true };
            }
            if (res.status === 503) return { ok: false, reason: 'unavailable' };
            if (res.status === 409) {
                return { ok: false, reason: 'held', generation: data?.data?.generation, expires_in_seconds: data?.data?.expires_in_seconds };
            }
            return { ok: false, reason: 'error' };
        } catch {
            return { ok: false, reason: 'error' };
        }
    }

    async heartbeat(generation: number): Promise<{ held: boolean; generation: number }> {
        try {
            const res = await fetch('/api/chunks/lease/heartbeat', {
                method: 'POST',
                headers: this.headers(),
                body: JSON.stringify({ competition_id: this.competitionId, holder_nonce: this.holderNonce, generation }),
            });
            const data = await res.json().catch(() => ({})) as {
                success?: boolean; data?: { held?: boolean; generation?: number };
            };
            if (res.ok && data?.success) {
                return { held: data.data?.held === true, generation: data.data?.generation ?? generation };
            }
            return { held: false, generation };
        } catch {
            return { held: false, generation };
        }
    }

    async release(): Promise<void> {
        try {
            await fetch('/api/chunks/lease/release', {
                method: 'POST',
                headers: this.headers(),
                body: JSON.stringify({ competition_id: this.competitionId, holder_nonce: this.holderNonce }),
            });
        } catch { /* best-effort — /end also releases server-side */ }
    }
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
     * R4-RELEASE-RECOVERY-C: lease lifecycle (acquire → heartbeat →
     * expiry/takeover → reconnect → release). No-op when no lease handle is
     * configured (lease off — pre-cutover behavior unchanged).
     */
    private leaseGeneration = 0;
    private leaseActive = false;
    private leaseMode: 'off' | 'enforced' = 'off';
    private leaseTimer: ReturnType<typeof setInterval> | null = null;
    private leaseLostFired = false;

    /** Claim the recorder lease before recording. Returns false when held. */
    async acquireLease(): Promise<boolean> {
        const handle = this.config.lease;
        if (!handle) return true;
        this.leaseMode = 'enforced';
        const r = await handle.acquire();
        if (r.ok) {
            this.leaseGeneration = r.generation;
            this.leaseActive = true;
            this.leaseLostFired = false;
            this.startHeartbeat();
            return true;
        }
        this.leaseActive = false;
        return false;
    }

    private startHeartbeat(): void {
        this.stopHeartbeat();
        const period = this.config.heartbeatIntervalMs ?? 10000;
        this.leaseTimer = setInterval(() => { void this.beatLease(); }, period);
    }

    private stopHeartbeat(): void {
        if (this.leaseTimer !== null) {
            clearInterval(this.leaseTimer);
            this.leaseTimer = null;
        }
    }

    /** One heartbeat tick: a lost lease stops uploads and fires onLeaseLost. */
    async beatLease(): Promise<boolean> {
        const handle = this.config.lease;
        if (!handle || this.leaseMode !== 'enforced' || !this.leaseActive) return this.leaseActive;
        const r = await handle.heartbeat(this.leaseGeneration);
        if (!r.held) {
            this.leaseActive = false;
            this.stopHeartbeat();
            this.queue.length = 0;
            if (!this.leaseLostFired) {
                this.leaseLostFired = true;
                this.config.onLeaseLost?.({ generation: r.generation });
            }
            return false;
        }
        this.leaseGeneration = r.generation;
        return true;
    }

    /** Reconnect path: reacquire after expiry/takeover (generation fences). */
    async reacquireLease(): Promise<boolean> {
        const handle = this.config.lease;
        if (!handle) return true;
        return this.acquireLease();
    }

    /** Voluntary handover (clean stop / end). Best-effort. */
    async releaseLease(): Promise<void> {
        this.stopHeartbeat();
        this.leaseActive = false;
        try { await this.config.lease?.release(); } catch { /* best-effort */ }
    }

    getLeaseState(): { mode: 'off' | 'enforced'; active: boolean; generation: number } {
        return { mode: this.leaseMode, active: this.leaseActive, generation: this.leaseGeneration };
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
     * R4-CHUNK-UPLOAD-SAFE-1: fetch a bound upload key for one chunk.
     * Fail-closed: any issuance failure (no lease, stale generation,
     * store down, network) throws — the chunk is NEVER uploaded keyless.
     * The key binds (competition, sequence, lease generation, object
     * identity, byte ceiling); the external host verifies + consumes it.
     */
    private async fetchChunkKey(chunkNumber: number): Promise<string> {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        try {
            const sess = (typeof window !== 'undefined' && (window as unknown as { sessionId?: string }).sessionId)
                || (typeof localStorage !== 'undefined' && localStorage.getItem('sessionId'));
            if (sess) headers['Authorization'] = 'Bearer ' + sess;
        } catch { /* storage unavailable — server will 401 */ }
        const res = await fetch('/api/chunks/register', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                competition_id: this.config.competitionId,
                chunk_index: chunkNumber,
                extension: this.extension,
            }),
        });
        const data = await res.json().catch(() => ({})) as {
            success?: boolean; error?: string; code?: string;
            data?: { chunk_key?: string };
        };
        if (!res.ok || !data || data.success !== true || !data.data?.chunk_key) {
            throw new Error(data?.code ? `Key refused (${data.code})` : (data?.error || `Key issuance failed: ${res.status}`));
        }
        return data.data.chunk_key as string;
    }

    /**
     * Perform the actual upload
     */
    private async doUpload(blob: Blob, chunkNumber: number): Promise<void> {
        // Mandatory authorization first (fail-closed — see fetchChunkKey).
        const chunkKey = await this.fetchChunkKey(chunkNumber);
        const formData = new FormData();

        // Create filename with correct extension
        const filename = `chunk_${String(chunkNumber).padStart(4, '0')}.${this.extension}`;
        formData.append('chunk', blob, filename);
        formData.append('competition_id', this.config.competitionId.toString());
        formData.append('chunk_number', chunkNumber.toString());
        formData.append('extension', this.extension);
        formData.append('offset', this.getOffset().toString());
        formData.append('chunk_key', chunkKey);

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
        // R4-RELEASE-RECOVERY-C: a fenced-out session must never trigger the
        // merge; the secure activation path (D1 index + receipts) does not
        // depend on finalize.php at all. This client trigger is kept only
        // for the dual-write era and is retired at the row-30 cutover.
        if (this.leaseMode === 'enforced' && !this.leaseActive) {
            debugLog('[ChunkUploader] Finalize refused (lease lost)');
            return false;
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
