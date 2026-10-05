/**
 * Rating Model
 * نموذج التقييم
 *
 * Handles all database operations for competition ratings.
 */

import { BaseModel } from './base/BaseModel';
import { UserBlockModel } from './UserBlockModel';
import { BlockedInteractionError, RatingEligibilityError } from '../lib/errors/AppError';

/**
 * R2-V: live-only ratings. There is NO 24h window and NO grace period —
 * every write is allowed only while the competition is `live` and is
 * rejected immediately after the cutoff (live -> completed).
 *
 * Legacy B10 24h-window constant is kept (deprecated) so historical imports
 * keep compiling; it no longer gates any write.
 */
export const RATING_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * R2-V: cumulative live seconds that unlock rating (L1 SSOT mirror).
 * Must equal WatchService.WATCH_ELIGIBILITY_SECONDS (pinned by test).
 */
export const RATING_WATCH_SECONDS = 300;

export type RatingEligibilityCode =
    | 'SELF'
    | 'WATCH'
    | 'NOT_LIVE'
    | 'CLOSED'
    // Legacy codes (B10/B11 era: completed+24h, no replacement). Kept in the
    // union so old catch-sites keep compiling; new code never emits them.
    | 'WINDOW'
    | 'DUPLICATE'
    | 'NOT_COMPLETED';

export interface RatingEligibilityInput {
    competition: { status: string; creator_id: number; opponent_id: number | null };
    userId: number;
    competitorId: number;
    /** Cumulative LIVE seconds from watch_history (server SSOT, never client). */
    watchSeconds: number;
}

/**
 * Pure eligibility decision — no DB, no clock reads inside.
 * R2-V: live status + L1 300s only. Re-rating the same competitor is
 * allowed (replacement), so there is no DUPLICATE verdict.
 */
export function decideRatingEligibility(input: RatingEligibilityInput): RatingEligibilityCode | null {
    if (input.userId === input.competition.creator_id || input.userId === input.competition.opponent_id) return 'SELF';
    if (input.competition.status !== 'live') {
        return input.competition.status === 'completed' ? 'CLOSED' : 'NOT_LIVE';
    }
    if (input.watchSeconds < RATING_WATCH_SECONDS) return 'WATCH';
    return null;
}

/**
 * B10/B11: shared 24h-window predicate reused by rate + withdraw paths
 * (B11 must reuse this — no reinvented window logic). Boundary is inclusive:
 * exactly ended_at + 24h is still open. Legacy NULL ended_at rows are
 * treated as open so pre-B10 fixtures keep working.
 */
export function isWindowOpen(endedAt: string | null | undefined, nowMs: number): boolean {
    if (endedAt == null) return true;
    const endedMs = Date.parse(endedAt);
    if (!Number.isFinite(endedMs)) return false;
    return nowMs <= endedMs + RATING_WINDOW_MS;
}

/**
 * B11: anonymous per-competitor rating summary row (no rater identity).
 */
export interface RatingSummaryEntry {
    competitor_id: number;
    average: number | null;
    count: number;
    distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

/**
 * Rating entity
 */
export interface Rating {
    id: number;
    competition_id: number;
    user_id: number;
    competitor_id: number;
    rating: number;
    created_at: string;
}

/**
 * Rating with user details
 */
export interface RatingWithUser extends Rating {
    display_name?: string;
    avatar_url?: string;
}

/**
 * Rating Model Class
 */
export class RatingModel extends BaseModel<Rating> {
    protected readonly tableName = 'ratings';

    /**
     * Create a new rating — domain-specific signature used by the controller.
     */
    async create(competitionId: number, userId: number, competitorId: number, rating: number): Promise<{ id: number }>;

    /**
     * BaseModel compatibility: create from a Partial<Rating> object.
     */
    async create(data: Partial<Rating>): Promise<Rating>;

    async create(...args: any[]): Promise<any> {
        if (args.length === 4) {
            const [competitionId, userId, competitorId, rating] = args as [number, number, number, number];
            // B6: rater and rated competitor must not be blocking each other.
            const blocked = await new UserBlockModel(this.db).isBlockedBetween(userId, competitorId);
            if (blocked) {
                throw new BlockedInteractionError();
            }
            const result = await this.db.prepare(`
                INSERT INTO ratings (competition_id, user_id, competitor_id, rating, created_at)
                VALUES (?, ?, ?, ?, datetime('now'))
            `).bind(competitionId, userId, competitorId, rating).run();
            return { id: result.meta.last_row_id as number };
        }
        const data = args[0] as Partial<Rating>;
        const blocked = await new UserBlockModel(this.db).isBlockedBetween(data.user_id!, data.competitor_id!);
        if (blocked) {
            throw new BlockedInteractionError();
        }
        const result = await this.db.prepare(`
            INSERT INTO ratings (competition_id, user_id, competitor_id, rating, created_at)
            VALUES (?, ?, ?, ?, datetime('now'))
        `).bind(data.competition_id!, data.user_id!, data.competitor_id!, data.rating!).run();
        return { id: result.meta.last_row_id as number, ...data } as Rating;
    }

    /**
     * R2-V: server-side eligibility gate (L1 SSOT).
     * Reads the competition row (status/participants, static) + the
     * cumulative LIVE seconds from watch_history (the one source R2-V reads
     * — never client seconds/user_id), decides via
     * decideRatingEligibility(), throws RatingEligibilityError on denial.
     * No SQL in controllers/routes. Re-rating is allowed (replacement), so
     * there is no duplicate verdict here.
     */
    async checkEligibility(
        competition: { id: number; status: string; creator_id: number; opponent_id: number | null; ended_at?: string | null },
        userId: number,
        competitorId: number,
    ): Promise<void> {
        const row = await this.db.prepare(
            'SELECT COALESCE(watch_duration_seconds, 0) AS s FROM watch_history WHERE user_id = ? AND competition_id = ?',
        ).bind(userId, competition.id).first<{ s: number | null }>();
        const code = decideRatingEligibility({
            competition: {
                status: competition.status,
                creator_id: competition.creator_id,
                opponent_id: competition.opponent_id,
            },
            userId,
            competitorId,
            watchSeconds: Number(row?.s ?? 0),
        });
        if (code) throw new RatingEligibilityError(code);
    }

    /**
     * R2-V: atomically create-or-replace one effective vote.
     *
     * Every write is guarded INSIDE SQL by the live status (+ the 300s
     * threshold), so an end-vs-rate race can never slip a post-cutoff write
     * through: the guarded statement simply matches 0 rows once the
     * competition is no longer live. Callers map the zero-change outcome to
     * 403 via checkEligibility (read-after-failure is only for the error
     * message — correctness was already decided by the guarded write).
     *
     * Replacement semantics: one effective row per
     * (competition, user, competitor); a second vote overwrites the value.
     * Concurrent first votes serialize on the UNIQUE key — the loser retries
     * as a guarded replacement, so the outcome is exactly one row, never a
     * duplicate and never a 500.
     *
     * Returns 'created' (201) or 'updated' (200).
     */
    async rateLiveAtomic(
        competitionId: number,
        userId: number,
        competitorId: number,
        rating: number,
    ): Promise<'created' | 'updated'> {
        const blocked = await new UserBlockModel(this.db).isBlockedBetween(userId, competitorId);
        if (blocked) throw new BlockedInteractionError();

        // Fast path: guarded replacement when a row already exists.
        const replaced = await this.db.prepare(`
            UPDATE ratings SET rating = ?, created_at = datetime('now')
            WHERE competition_id = ? AND user_id = ? AND competitor_id = ?
              AND (SELECT status FROM competitions WHERE id = ?) = 'live'
              AND (SELECT COALESCE(watch_duration_seconds, 0) FROM watch_history WHERE user_id = ? AND competition_id = ?) >= ${RATING_WATCH_SECONDS}
        `).bind(rating, competitionId, userId, competitorId, competitionId, userId, competitionId).run();
        if (Number(replaced.meta.changes ?? 0) > 0) return 'updated';

        // Creation path: conditional INSERT — inserts exactly one row only
        // when live + eligible; otherwise inserts nothing (changes = 0).
        try {
            const inserted = await this.db.prepare(`
                INSERT INTO ratings (competition_id, user_id, competitor_id, rating, created_at)
                SELECT ?, ?, ?, ?, datetime('now')
                WHERE (SELECT status FROM competitions WHERE id = ?) = 'live'
                  AND (SELECT COALESCE(watch_duration_seconds, 0) FROM watch_history WHERE user_id = ? AND competition_id = ?) >= ${RATING_WATCH_SECONDS}
            `).bind(competitionId, userId, competitorId, rating, competitionId, userId, competitionId).run();
            if (Number(inserted.meta.changes ?? 0) > 0) return 'created';
        } catch (e) {
            // Concurrent first-vote race: the loser hits the UNIQUE key.
            // Retry once as a guarded replacement (still live-guarded).
            const msg = (e as Error)?.message || '';
            if (/UNIQUE constraint failed/i.test(msg)) {
                const retry = await this.db.prepare(`
                    UPDATE ratings SET rating = ?, created_at = datetime('now')
                    WHERE competition_id = ? AND user_id = ? AND competitor_id = ?
                      AND (SELECT status FROM competitions WHERE id = ?) = 'live'
                      AND (SELECT COALESCE(watch_duration_seconds, 0) FROM watch_history WHERE user_id = ? AND competition_id = ?) >= ${RATING_WATCH_SECONDS}
                `).bind(rating, competitionId, userId, competitorId, competitionId, userId, competitionId).run();
                if (Number(retry.meta.changes ?? 0) > 0) return 'updated';
            } else {
                throw e;
            }
        }

        // Zero-change: either the cutoff won the race or the viewer is not
        // eligible. Re-read for a precise denial (message only).
        const comp = await this.db.prepare(
            'SELECT status, creator_id, opponent_id FROM competitions WHERE id = ?',
        ).bind(competitionId).first<{ status: string; creator_id: number; opponent_id: number | null }>();
        const watch = await this.db.prepare(
            'SELECT COALESCE(watch_duration_seconds, 0) AS s FROM watch_history WHERE user_id = ? AND competition_id = ?',
        ).bind(userId, competitionId).first<{ s: number | null }>();
        const code = decideRatingEligibility({
            competition: {
                status: comp?.status ?? 'completed',
                creator_id: comp?.creator_id ?? -1,
                opponent_id: comp?.opponent_id ?? null,
            },
            userId,
            competitorId,
            watchSeconds: Number(watch?.s ?? 0),
        });
        // Self-guard is decided by the caller first, but stay safe here.
        if (comp && (userId === comp.creator_id || userId === comp.opponent_id)) {
            throw new RatingEligibilityError('SELF');
        }
        throw new RatingEligibilityError(code ?? 'CLOSED');
    }

    /**
     * R2-V: atomically replace an existing vote (explicit update path).
     * Live-guarded like rateLiveAtomic. Returns false when no such rating
     * existed (caller maps to 404); throws RatingEligibilityError when the
     * competition is no longer live or the viewer lost eligibility.
     */
    async updateLiveAtomic(
        competitionId: number,
        userId: number,
        competitorId: number,
        rating: number,
    ): Promise<boolean> {
        const blocked = await new UserBlockModel(this.db).isBlockedBetween(userId, competitorId);
        if (blocked) throw new BlockedInteractionError();
        const res = await this.db.prepare(`
            UPDATE ratings SET rating = ?, created_at = datetime('now')
            WHERE competition_id = ? AND user_id = ? AND competitor_id = ?
              AND (SELECT status FROM competitions WHERE id = ?) = 'live'
              AND (SELECT COALESCE(watch_duration_seconds, 0) FROM watch_history WHERE user_id = ? AND competition_id = ?) >= ${RATING_WATCH_SECONDS}
        `).bind(rating, competitionId, userId, competitorId, competitionId, userId, competitionId).run();
        if (Number(res.meta.changes ?? 0) > 0) return true;
        const existing = await this.hasRated(competitionId, userId, competitorId);
        if (!existing) return false;
        const comp = await this.db.prepare(
            'SELECT status, creator_id, opponent_id FROM competitions WHERE id = ?',
        ).bind(competitionId).first<{ status: string; creator_id: number; opponent_id: number | null }>();
        const watch = await this.db.prepare(
            'SELECT COALESCE(watch_duration_seconds, 0) AS s FROM watch_history WHERE user_id = ? AND competition_id = ?',
        ).bind(userId, competitionId).first<{ s: number | null }>();
        const code = decideRatingEligibility({
            competition: {
                status: comp?.status ?? 'completed',
                creator_id: comp?.creator_id ?? -1,
                opponent_id: comp?.opponent_id ?? null,
            },
            userId,
            competitorId,
            watchSeconds: Number(watch?.s ?? 0),
        });
        throw new RatingEligibilityError(code ?? 'CLOSED');
    }

    /**
     * Check if user has already rated a competitor
     */
    async hasRated(competitionId: number, userId: number, competitorId: number): Promise<boolean> {
        const result = await this.db.prepare(`
            SELECT 1 FROM ratings WHERE competition_id = ? AND user_id = ? AND competitor_id = ?
        `).bind(competitionId, userId, competitorId).first();
        return result !== null;
    }

    /**
     * Find all ratings for a competition — B11: anonymized public view.
     * Returns aggregate-safe shape with NO rater identity (no user_id,
     * no display_name, no JOIN to users). Admin detail views are out of
     * scope for B11 (separate admin route, not created here).
     */
    async findByCompetition(competitionId: number): Promise<Array<Pick<Rating, 'id' | 'competition_id' | 'competitor_id' | 'rating' | 'created_at'>>> {
        const result = await this.db.prepare(`
            SELECT id, competition_id, competitor_id, rating, created_at
            FROM ratings
            WHERE competition_id = ?
            ORDER BY created_at DESC
        `).bind(competitionId).all();
        return (result.results as unknown) as Array<Pick<Rating, 'id' | 'competition_id' | 'competitor_id' | 'rating' | 'created_at'>>;
    }

    /**
     * B11: anonymous per-competitor summary via SQL GROUP BY aggregation.
     * Never fetches rating rows into JS — average/count/distribution all
     * come from the aggregation query. NULL average when count = 0
     * (no division by zero, no NaN). No user_id/username/email anywhere.
     */
    async getSummary(competitionId: number, competitorIds: number[]): Promise<RatingSummaryEntry[]> {
        const result = await this.db.prepare(`
            SELECT competitor_id,
                   AVG(rating) AS average,
                   COUNT(*) AS count,
                   SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) AS c1,
                   SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) AS c2,
                   SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) AS c3,
                   SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) AS c4,
                   SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) AS c5
            FROM ratings
            WHERE competition_id = ?
            GROUP BY competitor_id
        `).bind(competitionId).all<{ competitor_id: number; average: number | null; count: number; c1: number; c2: number; c3: number; c4: number; c5: number }>();
        const byCompetitor = new Map<number, { average: number | null; count: number; c1: number; c2: number; c3: number; c4: number; c5: number }>();
        for (const row of (result.results ?? [])) {
            byCompetitor.set(row.competitor_id, row);
        }
        return competitorIds.map((competitorId) => {
            const row = byCompetitor.get(competitorId);
            if (!row || Number(row.count) === 0) {
                return { competitor_id: competitorId, average: null, count: 0, distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } };
            }
            const avg = row.average === null ? null : Math.round(Number(row.average) * 100) / 100;
            return {
                competitor_id: competitorId,
                average: Number.isFinite(avg as number) ? avg : null,
                count: Number(row.count),
                distribution: {
                    '1': Number(row.c1) || 0,
                    '2': Number(row.c2) || 0,
                    '3': Number(row.c3) || 0,
                    '4': Number(row.c4) || 0,
                    '5': Number(row.c5) || 0,
                },
            };
        });
    }

    /**
     * R2-V: atomic live-only rating withdrawal.
     * The DELETE itself is guarded by the live status, so a withdraw that
     * races the cutoff deletes nothing (caller maps to 403 CLOSED).
     * Returns false when no such rating existed (caller maps to 404).
     * Aggregate/winner recompute + payout recalc + broadcast happen in the
     * service layer right after (provisional, live) — the model only owns
     * the guarded delete so the write can never land post-cutoff.
     */
    async withdrawRating(competitionId: number, userId: number, competitorId: number): Promise<boolean> {
        const res = await this.db.prepare(`
            DELETE FROM ratings
            WHERE competition_id = ? AND user_id = ? AND competitor_id = ?
              AND (SELECT status FROM competitions WHERE id = ?) = 'live'
        `).bind(competitionId, userId, competitorId, competitionId).run();
        if (Number(res.meta.changes ?? 0) > 0) return true;
        const existing = await this.db.prepare(`
            SELECT 1 FROM ratings WHERE competition_id = ? AND user_id = ? AND competitor_id = ?
        `).bind(competitionId, userId, competitorId).first();
        if (!existing) return false;
        // A row exists but the guarded delete matched nothing => the cutoff
        // won the race (or the competition was never live).
        const comp = await this.db.prepare(
            'SELECT status FROM competitions WHERE id = ?',
        ).bind(competitionId).first<{ status: string }>();
        throw new RatingEligibilityError(comp?.status === 'completed' ? 'CLOSED' : 'NOT_LIVE');
    }

    /**
     * BaseModel compatibility: update (ratings are immutable; not supported).
     */
    async update(_id: number, _data: Partial<Rating>): Promise<Rating | null> {
        // Ratings are immutable by design — no updates allowed.
        return null;
    }

    /**
     * Count all ratings of a competition (competition detail payload).
     * عدد تقييمات منافسة
     */
    async countByCompetition(competitionId: number): Promise<number> {
        const row = await this.db.prepare(
            'SELECT COUNT(*) AS n FROM ratings WHERE competition_id = ?'
        ).bind(competitionId).first<{ n: number }>();
        return row?.n || 0;
    }
}

export default RatingModel;