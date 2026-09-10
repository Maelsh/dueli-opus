/**
 * Comment Model
 * نموذج التعليق
 */

import { BaseModel, QueryOptions } from './base/BaseModel';
import type { Comment } from '../config/types';
import { UserBlockModel } from './UserBlockModel';
import { BlockedInteractionError, ContentTooLongError } from '../lib/errors/AppError';

/**
 * B7: maximum allowed comment length (chars).
 * Must stay in sync with migrations/0015_content_length_bounds.sql.
 */
export const COMMENT_MAX_CONTENT_LENGTH = 2000;

/**
 * Comment with user data
 */
export interface CommentWithUser extends Comment {
    display_name?: string;
    avatar_url?: string;
    username?: string;
    replies_count?: number;
}

/**
 * Paged comments result (B2+B3).
 */
export interface PagedComments {
    items: CommentWithUser[];
    total: number;
    limit: number;
    offset: number;
}

/**
 * Comment Model Class
 */
export class CommentModel extends BaseModel<Comment> {
    protected readonly tableName = 'comments';

    /**
     * Find comments for a competition with user data
     */
    async findByCompetition(competitionId: number, options: QueryOptions = {}): Promise<CommentWithUser[]> {
        const { limit = 100, offset = 0 } = options;

        return this.query<CommentWithUser>(`
            SELECT c.*, u.display_name, u.avatar_url, u.username
            FROM comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.competition_id = ? AND c.deleted_at IS NULL
            ORDER BY c.created_at DESC
            LIMIT ? OFFSET ?
        `, competitionId, limit, offset);
    }

    /**
     * B2+B3: paged competition comments with optional parent filter.
     * - limit clamped to [1,100], default 20; offset >= 0.
     * - parentId null => root comments (each carries replies_count).
     * - parentId number => direct replies only.
     * - Soft-deleted rows (deleted_at NOT NULL) are always excluded.
     */
    async findByCompetitionPaged(
        competitionId: number,
        rawLimit?: number,
        rawOffset?: number,
        parentId?: number | null
    ): Promise<PagedComments> {
        let limit = Number.isFinite(rawLimit as number) ? Math.floor(rawLimit as number) : 20;
        if (limit <= 0) limit = 20;
        if (limit > 100) limit = 100;
        let offset = Number.isFinite(rawOffset as number) ? Math.floor(rawOffset as number) : 0;
        if (offset < 0) offset = 0;

        const baseWhere = parentId === undefined || parentId === null
            ? 'c.competition_id = ? AND c.parent_id IS NULL AND c.deleted_at IS NULL'
            : 'c.competition_id = ? AND c.parent_id = ? AND c.deleted_at IS NULL';
        const baseParams = parentId === undefined || parentId === null
            ? [competitionId]
            : [competitionId, parentId];

        const totalRow = await this.queryOne<{ n: number }>(
            `SELECT COUNT(*) AS n FROM comments c WHERE ${baseWhere}`,
            ...baseParams
        );
        const total = totalRow?.n || 0;

        const items = await this.query<CommentWithUser>(`
            SELECT c.*, u.display_name, u.avatar_url, u.username,
                (SELECT COUNT(*) FROM comments r WHERE r.parent_id = c.id AND r.deleted_at IS NULL) AS replies_count
            FROM comments c
            JOIN users u ON c.user_id = u.id
            WHERE ${baseWhere}
            ORDER BY c.created_at DESC
            LIMIT ? OFFSET ?
        `, ...baseParams, limit, offset);

        return { items, total, limit, offset };
    }

    /**
     * B2+B3: number of visible comments (non-deleted) for a competition.
     */
    async countVisible(competitionId: number): Promise<number> {
        const row = await this.queryOne<{ n: number }>(
            'SELECT COUNT(*) AS n FROM comments WHERE competition_id = ? AND deleted_at IS NULL',
            competitionId
        );
        return row?.n || 0;
    }

    /**
     * B2+B3: soft-delete a comment (sets deleted_at only).
     */
    async softDelete(id: number): Promise<boolean> {
        const result = await this.db.prepare(
            "UPDATE comments SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL"
        ).bind(id).run();
        return result.meta.changes > 0;
    }

    /**
     * Create comment
     */
    async create(data: Partial<Comment> & { parent_id?: number | null }): Promise<Comment> {
        // B7: content length bound (comment ≤ 2000 chars) — enforced BEFORE any
        // write so an oversized payload leaves no row behind. Mirrors the DB
        // trigger in migrations/0015_content_length_bounds.sql.
        if (!data.content || data.content.length > COMMENT_MAX_CONTENT_LENGTH) {
            throw new ContentTooLongError();
        }

        // T3.3: nested replies — validate the parent belongs to the same competition
        if (data.parent_id) {
            const parent = await this.findById(data.parent_id);
            if (!parent || (parent as any).competition_id !== data.competition_id) {
                throw new Error('Invalid parent comment');
            }
        }

        // B6: cannot comment on a competition whose creator has blocked/is blocked
        // by the commenter — a blocked pair may not interact at all.
        const competition = await this.db.prepare(
            'SELECT creator_id FROM competitions WHERE id = ?'
        ).bind(data.competition_id).first<{ creator_id: number }>();
        if (competition && competition.creator_id !== data.user_id) {
            const blocked = await new UserBlockModel(this.db).isBlockedBetween(
                data.user_id!,
                competition.creator_id
            );
            if (blocked) {
                throw new BlockedInteractionError();
            }
        }

        const result = await this.db.prepare(`
            INSERT INTO comments (competition_id, user_id, content, is_live, parent_id, created_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
        `).bind(
            data.competition_id,
            data.user_id,
            data.content,
            data.is_live ? 1 : 0,
            data.parent_id ?? null
        ).run();

        // Update competition comment count
        await this.db.prepare(
            'UPDATE competitions SET total_comments = total_comments + 1 WHERE id = ?'
        ).bind(data.competition_id).run();

        return (await this.findById(result.meta.last_row_id as number))!;
    }

    /**
     * T3.3: Count of top-level comments for pagination sanity
     */
    async countTopLevel(competitionId: number): Promise<number> {
        const row = await this.db.prepare(
            'SELECT COUNT(*) AS n FROM comments WHERE competition_id = ? AND parent_id IS NULL AND deleted_at IS NULL'
        ).bind(competitionId).first<{ n: number }>();
        return row?.n || 0;
    }

    /**
     * Update comment (not typically used, but required by base)
     */
    async update(id: number, data: Partial<Comment>): Promise<Comment | null> {
        if (data.content) {
            // B7: same length bound applies to updates
            if (data.content.length > COMMENT_MAX_CONTENT_LENGTH) {
                throw new ContentTooLongError();
            }
            await this.db.prepare(
                'UPDATE comments SET content = ? WHERE id = ?'
            ).bind(data.content, id).run();
        }
        return this.findById(id);
    }
}

export default CommentModel;
