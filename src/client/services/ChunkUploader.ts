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
    /**
     * A28-LEASE: fired ONCE when this session stops being the recorder. The
     * `reason` distinguishes an official end/clean release (the authorized
     * drain tail keeps uploading) from a real takeover (fenced).
     */
    onLeaseLost?: (info: LeaseLossInfo) => void;
    /** Heartbeat period while holding the lease (default 10000ms). */
    heartbeatIntervalMs?: number;
    /** A28-LEASE: first retry delay while ownership is unknown (default 2000ms). */
    leaseRetryBaseMs?: number;
    /** A28-LEASE: backoff ceiling while ownership is unknown (default 30000ms). */
    leaseRetryMaxMs?: number;
    /** A28-LEASE: bounded retries before the recorder stops honestly (default 6). */
    maxLeaseRetries?: number;
}

/** A28-LEASE: why recording stopped (never collapsed into one state). */
export interface LeaseLossInfo {
    generation: number;
    /**
     * takeover   → another holder/generation owns the lease (fenced);
     * ended      → the competition officially ended; drain tail survives;
     * released   → clean handover by this holder; drain tail survives;
     * unverified → the bounded retry window expired without server proof.
     */
    reason: 'takeover' | 'ended' | 'released' | 'unverified';
}

/**
 * A28-LEASE: explicit ownership outcomes. UNKNOWN-TRANSIENT is NOT a loss —
 * uploads pause (nothing is published while ownership is unproven) and the
 * bounded queue is preserved until the server re-verifies.
 */
export type LeaseStatus = 'HELD' | 'UNKNOWN-TRANSIENT' | 'EXPIRED' | 'LOST-TAKEN-OVER';

export interface LeaseBeatAnswer {
    held: boolean;
    generation: number;
    reason?: 'transient' | 'expired' | 'released' | 'ended' | 'lost';
    expires_in_seconds?: number;
    draining?: boolean;
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
    heartbeat(generation: number): Promise<LeaseBeatAnswer>;
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

    async heartbeat(generation: number): Promise<LeaseBeatAnswer> {
        try {
            const res = await fetch('/api/chunks/lease/heartbeat', {
                method: 'POST',
                headers: this.headers(),
                body: JSON.stringify({ competition_id: this.competitionId, holder_nonce: this.holderNonce, generation }),
            });
            const data = await res.json().catch(() => ({})) as {
                success?: boolean; data?: {
                    held?: boolean; generation?: number;
                    reason?: LeaseBeatAnswer['reason']; expires_in_seconds?: number; draining?: boolean;
                };
            };
            if (res.ok && data?.success) {
                const answer: LeaseBeatAnswer = {
                    held: data.data?.held === true,
                    generation: data.data?.generation ?? generation,
                    reason: data.data?.reason,
                    expires_in_seconds: data.data?.expires_in_seconds,
                    draining: data.data?.draining,
                };
                // A28-LEASE: an HTTP-OK heartbeat that carries NO verdict
                // (legacy/partial server) is a TRANSIENT network-class answer,
                // never a takeover: the server did not say we lost the row.
                if (answer.held === false && answer.reason === undefined) answer.reason = 'transient';
                return answer;
            }
            // A28-LEASE: non-2xx (503 lease store unavailable, 5xx, proxy
            // HTML) says NOTHING about ownership — report it as transient so
            // the client pauses instead of aborting a healthy recording.
            return { held: false, generation, reason: 'transient' };
        } catch {
            // Network failure/timeout: ownership is UNKNOWABLE here.
            return { held: false, generation, reason: 'transient' };
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
    /** A28-LEASE: chunks discarded because the lease was lost (fenced). */
    fenced: number;
}

/** Public lease state (A28-LEASE) — honest, never a collapsed boolean. */
export interface ChunkUploadLeaseState {
    mode: 'off' | 'enforced';
    active: boolean;
    generation: number;
    unknown: boolean;
    draining: boolean;
    status: LeaseStatus;
    fenced: number;
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
     * A28-LEASE: lease lifecycle (acquire → heartbeat → expiry/takeover →
     * reconnect → release). No-op when no lease handle is configured (lease
     * off — pre-cutover behavior unchanged).
     *
     * The four outcomes are DISTINCT and observable:
     *  - HELD               → uploads flow;
     *  - UNKNOWN-TRANSIENT  → ownership unproven: uploads pause, queue kept,
     *                         bounded backoff re-verifies (never a takeover);
     *  - EXPIRED            → same holder lost liveness: bounded re-acquire
     *                         with server verification, then append at the
     *                         new authorized generation;
     *  - LOST-TAKEN-OVER    → another holder/generation owns the row: stop
     *                         once, fence the pending queue, refuse finalize.
     * A released/ended row is a clean end: the authorized drain tail keeps
     * uploading under the released generation (no false takeover).
     */
    private leaseGeneration = 0;
    private leaseActive = false;
    private leaseMode: 'off' | 'enforced' = 'off';
    private leaseTimer: ReturnType<typeof setInterval> | null = null;
    private leaseLostFired = false;
    private leaseStatus: LeaseStatus = 'HELD';
    private leaseUnknown = false;
    private leaseDraining = false;
    private leaseFencedCount = 0;
    private leaseRetryTimer: ReturnType<typeof setTimeout> | null = null;
    private leaseRetryAttempt = 0;
    /**
     * Response-epoch guard: bumped on every re-acquire and loss so a slow
     * heartbeat that resolves afterwards can never rewind a newer generation
     * or resurrect a fenced session.
     */
    private leaseEpoch = 0;
    /** In-flight fence: bumped on loss so abandoned uploads are not counted. */
    private uploadFence = 0;
    private activeUploadAbort: (() => void) | null = null;

    /** Claim the recorder lease before recording. Returns false when held. */
    async acquireLease(): Promise<boolean> {
        const handle = this.config.lease;
        if (!handle) return true;
        this.leaseMode = 'enforced';
        const r = await handle.acquire();
        if (r.ok) {
            this.applyHeld(r.generation);
            return true;
        }
        this.leaseActive = false;
        if (r.reason === 'held') {
            // Someone else owns the row: honest takeover state, no heartbeat.
            this.leaseStatus = 'LOST-TAKEN-OVER';
            this.leaseUnknown = false;
            this.leaseDraining = false;
            this.stopHeartbeat();
            this.stopRetry();
        } else {
            // Store unavailable/error: ownership is UNKNOWN, not lost.
            this.enterUnknown();
        }
        return false;
    }

    /** Adopt a proven (holder, generation) and resume the pipeline. */
    private applyHeld(generation: number): void {
        this.leaseEpoch++;
        this.leaseGeneration = generation;
        this.leaseActive = true;
        this.leaseUnknown = false;
        this.leaseDraining = false;
        this.leaseStatus = 'HELD';
        this.leaseLostFired = false;
        this.leaseRetryAttempt = 0;
        this.stopRetry();
        this.startHeartbeat();
        void this.pump();
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

    private stopRetry(): void {
        if (this.leaseRetryTimer !== null) {
            clearTimeout(this.leaseRetryTimer);
            this.leaseRetryTimer = null;
        }
    }

    /**
     * UNKNOWN-TRANSIENT entry: never a loss. Uploads pause (see canUpload)
     * and a bounded exponential retry re-verifies ownership server-side.
     */
    private enterUnknown(): void {
        if (this.leaseStatus === 'LOST-TAKEN-OVER') return;
        this.leaseUnknown = true;
        this.leaseDraining = false;
        this.leaseStatus = 'UNKNOWN-TRANSIENT';
        if (this.leaseRetryAttempt >= (this.config.maxLeaseRetries ?? 6)) {
            // The bounded window expired without server proof: stop honestly
            // instead of recording forever with unverifiable ownership.
            this.loseLease('unverified');
            return;
        }
        this.scheduleLeaseRetry();
    }

    private scheduleLeaseRetry(): void {
        if (this.leaseRetryTimer !== null) return;
        const base = this.config.leaseRetryBaseMs ?? 2000;
        const max = this.config.leaseRetryMaxMs ?? 30000;
        const delay = Math.min(max, base * Math.pow(2, this.leaseRetryAttempt));
        this.leaseRetryAttempt++;
        this.leaseRetryTimer = setTimeout(() => {
            this.leaseRetryTimer = null;
            void this.beatLease();
        }, delay);
    }

    /**
     * Terminal loss: stop once, fence the pending queue (counted, never
     * silently dropped), never upload again, refuse finalize.
     */
    private loseLease(reason: LeaseLossInfo['reason'], generation?: number): void {
        if (this.leaseStatus === 'LOST-TAKEN-OVER') return;
        this.leaseEpoch++;
        this.uploadFence++;
        if (typeof generation === 'number' && isFinite(generation) && generation > this.leaseGeneration) {
            this.leaseGeneration = generation;
        }
        this.leaseActive = false;
        this.leaseUnknown = false;
        this.leaseDraining = false;
        this.leaseStatus = 'LOST-TAKEN-OVER';
        this.stopHeartbeat();
        this.stopRetry();
        const abandoned = this.queue.length;
        this.queue.length = 0;
        this.leaseFencedCount += abandoned;
        if (this.activeUploadAbort) {
            try { this.activeUploadAbort(); } catch { /* already settled */ }
            this.activeUploadAbort = null;
        }
        if (!this.leaseLostFired) {
            this.leaseLostFired = true;
            this.config.onLeaseLost?.({ generation: this.leaseGeneration, reason });
        }
    }

    /**
     * Clean end/handover: the lease is no longer held but the recording may
     * still have an authorized final flush. Keep uploading that bounded tail
     * under the released generation, and never report a takeover.
     */
    private enterDrain(reason: 'released' | 'ended', generation: number): void {
        if (this.leaseStatus === 'LOST-TAKEN-OVER') return;
        this.leaseEpoch++;
        if (Number.isFinite(generation) && generation > this.leaseGeneration) {
            this.leaseGeneration = generation;
        }
        this.leaseActive = true;
        this.leaseUnknown = false;
        this.leaseDraining = true;
        this.leaseStatus = 'EXPIRED';
        this.leaseRetryAttempt = 0;
        this.stopRetry();
        this.stopHeartbeat();
        if (reason === 'ended' && !this.leaseLostFired) {
            this.leaseLostFired = true;
            this.config.onLeaseLost?.({ generation: this.leaseGeneration, reason: 'ended' });
        }
        void this.pump();
    }

    /** One heartbeat tick — outcome-specific, never a collapsed boolean. */
    async beatLease(): Promise<boolean> {
        const handle = this.config.lease;
        if (!handle || this.leaseMode !== 'enforced') return this.leaseActive;
        if (this.leaseStatus === 'LOST-TAKEN-OVER') return false;
        if (this.leaseDraining) return true; // drain-only: nothing to refresh
        if (!this.leaseActive && !this.leaseUnknown) return false;
        if (this.leaseUnknown && !this.leaseActive) {
            // A retry while still unproven: re-verify first.
            return this.tryReacquire();
        }

        const epoch = this.leaseEpoch;
        const generation = this.leaseGeneration;
        const answer = await handle.heartbeat(generation);
        // A re-acquire/loss landed while this beat was in flight: the newer
        // state wins, the stale answer is discarded (no generation rewind).
        // (Every terminal/re-acquire transition bumps leaseEpoch.)
        if (epoch !== this.leaseEpoch) {
            return this.leaseStatus === 'HELD' || this.leaseDraining;
        }

        if (answer.held) {
            if (Number.isFinite(answer.generation) && answer.generation > this.leaseGeneration) {
                this.leaseGeneration = answer.generation;
            }
            if (this.leaseUnknown) {
                this.leaseUnknown = false;
                this.leaseStatus = 'HELD';
                this.leaseRetryAttempt = 0;
                this.stopRetry();
                void this.pump();
            }
            return true;
        }

        switch (answer.reason) {
            case 'expired':
                return this.tryReacquire();
            case 'released':
                this.enterDrain('released', answer.generation);
                return true;
            case 'ended':
                this.enterDrain('ended', answer.generation);
                return true;
            case 'lost':
                this.loseLease('takeover', answer.generation);
                return false;
            case 'transient':
            default:
                // Legacy fakes/older servers answer {held:false} with no
                // reason on a takeover: treat only that shape as lost, and
                // everything explicitly transient as unknown.
                if (answer.reason === undefined) {
                    this.loseLease('takeover', answer.generation);
                    return false;
                }
                this.enterUnknown();
                return true;
        }
    }

    /**
     * EXPIRED: bounded re-acquire with server verification. A real other
     * holder is a loss; store/network failure keeps the session UNKNOWN
     * (queue preserved) instead of pretending a takeover.
     */
    private async tryReacquire(): Promise<boolean> {
        const handle = this.config.lease;
        if (!handle || this.leaseMode !== 'enforced') return false;
        if (this.leaseStatus === 'LOST-TAKEN-OVER') return false;
        const epoch = this.leaseEpoch;
        const r = await handle.acquire();
        if (epoch !== this.leaseEpoch) return this.leaseStatus === 'HELD' || this.leaseDraining;
        if (r.ok) {
            // Our own session re-acquired (possibly at a bumped generation):
            // resume appends, never report a takeover.
            this.applyHeld(r.generation);
            return true;
        }
        if (r.reason === 'held') {
            this.loseLease('takeover', r.generation);
            return false;
        }
        this.enterUnknown();
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
        this.stopRetry();
        this.leaseActive = false;
        this.leaseUnknown = false;
        this.leaseDraining = false;
        this.leaseLostFired = true; // an explicit release is not a loss
        if (this.leaseStatus !== 'LOST-TAKEN-OVER') this.leaseStatus = 'EXPIRED';
        try { await this.config.lease?.release(); } catch { /* best-effort */ }
    }

    getLeaseState(): ChunkUploadLeaseState {
        return {
            mode: this.leaseMode,
            active: this.leaseActive,
            generation: this.leaseGeneration,
            unknown: this.leaseUnknown,
            draining: this.leaseDraining,
            status: this.leaseStatus,
            fenced: this.leaseFencedCount,
        };
    }

    /** Uploads are allowed only while ownership is proven (or draining). */
    private canUpload(): boolean {
        if (this.leaseMode !== 'enforced') return true;
        return this.leaseActive && !this.leaseUnknown;
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
                // A28-LEASE: nothing is published while ownership is unproven
                // (UNKNOWN-TRANSIENT) or fenced out (LOST). The queue stays
                // bounded and intact until the server re-verifies.
                if (!this.canUpload()) break;
                const item = this.queue[0];
                const fence = this.uploadFence;
                item.attempts++;
                try {
                    const payload = await this.preparePayload(item.blob);
                    if (fence !== this.uploadFence) continue;
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
                    const genAtUpload = this.leaseGeneration;
                    await this.doUpload(payload, item.number);
                    // The lease was lost while this upload was in flight: the
                    // result is abandoned (never counted, never renumbered).
                    if (fence !== this.uploadFence) continue;
                    // A re-acquire bumped the generation: the key issued before
                    // it is stale server-side, so this chunk must retry under
                    // the current generation (same number, idempotent).
                    if (this.leaseMode === 'enforced' && this.leaseGeneration !== genAtUpload) {
                        throw new Error('lease generation changed during upload');
                    }
                    this.queue.shift();
                    this.uploadedCount++;
                    this.config.onChunkUploaded?.(item.number);
                } catch (error) {
                    if (fence !== this.uploadFence || this.leaseStatus === 'LOST-TAKEN-OVER') continue;
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
                // A28-LEASE: bind key issuance to THIS tab/session holder, so
                // a stale tab can never obtain a key under a successor's
                // generation (the server compares it to the lease row).
                ...(this.config.lease?.holderNonce
                    ? { holder_nonce: this.config.lease.holderNonce }
                    : {}),
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
     * Perform the actual upload. A28-LEASE: the request carries an abort
     * handle so a mid-flight lease loss can cancel it; either way the result
     * is fenced by the caller and never counted after a loss.
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

        let controller: AbortController | null = null;
        if (typeof AbortController !== 'undefined') {
            controller = new AbortController();
            this.activeUploadAbort = () => controller?.abort();
        }
        try {
            const response = await fetch(`${this.config.serverUrl}/upload.php`, {
                method: 'POST',
                body: formData,
                ...(controller ? { signal: controller.signal } : {}),
            } as RequestInit);

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
        } finally {
            this.activeUploadAbort = null;
        }
    }

    /**
     * Wait for all pending uploads to complete (queue drained AND no worker
     * in flight — safe to call before finalize/stop).
     */
    async waitForUploads(): Promise<void> {
        while (this.queue.length > 0 || this.pumping) {
            // A28-LEASE: while ownership is unproven the pipeline is paused by
            // design — never spin forever waiting for a queue that cannot
            // legally drain. Finalize reports the pending work honestly.
            if (!this.canUpload() && !this.pumping) return;
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
        // ROW28 Task B / R4-RELEASE-RECOVERY-C: the legacy server finalizer
        // (finalize.php: unauthenticated competition_id → shell ffmpeg-static
        // against playlist.m3u8 → merge → DELETES chunk_*.webm/metadata/
        // playlist, wildcard CORS, no auth) is RETIRED from the secure
        // activation path. There is NO server FFmpeg, merge, transcode or chunk
        // deletion. Finalization is now the platform-owned, authenticated D1
        // marker: each chunk reaching `ready` via its HMAC receipt advances
        // recording_finals. This client method therefore only DRAINS the upload
        // pipeline (ensuring every receipt is posted through the secure path) —
        // it performs no server merge and fabricates no vod_url/success.
        if (this.leaseMode === 'enforced' && !this.leaseActive) {
            debugLog('[ChunkUploader] Finalize refused (lease lost)');
            return false;
        }
        // A28-LEASE: ownership unproven (UNKNOWN-TRANSIENT) is NOT a loss and
        // NOT a green light: report honestly, keep the bounded pending tail,
        // and let the retry window resolve ownership first.
        if (this.leaseMode === 'enforced' && this.leaseUnknown) {
            debugLog('[ChunkUploader] Finalize deferred (lease ownership unverified)');
            return false;
        }
        // Wait for pending uploads (each posts its own HMAC receipt).
        await this.waitForUploads();

        // The authoritative final marker is derived server-side from receipts;
        // the client reports only that its upload pipeline drained while the
        // lease was still held (or while its authorized drain tail was valid).
        this.finalized = true;
        this.finalizeResult = this.leaseMode !== 'enforced' || this.leaseActive || this.leaseDraining;
        debugLog('[ChunkUploader] Upload pipeline drained; server-side final marker derives from receipts (legacy finalize.php retired)');
        return this.finalizeResult;
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
            nextNumber: this.nextNumber,
            fenced: this.leaseFencedCount
        };
    }
}

export default ChunkUploader;
