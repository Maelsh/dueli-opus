import { describe, expect, it, vi } from 'vitest';
import {
    DownloadCancelledError,
    DownloadFailedError,
    RecordingDownloadService,
    type DownloadOptions,
} from '../../src/client/services/RecordingDownloadService';
import { FfmpegWorkerClient, FfmpegWorkerError } from '../../src/client/services/FfmpegWorkerClient';
import type { DownloadChunk, DownloadManifest } from '../../src/lib/services/ChunkDownloadManifest';
import {
    Mp4AssemblyError,
    parseTopLevelBoxes,
    type Mp4Box,
} from '../../src/lib/media/Mp4FragmentAssembler';
import { buildDownloadFmp4Chunk, buildDownloadFmp4Init, type Fmp4TrackSpec } from '../helpers/media-fixtures';

const tracks: Fmp4TrackSpec[] = [
    { id: 1, handler: 'vide', timescale: 30000, sampleEntry: 'avc1' },
    { id: 2, handler: 'soun', timescale: 48000, sampleEntry: 'mp4a' },
];
const init = buildDownloadFmp4Init(tracks);
const VIDEO_TIMESCALE = 30000;

function findChild(box: Mp4Box, type: string): Mp4Box | null {
    return box.children?.find((child) => child.type === type) ?? null;
}

/** Video-track tfdt decode times (ms) in moof order — proves assembly timeline, not metadata alone. */
function videoTfdtTimelineMs(blob: Uint8Array): number[] {
    const moofs = parseTopLevelBoxes(blob).filter((b) => b.type === 'moof');
    const out: number[] = [];
    for (const moof of moofs) {
        const trafs = moof.children?.filter((c) => c.type === 'traf') ?? [];
        for (const traf of trafs) {
            const tfhd = findChild(traf, 'tfhd');
            const tfdt = findChild(traf, 'tfdt');
            if (!tfhd || !tfdt) continue;
            const trackId = ((tfhd.data[4] << 24) | (tfhd.data[5] << 16) | (tfhd.data[6] << 8) | tfhd.data[7]) >>> 0;
            if (trackId !== 1) continue;
            const version = tfdt.data[0];
            let baseUnits: number;
            if (version === 1) {
                const hi = ((tfdt.data[4] << 24) | (tfdt.data[5] << 16) | (tfdt.data[6] << 8) | tfdt.data[7]) >>> 0;
                const lo = ((tfdt.data[8] << 24) | (tfdt.data[9] << 16) | (tfdt.data[10] << 8) | tfdt.data[11]) >>> 0;
                baseUnits = hi * 0x100000000 + lo;
            } else {
                baseUnits = ((tfdt.data[4] << 24) | (tfdt.data[5] << 16) | (tfdt.data[6] << 8) | tfdt.data[7]) >>> 0;
            }
            out.push(Math.round((baseUnits * 1000) / VIDEO_TIMESCALE));
            break;
        }
    }
    return out;
}

type AssembleFn = (
    loaded: { chunk: DownloadChunk; data: Uint8Array }[],
    manifest: DownloadManifest,
    report: (p: { phase: string }) => void,
) => { blob: Blob; durationMs: number; integrityVerified: boolean };

function callAssembleMp4(
    service: RecordingDownloadService,
    loaded: { chunk: DownloadChunk; data: Uint8Array }[],
    manifest: DownloadManifest,
) {
    const fn = (service as unknown as { assembleMp4: AssembleFn }).assembleMp4;
    return fn.call(service, loaded, manifest, () => undefined);
}

const chunkBytes = (sequence: number) => buildDownloadFmp4Chunk(init, tracks, {
    sequence,
    timelineStartMs: (sequence - 1) * 5000,
    durationMs: 5000,
    withMfra: true,
});

function makeManifest(overrides: Partial<DownloadManifest> = {}): DownloadManifest {
    const chunks: DownloadChunk[] = [1, 2, 3].map((sequence) => ({
        sequence,
        url: `https://media.example.com/chunk_${sequence}.mp4`,
        bytes: chunkBytes(sequence).length,
        duration_ms: 5000,
        timeline_start_ms: (sequence - 1) * 5000,
        object_hash: null,
        hash_algorithm: null,
        container: 'mp4',
        codec_video: 'h264',
        codec_audio: 'aac',
    }));
    const totalBytes = chunks.reduce((sum, c) => sum + (c.bytes ?? 0), 0);
    return {
        version: 1,
        competition_id: 70,
        role: 'viewer',
        rights: {
            can_download: true,
            republication: 'platform_permission_required',
            notice_key: 'download_ui.rights_viewer',
        },
        status: 'completed',
        finalized: true,
        finalized_at: '2026-10-22T10:00:00.000Z',
        complete: true,
        truncated: false,
        format: 'mp4',
        mode: 'mp4-remux',
        chunks,
        counts: { ready: 3, uploaded: 0, failed: 0, missing: 0, total_sequences: 3 },
        gaps: [],
        unready_sequences: [],
        failed_sequences: [],
        blockers: [],
        total_duration_ms: 15000,
        total_bytes: totalBytes,
        unknown_bytes: false,
        filename_hint: 'dueli_competition_70.mp4',
        generated_at: '2026-10-22T10:01:00.000Z',
        ...overrides,
    };
}

function responseFor(data: Uint8Array, status = 200, contentType = 'video/mp4'): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null) },
        body: null,
        arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    } as unknown as Response;
}

function mediaFetch(): typeof fetch {
    return (async (url: string | URL | Request) => {
        const match = String(url).match(/chunk_(\d+)\.mp4/);
        if (!match) throw new Error(`Unexpected URL ${String(url)}`);
        return responseFor(chunkBytes(Number(match[1])));
    }) as typeof fetch;
}

async function run(manifest: DownloadManifest, options: DownloadOptions = {}, serviceOptions: ConstructorParameters<typeof RecordingDownloadService>[0] = {}) {
    const service = new RecordingDownloadService({ fetchImpl: mediaFetch(), ...serviceOptions });
    return service.download(manifest, { verifyPlayback: false, ...options });
}

describe('R4-CHUNK-DOWNLOAD-1 preflight', () => {
    it('accepts a complete MP4 recording and estimates bounded memory', () => {
        const result = RecordingDownloadService.preflight(makeManifest());
        expect(result.ok).toBe(true);
        expect(result.complete).toBe(true);
        expect(result.partialDownload).toBe(false);
        expect(result.mode).toBe('mp4-remux');
        expect(result.estimatedPeakBytes).toBeGreaterThanOrEqual(result.totalBytes * 2);
        expect(result.estimatedPeakBytes).toBeLessThan(result.heapLimitBytes);
    });

    it('blocks an unfinalized/partial recording unless partial is explicitly allowed', () => {
        const partial = makeManifest({
            complete: false,
            finalized: true,
            chunks: makeManifest().chunks.slice(0, 2),
            gaps: [3],
            blockers: [],
            total_duration_ms: 10000,
        });
        const blocked = RecordingDownloadService.preflight(partial);
        expect(blocked.ok).toBe(false);
        expect(blocked.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'recording_incomplete', message_key: 'download_ui.partial_notice' }),
        ]));
        const allowed = RecordingDownloadService.preflight(partial, { allowPartial: true });
        expect(allowed.ok).toBe(true);
        expect(allowed.partialDownload).toBe(true);
        expect(allowed.notices).toHaveLength(1);

        const unfinalized = makeManifest({ complete: false, finalized: false });
        expect(unfinalized.finalized).toBe(false);
        expect(RecordingDownloadService.preflight(unfinalized, { allowPartial: true }).ok).toBe(false);
    });

    it('blocks WebM/FFmpeg work that cannot fit the measured wasm heap', () => {
        const huge = makeManifest({
            format: 'webm',
            mode: 'ffmpeg',
            total_bytes: 800 * 1024 * 1024,
            chunks: makeManifest().chunks.map((c) => ({ ...c, container: 'webm' as const, bytes: 800 * 1024 * 1024 / 3 })),
        });
        const result = RecordingDownloadService.preflight(huge);
        expect(result.ok).toBe(false);
        expect(result.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'too_large', message_key: 'download_ui.error_heap_limit' }),
        ]));
    });

    it('does not invent a fixed structural MP4 size policy', () => {
        const huge = makeManifest({ total_bytes: 0xffffffff + 1 });
        const result = RecordingDownloadService.preflight(huge);
        expect(result.ok).toBe(true);
        expect(result.estimatedPeakBytes).toBeGreaterThan(result.totalBytes);
    });
});

describe('R4-CHUNK-DOWNLOAD-1 download pipeline', () => {
    it('fetches every chunk independently and produces one valid MP4', async () => {
        const phases: string[] = [];
        const percents: number[] = [];
        const result = await run(makeManifest(), {
            onProgress: (progress) => {
                phases.push(progress.phase);
                percents.push(progress.percent);
            },
        });
        expect(result.partial).toBe(false);
        expect(result.mimeType).toBe('video/mp4');
        expect(result.filename).toBe('dueli_competition_70.mp4');
        expect(result.durationMs).toBe(15000);
        expect(result.integrityVerified).toBe(true);
        expect(result.playbackVerified).toBe(false);
        expect(result.blob.size).toBeGreaterThan(0);
        expect(phases).toEqual(expect.arrayContaining(['fetching', 'assembling', 'finalizing', 'done']));
        expect(phases[phases.length - 1]).toBe('done');
        expect(percents).toEqual([...percents].sort((a, b) => a - b));
        expect(percents[percents.length - 1]).toBe(100);
        const bytes = new Uint8Array(await result.blob.arrayBuffer());
        expect(String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7])).toBe('ftyp');
    });

    it('never relies on the player cache: every chunk URL is requested exactly once', async () => {
        const fetchImpl = vi.fn(mediaFetch());
        const service = new RecordingDownloadService({ fetchImpl });
        await service.download(makeManifest(), { verifyPlayback: false });
        expect(fetchImpl).toHaveBeenCalledTimes(3);
        const urls = fetchImpl.mock.calls.map((call) => String(call[0]));
        expect(urls).toEqual([
            'https://media.example.com/chunk_1.mp4',
            'https://media.example.com/chunk_2.mp4',
            'https://media.example.com/chunk_3.mp4',
        ]);
    });

    it('retries a retryable HTTP failure then succeeds', async () => {
        let calls = 0;
        const fetchImpl = (async (url: string | URL | Request) => {
            calls++;
            if (calls === 1) return responseFor(new Uint8Array(), 500);
            const match = String(url).match(/chunk_(\d+)\.mp4/);
            return responseFor(chunkBytes(Number(match![1])));
        }) as typeof fetch;
        const service = new RecordingDownloadService({ fetchImpl });
        const result = await service.download(makeManifest(), { verifyPlayback: false, retries: 1 });
        expect(calls).toBe(4); // first chunk retried once, then chunks 2 and 3
        expect(result.blob.size).toBeGreaterThan(0);
    });

    it('fails after the bounded retry budget', async () => {
        const fetchImpl = (async () => responseFor(new Uint8Array(), 503)) as typeof fetch;
        const service = new RecordingDownloadService({ fetchImpl });
        await expect(service.download(makeManifest(), { verifyPlayback: false, retries: 1 }))
            .rejects.toMatchObject({ code: 'chunk_fetch_failed' });
    });

    it('aborts a stalled chunk at the per-request timeout', async () => {
        const fetchImpl = ((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
            const abort = () => {
                const error = new Error('timed out');
                error.name = 'AbortError';
                reject(error);
            };
            if (init?.signal?.aborted) abort();
            else init?.signal?.addEventListener('abort', abort, { once: true });
        })) as typeof fetch;
        const service = new RecordingDownloadService({ fetchImpl });
        await expect(service.download(makeManifest(), {
            verifyPlayback: false,
            retries: 0,
            requestTimeoutMs: 25,
        })).rejects.toMatchObject({ code: 'chunk_fetch_failed' });
    });

    it('rejects a chunk whose verified SHA-256 does not match', async () => {
        const manifest = makeManifest();
        manifest.chunks[0] = {
            ...manifest.chunks[0],
            object_hash: 'b'.repeat(64),
            hash_algorithm: 'sha256',
        };
        const service = new RecordingDownloadService({ fetchImpl: mediaFetch() });
        await expect(service.download(manifest, { verifyPlayback: false, retries: 0 }))
            .rejects.toMatchObject({ code: 'chunk_integrity_failed', sequence: 1 });
    });

    it('cancels during fetch and reports cancellation, not a partial file', async () => {
        const fetchImpl = ((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
            const abort = () => {
                const error = new Error('aborted');
                error.name = 'AbortError';
                reject(error);
            };
            if (init?.signal?.aborted) abort();
            else init?.signal?.addEventListener('abort', abort, { once: true });
        })) as typeof fetch;
        const service = new RecordingDownloadService({ fetchImpl });
        const promise = service.download(makeManifest(), { verifyPlayback: false });
        await new Promise((resolve) => setTimeout(resolve, 10));
        service.cancel();
        await expect(promise).rejects.toBeInstanceOf(DownloadCancelledError);
    });

    it('cancels during FFmpeg processing and terminates the worker', async () => {
        const manifest = makeManifest({
            format: 'webm',
            mode: 'ffmpeg',
            chunks: makeManifest().chunks.map((chunk) => ({ ...chunk, container: 'webm' as const })),
        });
        let terminated = false;
        let resolveExec: () => void = () => undefined;
        const execPosted = new Promise<void>((resolve) => { resolveExec = resolve; });
        const listeners: Record<string, Array<(event: MessageEvent) => void>> = {};
        const fakeWorker = {
            addEventListener: (type: string, listener: (event: MessageEvent) => void) => {
                (listeners[type] ??= []).push(listener);
            },
            postMessage: (message: any) => {
                const reply = (data: unknown) => {
                    setTimeout(() => {
                        for (const listener of listeners.message ?? []) {
                            listener({ data } as MessageEvent);
                        }
                    }, 0);
                };
                if (message.type === 'init') reply({ type: 'ready', requestId: -1 });
                else if (message.type === 'exec') resolveExec();
                else reply({ type: 'result', requestId: message.requestId, data: { ok: true } });
            },
            terminate: () => { terminated = true; },
        } as unknown as Worker;
        const service = new RecordingDownloadService({
            fetchImpl: mediaFetch(),
            workerFactory: () => fakeWorker,
        });
        const promise = service.download(manifest, { verifyPlayback: false });
        await execPosted;
        service.cancel();
        await expect(promise).rejects.toBeInstanceOf(DownloadCancelledError);
        expect(terminated).toBe(true);
    });

    it('maps a worker load failure to an explicit ffmpeg_unavailable error', async () => {
        const manifest = makeManifest({
            format: 'webm',
            mode: 'ffmpeg',
            chunks: makeManifest().chunks.map((chunk) => ({ ...chunk, container: 'webm' as const })),
        });
        const service = new RecordingDownloadService({
            fetchImpl: mediaFetch(),
            workerFactory: () => { throw new Error('CSP blocked worker'); },
            onLog: () => undefined,
        });
        await expect(service.download(manifest, { verifyPlayback: false }))
            .rejects.toMatchObject({ code: 'ffmpeg_unavailable' });
    });

    it('transcodes the FFmpeg path instead of unsafe stream-copying', async () => {
        const manifest = makeManifest({
            format: 'webm',
            mode: 'ffmpeg',
            chunks: makeManifest().chunks.map((chunk) => ({
                ...chunk,
                container: 'webm' as const,
                codec_video: 'vp9',
                codec_audio: 'opus',
            })),
        });
        let execArgs: string[] = [];
        const listeners: Record<string, Array<(event: MessageEvent) => void>> = {};
        const fakeWorker = {
            addEventListener: (type: string, listener: (event: MessageEvent) => void) => {
                (listeners[type] ??= []).push(listener);
            },
            postMessage: (message: any) => {
                const reply = (data: unknown) => {
                    setTimeout(() => {
                        for (const listener of listeners.message ?? []) {
                            listener({ data } as MessageEvent);
                        }
                    }, 0);
                };
                if (message.type === 'init') reply({ type: 'ready', requestId: -1 });
                else if (message.type === 'exec') {
                    execArgs = message.args;
                    reply({ type: 'result', requestId: message.requestId, data: { code: 0 } });
                } else if (message.type === 'read') {
                    reply({ type: 'result', requestId: message.requestId, data: init.buffer.slice(0) });
                } else {
                    reply({ type: 'result', requestId: message.requestId, data: { ok: true } });
                }
            },
            terminate: () => undefined,
        } as unknown as Worker;
        const service = new RecordingDownloadService({
            fetchImpl: mediaFetch(),
            workerFactory: () => fakeWorker,
        });
        const result = await service.download(manifest, { verifyPlayback: false });
        expect(result.durationMs).toBe(15000);
        expect(execArgs).toEqual(expect.arrayContaining(['-c:v', 'libx264', '-c:a', 'aac']));
        expect(execArgs.join(' ')).not.toContain('-c copy');
    });

    it('UNIT35.1 remuxes complete MP4 when byte duration corrects inflated D1 on an earlier chunk', async () => {
        const realMs = 5000;
        const inflatedD1 = 60000;
        const data1 = buildDownloadFmp4Chunk(init, tracks, {
            sequence: 1,
            timelineStartMs: 0,
            durationMs: realMs,
            withMfra: true,
        });
        const data2 = buildDownloadFmp4Chunk(init, tracks, {
            sequence: 2,
            timelineStartMs: realMs,
            durationMs: realMs,
            withMfra: true,
        });
        const chunks: DownloadChunk[] = [
            {
                sequence: 1,
                url: 'https://media.example.com/chunk_1.mp4',
                bytes: data1.length,
                duration_ms: inflatedD1,
                timeline_start_ms: 0,
                object_hash: null,
                hash_algorithm: null,
                container: 'mp4',
                codec_video: 'h264',
                codec_audio: 'aac',
            },
            {
                sequence: 2,
                url: 'https://media.example.com/chunk_2.mp4',
                bytes: data2.length,
                duration_ms: realMs,
                timeline_start_ms: inflatedD1,
                object_hash: null,
                hash_algorithm: null,
                container: 'mp4',
                codec_video: 'h264',
                codec_audio: 'aac',
            },
        ];
        const totalBytes = chunks.reduce((sum, c) => sum + (c.bytes ?? 0), 0);
        const manifest = makeManifest({
            chunks,
            total_bytes: totalBytes,
            total_duration_ms: inflatedD1 + realMs,
            complete: true,
        });
        const fetchImpl = (async (url: string | URL | Request) => {
            if (String(url).includes('chunk_1')) return responseFor(data1);
            if (String(url).includes('chunk_2')) return responseFor(data2);
            throw new Error(`Unexpected URL ${String(url)}`);
        }) as typeof fetch;
        const service = new RecordingDownloadService({ fetchImpl });
        const result = await service.download(manifest, { verifyPlayback: false });
        expect(result.durationMs).toBe(realMs * 2);
        expect(result.partial).toBe(false);
        const bytes = new Uint8Array(await result.blob.arrayBuffer());
        expect(videoTfdtTimelineMs(bytes)).toEqual([0, realMs]);
        const tfdt = videoTfdtTimelineMs(bytes);
        for (let i = 1; i < tfdt.length; i++) {
            expect(tfdt[i]).toBeGreaterThanOrEqual(tfdt[i - 1]!);
        }
    });

    it('UNIT35.1 rejects a complete manifest whose D1 timeline is internally inconsistent (structural guard)', async () => {
        const data1 = chunkBytes(1);
        const data2 = chunkBytes(2);
        const chunks: DownloadChunk[] = [
            { ...makeManifest().chunks[0], timeline_start_ms: 0, duration_ms: 5000, bytes: data1.length },
            { ...makeManifest().chunks[1], timeline_start_ms: 1000, duration_ms: 5000, bytes: data2.length },
        ];
        const manifest = makeManifest({ chunks, total_duration_ms: 10000, complete: true });
        const loaded = [
            { chunk: chunks[0], data: data1 },
            { chunk: chunks[1], data: data2 },
        ];
        const service = new RecordingDownloadService({ fetchImpl: mediaFetch() });
        let caught: unknown = null;
        try {
            callAssembleMp4(service, loaded, manifest);
        } catch (error) {
            caught = error;
        }
        expect(caught).toBeInstanceOf(Mp4AssemblyError);
        expect((caught as Mp4AssemblyError).code).toBe('schedule_non_monotonic');
    });
});

describe('R4-CHUNK-DOWNLOAD-1 FFmpeg worker transport', () => {
    it('reports an unavailable worker (including CSP/static load failure)', async () => {
        const client = new FfmpegWorkerClient({ workerFactory: () => { throw new Error('blocked'); } });
        await expect(client.init()).rejects.toMatchObject({ code: 'worker_unavailable' });
        expect(client).toBeInstanceOf(FfmpegWorkerClient);
    });

    it('single-flights concurrent init calls', async () => {
        let posts = 0;
        const listeners: Record<string, Array<(event: MessageEvent) => void>> = {};
        const fakeWorker = {
            addEventListener: (type: string, listener: (event: MessageEvent) => void) => {
                (listeners[type] ??= []).push(listener);
            },
            postMessage: (message: { requestId: number }) => {
                posts++;
                setTimeout(() => {
                    for (const listener of listeners.message ?? []) {
                        listener({ data: { type: 'ready', requestId: message.requestId } } as MessageEvent);
                    }
                }, 0);
            },
            terminate: () => undefined,
        } as unknown as Worker;
        const client = new FfmpegWorkerClient({ workerFactory: () => fakeWorker });
        await Promise.all([client.init(), client.init(), client.init()]);
        expect(posts).toBe(1);
    });
});
