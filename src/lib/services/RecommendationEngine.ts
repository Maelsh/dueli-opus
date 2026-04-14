/**
 * @file src/lib/services/RecommendationEngine.ts
 * @description Advanced recommendation engine with multi-factor scoring and graceful degradation
 * @module lib/services
 *
 * Task 7: Advanced Recommendation Engine & Matchmaking
 * Algorithm Factors (priority order):
 *   1. Language matched (25 pts)
 *   2. Country matched (20 pts)
 *   3. Highest Rating (0-15 pts, normalized)
 *   4. Topic Relevancy / preferred category (20 pts)
 *   5. Unwatched status (10 pts)
 *   6. Recency (0-10 pts)
 *
 * Graceful Degradation:
 *   - Phase 1: Exact matches (language + country + unwatched + preferred category)
 *   - Phase 2: Relax country requirement
 *   - Phase 3: Relax language requirement
 *   - Phase 4: Include already-watched content (lower scored)
 *   The user NEVER hits a hard "0 results" wall unless the DB is empty.
 */

export interface RecommendationResult {
    id: number;
    score: number;
    match_phase: number;
    [key: string]: any;
}

export class RecommendationEngine {
    constructor(private db: D1Database) { }

    /**
     * Get recommended competitions for a user with graceful degradation
     * Returns results progressively less relevant so infinite scroll never stalls
     */
    async getRecommendations(
        userId: number,
        limit: number = 20,
        offset: number = 0
    ): Promise<{ results: RecommendationResult[]; hasMore: boolean; totalAvailable: number }> {
        const user = await this.db.prepare(`
            SELECT id, country, language FROM users WHERE id = ?
        `).bind(userId).first() as any;

        if (!user) return { results: [], hasMore: false, totalAvailable: 0 };

        const favCategories = await this.getUserFavoriteCategories(userId);
        const followedIds = await this.getFollowedUserIds(userId);
        const watchedIds = await this.getWatchedCompetitionIds(userId);
        const hiddenIds = await this.getHiddenCompetitionIds(userId);
        const blockedUserIds = await this.getBlockedUserIds(userId);

        const allResults = await this.queryWithDegradation({
            user,
            userId,
            favCategories,
            followedIds,
            watchedIds,
            hiddenIds,
            blockedUserIds,
            limit: limit + offset
        });

        const totalAvailable = allResults.length;
        const paged = allResults.slice(offset, offset + limit);

        return {
            results: paged,
            hasMore: offset + limit < totalAvailable,
            totalAvailable
        };
    }

    /**
     * Multi-phase graceful degradation query
     * Phase 1: Language + Country + Unwatched + Preferred Category
     * Phase 2: Language + Unwatched (relax country)
     * Phase 3: Unwatched (relax language)
     * Phase 4: Include watched (lowest priority, still scored)
     */
    private async queryWithDegradation(params: {
        user: any;
        userId: number;
        favCategories: number[];
        followedIds: number[];
        watchedIds: number[];
        hiddenIds: number[];
        blockedUserIds: number[];
        limit: number;
    }): Promise<RecommendationResult[]> {
        const {
            user, userId, favCategories, followedIds,
            watchedIds, hiddenIds, blockedUserIds, limit
        } = params;

        const collected = new Map<number, RecommendationResult>();
        const seenIds = new Set<number>();

        const addResults = (rows: any[], phase: number) => {
            for (const row of rows) {
                if (seenIds.has(row.id)) continue;
                seenIds.add(row.id);
                collected.set(row.id, {
                    ...row,
                    score: row.score || 0,
                    match_phase: phase
                });
            }
        };

        // Phase 1: Best matches - language + country + unwatched + preferred category
        const phase1 = await this.buildAndExecuteQuery({
            user, userId, favCategories, followedIds,
            excludeWatched: true,
            excludeHidden: true,
            blockedUserIds,
            requireLanguage: true,
            requireCountry: true,
            phase: 1,
            limit: limit * 2
        });
        addResults(phase1, 1);

        if (collected.size < limit) {
            // Phase 2: Relax country
            const phase2 = await this.buildAndExecuteQuery({
                user, userId, favCategories, followedIds,
                excludeWatched: true,
                excludeHidden: true,
                blockedUserIds,
                requireLanguage: true,
                requireCountry: false,
                phase: 2,
                limit: limit * 2
            });
            addResults(phase2, 2);
        }

        if (collected.size < limit) {
            // Phase 3: Relax language
            const phase3 = await this.buildAndExecuteQuery({
                user, userId, favCategories, followedIds,
                excludeWatched: true,
                excludeHidden: true,
                blockedUserIds,
                requireLanguage: false,
                requireCountry: false,
                phase: 3,
                limit: limit * 2
            });
            addResults(phase3, 3);
        }

        if (collected.size < limit) {
            // Phase 4: Include watched content (lower scored)
            const phase4 = await this.buildAndExecuteQuery({
                user, userId, favCategories, followedIds,
                excludeWatched: false,
                excludeHidden: true,
                blockedUserIds,
                requireLanguage: false,
                requireCountry: false,
                phase: 4,
                limit: limit * 2
            });
            addResults(phase4, 4);
        }

        const results = Array.from(collected.values());
        results.sort((a, b) => {
            if (a.match_phase !== b.match_phase) return a.match_phase - b.match_phase;
            return b.score - a.score;
        });

        return results;
    }

    /**
     * Build and execute a single scoring query
     */
    private async buildAndExecuteQuery(params: {
        user: any;
        userId: number;
        favCategories: number[];
        followedIds: number[];
        excludeWatched: boolean;
        excludeHidden: boolean;
        blockedUserIds: number[];
        requireLanguage: boolean;
        requireCountry: boolean;
        phase: number;
        limit: number;
    }): Promise<any[]> {
        const {
            user, userId, favCategories, followedIds,
            excludeWatched, excludeHidden, blockedUserIds,
            requireLanguage, requireCountry, limit
        } = params;

        const bindings: any[] = [user.language || 'ar', user.country || ''];

        let whereClause = `WHERE c.status IN ('completed', 'live')`;
        whereClause += ` AND c.creator_id != ?`;
        bindings.push(userId);

        if (requireLanguage) {
            whereClause += ` AND c.language = ?`;
            bindings.push(user.language || 'ar');
        }

        if (requireCountry) {
            whereClause += ` AND (c.country = ? OR c.country IS NULL)`;
            bindings.push(user.country || '');
        }

        if (excludeWatched) {
            whereClause += ` AND c.id NOT IN (SELECT competition_id FROM watch_history WHERE user_id = ?)`;
            bindings.push(userId);
        }

        if (excludeHidden) {
            whereClause += ` AND c.id NOT IN (SELECT competition_id FROM user_hidden_competitions WHERE user_id = ?)`;
            bindings.push(userId);
        }

        if (blockedUserIds.length > 0) {
            whereClause += ` AND c.creator_id NOT IN (${blockedUserIds.map(() => '?').join(',')})`;
            bindings.push(...blockedUserIds);
        }

        const followedClause = followedIds.length > 0
            ? followedIds.join(',')
            : '0';
        const categoryClause = favCategories.length > 0
            ? favCategories.join(',')
            : '0';

        const query = `
            SELECT c.*,
                u1.username as creator_username,
                u1.display_name as creator_display_name,
                u1.avatar_url as creator_avatar,
                u2.username as opponent_username,
                u2.display_name as opponent_display_name,
                u2.avatar_url as opponent_avatar,
                cat.name_ar as category_name_ar,
                cat.name_en as category_name_en,
                cat.icon as category_icon,
                cat.color as category_color,
                (
                    CASE WHEN c.language = ? THEN 25 ELSE 0 END
                    + CASE WHEN u1.country = ? THEN 20 ELSE 0 END
                    + MIN(COALESCE(c.average_rating, 0) / 5.0 * 15, 15)
                    + CASE WHEN c.category_id IN (${categoryClause}) THEN 20 ELSE 0 END
                    + CASE WHEN c.id NOT IN (SELECT competition_id FROM watch_history WHERE user_id = ${userId}) THEN 10 ELSE 0 END
                    + CASE WHEN c.created_at > datetime('now', '-1 day') THEN 10
                           WHEN c.created_at > datetime('now', '-3 days') THEN 7
                           WHEN c.created_at > datetime('now', '-7 days') THEN 4
                           ELSE 0 END
                    + CASE WHEN c.creator_id IN (${followedClause}) THEN 15 ELSE 0 END
                ) as score
            FROM competitions c
            JOIN users u1 ON c.creator_id = u1.id
            LEFT JOIN users u2 ON c.opponent_id = u2.id
            LEFT JOIN categories cat ON c.category_id = cat.id
            ${whereClause}
            ORDER BY score DESC, c.created_at DESC
            LIMIT ?
        `;
        bindings.push(limit);

        try {
            const result = await this.db.prepare(query).bind(...bindings).all();
            return result.results || [];
        } catch (error) {
            console.error('[RecommendationEngine] Query error in phase', params.phase, error);
            return [];
        }
    }

    private async getUserFavoriteCategories(userId: number): Promise<number[]> {
        const result = await this.db.prepare(`
            SELECT c.category_id, COUNT(*) as view_count
            FROM watch_history wh
            JOIN competitions c ON wh.competition_id = c.id
            WHERE wh.user_id = ?
            GROUP BY c.category_id
            ORDER BY view_count DESC
            LIMIT 5
        `).bind(userId).all();
        return (result.results || []).map((r: any) => r.category_id);
    }

    private async getFollowedUserIds(userId: number): Promise<number[]> {
        const result = await this.db.prepare(`
            SELECT following_id FROM follows WHERE follower_id = ?
        `).bind(userId).all();
        return (result.results || []).map((r: any) => r.following_id);
    }

    private async getWatchedCompetitionIds(userId: number): Promise<number[]> {
        const result = await this.db.prepare(`
            SELECT competition_id FROM watch_history WHERE user_id = ? LIMIT 500
        `).bind(userId).all();
        return (result.results || []).map((r: any) => r.competition_id);
    }

    private async getHiddenCompetitionIds(userId: number): Promise<number[]> {
        try {
            const result = await this.db.prepare(`
                SELECT competition_id FROM user_hidden_competitions WHERE user_id = ?
            `).bind(userId).all();
            return (result.results || []).map((r: any) => r.competition_id);
        } catch {
            return [];
        }
    }

    private async getBlockedUserIds(userId: number): Promise<number[]> {
        const result = await this.db.prepare(`
            SELECT blocked_id FROM user_blocks WHERE blocker_id = ?
            UNION
            SELECT blocker_id FROM user_blocks WHERE blocked_id = ?
        `).bind(userId, userId).all();
        return (result.results || []).map((r: any) => r.blocked_id);
    }

    /**
     * Record a view
     */
    async recordView(userId: number, competitionId: number, duration: number = 0): Promise<void> {
        await this.db.prepare(`
            INSERT INTO watch_history (user_id, competition_id, watched_at, watch_duration_seconds)
            VALUES (?, ?, datetime('now'), ?)
            ON CONFLICT(user_id, competition_id)
            DO UPDATE SET watch_duration_seconds = watch_duration_seconds + ?, watched_at = datetime('now')
        `).bind(userId, competitionId, duration, duration).run();

        await this.db.prepare(`
            UPDATE competitions SET total_views = COALESCE(total_views, 0) + 1 WHERE id = ?
        `).bind(competitionId).run();
    }

    /**
     * Record search keyword for future recommendations
     */
    async recordSearch(userId: number, keyword: string): Promise<void> {
        await this.db.prepare(`
            INSERT INTO user_keywords (user_id, keyword, weight, updated_at)
            VALUES (?, ?, 1.0, datetime('now'))
            ON CONFLICT(user_id, keyword)
            DO UPDATE SET weight = weight + 0.1, updated_at = datetime('now')
        `).bind(userId, keyword.toLowerCase().trim()).run();
    }

    /**
     * Hide a competition from recommendations
     */
    async hideCompetition(userId: number, competitionId: number): Promise<void> {
        await this.db.prepare(`
            INSERT OR IGNORE INTO user_hidden_competitions (user_id, competition_id, hidden_at)
            VALUES (?, ?, datetime('now'))
        `).bind(userId, competitionId).run();
    }

    /**
     * Get trending competitions (no personalization)
     */
    async getTrending(limit: number = 10): Promise<any[]> {
        const result = await this.db.prepare(`
            SELECT c.*,
                u1.username as creator_username,
                u1.display_name as creator_display_name,
                u1.avatar_url as creator_avatar,
                cat.name_ar as category_name_ar,
                cat.name_en as category_name_en,
                cat.icon as category_icon,
                cat.color as category_color,
                COALESCE(c.total_views, 0) as views,
                (SELECT COUNT(*) FROM likes WHERE competition_id = c.id) as likes_count
            FROM competitions c
            JOIN users u1 ON c.creator_id = u1.id
            LEFT JOIN categories cat ON c.category_id = cat.id
            WHERE c.status IN ('completed', 'live')
            AND c.created_at > datetime('now', '-7 days')
            ORDER BY COALESCE(c.total_views, 0) DESC, c.created_at DESC
            LIMIT ?
        `).bind(limit).all();
        return result.results;
    }

    /**
     * Get competitor mini-stats for a user profile
     * Returns wins, losses, top categories
     */
    async getCompetitorMiniStats(userId: number): Promise<{
        wins: number;
        losses: number;
        top_categories: { id: number; name_ar: string; name_en: string; icon: string; color: string; count: number }[];
    }> {
        const stats = await this.db.prepare(`
            SELECT
                (SELECT COUNT(*) FROM competitions WHERE winner_id = ? AND status = 'completed') as wins,
                (SELECT COUNT(*) FROM competitions WHERE (creator_id = ? OR opponent_id = ?) AND status = 'completed' AND winner_id != ?) as losses
        `).bind(userId, userId, userId, userId).first() as any;

        const categories = await this.db.prepare(`
            SELECT cat.id, cat.name_ar, cat.name_en, cat.icon, cat.color, COUNT(*) as count
            FROM competitions c
            JOIN categories cat ON c.category_id = cat.id
            WHERE (c.creator_id = ? OR c.opponent_id = ?) AND c.status = 'completed'
            GROUP BY c.category_id
            ORDER BY count DESC
            LIMIT 3
        `).bind(userId, userId).all();

        return {
            wins: stats?.wins || 0,
            losses: stats?.losses || 0,
            top_categories: (categories.results || []) as any[]
        };
    }
}

export default RecommendationEngine;
