/**
 * Post-#69 language script hardening — the proven `const lang = '${lang}'`
 * pattern (raw request value inside a CSP-authorized nonce script) existed
 * on 13 sibling page scripts + home `/`, plus same-class request-derived
 * sinks (competition/profile/live-room ids).
 *
 * Canonical fix (same as #69): JSON.stringify(getUILanguage(lang)) — the
 * executable value can only ever be "ar" or "en".
 *
 * NOTE: live-finance-page.ts still carries `const competitionId =
 * '${competitionId}'` (path id) but has no language sink and is outside this
 * batch's affected set — it is pinned below as the single documented
 * exception (follow-up), not silently allowed.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';

const env = (db: SqliteD1) => ({ DB: db } as unknown as Parameters<typeof app.request>[2]);

function walkTs(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            if (entry === 'node_modules') continue;
            walkTs(full, out);
        } else if (entry.endsWith('.ts')) {
            out.push(full);
        }
    }
    return out;
}

/** Raw request-into-JS pattern (single-quoted interpolation or unquoted id). */
const RAW_SINKS = [
    /=\s*'\$\{lang\}'/,
    /=\s*'\$\{id\}'/,
    /=\s*'\$\{username\}'/,
    /=\s*'\$\{competitionId\}'/,
    /const competitionId = \$\{competitionId\}/,
    /window\.lang = '\$\{lang\}'/,
];

/** Nonce inline script bodies (external src= scripts excluded). */
function inlineScripts(html: string): string[] {
    return [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
        .map((m) => m[1] || '')
        .filter((b) => b.trim().length > 0);
}

const ALERT = `';alert(document.domain);//`;
const XSS = `';window.__xss=1;//`;

const LANG_CASES: Array<[string, string]> = [
    ['ar', 'ar'],
    ['en', 'en'],
    ['fr', 'en'],
    ['en-US', 'en'],
    ['..%2F..', 'en'],
    [encodeURIComponent(ALERT), 'en'],
    [encodeURIComponent(XSS), 'en'],
];

const SURFACES = [
    '/',
    '/messages',
    '/explore',
    '/settings',
    '/my-competitions',
    '/my-requests',
    '/earnings',
    '/reports',
    '/create',
    '/donate',
    '/transparency',
    '/notifications',
    '/profile/languser',
    '/competition/801',
];

async function seed(db: SqliteD1) {
    await db.prepare(
        `INSERT INTO users (id, email, username, display_name, password_hash, is_active)
         VALUES (901, 'lang@local', 'languser', 'Lang User', 'x', 1)`
    ).run();
    await db.prepare(
        `INSERT INTO categories (id, slug, name_ar, name_en) VALUES (901, 'lang-cat', 'قسم', 'Category')`
    ).run();
    await db.prepare(
        `INSERT INTO competitions (id, title, rules, category_id, creator_id, status, language, created_at)
         VALUES (801, 'Lang Comp', 'rules', 901, 901, 'completed', 'en', '2026-09-01 10:00:00')`
    ).run();
}

function assertStrictCsp(res: Response) {
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain('script-src');
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
}

describe('post-#69: no raw request-into-JS sinks remain (except flagged live-finance)', () => {
    it('repo source scan', () => {
        const offenders: string[] = [];
        for (const f of walkTs(join(process.cwd(), 'src'))) {
            const text = readFileSync(f, 'utf8');
            for (const re of RAW_SINKS) {
                if (re.test(text)) offenders.push(`${f} :: ${re.source}`);
            }
        }
        // Single documented exception: live-finance-page has no language sink
        // and sits outside this batch — flagged follow-up, not a free pass.
        const unexpected = offenders.filter((o) => !o.startsWith(join(process.cwd(), 'src/modules/pages/live-finance-page.ts')));
        expect(unexpected).toEqual([]);
        expect(offenders.some((o) => o.includes('live-finance-page.ts'))).toBe(true);
    });
});

describe('post-#69: every affected surface serves canonical serialized language', () => {
    let db: SqliteD1;
    beforeEach(async () => {
        db = new SqliteD1();
        await seed(db);
    });

    for (const surface of SURFACES) {
        for (const [query, canonical] of LANG_CASES) {
            it(`${surface}?lang=${query} ⇒ valid response, const lang = "${canonical}", no breakout`, async () => {
                const res = await app.request(`${surface}?lang=${query}`, {}, env(db));
                expect([200, 404]).toContain(res.status);
                assertStrictCsp(res);
                const html = await res.text();
                const scripts = inlineScripts(html);
                expect(scripts.length).toBeGreaterThan(0);
                for (const body of scripts) {
                    expect(body).not.toContain('alert(document.domain)');
                    expect(body).not.toContain('__xss');
                    expect(body).not.toContain(`const lang = '`);
                    expect(body).not.toContain(`window.lang = '`);
                }
                const assignments = scripts.flatMap((b) =>
                    [...b.matchAll(/(?:const |window\.)lang = (".*?");/g)].map((m) => m[1])
                );
                expect(assignments.length).toBeGreaterThan(0);
                for (const value of assignments) {
                    expect(value).toBe(`"${canonical}"`);
                }
            });
        }
    }

    it('/live/801 renders valid + strict CSP with no raw lang sink', async () => {
        // No competition row is fetchable in-process, so the room script is
        // absent — the source-scan test above covers its fixed sink.
        for (const [query] of LANG_CASES) {
            const res = await app.request(`/live/801?lang=${query}`, {}, env(db));
            expect(res.status).toBe(200);
            assertStrictCsp(res);
            const html = await res.text();
            expect(html).not.toContain(`const lang = '`);
            for (const body of inlineScripts(html)) {
                expect(body).not.toContain('alert(document.domain)');
                expect(body).not.toContain('__xss');
            }
        }
    });

    it('competition id cannot break out: quoted JSON even for a malicious id', async () => {
        const evil = encodeURIComponent(`801${ALERT}`);
        const res = await app.request(`/competition/${evil}?lang=en`, {}, env(db));
        expect(res.status).toBe(200);
        assertStrictCsp(res);
        const scripts = inlineScripts(await res.text());
        const idStmt = scripts.flatMap((b) => [...b.matchAll(/const competitionId = (".*?");/g)]);
        expect(idStmt.length).toBeGreaterThan(0);
        for (const m of idStmt) {
            // Safely inside one JSON string — parseable, never executable.
            expect(JSON.parse(m[1])).toContain(`801${ALERT}`);
        }
        for (const body of scripts) {
            expect(body).not.toMatch(/const competitionId = '/);
        }
    });

    it('profile username cannot break out (404 stays safe)', async () => {
        const evil = encodeURIComponent(`ghost${ALERT}`);
        const res = await app.request(`/profile/${evil}?lang=en`, {}, env(db));
        expect(res.status).toBe(404);
        assertStrictCsp(res);
        const scripts = inlineScripts(await res.text());
        const nameStmt = scripts.flatMap((b) => [...b.matchAll(/const profileUsername = (".*?");/g)]);
        expect(nameStmt.length).toBeGreaterThan(0);
        for (const m of nameStmt) {
            expect(JSON.parse(m[1])).toContain(`ghost${ALERT}`);
        }
    });
});
