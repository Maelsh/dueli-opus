/**
 * SEC-07 — consumer wiring pins.
 *
 * The behavioural precedence is covered in tests/client/session-access.test.ts
 * and tests/ui/auth-session-lifecycle.test.ts. These pins make sure the actual
 * Admin, Advertiser, complaint and live-finance page consumers use the shared
 * accessor instead of reintroducing a direct/legacy read.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const PAGES = join(ROOT, 'src/modules/pages');

function read(relative: string): string {
    return readFileSync(join(ROOT, relative), 'utf-8');
}

function pageFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...pageFiles(full));
        else if (entry.endsWith('.ts')) out.push(full);
    }
    return out;
}

describe('SEC-08 page consumers use the HttpOnly session + CSRF shim', () => {
    it('no page reads or writes a session secret directly', () => {
        for (const file of pageFiles(PAGES)) {
            const source = readFileSync(file, 'utf-8');
            expect(source, file).not.toContain("localStorage.getItem('session_id')");
            expect(source, file).not.toContain('localStorage.getItem("session_id")');
            expect(source, file).not.toContain("localStorage.getItem('sessionId')");
            expect(source, file).not.toContain('localStorage.getItem("sessionId")');
            expect(source, file).not.toContain('window.sessionId');
            expect(source, file).not.toContain('document.cookie = \'sessionId=');
            expect(source, file).not.toContain('document.cookie = "sessionId=');
            expect(source, file).not.toContain("'Authorization': 'Bearer ' + window.DueliSession.token");
            expect(source, file).not.toContain("'Authorization': 'Bearer ' + (window.DueliSession.token");
        }
    });

    it('Admin, Advertiser, complaint and live-finance consumers use cookie auth', () => {
        const admin = read('src/modules/pages/admin-dashboard-page.ts');
        const advertiser = read('src/modules/pages/advertiser-portal-page.ts');
        const complaints = read('src/modules/pages/complaint-tracking-page.ts');
        const liveFinance = read('src/modules/pages/live-finance-page.ts');

        for (const source of [admin, advertiser, complaints, liveFinance]) {
            expect(source).not.toContain('session_id');
            expect(source).not.toContain('DueliSession.token()');
            expect(source).not.toContain("'Authorization': 'Bearer ");
        }
        expect(admin).toContain('adminHeaders');
        expect(advertiser).toContain("fetch('/api/advertiser/dashboard')");
        expect(complaints).toContain("fetch('/api/complaints/my')");
        expect(liveFinance).toContain("fetch('/api/admin/live-finance/'");
    });

    it('layout loads the synchronous accessor before app.js', () => {
        const layout = read('src/shared/templates/layout.ts');
        const accessor = layout.indexOf('/static/session-access.js');
        const app = layout.indexOf('/static/app.js');
        expect(accessor).toBeGreaterThan(-1);
        expect(app).toBeGreaterThan(accessor);
    });

    it('build path emits session-access.js', () => {
        const pkg = read('package.json');
        const sw = read('public/sw.js');
        expect(pkg).toContain('src/client/session-access.ts');
        expect(pkg).toContain('dist/static/session-access.js');
        // Offline page HTML references the accessor; it must be warmed too.
        expect(sw).toContain("'/static/session-access.js'");
    });
});
