/**
 * K — View All Users paginates like View All Competitions.
 *
 * The backend contract (GET /api/search/users → SearchModel.searchUsers with
 * LIMIT/OFFSET) supports paging; this locks the client mechanics: correct
 * offset progression, no duplicates across pages, and the end state ONLY when
 * the backend truly returns a short batch. No ranking/retrieval change.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runInNewContext } from 'node:vm';
import app from '../../src/main';
import { createHarness, extractInlineScript } from '../helpers/dom-harness';
import { FakeD1 } from '../helpers/fake-d1';

const env = (db: FakeD1) => ({ DB: db } as never);
const settle = () => new Promise((r) => setTimeout(r, 150));

const users = (from: number, n: number) =>
    Array.from({ length: n }, (_, i) => ({ username: `u${from + i}`, display_name: `U${from + i}` }));
const okJson = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data }) });

async function runUsersView(fetchImpl: (url: string) => Promise<unknown>) {
    const search = '?search=ab&view=users&lang=en';
    const html = await (await app.request(`/explore${search}`, {}, env(new FakeD1()))).text();
    const h = createHarness({
        ids: ['searchQueryDisplay', 'competitionsContainer', 'compsCount', 'usersContainer', 'usersCount'],
        search,
    });
    const sandbox: Record<string, unknown> = {
        window: h.window,
        document: h.document,
        console: { error: () => undefined, log: () => undefined },
        setTimeout, clearTimeout, setInterval, clearInterval,
        URLSearchParams,
        IntersectionObserver: undefined,
        checkAuth: async () => false,
        renderCompetitionCard: (c: { id: number }) => `<article data-comp="${c.id}"></article>`,
        fetch: fetchImpl,
    };
    sandbox.window.renderCompetitionCard = sandbox.renderCompetitionCard;
    sandbox.globalThis = sandbox;
    runInNewContext(extractInlineScript(html, 'usersContainer'), sandbox);
    return h;
}

describe('K — view-all users progressive loading', () => {
    let warn: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { warn = vi.spyOn(console, 'error').mockImplementation(() => undefined); });
    afterEach(() => warn.mockRestore());

    it('advances offset per batch with no duplicates and ends only on a short batch', async () => {
        const urls: string[] = [];
        const h = await runUsersView(async (url) => {
            urls.push(url);
            if (url.includes('offset=0')) return okJson(users(1, 9));
            if (url.includes('offset=9')) return okJson(users(10, 9));
            return okJson(users(19, 4));
        });

        await settle();
        // The shim materialises the grid as a lazily-registered node (same
        // convention as the B7 competition-grid assertions): the capped grid
        // markup lives on the grid element the script appends to.
        expect(h.el('usersGrid').innerHTML.match(/user-card/g)).toHaveLength(9);
        expect(h.el('usersStatus').innerHTML).toContain('data-action="load-more-users"');

        h.el('usersStatus').querySelector('[data-action="load-more-users"]')!.click();
        await settle();
        expect(urls.some((u) => u.includes('offset=9'))).toBe(true);
        expect(h.el('usersGrid').innerHTML.match(/user-card/g)).toHaveLength(18);

        h.el('usersStatus').querySelector('[data-action="load-more-users"]')!.click();
        await settle();
        expect(urls.some((u) => u.includes('offset=18'))).toBe(true);
        const html = h.el('usersGrid').innerHTML;
        expect(html.match(/user-card/g)).toHaveLength(22);
        // Every username exactly once — pagination never duplicates.
        for (let i = 1; i <= 22; i++) {
            expect(html.match(new RegExp(`/profile/u${i}\\?`, 'g'))).toHaveLength(1);
        }
        // The short final batch closes pagination explicitly.
        expect(h.el('usersStatus').innerHTML).toContain('data-explore-state="end"');
        expect(h.assigned).toHaveLength(0);
    });

    it('keeps loaded users and offers retry when a later page fails', async () => {
        const h = await runUsersView(async (url) => {
            if (url.includes('offset=0')) return okJson(users(1, 9));
            return { ok: false, status: 500, json: async () => ({}) };
        });

        await settle();
        h.el('usersStatus').querySelector('[data-action="load-more-users"]')!.click();
        await settle();

        expect(h.el('usersGrid').innerHTML).toContain('/profile/u1?');
        expect(h.el('usersStatus').innerHTML).toContain('data-explore-state="error"');
        expect(h.el('usersStatus').innerHTML).toContain('data-action="retry-users"');
    });
});
