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
     *
     * R3-RAILS-1A: the completed branch requires a PLAYABLE recording per the
     * current media contract (competition-page renders `youtube_video_url`
     * first, then the chunk/VOD player): a trimmed non-empty `vod_url` OR a
     * trimmed non-empty `youtube_video_url`. NULL/empty/whitespace-only is
     * unready and stays out of every Suggested/Recorded rail — scarcity is
     * never patched by repeating rows or by showing an unplayable card.
     */
    static readonly PUBLIC_SUGGESTED_WHERE = `(
        c.status IN ('pending', 'accepted', 'live')
        OR (c.status = 'completed' AND (NULLIF(TRIM(c.vod_url), '') IS NOT NULL OR NULLIF(TRIM(c.youtube_video_url), '') IS NOT NULL))
    )`;

    /**
     * Status slice inside the public set (Home main tabs). The empty slice
     * keeps the legacy whole-public-set contract used by the offset listing
     * and the #76 status-less session.
     */
    static statusSliceWhere(status: string): string {
        if (status === 'live') return `AND c.status = 'live'`;
        if (status === 'upcoming') return `AND c.status IN ('pending', 'accepted')`;
        if (status === 'recorded') return `AND c.status = 'completed'`;
        return '';
    }

    /**
     * Live per-row re-check mirroring PUBLIC_SUGGESTED_WHERE (rows deleted
     * after T0 never reach here — they are absent from hydration).
     *
     * R3-RAILS-1A: `status` narrows the check to one Home tab slice;
     * playable-recording mirrors the SQL above (either media column).
     */
    static isPublicSuggested(
        row: { status: string; vod_url?: string | null; youtube_video_url?: string | null },
        status = ''
    ): boolean {
        const s = row.status;
        let inSlice: boolean;
        if (status === 'live') {
            inSlice = s === 'live';
        } else if (status === 'upcoming') {
            inSlice = s === 'pending' || s === 'accepted';
        } else if (status === 'recorded') {
            inSlice = s === 'completed' && RecommendationModel.hasPlayableRecording(row);
        } else {
            inSlice =
                s === 'pending' || s === 'accepted' || s === 'live' ||
                (s === 'completed' && RecommendationModel.hasPlayableRecording(row));
        }
        return inSlice;
    }

    /**
     * R3-RAILS-1A: playable-recording predicate shared by every rail
     * (SQL above is the store-side mirror; this is the row-side mirror).
     */
    static hasPlayableRecording(row: { vod_url?: string | null; youtube_video_url?: string | null }): boolean {
        const vod = typeof row.vod_url === 'string' ? row.vod_url.trim() : '';
        if (vod !== '') return true;
        const yt = typeof row.youtube_video_url === 'string' ? row.youtube_video_url.trim() : '';
        return yt !== '';
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
        return this.findGuestSuggestedIdsForStatus(lang, '');
    }

    /**
     * R3-RAILS-1A: full ordered id set for ONE Home tab slice.
     * Same scoring weights, same public predicate — the status slice is the
     * only narrowing (live=live, upcoming=pending+accepted,
     * recorded=completed+playable via the shared WHERE). No LIMIT, no cap:
     * the session service freezes the whole qualified set at T0.
     */
    async findGuestSuggestedIdsForStatus(lang: string, status: string): Promise<number[]> {
        const slice = RecommendationModel.statusSliceWhere(status);
        const result = await this.db.prepare(`
            SELECT c.id as id
            FROM competitions c
            JOIN categories cat ON c.category_id = cat.id
            JOIN users u ON c.creator_id = u.id
            WHERE ${RecommendationModel.PUBLIC_SUGGESTED_WHERE}
            ${slice}
            ORDER BY ${this.scoreExpression()} DESC, c.created_at DESC, c.id ASC
        `).bind(lang).all<{ id: number }>();
        return (result.results || []).map((row) => row.id);
    }

    /**
     * R3-RAILS-1A: full ordered id set for the logged-in Suggested rail.
     * Same pinned scoring arithmetic as the guest rail (H7 coefficients stay
     * OPEN — no new ranking is invented here); the user identity only
     * NARROWS the set: own competitions, both directions of blocks, and
     * explicitly hidden competitions never enter the snapshot. Exclusion
     * lists are loaded by the caller (the rail provider) so build-time and
     * read-time re-checks share one source.
     */
    async findUserSuggestedIdsForStatus(
        lang: string,
        status: string,
        exclusions: { excludeCreatorIds: number[]; excludeCompetitionIds: number[]; excludeOwnId: number | null }
    ): Promise<number[]> {
        const slice = RecommendationModel.statusSliceWhere(status);
        const params: number[] = [];
        let extra = '';
        const own = exclusions.excludeOwnId;
        const creators = [...new Set(exclusions.excludeCreatorIds.filter((id) => Number.isInteger(id) && id > 0))];
        const competitions = [...new Set(exclusions.excludeCompetitionIds.filter((id) => Number.isInteger(id) && id > 0))];
        if (typeof own === 'number' && Number.isInteger(own) && own > 0) {
            extra += ` AND c.creator_id != ?`;
            params.push(own);
        }
        if (creators.length > 0) {
            extra += ` AND c.creator_id NOT IN (${creators.map(() => '?').join(',')})`;
            params.push(...creators);
        }
        if (competitions.length > 0) {
            extra += ` AND c.id NOT IN (${competitions.map(() => '?').join(',')})`;
            params.push(...competitions);
        }
        // Positional binding follows TEXTUAL placeholder order: the WHERE
        // exclusions precede the scoring expression's lang placeholder in
        // ORDER BY — binding lang first would shift every exclusion.
        const result = await this.db.prepare(`
            SELECT c.id as id
            FROM competitions c
            JOIN categories cat ON c.category_id = cat.id
            JOIN users u ON c.creator_id = u.id
            WHERE ${RecommendationModel.PUBLIC_SUGGESTED_WHERE}
            ${slice}
            ${extra}
            ORDER BY ${this.scoreExpression()} DESC, c.created_at DESC, c.id ASC
        `).bind(...params, lang).all<{ id: number }>();
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
        const record = row as CompetitionWithDetails & { vod_url?: string | null; youtube_video_url?: string | null };
        return RecommendationModel.isPublicSuggested(
            { status, vod_url: record.vod_url ?? null, youtube_video_url: record.youtube_video_url ?? null }
        );
    }
}

export default RecommendationModel;
