/**
 * R2-F — forensic regression pins for the remaining user journeys.
 *
 * Each case below failed (or was exploitable) on BASE and passes after the
 * R2-F fixes. SqliteD1 runs the REAL migrations, so FK/atomicity behaviour
 * is production SQL, not an approximation.
 *
 * 1. notifications ownership — POST /:id/read on another user's row ⇒ 404
 *    and the row stays unread (was: marked read cross-user).
 * 2. complaints ownership — GET /:id on another user's complaint ⇒ 404
 *    (was: full tracker disclosed cross-user).
 * 3. follow idempotency — repeated POST /:id/follow ⇒ one follow row and
 *    exactly ONE follow notification (was: a notification per POST).
 * 4. delete-account verify — PBKDF2 password verifies (was: inline SHA-256
 *    comparison rejected every modern hash); wrong password stays 401.
 * 5. delete-account full journey — one atomic batch: anonymized user,
 *    sessions destroyed, sensitive leftovers cleaned (payment_methods,
 *    watch_history, blocks, roles, upload keys, tickets), donation PII
 *    scrubbed but ledger rows kept, pending competition + non-CASCADE
 *    children gone, login impossible afterwards.
 * 6. reports contract — legacy {type,subject,description} is rejected;
 *    current {target_type,target_id,reason} creates once and dedups.
 * 7. donations/my — 401 anonymous, own rows for the donor, no finance
 *    backend touched.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { NotificationModel } from '../../src/models/NotificationModel';
import { CryptoUtils } from '../../src/lib/services/CryptoUtils';

const SESS_A = 'sess-r2f-a';
const SESS_B = 'sess-r2f-b';

function env(db: SqliteD1) {
    return { DB: db } as unknown as Parameters<typeof app.request>[2];
}

function auth(token?: string) {
    const h: Record<string, string> = { 'X-CSRF-Token': 'r2f-test' };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    return h;
}

async function seedUsers(db: SqliteD1) {
    await db.prepare(
        `INSERT INTO users (id, email, username, display_name, password_hash, is_active)
         VALUES (101, 'a@local', 'r2fa', 'R2F A', 'x', 1),
                (102, 'b@local', 'r2fb', 'R2F B', 'x', 1)`
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at)
         VALUES ('${SESS_A}', 101, datetime('now', '+1 day')),
                ('${SESS_B}', 102, datetime('now', '+1 day'))`
    ).run();
}

describe('R2-F journeys', () => {
    let db: SqliteD1;
    beforeEach(() => {
        db = new SqliteD1();
    });

    it('1. cross-user notification read ⇒ 404 and stays unread; own read ⇒ 200', async () => {
        await seedUsers(db);
        const notes = new NotificationModel(db as unknown as D1Database);
        const bNote = await notes.createForType({
            user_id: 102,
            type: 'follow',
            payload: { actor: 'R2F A' },
            reference_type: 'user',
            reference_id: 101,
        });

        const cross = await app.request(`/api/notifications/${bNote.id}/read?lang=en`, {
            method: 'POST', headers: auth(SESS_A),
        }, env(db));
        expect(cross.status).toBe(404);

        const stillUnread = await db.prepare(
            'SELECT is_read FROM notifications WHERE id = ?'
        ).bind(bNote.id).first<{ is_read: number }>();
        expect(stillUnread?.is_read).toBe(0);

        const own = await app.request(`/api/notifications/${bNote.id}/read?lang=en`, {
            method: 'POST', headers: auth(SESS_B),
        }, env(db));
        expect(own.status).toBe(200);
        const read = await db.prepare(
            'SELECT is_read FROM notifications WHERE id = ?'
        ).bind(bNote.id).first<{ is_read: number }>();
        expect(read?.is_read).toBe(1);
    });

    it('2. complaint tracker is owner-scoped; /my never leaks other users', async () => {
        await seedUsers(db);
        const mk = (reporter: number, token: string) =>
            app.request('/api/complaints?lang=en', {
                method: 'POST',
                headers: { ...auth(token), 'Content-Type': 'application/json' },
                body: JSON.stringify({ target_type: 'user', target_id: reporter === 101 ? 102 : 101, reason: 'spam' }),
            }, env(db));
        const rb = await mk(102, SESS_B);
        expect(rb.status).toBe(201);
        const reportId = ((await rb.json()) as any)?.data?.report?.id;
        expect(reportId).toBeGreaterThan(0);

        const cross = await app.request(`/api/complaints/${reportId}?lang=en`, {
            headers: auth(SESS_A),
        }, env(db));
        expect(cross.status).toBe(404);

        const own = await app.request(`/api/complaints/${reportId}?lang=en`, {
            headers: auth(SESS_B),
        }, env(db));
        expect(own.status).toBe(200);

        const myA = (await (await app.request('/api/complaints/my?lang=en', {
            headers: auth(SESS_A),
        }, env(db))).json()) as any;
        expect(myA.success).toBe(true);
        expect(myA.data.complaints).toHaveLength(0);
        const myB = (await (await app.request('/api/complaints/my?lang=en', {
            headers: auth(SESS_B),
        }, env(db))).json()) as any;
        expect(myB.data.complaints).toHaveLength(1);
    });

    it('3. repeated follow POST ⇒ one follow row + exactly one notification', async () => {
        await seedUsers(db);
        for (let i = 0; i < 2; i++) {
            const res = await app.request('/api/users/102/follow?lang=en', {
                method: 'POST', headers: auth(SESS_A),
            }, env(db));
            expect(res.status).toBe(200);
        }
        const follows = await db.prepare(
            'SELECT COUNT(*) AS n FROM follows WHERE follower_id = 101 AND following_id = 102'
        ).first<{ n: number }>();
        // SqliteStatement.bind() with no params: call prepare without bind.
        expect(follows?.n ?? 1).toBe(1);
        const notes = await db.prepare(
            "SELECT COUNT(*) AS n FROM notifications WHERE user_id = 102 AND type = 'follow'"
        ).first<{ n: number }>();
        expect(notes?.n ?? 1).toBe(1);

        const profile = (await (await app.request('/api/users/r2fb?lang=en', {
            headers: auth(SESS_A),
        }, env(db))).json()) as any;
        expect(profile.success).toBe(true);
        expect(profile.data.is_following).toBe(true);
    });

    it('4. delete-account/verify honours PBKDF2 (legacy SHA-256 still accepted)', async () => {
        const hash = await CryptoUtils.hashPassword('correct-horse');
        await db.prepare(
            `INSERT INTO users (id, email, username, display_name, password_hash, is_active)
             VALUES (111, 'del@local', 'deluser', 'Del User', ?, 1)`
        ).bind(hash).run();
        await db.prepare(
            `INSERT INTO sessions (id, user_id, expires_at)
             VALUES ('sess-del-verify', 111, datetime('now', '+1 day'))`
        ).run();

        const ok = await app.request('/api/users/delete-account/verify?lang=en', {
            method: 'POST',
            headers: { ...auth('sess-del-verify'), 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: 'correct-horse' }),
        }, env(db));
        expect(ok.status).toBe(200);

        const bad = await app.request('/api/users/delete-account/verify?lang=en', {
            method: 'POST',
            headers: { ...auth('sess-del-verify'), 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: 'wrong-horse' }),
        }, env(db));
        expect(bad.status).toBe(401);

        const legacy = await CryptoUtils.sha256Hex('legacy-pass');
        await db.prepare(
            `INSERT INTO users (id, email, username, display_name, password_hash, is_active)
             VALUES (112, 'leg@local', 'leguser', 'Leg User', ?, 1)`
        ).bind(legacy).run();
        await db.prepare(
            `INSERT INTO sessions (id, user_id, expires_at)
             VALUES ('sess-del-legacy', 112, datetime('now', '+1 day'))`
        ).run();
        const legacyOk = await app.request('/api/users/delete-account/verify?lang=en', {
            method: 'POST',
            headers: { ...auth('sess-del-legacy'), 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: 'legacy-pass' }),
        }, env(db));
        expect(legacyOk.status).toBe(200);
    });

    it('5. delete-account is atomic, scrubs PII leftovers, keeps ledger rows, blocks re-login', async () => {
        const hash = await CryptoUtils.hashPassword('bye-bye');
        await db.prepare(
            `INSERT INTO users (id, email, username, display_name, password_hash, is_active)
             VALUES (121, 'gone@local', 'goneuser', 'Gone User', ?, 1),
                    (122, 'stay@local', 'stayuser', 'Stay User', 'x', 1)`
        ).bind(hash).run();
        await db.prepare(
            `INSERT INTO sessions (id, user_id, expires_at)
             VALUES ('sess-gone', 121, datetime('now', '+1 day'))`
        ).run();
        await db.prepare(
            `INSERT INTO categories (id, slug, name_ar, name_en) VALUES (901, 'r2f-cat', 'فئة', 'Cat')`
        ).run();
        await db.prepare(
            `INSERT INTO competitions (id, title, rules, category_id, creator_id, status)
             VALUES (701, 'Pending Cup', 'rules', 901, 121, 'pending'),
                    (702, 'Done Cup', 'rules', 901, 121, 'completed')`
        ).run();
        await db.prepare(
            `INSERT INTO competition_requests (competition_id, requester_id, status)
             VALUES (701, 122, 'pending')`
        ).run();
        await db.prepare(
            `INSERT INTO comments (competition_id, user_id, content) VALUES (701, 122, 'good luck')`
        ).run();
        await db.prepare(
            `INSERT INTO notifications (user_id, type, title, message, is_read, created_at)
             VALUES (121, 'system', 'notification.system_notice', 'hi', 0, datetime('now'))`
        ).run();
        await db.prepare(
            `INSERT INTO follows (follower_id, following_id, created_at)
             VALUES (121, 122, datetime('now'))`
        ).run();
        await db.prepare(
            `INSERT INTO payment_methods (user_id, type, bank_name, iban, account_holder)
             VALUES (121, 'bank', 'R2F Bank', 'SA0001', 'Gone User')`
        ).run();
        await db.prepare(
            `INSERT INTO watch_history (user_id, competition_id, watch_duration_seconds)
             VALUES (121, 702, 42)`
        ).run();
        await db.prepare(
            `INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (121, 122)`
        ).run();
        await db.prepare(
            `INSERT INTO donations (user_id, amount, payment_method, payment_status, donor_name, donor_email, message)
             VALUES (121, 25, 'stripe', 'completed', 'Gone User', 'gone@local', 'take it')`
        ).run();

        const del = await app.request('/api/users/delete-account?lang=en', {
            method: 'POST',
            headers: { ...auth('sess-gone'), 'Content-Type': 'application/json' },
            body: JSON.stringify({ confirm: true }),
        }, env(db));
        expect(del.status).toBe(200);

        const user = await db.prepare(
            'SELECT username, email, is_active, display_name FROM users WHERE id = 121'
        ).first<any>();
        expect(user?.is_active).toBe(0);
        expect(user?.username).toBe('deleted_121');
        expect(user?.display_name).toBe('Deleted User');

        const count = async (sql: string) =>
            (await db.prepare(sql).first<{ n: number }>())?.n ?? -1;
        expect(await count('SELECT COUNT(*) AS n FROM sessions WHERE user_id = 121')).toBe(0);
        expect(await count('SELECT COUNT(*) AS n FROM payment_methods WHERE user_id = 121')).toBe(0);
        expect(await count('SELECT COUNT(*) AS n FROM watch_history WHERE user_id = 121')).toBe(0);
        expect(await count('SELECT COUNT(*) AS n FROM user_blocks WHERE blocker_id = 121 OR blocked_id = 121')).toBe(0);
        expect(await count('SELECT COUNT(*) AS n FROM notifications WHERE user_id = 121')).toBe(0);
        expect(await count('SELECT COUNT(*) AS n FROM follows WHERE follower_id = 121 OR following_id = 121')).toBe(0);
        // Pending draft gone WITH its non-CASCADE children; completed kept.
        expect(await count('SELECT COUNT(*) AS n FROM competitions WHERE id = 701')).toBe(0);
        expect(await count('SELECT COUNT(*) AS n FROM competition_requests WHERE competition_id = 701')).toBe(0);
        expect(await count('SELECT COUNT(*) AS n FROM comments WHERE competition_id = 701')).toBe(0);
        expect(await count("SELECT COUNT(*) AS n FROM competitions WHERE id = 702 AND title = '[deleted]'")).toBe(1);
        // Ledger row persists but PII is scrubbed.
        const donation = await db.prepare(
            'SELECT donor_name, donor_email, message, amount FROM donations WHERE user_id = 121'
        ).first<any>();
        expect(donation?.amount).toBe(25);
        expect(donation?.donor_name).toBeNull();
        expect(donation?.donor_email).toBeNull();

        // Old session is dead; login with the old password fails.
        const login = await app.request('/api/auth/login?lang=en', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'r2f-test' },
            body: JSON.stringify({ email: 'gone@local', password: 'bye-bye' }),
        }, env(db));
        expect(login.status).not.toBe(200);
    });

    it('6. reports: legacy contract rejected, current contract creates + dedups + blocks self-report', async () => {
        await seedUsers(db);
        const legacy = await app.request('/api/reports?lang=en', {
            method: 'POST',
            headers: { ...auth(SESS_A), 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'spam', subject: 'x', description: 'y' }),
        }, env(db));
        expect([400, 422].includes(legacy.status)).toBe(true);

        const self = await app.request('/api/reports?lang=en', {
            method: 'POST',
            headers: { ...auth(SESS_A), 'Content-Type': 'application/json' },
            body: JSON.stringify({ target_type: 'user', target_id: 101, reason: 'spam' }),
        }, env(db));
        expect([400, 422].includes(self.status)).toBe(true);

        const first = await app.request('/api/reports?lang=en', {
            method: 'POST',
            headers: { ...auth(SESS_A), 'Content-Type': 'application/json' },
            body: JSON.stringify({ target_type: 'user', target_id: 102, reason: 'spam', description: 'bad' }),
        }, env(db));
        expect(first.status).toBe(200);
        expect(((await first.json()) as any)?.data?.report_id).toBeGreaterThan(0);

        const dup = await app.request('/api/reports?lang=en', {
            method: 'POST',
            headers: { ...auth(SESS_A), 'Content-Type': 'application/json' },
            body: JSON.stringify({ target_type: 'user', target_id: 102, reason: 'spam' }),
        }, env(db));
        expect(dup.status).toBe(400);

        const anon = await app.request('/api/reports?lang=en', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'r2f-test' },
            body: JSON.stringify({ target_type: 'user', target_id: 102, reason: 'spam' }),
        }, env(db));
        expect(anon.status).toBe(401);
    });

    it('7. donations/my needs a session and returns only the donor rows', async () => {
        await seedUsers(db);
        const anon = await app.request('/api/donations/my?lang=en', {
            headers: auth(),
        }, env(db));
        expect(anon.status).toBe(401);

        await db.prepare(
            `INSERT INTO donations (user_id, amount, payment_method, payment_status)
             VALUES (101, 5, 'stripe', 'completed'), (102, 50, 'stripe', 'completed')`
        ).run();
        const mine = (await (await app.request('/api/donations/my?lang=en', {
            headers: auth(SESS_A),
        }, env(db))).json()) as any;
        expect(mine.success).toBe(true);
        expect(mine.data).toHaveLength(1);
        expect(mine.data[0].amount).toBe(5);
    });
});
