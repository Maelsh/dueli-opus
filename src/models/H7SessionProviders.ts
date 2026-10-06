/**
 * H7 Session Providers — similar competitions (R3-D1 h7-v1).
 * مزودات الجلسات المعتمدة للمشابهات
 *
 * Same shared session store (ExploreSessionService + chunks + cursor).
 * No parallel engine, no new tables. Eligibility first, then H7 ordering,
 * frozen once at T0.
 */

import type { ResultSessionProvider } from '../lib/services/ExploreSessionService';
import { CompetitionModel, type CompetitionWithDetails } from './CompetitionModel';
import { RecommendationModel } from './RecommendationModel';
import { H7SignalsModel } from './H7SignalsModel';
import { h7ApplyDiscoveryDiversity, h7OrderScored, h7SimilarScore } from '../lib/services/H7RankingService';
import { h7RecencyOf } from '../lib/services/H7RankingPolicy';
import { H7_POLICY_VERSION } from '../lib/services/H7RankingPolicy';

/** Session surface for competition similar rails/cards. */
export const SIMILAR_SURFACE = 'similar_competitions';

function similarContextKey(refId: number, lang: string, identityKind: 'user' | 'guest'): string {
    return JSON.stringify(['similar', refId, lang, identityKind, H7_POLICY_VERSION]);
}

/**
 * Similar competitions provider (§4 weights: topic 45, text 15, lang 10,
 * country 5, Q 15, recency 10). Reference excluded, text similarity from
 * existing title/category only (no embeddings/service). Eligibility:
 * public suggested set + caller blocks narrowed; recorded slice requires
 * a playable recording.
 */
export class SimilarCompetitionProvider implements ResultSessionProvider {
    readonly surface = SIMILAR_SURFACE;
    private readonly refId: number;
    private readonly lang: string;
    private readonly userId: number | null;
    private readonly excludedCreatorIds: number[];

    constructor(options: { refId: number; lang: string; userId: number | null; excludedCreatorIds: number[] }) {
        this.refId = options.refId;
        this.lang = options.lang;
        this.userId = options.userId;
        this.excludedCreatorIds = [...options.excludedCreatorIds];
    }

    contextKey(): string {
        return similarContextKey(this.refId, this.lang, this.userId === null ? 'guest' : 'user');
    }

    async buildOrderedIds(db: D1Database, lang: string): Promise<number[]> {
        const signals = new H7SignalsModel(db);
        const refRows = await signals.loadCompetitions([this.refId]);
        const ref = refRows[0];
        if (!ref) return [];
        // Eligible pool: full public set (all statuses, playable-gated for
        // completed) minus reference minus blocked creators. No LIMIT/cap.
        const pool = await db
            .prepare(
                `SELECT c.id AS id FROM competitions c
                 WHERE ${RecommendationModel.PUBLIC_SUGGESTED_WHERE} AND c.id != ?`
            )
            .bind(this.refId)
            .all<{ id: number }>();
        let ids = ((pool.results ?? []) as Array<{ id: number }>).map((r) => r.id);
        if (this.excludedCreatorIds.length > 0) {
            const rows = await new CompetitionModel(db).findByIds(ids);
            const blocked = new Set(this.excludedCreatorIds);
            ids = rows.filter((r) => !blocked.has(r.creator_id)).map((r) => r.id);
        }
        if (ids.length === 0) return [];
        const rows = await signals.loadCompetitions(ids);
        const ctx = await signals.loadViewerContext(db, this.userId, lang, null);
        const nowMs = Date.now();
        const scored = rows.map((r) => ({
            id: r.id,
            score: h7SimilarScore({ ...r, nowMs }, ref, ctx),
            recency: h7RecencyOf({ ...r }, nowMs),
            row: r,
        }));
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
        const rank = new Map(diverse.map((d, i) => [d.id, i] as [number, number]));
        return diverse.map((d) => d.id).sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
    }

    isEligible(row: CompetitionWithDetails): boolean {
        if (row.id === this.refId) return false;
        if (this.excludedCreatorIds.includes(row.creator_id)) return false;
        const record = row as CompetitionWithDetails & { vod_url?: string | null; youtube_video_url?: string | null };
        return RecommendationModel.isPublicSuggested(
            { status: String(row.status), vod_url: record.vod_url ?? null, youtube_video_url: record.youtube_video_url ?? null },
            ''
        );
    }
}

export function similarContextFor(refId: number, lang: string, identityKind: 'user' | 'guest'): string {
    return similarContextKey(refId, lang, identityKind);
}
