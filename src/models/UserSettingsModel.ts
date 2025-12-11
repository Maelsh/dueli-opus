/**
 * @file src/models/UserSettingsModel.ts
 * @description نموذج إعدادات المستخدم والمنشورات
 * @module models/UserSettingsModel
 */

import { D1Database } from '@cloudflare/workers-types';
import { BaseModel } from './base/BaseModel';

/**
 * User Settings Interface
 */
export interface UserSettings {
    id: number;
    user_id: number;
    default_language: string;
    default_country: string;
    notifications_enabled: number;
    email_notifications: number;
    privacy_level: 'public' | 'followers' | 'private';
    created_at: string;
    updated_at: string;
}

/**
 * User Post Interface
 */
export interface UserPost {
    id: number;
    user_id: number;
    content: string;
    image_url: string | null;
    created_at: string;
}

/**
 * User Post with author info
 */
export interface UserPostWithAuthor extends UserPost {
    username: string;
    display_name: string;
    avatar_url: string | null;
}

/**
 * User Settings Model Class
 * نموذج إعدادات المستخدم
 */
export class UserSettingsModel extends BaseModel<UserSettings> {
    protected readonly tableName = 'user_settings';

    constructor(db: D1Database) {
        super(db);
    }

    /**
     * Create - required by BaseModel
     */
    async create(data: Partial<UserSettings>): Promise<UserSettings> {
        const now = new Date().toISOString();
        const result = await this.db.prepare(`
            INSERT INTO ${this.tableName} 
            (user_id, default_language, default_country, notifications_enabled, email_notifications, privacy_level, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            data.user_id,
            data.default_language || 'en',
            data.default_country || 'US',
            data.notifications_enabled ?? 1,
            data.email_notifications ?? 1,
            data.privacy_level || 'public',
            now,
            now
        ).run();

        if (result.success && result.meta.last_row_id) {
            return (await this.findById(result.meta.last_row_id))!;
        }
        throw new Error('Failed to create user settings');
    }

    /**
     * Update - required by BaseModel
     */
    async update(id: number, data: Partial<UserSettings>): Promise<UserSettings | null> {
        const updates: string[] = [];
        const values: any[] = [];

        if (data.default_language !== undefined) {
            updates.push('default_language = ?');
            values.push(data.default_language);
        }
        if (data.default_country !== undefined) {
            updates.push('default_country = ?');
            values.push(data.default_country);
        }
        if (data.notifications_enabled !== undefined) {
            updates.push('notifications_enabled = ?');
            values.push(data.notifications_enabled);
        }
        if (data.email_notifications !== undefined) {
            updates.push('email_notifications = ?');
            values.push(data.email_notifications);
        }
        if (data.privacy_level !== undefined) {
            updates.push('privacy_level = ?');
            values.push(data.privacy_level);
        }

        if (updates.length === 0) return this.findById(id);

        updates.push('updated_at = ?');
        values.push(new Date().toISOString());
        values.push(id);

        await this.db.prepare(
            `UPDATE ${this.tableName} SET ${updates.join(', ')} WHERE id = ?`
        ).bind(...values).run();

        return this.findById(id);
    }

    /**
     * Get settings by user ID
     */
    async getByUserId(userId: number): Promise<UserSettings | null> {
        return this.findOne('user_id', userId);
    }

    /**
     * Get or create settings for user
     */
    async getOrCreate(userId: number): Promise<UserSettings> {
        const existing = await this.getByUserId(userId);
        if (existing) return existing;
        return this.create({ user_id: userId });
    }

    /**
     * Update settings by user ID
     */
    async updateByUserId(userId: number, data: Partial<UserSettings>): Promise<UserSettings | null> {
        const settings = await this.getOrCreate(userId);
        return this.update(settings.id, data);
    }
}

/**
 * User Post Model Class
 * نموذج منشورات المستخدم
 */
export class UserPostModel extends BaseModel<UserPost> {
    protected readonly tableName = 'user_posts';

    constructor(db: D1Database) {
        super(db);
    }

    /**
     * Create - required by BaseModel
     */
    async create(data: Partial<UserPost>): Promise<UserPost> {
        const now = new Date().toISOString();
        const result = await this.db.prepare(`
            INSERT INTO ${this.tableName} (user_id, content, image_url, created_at)
            VALUES (?, ?, ?, ?)
        `).bind(data.user_id, data.content, data.image_url || null, now).run();

        if (result.success && result.meta.last_row_id) {
            return (await this.findById(result.meta.last_row_id))!;
        }
        throw new Error('Failed to create post');
    }

    /**
     * Update - required by BaseModel
     */
    async update(id: number, data: Partial<UserPost>): Promise<UserPost | null> {
        if (data.content !== undefined) {
            await this.db.prepare(`
                UPDATE ${this.tableName} SET content = ? WHERE id = ?
            `).bind(data.content, id).run();
        }
        return this.findById(id);
    }

    /**
     * Get user's posts
     */
    async getUserPosts(userId: number, limit: number = 20, offset: number = 0): Promise<UserPostWithAuthor[]> {
        const result = await this.db.prepare(`
            SELECT p.*, u.username, u.display_name, u.avatar_url
            FROM ${this.tableName} p
            JOIN users u ON p.user_id = u.id
            WHERE p.user_id = ?
            ORDER BY p.created_at DESC
            LIMIT ? OFFSET ?
        `).bind(userId, limit, offset).all<UserPostWithAuthor>();
        return result.results || [];
    }

    /**
     * Get feed (posts from followed users)
     */
    async getFeed(userId: number, limit: number = 20, offset: number = 0): Promise<UserPostWithAuthor[]> {
        const result = await this.db.prepare(`
            SELECT p.*, u.username, u.display_name, u.avatar_url
            FROM ${this.tableName} p
            JOIN users u ON p.user_id = u.id
            WHERE p.user_id IN (
                SELECT following_id FROM user_follows WHERE follower_id = ?
            ) OR p.user_id = ?
            ORDER BY p.created_at DESC
            LIMIT ? OFFSET ?
        `).bind(userId, userId, limit, offset).all<UserPostWithAuthor>();
        return result.results || [];
    }

    /**
     * Check if user owns post
     */
    async isOwner(postId: number, userId: number): Promise<boolean> {
        const result = await this.db.prepare(`
            SELECT 1 FROM ${this.tableName} WHERE id = ? AND user_id = ?
        `).bind(postId, userId).first();
        return !!result;
    }
}

export default UserSettingsModel;
