/**
 * B1 — My Competitions auth/session rendering stability (behavioural).
 *
 * The page's own inline script is extracted from the server-rendered HTML and
 * executed against a minimal DOM, so these assertions describe real page
 * behaviour rather than implementation details:
 *
 *  1. a successful modal login refreshes the page via the auth-success event;
 *  2. a failed/transient load never leaves a spinner and offers retry;
 *  3. a genuine 401 shows login-required while 5xx does not;
 *  4. the empty state stays distinct from the error state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runInNewContext } from 'node:vm';
import app from '../../src/main';
import { createHarness, extractInlineScript } from '../helpers/dom-harness';
import { FakeD1 } from '../helpers/fake-d1';

const env = (db: FakeD1) => ({ DB: db } as never);

const okJson = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

/** Runs the page script against the shim DOM. */
async function runPageScript(html: string, opts: { currentUser?: unknown; fetchImpl: (url: string) => Promise<unknown> }) {
    const h = createHarness({
        ids: ['competitionsContent', 'tab-all', 'tab-pending', 'tab-live', 'tab-completed'],
        currentUser: opts.currentUser ?? null,
    });
    const sandbox: Record<string, unknown> = {
        window: h.window,
        document: h.document,
        renderCompetitionCard: (c: { id: number }) => `<article data-comp="${c.id}"></article>`,
        deleteCompetition: async () => undefined,
        showLoginModal: () => undefined,
        console: { error: (...a: unknown[]) => { if (process.env.B1_DEBUG) console.log('[page]', ...a); }, log: () => undefined },
        localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
        setTimeout,
        clearTimeout,
        URLSearchParams,
        // The bundle globals the page script calls.
        checkAuth: async () => false,
        fetch: opts.fetchImpl,
    };
    sandbox.window.renderCompetitionCard = sandbox.renderCompetitionCard;
    sandbox.window.renderUserAvatar = (o: Record<string, unknown>) => `<img alt="${String(o.displayName || '')}">`;
    sandbox.globalThis = sandbox;
    runInNewContext(extractInlineScript(html, 'competitionsContent'), sandbox);
    return h;
}

const settle = () => new Promise((r) => setTimeout(r, 5));

describe('B1 — My Competitions auth rendering', () => {
    let db: FakeD1;
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        db = new FakeD1();
        warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => warn.mockRestore());

    const render = async () => (await app.request('/my-competitions?lang=ar', {}, env(db))).text();

    it('refreshes the list when a modal login succeeds, with no reload', async () => {
        const seen: string[] = [];
        const h = await runPageScript(await render(), {
            currentUser: null,
            fetchImpl: async (url) => {
                seen.push(url);
                return okJson({ success: true, data: [{ id: 1 }, { id: 2 }] });
            },
        });

        h.fire('document', 'DOMContentLoaded');
        await settle();
        expect(h.el('competitionsContent').innerHTML).toContain('data-competitions-state="login-required"');
        expect(seen).toHaveLength(0);

        h.window.currentUser = { id: 7 };
        h.fire('window', 'dueli:auth-success');
        await settle();

        const content = h.el('competitionsContent').innerHTML;
        expect(content).toContain('data-competitions-state="content"');
        expect(content).toContain('data-comp="1"');
        expect(seen[0]).toContain('user=7');
        expect(h.assigned).toHaveLength(0);
    });

    it('never leaves a spinner on a transient failure and offers retry', async () => {
        const h = await runPageScript(await render(), {
            currentUser: { id: 7 },
            fetchImpl: async () => { throw new Error('network down'); },
        });

        h.fire('document', 'DOMContentLoaded');
        await settle();

        const content = h.el('competitionsContent').innerHTML;
        expect(content).toContain('data-competitions-state="error"');
        expect(content).not.toContain('fa-spinner');
        expect(content).toContain('loadCompetitions');
    });

    it('treats a 5xx as recoverable rather than as a logout', async () => {
        const h = await runPageScript(await render(), {
            currentUser: { id: 7 },
            fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
        });

        h.fire('document', 'DOMContentLoaded');
        await settle();

        const content = h.el('competitionsContent').innerHTML;
        expect(content).toContain('data-competitions-state="error"');
        expect(content).not.toContain('login-required');
    });

    it('shows login-required only for a genuine 401', async () => {
        const h = await runPageScript(await render(), {
            currentUser: { id: 7 },
            fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }),
        });

        h.fire('document', 'DOMContentLoaded');
        await settle();

        expect(h.el('competitionsContent').innerHTML).toContain('data-competitions-state="login-required"');
    });

    it('renders a distinct empty state when the list is simply empty', async () => {
        const h = await runPageScript(await render(), {
            currentUser: { id: 7 },
            fetchImpl: async () => okJson({ success: true, data: [] }),
        });

        h.fire('document', 'DOMContentLoaded');
        await settle();

        const content = h.el('competitionsContent').innerHTML;
        expect(content).toContain('data-competitions-state="empty"');
        expect(content).not.toContain('fa-spinner');
    });
});
