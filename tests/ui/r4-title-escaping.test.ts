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
 * Contract pinned here: generateHTML escapes centrally with
 * Sanitize.escapeHtml (exactly once per render). Callers pass RAW titles —
 * with ONE documented exception: competition titles are store-escaped at
 * write (Sanitize.cleanTitle in CompetitionController.create, the T1.4
 * stored-XSS architecture — every other sink renders them raw). The
 * live-room boundary decodes once (Sanitize.unescapeHtml) so the central
 * escape stays single. Decoding anywhere else, or twice, reopens XSS or
 * double-escaping respectively. /docs pagination stays out of scope.
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

describe('R4-REM1 (Codex P2): create → cleanTitle → DB → live-room → <title>', () => {
    let db: SqliteD1;
    let token: string;

    function liveCtx(compId: number) {
        return {
            get: (k: string) => (k === 'lang' ? 'en' : k === 'cspNonce' ? 'test-nonce' : null),
            html: (s: string) => s,
            req: { url: `http://localhost/live/${compId}?lang=en`, param: () => String(compId) },
        } as never;
    }

    async function renderLiveTitle(storedTitle: string, compId: number): Promise<{ title: string; html: string }> {
        const realFetch = globalThis.fetch;
        globalThis.fetch = (async () =>
            new Response(JSON.stringify({ success: true, data: { id: compId, title: storedTitle, status: 'live' } }), {
                headers: { 'Content-Type': 'application/json' },
            })) as unknown as typeof fetch;
        try {
            const { liveRoomPage } = await import('../../src/modules/pages/live-room-page');
            const html = (await (liveRoomPage as (c: never) => Promise<string>)(liveCtx(compId))) as string;
            return { title: titleTag(html), html };
        } finally {
            globalThis.fetch = realFetch;
        }
    }

    beforeEach(async () => {
        db = await createSqliteD1();
        const pwHash = await CryptoUtils.hashPassword('creatorpw');
        await db.prepare(
            `INSERT INTO users (id, email, username, password_hash, display_name, is_verified, is_active, is_fake) VALUES
             (11, 'creator@r4p2.local', 'creatorp2', '${pwHash}', 'Creator', 1, 1, 0)`,
        ).run();
        await db.prepare(
            `INSERT INTO categories (id, slug, name_ar, name_en, parent_id) VALUES (10, 'dialogue', 'حوار', 'Dialogue', NULL)`,
        ).run();
        const login = await app.request('/api/auth/login?lang=en', {
            method: 'POST', headers: headers(), body: JSON.stringify({ email: 'creator@r4p2.local', password: 'creatorpw' }),
        }, env(db));
        expect(login.status).toBe(200);
        token = ((await login.json()) as any).data.sessionId as string;
    });

    /** Full write path: raw title in, store-escaped title out (T1.4 premise). */
    async function createCompetition(rawTitle: string): Promise<{ id: number; stored: string }> {
        const res = await app.request('/api/competitions?lang=en', {
            method: 'POST', headers: headers(token),
            body: JSON.stringify({ title: rawTitle, rules: 'Be kind.', category_id: 10 }),
        }, env(db));
        expect(res.status).toBe(201);
        const id = Number(((await res.json()) as any).data.id);
        const row = await db.prepare('SELECT title FROM competitions WHERE id = ?').bind(id).first<{ title: string }>();
        return { id, stored: row!.title };
    }

    it('A. A&B survives create→DB→live-room with exactly one escape', async () => {
        const { id, stored } = await createCompetition('A&B');
        expect(stored).toBe('A&amp;B');
        const { title, html } = await renderLiveTitle(stored, id);
        expect(title).toContain('A&amp;B');
        expect(title).not.toContain('&amp;amp;');
        expect(html).not.toContain('&amp;amp;');
        expect(html.match(/<\/title>/g)!.length).toBe(1);
    });

    it('B. <tag> renders literally (no element, no double-escape)', async () => {
        const { id, stored } = await createCompetition('<tag>');
        expect(stored).toBe('&lt;tag&gt;');
        const { title, html } = await renderLiveTitle(stored, id);
        expect(title).toContain('&lt;tag&gt;');
        expect(title).not.toContain('<tag>');
        expect(title).not.toContain('&amp;lt;');
        expect(html.match(/<\/title>/g)!.length).toBe(1);
    });

    it('C. </title><script> through the real path cannot break out (XSS closed)', async () => {
        const evil = `Evil</title><script>alert(1)</script>`;
        const { id, stored } = await createCompetition(evil);
        expect(stored).toContain('&lt;/title&gt;&lt;script&gt;');
        expect(stored).not.toContain('</title><script>');
        const { html } = await renderLiveTitle(stored, id);
        expect(html).not.toContain('</title><script>');
        expect(html).toContain('&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(html.match(/<\/title>/g)!.length).toBe(1);
    });

    it('D. unescapeHtml is the exact inverse of escapeHtml (boundary decode is lossless)', async () => {
        const { Sanitize } = await import('../../src/lib/services/Sanitize');
        for (const raw of ['A&B', '<tag>', '"Q" \'S\'', '&amp;', '&lt;already&gt;', 'plain', '']) {
            expect(Sanitize.unescapeHtml(Sanitize.escapeHtml(raw))).toBe(raw);
        }
        expect(Sanitize.unescapeHtml('Live Room')).toBe('Live Room');
    });
});
