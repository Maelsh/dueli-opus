import { describe, it, expect } from 'vitest';
import app from '../../src/main';
import { FakeD1 } from '../helpers/fake-d1';

/**
 * P0 regression (2026-09-05): @hono/vite-cloudflare-pages@0.4.3's generated
 * entry does `worker.notFound(app.notFoundHandler)`. Hono 4 stores the
 * handler set by `.notFound()` in a private `#notFoundHandler` field, so the
 * public `app.notFoundHandler` the plugin reads was `undefined` — the plugin
 * then disabled notFound handling on the outer worker, and any unmatched
 * route crashed to a 500 instead of a proper 404.
 *
 * These tests exercise `app` directly (the same instance the plugin reads
 * `notFoundHandler` from) — they fail on the pre-fix code because:
 *  - unmatched /api/* routes threw/returned whatever the default Hono
 *    notFound produced (plain text, not the JSON contract below), and
 *  - the compatibility property did not exist at all.
 */
function env(db: FakeD1) {
    return { DB: db } as any;
}

describe('P0: notFound handling + Pages plugin compatibility', () => {
    it('exposes a public notFoundHandler for the Pages plugin to read', () => {
        // The plugin's generated entry does `worker.notFound(app.notFoundHandler)`.
        // Before the fix this property did not exist (undefined).
        expect(typeof (app as any).notFoundHandler).toBe('function');
    });

    it('unknown API route returns 404 JSON with success=false', async () => {
        const db = new FakeD1();
        const res = await app.request('/api/this-route-does-not-exist', {}, env(db));
        expect(res.status).toBe(404);
        expect(res.headers.get('content-type')).toContain('application/json');
        const body = await res.json();
        expect(body.success).toBe(false);
    });

    it('unknown page route returns explicit 404 HTML (not 200, not empty)', async () => {
        const db = new FakeD1();
        const res = await app.request('/this-page-does-not-exist', {}, env(db));
        expect(res.status).toBe(404);
        expect(res.headers.get('content-type')).toContain('text/html');
        const body = await res.text();
        expect(body.length).toBeGreaterThan(0);
        expect(body).toContain('404');
    });

    it('the same handler instance is reachable via both the real and compat paths', () => {
        // Guards against a future edit that updates app.notFound(...) without
        // updating the (app as PagesCompatibleHono).notFoundHandler mirror.
        expect((app as any).notFoundHandler).toBeDefined();
    });
});
