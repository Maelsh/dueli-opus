/**
 * R4 quality — centralized <title> escaping in generateHTML.
 *
 * Deferred non-blocking note from R3-C2 close (04-EXECUTION-TRACKER):
 * review <title> escaping via generateHTML/callers without double-escaping.
 *
 * Forensic on main 2e3d368: generateHTML interpolated `title` and
 * `tr.app_title` raw into <title>. Titles reach it user-controlled
 * (live-room competition.title, profile display_name/username, docs
 * admin-authored titles) so `</title><script>` would break out.
 * Bodies were already escaped at render; <title> was the gap.
 *
 * Contract pinned here: callers pass RAW titles; generateHTML escapes
 * centrally with Sanitize.escapeHtml (no caller pre-escaping, so no
 * double-escaping). /docs pagination stays out of scope: model already
 * supports limit/offset and the catalog (~6 seeds) needs no pagination.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import app from '../../src/main';
import { generateHTML } from '../../src/shared/templates/layout';
import { createSqliteD1, SqliteD1 } from '../helpers/sqlite-d1';
import { CryptoUtils } from '../../src/lib/services/CryptoUtils';

type Env = Parameters<typeof app.request>[2];
const env = (db: SqliteD1): Env => ({ DB: db }) as unknown as Env;

let ipSeq = 51000;
function headers(token?: string): Record<string, string> {
    ipSeq += 1;
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'r4title-test',
        'CF-Connecting-IP': `10.51.51.${(ipSeq % 250) + 1}`,
    };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    return h;
}

function titleTag(html: string): string {
    const m = /<title>([\s\S]*?)<\/title>/.exec(html);
    expect(m, 'exactly one <title> block').not.toBeNull();
    return m![1];
}

describe('R4: generateHTML escapes <title> centrally', () => {
    it('1. title breakout is neutralized, exactly one </title> remains', () => {
        const evil = `Evil</title><script>alert(1)</script>`;
        const html = generateHTML('<p>x</p>', 'en', evil);
        expect(html).not.toContain('</title><script>');
        expect(html).toContain('&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(html.match(/<\/title>/g)!.length).toBe(1);
    });

    it('2. quotes/ampersands escape, plain i18n titles render unchanged', () => {
        const html = generateHTML('<p>x</p>', 'en', `A&B "Q" 'S' <T>`);
        expect(titleTag(html)).toContain('A&amp;B &quot;Q&quot; &#39;S&#39; &lt;T&gt;');
        const plain = generateHTML('<p>x</p>', 'ar', 'Help');
        expect(plain).toContain('<title>Help - ');
        expect(plain).not.toContain('&amp;amp;');
    });

    it('3. competition-style user title cannot break out of <title>', () => {
        const userTitle = `My Final</title><img src=x onerror=alert(2)>`;
        const html = generateHTML('<p>room</p>', 'en', userTitle);
        expect(html).not.toContain('</title><img');
        expect(html).toContain('&lt;/title&gt;&lt;img');
        expect(html.match(/<\/title>/g)!.length).toBe(1);
    });
});

describe('R4: stored doc title is escaped in reader <title> + <h1>', () => {
    let db: SqliteD1;

    beforeEach(async () => {
        db = await createSqliteD1();
        const adminHash = await CryptoUtils.hashPassword('admin');
        await db.prepare(
            `INSERT INTO users (id, email, username, password_hash, display_name, is_verified, is_admin, is_fake) VALUES
             (2, 'admin@r4title.local', 'admin', '${adminHash}', 'Administrator', 1, 1, 0)`,
        ).run();
        await db.prepare(`INSERT INTO admin_roles (user_id, role, granted_by) VALUES (2, 'SuperAdmin', 2)`).run();
        const login = await app.request('/api/auth/login?lang=en', {
            method: 'POST', headers: headers(), body: JSON.stringify({ email: 'admin@r4title.local', password: 'admin' }),
        }, env(db));
        expect(login.status).toBe(200);
        const adminTok = ((await login.json()) as any).data.sessionId as string;
        const evilTitle = `Doc</title><script>alert(3)</script>`;
        const create = await app.request('/api/admin/documents?lang=en', {
            method: 'POST',
            headers: headers(adminTok),
            body: JSON.stringify({
                slug: 'evil-title-doc',
                title_ar: 'وثيقة',
                title_en: evilTitle,
                body_ar: 'نص',
                body_en: 'Body',
                status: 'published',
                visibility: 'public',
            }),
        }, env(db));
        expect(create.status).toBe(201);
    });

    it('4. reader escapes the stored title in both <title> and body', async () => {
        const res = await app.request('/docs/evil-title-doc?lang=en', { headers: headers() }, env(db));
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).not.toContain('</title><script>alert(3)</script>');
        expect(html).toContain('&lt;/title&gt;&lt;script&gt;alert(3)&lt;/script&gt;');
        expect(html.match(/<\/title>/g)!.length).toBe(1);
        expect(html).toContain('<h1 class="text-4xl font-black');
    });
});
