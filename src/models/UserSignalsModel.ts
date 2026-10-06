/**
 * User Signals Model — R3-D2 (h7-v1 §4 user tracks).
 * نموذج إشارات المستخدمين
 *
 * All SQL for D2 user ranking lives here (MVC — no SQL in controllers or
 * services). Pure arithmetic lives in H7UserRankingService.
 *
 * Profile SSOT: SUM effective stars / ACTUAL contested competitions comes
 * from H7SignalsModel.loadProfiles (denominator = competitions with
 * opponent_id IS NOT NULL — a bare pending row with no opponent is NOT a
 * contested competition). This model reuses that SSOT and never recomputes
 * the denominator its own way.
 *
 * No `#private` fields (Cloudflare Workers compat).
 */

import { H7SignalsModel } from './H7SignalsModel';
import { h7ProfileDisplay } from '../lib/services/H7RankingPolicy';

export interface UserSignalRow {
    id: number;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    bio: string | null;
    country: string | null;
    language: string | null;
    is_verified: number | null;
    is_active: number | null;
    is_online: number | null;
    last_seen_at: string | null;
    is_busy: number | null;
    created_at: string | null;
}

export interface UserSpecialization {
    /** category slug (lowercase) -> contested participations in it. */
    categoryCounts: Map<string, number>;
    /** subcategory slug (lowercase) -> contested participations in it. */
    subcategoryCounts: Map<string, number>;
    /** explicit fav slugs (lowercase taxonomy slugs from Settings). */
    explicitFavs: string[];
    /** Total contested participations (opponent set). */
    totalParticipations: number;
}

export interface CompetitorProfile {
    userId: number;
    starsSum: number;
    competitions: number;
    /** Null when the user contested zero competitions (no division by zero). */
    profile: number | null;
}

export class UserSignalsModel {
    private readonly db: D1Database;

    constructor(db: D1Database) {
        this.db = db;
    }

    /**
     * Profile SSOT read for ONE user (display + ranking share this).
     * Denominator/method owned by H7SignalsModel.loadProfiles.
     */
    async getProfile(userId: number): Promise<CompetitorProfile> {
        const signals = new H7SignalsModel(this.db);
        const map = await signals.loadProfiles([userId]);
        const agg = map.get(userId) ?? { sum: 0, count: 0 };
        return {
            userId,
            starsSum: agg.sum,
            competitions: agg.count,
            profile: h7ProfileDisplay(agg.sum, agg.count),
        };
    }

    /** Batch Profile SSOT read (display lists + ranking share this). */
    async getProfiles(userIds: number[]): Promise<Map<number, CompetitorProfile>> {
        const signals = new H7SignalsModel(this.db);
        const map = await signals.loadProfiles(userIds);
        const out = new Map<number, CompetitorProfile>();
        for (const [uid, agg] of map) {
            out.set(uid, {
                userId: uid,
                starsSum: agg.sum,
                competitions: agg.count,
                profile: h7ProfileDisplay(agg.sum, agg.count),
            });
        }
        for (const id of userIds) {
            if (Number.isInteger(id) && id > 0 && !out.has(id)) {
                out.set(id, { userId: id, starsSum: 0, competitions: 0, profile: null });
            }
        }
        return out;
    }

    /** Hydrate public user cards for an explicit id set (batched, order unspecified). */
    async loadUsers(ids: number[]): Promise<UserSignalRow[]> {
        const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
        if (unique.length === 0) return [];
        const out: UserSignalRow[] = [];
        for (let i = 0; i < unique.length; i += 80) {
            const batch = unique.slice(i, i + 80);
            const placeholders = batch.map(() => '?').join(',');
            const stmt = this.db.prepare(
                `SELECT id, username, display_name, avatar_url, bio, country, language,
                        is_verified, is_active, is_online, last_seen_at, is_busy, created_at
                   FROM users WHERE id IN (${placeholders})`
            ).bind(...batch);
            const res = await stmt.all<UserSignalRow>();
            for (const r of (res.results ?? []) as UserSignalRow[]) out.push(r);
        }
        return out;
    }

    /**
     * Specialization from CONTESTED participations only (opponent set) —
     * creating rows never counts as "practising" a category. Explicit favs
     * come from the namespaced user_keywords store (fav: slugs).
     */
    async loadSpecializations(userIds: number[]): Promise<Map<number, UserSpecialization>> {
        const unique = [...new Set(userIds.filter((id) => Number.isInteger(id) && id > 0))];
        const out = new Map<number, UserSpecialization>();
        for (const id of unique) {
            out.set(id, {
                categoryCounts: new Map(),
                subcategoryCounts: new Map(),
                explicitFavs: [],
                totalParticipations: 0,
            });
        }
        if (unique.length === 0) return out;
        for (let i = 0; i < unique.length; i += 80) {
            const batch = unique.slice(i, i + 80);
            const placeholders = batch.map(() => '?').join(',');
            const rows = await this.db.prepare(
                `SELECT c.creator_id AS creator_id, c.opponent_id AS opponent_id,
                        cat.slug AS cat_slug, subcat.slug AS sub_slug
                   FROM competitions c
                   JOIN categories cat ON c.category_id = cat.id
                   LEFT JOIN categories subcat ON c.subcategory_id = subcat.id
                  WHERE c.opponent_id IS NOT NULL
                    AND (c.creator_id IN (${placeholders}) OR c.opponent_id IN (${placeholders}))`
            ).bind(...batch, ...batch).all<{
                creator_id: number; opponent_id: number | null; cat_slug: string; sub_slug: string | null;
            }>();
            const batchSet = new Set(batch);
            for (const r of (rows.results ?? []) as Array<{
                creator_id: number; opponent_id: number | null; cat_slug: string; sub_slug: string | null;
            }>) {
                const sides = [r.creator_id, r.opponent_id];
                for (const uid of sides) {
                    if (typeof uid !== 'number' || !batchSet.has(uid)) continue;
                    const spec = out.get(uid);
                    if (!spec) continue;
                    spec.totalParticipations += 1;
                    const cat = String(r.cat_slug || '').toLowerCase();
                    if (cat !== '') spec.categoryCounts.set(cat, (spec.categoryCounts.get(cat) ?? 0) + 1);
                    const sub = String(r.sub_slug || '').toLowerCase();
                    if (sub !== '') spec.subcategoryCounts.set(sub, (spec.subcategoryCounts.get(sub) ?? 0) + 1);
                }
            }
            const favs = await this.db.prepare(
                `SELECT user_id, keyword FROM user_keywords
                  WHERE user_id IN (${placeholders}) AND lower(keyword) LIKE 'fav:%'`
            ).bind(...batch).all<{ user_id: number; keyword: string }>();
            for (const f of (favs.results ?? []) as Array<{ user_id: number; keyword: string }>) {
                const spec = out.get(f.user_id);
                if (!spec) continue;
                const slug = String(f.keyword ?? '').slice(4).trim().toLowerCase();
                if (slug !== '' && !spec.explicitFavs.includes(slug)) spec.explicitFavs.push(slug);
            }
        }
        return out;
    }

    /** Blocked user ids in EITHER direction for one user (hard eligibility). */
    async loadBlockedIds(userId: number): Promise<Set<number>> {
        const res = await this.db.prepare(
            `SELECT blocked_id AS id FROM user_blocks WHERE blocker_id = ?
              UNION
             SELECT blocker_id AS id FROM user_blocks WHERE blocked_id = ?`
        ).bind(userId, userId).all<{ id: number }>();
        return new Set(((res.results ?? []) as Array<{ id: number }>).map((r) => r.id));
    }

    /** Followed user ids for one user. */
    async loadFollowingIds(userId: number): Promise<Set<number>> {
        const res = await this.db.prepare(
            `SELECT following_id AS id FROM follows WHERE follower_id = ?`
        ).bind(userId).all<{ id: number }>();
        return new Set(((res.results ?? []) as Array<{ id: number }>).map((r) => r.id));
    }

    /** Users with a PENDING invitation for one competition (H3 conflict). */
    async loadPendingInviteeIds(competitionId: number): Promise<Set<number>> {
        const res = await this.db.prepare(
            `SELECT invitee_id AS id FROM competition_invitations WHERE competition_id = ? AND status = 'pending'`
        ).bind(competitionId).all<{ id: number }>();
        return new Set(((res.results ?? []) as Array<{ id: number }>).map((r) => r.id));
    }

    /** Users with a PENDING join request for one competition (H3 conflict). */
    async loadPendingRequesterIds(competitionId: number): Promise<Set<number>> {
        const res = await this.db.prepare(
            `SELECT requester_id AS id FROM competition_requests WHERE competition_id = ? AND status = 'pending'`
        ).bind(competitionId).all<{ id: number }>();
        return new Set(((res.results ?? []) as Array<{ id: number }>).map((r) => r.id));
    }

    /** Users who closed incoming competition requests (real permission). */
    async loadRequestsClosedIds(userIds: number[]): Promise<Set<number>> {
        const unique = [...new Set(userIds.filter((id) => Number.isInteger(id) && id > 0))];
        if (unique.length === 0) return new Set();
        const out = new Set<number>();
        for (let i = 0; i < unique.length; i += 80) {
            const batch = unique.slice(i, i + 80);
            const placeholders = batch.map(() => '?').join(',');
            const res = await this.db.prepare(
                `SELECT user_id AS id FROM user_settings WHERE user_id IN (${placeholders}) AND allow_requests = 0`
            ).bind(...batch).all<{ id: number }>();
            for (const r of (res.results ?? []) as Array<{ id: number }>) out.add(r.id);
        }
        return out;
    }

    /**
     * ALL active user ids (eligibility base for search/suggestions).
     * No LIMIT, no cap — callers freeze the full set at T0.
     */
    async findAllActiveUserIds(): Promise<number[]> {
        const res = await this.db.prepare(
            `SELECT id FROM users WHERE is_active = 1`
        ).all<{ id: number }>();
        return ((res.results ?? []) as Array<{ id: number }>).map((r) => r.id);
    }
}

export default UserSignalsModel;
