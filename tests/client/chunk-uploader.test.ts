/**
 * R4-CHUNK-PLAY-1 — ChunkUploader behavioral tests (host-only upload path).
 *
 * The uploader is DOM-free: only fetch/FormData/Blob/timers are mocked.
 * Proven behaviors:
 *  - resume numbering AFTER the highest saved server index (no overwrite);
 *  - bounded queue (overflow drops the oldest, counted — proven pattern);
 *  - numbering dense: same-number retry (idempotent), advance on success;
 *  - waitForUploads drains before finalize; finalize runs once per session;
 *  - explicit stats (uploaded/pending/dropped/failed/nextNumber).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChunkUploader, type RecordingLeaseHandle } from '../../src/client/services/ChunkUploader';

const realFetch = globalThis.fetch;
let calls: { url: string; body?: any }[] = [];
let uploadBehavior: (n: number, attempt: number) => 'ok' | 'fail' = () => 'ok';
let playlistChunks: any[] = [];
const attempts: Record<number, number> = {};

const bigBlob = () => mediaBlob();
const pureInitBlob = () => new Blob([new Uint8Array(2048)], { type: 'video/webm' });

/** Media blob: fake ftyp head + 'moof' marker (mp4-plausible fragment). */
function mediaBlob() {
    const bytes = new Uint8Array(2048);
    bytes[4] = 0x66; bytes[5] = 0x74; bytes[6] = 0x79; bytes[7] = 0x70; // 'ftyp'
    bytes[100] = 0x6d; bytes[101] = 0x6f; bytes[102] = 0x6f; bytes[103] = 0x66; // 'moof'
    return new Blob([bytes], { type: 'video/mp4' });
}

function installFetch() {
    calls = [];
    for (const k of Object.keys(attempts)) delete attempts[k];
    (globalThis as any).fetch = async (url: any, init?: any) => {
        const u = String(url);
        if (u.includes('/api/chunks/playlist/')) {
            calls.push({ url: u });
            return { ok: true, json: async () => ({ success: true, chunks: playlistChunks }) };
        }
        // R4-CHUNK-UPLOAD-SAFE-1: uploads are key-mandatory now — the mock
        // issues bound keys (mock-infra follows the owner-ordered behavior).
        if (u.includes('/api/chunks/register')) {
            const body = JSON.parse(String(init?.body || '{}'));
            calls.push({ url: `${u}#${body.chunk_index}` });
            return { ok: true, json: async () => ({ success: true, data: { chunk_key: `k-${body.chunk_index}`, sequence: body.chunk_index, lease_generation: 1 } }) };
        }
        if (u.includes('/upload.php')) {
            const body = init?.body as FormData;
            const num = Number((body.get('chunk_number') as string) || 0);
            if (!body.get('chunk_key')) throw new Error('keyless upload reached the mock');
            attempts[num] = (attempts[num] || 0) + 1;
            calls.push({ url: `${u}#${num}@${attempts[num]}` });
            if (uploadBehavior(num, attempts[num]) === 'ok') {
                return { ok: true, json: async () => ({ success: true }) };
            }
            return { ok: false, status: 500, json: async () => ({ success: false }) };
        }
        if (u.includes('/finalize.php')) {
            calls.push({ url: u });
            return { ok: true, json: async () => ({ success: true }) };
        }
        if (u.includes('/time.php')) {
            return { ok: true, json: async () => ({ timestamp: Date.now() }) };
        }
        return { ok: false, status: 404, json: async () => ({}) };
    };
}

beforeEach(() => {
    uploadBehavior = () => 'ok';
    playlistChunks = [];
    installFetch();
    vi.useRealTimers();
});

afterEach(() => {
    globalThis.fetch = realFetch;
    vi.useRealTimers();
});

function makeUploader() {
    const up = new ChunkUploader({ competitionId: 9, serverUrl: 'https://x.test/ffmpeg' });
    up.setExtension('mp4'); // production sets this from MediaRecorder detection before recording
    return up;
}

describe('R4-CHUNK-PLAY-1 ChunkUploader', () => {
    it('1. resumes numbering after the highest saved server index (no overwrite)', async () => {
        playlistChunks = [{ index: 0 }, { index: 1 }, { index: 2 }];
        const up = makeUploader();
        await up.initialize();
        expect(up.getStats().nextNumber).toBe(4);
        expect(up.enqueue(bigBlob())).toBe(true); // accepted (number assigned at processing)
    });

    it('2. fail-open base when the playlist is unreachable', async () => {
        (globalThis as any).fetch = async (url: any) => {
            if (String(url).includes('/api/chunks/playlist/')) throw new Error('down');
            return { ok: true, json: async () => ({ success: true }) };
        };
        const up = makeUploader();
        await up.initialize();
        expect(up.getStats().nextNumber).toBe(1);
    });

    it('3. bounded queue drops the oldest with an explicit counter', async () => {
        const up = new ChunkUploader({ competitionId: 9, serverUrl: 'https://x.test/ffmpeg' }, { maxQueue: 2 });
        up.setExtension('mp4');
        // Stall uploads so the queue fills: first upload never resolves until released.
        let release!: () => void;
        const gate = new Promise<void>((r) => { release = r; });
        (globalThis as any).fetch = async (url: any, init?: any) => {
            // Key-mandatory uploads (SAFE28 mock follows the behavior).
            if (String(url).includes('/api/chunks/register')) {
                return { ok: true, json: async () => ({ success: true, data: { chunk_key: 'k-gate' } }) };
            }
            if (String(url).includes('/upload.php')) {
                const num = (init?.body as FormData).get('chunk_number');
                calls.push({ url: `${url}#${num}@1` });
                await gate;
            }
            if (String(url).includes('/api/chunks/playlist/')) {
                return { ok: true, json: async () => ({ success: true, chunks: [] }) };
            }
            return { ok: true, json: async () => ({ success: true }) };
        };
        await up.initialize();
        expect(up.enqueue(bigBlob())).toBe(true);
        // Pump starts synchronously on enqueue; give it a tick to take item 1.
        await new Promise((r) => setTimeout(r, 10));
        expect(up.enqueue(bigBlob())).toBe(true);
        expect(up.enqueue(bigBlob())).toBe(true);
        expect(up.enqueue(bigBlob())).toBe(true); // 3 waiting > max 2 → drop oldest waiting
        const stats = up.getStats();
        expect(stats.dropped).toBe(1);
        expect(stats.pending).toBe(3); // in-flight head + 2 waiting
        release();
        await up.waitForUploads();
        // Lazy numbering: dropped items never consume a number, so uploads
        // stay dense (1,2,3) — the drop is a content time-jump, counted in
        // stats, never a numbering gap.
        const uploaded = calls.filter((c) => c.url.includes('/upload.php')).map((c) => c.url.split('#')[1].split('@')[0]);
        expect(uploaded).toEqual(['1', '2', '3']);
    });

    it('4. failures retry the SAME number (idempotent) and stay dense', async () => {
        uploadBehavior = (n, attempt) => (n === 1 && attempt < 3 ? 'fail' : 'ok');
        const up = makeUploader();
        await up.initialize();
        up.enqueue(bigBlob());
        up.enqueue(bigBlob());
        await up.waitForUploads();
        expect(attempts[1]).toBe(3); // same number retried
        expect(attempts[2]).toBe(1);
        expect(up.getStats().failed).toBe(0);
        expect(up.getStats().uploaded).toBe(2);
    });

    it('5. exhausted retries drop with a counted, explicit gap', async () => {
        uploadBehavior = (n) => (n === 2 ? 'fail' : 'ok');
        const up = makeUploader();
        await up.initialize();
        up.enqueue(bigBlob());
        up.enqueue(bigBlob());
        up.enqueue(bigBlob());
        await up.waitForUploads();
        expect(up.getStats().failed).toBe(1);
        expect(up.getStats().uploaded).toBe(2);
        expect(up.getStats().nextNumber).toBe(4); // numbering kept advancing, gap explicit
    });

    it('6. finalize drains first and runs once per session', async () => {
        const up = makeUploader();
        await up.initialize();
        up.enqueue(bigBlob());
        up.enqueue(bigBlob());
        await expect(up.finalize()).resolves.toBe(true);
        await expect(up.finalize()).resolves.toBe(true);
        const finals = calls.filter((c) => c.url.includes('/finalize.php'));
        expect(finals.length).toBe(1); // single path — the page must not call finalize.php directly
        const uploads = calls.filter((c) => c.url.includes('/upload.php'));
        expect(uploads.length).toBe(2); // drained before finalize
    });

    it('7. rejects degenerate blobs without consuming numbers', async () => {
        const up = makeUploader();
        await up.initialize();
        expect(up.enqueue(new Blob([]))).toBe(false);
        expect(up.getStats().nextNumber).toBe(1);
        expect(up.getStats().failed).toBe(1);
    });

    it('8. pure-init first blob is held as init source (no number, no upload)', async () => {
        const up = makeUploader();
        await up.initialize();
        expect(up.enqueue(pureInitBlob())).toBe(true); // accepted, held as init
        up.enqueue(mediaBlob());
        await up.waitForUploads();
        const uploaded = calls.filter((c) => c.url.includes('/upload.php')).map((c) => c.url.split('#')[1].split('@')[0]);
        expect(uploaded).toEqual(['1']); // media blob is chunk 1 — dense, no gap
        expect(up.getStats().failed).toBe(0);
        expect(up.getStats().dropped).toBe(0);
    });

    it('10. resume loads server init and prepends it to fragments', async () => {
        const serverInit = new Uint8Array([0, 0, 0, 8, 0x66, 0x74, 0x79, 0x70]); // ftyp head
        let initB64 = '';
        {
            let binary = '';
            for (let i = 0; i < serverInit.length; i++) binary += String.fromCharCode(serverInit[i]);
            initB64 = btoa(binary);
        }
        const seenHeads: string[] = [];
        (globalThis as any).fetch = async (url: any, init?: any) => {
            const u = String(url);
            // Key-mandatory uploads (SAFE28 mock follows the behavior).
            if (u.includes('/api/chunks/register')) {
                return { ok: true, json: async () => ({ success: true, data: { chunk_key: 'k-init' } }) };
            }
            if (u.includes('/api/chunks/playlist/')) {
                return { ok: true, json: async () => ({ success: true, chunks: [{ index: 0 }, { index: 1 }] }) };
            }
            if (u.includes('/api/chunks/init/')) {
                return { ok: true, json: async () => ({ success: true, format: 'mp4', init: initB64 }) };
            }
            if (u.includes('/upload.php')) {
                const file = (init?.body as FormData).get('chunk') as Blob;
                const bytes = new Uint8Array(await file.arrayBuffer());
                seenHeads.push(Array.from(bytes.subarray(0, 8)).map((b) => b.toString(16).padStart(2, '0')).join(''));
                calls.push({ url: `${u}#x@1` });
                return { ok: true, json: async () => ({ success: true }) };
            }
            return { ok: true, json: async () => ({ success: true }) };
        };
        const up = makeUploader();
        await up.initialize(); // server has 2 chunks → next 3, init loaded
        expect(up.getStats().nextNumber).toBe(3);
        up.enqueue(new Blob([new Uint8Array(2048)], { type: 'video/mp4' })); // fragment, no moof
        await up.waitForUploads();
        expect(seenHeads.length).toBe(1);
        expect(seenHeads[0].slice(8)).toBe('66747970'); // server init prepended
    });

    it('9. uploaded fragments carry the init prepended (standalone-decodable)', async () => {
        const seen: { num: string; head: string }[] = [];
        (globalThis as any).fetch = async (url: any, init?: any) => {
            const u = String(url);
            // Key-mandatory uploads (SAFE28 mock follows the behavior).
            if (u.includes('/api/chunks/register')) {
                return { ok: true, json: async () => ({ success: true, data: { chunk_key: 'k-frag' } }) };
            }
            if (u.includes('/api/chunks/playlist/')) {
                return { ok: true, json: async () => ({ success: true, chunks: [] }) };
            }
            if (u.includes('/upload.php')) {
                const body = init?.body as FormData;
                const file = body.get('chunk') as Blob;
                const bytes = new Uint8Array(await file.arrayBuffer());
                seen.push({
                    num: String(body.get('chunk_number')),
                    head: Array.from(bytes.subarray(0, 8)).map((b) => b.toString(16).padStart(2, '0')).join(''),
                });
                return { ok: true, json: async () => ({ success: true }) };
            }
            return { ok: true, json: async () => ({ success: true }) };
        };
        const up = makeUploader();
        await up.initialize();
        up.enqueue(mediaBlob()); // first blob: init (96B) + media → uploaded whole
        up.enqueue(mediaBlob()); // fragment → init prepended
        await up.waitForUploads();
        expect(seen.length).toBe(2);
        // Both uploads start with ftyp at offset 4 (init-prepended or whole).
        for (const s of seen) {
            expect(s.head.slice(8)).toBe('66747970'); // 'ftyp'
        }
    });
});

describe('R4-RELEASE-RECOVERY-C client lease lifecycle (acquire/heartbeat/expiry/reconnect/takeover)', () => {
    function fakeLease(opts?: { held?: boolean; loseAtBeat?: number }): RecordingLeaseHandle & { beats: number; releases: number } {
        const state = { beats: 0, releases: 0, generation: 1, held: !(opts?.held === true) };
        return {
            get beats() { return state.beats; },
            get releases() { return state.releases; },
            async acquire() {
                if (opts?.held === true) return { ok: false as const, reason: 'held' as const, generation: 7, expires_in_seconds: 30 };
                return { ok: true as const, generation: state.generation, took_over: false };
            },
            async heartbeat(generation: number) {
                state.beats++;
                if (opts?.loseAtBeat !== undefined && state.beats >= opts.loseAtBeat) {
                    return { held: false, generation: generation + 1 }; // takeover
                }
                return { held: state.held, generation };
            },
            async release() { state.releases++; },
        };
    }

    function leasedUploader(lease: RecordingLeaseHandle, onLeaseLost?: (info: { generation: number }) => void) {
        const up = new ChunkUploader({
            competitionId: 9, serverUrl: 'https://x.test/ffmpeg', lease, onLeaseLost,
            heartbeatIntervalMs: 60000, // manual beats in tests, no timer flakiness
        });
        up.setExtension('mp4');
        return up;
    }

    it('L1. acquire claims first; heartbeat keeps the lease; release hands over', async () => {
        const lease = fakeLease();
        const up = leasedUploader(lease);
        expect(await up.acquireLease()).toBe(true);
        expect(up.getLeaseState()).toMatchObject({ mode: 'enforced', active: true, generation: 1 });
        expect(await up.beatLease()).toBe(true);
        expect(lease.beats).toBe(1);
        await up.releaseLease();
        expect(up.getLeaseState().active).toBe(false);
        expect(lease.releases).toBe(1);
    });

    it('L2. held lease refuses (no recording); reconnect reacquires after expiry', async () => {
        const up = leasedUploader(fakeLease({ held: true }));
        expect(await up.acquireLease()).toBe(false);
        expect(up.getLeaseState().active).toBe(false);
        // Reconnect path: a fresh holder takes over after expiry.
        const up2 = leasedUploader(fakeLease());
        expect(await up2.reacquireLease()).toBe(true);
        expect(up2.getLeaseState().active).toBe(true);
        await up2.releaseLease();
    });

    it('L3. takeover during heartbeat stops uploads, fires onLeaseLost once, refuses finalize', async () => {
        let lost = 0;
        let lostGen = 0;
        const up = leasedUploader(fakeLease({ loseAtBeat: 1 }), (info) => { lost++; lostGen = info.generation; });
        await up.initialize();
        expect(await up.acquireLease()).toBe(true);
        expect(await up.beatLease()).toBe(false); // takeover at first beat
        expect(await up.beatLease()).toBe(false); // idempotent — no second fire
        expect(lost).toBe(1);
        expect(lostGen).toBe(2);
        // finalize is refused after the loss (never triggers the merge)...
        await expect(up.finalize()).resolves.toBe(false);
        expect(calls.filter((c) => c.url.includes('/finalize.php')).length).toBe(0);
        // ...while the secure path (key + verify + receipt) needs no finalize.
        await up.releaseLease();
    });

    it('L4. lease off (absent handle) behaves exactly as before', async () => {
        const up = makeUploader();
        expect(await up.acquireLease()).toBe(true);
        expect(up.getLeaseState()).toMatchObject({ mode: 'off', active: false });
        await up.initialize();
        up.enqueue(bigBlob());
        await up.waitForUploads();
        expect(up.getStats().uploaded).toBe(1);
        await expect(up.finalize()).resolves.toBe(true);
    });
});
