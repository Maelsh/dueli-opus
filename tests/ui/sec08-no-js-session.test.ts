/**
 * SEC-08 — no browser-readable session secret, anywhere.
 *
 * Static pins complement the behavioural tests: they prevent a future page or
 * client service from reintroducing a JS-readable session write/read or a
 * hard-coded Bearer built from localStorage. Legacy reads are allowed only in
 * the single bounded migration helper (`AuthService`), never in pages.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const CLIENT = join(ROOT, 'src/client');
const PAGES = join(ROOT, 'src/modules/pages');

function files(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...files(full));
        else if (entry.endsWith('.ts')) out.push(full);
    }
    return out;
}

describe('SEC-08 no JS-readable browser session', () => {
    it('no client/page file writes a session cookie or localStorage session', () => {
        for (const file of [...files(CLIENT), ...files(PAGES)]) {
            const source = readFileSync(file, 'utf-8');
            expect(source, file).not.toMatch(/document\s*\.\s*cookie\s*=\s*[`'"][^`'"]*session/i);
            expect(source, file).not.toMatch(/localStorage\s*\.\s*setItem\s*\(\s*['"](sessionId|session_id)['"]/);
            expect(source, file).not.toMatch(/window\s*\.\s*sessionId\s*=/);
            expect(source, file).not.toMatch(/localStorage\s*\.\s*getItem\s*\(\s*['"](sessionId|session_id)['"]/);
        }
    });

    it('only AuthService keeps the bounded legacy-token migration read', () => {
        const offenders: string[] = [];
        const allowed = new Set([
            resolve(CLIENT, 'services/AuthService.ts'),
            resolve(CLIENT, 'core/SessionAccess.ts'),
        ]);
        for (const file of files(CLIENT)) {
            const source = readFileSync(file, 'utf-8');
            if (/readLegacySessionToken|SESSION_STORAGE_KEY|LEGACY_SESSION_STORAGE_KEY/.test(source) && !allowed.has(resolve(file))) {
                offenders.push(file);
            }
        }
        expect(offenders).toEqual([]);

        const auth = readFileSync(resolve(CLIENT, 'services/AuthService.ts'), 'utf-8');
        expect(auth).toContain('readLegacySessionToken');
        expect(auth).toContain("'Bearer ' + legacyToken");
        expect(auth.match(/\/api\/auth\/session/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    });

    it('the synchronous accessor is loaded before deferred app code', () => {
        const layout = readFileSync(resolve(ROOT, 'src/shared/templates/layout.ts'), 'utf-8');
        const accessor = layout.indexOf('/static/session-access.js');
        const app = layout.indexOf('/static/app.js');
        expect(accessor).toBeGreaterThan(-1);
        expect(app).toBeGreaterThan(accessor);
    });
});
