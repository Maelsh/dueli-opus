/**
 * PR #66 blocker remediation — B1/B2/B3 targeted regression tests.
 * B1: header messages menu uses GET /api/conversations (real contract),
 * never /api/messages/unread-list; network failure distinct from empty.
 * B2: SseService never assumes window.addEventListener exists.
 * B3: one deferred listener; disconnect invalidates stale deferred connect.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MessagesUI } from '../../src/client/ui/MessagesUI';
import { SseService } from '../../src/client/services/SseService';
import { ApiClient } from '../../src/client/core/ApiClient';
import { State } from '../../src/client/core/State';

const root = resolve(__dirname, '../..');

class MockClassList {
    private classes = new Set<string>();
    constructor(initialClasses: string[] = []) {
        initialClasses.forEach(c => this.classes.add(c));
    }
    add(...t: string[]) { t.forEach(x => this.classes.add(x)); }
    remove(...t: string[]) { t.forEach(x => this.classes.delete(x)); }
    toggle(token: string, force?: boolean): boolean {
        if (force === true) { this.classes.add(token); return true; }
        if (force === false) { this.classes.delete(token); return false; }
        if (this.classes.has(token)) { this.classes.delete(token); return false; }
        this.classes.add(token); return true;
    }
    contains(token: string): boolean { return this.classes.has(token); }
}
class MockElement {
    id: string; tagName: string; classList: MockClassList;
    innerHTML = ''; textContent = '';
    constructor(tagName: string, id = '', initialClasses: string[] = []) {
        this.tagName = tagName.toUpperCase(); this.id = id;
        this.classList = new MockClassList(initialClasses);
    }
}
const docElements = new Map<string, MockElement>();
const CONV_ROW = {
    id: 7, user1_id: 9, user2_id: 2, last_message_at: null,
    created_at: '2026-09-20T10:00:00.000Z', other_user_id: 2,
    other_username: 'eng_alaa', other_display_name: 'Eng Alaa',
    other_avatar: null, last_message: 'مرحبا بك', unread_count: 2,
};
function stubBrowser(readyState = 'complete') {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => { store.set(k, v); },
        removeItem: (k: string) => { store.delete(k); },
        clear: () => store.clear(),
    };
    (globalThis as any).document = {
        cookie: '', readyState,
        getElementById: (id: string) => docElements.get(id) ?? null,
    };
    return store;
}


describe('PR66 B1B2B3', () => {
    beforeEach(() => {
        docElements.clear();
        stubBrowser();
        State.currentUser = { id: 1 } as any;
        State.sessionId = 'sess-abc';
        vi.restoreAllMocks();
        SseService.disconnect();
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        SseService.disconnect();
    });
    it('B1 renders conversations', async () => {
        const listEl = new MockElement('DIV', 'messagesList');
        docElements.set('messagesList', listEl);
        const getSpy = vi.spyOn(ApiClient, 'get').mockResolvedValue({
            success: true, data: { conversations: [CONV_ROW] },
        } as any);
        await MessagesUI.loadMessages();
        expect(getSpy).toHaveBeenCalledWith(expect.stringContaining('/api/conversations'));
        expect(listEl.innerHTML).toContain('Eng Alaa');
        expect(listEl.innerHTML).toContain('/messages?conversation=7');
    });
    it('B1 no unread-list', async () => {
        const listEl = new MockElement('DIV', 'messagesList');
        docElements.set('messagesList', listEl);
        const getSpy = vi.spyOn(ApiClient, 'get').mockResolvedValue({
            success: true, data: { conversations: [] },
        } as any);
        await MessagesUI.loadMessages();
        expect(getSpy.mock.calls.some(([u]) => String(u).includes('unread-list'))).toBe(false);
        const src = readFileSync(resolve(root, 'src/client/ui/MessagesUI.ts'), 'utf-8');
        expect(src).not.toContain('unread-list');
    });
    it('B1 failure vs empty', async () => {
        const listEl = new MockElement('DIV', 'messagesList');
        docElements.set('messagesList', listEl);
        vi.spyOn(ApiClient, 'get').mockRejectedValueOnce(new Error('down'));
        await MessagesUI.loadMessages();
        expect(listEl.innerHTML).toContain('data-messages-state="error"');
        vi.spyOn(ApiClient, 'get').mockResolvedValueOnce({ success: false, data: {} } as any);
        await MessagesUI.loadMessages();
        expect(listEl.innerHTML).toContain('data-messages-state="empty"');
    });
    it('B2 partial window', () => {
        (globalThis as any).window = {};
        (globalThis as any).document = { getElementById: () => null, readyState: 'loading' };
        vi.stubGlobal('fetch', vi.fn(async () => new Response(
            JSON.stringify({ success: false, data: {} }), { status: 200 })));
        expect(() => SseService.connect()).not.toThrow();
    });
    it('B3 single connection', async () => {
        const listeners = new Map<string, Array<() => void>>();
        const addEventListener = vi.fn((ev: string, cb: () => void) => {
            const arr = listeners.get(ev) ?? [];
            arr.push(cb); listeners.set(ev, arr);
        });
        (globalThis as any).window = { addEventListener };
        (globalThis as any).document = { getElementById: () => null, readyState: 'loading' };
        vi.stubGlobal('fetch', vi.fn(async () => new Response(
            JSON.stringify({ success: true, data: { ticket: 't1' } }), { status: 200 })));
        const sources: Array<unknown> = [];
        vi.stubGlobal('EventSource', vi.fn(function (this: unknown) {
            const h = { close: vi.fn(), addEventListener: vi.fn() };
            sources.push(h); return h;
        } as any));
        SseService.connect(); SseService.connect(); SseService.connect();
        expect(addEventListener).toHaveBeenCalledTimes(1);
        for (const cb of listeners.get('load') ?? []) cb();
        await new Promise(r => setTimeout(r, 0));
        expect(sources.length).toBe(1);
    });
    it('B3 disconnect cancels', async () => {
        const listeners = new Map<string, Array<() => void>>();
        (globalThis as any).window = {
            addEventListener: vi.fn((ev: string, cb: () => void) => {
                const arr = listeners.get(ev) ?? [];
                arr.push(cb); listeners.set(ev, arr);
            }),
        };
        (globalThis as any).document = { getElementById: () => null, readyState: 'loading' };
        const fetchMock = vi.fn(async () => new Response(
            JSON.stringify({ success: true, data: { ticket: 't1' } }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        vi.stubGlobal('EventSource', vi.fn(function (this: unknown) {
            return { close: vi.fn() };
        } as any));
        SseService.connect();
        SseService.disconnect();
        for (const cb of listeners.get('load') ?? []) cb();
        await new Promise(r => setTimeout(r, 0));
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
