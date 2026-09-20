/**
 * Phase 7.D — TURN/STUN for restricted networks (tests/api/turn-credentials.test.ts).
 * Proves: (1) credentials are ephemeral with an expiry, (2) unauthenticated
 * requests are rejected with 401, (3) no secret material appears in the client
 * response beyond the ephemeral username/credential pair, (4) a failing TURN
 * backend yields a translated, actionable message.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import app from '../../src/main';
import { UserModel } from '../../src/models/UserModel';
import { SessionModel } from '../../src/models/SessionModel';
import { FakeD1 } from '../helpers/fake-d1';
import { t } from '../../src/i18n';

const db = new FakeD1();
const SECRET = 'unit-test-turn-secret-never-commit';
const CF_TOKEN = 'unit-test-cf-api-token';
const CF_ID = 'unit-test-cf-token-id';

function env(extra: Record<string, unknown> = {}) {
    return { DB: db, ...extra } as any;
}

async function setupUserAndSession(): Promise<{ sid: string; uid: number }> {
    const users = new UserModel(db as any);
    const uid = (await users.create({ email: 'turn@7d.test', username: 'turn7d', display_name: 'T' })).id;
    const sessions = new SessionModel(db as any);
    const sid = (await sessions.create({ user_id: uid })).id;
    return { sid, uid };
}

function get(path: string, sid?: string, extraEnv: Record<string, unknown> = {}) {
    const headers: Record<string, string> = {
        'X-CSRF-Token': 'test',
        'X-Forwarded-For': '10.7.0.11',
    };
    if (sid) headers['Authorization'] = `Bearer ${sid}`;
    return app.request(path, { method: 'GET', headers }, env(extraEnv));
}

describe('7.D TURN credentials (ephemeral, auth-gated, secret-free, graceful)', () => {
    let sid: string, uid: number;

    beforeEach(async () => {
        Object.assign(db, { users: [], sessions: [], competitions: [], sseEvents: [], userSeq: 0, sseSeq: 0 });
        ({ sid, uid } = await setupUserAndSession());
    });

    it('1. coturn path: ephemeral credential with expiry, bound to the session user', async () => {
        const beforeSec = Math.floor(Date.now() / 1000);
        const res = await get('/api/signaling/ice-servers', sid, {
            TURN_URL: 'turn:turn.example.com:3478',
            TURN_SECRET: SECRET,
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.turn_available).toBe(true);
        // Short-lived: TTL is hours, not the old shared 24h/6h-cache credential.
        expect(body.data.ttl_seconds).toBeGreaterThan(0);
        expect(body.data.ttl_seconds).toBeLessThanOrEqual(3600);
        const expiryMs = Date.parse(body.data.expires_at);
        expect(Number.isNaN(expiryMs)).toBe(false);
        expect(expiryMs).toBeGreaterThan(Date.now() - 5000);
        expect((expiryMs - Date.now()) / 1000).toBeLessThanOrEqual(3600);

        const turnEntries = body.data.iceServers.filter((s: any) => String(s.urls).startsWith('turn:'));
        expect(turnEntries.length).toBeGreaterThan(0);
        for (const entry of turnEntries) {
            const expiry = Number(String(entry.username).split(':')[0]);
            expect(expiry).toBeGreaterThanOrEqual(beforeSec);
            expect(expiry).toBeLessThanOrEqual(beforeSec + 3600);
            expect(String(entry.username).endsWith(`:${uid}`)).toBe(true);
            // Server-side HMAC generation matches the coturn REST algorithm.
            const expected = createHmac('sha1', SECRET).update(entry.username).digest('base64');
            expect(entry.credential).toBe(expected);
        }
    });

    it('2. unauthenticated or invalid session → 401', async () => {
        const configured = { TURN_URL: 'turn:turn.example.com:3478', TURN_SECRET: SECRET };
        expect((await get('/api/signaling/ice-servers', undefined, configured)).status).toBe(401);
        expect((await get('/api/signaling/ice-servers', 'expired-or-fake-session', configured)).status).toBe(401);
    });

    it('3a. no secret material in the response (coturn secret stays server-side)', async () => {
        const res = await get('/api/signaling/ice-servers', sid, {
            TURN_URL: 'turn:turn.example.com:3478',
            TURN_SECRET: SECRET,
        });
        const text = await res.text();
        expect(text).not.toContain(SECRET);
        // Only ephemeral per-session fields are exposed.
        const body = JSON.parse(text);
        for (const entry of body.data.iceServers) {
            expect(Object.keys(entry).sort()).toEqual(['credential', 'urls', 'username']);
        }
    });

    it('3b. Cloudflare Calls path: per-session short-lived request, token never leaked', async () => {
        const origFetch = globalThis.fetch;
        let requestedTtl: unknown = null;
        let authHeader: string | null = null;
        (globalThis as any).fetch = async (_url: unknown, init: any) => {
            authHeader = init.headers['Authorization'];
            requestedTtl = JSON.parse(init.body).ttl;
            return new Response(JSON.stringify({
                iceServers: [{ urls: 'turn:relay.example.com:3478', username: 'ephemeral-u', credential: 'ephemeral-c' }],
            }), { status: 200 });
        };
        try {
            const res = await get('/api/signaling/ice-servers', sid, {
                TURN_TOKEN_ID: CF_ID,
                TURN_API_TOKEN: CF_TOKEN,
            });
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.data.turn_available).toBe(true);
            expect(body.data.expires_at).toBeTruthy();
            // Per-session short-lived generation (not the old 24h shared cache).
            expect(requestedTtl).toBeLessThanOrEqual(3600);
            expect(authHeader).toBe(`Bearer ${CF_TOKEN}`); // server-side only
            const text = JSON.stringify(body);
            expect(text).not.toContain(CF_TOKEN); // the API token never reaches the client
        } finally {
            globalThis.fetch = origFetch;
        }
    });

    it('4. TURN backend failure → 502 with translated live.turn_unavailable message', async () => {
        const origFetch = globalThis.fetch;
        (globalThis as any).fetch = async () => {
            throw new Error('backend unreachable');
        };
        try {
            const res = await get('/api/signaling/ice-servers?lang=en', sid, {
                TURN_TOKEN_ID: CF_ID,
                TURN_API_TOKEN: CF_TOKEN,
            });
            expect(res.status).toBe(502);
            const body = await res.json();
            expect(body.success).toBe(false);
            expect(body.error).toBe(t('live.turn_unavailable', 'en'));
            expect(body.error).not.toBe('live.turn_unavailable');

            const resAr = await get('/api/signaling/ice-servers?lang=ar', sid, {
                TURN_TOKEN_ID: CF_ID,
                TURN_API_TOKEN: CF_TOKEN,
            });
            const bodyAr = await resAr.json();
            expect(bodyAr.error).toBe(t('live.turn_unavailable', 'ar'));
            expect(bodyAr.error).not.toBe(body.error);
        } finally {
            globalThis.fetch = origFetch;
        }
    });

    it('not configured → STUN-only graceful fallback (turn_available=false)', async () => {
        const res = await get('/api/signaling/ice-servers', sid);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.data.turn_available).toBe(false);
        expect(body.data.iceServers.length).toBeGreaterThan(0);
        for (const entry of body.data.iceServers) {
            expect(String(entry.urls).startsWith('stun:')).toBe(true);
            expect(entry.username).toBeUndefined();
            expect(entry.credential).toBeUndefined();
        }
    });

    it('i18n live.network_restricted + live.turn_unavailable exist in ar+en', async () => {
        for (const lang of ['ar', 'en'] as const) {
            for (const key of ['live.network_restricted', 'live.turn_unavailable']) {
                expect(typeof t(key, lang)).toBe('string');
                expect(t(key, lang)).not.toBe(key);
            }
        }
        expect(t('live.network_restricted', 'ar')).not.toBe(t('live.network_restricted', 'en'));
        expect(t('live.turn_unavailable', 'ar')).not.toBe(t('live.turn_unavailable', 'en'));
    });
});
