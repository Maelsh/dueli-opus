/**
 * @file src/models/SearchModel.ts
 * @description نموذج البحث
 * @module models/SearchModel
 */

import { D1Database } from '@cloudflare/workers-types';
import { Competition, User } from '../config/types';

/**
 * Search Filters Interface
 */
export interface SearchFilters {
    query?: string;
    category_id?: number;
    subcategory_id?: number;
    status?: string;
    language?: string;
    country?: string;
    limit?: number;
    offset?: number;
}

/**
 * Search Result Interface
 */
export interface SearchResult<T> {
    items: T[];
    total: number;
    hasMore: boolean;
}

/**
 * Search Model Class
 * نموذج البحث والاكتشاف
 */
export class SearchModel {
    private db: D1Database;

    constructor(db: D1Database) {
        this.db = db;
    }

    /**
     * Search competitions by filters
     */
    async searchCompetitions(filters: SearchFilters): Promise<SearchResult<Competition>> {
        const conditions: string[] = [];
        const params: any[] = [];
        const limit = filters.limit || 20;
        const offset = filters.offset || 0;

        // Text search on title and description
        if (filters.query) {
            conditions.push(`(c.title LIKE ? OR c.description LIKE ?)`);
            params.push(`%${filters.query}%`, `%${filters.query}%`);
        }

        // Category filter
        if (filters.category_id) {
            conditions.push(`c.category_id = ?`);
            params.push(filters.category_id);
        }

        // Subcategory filter
        if (filters.subcategory_id) {
            conditions.push(`c.subcategory_id = ?`);
            params.push(filters.subcategory_id);
        }

        // Status filter
        if (filters.status) {
            conditions.push(`c.status = ?`);
            params.push(filters.status);
        }

        // Language filter
        if (filters.language) {
            conditions.push(`c.language = ?`);
            params.push(filters.language);
        }

        // Country filter
        if (filters.country) {
            conditions.push(`c.country = ?`);
            params.push(filters.country);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Count total
        const countQuery = `SELECT COUNT(*) as total FROM competitions c ${whereClause}`;
        const countResult = await this.db.prepare(countQuery).bind(...params).first<{ total: number }>();
        const total = countResult?.total || 0;

        // Get items with joins
        const itemsQuery = `
            SELECT 
                c.*,
                u.username as creator_username,
                u.display_name as creator_display_name,
                u.avatar_url as creator_avatar,
                cat.name_ar as category_name_ar,
                cat.name_en as category_name_en,
                cat.slug as category_slug
            FROM competitions c
            LEFT JOIN users u ON c.creator_id = u.id
            LEFT JOIN categories cat ON c.category_id = cat.id
            ${whereClause}
            ORDER BY c.created_at DESC
            LIMIT ? OFFSET ?
        `;

        const itemsResult = await this.db.prepare(itemsQuery)
            .bind(...params, limit, offset)
            .all<Competition>();

        return {
            items: itemsResult.results || [],
            total,
            hasMore: offset + limit < total
        };
    }

    /**
     * Search users by query
     */
    async searchUsers(query: string, limit: number = 20, offset: number = 0): Promise<SearchResult<User>> {
        const searchTerm = `%${query}%`;

        // Count total
        const countQuery = `
            SELECT COUNT(*) as total FROM users 
            WHERE username LIKE ? OR display_name LIKE ?
        `;
        const countResult = await this.db.prepare(countQuery)
            .bind(searchTerm, searchTerm)
            .first<{ total: number }>();
        const total = countResult?.total || 0;

        // Get items
        const itemsQuery = `
            SELECT id, username, display_name, avatar_url, bio, country, language,
                   total_competitions, total_wins, average_rating, created_at
            FROM users 
            WHERE username LIKE ? OR display_name LIKE ?
            ORDER BY total_competitions DESC, average_rating DESC
            LIMIT ? OFFSET ?
        `;

        const itemsResult = await this.db.prepare(itemsQuery)
            .bind(searchTerm, searchTerm, limit, offset)
            .all<User>();

        return {
            items: itemsResult.results || [],
            total,
            hasMore: offset + limit < total
        };
    }

    /**
     * Get suggested competitions for a user
     * Based on: language, country, trending (views), recent
     */
    async getSuggestedCompetitions(
        userId: number | null,
        language: string,
        country: string,
        limit: number = 10
    ): Promise<Competition[]> {
        // Get user preferences if logged in
        let userLanguage = language;
        let userCountry = country;

        if (userId) {
            const user = await this.db.prepare(
                `SELECT language, country FROM users WHERE id = ?`
            ).bind(userId).first<{ language: string; country: string }>();

            if (user) {
                userLanguage = user.language || language;
                userCountry = user.country || country;
            }
        }

        // Get suggested competitions: prioritize same language/country, then trending
        const query = `
            SELECT 
                c.*,
                u.username as creator_username,
                u.display_name as creator_display_name,
                u.avatar_url as creator_avatar,
                cat.name_ar as category_name_ar,
                cat.name_en as category_name_en,
                cat.slug as category_slug,
                CASE 
                    WHEN c.language = ? AND c.country = ? THEN 3
                    WHEN c.language = ? THEN 2
                    WHEN c.country = ? THEN 1
                    ELSE 0
                END as relevance_score
            FROM competitions c
            LEFT JOIN users u ON c.creator_id = u.id
            LEFT JOIN categories cat ON c.category_id = cat.id
            WHERE c.status IN ('pending', 'live')
            ORDER BY 
                relevance_score DESC,
                c.status = 'live' DESC,
                c.total_views DESC,
                c.created_at DESC
            LIMIT ?
        `;

        const result = await this.db.prepare(query)
            .bind(userLanguage, userCountry, userLanguage, userCountry, limit)
            .all<Competition>();

        return result.results || [];
    }

    /**
     * Get suggested users to follow
     * Based on: same country/language, popular users, active users
     */
    async getSuggestedUsers(
        userId: number,
        language: string,
        country: string,
        limit: number = 10
    ): Promise<User[]> {
        const query = `
            SELECT 
                u.id, u.username, u.display_name, u.avatar_url, u.bio,
                u.country, u.language, u.total_competitions, u.total_wins, u.average_rating,
                CASE 
                    WHEN u.language = ? AND u.country = ? THEN 3
                    WHEN u.language = ? THEN 2
                    WHEN u.country = ? THEN 1
                    ELSE 0
                END as relevance_score
            FROM users u
            WHERE u.id != ?
            AND u.id NOT IN (
                SELECT following_id FROM user_follows WHERE follower_id = ?
            )
            ORDER BY 
                relevance_score DESC,
                u.total_competitions DESC,
                u.average_rating DESC
            LIMIT ?
        `;

        const result = await this.db.prepare(query)
            .bind(language, country, language, country, userId, userId, limit)
            .all<User>();

        return result.results || [];
    }

    /**
     * Get trending competitions (most views in recent period)
     */
    async getTrendingCompetitions(limit: number = 10): Promise<Competition[]> {
        const query = `
            SELECT 
                c.*,
                u.username as creator_username,
                u.display_name as creator_display_name,
                u.avatar_url as creator_avatar,
                cat.name_ar as category_name_ar,
                cat.name_en as category_name_en,
                cat.slug as category_slug
            FROM competitions c
            LEFT JOIN users u ON c.creator_id = u.id
            LEFT JOIN categories cat ON c.category_id = cat.id
            WHERE c.status IN ('live', 'completed')
            AND c.created_at >= datetime('now', '-7 days')
            ORDER BY c.total_views DESC, c.total_comments DESC
            LIMIT ?
        `;

        const result = await this.db.prepare(query).bind(limit).all<Competition>();
        return result.results || [];
    }

    /**
     * Get live competitions
     */
    async getLiveCompetitions(limit: number = 20, offset: number = 0): Promise<SearchResult<Competition>> {
        const countResult = await this.db.prepare(
            `SELECT COUNT(*) as total FROM competitions WHERE status = 'live'`
        ).first<{ total: number }>();
        const total = countResult?.total || 0;

        const query = `
            SELECT 
                c.*,
                u.username as creator_username,
                u.display_name as creator_display_name,
                u.avatar_url as creator_avatar,
                cat.name_ar as category_name_ar,
                cat.name_en as category_name_en,
                cat.slug as category_slug
            FROM competitions c
            LEFT JOIN users u ON c.creator_id = u.id
            LEFT JOIN categories cat ON c.category_id = cat.id
            WHERE c.status = 'live'
            ORDER BY c.started_at DESC
            LIMIT ? OFFSET ?
        `;

        const result = await this.db.prepare(query).bind(limit, offset).all<Competition>();
        return {
            items: result.results || [],
            total,
            hasMore: offset + limit < total
        };
    }

    /**
     * Get competitions waiting for opponent
     */
    async getPendingCompetitions(limit: number = 20, offset: number = 0): Promise<SearchResult<Competition>> {
        const countResult = await this.db.prepare(
            `SELECT COUNT(*) as total FROM competitions WHERE status = 'pending' AND opponent_id IS NULL`
        ).first<{ total: number }>();
        const total = countResult?.total || 0;

        const query = `
            SELECT 
                c.*,
                u.username as creator_username,
                u.display_name as creator_display_name,
                u.avatar_url as creator_avatar,
                cat.name_ar as category_name_ar,
                cat.name_en as category_name_en,
                cat.slug as category_slug
            FROM competitions c
            LEFT JOIN users u ON c.creator_id = u.id
            LEFT JOIN categories cat ON c.category_id = cat.id
            WHERE c.status = 'pending' AND c.opponent_id IS NULL
            ORDER BY c.created_at DESC
            LIMIT ? OFFSET ?
        `;

        const result = await this.db.prepare(query).bind(limit, offset).all<Competition>();
        return {
            items: result.results || [],
            total,
            hasMore: offset + limit < total
        };
    }
}

export default SearchModel;
