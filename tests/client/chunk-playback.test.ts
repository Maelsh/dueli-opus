/**
 * R4-CHUNK-PLAY-1 — behavioral tests for the inline audience classes
 * (ChunkManager / LiveSequentialPlayer / SmartVodPlayer) shipped by
 * src/modules/pages/live/scripts/client/shared.ts to BOTH the competition
 * embedded viewer and the test viewer page (single source).
 *
 * The classes are evaluated from the REAL emitted script with stubbed
 * browser globals (fetch/window/localStorage/document/URL) — no source-text
 * assertions for behavior, only for static bounds. Proven:
 *  - existence comes from ONE CORS-safe proxy read (no per-chunk CORS HEAD);
 *  - ordering/gaps/late chunks follow playlist entry indices (never list
 *    length), with bounded gap-skipping and growing backoff;
 *  - VOD rejects upstream failures and non-video/empty chunks loudly;
 *  - sequential playback errors are bounded (fatal + stop, no endless loop).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getClientSharedScript } from '../../src/modules/pages/live/scripts/client/shared';

const realFetch = globalThis.fetch;

interface UpstreamPlaylist {
    chunks: Array<{ index: number; url: string; duration?: number; size?: number }>;
    extension?: string;
    upstream?: string;
}

let playlist: UpstreamPlaylist = { chunks: [] };
let fetchLog: string[] = [];
let chunkContentType = 'video/webm';
let chunkBytes = 2048;

function headersStub() {
    return { get: (name: string) => (String(name).toLowerCase() === 'content-type' ? chunkContentType : null) };
}

function installEvalGlobals() {
    fetchLog = [];
    (globalThis as any).fetch = async (url: any, init?: any) => {
        const u = String(url);
        fetchLog.push(`${init?.method || 'GET'} ${u}`);
        if (u.includes('/api/chunks/playlist/')) {
            return {
                ok: true,
                json: async () => ({
                    success: true, id: 9, chunks: playlist.chunks,
                    extension: playlist.extension ?? 'webm', upstream: playlist.upstream ?? 'ok',
                }),
            };
        }
        return {
            ok: true,
            headers: headersStub(),
            arrayBuffer: async () => new Uint8Array(chunkBytes).buffer as ArrayBuffer,
        };
    };
}

function loadClasses() {
    const src: string = getClientSharedScript('en');
    const sandbox: Record<string, any> = {};
    const stubDocument = { getElementById: () => null, createElement: () => ({}), addEventListener: () => {}, removeEventListener: () => {} };
    const stubLocalStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    const stubURL = { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} };
    const factory = new Function(
        'window', 'document', 'localStorage', 'fetch', 'URL',
        `${src}\nreturn { ChunkManager, LiveSequentialPlayer, SmartVodPlayer };`,
    );
    // NOTE: fetch is passed as a live delegate (not a snapshot) so tests may
    // reprogram the global mock between polls — exactly like the browser.
    const liveFetch = (...args: any[]) => (globalThis as any).fetch(...args);
    return factory(sandbox, stubDocument, stubLocalStorage, liveFetch, stubURL) as {
        ChunkManager: any; LiveSequentialPlayer: any; SmartVodPlayer: any;
    };
}

beforeEach(() => {
    playlist = { chunks: [] };
    chunkContentType = 'video/webm';
    chunkBytes = 2048;
    installEvalGlobals();
    vi.useRealTimers();
});

afterEach(() => {
    globalThis.fetch = realFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
});

const streamUrl = (n: number) => `https://cdn.example/live/match_9/chunk_${String(n).padStart(4, '0')}.mp4`;

describe('R4-CHUNK-PLAY-1 ChunkManager (playlist-driven)', () => {
    it('1. existence comes from ONE proxy read — no per-chunk CORS HEAD', async () => {
        const { ChunkManager } = loadClasses();
        playlist = { chunks: [{ index: 0, url: streamUrl(1) }], extension: 'mp4' };
        const cm = new ChunkManager(9, 'mp4');
        expect(await cm.exists(0)).toBe(true);
        expect(await cm.exists(1)).toBe(false);
        expect(fetchLog.filter((l) => l.includes('/api/chunks/playlist/9')).length).toBe(2);
        expect(fetchLog.some((l) => l.startsWith('HEAD'))).toBe(false);
        expect(fetchLog.some((l) => l.includes('maelshpro.com'))).toBe(false);
        expect(cm.extension).toBe('mp4');
    });

    it('2. ordering follows entry indices (never list length)', async () => {
        const { ChunkManager } = loadClasses();
        playlist = { chunks: [{ index: 5, url: streamUrl(6) }, { index: 6, url: streamUrl(7) }] };
        const cm = new ChunkManager(9, 'mp4');
        expect(await cm.waitForNextChunk(5)).toBe(5);
        expect(await cm.waitForNextChunk(5)).toBe(6);
        expect(cm.getUrl(5)).toBe(streamUrl(6)); // playlist URL, not constructed
    });

    it('3. gaps are skipped (counted) while the server lists later chunks', async () => {
        const { ChunkManager } = loadClasses();
        playlist = { chunks: [{ index: 0, url: streamUrl(1) }, { index: 2, url: streamUrl(3) }] };
        const cm = new ChunkManager(9, 'mp4');
        expect(await cm.waitForNextChunk(5)).toBe(0);
        expect(await cm.waitForNextChunk(5)).toBe(2); // index 1 missing → skipped, no stall
    });

    it('4. late chunks are picked up (waits, never 404-dies)', async () => {
        const { ChunkManager } = loadClasses();
        const cm = new ChunkManager(9, 'mp4');
        let polls = 0;
        (globalThis as any).fetch = async (url: any) => {
            const u = String(url);
            if (u.includes('/api/chunks/playlist/')) {
                polls++;
                return {
                    ok: true,
                    json: async () => ({
                        success: true, id: 9,
                        chunks: polls >= 3 ? [{ index: 0, url: streamUrl(1) }] : [],
                        extension: 'mp4', upstream: 'ok',
                    }),
                };
            }
            return { ok: true, headers: headersStub(), arrayBuffer: async () => new Uint8Array(8).buffer };
        };
        expect(await cm.waitForNextChunk(6)).toBe(0);
        expect(polls).toBeGreaterThanOrEqual(3);
    });

    it('5. skipToLatest uses entry indices (gap-safe), not list length', async () => {
        const { ChunkManager } = loadClasses();
        playlist = {
            chunks: [
                { index: 0, url: streamUrl(1) },
                { index: 1, url: streamUrl(2) },
                { index: 5, url: streamUrl(6) },
            ],
        };
        const cm = new ChunkManager(9, 'mp4');
        expect(await cm.skipToLatest()).toBe(1); // second-to-last ENTRY index
    });

    it('6. a deep hole ends the stream (bounded, MAX_GAP_SKIP)', async () => {
        const { ChunkManager } = loadClasses();
        playlist = { chunks: [{ index: 0, url: streamUrl(1) }, { index: 100, url: streamUrl(101) }] };
        const cm = new ChunkManager(9, 'mp4');
        expect(await cm.waitForNextChunk(5)).toBe(0);
        // Indices 1..50 skip (counted gaps); the 51st missing index ends it.
        await expect(cm.waitForNextChunk(0)).rejects.toThrow('STREAM_ENDED');
    });
});

describe('R4-CHUNK-PLAY-1 SmartVodPlayer validation', () => {
    function makePlayer(overrides: any = {}) {
        const { SmartVodPlayer } = loadClasses();
        const video = {
            src: '', load: async () => {}, play: async () => {}, pause: () => {},
            muted: false, currentTime: 0, onended: null as any, ontimeupdate: null as any,
        };
        const player = new SmartVodPlayer({ videoElement: video, competitionId: 9, ...overrides });
        return { player, video };
    }

    it('7. rejects HTML soft-404 and empty chunks loudly (never video)', async () => {
        const { player } = makePlayer();
        player.chunks = [{ index: 0, url: 'https://cdn.example/c.mp4' }];
        chunkContentType = 'text/html';
        await expect(player.loadChunk(0)).rejects.toThrow(/HTML, not video/);
        expect(player.loadedChunks[0]).toBeUndefined();

        chunkContentType = 'video/mp4';
        chunkBytes = 0;
        await expect(player.loadChunk(0)).rejects.toThrow(/empty/i);
    });

    it('8. rejects upstream failure before any playback attempt', async () => {
        const errors: Error[] = [];
        const played: string[] = [];
        const { player, video } = makePlayer({
            playlistData: { chunks: [], upstream: 'invalid' },
            onError: (e: Error) => errors.push(e),
        });
        video.play = async () => { played.push('play'); };
        await player.start();
        expect(errors.length).toBe(1);
        expect(played).toEqual([]); // never attempted playback
    });

    it('9. plays a valid single-chunk playlist (control: validation does not block video)', async () => {
        const ready: any[] = [];
        const { player } = makePlayer({
            playlistData: { chunks: [{ index: 0, url: 'https://cdn.example/c.mp4' }], extension: 'mp4', upstream: 'ok' },
            onReady: (info: any) => ready.push(info),
            onError: (e: Error) => { throw e; },
        });
        chunkContentType = 'video/mp4';
        await player.start();
        expect(ready.length).toBe(1);
        expect(ready[0].chunks).toBe(1);
    });
});

describe('R4-CHUNK-PLAY-1 LiveSequentialPlayer bounds', () => {
    function stubVideo() {
        return {
            src: '', style: {} as any,
            load: async () => {},
            play: async () => {},
            pause: () => {},
            oncanplay: null as any,
            onerror: null as any,
        };
    }

    it('10. STREAM_ENDED stops cleanly via onStreamEnd (existing bound kept)', async () => {
        const { LiveSequentialPlayer } = loadClasses();
        const ended: string[] = [];
        const player = new LiveSequentialPlayer({
            videoPlayers: [stubVideo(), stubVideo()],
            chunkManager: { waitForNextChunk: async () => { throw new Error('STREAM_ENDED'); } },
            onStreamEnd: () => ended.push('end'),
            onError: () => { throw new Error('must not be called for STREAM_ENDED'); },
        });
        player.isRunning = true;
        await player.runLoop();
        expect(ended).toEqual(['end']);
        expect(player.isRunning).toBe(false);
    });

    it('11. an all-poisoned stream still ends fatally (skips do not reset the fatal bound)', async () => {
        vi.useFakeTimers();
        const { LiveSequentialPlayer } = loadClasses();
        const errors: Error[] = [];
        const badVideo = () => {
            const v = stubVideo();
            v.load = async () => { throw new Error('poisoned chunk'); };
            return v;
        };
        let next = 0;
        const player = new LiveSequentialPlayer({
            videoPlayers: [badVideo(), badVideo()],
            chunkManager: { waitForNextChunk: async () => next++, getUrl: (i: number) => `https://cdn.example/c${i}` },
            onError: (e: Error) => errors.push(e),
        });
        player.MAX_CONSECUTIVE_ERRORS = 6;
        player.MAX_CHUNK_RETRIES = 3;
        player.isRunning = true;
        const run = player.runLoop();
        await vi.advanceTimersByTimeAsync(300000);
        await run;
        expect(player.isRunning).toBe(false);
        expect(errors[errors.length - 1].message).toMatch(/Too many consecutive playback errors/);
    });

    it('12. a poisoned chunk is skipped after retries — the tail keeps flowing', async () => {
        vi.useFakeTimers();
        const { LiveSequentialPlayer } = loadClasses();
        const played: number[] = [];
        const statuses: string[] = [];
        const flakyVideo = () => {
            const v = stubVideo() as any;
            v.load = async () => {
                if (String(v.src).includes('chunk_0')) throw new Error('poison');
            };
            return v;
        };
        const fakeManager = {
            currentIndex: -1,
            waitForNextChunk: async function (this: any) { return this.currentIndex + 1; },
            getUrl: (i: number) => `https://cdn.example/chunk_${i}`,
        };
        const player = new LiveSequentialPlayer({
            videoPlayers: [flakyVideo(), flakyVideo()],
            chunkManager: fakeManager,
            onChunkChange: (index: number) => {
                played.push(index);
                if (index === 1) player.stop();
            },
            onStatus: (s: string) => statuses.push(s),
            onError: () => {},
        });
        player.MAX_CHUNK_RETRIES = 3;
        player.isRunning = true;
        const run = player.runLoop();
        await vi.advanceTimersByTimeAsync(120000);
        await run;
        expect(statuses.join('|')).toMatch(/Skipping unplayable chunk 1/);
        expect(played).toContain(1); // tail flowed despite the poisoned head
    });
});
