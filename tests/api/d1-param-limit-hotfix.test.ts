/**
 * D1 100-bound-parameter hotfix — production home-rails 500s.
 *
 * Cloudflare D1 rejects any statement binding more than 100 parameters
 * (`D1_ERROR: variable number must be between ?1 and ?100`). Two loaders
 * bound the same id batch TWICE (creator side + opponent side => up to 160
 * params; 51+ ids => production 500), while node:sqlite allows far more, so
 * the bug escaped the suite:
 * - H7SignalsModel.loadProfiles (UNION ALL counts query)
 * - UserSignalsModel.loadSpecializations (creator IN ... OR opponent IN ...)
 *
 * Coverage (all with >50 UNIQUE participants, which fails on main):
 * A) loadProfiles: no >100 bind, correct SUM/count, started-only semantics.
 * B) loadSpecializations: no >100 bind, correct per-side aggregation.
 * C) Real POST /api/home-rails/sessions (suggested/live, suggested/upcoming,
 *    category/live) + page reads: no 500, correct session semantics; plus a
 *    small-set control proving normal rails still work.
 * Plus a direct pin of the new sqlite-d1 shim guard (101 throws, 100 passes).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { SqliteD1, createSqliteD1 } from '../helpers/sqlite-d1';
import { H7SignalsModel } from '../../src/models/H7SignalsModel';
import { UserSignalsModel } from '../../src/models/UserSignalsModel';

type Env = Parameters<typeof app.request>[2];
const env = (db: SqliteD1): Env => ({ DB: db }) as unknown as Env;

let ipSeq = 500;
function headers(): Record<string, string> {
    ipSeq += 1;
    return {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'd1limit-test',
        'CF-Connecting-IP': `10.7.7.${(ipSeq % 250) + 1}`,
    };
}

const N = 60; // >50 unique participants: 51+ ids 500'd on main (2x51=102).
const firstUserId = 100;

async function seedUsersAndCategories(db: SqliteD1): Promise<number[]> {
    await db.prepare(
        `INSERT INTO categories (id, slug, name_ar, name_en, parent_id) VALUES
         (10, 'dialogue', 'حوار', 'Dialogue', NULL),
         (11, 'science', 'علوم', 'Science', NULL)`
    ).run();
    const ids: number[] = [];
    for (let k = 0; k < N; k++) {
        const id = firstUserId + k;
        ids.push(id);
        await db.prepare(
            `INSERT INTO users (id, email, username, password_hash, display_name, is_active, language, country, is_online, last_seen_at, is_busy, created_at)
             VALUES (?, ?, ?, 'x', ?, 1, 'ar', 'SA', 1, datetime('now'), 0, datetime('now'))`
        ).bind(id, `pl${id}@local`, `pl${id}`, `Player ${id}`).run();
    }
    return ids;
}

/**
 * Production-shaped fixture: a ring of N started live competitions
 * (user k creates, user k+1 opposes) so every interior user has exactly one
 * creator-side and one opponent-side ACTUAL participation, plus one
 * never-started pending competition that must NOT count.
 */
async function seedLiveRing(db: SqliteD1, ids: number[]): Promise<{ liveIds: number[]; pendingId: number }> {
    const liveIds: number[] = [];
    for (let k = 0; k < ids.length; k++) {
        const creator = ids[k];
        const opponent = ids[(k + 1) % ids.length];
        const r = await db.prepare(
            `INSERT INTO competitions
                (title, description, rules, category_id, subcategory_id, creator_id, opponent_id,
                 language, country, status, started_at, created_at, total_views, likes_count, dislikes_count)
             VALUES (?, 'd', 'r', 10, NULL, ?, ?, 'ar', NULL, 'live', '2026-01-01 10:00:00', datetime('now'), 0, 0, 0)`
        ).bind(`Live ${k}`, creator, opponent).run();
        liveIds.push(Number(r.meta.last_row_id));
    }
    const p = await db.prepare(
        `INSERT INTO competitions
            (title, description, rules, category_id, subcategory_id, creator_id, opponent_id,
             language, country, status, started_at, created_at, total_views, likes_count, dislikes_count)
         VALUES ('Pending never started', 'd', 'r', 10, NULL, ?, NULL, 'ar', NULL, 'pending', NULL, datetime('now'), 0, 0, 0)`
    ).bind(ids[0]).run();
    return { liveIds, pendingId: Number(p.meta.last_row_id) };
}

async function seedRatings(db: SqliteD1, liveIds: number[], ids: number[]): Promise<void> {
    // Giver ids[N-1] rates competitor ids[0] in every competition: SUM per
    // competitor is deterministic (5 + 4 + ... depends on insertion below).
    for (const cid of liveIds) {
        await db.prepare(
            `INSERT INTO ratings (competition_id, user_id, competitor_id, rating, created_at)
             VALUES (?, ?, ?, 5, datetime('now'))`
        ).bind(cid, ids[ids.length - 1], ids[0]).run();
    }
}

describe('D1 shim 100-parameter guard', () => {
    it('rejects a statement binding 101 parameters with a D1-like error', async () => {
        const db = createSqliteD1();
        const qs = Array.from({ length: 101 }, () => '?').join(',');
        expect(() => db.prepare(`SELECT 1 WHERE 1 IN (${qs})`).bind(...Array(101).fill(1))).toThrow(
            /between \?1 and \?100/
        );
        db.close();
    });

    it('allows exactly 100 bound parameters', async () => {
        const db = createSqliteD1();
        const qs = Array.from({ length: 100 }, () => '?').join(',');
        const res = await db.prepare(`SELECT 1 AS v WHERE 1 IN (${qs})`).bind(...Array(100).fill(1)).all<{ v: number }>();
        expect(res.results[0].v).toBe(1);
        db.close();
    });
});

describe('D1 param-limit hotfix: loadProfiles with >50 unique ids', () => {
    let db: SqliteD1;
    let ids: number[];

    beforeEach(async () => {
        db = createSqliteD1();
        ids = await seedUsersAndCategories(db);
        const { liveIds } = await seedLiveRing(db, ids);
        await seedRatings(db, liveIds, ids);
    });

    it('binds no statement over 100 params and returns exact SUM/count', async () => {
        const model = new H7SignalsModel(db as unknown as D1Database);
        // Pre-fix this throws D1_ERROR via the shim (2x60 = 120 params).
        const map = await model.loadProfiles(ids);
        expect(map.size).toBe(N);
        // Interior user: 1 creator-side + 1 opponent-side participation.
        const mid = map.get(ids[7])!;
        expect(mid.count).toBe(2);
        expect(mid.sum).toBe(0);
        // ids[0] was rated 5 in every live competition.
        const rated = map.get(ids[0])!;
        expect(rated.count).toBe(2);
        expect(rated.sum).toBe(5 * N);
    });

    it('keeps actual-participation semantics (pending never-started excluded)', async () => {
        const model = new H7SignalsModel(db as unknown as D1Database);
        const map = await model.loadProfiles([ids[0]]);
        // ids[0] created the pending competition + 1 live, opposed 1 live.
        expect(map.get(ids[0])!.count).toBe(2);
    });
});

describe('D1 param-limit hotfix: loadSpecializations with >50 unique ids', () => {
    it('binds no statement over 100 params and aggregates each side once', async () => {
        const db = createSqliteD1();
        const ids = await seedUsersAndCategories(db);
        await seedLiveRing(db, ids);
        const model = new UserSignalsModel(db as unknown as D1Database);
        // Pre-fix this throws D1_ERROR via the shim (2x60 = 120 params).
        const map = await model.loadSpecializations(ids);
        expect(map.size).toBe(N);
        const mid = map.get(ids[7])!;
        // One creator-side + one opponent-side row, each credited once.
        expect(mid.totalParticipations).toBe(2);
        expect(mid.categoryCounts.get('dialogue')).toBe(2);
        // Pending never-started competition contributes nothing.
        const first = map.get(ids[0])!;
        expect(first.totalParticipations).toBe(2);
        db.close();
    });
});

describe('D1 param-limit hotfix: real home-rail routes with >50 participants', () => {
    let db: SqliteD1;
    let ids: number[];

    beforeEach(async () => {
        db = createSqliteD1();
        ids = await seedUsersAndCategories(db);
        await seedLiveRing(db, ids);
    });

    async function createRail(body: Record<string, string>): Promise<{ status: number; sessionId: string | null; total: number; guestToken: string | null }> {
        const res = await app.request('/api/home-rails/sessions?lang=ar', {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify(body),
        }, env(db));
        const json = (await res.json()) as { success: boolean; data?: { session: { id: string; total: number }; guest_token?: string | null } };
        // Creation returns 201 (same contract as the rails continuation suite).
        expect(res.status).toBe(201);
        return {
            status: res.status,
            sessionId: json.success ? json.data!.session.id : null,
            total: json.success ? json.data!.session.total : 0,
            guestToken: json.success ? (json.data!.guest_token ?? null) : null,
        };
    }

    async function readPage(sessionId: string, body: Record<string, string>, guestToken: string | null, cursor?: string): Promise<{ status: number; ids: number[]; hasMore: boolean; cursor: string | null }> {
        const q = new URLSearchParams({ ...body, lang: 'ar' });
        if (cursor !== undefined) q.set('cursor', cursor);
        const h = headers();
        // Guest sessions are identity-bound: present the issued token back,
        // exactly like a real client (and the rails continuation suite).
        if (guestToken) h['X-Guest-Token'] = guestToken;
        const res = await app.request(`/api/home-rails/sessions/${sessionId}/page?${q.toString()}`, {
            headers: h,
        }, env(db));
        const json = (await res.json()) as {
            success: boolean;
            data?: { items: Array<{ id: number }>; nextCursor: string | null; hasMore: boolean };
        };
        if (!json.success) return { status: res.status, ids: [], hasMore: false, cursor: null };
        return {
            status: res.status,
            ids: (json.data!.items ?? []).map((c) => c.id),
            hasMore: json.data!.hasMore,
            cursor: json.data!.nextCursor,
        };
    }

    it('suggested/live builds and pages without a 500', async () => {
        // Pre-fix: provider loadProfiles over the candidate set binds >100
        // => workerd D1_ERROR => route 500. Must be 200 after the fix.
        const created = await createRail({ kind: 'suggested', status: 'live' });
        expect(created.sessionId).toBeTruthy();
        expect(created.total).toBeGreaterThan(50);
        const page = await readPage(created.sessionId!, { kind: 'suggested', status: 'live' }, created.guestToken);
        expect(page.status).toBe(200);
        expect(page.ids.length).toBeGreaterThan(0);
        expect(new Set(page.ids).size).toBe(page.ids.length);
    });

    it('suggested/upcoming builds without a 500', async () => {
        for (let k = 0; k < N; k++) {
            await db.prepare(
                `INSERT INTO competitions
                    (title, description, rules, category_id, subcategory_id, creator_id, opponent_id,
                     language, country, status, started_at, created_at, total_views, likes_count, dislikes_count)
                 VALUES (?, 'd', 'r', 10, NULL, ?, NULL, 'ar', NULL, 'pending', NULL, datetime('now'), 0, 0, 0)`
            ).bind(`Upcoming ${k}`, ids[k]).run();
        }
        const created = await createRail({ kind: 'suggested', status: 'upcoming' });
        expect(created.sessionId).toBeTruthy();
        expect(created.total).toBeGreaterThan(0);
    });

    it('category/live builds and pages without a 500', async () => {
        const created = await createRail({ kind: 'category', category: 'dialogue', status: 'live' });
        expect(created.sessionId).toBeTruthy();
        expect(created.total).toBeGreaterThan(50);
        const page = await readPage(created.sessionId!, { kind: 'category', category: 'dialogue', status: 'live' }, created.guestToken);
        expect(page.status).toBe(200);
        expect(page.ids.length).toBeGreaterThan(0);
    });

    it('small rails still build with exact totals', async () => {
        const small = createSqliteD1();
        await small.prepare(
            `INSERT INTO categories (id, slug, name_ar, name_en, parent_id) VALUES (10, 'dialogue', 'حوار', 'Dialogue', NULL)`
        ).run();
        for (let k = 0; k < 3; k++) {
            const id = 200 + k;
            await small.prepare(
                `INSERT INTO users (id, email, username, password_hash, display_name, is_active, language, country, is_online, last_seen_at, is_busy, created_at)
                 VALUES (?, ?, ?, 'x', ?, 1, 'ar', 'SA', 1, datetime('now'), 0, datetime('now'))`
            ).bind(id, `sm${id}@local`, `sm${id}`, `Small ${id}`).run();
        }
        for (let k = 0; k < 3; k++) {
            const id = 200 + k;
            await small.prepare(
                `INSERT INTO competitions
                    (title, description, rules, category_id, subcategory_id, creator_id, opponent_id,
                     language, country, status, started_at, created_at, total_views, likes_count, dislikes_count)
                 VALUES (?, 'd', 'r', 10, NULL, ?, ?, 'ar', NULL, 'live', '2026-01-01 10:00:00', datetime('now'), 0, 0, 0)`
            ).bind(`Small live ${k}`, id, 200 + ((k + 1) % 3)).run();
        }
        const res = await app.request('/api/home-rails/sessions?lang=ar', {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ kind: 'category', category: 'dialogue', status: 'live' }),
        }, env(small));
        expect(res.status).toBe(201);
        const json = (await res.json()) as { success: boolean; data: { session: { id: string; total: number } } };
        expect(json.data.session.total).toBe(3);
        small.close();
    });
});
