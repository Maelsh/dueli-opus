/**
 * Competition Model
 * نموذج المنافسة
 * 
 * Handles all database operations for competitions.
 */

import { BaseModel, QueryOptions } from './base/BaseModel';
import type { Competition, CompetitionStatus } from '../config/types';

/**
 * Competition filter options
 */
export interface CompetitionFilters {
    status?: CompetitionStatus | 'recorded';
    category?: string | number;
    subcategory?: string;
    country?: string;
    language?: string;
    creatorId?: number;
    userId?: number; // جلب منافسات المستخدم كـ creator أو opponent
    search?: string;
    limit?: number;
    offset?: number;
}

/**
 * Competition with joined data
 */
export interface CompetitionWithDetails extends Competition {
    category_name_ar?: string;
    category_name_en?: string;
    category_slug?: string;
    category_icon?: string;
    category_color?: string;
    subcategory_name_ar?: string;
    subcategory_name_en?: string;
    subcategory_slug?: string;
    creator_name?: string;
    creator_avatar?: string;
    creator_username?: string;
    opponent_name?: string;
    opponent_avatar?: string;
    opponent_username?: string;
}

/**
 * Competition creation data
 */
export interface CreateCompetitionData {
    title: string;
    description?: string;
    rules: string;
    category_id: number;
    subcategory_id?: number;
    creator_id: number;
    language: string;
    country?: string;
    scheduled_at?: string;
}

/**
 * Competition Model Class
 */
export class CompetitionModel extends BaseModel<Competition> {
    protected readonly tableName = 'competitions';

    /**
     * Find competition with all details
     */
    async findWithDetails(id: number): Promise<CompetitionWithDetails | null> {
        return this.queryOne<CompetitionWithDetails>(`
            SELECT c.*, 
                   cat.name_ar as category_name_ar,
                   cat.name_en as category_name_en,
                   cat.slug as category_slug,
                   cat.icon as category_icon,
                   COALESCE(subcat.color, cat.color) as category_color,
                   subcat.name_ar as subcategory_name_ar,
                   subcat.name_en as subcategory_name_en,
                   subcat.slug as subcategory_slug,
                   creator.display_name as creator_name,
                   creator.avatar_url as creator_avatar,
                   creator.username as creator_username,
                   opponent.display_name as opponent_name,
                   opponent.avatar_url as opponent_avatar,
                   opponent.username as opponent_username
            FROM competitions c
            JOIN categories cat ON c.category_id = cat.id
            LEFT JOIN categories subcat ON c.subcategory_id = subcat.id
            JOIN users creator ON c.creator_id = creator.id
            LEFT JOIN users opponent ON c.opponent_id = opponent.id
            WHERE c.id = ?
        `, id);
    }

    /**
     * Find competitions with filters
     */
    async findByFilters(filters: CompetitionFilters): Promise<CompetitionWithDetails[]> {
        let query = `
            SELECT c.*, 
                   cat.name_ar as category_name_ar,
                   cat.name_en as category_name_en,
                   cat.slug as category_slug,
                   cat.icon as category_icon,
                   COALESCE(subcat.color, cat.color) as category_color,
                   subcat.slug as subcategory_slug,
                   creator.display_name as creator_name,
                   creator.avatar_url as creator_avatar,
                   creator.username as creator_username,
                   opponent.display_name as opponent_name,
                   opponent.avatar_url as opponent_avatar,
                   opponent.username as opponent_username
            FROM competitions c
            JOIN categories cat ON c.category_id = cat.id
            LEFT JOIN categories subcat ON c.subcategory_id = subcat.id
            JOIN users creator ON c.creator_id = creator.id
            LEFT JOIN users opponent ON c.opponent_id = opponent.id
            WHERE 1=1
        `;
        const params: any[] = [];

        // Status filter
        if (filters.status) {
            if (filters.status === 'recorded') {
                query += ' AND c.status = ?';
                params.push('completed');
            } else if (filters.status === 'live') {
                query += ' AND c.status = ?';
                params.push('live');
            } else if (filters.status === 'pending') {
                query += ' AND c.status = ?';
                params.push('pending');
            }
        }

        // Category filter
        if (filters.category) {
            query += ' AND (c.category_id = ? OR c.subcategory_id = ? OR cat.slug = ?)';
            params.push(filters.category, filters.category, filters.category);
        }

        // Subcategory filter (filter by subcategory slug)
        if (filters.subcategory) {
            query += ' AND subcat.slug = ?';
            params.push(filters.subcategory);
        }

        // Country filter
        if (filters.country) {
            query += ' AND c.country = ?';
            params.push(filters.country);
        }

        // Language filter
        if (filters.language) {
            query += ' AND c.language = ?';
            params.push(filters.language);
        }

        // Creator filter
        if (filters.creatorId) {
            query += ' AND c.creator_id = ?';
            params.push(filters.creatorId);
        }

        // User filter (creator OR opponent)
        if (filters.userId) {
            query += ' AND (c.creator_id = ? OR c.opponent_id = ?)';
            params.push(filters.userId, filters.userId);
        }

        // Search filter
        if (filters.search) {
            query += ' AND c.title LIKE ?';
            params.push(`%${filters.search}%`);
        }

        // Order and pagination
        query += ' ORDER BY RANDOM() LIMIT ? OFFSET ?';
        params.push(filters.limit || 20, filters.offset || 0);

        return this.query<CompetitionWithDetails>(query, ...params);
    }

    /**
     * Find user's competitions
     */
    async findByUser(userId: number, options: QueryOptions = {}): Promise<CompetitionWithDetails[]> {
        const { limit = 20, offset = 0 } = options;

        return this.query<CompetitionWithDetails>(`
            SELECT c.*, 
                   cat.name_ar as category_name_ar,
                   cat.name_en as category_name_en,
                   cat.slug as category_slug
            FROM competitions c
            JOIN categories cat ON c.category_id = cat.id
            WHERE c.creator_id = ? OR c.opponent_id = ?
            ORDER BY c.created_at DESC
            LIMIT ? OFFSET ?
        `, userId, userId, limit, offset);
    }

    /**
     * Create competition
     */
    async create(data: CreateCompetitionData): Promise<Competition> {
        const result = await this.db.prepare(`
            INSERT INTO competitions (
                title, description, rules, category_id, subcategory_id,
                creator_id, language, country, scheduled_at, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
        `).bind(
            data.title,
            data.description || null,
            data.rules,
            data.category_id,
            data.subcategory_id || null,
            data.creator_id,
            data.language,
            data.country || null,
            data.scheduled_at || null
        ).run();

        return (await this.findById(result.meta.last_row_id as number))!;
    }

    /**
     * Update competition
     */
    async update(id: number, data: Partial<Competition>): Promise<Competition | null> {
        const updates: string[] = [];
        const values: any[] = [];

        const allowedFields = ['title', 'description', 'rules', 'status', 'youtube_live_id', 'youtube_video_url'];

        for (const field of allowedFields) {
            if (data[field as keyof Competition] !== undefined) {
                updates.push(`${field} = ?`);
                values.push(data[field as keyof Competition]);
            }
        }

        if (updates.length === 0) return this.findById(id);

        updates.push('updated_at = datetime("now")');
        values.push(id);

        await this.db.prepare(
            `UPDATE competitions SET ${updates.join(', ')} WHERE id = ?`
        ).bind(...values).run();

        return this.findById(id);
    }

    /**
     * Set opponent
     */
    async setOpponent(id: number, opponentId: number): Promise<boolean> {
        const result = await this.db.prepare(
            'UPDATE competitions SET opponent_id = ?, status = "accepted" WHERE id = ? AND opponent_id IS NULL'
        ).bind(opponentId, id).run();
        return result.meta.changes > 0;
    }

    /**
     * Start competition (go live) - supports both YouTube and P2P
     */
    async startLive(id: number, options?: {
        youtubeLiveId?: string;
        liveUrl?: string;
    }): Promise<boolean> {
        const liveUrl = options?.liveUrl || null;
        const youtubeLiveId = options?.youtubeLiveId || null;

        const result = await this.db.prepare(`
            UPDATE competitions 
            SET status = 'live', 
                started_at = datetime('now'), 
                youtube_live_id = ?,
                live_url = ?,
                stream_status = 'live',
                stream_started_at = datetime('now')
            WHERE id = ?
        `).bind(youtubeLiveId, liveUrl, id).run();
        return result.meta.changes > 0;
    }

    /**
     * End competition - supports both YouTube and P2P VOD
     */
    async complete(id: number, options?: {
        youtubeVideoUrl?: string;
        vodUrl?: string;
    }): Promise<boolean> {
        const vodUrl = options?.vodUrl || null;
        const youtubeVideoUrl = options?.youtubeVideoUrl || null;

        const result = await this.db.prepare(`
            UPDATE competitions 
            SET status = 'completed', 
                ended_at = datetime('now'), 
                youtube_video_url = ?,
                vod_url = ?,
                stream_status = 'ready',
                stream_ended_at = datetime('now')
            WHERE id = ?
        `).bind(youtubeVideoUrl, vodUrl, id).run();
        return result.meta.changes > 0;
    }

    /**
     * Update stream status during processing
     */
    async updateStreamStatus(id: number, status: string): Promise<boolean> {
        const result = await this.db.prepare(
            'UPDATE competitions SET stream_status = ? WHERE id = ?'
        ).bind(status, id).run();
        return result.meta.changes > 0;
    }

    /**
     * Set VOD URL after finalization
     */
    async setVodUrl(id: number, vodUrl: string): Promise<boolean> {
        const result = await this.db.prepare(`
            UPDATE competitions 
            SET vod_url = ?, stream_status = 'ready' 
            WHERE id = ?
        `).bind(vodUrl, id).run();
        return result.meta.changes > 0;
    }

    /**
     * Increment views
     */
    async incrementViews(id: number): Promise<void> {
        await this.db.prepare(
            'UPDATE competitions SET total_views = total_views + 1 WHERE id = ?'
        ).bind(id).run();
    }
}

export default CompetitionModel;
