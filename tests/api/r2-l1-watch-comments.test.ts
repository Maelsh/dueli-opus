/**
 * R2-L1 — shared comments + qualified views + H1 watch accumulation (TDD RED first).
 *
 * Contract under test (03 R2-L1 + 05 §R2-L1 + 08 H1/H2/comments):
 * - Comments are shared and persisted via API/SSE with the correct author,
 *   merge by id, and survive refresh; A/B/C converge on the same list/counts.
 * - Presence stays independent from counting; GET details never counts;
 *   one counted view per (identity, competition, UTC day).
 * - H1: 300 cumulative LIVE seconds per (user, competition) unlock rating
 *   eligibility (read by R2-V from one source). Server-derived capped
 *   slices only — replays/duplicates/reconnects/out-of-order never inflate
 *   duration or count; client seconds/user_id are ignored by construction.
 *
 * RED: POST comments return author-less rows, SSE misnames the author,
 * invalid parents 500, GET details inflates total_views, and no watch or
 * heartbeat endpoint exists (404).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import app from '../../src/main';
import { createSqliteD1, SqliteD1 } from '../helpers/sqlite-d1';
import { WatchService } from '../../src/lib/services/WatchService';
import type { D1Database } from '@cloudflare/workers-types';

type Env = Parameters<typeof app.request>[2];

const env = (db: SqliteD1): Env => ({ DB: db }) as unknown as Env;

let ipSeq = 5000;
function headers(token?: string, guest?: string, lang = 'ar'): Record<string, string> {
    ipSeq += 1;
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'r2l1-test',
        'CF-Connecting-IP': `10.11.11.${(ipSeq % 250) + 1}`,
    };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    if (guest !== undefined) h['X-Guest-Token'] = guest;
    void lang;
    return h;
}

async function seedL1(db: SqliteD1): Promise<void> {
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, avatar_url, is_active, language, country) VALUES
         (2, 'a@l1.local', 'user_a', 'x', 'User A Display', 'https://cdn.local/a.png', 1, 'ar', 'SA'),
         (3, 'b@l1.local', 'user_b', 'x', 'User B Display', null, 1, 'ar', 'SA'),
         (4, 'c@l1.local', 'user_c', 'x', 'User C Display', null, 1, 'en', 'EG')`,
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES
         ('sess-l1-a', 2, datetime('now', '+1 day')),
         ('sess-l1-b', 3, datetime('now', '+1 day')),
         ('sess-l1-c', 4, datetime('now', '+1 day'))`,
    ).run();
    await db.prepare(
        `INSERT INTO categories (id, slug, name_ar, name_en, parent_id) VALUES
         (20, 'dialogue', 'حوار', 'Dialogue', NULL)`,
    ).run();
    await db.prepare(
        `INSERT INTO competitions (id, title, description, rules, category_id, creator_id, opponent_id, language, status, total_views, total_comments)
         VALUES
         (10, 'L1 live finals', 'd', 'r', 20, 2, 3, 'ar', 'live', 0, 0),
         (11, 'L1 pending finals', 'd', 'r', 20, 2, NULL, 'ar', 'pending', 0, 0),
         (12, 'L1 done finals', 'd', 'r', 20, 2, 3, 'ar', 'completed', 0, 0)`,
    ).run();
}

async function postComment(
    db: SqliteD1, compId: number, body: Record<string, unknown>, opts: { token?: string; lang?: string } = {},
): Promise<{ status: number; data: any }> {
    const res = await app.request(`/api/competitions/${compId}/comments?lang=${opts.lang ?? 'ar'}`, {
        method: 'POST',
        headers: headers(opts.token),
        body: JSON.stringify(body),
    }, env(db));
    return { status: res.status, data: await res.json() };
}

async function getComments(db: SqliteD1, compId: number): Promise<{ status: number; data: any }> {
    const res = await app.request(`/api/competitions/${compId}/comments?limit=100&offset=0&lang=ar`, {
        headers: headers(),
    }, env(db));
    return { status: res.status, data: await res.json() };
}

async function sseEvents(db: SqliteD1, channel: string): Promise<Array<{ event_type: string; payload: any }>> {
    const rows = await db.prepare(
        `SELECT event_type, payload FROM sse_event_log WHERE channel = ? ORDER BY id ASC`,
    ).bind(channel).all<{ event_type: string; payload: string }>();
    return rows.results.map((r) => ({ event_type: r.event_type, payload: JSON.parse(r.payload) }));
}

async function watchIntent(
    db: SqliteD1, compId: number, opts: { token?: string; guest?: string; lang?: string } = {},
): Promise<{ status: number; data: any }> {
    const res = await app.request(`/api/competitions/${compId}/watch?lang=${opts.lang ?? 'ar'}`, {
        method: 'POST',
        headers: headers(opts.token, opts.guest),
    }, env(db));
    return { status: res.status, data: await res.json() };
}

async function heartbeat(
    db: SqliteD1, compId: number, body: unknown, opts: { token?: string; guest?: string } = {},
): Promise<{ status: number; data: any }> {
    const res = await app.request(`/api/competitions/${compId}/watch-heartbeat?lang=ar`, {
        method: 'POST',
        headers: headers(opts.token, opts.guest),
        body: body === undefined ? undefined : JSON.stringify(body),
    }, env(db));
    return { status: res.status, data: await res.json() };
}

async function showComp(db: SqliteD1, compId: number, opts: { token?: string; guest?: string } = {}) {
    const res = await app.request(`/api/competitions/${compId}?lang=ar`, {
        headers: headers(opts.token, opts.guest),
    }, env(db));
    return { status: res.status, data: await res.json() };
}

describe('R2-L1 — shared comments, qualified views, H1 accumulation', () => {
    let db: SqliteD1;

    beforeEach(async () => {
        db = new SqliteD1();
        await seedL1(db);
    });

    it('1. POST returns the author-joined row; SSE echo names the author', async () => {
        const posted = await postComment(db, 10, { content: 'hello finals' }, { token: 'sess-l1-a' });
        expect(posted.status).toBe(201);
        const row = posted.data.data;
        expect(row.id).toBeGreaterThan(0);
        expect(row.display_name).toBe('User A Display');
        expect(row.username).toBe('user_a');
        expect(row.avatar_url).toBe('https://cdn.local/a.png');
        const events = await sseEvents(db, 'competition:10');
        const created = events.filter((e) => e.event_type === 'comment_new');
        expect(created).toHaveLength(1);
        expect(created[0].payload.comment.id).toBe(row.id);
        expect(created[0].payload.comment.display_name).toBe('User A Display');
        expect(created[0].payload.comment.username).toBe('user_a');
    });

    it('2. A/B/C converge on the same persisted list, counts and authors (refresh-stable)', async () => {
        const a = await postComment(db, 10, { content: 'from A' }, { token: 'sess-l1-a' });
        expect(a.status).toBe(201);
        const b = await postComment(db, 10, { content: 'from B' }, { token: 'sess-l1-b' });
        expect(b.status).toBe(201);
        expect(b.data.data.id).not.toBe(a.data.data.id);
        // C reads (another "device" = fresh GET): same items, total, names.
        const c1 = await getComments(db, 10);
        expect(c1.status).toBe(200);
        expect(c1.data.data.total).toBe(2);
        const names = c1.data.data.items.map((c: any) => c.display_name).sort();
        expect(names).toEqual(['User A Display', 'User B Display']);
        expect(new Set(c1.data.data.items.map((c: any) => c.id)).size).toBe(2);
        // Refresh: identical envelope again (persisted, not DOM-only).
        const c2 = await getComments(db, 10);
        expect(c2.data).toEqual(c1.data);
        // The details payload count agrees with the list total.
        const shown = await showComp(db, 10, { token: 'sess-l1-c' });
        expect(shown.data.data.comments_count).toBe(2);
    });

    it('3. invalid parents, auth and ownership contracts hold (ar/en)', async () => {
        expect((await postComment(db, 10, { content: 'x' })).status).toBe(401);
        expect((await postComment(db, 999, { content: 'x' }, { token: 'sess-l1-a' })).status).toBe(404);
        // Cross-competition parent → 422 (never 500), message localized.
        const other = await postComment(db, 11, { content: 'elsewhere' }, { token: 'sess-l1-a' });
        const cross = await postComment(db, 10, { content: 'bad reply', parent_id: other.data.data.id }, { token: 'sess-l1-a' });
        expect(cross.status).toBe(422);
        const crossEn = await postComment(db, 10, { content: 'bad reply', parent_id: 424242 }, { token: 'sess-l1-a', lang: 'en' });
        expect(crossEn.status).toBe(422);
        expect(cross.data.error).toBeTruthy();
        expect(crossEn.data.error).toBeTruthy();
        expect(cross.data.error).not.toBe(crossEn.data.error);
        // Missing parent → 422 as well.
        expect((await postComment(db, 10, { content: 'ghost', parent_id: 424243 }, { token: 'sess-l1-a' })).status).toBe(422);
        // Non-owner delete → 403; owner delete syncs a deletion event.
        const mine = await postComment(db, 10, { content: 'mine' }, { token: 'sess-l1-a' });
        const forbidden = await app.request(`/api/competitions/10/comments/${mine.data.data.id}?lang=ar`, {
            method: 'DELETE', headers: headers('sess-l1-b'),
        }, env(db));
        expect(forbidden.status).toBe(403);
        const gone = await app.request(`/api/competitions/10/comments/${mine.data.data.id}?lang=ar`, {
            method: 'DELETE', headers: headers('sess-l1-a'),
        }, env(db));
        expect(gone.status).toBe(200);
        const events = await sseEvents(db, 'competition:10');
        expect(events.some((e) => e.event_type === 'comment_deleted' && e.payload.comment_id === mine.data.data.id)).toBe(true);
        const after = await getComments(db, 10);
        expect(after.data.data.items.some((c: any) => c.id === mine.data.data.id)).toBe(false);
    });

    it('4. GET details never counts a view', async () => {
        for (let i = 0; i < 3; i++) {
            const shown = await showComp(db, 10, { token: 'sess-l1-a' });
            expect(shown.status).toBe(200);
            expect(shown.data.data.total_views).toBe(0);
        }
        const row = await db.prepare(`SELECT total_views AS v FROM competitions WHERE id = 10`).first<{ v: number }>();
        expect(row?.v).toBe(0);
    });

    it('5. H2: one counted view per identity/competition/day', async () => {
        const first = await watchIntent(db, 10, { token: 'sess-l1-a' });
        expect(first.status).toBe(200);
        expect(first.data.data.counted).toBe(true);
        expect(first.data.data.total_views).toBe(1);
        // Repeat same day: informational only, counter still.
        const repeat = await watchIntent(db, 10, { token: 'sess-l1-a' });
        expect(repeat.data.data.counted).toBe(false);
        expect(repeat.data.data.total_views).toBe(1);
        // Another user counts; another competition counts separately.
        expect((await watchIntent(db, 10, { token: 'sess-l1-b' })).data.data).toMatchObject({ counted: true, total_views: 2 });
        expect((await watchIntent(db, 11, { token: 'sess-l1-a' })).data.data.counted).toBe(true);
        // Guest identity counts once; replay does not.
        const g1 = await watchIntent(db, 10, { guest: 'guest-l1-viewer-01' });
        expect(g1.data.data.counted).toBe(true);
        expect(g1.data.data.total_views).toBe(3);
        const g2 = await watchIntent(db, 10, { guest: 'guest-l1-viewer-01' });
        expect(g2.data.data.counted).toBe(false);
        expect(g2.data.data.total_views).toBe(3);
        // Anonymous first touch is issued a first-party token (no IP identity).
        const anon = await watchIntent(db, 10, {});
        expect(anon.data.data.counted).toBe(true);
        expect(anon.data.data.guest_token).toBeTruthy();
        expect(anon.data.data.total_views).toBe(4);
        // Unknown competition → 404, nothing written.
        expect((await watchIntent(db, 999, { token: 'sess-l1-a' })).status).toBe(404);
    });

    it('6. H2: a new UTC day counts again (server day grain)', async () => {
        expect((await watchIntent(db, 10, { token: 'sess-l1-a' })).data.data.counted).toBe(true);
        await db.prepare(`UPDATE competition_views SET view_day = '2000-01-01' WHERE competition_id = 10`).run();
        const next = await watchIntent(db, 10, { token: 'sess-l1-a' });
        expect(next.data.data.counted).toBe(true);
        expect(next.data.data.total_views).toBe(2);
    });

    it('7. heartbeat opens H1 at 0 and never trusts the body', async () => {
        const pulse = await heartbeat(db, 10, {}, { token: 'sess-l1-a' });
        expect(pulse.status).toBe(200);
        expect(pulse.data.data.live).toBe(true);
        expect(pulse.data.data.counted).toBe(true); // first pulse also counts H2
        expect(pulse.data.data.watch_seconds).toBe(0);
        expect(pulse.data.data.watch_eligible).toBe(false);
        expect(pulse.data.data.watch_required).toBe(300);
        // Forged body claims change nothing.
        const forged = await heartbeat(db, 10, { seconds: 99999, user_id: 3, live: true }, { token: 'sess-l1-a' });
        expect(forged.data.data.watch_seconds).toBe(0);
        const seconds = await db.prepare(
            `SELECT watch_duration_seconds AS s FROM watch_history WHERE user_id = 2 AND competition_id = 10`,
        ).first<{ s: number }>();
        expect(seconds?.s).toBe(0);
    });

    it('8. heartbeat credits server-measured time, capped per pulse; replays add ~0', async () => {
        await heartbeat(db, 10, {}, { token: 'sess-l1-a' });
        // 60s of real (server) elapsed → +60.
        await db.prepare(`UPDATE watch_history SET watched_at = datetime('now', '-60 seconds') WHERE user_id = 2 AND competition_id = 10`).run();
        const p1 = await heartbeat(db, 10, {}, { token: 'sess-l1-a' });
        expect(p1.data.data.watch_seconds).toBe(60);
        // Ancient mark → capped at the per-pulse bound, not the full gap.
        await db.prepare(`UPDATE watch_history SET watched_at = datetime('now', '-10000 seconds') WHERE user_id = 2 AND competition_id = 10`).run();
        const p2 = await heartbeat(db, 10, {}, { token: 'sess-l1-a' });
        expect(p2.data.data.watch_seconds).toBe(60 + 120);
        // Instant duplicate/reconnect replay → +0.
        const p3 = await heartbeat(db, 10, {}, { token: 'sess-l1-a' });
        expect(p3.data.data.watch_seconds).toBe(p2.data.data.watch_seconds);
        expect(p3.data.data.counted).toBe(false);
    });

    it('9. H1 boundary: 299 ineligible, 300 eligible (single source for V)', async () => {
        await heartbeat(db, 10, {}, { token: 'sess-l1-a' });
        await db.prepare(`UPDATE watch_history SET watch_duration_seconds = 299 WHERE user_id = 2 AND competition_id = 10`).run();
        const service = new WatchService(db as unknown as D1Database);
        expect(await service.getViewerWatch(10, 2)).toEqual({ seconds: 299, eligible: false, required: 300 });
        await db.prepare(`UPDATE watch_history SET watch_duration_seconds = 300 WHERE user_id = 2 AND competition_id = 10`).run();
        expect(await service.getViewerWatch(10, 2)).toEqual({ seconds: 300, eligible: true, required: 300 });
        // The details payload exposes the same source to the current user.
        const shown = await showComp(db, 10, { token: 'sess-l1-a' });
        expect(shown.data.data.viewer_watch).toEqual({ seconds: 300, eligible: true, required: 300 });
        // Guests and anonymous readers get no watch state (they cannot rate).
        expect((await showComp(db, 10, { guest: 'guest-l1-viewer-01' })).data.data.viewer_watch).toBeNull();
        expect((await showComp(db, 10, {})).data.data.viewer_watch).toBeNull();
    });

    it('10. non-live competitions and guests never accumulate H1', async () => {
        // Pending: intent counts H2, duration stays null.
        const p = await heartbeat(db, 11, {}, { token: 'sess-l1-a' });
        expect(p.data.data.live).toBe(false);
        expect(p.data.data.counted).toBe(true);
        expect(p.data.data.watch_seconds).toBeNull();
        expect(p.data.data.watch_eligible).toBe(false);
        // Completed: same — watching a recording is not live watch time.
        const c = await heartbeat(db, 12, {}, { token: 'sess-l1-a' });
        expect(c.data.data.live).toBe(false);
        expect(c.data.data.watch_seconds).toBeNull();
        // Guest on live: H2 counted, H1 untouched (no row possible).
        const g = await heartbeat(db, 10, {}, { guest: 'guest-l1-viewer-02' });
        expect(g.data.data.counted).toBe(true);
        expect(g.data.data.watch_seconds).toBeNull();
        const rows = await db.prepare(`SELECT COUNT(*) AS n FROM watch_history`).first<{ n: number }>();
        expect(rows?.n).toBe(0);
    });

    it('11. concurrent first views serialize: exactly one counts', async () => {
        const service = new WatchService(db as unknown as D1Database);
        const identity = { kind: 'user' as const, key: 'user:2' };
        const results = await Promise.all([
            service.recordWatchIntent(10, identity),
            service.recordWatchIntent(10, identity),
            service.recordWatchIntent(10, identity),
        ]);
        expect(results.filter((r) => r.counted)).toHaveLength(1);
        expect(results[0].totalViews).toBe(1);
        const row = await db.prepare(`SELECT total_views AS v FROM competitions WHERE id = 10`).first<{ v: number }>();
        expect(row?.v).toBe(1);
    });

    it('12. CompetitionController holds no SQL (MVC: queries live in Models/services)', () => {
        const src = readFileSync(join(process.cwd(), 'src/controllers/CompetitionController.ts'), 'utf-8');
        expect(src).not.toMatch(/\.prepare\(|SELECT\s|INSERT\s+INTO|UPDATE\s+competitions|DELETE\s+FROM/i);
    });
});
