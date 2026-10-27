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

type ClickableMock = MockElement & { click: () => void };

class MockElement {
    id = '';
    tagName = 'DIV';
    classList = new MockClassList();
    innerHTML = '';
    parentElement: MockElement | null = null;
    private htmlStore?: { get: () => string; set: (v: string) => void };
    private retryButton: ClickableMock | null = null;
    get outerHTML(): string {
        return this.innerHTML;
    }
    set outerHTML(value: string) {
        if (this.htmlStore) {
            const current = this.htmlStore.get();
            const re = new RegExp(`<section[^>]*id="${this.id}"[\\s\\S]*?</section>`, 'i');
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
        if (this.htmlStore && this.id) {
            const current = this.htmlStore.get();
            const re = new RegExp(`<section[^>]*id="${this.id}"[\\s\\S]*?</section>\\s*`, 'i');
            this.htmlStore.set(current.replace(re, ''));
        }
        if (this.parentElement) {
            this.parentElement.children = this.parentElement.children.filter((c) => c !== this);
        }
    }
    querySelector(sel: string): ClickableMock | null {
        if (!this.htmlStore || !this.id) return null;
        const html = this.htmlStore.get();
        const secRe = new RegExp(`<section[^>]*id="${this.id}"[\\s\\S]*?</section>`, 'i');
        const secMatch = secRe.exec(html);
        if (!secMatch) return null;
        const secHtml = secMatch[0];
        if (sel === '[data-home-rail-retry]') {
            const btnMatch = /data-home-rail-retry="([^"]+)"/.exec(secHtml);
            if (!btnMatch) {
                this.retryButton = null;
                return null;
            }
            const railKey = btnMatch[1];
            if (!this.retryButton) {
                const listeners: Array<() => void> = [];
                const btn = new MockElement() as ClickableMock;
                btn.click = () => listeners.forEach((fn) => fn());
                btn.addEventListener = (type: string, fn: () => void) => {
                    if (type === 'click') listeners.push(fn);
                };
                btn.getAttribute = (attr: string) =>
                    attr === 'data-home-rail-retry' ? railKey : null;
                this.retryButton = btn;
            }
            return this.retryButton;
        }
        return null;
    }
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

function railDef(key: string, overrides: Record<string, unknown> = {}) {
    return {
        key,
        kind: 'suggested',
        title: key,
        icon: 'fas fa-fire',
        color: '#8B5CF6',
        category: '',
        subcategory: '',
        status: 'live',
        ...overrides,
    };
}

function stubHomeLoad() {
    vi.spyOn(HomePage, 'ensureGuestToken').mockImplementation(() => undefined);
    vi.spyOn(HomePage, 'setupAllHoverScroll').mockImplementation(() => undefined);
    vi.spyOn(HomePage, 'armRailObserver').mockImplementation(() => undefined);
}

const EMPTY_MARKER = 'No competitions yet';

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
            railDef(slowKey),
            railDef(fastKey, { kind: 'category', title: 'Fast', category: 'dialogue' }),
        ]);
        stubHomeLoad();
        vi.spyOn(HomePage, 'wireRetryButton').mockImplementation(() => undefined);
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
        const { home } = wireDom();
        const key = 'suggested-live';
        vi.spyOn(HomePage, 'buildRailDefs').mockReturnValue([railDef(key)]);
        stubHomeLoad();
        vi.spyOn(HomePage, 'wireRetryButton').mockImplementation(() => undefined);
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

    it('keeps retry UI when all rails fail to open', async () => {
        const { home, registry } = wireDom();
        const a = 'rail-a';
        const b = 'rail-b';
        vi.spyOn(HomePage, 'buildRailDefs').mockReturnValue([railDef(a), railDef(b, { title: 'B' })]);
        stubHomeLoad();
        vi.spyOn(HomePage, 'openRail').mockResolvedValue(null);

        await HomePage.loadCompetitions();

        expect(home.innerHTML).toContain('data-home-rail-retry');
        expect(home.innerHTML).not.toContain(EMPTY_MARKER);
        const btnA = registry.get(homeRailSectionId(a))?.querySelector('[data-home-rail-retry]');
        expect(btnA).toBeTruthy();
    });

    it('does not replace a failed rail with global empty when another rail is empty-success', async () => {
        const { home } = wireDom();
        const okEmpty = 'rail-empty';
        const failed = 'rail-fail';
        vi.spyOn(HomePage, 'buildRailDefs').mockReturnValue([
            railDef(okEmpty),
            railDef(failed, { title: 'Fail' }),
        ]);
        stubHomeLoad();
        vi.spyOn(HomePage, 'openRail').mockImplementation(async (def) => {
            if (def.key === okEmpty) {
                return { items: [], sessionId: 'e1', cursor: null, done: true };
            }
            return null;
        });

        await HomePage.loadCompetitions();

        expect(home.innerHTML).toContain('data-home-rail-retry');
        expect(home.innerHTML).not.toContain(EMPTY_MARKER);
    });

    it('shows global empty state when every rail succeeds with no cards', async () => {
        const { home } = wireDom();
        vi.spyOn(HomePage, 'buildRailDefs').mockReturnValue([
            railDef('empty-1'),
            railDef('empty-2', { title: 'E2' }),
        ]);
        stubHomeLoad();
        vi.spyOn(HomePage, 'openRail').mockResolvedValue({
            items: [],
            sessionId: 's',
            cursor: null,
            done: true,
        });

        await HomePage.loadCompetitions();

        expect(home.innerHTML).toContain(EMPTY_MARKER);
        expect(home.innerHTML).not.toContain('data-home-rail-retry');
    });

    it('wires retry click to reopenRailSection for a never-opened rail', async () => {
        const { registry } = wireDom();
        const key = 'rail-retry';
        vi.spyOn(HomePage, 'buildRailDefs').mockReturnValue([railDef(key)]);
        stubHomeLoad();
        vi.spyOn(HomePage, 'openRail').mockResolvedValue(null);
        const reopen = vi.spyOn(HomePage, 'reopenRailSection').mockResolvedValue(undefined);

        await HomePage.loadCompetitions();

        const section = registry.get(homeRailSectionId(key));
        const btn = section?.querySelector('[data-home-rail-retry]');
        expect(btn).toBeTruthy();
        HomePage.wireRetryButton(key);
        btn!.click();
        expect(reopen).toHaveBeenCalledWith(key);
    });
});
