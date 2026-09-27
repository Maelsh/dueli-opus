/**
 * Post-R1 acceptance (A+B) — canonical client auth lifecycle.
 *
 * Proven failure on previous main: App.init + page guards raced duplicate
 * /api/auth/session calls, and any transient 429/5xx/network on a fresh page
 * (empty JS memory) left the client unable to hydrate the user, so guards
 * rendered a false "Login Required" despite a valid server session.
 *
 * Pins:
 * 1. Concurrent checkAuth() calls share ONE network request (single-flight).
 * 2. Transient 429 / 5xx / network / timeout ⇒ status stays 'unknown',
 *    stored session untouched (never a false guest).
 * 3. 429 preserves the server's retryAfter hint.
 * 4. ONLY authoritative answers (401, or 200 with user:null) ⇒ 'guest'.
 * 5. normalizeUser(): legacy {name, avatar} ⇒ canonical
 *    {display_name, avatar_url, username}; a missing avatar stays null
 *    (never replaced by a random fallback identity).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuthService } from '../../src/client/services/AuthService';
import { State } from '../../src/client/core/State';

function stubBrowser() {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => { store.set(k, v); },
        removeItem: (k: string) => { store.delete(k); },
        clear: () => store.clear(),
    };
    (globalThis as any).document = { cookie: '', getElementById: () => null };
    (globalThis as any).window = (globalThis as any).window ?? {};
    return store;
}

const SESSION_JSON = {
    success: true,
    data: {
        user: {
            id: 7,
            username: 'canon',
            display_name: 'Canon User',
            avatar_url: 'https://cdn.test/a.png',
            email: 'canon@test.local',
        },
    },
};

function sessionFetch(sessionCalls: { count: number }, responder: () => Response) {
    return vi.fn(async (url: any) => {
        if (String(url).includes('/api/auth/session')) {
            sessionCalls.count += 1;
            return responder();
        }
        return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
    });
}

const okSession = () => new Response(JSON.stringify(SESSION_JSON), { status: 200 });

describe('canonical auth lifecycle (single-flight + transient-safe status)', () => {
    let store: Map<string, string>;
    let sessionCalls: { count: number };

    beforeEach(() => {
        store = stubBrowser();
        store.set('sessionId', 'sess-abc');
        State.currentUser = null;
        State.sessionId = null;
        AuthService.authStatus = 'unknown';
        AuthService.lastRetryAfterSec = 0;
        (AuthService as any)._pendingAuthCheck = null;
        sessionCalls = { count: 0 };
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        (AuthService as any)._pendingAuthCheck = null;
    });

    it('1. concurrent checkAuth() calls share one /api/auth/session request', async () => {
        vi.stubGlobal('fetch', sessionFetch(sessionCalls, okSession));
        const [a, b, c] = await Promise.all([
            AuthService.checkAuth(),
            AuthService.checkAuth(),
            AuthService.checkAuth(),
        ]);
        expect(a && b && c).toBe(true);
        expect(sessionCalls.count).toBe(1);
        expect(AuthService.authStatus).toBe('authenticated');
    });

    it('2a. 429 preserves retryAfter, keeps status unknown + stored session', async () => {
        vi.stubGlobal('fetch', sessionFetch(sessionCalls, () => new Response(
            JSON.stringify({ success: false, error: 'Too many requests', retryAfter: 45 }),
            { status: 429 }
        )));
        const ok = await AuthService.checkAuth();
        expect(ok).toBe(false);
        expect(AuthService.authStatus).toBe('unknown');
        expect(AuthService.lastRetryAfterSec).toBe(45);
        expect(store.get('sessionId')).toBe('sess-abc');
        expect(State.currentUser).toBeNull();
    });

    it('2b. 429 without a body hint is still transient, never guest', async () => {
        vi.stubGlobal('fetch', sessionFetch(sessionCalls, () => new Response('busy', { status: 429 })));
        expect(await AuthService.checkAuth()).toBe(false);
        expect(AuthService.authStatus).toBe('unknown');
        expect(store.get('sessionId')).toBe('sess-abc');
    });

    it('2c. 500 keeps unknown + stored session', async () => {
        vi.stubGlobal('fetch', sessionFetch(sessionCalls, () => new Response('err', { status: 500 })));
        expect(await AuthService.checkAuth()).toBe(false);
        expect(AuthService.authStatus).toBe('unknown');
        expect(store.get('sessionId')).toBe('sess-abc');
    });

    it('2d. network failure keeps unknown + stored session', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: any) => {
            if (String(url).includes('/api/auth/session')) throw new Error('down');
            return new Response('{}', { status: 200 });
        }));
        expect(await AuthService.checkAuth()).toBe(false);
        expect(AuthService.authStatus).toBe('unknown');
        expect(store.get('sessionId')).toBe('sess-abc');
    });

    it('2e. timeout is transient, never guest', async () => {
        (AuthService as any).AUTH_CHECK_TIMEOUT_MS = 20;
        try {
            vi.stubGlobal('fetch', vi.fn(async () => new Promise(() => {})));
            expect(await AuthService.checkAuth()).toBe(false);
            expect(AuthService.authStatus).toBe('unknown');
            expect(store.get('sessionId')).toBe('sess-abc');
        } finally {
            (AuthService as any).AUTH_CHECK_TIMEOUT_MS = 10000;
        }
    });

    it('3. a previously authenticated client survives a later 429 (no false logout)', async () => {
        vi.stubGlobal('fetch', sessionFetch(sessionCalls, okSession));
        expect(await AuthService.checkAuth()).toBe(true);
        expect(AuthService.authStatus).toBe('authenticated');

        vi.stubGlobal('fetch', sessionFetch(sessionCalls, () => new Response('busy', { status: 429 })));
        expect(await AuthService.checkAuth()).toBe(false);
        // The known user is preserved; status never degrades to guest.
        expect(AuthService.authStatus).toBe('authenticated');
        expect(State.currentUser?.id).toBe(7);
        expect(store.get('sessionId')).toBe('sess-abc');
    });

    it('4a. 401 is authoritative: guest + cleared', async () => {
        State.currentUser = { id: 7 } as any;
        State.sessionId = 'sess-abc';
        vi.stubGlobal('fetch', sessionFetch(sessionCalls, () => new Response('{}', { status: 401 })));
        expect(await AuthService.checkAuth()).toBe(false);
        expect(AuthService.authStatus).toBe('guest');
        expect(store.has('sessionId')).toBe(false);
        expect(State.currentUser).toBeNull();
    });

    it('4b. 200 with user:null is authoritative: guest + cleared', async () => {
        vi.stubGlobal('fetch', sessionFetch(sessionCalls, () => new Response(
            JSON.stringify({ success: true, user: null }), { status: 200 }
        )));
        expect(await AuthService.checkAuth()).toBe(false);
        expect(AuthService.authStatus).toBe('guest');
        expect(store.has('sessionId')).toBe(false);
    });

    it('5a. normalizeUser maps legacy {name, avatar} to the canonical DTO', () => {
        const out = AuthService.normalizeUser({ id: 3, name: 'Old Name', avatar: 'https://cdn.test/o.png' });
        expect(out.display_name).toBe('Old Name');
        expect(out.avatar_url).toBe('https://cdn.test/o.png');
        // Compatibility aliases survive in both directions.
        expect(out.name).toBe('Old Name');
        expect(out.avatar).toBe('https://cdn.test/o.png');
    });

    it('5b. normalizeUser never invents an avatar', () => {
        const out = AuthService.normalizeUser({ id: 3, username: 'noavatar' });
        expect(out.avatar_url).toBeNull();
        expect(out.avatar).toBeNull();
        expect(out.display_name).toBe('noavatar');
    });

    it('5c. a successful check stores the canonical user in State', async () => {
        vi.stubGlobal('fetch', sessionFetch(sessionCalls, okSession));
        expect(await AuthService.checkAuth()).toBe(true);
        expect(State.currentUser.display_name).toBe('Canon User');
        expect(State.currentUser.avatar_url).toBe('https://cdn.test/a.png');
        expect(State.currentUser.username).toBe('canon');
    });
});
