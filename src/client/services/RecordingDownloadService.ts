/**
 * @file src/client/services/RecordingDownloadService.ts
 * @description R4-CHUNK-DOWNLOAD-1: independent, verified recording download.
 * @module client/services/RecordingDownloadService
 *
 * This service is deliberately independent of SmartVodPlayer and its windowed
 * `loadedChunks` cache: it asks the authenticated server manifest for the
 * authoritative ready chunk list, fetches every remaining chunk itself with
 * bounded concurrency/retry/timeout, verifies sizes and SHA-256 where the
 * manifest proves the digest shape, then either:
 *  - structurally remuxes fragmented MP4 (no re-encode), or
 *  - uses self-hosted FFmpeg.wasm for WebM/mixed recordings (single MP4,
 *    H.264/AAC when transcoding is required).
 *
 * Raw Blob concatenation is never used. A partial recording is only offered
 * when the caller explicitly allows it and the result stays labelled partial.
 */

import type {
    DownloadChunk,
    DownloadManifest,
    DownloadMode,
} from '../../lib/services/ChunkDownloadManifest';
import {
    assembleFragmentedMp4,
    inspectMp4Tracks,
    Mp4AssemblyError,
    readMp4DurationMs,
} from '../../lib/media/Mp4FragmentAssembler';
import { FfmpegWorkerClient, FfmpegWorkerError } from './FfmpegWorkerClient';

/** Emscripten `getHeapMax()` in @ffmpeg/core 0.12.10 — measured, not policy. */
export const FFMPEG_HEAP_LIMIT_BYTES = 2_147_483_648;
/**
 * Fallback cap for a chunk whose D1 size is unknown. The recorder's documented
 * per-chunk upload ceiling is 60 MiB; the extra headroom avoids rejecting a
 * legitimate chunk while still bounding a hostile/unbounded response.
 */
const MAX_UNKNOWN_CHUNK_BYTES = 64 * 1024 * 1024;
/** FFmpeg needs roughly input + wasm FS copy + output; 85% of the heap is safe. */
const FFMPEG_PEAK_FACTOR = 3;
const FFMPEG_HEAP_SAFETY = 0.85;

export type DownloadPhase =
    | 'preflight'
    | 'fetching'
    | 'preparing'
    | 'assembling'
    | 'converting'
    | 'finalizing'
    | 'done';

export interface DownloadProgress {
    phase: DownloadPhase;
    percent: number;
    fetchedChunks: number;
    totalChunks: number;
    bytesReceived: number;
    totalBytes: number;
    /** Set for FFmpeg conversion progress (0..1). */
    conversionRatio?: number;
}

export type PreflightIssueCode =
    | 'no_chunks'
    | 'recording_not_finalized'
    | 'recording_incomplete'
    | 'unready_chunks'
    | 'failed_chunks'
    | 'duration_unknown'
    | 'unsupported_format'
    | 'too_large'
    | 'truncated';

export interface PreflightIssue {
    code: PreflightIssueCode;
    sequences: number[];
    /** Translation key; the UI owns the wording. */
    message_key: string;
    meta?: {
        estimated_peak_bytes?: number;
        limit_bytes?: number;
        total_bytes?: number;
        total_duration_ms?: number;
        mode?: DownloadMode;
    };
}

export interface PreflightResult {
    ok: boolean;
    complete: boolean;
    partialDownload: boolean;
    mode: DownloadMode;
    totalBytes: number;
    totalDurationMs: number;
    estimatedPeakBytes: number;
    heapLimitBytes: number;
    issues: PreflightIssue[];
    notices: PreflightIssue[];
}

export type DownloadFailureCode =
    | 'unauthorized'
    | 'manifest_failed'
    | 'not_authenticated'
    | 'preflight_failed'
    | 'incomplete_recording'
    | 'chunk_fetch_failed'
    | 'chunk_integrity_failed'
    | 'assembly_failed'
    | 'ffmpeg_unavailable'
    | 'ffmpeg_failed'
    | 'output_validation_failed'
    | 'cancelled'
    | 'unknown';

export class DownloadFailedError extends Error {
    readonly code: DownloadFailureCode;
    readonly sequence?: number;
    readonly status?: number;
    readonly details?: string;
    constructor(code: DownloadFailureCode, message: string, extra?: { sequence?: number; status?: number; details?: string }) {
        super(message);
        this.name = 'DownloadFailedError';
        this.code = code;
        this.sequence = extra?.sequence;
        this.status = extra?.status;
        this.details = extra?.details;
    }
}

export class DownloadCancelledError extends DownloadFailedError {
    constructor(message = 'Download cancelled') {
        super('cancelled', message);
        this.name = 'DownloadCancelledError';
    }
}

export interface DownloadResult {
    blob: Blob;
    filename: string;
    mimeType: 'video/mp4';
    durationMs: number;
    partial: boolean;
    /** Structural/hashes checked before the Blob was accepted. */
    integrityVerified: boolean;
    /** Browser decoded metadata + seeked inside the Blob. */
    playbackVerified: boolean;
}

export interface DownloadOptions {
    allowPartial?: boolean;
    /** Default 3. */
    maxConcurrent?: number;
    /** Per-chunk retry count (network/5xx/truncated); default 3. */
    retries?: number;
    /** Per-attempt timeout; default 30s. */
    requestTimeoutMs?: number;
    /** FFmpeg execution cap; default 20 minutes. */
    processingTimeoutMs?: number;
    /** Default 15 minutes for metadata + one seek. */
    playbackVerifyTimeoutMs?: number;
    /** Skip the DOM playback check (unit tests / non-browser). */
    verifyPlayback?: boolean;
    signal?: AbortSignal;
    onProgress?: (progress: DownloadProgress) => void;
}

export interface DownloadServiceOptions {
    fetchImpl?: typeof fetch;
    authToken?: string | null;
    manifestBase?: string;
    ffmpegBaseUrl?: string;
    workerFactory?: (url: string) => Worker;
    onLog?: (line: string) => void;
}

interface LoadedChunk {
    chunk: DownloadChunk;
    data: Uint8Array;
}

const DEFAULTS = {
    maxConcurrent: 3,
    retries: 3,
    requestTimeoutMs: 30_000,
    processingTimeoutMs: 20 * 60 * 1000,
    playbackVerifyTimeoutMs: 15_000,
};

/** Monotonic pipeline percentages shared by fetch/remux/FFmpeg phases. */
const PROGRESS = {
    fetched: 55,
    prepared: 58,
    converted: 92,
    assembled: 72,
    finalizing: 96,
    done: 100,
};

function isAbortError(error: unknown): boolean {
    return !!error && typeof error === 'object' && (error as { name?: string }).name === 'AbortError';
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal.aborted) { reject(new DownloadCancelledError()); return; }
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            reject(new DownloadCancelledError());
        };
        signal.addEventListener('abort', onAbort, { once: true });
    });
}

function combineSignals(signal: AbortSignal, timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return {
        signal: controller.signal,
        cleanup: () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', onAbort);
        },
    };
}

async function sha256Hex(data: Uint8Array): Promise<string | null> {
    const subtle = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto.subtle : undefined;
    if (!subtle) return null;
    const digest = await subtle.digest('SHA-256', data as unknown as BufferSource);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function emptyProgress(totalChunks: number, totalBytes: number): DownloadProgress {
    return {
        phase: 'preflight',
        percent: 0,
        fetchedChunks: 0,
        totalChunks,
        bytesReceived: 0,
        totalBytes,
    };
}

export class RecordingDownloadService {
    private readonly options: DownloadServiceOptions;
    private controller: AbortController | null = null;
    private cancelled = false;
    private worker: FfmpegWorkerClient | null = null;

    constructor(options: DownloadServiceOptions = {}) {
        this.options = options;
    }

    // ---------------------------------------------------------------------
    // Manifest / preflight
    // ---------------------------------------------------------------------

    private authHeaders(): Record<string, string> {
        const token = this.options.authToken
            ?? (typeof localStorage !== 'undefined' ? localStorage.getItem('sessionId') : null);
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        return headers;
    }

    async loadManifest(competitionId: number, signal?: AbortSignal): Promise<DownloadManifest> {
        const base = (this.options.manifestBase ?? '').replace(/\/+$/, '');
        const url = `${base}/api/chunks/download/${competitionId}`;
        const fetchImpl = this.options.fetchImpl ?? fetch;
        const own = signal ? null : new AbortController();
        const useSignal = signal ?? own!.signal;
        const combined = combineSignals(useSignal, DEFAULTS.requestTimeoutMs);
        try {
            const response = await fetchImpl(url, {
                method: 'GET',
                headers: this.authHeaders(),
                credentials: 'include',
                cache: 'no-store',
                signal: combined.signal,
            });
            const body = await response.json().catch(() => null) as { success?: boolean; data?: DownloadManifest; error?: string; code?: string } | null;
            if (response.status === 401) {
                throw new DownloadFailedError('not_authenticated', body?.error || 'Authentication required', { status: 401 });
            }
            if (!response.ok || !body || body.success !== true || !body.data) {
                throw new DownloadFailedError(
                    'manifest_failed',
                    body?.error || `Download manifest failed (${response.status})`,
                    { status: response.status }
                );
            }
            const manifest = body.data;
            if (manifest.version !== 1 || !Array.isArray(manifest.chunks)
                || !manifest.rights || typeof manifest.competition_id !== 'number'
                || typeof manifest.complete !== 'boolean' || typeof manifest.finalized !== 'boolean') {
                throw new DownloadFailedError('manifest_failed', 'Download manifest has an unexpected shape', { status: response.status });
            }
            return manifest;
        } catch (error) {
            if (error instanceof DownloadFailedError) throw error;
            if (isAbortError(error)) throw new DownloadCancelledError('Download manifest request was cancelled');
            throw new DownloadFailedError('manifest_failed', error instanceof Error ? error.message : String(error));
        } finally {
            combined.cleanup();
        }
    }

    static preflight(
        manifest: DownloadManifest,
        options: { allowPartial?: boolean; heapLimitBytes?: number } = {}
    ): PreflightResult {
        const heapLimit = options.heapLimitBytes ?? FFMPEG_HEAP_LIMIT_BYTES;
        const issues: PreflightIssue[] = [];
        const notices: PreflightIssue[] = [];
        const mode = manifest.mode;
        const totalBytes = manifest.total_bytes;
        const totalDuration = manifest.total_duration_ms;
        const issue = (code: PreflightIssueCode, message_key: string, sequences: number[] = [], meta?: PreflightIssue['meta']) =>
            ({ code, message_key, sequences, ...(meta ? { meta } : {}) });

        if (manifest.chunks.length === 0) {
            issues.push(issue('no_chunks', 'download_ui.error_no_chunks'));
        }
        if (manifest.truncated) {
            issues.push(issue('truncated', 'download_ui.error_truncated'));
        }
        if (mode === 'none') {
            issues.push(issue('unsupported_format', 'download_ui.error_unsupported_format'));
        }
        if (manifest.blockers.some((blocker) => blocker.code === 'duration_unknown')
            || manifest.chunks.some((c) => !(c.duration_ms > 0))) {
            issues.push(issue('duration_unknown', 'download_ui.error_duration_unknown'));
        }

        const incomplete = !manifest.complete;
        if (incomplete) {
            const partialIssue = manifest.finalized
                ? issue('recording_incomplete', 'download_ui.partial_notice', [
                    ...manifest.gaps, ...manifest.unready_sequences, ...manifest.failed_sequences,
                ])
                : issue('recording_not_finalized', 'download_ui.error_not_finalized');
            if (options.allowPartial && manifest.finalized && manifest.chunks.length > 0) notices.push(partialIssue);
            else issues.push(partialIssue);
        }

        // Resource estimate: structural remux holds input chunks + Blob parts;
        // FFmpeg additionally holds the wasm FS copy and the encoder output.
        // It is an estimate shown/diagnosed by the UI, not an invented policy
        // cap: the only hard browser ceiling known here is the measured wasm
        // heap on the FFmpeg path.
        const estimatedPeak = mode === 'ffmpeg'
            ? Math.round(totalBytes * FFMPEG_PEAK_FACTOR)
            : Math.round(totalBytes * 2 + 16 * 1024 * 1024);
        if (mode === 'ffmpeg' && estimatedPeak > heapLimit * FFMPEG_HEAP_SAFETY) {
            issues.push(issue('too_large', 'download_ui.error_heap_limit', [], {
                total_bytes: totalBytes,
                estimated_peak_bytes: estimatedPeak,
                limit_bytes: heapLimit,
                mode,
            }));
        }

        return {
            ok: issues.length === 0,
            complete: manifest.complete,
            partialDownload: !manifest.complete && options.allowPartial === true,
            mode,
            totalBytes,
            totalDurationMs: totalDuration,
            estimatedPeakBytes: estimatedPeak,
            heapLimitBytes: heapLimit,
            issues,
            notices,
        };
    }

    // ---------------------------------------------------------------------
    // Download pipeline
    // ---------------------------------------------------------------------

    cancel(): void {
        this.cancelled = true;
        this.abortWorkers();
    }

    /** Abort in-flight I/O without turning a real failure into a cancellation. */
    private abortWorkers(): void {
        this.controller?.abort();
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
    }

    async download(manifest: DownloadManifest, options: DownloadOptions = {}): Promise<DownloadResult> {
        const preflight = RecordingDownloadService.preflight(manifest, { allowPartial: options.allowPartial });
        if (!preflight.ok) {
            const first = preflight.issues[0];
            throw new DownloadFailedError(
                'preflight_failed',
                first.message_key,
                { details: first.code }
            );
        }

        this.cancelled = false;
        this.controller = new AbortController();
        const external = options.signal;
        const onExternalAbort = () => this.cancel();
        if (external) {
            if (external.aborted) throw new DownloadCancelledError();
            external.addEventListener('abort', onExternalAbort, { once: true });
        }
        const signal = this.controller.signal;
        const chosen = [...manifest.chunks].sort((a, b) => a.sequence - b.sequence);
        const totalBytes = chosen.reduce((sum, c) => sum + (c.bytes ?? 0), 0);
        const totalChunks = chosen.length;

        const report = (progress: DownloadProgress) => {
            try { options.onProgress?.(progress); } catch { /* progress UI must never break a download */ }
        };

        this.emit(report, {
            ...emptyProgress(totalChunks, totalBytes),
            phase: 'preflight',
            percent: 1,
        });

        try {
            const loaded = await this.fetchChunks(chosen, signal, report, totalBytes, options);
            if (this.cancelled) throw new DownloadCancelledError();

            // The manifest can be missing sizes. Re-check the real fetched bytes
            // before loading them into the FFmpeg wasm heap, so an unknown-size
            // recording fails clearly instead of aborting the worker mid-convert.
            if (manifest.mode === 'ffmpeg') {
                const actualBytes = loaded.reduce((sum, item) => sum + item.data.length, 0);
                if (actualBytes * FFMPEG_PEAK_FACTOR > FFMPEG_HEAP_LIMIT_BYTES * FFMPEG_HEAP_SAFETY) {
                    throw new DownloadFailedError(
                        'preflight_failed',
                        'download_ui.error_heap_limit',
                        { details: 'too_large' }
                    );
                }
            }

            let result: { blob: Blob; durationMs: number; integrityVerified: boolean };
            if (manifest.mode === 'mp4-remux') {
                try {
                    result = this.assembleMp4(loaded, manifest, report);
                } catch (error) {
                    if (!(error instanceof Mp4AssemblyError)) throw error;
                    this.options.onLog?.(`Structural MP4 remux failed (${error.code}); trying FFmpeg transcoding`);
                    result = await this.convertWithFfmpeg(loaded, manifest, signal, report, options);
                }
            } else {
                result = await this.convertWithFfmpeg(loaded, manifest, signal, report, options);
            }

            if (this.cancelled) throw new DownloadCancelledError();
            report({
                phase: 'finalizing',
                percent: PROGRESS.finalizing,
                fetchedChunks: totalChunks,
                totalChunks,
                bytesReceived: totalBytes,
                totalBytes,
            });

            let playbackVerified = false;
            if (options.verifyPlayback !== false && typeof document !== 'undefined') {
                const verification = await this.verifyPlayback(
                    result.blob,
                    result.durationMs,
                    options.playbackVerifyTimeoutMs ?? DEFAULTS.playbackVerifyTimeoutMs,
                    signal
                );
                playbackVerified = true;
                result.durationMs = verification.durationMs || result.durationMs;
            }

            const partial = !manifest.complete;
            const filename = this.filename(manifest, partial);
            report({
                phase: 'done',
                percent: PROGRESS.done,
                fetchedChunks: totalChunks,
                totalChunks,
                bytesReceived: totalBytes,
                totalBytes,
            });
            return {
                blob: result.blob,
                filename,
                mimeType: 'video/mp4',
                durationMs: result.durationMs,
                partial,
                integrityVerified: result.integrityVerified,
                playbackVerified,
            };
        } catch (error) {
            if (error instanceof DownloadFailedError && error.code !== 'cancelled') throw error;
            if (this.cancelled || isAbortError(error)) throw new DownloadCancelledError();
            if (error instanceof FfmpegWorkerError) {
                throw new DownloadFailedError(
                    error.code === 'worker_unavailable' ? 'ffmpeg_unavailable' : 'ffmpeg_failed',
                    error.message,
                    { details: error.details }
                );
            }
            throw new DownloadFailedError('unknown', error instanceof Error ? error.message : String(error));
        } finally {
            external?.removeEventListener('abort', onExternalAbort);
            if (this.worker) {
                this.worker.terminate();
                this.worker = null;
            }
            this.controller = null;
        }
    }

    private emit(report: (p: DownloadProgress) => void, progress: DownloadProgress): void {
        if (this.cancelled) return;
        report(progress);
    }

    private filename(manifest: DownloadManifest, partial: boolean): string {
        return `dueli_competition_${manifest.competition_id}${partial ? '_partial' : ''}.mp4`;
    }

    // ---------------------------------------------------------------------
    // Fetch (independent of the player cache)
    // ---------------------------------------------------------------------

    private async fetchChunks(
        chunks: DownloadChunk[],
        signal: AbortSignal,
        report: (p: DownloadProgress) => void,
        totalBytes: number,
        options: DownloadOptions
    ): Promise<LoadedChunk[]> {
        const results: Array<LoadedChunk | undefined> = new Array(chunks.length);
        const inFlight = new Map<number, number>();
        const completedBytes = new Map<number, number>();
        let completed = 0;
        let next = 0;
        let firstError: unknown = null;

        const bytesNow = () => {
            let sum = 0;
            for (const n of completedBytes.values()) sum += n;
            for (const n of inFlight.values()) sum += n;
            return sum;
        };
        const percentBase = PROGRESS.fetched;
        const publish = () => {
            const received = bytesNow();
            const byBytes = totalBytes > 0 ? received / totalBytes : completed / Math.max(1, chunks.length);
            report({
                phase: 'fetching',
                percent: Math.max(2, Math.min(percentBase, Math.round(byBytes * percentBase))),
                fetchedChunks: completed,
                totalChunks: chunks.length,
                bytesReceived: received,
                totalBytes,
            });
        };
        publish();

        const concurrency = Math.max(1, Math.min(options.maxConcurrent ?? DEFAULTS.maxConcurrent, chunks.length));
        const worker = async () => {
            for (;;) {
                if (this.cancelled || signal.aborted) throw new DownloadCancelledError();
                if (firstError) return;
                const index = next++;
                if (index >= chunks.length) return;
                const chunk = chunks[index];
                try {
                    const data = await this.fetchOne(
                        chunk,
                        signal,
                        (n) => { inFlight.set(index, n); publish(); },
                        options
                    );
                    completedBytes.set(index, data.length);
                    completed++;
                    inFlight.delete(index);
                    results[index] = { chunk, data };
                    publish();
                } catch (error) {
                    if (!firstError) firstError = error;
                    this.abortWorkers();
                    return;
                }
            }
        };

        try {
            await Promise.all(Array.from({ length: concurrency }, () => worker()));
        } catch (error) {
            firstError = firstError ?? error;
        }
        if (firstError) {
            if (firstError instanceof DownloadFailedError) throw firstError;
            if (isAbortError(firstError) || this.cancelled) throw new DownloadCancelledError();
            throw new DownloadFailedError('chunk_fetch_failed', firstError instanceof Error ? firstError.message : String(firstError));
        }
        if (this.cancelled) throw new DownloadCancelledError();
        if (results.some((r) => r === undefined)) throw new DownloadFailedError('chunk_fetch_failed', 'Some chunks were not fetched');
        return results as LoadedChunk[];
    }

    private async fetchOne(
        chunk: DownloadChunk,
        parentSignal: AbortSignal,
        onBytes: (n: number) => void,
        options: DownloadOptions
    ): Promise<Uint8Array> {
        const retries = Math.max(0, options.retries ?? DEFAULTS.retries);
        const timeoutMs = options.requestTimeoutMs ?? DEFAULTS.requestTimeoutMs;
        const fetchImpl = this.options.fetchImpl ?? fetch;
        let lastError: unknown = null;

        for (let attempt = 0; attempt <= retries; attempt++) {
            if (this.cancelled || parentSignal.aborted) throw new DownloadCancelledError();
            let reported = 0;
            const combined = combineSignals(parentSignal, timeoutMs);
            try {
                const response = await fetchImpl(chunk.url, {
                    method: 'GET',
                    // Chunk URLs point at the public stream host. Sending
                    // credentials would turn this into a credentialed CORS
                    // request, which a wildcard `Access-Control-Allow-Origin`
                    // stream host cannot satisfy — and the player itself uses
                    // the same uncredentialed fetch. The authenticated boundary
                    // is the manifest route, not the object store.
                    credentials: 'same-origin',
                    cache: 'no-store',
                    signal: combined.signal,
                });
                if (!response.ok) {
                    const retryable = response.status === 408 || response.status === 425
                        || response.status === 429 || response.status >= 500;
                    throw Object.assign(new Error(`Chunk ${chunk.sequence} HTTP ${response.status}`), {
                        retryable,
                        status: response.status,
                    });
                }
                const contentType = (response.headers.get('content-type') || '').toLowerCase();
                if (contentType.includes('text/html') || contentType.startsWith('text/')
                    || contentType.includes('json')) {
                    throw Object.assign(new Error(`Chunk ${chunk.sequence} returned text, not media`), { retryable: false });
                }
                const limit = chunk.bytes !== null ? chunk.bytes : MAX_UNKNOWN_CHUNK_BYTES;
                const declaredLength = Number(response.headers.get('content-length'));
                if (Number.isFinite(declaredLength) && declaredLength > limit) {
                    throw Object.assign(new Error(`Chunk ${chunk.sequence} declares ${declaredLength} bytes, above ${limit}`), { retryable: false });
                }
                const data = response.body
                    ? await this.readBody(
                        response.body,
                        (n) => { reported = n; onBytes(reported); },
                        limit,
                        chunk.sequence
                    )
                    : new Uint8Array(await response.arrayBuffer());
                if (chunk.bytes === null && data.length > MAX_UNKNOWN_CHUNK_BYTES) {
                    throw new DownloadFailedError('chunk_integrity_failed', `Chunk ${chunk.sequence} exceeds the response ceiling`, {
                        sequence: chunk.sequence,
                        status: response.status,
                    });
                }

                if (chunk.bytes !== null && data.length !== chunk.bytes) {
                    throw Object.assign(new Error(`Chunk ${chunk.sequence} size ${data.length} != ${chunk.bytes}`), { retryable: true });
                }
                if (chunk.hash_algorithm === 'sha256' && chunk.object_hash) {
                    const hash = await sha256Hex(data);
                    if (hash === null) {
                        throw Object.assign(new Error('SHA-256 is unavailable in this browser'), { retryable: false });
                    }
                    if (hash.toLowerCase() !== chunk.object_hash.toLowerCase()) {
                        throw Object.assign(new Error(`Chunk ${chunk.sequence} checksum mismatch`), { retryable: true });
                    }
                }
                return data;
            } catch (error) {
                combined.cleanup();
                lastError = error;
                onBytes(0);
                if (this.cancelled || parentSignal.aborted) throw new DownloadCancelledError();
                const retryable = (error as { retryable?: boolean })?.retryable === true
                    || isAbortError(error)
                    || (error instanceof TypeError);
                if (!retryable || attempt >= retries) break;
                // Bounded exponential backoff (0.5s, 1s, 2s, 4s ... max 8s).
                await sleep(Math.min(8000, 500 * 2 ** attempt), parentSignal);
            } finally {
                combined.cleanup();
            }
        }

        if (lastError instanceof DownloadFailedError) throw lastError;
        const status = (lastError as { status?: number })?.status;
        const message = lastError instanceof Error ? lastError.message : String(lastError);
        if (/checksum|size/i.test(message)) {
            throw new DownloadFailedError('chunk_integrity_failed', message, { sequence: chunk.sequence, status });
        }
        throw new DownloadFailedError('chunk_fetch_failed', message, { sequence: chunk.sequence, status });
    }

    private async readBody(
        body: ReadableStream<Uint8Array>,
        onBytes: (n: number) => void,
        maxBytes: number,
        sequence: number
    ): Promise<Uint8Array> {
        const reader = body.getReader();
        const parts: Uint8Array[] = [];
        let total = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;
            total += value.length;
            if (total > maxBytes) {
                try { await reader.cancel(); } catch { /* stream already closed */ }
                throw new DownloadFailedError(
                    'chunk_integrity_failed',
                    `Chunk ${sequence} exceeded the expected ${maxBytes} bytes`,
                    { sequence }
                );
            }
            parts.push(value);
            onBytes(total);
        }
        const out = new Uint8Array(total);
        let offset = 0;
        for (const part of parts) {
            out.set(part, offset);
            offset += part.length;
        }
        return out;
    }

    // ---------------------------------------------------------------------
    // MP4 structural remux
    // ---------------------------------------------------------------------

    private assembleMp4(
        loaded: LoadedChunk[],
        manifest: DownloadManifest,
        report: (p: DownloadProgress) => void
    ): { blob: Blob; durationMs: number; integrityVerified: boolean } {
        report({
            phase: 'assembling',
            percent: PROGRESS.assembled,
            fetchedChunks: loaded.length,
            totalChunks: loaded.length,
            bytesReceived: manifest.total_bytes,
            totalBytes: manifest.total_bytes,
        });

        let cursor = 0;
        const inputs = loaded.map(({ chunk, data }) => {
            if (manifest.complete && Math.abs(cursor - chunk.timeline_start_ms) > 2) {
                throw new Mp4AssemblyError(
                    'schedule_non_monotonic',
                    `D1 timeline ${chunk.timeline_start_ms} disagrees with the assembled cursor ${cursor}`
                );
            }
            const input = {
                sequence: chunk.sequence,
                data,
                durationMs: chunk.duration_ms,
                timelineStartMs: cursor,
            };
            cursor += chunk.duration_ms;
            return input;
        });

        const assembly = assembleFragmentedMp4(inputs);
        const blob = new Blob(assembly.parts as unknown as BlobPart[], { type: 'video/mp4' });
        if (blob.size !== assembly.byteLength) {
            throw new Mp4AssemblyError('unsupported_layout', 'Blob size does not match assembled parts');
        }
        return {
            blob,
            durationMs: assembly.durationMs,
            integrityVerified: true,
        };
    }

    // ---------------------------------------------------------------------
    // FFmpeg.wasm path (WebM / mixed / structural fallback)
    // ---------------------------------------------------------------------

    private async convertWithFfmpeg(
        loaded: LoadedChunk[],
        manifest: DownloadManifest,
        signal: AbortSignal,
        report: (p: DownloadProgress) => void,
        options: DownloadOptions
    ): Promise<{ blob: Blob; durationMs: number; integrityVerified: boolean }> {
        if (this.cancelled) throw new DownloadCancelledError();
        this.worker = new FfmpegWorkerClient({
            baseUrl: this.options.ffmpegBaseUrl,
            workerFactory: this.options.workerFactory,
            onLog: this.options.onLog,
            onProgress: (ratio) => {
                report({
                    phase: 'converting',
                    percent: Math.round(PROGRESS.prepared
                        + Math.max(0, Math.min(1, ratio)) * (PROGRESS.converted - PROGRESS.prepared)),
                    fetchedChunks: loaded.length,
                    totalChunks: loaded.length,
                    bytesReceived: manifest.total_bytes,
                    totalBytes: manifest.total_bytes,
                    conversionRatio: ratio,
                });
            },
        });

        const names: string[] = [];
        let outputName = '';
        let completed = false;
        try {
            report({
                phase: 'preparing',
                percent: PROGRESS.fetched,
                fetchedChunks: loaded.length,
                totalChunks: loaded.length,
                bytesReceived: manifest.total_bytes,
                totalBytes: manifest.total_bytes,
            });
            await this.worker.init();
            if (this.cancelled) throw new DownloadCancelledError();

            for (let i = 0; i < loaded.length; i++) {
                if (this.cancelled || signal.aborted) throw new DownloadCancelledError();
                const { chunk, data } = loaded[i];
                const name = `chunk_${String(chunk.sequence).padStart(5, '0')}.${chunk.container}`;
                await this.worker.writeFile(name, data);
                names.push(name);
                report({
                    phase: 'preparing',
                    percent: Math.round(PROGRESS.fetched
                        + ((i + 1) / loaded.length) * (PROGRESS.prepared - PROGRESS.fetched)),
                    fetchedChunks: loaded.length,
                    totalChunks: loaded.length,
                    bytesReceived: manifest.total_bytes,
                    totalBytes: manifest.total_bytes,
                });
            }

            const list = loaded
                .map(({ chunk }) => `file 'chunk_${String(chunk.sequence).padStart(5, '0')}.${chunk.container}'`)
                .join('\n');
            await this.worker.writeFile('concat.txt', new TextEncoder().encode(`${list}\n`));
            names.push('concat.txt');
            outputName = 'output.mp4';

            // Always transcode on this path. Even a byte-compatible MP4 fallback
            // has per-chunk timestamp/init resets that `-c copy` does not fix;
            // copying would produce a file that downloads successfully but is not
            // guaranteed to play. FFmpeg is only used when structural remux is
            // impossible or has already failed.
            const args = [
                '-hide_banner', '-nostdin', '-y',
                '-f', 'concat', '-safe', '0', '-i', 'concat.txt',
                '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
                '-c:a', 'aac', '-b:a', '128k',
                '-movflags', '+faststart',
                outputName,
            ];
            report({
                phase: 'converting',
                percent: PROGRESS.prepared,
                fetchedChunks: loaded.length,
                totalChunks: loaded.length,
                bytesReceived: manifest.total_bytes,
                totalBytes: manifest.total_bytes,
                conversionRatio: 0,
            });
            await this.worker.exec(args, options.processingTimeoutMs ?? DEFAULTS.processingTimeoutMs);
            if (this.cancelled) throw new DownloadCancelledError();

            const output = await this.worker.readFile(outputName);
            if (output.length < 8) throw new Error('FFmpeg produced an empty file');
            const type = String.fromCharCode(output[4], output[5], output[6], output[7]);
            if (type !== 'ftyp') throw new Error(`FFmpeg output is not an MP4 (first box ${type})`);
            const tracks = inspectMp4Tracks(output);
            if (!tracks.some((track) => track.handler === 'vide')) {
                throw new Error('FFmpeg output has no video track');
            }
            const sourceDeclaresAudio = loaded.some(({ chunk }) =>
                !!chunk.codec_audio && chunk.codec_audio.toLowerCase() !== 'none'
            );
            if (sourceDeclaresAudio && !tracks.some((track) => track.handler === 'soun')) {
                throw new Error('FFmpeg output lost the recording audio track');
            }
            const durationMs = readMp4DurationMs(output) || manifest.total_duration_ms;
            const blob = new Blob([output as unknown as BlobPart], { type: 'video/mp4' });
            completed = true;
            return { blob, durationMs, integrityVerified: true };
        } catch (error) {
            if (this.cancelled || isAbortError(error)) throw new DownloadCancelledError();
            if (error instanceof DownloadCancelledError || error instanceof DownloadFailedError) throw error;
            if (error instanceof FfmpegWorkerError) {
                throw new DownloadFailedError(
                    error.code === 'worker_unavailable' ? 'ffmpeg_unavailable' : 'ffmpeg_failed',
                    error.message,
                    { details: error.details }
                );
            }
            throw new DownloadFailedError('ffmpeg_failed', error instanceof Error ? error.message : String(error));
        } finally {
            if (this.worker) {
                // On failure the worker may still be blocked inside exec();
                // waiting for a delete round-trip would delay the error. A
                // termination releases the wasm FS and heap immediately.
                if (completed) {
                    await this.worker.deleteFiles([...names, ...(outputName ? [outputName] : [])]);
                }
                this.worker.terminate();
                this.worker = null;
            }
        }
    }

    // ---------------------------------------------------------------------
    // Browser playback verification / save
    // ---------------------------------------------------------------------

    private async verifyPlayback(
        blob: Blob,
        expectedDurationMs: number,
        timeoutMs: number,
        signal: AbortSignal
    ): Promise<{ durationMs: number; seekable: boolean }> {
        const url = URL.createObjectURL(blob);
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        video.src = url;
        video.style.position = 'fixed';
        video.style.left = '-9999px';
        video.style.width = '2px';
        video.style.height = '2px';
        document.body.appendChild(video);

        const cleanup = () => {
            try { video.pause(); } catch { /* noop */ }
            video.removeAttribute('src');
            try { video.load(); } catch { /* noop */ }
            video.remove();
            URL.revokeObjectURL(url);
        };

        const waitFor = (event: string) => new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                cleanupListeners();
                reject(new Error(`Timed out waiting for video ${event}`));
            }, timeoutMs);
            const onEvent = () => { cleanupListeners(); resolve(); };
            const onError = () => {
                cleanupListeners();
                reject(new Error(`Video could not decode the downloaded file (${video.error?.message || 'media error'})`));
            };
            const onAbort = () => {
                cleanupListeners();
                reject(new DownloadCancelledError());
            };
            const cleanupListeners = () => {
                clearTimeout(timer);
                video.removeEventListener(event, onEvent);
                video.removeEventListener('error', onError);
                signal.removeEventListener('abort', onAbort);
            };
            video.addEventListener(event, onEvent, { once: true });
            video.addEventListener('error', onError, { once: true });
            signal.addEventListener('abort', onAbort, { once: true });
            if (signal.aborted) onAbort();
        });

        try {
            await waitFor('loadedmetadata');
            const duration = Number.isFinite(video.duration) ? video.duration * 1000 : 0;
            if (!(duration > 0)) throw new Error('Downloaded MP4 reports no duration');
            const tolerance = Math.max(1500, expectedDurationMs * 0.02);
            if (!(expectedDurationMs > 0) || Math.abs(duration - expectedDurationMs) > tolerance) {
                throw new Error(`Downloaded duration ${Math.round(duration)}ms differs from ${Math.round(expectedDurationMs)}ms`);
            }
            const durationMs = duration;
            const seekableEndMs = video.seekable.length > 0 ? video.seekable.end(0) * 1000 : 0;
            if (!(seekableEndMs >= durationMs * 0.95)) {
                throw new Error('Downloaded MP4 is not seekable to the end');
            }
            // Seek near the midpoint, not 1s, so later fragments/timestamps are
            // exercised by the browser rather than only the first moof.
            const durationSec = durationMs / 1000;
            const target = Math.max(0.05, Math.min(durationSec / 2, durationSec - 0.25));
            video.currentTime = target;
            await waitFor('seeked');
            if (Math.abs(video.currentTime - target) > 0.5) {
                throw new Error('Downloaded MP4 did not seek to the requested position');
            }
            return { durationMs: Math.round(durationMs), seekable: true };
        } catch (error) {
            if (error instanceof DownloadCancelledError) throw error;
            throw new DownloadFailedError(
                'output_validation_failed',
                error instanceof Error ? error.message : String(error)
            );
        } finally {
            cleanup();
        }
    }

    static saveBlob(blob: Blob, filename: string): void {
        if (typeof document === 'undefined') return;
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        // Never revoke synchronously: the browser needs the URL to start the save.
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
}

export default RecordingDownloadService;
