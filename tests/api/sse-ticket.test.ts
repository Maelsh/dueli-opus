import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { readFileSync } from 'node:fs';

/**
 * C4 (SEC-11): SSE moves from raw `?token=<session>` to single-use tickets.
 *
 * Regression constraint: incident PR #1 — early `?token=` removal broke private
 * SSE with no alternative. Here the ticket flow lands FIRST, consumers migrate,
 * and only then is query-token support removed.
 */

const SESS_A = 'sess-c4-a';
const SESS_B = 'sess-c4-b';

function env(db: SqliteD1) {
    return { DB: db } as unknown as Parameters<typeof app.request>[2];
}

function headers(token?: string) {
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'c4-test',
    };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    return h;
}

async function seed(db: SqliteD1) {
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_active) VALUES
         (21, 'a@c4.local', 'c4_a', 'x', 'C4 A', 1),
         (22, 'b@c4.local', 'c4_b', 'x', 'C4 B', 1)`,
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES
         ('${SESS_A}', 21, datetime('now', '+1 day')),
         ('${SESS_B}', 22, datetime('now', '+1 day'))`,
    ).run();
}

async function mint(db: SqliteD1, token: string | undefined, channel: string) {
    return app.request('/api/realtime/ticket', {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify({ channel }),
    }, env(db));
}

describe('C4 — realtime ticket mint', () => {
    let db: SqliteD1;
    beforeEach(async () => {
        db = new SqliteD1();
        await seed(db);
    });

    it('1. mint without session ⇒ 401', async () => {
        const res = await mint(db, undefined, 'user:21');
        expect(res.status).toBe(401);
    });

    it('2. mint own user channel ⇒ 200 with opaque ticket (not the session)', async () => {
        const res = await mint(db, SESS_A, 'user:21');
        expect(res.status).toBe(200);
        const body = (await res.json()) as { success: boolean; data: { ticket: string; expires_in: number } };
        expect(body.success).toBe(true);
        expect(body.data.ticket).toMatch(/^[0-9a-f]{64}$/);
        expect(body.data.ticket).not.toContain(SESS_A);
        expect(body.data.expires_in).toBe(60);
    });

    it('3. mint another user channel ⇒ 403', async () => {
        const res = await mint(db, SESS_A, 'user:22');
        expect(res.status).toBe(403);
    });

    it('4. mint malformed channel ⇒ 400', async () => {
        const res = await mint(db, SESS_A, 'user:abc');
        expect(res.status).toBe(400);
    });

    it('5. auth middleware no longer reads query token (static pin)', () => {
        const source = readFileSync('src/middleware/auth.ts', 'utf8');
        expect(source).not.toContain("query('token')");
    });

    it('5b. realtime worker accepts no query token either (static pin)', () => {
        const source = readFileSync('workers/dueli-realtime/src/index.ts', 'utf8');
        expect(source).not.toContain("get('token')");
        expect(source).not.toContain('&token=');
        expect(source).toContain('/api/realtime/redeem');
    });
});

describe('C4 — worker ticket redemption (POST /api/realtime/redeem)', () => {
    const PUBLISH = 'c4-publish-secret';
    let db: SqliteD1;
    beforeEach(async () => {
        db = new SqliteD1();
        await seed(db);
    });

    function redeemEnv() {
        return { DB: db, REALTIME_PUBLISH_SECRET: PUBLISH } as unknown as Parameters<typeof app.request>[2];
    }

    async function redeem(ticket: string | undefined, channel: string, secret: string | undefined) {
        const h: Record<string, string> = { 'Content-Type': 'application/json', 'X-CSRF-Token': 'c4-test' };
        if (secret !== undefined) h['X-Publish-Secret'] = secret;
        return app.request('/api/realtime/redeem', {
            method: 'POST',
            headers: h,
            body: JSON.stringify({ ticket, channel }),
        }, redeemEnv());
    }

    it('6. wrong publish secret ⇒ 403', async () => {
        const res = await redeem('x', 'user:21', 'wrong');
        expect(res.status).toBe(403);
    });

    it('6b. unconfigured publish secret ⇒ 503 (fail closed)', async () => {
        const res = await app.request('/api/realtime/redeem', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'c4-test', 'X-Publish-Secret': PUBLISH },
            body: JSON.stringify({ ticket: 'x', channel: 'user:21' }),
        }, env(db));
        expect(res.status).toBe(503);
    });

    it('7. missing secret ⇒ 403', async () => {
        const res = await redeem('x', 'user:21', undefined);
        expect(res.status).toBe(403);
    });

    it('8. valid ticket ⇒ 200 with userId (and dies on reuse)', async () => {
        const minted = await mint(db, SESS_A, 'user:21');
        const { ticket } = ((await minted.json()) as { data: { ticket: string } }).data;
        const first = await redeem(ticket, 'user:21', PUBLISH);
        expect(first.status).toBe(200);
        const body = (await first.json()) as { valid: boolean; userId: number };
        expect(body).toMatchObject({ valid: true, userId: 21 });
        const replay = await redeem(ticket, 'user:21', PUBLISH);
        expect(replay.status).toBe(401);
    });

    it('9. unknown ticket or wrong channel ⇒ 401', async () => {
        expect((await redeem('nope', 'user:21', PUBLISH)).status).toBe(401);
        const minted = await mint(db, SESS_A, 'user:21');
        const { ticket } = ((await minted.json()) as { data: { ticket: string } }).data;
        expect((await redeem(ticket, 'user:22', PUBLISH)).status).toBe(401);
    });
});

describe('C4 — SSE via ticket, raw token dead', () => {
    let db: SqliteD1;
    beforeEach(async () => {
        db = new SqliteD1();
        await seed(db);
    });

    it('6. raw session in ?token= on a user channel ⇒ 401 (leak closed)', async () => {
        const res = await app.request(
            `/api/sse?channel=user:21&token=${SESS_A}`,
            { headers: { 'X-CSRF-Token': 'c4-test' } },
            env(db),
        );
        expect(res.status).toBe(401);
    });

    it('7. user channel with no credential at all ⇒ 401', async () => {
        const res = await app.request(
            '/api/sse?channel=user:21',
            { headers: { 'X-CSRF-Token': 'c4-test' } },
            env(db),
        );
        expect(res.status).toBe(401);
    });

    it('8. ticket opens the stream, then is single-use', async () => {
        const minted = await mint(db, SESS_A, 'user:21');
        const { ticket } = ((await minted.json()) as { data: { ticket: string } }).data;
        const res = await app.request(
            `/api/sse?channel=user:21&ticket=${ticket}`,
            { headers: { 'X-CSRF-Token': 'c4-test' } },
            env(db),
        );
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/event-stream');
        const reader = res.body!.getReader();
        const first = await reader.read();
        const text = new TextDecoder().decode(first.value);
        expect(text).toContain('connected');
        await reader.cancel();
        // Reuse ⇒ consumed ⇒ 401
        const replay = await app.request(
            `/api/sse?channel=user:21&ticket=${ticket}`,
            { headers: { 'X-CSRF-Token': 'c4-test' } },
            env(db),
        );
        expect(replay.status).toBe(401);
    });

    it('9. expired ticket ⇒ 401', async () => {
        await db.prepare(
            `INSERT INTO realtime_tickets (ticket, user_id, channel, expires_at)
             VALUES ('expired-c4', 21, 'user:21', datetime('now', '-1 minute'))`,
        ).run();
        const res = await app.request(
            '/api/sse?channel=user:21&ticket=expired-c4',
            { headers: { 'X-CSRF-Token': 'c4-test' } },
            env(db),
        );
        expect(res.status).toBe(401);
    });

    it('10. ticket bound to another channel ⇒ 401 (no cross-channel use)', async () => {
        const minted = await mint(db, SESS_A, 'user:21');
        const { ticket } = ((await minted.json()) as { data: { ticket: string } }).data;
        const res = await app.request(
            '/api/sse?channel=user:22&ticket=' + ticket,
            { headers: { 'X-CSRF-Token': 'c4-test' } },
            env(db),
        );
        expect(res.status).toBe(401);
    });

    it('10b. cross-user snooping still 403 with a valid session', async () => {
        const res = await app.request(
            '/api/sse?channel=user:22',
            { headers: headers(SESS_A) },
            env(db),
        );
        expect(res.status).toBe(403);
    });

    it('11. public competition channel still needs no credential', async () => {
        const res = await app.request(
            '/api/sse?channel=competition:9',
            { headers: { 'X-CSRF-Token': 'c4-test' } },
            env(db),
        );
        expect(res.status).toBe(200);
        await res.body?.cancel();
    });
});
