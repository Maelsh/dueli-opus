/**
 * UNIT28 acceptance follow-up — A28-LEASE.
 *
 * Behavioral tests against the REAL ChunkUploader lease lifecycle.
 * The owner-reported defect: one transient heartbeat failure (network,
 * timeout, 5xx) permanently stopped recording and dropped the pending queue,
 * because every non-held answer was reported as a lost lease.
 *
 * Contract pinned here:
 *  - HELD: uploads continue, generation advances only forward;
 *  - UNKNOWN-TRANSIENT: no false takeover, recorder stays alive, pending
 *    chunks are preserved within the existing bounded queue, uploads are
 *    gated until the server re-verifies ownership;
 *  - EXPIRED: bounded re-acquire with server verification, then append with
 *    the new authorized generation; a real other holder is a loss;
 *  - LOST-TAKEN-OVER: stop once, fence the queue honestly, refuse finalize;
 *  - released/ended drain: the authorized tail can still upload, no overwrite;
 *  - stale in-flight heartbeat responses can never rewind a newer generation.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ChunkUploader, type RecordingLeaseHandle } from '../../src/client/services/ChunkUploader';

const realFetch = globalThis.fetch;

type BeatAnswer =
    | { held: true; generation: number }
    | { held: false; generation: number; reason: 'transient' | 'expired' | 'released' | 'ended' | 'lost' };

let beatScript: BeatAnswer[] = [];
let defaultBeat: BeatAnswer = { held: true, generation: 1 };
let acquireScript: Array<
    | { ok: true; generation: number; took_over: boolean }
    | { ok: false; reason: 'held' | 'unavailable' | 'error'; generation?: number; expires_in_seconds?: number }
> = [];
let defaultAcquire: { ok: true; generation: number; took_over: boolean } = { ok: true, generation: 1, took_over: false };
let registerCalls: number[] = [];
let uploadCalls: number[] = [];
let blocked: Promise<void> | null = null;
let releaseBlock: (() => void) | null = null;

function mediaBlob() {
    const bytes = new Uint8Array(2048);
    bytes[4] = 0x66; bytes[5] = 0x74; bytes[6] = 0x79; bytes[7] = 0x70; // ftyp
    bytes[100] = 0x6d; bytes[101] = 0x6f; bytes[102] = 0x6f; bytes[103] = 0x66; // moof
    return new Blob([bytes], { type: 'video/mp4' });
}

function installFetch() {
    registerCalls = [];
    uploadCalls = [];
    (globalThis as any).fetch = async (url: any, init?: any) => {
        const u = String(url);
        if (u.includes('/api/chunks/playlist/')) {
            return { ok: true, json: async () => ({ success: true, chunks: [] }) };
        }
        if (u.includes('/api/chunks/register')) {
            const body = JSON.parse(String(init?.body || '{}'));
            registerCalls.push(Number(body.chunk_index));
            return { ok: true, json: async () => ({ success: true, data: { chunk_key: `k-${body.chunk_index}` } }) };
        }
        if (u.includes('/upload.php')) {
            const num = Number((init?.body as FormData).get('chunk_number') || 0);
            if (blocked) await blocked;
            // Real fetch honors an abort signal: a lease loss cancels the
            // in-flight request before the server records anything.
            if (init?.signal?.aborted) {
                throw Object.assign(new Error('aborted'), { name: 'AbortError' });
            }
            uploadCalls.push(num);
            return { ok: true, json: async () => ({ success: true }) };
        }
        return { ok: true, json: async () => ({ success: true }) };
    };
}

function makeLease() {
    const lease = {
        holderNonce: 'a1b2c3d4',
        beats: 0,
        releases: 0,
        async acquire() {
            return acquireScript.length > 0 ? acquireScript.shift()! : defaultAcquire;
        },
        async heartbeat(generation: number): Promise<BeatAnswer> {
            lease.beats++;
            return beatScript.length > 0 ? beatScript.shift()! : { ...defaultBeat, generation };
        },
        async release() { lease.releases++; },
    };
    return lease;
}

function makeUploader(lease: RecordingLeaseHandle, onLeaseLost?: (info: any) => void) {
    const up = new ChunkUploader({
        competitionId: 9,
        serverUrl: 'https://x.test/ffmpeg',
        lease,
        onLeaseLost,
        heartbeatIntervalMs: 600000,
        leaseRetryBaseMs: 600000, // no background retry inside a test
    } as any);
    up.setExtension('mp4');
    return up;
}

const tick = (ms = 25) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
    beatScript = [];
    defaultBeat = { held: true, generation: 1 };
    acquireScript = [];
    defaultAcquire = { ok: true, generation: 1, took_over: false };
    blocked = null;
    releaseBlock = null;
    installFetch();
});

afterEach(() => {
    globalThis.fetch = realFetch;
});

describe('A28-LEASE — transient is not a takeover', () => {
    it('1. one failed heartbeat keeps recording, keeps the queue, and resumes without a loss', async () => {
        const lease = makeLease();
        const lost: any[] = [];
        const up = makeUploader(lease, (info) => lost.push(info));
        await up.initialize();
        expect(await up.acquireLease()).toBe(true);

        beatScript.push({ held: false, generation: 1, reason: 'transient' });
        expect(await up.beatLease()).toBe(true);
        expect(lost).toEqual([]);
        expect(up.getLeaseState()).toMatchObject({
            mode: 'enforced', active: true, unknown: true, status: 'UNKNOWN-TRANSIENT', generation: 1,
        });

        // While ownership is unproven the uploader must NOT publish.
        expect(up.enqueue(mediaBlob())).toBe(true);
        await tick();
        expect(registerCalls).toEqual([]);
        expect(uploadCalls).toEqual([]);
        expect(up.getStats().pending).toBe(1);

        // Connectivity returns: server re-verifies, the SAME queued chunk
        // uploads exactly once with no renumbering/overwrite.
        defaultBeat = { held: true, generation: 1 };
        expect(await up.beatLease()).toBe(true);
        await up.waitForUploads();
        expect(lost).toEqual([]);
        expect(registerCalls).toEqual([1]);
        expect(uploadCalls).toEqual([1]);
        expect(up.getLeaseState().status).toBe('HELD');
        expect(up.getStats()).toMatchObject({ pending: 0, uploaded: 1, failed: 0, dropped: 0 });
    });

    it('2. a 15s disconnect (several transient beats) does not abort or drop pending chunks', async () => {
        const lease = makeLease();
        const lost: any[] = [];
        const up = makeUploader(lease, (info) => lost.push(info));
        await up.initialize();
        await up.acquireLease();

        for (let i = 0; i < 3; i++) {
            beatScript.push({ held: false, generation: 1, reason: 'transient' });
            expect(await up.beatLease()).toBe(true);
        }
        expect(lost).toEqual([]);
        expect(up.getLeaseState()).toMatchObject({ active: true, unknown: true, status: 'UNKNOWN-TRANSIENT' });

        up.enqueue(mediaBlob());
        up.enqueue(mediaBlob());
        await tick();
        expect(uploadCalls).toEqual([]);
        expect(up.getStats().pending).toBe(2);

        defaultBeat = { held: true, generation: 1 };
        await up.beatLease();
        await up.waitForUploads();
        expect(uploadCalls).toEqual([1, 2]);
        expect(lost).toEqual([]);
    });

    it('3. an expired lease is re-acquired with server verification and appends at the new generation', async () => {
        const lease = makeLease();
        const lost: any[] = [];
        const up = makeUploader(lease, (info) => lost.push(info));
        await up.initialize();
        await up.acquireLease();

        beatScript.push({ held: false, generation: 1, reason: 'expired' });
        acquireScript.push({ ok: true, generation: 2, took_over: true });
        expect(await up.beatLease()).toBe(true);
        expect(lost).toEqual([]);
        expect(up.getLeaseState()).toMatchObject({ active: true, generation: 2, status: 'HELD' });

        up.enqueue(mediaBlob());
        await up.waitForUploads();
        expect(registerCalls).toEqual([1]);
        expect(uploadCalls).toEqual([1]);
    });

    it('4. a real other holder is LOST: stop once, fence pending chunks explicitly, refuse finalize', async () => {
        const lease = makeLease();
        const lost: any[] = [];
        const up = makeUploader(lease, (info) => lost.push(info));
        await up.initialize();
        await up.acquireLease();

        // Queue a chunk while uploads are blocked, then the takeover arrives.
        blocked = new Promise<void>((resolve) => { releaseBlock = resolve; });
        up.enqueue(mediaBlob());
        await tick();
        beatScript.push({ held: false, generation: 2, reason: 'lost' });
        expect(await up.beatLease()).toBe(false);
        expect(lost).toHaveLength(1);
        expect(lost[0]).toMatchObject({ generation: 2, reason: 'takeover' });
        expect(up.getLeaseState()).toMatchObject({ active: false, status: 'LOST-TAKEN-OVER' });
        expect(up.getStats().pending).toBe(0);
        expect(up.getStats().fenced).toBeGreaterThanOrEqual(1);
        expect(await up.finalize()).toBe(false);
        releaseBlock!();
        await tick();
        expect(uploadCalls).toEqual([]);
    });

    it('5. a stale in-flight heartbeat response cannot rewind a newer generation', async () => {
        const lease = makeLease();
        let resolveOld!: (a: BeatAnswer) => void;
        let call = 0;
        (lease as any).heartbeat = async (generation: number) => {
            call++;
            if (call === 1) {
                return new Promise<BeatAnswer>((resolve) => { resolveOld = resolve; });
            }
            return { held: true, generation: 2 };
        };
        const up = makeUploader(lease);
        await up.initialize();
        await up.acquireLease();

        const inFlight = up.beatLease(); // generation 1, slow
        acquireScript.push({ ok: true, generation: 2, took_over: true });
        expect(await up.reacquireLease()).toBe(true);
        expect(up.getLeaseState().generation).toBe(2);

        resolveOld({ held: true, generation: 1 });
        await inFlight;
        expect(up.getLeaseState()).toMatchObject({ generation: 2, status: 'HELD' });
    });

    it('6. a clean release at end is drain-only: the authorized tail still uploads, no false takeover', async () => {
        const lease = makeLease();
        const lost: any[] = [];
        const up = makeUploader(lease, (info) => lost.push(info));
        await up.initialize();
        await up.acquireLease();

        beatScript.push({ held: false, generation: 1, reason: 'released' });
        expect(await up.beatLease()).toBe(true);
        expect(lost).toEqual([]); // a clean end is not "another session took over"
        expect(up.getLeaseState()).toMatchObject({ status: 'EXPIRED', draining: true, active: true });

        // The final recorder flush lands AFTER /end released the lease; it
        // must still register/upload under the released generation.
        up.enqueue(mediaBlob());
        await up.waitForUploads();
        expect(registerCalls).toEqual([1]);
        expect(uploadCalls).toEqual([1]);
        expect(await up.finalize()).toBe(true);
    });

    it('7. an ended competition stops the recorder once but still drains the authorized tail', async () => {
        const lease = makeLease();
        const lost: any[] = [];
        const up = makeUploader(lease, (info) => lost.push(info));
        await up.initialize();
        await up.acquireLease();

        beatScript.push({ held: false, generation: 1, reason: 'ended' });
        await up.beatLease();
        expect(lost).toHaveLength(1);
        expect(lost[0]).toMatchObject({ reason: 'ended' });
        expect(up.getLeaseState()).toMatchObject({ status: 'EXPIRED', draining: true });

        up.enqueue(mediaBlob());
        await up.waitForUploads();
        expect(uploadCalls).toEqual([1]);
    });

    it('8. finalize is honest while ownership is unknown: no upload, pending preserved', async () => {
        const lease = makeLease();
        const up = makeUploader(lease);
        await up.initialize();
        await up.acquireLease();

        beatScript.push({ held: false, generation: 1, reason: 'transient' });
        await up.beatLease();
        up.enqueue(mediaBlob());
        await tick();

        beatScript.push({ held: false, generation: 1, reason: 'transient' });
        expect(await up.finalize()).toBe(false);
        expect(uploadCalls).toEqual([]);
        expect(up.getStats().pending).toBe(1);
    });
});
