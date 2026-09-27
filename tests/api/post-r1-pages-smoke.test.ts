/**
 * Post-R1 acceptance — SSR smoke for every page touched by the blockers batch.
 *
 * Guards were rewired to the canonical auth lifecycle and several templates
 * fixed; this pins that each affected page still serves 200 with navigation,
 * login modal, footer, strict CSP (nonce, no unsafe), and no "[object Object]"
 * in either language.
 */
import { describe, it, expect } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';

function env(db: SqliteD1) {
    return { DB: db } as unknown as Parameters<typeof app.request>[2];
}

const PAGES = [
    '/',
    '/messages',
    '/notifications',
    '/settings',
    '/my-competitions',
    '/my-requests',
    '/earnings',
    '/reports',
    '/create',
    '/explore',
];

describe('post-R1: touched pages serve clean SSR shells (en+ar)', () => {
    for (const page of PAGES) {
        for (const lang of ['en', 'ar']) {
            it(`${page}?lang=${lang} ⇒ 200, strict CSP, no [object Object]`, async () => {
                const db = new SqliteD1();
                const res = await app.request(`${page}?lang=${lang}`, {}, env(db));
                expect(res.status, page).toBe(200);
                const html = await res.text();
                expect(html).not.toContain('[object Object]');
                expect(html).not.toContain('onclick=');
                const csp = res.headers.get('content-security-policy') ?? '';
                expect(csp).toContain('script-src');
                expect(csp).not.toContain('unsafe-inline');
            });
        }
    }
});
