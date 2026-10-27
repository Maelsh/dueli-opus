/**
 * UNIT32.3 candidate — settings password UI before/after account.has_password resolves.
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

const USER = { id: 32410, email: 'ld324@test.local', username: 'ld324user', display_name: 'LD' };

const settle = () => new Promise((r) => setTimeout(r, 20));

let db: SqliteD1;
let sessionId: string;

async function bootSettings(opts: {
    oauthProvider?: string | null;
    passwordHash?: string;
    delaySettingsMs?: number;
} = {}): Promise<{
    h: ReturnType<typeof createHarness>;
    sandbox: Record<string, unknown>;
    initialHtml: string;
}> {
    const hash = opts.passwordHash ?? await CryptoUtils.hashPassword('oldpass123');
    await db.prepare(`
        UPDATE users SET password_hash = ?, oauth_provider = ? WHERE id = ?
    `).bind(hash, opts.oauthProvider ?? null, USER.id).run();

    const initialHtml = await (await app.request('/settings?lang=en', {}, env(db))).text();
    const script = extractInlineScript(initialHtml, 'settingsContent');
    const h = createHarness({
        ids: ['settingsContent', 'currentPassword', 'newPassword', 'confirmNewPassword', 'passwordSubmitBtn', 'passwordFormError'],
        currentUser: { id: USER.id, username: USER.username, display_name: USER.display_name },
    });
    (h.window as any).dueli = { showToast: () => undefined };
    (h.window as any).DueliSession = {
        headers: () => ({ Authorization: `Bearer ${sessionId}`, 'X-CSRF-Token': 'test' }),
        clearLocal: () => undefined,
    };
    const delay = opts.delaySettingsMs ?? 0;
    const fetchImpl = async (url: string, init?: { method?: string; body?: string }) => {
        if (url.includes('/api/settings') && (init?.method || 'GET') === 'GET') {
            if (delay > 0) await new Promise((r) => setTimeout(r, delay));
        }
        return app.request(url, {
            method: init?.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${sessionId}`,
                ...(init?.headers || {}),
            },
            body: init?.body,
        }, env(db));
    };
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
        showLoginModal: () => undefined,
        showForgotPassword: () => undefined,
        fetch: fetchImpl,
    };
    sandbox.globalThis = sandbox;
    runInNewContext(script, sandbox);
    return { h, sandbox, initialHtml };
}

beforeEach(async () => {
    db = new SqliteD1();
    await db.prepare(`
        INSERT INTO users (id, email, username, display_name, password_hash, language, country, is_verified, is_active, is_fake)
        VALUES (?, ?, ?, ?, 'x', 'en', 'EG', 1, 1, 0)
    `).bind(USER.id, USER.email, USER.username, USER.display_name).run();
    sessionId = (await new SessionModel(db as unknown as D1Database).create({ user_id: USER.id })).id;
});

describe('UNIT32.3 candidate — settings password loading states', () => {
    it('server HTML shows spinner only (no password fields) before client boot', async () => {
        const html = await (await app.request('/settings?lang=en', {}, env(db))).text();
        const region = html.match(/id="settingsContent"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/)?.[1] ?? '';
        expect(region).toContain('fa-spinner');
        expect(region).not.toContain('currentPassword');
    });

    it('does not render password inputs while GET /api/settings is still pending', async () => {
        const { h } = await bootSettings({ oauthProvider: 'google', delaySettingsMs: 80 });
        h.fire('document', 'DOMContentLoaded');
        await settle();
        const mid = h.el('settingsContent').innerHTML;
        expect(mid).not.toContain('id="currentPassword"');
        expect(mid).not.toContain('showForgotPassword');
        await settle();
        await settle();
        await settle();
        const final = h.el('settingsContent').innerHTML;
        expect(final).not.toContain('id="currentPassword"');
        expect(final).toContain('showForgotPassword');
    });

    it('after load, local account shows change-password form', async () => {
        const { h } = await bootSettings();
        h.fire('document', 'DOMContentLoaded');
        await settle();
        await settle();
        const html = h.el('settingsContent').innerHTML;
        expect(html).toContain('id="currentPassword"');
        expect(html).not.toContain('showForgotPassword');
    });

    it('cannot submit password change before settings render (no inputs in DOM)', async () => {
        const { h, sandbox } = await bootSettings({ oauthProvider: 'google', delaySettingsMs: 60 });
        h.fire('document', 'DOMContentLoaded');
        await settle();
        let passwordApiCalls = 0;
        const origFetch = (sandbox as any).fetch;
        (sandbox as any).fetch = async (url: string, init?: { method?: string }) => {
            if (url.includes('/api/account/password')) passwordApiCalls += 1;
            return origFetch(url, init);
        };
        await (sandbox as any).changeAccountPassword();
        expect(passwordApiCalls).toBe(0);
        await settle();
        await settle();
        await settle();
        expect(h.el('settingsContent').innerHTML).not.toContain('id="currentPassword"');
    });
});
