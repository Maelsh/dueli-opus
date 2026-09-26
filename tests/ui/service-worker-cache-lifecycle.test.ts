/**
 * Service-worker cache lifecycle (stale-asset blocker).
 *
 * These tests execute the REAL service worker source in a VM against a fake
 * Cache API, so they prove behaviour rather than text patterns: a new
 * deployment is picked up by an ordinary reload, a superseded bundle cannot
 * stay active indefinitely, the offline fallback still works, and responses
 * that must not be cached are never stored.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { serviceWorkerScript } from '../../src/config/pwa';

const publicSw = readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf-8');

interface FakeResponse {
    status: number;
    type: string;
    body: string;
    headers: { get(name: string): string | null };
    clone(): FakeResponse;
}

function makeResponse(body: string, init: { status?: number; type?: string; cacheControl?: string } = {}): FakeResponse {
    return {
        status: init.status ?? 200,
        type: init.type ?? 'basic',
        body,
        headers: { get: (n: string) => (n.toLowerCase() === 'cache-control' ? (init.cacheControl ?? null) : null) },
        clone: () => makeResponse(body, init),
    };
}

/** Minimal Cache API + SW global, enough to run the real worker source. */
function runSw(opts: { network?: (url: string) => Promise<FakeResponse> } = {}) {
    const store = new Map<string, Map<string, FakeResponse>>();
    const listeners: Record<string, (ev: unknown) => void> = {};
    const deleted: string[] = [];
    // Requests arriving from the worker are plain objects in this shim, so
    // normalise every key to its URL — exactly as the real Cache API does.
    const asUrl = (req: unknown): string =>
        (typeof req === 'string' ? req : ((req as { url?: string })?.url ?? String(req)));

    const caches = {
        open: async (name: string) => {
            if (!store.has(name)) store.set(name, new Map());
            const entries = store.get(name)!;
            return {
                add: async (req: unknown) => { entries.set(asUrl(req), makeResponse('warm')); },
                put: async (req: unknown, res: FakeResponse) => { entries.set(asUrl(req), res); },
                keys: async () => [...entries.keys()].map(url => ({ url })),
                delete: async (k: { url: string }) => entries.delete(k.url),
            };
        },
        keys: async () => [...store.keys()],
        delete: async (name: string) => { deleted.push(name); return store.delete(name); },
        match: async (req: unknown) => {
            const key = asUrl(req);
            for (const entries of store.values()) {
                const hit = entries.get(key);
                if (hit) return hit;
            }
            return undefined;
        },
    };

    const sandbox: Record<string, unknown> = {
        console,
        URL,
        URLSearchParams,
        Request: class { constructor(public url: string) {} toString() { return this.url; } },
        Response: class { constructor(public body: string) {} },
        caches,
        location: { origin: 'https://dueli.test', search: '' },
        clients: { claim: async () => undefined },
        registration: { showNotification: async () => undefined },
        skipWaiting: async () => undefined,
        addEventListener: (type: string, fn: (ev: unknown) => void) => { listeners[type] = fn; },
        fetch: async (req: { toString(): string }) => {
            if (opts.network) return opts.network(String(req));
            throw new Error('offline');
        },
    };
    sandbox.self = sandbox;
    sandbox.globalThis = sandbox;
    runInNewContext(publicSw, sandbox);

    const key = (url: string) => ({ toString: () => url });

    const fireFetch = async (url: string, init: { headers?: Record<string, string> } = {}) => {
        const request = {
            url,
            method: 'GET',
            mode: 'no-cors',
            headers: { has: (h: string) => !!(init.headers && init.headers[h]) },
        };
        let responded: Promise<FakeResponse> | undefined;
        listeners.fetch({ request, respondWith: (p: Promise<FakeResponse>) => { responded = p; } });
        if (!responded) return { handled: false as const, body: undefined };
        return { handled: true as const, body: (await responded).body };
    };

    const runLifecycle = async (type: 'install' | 'activate') => {
        let done: Promise<unknown> | undefined;
        listeners[type]({ waitUntil: (p: Promise<unknown>) => { done = p; } });
        await done;
    };

    return { store, deleted, fireFetch, runLifecycle, caches, key };
}


describe('service worker — stale asset blocker', () => {
    it('serves the NEW bundle on an ordinary reload after a new deployment', async () => {
        const sw = runSw({ network: async () => makeResponse('NEW-BUNDLE') });
        await sw.runLifecycle('install');
        // A previous deployment already cached the old bundle under the same URL.
        const cache = await sw.caches.open('dueli-static-v3');
        await cache.put(sw.key('https://dueli.test/static/app.js'), makeResponse('OLD-BUNDLE'));

        const res = await sw.fireFetch('https://dueli.test/static/app.js');
        expect(res.handled).toBe(true);
        // The network copy wins: an ordinary F5 never serves the old bundle.
        expect(res.body).toBe('NEW-BUNDLE');
    });

    it('refreshes the cached copy after a successful response', async () => {
        const sw = runSw({ network: async () => makeResponse('V2') });
        await sw.runLifecycle('install');
        await sw.fireFetch('https://dueli.test/static/app.js');
        expect(sw.store.get('dueli-static-v3')!.get('https://dueli.test/static/app.js')!.body).toBe('V2');
    });

    it('still serves the cached copy when the network is unavailable (offline)', async () => {
        const offline = runSw(); // no network: fetch throws
        await offline.runLifecycle('install');
        const cache = await offline.caches.open('dueli-static-v3');
        await cache.put(offline.key('https://dueli.test/static/app.js'), makeResponse('V1'));

        const res = await offline.fireFetch('https://dueli.test/static/app.js');
        expect(res.body).toBe('V1');
    });

    it('purges caches from previous versions on activation', async () => {
        const sw = runSw();
        await sw.caches.open('dueli-static-v2');
        await sw.caches.open('dueli-dynamic-v2');
        await sw.caches.open('dueli-static-v3');

        await sw.runLifecycle('activate');

        expect(sw.deleted).toContain('dueli-static-v2');
        expect(sw.deleted).toContain('dueli-dynamic-v2');
        expect(sw.deleted).not.toContain('dueli-static-v3');
    });

    it('never caches what must not be cached', async () => {
        const sw = runSw({ network: async () => makeResponse('X') });
        await sw.runLifecycle('install');

        // Cross-origin CDN traffic is not intercepted at all.
        expect((await sw.fireFetch('https://cdn.jsdelivr.net/npm/x.css')).handled).toBe(false);
        // Range requests are not intercepted.
        expect((await sw.fireFetch('https://dueli.test/static/app.js', { headers: { range: 'bytes=0-1' } })).handled).toBe(false);

        // A non-200 response is never stored.
        const notFound = runSw({ network: async () => makeResponse('nope', { status: 404 }) });
        await notFound.runLifecycle('install');
        await notFound.fireFetch('https://dueli.test/static/app.js');
        expect(notFound.store.get('dueli-static-v3')!.has('https://dueli.test/static/app.js')).toBe(false);
    });

    it('does not weaken CSP anywhere', () => {
        expect(publicSw).not.toContain('unsafe-inline');
        expect(publicSw).not.toContain('Content-Security-Policy');
    });

    it('keeps the worker-served copy and the file Pages serves in sync', () => {
        expect(serviceWorkerScript).toContain("const STATIC_CACHE = 'dueli-static-v3'");
        expect(serviceWorkerScript).toContain('CURRENT_CACHES');
        expect(serviceWorkerScript).toContain("cache: 'reload'");
        // Neither copy may regress to cache-first for /static/*.
        expect(serviceWorkerScript).not.toMatch(/Cache-first for static/i);
        expect(publicSw).not.toMatch(/Cache-first for static/i);
    });
});
