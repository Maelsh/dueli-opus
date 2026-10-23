/**
 * UNIT30.3 — behavioral regression guards for SEC-05/07/08/11.
 *
 * The AST checker (dev-tools/check-sec-guards.mjs) proves that the prohibited
 * constructs are absent from executable code. These tests prove the security
 * properties those constructs were meant to protect, so a future refactor
 * cannot satisfy the checker while silently changing runtime behavior:
 *
 *  - SEC-05: only allow-listed origins receive CORS headers, with credentials;
 *  - SEC-07: the legacy `session_id` key is never a session credential;
 *  - SEC-08: the HttpOnly cookie is authoritative and bearer stays a
 *            non-browser contract;
 *  - SEC-11: a valid session presented as `?token=` is still rejected.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import app from '../../src/main';
import { readSessionCandidates } from '../../src/lib/services/SessionCookieService';
import { CryptoUtils } from '../../src/lib/services/CryptoUtils';
import { SqliteD1 } from '../helpers/sqlite-d1';
import {
    cookieHeader,
    sessionTokenFromResponse,
} from '../helpers/session-cookie';

const ORIGIN = 'http://dueli.test';
const ALLOWED_ORIGIN = 'https://dueli.maelshpro.com';
const FOREIGN_ORIGIN = 'https://evil.example';
let ipSequence = 0;

function env(db: SqliteD1, extra: Record<string, unknown> = {}) {
    return { DB: db, ...extra } as unknown as Parameters<typeof app.request>[2];
}

function requestHeaders(extra: Record<string, string> = {}): Record<string, string> {
    ipSequence += 1;
    return {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'sec-guards-header',
        'CF-Connecting-IP': `10.89.0.${(ipSequence % 250) + 1}`,
        ...extra,
    };
}

async function seed(db: SqliteD1) {
    const hash = await CryptoUtils.hashPassword('secret123');
    for (const [id, email, username] of [
        [91, 'sec-guards-a@local', 'secguardsa'],
        [92, 'sec-guards-b@local', 'secguardsb'],
    ] as const) {
        await db.prepare(
            `INSERT INTO users (id, email, username, display_name, password_hash,
                                language, country, is_verified, is_active, is_admin)
             VALUES (?, ?, ?, ?, ?, 'en', 'US', 1, 1, 0)`
        ).bind(id, email, username, username, hash).run();
    }
}

async function login(db: SqliteD1, email: string): Promise<string> {
    const res = await app.request(`${ORIGIN}/api/auth/login?lang=en`, {
        method: 'POST',
        headers: requestHeaders(),
        body: JSON.stringify({ email, password: 'secret123' }),
    }, env(db));
    expect(res.status).toBe(200);
    return sessionTokenFromResponse(res);
}

describe('SEC-05 CORS behavior', () => {
    let db: SqliteD1;

    beforeEach(async () => {
        ipSequence = 0;
        db = new SqliteD1();
    });

    it('reflects an allow-listed origin with credentials and never a wildcard', async () => {
        const res = await app.request(`${ORIGIN}/api/auth/session`, {
            headers: requestHeaders({ Origin: ALLOWED_ORIGIN }),
        }, env(db));

        expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
        expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
        expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe('*');
    });

    it('sends no CORS header to an origin outside the allow-list', async () => {
        const res = await app.request(`${ORIGIN}/api/auth/session`, {
            headers: requestHeaders({ Origin: FOREIGN_ORIGIN }),
        }, env(db));

        expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('honors an explicit ALLOWED_ORIGINS allow-list in the environment', async () => {
        const allowed = await app.request(`${ORIGIN}/api/auth/session`, {
            headers: requestHeaders({ Origin: 'https://custom.example' }),
        }, env(db, { ALLOWED_ORIGINS: 'https://custom.example' }));
        expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://custom.example');

        const defaultOrigin = await app.request(`${ORIGIN}/api/auth/session`, {
            headers: requestHeaders({ Origin: ALLOWED_ORIGIN }),
        }, env(db, { ALLOWED_ORIGINS: 'https://custom.example' }));
        expect(defaultOrigin.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('answers a preflight from an allow-listed origin without allowing a foreign one', async () => {
        const allowed = await app.request(`${ORIGIN}/api/auth/logout`, {
            method: 'OPTIONS',
            headers: requestHeaders({
                Origin: ALLOWED_ORIGIN,
                'Access-Control-Request-Method': 'POST',
            }),
        }, env(db));
        expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
        expect(allowed.headers.get('Access-Control-Allow-Methods')).toContain('POST');

        const foreign = await app.request(`${ORIGIN}/api/auth/logout`, {
            method: 'OPTIONS',
            headers: requestHeaders({
                Origin: FOREIGN_ORIGIN,
                'Access-Control-Request-Method': 'POST',
            }),
        }, env(db));
        expect(foreign.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
});

describe('SEC-07/SEC-08/SEC-11 canonical session access', () => {
    let db: SqliteD1;

    beforeEach(async () => {
        ipSequence = 0;
        db = new SqliteD1();
        await seed(db);
    });

    it('reads the canonical cookie first, then Bearer — never legacy keys or query tokens', async () => {
        const probe = new Hono();
        probe.get('/probe', (c) => c.json({ candidates: readSessionCandidates(c) }));

        const res = await probe.request('http://probe.test/probe?token=query-secret&session_id=query-legacy', {
            headers: {
                Cookie: 'sessionId=cookie-session; session_id=legacy-cookie',
                Authorization: 'Bearer bearer-session',
            },
        });
        expect(((await res.json()) as any).candidates).toEqual(['cookie-session', 'bearer-session']);

        const legacyOnly = await probe.request('http://probe.test/probe?token=query-secret', {
            headers: { Cookie: 'session_id=legacy-cookie' },
        });
        expect(((await legacyOnly.json()) as any).candidates).toEqual([]);
    });

    it('de-duplicates a cookie and Bearer carrying the same session', async () => {
        const probe = new Hono();
        probe.get('/probe', (c) => c.json({ candidates: readSessionCandidates(c) }));

        const res = await probe.request('http://probe.test/probe', {
            headers: {
                Cookie: 'sessionId=same-session',
                Authorization: 'Bearer same-session',
            },
        });
        expect(((await res.json()) as any).candidates).toEqual(['same-session']);
    });

    it('ignores a valid session presented under the legacy session_id cookie', async () => {
        const token = await login(db, 'sec-guards-a@local');
        const res = await app.request(`${ORIGIN}/api/auth/session`, {
            headers: requestHeaders({ Cookie: `session_id=${token}` }),
        }, env(db));

        expect(res.status).toBe(200);
        expect(((await res.json()) as any).data.user).toBeNull();
    });

    it('rejects a valid session presented as ?token= on a protected route', async () => {
        const token = await login(db, 'sec-guards-a@local');

        const queryOnly = await app.request(
            `${ORIGIN}/api/withdrawals?token=${encodeURIComponent(token)}`,
            { headers: requestHeaders() },
            env(db),
        );
        expect(queryOnly.status).toBe(401);

        const bearer = await app.request(`${ORIGIN}/api/withdrawals`, {
            headers: requestHeaders({ Authorization: `Bearer ${token}` }),
        }, env(db));
        expect(bearer.status).toBe(200);
    });

    it('prefers the browser cookie over a valid Bearer from another user', async () => {
        const cookieToken = await login(db, 'sec-guards-a@local');
        const bearerToken = await login(db, 'sec-guards-b@local');

        const res = await app.request(`${ORIGIN}/api/auth/session`, {
            headers: requestHeaders({
                Cookie: cookieHeader(cookieToken),
                Authorization: `Bearer ${bearerToken}`,
            }),
        }, env(db));

        expect(res.status).toBe(200);
        expect(((await res.json()) as any).data.user.id).toBe(91);
    });

    it('falls back to Bearer when the browser cookie is stale (migration path)', async () => {
        const bearerToken = await login(db, 'sec-guards-b@local');

        const res = await app.request(`${ORIGIN}/api/auth/session`, {
            headers: requestHeaders({
                Cookie: cookieHeader('stale-not-a-session'),
                Authorization: `Bearer ${bearerToken}`,
            }),
        }, env(db));

        expect(res.status).toBe(200);
        expect(((await res.json()) as any).data.user.id).toBe(92);
    });
});
