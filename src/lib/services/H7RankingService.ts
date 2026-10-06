/**
 * H7 Ranking Service — h7-v1 scoring over the shared session store.
 * خدمة الترتيب المعتمدة
 *
 * Pure business logic in lib/services (MVC) over signal rows loaded by
 * H7SignalsModel (SQL stays in Models). Providers own eligibility;
 * this service owns ORDERING only.
 *
 * Rules applied literally from §11:
 * - Filtering/eligibility first, then ranking (providers filter).
 * - Guest/User × Recorded/Live/Upcoming weights (§2), mixed views pick
 *   per-card weights by card status at T0 on the same 0–100 scale.
 * - Q formula + constants (§3), interests mix (§5), search/similar (§4),
 *   half-lives (§6), neutral/redistribution (§5), discovery/diversity (§6).
 * - Randomness for discovery exactly once at session creation with
 *   WebCrypto (frozen thereafter); never Math.random / SQL RANDOM paging.
 */

import {
    H7Identity,
    H7StatusBucket,
    H7_DISCOVERY,
    H7_DIVERSITY,
    H7_INTEREST_MIX,
    H7_NEUTRAL,
    H7_SEARCH_WEIGHTS,
    H7_SIMILAR_WEIGHTS,
    h7Balance,
    h7ProfileSignal,
    h7Quality,
    h7RecencyOf,
    h7Redistribute,
    h7SearchLayer,
    h7TitleSimilarity,
    h7WatchWeights,
    h7WatchWeightsForCard,
} from './H7RankingPolicy';
import type { H7CompetitionSignals, H7ViewerContext } from '../../models/H7SignalsModel';
import { h7ProfileDisplay } from './H7RankingPolicy';

export interface H7ScoreBreakdown {
    interests: number;
    language: number;
    country: number;
    follow: number;
    quality: number;
    recency: number;
    unwatched: number;
    history: number;
}

export interface H7Scored {
    id: number;
    score: number;
    layer?: number;
}

/** Sub-score helpers — every sub-score is 0..1. */

function langScore(row: H7CompetitionSignals, viewerLang: string | null): number | null {
    if (!viewerLang) return null;
    if (!row.language) return H7_NEUTRAL;
    return row.language.toLowerCase() === viewerLang.toLowerCase() ? 1 : 0;
}

function countryScore(row: H7CompetitionSignals, viewerCountry: string | null): number | null {
    if (!viewerCountry) return null;
    if (!row.country) return H7_NEUTRAL;
    return row.country.toLowerCase() === viewerCountry.toLowerCase() ? 1 : 0;
}

function followScore(row: H7CompetitionSignals, ctx: H7ViewerContext): number | null {
    if (ctx.userId === null) return null;
    const set = new Set(ctx.followingIds);
    if (set.has(row.creator_id)) return 1;
    if (row.opponent_id !== null && set.has(row.opponent_id)) return 1;
    return 0;
}

function topicScore(row: H7CompetitionSignals, counts: Map<string, number>): number | null {
    if (counts.size === 0) return null;
    const cat = (row.category_slug || '').toLowerCase();
    const sub = (row.subcategory_slug || '').toLowerCase();
    let best = 0;
    let total = 0;
    for (const n of counts.values()) total += Math.max(0, n);
    if (total <= 0) return null;
    for (const [slug, n] of counts) {
        if (slug === cat || (sub !== '' && slug === sub)) {
            best = Math.max(best, n / total);
        }
    }
    // Normalize against the top source share so a dominant category
    // scores 1 and a missing one scores 0 (true zero, not neutral).
    let top = 0;
    for (const n of counts.values()) top = Math.max(top, n / total);
    if (top <= 0) return null;
    return Math.min(1, best / top);
}

function interestsScore(row: H7CompetitionSignals, ctx: H7ViewerContext): number | null {
    if (ctx.userId === null) return null;
    const parts: Array<{ w: number; s: number | null }> = [];
    const cat = (row.category_slug || '').toLowerCase();
    const sub = (row.subcategory_slug || '').toLowerCase();
    const favSet = new Set(ctx.explicitFavs.map((s) => s.toLowerCase()));
    const hasFavSource = ctx.explicitFavs.length > 0;
    // Explicit choice is binary per card when the source exists at all;
    // a session-wide absence drops the 35% sub-weight (redistributed).
    parts.push({
        w: H7_INTEREST_MIX.explicit,
        s: !hasFavSource ? null : favSet.has(cat) || (sub !== '' && favSet.has(sub)) ? 1 : 0,
    });
    parts.push({ w: H7_INTEREST_MIX.watch, s: topicScore(row, ctx.watchedCategoryCounts) });
    parts.push({ w: H7_INTEREST_MIX.likes, s: topicScore(row, ctx.likedCategoryCounts) });
    parts.push({ w: H7_INTEREST_MIX.participations, s: topicScore(row, ctx.participationCategoryCounts) });
    const known = parts.filter((p) => p.s !== null) as Array<{ w: number; s: number }>;
    if (known.length === 0) return null;
    // Within-block redistribution over known sources (§5).
    const den = known.reduce((a, p) => a + p.w, 0);
    if (den <= 0) return null;
    return known.reduce((a, p) => a + (p.w / den) * Math.min(1, Math.max(0, p.s)), 0);
}

function unwatchedScore(row: H7CompetitionSignals, ctx: H7ViewerContext): number | null {
    if (ctx.userId === null) {
        // Guests have no first-party history identity: the signal is
        // session-wide unknown => dropped + redistributed (never fabricated).
        return null;
    }
    return ctx.watchedIds.includes(row.id) ? 0 : 1;
}

function historyScore(
    row: H7CompetitionSignals,
    profiles: Map<number, { sum: number; count: number }>
): number | null {
    const sides: number[] = [];
    for (const uid of [row.creator_id, row.opponent_id]) {
        if (typeof uid !== 'number' || uid === null) continue;
        const p = profiles.get(uid);
        if (!p || p.count <= 0) continue;
        const sig = h7ProfileSignal(h7ProfileDisplay(p.sum, p.count));
        if (sig !== null) sides.push(sig);
    }
    if (sides.length === 0) return null;
    return sides.reduce((a, b) => a + b, 0) / sides.length;
}

export interface H7CardInput extends H7CompetitionSignals {
    nowMs: number;
}

/** Score one card on 0..100 with per-card weights (mixed views supported). */
export function h7ScoreCard(
    row: H7CardInput,
    ctx: H7ViewerContext,
    identity: H7Identity,
    bucket: H7StatusBucket,
    profiles: Map<number, { sum: number; count: number }>
): { score: number; breakdown: H7ScoreBreakdown } {
    const weights = bucket === 'mixed' ? h7WatchWeightsForCard(identity, row.status) : h7WatchWeights(identity, bucket);
    const q = h7Quality(row.stars_sum, row.total_views, row.likes_count, row.dislikes_count);
    const rec = h7RecencyOf(row, row.nowMs);
    const sub: Record<keyof H7ScoreBreakdown, number | null> = {
        interests: identity === 'guest' ? null : interestsScore(row, ctx),
        language: identity === 'guest' && !ctx.language ? null : langScore(row, ctx.language),
        country: countryScore(row, ctx.country),
        follow: identity === 'guest' ? null : followScore(row, ctx),
        quality: q,
        recency: rec,
        unwatched: unwatchedScore(row, ctx),
        history: historyScore(row, profiles),
    };
    // Session-wide unknown => drop + redistribute (§5). Per-candidate
    // lack inside a KNOWN session-wide signal => 0.5 neutral, except
    // measured zeros (follow=0, unwatched=0/1, quality/recency always
    // measured) which stay as measured.
    const scored: Array<{ w: number; s: number }> = [];
    const breakdown = {} as H7ScoreBreakdown;
    (Object.keys(weights) as Array<keyof H7ScoreBreakdown>).forEach((key) => {
        const w = weights[key];
        if (w <= 0) {
            breakdown[key] = 0;
            return;
        }
        const v = sub[key];
        if (v === null) {
            // Unknown for the whole session (e.g. guest country, guest
            // history, empty interest vectors): skip, redistribute.
            return;
        }
        let s = v;
        if ((key === 'language' || key === 'country' || key === 'interests') && v === H7_NEUTRAL) {
            s = H7_NEUTRAL;
        }
        breakdown[key] = w * s;
        scored.push({ w, s });
    });
    const availableW = scored.reduce((a, p) => a + p.w, 0);
    if (availableW <= 0) return { score: 0, breakdown };
    const score = (100 * scored.reduce((a, p) => a + p.w * p.s, 0)) / availableW;
    return { score: Math.min(100, Math.max(0, score)), breakdown };
}

/** Deterministic ordering: score desc, recency desc, id asc (stable, no random). */
export function h7OrderScored<T extends { id: number; score: number; recency: number }>(items: T[]): T[] {
    return [...items].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.recency !== a.recency) return b.recency - a.recency;
        return a.id - b.id;
    });
}

/**
 * Discovery + diversity pass (§6), frozen once at T0.
 * - Up to 2/10 discovery (one new + one low-views) when qualifiers exist,
 *   chosen within filters/eligibility (callers pass eligible-only lists),
 *   never the lowest-quality random draw.
 * - Max 2 cards per competitor per 10 with alternatives; relaxed at
 *   exhaustion so no eligible card is ever deleted.
 * - Discovery choice randomness: single WebCrypto draw at build time
 *   (frozen thereafter). Falls back to deterministic take when WebCrypto
 *   is unavailable (never Math.random).
 */
export function h7ApplyDiscoveryDiversity<T extends { id: number; creator_id: number; opponent_id: number | null; created_at: string | null; total_views: number }>(
    ordered: T[],
    nowMs: number
): T[] {
    if (ordered.length <= 10) return enforceDiversity(ordered);
    const isNew = (r: T): boolean => {
        if (!r.created_at) return false;
        const ms = Date.parse(r.created_at);
        if (!Number.isFinite(ms)) return false;
        return nowMs - ms <= H7_DISCOVERY.newWindowDays * 86_400_000;
    };
    const isLow = (r: T): boolean => (Number(r.total_views) || 0) <= H7_DISCOVERY.lowViewsMax;
    const baseIds = new Set(ordered.map((r) => r.id));
    void baseIds;
    const out: T[] = [];
    const used = new Set<number>();
    const pickOne = (pred: (r: T) => boolean): T | null => {
        const cands = ordered.filter((r) => !used.has(r.id) && pred(r));
        if (cands.length === 0) return null;
        const idx = secureIndex(cands.length);
        const pick = cands[idx] as T;
        used.add(pick.id);
        return pick;
    };
    let cursor = 0;
    const takeNextBase = (): T | null => {
        while (cursor < ordered.length) {
            const r = ordered[cursor] as T;
            cursor++;
            if (used.has(r.id)) continue;
            used.add(r.id);
            return r;
        }
        return null;
    };
    while (out.length < ordered.length) {
        const windowStart = out.length;
        const windowEnd = windowStart + 10;
        // 8 base slots first (stable H7 order), then up to 2 discovery.
        for (let i = 0; i < 8 && out.length < windowEnd && out.length < ordered.length; i++) {
            const nxt = takeNextBase();
            if (!nxt) break;
            out.push(nxt);
        }
        if (out.length >= ordered.length) break;
        const fresh = pickOne((r) => isNew(r));
        if (fresh && out.length < windowEnd) out.push(fresh);
        const low = pickOne((r) => isLow(r) && (!fresh || r.id !== fresh.id));
        if (low && out.length < windowEnd) out.push(low);
        while (out.length < windowEnd && out.length < ordered.length) {
            const nxt = takeNextBase();
            if (!nxt) break;
            out.push(nxt);
        }
    }
    return enforceDiversity(out);
}

function enforceDiversity<T extends { id: number; creator_id: number; opponent_id: number | null }>(list: T[]): T[] {
    if (list.length <= H7_DIVERSITY.window) return list;
    // When more than one competitor exists in the whole set, cap each
    // competitor at 2 cards per rolling 10 from the very start (a leading
    // run of one creator is still deferred while alternatives exist).
    const distinct = new Set<number>();
    for (const r of list) {
        distinct.add(r.creator_id);
        if (r.opponent_id !== null) distinct.add(r.opponent_id);
    }
    if (distinct.size <= 1) return list;
    const out: T[] = [];
    const deferred: T[] = [];
    const windowCount = (arr: T[], start: number, uid: number): number => {
        let n = 0;
        for (let i = Math.max(0, start); i < arr.length; i++) {
            const r = arr[i] as T;
            if (r.creator_id === uid || r.opponent_id === uid) n++;
        }
        return n;
    };
    for (const r of list) {
        const start = Math.max(0, out.length - (H7_DIVERSITY.window - 1));
        const creatorHits = windowCount(out, start, r.creator_id);
        const opponentHits = r.opponent_id === null ? 0 : windowCount(out, start, r.opponent_id);
        if (creatorHits >= H7_DIVERSITY.perTen || opponentHits >= H7_DIVERSITY.perTen) {
            deferred.push(r);
            continue;
        }
        out.push(r);
    }
    // Relaxation at exhaustion: deferred cards append in stable order —
    // delayed, never deleted (§6).
    out.push(...deferred);
    return out;
}

function secureIndex(n: number): number {
    if (n <= 1) return 0;
    try {
        const buf = new Uint32Array(1);
        crypto.getRandomValues(buf);
        return Number((buf[0] as number) % n);
    } catch {
        return 0;
    }
}

/** Search scoring inside one text layer (§4: text 60, topic 15, Q 10, lang 5, country 5, recency 5). */
export function h7SearchScore(
    row: H7CardInput,
    ctx: H7ViewerContext,
    topicRelevance: number
): number {
    const q = h7Quality(row.stars_sum, row.total_views, row.likes_count, row.dislikes_count);
    const rec = h7RecencyOf(row, row.nowMs);
    const lang = langScore(row, ctx.language);
    const country = countryScore(row, ctx.country);
    const text = 1;
    const parts: Array<{ w: number; s: number | null }> = [
        { w: H7_SEARCH_WEIGHTS.text, s: text },
        { w: H7_SEARCH_WEIGHTS.topic, s: topicRelevance },
        { w: H7_SEARCH_WEIGHTS.quality, s: q },
        { w: H7_SEARCH_WEIGHTS.language, s: lang },
        { w: H7_SEARCH_WEIGHTS.country, s: country },
        { w: H7_SEARCH_WEIGHTS.recency, s: rec },
    ];
    const known = parts.filter((p) => p.s !== null) as Array<{ w: number; s: number }>;
    if (known.length === 0) return 0;
    return h7Redistribute(known.map(({ w, s }) => ({ w, s: s === H7_NEUTRAL ? H7_NEUTRAL : s })));
}

/** Topic relevance for search/similar: category/subcategory match vs query scope. */
export function h7TopicRelevance(
    row: H7CompetitionSignals,
    scopeCategory: string,
    scopeSubcategory: string,
    ctx: H7ViewerContext
): number {
    if (scopeSubcategory !== '') {
        const sub = (row.subcategory_slug || '').toLowerCase();
        if (sub === scopeSubcategory.toLowerCase()) return 1;
        const cat = (row.category_slug || '').toLowerCase();
        if (cat === scopeCategory.toLowerCase() && scopeCategory !== '') return 0.5;
        return 0;
    }
    if (scopeCategory !== '') {
        const cat = (row.category_slug || '').toLowerCase();
        if (cat === scopeCategory.toLowerCase()) return 1;
        return 0;
    }
    // No topic scope: fall back to viewer interests (0.5 neutral when unknown).
    if (ctx.userId === null) return H7_NEUTRAL;
    const s = interestsScore(row, ctx);
    return s === null ? H7_NEUTRAL : s;
}

/** Similar scoring (§4: topic 45, text 15, lang 10, country 5, Q 15, recency 10). */
export function h7SimilarScore(
    row: H7CardInput,
    ref: H7CompetitionSignals,
    ctx: H7ViewerContext
): number {
    const sameSub = (row.subcategory_slug || '') !== '' && row.subcategory_slug === ref.subcategory_slug;
    const sameCat = (row.category_slug || '') !== '' && row.category_slug === ref.category_slug;
    const topic = sameSub ? 1 : sameCat ? 0.6 : 0;
    const text = h7TitleSimilarity(row.title || '', ref.title || '');
    const q = h7Quality(row.stars_sum, row.total_views, row.likes_count, row.dislikes_count);
    const rec = h7RecencyOf(row, row.nowMs);
    const lang = langScore(row, ctx.language);
    const country = countryScore(row, ctx.country);
    const parts: Array<{ w: number; s: number | null }> = [
        { w: H7_SIMILAR_WEIGHTS.topic, s: topic },
        { w: H7_SIMILAR_WEIGHTS.text, s: text },
        { w: H7_SIMILAR_WEIGHTS.language, s: lang },
        { w: H7_SIMILAR_WEIGHTS.country, s: country },
        { w: H7_SIMILAR_WEIGHTS.quality, s: q },
        { w: H7_SIMILAR_WEIGHTS.recency, s: rec },
    ];
    const known = parts.filter((p) => p.s !== null) as Array<{ w: number; s: number }>;
    if (known.length === 0) return 0;
    return h7Redistribute(known);
}

export { h7SearchLayer, h7Balance as h7B };

export default { h7ScoreCard };
