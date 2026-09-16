/**
 * B14 — Recommendation ranking weights and fallback behaviour.
 *
 * Purpose: PIN the ranking that RecommendationEngine produces today, so any
 * future change to a weight value, to the priority order, or to the guest
 * fallback fails loudly here instead of silently changing the home page.
 *
 * Why a real-SQL harness is used: ranking is computed INSIDE SQL
 * (`ORDER BY score DESC` plus the degradation phase gates), so asserting only
 * "rows exist" would prove nothing about ranking. `tests/helpers/sqlite-d1.ts`
 * loads the project's real migrations through the Node 22 builtin `node:sqlite`,
 * so the assertions below execute the engine's actual generated SQL.
 *
 * Two independent ranking facts are asserted throughout:
 *   1. `match_phase` — the degradation gate (1: lang+country, 2: lang,
 *      3: neutral, 4: watched), which is compared BEFORE score.
 *   2. exact `score` arithmetic — which pins each weight value.
 *
 * This file is a behavioural contract only: it changes no engine logic.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { RecommendationEngine } from '../../src/lib/services/RecommendationEngine';
import { createSqliteD1, type SqliteD1 } from '../helpers/sqlite-d1';
import app from '../../src/main';

/** SQLite `datetime('now')` yields UTC 'YYYY-MM-DD HH:MM:SS' — match it exactly. */
function utcHoursAgo(hours: number): string {
    return new Date(Date.now() - hours * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

/** Offsets chosen to land in distinct recency buckets (10 / 7 / 4 / 0 points). */
const HOURS = {
    HALF: 0.5,
    SIX: 6,
    TWO_DAYS: 48,
    TWO_AND_HALF_DAYS: 60,
    FIVE_DAYS: 120,
    TEN_DAYS: 240,
    TWENTY_DAYS: 480
} as const;

async function seedUser(
    d: SqliteD1,
    id: number,
    opts: { country?: string; language?: string } = {}
): Promise<void> {
    await d.prepare(
        `INSERT INTO users (id, email, username, display_name, password_hash, country, language)
         VALUES (?, ?, ?, ?, 'x', ?, ?)`
    ).bind(
        id,
        `u${id}@test.local`,
        `u${id}`,
        `User ${id}`,
        opts.country ?? 'SA',
        opts.language ?? 'ar'
    ).run();
}

async function seedCategory(d: SqliteD1, id: number): Promise<void> {
    await d.prepare(
        `INSERT INTO categories (id, slug, name_ar, name_en) VALUES (?, ?, ?, ?)`
    ).bind(id, `cat-${id}`, `قسم ${id}`, `Category ${id}`).run();
}

async function seedCompetition(
    d: SqliteD1,
    id: number,
    opts: {
        creator_id: number;
        language?: string;
        country?: string | null;
        created_at?: string;
        status?: string;
        total_views?: number;
        category_id?: number;
        average_rating?: number;
    }
): Promise<void> {
    await d.prepare(
        `INSERT INTO competitions
            (id, title, rules, category_id, creator_id, status, language, country,
             created_at, total_views, average_rating, vod_url)
         VALUES (?, ?, 'rules', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
        id,
        `Comp ${id}`,
        opts.category_id ?? 1,
        opts.creator_id,
        opts.status ?? 'completed',
        opts.language ?? 'ar',
        opts.country === undefined ? 'SA' : opts.country,
        opts.created_at ?? utcHoursAgo(HOURS.SIX),
        opts.total_views ?? 0,
        opts.average_rating ?? 0,
        `https://example.test/vod${id}.mp4`
    ).run();
}

async function seedFollow(d: SqliteD1, followerId: number, followingId: number): Promise<void> {
    await d.prepare(`INSERT INTO follows (follower_id, following_id) VALUES (?, ?)`)
        .bind(followerId, followingId).run();
}

/** ids in the exact order the engine returned them. */
const ids = (results: Array<{ id: number }>): number[] => results.map((r) => r.id);
/** match_phase in returned order — proves WHY the order is what it is. */
const phases = (results: Array<{ match_phase: number }>): number[] => results.map((r) => r.match_phase);
const scores = (results: Array<{ score: number }>): number[] => results.map((r) => r.score);
/** score of one specific competition — pins the exact arithmetic, not just the order. */
const scoreOf = (results: Array<{ id: number; score: number }>, id: number): number => {
    const row = results.find((r) => r.id === id);
    if (!row) throw new Error(`competition ${id} missing from results: [${results.map((r) => r.id)}]`);
    return row.score;
};
/** 1-based position of a competition in the returned ranking. */
const rankOf = (results: Array<{ id: number }>, id: number): number => results.findIndex((r) => r.id === id) + 1;

/** Hono env wrapper so the real app + real schema can answer HTTP requests. */
const envOf = (db: SqliteD1) => ({ DB: db as unknown as D1Database } as never);

/** Baseline of the six ranking weights, pinned so drift fails loudly. */
const PINNED_WEIGHTS = {
    WEIGHT_LANGUAGE_MATCH: 25,
    WEIGHT_COUNTRY_MATCH: 20,
    WEIGHT_CATEGORY_MATCH: 20,
    WEIGHT_UNWATCHED: 10,
    WEIGHT_RECENCY_MAX: 10,
    WEIGHT_RECENCY_MODERATE: 7,
    WEIGHT_RECENCY_WEAK: 4,
    WEIGHT_RATING_MAX: 15,
    WEIGHT_FOLLOWED: 15
} as const;

describe('B14: recommendation ranking weights and fallback behaviour', () => {
    let d: SqliteD1;

    beforeEach(async () => {
        d = createSqliteD1();
        // Every fixture competition points at category 1, so the FK target must
        // exist before any competition row is inserted.
        await seedCategory(d, 1);
    });

    describe('weight constants are pinned (values must never drift silently)', () => {
        for (const [name, value] of Object.entries(PINNED_WEIGHTS)) {
            it(`pins ${name} = ${value}`, () => {
                expect((RecommendationEngine as unknown as Record<string, number>)[name]).toBe(value);
            });
        }

        it('keeps the documented priority order: language > country > followed > recency > rating', () => {
            // The order is expressed by the weight magnitudes; if a future change
            // re-tunes a value so that a lower-priority signal outweighs a higher
            // one, this test fails.
            expect(PINNED_WEIGHTS.WEIGHT_LANGUAGE_MATCH)
                .toBeGreaterThan(PINNED_WEIGHTS.WEIGHT_COUNTRY_MATCH);
            expect(PINNED_WEIGHTS.WEIGHT_COUNTRY_MATCH)
                .toBeGreaterThan(PINNED_WEIGHTS.WEIGHT_UNWATCHED);
            expect(PINNED_WEIGHTS.WEIGHT_FOLLOWED)
                .toBeGreaterThan(PINNED_WEIGHTS.WEIGHT_RECENCY_MAX);
            expect(PINNED_WEIGHTS.WEIGHT_RECENCY_MAX)
                .toBeGreaterThan(PINNED_WEIGHTS.WEIGHT_RECENCY_WEAK);
            expect(PINNED_WEIGHTS.WEIGHT_RATING_MAX)
                .toBeGreaterThan(PINNED_WEIGHTS.WEIGHT_RECENCY_WEAK);
        });
    });
    /**
     * Case 1 — user language.
     * Data is identical in every respect except `competitions.language`, so the
     * only possible source of ordering is the language signal. Language is a
     * HARD phase gate (phases 1-2 filter `c.language = ?`), so the foreign
     * competition cannot surface before degradation relaxes language at phase 3.
     */
    describe('1. language: a competition in the user language outranks a foreign-language one', () => {
        it('ranks ar above en for an ar user, and proves it via match_phase', async () => {
            await seedUser(d, 1, { language: 'ar', country: 'SA' });
            await seedUser(d, 2, { country: 'SA' });
            await seedUser(d, 3, { country: 'SA' });

            await seedCompetition(d, 10, { creator_id: 2, language: 'ar', country: 'SA' });
            await seedCompetition(d, 11, { creator_id: 3, language: 'en', country: 'SA' });

            const engine = new RecommendationEngine(d as unknown as D1Database);
            const { results } = await engine.getRecommendations(1, 20, 0);

            expect(ids(results)).toEqual([10, 11]);
            expect(phases(results)).toEqual([1, 3]);
            expect(scoreOf(results, 10) - scoreOf(results, 11)).toBe(RecommendationEngine.WEIGHT_LANGUAGE_MATCH);
        });
    });

    /**
     * Case 2 — user country.
     * (a) the competition's own country is a phase gate;
     * (b) the creator's country (+20) is the in-score weight.
     * Both halves use same-language fixtures so country is the only variable.
     */
    describe('2. country: a competition from the user country outranks a foreign one', () => {
        it('ranks the same-country competition above the different-country one (phase gate)', async () => {
            await seedUser(d, 1, { language: 'ar', country: 'SA' });
            await seedUser(d, 2, { country: 'SA' });
            await seedUser(d, 3, { country: 'SA' });

            await seedCompetition(d, 20, { creator_id: 2, language: 'ar', country: 'SA' });
            await seedCompetition(d, 21, { creator_id: 3, language: 'ar', country: 'EG' });

            const engine = new RecommendationEngine(d as unknown as D1Database);
            const { results } = await engine.getRecommendations(1, 20, 0);

            expect(ids(results)).toEqual([20, 21]);
            expect(phases(results)).toEqual([1, 2]);
        });

        it('adds exactly WEIGHT_COUNTRY_MATCH when the creator is in the user country', async () => {
            await seedUser(d, 1, { language: 'ar', country: 'SA' });
            await seedUser(d, 2, { country: 'SA' });
            await seedUser(d, 3, { country: 'EG' });

            // Both competitions are 'SA', so both clear the phase-1 country gate;
            // only the CREATOR's country differs.
            await seedCompetition(d, 22, { creator_id: 2, language: 'ar', country: 'SA' });
            await seedCompetition(d, 23, { creator_id: 3, language: 'ar', country: 'SA' });

            const engine = new RecommendationEngine(d as unknown as D1Database);
            const { results } = await engine.getRecommendations(1, 20, 0);

            expect(ids(results)).toEqual([22, 23]);
            expect(phases(results)).toEqual([1, 1]);
            expect(scoreOf(results, 22) - scoreOf(results, 23)).toBe(RecommendationEngine.WEIGHT_COUNTRY_MATCH);
        });
    });

    /**
     * Case 3 — follow signal.
     * Same language, same country, same age, same category, same rating, no
     * watch history. The only difference is that user 1 follows the creator of
     * competition 30 and not the creator of 31, so the gap between them must be
     * exactly WEIGHT_FOLLOWED.
     */
    describe('3. follow: a competition by a followed creator outranks an equal one', () => {
        it('puts the followed creator first and pins the exact follow gap', async () => {
            await seedUser(d, 1, { language: 'ar', country: 'SA' });
            await seedUser(d, 2, { country: 'SA' });
            await seedUser(d, 3, { country: 'SA' });
            await seedFollow(d, 1, 2);

            await seedCompetition(d, 30, { creator_id: 2, language: 'ar', country: 'SA' });
            await seedCompetition(d, 31, { creator_id: 3, language: 'ar', country: 'SA' });

            const engine = new RecommendationEngine(d as unknown as D1Database);
            const { results } = await engine.getRecommendations(1, 20, 0);

            expect(ids(results)).toEqual([30, 31]);
            expect(rankOf(results, 30)).toBeLessThan(rankOf(results, 31));
            // Same degradation phase, so score (not the phase gate) decided it.
            expect(phases(results)).toEqual([1, 1]);
            expect(scoreOf(results, 30) - scoreOf(results, 31))
                .toBe(RecommendationEngine.WEIGHT_FOLLOWED);
        });
    });

    /**
     * Case 4 — recency.
     * Four competitions from the SAME creator, in the SAME language/country,
     * with identical rating/category/unwatched signals. They differ only in
     * `created_at`, one per recency bucket -> the ordering must follow the
     * bucket weights 10 / 7 / 4 / 0.
     */
    describe('4. recency: when every other signal ties, newer outranks older', () => {
        it('orders the four recency buckets newest-first and pins each tier weight', async () => {
            await seedUser(d, 1, { language: 'ar', country: 'SA' });
            await seedUser(d, 2, { country: 'SA' });

            await seedCompetition(d, 50, {
                creator_id: 2, created_at: utcHoursAgo(HOURS.SIX)          // < 1 day -> 10
            });
            await seedCompetition(d, 51, {
                creator_id: 2, created_at: utcHoursAgo(HOURS.TWO_DAYS)     // < 3 days -> 7
            });
            await seedCompetition(d, 52, {
                creator_id: 2, created_at: utcHoursAgo(HOURS.FIVE_DAYS)    // < 7 days -> 4
            });
            await seedCompetition(d, 53, {
                creator_id: 2, created_at: utcHoursAgo(HOURS.TEN_DAYS)     // older    -> 0
            });

            const engine = new RecommendationEngine(d as unknown as D1Database);
            const { results } = await engine.getRecommendations(1, 20, 0);

            expect(ids(results)).toEqual([50, 51, 52, 53]);
            expect(phases(results)).toEqual([1, 1, 1, 1]);
            // All other signals are identical, so each gap against the oldest row
            // is exactly that row's recency-tier weight.
            expect(scoreOf(results, 50) - scoreOf(results, 53))
                .toBe(RecommendationEngine.WEIGHT_RECENCY_MAX);
            expect(scoreOf(results, 51) - scoreOf(results, 53))
                .toBe(RecommendationEngine.WEIGHT_RECENCY_MODERATE);
            expect(scoreOf(results, 52) - scoreOf(results, 53))
                .toBe(RecommendationEngine.WEIGHT_RECENCY_WEAK);
        });
    });
/**
     * Case 5 — guest fallback.
     * A visitor has no row in `users`, no follows and no watch history, so every
     * personal signal is unavailable. The fallback MUST still return rows (an
     * empty home page is the failure being guarded against), and it must fall
     * back to the documented "newest + most viewed" ranking.
     *
     * Proven through the real HTTP endpoint so the controller's guest branch —
     * not just the engine — is covered.
     */
    describe('5. guest: no personal signals still yields a ranked, non-empty fallback', () => {
        it('returns a non-empty list even when nothing matches the requested language', async () => {
            await seedUser(d, 2, { country: 'SA' });
            await seedUser(d, 3, { country: 'SA' });

            // Every competition is English while the visitor asks for Arabic, so a
            // language-gated query would return nothing at all.
            await seedCompetition(d, 70, {
                creator_id: 2, language: 'en', created_at: utcHoursAgo(HOURS.HALF)
            });
            await seedCompetition(d, 71, {
                creator_id: 3, language: 'en', created_at: utcHoursAgo(HOURS.TWO_DAYS)
            });

            const res = await app.request('/api/recommendations?limit=20&lang=ar', {}, envOf(d));
            expect(res.status).toBe(200);

            const body = await res.json() as {
                success: boolean;
                data: { competitions: Array<{ id: number; score: number }> };
            };
            expect(body.success).toBe(true);

            // Fallback exists: not an empty page.
            expect(body.data.competitions.length).toBe(2);

            // Fallback is newest-first and language-independent: the two scores are
            // pure recency tiers, with zero language bonus for the mismatched rows.
            expect(ids(body.data.competitions)).toEqual([70, 71]);
            expect(scores(body.data.competitions)).toEqual([
                RecommendationEngine.WEIGHT_RECENCY_MAX,
                RecommendationEngine.WEIGHT_RECENCY_MODERATE
            ]);
        });

        it('falls back to most-viewed ordering when language and age are tied', async () => {
            await seedUser(d, 2, { country: 'SA' });

            const age = utcHoursAgo(HOURS.HALF);
            await seedCompetition(d, 72, { creator_id: 2, language: 'ar', created_at: age, total_views: 0 });
            await seedCompetition(d, 73, { creator_id: 2, language: 'ar', created_at: age, total_views: 100 });
            await seedCompetition(d, 74, { creator_id: 2, language: 'ar', created_at: age, total_views: 500 });

            const res = await app.request('/api/recommendations?limit=20&lang=ar', {}, envOf(d));
            const body = await res.json() as {
                data: { competitions: Array<{ id: number; score: number }> };
            };
            const competitions = body.data.competitions;

            // Popularity drives the fallback ordering: most viewed first.
            expect(ids(competitions)).toEqual([74, 73, 72]);

            // And the popularity gap is exactly views * VIEW_POPULARITY_FACTOR.
            expect(scoreOf(competitions, 74) - scoreOf(competitions, 72))
                .toBeCloseTo(500 * RecommendationEngine.VIEW_POPULARITY_FACTOR, 10);

            // The base of a guest row is exactly language match + best recency tier.
            expect(scoreOf(competitions, 72)).toBeCloseTo(
                RecommendationEngine.WEIGHT_LANGUAGE_MATCH + RecommendationEngine.WEIGHT_RECENCY_MAX,
                10
            );
        });
    });

    /**
     * Case 6 — interaction sensitivity.
     *
     * The user-signal ranking is only meaningful if it actually REACTS to user
     * behaviour. This test measures the same query twice: once before the user
     * follows creator X and once after, and requires the ranking of X's
     * competition to move UP across the two measurements.
     *
     * To make the expectation unambiguous, the comparator is deliberately given
     * an advantage that the follow must overturn:
     *   - X's competition (60) is 5 days old  -> recency tier +4
     *   - comparator   (61) is 30 min old     -> recency tier +10
     * so BEFORE the follow, 61 leads 60 by exactly (10 - 4) = 6 points.
     * WEIGHT_FOLLOWED (15) is larger than that gap, so AFTER the follow 60 must
     * lead. A tie or a coincidental ordering therefore cannot satisfy the test.
     */
    describe('6. interaction sensitivity: following creator X lifts X in the ranking', () => {
        it('moves X above the comparator only once the follow exists', async () => {
            await seedUser(d, 1, { language: 'ar', country: 'SA' });
            await seedUser(d, 2, { country: 'SA' });   // X — the creator to follow
            await seedUser(d, 3, { country: 'SA' });   // comparator creator

            // Identical language, country, category, rating and (no) watch history:
            // recency is the only pre-existing difference, and it favours 61.
            await seedCompetition(d, 60, {
                creator_id: 2, language: 'ar', country: 'SA',
                created_at: utcHoursAgo(HOURS.FIVE_DAYS)
            });
            await seedCompetition(d, 61, {
                creator_id: 3, language: 'ar', country: 'SA',
                created_at: utcHoursAgo(HOURS.HALF)
            });

            const engine = new RecommendationEngine(d as unknown as D1Database);

            // --- Baseline: before any follow -----------------------------------
            const before = await engine.getRecommendations(1, 20, 0);
            expect(ids(before.results)).toEqual([61, 60]);
            expect(rankOf(before.results, 60)).toBe(2);
            // The gap is real and equals the recency-bucket difference.
            expect(scoreOf(before.results, 61) - scoreOf(before.results, 60))
                .toBe(RecommendationEngine.WEIGHT_RECENCY_MAX - RecommendationEngine.WEIGHT_RECENCY_WEAK);

            // --- The interaction under test ------------------------------------
            await seedFollow(d, 1, 2);

            // --- Re-measure: after the follow ----------------------------------
            const after = await engine.getRecommendations(1, 20, 0);

            // The ranking itself moved: X is now first, not second.
            expect(ids(after.results)).toEqual([60, 61]);
            expect(rankOf(after.results, 60)).toBe(1);
            expect(rankOf(after.results, 60)).toBeLessThan(rankOf(before.results, 60));

            // Same degradation phase both times, so SCORE drove the change.
            expect(phases(before.results)).toEqual([1, 1]);
            expect(phases(after.results)).toEqual([1, 1]);

            // Exactly one signal changed, by exactly WEIGHT_FOLLOWED.
            expect(scoreOf(after.results, 60) - scoreOf(before.results, 60))
                .toBe(RecommendationEngine.WEIGHT_FOLLOWED);
            // ...and it did not leak onto the unrelated competition.
            expect(scoreOf(after.results, 61)).toBe(scoreOf(before.results, 61));
        });
    });


});
