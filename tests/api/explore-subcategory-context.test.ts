/**
 * R3-EXPLORE-CONTEXT-1 — Explore category/subcategory/status session context (TDD RED first).
 *
 * Contract under test (05 §9 + 08 View All/Subcategory):
 * - POST /api/competitions/explore-sessions {search,category,subcategory,status}
 *   freezes the FULL intersection at T0 (server-side, before pagination).
 * - GET .../explore-sessions/:id/page?cursor&limit&search&category&subcategory&status&lang
 *   stays inside that intersection until hasMore=false (skip-and-fill on
 *   eligibility loss, never client filtering after limit).
 * - Status buckets: live=live, upcoming=pending+accepted,
 *   recorded=completed WITH a playable recording (trimmed vod_url OR
 *   youtube_video_url — null/empty/whitespace excluded).
 * - Invalid pairs never widen silently: unknown subcategory → 422 on create,
 *   subcategory of another parent + explicit category → 422 on create and on
 *   read; a valid subcategory without a parent canonicalizes to its parent.
 * - Stale/mismatched cursor context → 409; retry with the same cursor is
 *   identical; TTL expiry → 410; foreign identity → 404.
 *
 * RED: subcategory is dropped from the session contract on BASE (create
 * accepts it silently, pages ignore it, canonicalKey omits it).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import app from '../../src/main';
import { createSqliteD1, SqliteD1 } from '../helpers/sqlite-d1';
import {
    ExploreSessionService,
    parentOfSubcategory,
    isKnownSubcategory,
} from '../../src/lib/services/ExploreSessionService';
import type { D1Database } from '@cloudflare/workers-types';

type Env = Parameters<typeof app.request>[2];

const env = (db: SqliteD1): Env => ({ DB: db }) as unknown as Env;

let ipSeq = 1000;
function headers(token?: string, guest?: string): Record<string, string> {
    ipSeq += 1;
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'r3explore-test',
        'CF-Connecting-IP': `10.9.9.${(ipSeq % 250) + 1}`,
    };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    if (guest !== undefined) h['X-Guest-Token'] = guest;
    return h;
}

interface SessionPayload {
    session: { id: string; total: number; expires_at: string };
    guest_token: string | null;
}

interface PagePayload {
    items: Array<{ id: number; title: string; status: string; subcategory_slug?: string | null }>;
    nextCursor: string | null;
    hasMore: boolean;
    session: { id: string; total: number };
}

async function createSession(
    db: SqliteD1,
    body: Record<string, unknown> = {},
    opts: { token?: string; guest?: string; lang?: string } = {},
): Promise<{ status: number; data: SessionPayload | null; raw: unknown }> {
    const res = await app.request(`/api/competitions/explore-sessions?lang=${opts.lang ?? 'ar'}`, {
        method: 'POST',
        headers: headers(opts.token, opts.guest),
        body: JSON.stringify(body),
    }, env(db));
    const json = (await res.json()) as { success: boolean; data: SessionPayload };
    return { status: res.status, data: json.success ? json.data : null, raw: json };
}

async function readPage(
    db: SqliteD1,
    sessionId: string,
    opts: {
        cursor?: string; limit?: number; token?: string; guest?: string;
        search?: string; category?: string; subcategory?: string; status?: string; lang?: string;
    } = {},
): Promise<{ status: number; data: PagePayload | null; raw: unknown }> {
    const q = new URLSearchParams();
    if (opts.cursor !== undefined) q.set('cursor', opts.cursor);
    if (opts.limit !== undefined) q.set('limit', String(opts.limit));
    if (opts.search !== undefined) q.set('search', opts.search);
    if (opts.category !== undefined) q.set('category', opts.category);
    if (opts.subcategory !== undefined) q.set('subcategory', opts.subcategory);
    if (opts.status !== undefined) q.set('status', opts.status);
    q.set('lang', opts.lang ?? 'ar');
    const res = await app.request(
        `/api/competitions/explore-sessions/${sessionId}/page?${q.toString()}`,
        { headers: headers(opts.token, opts.guest) },
        env(db),
    );
    const json = (await res.json()) as { success: boolean; data: PagePayload };
    return { status: res.status, data: json.success ? json.data : null, raw: json };
}

/**
 * Taxonomy fixture mirroring db/seed.sql slugs:
 * dialogue(10) → sects(14), politics(15); science(11) → physics(13); talents(12).
 * Rows spread over live/pending/accepted/completed, with playable (vod,
 * youtube-only) and unplayable (null/empty/whitespace) recordings.
 */
async function seedTaxonomy(db: SqliteD1): Promise<void> {
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_active, language, country) VALUES
         (2, 'creator@r3x.local', 'creatorr3x', 'x', 'Creator', 1, 'ar', 'SA'),
         (3, 'other@r3x.local', 'otherr3x', 'x', 'Other', 1, 'ar', 'SA')`,
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES
         ('sess-r3x-user2', 2, datetime('now', '+1 day')),
         ('sess-r3x-user3', 3, datetime('now', '+1 day'))`,
    ).run();
    await db.prepare(
        `INSERT INTO categories (id, slug, name_ar, name_en, parent_id) VALUES
         (10, 'dialogue', 'حوار', 'Dialogue', NULL),
         (11, 'science', 'علوم', 'Science', NULL),
         (12, 'talents', 'مواهب', 'Talents', NULL),
         (13, 'physics', 'فيزياء', 'Physics', 11),
         (14, 'sects', 'مذاهب', 'Sects', 10),
         (15, 'politics', 'سياسة', 'Politics', 10)`,
    ).run();
    const stmt = db.prepare(
        `INSERT INTO competitions
            (title, description, rules, category_id, subcategory_id, creator_id, language, status, vod_url, youtube_video_url, created_at)
         VALUES (?, 'd', 'r', ?, ?, 2, 'ar', ?, ?, ?, ?)`,
    );
    let n = 0;
    const add = async (
        title: string, cat: number, sub: number | null, status: string,
        vod: string | null = null, yt: string | null = null,
    ): Promise<void> => {
        n += 1;
        const created = `2026-05-${String((n % 28) + 1).padStart(2, '0')} 10:00:00`;
        await stmt.bind(title, cat, sub, status, vod, yt, created).run();
    };
    // dialogue + sects: the main traversal block (8 live, 4 pending, 2 accepted,
    // playable + unplayable completed).
    for (let i = 1; i <= 8; i++) await add(`Sects live probe ${i} finals`, 10, 14, 'live');
    for (let i = 1; i <= 4; i++) await add(`Sects pending probe ${i} finals`, 10, 14, 'pending');
    for (let i = 1; i <= 2; i++) await add(`Sects accepted probe ${i} finals`, 10, 14, 'accepted');
    await add('Sects recorded vod finals', 10, 14, 'completed', 'https://cdn.local/v1.mp4');
    await add('Sects recorded yt finals', 10, 14, 'completed', null, 'https://youtu.be/x1');
    await add('Sects recorded novod finals', 10, 14, 'completed', null, null);
    await add('Sects recorded emptyvod finals', 10, 14, 'completed', '', null);
    await add('Sects recorded blankvod finals', 10, 14, 'completed', '   ', null);
    // dialogue + politics: sibling branch (must stay out of sects sessions).
    for (let i = 1; i <= 3; i++) await add(`Politics live probe ${i} finals`, 10, 15, 'live');
    await add('Politics recorded vod finals', 10, 15, 'completed', 'https://cdn.local/p1.mp4');
    // science + physics: another parent entirely.
    for (let i = 1; i <= 5; i++) await add(`Physics live probe ${i} finals`, 11, 13, 'live');
    for (let i = 1; i <= 2; i++) await add(`Physics pending probe ${i} finals`, 11, 13, 'pending');
    await add('Physics recorded yt finals', 11, 13, 'completed', null, 'https://youtu.be/p1');
    // science without a branch + talents without a branch.
    for (let i = 1; i <= 3; i++) await add(`Science general live ${i} finals`, 11, null, 'live');
    for (let i = 1; i <= 2; i++) await add(`Talents live ${i} finals`, 12, null, 'live');
    await add('Talents recorded vod finals', 12, null, 'completed', 'https://cdn.local/t1.mp4');
}

async function traverseAll(
    db: SqliteD1, sessionId: string, limit: number,
    opts: { token?: string; guest?: string; search?: string; category?: string; subcategory?: string; status?: string } = {},
): Promise<{ ids: number[]; pages: number }> {
    const ids: number[] = [];
    let cursor: string | undefined;
    let pages = 0;
    for (;;) {
        const page = await readPage(db, sessionId, { cursor, limit, ...opts });
        expect(page.status, `page ${pages} should be 200`).toBe(200);
        ids.push(...(page.data?.items.map((c) => c.id) ?? []));
        pages += 1;
        if (!page.data?.hasMore) {
            expect(page.data?.nextCursor).toBeNull();
            break;
        }
        expect(page.data?.nextCursor).toBeTruthy();
        cursor = page.data?.nextCursor ?? undefined;
        if (pages > 100) throw new Error('traversal did not terminate (hasMore loop?)');
    }
    return { ids, pages };
}

describe('R3-EXPLORE-CONTEXT-1 — subcategory session context', () => {
    let db: SqliteD1;

    beforeEach(async () => {
        db = new SqliteD1();
        await seedTaxonomy(db);
    });

    it('0. taxonomy helpers resolve known parents and reject unknowns', () => {
        expect(parentOfSubcategory('sects')).toBe('dialogue');
        expect(parentOfSubcategory('physics')).toBe('science');
        expect(parentOfSubcategory('politics')).toBe('dialogue');
        expect(parentOfSubcategory('dialogue')).toBe('');
        expect(parentOfSubcategory('nope')).toBe('');
        expect(isKnownSubcategory('sects')).toBe(true);
        expect(isKnownSubcategory('nope')).toBe(false);
        const filled = ExploreSessionService.canonicalizeFilters({ subcategory: 'physics' });
        expect(filled.subcategory).toBe('physics');
        expect(filled.category).toBe('science');
        expect(ExploreSessionService.validateExplorePair(
            ExploreSessionService.canonicalizeFilters({ category: 'dialogue', subcategory: 'physics' }),
        )).not.toBeNull();
        expect(ExploreSessionService.validateExplorePair(
            ExploreSessionService.canonicalizeFilters({ category: 'science', subcategory: 'physics' }),
        )).toBeNull();
        expect(ExploreSessionService.validateExplorePair(
            ExploreSessionService.canonicalizeFilters({ subcategory: 'nope' }),
        )).not.toBeNull();
        // The canonical key carries the subcategory: same category/status
        // with a different branch is a different session context.
        const a = ExploreSessionService.canonicalKey(
            ExploreSessionService.canonicalizeFilters({ category: 'dialogue', subcategory: 'sects', status: 'live' }));
        const b = ExploreSessionService.canonicalKey(
            ExploreSessionService.canonicalizeFilters({ category: 'dialogue', subcategory: 'politics', status: 'live' }));
        expect(a).not.toBe(b);
    });

    it('1. branch+live session traverses the full intersection exactly once (>2 pages)', async () => {
        const created = await createSession(db,
            { category: 'dialogue', subcategory: 'sects', status: 'live' },
            { token: 'sess-r3x-user2' });
        expect(created.status).toBe(201);
        expect(created.data?.session.total).toBe(8);
        const { ids, pages } = await traverseAll(db, created.data?.session.id as string, 3, {
            token: 'sess-r3x-user2', category: 'dialogue', subcategory: 'sects', status: 'live',
        });
        expect(pages).toBeGreaterThan(2);
        expect(ids).toHaveLength(8);
        expect(new Set(ids).size).toBe(8);
        const rows = await db.prepare(
            `SELECT c.id AS id, sub.slug AS sub FROM competitions c
             LEFT JOIN categories sub ON sub.id = c.subcategory_id
             WHERE c.title LIKE 'Sects live%'`,
        ).all<{ id: number; sub: string }>();
        expect(rows.results).toHaveLength(8);
        const expected = new Set(rows.results.map((r) => r.id));
        for (const id of ids) expect(expected.has(id)).toBe(true);
        for (const r of rows.results) expect(r.sub).toBe('sects');
    });

    it('2. upcoming branch session holds pending+accepted only', async () => {
        const created = await createSession(db,
            { category: 'dialogue', subcategory: 'sects', status: 'upcoming' },
            { token: 'sess-r3x-user2' });
        expect(created.status).toBe(201);
        expect(created.data?.session.total).toBe(6);
        const { ids } = await traverseAll(db, created.data?.session.id as string, 2, {
            token: 'sess-r3x-user2', category: 'dialogue', subcategory: 'sects', status: 'upcoming',
        });
        expect(ids).toHaveLength(6);
        expect(new Set(ids).size).toBe(6);
        const statuses = await db.prepare(
            `SELECT status AS s FROM competitions WHERE id IN (${ids.map(() => '?').join(',')})`,
        ).bind(...ids).all<{ s: string }>();
        const seen = new Set(statuses.results.map((r) => r.s));
        expect(seen.has('live')).toBe(false);
        expect(seen.has('completed')).toBe(false);
        expect([...seen].sort()).toEqual(['accepted', 'pending']);
    });

    it('3. recorded branch session holds playable recordings only', async () => {
        const created = await createSession(db,
            { category: 'dialogue', subcategory: 'sects', status: 'recorded' },
            { token: 'sess-r3x-user2' });
        expect(created.status).toBe(201);
        // vod + youtube-only in; null/empty/whitespace out.
        expect(created.data?.session.total).toBe(2);
        const { ids } = await traverseAll(db, created.data?.session.id as string, 1, {
            token: 'sess-r3x-user2', category: 'dialogue', subcategory: 'sects', status: 'recorded',
        });
        expect(ids).toHaveLength(2);
        const titles = await db.prepare(
            `SELECT title AS t FROM competitions WHERE id IN (${ids.map(() => '?').join(',')})`,
        ).bind(...ids).all<{ t: string }>();
        const joined = titles.results.map((r) => r.t).join('|');
        expect(joined).toContain('vod finals');
        expect(joined).toContain('yt finals');
        expect(joined).not.toContain('novod');
        expect(joined).not.toContain('emptyvod');
        expect(joined).not.toContain('blankvod');
        // Sibling branch + parent-level recorded rows stay out.
        expect(joined).not.toContain('Politics');
    });

    it('4. parent-only filter still includes its children, sibling parents stay out', async () => {
        const created = await createSession(db,
            { category: 'dialogue', status: 'live' },
            { token: 'sess-r3x-user2' });
        expect(created.status).toBe(201);
        // 8 sects-live + 3 politics-live.
        expect(created.data?.session.total).toBe(11);
        const { ids } = await traverseAll(db, created.data?.session.id as string, 4, {
            token: 'sess-r3x-user2', category: 'dialogue', status: 'live',
        });
        expect(ids).toHaveLength(11);
        expect(new Set(ids).size).toBe(11);
        const subs = await db.prepare(
            `SELECT DISTINCT sub.slug AS s FROM competitions c
             LEFT JOIN categories sub ON sub.id = c.subcategory_id
             WHERE c.id IN (${ids.map(() => '?').join(',')})`,
        ).bind(...ids).all<{ s: string }>();
        expect(new Set(subs.results.map((r) => r.s))).toEqual(new Set(['sects', 'politics']));
    });

    it('5. invalid pairs are rejected, never widened to All', async () => {
        // Unknown subcategory.
        expect((await createSession(db, { subcategory: 'nope' }, { token: 'sess-r3x-user2' })).status).toBe(422);
        // Subcategory of another parent + explicit category.
        expect((await createSession(db,
            { category: 'dialogue', subcategory: 'physics' },
            { token: 'sess-r3x-user2' })).status).toBe(422);
        // Non-string subcategory.
        const bad = await app.request('/api/competitions/explore-sessions?lang=ar', {
            method: 'POST',
            headers: headers('sess-r3x-user2'),
            body: JSON.stringify({ category: 'dialogue', subcategory: 42 }),
        }, env(db));
        expect(bad.status).toBe(422);
        // A valid pair still creates after the rejections (no state poisoned).
        const ok = await createSession(db,
            { category: 'science', subcategory: 'physics', status: 'live' },
            { token: 'sess-r3x-user2' });
        expect(ok.status).toBe(201);
        expect(ok.data?.session.total).toBe(5);
        // The rejected pair on READ is a validation error too (not a widen).
        const badRead = await readPage(db, ok.data?.session.id as string, {
            limit: 6, token: 'sess-r3x-user2',
            category: 'dialogue', subcategory: 'physics', status: 'live',
        });
        expect(badRead.status).toBe(422);
    });

    it('6. subcategory without a parent canonicalizes to its known parent', async () => {
        const created = await createSession(db,
            { subcategory: 'physics', status: 'live' },
            { token: 'sess-r3x-user2' });
        expect(created.status).toBe(201);
        expect(created.data?.session.total).toBe(5);
        // Reading with the canonical parent matches the same session.
        const page = await readPage(db, created.data?.session.id as string, {
            limit: 5, token: 'sess-r3x-user2',
            category: 'science', subcategory: 'physics', status: 'live',
        });
        expect(page.status).toBe(200);
        expect(page.data?.items).toHaveLength(5);
        // Reading with a mismatched parent is a context mismatch (409).
        const drift = await readPage(db, created.data?.session.id as string, {
            limit: 5, token: 'sess-r3x-user2',
            category: 'dialogue', subcategory: 'sects', status: 'live',
        });
        expect(drift.status).toBe(409);
    });

    it('7. stale subcategory cursor context mismatches; retry is identical; TTL/identity hold', async () => {
        const created = await createSession(db,
            { category: 'dialogue', subcategory: 'sects', status: 'live' },
            { token: 'sess-r3x-user2' });
        const sid = created.data?.session.id as string;
        // Same-category read without the subcategory no longer matches.
        expect((await readPage(db, sid, {
            limit: 3, token: 'sess-r3x-user2', category: 'dialogue', status: 'live',
        })).status).toBe(409);
        // Sibling-branch read mismatches too.
        expect((await readPage(db, sid, {
            limit: 3, token: 'sess-r3x-user2', category: 'dialogue', subcategory: 'politics', status: 'live',
        })).status).toBe(409);
        // Retry with the same cursor returns the identical batch.
        const first = await readPage(db, sid, {
            limit: 3, token: 'sess-r3x-user2', category: 'dialogue', subcategory: 'sects', status: 'live',
        });
        expect(first.status).toBe(200);
        const cursor = first.data?.nextCursor as string;
        const r1 = await readPage(db, sid, {
            cursor, limit: 3, token: 'sess-r3x-user2',
            category: 'dialogue', subcategory: 'sects', status: 'live',
        });
        const r2 = await readPage(db, sid, {
            cursor, limit: 3, token: 'sess-r3x-user2',
            category: 'dialogue', subcategory: 'sects', status: 'live',
        });
        expect(r1.data?.items.map((c) => c.id)).toEqual(r2.data?.items.map((c) => c.id));
        expect(r1.data?.nextCursor).toBe(r2.data?.nextCursor);
        // Foreign identity stays 404; expiry stays 410.
        expect((await readPage(db, sid, {
            limit: 3, token: 'sess-r3x-user3',
            category: 'dialogue', subcategory: 'sects', status: 'live',
        })).status).toBe(404);
        await db.prepare(`UPDATE explore_result_sessions SET expires_at = datetime('now', '-1 minute') WHERE id = ?`)
            .bind(sid).run();
        expect((await readPage(db, sid, {
            limit: 3, token: 'sess-r3x-user2',
            category: 'dialogue', subcategory: 'sects', status: 'live',
        })).status).toBe(410);
    });

    it('8. eligibility loss skip-fills inside the intersection until true exhaustion', async () => {
        const created = await createSession(db,
            { category: 'dialogue', subcategory: 'sects', status: 'live' },
            { token: 'sess-r3x-user2' });
        const sid = created.data?.session.id as string;
        // Lose eligibility after the freeze: delete 2 + flip 2 out of live.
        const victims = await db.prepare(
            `SELECT id FROM competitions WHERE title LIKE 'Sects live%' ORDER BY id LIMIT 4`,
        ).all<{ id: number }>();
        const ids4 = victims.results.map((r) => r.id);
        await db.prepare(`DELETE FROM competitions WHERE id IN (?, ?)`).bind(ids4[0], ids4[1]).run();
        await db.prepare(`UPDATE competitions SET status = 'cancelled' WHERE id IN (?, ?)`).bind(ids4[2], ids4[3]).run();
        const { ids } = await traverseAll(db, sid, 3, {
            token: 'sess-r3x-user2', category: 'dialogue', subcategory: 'sects', status: 'live',
        });
        // 8 frozen − 4 lost = 4 survivors, each exactly once, no dup/skip.
        expect(ids).toHaveLength(4);
        expect(new Set(ids).size).toBe(4);
        for (const lost of ids4) expect(ids).not.toContain(lost);
    });

    it('9. search intersects with the branch context server-side', async () => {
        const created = await createSession(db,
            { search: 'Sects live probe 1', category: 'dialogue', subcategory: 'sects', status: 'live' },
            { token: 'sess-r3x-user2' });
        expect(created.status).toBe(201);
        expect(created.data?.session.total).toBe(1);
        const page = await readPage(db, created.data?.session.id as string, {
            limit: 12, token: 'sess-r3x-user2',
            search: 'Sects live probe 1', category: 'dialogue', subcategory: 'sects', status: 'live',
        });
        expect(page.status).toBe(200);
        expect(page.data?.items).toHaveLength(1);
        expect(page.data?.hasMore).toBe(false);
        // Same search in the sibling branch finds nothing (no cross-branch leak).
        const other = await createSession(db,
            { search: 'Sects live probe 1', category: 'dialogue', subcategory: 'politics', status: 'live' },
            { token: 'sess-r3x-user2' });
        expect(other.status).toBe(201);
        expect(other.data?.session.total).toBe(0);
    });

    it('10. guest sessions carry the same branch context and isolation', async () => {
        const created = await createSession(db,
            { category: 'science', subcategory: 'physics', status: 'live' });
        expect(created.status).toBe(201);
        expect(created.data?.guest_token).toBeTruthy();
        const guest = created.data?.guest_token as string;
        const sid = created.data?.session.id as string;
        const page = await readPage(db, sid, {
            limit: 2, guest, category: 'science', subcategory: 'physics', status: 'live',
        });
        expect(page.status).toBe(200);
        expect(page.data?.items.length).toBeGreaterThan(0);
        expect((await readPage(db, sid, {
            limit: 2, guest: 'guest-stranger-99', category: 'science', subcategory: 'physics', status: 'live',
        })).status).toBe(404);
        const { ids } = await traverseAll(db, sid, 2, {
            guest, category: 'science', subcategory: 'physics', status: 'live',
        });
        expect(ids).toHaveLength(5);
        expect(new Set(ids).size).toBe(5);
    });
});
