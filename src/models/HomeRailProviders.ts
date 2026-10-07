/**
 * Home Rail Providers — R3-RAILS-1A
 * مزودات صفوف الرئيسية
 *
 * One swappable seam per Home rail family on the SAME #75 result-session
 * store (ExploreSessionService + explore_result_sessions/chunks + opaque
 * cursor). No parallel browsing engine, no new tables, no new migrations:
 * a provider owns the canonical context, the FULL ordered id set at T0, and
 * the live per-row eligibility re-check. Chunks, cursor, TTL, identity
 * binding and hasMore semantics stay in the shared service, once.
 *
 * Canonical rail context (05 §8):
 *   kind/category/subcategory/status/language/identity/surface/policy-version
 * - live      = status 'live' (per the current media contract).
 * - upcoming  = pending + accepted (waiting/appointment cards). Guests SEE
 *   upcoming rails; seeing never grants invite/join actions (those stay
 *   behind their own auth guards, untouched here).
 * - recorded  = completed + a PLAYABLE recording per the current media
 *   contract (trimmed vod_url OR youtube_video_url — the competition page
 *   renders youtube_video_url first, then the chunk/VOD player). Completed
 *   rows without either are result-page rows, never rail cards; invalid,
 *   empty or unready recordings never enter a Recorded rail, and scarcity
 *   is never patched by repeating rows.
 *
 * Ordering (R3-D1 h7-v1 approved): Suggested Guest/User and every
 * category/subcategory rail rank with the approved H7 weights (§2),
 * frozen ONCE at T0 with the shared discovery/diversity pass — never
 * RANDOM() per batch. Continuation alone never closed Home; H7 does.
 *
 * No `#private` fields (Cloudflare Workers compat). SQL lives in the Models
 * (CompetitionModel / RecommendationModel); the exclusions loader below is
 * in this model file for the same reason.
 */

import {
    ExploreSessionService,
    type ResultSessionProvider,
} from '../lib/services/ExploreSessionService';
import {
    CompetitionModel,
    type CompetitionWithDetails,
} from './CompetitionModel';
import {
    RecommendationModel,
    SUGGESTED_GUEST_SURFACE,
} from './RecommendationModel';
import { H7SignalsModel } from './H7SignalsModel';
import { h7ApplyDiscoveryDiversity, h7OrderScored, h7ScoreCard } from '../lib/services/H7RankingService';
import { h7RecencyOf } from '../lib/services/H7RankingPolicy';
import type { H7StatusBucket } from '../lib/services/H7RankingPolicy';

/** Policy version pinned into every rail context (h7-v1 approved). */
export const RAIL_POLICY_VERSION = 'h7-v1';

/** Session surface for the logged-in Suggested rail (guest reuses #76's). */
export const HOME_SUGGESTED_USER_SURFACE = 'home_suggested_user';

/** Session surface for Dialogue/Science/Talents + every subcategory rail. */
export const HOME_CATEGORY_SURFACE = 'home_category';

export type HomeRailKind = 'suggested' | 'category';

export type HomeRailStatus = 'live' | 'recorded' | 'upcoming';

export interface CanonicalRailRequest {
    kind: HomeRailKind;
    category: string;
    subcategory: string;
    status: HomeRailStatus;
}

export interface RailExclusions {
    creatorIds: number[];
    competitionIds: number[];
    ownId: number | null;
}

const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function cleanSlug(value: unknown): string {
    return String(value ?? '').trim().toLowerCase().slice(0, 64);
}

/**
 * Canonicalize one rail request. Rejects unknown kinds/statuses and
 * malformed slugs (422 upstream); unknown-but-well-formed slugs yield an
 * empty rail, never an error.
 */
export function canonicalizeRailRequest(raw: {
    kind?: unknown;
    category?: unknown;
    subcategory?: unknown;
    status?: unknown;
}): { ok: true; value: CanonicalRailRequest } | { ok: false; error: string } {
    const kind = String(raw.kind ?? '').trim().toLowerCase();
    if (kind !== 'suggested' && kind !== 'category') {
        return { ok: false, error: 'kind must be suggested or category' };
    }
    const status = String(raw.status ?? '').trim().toLowerCase();
    if (status !== 'live' && status !== 'recorded' && status !== 'upcoming') {
        return { ok: false, error: 'status must be live, recorded or upcoming' };
    }
    const category = cleanSlug(raw.category);
    const subcategory = cleanSlug(raw.subcategory);
    if (kind === 'suggested') {
        if (category !== '' || subcategory !== '') {
            return { ok: false, error: 'suggested rails take no category filter' };
        }
    } else {
        if (category === '' || !SLUG_PATTERN.test(category)) {
            return { ok: false, error: 'category must be a valid slug' };
        }
        if (subcategory !== '' && !SLUG_PATTERN.test(subcategory)) {
            return { ok: false, error: 'subcategory must be a valid slug' };
        }
    }
    return {
        ok: true,
        value: {
            kind: kind as HomeRailKind,
            category,
            subcategory,
            status: status as HomeRailStatus,
        },
    };
}

/**
 * Caller-loaded exclusion sets for a logged-in rail identity. Blocks cover
 * both directions; hidden covers explicitly hidden competitions. Each query
 * is best-effort (a missing optional table yields [] — mirroring
 * RecommendationEngine.getHiddenCompetitionIds) so a rail build never 500s
 * on an environment without the optional table.
 */
export async function loadRailExclusions(db: D1Database, userId: number | null): Promise<RailExclusions> {
    if (typeof userId !== 'number' || !Number.isInteger(userId) || userId <= 0) {
        return { creatorIds: [], competitionIds: [], ownId: null };
    }
    const creatorIds: number[] = [];
    try {
        const rows = await db.prepare(`
            SELECT blocked_id AS id FROM user_blocks WHERE blocker_id = ?
            UNION
            SELECT blocker_id AS id FROM user_blocks WHERE blocked_id = ?
        `).bind(userId, userId).all<{ id: number }>();
        for (const row of rows.results ?? []) {
            if (typeof row.id === 'number' && Number.isInteger(row.id) && row.id > 0) creatorIds.push(row.id);
        }
    } catch {
        // Best-effort: the rail still builds; the snapshot simply cannot
        // narrow on blocks in this environment.
    }
    const competitionIds: number[] = [];
    try {
        const rows = await db.prepare(`
            SELECT competition_id AS id FROM user_hidden_competitions WHERE user_id = ?
        `).bind(userId).all<{ id: number }>();
        for (const row of rows.results ?? []) {
            if (typeof row.id === 'number' && Number.isInteger(row.id) && row.id > 0) competitionIds.push(row.id);
        }
    } catch {
        // Optional table — absence means nothing hidden.
    }
    return { creatorIds, competitionIds, ownId: userId };
}

type RailMediaRow = {
    status: string;
    vod_url?: string | null;
    youtube_video_url?: string | null;
};

function railMediaOf(row: CompetitionWithDetails): RailMediaRow {
    const record = row as CompetitionWithDetails & {
        vod_url?: string | null;
        youtube_video_url?: string | null;
    };
    return {
        status: String(row.status),
        vod_url: record.vod_url ?? null,
        youtube_video_url: record.youtube_video_url ?? null,
    };
}

/**
 * Category-scope mirror of CompetitionModel.findHomeRailIds: a parent slug
 * matches its own rows AND its children's rows (category_id OR
 * subcategory_id OR parent slug — same predicate as the listing), while a
 * subcategory slug matches only its own rows.
 */
export function matchesRailCategoryScope(
    row: CompetitionWithDetails,
    category: string,
    subcategory: string
): boolean {
    if (subcategory !== '') {
        return (
            row.subcategory_slug === subcategory ||
            String(row.subcategory_id ?? '') === subcategory
        );
    }
    if (category !== '') {
        return (
            row.category_slug === category ||
            String(row.category_id) === category ||
            String(row.subcategory_id ?? '') === category
        );
    }
    return true;
}

function railContextKey(parts: {
    kind: string;
    category: string;
    subcategory: string;
    status: string;
    lang: string;
    identityKind: 'user' | 'guest';
    surface: string;
}): string {
    return JSON.stringify([
        'rail',
        parts.kind,
        parts.category,
        parts.subcategory,
        parts.status,
        parts.lang,
        parts.identityKind,
        parts.surface,
        RAIL_POLICY_VERSION,
    ]);
}

/**
 * R3-D1 (h7-v1): status-aware Suggested provider for GUESTS.
 * Same public predicate as #76 — the Home tab status narrows the frozen
 * set (live / pending+accepted / completed+playable); ORDER is h7-v1.
 * The #76 status-less provider class is untouched for compatibility.
 */
export class SuggestedGuestRailProvider implements ResultSessionProvider {
    readonly surface = SUGGESTED_GUEST_SURFACE;
    private readonly status: HomeRailStatus;
    private readonly lang: string;

    constructor(status: HomeRailStatus, lang: string) {
        this.status = status;
        this.lang = lang;
    }

    contextKey(): string {
        return railContextKey({
            kind: 'suggested',
            category: '',
            subcategory: '',
            status: this.status,
            lang: this.lang,
            identityKind: 'guest',
            surface: this.surface,
        });
    }

    async buildOrderedIds(db: D1Database, lang: string): Promise<number[]> {
        return new RecommendationModel(db).findGuestSuggestedIdsForStatus(lang, this.status);
    }

    isEligible(row: CompetitionWithDetails): boolean {
        return RecommendationModel.isPublicSuggested(railMediaOf(row), this.status);
    }
}

/**
 * R3-D1 (h7-v1): Suggested provider for LOGGED-IN users.
 * H7 arithmetic (personal signals via the viewer context); the identity
 * also narrows: own competitions, both block directions, and hidden
 * competitions never enter the snapshot at build time, and newly
 * excluded rows are skipped-and-filled at read time.
 */
export class SuggestedUserRailProvider implements ResultSessionProvider {
    readonly surface = HOME_SUGGESTED_USER_SURFACE;
    private readonly status: HomeRailStatus;
    private readonly lang: string;
    private readonly exclusions: RailExclusions;

    constructor(status: HomeRailStatus, lang: string, exclusions: RailExclusions) {
        this.status = status;
        this.lang = lang;
        this.exclusions = exclusions;
    }

    contextKey(): string {
        return railContextKey({
            kind: 'suggested',
            category: '',
            subcategory: '',
            status: this.status,
            lang: this.lang,
            identityKind: 'user',
            surface: this.surface,
        });
    }

    async buildOrderedIds(db: D1Database, lang: string): Promise<number[]> {
        return new RecommendationModel(db).findUserSuggestedIdsForStatus(lang, this.status, {
            excludeCreatorIds: this.exclusions.creatorIds,
            excludeCompetitionIds: this.exclusions.competitionIds,
            excludeOwnId: this.exclusions.ownId,
        });
    }

    isEligible(row: CompetitionWithDetails): boolean {
        const own = this.exclusions.ownId;
        if (typeof own === 'number' && row.creator_id === own) return false;
        if (this.exclusions.creatorIds.includes(row.creator_id)) return false;
        if (this.exclusions.competitionIds.includes(row.id)) return false;
        return RecommendationModel.isPublicSuggested(railMediaOf(row), this.status);
    }
}

/**
 * R3-D1 (h7-v1): Dialogue/Science/Talents + every subcategory rail, each
 * crossed with Live/Recorded/Upcoming.
 * The FULL qualified set is fetched (no LIMIT, no first-100 window) and
 * ordered with the approved H7 weights, frozen ONCE at T0 with the shared
 * discovery/diversity pass — never ORDER BY RANDOM() per batch.
 */
export class CategoryRailProvider implements ResultSessionProvider {
    readonly surface = HOME_CATEGORY_SURFACE;
    private readonly category: string;
    private readonly subcategory: string;
    private readonly status: HomeRailStatus;
    private readonly lang: string;
    private readonly identityKind: 'user' | 'guest';
    private readonly userId: number | null;
    private readonly excludedCreatorIds: number[];

    constructor(options: {
        category: string;
        subcategory: string;
        status: HomeRailStatus;
        lang: string;
        identityKind: 'user' | 'guest';
        userId?: number | null;
        excludedCreatorIds: number[];
    }) {
        this.category = options.category;
        this.subcategory = options.subcategory;
        this.status = options.status;
        this.lang = options.lang;
        this.identityKind = options.identityKind;
        this.userId = typeof options.userId === 'number' ? options.userId : null;
        this.excludedCreatorIds = [...options.excludedCreatorIds];
    }

    contextKey(): string {
        return railContextKey({
            kind: 'category',
            category: this.category,
            subcategory: this.subcategory,
            status: this.status,
            lang: this.lang,
            identityKind: this.identityKind,
            surface: this.surface,
        });
    }

    async buildOrderedIds(db: D1Database): Promise<number[]> {
        const eligible = await new CompetitionModel(db).findHomeRailIds({
            status: this.status,
            category: this.category,
            subcategory: this.subcategory,
            excludeCreatorIds: this.excludedCreatorIds,
            // D1 hotfix: identity-bound anti-join narrowing (no placeholder
            // growth); the array stays as the read-time re-check source.
            excludeUserId: this.userId,
        });
        if (eligible.length === 0) return [];
        const bucket: H7StatusBucket = this.status;
        const signalsModel = new H7SignalsModel(db);
        const rows = await signalsModel.loadCompetitions(eligible);
        const ctx = await signalsModel.loadViewerContext(db, this.userId, this.lang, null);
        const uids: number[] = [];
        for (const r of rows) {
            uids.push(r.creator_id);
            if (r.opponent_id !== null) uids.push(r.opponent_id);
        }
        const profiles = await signalsModel.loadProfiles(uids);
        const nowMs = Date.now();
        const identity = this.userId === null ? 'guest' : 'user';
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
        const rank = new Map(diverse.map((d, i) => [d.id, i] as [number, number]));
        return diverse.map((d) => d.id).sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
    }

    isEligible(row: CompetitionWithDetails): boolean {
        if (!matchesRailCategoryScope(row, this.category, this.subcategory)) return false;
        if (this.excludedCreatorIds.includes(row.creator_id)) return false;
        return RecommendationModel.isPublicSuggested(railMediaOf(row), this.status);
    }
}
