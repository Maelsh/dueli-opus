/**
 * H7 Approved Ranking Policy — h7-v1 (OWNER APPROVED 2026-10-04).
 * السياسة الرقمية المعتمدة الوحيدة للأرقام
 *
 * Single central source for ALL h7-v1 numbers and formulas (R3-D1).
 * No weight scattering: providers, search, similar and tests import from
 * here. Routine implementation details delegated by §11 live here with
 * explicit DOCUMENTED markers — policy numbers themselves are never
 * re-designed here.
 *
 * Reference: dueli-plan/dueli-completion-plan/11-H7-APPROVED-RANKING-POLICY.md
 * Policy version pinned into every rail/session context: 'h7-v1'.
 */

export const H7_POLICY_VERSION = 'h7-v1';

export type H7Identity = 'user' | 'guest';
export type H7StatusBucket = 'live' | 'recorded' | 'upcoming' | 'mixed';

/** §2 — watch weights, every column sums to 100. */
export interface H7WatchWeights {
    interests: number;
    language: number;
    country: number;
    follow: number;
    quality: number;
    recency: number;
    unwatched: number;
    history: number;
}

const WATCH_TABLE: Record<H7Identity, Record<'recorded' | 'liveUpcoming', H7WatchWeights>> = {
    user: {
        recorded: { interests: 25, language: 15, country: 5, follow: 10, quality: 20, recency: 15, unwatched: 10, history: 0 },
        liveUpcoming: { interests: 25, language: 15, country: 5, follow: 10, quality: 15, recency: 15, unwatched: 10, history: 5 },
    },
    guest: {
        recorded: { interests: 0, language: 25, country: 10, follow: 0, quality: 30, recency: 25, unwatched: 10, history: 0 },
        liveUpcoming: { interests: 0, language: 25, country: 10, follow: 0, quality: 25, recency: 25, unwatched: 10, history: 5 },
    },
};

export function h7WatchWeights(identity: H7Identity, bucket: H7StatusBucket): H7WatchWeights {
    if (bucket === 'recorded') return { ...WATCH_TABLE[identity].recorded };
    if (bucket === 'live' || bucket === 'upcoming') return { ...WATCH_TABLE[identity].liveUpcoming };
    // Mixed-status browsing (§2): per-card weights by its own status at T0,
    // every card still scored on the same 0–100 scale. The table returned
    // here is only a fallback for callers that need one set; the ranking
    // service selects per-card weights for mixed views.
    return { ...WATCH_TABLE[identity].liveUpcoming };
}

export function h7WatchWeightsForCard(identity: H7Identity, cardStatus: string): H7WatchWeights {
    if (cardStatus === 'completed') return { ...WATCH_TABLE[identity].recorded };
    return { ...WATCH_TABLE[identity].liveUpcoming };
}

export function sumWeights(w: Record<string, number>): number {
    return Object.values(w).reduce((a, b) => a + b, 0);
}

/** §3 — Q formula + normalization constants (pinned starting values). */
export const H7_K_STARS = 100;
export const H7_K_VIEWS = 300;
export const H7_K_PROFILE = 20;
export const H7_Q_W_STARS = 0.4;
export const H7_Q_W_BALANCE = 0.35;
export const H7_Q_W_VIEWS = 0.25;

/** N(x;k) = ln(1+x) / (ln(1+x) + ln(1+k)). N(0)=0. */
export function h7Normalize(x: number, k: number): number {
    const v = Math.max(0, Number(x) || 0);
    const num = Math.log(1 + v);
    const den = num + Math.log(1 + Math.max(0, k));
    if (den <= 0) return 0;
    return num / den;
}

/** B = (likes+5)/(likes+dislikes+10). No votes => 0.5. */
export function h7Balance(likes: number, dislikes: number): number {
    const l = Math.max(0, Number(likes) || 0);
    const d = Math.max(0, Number(dislikes) || 0);
    return (l + 5) / (l + d + 10);
}

/**
 * Q = 0.40*N(S;100) + 0.35*B + 0.25*N(V;300), in [0,1].
 * S = sum of effective stars of BOTH sides in THIS competition.
 * V = H2 counted views. Like/Dislike = one effective interaction.
 * Q with no stars/views and no votes = 0.175 (pinned §3).
 */
export function h7Quality(stars: number, views: number, likes: number, dislikes: number): number {
    const q =
        H7_Q_W_STARS * h7Normalize(stars, H7_K_STARS) +
        H7_Q_W_BALANCE * h7Balance(likes, dislikes) +
        H7_Q_W_VIEWS * h7Normalize(views, H7_K_VIEWS);
    return Math.min(1, Math.max(0, q));
}

/** Pinned §3: first like moves Q by 0.35*(6/11-0.5). */
export function h7FirstLikeDelta(): number {
    return H7_Q_W_BALANCE * (6 / 11 - 0.5);
}

/** Competitor Profile display = SUM effective stars / actual competitions count. May exceed 5; never clipped. */
export function h7ProfileDisplay(sumStars: number, competitions: number): number | null {
    if (!Number.isFinite(competitions) || competitions <= 0) return null;
    return Math.max(0, Number(sumStars) || 0) / competitions;
}

/** N(Profile;20) for ranking only; unknown side is neutral (handled by caller). */
export function h7ProfileSignal(profile: number | null): number | null {
    if (profile === null || !Number.isFinite(profile)) return null;
    return h7Normalize(profile, H7_K_PROFILE);
}

/** §4 — remaining tracks, every table sums to 100. */
export const H7_SIMILAR_WEIGHTS = {
    topic: 45,
    text: 15,
    language: 10,
    country: 5,
    quality: 15,
    recency: 10,
} as const;

export const H7_SEARCH_WEIGHTS = {
    text: 60,
    topic: 15,
    quality: 10,
    language: 5,
    country: 5,
    recency: 5,
} as const;

/** §5 — inner interest mix (of the interests block only). */
export const H7_INTEREST_MIX = {
    explicit: 0.35,
    watch: 0.3,
    likes: 0.2,
    participations: 0.15,
} as const;

export type H7InterestSource = keyof typeof H7_INTEREST_MIX;

/**
 * §5 missing-signal rule, session-wide unknown:
 * drop the weight, redistribute proportionally:
 * score = 100 * sum(w*s) / sum(available_w).
 * Each sub-score s is on a 0..1 scale.
 */
export function h7Redistribute(scored: Array<{ w: number; s: number }>): number {
    let num = 0;
    let den = 0;
    for (const { w, s } of scored) {
        if (!Number.isFinite(w) || w <= 0) continue;
        num += w * Math.min(1, Math.max(0, s));
        den += w;
    }
    if (den <= 0) return 0;
    return (100 * num) / den;
}

/**
 * §5 per-candidate lack: neutral 0.5 for THAT signal, no per-card
 * redistribution (so data-poor cards never benefit). True zero stays 0 —
 * callers must distinguish null/unknown (0.5) from measured zero (0).
 */
export const H7_NEUTRAL = 0.5;

/** §6 — recency half-lives (approved). */
export const H7_HALF_LIFE = {
    /** Recorded: 30 days. */
    recordedDays: 30,
    /** Live: 6 hours. */
    liveHours: 6,
    /** Unscheduled (no slot): 7 days from creation. */
    unscheduledDays: 7,
    /** Upcoming scheduled: 48h to the future slot. */
    upcomingHours: 48,
    /**
     * DOCUMENTED routine detail (§11 delegates the late-branch detail):
     * an overdue upcoming slot retreats 4x faster (H=12h) — still a
     * proximity decay, never an eligibility change.
     */
    upcomingLateHours: 12,
} as const;

/** R = 2^(-age/H), clamped to [0,1]. Future anchors clamp to 1, never above. */
export function h7Recency(ageMs: number, halfLifeMs: number): number {
    if (!Number.isFinite(ageMs) || !Number.isFinite(halfLifeMs) || halfLifeMs <= 0) return 0;
    if (ageMs <= 0) return 1;
    return Math.pow(2, -ageMs / halfLifeMs);
}

export const H7_MS = {
    hour: 3600_000,
    day: 86_400_000,
} as const;

/**
 * DOCUMENTED anchor selection (§11: trustworthy existing timing, else
 * ended_at then created_at; never updated_at):
 * - recorded: ended_at ?? stream_ended_at ?? created_at
 * - live: started_at ?? stream_started_at ?? created_at
 * - upcoming scheduled: scheduled_at (future => proximity, past => late decay)
 * - unscheduled upcoming/pending: created_at
 */
export interface H7TimeRow {
    status: string;
    created_at?: string | null;
    started_at?: string | null;
    stream_started_at?: string | null;
    scheduled_at?: string | null;
    ended_at?: string | null;
    stream_ended_at?: string | null;
    vod_url?: string | null;
    youtube_video_url?: string | null;
}

export function h7RecencyAnchorMs(row: H7TimeRow, nowMs: number): { ageMs: number; halfLifeMs: number; anchor: string } {
    const t = (v: string | null | undefined): number | null => {
        if (!v) return null;
        const ms = Date.parse(v);
        return Number.isFinite(ms) ? ms : null;
    };
    if (row.status === 'completed') {
        const anchor = t(row.ended_at) ?? t(row.stream_ended_at) ?? t(row.created_at);
        const age = anchor === null ? Number.POSITIVE_INFINITY : nowMs - anchor;
        return { ageMs: age, halfLifeMs: H7_HALF_LIFE.recordedDays * H7_MS.day, anchor: 'ended_or_created' };
    }
    if (row.status === 'live') {
        const anchor = t(row.started_at) ?? t(row.stream_started_at) ?? t(row.created_at);
        const age = anchor === null ? Number.POSITIVE_INFINITY : nowMs - anchor;
        return { ageMs: age, halfLifeMs: H7_HALF_LIFE.liveHours * H7_MS.hour, anchor: 'started_or_created' };
    }
    const slot = t(row.scheduled_at);
    if (slot !== null) {
        if (slot >= nowMs) {
            return { ageMs: slot - nowMs, halfLifeMs: H7_HALF_LIFE.upcomingHours * H7_MS.hour, anchor: 'scheduled_future' };
        }
        return { ageMs: nowMs - slot, halfLifeMs: H7_HALF_LIFE.upcomingLateHours * H7_MS.hour, anchor: 'scheduled_late' };
    }
    const created = t(row.created_at);
    const age = created === null ? Number.POSITIVE_INFINITY : nowMs - created;
    return { ageMs: age, halfLifeMs: H7_HALF_LIFE.unscheduledDays * H7_MS.day, anchor: 'created_unscheduled' };
}

export function h7RecencyOf(row: H7TimeRow, nowMs: number): number {
    const { ageMs, halfLifeMs } = h7RecencyAnchorMs(row, nowMs);
    if (!Number.isFinite(ageMs)) return 0;
    return h7Recency(ageMs, halfLifeMs);
}

/** §6 discovery windows — DOCUMENTED routine detail derived from existing time + counted counter. */
export const H7_DISCOVERY = {
    /** New = created within the last 7 days. */
    newWindowDays: 7,
    /** Low-views = H2 counted total_views <= 10. */
    lowViewsMax: 10,
    /** Up to 2 per 10 (one new + one low-views) when qualifiers exist. */
    perTen: 2,
} as const;

/** §6 diversity — DOCUMENTED: max 2 cards per competitor per 10 with alternatives, relaxed at exhaustion. */
export const H7_DIVERSITY = {
    perTen: 2,
    window: 10,
} as const;

/** §4 search text layers (before score; higher textual layer never buried by fame). */
export type H7SearchLayer = 0 | 1 | 2 | 3;

/**
 * Unicode-aware whole-word test (ar/en + digits).
 * `\b` is ASCII-only: it splits INSIDE Arabic words, so a complete Arabic
 * word mid-text would wrongly fall through to the partial layer. Unicode
 * letter/number lookarounds treat every script as word characters, so
 * punctuation/whitespace (either side, either script) delimit words while
 * infixes never match. Mixed ar-en queries work the same way.
 */
export function h7HasWholeWord(text: string, query: string): boolean {
    const t = text.toLowerCase();
    const q = query.trim().toLowerCase();
    if (q === '' || t === '') return false;
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
        return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'u').test(t);
    } catch {
        // Non-Unicode-regex runtimes (never expected): conservative
        // space-padding covers the plain interior case only.
        return t.includes(` ${q} `) || t.startsWith(`${q} `) || t.endsWith(` ${q}`) || t === q;
    }
}

function h7NormText(s: string): string {
    return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function h7SearchLayer(title: string, description: string | null, query: string): H7SearchLayer {
    const q = h7NormText(query);
    if (q === '') return 3;
    const t = h7NormText(title || '');
    const d = h7NormText(description || '');
    if (t === q) return 0;
    if (t.startsWith(q)) return 1;
    if (h7HasWholeWord(t, q)) return 1;
    if (t.includes(q) || (d !== '' && d.includes(q))) return 2;
    return 3;
}

/**
 * Simple text similarity for similar competitions (§11: existing
 * text/category only, no embeddings/service). Token Jaccard on titles.
 */
export function h7TitleSimilarity(a: string, b: string): number {
    const toks = (s: string): Set<string> =>
        new Set(
            s
                .toLowerCase()
                .split(/[^a-z0-9\u0600-\u06FF]+/u)
                .filter((w) => w.length > 2)
        );
    const A = toks(a || '');
    const B = toks(b || '');
    if (A.size === 0 || B.size === 0) return 0;
    let inter = 0;
    for (const w of A) if (B.has(w)) inter++;
    return inter / (A.size + B.size - inter);
}

export default {
    H7_POLICY_VERSION,
    h7WatchWeights,
    h7WatchWeightsForCard,
    h7Normalize,
    h7Balance,
    h7Quality,
};
