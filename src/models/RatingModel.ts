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
 * B10: 24h rating window after competitions.ended_at (UTC).
 */
export const RATING_WINDOW_MS = 24 * 60 * 60 * 1000;

export type RatingEligibilityCode = 'SELF' | 'WATCH' | 'WINDOW' | 'DUPLICATE' | 'NOT_COMPLETED';

export interface RatingEligibilityInput {
    competition: { status: string; creator_id: number; opponent_id: number | null; ended_at: string | null };
    userId: number;
    competitorId: number;
    hasWatched: boolean;
    alreadyRated: boolean;
    nowMs: number;
}

/**
 * Pure eligibility decision — no DB, no clock reads inside.
 * Server clock (Date.now) is injected by the caller so tests pin the boundary.
 */
export function decideRatingEligibility(input: RatingEligibilityInput): RatingEligibilityCode | null {
    if (input.competition.status !== 'completed') return 'NOT_COMPLETED';
    if (input.userId === input.competition.creator_id || input.userId === input.competition.opponent_id) return 'SELF';
    if (!input.hasWatched) return 'WATCH';
    // ended_at missing = legacy row predating B10: window not applicable.
    if (input.competition.ended_at == null) return input.alreadyRated ? 'DUPLICATE' : null;
    if (!isWindowOpen(input.competition.ended_at, input.nowMs)) return 'WINDOW';
    if (input.alreadyRated) return 'DUPLICATE';
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
     * B10: server-side eligibility gate. Reads competition row + watch row +
     * duplicate row, decides via decideRatingEligibility(), throws
     * RatingEligibilityError on any denial. No SQL in controllers/routes.
     */
    async checkEligibility(
        competition: { id: number; status: string; creator_id: number; opponent_id: number | null; ended_at?: string | null },
        userId: number,
        competitorId: number,
        nowMs: number = Date.now(),
    ): Promise<void> {
        const watched = await this.db.prepare(
            'SELECT 1 FROM watch_history WHERE user_id = ? AND competition_id = ?',
        ).bind(userId, competition.id).first();
        const alreadyRated = await this.hasRated(competition.id, userId, competitorId);
        // Legacy rows without ended_at predate the B10 window: skip WINDOW so
        // old fixtures keep working; new rows always carry ended_at (NOT NULL
        // expectation going forward) and are window-checked.
        const code = decideRatingEligibility({
            competition: {
                status: competition.status,
                creator_id: competition.creator_id,
                opponent_id: competition.opponent_id,
                ended_at: typeof competition.ended_at === 'string' ? competition.ended_at : null,
            },
            userId,
            competitorId,
            hasWatched: watched !== null || typeof competition.ended_at !== 'string',
            alreadyRated,
            nowMs,
        });
        if (code) throw new RatingEligibilityError(code);
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
     * B11: atomic in-window rating withdrawal. DELETEs the rater's row and
     * recomputes competition aggregates (creator/opponent/average) inside
     * ONE db.batch() so the summary can never observe a half state.
     * Returns false when no such rating existed (caller maps to 404).
     */
    async withdrawRating(competitionId: number, userId: number, competitorId: number): Promise<boolean> {
        const existing = await this.db.prepare(`
            SELECT 1 FROM ratings WHERE competition_id = ? AND user_id = ? AND competitor_id = ?
        `).bind(competitionId, userId, competitorId).first<{ id: number } | null>();
        if (!existing) return false;
        const deleteStmt = this.db.prepare(`
            DELETE FROM ratings WHERE competition_id = ? AND user_id = ? AND competitor_id = ?
        `).bind(competitionId, userId, competitorId);
        // Single UPDATE recomputes all three aggregates from remaining rows
        // via scalar subqueries (no JS aggregation, no extra round trip).
        const recomputeStmt = this.db.prepare(`
            UPDATE competitions
            SET creator_rating = COALESCE((SELECT AVG(rating) FROM ratings WHERE competition_id = ? AND competitor_id = creator_id), 0),
                opponent_rating = COALESCE((SELECT AVG(rating) FROM ratings WHERE competition_id = ? AND competitor_id = opponent_id), 0),
                average_rating = COALESCE((SELECT AVG(rating) FROM ratings WHERE competition_id = ?), 0)
            WHERE id = ?
        `).bind(competitionId, competitionId, competitionId, competitionId);
        await this.db.batch([deleteStmt, recomputeStmt]);
        return true;
    }

    /**
     * BaseModel compatibility: update (ratings are immutable; not supported).
     */
    async update(_id: number, _data: Partial<Rating>): Promise<Rating | null> {
        // Ratings are immutable by design — no updates allowed.
        return null;
    }
}

export default RatingModel;