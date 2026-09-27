/**
 * Post-R1 acceptance (A) — /api/auth/session must NOT share the aggressive
 * authentication-attempt bucket (10 req / 15 min) with login/register.
 *
 * Proven failure on previous main: every page load fires ≥2 session checks
 * (App.init + page guard) into a per-path bucket of 10/15min, so ordinary
 * authenticated navigation 429s and the client visually logs the user out
 * while the server session stays valid.
 *
 * Pins:
 * 1. 25 sequential GET /api/auth/session with a valid session ⇒ all 200.
 * 2. Brute-force protection intact: 11 rapid POST /api/auth/login ⇒ 11th 429
 *    with a retryAfter hint; same for register.
 * 3. The session check is still covered by the general API limit (100/min).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';

const SESS = 'sess-ratelimit-ok';

function env(db: SqliteD1) {
    return { DB: db } as unknown as Parameters<typeof app.request>[2];
}

function sessionHeaders(token?: string) {
    const h: Record<string, string> = {};
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    return h;
}

function postHeaders() {
    return { 'Content-Type': 'application/json', 'X-CSRF-Token': 'ratelimit-test' };
}

async function seed(db: SqliteD1) {
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_verified, is_active)
         VALUES (91, 'rl@local', 'rluser', 'x', 'RL User', 1, 1)`
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at)
         VALUES ('${SESS}', 91, datetime('now', '+1 day'))`
    ).run();
}

describe('post-R1: session check exempt from the auth-attempt bucket', () => {
    let db: SqliteD1;
    beforeEach(async () => {
        db = new SqliteD1();
        await seed(db);
    });

    it('1. 25 sequential session checks with a valid session ⇒ all 200, no 429', async () => {
        for (let i = 1; i <= 25; i++) {
            const res = await app.request(
                '/api/auth/session', { headers: sessionHeaders(SESS) }, env(db)
            );
            expect(res.status, `session check ${i}`).toBe(200);
            const body = (await res.json()) as any;
            expect(body?.data?.user?.id ?? body?.user?.id, `check ${i} user`).toBe(91);
        }
    });

    it('2a. login brute-force protection intact: 11 rapid attempts ⇒ 11th is 429 + retryAfter', async () => {
        for (let i = 1; i <= 10; i++) {
            const res = await app.request('/api/auth/login?lang=en', {
                method: 'POST',
                headers: postHeaders(),
                body: JSON.stringify({ email: 'rl@local', password: 'wrong' }),
            }, env(db));
            expect(res.status, `login attempt ${i}`).toBe(401);
        }
        const limited = await app.request('/api/auth/login?lang=en', {
            method: 'POST',
            headers: postHeaders(),
            body: JSON.stringify({ email: 'rl@local', password: 'wrong' }),
        }, env(db));
        expect(limited.status).toBe(429);
        const body = (await limited.json()) as any;
        expect(Number(body?.retryAfter)).toBeGreaterThan(0);
    });

    it('2b. register brute-force protection intact: 11 rapid attempts ⇒ 11th is 429', async () => {
        for (let i = 1; i <= 10; i++) {
            await app.request('/api/auth/register?lang=en', {
                method: 'POST',
                headers: postHeaders(),
                body: JSON.stringify({}),
            }, env(db));
        }
        const limited = await app.request('/api/auth/register?lang=en', {
            method: 'POST',
            headers: postHeaders(),
            body: JSON.stringify({}),
        }, env(db));
        expect(limited.status).toBe(429);
    });

    it('3. the session check still counts toward the general 100/min API limit', async () => {
        for (let i = 1; i <= 100; i++) {
            const res = await app.request(
                '/api/auth/session', { headers: sessionHeaders(SESS) }, env(db)
            );
            expect(res.status, `session check ${i}`).toBe(200);
        }
        const over = await app.request(
            '/api/auth/session', { headers: sessionHeaders(SESS) }, env(db)
        );
        expect(over.status).toBe(429);
    });
});
