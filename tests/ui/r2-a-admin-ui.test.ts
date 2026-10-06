/**
 * R2-A — admin UI contract (page gate, nav entry, account + H9 docs
 * surfaces, bootstrap script pins).
 *
 * Pins (string-level on server-rendered templates + script sources):
 * 1. /admin server gate: cookie/Bearer session check, non-admin 403 with
 *    access_denied, dashboard otherwise.
 * 2. Admin nav entry hidden by default, unhidden for is_admin sessions.
 * 3. Account card wired to PUT /api/account/* with re-auth redirect on
 *    password change; responses never embed hashes (controller DTO).
 * 4. H9 docs section: list/editor/ar-en preview/publish/delete wired to
 *    /api/admin/documents; SEED badge for is_seed rows.
 * 5. CSP allowlist covers every new data-csp-fn used by the page.
 * 6. i18n account/documents/admin keys exist in ar+en and differ.
 * 7. Bootstrap script: dry-run default, remote refused, PBKDF2 params
 *    matching CryptoUtils, never a migration/seed/prod path.
 * 8. Routes mounted (/api/account, /api/documents) + inventory regenerated.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ar } from '../../src/i18n/ar';
import { en } from '../../src/i18n/en';

const ADMIN_PAGE = readFileSync(resolve(__dirname, '../../src/modules/pages/admin-dashboard-page.ts'), 'utf-8');
const NAV = readFileSync(resolve(__dirname, '../../src/shared/components/navigation.ts'), 'utf-8');
const AUTH_SVC = readFileSync(resolve(__dirname, '../../src/client/services/AuthService.ts'), 'utf-8');
const CSP = readFileSync(resolve(__dirname, '../../src/client/csp-delegate.ts'), 'utf-8');
const MAIN = readFileSync(resolve(__dirname, '../../src/main.ts'), 'utf-8');
const ACCOUNT = readFileSync(resolve(__dirname, '../../src/controllers/AccountController.ts'), 'utf-8');
const DOCS = readFileSync(resolve(__dirname, '../../src/controllers/DocumentController.ts'), 'utf-8');
const DOC_MODEL = readFileSync(resolve(__dirname, '../../src/models/ManagedDocumentModel.ts'), 'utf-8');
const BOOT = readFileSync(resolve(__dirname, '../../dev-tools/bootstrap-admin.mjs'), 'utf-8');
const INVENTORY = readFileSync(resolve(__dirname, '../../dev-tools/route-inventory.json'), 'utf-8');

describe('R2-A admin UI contract', () => {
    it('1. /admin has a server-side gate (non-admin 403, no shell leak)', () => {
        expect(ADMIN_PAGE).toContain('findValidSession');
        expect(ADMIN_PAGE).toContain("getCookie(c, 'sessionId')");
        expect(ADMIN_PAGE).toContain('is_admin');
        expect(ADMIN_PAGE).toContain('403');
        expect(ADMIN_PAGE).toContain("tt('access_denied')");
        expect(ADMIN_PAGE).toContain('denyAdminAccess');
    });

    it('2. admin nav entry hidden unless admin session', () => {
        expect(NAV).toContain('id="adminMenuItem"');
        expect(NAV).toContain('/admin?lang=');
        expect(NAV).toContain('hidden');
        expect(AUTH_SVC).toContain('adminMenuItem');
        expect(AUTH_SVC).toContain('is_admin');
    });

    it('3. account card wired to the three settings endpoints (reauth on password)', () => {
        for (const fn of ['saveAccountUsername', 'saveAccountEmail', 'saveAccountPassword']) {
            expect(ADMIN_PAGE).toContain(fn);
            expect(CSP).toContain(`'${fn}'`);
        }
        expect(ADMIN_PAGE).toContain('/api/account/username');
        expect(ADMIN_PAGE).toContain('/api/account/email');
        expect(ADMIN_PAGE).toContain('/api/account/password');
        expect(ADMIN_PAGE).toContain('/login');
        // Controller never leaks hashes: picked DTO, no password_hash passthrough.
        expect(ACCOUNT).toContain('safeAccountDTO');
        expect(ACCOUNT).not.toContain('password_hash:');
        expect(ACCOUNT).toContain('reauth_required');
        expect(ACCOUNT).toContain('reverify_required');
    });

    it('4. H9 docs section wired to admin CRUD + ar/en preview + SEED badge', () => {
        for (const fn of ['loadAdminDocs', 'saveAdminDoc', 'editAdminDoc', 'deleteAdminDoc', 'toggleDocPublish', 'previewAdminDoc', 'resetAdminDocForm']) {
            expect(ADMIN_PAGE).toContain(fn);
            expect(CSP).toContain(`'${fn}'`);
        }
        expect(ADMIN_PAGE).toContain('/api/admin/documents');
        expect(ADMIN_PAGE).toContain('SEED');
        expect(ADMIN_PAGE).toContain("dir");
        expect(DOCS).toContain('findPublishedPublic');
        expect(DOC_MODEL).toContain('version = version + 1');
    });

    it('5. public doc read is published+public only (no oracle)', () => {
        expect(DOC_MODEL).toContain("status = 'published' AND visibility = 'public'");
        expect(MAIN).toContain("app.route('/api/documents'");
    });

    it('6. account + documents routes mounted; inventory regenerated with them', () => {
        expect(MAIN).toContain("app.route('/api/account'");
        expect(INVENTORY).toContain('/api/account/username');
        expect(INVENTORY).toContain('/api/documents/:slug');
        expect(INVENTORY).toContain('/api/admin/documents');
    });

    it('7. bootstrap script is dry-run-first and refuses remote', () => {
        expect(BOOT).toContain('--apply');
        expect(BOOT).toContain('--local');
        expect(BOOT).toContain('--remote');
        expect(BOOT).toContain('DRY-RUN');
        expect(BOOT).toContain('REFUSED');
        expect(BOOT).toContain('H8/owner-gated');
        expect(BOOT).toContain('pbkdf2$100000$');
        expect(BOOT).toContain('100_000');
        expect(BOOT).not.toContain('migrations apply');
        expect(BOOT).not.toContain('--remote --file');
    });

    it.each(['ar', 'en'] as const)('8. i18n account/documents/admin keys exist and differ (%s)', (lang) => {
        void lang;
        const a = ar as any, e = en as any;
        for (const k of ['username_updated', 'email_updated', 'password_updated', 'username_taken', 'username_invalid', 'email_taken', 'email_invalid', 'current_password_incorrect']) {
            expect(a.account?.[k], `ar.account.${k}`).toBeTruthy();
            expect(e.account?.[k], `en.account.${k}`).toBeTruthy();
            expect(a.account[k]).not.toBe(e.account[k]);
        }
        for (const k of ['slug_invalid', 'slug_taken', 'status_invalid', 'visibility_invalid', 'draft', 'published', 'private', 'public', 'seed_badge']) {
            expect(a.documents?.[k], `ar.documents.${k}`).toBeTruthy();
            expect(e.documents?.[k], `en.documents.${k}`).toBeTruthy();
            expect(a.documents[k]).not.toBe(e.documents[k]);
        }
        for (const k of ['role_not_found', 'last_superadmin', 'access_denied', 'admin_panel', 'my_account', 'documents_title']) {
            expect(a.admin?.[k], `ar.admin.${k}`).toBeTruthy();
            expect(e.admin?.[k], `en.admin.${k}`).toBeTruthy();
            expect(a.admin[k]).not.toBe(e.admin[k]);
        }
    });

    it('9. dark + RTL preserved on new surfaces', () => {
        expect(ADMIN_PAGE).toContain('dark:bg-gray-800');
        expect(previewDirCheck()).toBe(true);
    });
});

function previewDirCheck(): boolean {
    return ADMIN_PAGE.includes("setAttribute('dir'") && NAV.includes('isRTL');
}
