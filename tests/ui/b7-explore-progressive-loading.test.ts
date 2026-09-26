/**
 * B7 â€” Explore/Search progressive loading (behavioural).
 *
 * The page's inline script is executed against a minimal DOM so the assertions
 * describe real page behaviour: first batch, appended next batch at the next
 * offset with no duplicates, preserved query with no navigation, an explicit
 * end state, and a recoverable error.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runInNewContext } from 'node:vm';
import app from '../../src/main';
import { createHarness, extractInlineScript } from '../helpers/dom-harness';
import { FakeD1 } from '../helpers/fake-d1';

const env = (db: FakeD1) => ({ DB: db } as never);
// The page polls for the client bundle before loading, so allow one tick.
const settle = () => new Promise((r) => setTimeout(r, 150));

const BATCH = 12;
const batch = (from: number) => Array.from({ length: BATCH }, (_, i) => ({ id: from + i }));
const okJson = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data }) });

/** Renders the explore page and runs its script with a stubbed fetch. */
async function runExplore(fetchImpl: (url: string) => Promise<unknown>) {
    const html = await (await app.request('/explore?search=finals&lang=ar', {}, env(new FakeD1()))).text();
    const h = createHarness({
        ids: ['searchQueryDisplay', 'competitionsContainer', 'compsCount', 'usersContainer', 'usersCount'],
        search: '?search=finals&lang=ar',
    });
    const sandbox: Record<string, unknown> = {
        window: h.window,
        document: h.document,
        console: { error: () => undefined, log: () => undefined },
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

describe('B7 â€” explore progressive loading', () => {
    let warn: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { warn = vi.spyOn(console, 'error').mockImplementation(() => undefined); });
    afterEach(() => warn.mockRestore());

    it('renders the first batch and keeps the query in the URL params', async () => {
        const urls: string[] = [];
        const h = await runExplore(async (url) => { urls.push(url); return okJson(batch(1)); });

        await settle();

        const grid = h.el('competitionsGrid');
        expect(grid.appendLog).toHaveLength(1);
        expect(grid.innerHTML).toContain('data-comp="1"');
        expect(urls[0]).toContain('offset=0');
        expect(urls[0]).toContain('search=finals');
        // No navigation: the query stays where it is.
        expect(h.assigned).toHaveLength(0);
    });

    it('appends the next batch at the next offset with no duplicates', async () => {
        const urls: string[] = [];
        const h = await runExplore(async (url) => {
            urls.push(url);
            // The second page overlaps by one item to prove de-duplication.
            return okJson(url.includes('offset=0') ? batch(1) : [{ id: 12 }, { id: 13 }, { id: 14 }]);
        });

        await settle();

        // The keyboard/button fallback is present even without IntersectionObserver.
        expect(h.el('competitionsStatus').innerHTML).toContain('data-action="load-more-competitions"');
        h.el('competitionsStatus').querySelector('[data-action="load-more-competitions"]')!.click();
        await settle();

        expect(urls.some((u) => u.includes('offset=12'))).toBe(true);
        const grid = h.el('competitionsGrid');
        expect(grid.appendLog).toHaveLength(2);
        // The overlapping id 12 is not rendered twice.
        expect(grid.innerHTML.match(/data-comp="12"/g)).toHaveLength(1);
        expect(grid.innerHTML).toContain('data-comp="14"');
        expect(h.assigned).toHaveLength(0);
    });

    it('states the end of results explicitly', async () => {
        const h = await runExplore(async (url) => okJson(url.includes('offset=0') ? batch(1) : [{ id: 99 }]));

        await settle();
        h.el('competitionsStatus').querySelector('[data-action="load-more-competitions"]')!.click();
        await settle();

        expect(h.el('competitionsStatus').innerHTML).toContain('data-explore-state="end"');
    });

    it('keeps loaded results and offers a retry when a later batch fails', async () => {
        const h = await runExplore(async (url) => {
            if (url.includes('offset=0')) return okJson(batch(1));
            return { ok: false, status: 500, json: async () => ({}) };
        });

        await settle();
        h.el('competitionsStatus').querySelector('[data-action="load-more-competitions"]')!.click();
        await settle();

        expect(h.el('competitionsGrid').innerHTML).toContain('data-comp="1"');
        expect(h.el('competitionsStatus').innerHTML).toContain('data-explore-state="error"');
        expect(h.el('competitionsStatus').innerHTML).toContain('data-action="retry-competitions"');
    });

    it('shows an empty state instead of an endless spinner when nothing matches', async () => {
        const h = await runExplore(async () => okJson([]));

        await settle();

        expect(h.el('competitionsContainer').innerHTML).not.toContain('fa-spinner');
        expect(h.el('compsCount').textContent).toBe('(0)');
    });
});
