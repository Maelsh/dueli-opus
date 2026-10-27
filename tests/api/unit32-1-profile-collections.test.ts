/**
 * UNIT32.1 / R4-PROFILE-COLLECTIONS-1 — owner-only Watch Later and Viewing
 * History collections.
 *
 * Runs the real route + controller + model SQL on the real migrations
 * (node:sqlite D1 shim). Pins:
 *  - identity comes from the session only: guests get 401, a client-supplied
 *    `user_id` is ignored, and one account can neither read nor mutate another
 *    account's collections;
 *  - Watch Later is an explicit, idempotent add/remove (no duplicate rows);
 *  - pagination is a stable keyset cursor ordered by time DESC with a
 *    deterministic id tie-break, and it reaches exhaustion over >2 pages;
 *  - Viewing History only lists rows written by real watch signals. A card
 *    view, a page GET, a preview or the H2 watch-intent endpoint must not
 *    create history rows;
 *  - the VOD history touch only moves `watched_at` on completed/archived
 *    competitions and never resets `watch_duration_seconds`/`completed`
 *    (300s eligibility and H1/H2 stay untouched);
 *  - unavailable content stays in history without leaking user-private fields.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import app from '../../src/main';
import { createSqliteD1, SqliteD1 } from '../helpers/sqlite-d1';

type Env = Parameters<typeof app.request>[2];
const env = (db: SqliteD1): Env => ({ DB: db }) as unknown as Env;

let ipSeq = 56000;
function headers(token?: string): Record<string, string> {
    ipSeq += 1;
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'unit32-1-collections',
        'CF-Connecting-IP': `10.66.66.${(ipSeq % 250) + 1}`,
    };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    return h;
}

async function api(db: SqliteD1, method: string, path: string, token?: string, body?: unknown) {
    const res = await app.request(`${path}${path.includes('?') ? '&' : '?'}lang=en`, {
        method,
        headers: headers(token),
        body: body === undefined ? undefined : JSON.stringify(body),
    }, env(db));
    const text = await res.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { data = null; }
    return { status: res.status, data, text };
}

const TOK_A = 'tok-unit32-1-a';
const TOK_B = 'tok-unit32-1-b';

async function seed(db: SqliteD1): Promise<void> {
    await db.prepare(`
        INSERT INTO users (id, email, username, password_hash, display_name, is_active, is_verified, language, country, is_fake)
        VALUES
          (2, 'a@unit32-1.local', 'unit32_1_a', 'x', 'Unit A', 1, 1, 'ar', 'SA', 0),
          (3, 'b@unit32-1.local', 'unit32_1_b', 'x', 'Unit B', 1, 1, 'ar', 'SA', 0)
    `).run();
    await db.prepare(`
        INSERT INTO sessions (id, user_id, expires_at) VALUES
          ('${TOK_A}', 2, datetime('now', '+1 day')),
          ('${TOK_B}', 3, datetime('now', '+1 day'))
    `).run();
    await db.prepare(`
        INSERT INTO categories (id, slug, name_ar, name_en, icon, color)
        VALUES (1, 'unit32-1-general', 'عام', 'General', 'fas fa-trophy', '#8B5CF6')
    `).run();
}

async function seedCompetitions(db: SqliteD1, count: number, status = 'completed'): Promise<void> {
    const values: string[] = [];
    for (let i = 1; i <= count; i += 1) {
        values.push(`(${i}, 'Unit competition ${i}', 'rules', 1, 2, '${status}', 0)`);
    }
    await db.prepare(`
        INSERT INTO competitions (id, title, rules, category_id, creator_id, status, is_fake)
        VALUES ${values.join(',')}
    `).run();
}

async function countRows(db: SqliteD1, table: 'watch_history' | 'watch_later', userId: number): Promise<number> {
    const row = await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).bind(userId).first<{ n: number }>();
    return Number(row?.n ?? 0);
}

interface PageItem { id: number; title: string; status: string }

async function collectPages(
    db: SqliteD1,
    token: string,
    kind: 'later' | 'history',
    limit: number
): Promise<{ ids: number[]; pages: number; hasMoreFlags: boolean[] }> {
    const ids: number[] = [];
    const hasMoreFlags: boolean[] = [];
    let cursor: string | null = null;
    let pages = 0;
    for (let guard = 0; guard < 20; guard += 1) {
        const suffix: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
        const res = await api(db, 'GET', `/api/watch/${kind}?limit=${limit}${suffix}`, token);
        expect(res.status, `page ${pages + 1} of ${kind} must succeed: ${res.text}`).toBe(200);
        const data = res.data.data as { items: PageItem[]; nextCursor: string | null; hasMore: boolean };
        ids.push(...data.items.map((item) => item.id));
        hasMoreFlags.push(data.hasMore);
        pages += 1;
        cursor = data.nextCursor;
        if (!cursor) break;
        expect(data.hasMore, 'a cursor must only be returned when more rows exist').toBe(true);
    }
    return { ids, pages, hasMoreFlags };
}

describe('UNIT32.1 R4-PROFILE-COLLECTIONS-1 — owner-only collections', () => {
    let db: SqliteD1;

    beforeEach(async () => {
        db = createSqliteD1();
        await seed(db);
        await seedCompetitions(db, 16);
    });

    it('rejects every guest call and writes nothing', async () => {
        const calls: Array<[string, string]> = [
            ['GET', '/api/watch/later'],
            ['GET', '/api/watch/history'],
            ['GET', '/api/watch/later/status?ids=1,2'],
            ['POST', '/api/watch/later/1'],
            ['DELETE', '/api/watch/later/1'],
            ['POST', '/api/watch/history/1'],
        ];
        for (const [method, path] of calls) {
            const res = await api(db, method, path);
            expect(res.status, `${method} ${path} must require a session`).toBe(401);
        }
        expect(await countRows(db, 'watch_later', 2)).toBe(0);
        expect(await countRows(db, 'watch_history', 2)).toBe(0);
    });

    it('Watch Later is an explicit, idempotent, owner-scoped add/remove', async () => {
        const first = await api(db, 'POST', '/api/watch/later/1', TOK_A, { user_id: 3 });
        expect(first.status).toBe(200);
        expect(first.data.data).toMatchObject({ competition_id: 1, saved: true, added: true });

        const second = await api(db, 'POST', '/api/watch/later/1', TOK_A, { user_id: 3 });
        expect(second.status).toBe(200);
        expect(second.data.data).toMatchObject({ competition_id: 1, saved: true, added: false });

        // The forged body user_id was ignored: A owns the only row.
        expect(await countRows(db, 'watch_later', 2)).toBe(1);
        expect(await countRows(db, 'watch_later', 3)).toBe(0);

        await api(db, 'POST', '/api/watch/later/2', TOK_A);
        await api(db, 'POST', '/api/watch/later/3', TOK_B);

        const statusA = await api(db, 'GET', '/api/watch/later/status?ids=1,2,3', TOK_A);
        expect(statusA.status).toBe(200);
        expect([...statusA.data.data.saved].sort()).toEqual([1, 2]);

        const statusB = await api(db, 'GET', '/api/watch/later/status?ids=1,2,3', TOK_B);
        expect(statusB.data.data.saved).toEqual([3]);

        // B cannot read A's list and cannot remove A's row.
        const listB = await api(db, 'GET', '/api/watch/later?limit=20', TOK_B);
        expect(listB.status).toBe(200);
        expect(listB.data.data.items.map((i: PageItem) => i.id)).toEqual([3]);

        const removeByB = await api(db, 'DELETE', '/api/watch/later/1', TOK_B);
        expect(removeByB.status).toBe(200);
        expect(removeByB.data.data).toMatchObject({ saved: false, removed: false });
        expect(await countRows(db, 'watch_later', 2)).toBe(2);

        const removeByA = await api(db, 'DELETE', '/api/watch/later/1', TOK_A);
        expect(removeByA.status).toBe(200);
        expect(removeByA.data.data).toMatchObject({ saved: false, removed: true });
        const removeAgain = await api(db, 'DELETE', '/api/watch/later/1', TOK_A);
        expect(removeAgain.data.data).toMatchObject({ saved: false, removed: false });
        expect(await countRows(db, 'watch_later', 2)).toBe(1);
    });

    it('refuses adding a missing or cancelled competition without writing a row', async () => {
        const missing = await api(db, 'POST', '/api/watch/later/9999', TOK_A);
        expect(missing.status).toBe(404);

        await db.prepare(`UPDATE competitions SET status = 'cancelled' WHERE id = 5`).run();
        const cancelled = await api(db, 'POST', '/api/watch/later/5', TOK_A);
        expect(cancelled.status).toBe(404);
        expect(await countRows(db, 'watch_later', 2)).toBe(0);
    });

    it('paginates Watch Later to exhaustion with a stable time+id keyset (>2 pages)', async () => {
        // Deliberate ties: four rows per timestamp. The only stable order is
        // added_at DESC, competition_id DESC.
        const stamps = [
            '2026-01-01 10:00:00',
            '2026-01-01 10:00:00',
            '2026-01-01 10:00:00',
            '2026-01-01 10:00:00',
            '2026-01-02 10:00:00',
            '2026-01-02 10:00:00',
            '2026-01-02 10:00:00',
            '2026-01-02 10:00:00',
            '2026-01-03 10:00:00',
            '2026-01-03 10:00:00',
            '2026-01-03 10:00:00',
            '2026-01-03 10:00:00',
            '2026-01-04 10:00:00',
        ];
        for (let i = 0; i < stamps.length; i += 1) {
            await db.prepare(`
                INSERT INTO watch_later (user_id, competition_id, added_at) VALUES (?, ?, ?)
            `).bind(2, i + 1, stamps[i]).run();
        }

        const expected = stamps
            .map((added_at, index) => ({ added_at, id: index + 1 }))
            .sort((a, b) => b.added_at.localeCompare(a.added_at) || b.id - a.id)
            .map((r) => r.id);

        const collected = await collectPages(db, TOK_A, 'later', 5);
        expect(collected.pages).toBe(3);
        expect(collected.hasMoreFlags).toEqual([true, true, false]);
        expect(collected.ids).toEqual(expected);
        expect(new Set(collected.ids).size).toBe(stamps.length);

        // A second walk yields the identical order (no RANDOM/OFFSET drift).
        const replay = await collectPages(db, TOK_A, 'later', 5);
        expect(replay.ids).toEqual(expected);
    });

    it('rejects a malformed or forged cursor with 422 and leaks no rows', async () => {
        await api(db, 'POST', '/api/watch/later/1', TOK_A);
        await api(db, 'POST', '/api/watch/later/2', TOK_A);

        for (const cursor of ['not-a-cursor', 'eyJ0Ijoibm90LWEtZGF0ZSIsImkiOjF9']) {
            const res = await api(db, 'GET', `/api/watch/later?limit=5&cursor=${encodeURIComponent(cursor)}`, TOK_A);
            expect(res.status, `cursor ${cursor} must be refused`).toBe(422);
            expect(res.data.success).toBe(false);
        }
    });

    it('Viewing History lists only real watch rows, newest first with a stable tie-break', async () => {
        await db.prepare(`
            INSERT INTO watch_history (user_id, competition_id, watch_duration_seconds, completed, watched_at) VALUES
              (2, 1, 0, 0, '2026-02-01 10:00:00'),
              (2, 2, 0, 0, '2026-02-02 10:00:00'),
              (2, 3, 0, 0, '2026-02-02 10:00:00'),
              (2, 4, 0, 0, '2026-02-03 10:00:00'),
              (3, 5, 0, 0, '2026-02-04 10:00:00')
        `).run();

        const collected = await collectPages(db, TOK_A, 'history', 2);
        expect(collected.pages).toBe(2);
        expect(collected.ids).toEqual([4, 3, 2, 1]);
        expect(collected.hasMoreFlags).toEqual([true, false]);

        const list = await api(db, 'GET', '/api/watch/history?limit=2', TOK_A);
        const items = list.data.data.items as Array<{ id: number; completed: unknown; watch_duration_seconds: number }>;
        // No fake completion: the stored value is returned truthfully (0).
        expect(items.every((item) => Number(item.completed) === 0)).toBe(true);
        expect(items.every((item) => Number(item.watch_duration_seconds) === 0)).toBe(true);

        const bList = await api(db, 'GET', '/api/watch/history?limit=20', TOK_B);
        expect(bList.data.data.items.map((i: PageItem) => i.id)).toEqual([5]);
    });

    it('a page view, a card preview or the H2 watch-intent never creates history', async () => {
        const before = await countRows(db, 'watch_history', 2);

        // Page + card render (SSR and recommendation GETs).
        await app.request('/competition/1?lang=en', { headers: headers(TOK_A) }, env(db));
        await app.request('/profile/unit32_1_a?lang=en', { headers: headers(TOK_A) }, env(db));
        await api(db, 'GET', '/api/watch/history?limit=20', TOK_A);

        // H2 counts a unique view (competition_views), not a watch-history row.
        const intent = await api(db, 'POST', '/api/competitions/1/watch', TOK_A);
        expect([200, 201]).toContain(intent.status);

        expect(await countRows(db, 'watch_history', 2)).toBe(before);
    });

    it('the VOD touch records a real playback event without touching seconds/completion', async () => {
        await db.prepare(`
            INSERT INTO watch_history (user_id, competition_id, watch_duration_seconds, completed, watched_at)
            VALUES (2, 1, 300, 1, '2026-01-01 00:00:00')
        `).run();

        const record = await api(db, 'POST', '/api/watch/history/1', TOK_A);
        expect(record.status).toBe(200);
        expect(record.data.data).toMatchObject({ competition_id: 1, recorded: true });

        const row = await db.prepare(`
            SELECT watch_duration_seconds AS seconds, completed, watched_at
            FROM watch_history WHERE user_id = 2 AND competition_id = 1
        `).first<{ seconds: number; completed: number; watched_at: string }>();
        expect(Number(row?.seconds), 'H1 seconds must never be reset by VOD watching').toBe(300);
        expect(Number(row?.completed), 'completion flag must never be flipped by a UI touch').toBe(1);
        expect(row?.watched_at).not.toBe('2026-01-01 00:00:00');

        // Idempotent: a second playback event keeps exactly one row.
        const again = await api(db, 'POST', '/api/watch/history/1', TOK_A);
        expect(again.status).toBe(200);
        expect(await countRows(db, 'watch_history', 2)).toBe(1);

        // A LIVE competition must never accept the VOD touch (it would move
        // the H1 heartbeat mark and zero the next server-derived delta).
        await db.prepare(`UPDATE competitions SET status = 'live' WHERE id = 2`).run();
        await db.prepare(`
            INSERT INTO watch_history (user_id, competition_id, watch_duration_seconds, completed, watched_at)
            VALUES (2, 2, 120, 0, '2026-01-01 00:00:00')
        `).run();
        const live = await api(db, 'POST', '/api/watch/history/2', TOK_A);
        expect(live.status).toBe(404);
        const liveRow = await db.prepare(`
            SELECT watch_duration_seconds AS seconds, watched_at
            FROM watch_history WHERE user_id = 2 AND competition_id = 2
        `).first<{ seconds: number; watched_at: string }>();
        expect(Number(liveRow?.seconds)).toBe(120);
        expect(liveRow?.watched_at).toBe('2026-01-01 00:00:00');

        const missing = await api(db, 'POST', '/api/watch/history/9999', TOK_A);
        expect(missing.status).toBe(404);
    });

    it('treats the VOD endpoint as an authenticated client signal with no body-controlled state', async () => {
        // The endpoint cannot prove five seconds of playback on the server:
        // a direct authenticated POST creates the completed/archived row just
        // like the player does. The contract is a guarded CLIENT SIGNAL, not
        // server-side playback evidence. What the server DOES enforce is
        // identity, VOD status, idempotency, and that no request body can
        // change watch seconds or completion.
        await db.prepare(`UPDATE competitions SET status = 'archived' WHERE id = 7`).run();

        const direct = await api(db, 'POST', '/api/watch/history/7', TOK_A, {
            user_id: 3,
            watch_duration_seconds: 9999,
            completed: true,
            watched_at: '1999-01-01 00:00:00',
        });
        expect(direct.status).toBe(200);
        expect(direct.data.data).toMatchObject({ competition_id: 7, recorded: true });

        const row = await db.prepare(`
            SELECT watch_duration_seconds AS seconds, completed, watched_at
            FROM watch_history WHERE user_id = 2 AND competition_id = 7
        `).first<{ seconds: number; completed: number; watched_at: string }>();
        expect(Number(row?.seconds), 'body-supplied seconds must be ignored').toBe(0);
        expect(Number(row?.completed), 'body-supplied completion must be ignored').toBe(0);
        expect(row?.watched_at).not.toBe('1999-01-01 00:00:00');
        expect(await countRows(db, 'watch_history', 2)).toBe(1);
        expect(await countRows(db, 'watch_history', 3), 'body-supplied user_id must be ignored').toBe(0);
    });

    it('keeps unavailable content in history without leaking user-private fields', async () => {
        await db.prepare(`
            INSERT INTO watch_history (user_id, competition_id, watch_duration_seconds, completed, watched_at)
            VALUES (2, 6, 45, 0, '2026-03-01 10:00:00')
        `).run();
        await db.prepare(`UPDATE competitions SET status = 'cancelled' WHERE id = 6`).run();

        const res = await api(db, 'GET', '/api/watch/history?limit=20', TOK_A);
        expect(res.status).toBe(200);
        const items = res.data.data.items as Array<{ id: number; status: string }>;
        expect(items.map((item) => item.id)).toContain(6);
        expect(items.find((item) => item.id === 6)?.status).toBe('cancelled');

        // The list contract exposes card data only — never account internals.
        expect(res.text).not.toContain('a@unit32-1.local');
        expect(res.text).not.toContain('password_hash');
        expect(res.text).not.toContain('"bio"');
        expect(await countRows(db, 'watch_history', 2)).toBe(1);
    });
});
