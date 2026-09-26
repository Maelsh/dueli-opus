/**
 * B6 — the REAL /messages conversation rows (#conversationsList).
 *
 * The previous pass modified `client/ui/MessagingUI.ts`, which targets
 * `#conversations-list` — an id that exists nowhere. The canonical renderer is
 * the page's own inline script writing into `#conversationsList`, so that is
 * what is exercised here: the page is rendered through Hono, its real script is
 * executed against a stubbed API, and the produced row markup is both asserted
 * and then driven through the real dispatcher.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { runInNewContext } from 'node:vm';
import app from '../../src/main';
import { createHarness, extractInlineScript } from '../helpers/dom-harness';
import { FakeD1 } from '../helpers/fake-d1';

const CONVERSATION = {
    id: 7,
    other_username: 'omar',
    other_display_name: 'Omar',
    other_avatar: 'https://img/omar.png',
    last_message: 'hi',
    unread_count: 2,
};

const settle = () => new Promise((r) => setTimeout(r, 5));

/** Minimal node used to re-shape the real row markup for dispatch. */
class RowNode {
    tag: string;
    attrs: Record<string, string>;
    parent: RowNode | null = null;
    style = { cssText: '' };
    classList = { add: () => undefined, remove: () => undefined, contains: () => false };
    children: RowNode[] = [];
    preventDefaultCount = 0;
    stopPropagationCount = 0;
    textContent = '';
    src = '';

    constructor(tag: string, attrs: Record<string, string> = {}) {
        this.tag = tag;
        this.attrs = attrs;
    }
    get tagName(): string { return this.tag.toUpperCase(); }
    get parentElement(): RowNode | null { return this.parent; }
    get parentNode(): RowNode | null { return this.parent; }
    getAttribute(n: string): string | null { return n in this.attrs ? this.attrs[n] : null; }
    hasAttribute(n: string): boolean { return n in this.attrs; }
    setAttribute(n: string, v: string): void { this.attrs[n] = v; }
    removeAttribute(n: string): void { delete this.attrs[n]; }
    appendChild(c: RowNode): RowNode { this.children.push(c); return c; }
    closest(selector: string): RowNode | null {
        const parts = [...selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)];
        if (!parts.length || !selector.startsWith('[')) return null;
        let cur: RowNode | null = this;
        while (cur) {
            if (parts.every(([, n, v]) => (v === undefined ? n in cur!.attrs : cur!.attrs[n] === v))) return cur;
            cur = cur.parent;
        }
        return null;
    }
}

/** Loads the real dispatcher and records what each click activated. */
async function driveDispatcher(clicks: RowNode[]) {
    const profiles: string[] = [];
    const conversations: string[] = [];
    const docListeners: Record<string, ((ev: unknown) => void)[]> = {};

    vi.stubGlobal('HTMLElement', RowNode);
    vi.stubGlobal('Element', RowNode);
    vi.stubGlobal('HTMLImageElement', class extends RowNode {});
    vi.stubGlobal('MutationObserver', class { observe() { return undefined; } });
    vi.stubGlobal('document', {
        addEventListener: (t: string, fn: (ev: unknown) => void) => { (docListeners[t] = docListeners[t] || []).push(fn); },
        querySelectorAll: () => [],
        documentElement: new RowNode('html'),
    });

    const locationStub = {
        search: '?lang=ar',
        assign: (u: string) => { if (u.startsWith('/profile/')) profiles.push(u.replace('/profile/', '').split('?')[0]); },
    };
    // The row's own handler, so we can prove which action a click activated.
    // The dispatcher resolves allowlisted names on `window`, so it must live there.
    const openConversation = (id: unknown) => { conversations.push(String(id)); };
    vi.stubGlobal('location', locationStub);
    vi.stubGlobal('window', { location: locationStub, openConversation });
    vi.stubGlobal('self', { location: locationStub });
    vi.stubGlobal('openConversation', openConversation);

    vi.resetModules();
    await import('../../src/client/csp-delegate');

    for (const target of clicks) {
        const ev = {
            type: 'click',
            target,
            key: undefined,
            preventDefault: () => { target.preventDefaultCount++; },
            stopPropagation: () => { target.stopPropagationCount++; },
        };
        for (const fn of docListeners.click || []) fn(ev);
    }
    return { profiles, conversations };
}

async function renderRows() {
    const html = await (await app.request('/messages?lang=ar', {}, { DB: new FakeD1() } as never)).text();
    const h = createHarness({ ids: ['conversationsList', 'chatHeader', 'noConversation', 'messagesArea', 'messageInput'] });

    const sandbox: Record<string, unknown> = {
        window: { ...h.window, currentUser: { id: 1 }, sessionId: 'sess' },
        document: h.document,
        console: { error: () => undefined, log: () => undefined },
        localStorage: { getItem: () => 'sess', setItem: () => undefined, removeItem: () => undefined },
        setTimeout,
        clearTimeout,
        URLSearchParams,
        checkAuth: async () => true,
        openConversation: () => undefined,
        loadMessages: async () => undefined,
        showLoginRequired: () => undefined,
        loadConversations: () => undefined,
        profilePathFor: (u: string) => `/profile/${u}?lang=ar`,
        renderUserAvatar: () => '',
        fetch: async () => ({
            ok: true,
            status: 200,
            json: async () => ({ success: true, data: { conversations: [CONVERSATION] } }),
        }),
    };
    sandbox.globalThis = sandbox;
    runInNewContext(extractInlineScript(html, 'conversationsList'), sandbox);

    h.fire('document', 'DOMContentLoaded');
    await settle();
    return { h, markup: h.el('conversationsList').innerHTML };
}

describe('B6 — messages page (#conversationsList) avatar', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('renders the row avatar as a profile-capable action', async () => {
        const { markup } = await renderRows();
        expect(markup).toContain('data-csp-fn="openConversation"');
        expect(markup).toContain('data-csp-fn="__navigateProfile"');
        expect(markup).toContain('["omar","@event"]');
        // The row itself still opens the conversation.
        expect(markup).toMatch(/data-csp-fn="openConversation"[^>]*data-csp-args='\[7,"omar"/);
    });

    it('never links a row avatar without a username', async () => {
        const html = await (await app.request('/messages?lang=ar', {}, { DB: new FakeD1() } as never)).text();
        const script = extractInlineScript(html, 'conversationsList');
        // The action lives only inside the `other_username ?` branch, so a blank
        // username can never produce a broken profile link.
        expect(script).toMatch(/conv\.other_username \? `<span role="link"/);
    });

    it('behaviour: the avatar goes to the profile, the rest of the row to the conversation', async () => {
        const { markup } = await renderRows();
        expect(markup).toContain('__navigateProfile');

        // Rebuild the row shape the page actually produced, then dispatch.
        const row = new RowNode('button', {
            'data-csp-on': 'click',
            'data-csp-fn': 'openConversation',
            'data-csp-args': '[7,"omar","https://img/omar.png"]',
        });
        const avatar = new RowNode('span', {
            'data-csp-on': 'click',
            'data-csp-fn': '__navigateProfile',
            'data-csp-args': '["omar","@event"]',
            'data-csp-stop': '1',
        });
        avatar.parent = row;
        const img = new RowNode('img', { src: CONVERSATION.other_avatar });
        img.parent = avatar;
        const text = new RowNode('p');
        text.parent = row;

        const nav = await driveDispatcher([img, avatar, text]);

        // Both avatar clicks -> profile; the row text -> conversation.
        expect(nav.profiles).toEqual(['omar', 'omar']);
        expect(nav.conversations).toHaveLength(1);
    });
});
