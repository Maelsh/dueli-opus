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
     * R4-CHUNK-DOWNLOAD-1 (D): server-backed exclusive recorder ownership.
     * When absent the uploader works exactly as before (lease off — e.g.
     * test pages / legacy surfaces). When present, sensitive points
     * (acquire at start, heartbeat, pre-upload revalidation, finalize)
     * verify ownership; a fenced-out session stops and never finalizes.
     */
    lease?: RecordingLeaseHandle;
    /** Fired once when this session loses the lease (takeover/release). */
    onLeaseLost?: (info: { generation: number }) => void;
    /** Heartbeat period while holding the lease (default 10s). */
    heartbeatIntervalMs?: number;
    /** Pre-upload server revalidation when the last heartbeat is older. */
    maxHeartbeatStaleMs?: number;
}

/**
 * Server-backed exclusive recorder ownership (lease/fencing) handle.
 * Implemented by PlatformRecordingLease below (platform fetch contract);
 * tests inject fakes. Only the session whose (holder, generation) matches
 * the server row may record/upload.
 */
export interface RecordingLeaseHandle {
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
    private readonly nonce: string;

    constructor(
        private readonly competitionId: number,
        private readonly authHeaders: () => Record<string, string> = () => {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            try {
                const sess = (typeof window !== 'undefined' && window.sessionId)
                    || (typeof localStorage !== 'undefined' && localStorage.getItem('sessionId'));
                if (sess) headers['Authorization'] = 'Bearer ' + sess;
            } catch { /* storage unavailable */ }
            return headers;
        }
    ) {
        const key = 'dueli_lease_nonce_' + competitionId;
        let nonce: string | null = null;
        try {
            nonce = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(key) : null;
            if (!nonce) {
                const bytes = new Uint8Array(16);
                crypto.getRandomValues(bytes);
                nonce = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
                try { sessionStorage.setItem(key, nonce); } catch { /* private mode */ }
            }
        } catch {
            nonce = 'fallback' + Math.floor(Math.random() * 1e12).toString(16);
        }
        this.nonce = nonce as string;
    }

    /** Exposed for diagnostics/tests (the nonce is an opaque label, not a secret). */
    get holderNonce(): string {
        return this.nonce;
    }

    private async post(path: string, body: Record<string, unknown>): Promise<{ status: number; data: any }> {
        const res = await fetch(path, {
            method: 'POST',
            headers: this.authHeaders(),
            body: JSON.stringify(body)
        });
        const data = await res.json().catch(() => ({}));
        return { status: res.status, data };
    }

    async acquire(): Promise<
        | { ok: true; generation: number; took_over: boolean }
        | { ok: false; reason: 'held' | 'unavailable' | 'error'; generation?: number; expires_in_seconds?: number }
    > {
        try {
            const { status, data } = await this.post('/api/chunks/lease/acquire', {
                competition_id: this.competitionId, holder_nonce: this.nonce
            });
            if (status === 200 && data && data.success) {
                return { ok: true, generation: data.data.generation, took_over: !!data.data.took_over };
            }
            if (status === 409) {
                return {
                    ok: false, reason: 'held',
                    generation: data && typeof data.generation === 'number' ? data.generation : 0,
                    expires_in_seconds: data && typeof data.expires_in_seconds === 'number' ? data.expires_in_seconds : 0
                };
            }
            if (status === 503 && data && data.code === 'lease_unavailable') {
                // Deployment window (migration 0040 not applied yet): legacy
                // mode — explicit, counted by the caller, never silent.
                return { ok: false, reason: 'unavailable' };
            }
            return { ok: false, reason: 'error' };
        } catch {
            return { ok: false, reason: 'error' };
        }
    }

    async heartbeat(generation: number): Promise<{ held: boolean; generation: number }> {
        const { data } = await this.post('/api/chunks/lease/heartbeat', {
            competition_id: this.competitionId, holder_nonce: this.nonce, generation
        });
        if (data && data.success && data.data && typeof data.data.held === 'boolean') {
            return { held: data.data.held, generation: Number(data.data.generation) || 0 };
        }
        throw new Error('Lease heartbeat failed');
    }

    async release(): Promise<void> {
        try {
            await this.post('/api/chunks/lease/release', {
                competition_id: this.competitionId, holder_nonce: this.nonce
            });
        } catch { /* best effort */ }
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
     * R4-CHUNK-DOWNLOAD-1 (D): lease state. 'off' = no handle configured
     * (legacy surfaces behave exactly as before); 'legacy' = server store
     * unavailable (deployment window — explicit, uploads proceed); 'enforced'
     * = this session claimed the lease and must keep proving it.
     */
    private leaseMode: 'off' | 'legacy' | 'enforced' = 'off';
    private leaseGeneration = 0;
    /** True when recording may proceed: always in off/legacy mode, only
     *  while the claim holds in enforced mode. Defaults to true so
     *  lease-less surfaces (and tests) behave exactly as before. */
    private leaseActive = true;
    private leaseLostFired = false;
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private lastHeartbeatOk = 0;
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

    private heartbeatInterval(): number {
        return this.config.heartbeatIntervalMs && this.config.heartbeatIntervalMs > 0
            ? this.config.heartbeatIntervalMs : 10000;
    }

    private maxStale(): number {
        return this.config.maxHeartbeatStaleMs && this.config.maxHeartbeatStaleMs > 0
            ? this.config.maxHeartbeatStaleMs : 30000;
    }

    /**
     * Claim the recorder lease before recording starts. Returns true when
     * this session may record (no handle / legacy window / claim won).
     * Returns false when another session actively holds it (409) or the
     * claim errored — the caller must NOT start the recorder and should
     * surface "recording in another tab" with a bounded retry (the holder
     * may crash or finish; TTL frees the lease).
     */
    async acquireLease(): Promise<boolean> {
        if (!this.config.lease) {
            this.leaseMode = 'off';
            this.leaseActive = true;
            return true;
        }
        // From here the session is lease-governed even before the claim
        // resolves: a rejection below leaves enforced+inactive, so no chunk
        // is ever accepted or finalized without proven ownership.
        this.leaseMode = 'enforced';
        this.leaseActive = false;
        const result = await this.config.lease.acquire();
        if (result.ok) {
            this.leaseMode = 'enforced';
            this.leaseGeneration = result.generation;
            this.leaseActive = true;
            this.leaseLostFired = false;
            this.lastHeartbeatOk = Date.now();
            this.startHeartbeat();
            debugLog(`[ChunkUploader] Lease acquired (generation ${result.generation}${result.took_over ? ', takeover' : ''})`);
            return true;
        }
        if (result.reason === 'unavailable') {
            this.leaseMode = 'legacy';
            this.leaseActive = true;
            debugLog('[ChunkUploader] Lease store unavailable — legacy mode (no fencing)');
            return true;
        }
        debugLog('[ChunkUploader] Lease held by another session');
        return false;
    }

    private startHeartbeat(): void {
        this.stopHeartbeat();
        if (this.leaseMode !== 'enforced') return;
        this.heartbeatTimer = setInterval(() => {
            void this.beat();
        }, this.heartbeatInterval());
    }

    private stopHeartbeat(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    private async beat(): Promise<void> {
        if (this.leaseMode !== 'enforced' || !this.leaseActive || !this.config.lease) return;
        try {
            const res = await this.config.lease.heartbeat(this.leaseGeneration);
            if (res.held) {
                this.lastHeartbeatOk = Date.now();
            } else {
                this.handleLeaseLost(res.generation);
            }
        } catch {
            // Transient network failure: do NOT kill the recording on a
            // blip — the pre-upload revalidation below bounds the staleness.
            debugLog('[ChunkUploader] Lease heartbeat failed (transient — retrying)');
        }
    }

    /**
     * Sensitive-point check (D4): before every upload, when the last
     * heartbeat is stale, revalidate ownership with the server NOW.
     * Fail-closed on explicit loss, fail-open on network error (bounded by
     * staleness — a fenced-out session is still caught at the next beat).
     */
    private async ensureLease(): Promise<boolean> {
        if (this.leaseMode !== 'enforced') return this.leaseActive;
        if (!this.leaseActive) return false;
        if (Date.now() - this.lastHeartbeatOk <= this.maxStale()) return true;
        await this.beat();
        return this.leaseActive;
    }

    /**
     * Fence this session out: stop heartbeats, drop waiting chunks
     * (counted — never silent), refuse finalize, notify once.
     */
    private handleLeaseLost(serverGeneration: number): void {
        if (!this.leaseActive) return;
        this.leaseActive = false;
        this.stopHeartbeat();
        const waiting = this.queue.length;
        this.queue.length = 0;
        this.droppedChunks += waiting;
        debugLog(`[ChunkUploader] Lease lost (server generation ${serverGeneration}) — stopped, ${waiting} waiting chunk(s) dropped`);
        if (!this.leaseLostFired) {
            this.leaseLostFired = true;
            try {
                this.config.onLeaseLost?.({ generation: serverGeneration });
            } catch { /* listener must never break fencing */ }
        }
    }

    /** Voluntary clean handover (end of recording): stop beats, release. */
    async releaseLease(): Promise<void> {
        this.stopHeartbeat();
        if (this.leaseMode === 'enforced' && this.config.lease) {
            try {
                await this.config.lease.release();
            } catch { /* best effort */ }
        }
        this.leaseActive = false;
    }

    /**
     * Emergency stop WITHOUT finalize (lease lost): the old session must
     * never trigger a merge after a takeover. Drops waiting chunks (counted).
     */
    shutdown(): void {
        this.stopHeartbeat();
        const waiting = this.queue.length;
        this.queue.length = 0;
        this.droppedChunks += waiting;
        this.leaseActive = false;
    }

    /** True while this session is the proven recorder (or lease is off). */
    get leaseHeld(): boolean {
        return this.leaseActive;
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
        // A re-initialized session must re-prove ownership from scratch
        // (resume-after-max numbering below is untouched — D6). Lease-less
        // surfaces stay active; governed ones claim via acquireLease().
        this.stopHeartbeat();
        this.leaseMode = 'off';
        this.leaseGeneration = 0;
        this.leaseActive = !this.config.lease;
        this.leaseLostFired = false;
        this.lastHeartbeatOk = 0;
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
        // Fenced-out sessions accept no new work (the recorder is aborted
        // via onLeaseLost; this guards the race window).
        if (this.leaseMode === 'enforced' && !this.leaseActive) {
            this.failedChunks++;
            debugLog('[ChunkUploader] Rejected chunk (lease lost)');
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
                    // D4 sensitive-point ownership check: a session fenced
                    // out mid-queue stops here (handleLeaseLost already
                    // cleared the queue including this item — never upload
                    // after losing the lease).
                    if (!(await this.ensureLease())) {
                        return;
                    }
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
        // A fenced-out session must never trigger the merge (D3).
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
            // Clean handover: a finalized session frees the lease so a
            // later session (or the same tab re-recording) claims cleanly.
            // Best-effort — /end also releases server-side.
            await this.releaseLease();
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
