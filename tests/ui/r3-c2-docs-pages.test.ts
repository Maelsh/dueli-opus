/**
 * R3-C2 — public /docs pages render published+public managed documents.
 *
 * Rendered-output contract (real HTTP, not source strings):
 * - /docs lists published+public titles with links; drafts/private absent;
 *   exactly one skip target; no duplicate ids; footer entry present.
 * - /docs/:slug renders title + escaped body ar/en with RTL/LTR + dark;
 *   draft/private/missing slugs are 404 (same no-oracle rule as the API).
 * - Admin-authored markup (e.g. <script>) is escaped, never executed.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import app from '../../src/main';
import { createSqliteD1, SqliteD1 } from '../helpers/sqlite-d1';
import { CryptoUtils } from '../../src/lib/services/CryptoUtils';

type Env = Parameters<typeof app.request>[2];
const env = (db: SqliteD1): Env => ({ DB: db }) as unknown as Env;

let ipSeq = 43000;
function headers(token?: string): Record<string, string> {
    ipSeq += 1;
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'r3c2ui-test',
        'CF-Connecting-IP': `10.45.45.${(ipSeq % 250) + 1}`,
    };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    return h;
}

describe('R3-C2 public docs pages', () => {
    let db: SqliteD1;
    let adminTok = '';

    beforeEach(async () => {
        db = await createSqliteD1();
        const adminHash = await CryptoUtils.hashPassword('admin');
        await db.prepare(
            `INSERT INTO users (id, email, username, password_hash, display_name, is_verified, is_admin, is_fake) VALUES
             (2, 'admin@c2ui.local', 'admin', '${adminHash}', 'Administrator', 1, 1, 0)`,
        ).run();
        await db.prepare(`INSERT INTO admin_roles (user_id, role, granted_by) VALUES (2, 'SuperAdmin', 2)`).run();
        const login = await app.request('/api/auth/login?lang=en', {
            method: 'POST', headers: headers(), body: JSON.stringify({ email: 'admin@c2ui.local', password: 'admin' }),
        }, env(db));
        adminTok = ((await login.json()) as any).data.sessionId as string;
        const create = async (body: Record<string, unknown>) => {
            const res = await app.request('/api/admin/documents?lang=en', {
                method: 'POST', headers: headers(adminTok), body: JSON.stringify(body),
            }, env(db));
            expect(res.status).toBe(201);
        };
        await create({
            slug: 'project-message', title_ar: 'رسالة المشروع', title_en: 'Project message',
            body_ar: 'نص المشروع', body_en: 'Project body', status: 'published', visibility: 'public',
        });
        await create({
            slug: 'engineering-notes', title_ar: 'ملاحظات هندسية', title_en: 'Engineering notes',
            body_ar: 'هندسة', body_en: 'Engineering <script>alert(1)</script> body',
            status: 'published', visibility: 'public',
        });
        await create({
            slug: 'hidden-draft', title_ar: 'مسودة', title_en: 'Hidden draft',
            body_ar: 'سري', body_en: 'Secret',
        });
    });

    const get = async (path: string) => {
        const res = await app.request(path, { headers: headers() }, env(db));
        return { status: res.status, html: await res.text() };
    };

    it('1. /docs index lists public titles with links, hides drafts, stays valid HTML', async () => {
        const { status, html } = await get('/docs?lang=en');
        expect(status).toBe(200);
        expect(html).toContain('Project message');
        expect(html).toContain('Engineering notes');
        expect(html).toContain('/docs/project-message?lang=en');
        expect(html).not.toContain('Hidden draft');
        expect(html).toContain('href="#main-content"');
        expect(html).toContain('id="main-content"');
        const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
        expect(new Set(ids).size, 'duplicate ids').toBe(ids.length);
        expect(html).toContain('dark:');
        expect(html).toContain('/docs?lang=en');
    });

    it('2. /docs/:slug renders the published doc ar/en with direction, 404s otherwise', async () => {
        const en = await get('/docs/project-message?lang=en');
        expect(en.status).toBe(200);
        expect(en.html).toContain('dir="ltr"');
        expect(en.html).toContain('Project body');
        const ar = await get('/docs/project-message?lang=ar');
        expect(ar.status).toBe(200);
        expect(ar.html).toContain('dir="rtl"');
        expect(ar.html).toContain('رسالة المشروع');
        expect(ar.html).not.toContain('Project body');
        expect((await get('/docs/hidden-draft?lang=en')).status).toBe(404);
        expect((await get('/docs/no-such-doc?lang=en')).status).toBe(404);
    });

    it('3. admin-authored markup is escaped, never executed', async () => {
        const { status, html } = await get('/docs/engineering-notes?lang=en');
        expect(status).toBe(200);
        expect(html).not.toContain('<script>alert(1)</script>');
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    });
});
