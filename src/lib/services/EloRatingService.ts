/**
 * @file src/lib/services/EloRatingService.ts
 * @description ELO rating calculation for competitors
 * @module lib/services
 * 
 * نظام تصنيف ELO - يحسب التصنيف بعد كل منافسة
 */

/**
 * B12: pure ELO computation — no DB access. Shared by the legacy
 * updateRatings() path and the atomic aggregate batch in
 * ScheduledTaskService (so the two paths can never drift apart).
 */
export function computeEloChange(
    creatorRating: number,
    opponentRating: number,
    winnerId: number | null,
    creatorId: number,
    opponentId: number,
    k: number = 32
): { creator: number; opponent: number } {
    const expectedCreator = 1 / (1 + Math.pow(10, (opponentRating - creatorRating) / 400));
    const expectedOpponent = 1 / (1 + Math.pow(10, (creatorRating - opponentRating) / 400));

    let actualCreator: number;
    let actualOpponent: number;
    if (winnerId === null) {
        // Draw rule (B12): both score 0.5.
        actualCreator = 0.5;
        actualOpponent = 0.5;
    } else if (winnerId === creatorId) {
        actualCreator = 1;
        actualOpponent = 0;
    } else {
        actualCreator = 0;
        actualOpponent = 1;
    }

    return {
        creator: Math.round(creatorRating + k * (actualCreator - expectedCreator)),
        opponent: Math.round(opponentRating + k * (actualOpponent - expectedOpponent)),
    };
}

export class EloRatingService {
    private K = 32; // K-factor for ELO rating

    constructor(private db: D1Database) { }

    /**
     * Update ratings after a competition ends
     * @param winnerId - ID of the winner (or null for draw)
     * @param competitionId - Competition ID
     */
    async updateRatings(competitionId: number, winnerId: number | null): Promise<{
        creator: { old: number; new: number };
        opponent: { old: number; new: number };
    }> {
        const competition = await this.db.prepare(`
            SELECT creator_id, opponent_id FROM competitions WHERE id = ?
        `).bind(competitionId).first() as any;

        if (!competition || !competition.opponent_id) {
            throw new Error('Competition not found or missing opponent');
        }

        const creator = await this.db.prepare(`
            SELECT id, elo_rating FROM users WHERE id = ?
        `).bind(competition.creator_id).first() as any;

        const opponent = await this.db.prepare(`
            SELECT id, elo_rating FROM users WHERE id = ?
        `).bind(competition.opponent_id).first() as any;

        const creatorRating = creator.elo_rating || 1500;
        const opponentRating = opponent.elo_rating || 1500;

        const next = computeEloChange(
            creatorRating, opponentRating, winnerId,
            competition.creator_id, competition.opponent_id, this.K
        );

        // Update in DB
        await this.db.prepare(`UPDATE users SET elo_rating = ? WHERE id = ?`)
            .bind(next.creator, competition.creator_id).run();
        await this.db.prepare(`UPDATE users SET elo_rating = ? WHERE id = ?`)
            .bind(next.opponent, competition.opponent_id).run();

        return {
            creator: { old: creatorRating, new: next.creator },
            opponent: { old: opponentRating, new: next.opponent }
        };
    }

    /**
     * Get leaderboard
     */
    async getLeaderboard(limit: number = 50): Promise<any[]> {
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
        `).bind(limit).all();
        return result.results;
    }
}

export default EloRatingService;
