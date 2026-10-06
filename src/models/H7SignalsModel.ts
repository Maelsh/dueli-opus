/**
 * H7 Signals Model — SQL lives here (MVC).
 * نموذج إشارات الترتيب
 *
 * Batch loaders for h7-v1 scoring. All SQL lives in this model file;
 * pure arithmetic lives in H7RankingPolicy. No scoring weights are
 * invented here — only data access.
 *
 * Signal integrity (§11 + task SIGNAL INTEGRITY):
 * - S: SUM of effective ratings rows per competition (one effective row
 *   per (competition,user,competitor) via RatingModel.rateLiveAtomic).
 * - V: competitions.total_views under the H2 invariant — exactly one
 *   writer: WatchService.recordWatchIntent, and only when a new
 *   (competition, identity, UTC-day) row is created in
 *   `competition_views` (CompetitionModel.incrementViews is its private
 *   counter step, never called elsewhere). `POST /api/analytics/view`
 *   is a thin compat alias delegating to the same SSOT (idempotent,
 *   counted-once); the dead `RecommendationEngine.recordView` bypass was
 *   deleted in R3-D1-REM1. GET/polling/presence never write; no IP
 *   fingerprint; guests use first-party tokens only.
 * - Likes/Dislikes: effective rows in likes/dislikes + cached counters
 *   competitions.likes_count/dislikes_count (same-transaction recompute).
 * - Follows: follows table. Preferences: namespaced user_keywords favs
 *   (see below). History: watch_history (H1 SSOT) + competition_views day
 *   grain is NOT history (guest/day grain must not define unwatched).
 * - Explicit favs storage (DOCUMENTED routine detail, no new migration):
 *   user_keywords rows with keyword LIKE 'fav:%' hold taxonomy slugs
 *   chosen in Settings (parent or subcategory slug, lowercase). The
 *   `fav:` namespace is reserved for H7SignalsModel.setFavoriteSlugs:
 *   title-word extraction skips colon words and search recording drops
 *   `fav:`-prefixed input, so generic writers can never mint explicit
 *   favorites (R3-D1-REM1).
 */

import { BaseModel } from './base/BaseModel';

export interface H7CompetitionSignals {
    id: number;
    status: string;
    language: string | null;
    country: string | null;
    category_slug: string | null;
    subcategory_slug: string | null;
    category_id: number | null;
    subcategory_id: number | null;
    creator_id: number;
    opponent_id: number | null;
    total_views: number;
    likes_count: number;
    dislikes_count: number;
    stars_sum: number;
    title: string;
    description: string | null;
    created_at: string | null;
    started_at: string | null;
    stream_started_at: string | null;
    scheduled_at: string | null;
    ended_at: string | null;
    stream_ended_at: string | null;
    vod_url: string | null;
    youtube_video_url: string | null;
}

export interface H7ViewerContext {
    userId: number | null;
    language: string | null;
    country: string | null;
    followingIds: number[];
    watchedIds: number[];
    explicitFavs: string[];
    likedCategoryCounts: Map<string, number>;
    watchedCategoryCounts: Map<string, number>;
    participationCategoryCounts: Map<string, number>;
}

const FAV_PREFIX = 'fav:';

/**
 * R3-D2 actual-participation predicate (SSOT — Owner 08: "competitions
 * actually participated in", never bare rows/invites/requests).
 *
 * Proven against the lifecycle (CompetitionModel): `startLive` is the SOLE
 * writer of `started_at` repo-wide, guarded `accepted → live`; `complete`
 * is the sole writer of `ended_at`, guarded `live → completed`; there is
 * no cancelled-status writer (suspension keeps `started_at` intact).
 * Therefore `started_at IS NOT NULL` ⟺ both sides actually entered the
 * contest: pending / accepted-never-started / suspended-before-start stay
 * out; live-started, completed-started — and suspended/archived-after-start
 * — count, by meaning, not by status name.
 */
export const ACTUAL_PARTICIPATION_WHERE = `started_at IS NOT NULL`;

export function h7FavKeyword(slug: string): string {
    return `${FAV_PREFIX}${slug.trim().toLowerCase()}`;
}

export function h7IsFavKeyword(keyword: string): boolean {
    return keyword.toLowerCase().startsWith(FAV_PREFIX);
}

export function h7FavSlug(keyword: string): string {
    return keyword.slice(FAV_PREFIX.length).trim().toLowerCase();
}

export class H7SignalsModel extends BaseModel<{ id: number }> {
    protected readonly tableName = 'competitions';

    async create(): Promise<{ id: number }> {
        throw new Error('H7SignalsModel is read-only (no create)');
    }

    async update(): Promise<{ id: number } | null> {
        throw new Error('H7SignalsModel is read-only (no update)');
    }

    /**
     * Load full H7 signal rows for an explicit id set (batched, order
     * unspecified — callers re-order against their frozen snapshot).
     * Stars come from the live ratings aggregate (effective rows only).
     */
    async loadCompetitions(ids: number[]): Promise<H7CompetitionSignals[]> {
        const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
        if (unique.length === 0) return [];
        const out: H7CompetitionSignals[] = [];
        for (let i = 0; i < unique.length; i += 80) {
            const batch = unique.slice(i, i + 80);
            const placeholders = batch.map(() => '?').join(',');
            const rows = await this.query<H7CompetitionSignals & { stars_sum: number | null }>(
                `SELECT c.id, c.status, c.language, c.country,
                    cat.slug AS category_slug, subcat.slug AS subcategory_slug,
                    c.category_id, c.subcategory_id, c.creator_id, c.opponent_id,
                    COALESCE(c.total_views, 0) AS total_views,
                    COALESCE(c.likes_count, 0) AS likes_count,
                    COALESCE(c.dislikes_count, 0) AS dislikes_count,
                    COALESCE((SELECT SUM(r.rating) FROM ratings r WHERE r.competition_id = c.id), 0) AS stars_sum,
                    c.title, c.description, c.created_at, c.started_at, c.stream_started_at,
                    c.scheduled_at, c.ended_at, c.stream_ended_at, c.vod_url, c.youtube_video_url
                 FROM competitions c
                 JOIN categories cat ON c.category_id = cat.id
                 LEFT JOIN categories subcat ON c.subcategory_id = subcat.id
                 WHERE c.id IN (${placeholders})`,
                ...batch
            );
            for (const r of rows) {
                out.push({
                    ...r,
                    language: r.language ?? null,
                    country: r.country ?? null,
                    total_views: Number(r.total_views ?? 0) || 0,
                    likes_count: Number(r.likes_count ?? 0) || 0,
                    dislikes_count: Number(r.dislikes_count ?? 0) || 0,
                    stars_sum: Number(r.stars_sum ?? 0) || 0,
                });
            }
        }
        return out;
    }

    /**
     * Viewer context for scoring. Guest => userId null + empty vectors
     * (language/country come from the request content language; an unknown
     * session-wide signal is dropped + redistributed by the service, never
     * fabricated).
     */
    async loadViewerContext(
        db: D1Database,
        userId: number | null,
        fallbackLang: string | null,
        fallbackCountry: string | null
    ): Promise<H7ViewerContext> {
        if (userId === null || !Number.isInteger(userId) || userId <= 0) {
            return {
                userId: null,
                language: fallbackLang,
                country: fallbackCountry,
                followingIds: [],
                watchedIds: [],
                explicitFavs: [],
                likedCategoryCounts: new Map(),
                watchedCategoryCounts: new Map(),
                participationCategoryCounts: new Map(),
            };
        }
        const user = await db
            .prepare('SELECT language, country FROM users WHERE id = ?')
            .bind(userId)
            .first<{ language: string | null; country: string | null }>();
        const follows = await db
            .prepare('SELECT following_id AS id FROM follows WHERE follower_id = ?')
            .bind(userId)
            .all<{ id: number }>();
        const watched = await db
            .prepare('SELECT competition_id AS id FROM watch_history WHERE user_id = ?')
            .bind(userId)
            .all<{ id: number }>();
        const favRows = await db
            .prepare("SELECT keyword FROM user_keywords WHERE user_id = ? AND lower(keyword) LIKE 'fav:%'")
            .bind(userId)
            .all<{ keyword: string }>();
        const liked = await db
            .prepare(
                `SELECT cat.slug AS slug, COUNT(*) AS n FROM likes l
                 JOIN competitions c ON l.competition_id = c.id
                 JOIN categories cat ON c.category_id = cat.id
                 WHERE l.user_id = ? GROUP BY cat.slug`
            )
            .bind(userId)
            .all<{ slug: string; n: number }>();
        const watchedCats = await db
            .prepare(
                `SELECT cat.slug AS slug, COUNT(*) AS n FROM watch_history wh
                 JOIN competitions c ON wh.competition_id = c.id
                 JOIN categories cat ON c.category_id = cat.id
                 WHERE wh.user_id = ? GROUP BY cat.slug`
            )
            .bind(userId)
            .all<{ slug: string; n: number }>();
        const partCats = await db
            .prepare(
                `SELECT cat.slug AS slug, COUNT(*) AS n FROM competitions c
                 JOIN categories cat ON c.category_id = cat.id
                 WHERE (c.creator_id = ? OR c.opponent_id = ?) AND c.${ACTUAL_PARTICIPATION_WHERE}
                 GROUP BY cat.slug`
            )
            .bind(userId, userId)
            .all<{ slug: string; n: number }>();
        const toMap = (rows: Array<{ slug: string; n: number }>): Map<string, number> => {
            const m = new Map<string, number>();
            for (const r of rows ?? []) {
                if (typeof r.slug === 'string' && r.slug !== '') m.set(r.slug.toLowerCase(), Number(r.n) || 0);
            }
            return m;
        };
        return {
            userId,
            language: user?.language ?? fallbackLang,
            country: user?.country ?? fallbackCountry,
            followingIds: ((follows.results ?? []) as Array<{ id: number }>)
                .map((r) => r.id)
                .filter((id) => Number.isInteger(id) && id > 0),
            watchedIds: ((watched.results ?? []) as Array<{ id: number }>)
                .map((r) => r.id)
                .filter((id) => Number.isInteger(id) && id > 0),
            explicitFavs: ((favRows.results ?? []) as Array<{ keyword: string }>)
                .map((r) => h7FavSlug(String(r.keyword ?? '')))
                .filter((s) => s !== ''),
            likedCategoryCounts: toMap((liked.results ?? []) as Array<{ slug: string; n: number }>),
            watchedCategoryCounts: toMap((watchedCats.results ?? []) as Array<{ slug: string; n: number }>),
            participationCategoryCounts: toMap((partCats.results ?? []) as Array<{ slug: string; n: number }>),
        };
    }

    /**
     * Explicit favorites persistence (Settings choice on the taxonomy).
     * Slugs only — translated names are never identifiers. Unknown slugs
     * are rejected by the caller (422 upstream), never widened to All.
     */
    async getFavoriteSlugs(userId: number): Promise<string[]> {
        const rows = await this.query<{ keyword: string }>(
            "SELECT keyword FROM user_keywords WHERE user_id = ? AND lower(keyword) LIKE 'fav:%'",
            userId
        );
        return rows.map((r) => h7FavSlug(String(r.keyword ?? ''))).filter((s) => s !== '');
    }

    async setFavoriteSlugs(userId: number, slugs: string[]): Promise<string[]> {
        const clean = [...new Set(slugs.map((s) => s.trim().toLowerCase()).filter((s) => s !== ''))].slice(0, 60);
        await this.db.prepare("DELETE FROM user_keywords WHERE user_id = ? AND lower(keyword) LIKE 'fav:%'").bind(userId).run();
        for (const slug of clean) {
            await this.db
                .prepare('INSERT OR IGNORE INTO user_keywords (user_id, keyword, weight, updated_at) VALUES (?, ?, 1.0, datetime(\'now\'))')
                .bind(userId, h7FavKeyword(slug))
                .run();
        }
        return clean;
    }

    /**
     * Per-competitor Profile aggregates: SUM effective stars + ACTUAL
     * participations (R3-D2 SSOT — Owner formula in 08/11:
     * Profile = SUM stars / number of competitions actually contested).
     *
     * Denominator rule (ACTUAL_PARTICIPATION_WHERE): a competition counts
     * only when it actually started (`started_at IS NOT NULL` — the sole
     * lifecycle marker written by `startLive`). Bare pendings, accepted-
     * never-started rows, and suspended-before-start rows never count, even
     * with an opponent set; invitations/requests are not competitions at
     * all. Creator and opponent sides both count once. Ratings SUM counts
     * effective rows of started competitions only (live-only writes via
     * rateLiveAtomic, one per rater/competitor/competition).
     */
    async loadProfiles(userIds: number[]): Promise<Map<number, { sum: number; count: number }>> {
        const unique = [...new Set(userIds.filter((id) => Number.isInteger(id) && id > 0))];
        const out = new Map<number, { sum: number; count: number }>();
        if (unique.length === 0) return out;
        for (let i = 0; i < unique.length; i += 80) {
            const batch = unique.slice(i, i + 80);
            const placeholders = batch.map(() => '?').join(',');
            const sums = await this.query<{ competitor_id: number; s: number }>(
                `SELECT r.competitor_id AS competitor_id, SUM(r.rating) AS s FROM ratings r
                  JOIN competitions c ON r.competition_id = c.id
                 WHERE r.competitor_id IN (${placeholders}) AND c.${ACTUAL_PARTICIPATION_WHERE}
                 GROUP BY r.competitor_id`,
                ...batch
            );
            const counts = await this.query<{ uid: number; n: number }>(
                `SELECT u AS uid, COUNT(*) AS n FROM (
                     SELECT creator_id AS u FROM competitions WHERE creator_id IN (${placeholders}) AND ${ACTUAL_PARTICIPATION_WHERE}
                     UNION ALL
                     SELECT opponent_id AS u FROM competitions WHERE opponent_id IN (${placeholders}) AND ${ACTUAL_PARTICIPATION_WHERE}
                 ) WHERE u IS NOT NULL GROUP BY u`,
                ...batch,
                ...batch
            );
            const sumBy = new Map<number, number>();
            for (const r of sums) sumBy.set(r.competitor_id, Number(r.s) || 0);
            for (const r of counts) {
                out.set(r.uid, { sum: sumBy.get(r.uid) ?? 0, count: Number(r.n) || 0 });
            }
            for (const id of batch) {
                if (!out.has(id)) out.set(id, { sum: sumBy.get(id) ?? 0, count: 0 });
            }
        }
        return out;
    }
}

export default H7SignalsModel;
