/**
 * Post-R1 acceptance (D) — the missing user-facing /notifications page.
 *
 * Proven gap on previous main: the header "View All" linked to
 * /notifications but no page/route existed (404), while the authenticated
 * GET /api/notifications API worked.
 *
 * Pins:
 * 1. GET /notifications?lang=en|ar ⇒ 200 with the inbox shell (title,
 *    list container, mark-all control), strict-CSP (nonce script, no inline
 *    handlers), ar/en + RTL/LTR, and no "[object Object]".
 * 2. Existing API contract untouched: 401 without a session; an
 *    authenticated inbox lists presented notifications with unread state;
 *    POST /:id/read marks one; POST /read-all marks all.
 * 3. Only supported actions exist (no invented star/purge endpoints).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { NotificationModel } from '../../src/models/NotificationModel';

const SESS = 'sess-notif-page';

function env(db: SqliteD1) {
    return { DB: db } as unknown as Parameters<typeof app.request>[2];
}

function auth(token?: string) {
    const h: Record<string, string> = { 'X-CSRF-Token': 'notif-test' };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    return h;
}

async function seed(db: SqliteD1) {
    await db.prepare(
        `INSERT INTO users (id, email, username, display_name, password_hash, is_active)
         VALUES (81, 'n@local', 'notifuser', 'Notif User', 'x', 1)`
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at)
         VALUES ('${SESS}', 81, datetime('now', '+1 day'))`
    ).run();
    const notes = new NotificationModel(db as unknown as D1Database);
    await notes.createForType({
        user_id: 81,
        type: 'message',
        payload: { actor: 'Alice', preview: 'hello there', username: 'alice' },
        reference_type: 'conversation',
        reference_id: 5,
    });
    await notes.create({ user_id: 81, type: 'system', title: 'notification.system_notice' });
}

describe('post-R1: /notifications page + inbox contract', () => {
    let db: SqliteD1;
    beforeEach(async () => {
        db = new SqliteD1();
        await seed(db);
    });

    it('1a. GET /notifications?lang=en ⇒ 200 inbox shell, no [object Object]', async () => {
        const res = await app.request('/notifications?lang=en', {}, env(db));
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('Notifications');
        expect(html).toContain('notificationsContent');
        expect(html).toContain('markAllNotificationsRead');
        expect(html).toContain('dir="ltr"');
        expect(html).not.toContain('[object Object]');
        expect(html).not.toContain('onclick=');
    });

    it('1b. GET /notifications?lang=ar ⇒ 200 RTL shell', async () => {
        const res = await app.request('/notifications?lang=ar', {}, env(db));
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('الإشعارات');
        expect(html).toContain('dir="rtl"');
        expect(html).not.toContain('[object Object]');
    });

    it('2a. GET /api/notifications without a session ⇒ 401 (contract kept)', async () => {
        const res = await app.request('/api/notifications?lang=en', { headers: auth() }, env(db));
        expect(res.status).toBe(401);
    });

    it('2b. authenticated inbox lists presented notifications with unread state', async () => {
        const res = await app.request('/api/notifications?lang=en', { headers: auth(SESS) }, env(db));
        expect(res.status).toBe(200);
        const body = (await res.json()) as any;
        expect(body.success).toBe(true);
        expect(body.data.unreadCount).toBe(2);
        expect(body.data.notifications).toHaveLength(2);
        const titles = body.data.notifications.map((n: any) => n.title);
        expect(titles).toContain('New Message');
        for (const n of body.data.notifications) {
            expect(typeof n.title).toBe('string');
            expect(typeof n.message).toBe('string');
        }
    });

    it('2c. POST /:id/read marks one read; POST /read-all marks the rest', async () => {
        const list = (await (await app.request('/api/notifications?lang=en', {
            headers: auth(SESS),
        }, env(db))).json()) as any;
        const firstId = list.data.notifications[0].id;

        const one = await app.request(`/api/notifications/${firstId}/read?lang=en`, {
            method: 'POST', headers: auth(SESS),
        }, env(db));
        expect(one.status).toBe(200);

        const afterOne = (await (await app.request('/api/notifications?lang=en', {
            headers: auth(SESS),
        }, env(db))).json()) as any;
        expect(afterOne.data.unreadCount).toBe(1);

        const all = await app.request('/api/notifications/read-all?lang=en', {
            method: 'POST', headers: auth(SESS),
        }, env(db));
        expect(all.status).toBe(200);
        expect(((await all.json()) as any)?.data?.markedCount).toBe(1);

        const afterAll = (await (await app.request('/api/notifications?lang=en', {
            headers: auth(SESS),
        }, env(db))).json()) as any;
        expect(afterAll.data.unreadCount).toBe(0);
    });

    it('3. no invented notification actions exist', async () => {
        for (const path of [
            `/api/notifications/1/star`,
            `/api/notifications/purge`,
        ]) {
            const res = await app.request(`${path}?lang=en`, {
                method: 'POST', headers: auth(SESS),
            }, env(db));
            expect(res.status, path).toBe(404);
        }
    });
});
