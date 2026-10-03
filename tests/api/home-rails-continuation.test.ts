/**
 * R3-RAILS-1A + 1B — every Home rail freezes its full qualified set and
 * pages it to real exhaustion on the shared #75 session store.
 *
 * Rails under test (POST /api/home-rails/sessions + GET .../sessions/:id/page):
 * - Suggested Guest/User × Live/Recorded/Upcoming (status actually filters;
 *   #76's status-less provider is untouched).
 * - Dialogue/Science/Talents + every subcategory × Live/Recorded/Upcoming.
 * - live=live; upcoming=pending+accepted; recorded=completed+PLAYABLE
 *   (trimmed vod_url OR youtube_video_url — NULL/empty/whitespace never
 *   enters a Recorded rail).
 * - Guests SEE upcoming rails but gain no action rights (invite/join stay
 *   401 for guests).
 * - Full qualified set frozen at T0 (a 151-row live rail proves no
 *   limit=15/100 pool cap); skip-and-fill on eligibility loss; true
 *   exhaustion only from hasMore=false; per-rail isolation (no global
 *   dedup); context drift (tab/category/language/identity) → 409 reset;
 *   TTL → 410; foreign identity → 404; retry re-reads the same cursor.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';

type Env = Parameters<typeof app.request>[2];

const env = (db: SqliteD1): Env => ({ DB: db }) as unknown as Env;

let ipSeq = 200;
function headers(token?: string, guest?: string): Record<string, string> {
    ipSeq += 1;
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'r3rails-test',
        'CF-Connecting-IP': `10.8.8.${(ipSeq % 250) + 1}`,
    };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    if (guest !== undefined) h['X-Guest-Token'] = guest;
    return h;
}

interface RailBody {
    kind: string;
    category?: string;
    subcategory?: string;
    status: string;
}

interface SessionPayload {
    session: { id: string; total: number; expires_at: string };
    guest_token: string | null;
}

interface PagePayload {
    items: Array<{ id: number; title: string; status: string }>;
    nextCursor: string | null;
    hasMore: boolean;
    session: { id: string; total: number };
}

async function createRail(
    db: SqliteD1, body: RailBody, opts: { token?: string; guest?: string; lang?: string } = {},
): Promise<{ status: number; data: SessionPayload | null }> {
    const res = await app.request(`/api/home-rails/sessions?lang=${opts.lang ?? 'ar'}`, {
        method: 'POST',
        headers: headers(opts.token, opts.guest),
        body: JSON.stringify(body),
    }, env(db));
    const json = (await res.json()) as { success: boolean; data: SessionPayload };
    return { status: res.status, data: json.success ? json.data : null };
}

async function readRail(
    db: SqliteD1, sessionId: string, echo: RailBody,
    opts: { cursor?: string; limit?: number; token?: string; guest?: string; lang?: string } = {},
): Promise<{ status: number; data: PagePayload | null }> {
    const q = new URLSearchParams();
    q.set('kind', echo.kind);
    if (echo.category !== undefined) q.set('category', echo.category);
    if (echo.subcategory !== undefined) q.set('subcategory', echo.subcategory);
    q.set('status', echo.status);
    if (opts.cursor !== undefined) q.set('cursor', opts.cursor);
    if (opts.limit !== undefined) q.set('limit', String(opts.limit));
    q.set('lang', opts.lang ?? 'ar');
    const res = await app.request(
        `/api/home-rails/sessions/${sessionId}/page?${q.toString()}`,
        { headers: headers(opts.token, opts.guest) },
        env(db),
    );
    const json = (await res.json()) as { success: boolean; data: PagePayload };
    return { status: res.status, data: json.success ? json.data : null };
}

interface Seed {
    ownLive: number[];
    blockedLiveDialogue: number[];
    blockedPendingScience: number;
    youtubeOnly: number[];
    invalidRecorded: number[];
    hiddenLive: number;
    pendingSample: number;
}

async function seed(db: SqliteD1): Promise<Seed> {
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_active, language, country) VALUES
         (2, 'creator@hr.local', 'creatorhr', 'x', 'Creator', 1, 'ar', 'SA'),
         (3, 'viewer@hr.local', 'viewerhr', 'x', 'Viewer', 1, 'ar', 'SA'),
         (4, 'blocked@hr.local', 'blockedhr', 'x', 'Blocked', 1, 'ar', 'SA')`,
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES ('sess-hr-user3', 3, datetime('now', '+1 day'))`,
    ).run();
    await db.prepare(
        `INSERT INTO categories (id, slug, name_ar, name_en, parent_id) VALUES
         (10, 'dialogue', 'حوار', 'Dialogue', NULL),
         (11, 'science', 'علوم', 'Science', NULL),
         (12, 'talents', 'مواهب', 'Talents', NULL),
         (13, 'physics', 'فيزياء', 'Physics', 11),
         (14, 'religions', 'أديان', 'Religions', 10)`,
    ).run();
    // user3 ↔ user4 block (either direction excludes from user rails).
    await db.prepare(
        `INSERT INTO user_blocks (blocker_id, blocked_id, reason) VALUES (3, 4, 't')`,
    ).run();

    const stmt = db.prepare(
        `INSERT INTO competitions
            (title, description, rules, category_id, subcategory_id, creator_id, language, status, created_at, total_views, vod_url, youtube_video_url)
         VALUES (?, 'd', 'r', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    let n = 0;
    const add = async (
        cat: number, sub: number | null, creator: number, lang: string, status: string,
        vod: string | null, yt: string | null, views = 5,
    ): Promise<number> => {
        n += 1;
        const created = `2026-03-${String((n % 27) + 1).padStart(2, '0')} 10:00:00`;
        const r = await stmt.bind(`HR probe ${n}`, cat, sub, creator, lang, status, created, views, vod, yt).run();
        return Number(r.meta.last_row_id);
    };

    // Dialogue: 8 live, 8 pending, 4 accepted, 6 completed+vod, 2 youtube-only,
    // 2 invalid (null), 1 empty-vod, tombstones.
    for (let k = 0; k < 8; k++) await add(10, null, 2, k % 2 ? 'en' : 'ar', 'live', null, null, k * 3);
    for (let k = 0; k < 8; k++) await add(10, null, 2, 'ar', 'pending', null, null, k);
    for (let k = 0; k < 4; k++) await add(10, null, 2, 'ar', 'accepted', null, null, k);
    for (let k = 0; k < 6; k++) await add(10, null, 2, 'ar', 'completed', `https://example.test/vod-hr-${k}.mp4`, null, k);
    const youtubeOnly: number[] = [];
    for (let k = 0; k < 2; k++) youtubeOnly.push(await add(10, null, 2, 'ar', 'completed', null, `yt-hr-${k}`, k));
    const invalidRecorded: number[] = [];
    invalidRecorded.push(await add(10, null, 2, 'ar', 'completed', null, null));
    invalidRecorded.push(await add(10, null, 2, 'ar', 'completed', null, null));
    invalidRecorded.push(await add(10, null, 2, 'ar', 'completed', '', null));
    await add(10, null, 2, 'ar', 'suspended', 'https://example.test/vod-x.mp4', null, 9999);
    await add(10, null, 2, 'ar', 'cancelled', null, null, 9999);
    await add(10, null, 2, 'ar', 'archived', 'https://example.test/vod-x.mp4', null, 9999);

    // Science: 6 live, 6 pending, 3 completed+vod, 1 whitespace-vod, +120 bulk live.
    for (let k = 0; k < 6; k++) await add(11, null, 2, k % 2 ? 'ar' : 'en', 'live', null, null, k * 7);
    for (let k = 0; k < 6; k++) await add(11, null, 2, 'ar', 'pending', null, null, k);
    for (let k = 0; k < 3; k++) await add(11, null, 2, 'ar', 'completed', `https://example.test/vod-hs-${k}.mp4`, null, k);
    invalidRecorded.push(await add(11, null, 2, 'ar', 'completed', '   ', null));

    // Talents: 5 live, 5 pending, 2 completed+vod.
    for (let k = 0; k < 5; k++) await add(12, null, 2, 'ar', 'live', null, null, k);
    for (let k = 0; k < 5; k++) await add(12, null, 2, 'en', 'pending', null, null, k);
    for (let k = 0; k < 2; k++) await add(12, null, 2, 'ar', 'completed', `https://example.test/vod-ht-${k}.mp4`, null, k);

    // Physics sub (science family): 4 live, 3 pending, 2 completed+vod.
    for (let k = 0; k < 4; k++) await add(11, 13, 2, 'ar', 'live', null, null, k);
    for (let k = 0; k < 3; k++) await add(11, 13, 2, 'ar', 'pending', null, null, k);
    for (let k = 0; k < 2; k++) await add(11, 13, 2, 'ar', 'completed', `https://example.test/vod-hp-${k}.mp4`, null, k);

    // Religions sub (dialogue family): 3 live, 2 pending, 1 completed+vod.
    for (let k = 0; k < 3; k++) await add(10, 14, 2, 'ar', 'live', null, null, k);
    for (let k = 0; k < 2; k++) await add(10, 14, 2, 'ar', 'pending', null, null, k);
    await add(10, 14, 2, 'ar', 'completed', 'https://example.test/vod-hrel-0.mp4', null, 1);

    // Blocked creator rows (visible to guests, out of user rails).
    const blockedLiveDialogue: number[] = [];
    for (let k = 0; k < 3; k++) blockedLiveDialogue.push(await add(10, null, 4, 'ar', 'live', null, null, k));
    const blockedPendingScience = await add(11, null, 4, 'ar', 'pending', null, null, 1);

    // Own rows (creator = viewer user3): out of user SUGGESTED, in category rails.
    const ownLive: number[] = [];
    for (let k = 0; k < 2; k++) ownLive.push(await add(10, null, 3, 'ar', 'live', null, null, k));

    // Bulk: 120 extra live science rows (no pool cap may hide them).
    for (let k = 0; k < 120; k++) {
        await add(11, null, 2, k % 2 ? 'en' : 'ar', 'live', null, null, k);
    }

    // One hide: user3 hides a creator-2 live dialogue row.
    const hiddenRow = await db.prepare(
        `SELECT id FROM competitions WHERE creator_id = 2 AND category_id = 10 AND status = 'live' LIMIT 1`,
    ).first<{ id: number }>();
    const hiddenLive = Number(hiddenRow?.id);
    await db.prepare(
        `INSERT INTO user_hidden_competitions (user_id, competition_id) VALUES (3, ?)`,
    ).bind(hiddenLive).run();

    const pendingRow = await db.prepare(
        `SELECT id FROM competitions WHERE status = 'pending' AND creator_id = 2 LIMIT 1`,
    ).first<{ id: number }>();

    return {
        ownLive, blockedLiveDialogue, blockedPendingScience,
        youtubeOnly, invalidRecorded, hiddenLive, pendingSample: Number(pendingRow?.id),
    };
}

async function traverseAll(
    db: SqliteD1, sessionId: string, echo: RailBody, limit: number,
    opts: { guest?: string; token?: string; lang?: string } = {},
): Promise<number[]> {
    const ids: number[] = [];
    let cursor: string | undefined;
    for (let pages = 0; ; pages += 1) {
        const page = await readRail(db, sessionId, echo, { cursor, limit, ...opts });
        expect(page.status, `page ${pages} should be 200`).toBe(200);
        ids.push(...(page.data?.items.map((c) => c.id) ?? []));
        if (!page.data?.hasMore) {
            expect(page.data?.nextCursor).toBeNull();
            break;
        }
        cursor = page.data?.nextCursor ?? undefined;
        if (pages > 200) throw new Error('traversal did not terminate');
    }
    return ids;
}

describe('R3-RAILS-1A+1B — every Home rail reaches real exhaustion', () => {
    let db: SqliteD1;
    let s: Seed;

    beforeEach(async () => {
        db = new SqliteD1();
        s = await seed(db);
    });

    it('1. suggested guest live freezes 151 rows; traversal is exactly-once over >12 batches', async () => {
        const echo: RailBody = { kind: 'suggested', status: 'live' };
        const t0 = Date.now();
        const created = await createRail(db, echo);
        const buildMs = Date.now() - t0;
        expect(created.status).toBe(201);
        expect(created.data?.session.total).toBe(151);
        const guest = created.data?.guest_token ?? undefined;
        const t1 = Date.now();
        const ids = await traverseAll(db, created.data?.session.id as string, echo, 12, { guest });
        const readMs = Date.now() - t1;
        expect(ids).toHaveLength(151);
        expect(new Set(ids).size).toBe(151);
        // Guests see everything public — blocked creators', own and hidden rows alike.
        for (const id of [...s.blockedLiveDialogue, ...s.ownLive, s.hiddenLive]) expect(ids).toContain(id);
        process.stdout.write(`[R3-RAILS cost] suggested-guest-live 151 rows: build ${buildMs}ms, full traversal(limit=12) ${readMs}ms\n`);
    });

    it('2. suggested user upcoming excludes blocked/own; guests see upcoming incl. blocked rows', async () => {
        const echo: RailBody = { kind: 'suggested', status: 'upcoming' };
        const guestCreated = await createRail(db, echo);
        expect(guestCreated.status).toBe(201);
        expect(guestCreated.data?.session.total).toBe(29);
        const guestIds = await traverseAll(db, guestCreated.data?.session.id as string, echo, 6, {
            guest: guestCreated.data?.guest_token ?? undefined,
        });
        expect(guestIds).toHaveLength(29);
        expect(guestIds).toContain(s.blockedPendingScience);
        for (const id of guestIds) {
            const row = await db.prepare(`SELECT status FROM competitions WHERE id = ?`).bind(id).first<{ status: string }>();
            expect(['pending', 'accepted']).toContain(row?.status);
        }

        const userCreated = await createRail(db, echo, { token: 'sess-hr-user3' });
        expect(userCreated.status).toBe(201);
        expect(userCreated.data?.session.total).toBe(28);
        const userIds = await traverseAll(db, userCreated.data?.session.id as string, echo, 6, { token: 'sess-hr-user3' });
        expect(userIds).toHaveLength(28);
        expect(new Set(userIds).size).toBe(28);
        expect(userIds).not.toContain(s.blockedPendingScience);
    });

    it('3. category dialogue live: parent includes religions children; exactly-once', async () => {
        const echo: RailBody = { kind: 'category', category: 'dialogue', status: 'live' };
        const created = await createRail(db, echo);
        expect(created.status).toBe(201);
        // 8 dialogue + 3 religions + 3 blocked + 2 own = 16 (hidden row is live dialogue, included for guests).
        expect(created.data?.session.total).toBe(16);
        const ids = await traverseAll(db, created.data?.session.id as string, echo, 6, {
            guest: created.data?.guest_token ?? undefined,
        });
        expect(ids).toHaveLength(16);
        expect(new Set(ids).size).toBe(16);
        for (const id of [...s.blockedLiveDialogue, ...s.ownLive, s.hiddenLive]) expect(ids).toContain(id);
    });

    it('4. subcategory physics recorded holds only its 2 playable rows; invalid recordings never enter', async () => {
        const echo: RailBody = { kind: 'category', category: 'science', subcategory: 'physics', status: 'recorded' };
        const created = await createRail(db, echo);
        expect(created.status).toBe(201);
        expect(created.data?.session.total).toBe(2);
        const ids = await traverseAll(db, created.data?.session.id as string, echo, 6, {
            guest: created.data?.guest_token ?? undefined,
        });
        expect(ids).toHaveLength(2);

        // Recorded everywhere: youtube-only counts as playable; null/empty/whitespace do not.
        const recEcho: RailBody = { kind: 'suggested', status: 'recorded' };
        const rec = await createRail(db, recEcho);
        expect(rec.status).toBe(201);
        expect(rec.data?.session.total).toBe(16);
        const recIds = await traverseAll(db, rec.data?.session.id as string, recEcho, 6, {
            guest: rec.data?.guest_token ?? undefined,
        });
        for (const id of s.youtubeOnly) expect(recIds).toContain(id);
        for (const id of s.invalidRecorded) expect(recIds).not.toContain(id);
    });

    it('5. guest/user isolation: cross-identity reads 404, anonymous reads 404', async () => {
        const echo: RailBody = { kind: 'suggested', status: 'live' };
        const guestCreated = await createRail(db, echo);
        const sid = guestCreated.data?.session.id as string;
        const guest = guestCreated.data?.guest_token ?? undefined;
        expect((await readRail(db, sid, echo, { limit: 6, token: 'sess-hr-user3' })).status).toBe(404);
        expect((await readRail(db, sid, echo, { limit: 6 })).status).toBe(404);

        const userCreated = await createRail(db, echo, { token: 'sess-hr-user3' });
        const usid = userCreated.data?.session.id as string;
        expect((await readRail(db, usid, echo, { limit: 6, guest })).status).toBe(404);
        expect((await readRail(db, usid, echo, { limit: 6 })).status).toBe(404);
        // Same-identity retry still works.
        expect((await readRail(db, usid, echo, { limit: 6, token: 'sess-hr-user3' })).status).toBe(200);
    });

    it('6. category/subcategory/status/language isolation: drift is 409, never mixed', async () => {
        const echo: RailBody = { kind: 'category', category: 'dialogue', status: 'live' };
        const created = await createRail(db, echo);
        const sid = created.data?.session.id as string;
        const guest = created.data?.guest_token ?? undefined;
        const ok = { guest };
        expect((await readRail(db, sid, echo, { limit: 6, ...ok })).status).toBe(200);
        expect((await readRail(db, sid, { ...echo, status: 'upcoming' }, { limit: 6, ...ok })).status).toBe(409);
        expect((await readRail(db, sid, { ...echo, category: 'science' }, { limit: 6, ...ok })).status).toBe(409);
        expect((await readRail(db, sid, { ...echo, subcategory: 'physics' }, { limit: 6, ...ok })).status).toBe(409);
        // A cursor can never wander across surfaces: kind drift is 404
        // (surface binding, enumeration-safe), same-surface drift is 409.
        expect((await readRail(db, sid, { kind: 'suggested', status: 'live' }, { limit: 6, ...ok })).status).toBe(404);
        expect((await readRail(db, sid, echo, { limit: 6, guest, lang: 'en' })).status).toBe(409);
        // Missing echo is a validation error, not a silent pass.
        const q = await app.request(`/api/home-rails/sessions/${sid}/page?limit=6&lang=ar`, {
            headers: headers(undefined, guest),
        }, env(db));
        expect(q.status).toBe(422);
    });

    it('7. validation: unknown kind/status/slugs are 422; bad cursor/limit are 422', async () => {
        expect((await createRail(db, { kind: 'nope', status: 'live' })).status).toBe(422);
        expect((await createRail(db, { kind: 'suggested', status: 'someday' })).status).toBe(422);
        expect((await createRail(db, { kind: 'category', category: '!!!', status: 'live' })).status).toBe(422);
        expect((await createRail(db, { kind: 'suggested', category: 'dialogue', status: 'live' })).status).toBe(422);

        const echo: RailBody = { kind: 'suggested', status: 'live' };
        const created = await createRail(db, echo);
        const sid = created.data?.session.id as string;
        const guest = created.data?.guest_token ?? undefined;
        expect((await readRail(db, sid, echo, { cursor: '!!!not-base64!!!', guest })).status).toBe(422);
        expect((await readRail(db, sid, echo, { limit: 0, guest })).status).toBe(422);
        expect((await readRail(db, 'rail-that-never-existed', echo, { guest })).status).toBe(404);
    });

    it('8. retry with the same cursor returns the identical batch; partial batches continue', async () => {
        const echo: RailBody = { kind: 'category', category: 'talents', status: 'live' };
        const created = await createRail(db, echo);
        const sid = created.data?.session.id as string;
        const guest = created.data?.guest_token ?? undefined;
        const first = await readRail(db, sid, echo, { limit: 2, guest });
        expect(first.status).toBe(200);
        const cursor = first.data?.nextCursor ?? undefined;
        const a = await readRail(db, sid, echo, { cursor, limit: 2, guest });
        const b = await readRail(db, sid, echo, { cursor, limit: 2, guest });
        expect(a.data?.items.map((c) => c.id)).toEqual(b.data?.items.map((c) => c.id));
        expect(a.data?.nextCursor).toBe(b.data?.nextCursor);

        // Eligibility loss mid-snapshot: survivors still arrive exactly once.
        await db.prepare(`DELETE FROM competitions WHERE id % 5 = 0 AND category_id = 12`).run();
        await db.prepare(`UPDATE competitions SET status = 'suspended' WHERE category_id = 12 AND id % 7 = 0`).run();
        const remaining = await db.prepare(
            `SELECT c.id AS id FROM competitions c JOIN categories cat ON c.category_id = cat.id
             WHERE cat.slug = 'talents' AND c.status = 'live'`,
        ).all<{ id: number }>();
        const ids = await traverseAll(db, sid, echo, 2, { guest });
        expect(ids).toHaveLength(remaining.results.length);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('9. TTL expiry is 410; arrivals after T0 surface only in a refresh session', async () => {
        const echo: RailBody = { kind: 'category', category: 'talents', status: 'upcoming' };
        const created = await createRail(db, echo);
        const sid = created.data?.session.id as string;
        const guest = created.data?.guest_token ?? undefined;
        await db.prepare(`UPDATE explore_result_sessions SET expires_at = datetime('now', '-1 minute') WHERE id = ?`)
            .bind(sid).run();
        expect((await readRail(db, sid, echo, { limit: 6, guest })).status).toBe(410);

        const echo2: RailBody = { kind: 'suggested', status: 'live' };
        const before = await createRail(db, echo2);
        const totalBefore = before.data?.session.total as number;
        await db.prepare(
            `INSERT INTO competitions (title, description, rules, category_id, creator_id, language, status, created_at)
             VALUES ('HR late arrival', 'd', 'r', 10, 2, 'ar', 'live', datetime('now'))`,
        ).run();
        const oldIds = await traverseAll(db, before.data?.session.id as string, echo2, 25, {
            guest: before.data?.guest_token ?? undefined,
        });
        expect(oldIds).toHaveLength(totalBefore);
        const after = await createRail(db, echo2);
        expect(after.data?.session.total).toBe(totalBefore + 1);
    });

    it('10. ar and en sessions exhaust the same category set (language binds, never filters content)', async () => {
        const echo: RailBody = { kind: 'category', category: 'science', status: 'upcoming' };
        const ar = await createRail(db, echo, { lang: 'ar' });
        // 6 science + 3 physics pending, incl. the blocked-creator row guests can see = 10.
        expect(ar.data?.session.total).toBe(10);
        const idsAr = await traverseAll(db, ar.data?.session.id as string, echo, 3, {
            guest: ar.data?.guest_token ?? undefined, lang: 'ar',
        });
        expect(idsAr).toHaveLength(10);
        const en = await createRail(db, echo, { lang: 'en' });
        const idsEn = await traverseAll(db, en.data?.session.id as string, echo, 3, {
            guest: en.data?.guest_token ?? undefined, lang: 'en',
        });
        expect(idsEn.sort((a, b) => a - b)).toEqual(idsAr.sort((a, b) => a - b));
    });

    it('11. user suggested hides own + hidden rows; guests still see them', async () => {
        const echo: RailBody = { kind: 'suggested', status: 'live' };
        const user = await createRail(db, echo, { token: 'sess-hr-user3' });
        // 151 public minus 3 blocked-live minus 2 own minus 1 hidden = 145.
        expect(user.data?.session.total).toBe(145);
        const userIds = await traverseAll(db, user.data?.session.id as string, echo, 25, { token: 'sess-hr-user3' });
        expect(userIds).toHaveLength(145);
        for (const id of [...s.ownLive, ...s.blockedLiveDialogue, s.hiddenLive]) {
            expect(userIds).not.toContain(id);
        }
        const guest = await createRail(db, echo);
        const guestIds = await traverseAll(db, guest.data?.session.id as string, echo, 25, {
            guest: guest.data?.guest_token ?? undefined,
        });
        expect(guestIds).toContain(s.hiddenLive);
    });

    it('12. guests see upcoming rails but gain no invite/join actions', async () => {
        const echo: RailBody = { kind: 'suggested', status: 'upcoming' };
        const created = await createRail(db, echo);
        // No auth at all: the rail still freezes (visibility, not action).
        expect(created.status).toBe(201);
        expect(created.data?.session.total).toBeGreaterThan(15);
        // ...while a join-request action without auth stays rejected.
        const res = await app.request(`/api/competitions/${s.pendingSample}/request`, {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ message: 'let me in' }),
        }, env(db));
        expect([401, 403]).toContain(res.status);
    });

    it('13. HomeRailsController holds no SQL (MVC: queries live in Models)', async () => {
        const { readFileSync } = await import('node:fs');
        const { join } = await import('node:path');
        const src = readFileSync(join(process.cwd(), 'src/controllers/HomeRailsController.ts'), 'utf-8');
        expect(src).not.toMatch(/\.prepare\(|SELECT\s|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM/i);
    });
});
