/**
 * H7 User Session Providers — R3-D2 (h7-v1 §4 user tracks).
 * مزودات جلسات المستخدمين المعتمدة
 *
 * Same shared session store (explore_result_sessions + chunks + cursor +
 * TTL). No parallel engine, no new tables, no RANDOM+OFFSET, no Math.random.
 * Eligibility first (hard rules), then H7 ordering frozen once at T0:
 * - User search: Unicode-aware text layers exact → prefix/whole-word →
 *   partial (D1-REM1 logic), H7 inside the layer (text 60, spec 15,
 *   Profile 15, lang 5, country 5). Followed/busy/inactive-alone NEVER
 *   exclude; self/block hold.
 * - Opponent: mandatory layers (same sub+lang+country → same sub+lang
 *   other country → close spec in main category + suitable language →
 *   fallback) BEFORE score; fame/Profile never bury a higher layer.
 *   Follower stays a candidate; busy stays a candidate; self/block/
 *   pending-conflict/one-opponent/H3 hold; invite eligibility rechecked
 *   at SEND (frozen suggestion ≠ live invite).
 * - Follow: H7 (interest 25, lang 20, country 10, Profile 15, experience 10,
 *   activity 10, new-account 10). Busy NEVER blocks follow. Follow
 *   eligibility is separate from opponent/search eligibility.
 * - Participation (user→competition, implements ResultSessionProvider):
 *   eligible seats only (pending + no opponent + real seat contract),
 *   H7 inside (topic 35, creator history 20, creator activity 10,
 *   follow 10, recency 15, schedule 10).
 *
 * Competition→user reuses OpponentProvider (opponent side) under the
 * competition candidate session endpoints — same H7, same layers.
 */

import type { ResultSessionProvider } from '../lib/services/ExploreSessionService';
import type { UserSessionProvider } from '../lib/services/UserSessionService';
import type { CompetitionWithDetails } from './CompetitionModel';
import { CompetitionModel } from './CompetitionModel';
import { H7SignalsModel } from './H7SignalsModel';
import { UserSignalsModel, type UserSignalRow } from './UserSignalsModel';
import {
    h7FollowScore,
    h7OpponentLayer,
    h7OpponentScore,
    h7OrderUserScored,
    h7ParticipationScore,
    h7UserSearchLayer,
    h7UserSearchScore,
    presenceScore,
    type ViewerUserContext,
} from '../lib/services/H7UserRankingService';
import { H7_POLICY_VERSION } from '../lib/services/H7RankingPolicy';
import type { H7OpponentLayer } from '../lib/services/H7RankingPolicy';

export const USER_SEARCH_SURFACE = 'user_search';
export const OPPONENT_SURFACE = 'opponent_candidates';
export const FOLLOW_SURFACE = 'follow_suggestions';
export const PARTICIPATION_SURFACE = 'participation_competitions';

function ctxKey(parts: unknown[]): string {
    return JSON.stringify([...parts, H7_POLICY_VERSION]);
}

async function loadViewerUserContext(
    db: D1Database,
    viewerId: number | null,
    fallbackLang: string | null,
    fallbackCountry: string | null
): Promise<ViewerUserContext> {
    const signals = new UserSignalsModel(db);
    if (viewerId === null) {
        return {
            viewerId: null,
            language: fallbackLang,
            country: fallbackCountry,
            followingIds: new Set(),
            viewerSpec: null,
        };
    }
    const rows = await signals.loadUsers([viewerId]);
    const me = rows[0];
    const [following, specs] = await Promise.all([
        signals.loadFollowingIds(viewerId),
        signals.loadSpecializations([viewerId]),
    ]);
    return {
        viewerId,
        language: me?.language ?? fallbackLang,
        country: me?.country ?? fallbackCountry,
        followingIds: following,
        viewerSpec: specs.get(viewerId) ?? null,
    };
}

async function competitionContext(
    db: D1Database,
    competitionId: number
): Promise<{
    id: number;
    status: string;
    creator_id: number;
    opponent_id: number | null;
    subcategory: string;
    category: string;
    language: string | null;
    country: string | null;
} | null> {
    const rows = await new CompetitionModel(db).findByIds([competitionId]);
    const row = rows[0] as unknown as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
        id: Number(row['id']),
        status: String(row['status'] ?? ''),
        creator_id: Number(row['creator_id']),
        opponent_id: (row['opponent_id'] as number | null) ?? null,
        subcategory: String((row['subcategory_slug'] as string | null) ?? ''),
        category: String((row['category_slug'] as string | null) ?? ''),
        language: (row['language'] as string | null) ?? null,
        country: (row['country'] as string | null) ?? null,
    };
}

// ------------------------------------------------------------------
// User search
// ------------------------------------------------------------------

export class UserSearchProvider implements UserSessionProvider {
    readonly surface = USER_SEARCH_SURFACE;
    private readonly query: string;
    private readonly viewerId: number | null;
    private readonly lang: string;

    constructor(query: string, viewerId: number | null, lang: string) {
        this.query = query.trim().slice(0, 100);
        this.viewerId = viewerId;
        this.lang = lang;
    }

    contextKey(): string {
        return ctxKey(['user-search', this.query.toLowerCase(), this.viewerId ?? 'guest']);
    }

    async buildOrderedIds(db: D1Database, lang: string): Promise<number[]> {
        const signals = new UserSignalsModel(db);
        const allIds = await signals.findAllActiveUserIds();
        const rows = await signals.loadUsers(allIds);
        const ctx = await loadViewerUserContext(db, this.viewerId, lang, null);
        const blocked = this.viewerId === null ? new Set<number>() : await signals.loadBlockedIds(this.viewerId);
        // Hard eligibility ONLY: active (SQL), self, block. Followed, busy
        // and inactivity-alone never exclude from search.
        const eligible = rows.filter((r) => {
            if (this.viewerId !== null && r.id === this.viewerId) return false;
            if (blocked.has(r.id)) return false;
            return true;
        });
        const q = this.query;
        const withLayer = eligible.map((r) => ({ row: r, layer: h7UserSearchLayer(r, q) }));
        // A text query keeps only matching layers; an empty query browses all.
        const kept = q === '' ? withLayer : withLayer.filter((l) => l.layer <= 2);
        if (kept.length === 0) return [];
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
        // §5: the Profile signal is session-known when ANY candidate holds
        // a contested Profile; specialization is known from the viewer.
        const known = {
            profile: ids.some((id) => (profiles.get(id)?.profile ?? null) !== null),
            specialization:
                (ctx.viewerSpec?.totalParticipations ?? 0) > 0 ||
                (ctx.viewerSpec?.explicitFavs.length ?? 0) > 0,
        };
        const out: number[] = [];
        for (const layer of [0, 1, 2, 3]) {
            const group = byLayer.get(layer) ?? [];
            if (group.length === 0) continue;
            const scored = group.map(({ row }) => ({
                id: row.id,
                score: h7UserSearchScore(row, ctx, specs.get(row.id), profiles.get(row.id), known),
            }));
            out.push(...h7OrderUserScored(scored).map((s) => s.id));
        }
        return out;
    }

    isEligibleUser(row: UserSignalRow): boolean {
        // Read-time hard eligibility: active only. Block/self were frozen
        // at T0 for snapshot stability; a NEW block after T0 is enforced
        // at action time (follow/invite), never by resurrecting pages.
        return row.is_active === 1;
    }
}

// ------------------------------------------------------------------
// Opponent candidates (also serves competition→user for the duel side)
// ------------------------------------------------------------------

export class OpponentProvider implements UserSessionProvider {
    readonly surface = OPPONENT_SURFACE;
    private readonly competitionId: number;
    private readonly viewerId: number;
    private readonly lang: string;

    constructor(competitionId: number, viewerId: number, lang: string) {
        this.competitionId = competitionId;
        this.viewerId = viewerId;
        this.lang = lang;
    }

    contextKey(): string {
        return ctxKey(['opponent', this.competitionId, this.viewerId]);
    }

    async buildOrderedIds(db: D1Database, lang: string): Promise<number[]> {
        const signals = new UserSignalsModel(db);
        const comp = await competitionContext(db, this.competitionId);
        if (!comp) return [];
        // One-opponent / closed seats have no candidates (endpoint also 409s).
        if (comp.opponent_id !== null || comp.status !== 'pending') return [];
        if (comp.creator_id !== this.viewerId) return [];
        const allIds = await signals.findAllActiveUserIds();
        const rows = await signals.loadUsers(allIds);
        const [ctx, blocked, invitees, requesters, closedRequests] = await Promise.all([
            loadViewerUserContext(db, this.viewerId, lang, null),
            signals.loadBlockedIds(this.viewerId),
            signals.loadPendingInviteeIds(this.competitionId),
            signals.loadPendingRequesterIds(this.competitionId),
            signals.loadRequestsClosedIds(allIds),
        ]);
        const eligible = rows.filter((r) => {
            if (r.id === this.viewerId) return false;
            if (blocked.has(r.id)) return false;
            if (invitees.has(r.id)) return false;
            if (requesters.has(r.id)) return false;
            if (closedRequests.has(r.id)) return false;
            return true;
        });
        if (eligible.length === 0) return [];
        const ids = eligible.map((r) => r.id);
        const [specs, profiles] = await Promise.all([
            signals.loadSpecializations(ids),
            signals.getProfiles(ids),
        ]);
        const nowMs = Date.now();
        const compCtx = {
            subcategory: comp.subcategory,
            category: comp.category,
            language: comp.language,
            country: comp.country,
        };
        const byLayer = new Map<H7OpponentLayer, UserSignalRow[]>();
        for (const row of eligible) {
            const layer = h7OpponentLayer(row, specs.get(row.id), compCtx);
            const arr = byLayer.get(layer) ?? [];
            arr.push(row);
            byLayer.set(layer, arr);
        }
        const known = {
            profile: ids.some((id) => (profiles.get(id)?.profile ?? null) !== null),
            specialization:
                (ctx.viewerSpec?.totalParticipations ?? 0) > 0 ||
                (ctx.viewerSpec?.explicitFavs.length ?? 0) > 0,
        };
        const out: number[] = [];
        for (const layer of [0, 1, 2, 3] as H7OpponentLayer[]) {
            const group = byLayer.get(layer) ?? [];
            if (group.length === 0) continue;
            const scored = group.map((row) => ({
                id: row.id,
                score: h7OpponentScore(row, specs.get(row.id), profiles.get(row.id), ctx, compCtx, nowMs, known),
            }));
            out.push(...h7OrderUserScored(scored).map((s) => s.id));
        }
        return out;
    }

    isEligibleUser(row: UserSignalRow): boolean {
        return row.is_active === 1;
    }
}

// ------------------------------------------------------------------
// Follow suggestions
// ------------------------------------------------------------------

export class FollowSuggestionProvider implements UserSessionProvider {
    readonly surface = FOLLOW_SURFACE;
    private readonly viewerId: number;
    private readonly lang: string;

    constructor(viewerId: number, lang: string) {
        this.viewerId = viewerId;
        this.lang = lang;
    }

    contextKey(): string {
        return ctxKey(['follow', this.viewerId]);
    }

    async buildOrderedIds(db: D1Database, lang: string): Promise<number[]> {
        const signals = new UserSignalsModel(db);
        const allIds = await signals.findAllActiveUserIds();
        const rows = await signals.loadUsers(allIds);
        const [ctx, blocked, following] = await Promise.all([
            loadViewerUserContext(db, this.viewerId, lang, null),
            signals.loadBlockedIds(this.viewerId),
            signals.loadFollowingIds(this.viewerId),
        ]);
        // Follow eligibility (SEPARATE from duel/search): self, block,
        // already-followed excluded. Busy NEVER blocks follow.
        const eligible = rows.filter((r) => {
            if (r.id === this.viewerId) return false;
            if (blocked.has(r.id)) return false;
            if (following.has(r.id)) return false;
            return true;
        });
        if (eligible.length === 0) return [];
        const ids = eligible.map((r) => r.id);
        const [specs, profiles] = await Promise.all([
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
            score: h7FollowScore(row, specs.get(row.id), profiles.get(row.id), ctx, nowMs, known),
        }));
        return h7OrderUserScored(scored).map((s) => s.id);
    }

    isEligibleUser(row: UserSignalRow): boolean {
        return row.is_active === 1;
    }
}

// ------------------------------------------------------------------
// Participation (user→competition): eligible seats only, H7 inside.
// ------------------------------------------------------------------

export class ParticipationProvider implements ResultSessionProvider {
    readonly surface = PARTICIPATION_SURFACE;
    private readonly viewerId: number;
    private readonly lang: string;

    constructor(viewerId: number, lang: string) {
        this.viewerId = viewerId;
        this.lang = lang;
    }

    contextKey(): string {
        return ctxKey(['participation', this.viewerId]);
    }

    async buildOrderedIds(db: D1Database, lang: string): Promise<number[]> {
        const signals = new UserSignalsModel(db);
        const model = new CompetitionModel(db);
        // Eligible seats: pending + no opponent (real seat contract —
        // accepted/open is NEVER auto-joinable).
        const seats = await db.prepare(
            `SELECT c.id AS id FROM competitions c WHERE c.status = 'pending' AND c.opponent_id IS NULL`
        ).all<{ id: number }>();
        let ids = ((seats.results ?? []) as Array<{ id: number }>).map((r) => r.id);
        if (ids.length === 0) return [];
        const cards = await model.findByIds(ids);
        const [blocked, inviteRows, requestRows, viewerRows, viewerSpecs] = await Promise.all([
            signals.loadBlockedIds(this.viewerId),
            db.prepare(
                `SELECT competition_id AS id FROM competition_invitations WHERE invitee_id = ? AND status = 'pending'`
            ).bind(this.viewerId).all<{ id: number }>(),
            db.prepare(
                `SELECT competition_id AS id FROM competition_requests WHERE requester_id = ? AND status = 'pending'`
            ).bind(this.viewerId).all<{ id: number }>(),
            signals.loadUsers([this.viewerId]),
            signals.loadSpecializations([this.viewerId]),
        ]);
        const pendingInvites = new Set(((inviteRows.results ?? []) as Array<{ id: number }>).map((r) => r.id));
        const pendingRequests = new Set(((requestRows.results ?? []) as Array<{ id: number }>).map((r) => r.id));
        const me = (viewerRows[0] as UserSignalRow | undefined) ?? null;
        const viewerSpec = viewerSpecs.get(this.viewerId) ?? null;
        const ctx: ViewerUserContext = {
            viewerId: this.viewerId,
            language: me?.language ?? lang,
            country: me?.country ?? null,
            followingIds: await signals.loadFollowingIds(this.viewerId),
            viewerSpec,
        };
        const eligible = cards.filter((c) => {
            const rec = c as unknown as Record<string, unknown>;
            if (Number(rec['creator_id']) === this.viewerId) return false;
            if (blocked.has(Number(rec['creator_id']))) return false;
            // H3: a pending invite for THIS seat means accept/decline, not join.
            if (pendingInvites.has(Number(rec['id']))) return false;
            if (pendingRequests.has(Number(rec['id']))) return false;
            return true;
        });
        if (eligible.length === 0) return [];
        const h7signals = new H7SignalsModel(db);
        const compIds = eligible.map((c) => c.id);
        const compSignals = await h7signals.loadCompetitions(compIds);
        const sigById = new Map(compSignals.map((s) => [s.id, s]));
        const creatorIds = [...new Set(eligible.map((c) => Number((c as unknown as Record<string, unknown>)['creator_id'])))];
        const [creatorProfiles, creatorRows] = await Promise.all([
            signals.getProfiles(creatorIds),
            signals.loadUsers(creatorIds),
        ]);
        const creatorSeen = new Map<number, string | null>();
        for (const u of creatorRows) creatorSeen.set(u.id, u.last_seen_at);
        // §5: creator history is session-known when ANY seat creator holds
        // a contested Profile; a missing one then scores neutral 0.5.
        const historyKnown = creatorIds.some((id) => (creatorProfiles.get(id)?.profile ?? null) !== null);
        const nowMs = Date.now();
        const scored = eligible.map((c) => {
            const rec = c as unknown as Record<string, unknown>;
            const sig = sigById.get(c.id);
            const creatorId = Number(rec['creator_id']);
            // Topic relevance: viewer contested categories vs card category.
            let topic = 0.5;
            const cat = String((sig?.category_slug as string | null) ?? '').toLowerCase();
            const sub = String((sig?.subcategory_slug as string | null) ?? '').toLowerCase();
            if (viewerSpec && viewerSpec.totalParticipations > 0) {
                const catN = cat !== '' ? viewerSpec.categoryCounts.get(cat) ?? 0 : 0;
                const subN = sub !== '' ? viewerSpec.subcategoryCounts.get(sub) ?? 0 : 0;
                const total = viewerSpec.totalParticipations;
                topic = Math.min(1, (subN * 1.5 + catN) / Math.max(1, total));
                if (topic <= 0) topic = 0;
            }
            const seen = creatorSeen.get(creatorId) ?? null;
            const creatorActivity = seen
                ? presenceScore({ last_seen_at: seen, is_online: 0 } as UserSignalRow, nowMs)
                : 0.5;
            return {
                id: c.id,
                score: h7ParticipationScore(
                    {
                        id: c.id,
                        category_slug: (sig?.category_slug as string | null) ?? null,
                        subcategory_slug: (sig?.subcategory_slug as string | null) ?? null,
                        creator_id: creatorId,
                        language: (sig?.language as string | null) ?? null,
                        country: (sig?.country as string | null) ?? null,
                        created_at: (sig?.created_at as string | null) ?? null,
                        scheduled_at: (sig?.scheduled_at as string | null) ?? null,
                        total_views: Number(sig?.total_views ?? 0),
                        stars_sum: Number(sig?.stars_sum ?? 0),
                        likes_count: Number(sig?.likes_count ?? 0),
                        dislikes_count: Number(sig?.dislikes_count ?? 0),
                    },
                    {
                        viewerId: this.viewerId,
                        language: ctx.language,
                        country: ctx.country,
                        followingIds: ctx.followingIds,
                        viewerSpec,
                        creatorProfiles,
                        creatorLastSeen: creatorSeen,
                    },
                    topic,
                    creatorActivity,
                    nowMs,
                    { creatorHistory: historyKnown }
                ),
            };
        });
        return h7OrderUserScored(scored).map((s) => s.id);
    }

    isEligible(row: CompetitionWithDetails): boolean {
        const rec = row as unknown as Record<string, unknown>;
        // Live seat re-check: still pending + still no opponent.
        if (String(rec['status'] ?? '') !== 'pending') return false;
        if ((rec['opponent_id'] as number | null) !== null && rec['opponent_id'] !== undefined) {
            const v = rec['opponent_id'];
            if (v !== null) return false;
        }
        return true;
    }
}

export default {
    UserSearchProvider,
    OpponentProvider,
    FollowSuggestionProvider,
    ParticipationProvider,
};
