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
    const endedMs = Date.parse(input.competition.ended_at);
    if (!Number.isFinite(endedMs) || input.nowMs > endedMs + RATING_WINDOW_MS) return 'WINDOW';
    if (input.alreadyRated) return 'DUPLICATE';
    return null;
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
     * Find all ratings for a competition with user details
     */
    async findByCompetition(competitionId: number): Promise<RatingWithUser[]> {
        const result = await this.db.prepare(`
            SELECT r.*, u.display_name, u.avatar_url
            FROM ratings r
            JOIN users u ON r.user_id = u.id
            WHERE r.competition_id = ?
            ORDER BY r.created_at DESC
        `).bind(competitionId).all();
        return (result.results as unknown) as RatingWithUser[];
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