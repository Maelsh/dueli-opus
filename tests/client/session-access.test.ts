/**
 * SEC-08 — client session access no longer exposes a secret.
 *
 * The browser holds the session only in the server's HttpOnly cookie. These
 * tests pin the no-secret compatibility surface, bounded legacy cleanup, and
 * the synchronous fetch shim (cookies + double-submit CSRF, no Authorization).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    CSRF_COOKIE_NAME,
    LEGACY_SESSION_STORAGE_KEY,
    SESSION_STORAGE_KEY,
    clearLegacySessionStorage,
    getCsrfToken,
    installSessionAccessGlobal,
    readCookieValue,
    readLegacySessionToken,
} from '../../src/client/core/SessionAccess';

const globals = globalThis as unknown as Record<string, any>;

function installBrowser(cookie = '') {
    const store = new Map<string, string>();
    const storage = {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v); },
        removeItem: (k: string) => { store.delete(k); },
        clear: () => store.clear(),
    };
    const win: any = {
        location: { origin: 'https://dueli.test' },
        currentUser: null,
        fetch: vi.fn(async () => new Response('{}', { status: 200 })),
    };
    globals.window = win;
    globals.localStorage = storage;
    globals.document = { cookie };
    return { win, store, storage };
}

afterEach(() => {
    delete globals.window;
    delete globals.localStorage;
    delete globals.document;
    vi.restoreAllMocks();
});

beforeEach(() => {
    installBrowser();
});

describe('SEC-08 client session access', () => {
    it('never exposes a session token, even if legacy state is present', () => {
        const { win, store } = installBrowser();
        store.set(SESSION_STORAGE_KEY, 'legacy-canonical');
        store.set(LEGACY_SESSION_STORAGE_KEY, 'legacy-old');
        win.sessionId = 'legacy-runtime';

        const api = installSessionAccessGlobal(win);
        expect(api.token()).toBe('');
        expect(api.hasToken()).toBe(false);
        expect(api.headers()).not.toHaveProperty('Authorization');
        expect(win.sessionId).toBeUndefined();
    });

    it('reads legacy tokens only for the bounded migration helper', () => {
        const { store } = installBrowser();
        store.set(LEGACY_SESSION_STORAGE_KEY, 'legacy-old');
        expect(readLegacySessionToken()).toBe('legacy-old');
        store.set(SESSION_STORAGE_KEY, 'legacy-canonical');
        expect(readLegacySessionToken()).toBe('legacy-canonical');
    });

    it('clears both legacy storage keys and the window resident', () => {
        const { win, store } = installBrowser();
        store.set(SESSION_STORAGE_KEY, 'a');
        store.set(LEGACY_SESSION_STORAGE_KEY, 'b');
        win.sessionId = 'c';
        clearLegacySessionStorage();
        expect(store.has(SESSION_STORAGE_KEY)).toBe(false);
        expect(store.has(LEGACY_SESSION_STORAGE_KEY)).toBe(false);
        expect(win.sessionId).toBeUndefined();
    });

    it('reads the non-secret CSRF cookie and emits it as a header', () => {
        const { win } = installBrowser(`${CSRF_COOKIE_NAME}=csrf-abc`);
        expect(getCsrfToken()).toBe('csrf-abc');
        const api = installSessionAccessGlobal(win);
        expect(api.headers({ 'Content-Type': 'application/json' })).toEqual({
            'Content-Type': 'application/json',
            'X-CSRF-Token': 'csrf-abc',
        });
        expect(api.headers({ Authorization: 'Bearer should-not-exist' })).not.toHaveProperty('Authorization');
    });

    it('parses cookie values without leaking adjacent cookies', () => {
        expect(readCookieValue('a=1; csrfToken=x%2Fy; b=2', CSRF_COOKIE_NAME)).toBe('x/y');
        expect(readCookieValue('', CSRF_COOKIE_NAME)).toBeNull();
    });

    it('installs a same-origin fetch shim with include credentials + CSRF and strips empty Bearer', async () => {
        const { win } = installBrowser(`${CSRF_COOKIE_NAME}=csrf-123`);
        const original = win.fetch;
        installSessionAccessGlobal(win);

        await win.fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ',
                'Content-Type': 'application/json',
            },
        });

        expect(original).toHaveBeenCalledTimes(1);
        const init = original.mock.calls[0][1];
        expect(init.credentials).toBe('include');
        const headers = init.headers as Headers;
        expect(headers.get('X-CSRF-Token')).toBe('csrf-123');
        expect(headers.get('Authorization')).toBeNull();
    });

    it('does not modify non-API or cross-origin requests', async () => {
        const { win } = installBrowser(`${CSRF_COOKIE_NAME}=csrf-123`);
        const original = win.fetch;
        installSessionAccessGlobal(win);

        await win.fetch('/terms');
        await win.fetch('https://other.test/api/x');

        expect(original).toHaveBeenCalledTimes(2);
        expect((original.mock.calls[0][1] as RequestInit).headers).toBeUndefined();
        expect((original.mock.calls[1][1] as RequestInit).headers).toBeUndefined();
    });
});
