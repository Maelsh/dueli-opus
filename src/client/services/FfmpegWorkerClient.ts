/**
 * @file src/client/services/FfmpegWorkerClient.ts
 * @description R4-CHUNK-DOWNLOAD-1: own-origin FFmpeg.wasm worker transport.
 * @module client/services/FfmpegWorkerClient
 *
 * The worker (`/static/ffmpeg/worker.js`) is generated from
 * `src/client/ffmpeg/worker.ts` during `build:client`; it loads the UMD core
 * from the same origin and rebuilds the wasm binary from <25 MiB static parts
 * (Cloudflare Pages rejects larger single files). No CDN, no `unsafe-eval`:
 * the CSP only allows `'wasm-unsafe-eval'`.
 *
 * This transport owns request IDs, timeouts, cancellation and cleanup. A
 * worker failure is always surfaced explicitly — the download service never
 * falls back to raw Blob concatenation.
 */

export type FfmpegWorkerErrorCode =
    | 'worker_unavailable'
    | 'worker_timeout'
    | 'worker_error'
    | 'worker_protocol'
    | 'ffmpeg_failed';

export class FfmpegWorkerError extends Error {
    readonly code: FfmpegWorkerErrorCode;
    readonly details?: string;
    constructor(code: FfmpegWorkerErrorCode, message: string, details?: string) {
        super(message);
        this.name = 'FfmpegWorkerError';
        this.code = code;
        this.details = details;
    }
}

export interface FfmpegWorkerOptions {
    /** Defaults to `/static/ffmpeg`. */
    baseUrl?: string;
    /** Test seam; production uses the global Worker constructor. */
    workerFactory?: (url: string) => Worker;
    onProgress?: (ratio: number, timeMs: number) => void;
    onLog?: (line: string) => void;
}

interface PendingRequest {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
}

const INIT_TIMEOUT_MS = 180_000;
const DEFAULT_EXEC_TIMEOUT_MS = 30 * 60 * 1000;

export class FfmpegWorkerClient {
    private worker: Worker | null = null;
    private readonly options: FfmpegWorkerOptions;
    private readonly pending = new Map<number, PendingRequest>();
    private requestId = 0;
    private ready = false;
    private terminated = false;
    private initPromise: Promise<void> | null = null;

    constructor(options: FfmpegWorkerOptions = {}) {
        this.options = options;
    }

    private get baseUrl(): string {
        return (this.options.baseUrl ?? '/static/ffmpeg').replace(/\/+$/, '');
    }

    private ensureWorker(): Worker {
        if (this.terminated) throw new FfmpegWorkerError('worker_unavailable', 'FFmpeg worker was terminated');
        if (this.worker) return this.worker;
        try {
            const factory = this.options.workerFactory
                ?? ((url: string) => new Worker(url));
            this.worker = factory(`${this.baseUrl}/worker.js`);
        } catch (error) {
            throw new FfmpegWorkerError(
                'worker_unavailable',
                'Could not start the FFmpeg worker',
                error instanceof Error ? error.message : String(error)
            );
        }
        this.worker.addEventListener('message', (event: MessageEvent) => this.onMessage(event.data));
        this.worker.addEventListener('error', (event: ErrorEvent) => {
            this.failAll(new FfmpegWorkerError('worker_error', event.message || 'FFmpeg worker crashed'));
        });
        this.worker.addEventListener('messageerror', () => {
            this.failAll(new FfmpegWorkerError('worker_protocol', 'FFmpeg worker message could not be decoded'));
        });
        return this.worker;
    }

    private onMessage(message: any): void {
        if (!message || typeof message !== 'object') return;
        if (message.type === 'progress') {
            const ratio = typeof message.ratio === 'number' && Number.isFinite(message.ratio)
                ? Math.max(0, Math.min(1, message.ratio))
                : 0;
            this.options.onProgress?.(ratio, typeof message.timeMs === 'number' ? message.timeMs : 0);
            return;
        }
        if (message.type === 'log') {
            if (typeof message.line === 'string') this.options.onLog?.(message.line);
            return;
        }
        if (message.type === 'ready') {
            this.ready = true;
            const pending = this.pending.get(-1);
            if (pending) {
                clearTimeout(pending.timer);
                this.pending.delete(-1);
                pending.resolve(undefined);
            }
            return;
        }
        if (message.requestId === undefined) return;
        const pending = this.pending.get(message.requestId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(message.requestId);
        if (message.type === 'result') {
            pending.resolve(message.data);
        } else if (message.type === 'error') {
            pending.reject(new FfmpegWorkerError(
                message.code === 'ffmpeg_failed' ? 'ffmpeg_failed' : 'worker_error',
                typeof message.message === 'string' ? message.message : 'FFmpeg worker error',
                typeof message.details === 'string' ? message.details : undefined
            ));
        } else {
            pending.reject(new FfmpegWorkerError('worker_protocol', 'Unexpected FFmpeg worker reply'));
        }
    }

    private failAll(error: Error): void {
        for (const [id, pending] of this.pending) {
            clearTimeout(pending.timer);
            this.pending.delete(id);
            pending.reject(error);
        }
    }

    private request<T>(type: string, payload: Record<string, unknown>, timeoutMs: number, specialId?: number): Promise<T> {
        const worker = this.ensureWorker();
        const id = specialId ?? ++this.requestId;
        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new FfmpegWorkerError('worker_timeout', `FFmpeg worker timed out during ${type}`));
            }, Math.max(1000, timeoutMs));
            this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
            try {
                worker.postMessage({ type, requestId: id, ...payload });
            } catch (error) {
                clearTimeout(timer);
                this.pending.delete(id);
                reject(new FfmpegWorkerError(
                    'worker_protocol',
                    'Could not send a message to the FFmpeg worker',
                    error instanceof Error ? error.message : String(error)
                ));
            }
        });
    }

    /** Load the core and rebuild the split wasm. Idempotent + single-flight. */
    async init(): Promise<void> {
        if (this.ready) return;
        if (!this.initPromise) {
            this.initPromise = this.request<void>('init', { baseUrl: this.baseUrl }, INIT_TIMEOUT_MS, -1)
                .then(() => { this.ready = true; })
                .finally(() => { this.initPromise = null; });
        }
        await this.initPromise;
    }

    async writeFile(name: string, data: Uint8Array): Promise<void> {
        await this.request('write', { name, data }, 60_000);
    }

    async exec(args: string[], timeoutMs = DEFAULT_EXEC_TIMEOUT_MS): Promise<number> {
        const result = await this.request<{ code: number } | number>('exec', { args, timeoutMs }, timeoutMs + 30_000);
        const code = typeof result === 'number' ? result : result?.code;
        if (typeof code !== 'number' || code !== 0) {
            throw new FfmpegWorkerError('ffmpeg_failed', `FFmpeg exited with code ${String(code)}`);
        }
        return code;
    }

    async readFile(name: string): Promise<Uint8Array> {
        const result = await this.request<unknown>('read', { name }, 120_000);
        if (result instanceof Uint8Array) return result;
        if (result instanceof ArrayBuffer) return new Uint8Array(result);
        if (ArrayBuffer.isView(result)) {
            const view = result as ArrayBufferView;
            return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
        }
        throw new FfmpegWorkerError('worker_protocol', 'FFmpeg worker returned no file data');
    }

    async deleteFiles(names: string[]): Promise<void> {
        if (names.length === 0) return;
        await this.request('delete', { names }, 30_000).catch(() => undefined);
    }

    terminate(): void {
        this.terminated = true;
        this.ready = false;
        this.initPromise = null;
        if (this.worker) {
            try { this.worker.terminate(); } catch { /* already gone */ }
            this.worker = null;
        }
        this.failAll(new FfmpegWorkerError('worker_unavailable', 'FFmpeg worker was cancelled'));
    }
}

export default FfmpegWorkerClient;
