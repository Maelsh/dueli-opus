/**
 * @file src/client/ffmpeg/worker.ts
 * @description R4-CHUNK-DOWNLOAD-1: own-origin FFmpeg.wasm classic worker.
 * @module client/ffmpeg/worker
 *
 * Built by `build:client` into `public/static/ffmpeg/worker.js`. It:
 *  - loads the UMD core from the same origin with importScripts;
 *  - downloads the wasm parts listed in `manifest.json` (each < 25 MiB so
 *    Cloudflare Pages accepts them), verifies size + SHA-256, concatenates
 *    them in memory and passes the binary directly to the Emscripten core;
 *  - exposes a tiny typed protocol for write/exec/read/delete;
 *  - streams FFmpeg progress/logs and never uses a CDN.
 *
 * The main thread terminates the worker on cancel, which frees the wasm heap
 * and every temporary FS file without leaving an unbounded background job.
 */

const scope: any = self;

interface WasmManifest {
    version: number;
    core_url: string;
    wasm: {
        total_bytes: number;
        sha256: string;
        parts: Array<{ url: string; bytes: number }>;
    };
}

interface Core {
    FS: {
        writeFile: (name: string, data: Uint8Array) => void;
        readFile: (name: string) => Uint8Array;
        unlink: (name: string) => void;
    };
    exec: (...args: string[]) => void;
    setLogger: (handler: (data: { type: string; message: string }) => void) => void;
    setProgress: (handler: (data: { progress: number; time: number }) => void) => void;
    setTimeout: (timeout: number) => void;
    reset: () => void;
    ret: number;
}

declare function importScripts(...urls: string[]): void;
declare const createFFmpegCore: (config: Record<string, unknown>) => Promise<Core>;

let core: Core | null = null;
let coreLoad: Promise<void> | null = null;

function post(message: Record<string, unknown>, transfer?: Transferable[]): void {
    if (transfer && transfer.length > 0) scope.postMessage(message, transfer);
    else scope.postMessage(message);
}

function toHex(buffer: ArrayBuffer): string {
    return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function fetchWithProgress(url: string, expectedBytes: number, onBytes: (n: number) => void): Promise<Uint8Array> {
    const response = await fetch(url, { credentials: 'same-origin', cache: 'force-cache' });
    if (!response.ok) throw new Error(`Asset fetch failed (${response.status}): ${url}`);
    const declared = Number(response.headers.get('content-length'));
    if (expectedBytes > 0 && Number.isFinite(declared) && declared > expectedBytes) {
        throw new Error(`Asset declares more bytes than expected for ${url}`);
    }
    if (!response.body) {
        const data = new Uint8Array(await response.arrayBuffer());
        if (expectedBytes > 0 && data.length !== expectedBytes) {
            throw new Error(`Asset size mismatch for ${url}`);
        }
        onBytes(data.length);
        return data;
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
            total += value.length;
            if (expectedBytes > 0 && total > expectedBytes) {
                try { await reader.cancel(); } catch { /* already closed */ }
                throw new Error(`Asset exceeded the expected size for ${url}`);
            }
            chunks.push(value);
            onBytes(value.length);
        }
    }
    if (expectedBytes > 0 && total !== expectedBytes) {
        throw new Error(`Asset size mismatch for ${url}: ${total} != ${expectedBytes}`);
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
    }
    return out;
}

async function createCore(baseUrl: string): Promise<void> {
    // `baseUrl` arrives as an app-relative path (e.g. /static/ffmpeg).
    // new URL(relative, relative) is invalid, so resolve it against the
    // worker's own absolute location once, then keep every asset on-origin.
    const base = new URL(`${baseUrl.replace(/\/+$/, '')}/`, self.location.href).toString();
    const manifestResponse = await fetch(new URL('manifest.json', base).toString(), {
        credentials: 'same-origin',
        cache: 'no-cache',
    });
    if (!manifestResponse.ok) throw new Error(`FFmpeg manifest unavailable (${manifestResponse.status})`);
    const manifest = await manifestResponse.json() as WasmManifest;
    if (!manifest || manifest.version !== 1 || !manifest.wasm || !Array.isArray(manifest.wasm.parts)) {
        throw new Error('FFmpeg manifest is invalid');
    }

    const total = manifest.wasm.total_bytes;
    if (!Number.isSafeInteger(total) || total <= 0) {
        throw new Error('FFmpeg manifest declares an invalid wasm size');
    }
    const wasm = new Uint8Array(total);
    let offset = 0;
    let downloaded = 0;
    for (const part of manifest.wasm.parts) {
        const url = new URL(part.url, base).toString();
        const bytes = await fetchWithProgress(url, part.bytes, (n) => {
            downloaded += n;
            post({ type: 'log', line: `wasm ${Math.min(100, Math.round((downloaded / total) * 100))}%` });
        });
        if (offset + bytes.length > total) throw new Error('FFmpeg wasm parts exceed the declared size');
        wasm.set(bytes, offset);
        offset += bytes.length;
    }
    if (offset !== total) throw new Error(`FFmpeg wasm is incomplete (${offset}/${total})`);
    if (manifest.wasm.sha256 && globalThis.crypto?.subtle) {
        const digest = await globalThis.crypto.subtle.digest('SHA-256', wasm);
        if (toHex(digest) !== manifest.wasm.sha256.toLowerCase()) {
            throw new Error('FFmpeg wasm checksum mismatch');
        }
    }

    const coreUrl = new URL(manifest.core_url, base).toString();
    importScripts(coreUrl);

    // Pass the verified bytes directly. A Blob URL would need a wider CSP and
    // an extra copy of the 32 MiB binary; Module.wasmBinary is supported by the
    // Emscripten build and keeps the whole load inside this worker.
    const config = {
        wasmBinary: wasm,
        print: (line: string) => post({ type: 'log', line }),
        printErr: (line: string) => post({ type: 'log', line }),
    };
    core = await createFFmpegCore(config);
    core.setLogger((data) => post({ type: 'log', line: `${data.type}: ${data.message}` }));
    core.setProgress((data) => post({ type: 'progress', ratio: data.progress, timeMs: data.time }));
}

async function loadCore(baseUrl: string): Promise<void> {
    if (core) return;
    if (!coreLoad) {
        coreLoad = createCore(baseUrl).catch((error) => {
            coreLoad = null;
            throw error;
        });
    }
    await coreLoad;
}

async function handle(message: any): Promise<void> {
    const requestId = message?.requestId;
    const type = message?.type;
    try {
        if (type === 'init') {
            await loadCore(String(message.baseUrl || '/static/ffmpeg'));
            post({ type: 'ready', requestId });
            return;
        }
        if (!core) throw new Error('FFmpeg core is not loaded');
        if (type === 'write') {
            const data = message.data instanceof Uint8Array
                ? message.data
                : new Uint8Array(message.data);
            core.FS.writeFile(String(message.name), data);
            post({ type: 'result', requestId, data: { ok: true } });
            return;
        }
        if (type === 'exec') {
            const args = Array.isArray(message.args) ? message.args.map(String) : [];
            const timeoutMs = Number(message.timeoutMs);
            core.setTimeout(Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : -1);
            core.exec(...args);
            const code = typeof core.ret === 'number' ? core.ret : -1;
            core.reset();
            post({ type: 'result', requestId, data: { code } });
            return;
        }
        if (type === 'read') {
            const data = core.FS.readFile(String(message.name));
            const copy = data.slice();
            post({ type: 'result', requestId, data: copy.buffer }, [copy.buffer]);
            return;
        }
        if (type === 'delete') {
            const names = Array.isArray(message.names) ? message.names.map(String) : [];
            for (const name of names) {
                try { core.FS.unlink(name); } catch { /* already removed */ }
            }
            post({ type: 'result', requestId, data: { ok: true } });
            return;
        }
        throw new Error(`Unknown FFmpeg worker message: ${String(type)}`);
    } catch (error) {
        post({
            type: 'error',
            requestId,
            code: type === 'exec' ? 'ffmpeg_failed' : 'worker_error',
            message: error instanceof Error ? error.message : String(error),
            details: error instanceof Error ? error.stack : undefined,
        });
    }
}

scope.addEventListener('message', (event: MessageEvent) => {
    void handle(event.data);
});
