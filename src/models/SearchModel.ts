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
     * Search competitions by filters — R3-D1 (h7-v1).
     *
     * Eligibility first (permission/privacy/blocked handled by callers
     * where identity is known; text/category/status/language/country here),
     * then text layers exact → prefix/whole-word → partial/description (§4)
     * with the H7 in-layer score (text 60, topic 15, Q 10, lang 5, country 5,
     * recency 5). A higher textual layer is never buried by fame. Empty
     * query falls back to watch browsing order (H7 watch weights).
     */
    async searchCompetitions(filters: SearchFilters): Promise<SearchResult<Competition>> {
        const limit = Math.min(Math.max(filters.limit || 20, 1), 50);
        const offset = Math.max(filters.offset || 0, 0);
        const q = (filters.query || '').trim();
        const conditions: string[] = [];
        const params: any[] = [];

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

        // Eligible id set first (no ORDER/LIMIT here).
        const idRows = await this.db.prepare(
            `SELECT c.id as id, c.title as title, c.description as description FROM competitions c ${whereClause}`
        ).bind(...params).all<{ id: number; title: string; description: string | null }>();
        let eligible = (idRows.results || []).map((r) => ({ id: r.id, title: r.title || '', description: r.description ?? null }));
        if (q !== '') {
            const lowered = q.toLowerCase();
            eligible = eligible.filter((r) =>
                r.title.toLowerCase().includes(lowered) || (r.description || '').toLowerCase().includes(lowered)
            );
        }
        const total = eligible.length;
        if (total === 0) {
            return { items: [], total, hasMore: false };
        }
        const { H7SignalsModel } = await import('./H7SignalsModel');
        const ranking = await import('../lib/services/H7RankingService');
        const policy = await import('../lib/services/H7RankingPolicy');
        const signalsModel = new H7SignalsModel(this.db);
        const rows = await signalsModel.loadCompetitions(eligible.map((e) => e.id));
        const ctx = await signalsModel.loadViewerContext(this.db, null, filters.language ?? null, filters.country ?? null);
        const nowMs = Date.now();
        let orderedIds: number[];
        if (q === '') {
            const uids: number[] = [];
            for (const r of rows) {
                uids.push(r.creator_id);
                if (r.opponent_id !== null) uids.push(r.opponent_id);
            }
            const profiles = await signalsModel.loadProfiles(uids);
            const scored = rows.map((r) => {
                const { score } = ranking.h7ScoreCard({ ...r, nowMs }, ctx, 'guest', 'mixed', profiles);
                return { id: r.id, score, recency: policy.h7RecencyOf({ ...r }, nowMs) };
            });
            orderedIds = ranking.h7OrderScored(scored).map((s) => s.id);
        } else {
            const layered = rows.map((r) => ({
                row: r,
                layer: policy.h7SearchLayer(r.title || '', r.description ?? null, q),
            }));
            orderedIds = [];
            for (const layer of [0, 1, 2, 3]) {
                const group = layered.filter((l) => l.layer === layer);
                if (group.length === 0) continue;
                const scored = group.map(({ row }) => ({
                    id: row.id,
                    score: ranking.h7SearchScore({ ...row, nowMs }, ctx, 0.5),
                    recency: policy.h7RecencyOf({ ...row }, nowMs),
                }));
                orderedIds.push(...ranking.h7OrderScored(scored).map((s) => s.id));
            }
        }
        const pageIds = orderedIds.slice(offset, offset + limit);
        if (pageIds.length === 0) {
            return { items: [], total, hasMore: offset < total };
        }
        const placeholders = pageIds.map(() => '?').join(',');
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
            WHERE c.id IN (${placeholders})
        `;
        const itemsResult = await this.db.prepare(itemsQuery).bind(...pageIds).all<Competition>();
        const byId = new Map<number, Competition>();
        for (const item of (itemsResult.results || [])) byId.set((item as Competition & { id: number }).id, item);
        const items = pageIds.map((id) => byId.get(id)).filter((r): r is Competition => !!r);

        return {
            items,
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
            WHERE (username LIKE ? OR display_name LIKE ?) AND is_active = 1
        `;
        const countResult = await this.db.prepare(countQuery)
            .bind(searchTerm, searchTerm)
            .first<{ total: number }>();
        const total = countResult?.total || 0;

        // Get items with followers count
        const itemsQuery = `
            SELECT 
                u.id, u.username, u.display_name, u.avatar_url, u.bio, 
                u.country, u.language, u.is_verified, u.is_fake,
                u.total_competitions, u.total_wins, u.average_rating, u.created_at,
                (SELECT COUNT(*) FROM follows WHERE following_id = u.id) as followers_count,
                (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) as following_count,
                CASE 
                    WHEN EXISTS (
                        SELECT 1 FROM competitions c 
                        WHERE (c.creator_id = u.id OR c.opponent_id = u.id) 
                        AND c.status = 'live'
                    ) THEN 1 ELSE 0 
                END as is_busy
            FROM users u
            WHERE (u.username LIKE ? OR u.display_name LIKE ?) AND u.is_active = 1
            ORDER BY u.total_competitions DESC, u.average_rating DESC
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
     * H7 card hydration in ranked order (shared by the slices below).
     */
    private async hydrateCards(ids: number[]): Promise<Competition[]> {
        if (ids.length === 0) return [];
        const placeholders = ids.map(() => '?').join(',');
        const q = `
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
            WHERE c.id IN (${placeholders})
        `;
        const res = await this.db.prepare(q).bind(...ids).all<Competition>();
        const byId = new Map<number, Competition>();
        for (const item of (res.results || [])) byId.set((item as Competition & { id: number }).id, item);
        return ids.map((id) => byId.get(id)).filter((r): r is Competition => !!r);
    }

    private async h7RankIds(
        ids: number[],
        viewerUserId: number | null,
        lang: string | null,
        country: string | null,
        bucket: 'live' | 'recorded' | 'upcoming' | 'mixed'
    ): Promise<number[]> {
        if (ids.length === 0) return [];
        const { H7SignalsModel } = await import('./H7SignalsModel');
        const ranking = await import('../lib/services/H7RankingService');
        const policy = await import('../lib/services/H7RankingPolicy');
        const signalsModel = new H7SignalsModel(this.db);
        const rows = await signalsModel.loadCompetitions(ids);
        const ctx = await signalsModel.loadViewerContext(this.db, viewerUserId, lang, country);
        const uids: number[] = [];
        for (const r of rows) {
            uids.push(r.creator_id);
            if (r.opponent_id !== null) uids.push(r.opponent_id);
        }
        const profiles = await signalsModel.loadProfiles(uids);
        const nowMs = Date.now();
        const identity = viewerUserId === null ? 'guest' : 'user';
        const scored = rows.map((r) => {
            const { score } = ranking.h7ScoreCard({ ...r, nowMs }, ctx, identity, bucket, profiles);
            return { id: r.id, score, recency: policy.h7RecencyOf({ ...r }, nowMs), row: r };
        });
        const ordered = ranking.h7OrderScored(scored);
        const diverse = ranking.h7ApplyDiscoveryDiversity(
            ordered.map((s) => ({
                id: s.id,
                creator_id: s.row.creator_id,
                opponent_id: s.row.opponent_id,
                created_at: s.row.created_at,
                total_views: s.row.total_views,
            })),
            nowMs
        );
        const rank = new Map(diverse.map((d, i) => [d.id, i] as [number, number]));
        return diverse.map((d) => d.id).sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
    }

    /**
     * Get suggested competitions for a user — R3-D1 (h7-v1).
     * Eligibility: public upcoming + live slices (waiting/appointment/live
     * cards); recorded needs a session with playable media (out of this
     * lightweight slot). Ranked H7, sliced by limit.
     */
    async getSuggestedCompetitions(
        userId: number | null,
        language: string,
        country: string,
        limit: number = 10
    ): Promise<Competition[]> {
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

        const idRows = await this.db.prepare(
            `SELECT c.id as id FROM competitions c
             WHERE c.status IN ('pending', 'accepted', 'live')`
        ).all<{ id: number }>();
        const ids = ((idRows.results ?? []) as Array<{ id: number }>).map((r) => r.id);
        const ranked = await this.h7RankIds(ids, userId, userLanguage, userCountry, 'mixed');
        return this.hydrateCards(ranked.slice(0, Math.max(0, limit)));
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
                SELECT following_id FROM follows WHERE follower_id = ?
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
     * Get trending competitions — R3-D1 (h7-v1).
     * Eligibility kept (live/completed of the last 7 days); ORDER is H7
     * mixed-status, never views-only.
     */
    async getTrendingCompetitions(limit: number = 10): Promise<Competition[]> {
        const idRows = await this.db.prepare(
            `SELECT c.id as id FROM competitions c
             WHERE c.status IN ('live', 'completed')
             AND c.created_at >= datetime('now', '-7 days')`
        ).all<{ id: number }>();
        const ids = ((idRows.results ?? []) as Array<{ id: number }>).map((r) => r.id);
        const ranked = await this.h7RankIds(ids, null, null, null, 'mixed');
        return this.hydrateCards(ranked.slice(0, Math.max(0, limit)));
    }

    /**
     * Get live competitions — R3-D1 (h7-v1): eligibility live, order H7.
     */
    async getLiveCompetitions(limit: number = 20, offset: number = 0): Promise<SearchResult<Competition>> {
        const idRows = await this.db.prepare(
            `SELECT c.id as id FROM competitions c WHERE c.status = 'live'`
        ).all<{ id: number }>();
        const ids = ((idRows.results ?? []) as Array<{ id: number }>).map((r) => r.id);
        const ranked = await this.h7RankIds(ids, null, null, null, 'live');
        const total = ranked.length;
        const page = ranked.slice(Math.max(0, offset), Math.max(0, offset) + Math.max(0, limit));
        return {
            items: await this.hydrateCards(page),
            total,
            hasMore: offset + limit < total
        };
    }

    /**
     * Get competitions waiting for opponent — R3-D1 (h7-v1).
     */
    async getPendingCompetitions(limit: number = 20, offset: number = 0): Promise<SearchResult<Competition>> {
        const idRows = await this.db.prepare(
            `SELECT c.id as id FROM competitions c WHERE c.status = 'pending' AND c.opponent_id IS NULL`
        ).all<{ id: number }>();
        const ids = ((idRows.results ?? []) as Array<{ id: number }>).map((r) => r.id);
        const ranked = await this.h7RankIds(ids, null, null, null, 'upcoming');
        const total = ranked.length;
        const page = ranked.slice(Math.max(0, offset), Math.max(0, offset) + Math.max(0, limit));
        return {
            items: await this.hydrateCards(page),
            total,
            hasMore: offset + limit < total
        };
    }
}

export default SearchModel;
