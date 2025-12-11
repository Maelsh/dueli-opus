/**
 * @file src/models/LikeModel.ts
 * @description نموذج الإعجابات
 * @module models/LikeModel
 */

import { D1Database } from '@cloudflare/workers-types';
import { BaseModel } from './base/BaseModel';

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
     * Check if user has liked a competition
     */
    async hasLiked(userId: number, competitionId: number): Promise<boolean> {
        const result = await this.db.prepare(
            `SELECT id FROM ${this.tableName} WHERE user_id = ? AND competition_id = ?`
        ).bind(userId, competitionId).first();
        return !!result;
    }

    /**
     * Add like
     */
    async addLike(userId: number, competitionId: number): Promise<Like | null> {
        // Check if already liked
        if (await this.hasLiked(userId, competitionId)) {
            return null;
        }

        const now = new Date().toISOString();
        const result = await this.db.prepare(
            `INSERT INTO ${this.tableName} (user_id, competition_id, created_at) VALUES (?, ?, ?)`
        ).bind(userId, competitionId, now).run();

        if (result.success && result.meta.last_row_id) {
            return this.findById(result.meta.last_row_id);
        }
        return null;
    }

    /**
     * Remove like
     */
    async removeLike(userId: number, competitionId: number): Promise<boolean> {
        const result = await this.db.prepare(
            `DELETE FROM ${this.tableName} WHERE user_id = ? AND competition_id = ?`
        ).bind(userId, competitionId).run();
        return result.success && (result.meta.changes ?? 0) > 0;
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
