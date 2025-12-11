/**
 * Comment Model
 * نموذج التعليق
 */

import { BaseModel, QueryOptions } from './base/BaseModel';
import type { Comment } from '../config/types';

/**
 * Comment with user data
 */
export interface CommentWithUser extends Comment {
    display_name?: string;
    avatar_url?: string;
    username?: string;
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
            WHERE c.competition_id = ?
            ORDER BY c.created_at DESC
            LIMIT ? OFFSET ?
        `, competitionId, limit, offset);
    }

    /**
     * Create comment
     */
    async create(data: Partial<Comment>): Promise<Comment> {
        const result = await this.db.prepare(`
            INSERT INTO comments (competition_id, user_id, content, is_live, created_at)
            VALUES (?, ?, ?, ?, datetime('now'))
        `).bind(
            data.competition_id,
            data.user_id,
            data.content,
            data.is_live ? 1 : 0
        ).run();

        // Update competition comment count
        await this.db.prepare(
            'UPDATE competitions SET total_comments = total_comments + 1 WHERE id = ?'
        ).bind(data.competition_id).run();

        return (await this.findById(result.meta.last_row_id as number))!;
    }

    /**
     * Update comment (not typically used, but required by base)
     */
    async update(id: number, data: Partial<Comment>): Promise<Comment | null> {
        if (data.content) {
            await this.db.prepare(
                'UPDATE comments SET content = ? WHERE id = ?'
            ).bind(data.content, id).run();
        }
        return this.findById(id);
    }
}

export default CommentModel;
