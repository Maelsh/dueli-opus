import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../src/main';
import { UserModel } from '../../src/models/UserModel';
import { SessionModel } from '../../src/models/SessionModel';
import { FakeD1 } from '../helpers/fake-d1';

/**
 * Post-upgrade smoke test (Agent B+): proves the app boots on the new
 * hono/wrangler and the core public surface still answers.
 */
function env(db: FakeD1) {
    return { DB: db } as any;
}

let ipSeq = 100;
function ip() {
    ipSeq += 1;
    return `10.8.8.${(ipSeq % 250) + 1}`;
}

describe('smoke: public read endpoints', () => {
    let db: FakeD1;
    beforeEach(() => {
        db = new FakeD1();
    });

    it('GET /api/categories answers 200', async () => {
        const res = await app.request('/api/categories', {}, env(db));
        expect(res.status).toBe(200);
    });

    it('GET /api/competitions answers 200', async () => {
        const res = await app.request('/api/competitions?limit=5', {}, env(db));
        expect(res.status).toBe(200);
    });

    it('GET /api/sse opens an event stream for public channels', async () => {
        const res = await app.request('/api/sse?channel=competition:1', {}, env(db));
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/event-stream');
        // Never consume an infinite stream in tests — cancel it.
        await res.body?.cancel();
    });

    it('GET /api/sse requires a channel', async () => {
        const res = await app.request('/api/sse', {}, env(db));
        expect(res.status).toBe(400);
    });
});

describe('smoke: CORS preflight', () => {
    let db: FakeD1;
    beforeEach(() => {
        db = new FakeD1();
    });

    it('OPTIONS /api/* returns CORS headers', async () => {
        const res = await app.request(
            '/api/categories',
            {
                method: 'OPTIONS',
                headers: {
                    Origin: 'https://dueli.maelshpro.com',
                    'Access-Control-Request-Method': 'GET'
                }
            },
            env(db)
        );
        expect(res.headers.get('access-control-allow-origin')).toBeTruthy();
    });
});

describe('smoke: cookie session auth', () => {
    let db: FakeD1;
    let sessionId: string;

    beforeEach(async () => {
        db = new FakeD1();
        const users = new UserModel(db as unknown as D1Database);
        const me = await users.create({
            email: 'cookie@test.com',
            username: 'cookieuser',
            display_name: 'Cookie'
        });
        const sessions = new SessionModel(db as unknown as D1Database);
        sessionId = (await sessions.create({ user_id: me.id })).id;
    });

    async function postReports(cookie?: string) {
        return app.request(
            '/api/reports',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': 'smoke',
                    'X-Forwarded-For': ip(),
                    ...(cookie ? { Cookie: cookie } : {})
                },
                body: JSON.stringify({})
            },
            env(db)
        );
    }

    it('rejects unauthenticated POST with 401', async () => {
        const res = await postReports();
        expect(res.status).toBe(401);
    });

    it('accepts the sessionId cookie past auth (422 = authed, bad body)', async () => {
        const res = await postReports(`sessionId=${sessionId}`);
        // 422 proves authMiddleware resolved the user from the cookie and the
        // controller proceeded to body validation.
        expect(res.status).toBe(422);
    });
});
