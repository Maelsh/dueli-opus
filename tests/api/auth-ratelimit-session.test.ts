/**
 * Beta Core Gate remediation — regression tests for AuthService.checkAuth()
 * 429 handling + getCategoryName() direct-invocation fallback.
 *
 * - 429 must never clear the stored session (no forced logout).
 * - Network errors must not clear the stored session either.
 * - Genuine auth failure (user:null) must still clear.
 * - getCategoryName('ar' + name_ar) must return Arabic even when the slug
 *   also exists as an i18n key (the reported Physics/الفيزياء case).
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getCategoryName } from '../../src/i18n';
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
    (globalThis as any).document = {
        cookie: '',
        getElementById: () => null,
    };
    (globalThis as any).window = (globalThis as any).window ?? {};
    return store;
}

describe('checkAuth 429 handling (no forced logout)', () => {
    let store: Map<string, string>;

    beforeEach(() => {
        store = stubBrowser();
        store.set('sessionId', 'sess-abc');
        store.set('user', JSON.stringify({ id: 1 }));
        State.currentUser = { id: 1 } as any;
        State.sessionId = 'sess-abc';
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('429 keeps the stored session (no clearAuth)', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(
            JSON.stringify({ success: false, error: 'Too many requests' }),
            { status: 429 }
        )));
        const ok = await AuthService.checkAuth();
        expect(ok).toBe(false);
        expect(store.get('sessionId')).toBe('sess-abc');
        expect(State.sessionId).toBe('sess-abc');
    });

    it('genuine auth failure (user:null, 200) still clears', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(
            JSON.stringify({ success: true, user: null }),
            { status: 200 }
        )));
        const ok = await AuthService.checkAuth();
        expect(ok).toBe(false);
        expect(store.has('sessionId')).toBe(false);
        expect(State.sessionId).toBeNull();
    });

    it('network error does not clear the stored session', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
        const ok = await AuthService.checkAuth();
        expect(ok).toBe(false);
        expect(store.get('sessionId')).toBe('sess-abc');
    });
});

describe('getCategoryName direct invocation', () => {
    it("ar + name_ar returns Arabic even when slug key exists ('physics')", () => {
        expect(getCategoryName({ slug: 'physics', name_ar: 'الفيزياء', name_en: 'Physics' }, 'ar'))
            .toBe('الفيزياء');
    });

    it('en + name_en returns English', () => {
        expect(getCategoryName({ slug: 'physics', name_ar: 'الفيزياء', name_en: 'Physics' }, 'en'))
            .toBe('Physics');
    });

    it('falls back to English when the requested translation is missing', () => {
        // No slug key and no name_ar -> explicit English field wins.
        expect(getCategoryName({ slug: 'no-such-slug', name_en: 'Only EN' }, 'ar')).toBe('Only EN');
        // Slug WITH a namespaced i18n pack resolves via the pack (authoritative
        // translation), which is the correct precedence over name_en.
        expect(getCategoryName({ slug: 'physics', name_en: 'Physics' }, 'ar')).toBe('علوم الفيزياء');
    });

    it('prefers the namespaced categories.<slug> key over the legacy flat pack', () => {
        // 'physics' bare key resolves via the flat legacy block; the
        // namespaced categories.physics pack is authoritative for 'ar'.
        expect(getCategoryName({ slug: 'physics' }, 'ar')).toBe('علوم الفيزياء');
        expect(getCategoryName({ slug: 'physics' }, 'en')).toBe('Physics');
    });
});
