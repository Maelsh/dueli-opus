/**
 * UNIT32.2 — settings page password change UI (inline script + real API)
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

const USER = { id: 32260, email: 'sp322@test.local', username: 'sp322user', display_name: 'SP' };

let db: SqliteD1;
let sessionId: string;

const settle = () => new Promise((r) => setTimeout(r, 15));

async function bootPage(oauthProvider?: string) {
    const hash = await CryptoUtils.hashPassword('oldpass123');
    await db.prepare(`
        UPDATE users SET password_hash = ?, oauth_provider = ? WHERE id = ?
    `).bind(hash, oauthProvider ?? null, USER.id).run();

    const html = await (await app.request('/settings?lang=en', {}, env(db))).text();
    const script = extractInlineScript(html, 'settingsContent');
    const toasts: Array<{ message: string; type: string }> = [];
    let loginModalCalls = 0;
    const h = createHarness({
        ids: ['settingsContent', 'currentPassword', 'newPassword', 'confirmNewPassword', 'passwordSubmitBtn', 'passwordFormError'],
        currentUser: { id: USER.id, username: USER.username, display_name: USER.display_name },
    });
    (h.window as any).dueli = { showToast: (m: string, t: string) => toasts.push({ message: m, type: t }) };
    (h.window as any).DueliSession = {
        headers: () => ({ 'X-CSRF-Token': 'test' }),
        clearLocal: () => undefined,
    };
    const fetchImpl = async (url: string, opts?: any) => app.request(url, {
        method: opts?.method || 'GET',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionId}`,
            ...(opts?.headers || {}),
        },
        body: opts?.body,
    }, env(db));
    const sandbox: Record<string, unknown> = {
        window: h.window,
        document: h.document,
        console: { error: () => undefined, log: () => undefined, warn: () => undefined },
        localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
        setTimeout,
        clearTimeout,
        JSON,
        URLSearchParams,
        encodeURIComponent,
        confirm: () => false,
        alert: () => undefined,
        checkAuth: async () => true,
        authStatus: () => 'authenticated',
        showLoginModal: () => { loginModalCalls += 1; },
        showForgotPassword: () => undefined,
        fetch: fetchImpl,
    };
    sandbox.globalThis = sandbox;
    runInNewContext(script, sandbox);
    h.fire('document', 'DOMContentLoaded');
    await settle();
    await settle();
    return { h, toasts, sandbox, loginModalCalls: () => loginModalCalls };
}

beforeEach(async () => {
    db = new SqliteD1();
    await db.prepare(`
        INSERT INTO users (id, email, username, display_name, password_hash, language, country, is_verified, is_active, is_fake)
        VALUES (?, ?, ?, ?, 'x', 'en', 'EG', 1, 1, 0)
    `).bind(USER.id, USER.email, USER.username, USER.display_name).run();
    const sessions = new SessionModel(db as unknown as D1Database);
    sessionId = (await sessions.create({ user_id: USER.id })).id;
});

describe('UNIT32.2 — settings password UI', () => {
    it('renders password fields for local accounts (AR/EN keys in markup)', async () => {
        const { h } = await bootPage();
        const html = h.el('settingsContent').innerHTML;
        expect(html).toContain('currentPassword');
        expect(html).toContain('confirmNewPassword');
        expect(html).toContain('autocomplete="current-password"');
    });

    it('blocks mismatch client-side without calling API', async () => {
        const { h, sandbox, toasts } = await bootPage();
        (h.el('currentPassword') as any).value = 'oldpass123';
        (h.el('newPassword') as any).value = 'newpass1234';
        (h.el('confirmNewPassword') as any).value = 'different';
        await (sandbox as any).changeAccountPassword();
        await settle();
        expect(toasts.length).toBe(0);
        expect(h.el('passwordFormError').textContent).toBeTruthy();
    });

    it('successful change opens login modal and clears session user', async () => {
        const { h, sandbox, loginModalCalls } = await bootPage();
        (h.el('currentPassword') as any).value = 'oldpass123';
        (h.el('newPassword') as any).value = 'newpass1234';
        (h.el('confirmNewPassword') as any).value = 'newpass1234';
        await (sandbox as any).changeAccountPassword();
        await settle();
        expect(loginModalCalls()).toBe(1);
        expect((sandbox.window as any).currentUser).toBeNull();
    });

    it('OAuth account shows social hint instead of current-password form', async () => {
        const { h } = await bootPage('google');
        const html = h.el('settingsContent').innerHTML;
        expect(html).not.toContain('id="currentPassword"');
        expect(html).toContain('showForgotPassword');
    });
});
