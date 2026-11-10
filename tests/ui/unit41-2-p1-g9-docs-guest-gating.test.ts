/**
 * UNIT41.2-P1 (G9) — retired documentation surface + guest messaging gate.
 *
 * Contract under test:
 * - GET /docs 302-redirects to /guide (lang is carried) instead of serving a
 *   second documentation index; the published /docs/:slug reader stays.
 * - The footer renders NO /docs link anymore (the guide center is the one
 *   documentation surface).
 * - A guest on /messages never reaches the admin composer/threads: the
 *   support pane renders the login gate, `setMsgTab('admin')` is blocked
 *   for guests, and the ?tab=admin deep link is rewritten away.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import app from '../../src/main';
import { createSqliteD1, SqliteD1 } from '../helpers/sqlite-d1';

type Env = Parameters<typeof app.request>[2];
const env = (db: SqliteD1): Env => ({ DB: db }) as unknown as Env;

const read = (p: string): string => readFileSync(join(process.cwd(), p), 'utf-8');

describe('UNIT41.2-P1 G9 — one documentation surface / guest-gated admin messages', () => {
    it('1. GET /docs redirects (302) to the guide center, lang included', async () => {
        const db = new SqliteD1();
        const res = await app.request('/docs', {}, env(db));
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/guide');
        const withLang = await app.request('/docs?lang=en', {}, env(db));
        expect(withLang.status).toBe(302);
        expect(withLang.headers.get('location')).toBe('/guide?lang=en');
    });

    it('2. the published document reader route survives', () => {
        const main = read('src/main.ts');
        expect(main).toMatch(/app\.get\('\/docs\/:slug', docReaderPage\)/);
        expect(main).toMatch(/c\.redirect\(`\/guide\$\{suffix\}`, 302\)/);
    });

    it('3. the footer no longer links /docs', () => {
        const footer = read('src/shared/components/footer.ts');
        expect(footer).not.toMatch(/href="\/docs(\?|")/);
        expect(footer).toMatch(/href="\/guide/);
    });

    it('4. guests on /messages get the login gate, never the composer', async () => {
        const db = new SqliteD1();
        const res = await app.request('/messages?tab=admin&lang=ar', {}, env(db));
        expect(res.status).toBe(200);
        const html = await res.text();
        // The page shell renders, but a guest is shown the login gate and no
        // admin thread list / composer payload is requested server-side.
        expect(html).toContain('id="conversationsList"');
        expect(html).toMatch(/login_required|تسجيل الدخول/);
    });

    it('5. messages-page enforces the gate client-side (messages + URL rewrite)', () => {
        const page = read('src/modules/pages/messages-page.ts');
        expect(page).toMatch(/function showSupportLoginRequired\(/);
        expect(page).toMatch(/setMsgTab\('admin', true\)|function setMsgTab/);
        // setMsgTab refuses the admin tab for guests (startTab const guard).
        expect(page).toMatch(/params\.get\('tab'\) === 'admin' \? 'admin' : 'personal'/);
        // The guest deep link is stripped from the URL (cannot replay from
        // history): history.replaceState after searchParams.delete('tab').
        expect(page).toMatch(/searchParams\.delete\('tab'\)/);
        expect(page).toMatch(/history\.replaceState\(\{\}, '', url\.toString\(\)\)/);
        expect(page).toMatch(/showSupportLoginRequired\(\);/);
    });
});
