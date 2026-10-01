/**
 * B7 — Explore competitions stable result session (behavioural, R3-B7).
 *
 * Owner-approved structure is preserved: progressive loading lives ONLY in
 * the dedicated competitions view (?view=competitions); the default preview
 * shows the first 6 competitions AND the first 6 users as independent
 * sections. What changed in R3-B7 is the competitions transport: one frozen
 * server session (POST …/explore-sessions) paged with an opaque cursor
 * (GET …/explore-sessions/:id/page). The end of results comes ONLY from the
 * server hasMore flag — never from batch length or client dedup.
 *
 * The page's inline script is executed against a minimal DOM so the
 * assertions describe real page behaviour. Users browsing is a separate
 * contract and keeps its limit/offset mechanics untouched.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runInNewContext } from 'node:vm';
import app from '../../src/main';
import { createHarness, extractInlineScript } from '../helpers/dom-harness';
import { FakeD1 } from '../helpers/fake-d1';

const env = (db: FakeD1) => ({ DB: db } as never);
// The page polls for the client bundle before loading, and the competitions
// flow now freezes a session first (POST then GET) — allow several ticks.
const settle = () => new Promise((r) => setTimeout(r, 500));

const BATCH = 12;
const batch = (from: number, n: number = BATCH) =>
    Array.from({ length: n }, (_, i) => ({ id: from + i }));
const okJson = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data }) });
const statusJson = (status: number, data: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
});

interface Call {
    url: string;
    method: string;
    body: string | null;
}

interface StubRoutes {
    postSession?: (body: Record<string, unknown>) => { status: number; json: unknown };
    getPage?: (params: URLSearchParams, url: string) => { status: number; json: unknown };
    getUsers?: (params: URLSearchParams) => { status: number; json: unknown };
}

const SESSION_ID = 'esess-1';

function defaultSessionPayload(total: number) {
    return {
        success: true,
        data: {
            session: { id: SESSION_ID, total, expires_at: '2026-10-02 00:00:00' },
            guest_token: null,
        },
    };
}

/** Cursor convention for the stub only ('c<pos>'); the page treats it opaquely. */
function pageFor(store: Array<{ id: number }>) {
    return (q: URLSearchParams) => {
        const raw = q.get('cursor') || '';
        const pos = raw.startsWith('c') ? parseInt(raw.slice(1), 10) || 0 : 0;
        const limit = parseInt(q.get('limit') || '12', 10) || 12;
        const items = store.slice(pos, pos + limit);
        const end = pos + items.length;
        return {
            status: 200,
            json: {
                success: true,
                data: {
                    items,
                    nextCursor: end < store.length ? `c${end}` : null,
                    hasMore: end < store.length,
                    session: { id: SESSION_ID, total: store.length },
                },
            },
        };
    };
}

function makeApi(calls: Call[], routes: StubRoutes = {}) {
    return async (url: string, init?: { method?: string; body?: string }) => {
        const method = (init?.method || 'GET').toUpperCase();
        calls.push({ url, method, body: init?.body ?? null });
        if (url.includes('/explore-sessions') && method === 'POST') {
            const parsed = JSON.parse(init?.body ?? '{}') as Record<string, unknown>;
            if (routes.postSession) {
                const r = routes.postSession(parsed);
                return statusJson(r.status, r.json);
            }
            return statusJson(201, defaultSessionPayload(99));
        }
        if (url.includes('/explore-sessions/') && url.includes('/page')) {
            const q = new URLSearchParams(url.split('?')[1] ?? '');
            if (routes.getPage) {
                const r = routes.getPage(q, url);
                return statusJson(r.status, r.json);
            }
            return statusJson(404, { success: false });
        }
        if (url.includes('/api/search/users')) {
            const q = new URLSearchParams(url.split('?')[1] ?? '');
            if (routes.getUsers) {
                const r = routes.getUsers(q);
                return statusJson(r.status, r.json);
            }
            return okJson([]);
        }
        return okJson([]);
    };
}

/** Renders the explore page and runs its script with a stubbed fetch. */
async function runExplore(
    fetchImpl: (url: string, init?: { method?: string; body?: string }) => Promise<unknown>,
    search = '?search=finals&view=competitions&lang=ar',
) {
    const html = await (await app.request(`/explore${search}`, {}, env(new FakeD1()))).text();
    const h = createHarness({
        ids: ['searchQueryDisplay', 'competitionsContainer', 'compsCount', 'usersContainer', 'usersCount'],
        search,
    });
    const sandbox: Record<string, unknown> = {
        window: h.window,
        document: h.document,
        console: process.env.B7_DEBUG
            ? console
            : { error: () => undefined, log: () => undefined },
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        URLSearchParams,
        // Undefined on purpose: the keyboard/button fallback must be enough.
        IntersectionObserver: undefined,
        checkAuth: async () => false,
        renderCompetitionCard: (c: { id: number }) => `<article data-comp="${c.id}"></article>`,
        fetch: fetchImpl,
    };
    sandbox.window.renderCompetitionCard = sandbox.renderCompetitionCard;
    // The page waits for the bundle before loading; expose it directly.
    sandbox.window.renderCompetitionCards = (items: { id: number }[]) =>
        (items || []).map((c) => `<article data-comp="${c.id}"></article>`).join('');
    sandbox.globalThis = sandbox;
    runInNewContext(extractInlineScript(html, 'competitionsContainer'), sandbox);
    return h;
}

describe('B7 — explore competitions result session', () => {
    let warn: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { warn = vi.spyOn(console, 'error').mockImplementation(() => undefined); });
    afterEach(() => warn.mockRestore());

    it('freezes one session then reads the first page (query stays in params, no navigation)', async () => {
        const calls: Call[] = [];
        const bodies: Record<string, unknown>[] = [];
        const h = await runExplore(makeApi(calls, {
            postSession: (body) => {
                bodies.push(body);
                return { status: 201, json: defaultSessionPayload(30) };
            },
            getPage: pageFor(batch(1, 30)),
        }));

        await settle();

        const posts = calls.filter((c) => c.method === 'POST');
        expect(posts).toHaveLength(1);
        expect(posts[0]?.url).toContain('/api/competitions/explore-sessions?lang=ar');
        expect(bodies[0]).toMatchObject({ search: 'finals', category: '', status: '' });
        const pages = calls.filter((c) => c.url.includes('/page'));
        expect(pages).toHaveLength(1);
        expect(pages[0]?.url).toContain(`/explore-sessions/${SESSION_ID}/page`);
        expect(pages[0]?.url).toContain('limit=12');
        expect(pages[0]?.url).toContain('search=finals');
        const grid = h.el('competitionsGrid');
        expect(grid.appendLog).toHaveLength(1);
        expect(grid.innerHTML).toContain('data-comp="1"');
        expect(grid.innerHTML).toContain('data-comp="12"');
        // No navigation: the query stays where it is.
        expect(h.assigned).toHaveLength(0);
    });

    it('appends the next cursor batch with no duplicates', async () => {
        const calls: Call[] = [];
        const h = await runExplore(makeApi(calls, {
            getPage: (q) => {
                // The server overlaps by one item to prove render de-duplication.
                const raw = q.get('cursor') || '';
                if (!raw) {
                    return {
                        status: 200,
                        json: {
                            success: true,
                            data: { items: batch(1), nextCursor: 'c12', hasMore: true, session: { id: SESSION_ID, total: 15 } },
                        },
                    };
                }
                return {
                    status: 200,
                    json: {
                        success: true,
                        data: { items: [{ id: 12 }, { id: 13 }, { id: 14 }], nextCursor: null, hasMore: false, session: { id: SESSION_ID, total: 15 } },
                    },
                };
            },
        }));

        await settle();

        // The keyboard/button fallback is present even without IntersectionObserver.
        expect(h.el('competitionsStatus').innerHTML).toContain('data-action="load-more-competitions"');
        h.el('competitionsStatus').querySelector('[data-action="load-more-competitions"]')!.click();
        await settle();

        const pages = calls.filter((c) => c.url.includes('/page'));
        expect(pages).toHaveLength(2);
        expect(pages[1]?.url).toContain('cursor=c12');
        const grid = h.el('competitionsGrid');
        expect(grid.appendLog).toHaveLength(2);
        // The overlapping id 12 is not rendered twice.
        expect(grid.innerHTML.match(/data-comp="12"/g)).toHaveLength(1);
        expect(grid.innerHTML).toContain('data-comp="14"');
        expect(h.assigned).toHaveLength(0);
    });

    it('ends ONLY on server hasMore=false (a short batch never ends early)', async () => {
        const calls: Call[] = [];
        const h = await runExplore(makeApi(calls, {
            getPage: (q) => {
                if (!q.get('cursor')) {
                    return {
                        status: 200,
                        json: {
                            success: true,
                            data: { items: batch(1, 5), nextCursor: 'c5', hasMore: true, session: { id: SESSION_ID, total: 6 } },
                        },
                    };
                }
                return {
                    status: 200,
                    json: {
                        success: true,
                        data: { items: [{ id: 6 }], nextCursor: null, hasMore: false, session: { id: SESSION_ID, total: 6 } },
                    },
                };
            },
        }));

        await settle();
        // 5 items (< COMP_BATCH) but hasMore=true: still pageable, no end state.
        expect(h.el('competitionsStatus').innerHTML).toContain('data-action="load-more-competitions"');
        expect(h.el('competitionsStatus').innerHTML).not.toContain('data-explore-state="end"');
        h.el('competitionsStatus').querySelector('[data-action="load-more-competitions"]')!.click();
        await settle();

        expect(h.el('competitionsStatus').innerHTML).toContain('data-explore-state="end"');
        const grid = h.el('competitionsGrid');
        expect(grid.innerHTML).toContain('data-comp="6"');
    });

    it('keeps loaded results and retries the SAME cursor when a later batch fails', async () => {
        const calls: Call[] = [];
        let attempts = 0;
        const h = await runExplore(makeApi(calls, {
            getPage: (q) => {
                if (!q.get('cursor')) return { status: 200, json: { success: true, data: { items: batch(1), nextCursor: 'c12', hasMore: true, session: { id: SESSION_ID, total: 20 } } } };
                attempts += 1;
                if (attempts === 1) return { status: 500, json: { success: false } };
                return { status: 200, json: { success: true, data: { items: batch(13, 8), nextCursor: null, hasMore: false, session: { id: SESSION_ID, total: 20 } } } };
            },
        }));

        await settle();
        h.el('competitionsStatus').querySelector('[data-action="load-more-competitions"]')!.click();
        await settle();

        expect(h.el('competitionsGrid').innerHTML).toContain('data-comp="1"');
        expect(h.el('competitionsStatus').innerHTML).toContain('data-explore-state="error"');
        expect(h.el('competitionsStatus').innerHTML).toContain('data-action="retry-competitions"');
        h.el('competitionsStatus').querySelector('[data-action="retry-competitions"]')!.click();
        await settle();

        const cursors = calls.filter((c) => c.url.includes('/page')).map((c) => new URLSearchParams(c.url.split('?')[1]).get('cursor'));
        expect(cursors).toEqual([null, 'c12', 'c12']);
        expect(h.el('competitionsGrid').innerHTML).toContain('data-comp="20"');
    });

    it('renders the expired refresh path on 410 (never a dead end)', async () => {
        const h = await runExplore(makeApi([], {
            getPage: () => ({ status: 410, json: { success: false, error: 'expired' } }),
        }), '?search=finals&view=competitions&lang=ar');

        await settle();

        expect(h.el('competitionsContainer').innerHTML).toContain('data-explore-state="expired"');
        expect(h.el('competitionsContainer').innerHTML).toContain('data-action="refresh-explore"');
    });

    it('a stale esession hint recreates the session once and replays the read', async () => {
        const calls: Call[] = [];
        const h = await runExplore(makeApi(calls, {
            postSession: () => ({ status: 201, json: defaultSessionPayload(14) }),
            getPage: (_url, url) => {
                if (url.includes('/stale-hint/')) {
                    return { status: 404, json: { success: false } };
                }
                return {
                    status: 200,
                    json: { success: true, data: { items: batch(1), nextCursor: null, hasMore: false, session: { id: SESSION_ID, total: 14 } } },
                };
            },
        }), '?search=finals&view=competitions&esession=stale-hint&lang=ar');

        await settle();

        // The hint is tried first, then exactly one fresh session is frozen
        // and the same read is replayed on it — the grid renders its rows.
        const pageCalls = calls.filter((c) => c.url.includes('/page'));
        expect(pageCalls[0]?.url).toContain('/stale-hint/page');
        expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
        expect(pageCalls[1]?.url).toContain(`/explore-sessions/${SESSION_ID}/page`);
        const grid = h.el('competitionsGrid');
        expect(grid.innerHTML).toContain('data-comp="1"');
        expect(grid.innerHTML).toContain('data-comp="12"');
        expect(h.el('competitionsStatus').innerHTML).toContain('data-explore-state="end"');
    });

    it('shows an empty state instead of an endless spinner when nothing matches', async () => {
        const h = await runExplore(makeApi([], {
            getPage: () => ({
                status: 200,
                json: { success: true, data: { items: [], nextCursor: null, hasMore: false, session: { id: SESSION_ID, total: 0 } } },
            }),
        }));

        await settle();

        expect(h.el('competitionsContainer').innerHTML).not.toContain('fa-spinner');
        expect(h.el('compsCount').textContent).toBe('(0)');
    });
});

describe('explore preview — 6+6 independent sections, no progressive loading', () => {
    let warn: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { warn = vi.spyOn(console, 'error').mockImplementation(() => undefined); });
    afterEach(() => warn.mockRestore());

    const users = (from: number) =>
        Array.from({ length: 12 }, (_, i) => ({ username: `u${from + i}`, display_name: `U${from + i}` }));
    const PREVIEW = '?search=finals&lang=ar';

    it('caps each section at 6 with no load-more (users never pushed down)', async () => {
        const calls: Call[] = [];
        const h = await runExplore(makeApi(calls, {
            getPage: () => ({
                status: 200,
                json: { success: true, data: { items: batch(1, 12), nextCursor: 'c6', hasMore: true, session: { id: SESSION_ID, total: 12 } } },
            }),
            getUsers: () => ({ status: 200, json: { success: true, data: { items: users(1) } } }),
        }), PREVIEW);

        await settle();

        // The shim does not parse innerHTML into nodes: the capped grid markup
        // lives inside the section container (as in a real first paint).
        const compHtml = h.el('competitionsContainer').innerHTML;
        expect(compHtml.match(/data-comp="/g)).toHaveLength(6);
        expect(compHtml).toContain('data-comp="1"');
        expect(compHtml).not.toContain('data-comp="7"');
        const userHtml = h.el('usersContainer').innerHTML;
        expect(userHtml.match(/user-card/g)).toHaveLength(6);
        expect(userHtml).toContain('/profile/u1?lang=ar');
        // No progressive machinery in preview: neither section appends.
        expect(h.el('competitionsStatus').innerHTML).not.toContain('data-action="load-more-competitions"');
        expect(h.el('usersStatus').innerHTML).not.toContain('data-action="load-more-users"');
        expect(h.el('compsCount').textContent).toBe('(6)');
        // The preview freezes one session (limit 6) and users keep limit=6.
        const pages = calls.filter((c) => c.url.includes('/page'));
        expect(pages).toHaveLength(1);
        expect(pages[0]?.url).toContain('limit=6');
        expect(calls.some((c) => c.url.includes('/api/search/users') && c.url.includes('limit=6'))).toBe(true);
        expect(h.assigned).toHaveLength(0);
    });

    it('carries the on-page category/status filters into the session', async () => {
        const calls: Call[] = [];
        const bodies: Record<string, unknown>[] = [];
        await runExplore(makeApi(calls, {
            postSession: (body) => {
                bodies.push(body);
                return { status: 201, json: defaultSessionPayload(0) };
            },
            getPage: () => ({
                status: 200,
                json: { success: true, data: { items: [], nextCursor: null, hasMore: false, session: { id: SESSION_ID, total: 0 } } },
            }),
            getUsers: () => ({ status: 200, json: { success: true, data: [] } }),
        }), '?search=finals&category=science&status=live&lang=ar');

        await settle();

        expect(bodies[0]).toMatchObject({ search: 'finals', category: 'science', status: 'live' });
        const page = calls.find((c) => c.url.includes('/page'));
        expect(page?.url).toContain('search=finals');
        expect(page?.url).toContain('category=science');
        expect(page?.url).toContain('status=live');
    });
});
