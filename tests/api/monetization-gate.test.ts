/**
 * UNIT41.1 / R4-UI-UX-BROWSER-POLISH-1 — public money/ads gate + dueli.win.
 *
 * The owner closed the public money/ads surface (`public_monetization_enabled
 * = '0'` seeded by migration 0045) until the launch procedures complete:
 *
 *   - ordinary visitors (and guests) are refused SERVER-SIDE: the gated
 *     PAGES render a friendly translated notice (HTTP 403) and the gated
 *     APIs answer 403 with the owner's exact sentence (project error
 *     contract),
 *   - admins (is_admin = 1) and AdminRoleModel holders always pass,
 *   - the switch flips from /admin without a deploy,
 *   - everything OUTSIDE the حصر is untouched,
 *   - the Stripe webhook is never gated.
 *
 * Also covers the Host-based dueli.win routing of the cinematic /welcome
 * portal and the unified explainer video setting in the competition page.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { SqliteD1, createSqliteD1 } from '../helpers/sqlite-d1';

type Env = Parameters<typeof app.request>[2];
const env = (db: SqliteD1): Env => ({ DB: db }) as unknown as Env;

const AR_LOCK = 'سيتم فتح الباب بعد استكمال الإجراءات';
const EN_LOCK = 'This section will open soon upon completion of procedures';

let ipSeq = 9000;
function headers(extra?: Record<string, string>): Record<string, string> {
    ipSeq += 1;
    return {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': `10.9.${(ipSeq % 250) + 1}.${(ipSeq % 200) + 1}`,
        ...(extra ?? {}),
    };
}
const authed = (sessionId: string, extra?: Record<string, string>) =>
    headers({ ...(extra ?? {}), Authorization: `Bearer ${sessionId}` });

const get = (path: string, init?: RequestInit) =>
    app.request(path, init, env(db));

let db: SqliteD1;

beforeEach(async () => {
    db = createSqliteD1();
    // Categories + a pending competition for the invite/competition checks.
    await db.prepare(`INSERT INTO categories (id, slug, name_ar, name_en, parent_id) VALUES (10, 'dialogue', 'حوار', 'Dialogue', NULL)`).run();
    // Users: 600 ordinary, 601 admin, 602 role holder, 603 ordinary.
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_active, language, country, is_online, last_seen_at, is_busy, is_admin, created_at)
         VALUES
         (600, 'ord@local', 'ord', 'x', 'Ordinary', 1, 'ar', 'SA', 0, datetime('now'), 0, 0, datetime('now')),
         (601, 'adm@local', 'adm', 'x', 'Admin', 1, 'ar', 'SA', 0, datetime('now'), 0, 1, datetime('now')),
         (602, 'role@local', 'role', 'x', 'RoleHolder', 1, 'ar', 'SA', 0, datetime('now'), 0, 0, datetime('now')),
         (603, 'ord2@local', 'ord2', 'x', 'Ordinary2', 1, 'ar', 'SA', 0, datetime('now'), 0, 0, datetime('now'))`
    ).run();
    await db.prepare(`INSERT INTO admin_roles (user_id, role, granted_by) VALUES (602, 'Auditor', 601)`).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES
         ('sess-ord', 600, datetime('now', '+1 day')),
         ('sess-adm', 601, datetime('now', '+1 day')),
         ('sess-role', 602, datetime('now', '+1 day')),
         ('sess-ord2', 603, datetime('now', '+1 day'))`
    ).run();
});

afterEach(() => {
    db.close();
});

describe('UNIT41.1 — the gate is CLOSED by default (migration 0045 seeds \'0\')', () => {
    it.each(['/earnings', '/donate', '/advertiser'])('GET %s refuses the ordinary visitor with the owner\'s sentence', async (path) => {
        for (const lang of ['ar', 'en'] as const) {
            const res = await get(`${path}?lang=${lang}`);
            expect(res.status, `${path} lang=${lang}`).toBe(403);
            const html = await res.text();
            expect(html).toContain(lang === 'ar' ? AR_LOCK : EN_LOCK);
        }
    });

    it.each(['/earnings', '/donate', '/advertiser'])('GET %s refuses a logged-in ordinary user too', async (path) => {
        const res = await get(`${path}?lang=en`, { headers: authed('sess-ord') });
        expect(res.status).toBe(403);
        expect(await res.text()).toContain(EN_LOCK);
    });

    it.each(['/earnings', '/donate', '/advertiser'])('GET %s passes for is_admin=1 and for AdminRoleModel holders', async (path) => {
        for (const sessionId of ['sess-adm', 'sess-role']) {
            const res = await get(`${path}?lang=en`, { headers: authed(sessionId) });
            expect(res.status, `${path} session=${sessionId}`).toBe(200);
        }
    });

    it('the locked page is a friendly notice, not a bare error', async () => {
        const res = await get('/earnings?lang=ar');
        expect(res.headers.get('content-type')).toContain('text/html');
        const html = await res.text();
        expect(html).toContain(AR_LOCK);
        expect(html).toContain('href="/?lang=ar"'); // a way back home
        expect(html).toContain('noindex');
    });
});

describe('UNIT41.1 — the gated APIs answer 403 with the project error contract', () => {
    it.each([
        '/api/withdrawals',
        '/api/payment-methods',
        '/api/advertiser/dashboard',
        '/api/donations/total',
        '/api/donations/top-supporters',
        '/api/donations/my',
    ])('GET %s refuses ordinary users with the translated sentence', async (path) => {
        for (const lang of ['ar', 'en'] as const) {
            const res = await get(`${path}?lang=${lang}`, { headers: authed('sess-ord') });
            expect(res.status, `${path} lang=${lang}`).toBe(403);
            const body = (await res.json()) as { success: boolean; error: string };
            expect(body.success).toBe(false);
            expect(body.error).toBe(lang === 'ar' ? AR_LOCK : EN_LOCK);
        }
    });

    it.each([
        '/api/withdrawals',
        '/api/payment-methods',
        '/api/advertiser/campaigns',
        '/api/donations',
    ])('POST %s is refused before any business logic runs', async (path) => {
        const res = await app.request(path, {
            method: 'POST',
            headers: authed('sess-ord', { 'X-CSRF-Token': 'gate' }),
            body: JSON.stringify({ amount: 1000000 }),
        }, env(db));
        expect(res.status).toBe(403);
        const body = (await res.json()) as { success: boolean; error: string };
        expect(body.error).toBe(EN_LOCK);
    });

    it('DELETE /api/withdrawals/1 is refused for ordinary users', async () => {
        const res = await app.request('/api/withdrawals/1?lang=en', {
            method: 'DELETE',
            headers: authed('sess-ord', { 'X-CSRF-Token': 'gate' }),
        }, env(db));
        expect(res.status).toBe(403);
    });

    it('admins and role holders pass the APIs', async () => {
        for (const sessionId of ['sess-adm', 'sess-role']) {
            const res = await get('/api/withdrawals?lang=en', { headers: authed(sessionId) });
            expect(res.status, sessionId).toBe(200);
        }
        const donations = await get('/api/donations/total?lang=en', { headers: authed('sess-role') });
        expect(donations.status).toBe(200);
    });

    it('the Stripe webhook is NEVER gated (machine-to-machine authority)', async () => {
        const res = await app.request('/api/donations/webhook', {
            method: 'POST',
            headers: headers({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ id: 'evt_test', type: 'checkout.session.completed', data: { object: {} } }),
        }, env(db));
        // Missing STRIPE_WEBHOOK_SECRET in this environment => 503, never 403.
        expect(res.status).not.toBe(403);
        expect(res.status).toBe(503);
    });

    it('paths outside the gate حصر are untouched', async () => {
        for (const path of ['/api/categories?lang=en', '/api/advertisements?limit=1&lang=en']) {
            const res = await get(path, { headers: authed('sess-ord') });
            expect(res.status, path).toBe(200);
        }
        const anonAds = await get('/api/advertisements?limit=1&lang=en');
        expect(anonAds.status).toBe(200);
    });
});

describe('UNIT41.1 — the /admin switch flips the gate immediately (no deploy)', () => {
    it('an admin can open and re-close the gate, and the flip is audited', async () => {
        // Initially closed.
        expect((await get('/earnings?lang=en', { headers: authed('sess-ord') })).status).toBe(403);

        // Admin opens via the same endpoint /admin uses.
        const open = await app.request('/api/admin/settings', {
            method: 'PUT',
            headers: authed('sess-adm'),
            body: JSON.stringify({ key: 'public_monetization_enabled', value: '1' }),
        }, env(db));
        expect(open.status).toBe(200);

        // Ordinary user now passes — pages and APIs.
        expect((await get('/earnings?lang=en', { headers: authed('sess-ord') })).status).toBe(200);
        expect((await get('/donate?lang=en', { headers: authed('sess-ord') })).status).toBe(200);
        expect((await get('/api/withdrawals?lang=en', { headers: authed('sess-ord') })).status).toBe(200);

        // The flip is visible in the audit log.
        const audit = await db.prepare(
            `SELECT COUNT(*) c FROM admin_audit_logs WHERE action_type = 'update_setting' AND details LIKE '%public_monetization_enabled%'`
        ).first<{ c: number }>();
        expect(Number(audit?.c ?? 0)).toBeGreaterThanOrEqual(1);

        // Admin closes again — ordinary users are refused again.
        const close = await app.request('/api/admin/settings', {
            method: 'PUT',
            headers: authed('sess-adm'),
            body: JSON.stringify({ key: 'public_monetization_enabled', value: '0' }),
        }, env(db));
        expect(close.status).toBe(200);
        expect((await get('/earnings?lang=en', { headers: authed('sess-ord') })).status).toBe(403);
        expect((await get('/api/withdrawals?lang=en', { headers: authed('sess-ord') })).status).toBe(403);
    });

    it('an ordinary user cannot flip the gate (403 from the admin API)', async () => {
        const res = await app.request('/api/admin/settings', {
            method: 'PUT',
            headers: authed('sess-ord'),
            body: JSON.stringify({ key: 'public_monetization_enabled', value: '1' }),
        }, env(db));
        expect(res.status).toBe(403);
        expect((await get('/earnings?lang=en', { headers: authed('sess-ord') })).status).toBe(403);
    });
});

describe('UNIT41.1 — Host routing: dueli.win serves the cinematic portal on /', () => {
    it.each(['dueli.win', 'www.dueli.win', 'DUELI.WIN'])('GET / with Host %s serves the welcome portal', async (host) => {
        const res = await app.request('/', { headers: { host } }, env(db));
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('id="splashSkip"');
        expect(html).toContain('scene-1-sparks.png');
    });

    it.each(['dueli.maelshpro.com', 'localhost', 'evil.com', 'dueli.win.evil.com', 'notdueli.win'])('GET / with Host %s serves the normal home page', async (host) => {
        const res = await app.request('/', { headers: { host } }, env(db));
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).not.toContain('id="splashSkip"');
        expect(html).toContain('searchInput'); // the real home page
    });

    it('non-root paths on dueli.win are NOT intercepted', async () => {
        const res = await app.request('/explore?lang=en', { headers: { host: 'dueli.win' } }, env(db));
        expect(res.status).toBe(200);
        expect(await res.text()).not.toContain('id="splashSkip"');
    });
});

describe('UNIT41.1 — /welcome cinematic gate (UNIT38 contract kept)', () => {
    it.each(['en', 'ar'] as const)('serves the scenes, skip link and noindex (%s)', async (lang) => {
        const res = await get(`/welcome?lang=${lang}`);
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('/static/welcome/scene-1-sparks.png');
        expect(html).toContain('/static/welcome/scene-2-stardust.png');
        expect(html).toContain('/static/welcome/scene-3-nebula.png');
        expect(html).toContain('id="splashSkip"');
        expect(html).toContain('href="https://dueli.maelshpro.com/"');
        expect(html).toContain('prefers-reduced-motion: reduce');
        expect(html).toContain('noindex');
        expect(html).toContain('By Maelsh Pro');
    });

    it('the English portal carries the English phrase; the Arabic portal carries the Arabic phrase', async () => {
        const en = await (await get('/welcome?lang=en')).text();
        for (const w of ['Elevate', 'Learn', 'Enjoy', 'Earn']) expect(en).toContain(w);
        const ar = await (await get('/welcome?lang=ar')).text();
        for (const w of ['ارتقِ', 'تثقف', 'استمتع', 'اربح']) expect(ar).toContain(w);
    });

    it('no external 3D library is shipped; the canvas particle layer is local', async () => {
        const html = await (await get('/welcome?lang=en')).text();
        expect(html).toContain('<canvas');
        expect(html.toLowerCase()).not.toContain('three.js');
        expect(html.toLowerCase()).not.toContain('webgl');
        expect(html.toLowerCase()).not.toContain('babylon');
    });
});

describe('UNIT41.1 — unified explainer video in the competition page', () => {
    it('the seeded default (0045) injects the owner-approved URL', async () => {
        const res = await get('/competition/1?lang=en');
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('const demoExplainerVideoUrl = "https://maelshpro.com/ffmpeg/storage/live/match_fake/fake.mp4"');
    });

    it('an EMPTY setting reproduces today’s behaviour (no video)', async () => {
        await db.prepare(`UPDATE platform_settings SET setting_value = '' WHERE setting_key = 'demo_explainer_video_url'`).run();
        const res = await get('/competition/1?lang=en');
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('const demoExplainerVideoUrl = ""');
    });

    it('an absent setting also reproduces today’s behaviour', async () => {
        await db.prepare(`DELETE FROM platform_settings WHERE setting_key = 'demo_explainer_video_url'`).run();
        const res = await get('/competition/1?lang=en');
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('const demoExplainerVideoUrl = ""');
    });

    it('the setting is admin-editable only', async () => {
        const res = await app.request('/api/admin/settings', {
            method: 'PUT',
            headers: authed('sess-ord'),
            body: JSON.stringify({ key: 'demo_explainer_video_url', value: 'https://evil.example/x.mp4' }),
        }, env(db));
        expect(res.status).toBe(403);
    });
});
