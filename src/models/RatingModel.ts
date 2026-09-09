/**
 * Rating Model
 * نموذج التقييم
 *
 * Handles all database operations for competition ratings.
 */

import { BaseModel } from './base/BaseModel';

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
            const result = await this.db.prepare(`
                INSERT INTO ratings (competition_id, user_id, competitor_id, rating, created_at)
                VALUES (?, ?, ?, ?, datetime('now'))
            `).bind(competitionId, userId, competitorId, rating).run();
            return { id: result.meta.last_row_id as number };
        }
        const data = args[0] as Partial<Rating>;
        const result = await this.db.prepare(`
            INSERT INTO ratings (competition_id, user_id, competitor_id, rating, created_at)
            VALUES (?, ?, ?, ?, datetime('now'))
        `).bind(data.competition_id!, data.user_id!, data.competitor_id!, data.rating!).run();
        return { id: result.meta.last_row_id as number, ...data } as Rating;
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