/**
 * R4-CHUNK-VIEW-RECOVERY-1 (row 28.4) — REMOTE #2 remediation: LIVE initial
 * wait must be TERMINABLE when a recording FINALIZES with no playable chunk.
 *
 * Root cause (CONFIRMED): the playlist route emits the recording final marker
 * ONLY as index_metadata.finalized, but ChunkManager.refreshPlaylist() ignored
 * it, and LiveSequentialPlayer.start() → waitForNextChunk() runs the FIRST wait
 * with maxMisses=0 (wait forever). A session that finalized with zero playable
 * chunks therefore spun forever (onStreamEnd never fired).
 *
 * These tests evaluate the REAL emitted script (getClientSharedScript) with
 * stubbed browser globals and PROVE at the CONSUMER level:
 *  - index_metadata.finalized REACHES ChunkManager (this.finalized);
 *  - finalized + zero playable → waitForNextChunk() terminates (RECORDING_ENDED),
 *    no eternal spinner;
 *  - a NOT-finalized broadcast keeps waiting (absence of chunks is NOT end) and
 *    plays the first chunk that arrives later — a slow first chunk is never
 *    killed by a timeout;
 *  - finalized + playable content present still PLAYS (no false termination of
 *    the common ended-with-content case);
 *  - start()/runLoop surface the clean ended state via onStatus(AR/EN)+onStreamEnd
 *    (never an onError consecutive-error).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getClientSharedScript } from '../../src/modules/pages/live/scripts/client/shared';
import { translations, getUILanguage } from '../../src/i18n';

const realFetch = globalThis.fetch;
const ENDED_EN = translations[getUILanguage('en')].live_signaling.recording_ended;

function loadClasses(lang: 'en' | 'ar' = 'en') {
    const src: string = getClientSharedScript(lang);
    const sandbox: Record<string, any> = {};
    const stubDocument = { getElementById: () => null, createElement: () => ({ appendChild() {}, classList: { add() {}, remove() {} } }), addEventListener: () => {}, removeEventListener: () => {} };
    const stubLocalStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    const stubURL = { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} };
    const factory = new Function('window', 'document', 'localStorage', 'fetch', 'URL', `${src}\nreturn { ChunkManager, LiveSequentialPlayer, SmartVodPlayer };`);
    const liveFetch = (...args: any[]) => (globalThis as any).fetch(...args);
    return factory(sandbox, stubDocument, stubLocalStorage, liveFetch, stubURL) as { ChunkManager: any; LiveSequentialPlayer: any; SmartVodPlayer: any };
}

/** Fetch stub serving the proxy playlist from a plan fn (called per poll). */
function installPlaylist(plan: (poll: number) => { chunks: any[]; finalized: boolean }) {
    let poll = 0;
    (globalThis as any).fetch = async (url: any) => {
        const u = String(url);
        if (u.includes('/api/chunks/playlist/')) {
            poll++;
            const p = plan(poll);
            return { ok: true, json: async () => ({ success: true, id: 9, chunks: p.chunks, extension: 'mp4', index_metadata: { finalized: p.finalized }, upstream: 'ok' }) };
        }
        return { ok: true, headers: { get: () => 'video/mp4' }, arrayBuffer: async () => new Uint8Array(4).buffer as ArrayBuffer };
    };
    return () => poll;
}

beforeEach(() => {
    installPlaylist(() => ({ chunks: [], finalized: false }));
    vi.useRealTimers();
});
afterEach(() => {
    globalThis.fetch = realFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('R4-CHUNK-VIEW-RECOVERY-1 — final marker REACHES the player (consumer level)', () => {
    it('1. index_metadata.finalized is read into ChunkManager.finalized', async () => {
        installPlaylist(() => ({ chunks: [], finalized: true }));
        const { ChunkManager } = loadClasses();
        const cm = new ChunkManager(9, 'mp4');
        expect(cm.finalized).toBe(false); // default before any read
        await cm.refreshPlaylist();
        expect(cm.finalized).toBe(true); // proven at the consumer, not inferred from the producer
    });

    it('1b. legacy proxies without index_metadata keep finalized=false (no false end)', async () => {
        (globalThis as any).fetch = async (url: any) => {
            if (String(url).includes('/api/chunks/playlist/')) {
                return { ok: true, json: async () => ({ success: true, id: 9, chunks: [{ index: 0, url: 'https://cdn.example/chunk_0001.mp4' }], extension: 'mp4' }) };
            }
            return { ok: true, headers: { get: () => 'video/mp4' }, arrayBuffer: async () => new Uint8Array(4).buffer };
        };
        const { ChunkManager } = loadClasses();
        const cm = new ChunkManager(9, 'mp4');
        await cm.refreshPlaylist();
        expect(cm.finalized).toBe(false);
    });
});

describe('R4-CHUNK-VIEW-RECOVERY-1 — terminable wait (no eternal spinner)', () => {
    it('2. finalized + zero playable → waitForNextChunk() REJECTS (RECORDING_ENDED)', async () => {
        installPlaylist(() => ({ chunks: [], finalized: true }));
        const { ChunkManager } = loadClasses();
        const cm = new ChunkManager(9, 'mp4');
        await expect(cm.waitForNextChunk()).rejects.toThrow('RECORDING_ENDED');
    });

    it('3. live + NOT finalized + zero chunks → keeps waiting, plays the first chunk that arrives later', async () => {
        const getPoll = installPlaylist((poll) => (poll >= 3 ? { chunks: [{ index: 0, url: 'https://cdn.example/chunk_0001.mp4', ready: true }], finalized: false } : { chunks: [], finalized: false }));
        vi.useFakeTimers();
        const { ChunkManager } = loadClasses();
        const cm = new ChunkManager(9, 'mp4');
        const waiting = cm.waitForNextChunk(); // maxMisses=0 — must NOT terminate on empties
        await vi.advanceTimersByTimeAsync(20000); // run through backoff polls; first chunk arrives at poll 3
        const idx = await waiting;
        expect(idx).toBe(0);
        expect(getPoll()).toBeGreaterThanOrEqual(3); // proof: it waited multiple polls (no timeout-kill)
    });

    it('4. finalized + playable content present → still PLAYS (no false termination of ended-with-content)', async () => {
        installPlaylist(() => ({ chunks: [{ index: 0, url: 'https://cdn.example/chunk_0001.mp4', ready: true }], finalized: true }));
        const { ChunkManager } = loadClasses();
        const cm = new ChunkManager(9, 'mp4');
        await expect(cm.waitForNextChunk()).resolves.toBe(0); // content found before the finalized check
    });
});

describe('R4-CHUNK-VIEW-RECOVERY-1 — clean ended state to consumers (not an error)', () => {
    it('5. start({startFromLatest}) + finalized + zero → onStreamEnd, isRunning=false, AR/EN status, no throw', async () => {
        installPlaylist(() => ({ chunks: [], finalized: true }));
        const { LiveSequentialPlayer } = loadClasses();
        const statuses: string[] = [];
        let ended = 0;
        let errored = 0;
        const player = new LiveSequentialPlayer({
            videoPlayers: [],
            chunkManager: new (loadClasses().ChunkManager)(9, 'mp4'),
            onStatus: (s: string) => statuses.push(s),
            onStreamEnd: () => { ended++; },
            onError: () => { errored++; },
        });
        await player.start({ startFromLatest: true }); // must resolve, never hang, never reject
        expect(errored).toBe(0); // not a playback error
        expect(ended).toBe(1); // clean end handed to the consumer (→ VOD/not-available)
        expect(player.isRunning).toBe(false);
        expect(statuses[statuses.length - 1]).toBe(ENDED_EN); // clear AR/EN message
    });

    it('5b. same, Arabic locale, surfaces the Arabic ended message', async () => {
        const ENDED_AR = translations[getUILanguage('ar')].live_signaling.recording_ended;
        installPlaylist(() => ({ chunks: [], finalized: true }));
        const { LiveSequentialPlayer, ChunkManager } = loadClasses('ar');
        const statuses: string[] = [];
        const player = new LiveSequentialPlayer({
            videoPlayers: [],
            chunkManager: new ChunkManager(9, 'mp4'),
            onStatus: (s: string) => statuses.push(s),
            onStreamEnd: () => {},
            onError: () => { throw new Error('must not error'); },
        });
        await player.start({ startFromLatest: true });
        expect(statuses[statuses.length - 1]).toBe(ENDED_AR);
        expect(ENDED_AR).not.toBe(ENDED_EN); // actually localized
    });

    it('6. runLoop: RECORDING_ENDED ends cleanly via onStreamEnd (never a consecutive error)', async () => {
        const { LiveSequentialPlayer } = loadClasses();
        let ended = 0;
        let errored = 0;
        const player = new LiveSequentialPlayer({
            videoPlayers: [],
            chunkManager: { waitForNextChunk: async () => { throw new Error('RECORDING_ENDED'); } },
            onStreamEnd: () => { ended++; },
            onError: () => { errored++; },
        });
        player.isRunning = true;
        await player.runLoop();
        expect(errored).toBe(0);
        expect(ended).toBe(1);
        expect(player.isRunning).toBe(false);
    });
});
