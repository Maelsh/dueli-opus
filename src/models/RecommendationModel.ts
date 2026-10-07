/**
 * Recommendation Model
 * نموذج التوصيات
 *
 * R3-D1 (h7-v1): the guest suggestion queries live here — never inline in the
 * Controller (MVC, same rule #75 enforced for Explore).
 *
 * Ordering is the approved h7-v1 (H7RankingPolicy + H7RankingService over
 * H7SignalsModel rows): eligibility first (every PUBLIC competition —
 * pending/accepted/live + completed with a playable recording per 05 §4),
 * then H7 weights frozen once at T0. Suspended/cancelled/archived stay
 * excluded, and completed rows WITHOUT a playable recording stay out of
 * the rail (watchability preserved; scarcity never patched by repeats).
 * The legacy point weights are kept only as a commented reference
 * (scoreExpression, unused by ranking); D1 reuses this store as-is.
 *
 * No `#private` fields (Cloudflare Workers compat).
 */
import { RecommendationEngine } from '../lib/services/RecommendationEngine';
import type { ResultSessionProvider } from '../lib/services/ExploreSessionService';
import type { CompetitionWithDetails } from './CompetitionModel';
import { H7SignalsModel } from './H7SignalsModel';
import { h7ApplyDiscoveryDiversity, h7OrderScored, h7ScoreCard } from '../lib/services/H7RankingService';
import { h7RecencyOf } from '../lib/services/H7RankingPolicy';
import type { H7StatusBucket } from '../lib/services/H7RankingPolicy';

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

    /** Score expression — legacy pinned arithmetic (kept for reference only; D1 ranks via H7). */
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

    private static statusBucket(status: string): H7StatusBucket {
        if (status === 'live' || status === 'recorded' || status === 'upcoming') return status;
        return 'mixed';
    }

    /**
     * R3-D1 (h7-v1): order an eligible id set with the approved weights.
     * Eligibility (public predicate + status slice + exclusions) is applied
     * in SQL first; ranking happens here via H7RankingService, frozen once
     * at T0 with discovery/diversity. No LIMIT, no cap, no RANDOM.
     */
    private async h7OrderIds(
        eligibleIds: number[],
        lang: string,
        userId: number | null,
        bucket: H7StatusBucket
    ): Promise<{ ids: number[]; scores: Map<number, number> }> {
        if (eligibleIds.length === 0) return { ids: [], scores: new Map() };
        const signalsModel = new H7SignalsModel(this.db);
        const rows = await signalsModel.loadCompetitions(eligibleIds);
        const ctx = await signalsModel.loadViewerContext(this.db, userId, lang, null);
        const uids: number[] = [];
        for (const r of rows) {
            uids.push(r.creator_id);
            if (r.opponent_id !== null) uids.push(r.opponent_id);
        }
        const profiles = await signalsModel.loadProfiles(uids);
        const nowMs = Date.now();
        const identity = userId === null ? 'guest' : 'user';
        const scored = rows.map((r) => {
            const { score } = h7ScoreCard({ ...r, nowMs }, ctx, identity, bucket, profiles);
            return { id: r.id, score, recency: h7RecencyOf({ ...r }, nowMs), row: r };
        });
        const ordered = h7OrderScored(scored);
        const diverse = h7ApplyDiscoveryDiversity(
            ordered.map((s) => ({
                id: s.id,
                creator_id: s.row.creator_id,
                opponent_id: s.row.opponent_id,
                created_at: s.row.created_at,
                total_views: s.row.total_views,
            })),
            nowMs
        );
        const scoreById = new Map(ordered.map((s) => [s.id, s.score] as [number, number]));
        const orderRank = new Map(diverse.map((d, i) => [d.id, i] as [number, number]));
        const finalIds = [...diverse.map((d) => d.id)].sort((a, b) => {
            // Diverse order is authoritative; keep it (already discovery-ordered).
            return (orderRank.get(a) ?? 0) - (orderRank.get(b) ?? 0);
        });
        // Re-sort scored by diverse sequence: diverse array IS the final order.
        return { ids: finalIds, scores: scoreById };
    }

    private async eligibleGuestIds(status: string): Promise<number[]> {
        const slice = RecommendationModel.statusSliceWhere(status);
        const result = await this.db.prepare(`
            SELECT c.id as id
            FROM competitions c
            JOIN categories cat ON c.category_id = cat.id
            JOIN users u ON c.creator_id = u.id
            WHERE ${RecommendationModel.PUBLIC_SUGGESTED_WHERE}
            ${slice}
        `).all<{ id: number }>();
        return (result.results || []).map((row) => row.id);
    }

    /**
     * Guest suggestion page — H7-ordered (R3-D1). Same row shape as before
     * (c.* + category/creator aliases + score); the score is now h7-v1
     * (0–100). Paging slices the frozen H7 order so every eligible card
     * stays reachable until exhaustion.
     * `lang` must be normalized ('ar' | anything-else-is-'en') by the caller.
     */
    async findGuestSuggestedPage(lang: string, limit: number, offset: number): Promise<GuestSuggestedRow[]> {
        const column = this.nameColumn(lang);
        const eligible = await this.eligibleGuestIds('');
        const { ids, scores } = await this.h7OrderIds(eligible, lang, null, 'mixed');
        const pageIds = ids.slice(Math.max(0, offset), Math.max(0, offset) + Math.max(0, limit));
        if (pageIds.length === 0) return [];
        // D1 hotfix: hydrate in 80-id chunks so a large client limit can never
        // push one statement past D1's 100-bind hard limit. Order is restored
        // from pageIds via byId, so chunking is transparent.
        const byId = new Map<number, GuestSuggestedRow>();
        for (let i = 0; i < pageIds.length; i += 80) {
            const batch = pageIds.slice(i, i + 80);
            const placeholders = batch.map(() => '?').join(',');
            const result = await this.db.prepare(`
                SELECT c.*,
                       cat.${column} as category_name,
                       cat.slug as category_slug,
                       cat.icon as category_icon,
                       cat.color as category_color,
                       u.username as creator_username,
                       u.display_name as creator_name,
                       u.avatar_url as creator_avatar
                FROM competitions c
                JOIN categories cat ON c.category_id = cat.id
                JOIN users u ON c.creator_id = u.id
                WHERE c.id IN (${placeholders})
            `).bind(...batch).all<GuestSuggestedRow>();
            for (const row of (result.results || []) as GuestSuggestedRow[]) byId.set(row.id, row);
        }
        return pageIds
            .map((id) => byId.get(id))
            .filter((r): r is GuestSuggestedRow => !!r)
            .map((r) => ({ ...r, score: scores.get(r.id) ?? 0 }));
    }

    /** Full ordered id set for a frozen session — no LIMIT, no total cap. */
    async findGuestSuggestedIds(lang: string): Promise<number[]> {
        return this.findGuestSuggestedIdsForStatus(lang, '');
    }

    /**
     * R3-D1 (h7-v1): full ordered id set for ONE Home tab slice.
     * Same public predicate + status slice (live=live, upcoming=
     * pending+accepted, recorded=completed+playable); ORDER is h7-v1,
     * frozen once at T0. No LIMIT, no cap.
     */
    async findGuestSuggestedIdsForStatus(lang: string, status: string): Promise<number[]> {
        const eligible = await this.eligibleGuestIds(status);
        const { ids } = await this.h7OrderIds(eligible, lang, null, RecommendationModel.statusBucket(status));
        return ids;
    }

    /**
     * R3-D1 (h7-v1): full ordered id set for the logged-in Suggested rail.
     * Same H7 arithmetic as the guest rail; the user identity only NARROWS
     * the set (own, blocks, hidden) and ADDS personal signals (interests,
     * follows, history) via the viewer context.
     *
     * D1 hotfix: exclusions are enforced with NOT EXISTS anti-joins against
     * the source tables (user_blocks both directions, user_hidden_competitions)
     * instead of expanding the caller-loaded arrays into bound placeholders —
     * blocks/hides are unbounded user-controlled lists and the old NOT IN
     * form exceeded D1's 100-bind hard limit (rail 500). The anti-joins read
     * the same rows the loader reads, so NO exclusion is dropped at any list
     * size; the passed arrays remain the read-time re-check source in the
     * provider. Total binds: 4 regardless of exclusion volume.
     */
    async findUserSuggestedIdsForStatus(
        lang: string,
        status: string,
        exclusions: { excludeCreatorIds: number[]; excludeCompetitionIds: number[]; excludeOwnId: number | null }
    ): Promise<number[]> {
        const slice = RecommendationModel.statusSliceWhere(status);
        const params: Array<string | number> = [];
        let extra = '';
        const own = exclusions.excludeOwnId;
        const hasIdentity = typeof own === 'number' && Number.isInteger(own) && own > 0;
        if (hasIdentity) {
            extra += ` AND c.creator_id != ?`;
            params.push(own);
            extra += ` AND NOT EXISTS (
                SELECT 1 FROM user_blocks b
                 WHERE (b.blocker_id = ? AND b.blocked_id = c.creator_id)
                    OR (b.blocked_id = ? AND b.blocker_id = c.creator_id)
            )`;
            params.push(own, own);
            extra += ` AND NOT EXISTS (
                SELECT 1 FROM user_hidden_competitions h
                 WHERE h.user_id = ? AND h.competition_id = c.id
            )`;
            params.push(own);
        }
        const result = await this.db.prepare(`
            SELECT c.id as id
            FROM competitions c
            JOIN categories cat ON c.category_id = cat.id
            JOIN users u ON c.creator_id = u.id
            WHERE ${RecommendationModel.PUBLIC_SUGGESTED_WHERE}
            ${slice}
            ${extra}
        `).bind(...params).all<{ id: number }>();
        const eligible = (result.results || []).map((row) => row.id);
        const userId = typeof own === 'number' && Number.isInteger(own) && own > 0 ? own : null;
        const { ids } = await this.h7OrderIds(eligible, lang, userId, RecommendationModel.statusBucket(status));
        return ids;
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
