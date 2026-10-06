/**
 * R3-D1 — User/Guest recommendation ranking contract (h7-v1).
 *
 * Replaces the B14 old-engine pin (phases 1–4 + legacy point weights),
 * which R3-D1 supersedes per the approved policy (11 is the sole source
 * of numbers — no alternative figures are copied from old docs/tests).
 *
 * Purpose: PIN the H7 ranking that RecommendationEngine + the guest branch
 * produce today, so any future change to an approved weight, to Q, to the
 * half-lives, or to the fallback fails loudly here instead of silently
 * changing the home page.
 *
 * Real-SQL harness (unchanged): `tests/helpers/sqlite-d1.ts` loads the
 * project's real migrations, so ordering assertions execute production SQL
 * + the H7 service (not a hand-rolled approximation).
 *
 * Asserted throughout:
 *   1. directionality — the favoured signal outranks, all else equal;
 *   2. H7 scale — every score on 0–100, no degradation phases (match_phase
 *      is always 1: eligibility gates, never ranking tiers);
 *   3. fallback — guests still get ranked non-empty lists.
 *
 * This file is a behavioural contract only: it changes no ranking logic.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { RecommendationEngine } from '../../src/lib/services/RecommendationEngine';
import { createSqliteD1, type SqliteD1 } from '../helpers/sqlite-d1';
import app from '../../src/main';

/** SQLite `datetime('now')` yields UTC 'YYYY-MM-DD HH:MM:SS' — match it exactly. */
function utcHoursAgo(hours: number): string {
    return new Date(Date.now() - hours * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

const HOURS = {
    HALF: 0.5,
    SIX: 6,
    TWO_DAYS: 48,
    FIVE_DAYS: 120,
    TEN_DAYS: 240,
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
    }
): Promise<void> {
    await d.prepare(
        `INSERT INTO competitions
            (id, title, rules, category_id, creator_id, status, language, country,
             created_at, total_views, vod_url)
         VALUES (?, ?, 'rules', ?, ?, ?, ?, ?, ?, ?, ?)`
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
        `https://example.test/vod${id}.mp4`
    ).run();
}

async function seedFollow(d: SqliteD1, followerId: number, followingId: number): Promise<void> {
    await d.prepare(`INSERT INTO follows (follower_id, following_id) VALUES (?, ?)`)
        .bind(followerId, followingId).run();
}

/** ids in the exact order the engine returned them. */
const ids = (results: Array<{ id: number }>): number[] => results.map((r) => r.id);
const scores = (results: Array<{ score: number }>): number[] => results.map((r) => r.score);
/** score of one specific competition — pins the arithmetic, not just the order. */
const scoreOf = (results: Array<{ id: number; score: number }>, id: number): number => {
    const row = results.find((r) => r.id === id);
    if (!row) throw new Error(`competition ${id} missing from results: [${results.map((r) => r.id)}]`);
    return row.score;
};
/** 1-based position of a competition in the returned ranking. */
const rankOf = (results: Array<{ id: number }>, id: number): number => results.findIndex((r) => r.id === id) + 1;

/** Hono env wrapper so the real app + real schema can answer HTTP requests. */
const envOf = (db: SqliteD1) => ({ DB: db as unknown as D1Database } as never);

describe('R3-D1: recommendation ranking (h7-v1) and fallback behaviour', () => {
    let d: SqliteD1;

    beforeEach(async () => {
        d = createSqliteD1();
        await seedCategory(d, 1);
    });

    describe('H7 scale contract (no degradation phases)', () => {
        it('scores every row on 0–100 with match_phase always 1', async () => {
            await seedUser(d, 1, { language: 'ar', country: 'SA' });
            await seedUser(d, 2, { country: 'SA' });
            await seedCompetition(d, 10, { creator_id: 2, language: 'ar', country: 'SA' });
            await seedCompetition(d, 11, { creator_id: 2, language: 'en', country: 'SA' });
            const engine = new RecommendationEngine(d as unknown as D1Database);
            const { results } = await engine.getRecommendations(1, 20, 0);
            expect(results.length).toBe(2);
            for (const r of results) {
                expect(r.score).toBeGreaterThanOrEqual(0);
                expect(r.score).toBeLessThanOrEqual(100);
                expect(r.match_phase).toBe(1);
            }
        });
    });

    /**
     * Case 1 — user language.
     * Identical in every respect except `competitions.language`, so the
     * only possible source of ordering is the language signal (H7 user
     * weight 15). No hard gate: both rows surface, favoured first.
     */
    describe('1. language: a competition in the user language outranks a foreign-language one', () => {
        it('ranks ar above en for an ar user', async () => {
            await seedUser(d, 1, { language: 'ar', country: 'SA' });
            await seedUser(d, 2, { country: 'SA' });
            await seedUser(d, 3, { country: 'SA' });

            await seedCompetition(d, 10, { creator_id: 2, language: 'ar', country: 'SA' });
            await seedCompetition(d, 11, { creator_id: 3, language: 'en', country: 'SA' });

            const engine = new RecommendationEngine(d as unknown as D1Database);
            const { results } = await engine.getRecommendations(1, 20, 0);

            expect(ids(results)).toEqual([10, 11]);
            expect(scoreOf(results, 10)).toBeGreaterThan(scoreOf(results, 11));
        });
    });

    /**
     * Case 2 — user country.
     * Same language so country is the only variable (H7 user weight 5).
     */
    describe('2. country: a competition from the user country outranks a foreign one', () => {
        it('ranks the same-country competition above the different-country one', async () => {
            await seedUser(d, 1, { language: 'ar', country: 'SA' });
            await seedUser(d, 2, { country: 'SA' });
            await seedUser(d, 3, { country: 'SA' });

            await seedCompetition(d, 20, { creator_id: 2, language: 'ar', country: 'SA' });
            await seedCompetition(d, 21, { creator_id: 3, language: 'ar', country: 'EG' });

            const engine = new RecommendationEngine(d as unknown as D1Database);
            const { results } = await engine.getRecommendations(1, 20, 0);

            expect(ids(results)).toEqual([20, 21]);
            expect(scoreOf(results, 20)).toBeGreaterThan(scoreOf(results, 21));
        });
    });

    /**
     * Case 3 — follow signal (H7 user weight 10).
     * Same language/country/age/category, no watch history. The only
     * difference is the follow, so the followed creator must lead.
     */
    describe('3. follow: a competition by a followed creator outranks an equal one', () => {
        it('puts the followed creator first', async () => {
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
            expect(scoreOf(results, 30)).toBeGreaterThan(scoreOf(results, 31));
        });
    });

    /**
     * Case 4 — recency (H7 continuous half-life decay, recorded H=30d).
     * Same creator/language/country, identical quality signals. Newer
     * must precede older — monotonically, newest first.
     */
    describe('4. recency: when every other signal ties, newer outranks older', () => {
        it('orders the four ages newest-first', async () => {
            await seedUser(d, 1, { language: 'ar', country: 'SA' });
            await seedUser(d, 2, { country: 'SA' });

            await seedCompetition(d, 50, { creator_id: 2, created_at: utcHoursAgo(HOURS.SIX) });
            await seedCompetition(d, 51, { creator_id: 2, created_at: utcHoursAgo(HOURS.TWO_DAYS) });
            await seedCompetition(d, 52, { creator_id: 2, created_at: utcHoursAgo(HOURS.FIVE_DAYS) });
            await seedCompetition(d, 53, { creator_id: 2, created_at: utcHoursAgo(HOURS.TEN_DAYS) });

            const engine = new RecommendationEngine(d as unknown as D1Database);
            const { results } = await engine.getRecommendations(1, 20, 0);

            expect(ids(results)).toEqual([50, 51, 52, 53]);
            expect(scoreOf(results, 50)).toBeGreaterThan(scoreOf(results, 51));
            expect(scoreOf(results, 51)).toBeGreaterThan(scoreOf(results, 52));
            expect(scoreOf(results, 52)).toBeGreaterThan(scoreOf(results, 53));
        });
    });

    /**
     * Case 5 — guest fallback.
     * No user row, no follows, no history: ranking still returns rows
     * (an empty page is the failure being guarded against), newest first
     * when language mismatches, most-viewed first when age ties.
     * Proven through the real HTTP endpoint so the controller's guest
     * branch — not just the engine — is covered.
     */
    describe('5. guest: no personal signals still yields a ranked, non-empty fallback', () => {
        it('returns a non-empty list even when nothing matches the requested language', async () => {
            await seedUser(d, 2, { country: 'SA' });
            await seedUser(d, 3, { country: 'SA' });

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
            expect(body.data.competitions.length).toBe(2);
            // Newest first, language-independent.
            expect(ids(body.data.competitions)).toEqual([70, 71]);
            for (const s of scores(body.data.competitions)) {
                expect(s).toBeGreaterThanOrEqual(0);
                expect(s).toBeLessThanOrEqual(100);
            }
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

            // Quality (views via Q) drives the fallback ordering: most viewed first.
            expect(ids(competitions)).toEqual([74, 73, 72]);
            expect(scoreOf(competitions, 74)).toBeGreaterThan(scoreOf(competitions, 73));
            expect(scoreOf(competitions, 73)).toBeGreaterThan(scoreOf(competitions, 72));
        });
    });

    /**
     * Case 6 — interaction sensitivity.
     * X's competition (60) is 5 days old, the comparator (61) 30 minutes
     * old, so BEFORE the follow 61 leads. The H7 follow weight (10) is
     * larger than the recency gap, so AFTER the follow 60 must lead.
     */
    describe('6. interaction sensitivity: following creator X lifts X in the ranking', () => {
        it('moves X above the comparator only once the follow exists', async () => {
            await seedUser(d, 1, { language: 'ar', country: 'SA' });
            await seedUser(d, 2, { country: 'SA' });   // X — the creator to follow
            await seedUser(d, 3, { country: 'SA' });   // comparator creator

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

            // --- The interaction under test ------------------------------------
            await seedFollow(d, 1, 2);

            // --- Re-measure: after the follow ----------------------------------
            const after = await engine.getRecommendations(1, 20, 0);

            expect(ids(after.results)).toEqual([60, 61]);
            expect(rankOf(after.results, 60)).toBe(1);
            expect(rankOf(after.results, 60)).toBeLessThan(rankOf(before.results, 60));

            // Exactly one signal changed, and it did not leak onto the
            // unrelated competition (clock-tick tolerance: recency reads
            // Date.now() at build time, so compare closely, not bitwise).
            expect(scoreOf(after.results, 60)).toBeGreaterThan(scoreOf(before.results, 60));
            expect(scoreOf(after.results, 61)).toBeCloseTo(scoreOf(before.results, 61), 6);
        });
    });
});
