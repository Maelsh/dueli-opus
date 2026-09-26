/**
 * B2 — a single client language / RTL render source.
 *
 * The page language comes from the URL (?lang=) or the persisted lang cookie —
 * the same sources the server used for its render. A user.language arriving
 * after checkAuth must not flip an already-rendered page, and
 * document.documentElement.dir/lang must never contradict State.lang.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function stubBrowser(opts: { search?: string; cookie?: string; docLang?: string } = {}) {
    const documentElement = {
        lang: opts.docLang || 'ar',
        dir: (opts.docLang || 'ar') === 'ar' ? 'rtl' : 'ltr',
    };
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    vi.stubGlobal('document', {
        documentElement,
        cookie: opts.cookie || '',
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
    });
    vi.stubGlobal('navigator', { language: 'ar-EG', languages: ['ar-EG'] });
    vi.stubGlobal('window', {
        location: { search: opts.search || '', pathname: '/' },
    });
    return documentElement;
}

async function loadState() {
    return import('../../src/client/core/State');
}

describe('B2 — language/direction source of truth', () => {
    beforeEach(() => vi.resetModules());
    afterEach(() => vi.unstubAllGlobals());

    it('keeps the URL language even when user.language differs', async () => {
        const doc = stubBrowser({ search: '?lang=ar', docLang: 'ar' });
        const { State } = await loadState();
        // What the client bundle does on boot.
        State.init();

        expect(State.getLanguage()).toBe('ar');
        // A late-arriving user preference must not flip the rendered page.
        State.currentUser = { id: 1, language: 'en' };

        expect(State.getLanguage()).toBe('ar');
        expect(State.lang).toBe('ar');
        expect(doc.lang).toBe('ar');
        expect(doc.dir).toBe('rtl');
    });

    it('keeps the cookie language when there is no URL language', async () => {
        stubBrowser({ search: '', cookie: 'lang=ar', docLang: 'ar' });
        const { State } = await loadState();
        State.currentUser = { id: 1, language: 'en' };
        expect(State.getLanguage()).toBe('ar');
    });

    it('does not contradict the document direction on a client rerender', async () => {
        const doc = stubBrowser({ search: '?lang=en', docLang: 'en' });
        const { State } = await loadState();

        expect(doc.dir).toBe('ltr');
        State.lang = 'ar';
        expect(doc.lang).toBe('ar');
        expect(doc.dir).toBe('rtl');
        expect(State.lang).toBe(doc.lang);

        State.lang = 'en';
        expect(doc.lang).toBe('en');
        expect(doc.dir).toBe('ltr');
    });

    it('still honours user.language when the page has no explicit choice', async () => {
        stubBrowser({ search: '', docLang: 'en' });
        const { State } = await loadState();
        State.currentUser = { id: 1, language: 'en' };
        expect(State.getLanguage()).toBe('en');
    });
});
