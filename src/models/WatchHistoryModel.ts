import {
    COMPETITION_CARD_COLUMNS,
    COMPETITION_CARD_JOINS,
    type CollectionCursor,
    type CollectionPage,
} from './competition-card-columns';

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
     * R4-PROFILE-COLLECTIONS-1: one stable keyset page of real watch rows.
     *
     * Ordering is `watched_at DESC, competition_id DESC`. The id tie-break
     * makes rows written in the same second deterministic across page
     * boundaries. Only the row's OWN stored values are returned — never a
     * derived "completed" claim.
     */
    async findPage(
        userId: number,
        limit: number,
        cursor: CollectionCursor | null = null
    ): Promise<CollectionPage<Record<string, unknown>>> {
        const params: Array<string | number> = [userId];
        let where = 'wh.user_id = ?';
        if (cursor) {
            where += ' AND (wh.watched_at < ? OR (wh.watched_at = ? AND wh.competition_id < ?))';
            params.push(cursor.at, cursor.at, cursor.id);
        }
        params.push(limit + 1);

        const result = await this.db.prepare(`
            SELECT ${COMPETITION_CARD_COLUMNS},
                   wh.watched_at AS watched_at,
                   wh.watch_duration_seconds AS watch_duration_seconds,
                   wh.completed AS completed
            FROM watch_history wh
            JOIN competitions c ON wh.competition_id = c.id
            ${COMPETITION_CARD_JOINS}
            WHERE ${where}
            ORDER BY wh.watched_at DESC, wh.competition_id DESC
            LIMIT ?
        `).bind(...params).all<Record<string, unknown>>();

        const rows = result.results || [];
        const hasMore = rows.length > limit;
        const items = hasMore ? rows.slice(0, limit) : rows;
        const last = items[items.length - 1];
        const next = hasMore && last
            ? { at: String(last.watched_at), id: Number(last.id) }
            : null;
        return { items, next };
    }

    /**
     * R4-PROFILE-COLLECTIONS-1: record a REAL VOD playback event.
     *
     * This is deliberately narrower than `record()`/`addHeartbeatSeconds()`:
     * it only moves `watched_at` and never writes `watch_duration_seconds` or
     * `completed`. H1 live seconds (and therefore the 300s rating
     * eligibility) stay exactly as the heartbeat wrote them.
     *
     * The guarded INSERT ... SELECT refuses non-VOD statuses at the SQL layer,
     * so a live competition can never have its heartbeat mark reset by a VOD
     * client (which would zero the next server-derived delta). Missing or
     * cancelled competitions also produce no row.
     *
     * Returns true when a row was opened/touched.
     */
    async touchVodWatch(userId: number, competitionId: number): Promise<boolean> {
        const result = await this.db.prepare(`
            INSERT INTO watch_history (user_id, competition_id, watch_duration_seconds, completed, watched_at)
            SELECT ?, c.id, 0, 0, datetime('now')
            FROM competitions c
            WHERE c.id = ? AND c.status IN ('completed', 'archived')
            ON CONFLICT(user_id, competition_id) DO UPDATE SET
                watched_at = datetime('now')
        `).bind(userId, competitionId).run();
        return Number(result.meta?.changes ?? 0) > 0;
    }

    /**
     * R2-L1 (H1): accumulate one server-derived heartbeat slice.
     *
     * A single atomic upsert: the added seconds are `now - watched_at`
     * measured by the SERVER clock, clamped to [0, maxDeltaSeconds]. The
     * caller never supplies seconds — replays, duplicates, reconnects and
     * out-of-order arrivals all collapse to ~0 because the delta derives
     * from the stored timestamp, and concurrent writers serialize so each
     * sees the latest committed mark. The first heartbeat opens the row and
     * adds 0 (nothing proves watching before the first pulse).
     *
     * Returns the accumulated total after this pulse.
     */
    async addHeartbeatSeconds(
        userId: number,
        competitionId: number,
        maxDeltaSeconds: number
    ): Promise<number> {
        const cap = Math.max(1, Math.floor(maxDeltaSeconds));
        await this.db.prepare(
            `INSERT INTO watch_history (user_id, competition_id, watch_duration_seconds, completed, watched_at)
             VALUES (?, ?, 0, 0, datetime('now'))
             ON CONFLICT(user_id, competition_id) DO UPDATE SET
                 watch_duration_seconds = watch_duration_seconds
                     + MAX(0, MIN(CAST((strftime('%s', 'now') - strftime('%s', watched_at)) AS INTEGER), ?)),
                 watched_at = datetime('now')`
        ).bind(userId, competitionId, cap).run();
        return this.getWatchSeconds(userId, competitionId);
    }

    /**
     * R2-L1 (H1): cumulative live watch seconds for one (user, competition).
     * The single source R2-V reads for rating eligibility.
     */
    async getWatchSeconds(userId: number, competitionId: number): Promise<number> {
        const row = await this.db.prepare(
            `SELECT watch_duration_seconds AS s FROM watch_history WHERE user_id = ? AND competition_id = ?`
        ).bind(userId, competitionId).first<{ s: number | null }>();
        return Number(row?.s ?? 0);
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
     *
     * R3-D1-REM1: the `fav:` namespace is RESERVED for the explicit
     * Settings-favorites writer (H7SignalsModel.setFavoriteSlugs). Title
     * words are attacker-influenced (any user picks titles), so any word
     * carrying a colon is skipped — it can never become a `fav:*` row and
     * pollute explicit favorites with inferred interests.
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
            .filter(word => !word.includes(':'))
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
