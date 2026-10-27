/**
 * UNIT32.2-REM1 — password fields preserve raw values (leading/trailing spaces)
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import type { D1Database } from '@cloudflare/workers-types';
import app from '../../src/main';
import { createHarness, extractInlineScript } from '../helpers/dom-harness';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { SessionModel } from '../../src/models/SessionModel';
import { CryptoUtils } from '../../src/lib/services/CryptoUtils';

const env = (db: SqliteD1) => ({ DB: db } as unknown as Parameters<typeof app.request>[2]);

let db: SqliteD1;
let sessionId: string;

beforeEach(async () => {
    db = new SqliteD1();
    const hash = await CryptoUtils.hashPassword('  spacedpass  ');
    await db.prepare(`
        INSERT INTO users (id, email, username, password_hash, display_name, is_verified, is_active, is_fake)
        VALUES (32320, 'raw@test.local', 'rawpw', ?, 'Raw', 1, 1, 0)
    `).bind(hash).run();
    sessionId = (await new SessionModel(db as unknown as D1Database).create({ user_id: 32320 })).id;
});

describe('UNIT32.2-REM1 settings password raw values', () => {
    it('sends passwords without trimming; rejects literal mismatch on confirm', async () => {
        const html = await (await app.request('/settings?lang=en', {}, env(db))).text();
        const script = extractInlineScript(html, 'settingsContent');
        const h = createHarness({
            ids: ['settingsContent', 'currentPassword', 'newPassword', 'confirmNewPassword', 'passwordSubmitBtn', 'passwordFormError'],
            currentUser: { id: 32320, username: 'rawpw' },
        });
        (h.window as any).dueli = { showToast: () => undefined };
        (h.window as any).DueliSession = { headers: () => ({ 'X-CSRF-Token': 'test' }), clearLocal: () => undefined };
        const sandbox: Record<string, unknown> = {
            window: h.window,
            document: h.document,
            console: { error: () => undefined, log: () => undefined, warn: () => undefined },
            localStorage: { removeItem: () => undefined },
            setTimeout,
            clearTimeout,
            JSON,
            checkAuth: async () => true,
            authStatus: () => 'authenticated',
            showLoginModal: () => undefined,
            showForgotPassword: () => undefined,
            fetch: async (url: string, opts?: any) => app.request(url, {
                method: opts?.method || 'GET',
                headers: { Authorization: `Bearer ${sessionId}`, ...(opts?.headers || {}) },
                body: opts?.body,
            }, env(db)),
        };
        sandbox.globalThis = sandbox;
        runInNewContext(script, sandbox);
        h.fire('document', 'DOMContentLoaded');
        await new Promise((r) => setTimeout(r, 20));
        await new Promise((r) => setTimeout(r, 20));

        (h.el('currentPassword') as any).value = '  spacedpass  ';
        (h.el('newPassword') as any).value = '  newpass12  ';
        (h.el('confirmNewPassword') as any).value = 'newpass12';
        await (sandbox as any).changeAccountPassword();
        await new Promise((r) => setTimeout(r, 20));
        expect(h.el('passwordFormError').textContent).toBeTruthy();

        (h.el('confirmNewPassword') as any).value = '  newpass12  ';
        await (sandbox as any).changeAccountPassword();
        await new Promise((r) => setTimeout(r, 30));
        expect((sandbox.window as any).currentUser).toBeNull();
    });
});
