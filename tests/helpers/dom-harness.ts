/**
 * Tiny DOM shim used to execute the inline page scripts of the server
 * rendered pages (My Competitions / Explore) inside Vitest.
 *
 * It only implements what those scripts actually use: element lookup by id,
 * classList toggling, innerHTML writes, insertAdjacentHTML appends,
 * addEventListener, and delegated [data-action] buttons rendered into a
 * status region. No new dependencies, no browser.
 */

export interface ShimElement {
    id: string;
    innerHTML: string;
    textContent: string;
    classList: { add(...c: string[]): void; remove(...c: string[]): void; contains(c: string): boolean; toArray(): string[] };
    appendLog: string[];
    children: ShimElement[];
    insertAdjacentHTML(_pos: string, html: string): void;
    setAttribute(name: string, value: string): void;
    getAttribute(name: string): string | null;
    appendChild(child: ShimElement): ShimElement;
    addEventListener(type: string, fn: (ev?: unknown) => void): void;
    querySelector(selector: string): ShimElement | null;
    querySelectorAll(selector: string): ShimElement[];
    click(): void;
}

const DATA_ACTION = /\[data-action="([^"]+)"\]/;
const ID_PREFIX = /^\[id\^="([^"]+)"\]$/;

/** Registry of every element in the current harness (module-scoped, one at a time). */
let REGISTRY = new Map<string, ShimElement>();
let CONTROLS = new Map<string, ShimElement>();

function makeElement(id: string): ShimElement {
    const classes = new Set<string>();
    const listeners: Record<string, ((ev?: unknown) => void)[]> = {};
    const el: ShimElement = {
        id,
        innerHTML: '',
        textContent: '',
        appendLog: [],
        children: [],
        classList: {
            add: (...c) => c.forEach((x) => x && classes.add(x)),
            remove: (...c) => c.forEach((x) => classes.delete(x)),
            contains: (c) => classes.has(c),
            toArray: () => [...classes],
        },
        insertAdjacentHTML(_pos, html) {
            el.appendLog.push(html);
            el.innerHTML += html;
        },
        setAttribute: () => undefined,
        getAttribute: () => null,
        appendChild: (child: ShimElement) => { el.children.push(child); return child; },
        addEventListener(type, fn) {
            (listeners[type] = listeners[type] || []).push(fn);
        },
        querySelector(selector) {
            const m = DATA_ACTION.exec(selector);
            if (m && el.innerHTML.includes(`data-action="${m[1]}"`)) {
                // Stand-in for a button that exists only as rendered markup.
                // It is memoised so a handler the page attached stays reachable.
                const key = `${id}:${m[1]}`;
                if (!CONTROLS.has(key)) CONTROLS.set(key, makeElement(key));
                return CONTROLS.get(key);
            }
            return null;
        },
        querySelectorAll(selector) {
            const m = ID_PREFIX.exec(selector);
            if (!m) return [];
            return [...REGISTRY.values()].filter((e) => e.id.startsWith(m[1]));
        },
        click() {
            for (const fn of listeners.click || []) fn({ type: 'click' });
        },
    };
    return el;
}

export interface Harness {
    window: Record<string, unknown>;
    document: Record<string, unknown>;
    el(id: string): ShimElement;
    fire(target: 'window' | 'document', type: string): void;
    assigned: string[];
}

export function createHarness(opts: { ids: string[]; currentUser?: unknown; search?: string }): Harness {
    REGISTRY = new Map();
    CONTROLS = new Map();
    for (const id of opts.ids) REGISTRY.set(id, makeElement(id));

    const docListeners: Record<string, (() => void)[]> = {};
    const winListeners: Record<string, ((ev?: unknown) => void)[]> = {};
    const assigned: string[] = [];

    const documentObj: Record<string, unknown> = {
        readyState: 'complete',
        documentElement: { lang: 'ar', dir: 'rtl' },
        getElementById: (id: string) => {
            // A real DOM materialises nodes declared in innerHTML; the shim
            // registers them lazily so page-declared regions are addressable.
            if (!REGISTRY.has(id)) REGISTRY.set(id, makeElement(id));
            return REGISTRY.get(id);
        },
        createElement: () => makeElement(''),
        querySelectorAll: (sel: string) => {
            const m = ID_PREFIX.exec(sel);
            if (!m) return [];
            return [...REGISTRY.values()].filter((e) => e.id.startsWith(m[1]));
        },
        addEventListener: (type: string, fn: () => void) => {
            (docListeners[type] = docListeners[type] || []).push(fn);
        },
    };

    const windowObj: Record<string, unknown> = {
        currentUser: opts.currentUser ?? null,
        innerWidth: 1280,
        location: {
            // The page reads its query from the URL, mirroring the request.
            search: opts.search || '?lang=ar',
            pathname: '/',
            assign: (u: string) => { assigned.push(u); },
        },
        addEventListener: (type: string, fn: (ev?: unknown) => void) => {
            (winListeners[type] = winListeners[type] || []).push(fn);
        },
    };

    return {
        window: windowObj,
        document: documentObj,
        // A real DOM creates nodes declared in innerHTML; the shim registers
        // them lazily so the page's own markup is addressable.
        el: (id: string) => {
            if (!REGISTRY.has(id)) REGISTRY.set(id, makeElement(id));
            return REGISTRY.get(id) as ShimElement;
        },
        fire: (target, type) => {
            const map = target === 'window' ? winListeners : docListeners;
            for (const fn of map[type] || []) fn();
        },
        assigned,
    };
}

/**
 * Extracts the inline page script from rendered HTML, identified by a marker
 * that only the page-level script contains (navigation/login-modal scripts come
 * first and are not the code under test).
 */
export function extractInlineScript(html: string, marker: string): string {
    const bodies = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
        .map((m) => m[1] || '')
        .filter((b) => b.trim().length > 0);
    const found = bodies.find((b) => b.includes(marker));
    if (!found) throw new Error(`no inline script containing ${marker}`);
    return found;
}
