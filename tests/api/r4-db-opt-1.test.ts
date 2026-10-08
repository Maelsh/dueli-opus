/**
 * R4-DB-OPT-1 — smallest proven D1 read reduction (DIAG-driven, no guessing).
 *
 * S1 — redundant Profile re-read elimination in SearchModel (the only
 *      runtime change): searchUsers/getSuggestedUsers re-issued the 3
 *      loadProfiles statements for page ids already present in the
 *      ranking-time map. Reuse is value-identical (pageIds ⊆ ids, same SSOT
 *      map with the same zero-fill), so ordering, exhaustion, blocking,
 *      isolation, actual participation and H7-v1 weights are untouched.
 * S2 — migration 0039 covering indexes (local-only proof here; production
 *      apply is owner-gated per protocol §5/§9 and NOT done by this unit):
 *      every DIAG SCAN (E1/E2/E7/E8/E9) becomes SEARCH, the SSE poll loses
 *      its per-10s TEMP B-TREE sort (E4). No table/column/drop, no weight.
 * S3 — D1-outage behaviour on the touched path: single attempt (no retry
 *      loop in models), route-level 500 + generic i18n + zero SQL leak.
 *
 * Measurement honesty: D1 rowsRead/rowsWritten counters do not exist
 * locally (wrangler local meta returns duration only), so this file pins
 * STATEMENT executions + EXPLAIN plans on the real migrations — never
 * presented as production rowsRead. Production impact is estimated in
 * WORKLOG/PLAN-STATUS, not claimed as measured.
 */
import { describe, it, expect } from 'vitest';
import app from '../../src/main';
import { translations } from '../../src/i18n';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { SearchModel } from '../../src/models/SearchModel';
import { UserSignalsModel } from '../../src/models/UserSignalsModel';

type Env = Parameters<typeof app.request>[2];
const envOf = (db: unknown): Env => ({ DB: db }) as unknown as Env;

/** Counts every prepared statement, split into reads vs writes. */
class CountingDb {
    reads = 0;
    writes = 0;
    constructor(private readonly inner: SqliteD1) {}
    prepare(sql: string) {
        if (/^\s*select/i.test(sql)) this.reads += 1;
        else this.writes += 1;
        return this.inner.prepare(sql);
    }
    batch(statements: never[]) {
        return (this.inner as unknown as { batch(s: never[]): Promise<never> }).batch(statements);
    }
    exec(sql: string) {
        return this.inner.exec(sql);
    }
    get statements(): number {
        return this.reads + this.writes;
    }
}

/** D1 outage injection: every statement fails loudly and immediately. */
class FailingDb {
    attempts = 0;
    prepare(_sql: string) {
        this.attempts += 1;
        const boom = (): never => {
            throw new Error('D1_ERROR: database is unavailable (injected outage)');
        };
        return { bind: () => ({ first: boom, all: boom, run: boom }), first: boom, all: boom, run: boom };
    }
    async batch(): Promise<never> {
        this.attempts += 1;
        throw new Error('D1_ERROR: database is unavailable (injected outage)');
    }
}

async function seedUsers(db: SqliteD1): Promise<void> {
    await db
        .prepare(
            `INSERT INTO users (id, email, username, password_hash, display_name, is_active, language, country) VALUES
             (1, 'viewer@opt1.local', 'viewerone', 'x', 'Viewer One', 1, 'ar', 'SA'),
             (2, 'a@opt1.local', 'opt1alice', 'x', 'Alice', 1, 'ar', 'SA'),
             (3, 'b@opt1.local', 'opt1bob', 'x', 'Bob', 1, 'ar', 'SA'),
             (4, 'c@opt1.local', 'opt1carol', 'x', 'Carol', 1, 'en', 'US'),
             (5, 'd@opt1.local', 'opt1dave', 'x', 'Dave', 1, 'en', 'US')`
        )
        .run();
    await db
        .prepare(`INSERT INTO categories (id, slug, name_ar, name_en, parent_id) VALUES (10, 'dialogue', 'حوار', 'Dialogue', NULL)`)
        .run();
    // Viewer follows candidate 2 (exercises the follow-narrowing path).
    await db.prepare(`INSERT INTO follows (follower_id, following_id) VALUES (1, 2)`).run();
}

async function addStartedCompetition(db: SqliteD1, creator: number, opponent: number, title: string): Promise<number> {
    const r = await db
        .prepare(
            `INSERT INTO competitions
               (title, description, rules, category_id, creator_id, opponent_id, language, status, started_at)
             VALUES (?, 'd', 'r', 10, ?, ?, 'ar', 'live', datetime('now'))`
        )
        .bind(title, creator, opponent)
        .run();
    return Number(r.meta.last_row_id);
}

async function addRating(db: SqliteD1, competitionId: number, competitorId: number, rating: number): Promise<void> {
    await db
        .prepare(`INSERT INTO ratings (competition_id, user_id, competitor_id, rating) VALUES (?, 1, ?, ?)`)
        .bind(competitionId, competitorId, rating)
        .run();
}

/** Candidate 2: 5+4 over 2 started comps (Profile 4.5). Candidate 3: 4 over 1 (Profile 4). */
async function seedContests(db: SqliteD1): Promise<void> {
    const a = await addStartedCompetition(db, 2, 3, 'opt1 contest A');
    const b = await addStartedCompetition(db, 2, 4, 'opt1 contest B');
    await addRating(db, a, 2, 5);
    await addRating(db, a, 3, 4);
    await addRating(db, b, 2, 4);
}

describe('R4-DB-OPT-1 S1: searchUsers reuses the ranking-time Profile map', () => {
    it('issues exactly 9 statements (was 12) with byte-identical results', async () => {
        const raw = new SqliteD1();
        await seedUsers(raw);
        await seedContests(raw);
        const db = new CountingDb(raw);
        const model = new SearchModel(db as never);
        const before = db.statements;
        const result = await model.searchUsers('', 20, 0);
        const issued = db.statements - before;
        // 1 findAllActiveUserIds + 1 loadUsers(5) + 3 loadSpecializations(5)
        // + 3 getProfiles(5) + 1 page hydrate. The second getProfiles(pageIds)
        // is gone (-3 reads); writes stay 0.
        expect(db.writes).toBe(0);
        expect(issued).toBe(9);
        expect(result.total).toBe(5);
        expect(result.items).toHaveLength(5);
        // Profile SSOT values are preserved exactly (same map, same source).
        const byName = new Map(result.items.map((u) => [u.username, u as unknown as Record<string, unknown>]));
        expect(byName.get('opt1alice')?.['profile_score']).toBe(4.5);
        expect(byName.get('opt1alice')?.['profile_competitions']).toBe(2);
        expect(byName.get('opt1alice')?.['profile_stars']).toBe(9);
        expect(byName.get('opt1bob')?.['profile_score']).toBe(4);
        expect(byName.get('opt1bob')?.['profile_competitions']).toBe(1);
        // Cross-check against a direct SSOT read: identical values.
        const direct = await new UserSignalsModel(raw as never).getProfiles([2, 3, 4, 5]);
        for (const [uid, p] of direct) {
            const row = result.items.find((u) => u.id === uid) as unknown as Record<string, unknown>;
            expect(row['profile_score']).toBe(p.profile);
            expect(row['profile_competitions']).toBe(p.competitions);
            expect(row['profile_stars']).toBe(p.starsSum);
        }
    });
});

describe('R4-DB-OPT-1 S1: getSuggestedUsers reuses the ranking-time Profile map', () => {
    it('issues exactly 15 statements (was 18) with identical attach values', async () => {
        const raw = new SqliteD1();
        await seedUsers(raw);
        await seedContests(raw);
        const db = new CountingDb(raw);
        const model = new SearchModel(db as never);
        const before = db.statements;
        const users = await model.getSuggestedUsers(1, 'ar', 'SA', 10);
        const issued = db.statements - before;
        // 1 findAll + 1 loadUsers(5) + 1 blocked + 1 following
        // + 3 specs([viewer]) + 1 loadUsers([viewer]) + 3 specs(3 eligible)
        // + 3 profiles(3 eligible) + 1 hydrate. Second getProfiles gone (-3).
        expect(db.writes).toBe(0);
        expect(issued).toBe(15);
        // Self (1) + followed (2) excluded; the rest ranked, Profile attached.
        expect(users.map((u) => u.id).sort()).toEqual([3, 4, 5]);
        const byId = new Map(users.map((u) => [u.id, u as unknown as Record<string, unknown>]));
        expect(byId.get(3)?.['profile_score']).toBe(4);
        expect(byId.get(3)?.['profile_competitions']).toBe(1);
    });
});

describe('R4-DB-OPT-1 S2: migration 0039 indexes exist and plans use them', () => {
    const STATEMENTS: Array<[string, string]> = [
        ['E1 profile sums', `SELECT r.competitor_id, SUM(r.rating) FROM ratings r JOIN competitions c ON r.competition_id = c.id WHERE r.competitor_id IN (1,2) AND c.started_at IS NOT NULL GROUP BY r.competitor_id`],
        ['E2 creator counts', `SELECT creator_id, COUNT(*) FROM competitions WHERE creator_id IN (1,2) AND started_at IS NOT NULL GROUP BY creator_id`],
        ['E2b opponent counts', `SELECT opponent_id, COUNT(*) FROM competitions WHERE opponent_id IN (1,2) AND started_at IS NOT NULL GROUP BY opponent_id`],
        ['E4 sse getAfter', `SELECT * FROM sse_event_log WHERE channel = 'competition:1' AND id > 0 ORDER BY id ASC LIMIT 20`],
        ['E7 profile shelf', `SELECT c.id FROM competitions c WHERE c.creator_id = 1 OR c.opponent_id = 1 ORDER BY c.created_at DESC LIMIT 20`],
        ['E8 active users', `SELECT id FROM users WHERE is_active = 1`],
        ['E9 blocked both directions', `SELECT blocked_id FROM user_blocks WHERE blocker_id = 1 UNION SELECT blocker_id FROM user_blocks WHERE blocked_id = 1`],
    ];

    it('0039 creates exactly the 6 intended indexes (additive only)', async () => {
        const db = new SqliteD1();
        const rows = await db
            .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx\\_%' ESCAPE '\\'`)
            .all<{ name: string }>();
        for (const name of [
            'idx_ratings_competitor',
            'idx_competitions_creator',
            'idx_competitions_opponent',
            'idx_users_active',
            'idx_user_blocks_blocked',
            'idx_sse_channel_id',
        ]) {
            expect(rows.results.map((r) => r.name), `missing index ${name}`).toContain(name);
        }
    });

    it.each(STATEMENTS)('%s: no SCAN (DIAG-measured SCANs are gone)', async (_label, sql) => {
        const db = new SqliteD1();
        const plan = await db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all<{ detail: string }>();
        const details = plan.results.map((r) => r.detail);
        expect(details.length).toBeGreaterThan(0);
        for (const d of details) {
            expect(d, `still scanning: ${d}`).not.toMatch(/^SCAN/);
        }
    });

    it('the new indexes (not full scans) serve the hot filters', async () => {
        const db = new SqliteD1();
        const check = async (sql: string, index: string) => {
            const plan = await db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all<{ detail: string }>();
            expect(plan.results.map((r) => r.detail).join('\n')).toContain(index);
        };
        await check(`SELECT r.competitor_id FROM ratings r WHERE r.competitor_id IN (1,2)`, 'idx_ratings_competitor');
        await check(`SELECT id FROM competitions WHERE creator_id = 1`, 'idx_competitions_creator');
        await check(`SELECT id FROM competitions WHERE opponent_id = 1`, 'idx_competitions_opponent');
        await check(`SELECT id FROM users WHERE is_active = 1`, 'idx_users_active');
        await check(`SELECT blocker_id FROM user_blocks WHERE blocked_id = 1`, 'idx_user_blocks_blocked');
        await check(
            `SELECT * FROM sse_event_log WHERE channel = 'c' AND id > 0 ORDER BY id ASC LIMIT 20`,
            'idx_sse_channel_id'
        );
    });
});

describe('R4-DB-OPT-1 S3: D1 outage on the touched path fails fast and clean', () => {
    it('model: searchUsers rejects on the FIRST statement (no retry loop)', async () => {
        const db = new FailingDb();
        const model = new SearchModel(db as never);
        await expect(model.searchUsers('opt1x', 20, 0)).rejects.toThrow('D1_ERROR');
        expect(db.attempts).toBe(1);
    });

    it('route: GET /api/search/users → 500 + generic i18n + zero SQL leak', async () => {
        const res = await app.request('/api/search/users?lang=en&q=opt1x', {}, envOf(new FailingDb()));
        expect(res.status).toBe(500);
        expect(res.headers.get('content-type')).toContain('application/json');
        const text = await res.text();
        expect(text).not.toMatch(/D1_ERROR|sqlite|no such table|select .* from/i);
        const body = JSON.parse(text) as { success: boolean; error: string };
        expect(body.success).toBe(false);
        expect(body.error).toBe(translations.en.errors.service_unavailable);
    });
});

describe('R4-DB-OPT-1: T0 snapshot build costs more than a continuation page', () => {
    it('explore session create (T0) issues more statements than one page read', async () => {
        const raw = new SqliteD1();
        await seedUsers(raw);
        await seedContests(raw);
        for (let i = 0; i < 4; i += 1) {
            await addStartedCompetition(raw, 2, 3, `opt1 extra ${i}`);
        }
        const db = new CountingDb(raw);
        const created = await app.request('/api/competitions/explore-sessions?lang=ar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'r4dbopt-test' },
            body: JSON.stringify({ search: '', status: 'live', category: '', subcategory: '' }),
        }, envOf(db));
        expect(created.status).toBe(201);
        const t0 = db.statements;
        const createdBody = (await created.json()) as {
            data: { session: { id: string }; guest_token: string | null };
        };
        const sid = createdBody.data.session.id;
        const guestHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-CSRF-Token': 'r4dbopt-test',
        };
        if (createdBody.data.guest_token !== null) {
            guestHeaders['X-Guest-Token'] = createdBody.data.guest_token;
        }
        const before = db.statements;
        // Page reads must echo the creation canonical context
        // (search/status/category/subcategory/lang) or the session answers
        // 409 session_context_mismatch — that strictness is intended.
        const pq = new URLSearchParams({
            search: '',
            status: 'live',
            category: '',
            subcategory: '',
            lang: 'ar',
            limit: '12',
        });
        const page = await app.request(
            `/api/competitions/explore-sessions/${sid}/page?${pq.toString()}`,
            { headers: guestHeaders },
            envOf(db)
        );
        expect(page.status).toBe(200);
        const continuation = db.statements - before;
        // Local statement counts only (NOT production rowsRead): the frozen
        // T0 build (eligible scan + H7 signals + profiles + chunk writes)
        // must dominate a single continuation page (chunk read + hydrate).
        expect(t0).toBeGreaterThan(0);
        expect(continuation).toBeGreaterThan(0);
        expect(continuation).toBeLessThan(t0);
        process.stdout.write(`[R4-DB-OPT-1 cost] explore T0 build ${t0} stmts vs continuation page ${continuation} stmts\n`);
    });
});
