/**
 * UNIT32 / R4-PROFILE-SAVE-1 (P-01) — the settings save journey a real user
 * walks: load /settings, type a display name and a bio, save, and see the
 * PERSISTED values afterwards.
 *
 * The page's OWN inline script is executed against the real server (the same
 * Hono app + a real D1 schema), so the test covers the whole chain:
 *
 *   page script → PUT /api/settings → users row → re-read
 *              (GET /api/users/:username) → rendered form → page reload
 *
 * The last step is the point of the unit: a save that only updates the
 * browser's memory would still show the old values after a reload, so the
 * reloaded form is asserted against the values read back from the database.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { runInNewContext } from 'node:vm';
import app from '../../src/main';
import { createHarness, extractInlineScript } from '../helpers/dom-harness';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { SessionModel } from '../../src/models/SessionModel';

const env = (db: SqliteD1) => ({ DB: db } as unknown as Parameters<typeof app.request>[2]);

const USER = {
    id: 301,
    email: 'ui@unit32.local',
    username: 'uiuser32',
    display_name: 'UI Old Name',
    bio: 'UI old bio'
};

let db: SqliteD1;
let sessionId: string;

const settle = () => new Promise((r) => setTimeout(r, 10));

interface PageRun {
    harness: ReturnType<typeof createHarness>;
    toasts: Array<{ message: string; type: string }>;
    save: (values: Record<string, unknown>) => Promise<void>;
}

/**
 * Runs the real settings page script against the real server.
 * `currentUser` is what the client would hold in memory (the session DTO).
 */
async function runSettingsPage(currentUser: Record<string, unknown>): Promise<PageRun> {
    const html = await (await app.request('/settings?lang=en', {}, env(db))).text();
    const script = extractInlineScript(html, 'settingsContent');

    const toasts: Array<{ message: string; type: string }> = [];
    const h = createHarness({
        ids: [
            'settingsContent',
            'displayName',
            'bio',
            'language',
            'country',
            'emailNotifications',
            'pushNotifications'
        ],
        currentUser
    });
    (h.window as any).dueli = {
        showToast: (message: string, type: string) => toasts.push({ message, type })
    };

    // The page's fetch goes to the real server with the real session.
    const fetchImpl = async (url: string, opts?: any) => app.request(url, {
        method: opts?.method || 'GET',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionId}`,
            ...(opts?.headers || {})
        },
        body: opts?.body
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
        fetch: fetchImpl,
    };
    sandbox.globalThis = sandbox;
    runInNewContext(script, sandbox);

    return {
        harness: h,
        toasts,
        save: async (values: Record<string, unknown>) => {
            const set = (id: string, value: unknown) => {
                (h.el(id) as any).value = value;
            };
            set('displayName', values.display_name);
            set('bio', values.bio);
            set('language', values.default_language ?? 'en');
            set('country', values.default_country ?? 'EG');
            (h.el('emailNotifications') as any).checked = values.email_notifications ?? true;
            (h.el('pushNotifications') as any).checked = values.notifications_enabled ?? true;
            await (sandbox as any).saveSettings({ preventDefault: () => undefined });
            await settle();
            await settle();
        }
    };
}

async function readUserRow(): Promise<any> {
    return db.prepare('SELECT display_name, bio FROM users WHERE id = ?').bind(USER.id).first();
}

beforeEach(async () => {
    db = new SqliteD1();
    await db.prepare(`
        INSERT INTO users (id, email, username, display_name, password_hash, bio,
                           language, country, is_verified, is_active, is_fake)
        VALUES (?, ?, ?, ?, 'hash', ?, 'ar', 'SA', 1, 1, 0)
    `).bind(USER.id, USER.email, USER.username, USER.display_name, USER.bio).run();
    const sessions = new SessionModel(db as unknown as D1Database);
    sessionId = (await sessions.create({ user_id: USER.id })).id;
});

describe('UNIT32 / P-01 — /settings save journey (page → API → DB → reload)', () => {
    it('saves the typed display name and bio and shows the persisted values', async () => {
        const page = await runSettingsPage({
            id: USER.id,
            username: USER.username,
            display_name: USER.display_name
        });

        page.harness.fire('document', 'DOMContentLoaded');
        await settle();
        await settle();

        // The loaded form shows the persisted profile (authoritative read).
        const loaded = page.harness.el('settingsContent').innerHTML;
        expect(loaded).toContain('UI Old Name');
        expect(loaded).toContain('UI old bio');

        await page.save({
            display_name: 'UI New Name',
            bio: 'UI new bio',
            default_language: 'en',
            default_country: 'EG'
        });

        // 1. A truthful success notification.
        expect(page.toasts.some((t) => t.type === 'success')).toBe(true);
        expect(page.toasts.some((t) => t.type === 'error')).toBe(false);

        // 2. The values really reached the database.
        const row = await readUserRow();
        expect(row.display_name).toBe('UI New Name');
        expect(row.bio).toBe('UI new bio');

        // 3. The form now shows the persisted values.
        const afterSave = page.harness.el('settingsContent').innerHTML;
        expect(afterSave).toContain('UI New Name');
        expect(afterSave).toContain('UI new bio');
    });

    it('after a page reload the form still shows the saved values', async () => {
        const page = await runSettingsPage({
            id: USER.id,
            username: USER.username,
            display_name: USER.display_name
        });
        page.harness.fire('document', 'DOMContentLoaded');
        await settle();
        await settle();

        await page.save({ display_name: 'UI Persisted', bio: 'UI persisted bio' });

        // A reload: a FRESH page with a stale in-memory user (the session
        // DTO of the previous load). The values on screen must come from the
        // database, not from that stale copy.
        const reloaded = await runSettingsPage({
            id: USER.id,
            username: USER.username,
            display_name: USER.display_name
        });
        reloaded.harness.fire('document', 'DOMContentLoaded');
        await settle();
        await settle();

        const html = reloaded.harness.el('settingsContent').innerHTML;
        expect(html).toContain('UI Persisted');
        expect(html).toContain('UI persisted bio');
        expect(html).not.toContain('UI Old Name');
    });

    it('reports an error and saves nothing when the server refuses the save', async () => {
        const page = await runSettingsPage({
            id: USER.id,
            username: USER.username,
            display_name: USER.display_name
        });
        page.harness.fire('document', 'DOMContentLoaded');
        await settle();
        await settle();

        // One character is below the documented minimum (2..100).
        await page.save({ display_name: 'X', bio: 'UI rejected bio' });

        expect(page.toasts.some((t) => t.type === 'error')).toBe(true);
        expect(page.toasts.some((t) => t.type === 'success')).toBe(false);

        const row = await readUserRow();
        expect(row.display_name).toBe('UI Old Name');
        expect(row.bio).toBe('UI old bio');
    });
});
