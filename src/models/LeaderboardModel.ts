/**
 * @file src/models/LeaderboardModel.ts
 * @description نموذج قائمة المتصدرين — كل SQL الخاص بـ /api/leaderboard يعيش هنا (B13)
 * @module models/LeaderboardModel
 */

import { BaseModel } from './base/BaseModel';
import type { BaseEntity } from '../config/types';

export interface LeaderboardEntry extends BaseEntity {
    id: number;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    elo_rating: number | null;
    country: string | null;
    total_competitions: number;
    wins: number;
}

export class LeaderboardModel extends BaseModel<LeaderboardEntry> {
    protected readonly tableName = 'users';

    /** Read-only model — leaderboard has no write path. */
    async create(_data: Partial<LeaderboardEntry>): Promise<LeaderboardEntry> {
        throw new Error('LeaderboardModel is read-only');
    }

    /** Read-only model — leaderboard has no write path. */
    async update(_id: number, _data: Partial<LeaderboardEntry>): Promise<LeaderboardEntry | null> {
        throw new Error('LeaderboardModel is read-only');
    }

    /**
     * Get top users by ELO rating.
     * Returns an empty array (never throws for "no data").
     */
    async getLeaderboard(limit: number = 50): Promise<LeaderboardEntry[]> {
        const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 50;
        const result = await this.db.prepare(`
            SELECT id, username, display_name, avatar_url, elo_rating, country,
                (SELECT COUNT(*) FROM competitions WHERE
                    (creator_id = users.id OR opponent_id = users.id) AND status = 'completed'
                ) as total_competitions,
                (SELECT COUNT(*) FROM competitions WHERE
                    winner_id = users.id AND status = 'completed'
                ) as wins
            FROM users
            WHERE elo_rating IS NOT NULL
            ORDER BY elo_rating DESC
            LIMIT ?
        `).bind(safeLimit).all();
        return (result.results || []) as unknown as LeaderboardEntry[];
    }
}

export default LeaderboardModel;