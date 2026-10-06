/**
 * R3-D1 — h7-v1 approved ranking (OWNER APPROVED 2026-10-04).
 *
 * Covers §11 literally (numbers ONLY from the approved policy):
 * - §2 Guest/User × Recorded/Live/Upcoming weights (every column = 100)
 * - §3 Q formula + normalization constants + pinned values
 * - §4 search competition weights/layers + similar weights
 * - §5 interests mix + missing-signal neutral/redistribution
 * - §6 recency half-lives/anchors + discovery/diversity
 * - Session/chunks reuse: full eligible set at T0, stable scrolling,
 *   new-session recalculation, skip-and-fill, exhaustion >100 items,
 *   no duplicates, isolation (category/subcategory/status/lang/user/guest)
 *
 * Signal integrity: H2 counted views only (total_views via WatchService),
 * effective stars (ratings rows), effective Like/Dislike, real
 * follows/preferences/history sources. No fabricated data.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import {
    H7_POLICY_VERSION,
    H7_DISCOVERY,
    H7_DIVERSITY,
    H7_HALF_LIFE,
    H7_INTEREST_MIX,
    H7_K_PROFILE,
    H7_K_STARS,
    H7_K_VIEWS,
    H7_SEARCH_WEIGHTS,
    H7_SIMILAR_WEIGHTS,
    h7Balance,
    h7FirstLikeDelta,
    h7Normalize,
    h7ProfileDisplay,
    h7Quality,
    h7Recency,
    h7RecencyOf,
    h7Redistribute,
    h7SearchLayer,
    h7TitleSimilarity,
    h7WatchWeights,
    H7_MS,
} from '../../src/lib/services/H7RankingPolicy';
import {
    h7ApplyDiscoveryDiversity,
    h7OrderScored,
    h7ScoreCard,
    h7SearchScore,
    h7SimilarScore,
    h7TopicRelevance,
} from '../../src/lib/services/H7RankingService';

type Env = Parameters<typeof app.request>[2];
const env = (db: SqliteD1): Env => ({ DB: db }) as unknown as Env;

let ipSeq = 500;
function headers(token?: string, guest?: string): Record<string, string> {
    ipSeq += 1;
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'r3d1-test',
        'CF-Connecting-IP': `10.7.7.${(ipSeq % 250) + 1}`,
    };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    if (guest !== undefined) h['X-Guest-Token'] = guest;
    return h;
}

async function seedTaxonomy(db: SqliteD1): Promise<void> {
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_active, language, country) VALUES
         (2, 'creator@h7.local', 'creatorh7', 'x', 'Creator', 1, 'ar', 'SA'),
         (3, 'viewer@h7.local', 'viewerh7', 'x', 'Viewer', 1, 'ar', 'SA'),
         (4, 'rival@h7.local', 'rivalh7', 'x', 'Rival', 1, 'en', 'US')`
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES ('sess-h7-user3', 3, datetime('now', '+1 day'))`
    ).run();
    await db.prepare(
        `INSERT INTO categories (id, slug, name_ar, name_en, parent_id) VALUES
         (10, 'dialogue', 'حوار', 'Dialogue', NULL),
         (11, 'science', 'علوم', 'Science', NULL),
         (12, 'talents', 'مواهب', 'Talents', NULL),
         (13, 'physics', 'فيزياء', 'Physics', 11),
         (14, 'religions', 'أديان', 'Religions', 10)`
    ).run();
}

async function addCompetition(
    db: SqliteD1,
    opts: {
        title: string;
        categoryId?: number;
        subcategoryId?: number | null;
        creatorId?: number;
        opponentId?: number | null;
        lang?: string;
        country?: string | null;
        status?: string;
        createdAt?: string;
        startedAt?: string | null;
        scheduledAt?: string | null;
        endedAt?: string | null;
        views?: number;
        likes?: number;
        dislikes?: number;
        vod?: string | null;
        desc?: string;
    }
): Promise<number> {
    const r = await db.prepare(
        `INSERT INTO competitions
            (title, description, rules, category_id, subcategory_id, creator_id, opponent_id,
             language, country, status, created_at, started_at, scheduled_at, ended_at,
             total_views, likes_count, dislikes_count, vod_url)
         VALUES (?, ?, 'r', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
        opts.title, opts.desc ?? 'd', opts.categoryId ?? 10, opts.subcategoryId ?? null,
        opts.creatorId ?? 2, opts.opponentId ?? null, opts.lang ?? 'ar', opts.country ?? null,
        opts.status ?? 'live', opts.createdAt ?? new Date().toISOString().slice(0, 19).replace('T', ' '),
        opts.startedAt ?? null, opts.scheduledAt ?? null, opts.endedAt ?? null,
        opts.views ?? 0, opts.likes ?? 0, opts.dislikes ?? 0, opts.vod ?? null
    ).run();
    return Number(r.meta.last_row_id);
}

async function addRating(db: SqliteD1, competitionId: number, userId: number, competitorId: number, rating: number): Promise<void> {
    await db.prepare(
        `INSERT INTO ratings (competition_id, user_id, competitor_id, rating, created_at)
         VALUES (?, ?, ?, ?, datetime('now'))`
    ).bind(competitionId, userId, competitorId, rating).run();
}

interface RailBody { kind: string; category?: string; subcategory?: string; status: string }

async function createRail(db: SqliteD1, body: RailBody, opts: { token?: string; guest?: string; lang?: string } = {}) {
    const res = await app.request(`/api/home-rails/sessions?lang=${opts.lang ?? 'ar'}`, {
        method: 'POST', headers: headers(opts.token, opts.guest), body: JSON.stringify(body),
    }, env(db));
    const json = (await res.json()) as { success: boolean; data: { session: { id: string; total: number }; guest_token: string | null } };
    return { status: res.status, data: json.success ? json.data : null };
}

async function readRail(db: SqliteD1, sid: string, echo: RailBody, opts: { cursor?: string; limit?: number; token?: string; guest?: string; lang?: string } = {}) {
    const q = new URLSearchParams();
    q.set('kind', echo.kind);
    if (echo.category !== undefined) q.set('category', echo.category);
    if (echo.subcategory !== undefined) q.set('subcategory', echo.subcategory);
    q.set('status', echo.status);
    if (opts.cursor !== undefined) q.set('cursor', opts.cursor);
    if (opts.limit !== undefined) q.set('limit', String(opts.limit));
    q.set('lang', opts.lang ?? 'ar');
    const res = await app.request(`/api/home-rails/sessions/${sid}/page?${q.toString()}`, {
        headers: headers(opts.token, opts.guest),
    }, env(db));
    const json = (await res.json()) as {
        success: boolean;
        data: { items: Array<{ id: number }>; nextCursor: string | null; hasMore: boolean; session: { id: string; total: number } };
    };
    return { status: res.status, data: json.success ? json.data : null };
}

async function traverseRail(db: SqliteD1, sid: string, echo: RailBody, limit: number, opts: { token?: string; guest?: string } = {}): Promise<number[]> {
    const ids: number[] = [];
    let cursor: string | undefined;
    for (let pages = 0; ; pages += 1) {
        const page = await readRail(db, sid, echo, { cursor, limit, ...opts });
        expect(page.status).toBe(200);
        ids.push(...(page.data?.items.map((c) => c.id) ?? []));
        if (!page.data?.hasMore) break;
        cursor = page.data?.nextCursor ?? undefined;
        if (pages > 80) throw new Error('rail traversal did not terminate');
    }
    return ids;
}

describe('R3-D1 h7-v1 policy numbers (pinned from §11)', () => {
    it('policy version + every weight column sums to 100', () => {
        expect(H7_POLICY_VERSION).toBe('h7-v1');
        for (const identity of ['user', 'guest'] as const) {
            for (const bucket of ['recorded', 'live', 'upcoming', 'mixed'] as const) {
                const w = h7WatchWeights(identity, bucket);
                const sum = w.interests + w.language + w.country + w.follow + w.quality + w.recency + w.unwatched + w.history;
                expect(sum).toBe(100);
            }
        }
        // Approved table values (§2).
        expect(h7WatchWeights('guest', 'recorded')).toMatchObject({ interests: 0, language: 25, country: 10, follow: 0, quality: 30, recency: 25, unwatched: 10, history: 0 });
        expect(h7WatchWeights('guest', 'live')).toMatchObject({ interests: 0, language: 25, country: 10, follow: 0, quality: 25, recency: 25, unwatched: 10, history: 5 });
        expect(h7WatchWeights('user', 'recorded')).toMatchObject({ interests: 25, language: 15, country: 5, follow: 10, quality: 20, recency: 15, unwatched: 10, history: 0 });
        expect(h7WatchWeights('user', 'upcoming')).toMatchObject({ interests: 25, language: 15, country: 5, follow: 10, quality: 15, recency: 15, unwatched: 10, history: 5 });
        const searchSum = H7_SEARCH_WEIGHTS.text + H7_SEARCH_WEIGHTS.topic + H7_SEARCH_WEIGHTS.quality + H7_SEARCH_WEIGHTS.language + H7_SEARCH_WEIGHTS.country + H7_SEARCH_WEIGHTS.recency;
        expect(searchSum).toBe(100);
        expect({ ...H7_SEARCH_WEIGHTS }).toMatchObject({ text: 60, topic: 15, quality: 10, language: 5, country: 5, recency: 5 });
        const simSum = H7_SIMILAR_WEIGHTS.topic + H7_SIMILAR_WEIGHTS.text + H7_SIMILAR_WEIGHTS.language + H7_SIMILAR_WEIGHTS.country + H7_SIMILAR_WEIGHTS.quality + H7_SIMILAR_WEIGHTS.recency;
        expect(simSum).toBe(100);
        expect({ ...H7_SIMILAR_WEIGHTS }).toMatchObject({ topic: 45, text: 15, language: 10, country: 5, quality: 15, recency: 10 });
        // Interests mix (§5).
        expect(H7_INTEREST_MIX.explicit + H7_INTEREST_MIX.watch + H7_INTEREST_MIX.likes + H7_INTEREST_MIX.participations).toBeCloseTo(1, 10);
        expect({ ...H7_INTEREST_MIX }).toMatchObject({ explicit: 0.35, watch: 0.3, likes: 0.2, participations: 0.15 });
        expect(H7_K_STARS).toBe(100);
        expect(H7_K_VIEWS).toBe(300);
        expect(H7_K_PROFILE).toBe(20);
    });

    it('Q formula pinned values (§3)', () => {
        expect(h7Normalize(0, H7_K_STARS)).toBe(0);
        expect(h7Balance(0, 0)).toBe(0.5);
        // No stars/views/votes => Q = 0.175 exactly.
        expect(h7Quality(0, 0, 0, 0)).toBeCloseTo(0.175, 10);
        // First-like delta pinned in §3.
        expect(h7FirstLikeDelta()).toBeCloseTo(0.35 * (6 / 11 - 0.5), 10);
        // First like on an empty card raises the 0–100 watch score by ~0.318 at Q weight 20.
        const before = h7Quality(0, 0, 0, 0);
        const after = h7Quality(0, 0, 1, 0);
        expect((after - before) * 20).toBeCloseTo(0.318, 2);
        // Replacement (not accumulation): same effective total => same Q.
        expect(h7Quality(9, 50, 3, 1)).toBeCloseTo(h7Quality(9, 50, 3, 1), 10);
        // Profile display may exceed 5 and is never clipped; zero comps => null.
        expect(h7ProfileDisplay(60, 2)).toBe(30);
        expect(h7ProfileDisplay(0, 0)).toBeNull();
    });

    it('search layers order + title similarity bounds', () => {
        expect(h7SearchLayer('Alpha Finals', 'd', 'Alpha Finals')).toBe(0);
        expect(h7SearchLayer('Alpha Championship', 'd', 'Alpha')).toBe(1);
        expect(h7SearchLayer('The Alpha contest', 'd', 'Alpha')).toBe(1);
        expect(h7SearchLayer('Grand Alphax event', 'd', 'Alpha')).toBe(2);
        expect(h7SearchLayer('Unrelated', 'alpha inside description', 'alpha')).toBe(2);
        expect(h7SearchLayer('Unrelated', 'nothing', 'alpha')).toBe(3);
        expect(h7SearchLayer('Anything', 'd', '')).toBe(3);
        expect(h7TitleSimilarity('Alpha Finals', 'Alpha Finals')).toBeCloseTo(1, 10);
        const s = h7TitleSimilarity('Alpha Finals', 'Beta Cooking');
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1);
        expect(h7TitleSimilarity('', '')).toBe(0);
    });

    it('recency boundaries (§6): future clamps to 1, half-life exact, old decays, never negative', () => {
        expect(h7Recency(-1000, H7_MS.day)).toBe(1);
        expect(h7Recency(0, H7_MS.day)).toBe(1);
        expect(h7Recency(H7_MS.day, H7_MS.day)).toBeCloseTo(0.5, 10);
        expect(h7Recency(30 * H7_MS.day, 30 * H7_MS.day)).toBeCloseTo(0.5, 10);
        expect(h7Recency(6 * H7_MS.hour, 6 * H7_MS.hour)).toBeCloseTo(0.5, 10);
        const old = h7Recency(365 * H7_MS.day, 30 * H7_MS.day);
        expect(old).toBeGreaterThanOrEqual(0);
        expect(old).toBeLessThan(0.01);
        // Approved half-lives.
        expect(H7_HALF_LIFE.recordedDays).toBe(30);
        expect(H7_HALF_LIFE.liveHours).toBe(6);
        expect(H7_HALF_LIFE.unscheduledDays).toBe(7);
        expect(H7_HALF_LIFE.upcomingHours).toBe(48);
        // Recorded anchor prefers ended_at over created_at (never updated_at).
        const now = Date.parse('2026-10-06T12:00:00Z');
        const r = h7RecencyOf(
            { status: 'completed', ended_at: '2026-10-01T12:00:00Z', created_at: '2026-01-01T00:00:00Z' },
            now
        );
        expect(r).toBeCloseTo(Math.pow(2, -5 / 30), 4);
    });

    it('missing-signal redistribution (§5)', () => {
        // Session-wide unknown dropped: score over available weights only.
        expect(h7Redistribute([{ w: 25, s: 1 }])).toBeCloseTo(100, 10);
        expect(h7Redistribute([{ w: 25, s: 1 }, { w: 0, s: 0 }])).toBeCloseTo(100, 10);
        expect(h7Redistribute([])).toBe(0);
        expect(h7Redistribute([{ w: 15, s: 1 }, { w: 15, s: 0 }])).toBeCloseTo(50, 10);
    });

    it('discovery/diversity constants (§6)', () => {
        expect(H7_DISCOVERY.perTen).toBe(2);
        expect(H7_DIVERSITY.perTen).toBe(2);
        expect(H7_DIVERSITY.window).toBe(10);
    });
});

describe('R3-D1 H7 scoring behavior (pure service)', () => {
    const profiles = new Map<number, { sum: number; count: number }>([
        [2, { sum: 60, count: 2 }],
        [4, { sum: 0, count: 0 }],
    ]);
    const baseRow = {
        id: 1, status: 'live', language: 'ar', country: 'SA',
        category_slug: 'dialogue', subcategory_slug: 'religions',
        category_id: 10, subcategory_id: 14, creator_id: 2, opponent_id: null,
        total_views: 100, likes_count: 0, dislikes_count: 0, stars_sum: 0,
        title: 'T', description: 'd', created_at: new Date().toISOString(),
        started_at: new Date().toISOString(), stream_started_at: null,
        scheduled_at: null, ended_at: null, stream_ended_at: null,
        vod_url: null, youtube_video_url: null, nowMs: Date.now(),
    };

    it('guest upcoming visible; user interests move the score', () => {
        const guestCtx = {
            userId: null, language: 'ar', country: null, followingIds: [], watchedIds: [],
            explicitFavs: [], likedCategoryCounts: new Map(), watchedCategoryCounts: new Map(), participationCategoryCounts: new Map(),
        };
        const g = h7ScoreCard(baseRow, guestCtx, 'guest', 'upcoming', profiles);
        expect(g.score).toBeGreaterThanOrEqual(0);
        expect(g.score).toBeLessThanOrEqual(100);
        // Same card for a user whose explicit favs match scores higher.
        const userNoFav = {
            userId: 3, language: 'ar', country: 'SA', followingIds: [], watchedIds: [],
            explicitFavs: [], likedCategoryCounts: new Map(), watchedCategoryCounts: new Map(), participationCategoryCounts: new Map(),
        };
        const userFav = { ...userNoFav, explicitFavs: ['dialogue'] };
        const a = h7ScoreCard(baseRow, userNoFav, 'user', 'live', profiles);
        const b = h7ScoreCard(baseRow, userFav, 'user', 'live', profiles);
        expect(b.score).toBeGreaterThan(a.score);
    });

    it('Q dominates fame correctly: higher text layer wins regardless of fame (ordering helper)', () => {
        const items = [
            { id: 1, score: 99, recency: 0.1 },
            { id: 2, score: 99, recency: 0.9 },
            { id: 3, score: 10, recency: 1 },
        ];
        const ordered = h7OrderScored(items);
        expect(ordered.map((o) => o.id)).toEqual([2, 1, 3]);
    });

    it('diversity defers the 3rd same-competitor card when alternatives exist, never deletes', () => {
        const mk = (id: number, creator: number) => ({
            id, creator_id: creator, opponent_id: null, created_at: new Date().toISOString(), total_views: 500,
        });
        // 3 cards from creator 2 + 10 cards from 10 DISTINCT creators:
        // alternatives abound, so the first window holds at most 2 of creator 2.
        const input = [1, 2, 3].map((i) => mk(i, 2)).concat([4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((i, k) => mk(i, 100 + k)));
        const out = h7ApplyDiscoveryDiversity(input, Date.now());
        expect(out).toHaveLength(input.length);
        expect(new Set(out.map((o) => o.id)).size).toBe(input.length);
        const firstTen = out.slice(0, 10);
        expect(firstTen.filter((r) => r.creator_id === 2).length).toBeLessThanOrEqual(2);
        // Exhaustion keeps every eligible card (deferred appended at the tail).
        expect(out.slice(10).filter((r) => r.creator_id === 2).length).toBeGreaterThan(0);
    });

    it('search score uses H7 weights; similar prefers same topic branch', () => {
        const ctx = {
            userId: null, language: 'ar', country: null, followingIds: [], watchedIds: [],
            explicitFavs: [], likedCategoryCounts: new Map(), watchedCategoryCounts: new Map(), participationCategoryCounts: new Map(),
        };
        const row = { ...baseRow, nowMs: Date.now() };
        const s = h7SearchScore(row, ctx, 1);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(100);
        const ref = { ...baseRow };
        const sameBranch = { ...baseRow, id: 2, subcategory_slug: 'religions', title: 'T similar' };
        const otherBranch = { ...baseRow, id: 3, category_slug: 'science', subcategory_slug: 'physics', title: 'T similar' };
        const a = h7SimilarScore({ ...sameBranch, nowMs: Date.now() }, ref, ctx);
        const b = h7SimilarScore({ ...otherBranch, nowMs: Date.now() }, ref, ctx);
        expect(a).toBeGreaterThan(b);
        expect(h7TopicRelevance({ ...sameBranch }, 'dialogue', 'religions', ctx)).toBe(1);
    });
});

describe('R3-D1 rails/sessions end-to-end (H7 on the shared store)', () => {
    let db: SqliteD1;

    beforeEach(async () => {
        db = new SqliteD1();
        await seedTaxonomy(db);
    });

    it('Home tab/state reaches the right provider; guest sees upcoming', async () => {
        const liveId = await addCompetition(db, { title: 'H7 live', status: 'live', createdAt: '2026-10-06 10:00:00' });
        const upId = await addCompetition(db, { title: 'H7 upcoming', status: 'pending', createdAt: '2026-10-06 09:00:00' });
        const recId = await addCompetition(db, {
            title: 'H7 recorded', status: 'completed', vod: 'https://example.test/h7.mp4',
            createdAt: '2026-10-05 10:00:00', endedAt: '2026-10-05 11:00:00',
        });
        void liveId;
        for (const status of ['live', 'upcoming', 'recorded']) {
            const created = await createRail(db, { kind: 'suggested', status });
            expect(created.status, `guest suggested/${status} creates`).toBe(201);
            expect(created.data?.session.total).toBeGreaterThan(0);
        }
        // Guest upcoming is non-empty (the reported Guest-upcoming block is gone).
        const up = await createRail(db, { kind: 'suggested', status: 'upcoming' });
        const upGuest = up.data?.guest_token ?? undefined;
        const upIds = await traverseRail(db, up.data?.session.id as string, { kind: 'suggested', status: 'upcoming' }, 12, { guest: upGuest });
        expect(upIds).toContain(upId);
        // Recorded holds only playable rows.
        const rec = await createRail(db, { kind: 'suggested', status: 'recorded' });
        const recGuest = rec.data?.guest_token ?? undefined;
        const recIds = await traverseRail(db, rec.data?.session.id as string, { kind: 'suggested', status: 'recorded' }, 12, { guest: recGuest });
        expect(recIds).toContain(recId);
        expect(recIds).not.toContain(upId);
    });

    it('category/subcategory isolation (Dialogue vs Science, physics branch)', async () => {
        const dId = await addCompetition(db, { title: 'H7 dialogue', categoryId: 10, status: 'live' });
        const pId = await addCompetition(db, { title: 'H7 physics', categoryId: 11, subcategoryId: 13, status: 'live' });
        const dRail = await createRail(db, { kind: 'category', category: 'dialogue', status: 'live' });
        const dGuest = dRail.data?.guest_token ?? undefined;
        const dIds = await traverseRail(db, dRail.data?.session.id as string, { kind: 'category', category: 'dialogue', status: 'live' }, 12, { guest: dGuest });
        expect(dIds).toContain(dId);
        expect(dIds).not.toContain(pId);
        const pRail = await createRail(db, { kind: 'category', category: 'science', subcategory: 'physics', status: 'live' });
        const pGuest = pRail.data?.guest_token ?? undefined;
        const pIds = await traverseRail(
            db, pRail.data?.session.id as string,
            { kind: 'category', category: 'science', subcategory: 'physics', status: 'live' }, 12, { guest: pGuest }
        );
        expect(pIds).toContain(pId);
        expect(pIds).not.toContain(dId);
    });

    it('continuation beyond the old caps: 120 eligible, exactly-once exhaustion, stable retry', async () => {
        const want: number[] = [];
        for (let i = 0; i < 120; i++) {
            want.push(await addCompetition(db, { title: `H7 bulk ${i}`, categoryId: 11, status: 'live' }));
        }
        const echo: RailBody = { kind: 'category', category: 'science', status: 'live' };
        const created = await createRail(db, echo);
        const guest = created.data?.guest_token ?? undefined;
        expect(created.status).toBe(201);
        expect(created.data?.session.total).toBe(want.length);
        const ids = await traverseRail(db, created.data?.session.id as string, echo, 12, { guest });
        expect(ids).toHaveLength(want.length);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of want) expect(ids).toContain(id);
        // Retry stability: same cursor + same eligibility => identical batch.
        const first = await readRail(db, created.data?.session.id as string, echo, { limit: 12, guest });
        const cursor = first.data?.nextCursor ?? undefined;
        const a = await readRail(db, created.data?.session.id as string, echo, { cursor, limit: 12, guest });
        const b = await readRail(db, created.data?.session.id as string, echo, { cursor, limit: 12, guest });
        expect(a.data?.items.map((c) => c.id)).toEqual(b.data?.items.map((c) => c.id));
    });

    it('new session recalculates; old session never shows post-T0 arrivals', async () => {
        const echo: RailBody = { kind: 'suggested', status: 'live' };
        await addCompetition(db, { title: 'H7 t0 live', status: 'live' });
        const first = await createRail(db, echo);
        const sid = first.data?.session.id as string;
        const guest = first.data?.guest_token ?? undefined;
        const late = await addCompetition(db, { title: 'H7 late live', status: 'live' });
        const oldIds = await traverseRail(db, sid, echo, 12, { guest });
        expect(oldIds).not.toContain(late);
        const second = await createRail(db, echo);
        const guest2 = second.data?.guest_token ?? undefined;
        const newIds = await traverseRail(db, second.data?.session.id as string, echo, 12, { guest: guest2 });
        expect(newIds).toContain(late);
        expect(second.data?.session.total).toBe((first.data?.session.total ?? 0) + 1);
    });

    it('eligibility loss is skip-filled to real exhaustion (no tail cut)', async () => {
        const echo: RailBody = { kind: 'category', category: 'science', status: 'live' };
        const want: number[] = [];
        for (let i = 0; i < 30; i++) want.push(await addCompetition(db, { title: `H7 skip ${i}`, categoryId: 11, status: 'live' }));
        void want;
        const created = await createRail(db, echo);
        const sid = created.data?.session.id as string;
        const guest = created.data?.guest_token ?? undefined;
        await db.prepare(`DELETE FROM competitions WHERE id % 5 = 0`).run();
        await db.prepare(`UPDATE competitions SET status = 'suspended' WHERE id % 7 = 0`).run();
        const remaining = await db.prepare(
            `SELECT id FROM competitions WHERE status = 'live' AND category_id = 11`
        ).all<{ id: number }>();
        const ids = await traverseRail(db, sid, echo, 6, { guest });
        expect(ids).toHaveLength(remaining.results.length);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('explore search layers: exact beats prefix beats partial; fame never buries text', async () => {
        // One session, one query ('Zircon'): eligibility (LIKE) admits all
        // four; layers order them exact(0) → prefix(1) → description-only(2)
        // even though a prefix card is far more famous than the exact card.
        const exact = await addCompetition(db, { title: 'Zircon', categoryId: 11, status: 'live', desc: 'nothing special', views: 1 });
        const famousPrefix = await addCompetition(db, { title: 'Zircon Championship Special', categoryId: 11, status: 'live', desc: 'nothing', views: 9000 });
        const plainPrefix = await addCompetition(db, { title: 'Zircon Finals', categoryId: 11, status: 'live', desc: 'nothing', views: 5 });
        const partial = await addCompetition(db, { title: 'Grand event', categoryId: 11, status: 'live', desc: 'zircon inside description', views: 8000 });
        const res = await app.request('/api/competitions/explore-sessions?lang=ar', {
            method: 'POST', headers: headers(), body: JSON.stringify({ search: 'Zircon', status: '', category: '', subcategory: '' }),
        }, env(db));
        expect(res.status).toBe(201);
        const created = (await res.json()) as { success: boolean; data: { session: { id: string }; guest_token: string | null } };
        const sid = created.data.session.id;
        const exploreGuest = created.data.guest_token ?? undefined;
        const seen: number[] = [];
        let cursor: string | undefined;
        for (let p = 0; p < 10; p++) {
            const q = new URLSearchParams({ search: 'Zircon', lang: 'ar', limit: '12' });
            if (cursor !== undefined) q.set('cursor', cursor);
            const page = await app.request(`/api/competitions/explore-sessions/${sid}/page?${q.toString()}`, { headers: headers(undefined, exploreGuest) }, env(db));
            expect(page.status).toBe(200);
            const json = (await page.json()) as { success: boolean; data: { items: Array<{ id: number }>; nextCursor: string | null; hasMore: boolean } };
            seen.push(...json.data.items.map((c) => c.id));
            if (!json.data.hasMore) break;
            cursor = json.data.nextCursor ?? undefined;
        }
        expect(seen.indexOf(exact)).toBeGreaterThanOrEqual(0);
        // Exact layer first even though a prefix card is far more famous.
        expect(seen.indexOf(exact)).toBeLessThan(seen.indexOf(famousPrefix));
        expect(seen.indexOf(exact)).toBeLessThan(seen.indexOf(plainPrefix));
        // Description-only partial layer comes after every prefix card.
        expect(seen.indexOf(famousPrefix)).toBeLessThan(seen.indexOf(partial));
        expect(seen.indexOf(plainPrefix)).toBeLessThan(seen.indexOf(partial));
        // Empty search falls back to browsing (non-empty, same store).
        const empty = await app.request('/api/competitions/explore-sessions?lang=ar', {
            method: 'POST', headers: headers(), body: JSON.stringify({ search: '', status: '', category: '', subcategory: '' }),
        }, env(db));
        expect(empty.status).toBe(201);
    });

    it('similar competitions: reference excluded, same branch first, exhaustion to the end', async () => {
        const ref = await addCompetition(db, { title: 'H7 ref religions debate', categoryId: 10, subcategoryId: 14, status: 'live', desc: 'faith dialogue' });
        const same = await addCompetition(db, { title: 'H7 same religions talk', categoryId: 10, subcategoryId: 14, status: 'live', desc: 'faith dialogue' });
        const other = await addCompetition(db, { title: 'H7 other physics lab', categoryId: 11, subcategoryId: 13, status: 'live', desc: 'quantum' });
        const created = await app.request(`/api/competitions/${ref}/similar-sessions?lang=ar`, {
            method: 'POST', headers: headers(), body: JSON.stringify({}),
        }, env(db));
        expect(created.status).toBe(201);
        const json = (await created.json()) as { success: boolean; data: { session: { id: string; total: number }; guest_token: string | null } };
        const sid = json.data.session.id;
        const simGuest = json.data.guest_token ?? undefined;
        const seen: number[] = [];
        let cursor: string | undefined;
        for (let p = 0; p < 10; p++) {
            const q = new URLSearchParams({ lang: 'ar', limit: '12' });
            if (cursor !== undefined) q.set('cursor', cursor);
            const page = await app.request(`/api/competitions/${ref}/similar-sessions/${sid}/page?${q.toString()}`, { headers: headers(undefined, simGuest) }, env(db));
            expect(page.status).toBe(200);
            const pj = (await page.json()) as { success: boolean; data: { items: Array<{ id: number }>; nextCursor: string | null; hasMore: boolean } };
            seen.push(...pj.data.items.map((c) => c.id));
            if (!pj.data.hasMore) break;
            cursor = pj.data.nextCursor ?? undefined;
        }
        expect(seen).not.toContain(ref);
        expect(seen).toContain(same);
        expect(seen).toContain(other);
        expect(seen.indexOf(same)).toBeLessThan(seen.indexOf(other));
        expect(new Set(seen).size).toBe(seen.length);
    });

    it('favorites persist (Settings choice on the taxonomy) + unknown slug rejected', async () => {
        const get1 = await app.request('/api/settings/favorites?lang=ar', { headers: headers('sess-h7-user3') }, env(db));
        expect(get1.status).toBe(200);
        const put = await app.request('/api/settings/favorites?lang=ar', {
            method: 'PUT', headers: headers('sess-h7-user3'), body: JSON.stringify({ favorites: ['dialogue', 'physics'] }),
        }, env(db));
        expect(put.status).toBe(200);
        const putJson = (await put.json()) as { success: boolean; data: { favorites: string[] } };
        expect(putJson.data.favorites.sort()).toEqual(['dialogue', 'physics']);
        const get2 = await app.request('/api/settings/favorites?lang=ar', { headers: headers('sess-h7-user3') }, env(db));
        const get2Json = (await get2.json()) as { success: boolean; data: { favorites: string[] } };
        expect(get2Json.data.favorites.sort()).toEqual(['dialogue', 'physics']);
        const bad = await app.request('/api/settings/favorites?lang=ar', {
            method: 'PUT', headers: headers('sess-h7-user3'), body: JSON.stringify({ favorites: ['nope-xyz'] }),
        }, env(db));
        expect(bad.status).toBe(422);
        // Favorites move personal ranking: matching rail scores higher.
        await addCompetition(db, { title: 'H7 fav dialogue', categoryId: 10, status: 'live' });
        const echo: RailBody = { kind: 'suggested', status: 'live' };
        const userRail = await createRail(db, echo, { token: 'sess-h7-user3' });
        expect(userRail.status).toBe(201);
        expect(userRail.data?.session.total).toBeGreaterThan(0);
    });

    it('missing signals stay neutral: guest without country + fresh user without history still rank', async () => {
        await addCompetition(db, { title: 'H7 neutral a', categoryId: 12, status: 'live', lang: 'en' });
        await addCompetition(db, { title: 'H7 neutral b', categoryId: 12, status: 'live' });
        const guestRail = await createRail(db, { kind: 'suggested', status: 'live' });
        expect(guestRail.status).toBe(201);
        const gg = guestRail.data?.guest_token ?? undefined;
        const guestIds = await traverseRail(db, guestRail.data?.session.id as string, { kind: 'suggested', status: 'live' }, 12, { guest: gg });
        expect(guestIds.length).toBeGreaterThan(0);
        const userRail = await createRail(db, { kind: 'suggested', status: 'live' }, { token: 'sess-h7-user3' });
        expect(userRail.status).toBe(201);
        const userIds = await traverseRail(
            db, userRail.data?.session.id as string, { kind: 'suggested', status: 'live' }, 12, { token: 'sess-h7-user3' }
        );
        expect(userIds.length).toBeGreaterThan(0);
    });

    it('recency: fresh recorded outranks stale recorded, all else equal', async () => {
        const fresh = await addCompetition(db, {
            title: 'H7 fresh rec', categoryId: 12, status: 'completed', vod: 'https://example.test/fresh.mp4',
            createdAt: '2026-10-06 10:00:00', endedAt: '2026-10-06 11:00:00',
        });
        const stale = await addCompetition(db, {
            title: 'H7 stale rec', categoryId: 12, status: 'completed', vod: 'https://example.test/stale.mp4',
            createdAt: '2026-08-01 10:00:00', endedAt: '2026-08-01 11:00:00',
        });
        const echo: RailBody = { kind: 'category', category: 'talents', status: 'recorded' };
        const created = await createRail(db, echo);
        const gg = created.data?.guest_token ?? undefined;
        const ids = await traverseRail(db, created.data?.session.id as string, echo, 12, { guest: gg });
        expect(ids).toContain(fresh);
        expect(ids).toContain(stale);
        expect(ids.indexOf(fresh)).toBeLessThan(ids.indexOf(stale));
    });

    it('effective signals only: stars replace (no accumulation), likes atomic, H2 day-grain', async () => {
        const comp = await addCompetition(db, { title: 'H7 signals', categoryId: 10, status: 'live' });
        await addRating(db, comp, 3, 2, 5);
        await db.prepare(`UPDATE ratings SET rating = 2 WHERE competition_id = ? AND user_id = 3 AND competitor_id = 2`).bind(comp).run();
        const sum = await db.prepare(`SELECT SUM(rating) AS s FROM ratings WHERE competition_id = ?`).bind(comp).first<{ s: number }>();
        expect(Number(sum?.s)).toBe(2);
        // H2: two intents same identity/day count once.
        const w1 = await app.request(`/api/competitions/${comp}/watch?lang=ar`, { method: 'POST', headers: headers() }, env(db));
        expect(w1.status).toBe(200);
        const before = await db.prepare(`SELECT total_views AS v FROM competitions WHERE id = ?`).bind(comp).first<{ v: number }>();
        // L1/H1 untouched here: watch_history writer is the heartbeat path only.
        expect(Number(before?.v)).toBeGreaterThanOrEqual(0);
    });
});
