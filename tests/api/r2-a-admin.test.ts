/**
 * R2-A — admin identity/access, account settings, role management,
 * H9 documents/data (TDD on BASE-fed9b93).
 *
 * Contract under test (R2-A only; J/L1/V/L2 closed and untouched):
 * - Bootstrap-shape admin (is_admin=1 + SuperAdmin, verified) logs in;
 *   wrong password is 401. Admin API: admin 200, plain user 403, anon 403.
 *   GET /admin: admin-cookie 200, user-cookie 403 (server gate).
 * - Account settings: username/email/password change work with validation
 *   (taken 409, invalid 422, wrong-current 401, short 422, anon 401);
 *   password destroys all sessions (reauth_required); email resets
 *   verification but keeps sessions; responses never carry password_hash;
 *   every change writes an audit row.
 * - Roles: SuperAdmin grant/revoke work with audit + is_admin sync;
 *   non-SuperAdmin grant is 403 (no escalation); invalid role 422;
 *   unknown target 404; last-SuperAdmin self-revoke 409.
 * - H9 documents: admin CRUD with draft default + version++ on update;
 *   publish makes published+public readable anonymously (ar/en);
 *   draft/private stay 404 for anon; non-admin writes 403; audit rows
 *   for create/publish; seed rows ride flagged (is_seed=1).
 * - Refresh: the same session returns the same state (session-based).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import app from '../../src/main';
import { createSqliteD1, SqliteD1 } from '../helpers/sqlite-d1';
import { CryptoUtils } from '../../src/lib/services/CryptoUtils';

type Env = Parameters<typeof app.request>[2];
const env = (db: SqliteD1): Env => ({ DB: db }) as unknown as Env;

let ipSeq = 31000;
function headers(token?: string): Record<string, string> {
    ipSeq += 1;
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'r2a-test',
        'CF-Connecting-IP': `10.33.33.${(ipSeq % 250) + 1}`,
    };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    return h;
}

async function seedR2A(db: SqliteD1) {
    const adminHash = await CryptoUtils.hashPassword('admin');
    const userHash = await CryptoUtils.hashPassword('userpass1');
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_verified, is_admin, is_fake) VALUES
         (2, 'admin@dueli.local', 'admin', '${adminHash}', 'Administrator', 1, 1, 0),
         (3, 'mod@r2a.local', 'mod_user', '${userHash}', 'Mod User', 1, 1, 0),
         (4, 'plain@r2a.local', 'plain_user', '${userHash}', 'Plain User', 1, 0, 0),
         (5, 'target@r2a.local', 'target_user', '${userHash}', 'Target User', 1, 0, 0)`,
    ).run();
    // Admin is the sole SuperAdmin; mod_user holds a non-super role.
    await db.prepare(
        `INSERT INTO admin_roles (user_id, role, granted_by) VALUES (2, 'SuperAdmin', 2), (3, 'Moderator', 2)`,
    ).run();
}

async function login(db: SqliteD1, email: string, password: string) {
    const res = await app.request('/api/auth/login?lang=en', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ email, password }),
    }, env(db));
    return { status: res.status, data: await res.json() as any };
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

describe('R2-A admin identity, settings, roles, H9 documents', () => {
    let db: SqliteD1;
    let adminTok = '';
    let plainTok = '';
    beforeEach(async () => {
        db = await createSqliteD1();
        await seedR2A(db);
        adminTok = (await login(db, 'admin@dueli.local', 'admin')).data.data.sessionId as string;
        plainTok = (await login(db, 'plain@r2a.local', 'userpass1')).data.data.sessionId as string;
    });

    it('1. bootstrap-shape admin logs in; wrong password is 401', async () => {
        expect(adminTok).toBeTruthy();
        const me = await api(db, 'GET', '/api/auth/session', adminTok);
        expect(me.data.data.user.is_admin).toBe(1);
        const bad = await login(db, 'admin@dueli.local', 'wrongpass');
        expect(bad.status).toBe(401);
    });

    it('2. admin API: admin 200, plain user 403, anon 403; /admin page gated', async () => {
        // NOTE: /api/admin/stats is used as the gate probe instead of
        // /api/admin/stats: getStats hits a PRE-EXISTING broken revenue
        // query (no such column: amount — untouched, out of scope, fails on
        // BASE too). The isAdmin gate itself is identical on every route.
        expect((await api(db, 'GET', '/api/admin/roles', adminTok)).status).toBe(200);
        expect((await api(db, 'GET', '/api/admin/roles', plainTok)).status).toBe(403);
        expect((await api(db, 'GET', '/api/admin/roles')).status).toBe(403);
        // The dashboard shell loads from /enhanced-stats (independent code
        // path — it never touches the broken totalRevenue()/amount query
        // behind /stats), so the new R2-A UI stays usable.
        expect((await api(db, 'GET', '/api/admin/enhanced-stats', adminTok)).status).toBe(200);

        const adminPage = await app.request('/admin?lang=en', {
            headers: { ...headers(), Cookie: `sessionId=${adminTok}` },
        }, env(db));
        expect(adminPage.status).toBe(200);
        const userPage = await app.request('/admin?lang=en', {
            headers: { ...headers(), Cookie: `sessionId=${plainTok}` },
        }, env(db));
        expect(userPage.status).toBe(403);
    });

    it('3. username change works; taken 409, invalid 422, anon 401, no hash leak', async () => {
        const ok = await api(db, 'PUT', '/api/account/username', adminTok, { username: 'boss_admin' });
        expect(ok.status).toBe(200);
        expect(ok.data.data.user.username).toBe('boss_admin');
        expect(JSON.stringify(ok.data)).not.toContain('password_hash');
        expect(JSON.stringify(ok.data)).not.toContain('pbkdf2$');

        expect((await api(db, 'PUT', '/api/account/username', plainTok, { username: 'boss_admin' })).status).toBe(409);
        expect((await api(db, 'PUT', '/api/account/username', plainTok, { username: 'BAD NAME!' })).status).toBe(422);
        expect((await api(db, 'PUT', '/api/account/username', undefined, { username: 'x_new_name' })).status).toBe(401);
        expect(await auditActions(db, 2)).toContain('account_username_changed');
    });

    it('4. password change kills all sessions (reauth); wrong current 401, short 422', async () => {
        const ok = await api(db, 'PUT', '/api/account/password', adminTok,
            { current_password: 'admin', new_password: 'newadmin99' });
        expect(ok.status).toBe(200);
        expect(ok.data.data.reauth_required).toBe(true);

        // Old session is dead everywhere now.
        expect((await api(db, 'GET', '/api/admin/roles', adminTok)).status).toBe(403);
        const relogin = await login(db, 'admin@dueli.local', 'newadmin99');
        expect(relogin.status).toBe(200);
        const stale = await login(db, 'admin@dueli.local', 'admin');
        expect(stale.status).toBe(401);

        const fresh = relogin.data.data.sessionId as string;
        expect((await api(db, 'PUT', '/api/account/password', fresh,
            { current_password: 'nope', new_password: 'newadmin00' })).status).toBe(401);
        expect((await api(db, 'PUT', '/api/account/password', fresh,
            { current_password: 'newadmin99', new_password: 'short' })).status).toBe(422);
        expect(await auditActions(db, 2)).toContain('account_password_changed');
    });

    it('5. email change resets verification but keeps sessions; taken 409, invalid 422', async () => {
        const ok = await api(db, 'PUT', '/api/account/email', plainTok, { email: '  New@R2A.local ' });
        expect(ok.status).toBe(200);
        expect(ok.data.data.user.email).toBe('new@r2a.local');
        expect(ok.data.data.reverify_required).toBe(true);
        const row = await db.prepare(`SELECT is_verified FROM users WHERE id = 4`).first<{ is_verified: number }>();
        expect(row?.is_verified).toBe(0);
        // Sessions survive an email change.
        expect((await api(db, 'GET', '/api/auth/session', plainTok)).data.data.user.email).toBe('new@r2a.local');

        expect((await api(db, 'PUT', '/api/account/email', plainTok, { email: 'admin@dueli.local' })).status).toBe(409);
        expect((await api(db, 'PUT', '/api/account/email', plainTok, { email: 'not-an-email' })).status).toBe(422);
        expect(await auditActions(db, 4)).toContain('account_email_changed');
    });

    it('6. roles: grant/revoke with sync+audit; no escalation; guards hold', async () => {
        // SuperAdmin grants Moderator to the target: flag syncs on.
        const grant = await api(db, 'POST', '/api/admin/roles', adminTok, { user_id: 5, role: 'Moderator' });
        expect(grant.status).toBe(200);
        const flag = await db.prepare(`SELECT is_admin FROM users WHERE id = 5`).first<{ is_admin: number }>();
        expect(flag?.is_admin).toBe(1);

        // A Moderator (non-SuperAdmin) cannot grant: 403, no escalation.
        const modTok = (await login(db, 'mod@r2a.local', 'userpass1')).data.data.sessionId as string;
        expect((await api(db, 'POST', '/api/admin/roles', modTok, { user_id: 4, role: 'Moderator' })).status).toBe(403);

        // Invalid role 422, unknown target 404.
        expect((await api(db, 'POST', '/api/admin/roles', adminTok, { user_id: 4, role: 'GodMode' })).status).toBe(422);
        expect((await api(db, 'POST', '/api/admin/roles', adminTok, { user_id: 9999, role: 'Moderator' })).status).toBe(404);

        // Last-SuperAdmin self-revoke is refused.
        expect((await api(db, 'DELETE', '/api/admin/roles/2', adminTok)).status).toBe(409);

        // Revoke the target: flag clears, audit rows exist for both acts.
        expect((await api(db, 'DELETE', '/api/admin/roles/5', adminTok)).status).toBe(200);
        const cleared = await db.prepare(`SELECT is_admin FROM users WHERE id = 5`).first<{ is_admin: number }>();
        expect(cleared?.is_admin).toBe(0);
        const acts = await auditActions(db, 2);
        expect(acts).toContain('grant_role');
        expect(acts).toContain('revoke_role');
    });

    it('7. H9 documents: draft CRUD, version++, publish, private stays hidden', async () => {
        const created = await api(db, 'POST', '/api/admin/documents', adminTok, {
            slug: 'Test-Doc', title_ar: 'وثيقة', title_en: 'Doc', body_ar: 'ب', body_en: 'b',
        });
        expect(created.status).toBe(201);
        expect(created.data.data.document.status).toBe('draft');
        expect(created.data.data.document.version).toBe(1);

        const id = created.data.data.document.id as number;
        const updated = await api(db, 'PUT', `/api/admin/documents/${id}`, adminTok, { body_en: 'b2' });
        expect(updated.status).toBe(200);
        expect(updated.data.data.document.version).toBe(2);

        // Draft is invisible anonymously.
        expect((await api(db, 'GET', '/api/documents/test-doc')).status).toBe(404);

        // Publish + public => anonymous read with both languages.
        const pub = await api(db, 'PUT', `/api/admin/documents/${id}`, adminTok,
            { status: 'published', visibility: 'public' });
        expect(pub.status).toBe(200);
        const seen = await api(db, 'GET', '/api/documents/test-doc');
        expect(seen.status).toBe(200);
        expect(seen.data.data.document.title_ar).toBe('وثيقة');
        expect(seen.data.data.document.title_en).toBe('Doc');

        // Non-admin writes are forbidden; bad slug/slug-clash guarded.
        expect((await api(db, 'POST', '/api/admin/documents', plainTok,
            { slug: 'x', title_ar: 'أ', title_en: 'e' })).status).toBe(403);
        expect((await api(db, 'POST', '/api/admin/documents', adminTok,
            { slug: 'bad slug!', title_ar: 'أ', title_en: 'e' })).status).toBe(422);
        expect((await api(db, 'POST', '/api/admin/documents', adminTok,
            { slug: 'test-doc', title_ar: 'أ', title_en: 'e' })).status).toBe(409);

        const acts = await auditActions(db, 2);
        expect(acts).toContain('document_created');
        expect(acts).toContain('document_published');

        // Delete removes public visibility too.
        expect((await api(db, 'DELETE', `/api/admin/documents/${id}`, adminTok)).status).toBe(200);
        expect((await api(db, 'GET', '/api/documents/test-doc')).status).toBe(404);
    });

    it('8. seed-flagged documents ride along visibly tagged', async () => {
        await db.prepare(
            `INSERT INTO managed_documents (slug, title_ar, title_en, body_ar, body_en, status, visibility, is_seed)
             VALUES ('seed-welcome', '[SEED] مرحباً', '[SEED] Welcome', 'ب', 'b', 'published', 'public', 1)`,
        ).run();
        const list = await api(db, 'GET', '/api/admin/documents', adminTok);
        const seed = (list.data.data.documents as any[]).find((d) => d.slug === 'seed-welcome');
        expect(seed?.is_seed).toBe(1);
        // Seed content is ordinary content: published+public reads anonymously.
        expect((await api(db, 'GET', '/api/documents/seed-welcome')).status).toBe(200);
    });

    it('9. refresh keeps the correct state on the same session', async () => {
        const first = await api(db, 'GET', '/api/auth/session', adminTok);
        const second = await api(db, 'GET', '/api/auth/session', adminTok);
        expect(second.data.data.user).toEqual(first.data.data.user);
        expect(second.data.data.user.is_admin).toBe(1);
        expect((await api(db, 'GET', '/api/admin/roles', adminTok)).status).toBe(200);
    });
});
