/**
 * UNIT 35.2 — Explore IntersectionObserver rebind after shell reset / live search.
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
const settle = () => new Promise((r) => setTimeout(r, 500));

interface IoStub {
    observeCount: number;
    disconnectCount: number;
    triggerIntersect: () => void;
    FakeIO: new (cb: (entries: { isIntersecting: boolean }[]) => void) => {
        observe: () => void;
        disconnect: () => void;
    };
}

function createIoStub(autoIntersectOnObserve: boolean): IoStub {
    let callback: ((entries: { isIntersecting: boolean }[]) => void) | null = null;
    const metrics = {
        observeCount: 0,
        disconnectCount: 0,
        triggerIntersect: () => {
            callback?.([{ isIntersecting: true }]);
        },
        FakeIO: class {
            constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
                callback = cb;
            }
            observe() {
                metrics.observeCount += 1;
                if (autoIntersectOnObserve) {
                    queueMicrotask(() => callback?.([{ isIntersecting: true }]));
                }
            }
            disconnect() {
                metrics.disconnectCount += 1;
            }
        },
    };
    return metrics;
}

async function bootExploreWithIo(
    search: string,
    fetchImpl: (url: string, init?: { method?: string; body?: string }) => Promise<unknown>,
    io: IoStub,
): Promise<Harness> {
    const html = await (await app.request(`/explore${search}`, {}, env(new FakeD1()))).text();
    const h = createHarness({
        ids: [
            'searchQueryDisplay',
            'competitionsContainer',
            'competitionsGrid',
            'competitionsStatus',
            'usersContainer',
            'usersGrid',
            'usersStatus',
            'searchInput',
            'exploreSearchForm',
            'categoryFilter',
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
        IntersectionObserver: io.FakeIO,
        checkAuth: async () => false,
        renderCompetitionCard: (c: { id: number }) => `<article data-comp="${c.id}"></article>`,
        fetch: fetchImpl,
        refreshI18nLayout: () => undefined,
    };
    sandbox.window.renderCompetitionCard = sandbox.renderCompetitionCard;
    sandbox.window.refreshI18nLayout = sandbox.refreshI18nLayout;
    sandbox.globalThis = sandbox;
    runInNewContext(extractInlineScript(html, 'competitionsContainer'), sandbox);
    h.fire('document', 'DOMContentLoaded');
    return h;
}

describe('UNIT35.2 explore IntersectionObserver', () => {
    let warn: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { warn = vi.spyOn(console, 'error').mockImplementation(() => undefined); });
    afterEach(() => warn.mockRestore());

    it('rebinds competitions IO after live search and auto-loads the next page', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        let pageReads = 0;
        const io = createIoStub(false);
        const fetchImpl = async (url: string, init?: { method?: string; body?: string }) => {
            const method = (init?.method || 'GET').toUpperCase();
            if (url.includes('/explore-sessions') && method === 'POST') {
                return okJson({
                    session: { id: 'es-io', total: 30, expires_at: '2026-10-02 00:00:00' },
                    guest_token: null,
                });
            }
            if (url.includes('/explore-sessions/es-io/page')) {
                pageReads += 1;
                const q = new URLSearchParams(url.split('?')[1] ?? '');
                if (!q.get('cursor')) {
                    return okJson({
                        items: batch(1),
                        nextCursor: 'c12',
                        hasMore: true,
                        session: { id: 'es-io', total: 30 },
                    });
                }
                return okJson({
                    items: batch(13, 8),
                    nextCursor: null,
                    hasMore: false,
                    session: { id: 'es-io', total: 30 },
                });
            }
            return okJson([]);
        };

        const h = await bootExploreWithIo('?search=alpha&view=competitions&lang=en', fetchImpl, io);
        await vi.runAllTimersAsync();
        await settle();
        expect(pageReads).toBe(1);
        const observesAfterFirst = io.observeCount;
        expect(observesAfterFirst).toBeGreaterThanOrEqual(1);

        h.window.location.search = '?search=beta&view=competitions&lang=en';
        (h.el('searchInput') as unknown as { value: string }).value = 'beta';
        h.el('searchInput').dispatchEvent({ type: 'input' });
        await vi.advanceTimersByTimeAsync(350);
        await settle();

        expect(io.disconnectCount).toBeGreaterThanOrEqual(1);
        expect(io.observeCount).toBeGreaterThan(observesAfterFirst);
        expect(pageReads).toBe(2);

        io.triggerIntersect();
        await settle();
        expect(pageReads).toBe(3);
        expect(h.el('competitionsGrid').innerHTML.match(/data-comp="/g)).toHaveLength(20);
        vi.useRealTimers();
    });

    it('rebinds users IO after filter change and auto-loads the next offset batch', async () => {
        const io = createIoStub(false);
        const offsets: number[] = [];
        const fetchImpl = async (url: string) => {
            if (url.includes('/api/search/users')) {
                const q = new URLSearchParams(url.split('?')[1] ?? '');
                const offset = parseInt(q.get('offset') || '0', 10) || 0;
                offsets.push(offset);
                const items = Array.from({ length: 9 }, (_, i) => ({
                    username: `u${offset + i + 1}`,
                    display_name: `User ${offset + i + 1}`,
                }));
                return okJson({ items });
            }
            return okJson([]);
        };

        const h = await bootExploreWithIo('?search=team&view=users&lang=en', fetchImpl, io);
        await settle();
        expect(offsets).toEqual([0]);
        const observesAfterFirst = io.observeCount;

        (h.el('categoryFilter') as unknown as { value: string }).value = 'science';
        h.el('categoryFilter').dispatchEvent({ type: 'change' });
        await settle();

        expect(io.disconnectCount).toBeGreaterThanOrEqual(1);
        expect(io.observeCount).toBeGreaterThan(observesAfterFirst);

        io.triggerIntersect();
        await settle();
        expect(offsets).toContain(9);
    });
});
