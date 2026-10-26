/**
 * UNIT31 / R4-MESSAGES-1 — M-05 persisted "mark all read".
 *
 * Runs the real route + controller + MessageModel SQL on the real migrations
 * (node:sqlite D1 shim). Pins:
 *  - anonymous request is rejected (401) and no row changes;
 *  - only messages addressed TO the caller are marked read — messages the
 *    caller sent stay untouched, and other users' unread state is untouched;
 *  - read_at is set and the unread/list projections agree with the write;
 *  - the operation is idempotent (second call reports 0 changes);
 *  - the admin support tables are never touched by personal read-all.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import app from '../../src/main';
import { createSqliteD1, SqliteD1 } from '../helpers/sqlite-d1';
import { CryptoUtils } from '../../src/lib/services/CryptoUtils';
import { sessionTokenFromResponse } from '../helpers/session-cookie';

type Env = Parameters<typeof app.request>[2];
const env = (db: SqliteD1): Env => ({ DB: db }) as unknown as Env;

let ipSeq = 44000;
function headers(token?: string): Record<string, string> {
    ipSeq += 1;
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'unit31-read-all',
        'CF-Connecting-IP': `10.55.55.${(ipSeq % 250) + 1}`,
    };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    return h;
}

async function seedUsers(db: SqliteD1) {
    const hash = await CryptoUtils.hashPassword('userpass1');
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_verified, is_admin, is_fake) VALUES
         (2, 'a@unit31.local', 'unit31_a', '${hash}', 'Unit A', 1, 0, 0),
         (3, 'b@unit31.local', 'unit31_b', '${hash}', 'Unit B', 1, 0, 0),
         (4, 'c@unit31.local', 'unit31_c', '${hash}', 'Unit C', 1, 0, 0)`,
    ).run();
}

async function login(db: SqliteD1, email: string) {
    const res = await app.request('/api/auth/login?lang=en', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ email, password: 'userpass1' }),
    }, env(db));
    const body = await res.json() as any;
    if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(body)}`);
    return sessionTokenFromResponse(res);
}

async function api(db: SqliteD1, method: string, path: string, token?: string, body?: unknown) {
    const res = await app.request(`${path}${path.includes('?') ? '&' : '?'}lang=en`, {
        method,
        headers: headers(token),
        body: body === undefined ? undefined : JSON.stringify(body),
    }, env(db));
    return { status: res.status, data: await res.json() as any };
}

interface MessageStateRow {
    content: string;
    is_read: number;
    read_at: string | null;
}

async function messageState(db: SqliteD1, content: string): Promise<MessageStateRow> {
    const row = await db.prepare(
        `SELECT content, is_read, read_at FROM messages WHERE content = ?`,
    ).bind(content).first<MessageStateRow>();
    if (!row) throw new Error(`missing message: ${content}`);
    return row;
}

describe('UNIT31 R4-MESSAGES-1 — persisted mark-all-read', () => {
    let db: SqliteD1;
    let tokA = '';
    let tokB = '';
    let tokC = '';

    beforeEach(async () => {
        db = await createSqliteD1();
        await seedUsers(db);
        tokA = await login(db, 'a@unit31.local');
        tokB = await login(db, 'b@unit31.local');
        tokC = await login(db, 'c@unit31.local');
    });

    it('rejects anonymous callers without changing any read state', async () => {
        await api(db, 'POST', '/api/users/3/message', tokA, { content: 'anon guard' });

        const res = await api(db, 'POST', '/api/messages/read-all');
        expect(res.status).toBe(401);

        const row = await messageState(db, 'anon guard');
        expect(row.is_read).toBe(0);
        expect(row.read_at).toBeNull();
    });

    it('marks only messages addressed to the caller, idempotently', async () => {
        // A -> B (target), A -> C (other receiver), B -> A (B is sender).
        const aToB = await api(db, 'POST', '/api/users/3/message', tokA, { content: 'to b' });
        expect(aToB.status).toBe(200);
        const aToC = await api(db, 'POST', '/api/users/4/message', tokA, { content: 'to c' });
        expect(aToC.status).toBe(200);
        const bToA = await api(db, 'POST', '/api/users/2/message', tokB, { content: 'from b' });
        expect(bToA.status).toBe(200);

        expect((await api(db, 'GET', '/api/messages/unread', tokB)).data.data.unread).toBe(1);
        expect((await api(db, 'GET', '/api/messages/unread', tokA)).data.data.unread).toBe(1);
        expect((await api(db, 'GET', '/api/messages/unread', tokC)).data.data.unread).toBe(1);

        const first = await api(db, 'POST', '/api/messages/read-all', tokB);
        expect(first.status).toBe(200);
        expect(first.data.success).toBe(true);
        expect(first.data.data.updated).toBe(1);

        const toB = await messageState(db, 'to b');
        expect(toB.is_read).toBe(1);
        expect(toB.read_at).not.toBeNull();

        // B's own outgoing message and C's unread message are untouched.
        const fromB = await messageState(db, 'from b');
        expect(fromB.is_read).toBe(0);
        expect(fromB.read_at).toBeNull();
        const toC = await messageState(db, 'to c');
        expect(toC.is_read).toBe(0);
        expect(toC.read_at).toBeNull();

        expect((await api(db, 'GET', '/api/messages/unread', tokB)).data.data.unread).toBe(0);
        expect((await api(db, 'GET', '/api/messages/unread', tokA)).data.data.unread).toBe(1);
        expect((await api(db, 'GET', '/api/messages/unread', tokC)).data.data.unread).toBe(1);

        // The conversation list projection agrees with the persisted read.
        const list = await api(db, 'GET', '/api/conversations', tokB);
        const withA = (list.data.data.conversations as any[]).find((c) => c.other_user_id === 2);
        expect(withA).toBeTruthy();
        expect(withA.unread_count).toBe(0);

        // Idempotent: nothing left to mark, no fabricated second update.
        const second = await api(db, 'POST', '/api/messages/read-all', tokB);
        expect(second.status).toBe(200);
        expect(second.data.data.updated).toBe(0);
        expect((await api(db, 'GET', '/api/messages/unread', tokB)).data.data.unread).toBe(0);
        expect((await messageState(db, 'to b')).is_read).toBe(1);
    });

    it('returns conversation history oldest-first with ascending ids', async () => {
        const started = await api(db, 'POST', '/api/users/3/message', tokA, { content: 'order one' });
        const convId = started.data.data.conversation.id as number;
        expect((await api(db, 'POST', `/api/conversations/${convId}/messages`, tokA, { content: 'order two' })).status).toBe(200);
        expect((await api(db, 'POST', `/api/conversations/${convId}/messages`, tokA, { content: 'order three' })).status).toBe(200);

        const thread = await api(db, 'GET', `/api/conversations/${convId}/messages`, tokB);
        expect(thread.status).toBe(200);
        const rows = thread.data.data.messages as Array<{ id: number; content: string }>;
        expect(rows.map((m) => m.content)).toEqual(['order one', 'order two', 'order three']);
        const ids = rows.map((m) => m.id);
        expect(ids).toEqual([...ids].sort((a, b) => a - b));
    });

    it('does not touch the admin/support storage', async () => {
        await api(db, 'POST', '/api/users/3/message', tokA, { content: 'personal only' });
        await api(db, 'POST', '/api/messages/read-all', tokB);

        const threads = await db.prepare(`SELECT COUNT(*) AS n FROM support_threads`).first<{ n: number }>();
        const supportMessages = await db.prepare(`SELECT COUNT(*) AS n FROM support_messages`).first<{ n: number }>();
        expect(threads?.n).toBe(0);
        expect(supportMessages?.n).toBe(0);
    });
});
