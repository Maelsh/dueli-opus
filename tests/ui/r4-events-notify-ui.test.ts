/**
 * R4-EVENTS-NOTIFY-1 — client-side pins (dropdown + dispatcher + realtime).
 *
 * RED-FIRST: on BASE these FAIL because —
 *   1. csp-delegate invokes `NotificationsUI.handleNotificationClick` /
 *      `toggleStar` with `this === undefined` (receiver dropped), so the
 *      dropdown click throws inside the dispatcher and nothing happens;
 *   2. concurrent loadNotifications() calls race duplicate GETs (no
 *      single-flight), and every SSE replay re-fires its toast;
 *   3. the dropdown renders `notification.no_notifications` (a key that does
 *      not exist in ar/en) with no loading/empty distinction, and the star
 *      button carries a hardcoded English title with no aria-label.
 *
 * The real client modules run here in node with stubbed DOM/network globals
 * (no new dependencies); the real csp-delegate source is transpiled with the
 * project's own typescript and executed in a vm sandbox.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import * as ts from 'typescript';
import { NotificationsUI } from '../../src/client/ui/NotificationsUI';
import { State } from '../../src/client/core/State';
import { SseService } from '../../src/client/services/SseService';
import { Toast } from '../../src/client/ui/Toast';
import { t } from '../../src/i18n';

type FetchFn = (url: string, opts?: any) => Promise<{ json: () => Promise<any> }>;

/* ---------- stub DOM/network ---------- */

interface StubEl {
    innerHTML: string;
    textContent: string;
    classes: Set<string>;
    classList: { add: (...c: string[]) => void; remove: (...c: string[]) => void; toggle: (c: string, f?: boolean) => boolean; contains: (c: string) => boolean };
}

function makeEl(): StubEl {
    const classes = new Set<string>();
    return {
        innerHTML: '',
        textContent: '',
        classes,
        classList: {
            add: (...c) => c.forEach((x) => x && classes.add(x)),
            remove: (...c) => c.forEach((x) => classes.delete(x)),
            toggle: (c, force) => {
                const next = force === undefined ? !classes.has(c) : !!force;
                if (next) classes.add(c);
                else classes.delete(c);
                return next;
            },
            contains: (c) => classes.has(c),
        },
    };
}

const els: Record<string, StubEl> = {};
let fetchImpl: FetchFn = async () => ({ json: async () => ({ success: false }) });
const fetchCalls: { url: string; opts?: any }[] = [];
let locationHref = '';

function installStubs(): void {
    for (const k of Object.keys(els)) delete els[k];
    els['notificationBadge'] = makeEl();
    els['notificationsList'] = makeEl();
    els['notificationsDropdown'] = makeEl();
    fetchCalls.length = 0;
    locationHref = '';
    (globalThis as any).document = {
        getElementById: (id: string) => els[id] ?? null,
    };
    (globalThis as any).window = {
        location: {
            get href() {
                return locationHref;
            },
            set href(v: string) {
                locationHref = v;
            },
        },
    };
    (globalThis as any).localStorage = {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
    };
    (globalThis as any).fetch = async (url: string, opts?: any) => {
        fetchCalls.push({ url: String(url), opts });
        return fetchImpl(String(url), opts);
    };
    State.currentUser = { id: 81 } as any;
    State.sessionId = 'sess-x';
    State.lang = 'en';
    const ui = NotificationsUI as any;
    ui.notifications = [];
    ui.unreadCount = 0;
    ui.loaderPromise = null;
    ui.refreshQueued = false;
    ui.loaded = false;
}

function removeStubs(): void {
    delete (globalThis as any).document;
    delete (globalThis as any).window;
    delete (globalThis as any).localStorage;
    State.currentUser = null;
    State.sessionId = null;
}

const ok = (data: any = {}) => ({ json: async () => ({ success: true, data }) });

/* ---------- csp-delegate in a vm sandbox ---------- */

function loadDelegate(): { sandbox: any; clicks: ((ev: any) => void)[] } {
    const src = readFileSync(join(process.cwd(), 'src', 'client', 'csp-delegate.ts'), 'utf8');
    const js = ts.transpileModule(src, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const clicks: ((ev: any) => void)[] = [];
    const errors: ((ev: any) => void)[] = [];
    class HTMLElement {}
    const sandbox: any = {
        window: {} as any,
        console: { error: () => undefined, log: () => undefined },
        HTMLElement,
        MutationObserver: class {
            observe() {
                /* noop */
            }
        },
        document: {
            addEventListener: (type: string, fn: (ev: any) => void) => {
                if (type === 'click' || type === 'keydown') clicks.push(fn);
                if (type === 'error') errors.push(fn);
            },
            querySelectorAll: () => [],
            documentElement: {},
        },
    };
    sandbox.globalThis = sandbox;
    sandbox.self = sandbox.window;
    runInNewContext(js, sandbox);
    return { sandbox, clicks };
}

function stubActionEl(sandbox: any, attrs: Record<string, string>, parent: any = null): any {
    // findAction requires getAttribute + `instanceof HTMLElement`, like real DOM nodes.
    const el = Object.assign(new sandbox.HTMLElement(), {
        getAttribute: (n: string) => attrs[n] ?? null,
        hasAttribute: (n: string) => n in attrs,
        parentElement: parent,
        parentNode: parent,
        tagName: 'DIV',
    });
    return el;
}

/* ================= tests ================= */

describe('R4-EVENTS-NOTIFY-1 — N-01 CSP dispatcher keeps the receiver', () => {
    it('dotted handlers run with their owning object as `this`', () => {
        const { sandbox, clicks } = loadDelegate();
        expect(clicks.length, 'click listener installed').toBeGreaterThan(0);
        const seen: { name: string; receiverOk: boolean; arg: unknown }[] = [];
        sandbox.window.NotificationsUI = {
            handleNotificationClick(id: unknown) {
                seen.push({ name: 'click', receiverOk: (this as any) === sandbox.window.NotificationsUI, arg: id });
            },
            async toggleStar(id: unknown) {
                seen.push({ name: 'star', receiverOk: (this as any) === sandbox.window.NotificationsUI, arg: id });
            },
        };
        const row = stubActionEl(sandbox, {
            'data-csp-on': 'click',
            'data-csp-fn': 'NotificationsUI.handleNotificationClick',
            'data-csp-args': '[42]',
        });
        const stopped: string[] = [];
        clicks[0]({ type: 'click', target: row, stopPropagation: () => stopped.push('x') });
        expect(seen).toEqual([{ name: 'click', receiverOk: true, arg: 42 }]);

        // Inner star button: nearest action wins, stop propagates centrally.
        const star = stubActionEl(
            sandbox,
            {
                'data-csp-on': 'click',
                'data-csp-fn': 'NotificationsUI.toggleStar',
                'data-csp-args': '[7]',
                'data-csp-stop': '1',
            },
            row
        );
        const icon = stubActionEl(sandbox, {}, star);
        clicks[0]({ type: 'click', target: icon, stopPropagation: () => stopped.push('y') });
        expect(seen[1]).toEqual({ name: 'star', receiverOk: true, arg: 7 });
        expect(stopped).toEqual(['y']);
    });

    it('unknown names stay dead (allowlist preserved) and plain globals keep window', () => {
        const { sandbox, clicks } = loadDelegate();
        let evil = 0;
        let plainReceiver: unknown = null;
        sandbox.window.Evil = { x: () => evil++ };
        // backToList is a real allowlisted plain-global name.
        sandbox.window.backToList = function (this: unknown) {
            plainReceiver = this;
        };
        clicks[0]({
            type: 'click',
            target: stubActionEl(sandbox, { 'data-csp-on': 'click', 'data-csp-fn': 'Evil.x', 'data-csp-args': '[]' }),
            stopPropagation: () => undefined,
        });
        expect(evil, 'non-allowlisted fn ignored').toBe(0);
        clicks[0]({
            type: 'click',
            target: stubActionEl(sandbox, { 'data-csp-on': 'click', 'data-csp-fn': 'backToList', 'data-csp-args': '[]' }),
            stopPropagation: () => undefined,
        });
        expect(plainReceiver, 'plain global receiver is window').toBe(sandbox.window);
    });
});

describe('R4-EVENTS-NOTIFY-1 — dropdown load/read/badge (N-02/N-06/M-4/M-5)', () => {
    beforeEach(installStubs);
    afterEach(removeStubs);

    it('concurrent burst costs one follow-up, never one GET per caller (N-06/P2)', async () => {
        let gets = 0;
        fetchImpl = async (url) => {
            if (url === '/api/notifications') {
                gets++;
                await new Promise((r) => setTimeout(r, 20));
                return ok({ notifications: [], unreadCount: 0 });
            }
            return ok();
        };
        await Promise.all([
            NotificationsUI.loadNotifications(),
            NotificationsUI.loadNotifications(),
            NotificationsUI.loadNotifications(),
            NotificationsUI.loadNotifications(),
        ]);
        // Initial fetch + exactly one follow-up covering the whole burst
        // (demand raised mid-flight must not be swallowed by a stale reply).
        expect(gets).toBe(2);
        expect((NotificationsUI as any).loaded).toBe(true);
    });

    it('SSE demand raised mid-GET is covered by a later fetch (no lost update)', async () => {
        const starts: string[] = [];
        let releaseFirst!: (body: any) => void;
        const bodies = [
            { notifications: [{ id: 1, type: 'system', message: 'old', is_read: false, created_at: new Date().toISOString() }], unreadCount: 1 },
            { notifications: [{ id: 2, type: 'system', message: 'new', is_read: false, created_at: new Date().toISOString() }], unreadCount: 1 },
        ];
        fetchImpl = (url) => {
            if (url !== '/api/notifications') return Promise.resolve(ok());
            const n = starts.length;
            starts.push(`fetch${n}`);
            if (n === 0) {
                return new Promise((resolve) => {
                    releaseFirst = (body: any) => resolve(ok(body));
                });
            }
            return Promise.resolve(ok(bodies[1]));
        };
        const first = NotificationsUI.loadNotifications();
        await new Promise((r) => setTimeout(r, 10)); // fetch#1 in flight
        const second = NotificationsUI.loadNotifications(); // SSE-equivalent demand mid-GET
        releaseFirst(bodies[0]); // stale reply lands
        await Promise.all([first, second]);
        // Drain the follow-up fetch it must have triggered.
        for (let i = 0; i < 50 && starts.length < 2; i++) {
            await new Promise((r) => setTimeout(r, 10));
        }
        expect(starts).toEqual(['fetch0', 'fetch1']);
        expect((NotificationsUI as any).notifications.map((n: any) => n.id)).toEqual([2]);
    });

    it('open dropdown repaints when the fetch completes (no stuck spinner)', async () => {
        // Dropdown open (no `hidden`), list never loaded yet.
        NotificationsUI.renderList();
        expect(els['notificationsList'].innerHTML).toContain(t('loading', 'en'));
        fetchImpl = async () => ok({
            notifications: [{ id: 3, type: 'system', message: 'hello', is_read: false, created_at: new Date().toISOString() }],
            unreadCount: 1,
        });
        await NotificationsUI.loadNotifications();
        const html = els['notificationsList'].innerHTML;
        expect(html).toContain('hello');
        expect(html).not.toContain('fa-spin');
    });

    it('closed dropdown is left untouched by background refresh', async () => {
        els['notificationsDropdown'].classList.add('hidden');
        els['notificationsList'].innerHTML = 'MARKER';
        fetchImpl = async () => ok({ notifications: [], unreadCount: 0 });
        await NotificationsUI.loadNotifications();
        // No repaint while closed; next open repaints via toggle → renderList.
        expect(els['notificationsList'].innerHTML).toBe('MARKER');
        expect((NotificationsUI as any).loaded).toBe(true);
        NotificationsUI.renderList();
        expect(els['notificationsList'].innerHTML).toContain(t('no_notifications', 'en'));
    });

    it('failed fetch never clobbers the previous list', async () => {
        const ui = NotificationsUI as any;
        ui.loaded = true;
        ui.notifications = [
            { id: 4, type: 'system', message: 'kept', is_read: true, created_at: new Date().toISOString() },
        ];
        NotificationsUI.renderList();
        expect(els['notificationsList'].innerHTML).toContain('kept');
        fetchImpl = async () => {
            throw new Error('down');
        };
        await NotificationsUI.loadNotifications();
        expect(els['notificationsList'].innerHTML).toContain('kept');
        expect(ui.notifications.map((n: any) => n.id)).toEqual([4]);
    });

    it('loading vs empty are distinct and honest in ar/en (M-5)', async () => {
        State.lang = 'ar';
        NotificationsUI.renderList();
        expect(els['notificationsList'].innerHTML).toContain(t('loading', 'ar'));
        fetchImpl = async () => ok({ notifications: [], unreadCount: 0 });
        await NotificationsUI.loadNotifications();
        // Production re-renders on toggle/open after the load settles.
        NotificationsUI.renderList();
        const html = els['notificationsList'].innerHTML;
        expect(html).toContain(t('no_notifications', 'ar'));
        expect(html).not.toContain('notification.no_notifications');
        expect(html).not.toContain(t('loading', 'ar'));

        State.lang = 'en';
        NotificationsUI.renderList();
        const en = els['notificationsList'].innerHTML;
        expect(en).toContain(t('no_notifications', 'en'));
        expect(en).not.toContain('notification.no_notifications');
    });

    it('click awaits the read POST, then follows the server link and updates the badge', async () => {
        const ui = NotificationsUI as any;
        ui.notifications = [
            { id: 5, type: 'request', message: 'm', is_read: false, created_at: new Date().toISOString(), link: '/my-requests?lang=en' },
        ];
        ui.unreadCount = 1;
        const posts: string[] = [];
        fetchImpl = async (url) => {
            if (url === '/api/notifications/5/read') {
                posts.push(url);
                await new Promise((r) => setTimeout(r, 15));
                return ok({ success: true });
            }
            return ok();
        };
        await NotificationsUI.handleNotificationClick(5);
        // The POST completed BEFORE the navigation (no fire-and-forget race).
        expect(posts).toEqual(['/api/notifications/5/read']);
        expect(locationHref).toBe('/my-requests?lang=en');
        expect(ui.notifications[0].is_read).toBe(true);
        expect(ui.unreadCount).toBe(0);
    });

    it('failed read still navigates but leaves the row unread (trusted badge)', async () => {
        const ui = NotificationsUI as any;
        ui.notifications = [
            { id: 6, type: 'invitation', message: 'm', is_read: false, created_at: new Date().toISOString(), link: '/competition/9?lang=en' },
        ];
        ui.unreadCount = 1;
        fetchImpl = async () => ({ json: async () => ({ success: false, error: 'gone' }) });
        await NotificationsUI.handleNotificationClick(6);
        expect(locationHref).toBe('/competition/9?lang=en');
        expect(ui.notifications[0].is_read).toBe(false);
        expect(ui.unreadCount).toBe(1);
    });

    it('star posts the persisted contract and only then flips locally (N-05)', async () => {
        const ui = NotificationsUI as any;
        ui.loaded = true;
        ui.notifications = [
            { id: 9, type: 'system', message: 'm', is_read: true, created_at: new Date().toISOString(), starred: false },
        ];
        const bodies: any[] = [];
        fetchImpl = async (url, opts) => {
            bodies.push({ url, body: opts?.body ? JSON.parse(opts.body) : undefined });
            return ok({ starred: true });
        };
        await NotificationsUI.toggleStar(9);
        expect(bodies).toEqual([{ url: '/api/notifications/9/star', body: { starred: true } }]);
        expect(ui.notifications[0].starred).toBe(true);
        const html = els['notificationsList'].innerHTML;
        expect(html).toContain(t('notification.unstar', 'en'));
        expect(html).toContain('aria-label');

        // Server failure: local state untouched.
        fetchImpl = async () => {
            throw new Error('down');
        };
        await NotificationsUI.toggleStar(9);
        expect(ui.notifications[0].starred).toBe(true);
    });
});

describe('R4-EVENTS-NOTIFY-1 — replay never duplicates a toast; refresh still runs', () => {
    const origShow = Toast.show;
    const origInfo = Toast.info;
    let toasts: string[];
    let inits: number;
    const origInit = NotificationsUI.init;

    beforeEach(() => {
        installStubs();
        toasts = [];
        inits = 0;
        (Toast as any).show = (msg: string) => toasts.push(msg);
        (Toast as any).info = (msg: string) => toasts.push(msg);
        (NotificationsUI as any).init = async () => {
            inits++;
        };
        (SseService as any).seenEventIds = new Set<string>();
    });

    afterEach(() => {
        (Toast as any).show = origShow;
        (Toast as any).info = origInfo;
        (NotificationsUI as any).init = origInit;
        removeStubs();
    });

    it('same delivery twice: one toast, two trusted refreshes', () => {
        const data = JSON.stringify({ competition_id: 3, inviter_username: ' hydra ' });
        (SseService as any).handleEvent('invite_sent', data, 'sse:invite_sent:99');
        (SseService as any).handleEvent('invite_sent', data, 'sse:invite_sent:99');
        expect(toasts.length).toBe(1);
        expect(inits).toBe(2);
    });

    it('distinct events each toast once', () => {
        (SseService as any).handleEvent('invite_accepted', JSON.stringify({ invitee_username: 'b' }), 'sse:invite_accepted:1');
        (SseService as any).handleEvent('invite_declined', JSON.stringify({ invitee_username: 'c' }), 'sse:invite_declined:2');
        expect(toasts.length).toBe(2);
        expect(inits).toBe(2);
    });
});
