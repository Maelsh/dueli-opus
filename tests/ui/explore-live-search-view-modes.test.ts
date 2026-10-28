/**
 * UNIT35.1 — Explore live search replaces grids in view=competitions/users.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runInNewContext } from 'node:vm';
import app from '../../src/main';
import { createHarness, extractInlineScript, type Harness } from '../helpers/dom-harness';
import { FakeD1 } from '../helpers/fake-d1';

const env = (db: FakeD1) => ({ DB: db } as never);
const BATCH = 12;
const batch = (from: number, n: number = BATCH) =>
    Array.from({ length: n }, (_, i) => ({ id: from + i }));

const okJson = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data }) });

interface Call {
    url: string;
    method: string;
    body: string | null;
}

function makeCompApi(calls: Call[], itemsForSearch: (search: string) => { id: number }[]) {
    const searchBySession = new Map<string, string>();
    let sessionSeq = 0;
    return async (url: string, init?: { method?: string; body?: string }) => {
        const method = (init?.method || 'GET').toUpperCase();
        calls.push({ url, method, body: init?.body ?? null });
        if (url.includes('/explore-sessions') && method === 'POST') {
            const body = JSON.parse(init?.body ?? '{}') as { search?: string };
            const sid = `es-${++sessionSeq}`;
            searchBySession.set(sid, String(body.search ?? ''));
            return okJson({
                session: { id: sid, total: 24, expires_at: '2026-10-02 00:00:00' },
                guest_token: null,
            });
        }
        if (url.includes('/explore-sessions/') && url.includes('/page')) {
            const sid = url.split('/explore-sessions/')[1]?.split('/')[0] ?? '';
            const search = searchBySession.get(sid) ?? '';
            const items = itemsForSearch(search);
            return okJson({
                items,
                nextCursor: null,
                hasMore: false,
                session: { id: sid, total: items.length },
            });
        }
        if (url.includes('/api/search/users')) {
            const q = new URLSearchParams(url.split('?')[1] ?? '');
            const term = q.get('q') || '';
            const offset = parseInt(q.get('offset') || '0', 10) || 0;
            const prefix = term === 'alpha' ? 'a' : 'b';
            const items = Array.from({ length: 9 }, (_, i) => ({
                username: `${prefix}u${offset + i + 1}`,
                display_name: `U${offset + i + 1}`,
            }));
            return okJson({ items });
        }
        return okJson([]);
    };
}

async function bootExplore(
    search: string,
    fetchImpl: (url: string, init?: { method?: string; body?: string }) => Promise<unknown>,
): Promise<Harness> {
    const html = await (await app.request(`/explore${search}`, {}, env(new FakeD1()))).text();
    const h = createHarness({
        ids: [
            'searchQueryDisplay',
            'competitionsContainer',
            'compsCount',
            'usersContainer',
            'usersCount',
            'searchInput',
            'exploreSearchForm',
        ],
        search,
    });
    const params = new URLSearchParams(search.replace(/^\?/, ''));
    (h.el('searchInput') as unknown as { value: string }).value = params.get('search') || '';
    const sandbox: Record<string, unknown> = {
        window: h.window,
        document: h.document,
        console: { error: () => undefined, log: () => undefined },
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        URLSearchParams,
        IntersectionObserver: undefined,
        checkAuth: async () => false,
        renderCompetitionCard: (c: { id: number }) => `<article data-comp="${c.id}"></article>`,
        fetch: fetchImpl,
    };
    sandbox.window.renderCompetitionCard = sandbox.renderCompetitionCard;
    sandbox.globalThis = sandbox;
    runInNewContext(extractInlineScript(html, 'competitionsContainer'), sandbox);
    h.fire('document', 'DOMContentLoaded');
    return h;
}

const settle = () => new Promise((r) => setTimeout(r, 450));

describe('UNIT35.1 explore live search — dedicated views', () => {
    let warn: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { warn = vi.spyOn(console, 'error').mockImplementation(() => undefined); });
    afterEach(() => warn.mockRestore());

    it('view=competitions replaces results when the query changes (no duplicate grid)', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const calls: Call[] = [];
        const h = await bootExplore(
            '?search=alpha&view=competitions&lang=en',
            makeCompApi(calls, (search) => (search === 'alpha' ? batch(1) : batch(101))),
        );
        await vi.runAllTimersAsync();
        await settle();
        expect(h.el('competitionsGrid').innerHTML.match(/data-comp="/g)).toHaveLength(12);
        expect(h.el('competitionsGrid').innerHTML).toContain('data-comp="1"');
        expect(h.el('competitionsGrid').appendLog).toHaveLength(0);

        h.window.location.search = '?search=beta&view=competitions&lang=en';
        (h.el('searchInput') as unknown as { value: string }).value = 'beta';
        h.el('searchInput').dispatchEvent({ type: 'input' });
        await vi.advanceTimersByTimeAsync(350);
        await settle();

        const grid = h.el('competitionsGrid').innerHTML;
        expect(grid.match(/data-comp="/g)).toHaveLength(12);
        expect(grid).toContain('data-comp="101"');
        expect(grid).not.toContain('data-comp="1"');
        expect(h.el('competitionsGrid').appendLog).toHaveLength(0);
        vi.useRealTimers();
    });

    it('view=users replaces results when the query changes', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const calls: Call[] = [];
        const h = await bootExplore(
            '?search=alpha&view=users&lang=en',
            makeCompApi(calls, () => batch(1)),
        );
        await vi.runAllTimersAsync();
        await settle();
        expect(h.el('usersGrid').innerHTML.match(/user-card/g)).toHaveLength(9);
        expect(h.el('usersGrid').innerHTML).toContain('/profile/au1');

        h.window.location.search = '?search=beta&view=users&lang=en';
        (h.el('searchInput') as unknown as { value: string }).value = 'beta';
        h.el('searchInput').dispatchEvent({ type: 'input' });
        await vi.advanceTimersByTimeAsync(350);
        await settle();

        const html = h.el('usersGrid').innerHTML;
        expect(html.match(/user-card/g)).toHaveLength(9);
        expect(html).toContain('/profile/bu1');
        expect(html).not.toContain('/profile/au1');
        vi.useRealTimers();
    });

    it('view=competitions keeps append-only pagination after the first paint', async () => {
        const calls: Call[] = [];
        let pageReads = 0;
        const fetchImpl = async (url: string, init?: { method?: string; body?: string }) => {
            const method = (init?.method || 'GET').toUpperCase();
            calls.push({ url, method, body: init?.body ?? null });
            if (url.includes('/explore-sessions') && method === 'POST') {
                return okJson({
                    session: { id: 'es-page', total: 20, expires_at: '2026-10-02 00:00:00' },
                    guest_token: null,
                });
            }
            if (url.includes('/explore-sessions/es-page/page')) {
                pageReads += 1;
                const q = new URLSearchParams(url.split('?')[1] ?? '');
                if (!q.get('cursor')) {
                    return okJson({
                        items: batch(1),
                        nextCursor: 'c12',
                        hasMore: true,
                        session: { id: 'es-page', total: 20 },
                    });
                }
                return okJson({
                    items: batch(13, 8),
                    nextCursor: null,
                    hasMore: false,
                    session: { id: 'es-page', total: 20 },
                });
            }
            return okJson([]);
        };
        const h = await bootExplore('?search=finals&view=competitions&lang=en', fetchImpl);
        await settle();
        expect(h.el('competitionsGrid').innerHTML.match(/data-comp="/g)).toHaveLength(12);
        expect(h.el('competitionsGrid').appendLog).toHaveLength(0);

        h.el('competitionsStatus').querySelector('[data-action="load-more-competitions"]')!.click();
        await settle();

        expect(pageReads).toBe(2);
        expect(h.el('competitionsGrid').appendLog).toHaveLength(1);
        expect(h.el('competitionsGrid').innerHTML.match(/data-comp="/g)).toHaveLength(20);
    });

    it('view=users appends the next offset batch without duplicating usernames', async () => {
        const offsets: number[] = [];
        const fetchImpl = makeCompApi([], (search) => batch(1));
        const wrapped = async (url: string, init?: { method?: string; body?: string }) => {
            if (url.includes('/api/search/users')) {
                const q = new URLSearchParams(url.split('?')[1] ?? '');
                offsets.push(parseInt(q.get('offset') || '0', 10) || 0);
            }
            return fetchImpl(url, init);
        };
        const h = await bootExplore('?search=alpha&view=users&lang=en', wrapped);
        await settle();
        expect(h.el('usersGrid').innerHTML.match(/user-card/g)).toHaveLength(9);

        h.el('usersStatus').querySelector('[data-action="load-more-users"]')!.click();
        await settle();

        expect(offsets).toEqual([0, 9]);
        expect(h.el('usersGrid').appendLog).toHaveLength(1);
        expect(h.el('usersGrid').innerHTML.match(/user-card/g)).toHaveLength(18);
    });

    it('drops a stale competitions response after a newer search generation', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const calls: Call[] = [];
        let slowResolve: ((v: unknown) => void) | null = null;
        const slowPage = new Promise((resolve) => { slowResolve = resolve; });

        const fetchImpl = async (url: string, init?: { method?: string; body?: string }) => {
            const method = (init?.method || 'GET').toUpperCase();
            calls.push({ url, method, body: init?.body ?? null });
            if (url.includes('/explore-sessions') && method === 'POST') {
                const body = JSON.parse(init?.body ?? '{}') as { search?: string };
                return okJson({
                    session: { id: `es-${body.search}`, total: 12, expires_at: '2026-10-02 00:00:00' },
                    guest_token: null,
                });
            }
            if (url.includes('/explore-sessions/es-alpha/page')) {
                await slowPage;
                return okJson({
                    items: batch(1),
                    nextCursor: null,
                    hasMore: false,
                    session: { id: 'es-alpha', total: 12 },
                });
            }
            if (url.includes('/explore-sessions/es-beta/page')) {
                return okJson({
                    items: batch(201, 6),
                    nextCursor: null,
                    hasMore: false,
                    session: { id: 'es-beta', total: 6 },
                });
            }
            return okJson([]);
        };

        const h = await bootExplore('?search=alpha&view=competitions&lang=en', fetchImpl);
        await vi.runAllTimersAsync();

        h.window.location.search = '?search=beta&view=competitions&lang=en';
        (h.el('searchInput') as unknown as { value: string }).value = 'beta';
        h.el('searchInput').dispatchEvent({ type: 'input' });
        await vi.advanceTimersByTimeAsync(350);
        await settle();

        expect(h.el('competitionsGrid').innerHTML).toContain('data-comp="201"');
        expect(h.el('competitionsGrid').innerHTML).not.toContain('data-comp="1"');

        slowResolve!(null);
        await settle();
        expect(h.el('competitionsGrid').innerHTML).toContain('data-comp="201"');
        expect(h.el('competitionsGrid').innerHTML).not.toContain('data-comp="12"');
        vi.useRealTimers();
    });
});
