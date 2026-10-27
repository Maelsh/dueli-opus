import {
    COMPETITION_CARD_COLUMNS,
    COMPETITION_CARD_JOINS,
    type CollectionCursor,
    type CollectionPage,
} from './competition-card-columns';

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
     *
     * R4-PROFILE-COLLECTIONS-1: idempotent by the existing
     * UNIQUE(user_id, competition_id) constraint. Returns whether THIS call
     * inserted a new row (false for a repeat add).
     */
    async add(userId: number, competitionId: number): Promise<boolean> {
        const result = await this.db.prepare(`
            INSERT OR IGNORE INTO watch_later (user_id, competition_id, added_at)
            VALUES (?, ?, datetime('now'))
        `).bind(userId, competitionId).run();
        return Number(result.meta?.changes ?? 0) > 0;
    }

    /**
     * Remove from watch later list
     * إزالة من قائمة المشاهدة
     *
     * Returns whether a row was actually removed (false when it was absent).
     */
    async remove(userId: number, competitionId: number): Promise<boolean> {
        const result = await this.db.prepare(`
            DELETE FROM watch_later WHERE user_id = ? AND competition_id = ?
        `).bind(userId, competitionId).run();
        return Number(result.meta?.changes ?? 0) > 0;
    }

    /**
     * R4-PROFILE-COLLECTIONS-1: status guard for an explicit save.
     * Missing/cancelled content cannot be newly saved; already-saved rows stay
     * readable (no data erasure).
     */
    async findCompetitionStatus(competitionId: number): Promise<string | null> {
        const row = await this.db.prepare(
            `SELECT status FROM competitions WHERE id = ?`
        ).bind(competitionId).first<{ status: string }>();
        return row?.status ?? null;
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
     * R4-PROFILE-COLLECTIONS-1: one stable keyset page.
     *
     * Ordering is `added_at DESC, competition_id DESC`; the id tie-break makes
     * rows saved within the same second deterministic across page boundaries.
     * A cursor is returned only when the caller supplied `limit + 1` rows and
     * more actually exist, so paging always terminates at exhaustion.
     */
    async findPage(
        userId: number,
        limit: number,
        cursor: CollectionCursor | null = null
    ): Promise<CollectionPage<Record<string, unknown>>> {
        const params: Array<string | number> = [userId];
        let where = 'wl.user_id = ?';
        if (cursor) {
            where += ' AND (wl.added_at < ? OR (wl.added_at = ? AND wl.competition_id < ?))';
            params.push(cursor.at, cursor.at, cursor.id);
        }
        params.push(limit + 1);

        const result = await this.db.prepare(`
            SELECT ${COMPETITION_CARD_COLUMNS},
                   wl.added_at AS added_at
            FROM watch_later wl
            JOIN competitions c ON wl.competition_id = c.id
            ${COMPETITION_CARD_JOINS}
            WHERE ${where}
            ORDER BY wl.added_at DESC, wl.competition_id DESC
            LIMIT ?
        `).bind(...params).all();

        const rows = (result.results || []) as Array<Record<string, unknown>>;
        const hasMore = rows.length > limit;
        const items = hasMore ? rows.slice(0, limit) : rows;
        const last = items[items.length - 1];
        const next = hasMore && last
            ? { at: String(last.added_at), id: Number(last.id) }
            : null;
        return { items, next };
    }

    /**
     * R4-PROFILE-COLLECTIONS-1: batched membership lookup for card hydration.
     *
     * Chunked at 90 ids because D1 rejects statements binding more than 100
     * parameters (the leading `user_id` counts). Order is not part of the
     * contract; callers build a Set.
     */
    async filterSavedIds(userId: number, competitionIds: number[]): Promise<number[]> {
        const unique = [...new Set(competitionIds)];
        const saved: number[] = [];
        for (let offset = 0; offset < unique.length; offset += 90) {
            const chunk = unique.slice(offset, offset + 90);
            if (chunk.length === 0) continue;
            const placeholders = chunk.map(() => '?').join(', ');
            const result = await this.db.prepare(`
                SELECT competition_id FROM watch_later
                WHERE user_id = ? AND competition_id IN (${placeholders})
            `).bind(userId, ...chunk).all<{ competition_id: number }>();
            for (const row of result.results || []) saved.push(Number(row.competition_id));
        }
        return saved;
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
