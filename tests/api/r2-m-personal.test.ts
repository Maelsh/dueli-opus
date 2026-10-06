/**
 * R2-M (1/3) — personal User↔User messaging proof (ALREADY DONE, pinned).
 *
 * Proves the existing personal system end-to-end on real migrations:
 * two users converse (start/send/list/thread/unread), state survives
 * refresh, a third user sees nothing of it (403 + absent from lists),
 * anonymous is 401, and the admin support_* tables stay untouched by
 * personal traffic (storage separation, personal side).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import app from '../../src/main';
import { createSqliteD1, SqliteD1 } from '../helpers/sqlite-d1';
import { CryptoUtils } from '../../src/lib/services/CryptoUtils';

type Env = Parameters<typeof app.request>[2];
const env = (db: SqliteD1): Env => ({ DB: db }) as unknown as Env;

let ipSeq = 41000;
function headers(token?: string): Record<string, string> {
    ipSeq += 1;
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'r2m-test',
        'CF-Connecting-IP': `10.44.44.${(ipSeq % 250) + 1}`,
    };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    return h;
}

async function seedUsers(db: SqliteD1) {
    const hash = await CryptoUtils.hashPassword('userpass1');
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_verified, is_admin, is_fake) VALUES
         (2, 'a@r2m.local', 'user_a', '${hash}', 'User A', 1, 0, 0),
         (3, 'b@r2m.local', 'user_b', '${hash}', 'User B', 1, 0, 0),
         (4, 'c@r2m.local', 'user_c', '${hash}', 'User C', 1, 0, 0)`,
    ).run();
}

async function login(db: SqliteD1, email: string) {
    const res = await app.request('/api/auth/login?lang=en', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ email, password: 'userpass1' }),
    }, env(db));
    const body = await res.json() as any;
    return body.data.sessionId as string;
}

async function api(db: SqliteD1, method: string, path: string, token?: string, body?: unknown) {
    const res = await app.request(`${path}${path.includes('?') ? '&' : '?'}lang=en`, {
        method,
        headers: headers(token),
        body: body === undefined ? undefined : JSON.stringify(body),
    }, env(db));
    return { status: res.status, data: await res.json() as any };
}

describe('R2-M personal messaging proof', () => {
    let db: SqliteD1;
    let tokA = '';
    let tokB = '';
    let tokC = '';
    beforeEach(async () => {
        db = await createSqliteD1();
        await seedUsers(db);
        tokA = await login(db, 'a@r2m.local');
        tokB = await login(db, 'b@r2m.local');
        tokC = await login(db, 'c@r2m.local');
    });

    it('1. A→B conversation: start, reply, thread, unread lifecycle', async () => {
        const started = await api(db, 'POST', '/api/users/3/message', tokA, { content: 'hello B' });
        expect(started.status).toBe(200);
        const convId = started.data.data.conversation.id as number;

        const reply = await api(db, 'POST', `/api/conversations/${convId}/messages`, tokB, { content: 'hi A' });
        expect(reply.status).toBe(200);

        // B reads: both messages present, unread clears. (Server returns
        // newest-first; the thread SET is what refresh must preserve.)
        const thread = await api(db, 'GET', `/api/conversations/${convId}/messages`, tokB);
        expect(thread.status).toBe(200);
        expect((thread.data.data.messages as any[]).map((m) => m.content).sort()).toEqual(['hello B', 'hi A']);
        expect((await api(db, 'GET', '/api/messages/unread', tokB)).data.data.unread).toBe(0);

        // A has one unread (B's reply); refresh keeps the same thread.
        expect((await api(db, 'GET', '/api/messages/unread', tokA)).data.data.unread).toBe(1);
        const reread = await api(db, 'GET', `/api/conversations/${convId}/messages`, tokA);
        expect((reread.data.data.messages as any[]).length).toBe(2);
        expect((await api(db, 'GET', '/api/messages/unread', tokA)).data.data.unread).toBe(0);

        // B's conversation list carries the thread with the other party.
        const list = await api(db, 'GET', '/api/conversations', tokB);
        expect((list.data.data.conversations as any[]).some((c) => c.id === convId)).toBe(true);
    });

    it('2. C sees nothing of A↔B; anonymous is locked out', async () => {
        const started = await api(db, 'POST', '/api/users/3/message', tokA, { content: 'hello B' });
        const convId = started.data.data.conversation.id as number;

        expect((await api(db, 'GET', `/api/conversations/${convId}/messages`, tokC)).status).toBe(403);
        expect((await api(db, 'POST', `/api/conversations/${convId}/messages`, tokC, { content: 'intrude' })).status).toBe(403);
        const list = await api(db, 'GET', '/api/conversations', tokC);
        expect(list.data.data.conversations).toEqual([]);
        expect((await api(db, 'GET', '/api/conversations')).status).toBe(401);
        expect((await api(db, 'POST', '/api/users/3/message', undefined, { content: 'x' })).status).toBe(401);
    });

    it('3. personal traffic never touches the admin support tables', async () => {
        await api(db, 'POST', '/api/users/3/message', tokA, { content: 'hello B' });
        const threads = await db.prepare(`SELECT COUNT(*) AS n FROM support_threads`).first<{ n: number }>();
        const msgs = await db.prepare(`SELECT COUNT(*) AS n FROM support_messages`).first<{ n: number }>();
        expect(threads?.n).toBe(0);
        expect(msgs?.n).toBe(0);
    });
});
