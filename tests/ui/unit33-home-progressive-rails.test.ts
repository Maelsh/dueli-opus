/**
 * UNIT33 / R4-HOME-UX-1 — progressive per-rail paint (H-01).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomePage } from '../../src/client/pages/HomePage';
import { State } from '../../src/client/core/State';
import { homeRailSectionId } from '../../src/shared/components/home-rail';
import * as competitionCard from '../../src/shared/components/competition-card';

class MockClassList {
    private classes = new Set<string>();
    add(...tokens: string[]) { tokens.forEach((t) => this.classes.add(t)); }
    remove(...tokens: string[]) { tokens.forEach((t) => this.classes.delete(t)); }
    toggle(token: string, force?: boolean): boolean {
        if (force === true) { this.classes.add(token); return true; }
        if (force === false) { this.classes.delete(token); return false; }
        if (this.classes.has(token)) { this.classes.delete(token); return false; }
        this.classes.add(token); return true;
    }
    contains(token: string): boolean { return this.classes.has(token); }
}

class MockElement {
    id = '';
    tagName = 'DIV';
    classList = new MockClassList();
    innerHTML = '';
    parentElement: MockElement | null = null;
    private htmlStore?: { get: () => string; set: (v: string) => void };
    get outerHTML(): string {
        return this.innerHTML;
    }
    set outerHTML(value: string) {
        if (this.htmlStore) {
            const current = this.htmlStore.get();
            const re = new RegExp(`<section[^>]*id="${this.id}"[\\s\\S]*?</section>`);
            if (re.test(current)) {
                this.htmlStore.set(current.replace(re, value));
            } else {
                this.htmlStore.set(current + value);
            }
            return;
        }
        this.innerHTML = value;
    }
    children: MockElement[] = [];
    style: Record<string, string> = {};
    getBoundingClientRect() {
        return { left: 0, right: 100, top: 0, bottom: 100, width: 100, height: 100 };
    }
    setAttribute() { /* noop */ }
    getAttribute() { return null; }
    addEventListener() { /* noop */ }
    remove() {
        if (this.parentElement) {
            this.parentElement.children = this.parentElement.children.filter((c) => c !== this);
        }
    }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    insertAdjacentHTML() { /* noop */ }
    matches() { return false; }
    closest() { return null; }
}

function wireDom(): { home: MockElement; registry: Map<string, MockElement> } {
    const registry = new Map<string, MockElement>();
    let homeHtml = '';
    const home = new MockElement();
    home.id = 'home-content';
    Object.defineProperty(home, 'innerHTML', {
        get: () => homeHtml,
        set: (v: string) => {
            homeHtml = v;
            for (const m of v.matchAll(/id="(home-rail-[^"]+)"/g)) {
                const rid = m[1];
                if (!registry.has(rid)) {
                    const el = new MockElement();
                    el.id = rid;
                    el.htmlStore = { get: () => homeHtml, set: (nv) => { homeHtml = nv; } };
                    registry.set(rid, el);
                }
            }
        },
    });
    registry.set('home-content', home);
    const doc = {
        getElementById: (id: string) => {
            if (id === 'home-content') return home;
            if (!registry.has(id)) {
                const el = new MockElement();
                el.id = id;
                el.htmlStore = { get: () => homeHtml, set: (nv) => { homeHtml = nv; } };
                registry.set(id, el);
            }
            return registry.get(id)!;
        },
        querySelectorAll: () => [],
    };
    (globalThis as any).document = doc;
    return { home, registry };
}

describe('UNIT33 — Home progressive rails', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        State.lang = 'en';
        HomePage.rails.clear();
        HomePage.railGeneration = 0;
        HomePage.lastDefs = [];
        delete (globalThis as any).fetch;
        delete (globalThis as any).localStorage;
        (globalThis as any).localStorage = {
            getItem: () => null,
            setItem: () => undefined,
            removeItem: () => undefined,
        };
    });

    it('paints per-rail placeholders before sessions resolve', async () => {
        const { home } = wireDom();
        const slowKey = 'suggested-live';
        const fastKey = 'cat-dialogue-live';
        vi.spyOn(HomePage, 'buildRailDefs').mockReturnValue([
            {
                key: slowKey,
                kind: 'suggested',
                title: 'Slow',
                icon: 'fas fa-fire',
                color: '#8B5CF6',
                category: '',
                subcategory: '',
                status: 'live',
            },
            {
                key: fastKey,
                kind: 'category',
                title: 'Fast',
                icon: 'fas fa-tag',
                color: '#8B5CF6',
                category: 'dialogue',
                subcategory: '',
                status: 'live',
            },
        ]);
        vi.spyOn(HomePage, 'ensureGuestToken').mockImplementation(() => undefined);
        vi.spyOn(HomePage, 'setupAllHoverScroll').mockImplementation(() => undefined);
        vi.spyOn(HomePage, 'wireRetryButton').mockImplementation(() => undefined);
        vi.spyOn(HomePage, 'armRailObserver').mockImplementation(() => undefined);
        vi.spyOn(HomePage, 'openRail').mockImplementation(async (def) => {
            if (def.key === slowKey) {
                await new Promise((r) => setTimeout(r, 40));
                return { items: [{ id: 1, title: 'A' }], sessionId: 's1', cursor: null, done: true };
            }
            return { items: [{ id: 2, title: 'B' }], sessionId: 's2', cursor: null, done: true };
        });
        vi.spyOn(competitionCard, 'getCompetitionCard').mockReturnValue('<div class="duel-card">card</div>');

        const loadPromise = HomePage.loadCompetitions();
        await new Promise((r) => setTimeout(r, 5));
        expect(home.innerHTML).toContain(homeRailSectionId(slowKey));
        expect(home.innerHTML).toContain(homeRailSectionId(fastKey));
        expect(home.innerHTML).toContain('fa-spinner');
        await loadPromise;
        expect(home.innerHTML).toContain('duel-card');
    });

    it('discards stale bootstrap paint after a new generation', async () => {
        const { home, registry } = wireDom();
        const key = 'suggested-live';
        vi.spyOn(HomePage, 'buildRailDefs').mockReturnValue([
            {
                key,
                kind: 'suggested',
                title: 'Rail',
                icon: 'fas fa-fire',
                color: '#8B5CF6',
                category: '',
                subcategory: '',
                status: 'live',
            },
        ]);
        vi.spyOn(HomePage, 'ensureGuestToken').mockImplementation(() => undefined);
        vi.spyOn(HomePage, 'setupAllHoverScroll').mockImplementation(() => undefined);
        vi.spyOn(HomePage, 'wireRetryButton').mockImplementation(() => undefined);
        vi.spyOn(HomePage, 'armRailObserver').mockImplementation(() => undefined);
        let resolveSlow: () => void;
        vi.spyOn(HomePage, 'openRail').mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveSlow = () =>
                        resolve({ items: [{ id: 9, title: 'Stale' }], sessionId: 'old', cursor: null, done: true });
                })
        );

        void HomePage.loadCompetitions();
        await new Promise((r) => setTimeout(r, 5));
        HomePage.railGeneration += 1;
        home.innerHTML = '<div id="replaced">new context</div>';
        resolveSlow!();
        await new Promise((r) => setTimeout(r, 10));
        expect(home.innerHTML).toContain('new context');
        expect(HomePage.rails.size).toBe(0);
    });
});
