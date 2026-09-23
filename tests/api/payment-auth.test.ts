import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';

/**
 * C1 (SEC-13): payments / ad-blocks route-level authentication.
 *
 * Proven hole: both routers mounted with zero `authMiddleware`, while every
 * controller method gates on `requireAuth(c)` (which reads `c.get('user')`).
 * Without the middleware the context user is never set, so all authenticated
 * functionality 401s — the features look wired but are dead.
 *
 * Fix: router-level `authMiddleware({ required: true })` on both routers.
 * These tests pin: 401 with no/bad/expired session, success with a session,
 * and proof that auth passes (400 validation, not 401) on a bad body.
 */

const SESS = 'sess-c1-user';

function env(db: SqliteD1) {
    return { DB: db } as unknown as Parameters<typeof app.request>[2];
}

function headers(token?: string) {
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'c1-test',
    };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    return h;
}

async function seed(db: SqliteD1) {
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_active)
         VALUES (11, 'c1@local', 'c1user', 'x', 'C1 User', 1)`,
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES
         ('${SESS}', 11, datetime('now', '+1 day')),
         ('sess-c1-expired', 11, datetime('now', '-1 day'))`,
    ).run();
}

describe('C1 — payments / ad-blocks authentication', () => {
    let db: SqliteD1;
    beforeEach(async () => {
        db = new SqliteD1();
        await seed(db);
    });

    it('GET /api/payment-methods without session ⇒ 401', async () => {
        const res = await app.request('/api/payment-methods?lang=en', { headers: headers() }, env(db));
        expect(res.status).toBe(401);
    });

    it('GET /api/payment-methods with unknown session ⇒ 401', async () => {
        const res = await app.request('/api/payment-methods?lang=en', { headers: headers('nope') }, env(db));
        expect(res.status).toBe(401);
    });

    it('GET /api/payment-methods with expired session ⇒ 401', async () => {
        const res = await app.request(
            '/api/payment-methods?lang=en', { headers: headers('sess-c1-expired') }, env(db),
        );
        expect(res.status).toBe(401);
    });

    it('GET /api/payment-methods with valid session ⇒ 200', async () => {
        const res = await app.request('/api/payment-methods?lang=en', { headers: headers(SESS) }, env(db));
        expect(res.status).toBe(200);
        const body = (await res.json()) as { success: boolean; data: { methods: unknown[] } };
        expect(body.success).toBe(true);
        expect(body.data.methods).toEqual([]);
    });

    it('POST /api/payment-methods with valid session creates a method (201)', async () => {
        const res = await app.request('/api/payment-methods?lang=en', {
            method: 'POST',
            headers: headers(SESS),
            body: JSON.stringify({ type: 'bank', bank_name: 'Test Bank', iban: 'DE0012345678' }),
        }, env(db));
        expect(res.status).toBe(201);
    });

    it('GET /api/ad-blocks without session ⇒ 401', async () => {
        const res = await app.request('/api/ad-blocks?lang=en', { headers: headers() }, env(db));
        expect(res.status).toBe(401);
    });

    it('GET /api/ad-blocks with valid session ⇒ 200', async () => {
        const res = await app.request('/api/ad-blocks?lang=en', { headers: headers(SESS) }, env(db));
        expect(res.status).toBe(200);
    });

    it('POST /api/ad-blocks with valid session but no ad_id ⇒ 422 (auth passed, not 401)', async () => {
        const res = await app.request('/api/ad-blocks?lang=en', {
            method: 'POST',
            headers: headers(SESS),
            body: JSON.stringify({}),
        }, env(db));
        expect(res.status).toBe(422);
    });
});
