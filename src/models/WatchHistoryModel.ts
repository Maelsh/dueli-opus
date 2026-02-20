export interface WatchHistory {
    user_id: number;
    competition_id: number;
    watched_at: string;
    watch_duration_seconds: number;
    completed: boolean;
}

export class WatchHistoryModel {
    constructor(private db: D1Database) {}

    /**
     * Record or update watch history
     * تسجيل أو تحديث سجل المشاهدة
     */
    async record(data: {
        user_id: number;
        competition_id: number;
        watch_duration_seconds?: number;
        completed?: boolean;
    }): Promise<void> {
        await this.db.prepare(`
            INSERT INTO watch_history (user_id, competition_id, watch_duration_seconds, completed, watched_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(user_id, competition_id) DO UPDATE SET
                watch_duration_seconds = ?,
                completed = ?,
                watched_at = datetime('now')
        `).bind(
            data.user_id,
            data.competition_id,
            data.watch_duration_seconds || 0,
            data.completed ? 1 : 0,
            data.watch_duration_seconds || 0,
            data.completed ? 1 : 0
        ).run();

        // Extract keywords from competition title for recommendations
        await this.extractKeywords(data.user_id, data.competition_id);
    }

    /**
     * Get user's watch history
     * سجل مشاهدات المستخدم
     */
    async findByUser(userId: number, limit: number = 50): Promise<any[]> {
        const result = await this.db.prepare(`
            SELECT wh.*, 
                   c.title, c.category_id, c.total_views, c.creator_id, c.opponent_id,
                   cat.name_ar as category_name,
                   u1.username as creator_username, u1.display_name as creator_name,
                   u2.username as opponent_username, u2.display_name as opponent_name
            FROM watch_history wh
            JOIN competitions c ON wh.competition_id = c.id
            JOIN categories cat ON c.category_id = cat.id
            LEFT JOIN users u1 ON c.creator_id = u1.id
            LEFT JOIN users u2 ON c.opponent_id = u2.id
            WHERE wh.user_id = ?
            ORDER BY wh.watched_at DESC
            LIMIT ?
        `).bind(userId, limit).all();

        return result.results || [];
    }

    /**
     * Check if user watched competition
     * التحقق من المشاهدة
     */
    async hasWatched(userId: number, competitionId: number): Promise<boolean> {
        const result = await this.db.prepare(`
            SELECT 1 FROM watch_history WHERE user_id = ? AND competition_id = ?
        `).bind(userId, competitionId).first();

        return result !== null;
    }

    /**
     * Delete watch history entry
     * حذف من سجل المشاهدة
     */
    async deleteEntry(userId: number, competitionId: number): Promise<void> {
        await this.db.prepare(`
            DELETE FROM watch_history WHERE user_id = ? AND competition_id = ?
        `).bind(userId, competitionId).run();
    }

    /**
     * Clear all watch history for user
     * مسح سجل المشاهدة بالكامل
     */
    async clearHistory(userId: number): Promise<void> {
        await this.db.prepare(`
            DELETE FROM watch_history WHERE user_id = ?
        `).bind(userId).run();
    }

    /**
     * Get watch statistics
     * إحصائيات المشاهدة
     */
    async getStats(userId: number): Promise<any> {
        const result = await this.db.prepare(`
            SELECT 
                COUNT(*) as total_watched,
                SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as completed_count,
                SUM(watch_duration_seconds) as total_watch_time
            FROM watch_history
            WHERE user_id = ?
        `).bind(userId).first();

        return result || { total_watched: 0, completed_count: 0, total_watch_time: 0 };
    }

    /**
     * Extract keywords from competition for recommendations
     * استخراج كلمات مفتاحية للتوصيات
     */
    private async extractKeywords(userId: number, competitionId: number): Promise<void> {
        // Get competition title
        const competition = await this.db.prepare(`
            SELECT title FROM competitions WHERE id = ?
        `).bind(competitionId).first<{ title: string }>();

        if (!competition) return;

        // Simple keyword extraction (split by space, filter short words)
        const keywords = competition.title
            .split(/\s+/)
            .filter(word => word.length > 3)
            .slice(0, 5); // Max 5 keywords per competition

        // Insert or update keywords
        for (const keyword of keywords) {
            await this.db.prepare(`
                INSERT INTO user_keywords (user_id, keyword, weight, updated_at)
                VALUES (?, ?, 1.0, datetime('now'))
                ON CONFLICT(user_id, keyword) DO UPDATE SET
                    weight = weight + 0.1,
                    updated_at = datetime('now')
            `).bind(userId, keyword.toLowerCase()).run();
        }
    }

    /**
     * Get user's watched competition IDs
     * الحصول على معرفات المنافسات التي شاهدها المستخدم
     */
    async getUserWatchedIds(userId: number): Promise<number[]> {
        const result = await this.db.prepare(`
            SELECT competition_id FROM watch_history WHERE user_id = ?
        `).bind(userId).all();
        
        return (result.results || []).map((r: any) => r.competition_id);
    }
}
