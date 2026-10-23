/**
 * SEC-08 — browser session transport is a server-managed HttpOnly cookie.
 *
 * Pins:
 *  - login/Set-Cookie attributes and the absence of a JSON session secret;
 *  - cookie-authenticated session/logout/admin/finance/advertiser/messages/
 *    download/SSE/signaling/upload paths;
 *  - Bearer non-browser compatibility and the bounded migration Set-Cookie;
 *  - CSRF double-submit accept/reject plus the Bearer (non-browser) bypass;
 *  - multiple independent sessions and logout invalidation.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { CryptoUtils } from '../../src/lib/services/CryptoUtils';
import {
    cookieHeader,
    csrfTokenFromResponse,
    sessionTokenFromResponse,
    setCookieHeaders,
} from '../helpers/session-cookie';

const ORIGIN = 'http://dueli.test';
let ipSequence = 0;

function env(db: SqliteD1) {
    return { DB: db } as unknown as Parameters<typeof app.request>[2];
}

function requestHeaders(extra: Record<string, string> = {}): Record<string, string> {
    ipSequence += 1;
    return {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'sec08-legacy-header',
        'CF-Connecting-IP': `10.88.0.${(ipSequence % 250) + 1}`,
        ...extra,
    };
}

async function seed(db: SqliteD1) {
    const hash = await CryptoUtils.hashPassword('secret123');
    await db.prepare(
        `INSERT INTO users (id, email, username, display_name, password_hash,
                            language, country, is_verified, is_active, is_admin)
         VALUES (81, 'sec08@local', 'sec08user', 'SEC08 User', ?, 'en', 'US', 1, 1, 0)`
    ).bind(hash).run();
    await db.prepare(
        `INSERT INTO users (id, email, username, display_name, password_hash,
                            language, country, is_verified, is_active, is_admin)
         VALUES (82, 'sec08admin@local', 'sec08admin', 'SEC08 Admin', ?, 'en', 'US', 1, 1, 1)`
    ).bind(hash).run();
    await db.prepare(
        `INSERT INTO admin_roles (user_id, role, granted_by) VALUES (82, 'SuperAdmin', 82)`
    ).run();
}

async function login(db: SqliteD1, email = 'sec08@local', origin = ORIGIN) {
    const res = await app.request(`${origin}/api/auth/login?lang=en`, {
        method: 'POST',
        headers: requestHeaders(),
        body: JSON.stringify({ email, password: 'secret123' }),
    }, env(db));
    expect(res.status).toBe(200);
    return res;
}

describe('SEC-08 HttpOnly browser session', () => {
    let db: SqliteD1;

    beforeEach(async () => {
        ipSequence = 0;
        db = new SqliteD1();
        await seed(db);
        (globalThis as any).__sec08Db = db;
    });

    it('login issues an HttpOnly/Secure/SameSite session cookie and no JSON secret', async () => {
        const res = await login(db, 'sec08@local', 'https://dueli.test');
        const body = (await res.json()) as any;
        expect(body.data.user.id).toBe(81);
        expect(body.data.sessionId).toBeUndefined();
        expect(JSON.stringify(body)).not.toContain('sessionId');
        expect(res.headers.get('Cache-Control')).toBe('no-store');

        const headers = setCookieHeaders(res);
        const sessionCookie = headers.find((h) => h.startsWith('sessionId='));
        expect(sessionCookie).toBeTruthy();
        expect(sessionCookie).toContain('HttpOnly');
        expect(sessionCookie).toContain('Secure');
        expect(sessionCookie).toContain('SameSite=Lax');
        expect(sessionCookie).toContain('Path=/');
        expect(sessionCookie).toMatch(/Max-Age=\d+/);
        expect(sessionCookie).toContain('Expires=');

        const csrfCookie = headers.find((h) => h.startsWith('csrfToken='));
        expect(csrfCookie).toBeTruthy();
        expect(csrfCookie).not.toContain('HttpOnly');
        expect(csrfCookie).toContain('SameSite=Lax');
    });

    it('never downgrades a Secure cookie from a spoofed proxy header', async () => {
        const res = await app.request('https://dueli.test/api/auth/login?lang=en', {
            method: 'POST',
            headers: requestHeaders({ 'X-Forwarded-Proto': 'http' }),
            body: JSON.stringify({ email: 'sec08@local', password: 'secret123' }),
        }, env(db));
        expect(res.status).toBe(200);
        const sessionCookie = setCookieHeaders(res).find((h) => h.startsWith('sessionId='));
        expect(sessionCookie).toContain('Secure');
    });

    it('authenticates GET /api/auth/session from the cookie only', async () => {
        const loginRes = await login(db);
        const session = sessionTokenFromResponse(loginRes);
        const res = await app.request(`${ORIGIN}/api/auth/session`, {
            headers: requestHeaders({ Cookie: cookieHeader(session) }),
        }, env(db));
        expect(res.status).toBe(200);
        const body = (await res.json()) as any;
        expect(body.data.user.id).toBe(81);

        // Even a valid legacy (pre-SEC08, JS-readable) cookie is upgraded by
        // reissuing the same value as HttpOnly on the first session check.
        const upgraded = setCookieHeaders(res).find((h) => h.startsWith('sessionId='));
        expect(upgraded).toContain('HttpOnly');
        expect(sessionTokenFromResponse(res)).toBe(session);
    });

    it('migrates a valid Bearer session to the HttpOnly cookie once (bounded transition)', async () => {
        const loginRes = await login(db);
        const session = sessionTokenFromResponse(loginRes);
        const res = await app.request(`${ORIGIN}/api/auth/session`, {
            headers: requestHeaders({ Authorization: `Bearer ${session}` }),
        }, env(db));
        expect(res.status).toBe(200);
        const migrated = setCookieHeaders(res).find((h) => h.startsWith('sessionId='));
        expect(migrated).toContain('HttpOnly');
        expect(sessionTokenFromResponse(res)).toBe(session);
    });

    it('logout invalidates the server session and clears both cookies', async () => {
        const loginRes = await login(db);
        const session = sessionTokenFromResponse(loginRes);
        const csrf = csrfTokenFromResponse(loginRes);

        const out = await app.request(`${ORIGIN}/api/auth/logout`, {
            method: 'POST',
            headers: requestHeaders({
                Cookie: cookieHeader(session, csrf),
                'X-CSRF-Token': csrf,
            }),
        }, env(db));
        expect(out.status).toBe(200);
        const cleared = setCookieHeaders(out).filter((h) => h.startsWith('sessionId='));
        expect(cleared.some((h) => /Max-Age=0/i.test(h))).toBe(true);

        const after = await app.request(`${ORIGIN}/api/auth/session`, {
            headers: requestHeaders({ Cookie: cookieHeader(session) }),
        }, env(db));
        expect(after.status).toBe(200);
        expect(((await after.json()) as any).data.user).toBeNull();
    });

    it('rejects cookie-authenticated state changes without a matching CSRF pair', async () => {
        const loginRes = await login(db);
        const session = sessionTokenFromResponse(loginRes);
        const csrf = csrfTokenFromResponse(loginRes);

        const missing = await app.request(`${ORIGIN}/api/auth/logout`, {
            method: 'POST',
            headers: requestHeaders({ Cookie: cookieHeader(session, csrf) }),
        }, env(db));
        expect(missing.status).toBe(403);

        const wrong = await app.request(`${ORIGIN}/api/auth/logout`, {
            method: 'POST',
            headers: requestHeaders({
                Cookie: cookieHeader(session, csrf),
                'X-CSRF-Token': 'not-the-cookie',
            }),
        }, env(db));
        expect(wrong.status).toBe(403);

        const accepted = await app.request(`${ORIGIN}/api/auth/logout`, {
            method: 'POST',
            headers: requestHeaders({
                Cookie: cookieHeader(session, csrf),
                'X-CSRF-Token': csrf,
            }),
        }, env(db));
        expect(accepted.status).toBe(200);
    });

    it('preserves non-browser Bearer auth without a CSRF token', async () => {
        const loginRes = await login(db);
        const session = sessionTokenFromResponse(loginRes);
        const res = await app.request(`${ORIGIN}/api/auth/logout`, {
            method: 'POST',
            headers: requestHeaders({ Authorization: `Bearer ${session}` }),
        }, env(db));
        expect(res.status).toBe(200);
    });

    it('keeps multiple sessions independent', async () => {
        const first = await login(db, 'sec08@local');
        const second = await login(db, 'sec08@local');
        const firstSession = sessionTokenFromResponse(first);
        const secondSession = sessionTokenFromResponse(second);
        expect(firstSession).not.toBe(secondSession);

        const firstCsrf = csrfTokenFromResponse(first);
        const out = await app.request(`${ORIGIN}/api/auth/logout`, {
            method: 'POST',
            headers: requestHeaders({
                Cookie: cookieHeader(firstSession, firstCsrf),
                'X-CSRF-Token': firstCsrf,
            }),
        }, env(db));
        expect(out.status).toBe(200);

        const still = await app.request(`${ORIGIN}/api/auth/session`, {
            headers: requestHeaders({ Cookie: cookieHeader(secondSession) }),
        }, env(db));
        expect(((await still.json()) as any).data.user.id).toBe(81);
    });

    it('keeps a freshly rotated session when pruning at the per-user cap', async () => {
        for (let i = 0; i < 5; i++) {
            await db.prepare(
                `INSERT INTO sessions (id, user_id, expires_at, created_at)
                 VALUES (?, 81, datetime('now', '+7 days'), datetime('now'))`
            ).bind(`sec08-seeded-${i}`).run();
        }
        const res = await login(db);
        const fresh = sessionTokenFromResponse(res);
        const check = await app.request(`${ORIGIN}/api/auth/session`, {
            headers: requestHeaders({ Cookie: cookieHeader(fresh) }),
        }, env(db));
        expect(check.status).toBe(200);
        expect(((await check.json()) as any).data.user.id).toBe(81);
    });

    it('clears the browser cookies when a password change revokes every session', async () => {
        const loginRes = await login(db);
        const session = sessionTokenFromResponse(loginRes);
        const csrf = csrfTokenFromResponse(loginRes);
        const res = await app.request(`${ORIGIN}/api/account/password`, {
            method: 'PUT',
            headers: requestHeaders({
                Cookie: cookieHeader(session, csrf),
                'X-CSRF-Token': csrf,
            }),
            body: JSON.stringify({
                current_password: 'secret123',
                new_password: 'newsecret123',
            }),
        }, env(db));
        expect(res.status).toBe(200);
        const cookies = setCookieHeaders(res);
        for (const name of ['sessionId', 'csrfToken']) {
            const cleared = cookies.find((h) => h.startsWith(`${name}=`));
            expect(cleared, `${name} must be cleared`).toBeTruthy();
            expect(cleared).toMatch(/Max-Age=0/i);
        }

        const after = await app.request(`${ORIGIN}/api/auth/session`, {
            headers: requestHeaders({ Cookie: cookieHeader(session) }),
        }, env(db));
        expect(((await after.json()) as any).data.user).toBeNull();
    });

    it('rotates the presented browser session on login and keeps other sessions', async () => {
        const first = await login(db);
        const firstSession = sessionTokenFromResponse(first);
        const firstCsrf = csrfTokenFromResponse(first);

        const second = await app.request(`${ORIGIN}/api/auth/login?lang=en`, {
            method: 'POST',
            headers: requestHeaders({
                Cookie: cookieHeader(firstSession, firstCsrf),
                'X-CSRF-Token': firstCsrf,
            }),
            body: JSON.stringify({ email: 'sec08@local', password: 'secret123' }),
        }, env(db));
        expect(second.status).toBe(200);
        const rotated = sessionTokenFromResponse(second);
        expect(rotated).not.toBe(firstSession);

        const old = await app.request(`${ORIGIN}/api/auth/session`, {
            headers: requestHeaders({ Cookie: cookieHeader(firstSession) }),
        }, env(db));
        expect(((await old.json()) as any).data.user).toBeNull();

        const fresh = await app.request(`${ORIGIN}/api/auth/session`, {
            headers: requestHeaders({ Cookie: cookieHeader(rotated) }),
        }, env(db));
        expect(((await fresh.json()) as any).data.user.id).toBe(81);
    });

    it('replaces a stale cookie when a valid legacy Bearer migrates the session', async () => {
        const loginRes = await login(db);
        const valid = sessionTokenFromResponse(loginRes);

        const migrated = await app.request(`${ORIGIN}/api/auth/session`, {
            headers: requestHeaders({
                // The invalid browser cookie was sent first. The valid legacy
                // Bearer must still migrate into a fresh HttpOnly cookie.
                Cookie: cookieHeader('stale-not-a-session'),
                Authorization: `Bearer ${valid}`,
            }),
        }, env(db));
        expect(migrated.status).toBe(200);
        expect(sessionTokenFromResponse(migrated)).toBe(valid);

        const cookieOnly = await app.request(`${ORIGIN}/api/auth/session`, {
            headers: requestHeaders({ Cookie: cookieHeader(valid) }),
        }, env(db));
        expect(((await cookieOnly.json()) as any).data.user.id).toBe(81);
    });

    it('treats an expired server session as guest and clears the dead cookie', async () => {
        const loginRes = await login(db);
        const session = sessionTokenFromResponse(loginRes);
        await db.prepare(
            'UPDATE sessions SET expires_at = ? WHERE id = ?'
        ).bind(new Date(Date.now() - 60_000).toISOString(), session).run();

        const res = await app.request(`${ORIGIN}/api/auth/session`, {
            headers: requestHeaders({ Cookie: cookieHeader(session) }),
        }, env(db));
        expect(res.status).toBe(200);
        expect(((await res.json()) as any).data.user).toBeNull();
        const cleared = setCookieHeaders(res).find((h) => h.startsWith('sessionId='));
        expect(cleared).toBeTruthy();
        expect(cleared).toMatch(/Max-Age=0/i);
    });

    it('rejects a cookie-authenticated state change from a foreign Origin even with a matching CSRF pair', async () => {
        const loginRes = await login(db);
        const session = sessionTokenFromResponse(loginRes);
        const csrf = csrfTokenFromResponse(loginRes);

        const res = await app.request(`${ORIGIN}/api/auth/logout`, {
            method: 'POST',
            headers: requestHeaders({
                Origin: 'https://evil.example',
                Cookie: cookieHeader(session, csrf),
                'X-CSRF-Token': csrf,
            }),
        }, env(db));
        expect(res.status).toBe(403);
    });

    it('logout clears both the session and CSRF cookies', async () => {
        const loginRes = await login(db);
        const session = sessionTokenFromResponse(loginRes);
        const csrf = csrfTokenFromResponse(loginRes);
        const out = await app.request(`${ORIGIN}/api/auth/logout`, {
            method: 'POST',
            headers: requestHeaders({
                Cookie: cookieHeader(session, csrf),
                'X-CSRF-Token': csrf,
            }),
        }, env(db));
        expect(out.status).toBe(200);
        const cookies = setCookieHeaders(out);
        for (const name of ['sessionId', 'csrfToken']) {
            const cleared = cookies.find((h) => h.startsWith(`${name}=`));
            expect(cleared, `${name} must be cleared`).toBeTruthy();
            expect(cleared).toMatch(/Max-Age=0/i);
        }
    });

    it('authenticates the download manifest with the cookie (not 401)', async () => {
        const loginRes = await login(db);
        const session = sessionTokenFromResponse(loginRes);
        const res = await app.request(`${ORIGIN}/api/chunks/download/999999999`, {
            headers: requestHeaders({ Cookie: cookieHeader(session) }),
        }, env(db));
        // The route is auth-protected; past auth it reports the missing
        // competition, never `auth_required`.
        expect(res.status).toBe(404);
        expect(((await res.json()) as any).code).toBe('not_found');
    });

    it('authenticates Admin, Advertiser, Finance and Messages with the cookie', async () => {
        const adminLogin = await login(db, 'sec08admin@local');
        const adminSession = sessionTokenFromResponse(adminLogin);
        const admin = await app.request(`${ORIGIN}/api/admin/enhanced-stats`, {
            headers: requestHeaders({ Cookie: cookieHeader(adminSession) }),
        }, env(db));
        expect(admin.status).toBe(200);

        const loginRes = await login(db);
        const session = sessionTokenFromResponse(loginRes);
        for (const path of [
            '/api/advertiser/dashboard',
            '/api/withdrawals',
            '/api/conversations',
        ]) {
            const res = await app.request(`${ORIGIN}${path}`, {
                headers: requestHeaders({ Cookie: cookieHeader(session) }),
            }, env(db));
            expect(res.status, path).toBe(200);
        }
    });

    it('authenticates SSE ticket creation, signaling verify and chunk lease with the cookie', async () => {
        const loginRes = await login(db);
        const session = sessionTokenFromResponse(loginRes);
        const csrf = csrfTokenFromResponse(loginRes);
        const headers = requestHeaders({
            Cookie: cookieHeader(session, csrf),
            'X-CSRF-Token': csrf,
        });

        const ticket = await app.request(`${ORIGIN}/api/realtime/ticket`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ channel: 'user:81' }),
        }, env(db));
        expect(ticket.status).toBe(200);

        const signaling = await app.request(`${ORIGIN}/api/signaling/verify`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ competition_id: 999999, claimed_role: 'guest' }),
        }, env(db));
        expect(signaling.status).not.toBe(401);

        const lease = await app.request(`${ORIGIN}/api/chunks/lease/acquire`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ competition_id: 999999, holder_nonce: 'sec08-holder' }),
        }, env(db));
        expect(lease.status).not.toBe(401);
    });
});
