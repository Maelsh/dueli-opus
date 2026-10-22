/**
 * SEC-07 — canonical client session access.
 *
 * Proven failure modes on current main:
 *  - admin/advertiser/complaint/live-finance read the legacy `session_id` key
 *    FIRST (or only), so a stale legacy value overrides the canonical
 *    `sessionId` pair and the page renders logged-out / 401.
 *  - AuthService picked one cookie/localStorage candidate; a stale canonical
 *    copy could hide a newer valid copy and clear a valid session.
 *  - AuthController.getSession turned a DB error into 200 {user:null}, which
 *    the client correctly treated as authoritative expiry (false logout).
 *
 * These tests pin the single precedence path and its migration semantics.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    LEGACY_SESSION_STORAGE_KEY,
    SESSION_STORAGE_KEY,
    installSessionAccessGlobal,
    listSessionCandidates,
    normalizeSessionToken,
    readCookieValue,
    selectSessionToken,
} from '../../src/client/core/SessionAccess';

function stubBrowserStorage() {
    const store = new Map<string, string>();
    const storage = {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value); },
        removeItem: (key: string) => { store.delete(key); },
        clear: () => store.clear(),
        key: () => null,
        length: 0,
    };
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('window', {
        sessionId: null,
        localStorage: storage,
    });
    vi.stubGlobal('document', { cookie: '' });
    return store;
}

describe('SEC-07 canonical session access', () => {
    it('uses one canonical key and keeps the legacy key as a compatibility constant', () => {
        expect(SESSION_STORAGE_KEY).toBe('sessionId');
        expect(LEGACY_SESSION_STORAGE_KEY).toBe('session_id');
    });

    it('orders runtime > canonical storage > canonical cookie > legacy', () => {
        const candidates = listSessionCandidates({
            runtime: 'runtime-token',
            stored: 'stored-token',
            cookie: 'cookie-token',
            legacy: 'legacy-token',
        });
        expect(candidates).toEqual([
            'runtime-token',
            'stored-token',
            'cookie-token',
            'legacy-token',
        ]);
        expect(selectSessionToken({
            runtime: null,
            stored: null,
            cookie: null,
            legacy: 'legacy-token',
        })).toBe('legacy-token');
    });

    it('never lets a stale legacy value override any canonical value', () => {
        expect(selectSessionToken({
            stored: 'new-canonical',
            legacy: 'old-legacy',
        })).toBe('new-canonical');
        expect(selectSessionToken({
            cookie: 'cookie-canonical',
            legacy: 'old-legacy',
        })).toBe('cookie-canonical');
        expect(selectSessionToken({
            runtime: 'validated-runtime',
            stored: 'stale-stored',
            legacy: 'old-legacy',
        })).toBe('validated-runtime');
    });

    it('treats null/empty/placeholder values as absent and skips them', () => {
        for (const value of [null, undefined, '', '   ', 'null', 'undefined', 'Bearer', 'Bearer null']) {
            expect(normalizeSessionToken(value)).toBeNull();
        }
        expect(normalizeSessionToken('  real-token  ')).toBe('real-token');
        expect(listSessionCandidates({
            runtime: '',
            stored: 'null',
            cookie: 'undefined',
            legacy: 'legacy-valid',
        })).toEqual(['legacy-valid']);
    });

    it('de-duplicates the same value across sources', () => {
        expect(listSessionCandidates({
            runtime: 'same-token',
            stored: 'same-token',
            cookie: 'same-token',
            legacy: 'same-token',
        })).toEqual(['same-token']);
    });

    it('reads the canonical cookie safely, including percent-encoding', () => {
        expect(readCookieValue('lang=en; sessionId=abc-123; theme=dark', 'sessionId')).toBe('abc-123');
        expect(readCookieValue('sessionId=abc%2D123', 'sessionId')).toBe('abc-123');
        expect(readCookieValue('session_id=legacy-only', 'sessionId')).toBeNull();
        expect(readCookieValue(null, 'sessionId')).toBeNull();
    });
});

describe('SEC-07 installed global accessor', () => {
    let store: Map<string, string>;

    beforeEach(() => {
        store = stubBrowserStorage();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('uses the same precedence and header shape as the bundle', () => {
        store.set(SESSION_STORAGE_KEY, 'stored-token');
        store.set(LEGACY_SESSION_STORAGE_KEY, 'legacy-token');
        (globalThis as any).document.cookie = 'sessionId=cookie-token';
        const api = installSessionAccessGlobal((globalThis as any).window);

        expect(api.token()).toBe('stored-token');
        expect(api.headers({ 'Content-Type': 'application/json' })).toEqual({
            'Content-Type': 'application/json',
            Authorization: 'Bearer stored-token',
        });

        (globalThis as any).window.sessionId = 'runtime-token';
        expect(api.token()).toBe('runtime-token');

        store.delete(SESSION_STORAGE_KEY);
        (globalThis as any).window.sessionId = null;
        expect(api.token()).toBe('cookie-token');

        (globalThis as any).document.cookie = '';
        expect(api.token()).toBe('legacy-token');

        api.clearLocal();
        expect(store.has(SESSION_STORAGE_KEY)).toBe(false);
        expect(store.has(LEGACY_SESSION_STORAGE_KEY)).toBe(false);
        expect(api.token()).toBe('');
    });
});
