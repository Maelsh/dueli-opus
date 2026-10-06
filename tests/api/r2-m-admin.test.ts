/**
 * R2-M (2/3) — independent admin messaging (H6).
 *
 * Contract under test (new system, real migrations):
 * - User opens a thread + posts; only own threads are visible (other
 *   user 403 + absent); anonymous 401; closed thread rejects user posts.
 * - Authorized inbox: SuperAdmin reads/replies/closes; Moderator reads +
 *   replies; Auditor reads but reply is 403; plain user 403 everywhere.
 * - Official identity: reply rows are sender_kind=admin; the owner is
 *   notified with the distinct admin_message type pointing at the
 *   support_thread (deep link opens the admin thread, not a conversation).
 * - Audit rows for create/reply/close with actor + target.
 * - Separate unreads: personal unread stays 0 while support unread moves.
 * - Storage separation: zero rows in messages/conversations from support
 *   traffic (and vice versa is pinned by r2-m-personal).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import app from '../../src/main';
import { createSqliteD1, SqliteD1 } from '../helpers/sqlite-d1';
import { CryptoUtils } from '../../src/lib/services/CryptoUtils';
import { SyntheticRetirementService } from '../../src/lib/services/SyntheticRetirementService';

type Env = Parameters<typeof app.request>[2];
const env = (db: SqliteD1): Env => ({ DB: db }) as unknown as Env;

let ipSeq = 42000;
function headers(token?: string): Record<string, string> {
    ipSeq += 1;
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'r2m-test',
        'CF-Connecting-IP': `10.45.45.${(ipSeq % 250) + 1}`,
    };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    return h;
}

async function seedR2M(db: SqliteD1) {
    const hash = await CryptoUtils.hashPassword('userpass1');
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_verified, is_admin, is_fake) VALUES
         (2, 'user@r2m.local', 'help_user', '${hash}', 'Help User', 1, 0, 0),
         (3, 'other@r2m.local', 'other_user', '${hash}', 'Other User', 1, 0, 0),
         (4, 'super@r2m.local', 'super_admin', '${hash}', 'Super Admin', 1, 1, 0),
         (5, 'mod@r2m.local', 'mod_agent', '${hash}', 'Mod Agent', 1, 1, 0),
         (6, 'audit@r2m.local', 'auditor', '${hash}', 'Auditor', 1, 1, 0)`,
    ).run();
    await db.prepare(
        `INSERT INTO admin_roles (user_id, role, granted_by) VALUES
         (4, 'SuperAdmin', 4), (5, 'Moderator', 4), (6, 'Auditor', 4)`,
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

async function auditActions(db: SqliteD1, adminId: number): Promise<string[]> {
    const rows = await db.prepare(
        `SELECT action_type FROM admin_audit_logs WHERE admin_id = ? ORDER BY id ASC`,
    ).bind(adminId).all<{ action_type: string }>();
    return (rows.results ?? []).map((r) => r.action_type);
}

describe('R2-M independent admin messaging', () => {
    let db: SqliteD1;
    let tokU = '';
    let tokOther = '';
    let tokSuper = '';
    let tokMod = '';
    let tokAudit = '';
    beforeEach(async () => {
        db = await createSqliteD1();
        await seedR2M(db);
        tokU = await login(db, 'user@r2m.local');
        tokOther = await login(db, 'other@r2m.local');
        tokSuper = await login(db, 'super@r2m.local');
        tokMod = await login(db, 'mod@r2m.local');
        tokAudit = await login(db, 'audit@r2m.local');
    });

    it('1. user opens a thread; only the owner sees it; anon locked out', async () => {
        const created = await api(db, 'POST', '/api/support/threads', tokU, {
            subject: 'Login issue', content: 'cannot log in on mobile',
        });
        expect(created.status).toBe(201);
        const id = created.data.data.thread.id as number;
        expect(created.data.data.thread.status).toBe('open');

        const mine = await api(db, 'GET', '/api/support/threads', tokU);
        expect((mine.data.data.threads as any[]).map((t) => t.id)).toContain(id);
        const others = await api(db, 'GET', '/api/support/threads', tokOther);
        expect(others.data.data.threads).toEqual([]);
        expect((await api(db, 'GET', `/api/support/threads/${id}`, tokOther)).status).toBe(403);
        expect((await api(db, 'GET', '/api/support/threads')).status).toBe(401);

        // Validation: empty 422, oversized 400.
        expect((await api(db, 'POST', '/api/support/threads', tokU, { content: '   ' })).status).toBe(422);
        expect((await api(db, 'POST', '/api/support/threads', tokU, { content: 'x'.repeat(4001) })).status).toBe(400);
    });

    it('2. SuperAdmin inbox: read, official reply, notification, close/reopen', async () => {
        const created = await api(db, 'POST', '/api/support/threads', tokU, {
            subject: 'Login issue', content: 'cannot log in on mobile',
        });
        const id = created.data.data.thread.id as number;

        // Inbox carries the thread with the owner's identity + unread flag.
        const inbox = await api(db, 'GET', '/api/admin/support/threads', tokSuper);
        expect(inbox.status).toBe(200);
        const row = (inbox.data.data.threads as any[]).find((t) => t.id === id);
        expect(row?.username).toBe('help_user');
        expect(row?.unread_admin).toBe(1);
        expect((await api(db, 'GET', '/api/admin/support/unread', tokSuper)).data.data.unread).toBe(1);

        // Official reply: stored as admin-kind, user notified distinctly.
        const reply = await api(db, 'POST', `/api/admin/support/threads/${id}/reply`, tokSuper, {
            content: 'We reset your session, please retry',
        });
        expect(reply.status).toBe(201);
        expect(reply.data.data.message.sender_kind).toBe('admin');

        const notifs = await api(db, 'GET', '/api/notifications', tokU);
        const adminNotif = (notifs.data.data.notifications as any[]).find((n) => n.type === 'admin_message');
        expect(adminNotif).toBeTruthy();
        expect(adminNotif.reference_type).toBe('support_thread');
        expect(adminNotif.reference_id).toBe(id);
        expect(adminNotif.link).toContain(`tab=admin&thread=${id}`);

        // Owner reads: official message visible, unread clears, badge was 1.
        expect((await api(db, 'GET', '/api/support/unread', tokU)).data.data.unread).toBe(1);
        const thread = await api(db, 'GET', `/api/support/threads/${id}`, tokU);
        expect((thread.data.data.messages as any[]).map((m) => m.sender_kind)).toEqual(['user', 'admin']);
        expect((await api(db, 'GET', '/api/support/unread', tokU)).data.data.unread).toBe(0);

        // Close: user posts rejected; reopen restores posting.
        expect((await api(db, 'PUT', `/api/admin/support/threads/${id}/status`, tokSuper, { status: 'closed' })).status).toBe(200);
        expect((await api(db, 'POST', `/api/support/threads/${id}/messages`, tokU, { content: 'still broken' })).status).toBe(409);
        expect((await api(db, 'PUT', `/api/admin/support/threads/${id}/status`, tokSuper, { status: 'open' })).status).toBe(200);
        expect((await api(db, 'POST', `/api/support/threads/${id}/messages`, tokU, { content: 'works now, thanks' })).status).toBe(201);

        const acts = await auditActions(db, 4);
        expect(acts).toContain('support_replied');
        expect(acts).toContain('support_closed');
    });

    it('3. role-differentiated inbox access; plain users locked out', async () => {
        const created = await api(db, 'POST', '/api/support/threads', tokU, { content: 'help please' });
        const id = created.data.data.thread.id as number;

        // Moderator: read + reply allowed.
        expect((await api(db, 'GET', '/api/admin/support/threads', tokMod)).status).toBe(200);
        expect((await api(db, 'POST', `/api/admin/support/threads/${id}/reply`, tokMod, { content: 'looking into it' })).status).toBe(201);

        // Auditor: read allowed, reply forbidden.
        expect((await api(db, 'GET', `/api/admin/support/threads/${id}`, tokAudit)).status).toBe(200);
        expect((await api(db, 'POST', `/api/admin/support/threads/${id}/reply`, tokAudit, { content: 'audit note' })).status).toBe(403);

        // Plain user: every admin surface forbidden.
        for (const [method, path] of [
            ['GET', '/api/admin/support/threads'],
            ['GET', `/api/admin/support/threads/${id}`],
            ['POST', `/api/admin/support/threads/${id}/reply`],
            ['PUT', `/api/admin/support/threads/${id}/status`],
            ['GET', '/api/admin/support/unread'],
        ] as const) {
            expect((await api(db, method, path, tokOther, method === 'GET' ? undefined : { content: 'x', status: 'closed' })).status).toBe(403);
        }

        // Unknown thread + bad status are 404/422, not 500.
        expect((await api(db, 'GET', '/api/admin/support/threads/9999', tokSuper)).status).toBe(404);
        expect((await api(db, 'PUT', `/api/admin/support/threads/${id}/status`, tokSuper, { status: 'archived' })).status).toBe(422);
    });

    it('4. unreads are independent across personal and admin channels', async () => {
        // Personal message to the user (from other_user).
        await api(db, 'POST', '/api/users/2/message', tokOther, { content: 'hey' });
        // Admin-side: user opens a thread (no admin reply yet).
        await api(db, 'POST', '/api/support/threads', tokU, { content: 'need help' });

        const personal = await api(db, 'GET', '/api/messages/unread', tokU);
        const support = await api(db, 'GET', '/api/support/unread', tokU);
        expect(personal.data.data.unread).toBe(1);
        expect(support.data.data.unread).toBe(0);

        // Reading the personal thread does not touch support unread and back.
        const convs = await api(db, 'GET', '/api/conversations', tokU);
        const convId = (convs.data.data.conversations as any[])[0].id as number;
        await api(db, 'GET', `/api/conversations/${convId}/messages`, tokU);
        expect((await api(db, 'GET', '/api/messages/unread', tokU)).data.data.unread).toBe(0);
        expect((await api(db, 'GET', '/api/support/unread', tokU)).data.data.unread).toBe(0);
    });

    it('5. storage separation: support traffic writes zero personal rows', async () => {
        const created = await api(db, 'POST', '/api/support/threads', tokU, { content: 'need help' });
        const id = created.data.data.thread.id as number;
        await api(db, 'POST', `/api/admin/support/threads/${id}/reply`, tokSuper, { content: 'on it' });
        await api(db, 'POST', `/api/support/threads/${id}/messages`, tokU, { content: 'thanks' });

        for (const table of ['messages', 'conversations']) {
            const row = await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
            expect(row?.n, table).toBe(0);
        }
        const threads = await db.prepare(`SELECT COUNT(*) AS n FROM support_threads`).first<{ n: number }>();
        const msgs = await db.prepare(`SELECT COUNT(*) AS n FROM support_messages`).first<{ n: number }>();
        expect(threads?.n).toBe(1);
        expect(msgs?.n).toBe(3);
    });

    it('6. retirement skips users with support rows (no FK failure, no data loss)', async () => {
        const svc = new SyntheticRetirementService(db as any);
        // Dependency-free synthetic retires even with support tables present.
        await db.prepare(
            `INSERT INTO users (email, username, password_hash, display_name, is_verified, is_admin, is_fake)
             VALUES ('synth1@r2m.local', 'synth_one', 'x', 'Synth One', 1, 0, 1)`,
        ).run();
        const retired = await svc.retireOneSyntheticUser();
        expect(retired).toBeGreaterThan(0);

        // Synthetic WITH a support thread is skipped (never auto-destroyed).
        const synth = await db.prepare(
            `INSERT INTO users (email, username, password_hash, display_name, is_verified, is_admin, is_fake)
             VALUES ('synth2@r2m.local', 'synth_two', 'x', 'Synth Two', 1, 0, 1) RETURNING id`,
        ).first<{ id: number }>();
        await db.prepare(
            `INSERT INTO support_threads (user_id, subject, status) VALUES (?, 's', 'open')`,
        ).bind(synth!.id).run();
        expect(await svc.retireOneSyntheticUser()).toBeNull();
        const threadsAfter = await db.prepare(`SELECT COUNT(*) AS n FROM support_threads`).first<{ n: number }>();
        expect(threadsAfter?.n).toBe(1);
        const owner = await db.prepare(`SELECT user_id FROM support_threads LIMIT 1`).first<{ user_id: number }>();
        expect(owner?.user_id).toBe(synth!.id);
    });
});
