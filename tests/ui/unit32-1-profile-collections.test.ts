/**
 * UNIT32.1 / R4-PROFILE-COLLECTIONS-1 — UI contract for the owner-only
 * collections section and the card/competition bookmark control.
 *
 * The profile page's OWN inline script runs against the real server and real
 * D1 schema, so this covers the chain the user walks:
 *
 *   own profile → tabs → GET /api/watch/later|history → rendered cards
 *   → load-more cursor pages → empty/error/retry states
 *
 * Ownership is asserted at the server-render level: another user's profile and
 * an anonymous visit never receive the section at all. The bookmark control is
 * asserted both in markup and in the client class (guest → existing login
 * modal, no fetch and no open redirect; paint only from a confirmed response).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import app from '../../src/main';
import { createHarness, extractInlineScript, type Harness } from '../helpers/dom-harness';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { getCompetitionCard } from '../../src/shared/components/competition-card';
import { WatchLaterUI } from '../../src/client/ui/WatchLaterUI';
import { en } from '../../src/i18n/en';
import { ar } from '../../src/i18n/ar';

const env = (db: SqliteD1) => ({ DB: db } as unknown as Parameters<typeof app.request>[2]);
const TOK_A = 'ui-unit32-1-a';
const TOK_B = 'ui-unit32-1-b';

const settle = () => new Promise((r) => setTimeout(r, 15));

async function seed(db: SqliteD1): Promise<void> {
    await db.prepare(`
        INSERT INTO users (id, email, username, password_hash, display_name, is_active, is_verified, language, country, is_fake)
        VALUES
          (2, 'uia@unit32-1.local', 'ui_unit32_1_a', 'x', 'UI A', 1, 1, 'en', 'EG', 0),
          (3, 'uib@unit32-1.local', 'ui_unit32_1_b', 'x', 'UI B', 1, 1, 'en', 'EG', 0)
    `).run();
    await db.prepare(`
        INSERT INTO sessions (id, user_id, expires_at) VALUES
          ('${TOK_A}', 2, datetime('now', '+1 day')),
          ('${TOK_B}', 3, datetime('now', '+1 day'))
    `).run();
    await db.prepare(`
        INSERT INTO categories (id, slug, name_ar, name_en, icon, color)
        VALUES (1, 'ui-unit32-1-general', 'عام', 'General', 'fas fa-trophy', '#8B5CF6')
    `).run();
    const values: string[] = [];
    for (let i = 1; i <= 16; i += 1) {
        values.push(`(${i}, 'UI competition ${i}', 'rules', 1, 2, 'completed', 0)`);
    }
    await db.prepare(`
        INSERT INTO competitions (id, title, rules, category_id, creator_id, status, is_fake)
        VALUES ${values.join(',')}
    `).run();
}

interface PageRun {
    html: string;
    harness: Harness;
    sandbox: Record<string, unknown>;
    urls: string[];
    toasts: Array<{ message: string; type: string }>;
}

async function runProfile(
    db: SqliteD1,
    username: string,
    opts: {
        token?: string;
        failLater?: { value: boolean };
        currentUser?: Record<string, unknown> | null;
    } = {}
): Promise<PageRun> {
    const headers: Record<string, string> = {};
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    const res = await app.request(`/profile/${username}?lang=en`, { headers }, env(db));
    const html = await res.text();
    const script = extractInlineScript(html, 'profileUsername');

    const urls: string[] = [];
    const toasts: Array<{ message: string; type: string }> = [];
    const h = createHarness({
        ids: [
            'profileActions',
            'profileCollections',
            'collectionLaterList',
            'collectionLaterState',
            'collectionLaterRetry',
            'collectionLaterMore',
            'collectionHistoryList',
            'collectionHistoryState',
            'collectionHistoryRetry',
            'collectionHistoryMore',
            'collectionPanel-later',
            'collectionPanel-history',
            'collectionsTab-later',
            'collectionsTab-history',
        ],
        currentUser: opts.currentUser === undefined
            ? (opts.token ? { id: opts.token === TOK_A ? 2 : 3, username } : null)
            : opts.currentUser,
    });
    (h.window as any).dueli = {
        showToast: (message: string, type: string) => toasts.push({ message, type }),
    };
    (h.window as any).renderCompetitionCard = (item: { id: number; title: string }) =>
        `<div class="duel-card" data-rendered-id="${item.id}">${item.title}</div>`;

    const fetchImpl = async (url: string, init?: any) => {
        urls.push(url);
        if (opts.failLater?.value && url.includes('/api/watch/later')) {
            return { ok: false, status: 500, json: async () => ({ success: false, error: 'boom' }) };
        }
        const res2 = await app.request(url, {
            method: init?.method || 'GET',
            headers: {
                ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
                ...(init?.headers || {}),
            },
        }, env(db));
        return res2;
    };

    const sandbox: Record<string, unknown> = {
        window: h.window,
        document: h.document,
        console: { error: () => undefined, log: () => undefined, warn: () => undefined },
        localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
        setTimeout,
        clearTimeout,
        JSON,
        Date,
        Number,
        Math,
        Intl,
        URLSearchParams,
        encodeURIComponent,
        decodeURIComponent,
        confirm: () => false,
        alert: () => undefined,
        checkAuth: async () => true,
        authStatus: () => 'authenticated',
        fetch: fetchImpl,
    };
    sandbox.globalThis = sandbox;
    runInNewContext(script, sandbox);

    return { html, harness: h, sandbox, urls, toasts };
}

function cardsIn(html: string): number[] {
    return [...html.matchAll(/data-rendered-id="(\d+)"/g)].map((m) => Number(m[1]));
}

describe('UNIT32.1 R4-PROFILE-COLLECTIONS-1 — profile UI', () => {
    let db: SqliteD1;

    beforeEach(async () => {
        db = new SqliteD1();
        await seed(db);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete (globalThis as any).window;
        delete (globalThis as any).document;
        delete (globalThis as any).fetch;
        delete (globalThis as any).CustomEvent;
    });

    it('renders the collections section only for the profile owner', async () => {
        const own = await app.request('/profile/ui_unit32_1_a?lang=en', {
            headers: { Authorization: `Bearer ${TOK_A}` },
        }, env(db));
        const ownHtml = await own.text();
        expect(ownHtml).toContain('id="profileCollections"');
        expect(ownHtml).toContain('data-owner-id="2"');
        expect(ownHtml).toContain('id="collectionsTab-later"');
        expect(ownHtml).toContain('id="collectionsTab-history"');
        expect(ownHtml).toContain('role="tablist"');

        const noUsername = await app.request('/profile?lang=en', {
            headers: { Authorization: `Bearer ${TOK_A}` },
        }, env(db));
        expect(await noUsername.text()).toContain('id="profileCollections"');

        const other = await app.request('/profile/ui_unit32_1_b?lang=en', {
            headers: { Authorization: `Bearer ${TOK_A}` },
        }, env(db));
        const otherHtml = await other.text();
        expect(otherHtml).not.toContain('id="profileCollections"');
        expect(otherHtml).not.toContain('id="collectionsTab-later"');

        const anon = await app.request('/profile/ui_unit32_1_a?lang=en', {}, env(db));
        const anonHtml = await anon.text();
        expect(anonHtml).not.toContain('id="profileCollections"');
        expect(anonHtml).not.toContain('id="collectionsTab-history"');
    });

    it('loads Watch Later and pages it to exhaustion through the real API', async () => {
        for (let i = 1; i <= 13; i += 1) {
            await db.prepare(`INSERT INTO watch_later (user_id, competition_id, added_at) VALUES (?, ?, ?)`)
                .bind(2, i, `2026-05-${String(i).padStart(2, '0')} 10:00:00`).run();
        }

        const page = await runProfile(db, 'ui_unit32_1_a', { token: TOK_A });
        page.harness.fire('document', 'DOMContentLoaded');
        await settle();
        await settle();

        let html = page.harness.el('collectionLaterList').innerHTML;
        expect(cardsIn(html)).toEqual([13, 12, 11, 10, 9, 8]);
        expect(page.harness.el('collectionLaterMore').classList.contains('hidden')).toBe(false);
        expect(page.harness.el('collectionLaterState').classList.contains('hidden')).toBe(true);

        await (page.sandbox.loadMoreCollection as (kind: string) => Promise<void>)('later');
        await settle();
        html = page.harness.el('collectionLaterList').innerHTML;
        expect(cardsIn(html)).toEqual([13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);

        await (page.sandbox.loadMoreCollection as (kind: string) => Promise<void>)('later');
        await settle();
        html = page.harness.el('collectionLaterList').innerHTML;
        expect(cardsIn(html)).toEqual([13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
        expect(page.harness.el('collectionLaterMore').classList.contains('hidden')).toBe(true);
    });

    it('lazily loads Viewing History newest-first with truthful watch metadata', async () => {
        await db.prepare(`
            INSERT INTO watch_history (user_id, competition_id, watch_duration_seconds, completed, watched_at) VALUES
              (2, 1, 0, 0, '2026-06-01 10:00:00'),
              (2, 2, 125, 0, '2026-06-02 10:00:00'),
              (2, 3, 300, 1, '2026-06-03 10:00:00')
        `).run();

        const page = await runProfile(db, 'ui_unit32_1_a', { token: TOK_A });
        page.harness.fire('document', 'DOMContentLoaded');
        await settle();
        await settle();

        expect(page.urls.some((url) => url.includes('/api/watch/history'))).toBe(false);

        (page.sandbox.setCollectionsTab as (tab: string) => void)('history');
        await settle();
        await settle();

        const html = page.harness.el('collectionHistoryList').innerHTML;
        expect(cardsIn(html)).toEqual([3, 2, 1]);
        expect(page.harness.el('collectionPanel-history').classList.contains('hidden')).toBe(false);
        expect(page.harness.el('collectionPanel-later').classList.contains('hidden')).toBe(true);
        expect(html).toContain(en.watch_collections.watched_for);
        expect(html).toContain('2 ' + en.watch_collections.minutes_short);
        // A short real watch is not rounded up into a fake full minute.
        expect(html).toContain(en.watch_collections.less_than_minute);
        // History never claims a completion the stored row does not prove.
        expect(html).not.toContain('completed');
    });

    it('shows truthful empty states for both tabs', async () => {
        const page = await runProfile(db, 'ui_unit32_1_a', { token: TOK_A });
        page.harness.fire('document', 'DOMContentLoaded');
        await settle();
        await settle();
        expect(page.harness.el('collectionLaterState').textContent).toContain(en.watch_collections.empty_later);

        (page.sandbox.setCollectionsTab as (tab: string) => void)('history');
        await settle();
        await settle();
        expect(page.harness.el('collectionHistoryState').textContent).toContain(en.watch_collections.empty_history);
    });

    it('shows an error state and retries the same request after a failure', async () => {
        await db.prepare(`INSERT INTO watch_later (user_id, competition_id, added_at) VALUES (2, 1, '2026-07-01 10:00:00')`).run();
        const failLater = { value: true };
        const page = await runProfile(db, 'ui_unit32_1_a', { token: TOK_A, failLater });
        page.harness.fire('document', 'DOMContentLoaded');
        await settle();
        await settle();

        expect(page.harness.el('collectionLaterState').textContent).toContain(en.watch_collections.error);
        expect(page.harness.el('collectionLaterRetry').classList.contains('hidden')).toBe(false);
        expect(cardsIn(page.harness.el('collectionLaterList').innerHTML)).toEqual([]);

        failLater.value = false;
        await (page.sandbox.retryCollection as (kind: string) => Promise<void>)('later');
        await settle();
        await settle();

        expect(cardsIn(page.harness.el('collectionLaterList').innerHTML)).toEqual([1]);
        expect(page.harness.el('collectionLaterRetry').classList.contains('hidden')).toBe(true);
        expect(page.harness.el('collectionLaterState').classList.contains('hidden')).toBe(true);
    });

    it('renders a bookmark control on every shared card in both languages', () => {
        const base = {
            id: 7,
            title: 'Final',
            status: 'completed',
            creator_id: 3,
            creator_name: 'Sara',
            creator_username: 'sara',
        } as never;

        const english = getCompetitionCard(base, 'en');
        expect(english).toContain('data-competition-id="7"');
        expect(english).toContain('data-watch-later-toggle="7"');
        expect(english).toContain('data-csp-fn="WatchLaterUI.toggle"');
        expect(english).toContain('aria-pressed="false"');
        expect(english).toContain(`title="${en.watch_collections.add}"`);
        expect(english).toContain(`aria-label="${en.watch_collections.add}"`);
        expect(english).not.toContain('data-watch-later-toggle="7" data-csp-on="click" role="link"');

        const arabic = getCompetitionCard(base, 'ar');
        expect(arabic).toContain(`title="${ar.watch_collections.add}"`);
        expect(arabic).toContain(`aria-label="${ar.watch_collections.add}"`);
        expect(ar.watch_collections.add).not.toBe(en.watch_collections.add);
    });

    it('sends a guest to the existing login modal without fetching or redirecting', async () => {
        const showLoginModal = vi.fn();
        const fetchMock = vi.fn();
        const assign = vi.fn();
        (globalThis as any).window = {
            currentUser: null,
            showLoginModal,
            location: { assign },
        };
        (globalThis as any).document = { querySelectorAll: () => [] };
        (globalThis as any).fetch = fetchMock;

        await WatchLaterUI.toggle(9);

        expect(showLoginModal).toHaveBeenCalledTimes(1);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(assign).not.toHaveBeenCalled();
    });

    it('paints only a confirmed server response and reports failures', async () => {
        const icon = { className: '' };
        const button: any = {
            dataset: { watchLaterToggle: '4', saved: '0', wlHydrated: '1' },
            classList: {
                add: () => undefined,
                remove: () => undefined,
                toggle: () => undefined,
                contains: () => false,
            },
            setAttribute: (name: string, value: string) => { button[name] = value; },
            querySelector: () => icon,
        };
        const events: any[] = [];
        const showToast = vi.fn();
        let saved = false;
        (globalThis as any).window = {
            currentUser: { id: 2 },
            dueli: { showToast },
            dispatchEvent: (event: any) => { events.push(event); return true; },
        };
        (globalThis as any).document = {
            querySelectorAll: (selector: string) =>
                selector.includes('data-watch-later-toggle') ? [button] : [],
        };
        (globalThis as any).CustomEvent = class CustomEvent {
            type: string;
            detail: unknown;
            constructor(type: string, init?: { detail?: unknown }) {
                this.type = type;
                this.detail = init?.detail;
            }
        };
        (globalThis as any).fetch = vi.fn(async () => {
            saved = true;
            return { ok: true, status: 200, json: async () => ({ success: true, data: { saved } }) };
        });

        await WatchLaterUI.toggle(4);

        expect(button['aria-pressed']).toBe('true');
        expect(button.title).toBe(en.watch_collections.remove);
        expect(icon.className).toContain('fa-bookmark');
        expect(events.some((e) => e.type === 'dueli:watch-later-changed' && e.detail.saved === true)).toBe(true);

        // A refused write must not paint a saved state or throw.
        (globalThis as any).fetch = vi.fn(async () => ({
            ok: false,
            status: 500,
            json: async () => ({ success: false, error: 'boom' }),
        }));
        const failedButton: any = {
            'aria-pressed': 'false',
            dataset: { watchLaterToggle: '5', saved: '0', wlHydrated: '1' },
            classList: {
                add: () => undefined,
                remove: () => undefined,
                toggle: () => undefined,
                contains: () => false,
            },
            setAttribute: (name: string, value: string) => { failedButton[name] = value; },
            querySelector: () => ({ className: '' }),
        };
        (globalThis as any).document = {
            querySelectorAll: () => [failedButton],
        };
        await WatchLaterUI.toggle(5);
        expect(failedButton['aria-pressed']).toBe('false');
        expect(showToast).toHaveBeenCalled();
    });
});
