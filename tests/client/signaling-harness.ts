/**
 * Shared harness for the browser signaling-client behavioral tests.
 * Mocks: fetch (AbortSignal-aware, programmable per test), window
 * (sessionId + timer delegation so fake timers work), localStorage,
 * RTCPeerConnection / RTCSessionDescription / RTCIceCandidate.
 */
import { beforeEach, afterEach, vi } from 'vitest';

export interface FetchCall { url: string; init: any; body: any }

export let fetchCalls: FetchCall[] = [];
let fetchHandler: (url: string, init?: any) => any = async () => okJson({ success: true, data: {} });

export function setFetchHandler(h: (url: string, init?: any) => any) {
    fetchHandler = h;
}

export const okJson = (data: any, ok = true, status = 200) => ({ ok, status, json: async () => data });

export class MockSessionDescription {
    type: string;
    sdp: string;
    constructor(init: any) {
        this.type = init.type;
        this.sdp = init.sdp;
    }
}

export class MockIceCandidate {
    candidate: string;
    constructor(init: any) {
        this.candidate = init.candidate;
    }
}

export class MockPC {
    static instances: MockPC[] = [];
    iceServers: any;
    onicecandidate: any = null;
    ontrack: any = null;
    onconnectionstatechange: any = null;
    localDescription: any = null;
    remoteDescription: any = null;
    addedCandidates: any[] = [];
    createdOffers = 0;
    createdAnswers = 0;
    closed = false;
    connectionState = 'new';
    constructor(config: any) {
        this.iceServers = config?.iceServers;
        MockPC.instances.push(this);
    }
    async createOffer() { this.createdOffers++; return { type: 'offer', sdp: 'v=0 mock-offer' }; }
    async createAnswer() { this.createdAnswers++; return { type: 'answer', sdp: 'v=0 mock-answer' }; }
    async setLocalDescription(d: any) { this.localDescription = d; }
    async setRemoteDescription(d: any) {
        if (d && d.sdp === 'BAD') throw new Error('bad sdp');
        this.remoteDescription = d;
    }
    async addIceCandidate(c: any) {
        if (c && c.candidate === 'bad') throw new Error('bad candidate');
        this.addedCandidates.push(c);
    }
    addTrack(_t: any, _s: any) {}
    getSenders() { return []; }
    close() { this.closed = true; }
}

export const sig = (id: number, type: string, payload: unknown, from: string, to: string | null = null) => ({
    id, type, payload, from, peer: from, to,
});

export function installGlobals() {
    (globalThis as any).window = {
        sessionId: 'test-sid',
        setInterval: (...a: any[]) => setInterval(...(a as [any, any])),
        clearInterval: (...a: any[]) => clearInterval(...(a as [any])),
    };
    (globalThis as any).localStorage = { getItem: () => null, setItem: () => {} };
    (globalThis as any).RTCPeerConnection = MockPC;
    (globalThis as any).RTCSessionDescription = MockSessionDescription;
    (globalThis as any).RTCIceCandidate = MockIceCandidate;
    (globalThis as any).fetch = async (url: any, init?: any) => {
        let body: any = undefined;
        try { body = init?.body ? JSON.parse(init.body) : undefined; } catch { body = init?.body; }
        fetchCalls.push({ url: String(url), init, body });
        const p = fetchHandler(String(url), init);
        // Honor AbortSignal like a real fetch (abort rejects with AbortError).
        if (init?.signal) {
            if (init.signal.aborted) throw new DOMException('Aborted', 'AbortError');
            return await Promise.race([
                p,
                new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError')))),
            ]);
        }
        return p;
    };
}

export function setupClientHarness() {
    beforeEach(() => {
        installGlobals();
        fetchCalls = [];
        MockPC.instances = [];
        setFetchHandler(async () => okJson({ success: true, data: {} }));
        vi.useRealTimers();
    });

    afterEach(async () => {
        // Restore timers + a settling fetch FIRST: timeout tests leave a
        // hanging handler behind that cleanup must not inherit.
        vi.useRealTimers();
        setFetchHandler(async () => okJson({ success: true, data: {} }));
        vi.restoreAllMocks();
    });
}

export const posted = (path: string) => fetchCalls.filter((c) => c.url.includes(path)).map((c) => c.body);
