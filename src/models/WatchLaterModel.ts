export interface WatchLater {
    user_id: number;
    competition_id: number;
    added_at: string;
}

export class WatchLaterModel {
    constructor(private db: D1Database) {}

    /**
     * Add competition to watch later list
     * إضافة للمشاهدة لاحقاً
     */
    async add(userId: number, competitionId: number): Promise<void> {
        await this.db.prepare(`
            INSERT OR IGNORE INTO watch_later (user_id, competition_id, added_at)
            VALUES (?, ?, datetime('now'))
        `).bind(userId, competitionId).run();
    }

    /**
     * Remove from watch later list
     * إزالة من قائمة المشاهدة
     */
    async remove(userId: number, competitionId: number): Promise<void> {
        await this.db.prepare(`
            DELETE FROM watch_later WHERE user_id = ? AND competition_id = ?
        `).bind(userId, competitionId).run();
    }

    /**
     * Get user's watch later list
     * قائمة المشاهدة اللاحقة
     */
    async findByUser(userId: number): Promise<any[]> {
        const result = await this.db.prepare(`
            SELECT wl.*, 
                   c.title, c.category_id, c.status, c.scheduled_at, c.total_views,
                   cat.name_ar as category_name,
                   u1.username as creator_username, u1.display_name as creator_name,
                   u2.username as opponent_username, u2.display_name as opponent_name
            FROM watch_later wl
            JOIN competitions c ON wl.competition_id = c.id
            JOIN categories cat ON c.category_id = cat.id
            LEFT JOIN users u1 ON c.creator_id = u1.id
            LEFT JOIN users u2 ON c.opponent_id = u2.id
            WHERE wl.user_id = ?
            ORDER BY wl.added_at DESC
        `).bind(userId).all();

        return result.results || [];
    }

    /**
     * Check if competition is in watch later list
     * التحقق من الوجود في القائمة
     */
    async isInList(userId: number, competitionId: number): Promise<boolean> {
        const result = await this.db.prepare(`
            SELECT 1 FROM watch_later WHERE user_id = ? AND competition_id = ?
        `).bind(userId, competitionId).first();

        return result !== null;
    }

    /**
     * Clear watch later list
     * مسح القائمة
     */
    async clear(userId: number): Promise<void> {
        await this.db.prepare(`
            DELETE FROM watch_later WHERE user_id = ?
        `).bind(userId).run();
    }
}
