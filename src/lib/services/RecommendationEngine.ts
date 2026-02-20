/**
 * @file src/lib/services/RecommendationEngine.ts
 * @description Smart competition recommendation engine
 * @module lib/services
 * 
 * محرك التوصيات الذكي - يرشح المنافسات بناءً على 11 عاملاً
 * Plan Solution 10: التوصيات
 */

export class RecommendationEngine {
    constructor(private db: D1Database) { }

    /**
     * Get recommended competitions for a user
     * Factors: language, country, recency, views, rating, follows, 
     *          categories, likes, content similarity, viewing patterns, non-repetition
     */
    async getRecommendations(
        userId: number,
        limit: number = 20,
        offset: number = 0
    ): Promise<any[]> {
        // Get user profile for personalization
        const user = await this.db.prepare(`
            SELECT id, country, language FROM users WHERE id = ?
        `).bind(userId).first() as any;

        if (!user) return [];

        // Get user's preferred categories (from viewing history)
        const favCategories = await this.db.prepare(`
            SELECT c.category_id, COUNT(*) as view_count
            FROM user_views uv
            JOIN competitions c ON uv.competition_id = c.id
            WHERE uv.user_id = ?
            GROUP BY c.category_id
            ORDER BY view_count DESC
            LIMIT 5
        `).bind(userId).all();

        const categoryIds = favCategories.results.map((r: any) => r.category_id);

        // Get followed users
        const follows = await this.db.prepare(`
            SELECT following_id FROM follows WHERE follower_id = ?
        `).bind(userId).all();
        const followedIds = follows.results.map((r: any) => r.following_id);

        // Get already viewed competitions (for non-repetition)
        const viewed = await this.db.prepare(`
            SELECT competition_id FROM user_views WHERE user_id = ? ORDER BY watched_at DESC LIMIT 200
        `).bind(userId).all();
        const viewedIds = viewed.results.map((r: any) => r.competition_id);

        // Get hidden competitions
        const hidden = await this.db.prepare(`
            SELECT competition_id FROM user_hidden_competitions WHERE user_id = ?
        `).bind(userId).all();
        const hiddenIds = hidden.results.map((r: any) => r.competition_id);

        // Get blocked users
        const blocked = await this.db.prepare(`
            SELECT blocked_id FROM user_blocks WHERE blocker_id = ?
            UNION
            SELECT blocker_id FROM user_blocks WHERE blocked_id = ?
        `).bind(userId, userId).all();
        const blockedIds = blocked.results.map((r: any) => r.blocked_id);

        // Build exclusion list
        const excludeCompIds = [...new Set([...viewedIds, ...hiddenIds])];
        const excludeUserIds = [...new Set(blockedIds)];

        // Build the recommendation query with scoring
        let query = `
            SELECT c.*,
                u1.username as creator_username,
                u1.display_name as creator_display_name,
                u1.avatar_url as creator_avatar,
                u2.username as opponent_username,
                u2.display_name as opponent_display_name,
                u2.avatar_url as opponent_avatar,
                cat.name_ar as category_name_ar,
                cat.name_en as category_name_en,
                (
                    -- Factor 1: Recency (newer = better)
                    CASE WHEN c.created_at > datetime('now', '-1 day') THEN 30
                         WHEN c.created_at > datetime('now', '-3 days') THEN 20
                         WHEN c.created_at > datetime('now', '-7 days') THEN 10
                         ELSE 0 END
                    -- Factor 2: Same language
                    + CASE WHEN c.language = ? THEN 15 ELSE 0 END
                    -- Factor 3: Same country
                    + CASE WHEN u1.country = ? THEN 10 ELSE 0 END
                    -- Factor 4: High rating
                    + COALESCE(c.avg_rating, 0) * 5
                    -- Factor 5: View count (popularity)
                    + MIN(COALESCE(c.views_count, 0), 100) / 10
                    -- Factor 6: From followed users
                    + CASE WHEN c.creator_id IN (${followedIds.length ? followedIds.join(',') : '0'}) THEN 25 ELSE 0 END
                    -- Factor 7: Preferred category
                    + CASE WHEN c.category_id IN (${categoryIds.length ? categoryIds.join(',') : '0'}) THEN 20 ELSE 0 END
                ) as score
            FROM competitions c
            JOIN users u1 ON c.creator_id = u1.id
            LEFT JOIN users u2 ON c.opponent_id = u2.id
            LEFT JOIN categories cat ON c.category_id = cat.id
            WHERE c.status IN ('completed', 'live')
        `;

        const bindings: any[] = [user.language || 'ar', user.country || ''];

        // Exclude viewed/hidden competitions
        if (excludeCompIds.length > 0) {
            query += ` AND c.id NOT IN (${excludeCompIds.map(() => '?').join(',')})`;
            bindings.push(...excludeCompIds);
        }

        // Exclude blocked users
        if (excludeUserIds.length > 0) {
            query += ` AND c.creator_id NOT IN (${excludeUserIds.map(() => '?').join(',')})`;
            bindings.push(...excludeUserIds);
        }

        query += ` ORDER BY score DESC, c.created_at DESC LIMIT ? OFFSET ?`;
        bindings.push(limit, offset);

        const result = await this.db.prepare(query).bind(...bindings).all();
        return result.results;
    }

    /**
     * Record a view
     */
    async recordView(userId: number, competitionId: number, duration: number = 0): Promise<void> {
        await this.db.prepare(`
            INSERT INTO user_views (user_id, competition_id, watched_at, watch_duration)
            VALUES (?, ?, datetime('now'), ?)
            ON CONFLICT(user_id, competition_id) 
            DO UPDATE SET watch_duration = watch_duration + ?, watched_at = datetime('now')
        `).bind(userId, competitionId, duration, duration).run();

        // Update competition view count
        await this.db.prepare(`
            UPDATE competitions SET views_count = COALESCE(views_count, 0) + 1 WHERE id = ?
        `).bind(competitionId).run();
    }

    /**
     * Record search keyword for future recommendations
     */
    async recordSearch(userId: number, keyword: string): Promise<void> {
        await this.db.prepare(`
            INSERT INTO user_search_keywords (user_id, keyword, search_count, last_searched_at)
            VALUES (?, ?, 1, datetime('now'))
            ON CONFLICT(user_id, keyword)
            DO UPDATE SET search_count = search_count + 1, last_searched_at = datetime('now')
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
                COALESCE(c.views_count, 0) as views,
                (SELECT COUNT(*) FROM likes WHERE competition_id = c.id) as likes_count
            FROM competitions c
            JOIN users u1 ON c.creator_id = u1.id
            LEFT JOIN categories cat ON c.category_id = cat.id
            WHERE c.status IN ('completed', 'live')
            AND c.created_at > datetime('now', '-7 days')
            ORDER BY COALESCE(c.views_count, 0) DESC, c.created_at DESC
            LIMIT ?
        `).bind(limit).all();
        return result.results;
    }
}

export default RecommendationEngine;
