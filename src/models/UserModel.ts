/**
 * User Model
 * نموذج المستخدم
 * 
 * Handles all database operations for users.
 */

import { BaseModel, QueryOptions } from './base/BaseModel';
import type { User } from '../config/types';

/**
 * User creation data
 */
export interface CreateUserData {
    email: string;
    username: string;
    display_name: string;
    password_hash?: string;
    avatar_url?: string;
    country?: string;
    language?: string;
    verification_token?: string;
    oauth_provider?: string;
    oauth_id?: string;
}

/**
 * User update data
 */
export interface UpdateUserData {
    display_name?: string;
    avatar_url?: string;
    bio?: string;
    country?: string;
    language?: string;
    is_verified?: boolean;
}

/**
 * User Model Class
 */
export class UserModel extends BaseModel<User> {
    protected readonly tableName = 'users';

    /**
     * Find user by email
     */
    async findByEmail(email: string): Promise<User | null> {
        return this.findOne('email', email.toLowerCase());
    }

    /**
     * Find user by username
     */
    async findByUsername(username: string): Promise<User | null> {
        return this.findOne('username', username.toLowerCase());
    }

    /**
     * Find user by OAuth provider and ID
     */
    async findByOAuth(provider: string, oauthId: string): Promise<User | null> {
        return this.queryOne<User>(
            'SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?',
            provider, oauthId
        );
    }

    /**
     * Find user by verification token
     */
    async findByVerificationToken(token: string): Promise<User | null> {
        return this.findOne('verification_token', token);
    }

    /**
     * Find user by password reset token
     */
    async findByResetToken(token: string): Promise<User | null> {
        return this.queryOne<User>(
            'SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > datetime("now")',
            token
        );
    }

    /**
     * Check if email exists
     */
    async emailExists(email: string): Promise<boolean> {
        const result = await this.queryOne<{ count: number }>(
            'SELECT COUNT(*) as count FROM users WHERE email = ?',
            email.toLowerCase()
        );
        return (result?.count || 0) > 0;
    }

    /**
     * Check if username exists
     */
    async usernameExists(username: string): Promise<boolean> {
        const result = await this.queryOne<{ count: number }>(
            'SELECT COUNT(*) as count FROM users WHERE username = ?',
            username.toLowerCase()
        );
        return (result?.count || 0) > 0;
    }

    /**
     * Create new user
     */
    async create(data: CreateUserData): Promise<User> {
        const result = await this.db.prepare(`
            INSERT INTO users (
                email, username, display_name, password_hash, avatar_url,
                country, language, verification_token, oauth_provider, oauth_id,
                is_verified, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
            data.email.toLowerCase(),
            data.username.toLowerCase(),
            data.display_name,
            data.password_hash || null,
            data.avatar_url || null,
            data.country || 'US',
            data.language || 'en',
            data.verification_token || null,
            data.oauth_provider || null,
            data.oauth_id || null,
            data.oauth_provider ? 1 : 0 // OAuth users are auto-verified
        ).run();

        return (await this.findById(result.meta.last_row_id as number))!;
    }

    /**
     * Update user
     */
    async update(id: number, data: UpdateUserData): Promise<User | null> {
        const updates: string[] = [];
        const values: any[] = [];

        if (data.display_name !== undefined) {
            updates.push('display_name = ?');
            values.push(data.display_name);
        }
        if (data.avatar_url !== undefined) {
            updates.push('avatar_url = ?');
            values.push(data.avatar_url);
        }
        if (data.bio !== undefined) {
            updates.push('bio = ?');
            values.push(data.bio);
        }
        if (data.country !== undefined) {
            updates.push('country = ?');
            values.push(data.country);
        }
        if (data.language !== undefined) {
            updates.push('language = ?');
            values.push(data.language);
        }
        if (data.is_verified !== undefined) {
            updates.push('is_verified = ?');
            values.push(data.is_verified ? 1 : 0);
        }

        if (updates.length === 0) return this.findById(id);

        updates.push('updated_at = datetime("now")');
        values.push(id);

        await this.db.prepare(
            `UPDATE users SET ${updates.join(', ')} WHERE id = ?`
        ).bind(...values).run();

        return this.findById(id);
    }

    /**
     * Verify user email
     */
    async verifyEmail(id: number): Promise<boolean> {
        const result = await this.db.prepare(
            'UPDATE users SET is_verified = 1, verification_token = NULL WHERE id = ?'
        ).bind(id).run();
        return result.meta.changes > 0;
    }

    /**
     * Set password reset token
     */
    async setResetToken(id: number, token: string, expiresAt: string): Promise<boolean> {
        const result = await this.db.prepare(
            'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?'
        ).bind(token, expiresAt, id).run();
        return result.meta.changes > 0;
    }

    /**
     * Update password
     */
    async updatePassword(id: number, passwordHash: string): Promise<boolean> {
        const result = await this.db.prepare(
            'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?'
        ).bind(passwordHash, id).run();
        return result.meta.changes > 0;
    }

    /**
     * Get user with stats
     */
    async findWithStats(username: string): Promise<User | null> {
        return this.queryOne<User>(`
            SELECT u.*,
                   (SELECT COUNT(*) FROM competitions WHERE creator_id = u.id) as total_competitions,
                   (SELECT COUNT(*) FROM competitions WHERE (creator_id = u.id OR opponent_id = u.id) AND status = 'completed') as total_completed,
                   (SELECT COUNT(*) FROM user_follows WHERE following_id = u.id) as followers_count,
                   (SELECT COUNT(*) FROM user_follows WHERE follower_id = u.id) as following_count
            FROM users u
            WHERE u.username = ?
        `, username.toLowerCase());
    }
}

export default UserModel;
