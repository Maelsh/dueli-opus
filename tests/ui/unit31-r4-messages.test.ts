/**
 * UNIT31 / R4-MESSAGES-1 — message journey defects M-01..M-05.
 *
 * Two layers:
 *  - static contract pins on the server-rendered `/messages` page, the model
 *    and the profile entry point;
 *  - runtime harness tests that execute the page's real inline script against
 *    a stubbed API (mobile panes, `?user=` resolution, composer/send truth,
 *    ordering, Enter/Shift+Enter/IME, double-submit, failed send).
 *
 * The persisted read-all HTTP contract lives in
 * tests/api/unit31-r4-messages-read-all.test.ts; `MessagesUI.markAllRead`
 * behaviour is exercised here because it is client code.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import app from '../../src/main';
import { FakeD1 } from '../helpers/fake-d1';
import { createHarness, extractInlineScript } from '../helpers/dom-harness';
import { ar } from '../../src/i18n/ar';
import { en } from '../../src/i18n/en';
import { ApiClient } from '../../src/client/core/ApiClient';
import { MessagesUI } from '../../src/client/ui/MessagesUI';

const PAGE = readFileSync(resolve(__dirname, '../../src/modules/pages/messages-page.ts'), 'utf-8');
const MODEL = readFileSync(resolve(__dirname, '../../src/models/MessageModel.ts'), 'utf-8');
const CONTROLLER = readFileSync(resolve(__dirname, '../../src/controllers/MessageController.ts'), 'utf-8');
const ROUTES = readFileSync(resolve(__dirname, '../../src/modules/api/messages/routes.ts'), 'utf-8');
const PROFILE = readFileSync(resolve(__dirname, '../../src/modules/pages/profile-page.ts'), 'utf-8');
const CSP = readFileSync(resolve(__dirname, '../../src/client/csp-delegate.ts'), 'utf-8');
const UI = readFileSync(resolve(__dirname, '../../src/client/ui/MessagesUI.ts'), 'utf-8');

const settle = (ms = 10) => new Promise((r) => setTimeout(r, ms));

interface Call {
    url: string;
    method: string;
    body?: any;
}

interface PageState {
    unread: number;
    conversations: any[];
    messages: any[];
    users: Record<string, any>;
    post?: (url: string, body: any) => any;
    readAll?: (body: any) => any;
}

function json(status: number, payload: any) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => payload,
    };
}

function makeRouter(state: PageState) {
    const calls: Call[] = [];
    const fetchStub = async (url: string, init: any = {}) => {
        const method = String(init.method || 'GET').toUpperCase();
        const body = init.body ? JSON.parse(init.body) : undefined;
        calls.push({ url, method, body });

        if (url === '/api/messages/unread') {
            return json(200, { success: true, data: { unread: state.unread } });
        }
        if (url === '/api/support/unread') {
            return json(200, { success: true, data: { unread: 0 } });
        }
        if (url.startsWith('/api/conversations?')) {
            return json(200, { success: true, data: { conversations: state.conversations } });
        }
        const conv = url.match(/^\/api\/conversations\/(\d+)\/messages$/);
        if (conv && method === 'GET') {
            return json(200, { success: true, data: { messages: state.messages } });
        }
        if (conv && method === 'POST') {
            const outcome = state.post ? await state.post(url, body) : json(500, { success: false, error: 'no post handler' });
            return outcome;
        }
        if (url === '/api/messages/read-all' && method === 'POST') {
            const outcome = state.readAll ? await state.readAll(body) : json(500, { success: false, error: 'no read-all handler' });
            return outcome;
        }
        if (url === '/api/support/threads') {
            return json(200, { success: true, data: { threads: [] } });
        }
        const user = url.match(/^\/api\/users\/([^/?]+)$/);
        if (user && method === 'GET') {
            const username = decodeURIComponent(user[1]);
            const profile = state.users[username];
            if (!profile) return json(404, { success: false, error: 'not found' });
            return json(200, { success: true, data: profile });
        }
        return json(404, { success: false, error: 'unexpected ' + method + ' ' + url });
    };
    return { fetchStub, calls };
}

async function mountPage(state: PageState, search = '?lang=en') {
    const html = await (await app.request(`/messages${search}`, {}, { DB: new FakeD1() } as never)).text();
    const script = extractInlineScript(html, 'conversationsList');
    const h = createHarness({
        ids: [
            'conversationsPane', 'chatPane', 'conversationsList',
            'supportThreadsPane', 'supportChatPane', 'supportThreadsList',
            'chatHeader', 'noConversation', 'messagesArea', 'messageInput',
            'supportChatHeader', 'noSupportThread', 'supportMessagesArea', 'supportMessageInput',
            'chatUserName', 'chatUserAvatar', 'chatUserLink', 'composerError',
            'sendMessageBtn', 'newMessage', 'messageForm',
            'personalUnreadBadge', 'adminUnreadBadge',
        ],
        currentUser: { id: 1 },
        search,
        sessionToken: 'sess',
    });
    const w = h.window as any;
    let lastUrl = `http://localhost/messages${search}`;
    w.location = {
        search,
        href: lastUrl,
        pathname: '/messages',
        assign: () => undefined,
    };
    w.history = {
        replaceState: (_state: unknown, _title: string, url: string) => {
            lastUrl = String(url);
            const parsed = new URL(lastUrl);
            w.location.href = lastUrl;
            w.location.search = parsed.search;
        },
    };
    for (const id of ['newMessage', 'supportSubject', 'supportFirstMessage', 'newSupportMessage']) {
        (h.el(id) as any).focus = () => undefined;
    }
    (h.el('chatUserLink') as any).removeAttribute = () => undefined;
    const linkAttrs: Record<string, string> = {};
    (h.el('chatUserLink') as any).setAttribute = (name: string, value: string) => { linkAttrs[name] = value; };
    (h.el('chatUserLink') as any).getAttribute = (name: string) => (name in linkAttrs ? linkAttrs[name] : null);
    (h.el('chatUserLink') as any).removeAttribute = (name: string) => { delete linkAttrs[name]; };
    (h.el('messagesArea') as any).scrollHeight = 0;

    const router = makeRouter(state);
    const sandbox: any = {
        window: w,
        document: h.document,
        console: { error: () => undefined, log: () => undefined, warn: () => undefined },
        localStorage: { getItem: () => 'sess', setItem: () => undefined, removeItem: () => undefined },
        fetch: router.fetchStub,
        setTimeout,
        clearTimeout,
        URL,
        URLSearchParams,
        checkAuth: async () => true,
        authStatus: () => 'authenticated',
        profilePathFor: (u: string) => `/profile/${u}?lang=en`,
    };
    sandbox.globalThis = sandbox;
    runInNewContext(script, sandbox);
    h.fire('document', 'DOMContentLoaded');
    await settle(20);
    return { h, sandbox, router, w, lastUrl: () => lastUrl };
}

const CONVERSATION = {
    id: 7,
    other_user_id: 9,
    other_username: 'sara',
    other_display_name: 'Sara Display',
    other_avatar: '',
    last_message: 'old preview',
    unread_count: 2,
};

describe('UNIT31 R4-MESSAGES-1 — M-01..M-05 static contract', () => {
    it('M-01: personal and admin panes each expose a mobile list/chat/back flow', () => {
        expect(PAGE).toContain('id="conversationsPane"');
        expect(PAGE).toContain('id="chatPane" class="hidden md:flex');
        expect(PAGE).toContain('id="supportThreadsPane"');
        expect(PAGE).toContain('id="supportChatPane" class="hidden md:flex');
        expect(PAGE).toContain('function showChatOnMobile()');
        expect(PAGE).toContain('function showListOnMobile()');
        expect(PAGE).toContain('function showSupportChatOnMobile()');
        expect(PAGE).toContain('function showSupportListOnMobile()');
        expect(PAGE).toContain('function backToConversations()');
        expect(PAGE).toContain('function backToSupportThreads()');
        expect(PAGE).toContain('data-csp-fn="backToConversations"');
        expect(PAGE).toContain('data-csp-fn="backToSupportThreads"');
        expect(PAGE).toContain('md:hidden');
        expect(CSP).toContain("'backToConversations'");
        expect(CSP).toContain("'backToSupportThreads'");
    });

    it('M-02: profile entry uses username, display_name falls back to username, never #id', () => {
        // Profile page links by username (encoded), not by numeric id.
        expect(PROFILE).toContain('messages?user=\\${encodeURIComponent(profileUsername)}');
        expect(PROFILE).not.toMatch(/\?user=\$\{profile\.id\}/);
        // Page resolves an existing conversation by username first.
        expect(PAGE).toContain("String(item.other_username || '').toLowerCase() === requestedLower");
        // Display name always has the username fallback.
        expect(PAGE).toContain('profile.display_name || username');
        expect(PAGE).toContain('cached.other_display_name');
        expect(PAGE).toContain('conv.other_display_name || conv.other_username');
        // A numeric legacy id is never rendered as a person's name.
        expect(PAGE).toContain('New conversation');
        expect(PAGE).toContain("numeric ? '' : requested");
    });

    it('M-03: previews/badges are refreshed from the API, not fabricated', () => {
        expect(PAGE).toContain('function refreshMessageSurfaces()');
        expect(PAGE).toContain('await refreshMessageSurfaces();');
        expect(PAGE).toContain("window.MessagesUI.loadUnreadCount");
        expect(PAGE).toContain("window.MessagesUI.loadMessages");
        expect(PAGE).toContain('showMessagesError');
        expect(PAGE).toContain('role="alert"');
        // Failed unread calls keep the last authoritative number.
        expect(PAGE).toContain('typeof pData.data?.unread ===');
        expect(UI).toContain("ApiClient.post('/api/messages/read-all'");
        expect(UI).not.toContain('this.unreadCount = 0;');
        expect(UI).toContain("'dueli:messages-read-all'");
        expect(ROUTES).toContain("messagesRoutes.post('/messages/read-all'");
        expect(CONTROLLER).toContain('markAllAsRead');
        expect(MODEL).toContain('markAllAsRead');
    });

    it('M-04: composer sends by form/Enter, preserves Shift+Enter and IME, keeps order', () => {
        expect(PAGE).toContain('id="messageForm"');
        expect(PAGE).toContain('data-csp-fn="sendMessage"');
        expect(PAGE).toContain('id="sendMessageBtn"');
        expect(PAGE).toContain('id="composerError"');
        expect(PAGE).toContain('data-csp-fn="handleComposerKeydown"');
        expect(PAGE).toContain("e.key !== 'Enter' || e.shiftKey");
        expect(PAGE).toContain('e.isComposing || e.keyCode === 229');
        expect(PAGE).toContain('requestSubmit');
        expect(PAGE).toContain('if (isSending) return;');
        expect(PAGE).toContain('removePendingMessage(localId)');
        expect(PAGE).toContain('showComposerError');
        expect(PAGE).toContain('input.value = content');
        expect(PAGE).toContain('loadedMessages.sort');
        expect(CSP).toContain("'handleComposerKeydown'");
        // Model selects the newest page but returns it oldest-first.
        expect(MODEL).toContain('ORDER BY m.created_at DESC, m.id DESC');
        expect(MODEL).toContain('.reverse()');
    });

    it('M-05: mark-all-read is authenticated, receiver-scoped and persisted', () => {
        expect(ROUTES).toMatch(/messagesRoutes\.post\('\/messages\/read-all', authMiddleware\(\{ required: true \}\)/);
        expect(CONTROLLER).toContain('this.requireAuth(c)');
        expect(MODEL).toMatch(/UPDATE \$\{this\.tableName\}[\s\S]*?SET is_read = 1, read_at = \?[\s\S]*?WHERE receiver_id = \? AND is_read = 0/);
        expect(UI).toContain('response.success !== true');
        // The admin support storage stays separate.
        expect(MODEL).not.toContain('support_messages');
    });

    it('i18n keys exist in ar+en and differ', () => {
        const a = ar as any;
        const e = en as any;
        for (const key of ['back_to_conversations', 'back_to_admin_messages', 'send', 'send_failed', 'sending', 'composer_hint', 'new_conversation', 'load_failed']) {
            expect(a.messages?.[key], `ar.messages.${key}`).toBeTruthy();
            expect(e.messages?.[key], `en.messages.${key}`).toBeTruthy();
            expect(a.messages[key], `ar/en ${key}`).not.toBe(e.messages[key]);
        }
    });
});

describe('UNIT31 R4-MESSAGES-1 — M-01 mobile panes (runtime)', () => {
    it('switches personal and admin panes one at a time and back', async () => {
        const { h, sandbox, lastUrl } = await mountPage({ unread: 0, conversations: [], messages: [], users: {} });

        sandbox.showChatOnMobile();
        expect(h.el('conversationsPane').classList.contains('hidden')).toBe(true);
        expect(h.el('chatPane').classList.contains('hidden')).toBe(false);
        expect(h.el('chatPane').classList.contains('flex')).toBe(true);

        sandbox.showListOnMobile();
        expect(h.el('conversationsPane').classList.contains('hidden')).toBe(false);
        expect(h.el('chatPane').classList.contains('hidden')).toBe(true);

        sandbox.showSupportChatOnMobile();
        expect(h.el('supportThreadsPane').classList.contains('hidden')).toBe(true);
        expect(h.el('supportChatPane').classList.contains('hidden')).toBe(false);

        sandbox.showSupportListOnMobile();
        expect(h.el('supportThreadsPane').classList.contains('hidden')).toBe(false);
        expect(h.el('supportChatPane').classList.contains('hidden')).toBe(true);

        h.el('chatHeader').classList.remove('hidden');
        h.el('messagesArea').classList.remove('hidden');
        h.el('messageInput').classList.remove('hidden');
        sandbox.backToConversations();
        expect(h.el('chatHeader').classList.contains('hidden')).toBe(true);
        expect(h.el('messagesArea').classList.contains('hidden')).toBe(true);
        expect(h.el('messageInput').classList.contains('hidden')).toBe(true);
        expect(h.el('noConversation').classList.contains('hidden')).toBe(false);
        expect(lastUrl()).not.toContain('conversation=');
        expect(lastUrl()).not.toContain('user=');

        h.el('supportChatHeader').classList.remove('hidden');
        sandbox.backToSupportThreads();
        expect(h.el('supportChatHeader').classList.contains('hidden')).toBe(true);
        expect(h.el('supportChatPane').classList.contains('hidden')).toBe(true);
        expect(h.el('supportThreadsPane').classList.contains('hidden')).toBe(false);
    });
});

describe('UNIT31 R4-MESSAGES-1 — M-02 ?user= resolution (runtime)', () => {
    it('opens the existing conversation and shows display_name', async () => {
        const { h, sandbox } = await mountPage({
            unread: 0,
            conversations: [CONVERSATION],
            messages: [{ id: 1, conversation_id: 7, sender_id: 9, content: 'hi', created_at: '2026-10-26T09:00:00Z' }],
            users: {},
        });

        await sandbox.openPendingUserChat('sara');
        await settle();

        expect(h.el('chatUserName').textContent).toBe('Sara Display');
        expect(h.el('chatUserLink').getAttribute('href')).toBe('/profile/sara?lang=en');
        expect(h.el('chatPane').classList.contains('hidden')).toBe(false);
        expect(h.el('messagesArea').innerHTML).toContain('hi');
    });

    it('falls back to the username, then to a named compose state — never #id', async () => {
        const { h, sandbox, router } = await mountPage({
            unread: 0,
            conversations: [
                { id: 8, other_user_id: 10, other_username: 'max', other_display_name: '', last_message: '', unread_count: 0 },
            ],
            messages: [],
            users: {
                noor: { id: 11, username: 'noor', display_name: null, avatar_url: null },
            },
        });

        await sandbox.openPendingUserChat('max');
        await settle();
        expect(h.el('chatUserName').textContent).toBe('max');

        await sandbox.openPendingUserChat('noor');
        await settle();
        expect(h.el('chatUserName').textContent).toBe('noor');
        expect(h.el('chatUserName').textContent).not.toContain('#');
        expect(h.el('messageInput').classList.contains('hidden')).toBe(false);
        expect(router.calls.some((c) => c.url === '/api/users/noor')).toBe(true);

        const before = router.calls.length;
        await sandbox.openPendingUserChat('424242');
        await settle();
        expect(h.el('chatUserName').textContent).toBe('New conversation');
        expect(h.el('chatUserName').textContent).not.toContain('424242');
        expect(router.calls.length).toBe(before);
        expect(router.calls.some((c) => c.url === '/api/users/424242')).toBe(false);
    });
});

describe('UNIT31 R4-MESSAGES-1 — M-03/M-04 composer + refresh (runtime)', () => {
    it('shows a sent message in order and refreshes previews/badge after send', async () => {
        const state: PageState = {
            unread: 2,
            conversations: [{ ...CONVERSATION }],
            messages: [
                { id: 2, conversation_id: 7, sender_id: 9, content: 'first', created_at: '2026-10-26T09:00:00Z' },
                { id: 3, conversation_id: 7, sender_id: 9, content: 'second', created_at: '2026-10-26T09:05:00Z' },
            ],
            users: {},
        };
        state.post = async (url, body) => {
            if (!url.endsWith('/7/messages')) return json(500, { success: false });
            state.unread = 0;
            state.conversations = [{ ...CONVERSATION, last_message: body.content, unread_count: 0 }];
            state.messages = [
                ...state.messages,
                { id: 101, conversation_id: 7, sender_id: 1, content: body.content, created_at: '2026-10-26T09:10:00Z' },
            ];
            return json(200, {
                success: true,
                data: {
                    message: { id: 101, conversation_id: 7, sender_id: 1, content: body.content, created_at: '2026-10-26T09:10:00Z' },
                },
            });
        };
        const { h, sandbox } = await mountPage(state);

        // Opening a thread marks it read server-side; the stub reflects that.
        state.unread = 0;
        await sandbox.openPendingUserChat('sara');
        await settle();
        expect(h.el('personalUnreadBadge').classList.contains('hidden')).toBe(true);

        // Make the badge stale again so the post-send refresh is observable.
        state.unread = 2;
        await sandbox.loadUnreadCounts();
        expect(h.el('personalUnreadBadge').textContent).toBe('2');
        expect(h.el('personalUnreadBadge').classList.contains('hidden')).toBe(false);

        h.el('newMessage').value = 'third from me';
        await sandbox.sendMessage();
        await settle(20);

        const html = h.el('messagesArea').innerHTML;
        expect(html).toContain('first');
        expect(html).toContain('second');
        expect(html).toContain('third from me');
        expect(html.indexOf('first')).toBeLessThan(html.indexOf('second'));
        expect(html.indexOf('second')).toBeLessThan(html.indexOf('third from me'));
        expect(html).not.toContain('Sending...');

        expect(h.el('personalUnreadBadge').classList.contains('hidden')).toBe(true);
        expect(h.el('conversationsList').innerHTML).toContain('third from me');
        expect(h.el('newMessage').value).toBe('');
    });

    it('guards Enter vs Shift+Enter vs IME and prevents double submit', async () => {
        let posts = 0;
        let release: (value: any) => void = () => undefined;
        const gate = new Promise((resolveGate) => { release = resolveGate; });
        const state: PageState = {
            unread: 0,
            conversations: [{ ...CONVERSATION }],
            messages: [],
            users: {},
        };
        state.post = async () => {
            posts += 1;
            return gate;
        };
        const { h, sandbox } = await mountPage(state);
        await sandbox.openPendingUserChat('sara');
        await settle();

        let submits = 0;
        let prevented = 0;
        (h.el('messageForm') as any).requestSubmit = () => { submits += 1; };
        const key = (overrides: Record<string, unknown>) => ({
            key: 'Enter',
            shiftKey: false,
            isComposing: false,
            keyCode: 13,
            preventDefault: () => { prevented += 1; },
            ...overrides,
        });

        sandbox.handleComposerKeydown(key({ shiftKey: true }));
        expect(submits).toBe(0);
        sandbox.handleComposerKeydown(key({ isComposing: true }));
        expect(submits).toBe(0);
        sandbox.handleComposerKeydown(key({ keyCode: 229 }));
        expect(submits).toBe(0);
        sandbox.handleComposerKeydown(key({}));
        expect(submits).toBe(1);
        expect(prevented).toBe(1);

        // Double submit: the second call must not produce a second POST.
        h.el('newMessage').value = 'only once';
        const first = sandbox.sendMessage();
        const second = sandbox.sendMessage();
        await settle();
        expect(posts).toBe(1);
        release(json(200, {
            success: true,
            data: { message: { id: 55, conversation_id: 7, sender_id: 1, content: 'only once', created_at: '2026-10-26T10:00:00Z' } },
        }));
        await Promise.all([first, second]);
        await settle();
        expect(posts).toBe(1);
        expect(h.el('messagesArea').innerHTML).toContain('only once');
    });

    it('keeps failed sends truthful: input restored, error shown, no fake bubble', async () => {
        const state: PageState = {
            unread: 0,
            conversations: [{ ...CONVERSATION }],
            messages: [],
            users: {},
        };
        state.post = async () => json(403, { success: false, error: 'blocked by this user' });
        const { h, sandbox } = await mountPage(state);
        await sandbox.openPendingUserChat('sara');
        await settle();

        h.el('newMessage').value = 'will fail';
        await sandbox.sendMessage();
        await settle();

        expect(h.el('newMessage').value).toBe('will fail');
        expect(h.el('composerError').textContent).toBe('blocked by this user');
        expect(h.el('composerError').classList.contains('hidden')).toBe(false);
        expect(h.el('messagesArea').innerHTML).not.toContain('will fail');
        expect(h.el('sendMessageBtn').disabled).toBe(false);
    });

    it('refreshes page surfaces when the header mark-all-read event fires', async () => {
        const state: PageState = {
            unread: 2,
            conversations: [{ ...CONVERSATION }],
            messages: [],
            users: {},
        };
        const { h, sandbox } = await mountPage(state);
        expect(h.el('personalUnreadBadge').textContent).toBe('2');

        state.unread = 0;
        state.conversations = [{ ...CONVERSATION, last_message: 'read now', unread_count: 0 }];
        h.fire('window', 'dueli:messages-read-all');
        await settle(20);

        expect(h.el('personalUnreadBadge').classList.contains('hidden')).toBe(true);
        expect(h.el('conversationsList').innerHTML).toContain('read now');
    });
});

describe('UNIT31 R4-MESSAGES-1 — MessagesUI.markAllRead', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('POSTs read-all, refreshes both surfaces and announces the change', async () => {
        const dispatch = vi.fn();
        vi.stubGlobal('window', { dispatchEvent: dispatch });
        vi.stubGlobal('CustomEvent', class {
            type: string;
            detail: any;
            constructor(type: string, init?: any) { this.type = type; this.detail = init?.detail; }
        });
        const post = vi.spyOn(ApiClient, 'post').mockResolvedValue({ success: true, data: { updated: 3 } } as any);
        const unread = vi.spyOn(MessagesUI, 'loadUnreadCount').mockResolvedValue(undefined);
        const list = vi.spyOn(MessagesUI, 'loadMessages').mockResolvedValue(undefined);

        await MessagesUI.markAllRead();

        expect(post).toHaveBeenCalledWith('/api/messages/read-all', {});
        expect(unread).toHaveBeenCalledTimes(1);
        expect(list).toHaveBeenCalledTimes(1);
        expect(dispatch).toHaveBeenCalledTimes(1);
        expect(dispatch.mock.calls[0][0].type).toBe('dueli:messages-read-all');
        expect(dispatch.mock.calls[0][0].detail).toEqual({ updated: 3 });
    });

    it('changes nothing when the server rejects the operation', async () => {
        const dispatch = vi.fn();
        vi.stubGlobal('window', { dispatchEvent: dispatch });
        vi.stubGlobal('CustomEvent', class {
            type: string;
            constructor(type: string) { this.type = type; }
        });
        vi.spyOn(ApiClient, 'post').mockResolvedValue({ success: false, error: 'denied' } as any);
        const unread = vi.spyOn(MessagesUI, 'loadUnreadCount').mockResolvedValue(undefined);
        const list = vi.spyOn(MessagesUI, 'loadMessages').mockResolvedValue(undefined);
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        await MessagesUI.markAllRead();

        expect(unread).not.toHaveBeenCalled();
        expect(list).not.toHaveBeenCalled();
        expect(dispatch).not.toHaveBeenCalled();
        expect(consoleError).toHaveBeenCalled();
    });
});
