/**
 * H7 User Ranking Service — R3-D2 (h7-v1 §4 user tracks).
 * خدمة ترتيب المستخدمين المعتمدة
 *
 * Pure business logic in lib/services (MVC). SQL lives in UserSignalsModel;
 * numbers come ONLY from H7RankingPolicy (h7-v1 OWNER APPROVED — never
 * re-designed here). Providers own eligibility; this service owns ORDERING.
 *
 * Tracks (§11 §4):
 * - User search: text 60, specialization 15, Profile 15, language 5, country 5
 *   inside Unicode-aware text layers (exact → prefix/whole-word → partial).
 * - Opponent (inside ONE layer): specialization depth 40, Profile 20,
 *   category experience 15, recent presence 15, follow 10.
 * - Follow suggestions: interest/specialization 25, language 20, country 10,
 *   Profile 15, experience 10, activity 10, new-account opportunity 10.
 * - Participation (user→competition, eligible seats only): topic 35, creator
 *   history 20, creator activity 10, follow 10, recency 15, schedule 10.
 *
 * Hard rules enforced by callers (never as score penalties):
 * - busy NEVER excludes and NEVER down-ranks (ranking snapshot only);
 *   follower status NEVER excludes an opponent candidate;
 *   self / block / pending-conflict / one-opponent / H3 always hold.
 */

import {
    H7_FOLLOW_WEIGHTS,
    H7_NEUTRAL,
    H7_OPPONENT_WEIGHTS,
    H7_PARTICIPATION_WEIGHTS,
    H7_USER_SEARCH_WEIGHTS,
    h7Normalize,
    h7ProfileSignal,
    h7Redistribute,
    h7SearchLayer,
    type H7OpponentLayer,
} from './H7RankingPolicy';
import type { UserSignalRow, UserSpecialization, CompetitorProfile } from '../../models/UserSignalsModel';

/** Re-export the Unicode-aware layer helper for user display names. */
export { h7SearchLayer };

/** Text layer of a user card for a query (username + display_name). */
export function h7UserSearchLayer(row: UserSignalRow, query: string): number {
    const q = query.trim();
    if (q === '') return 3;
    const name = `${row.username || ''} ${row.display_name || ''}`.trim();
    const bio = row.bio || '';
    // Exact username hit is the strongest textual signal.
    if ((row.username || '').trim().toLowerCase() === q.toLowerCase()) return 0;
    return h7SearchLayer(name, bio === '' ? null : bio, q);
}

export interface ViewerUserContext {
    viewerId: number | null;
    language: string | null;
    country: string | null;
    followingIds: Set<number>;
    viewerSpec: UserSpecialization | null;
}

function langMatch(rowLang: string | null, viewerLang: string | null): number | null {
    if (!viewerLang) return null;
    if (!rowLang) return H7_NEUTRAL;
    return rowLang.toLowerCase() === viewerLang.toLowerCase() ? 1 : 0;
}

function countryMatch(rowCountry: string | null, viewerCountry: string | null): number | null {
    if (!viewerCountry) return null;
    if (!rowCountry) return H7_NEUTRAL;
    return rowCountry.toLowerCase() === viewerCountry.toLowerCase() ? 1 : 0;
}

function profileSignal(profile: CompetitorProfile | undefined): number | null {
    if (!profile || profile.profile === null) return null;
    return h7ProfileSignal(profile.profile);
}

/**
 * §5 known-signal rule: a session-wide UNKNOWN signal redistributes (the
 * caller passes known=false and the weight drops); a per-candidate LACK
 * inside a KNOWN signal scores neutral 0.5 (a measured zero — e.g. a
 * contested-but-unrated 0 Profile — stays 0, never 0.5).
 */
export interface H7UserKnown {
    specialization?: boolean;
    profile?: boolean;
}

function knownOrRedistribute(
    value: number | null,
    isKnown: boolean | undefined
): number | null {
    if (value !== null) return value;
    if (isKnown) return H7_NEUTRAL;
    return null;
}

/** Specialization overlap: share of the candidate's contested participations in the viewer's top categories. */
function specializationScore(
    candidate: UserSpecialization | undefined,
    viewer: UserSpecialization | null
): number | null {
    if (!candidate) return null;
    if (!viewer || (viewer.totalParticipations <= 0 && viewer.explicitFavs.length === 0)) {
        // No viewer specialization to compare against at all (neither
        // contested participations nor explicit favs): session-wide unknown
        // is handled by the caller (redistribution).
        return null;
    }
    if (candidate.totalParticipations <= 0 && candidate.explicitFavs.length === 0) return H7_NEUTRAL;
    const viewerTop = new Set<string>();
    let best = 0;
    for (const [slug, n] of viewer.categoryCounts) {
        if (n > best) best = n;
    }
    if (best > 0) {
        for (const [slug, n] of viewer.categoryCounts) {
            if (n >= best * 0.5) viewerTop.add(slug);
        }
    }
    for (const fav of viewer.explicitFavs) viewerTop.add(fav);
    if (viewerTop.size === 0) return null;
    let overlap = 0;
    for (const [slug, n] of candidate.categoryCounts) {
        if (viewerTop.has(slug)) overlap += n;
    }
    for (const fav of candidate.explicitFavs) {
        if (viewerTop.has(fav)) overlap += 1;
    }
    if (overlap <= 0) return 0;
    return Math.min(1, overlap / Math.max(1, candidate.totalParticipations));
}

/** Experience: contested participations normalized (k=20 like Profile). */
function experienceScore(spec: UserSpecialization | undefined): number | null {
    if (!spec) return null;
    if (spec.totalParticipations <= 0) return 0;
    return h7Normalize(spec.totalParticipations, 20);
}

/** Activity/presence from presence columns (snapshot at T0 — frozen). */
export function presenceScore(row: UserSignalRow, nowMs: number): number {
    if (row.is_online === 1) return 1;
    if (!row.last_seen_at) return 0;
    const ms = Date.parse(row.last_seen_at);
    if (!Number.isFinite(ms)) return 0;
    const ageH = (nowMs - ms) / 3_600_000;
    if (ageH < 0) return 1;
    if (ageH <= 6) return 0.8;
    if (ageH <= 24) return 0.6;
    if (ageH <= 72) return 0.4;
    if (ageH <= 168) return 0.2;
    return 0;
}

/** New-account opportunity: accounts created within 30 days score 1. */
export function newAccountScore(row: UserSignalRow, nowMs: number): number {
    if (!row.created_at) return 0;
    const ms = Date.parse(row.created_at);
    if (!Number.isFinite(ms)) return 0;
    return nowMs - ms <= 30 * 86_400_000 ? 1 : 0;
}

// ------------------------------------------------------------------
// User search (§4: text 60, specialization 15, Profile 15, lang 5, country 5)
// ------------------------------------------------------------------

export function h7UserSearchScore(
    row: UserSignalRow,
    ctx: ViewerUserContext,
    candidateSpec: UserSpecialization | undefined,
    profile: CompetitorProfile | undefined,
    known: H7UserKnown = {}
): number {
    const spec = knownOrRedistribute(specializationScore(candidateSpec, ctx.viewerSpec), known.specialization);
    const prof = knownOrRedistribute(profileSignal(profile), known.profile);
    const lang = langMatch(row.language, ctx.language);
    const country = countryMatch(row.country, ctx.country);
    const parts: Array<{ w: number; s: number | null }> = [
        { w: H7_USER_SEARCH_WEIGHTS.text, s: 1 },
        { w: H7_USER_SEARCH_WEIGHTS.specialization, s: spec },
        { w: H7_USER_SEARCH_WEIGHTS.profile, s: prof },
        { w: H7_USER_SEARCH_WEIGHTS.language, s: lang },
        { w: H7_USER_SEARCH_WEIGHTS.country, s: country },
    ];
    const scored = parts.filter((p) => p.s !== null) as Array<{ w: number; s: number }>;
    if (scored.length === 0) return 0;
    return h7Redistribute(scored);
}

// ------------------------------------------------------------------
// Opponent layers (§4 — mandatory BEFORE score)
// ------------------------------------------------------------------

export interface OpponentCompetitionContext {
    subcategory: string;
    category: string;
    language: string | null;
    country: string | null;
}

/**
 * Layer 0/1/2/3 for one candidate (3 = fallback, never dropped).
 *
 * §11 layers with the language gate (R3-D2 REMOTE fix): the appropriate
 * language is a REQUIREMENT of layers 0–2, never a bonus an upper layer
 * may waive. A same-subcategory candidate with a KNOWN-WRONG language
 * falls through to the generic fallback (3) — it must never outrank a
 * layer-2 candidate with the appropriate language on fame/Profile alone.
 * Missing language on either side stays a wildcard (unknown ≠ mismatch);
 * an explicit competition language is never relaxed.
 */
export function h7OpponentLayer(
    candidate: UserSignalRow,
    candidateSpec: UserSpecialization | undefined,
    comp: OpponentCompetitionContext
): H7OpponentLayer {
    const sub = comp.subcategory.toLowerCase();
    const lang = (comp.language || '').toLowerCase();
    const country = (comp.country || '').toLowerCase();
    const candSub = candidateSpec
        ? [...candidateSpec.subcategoryCounts.keys(), ...candidateSpec.explicitFavs].map((s) => s.toLowerCase())
        : [];
    const candCat = candidateSpec
        ? [...candidateSpec.categoryCounts.keys(), ...candidateSpec.explicitFavs].map((s) => s.toLowerCase())
        : [];
    const candLang = (candidate.language || '').toLowerCase();
    const candCountry = (candidate.country || '').toLowerCase();
    // Appropriate language: exact match, or unknown on either side.
    // A KNOWN mismatch fails every approved layer (0/1/2).
    const langMismatch = lang !== '' && candLang !== '' && candLang !== lang;
    const hasSub = sub !== '' && candSub.includes(sub);
    if (hasSub && !langMismatch) {
        if (country === '' || candCountry === '' || candCountry === country) return 0;
        return 1;
    }
    const main = comp.category.toLowerCase();
    if (!langMismatch && main !== '' && candCat.includes(main)) return 2;
    return 3;
}

/** Intra-layer opponent score (§4: spec 40, Profile 20, exp 15, presence 15, follow 10). */
export function h7OpponentScore(
    row: UserSignalRow,
    candidateSpec: UserSpecialization | undefined,
    profile: CompetitorProfile | undefined,
    ctx: ViewerUserContext,
    comp: OpponentCompetitionContext,
    nowMs: number,
    known: H7UserKnown = {}
): number {
    const sub = comp.subcategory.toLowerCase();
    let depth: number | null;
    if (sub === '') {
        depth = knownOrRedistribute(specializationScore(candidateSpec, ctx.viewerSpec), known.specialization);
    } else if (!candidateSpec || candidateSpec.totalParticipations <= 0) {
        depth = H7_NEUTRAL;
    } else {
        const n = candidateSpec.subcategoryCounts.get(sub) ?? 0;
        depth = n > 0 ? Math.min(1, 0.5 + h7Normalize(n, 5) / 2 + 0.25) : 0;
        if (candidateSpec.explicitFavs.map((s) => s.toLowerCase()).includes(sub)) {
            depth = Math.min(1, (depth ?? 0) + 0.25);
        }
    }
    const prof = knownOrRedistribute(profileSignal(profile), known.profile);
    const exp = experienceScore(candidateSpec);
    const presence = presenceScore(row, nowMs);
    const follow: number | null =
        ctx.viewerId === null ? null : ctx.followingIds.has(row.id) ? 1 : 0;
    const parts: Array<{ w: number; s: number | null }> = [
        { w: H7_OPPONENT_WEIGHTS.specialization, s: depth },
        { w: H7_OPPONENT_WEIGHTS.profile, s: prof },
        { w: H7_OPPONENT_WEIGHTS.experience, s: exp },
        { w: H7_OPPONENT_WEIGHTS.presence, s: presence },
        { w: H7_OPPONENT_WEIGHTS.follow, s: follow },
    ];
    const scored = parts.filter((p) => p.s !== null) as Array<{ w: number; s: number }>;
    if (scored.length === 0) return 0;
    return h7Redistribute(scored);
}

// ------------------------------------------------------------------
// Follow suggestions (§4: interest 25, lang 20, country 10, Profile 15,
// experience 10, activity 10, new-account 10)
// ------------------------------------------------------------------

export function h7FollowScore(
    row: UserSignalRow,
    candidateSpec: UserSpecialization | undefined,
    profile: CompetitorProfile | undefined,
    ctx: ViewerUserContext,
    nowMs: number,
    known: H7UserKnown = {}
): number {
    const interest = knownOrRedistribute(specializationScore(candidateSpec, ctx.viewerSpec), known.specialization);
    const lang = langMatch(row.language, ctx.language);
    const country = countryMatch(row.country, ctx.country);
    const prof = knownOrRedistribute(profileSignal(profile), known.profile);
    const exp = experienceScore(candidateSpec);
    const activity = presenceScore(row, nowMs);
    const fresh = newAccountScore(row, nowMs);
    const parts: Array<{ w: number; s: number | null }> = [
        { w: H7_FOLLOW_WEIGHTS.interest, s: interest },
        { w: H7_FOLLOW_WEIGHTS.language, s: lang },
        { w: H7_FOLLOW_WEIGHTS.country, s: country },
        { w: H7_FOLLOW_WEIGHTS.profile, s: prof },
        { w: H7_FOLLOW_WEIGHTS.experience, s: exp },
        { w: H7_FOLLOW_WEIGHTS.activity, s: activity },
        { w: H7_FOLLOW_WEIGHTS.newAccount, s: fresh },
    ];
    const scored = parts.filter((p) => p.s !== null) as Array<{ w: number; s: number }>;
    if (scored.length === 0) return 0;
    return h7Redistribute(scored);
}

// ------------------------------------------------------------------
// Participation (user→competition, eligible seats only)
// ------------------------------------------------------------------

export interface ParticipationCard {
    id: number;
    category_slug: string | null;
    subcategory_slug: string | null;
    creator_id: number;
    language: string | null;
    country: string | null;
    created_at: string | null;
    scheduled_at: string | null;
    total_views: number;
    stars_sum: number;
    likes_count: number;
    dislikes_count: number;
}

export interface ParticipationViewer {
    viewerId: number;
    language: string | null;
    country: string | null;
    followingIds: Set<number>;
    viewerSpec: UserSpecialization | null;
    creatorProfiles: Map<number, CompetitorProfile>;
    creatorLastSeen: Map<number, string | null>;
}

/** Schedule proximity: future slot within 48h scores 1, decaying after. */
export function scheduleProximityScore(scheduledAt: string | null, nowMs: number): number {
    if (!scheduledAt) return H7_NEUTRAL;
    const ms = Date.parse(scheduledAt);
    if (!Number.isFinite(ms)) return H7_NEUTRAL;
    const diffH = (ms - nowMs) / 3_600_000;
    if (diffH < 0) return Math.max(0, 1 + diffH / 48);
    if (diffH <= 48) return 1;
    if (diffH <= 168) return 0.5;
    return 0.2;
}

export function h7ParticipationScore(
    card: ParticipationCard,
    viewer: ParticipationViewer,
    topicRelevance: number,
    creatorActivity: number,
    nowMs: number,
    known: { creatorHistory?: boolean } = {}
): number {
    // §5: a missing creator Profile inside a session where the signal is
    // available scores neutral 0.5 (never a weight drop that would reward
    // the data-poor card); a measured true zero stays 0; a session-wide
    // unavailable signal redistributes instead.
    const creatorProfile = viewer.creatorProfiles.get(card.creator_id);
    const creatorHistory = knownOrRedistribute(profileSignal(creatorProfile), known.creatorHistory);
    const follow = viewer.followingIds.has(card.creator_id) ? 1 : 0;
    // Recency from creation (pending seats have no ended_at anchor).
    let recency = H7_NEUTRAL;
    if (card.created_at) {
        const ms = Date.parse(card.created_at);
        if (Number.isFinite(ms)) {
            const ageD = (nowMs - ms) / 86_400_000;
            recency = ageD <= 0 ? 1 : Math.pow(2, -ageD / 7);
        }
    }
    const schedule = scheduleProximityScore(card.scheduled_at, nowMs);
    const parts: Array<{ w: number; s: number | null }> = [
        { w: H7_PARTICIPATION_WEIGHTS.topic, s: topicRelevance },
        { w: H7_PARTICIPATION_WEIGHTS.creatorHistory, s: creatorHistory },
        { w: H7_PARTICIPATION_WEIGHTS.creatorActivity, s: creatorActivity },
        { w: H7_PARTICIPATION_WEIGHTS.follow, s: follow },
        { w: H7_PARTICIPATION_WEIGHTS.recency, s: recency },
        { w: H7_PARTICIPATION_WEIGHTS.schedule, s: schedule },
    ];
    const scored = parts.filter((p) => p.s !== null) as Array<{ w: number; s: number }>;
    if (scored.length === 0) return 0;
    return h7Redistribute(scored);
}

/** Deterministic ordering: score desc, id asc (stable, no random). */
export function h7OrderUserScored<T extends { id: number; score: number }>(items: T[]): T[] {
    return [...items].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.id - b.id;
    });
}

export default {
    h7UserSearchScore,
    h7OpponentLayer,
    h7OpponentScore,
    h7FollowScore,
    h7ParticipationScore,
};
