/**
 * B6 avatar CLICK behaviour (not markup inspection).
 *
 * The real CSP dispatcher module is loaded and driven through stubbed browser
 * globals, so the assertions cover what actually happens on click / keypress:
 *  - a competition-card avatar click navigates to /profile/:username and does
 *    NOT fall through to the parent /competition/:id link;
 *  - a messages-row avatar click navigates to the profile and does not follow
 *    the parent conversation link;
 *  - the parent navigation is cancelled centrally, not patched per surface;
 *  - Enter/Space activate the avatar (keyboard parity with a link);
 *  - a native <button> is not double-activated.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

class FakeNode {
    tag: string;
    attrs: Record<string, string>;
    parent: FakeNode | null = null;
    style = { cssText: '' };
    classList = { add: () => undefined, remove: () => undefined, contains: () => false };
    innerHTML = '';
    children: FakeNode[] = [];
    preventDefaultCount = 0;
    stopPropagationCount = 0;
    textContent = '';

    constructor(tag: string, attrs: Record<string, string> = {}) {
        this.tag = tag;
        this.attrs = attrs;
    }

    /** The real DOM exposes an upper-cased tagName; the dispatcher relies on it. */
    get tagName(): string {
        return this.tag.toUpperCase();
    }

    getAttribute(name: string): string | null {
        return name in this.attrs ? this.attrs[name] : null;
    }
    hasAttribute(name: string): boolean {
        return name in this.attrs;
    }
    setAttribute(name: string, value: string): void {
        this.attrs[name] = value;
    }
    removeAttribute(name: string): void {
        delete this.attrs[name];
    }
    appendChild(child: FakeNode): FakeNode {
        this.children.push(child);
        return child;
    }
    closest(selector: string): FakeNode | null {
        // Supports compound attribute selectors such as [data-csp-on][data-csp-fn].
        const parts = [...selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)];
        if (!parts.length || !selector.startsWith('[')) return null;
        let cur: FakeNode | null = this;
        while (cur) {
            const ok = parts.every(([, name, value]) => (
                value === undefined ? name in cur!.attrs : cur!.attrs[name] === value
            ));
            if (ok) return cur;
            cur = cur.parent;
        }
        return null;
    }
}

let docListeners: Record<string, ((ev: unknown) => void)[]> = {};
const assigned: string[] = [];

function installGlobals() {
    docListeners = {};
    assigned.length = 0;
    vi.stubGlobal('HTMLElement', FakeNode);
    vi.stubGlobal('Element', FakeNode);
    vi.stubGlobal('HTMLImageElement', class extends FakeNode {});
    vi.stubGlobal('MutationObserver', class { observe() { return undefined; } });
    vi.stubGlobal('document', {
        addEventListener: (t: string, fn: (ev: unknown) => void) => { (docListeners[t] = docListeners[t] || []).push(fn); },
        querySelectorAll: () => [],
        documentElement: new FakeNode('html'),
    });
    const locationStub = { search: '?lang=ar', assign: (u: string) => { assigned.push(u); } };
    vi.stubGlobal('location', locationStub);
    vi.stubGlobal('window', { location: locationStub });
    // The worker/dispatcher uses `self` (service-worker-style global).
    vi.stubGlobal('self', { location: locationStub });
}

async function loadDispatcher() {
    vi.resetModules();
    installGlobals();
    await import('../../src/client/csp-delegate');
}

function fire(type: string, target: FakeNode, key?: string) {
    const ev = {
        type,
        target,
        key,
        preventDefault: () => { target.preventDefaultCount++; },
        stopPropagation: () => { target.stopPropagationCount++; },
    };
    for (const fn of docListeners[type] || []) fn(ev);
    return ev;
}

/** The exact markup shape the shared competition card emits for an avatar. */
function competitionCardAvatar(username = 'sara') {
    const card = new FakeNode('a', { href: '/competition/42?lang=ar' });
    const span = new FakeNode('span', {
        'data-csp-on': 'click',
        'data-csp-fn': '__navigateProfile',
        'data-csp-args': `["${username}","@event"]`,
        'data-csp-stop': '1',
        role: 'link',
        tabindex: '0',
    });
    span.parent = card;
    new FakeNode('img').parent = span;
    return { card, avatar: span };
}

describe('B6 â€” avatar click navigates to the profile', () => {
    beforeEach(async () => { await loadDispatcher(); });
    afterEach(() => vi.unstubAllGlobals());

    it('competition card: avatar click goes to the profile, not the competition', () => {
        const { card, avatar } = competitionCardAvatar('sara');
        fire('click', avatar);

        expect(assigned).toEqual(['/profile/sara?lang=ar']);
        // The parent anchor's own navigation is cancelled centrally.
        expect(avatar.preventDefaultCount).toBe(1);
        expect(avatar.stopPropagationCount).toBe(1);
        expect(assigned.some(u => u.includes('/competition/'))).toBe(false);
        expect(card.attrs.href).toBe('/competition/42?lang=ar');
    });

    it('messages row: avatar click goes to the profile, not the conversation', () => {
        const row = new FakeNode('a', { href: '/messages?conversation=7' });
        const avatar = new FakeNode('img', {
            'data-csp-on': 'click',
            'data-csp-fn': '__navigateProfile',
            'data-csp-args': '["omar","@event"]',
            'data-csp-stop': '1',
            role: 'link',
        });
        avatar.parent = row;

        fire('click', avatar);

        expect(assigned).toEqual(['/profile/omar?lang=ar']);
        expect(avatar.preventDefaultCount).toBe(1);
        expect(assigned.some(u => u.includes('/messages'))).toBe(false);
    });

    it('is keyboard reachable: Enter and Space activate the avatar', () => {
        const { avatar } = competitionCardAvatar('sara');

        fire('keydown', avatar, 'Enter');
        expect(assigned).toEqual(['/profile/sara?lang=ar']);

        fire('keydown', avatar, ' ');
        expect(assigned).toHaveLength(2);
        expect(avatar.preventDefaultCount).toBeGreaterThanOrEqual(2);
    });

    it('ignores unrelated keys', () => {
        const { avatar } = competitionCardAvatar('sara');
        fire('keydown', avatar, 'a');
        expect(assigned).toHaveLength(0);
    });

    it('does not double-activate a native <button>', () => {
        const row = new FakeNode('button', {
            'data-csp-on': 'click',
            'data-csp-fn': '__navigateProfile',
            'data-csp-args': '["sara"]',
        });
        // A native button already emits click on Enter; the keydown fallback
        // must not add a second navigation.
        fire('keydown', row, 'Enter');
        expect(assigned).toHaveLength(0);

        fire('click', row);
        expect(assigned).toHaveLength(1);
    });

    it('refuses a non-username value instead of building a broken link', () => {
        const avatar = new FakeNode('span', {
            'data-csp-on': 'click',
            'data-csp-fn': '__navigateProfile',
            'data-csp-args': '["../evil","@event"]',
        });
        fire('click', avatar);
        expect(assigned).toHaveLength(0);
    });
});
