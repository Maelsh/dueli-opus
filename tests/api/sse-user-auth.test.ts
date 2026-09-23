import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';

function env(db: SqliteD1) {
    return { DB: db } as unknown as Parameters<typeof app.request>[2];
}

/**
 * SEC-11 fallback protection (C4): private user channels stay reachable for
 * legitimate users — now via single-use ticket, never via raw `?token=`.
 * (Incident PR #1 constraint: removing query-token must not break SSE.)
 */
describe('SSE user channel authentication regression test (SEC-11 fallback protection)', () => {
    let db: SqliteD1;

    beforeEach(() => {
        db = new SqliteD1();
    });

    it('GET /api/sse?channel=user:1 with a valid ticket accepts connection', async () => {
        await db.prepare(
            `INSERT INTO users (id, email, username, password_hash, display_name, is_active)
             VALUES (1, 'sse@example.com', 'sse_user', 'hash', 'SSE User', 1)`,
        ).run();
        await db.prepare(
            `INSERT INTO sessions (id, user_id, expires_at)
             VALUES ('sess-sse-u1', 1, datetime('now', '+1 day'))`,
        ).run();
        const minted = await app.request('/api/realtime/ticket', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer sess-sse-u1',
                'X-CSRF-Token': 'sse-fallback-test',
            },
            body: JSON.stringify({ channel: 'user:1' }),
        }, env(db));
        expect(minted.status).toBe(200);
        const { ticket } = ((await minted.json()) as { data: { ticket: string } }).data;

        const res = await app.request(
            `/api/sse?channel=user:1&ticket=${ticket}`,
            { headers: { 'X-CSRF-Token': 'sse-fallback-test' } },
            env(db),
        );
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/event-stream');
        await res.body?.cancel();
    });

    it('GET /api/sse?channel=user:1 with raw session ?token= returns 401 (leak closed)', async () => {
        await db.prepare(
            `INSERT INTO users (id, email, username, password_hash, display_name, is_active)
             VALUES (1, 'sse@example.com', 'sse_user', 'hash', 'SSE User', 1)`,
        ).run();
        await db.prepare(
            `INSERT INTO sessions (id, user_id, expires_at)
             VALUES ('sess-sse-raw', 1, datetime('now', '+1 day'))`,
        ).run();
        const res = await app.request(
            '/api/sse?channel=user:1&token=sess-sse-raw',
            { headers: { 'X-CSRF-Token': 'sse-fallback-test' } },
            env(db),
        );
        expect(res.status).toBe(401);
    });

    it('GET /api/sse?channel=user:1 without credential returns 401', async () => {
        const res = await app.request(
            '/api/sse?channel=user:1',
            { headers: { 'X-CSRF-Token': 'sse-fallback-test' } },
            env(db),
        );
        expect(res.status).toBe(401);
    });
});
