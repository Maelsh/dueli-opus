/**
 * Recommendation Model
 * نموذج التوصيات
 *
 * R3-GUEST-1: the guest suggestion queries live here — never inline in the
 * Controller (MVC, same rule #75 enforced for Explore).
 *
 * Scoring is byte-identical to the legacy guest branch it replaces: language
 * match 25, views × 0.01, recency tiers 10/7/4/1d/3d/7d (constants sourced
 * from RecommendationEngine — H7 coefficients stay OPEN, these current values
 * are pinned by tests and must not drift silently). What changes is ONLY the
 * eligible set: every PUBLIC competition instead of completed-with-video
 * alone — pending/accepted (waiting/appointment cards) and live join the
 * completed-with-playable-recording slice per the 05 §4 public table.
 * Suspended/cancelled/archived stay excluded, and completed rows WITHOUT a
 * playable recording stay out of the rail (watchability preserved: nothing
 * is presented as watchable-but-broken, and scarcity is never patched by
 * repeating rows). D1 later swaps the provider; this store is reused as-is.
 *
 * No `#private` fields (Cloudflare Workers compat).
 */
import { RecommendationEngine } from '../lib/services/RecommendationEngine';
import type { ResultSessionProvider } from '../lib/services/ExploreSessionService';
import type { CompetitionWithDetails } from './CompetitionModel';

/** Session surface for the Home «مقترح لك» guest rail (D1 reuses the store). */
export const SUGGESTED_GUEST_SURFACE = 'suggested_guest';

export interface GuestSuggestedRow {
    id: number;
    title: string;
    status: string;
    vod_url: string | null;
    category_name: string;
    category_slug: string;
    category_icon: string;
    category_color: string;
    creator_username: string;
    creator_name: string;
    creator_avatar: string;
    score: number;
    [key: string]: unknown;
}

export class RecommendationModel {
    protected readonly db: D1Database;

    constructor(db: D1Database) {
        this.db = db;
    }

    /**
     * Public suggested set, shared by the offset listing and the frozen
     * session build alike — one predicate, never two definitions of
     * “eligible”.
     */
    static readonly PUBLIC_SUGGESTED_WHERE = `(
        c.status IN ('pending', 'accepted', 'live')
        OR (c.status = 'completed' AND c.vod_url IS NOT NULL)
    )`;

    /**
     * Live per-row re-check mirroring PUBLIC_SUGGESTED_WHERE (rows deleted
     * after T0 never reach here — they are absent from hydration).
     */
    static isPublicSuggested(row: { status: string; vod_url?: string | null }): boolean {
        if (row.status === 'pending' || row.status === 'accepted' || row.status === 'live') return true;
        if (row.status === 'completed') {
            return row.vod_url !== null && row.vod_url !== undefined && row.vod_url !== '';
        }
        return false;
    }

    /** Score expression — identical arithmetic to the legacy guest branch. */
    private scoreExpression(): string {
        return `CASE WHEN c.language = ? THEN ${RecommendationEngine.WEIGHT_LANGUAGE_MATCH} ELSE 0 END`
            + ` + COALESCE(c.total_views, 0) * ${RecommendationEngine.VIEW_POPULARITY_FACTOR}`
            + ` + CASE WHEN c.created_at > datetime('now', '-${RecommendationEngine.RECENCY_RECENT_DAYS} day') THEN ${RecommendationEngine.WEIGHT_RECENCY_MAX}`
            + ` WHEN c.created_at > datetime('now', '-${RecommendationEngine.RECENCY_MODERATE_DAYS} days') THEN ${RecommendationEngine.WEIGHT_RECENCY_MODERATE}`
            + ` WHEN c.created_at > datetime('now', '-${RecommendationEngine.RECENCY_WEAK_DAYS} days') THEN ${RecommendationEngine.WEIGHT_RECENCY_WEAK}`
            + ` ELSE 0 END`;
    }

    private nameColumn(lang: string): string {
        return lang === 'ar' ? 'name_ar' : 'name_en';
    }

    /**
     * Guest suggestion page — same row shape as the legacy branch
     * (c.* + category/creator aliases + score), widened eligible set.
     * `lang` must be normalized ('ar' | anything-else-is-'en') by the caller.
     */
    async findGuestSuggestedPage(lang: string, limit: number, offset: number): Promise<GuestSuggestedRow[]> {
        const column = this.nameColumn(lang);
        const result = await this.db.prepare(`
            SELECT c.*,
                   cat.${column} as category_name,
                   cat.slug as category_slug,
                   cat.icon as category_icon,
                   cat.color as category_color,
                   u.username as creator_username,
                   u.display_name as creator_name,
                   u.avatar_url as creator_avatar,
                   ${this.scoreExpression()}
                   as score
            FROM competitions c
            JOIN categories cat ON c.category_id = cat.id
            JOIN users u ON c.creator_id = u.id
            WHERE ${RecommendationModel.PUBLIC_SUGGESTED_WHERE}
            ORDER BY score DESC, c.created_at DESC, c.id ASC
            LIMIT ? OFFSET ?
        `).bind(lang, limit, offset).all<GuestSuggestedRow>();
        return (result.results || []) as GuestSuggestedRow[];
    }

    /** Full ordered id set for a frozen session — no LIMIT, no total cap. */
    async findGuestSuggestedIds(lang: string): Promise<number[]> {
        const result = await this.db.prepare(`
            SELECT c.id as id
            FROM competitions c
            JOIN categories cat ON c.category_id = cat.id
            JOIN users u ON c.creator_id = u.id
            WHERE ${RecommendationModel.PUBLIC_SUGGESTED_WHERE}
            ORDER BY ${this.scoreExpression()} DESC, c.created_at DESC, c.id ASC
        `).bind(lang).all<{ id: number }>();
        return (result.results || []).map((row) => row.id);
    }

    async countGuestSuggested(): Promise<number> {
        const row = await this.db.prepare(`
            SELECT COUNT(*) as total FROM competitions c
            WHERE ${RecommendationModel.PUBLIC_SUGGESTED_WHERE}
        `).first<{ total: number }>();
        return row?.total || 0;
    }
}

/**
 * R3-GUEST-1 provider: the guest rail freezes the CURRENT scored order once
 * (same weights as the listing — the freeze replaces per-batch LIMIT/OFFSET
 * over a live score, it never re-tunes ranking). Context is the normalized
 * request language only: it selects the category column AND scores the
 * language match, so a language switch separates sessions.
 */
export class GuestSuggestedProvider implements ResultSessionProvider {
    readonly surface = SUGGESTED_GUEST_SURFACE;

    contextKey(): string {
        return 'suggested:guest:v1';
    }

    async buildOrderedIds(db: D1Database, lang: string): Promise<number[]> {
        return new RecommendationModel(db).findGuestSuggestedIds(lang);
    }

    isEligible(row: CompetitionWithDetails): boolean {
        const status = String(row.status);
        const record = row as CompetitionWithDetails & { vod_url?: string | null };
        return RecommendationModel.isPublicSuggested({ status, vod_url: record.vod_url ?? null });
    }
}

export default RecommendationModel;
