/**
 * PR #69 remediation — two REMOTE blockers on the /notifications page.
 *
 * BLOCKER 1 — mark-all global collision: the page assigned
 * window.markAllNotificationsRead, which the deferred bundle later
 * overwrote with the navbar/dropdown implementation, leaving the page list
 * stale after mark-all. The page action now has its own unambiguous name.
 * The runtime test below reproduces the real binding order (page inline
 * script first, deferred bundle second) so the previous false green —
 * which never modelled the overwrite — cannot recur.
 *
 * BLOCKER 2 — nonced-script language injection: `const lang = '${lang}'`
 * interpolated the raw request value into executable JS. The sink now emits
 * JSON.stringify(getUILanguage(lang)) — canonical ar/en, safely serialized.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import app from '../../src/main';
import { createHarness, extractInlineScript } from '../helpers/dom-harness';
import { SqliteD1 } from '../helpers/sqlite-d1';

const env = (db: SqliteD1) => ({ DB: db } as unknown as Parameters<typeof app.request>[2]);

function walkTs(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            if (entry === 'node_modules') continue;
            walkTs(full, out);
        } else if (entry.endsWith('.ts')) {
            out.push(full);
        }
    }
    return out;
}

/** data-csp-fn wired to the page's #markAllBtn in the served HTML. */
function pageMarkAllFn(html: string): string {
    const btn = /<button[^>]*id="markAllBtn"[^>]*>/.exec(html)?.[0]
        ?? /<button[^>]*data-csp-fn="([^"]+)"[^>]*id="markAllBtn"[^>]*>/.exec(html)?.[0];
    expect(btn, 'markAllBtn exists').toBeTruthy();
    const fn = /data-csp-fn="([^"]+)"/.exec(btn!)?.[1];
    expect(fn, 'markAllBtn has a data-csp-fn').toBeTruthy();
    return fn!;
}

const settle = () => new Promise((r) => setTimeout(r, 10));

const UNREAD_ROW = {
    id: 11, type: 'message', is_read: false, created_at: new Date().toISOString(),
    title: 'New Message', message: 'Alice: hello',
    link: '/messages?conversation=5&lang=en', payload: { actor: 'Alice', username: 'alice' },
};
const READ_ROW = { ...UNREAD_ROW, is_read: true };

/** Runs the real page inline script against the shim DOM. */
function runPageScript(html: string, fetchImpl: (url: string, opts?: any) => Promise<any>) {
    const h = createHarness({ ids: ['notificationsContent', 'markAllBtn'], currentUser: { id: 81 } });
    const sandbox: Record<string, unknown> = {
        window: h.window,
        document: h.document,
        console: { error: () => undefined, log: () => undefined },
        localStorage: { getItem: () => 'sess-x', setItem: () => undefined, removeItem: () => undefined },
        setTimeout,
        clearTimeout,
        URLSearchParams,
        encodeURIComponent,
        checkAuth: async () => true,
        authStatus: () => 'authenticated',
        fetch: fetchImpl,
    };
    sandbox.globalThis = sandbox;
    runInNewContext(extractInlineScript(html, 'notificationsContent'), sandbox);
    return h;
}

describe('PR #69 blocker 1 — page mark-all survives the deferred bundle', () => {
    let db: SqliteD1;
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        db = new SqliteD1();
        warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => warn.mockRestore());

    const render = async (lang = 'en') =>
        (await app.request(`/notifications?lang=${lang}`, {}, env(db))).text();

    it('the page mark-all handler name is unambiguous (no bundle window assignment)', async () => {
        const fn = pageMarkAllFn(await render());
        expect(fn).not.toBe('markAllNotificationsRead');
        const collisions = walkTs(join(process.cwd(), 'src/client'))
            .filter((f) => new RegExp(`window\\.${fn}\\s*=`).test(readFileSync(f, 'utf8')));
        expect(collisions).toEqual([]);
    });

    it('real DOM + real binding order: page mark-all rerenders, clears unread, hides the button', async () => {
        const html = await render();
        const fn = pageMarkAllFn(html);
        let readAll = false;
        const calls: string[] = [];
        const h = runPageScript(html, async (url: string, opts?: any) => {
            calls.push(`${opts?.method || 'GET'} ${url}`);
            if (String(url).includes('/read-all')) {
                readAll = true;
                return { ok: true, status: 200, json: async () => ({ success: true }) };
            }
            const rows = readAll ? [READ_ROW] : [UNREAD_ROW];
            return {
                ok: true, status: 200,
                json: async () => ({ success: true, data: { notifications: rows, unreadCount: rows.filter((r) => !r.is_read).length } }),
            };
        });

        h.fire('document', 'DOMContentLoaded');
        await settle();
        await settle();
        expect(h.el('notificationsContent').innerHTML).toContain('bg-purple-50');
        expect(h.el('markAllBtn').classList.contains('hidden')).toBe(false);

        // Deferred /static/app.js lands AFTER the inline script and rebinds
        // the navbar's own mark-all (the proven collision on the old code).
        const bundleCalls: string[] = [];
        (h.window as any).markAllNotificationsRead = () => { bundleCalls.push('dropdown'); };

        // Dispatch exactly what the rendered button declares.
        await ((h.window as any)[fn] as () => Promise<void>)();
        await settle();
        await settle();

        expect(calls.some((c) => c.startsWith('POST') && c.includes('/read-all'))).toBe(true);
        expect(bundleCalls).toEqual([]);
        const content = h.el('notificationsContent').innerHTML;
        expect(content).not.toContain('bg-purple-50');
        expect(content).toContain('New Message');
        expect(h.el('markAllBtn').classList.contains('hidden')).toBe(true);
    });

    it('navbar dropdown mark-all behavior is preserved (bundle still owns its name)', () => {
        const bundle = readFileSync(join(process.cwd(), 'src/client/index.ts'), 'utf8');
        expect(bundle).toContain('window.markAllNotificationsRead');
        const delegate = readFileSync(join(process.cwd(), 'src/client/csp-delegate.ts'), 'utf8');
        expect(delegate).toContain(`'markAllNotificationsRead',`);
        expect(delegate).toContain(`'markAllNotificationsPageRead',`);
    });
});

describe('PR #69 blocker 2 — request language cannot escape the nonced script', () => {
    let db: SqliteD1;

    beforeEach(() => {
        db = new SqliteD1();
    });

    async function scriptFor(langQuery: string): Promise<{ status: number; script: string; csp: string }> {
        const res = await app.request(`/notifications?lang=${langQuery}`, {}, env(db));
        const html = await res.text();
        return {
            status: res.status,
            script: extractInlineScript(html, 'notificationsContent'),
            csp: res.headers.get('content-security-policy') ?? '',
        };
    }

    it.each([
        ['%27%3Balert(document.domain)%3B%2F%2F', 'en'],
        ['%27%3Bwindow.__xss%3D1%3B%2F%2F', 'en'],
        ['en-US', 'en'],
        ['fr', 'en'],
        ['..%2F..', 'en'],
        ['ar', 'ar'],
        ['en', 'en'],
    ])('?lang=%s ⇒ 200, script pins const lang = "%s", no execution marker', async (query, canonical) => {
        const { status, script, csp } = await scriptFor(query);
        expect(status).toBe(200);
        expect(script).toContain(`const lang = "${canonical}";`);
        expect(script).not.toContain('alert(document.domain)');
        expect(script).not.toContain('__xss');
        expect(script).not.toContain('../..');
        expect(csp).toContain('script-src');
        expect(csp).not.toContain('unsafe-inline');
        expect(csp).not.toContain('unsafe-eval');
    });
});
