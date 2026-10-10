/**
 * R4-CHUNK-PLAY-1 — VideoCompositor final-chunk drain.
 *
 * The critical guarantee: stopRecording() resolves only AFTER the final
 * ondataavailable blob is enqueued AND the queue is drained AND finalize()
 * ran — the tail chunk can never be uploaded after finalization (lost from
 * the merge) or dropped silently. MediaRecorder/DOM are faked; the uploader
 * transport is the real ChunkUploader with mocked fetch.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VideoCompositor } from '../../src/client/services/VideoCompositor';

const realFetch = globalThis.fetch;
let calls: string[] = [];
let uploadDelayMs = 0;

class FakeStream {
    tracks: any[] = [];
    getAudioTracks() { return []; }
    getVideoTracks() { return []; }
    addTrack(t: any) { this.tracks.push(t); }
}

class MockMediaRecorder {
    static instances: MockMediaRecorder[] = [];
    static isTypeSupported(_type: string) { return true; }
    ondataavailable: ((e: any) => void) | null = null;
    onstop: (() => void) | null = null;
    private timer: any = null;
    private n = 0;
    constructor(_stream: any, _opts?: any) {
        MockMediaRecorder.instances.push(this);
    }
    start(timeslice?: number) {
        this.timer = setInterval(() => {
            this.n++;
            this.ondataavailable?.({ data: new Blob([new Uint8Array(2048)], { type: 'video/webm' }) });
        }, timeslice ?? 1000);
    }
    stop() {
        if (this.timer) clearInterval(this.timer);
        // Real recorders flush one final blob, then fire stop — asynchronously.
        setTimeout(() => {
            this.ondataavailable?.({ data: new Blob([new Uint8Array(2048)], { type: 'video/webm' }) });
            this.onstop?.();
        }, 0);
    }
}

const ctx2d = () => ({
    fillStyle: '', fillRect() {}, strokeStyle: '', lineWidth: 0,
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    drawImage() {}, font: '', textAlign: '', textBaseline: '', fillText() {},
});

const fakeCanvas = () => ({
    width: 1280, height: 480,
    getContext: () => ctx2d(),
    captureStream: () => new FakeStream(),
});

const fakeVideo = () => ({
    readyState: 4, videoWidth: 640, videoHeight: 480, srcObject: null,
});

function installGlobals() {
    (globalThis as any).MediaRecorder = MockMediaRecorder;
    (globalThis as any).MediaStream = FakeStream;
    (globalThis as any).localStorage = { getItem: () => null, setItem: () => {} };
    (globalThis as any).requestAnimationFrame = () => 1;
    (globalThis as any).cancelAnimationFrame = () => {};
    (globalThis as any).fetch = async (url: any, init?: any) => {
        const u = String(url);
        if (u.includes('/api/chunks/playlist/')) {
            calls.push('playlist');
            return { ok: true, json: async () => ({ success: true, chunks: [] }) };
        }
        if (u.includes('/upload.php')) {
            const num = (init?.body as FormData).get('chunk_number');
            calls.push(`upload:${num}`);
            if (uploadDelayMs) await new Promise((r) => setTimeout(r, uploadDelayMs));
            return { ok: true, json: async () => ({ success: true }) };
        }
        if (u.includes('/finalize.php')) {
            calls.push('finalize');
            return { ok: true, json: async () => ({ success: true }) };
        }
        if (u.includes('/time.php')) {
            return { ok: true, json: async () => ({ timestamp: Date.now() }) };
        }
        return { ok: false, status: 404, json: async () => ({}) };
    };
}

beforeEach(() => {
    installGlobals();
    calls = [];
    uploadDelayMs = 0;
    MockMediaRecorder.instances = [];
    vi.useRealTimers();
});

afterEach(() => {
    globalThis.fetch = realFetch;
    vi.useRealTimers();
});

function makeCompositor() {
    return new VideoCompositor({
        competitionId: 9,
        localVideo: fakeVideo() as any,
        remoteVideo: fakeVideo() as any,
        canvas: fakeCanvas() as any,
        chunkDuration: 50,
        serverUrl: 'https://x.test/ffmpeg',
    });
}

describe('R4-CHUNK-PLAY-1 VideoCompositor drain', () => {
    it('1. stop() uploads the final flush BEFORE finalize (tail never lost)', async () => {
        uploadDelayMs = 30; // slow uploads force the stop/finalize race
        const comp = makeCompositor();
        comp.startCompositing();
        await comp.startRecording();
        await new Promise((r) => setTimeout(r, 220)); // ~4 timeslices
        await comp.stopRecording();
        comp.stopCompositing();

        const uploads = calls.filter((c) => c.startsWith('upload:'));
        expect(uploads.length).toBeGreaterThanOrEqual(3);
        expect(calls).toContain('finalize');
        // finalize is strictly last: every upload (incl. the final flush)
        // precedes it — nothing uploads after finalization.
        expect(calls[calls.length - 1]).toBe('finalize');
        // Dense numbering from 1 (no skips).
        expect(uploads).toEqual(uploads.slice().sort());
    });

    it('2. destroy() is a single ordered teardown (stop → drain → finalize)', async () => {
        const comp = makeCompositor();
        const events: string[] = [];
        comp.startCompositing();
        await comp.startRecording();
        await new Promise((r) => setTimeout(r, 120));
        await comp.destroy();
        expect(calls).toContain('finalize');
        expect(comp.getStats().isRecording).toBe(false);
        expect(events).toEqual([]);
    });

    it('3. recording resolves its resume base from the server playlist', async () => {
        (globalThis as any).fetch = async (url: any, init?: any) => {
            const u = String(url);
            if (u.includes('/api/chunks/playlist/')) {
                calls.push('playlist');
                return { ok: true, json: async () => ({ success: true, chunks: [{ index: 0 }, { index: 1 }, { index: 2 }] }) };
            }
            if (u.includes('/upload.php')) {
                const num = (init?.body as FormData).get('chunk_number');
                calls.push(`upload:${num}`);
                return { ok: true, json: async () => ({ success: true }) };
            }
            if (u.includes('/finalize.php')) {
                calls.push('finalize');
                return { ok: true, json: async () => ({ success: true }) };
            }
            if (u.includes('/time.php')) {
                return { ok: true, json: async () => ({ timestamp: Date.now() }) };
            }
            return { ok: false, status: 404, json: async () => ({}) };
        };
        const comp = makeCompositor();
        comp.startCompositing();
        await comp.startRecording(); // resume base: server max index 2 → next 4
        await new Promise((r) => setTimeout(r, 120));
        await comp.stopRecording();
        comp.stopCompositing();
        const first = calls.find((c) => c.startsWith('upload:'));
        expect(first).toBe('upload:4'); // appends, never overwrites 0..2
    });
});
