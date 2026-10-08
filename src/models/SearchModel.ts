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
     * Search users — R3-D2 (h7-v1 §4 user search).
     *
     * Text layers FIRST (exact → prefix/whole-word → partial, Unicode-aware
     * ar/en via h7SearchLayer — the D1-REM1 whole-word fix, never ASCII \b),
     * then H7 inside the layer (text 60, specialization 15, Profile 15,
     * language 5, country 5). Followed/busy/inactive-alone NEVER exclude;
     * self/block hold only when the caller identity is known (viewerId).
     * Callers that need a frozen scroll use the user-search sessions; this
     * offset slice ranks the SAME H7 order (no old fame order remains).
     */
    async searchUsers(
        query: string,
        limit: number = 20,
        offset: number = 0,
        viewer?: { id: number; language?: string | null; country?: string | null }
    ): Promise<SearchResult<User>> {
        const q = query.trim();
        const safeLimit = Math.min(Math.max(limit || 20, 1), 50);
        const safeOffset = Math.max(offset || 0, 0);
        const { UserSignalsModel } = await import('./UserSignalsModel');
        const ranking = await import('../lib/services/H7UserRankingService');
        const signals = new UserSignalsModel(this.db);
        const allIds = await signals.findAllActiveUserIds();
        const rows = await signals.loadUsers(allIds);
        const viewerId = viewer?.id ?? null;
        const blocked = viewerId === null ? new Set<number>() : await signals.loadBlockedIds(viewerId);
        const eligible = rows.filter((r) => {
            if (viewerId !== null && r.id === viewerId) return false;
            if (blocked.has(r.id)) return false;
            return true;
        });
        const withLayer = eligible.map((r) => ({ row: r, layer: ranking.h7UserSearchLayer(r, q) }));
        const kept = q === '' ? withLayer : withLayer.filter((l) => l.layer <= 2);
        const ctx = viewerId === null
            ? {
                viewerId: null,
                language: viewer?.language ?? null,
                country: viewer?.country ?? null,
                followingIds: new Set<number>(),
                viewerSpec: null,
            }
            : await (async () => {
                const [following, specs, me] = await Promise.all([
                    signals.loadFollowingIds(viewerId),
                    signals.loadSpecializations([viewerId]),
                    signals.loadUsers([viewerId]),
                ]);
                const m = me[0];
                return {
                    viewerId,
                    language: m?.language ?? viewer?.language ?? null,
                    country: m?.country ?? viewer?.country ?? null,
                    followingIds: following,
                    viewerSpec: specs.get(viewerId) ?? null,
                };
            })();
        const ids = kept.map((k) => k.row.id);
        const [specs, profiles] = await Promise.all([
            signals.loadSpecializations(ids),
            signals.getProfiles(ids),
        ]);
        const byLayer = new Map<number, typeof kept>();
        for (const item of kept) {
            const arr = byLayer.get(item.layer) ?? [];
            arr.push(item);
            byLayer.set(item.layer, arr);
        }
        const known = {
            profile: ids.some((id) => (profiles.get(id)?.profile ?? null) !== null),
            specialization:
                (ctx.viewerSpec?.totalParticipations ?? 0) > 0 ||
                (ctx.viewerSpec?.explicitFavs.length ?? 0) > 0,
        };
        const orderedIds: number[] = [];
        for (const layer of [0, 1, 2, 3]) {
            const group = byLayer.get(layer) ?? [];
            if (group.length === 0) continue;
            const scored = group.map(({ row }) => ({
                id: row.id,
                score: ranking.h7UserSearchScore(row, ctx, specs.get(row.id), profiles.get(row.id), known),
            }));
            orderedIds.push(...ranking.h7OrderUserScored(scored).map((s) => s.id));
        }
        const total = orderedIds.length;
        const pageIds = orderedIds.slice(safeOffset, safeOffset + safeLimit);
        if (pageIds.length === 0) {
            return { items: [], total, hasMore: safeOffset < total };
        }
        const placeholders = pageIds.map(() => '?').join(',');
        const itemsResult = await this.db.prepare(
            `SELECT
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
            WHERE u.id IN (${placeholders})`
        ).bind(...pageIds).all<User>();
        const byId = new Map<number, User>();
        for (const item of (itemsResult.results || [])) byId.set((item as User & { id: number }).id, item);
        const items = pageIds.map((id) => byId.get(id)).filter((r): r is User => !!r);
        // Attach Profile SSOT (display shares the ranking source; may exceed 5, never clamped).
        // R4-DB-OPT-1: reuse the ranking-time `profiles` map (pageIds ⊆ ids by
        // construction above) instead of a second getProfiles(pageIds), which
        // would re-issue the 3 loadProfiles statements for rows already read.
        // Same map, same values, zero new reads; ordering/exhaustion untouched.
        for (const item of items) {
            const p = profiles.get((item as User & { id: number }).id);
            const rec = item as unknown as Record<string, unknown>;
            rec['profile_score'] = p?.profile ?? null;
            rec['profile_competitions'] = p?.competitions ?? 0;
            rec['profile_stars'] = p?.starsSum ?? 0;
        }

        return {
            items,
            total,
            hasMore: safeOffset + safeLimit < total
        };
    }

    /**
     * H7 card hydration in ranked order (shared by the slices below).
     * D1 hotfix: hydrated in 80-id chunks — several callers pass a client
     * controlled limit with no upper cap, so one statement could exceed D1's
     * 100-bind hard limit. Order is restored from ids via byId, so chunking
     * is transparent.
     */
    private async hydrateCards(ids: number[]): Promise<Competition[]> {
        if (ids.length === 0) return [];
        const byId = new Map<number, Competition>();
        for (let i = 0; i < ids.length; i += 80) {
            const batch = ids.slice(i, i + 80);
            const placeholders = batch.map(() => '?').join(',');
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
            const res = await this.db.prepare(q).bind(...batch).all<Competition>();
            for (const item of (res.results || [])) byId.set((item as Competition & { id: number }).id, item);
        }
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
     * Follow suggestions — R3-D2 (h7-v1 §4: interest 25, lang 20, country 10,
     * Profile 15, experience 10, activity 10, new-account 10).
     *
     * Follow eligibility is SEPARATE from duel/search eligibility: self,
     * block and already-followed excluded; busy NEVER blocks follow.
     */
    async getSuggestedUsers(
        userId: number,
        language: string,
        country: string,
        limit: number = 10
    ): Promise<User[]> {
        const safeLimit = Math.min(Math.max(limit || 10, 1), 50);
        const { UserSignalsModel } = await import('./UserSignalsModel');
        const ranking = await import('../lib/services/H7UserRankingService');
        const signals = new UserSignalsModel(this.db);
        const allIds = await signals.findAllActiveUserIds();
        const rows = await signals.loadUsers(allIds);
        const [blocked, following, specs, me] = await Promise.all([
            signals.loadBlockedIds(userId),
            signals.loadFollowingIds(userId),
            signals.loadSpecializations([userId]),
            signals.loadUsers([userId]),
        ]);
        const eligible = rows.filter((r) => {
            if (r.id === userId) return false;
            if (blocked.has(r.id)) return false;
            if (following.has(r.id)) return false;
            return true;
        });
        if (eligible.length === 0) return [];
        void language;
        void country;
        const m = me[0];
        const ctx = {
            viewerId: userId,
            language: m?.language ?? null,
            country: m?.country ?? null,
            followingIds: following,
            viewerSpec: specs.get(userId) ?? null,
        };
        const ids = eligible.map((r) => r.id);
        const [candSpecs, profiles] = await Promise.all([
            signals.loadSpecializations(ids),
            signals.getProfiles(ids),
        ]);
        const nowMs = Date.now();
        const known = {
            profile: ids.some((id) => (profiles.get(id)?.profile ?? null) !== null),
            specialization:
                (ctx.viewerSpec?.totalParticipations ?? 0) > 0 ||
                (ctx.viewerSpec?.explicitFavs.length ?? 0) > 0,
        };
        const scored = eligible.map((row) => ({
            id: row.id,
            score: ranking.h7FollowScore(row, candSpecs.get(row.id), profiles.get(row.id), ctx, nowMs, known),
        }));
        const ordered = ranking.h7OrderUserScored(scored).map((s) => s.id).slice(0, safeLimit);
        if (ordered.length === 0) return [];
        const placeholders = ordered.map(() => '?').join(',');
        const result = await this.db.prepare(
            `SELECT
                u.id, u.username, u.display_name, u.avatar_url, u.bio,
                u.country, u.language, u.total_competitions, u.total_wins, u.average_rating
            FROM users u
            WHERE u.id IN (${placeholders})`
        ).bind(...ordered).all<User>();
        const byId = new Map<number, User>();
        for (const item of (result.results || [])) byId.set((item as User & { id: number }).id, item);
        const items = ordered.map((id) => byId.get(id)).filter((r): r is User => !!r);
        // R4-DB-OPT-1: reuse the ranking-time `profiles` map (ordered ⊆ ids by
        // construction above) instead of a second getProfiles(ordered), which
        // would re-issue the 3 loadProfiles statements for rows already read.
        // Same map, same values, zero new reads; ordering/exhaustion untouched.
        for (const item of items) {
            const p = profiles.get((item as User & { id: number }).id);
            const rec = item as unknown as Record<string, unknown>;
            rec['profile_score'] = p?.profile ?? null;
            rec['profile_competitions'] = p?.competitions ?? 0;
        }
        return items;
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
