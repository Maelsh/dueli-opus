/**
 * @file src/models/LikeModel.ts
 * @description نموذج الإعجابات
 * @module models/LikeModel
 */

import { D1Database } from '@cloudflare/workers-types';
import { BaseModel } from './base/BaseModel';
import { UserBlockModel } from './UserBlockModel';
import { BlockedInteractionError } from '../lib/errors/AppError';

/**
 * B8: the two interaction kinds this model owns.
 * Both are stored in their own physical table (`likes` / `dislikes`, both
 * created in migrations/0001_initial_schema.sql with
 * UNIQUE(user_id, competition_id)) — the schema already had a home for
 * dislikes, so no new migration was needed.
 */
export type ReactionType = 'like' | 'dislike';

/**
 * B8: the complete interaction state of one user on one competition,
 * plus the two public counters. This is what GET /:id/like returns.
 */
export interface ReactionStatus {
    liked: boolean;
    disliked: boolean;
    likes_count: number;
    dislikes_count: number;
}

/**
 * Like Interface
 */
export interface Like {
    id: number;
    user_id: number;
    competition_id: number;
    created_at: string;
}

/**
 * Like with user info
 */
export interface LikeWithUser extends Like {
    username: string;
    display_name: string;
    avatar_url: string | null;
}

/**
 * Like Model Class
 * نموذج الإعجابات
 */
export class LikeModel extends BaseModel<Like> {
    protected readonly tableName = 'likes';

    constructor(db: D1Database) {
        super(db);
    }

    /**
     * Create - required by BaseModel
     */
    async create(data: Partial<Like>): Promise<Like> {
        const now = new Date().toISOString();
        const result = await this.db.prepare(
            `INSERT INTO ${this.tableName} (user_id, competition_id, created_at) VALUES (?, ?, ?)`
        ).bind(data.user_id, data.competition_id, now).run();

        if (result.success && result.meta.last_row_id) {
            return (await this.findById(result.meta.last_row_id))!;
        }
        throw new Error('Failed to create like');
    }

    /**
     * Update - required by BaseModel (not used for likes)
     */
    async update(id: number, data: Partial<Like>): Promise<Like | null> {
        // Likes don't get updated, they're either created or deleted
        return this.findById(id);
    }

    /**
     * Table that physically stores a given reaction kind.
     * Fixed mapping (never user input) — safe to interpolate into SQL.
     */
    private tableFor(type: ReactionType): 'likes' | 'dislikes' {
        return type === 'like' ? 'likes' : 'dislikes';
    }

    /**
     * The opposite kind — the one that must be cleared on a switch.
     */
    private oppositeOf(type: ReactionType): ReactionType {
        return type === 'like' ? 'dislike' : 'like';
    }

    /**
     * B8 + B6: a blocked pair must not interact at all.
     * The competition's creator is the interaction counterpart (same rule as
     * CommentModel), and the check goes through UserBlockModel.isBlockedBetween
     * — the single source of truth for "are these two users blocking each
     * other?" — so nothing is written for a blocked pair.
     */
    private async assertNotBlocked(userId: number, competitionId: number): Promise<void> {
        const competition = await this.db.prepare(
            'SELECT creator_id FROM competitions WHERE id = ?'
        ).bind(competitionId).first<{ creator_id: number }>();

        if (!competition || competition.creator_id === userId) {
            return;
        }
        const blocked = await new UserBlockModel(this.db).isBlockedBetween(userId, competition.creator_id);
        if (blocked) {
            throw new BlockedInteractionError();
        }
    }

    /**
     * Check if user has liked a competition
     */
    async hasLiked(userId: number, competitionId: number): Promise<boolean> {
        return this.hasReaction(userId, competitionId, 'like');
    }

    /**
     * B8: check if user has disliked a competition
     */
    async hasDisliked(userId: number, competitionId: number): Promise<boolean> {
        return this.hasReaction(userId, competitionId, 'dislike');
    }

    /**
     * B8: does this user already hold that reaction row?
     */
    private async hasReaction(userId: number, competitionId: number, type: ReactionType): Promise<boolean> {
        const result = await this.db.prepare(
            `SELECT id FROM ${this.tableFor(type)} WHERE user_id = ? AND competition_id = ?`
        ).bind(userId, competitionId).first();
        return !!result;
    }

    /**
     * B8: set a reaction atomically. A like clears any dislike of the same
     * user on the same competition and vice versa, so the two can never
     * coexist. Idempotent: repeating the same reaction writes nothing new.
     *
     * All statements (clear opposite → insert own → refresh cached counters)
     * run in ONE db.batch(), which D1 executes as a single transaction. The
     * previous implementation did `hasLiked()` then `addLike()` as two
     * separate round-trips — a check-then-act race two concurrent requests
     * could both win.
     */
    async setReaction(userId: number, competitionId: number, type: ReactionType): Promise<ReactionStatus> {
        await this.assertNotBlocked(userId, competitionId);

        const addTable = this.tableFor(type);
        const removeTable = this.tableFor(this.oppositeOf(type));
        const now = new Date().toISOString();

        await this.db.batch([
            this.db.prepare(
                `DELETE FROM ${removeTable} WHERE user_id = ? AND competition_id = ?`
            ).bind(userId, competitionId),
            this.db.prepare(
                `INSERT OR IGNORE INTO ${addTable} (user_id, competition_id, created_at) VALUES (?, ?, ?)`
            ).bind(userId, competitionId, now),
            this.countersStatement(competitionId)
        ]);

        return this.getStatus(userId, competitionId);
    }

    /**
     * B8: clear one reaction atomically and report whether a row was actually
     * removed, so the controller can answer 404 when there was nothing to clear.
     */
    async clearReaction(userId: number, competitionId: number, type: ReactionType): Promise<ReactionStatus & { removed: boolean }> {
        const table = this.tableFor(type);

        const results = await this.db.batch([
            this.db.prepare(
                `DELETE FROM ${table} WHERE user_id = ? AND competition_id = ?`
            ).bind(userId, competitionId),
            this.countersStatement(competitionId)
        ]);

        const removed = ((results[0] as { meta?: { changes?: number } })?.meta?.changes ?? 0) > 0;
        const status = await this.getStatus(userId, competitionId);
        return { ...status, removed };
    }

    /**
     * B8: both counters, recomputed from their source tables inside the same
     * transaction as the row change. `competitions.likes_count` /
     * `dislikes_count` are read by `SELECT c.*` in CompetitionModel and shown
     * on the competition cards, so they must never drift from the rows.
     */
    private countersStatement(competitionId: number) {
        return this.db.prepare(
            `UPDATE competitions
                SET likes_count = (SELECT COUNT(*) FROM likes WHERE competition_id = ?),
                    dislikes_count = (SELECT COUNT(*) FROM dislikes WHERE competition_id = ?)
              WHERE id = ?`
        ).bind(competitionId, competitionId, competitionId);
    }

    /**
     * B8: full interaction state for one viewer (or an anonymous one).
     */
    async getStatus(userId: number | null, competitionId: number): Promise<ReactionStatus> {
        const likes_count = await this.getLikeCount(competitionId);
        const dislikes_count = await this.getDislikeCount(competitionId);
        const liked = userId ? await this.hasReaction(userId, competitionId, 'like') : false;
        const disliked = userId ? await this.hasReaction(userId, competitionId, 'dislike') : false;

        return { liked, disliked, likes_count, dislikes_count };
    }

    /**
     * Get like count for competition
     */
    async getLikeCount(competitionId: number): Promise<number> {
        const result = await this.db.prepare(
            `SELECT COUNT(*) as count FROM ${this.tableName} WHERE competition_id = ?`
        ).bind(competitionId).first<{ count: number }>();
        return result?.count || 0;
    }

    /**
     * B8: get dislike count for competition
     */
    async getDislikeCount(competitionId: number): Promise<number> {
        const result = await this.db.prepare(
            `SELECT COUNT(*) as count FROM dislikes WHERE competition_id = ?`
        ).bind(competitionId).first<{ count: number }>();
        return result?.count || 0;
    }

    /**
     * Get users who liked a competition
     */
    async getLikers(competitionId: number, limit: number = 20, offset: number = 0): Promise<LikeWithUser[]> {
        const result = await this.db.prepare(`
            SELECT l.*, u.username, u.display_name, u.avatar_url
            FROM ${this.tableName} l
            JOIN users u ON l.user_id = u.id
            WHERE l.competition_id = ?
            ORDER BY l.created_at DESC
            LIMIT ? OFFSET ?
        `).bind(competitionId, limit, offset).all<LikeWithUser>();
        return result.results || [];
    }

    /**
     * Get liked competitions by user
     */
    async getUserLikes(userId: number, limit: number = 20, offset: number = 0): Promise<any[]> {
        const result = await this.db.prepare(`
            SELECT c.*, l.created_at as liked_at,
                   u.username as creator_username,
                   u.display_name as creator_display_name,
                   cat.name_ar as category_name_ar,
                   cat.name_en as category_name_en
            FROM ${this.tableName} l
            JOIN competitions c ON l.competition_id = c.id
            JOIN users u ON c.creator_id = u.id
            LEFT JOIN categories cat ON c.category_id = cat.id
            WHERE l.user_id = ?
            ORDER BY l.created_at DESC
            LIMIT ? OFFSET ?
        `).bind(userId, limit, offset).all();
        return result.results || [];
    }
}

export default LikeModel;
