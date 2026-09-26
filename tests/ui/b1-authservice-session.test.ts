/**
 * B1 (client) — AuthService session handling (behavioural).
 *
 * Asserts real AuthService behaviour against stubbed browser globals:
 *  - only a genuine 401 clears the session; 429/5xx/network/timeout keep it;
 *  - checkAuth is bounded, so a hung request cannot hang the page;
 *  - a successful modal login publishes the auth-success event;
 *  - logout still clears the UI state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function installBrowser(opts: { lang?: string } = {}) {
    const store = new Map<string, string>();
    const winListeners: Record<string, ((ev?: unknown) => void)[]> = {};
    const lang = opts.lang || 'ar';
    const documentElement = { lang, dir: lang === 'ar' ? 'rtl' : 'ltr' };

    vi.stubGlobal('localStorage', {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v); },
        removeItem: (k: string) => { store.delete(k); },
        clear: () => store.clear(),
    });
    const stubNode = () => ({
        className: '',
        textContent: '',
        style: {},
        classList: { add: () => undefined, remove: () => undefined, contains: () => false },
        appendChild: () => undefined,
        remove: () => undefined,
        setAttribute: () => undefined,
        removeAttribute: () => undefined,
        querySelector: () => null,
        addEventListener: () => undefined,
    });

    vi.stubGlobal('document', {
        documentElement,
        cookie: '',
        head: stubNode(),
        body: stubNode(),
        createElement: () => stubNode(),
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
    });
    vi.stubGlobal('navigator', { language: 'ar-EG', languages: ['ar-EG'] });
    vi.stubGlobal('CustomEvent', class {
        type: string;
        detail: unknown;
        constructor(type: string, init?: { detail?: unknown }) { this.type = type; this.detail = init?.detail; }
    });
    vi.stubGlobal('window', {
        currentUser: null,
        sessionId: null,
        lang,
        location: { search: `?lang=${lang}`, pathname: '/', href: 'http://x/', reload: () => undefined, assign: () => undefined },
        addEventListener: (t: string, fn: (ev?: unknown) => void) => { (winListeners[t] = winListeners[t] || []).push(fn); },
        dispatchEvent: (ev: { type: string }) => { for (const fn of winListeners[ev.type] || []) fn(ev); },
        removeEventListener: () => undefined,
        matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
        setTimeout,
        clearTimeout,
    });

    return { documentElement, winListeners };
}

export const jsonResponse = (status: number, body: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
});

export const withSession = () => {
    localStorage.setItem('sessionId', 'sess-1');
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'u1' }));
};

export async function loadAuth() {
    installBrowser({ lang: 'ar' });
    const { AuthService } = await import('../../src/client/services/AuthService');
    const { State } = await import('../../src/client/core/State');
    return { AuthService, State };
}

describe('B1 — AuthService session handling', () => {
    beforeEach(() => vi.resetModules());
    afterEach(() => vi.unstubAllGlobals());

    it('keeps the session on a 429 (transient), not a logout', async () => {
        const { AuthService, State } = await loadAuth();
        withSession();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(429, {})));

        expect(await AuthService.checkAuth()).toBe(false);
        // The session is preserved: a transient failure is not a logout.
        expect(localStorage.getItem('sessionId')).toBe('sess-1');
        expect(localStorage.getItem('user')).not.toBeNull();
    });

    it('keeps the session on a 5xx', async () => {
        const { AuthService } = await loadAuth();
        withSession();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(503, {})));

        expect(await AuthService.checkAuth()).toBe(false);
        expect(localStorage.getItem('sessionId')).toBe('sess-1');
        expect(localStorage.getItem('user')).not.toBeNull();
    });

    it('keeps the session on a network failure', async () => {
        const { AuthService } = await loadAuth();
        withSession();
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

        expect(await AuthService.checkAuth()).toBe(false);
        expect(localStorage.getItem('sessionId')).toBe('sess-1');
        expect(localStorage.getItem('user')).not.toBeNull();
    });

    it('clears the session on a genuine 401', async () => {
        const { AuthService, State } = await loadAuth();
        withSession();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, {})));

        expect(await AuthService.checkAuth()).toBe(false);
        expect(State.currentUser).toBeNull();
        expect(localStorage.getItem('sessionId')).toBeNull();
    });

    it('bounds the auth check so a hung request cannot hang the page', async () => {
        const { AuthService } = await loadAuth();
        withSession();
        vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => undefined)));
        vi.useFakeTimers();

        const pending = AuthService.checkAuth();
        vi.advanceTimersByTime(AuthService.AUTH_CHECK_TIMEOUT_MS + 10);
        expect(await pending).toBe(false);
        vi.useRealTimers();
    });

    it('publishes an auth-success event after a modal login', async () => {
        const { AuthService } = await loadAuth();
        const events: unknown[] = [];
        window.addEventListener('dueli:auth-success', (e) => events.push(e));
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, {
            success: true,
            data: { user: { id: 5, username: 'u5' }, sessionId: 'new-session' },
        })));
        document.getElementById = ((id: string) => (
            id === 'loginEmail' ? { value: 'a@b.c' } : id === 'loginPassword' ? { value: 'pw' } : null
        )) as never;

        await AuthService.handleLogin(new Event('submit') as never);
        await new Promise((r) => setTimeout(r, 0));

        expect(events).toHaveLength(1);
    });

    it('logout still clears the UI state', async () => {
        const { AuthService, State } = await loadAuth();
        withSession();
        State.currentUser = { id: 1 };
        State.sessionId = 'sess-1';
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { success: true })));

        await AuthService.logout();
        expect(State.currentUser).toBeNull();
        expect(State.sessionId).toBeNull();
        expect(localStorage.getItem('user')).toBeNull();
    });
});
