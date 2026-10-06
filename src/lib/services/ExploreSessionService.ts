/**
 * Explore Session Service — shared stable-result-session engine.
 * خدمة جلسات النتائج المشتركة
 *
 * R3-B7 decision (05 §4 “ترتيب محفوظ في جلسة نتائج D1”, a technical
 * implementation guide — the ranking coefficients stay OPEN H):
 *
 * - A session freezes ONE ordered id list at creation (T0) in bounded D1
 *   chunks. B7 freezes the CURRENT Explore shuffle exactly once: the same
 *   eligible set + one Fisher–Yates pass with WebCrypto randomness (never
 *   Math.random in this security-adjacent context, never ORDER BY RANDOM()
 *   per batch). D1/D2 — and R3-GUEST-1 — swap ONLY the ordering/eligibility
 *   provider and reuse this same store + cursor — no second browsing engine.
 * - Page reads walk the frozen snapshot with an opaque cursor
 *   ({sid, v, pos} base64url — Base64 is encoding, NOT the guard; the guard
 *   is the server-side session + identity + context binding), hydrate cards,
 *   re-check eligibility per row, and skip-and-fill from later positions
 *   until the batch is full or the snapshot is proven exhausted.
 * - hasMore/nextCursor derive from REAL snapshot progress (endPos vs total),
 *   never from client dedup or short-batch inference. hasMore=false only at
 *   the true end of this session's eligible set.
 * - Refresh / filter / language / identity drift always separate sessions:
 *   arrivals after T0 surface only in a newly created session; lost
 *   eligibility vanishes immediately (skip, never resurrected for retry).
 *
 * No `#private` fields (Cloudflare Workers compat). All SQL lives in the
 * Models; the Controller only calls this service (MVC).
 */
import { CompetitionModel, type CompetitionFilters, type CompetitionWithDetails } from '../../models/CompetitionModel';
import {
    ExploreResultSessionModel,
    type ExploreIdentityKind,
    type ExploreResultSession,
} from '../../models/ExploreResultSessionModel';
import { ExploreResultChunkModel } from '../../models/ExploreResultChunkModel';
import { CATEGORY_SUBCATEGORIES } from '../../shared/constants';

/** The only surface B7 ships; D1/D2 add their own surface names later. */
export const EXPLORE_SURFACE = 'explore_competitions';

/** Technical TTL of a result session (configurable, lazy-enforced, no cron). */
export const EXPLORE_SESSION_TTL_SECONDS = 1800;

/** Ids per chunk row — 1200 eligible rows land in 12 chunk rows. */
export const EXPLORE_CHUNK_SIZE = 100;

export const EXPLORE_DEFAULT_PAGE_LIMIT = 12;
export const EXPLORE_MAX_PAGE_LIMIT = 50;

/**
 * Snapshot positions scanned per page at most. A page that cannot fill its
 * batch within this window returns a PARTIAL batch with an ADVANCED cursor
 * and hasMore=true (continuation) — the client keeps paging, never stops
 * early and never loops on the same position.
 */
export const EXPLORE_MAX_SCAN_PER_PAGE = 2000;

export interface ExploreCanonicalFilters {
    search: string;
    category: string;
    subcategory: string;
    status: string;
}

/**
 * R3-EXPLORE-CONTEXT-1: taxonomy helpers over the canonical
 * CATEGORY_SUBCATEGORIES map (the same source Home rails and seeds use).
 * Slugs only — translated display names are never identifiers.
 */
export function parentOfSubcategory(subcategory: string): string {
    for (const parent of Object.keys(CATEGORY_SUBCATEGORIES)) {
        const children = CATEGORY_SUBCATEGORIES[parent];
        if (children && children.indexOf(subcategory) !== -1) return parent;
    }
    return '';
}

export function isKnownSubcategory(subcategory: string): boolean {
    return subcategory !== '' && parentOfSubcategory(subcategory) !== '';
}

export interface ExploreIdentity {
    kind: ExploreIdentityKind;
    key: string;
}

export type ExploreSessionFailure =
    | 'session_not_found'
    | 'session_expired'
    | 'session_building'
    | 'session_context_mismatch'
    | 'bad_cursor'
    | 'bad_limit'
    | 'bad_identity';

export interface ExploreSessionStats {
    buildMs?: number;
    candidates?: number;
    chunks?: number;
    readMs?: number;
    scanned?: number;
    skipped?: number;
}

export interface ExplorePage {
    items: CompetitionWithDetails[];
    nextCursor: string | null;
    hasMore: boolean;
    session: { id: string; total: number; expires_at: string };
}

/**
 * R3-GUEST-1: the ONLY swappable seam of the session engine (05 §4: D1/D2
 * replace the ordering/eligibility provider and reuse the same store +
 * cursor). A provider owns: which surface the session belongs to, the
 * canonical session identity, the full ordered id set at T0, and the live
 * per-row eligibility re-check. Everything else — chunks, cursor, TTL,
 * identity binding, hasMore semantics — stays in this service, once.
 */
export interface ResultSessionProvider {
    readonly surface: string;
    contextKey(): string;
    buildOrderedIds(db: D1Database, lang: string): Promise<number[]>;
    isEligible(row: CompetitionWithDetails): boolean;
}

/**
 * The Explore provider (R3-D1 h7-v1): same eligible set as the listing,
 * ordered with the approved weights and frozen once at T0.
 * - No search: Guest/User × status watch weights (§2); mixed-status views
 *   score each card with its own status weights on the same 0–100 scale.
 * - With search: text layers exact → prefix/whole-word → partial/description
 *   first (§4); in-layer order is the H7 search score (text 60, topic 15,
 *   Q 10, lang 5, country 5, recency 5). Empty search falls back to the
 *   watch browsing above. Fame never buries a higher textual layer.
 */
export class ExploreResultProvider implements ResultSessionProvider {
    readonly surface = EXPLORE_SURFACE;
    private readonly canonical: ExploreCanonicalFilters;
    private readonly userId: number | null;

    constructor(rawFilters: { search?: unknown; category?: unknown; subcategory?: unknown; status?: unknown }, userId?: number | null) {
        this.canonical = ExploreSessionService.canonicalizeFilters(rawFilters);
        this.userId = typeof userId === 'number' && Number.isInteger(userId) && userId > 0 ? userId : null;
    }

    contextKey(): string {
        return ExploreSessionService.canonicalKey(this.canonical);
    }

    async buildOrderedIds(db: D1Database, lang: string): Promise<number[]> {
        const { H7SignalsModel } = await import('../../models/H7SignalsModel');
        const ranking = await import('./H7RankingService');
        const policy = await import('./H7RankingPolicy');
        const modelFilters: CompetitionFilters = {};
        if (this.canonical.status !== '') {
            modelFilters.status = this.canonical.status as CompetitionFilters['status'];
        }
        if (this.canonical.category !== '') modelFilters.category = this.canonical.category;
        if (this.canonical.subcategory !== '') modelFilters.subcategory = this.canonical.subcategory;
        if (this.canonical.search !== '') modelFilters.search = this.canonical.search;
        // Recorded = completed WITH a playable recording (Home media contract),
        // enforced server-side before pagination — never client filtering.
        if (this.canonical.status === 'recorded') modelFilters.playableRecording = true;
        // The FULL eligible set — no LIMIT, no total cap, one correlated read.
        const eligible = await new CompetitionModel(db).findEligibleIds(modelFilters);
        if (eligible.length === 0) return [];
        const signalsModel = new H7SignalsModel(db);
        const rows = await signalsModel.loadCompetitions(eligible);
        const ctx = await signalsModel.loadViewerContext(db, this.userId, lang, null);
        const nowMs = Date.now();
        if (this.canonical.search !== '') {
            const q = this.canonical.search;
            const layered = rows.map((r) => ({
                row: r,
                layer: policy.h7SearchLayer(r.title || '', r.description ?? null, q),
            }));
            const byLayer = new Map<number, typeof layered>();
            for (const item of layered) {
                const arr = byLayer.get(item.layer) ?? [];
                arr.push(item);
                byLayer.set(item.layer, arr);
            }
            const out: number[] = [];
            for (const layer of [0, 1, 2, 3]) {
                const group = byLayer.get(layer) ?? [];
                if (group.length === 0) continue;
                const scored = group.map(({ row }) => ({
                    id: row.id,
                    score: ranking.h7SearchScore(
                        { ...row, nowMs },
                        ctx,
                        ranking.h7TopicRelevance(row, this.canonical.category, this.canonical.subcategory, ctx)
                    ),
                    recency: policy.h7RecencyOf({ ...row }, nowMs),
                    row,
                }));
                const ordered = ranking.h7OrderScored(scored);
                const diverse = ranking.h7ApplyDiscoveryDiversity(
                    ordered.map((s) => ({
                        id: s.id,
                        creator_id: s.row.creator_id,
                        opponent_id: s.row.opponent_id,
                        created_at: s.row.created_at,
                        total_views: s.row.total_views,
                    })),
                    nowMs
                );
                // Diverse sequence is authoritative within the layer.
                const rank = new Map(diverse.map((d, i) => [d.id, i] as [number, number]));
                const layerIds = diverse.map((d) => d.id).sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
                out.push(...layerIds);
            }
            return out;
        }
        const uids: number[] = [];
        for (const r of rows) {
            uids.push(r.creator_id);
            if (r.opponent_id !== null) uids.push(r.opponent_id);
        }
        const profiles = await signalsModel.loadProfiles(uids);
        const identity = this.userId === null ? 'guest' : 'user';
        const bucket = this.canonical.status === 'live' || this.canonical.status === 'recorded' || this.canonical.status === 'upcoming'
            ? this.canonical.status
            : 'mixed';
        const scored = rows.map((r) => {
            const { score } = ranking.h7ScoreCard({ ...r, nowMs }, ctx, identity, bucket, profiles);
            return { id: r.id, score, recency: policy.h7RecencyOf({ ...r }, nowMs), row: r };
        });
        const ordered = ranking.h7OrderScored(scored);
        const diverse = ranking.h7ApplyDiscoveryDiversity(
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
        return ExploreSessionService.matchesFilters(row, this.canonical);
    }
}

interface ExploreCursorPayload {
    v: 1;
    sid: string;
    pos: number;
}

const GUEST_TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const KNOWN_STATUSES = new Set(['live', 'recorded', 'upcoming', 'pending', 'accepted', 'completed']);

function base64UrlEncode(raw: string): string {
    return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(raw: string): string | null {
    try {
        const padded = raw.replace(/-/g, '+').replace(/_/g, '/');
        return atob(padded);
    } catch {
        return null;
    }
}

export class ExploreSessionService {
    protected readonly db: D1Database;

    constructor(db: D1Database) {
        this.db = db;
    }

    // ------------------------------------------------------------------
    // Pure helpers (no I/O — unit-testable, reusable for D1/D2 surfaces)
    // ------------------------------------------------------------------

    static canonicalizeFilters(raw: { search?: unknown; category?: unknown; subcategory?: unknown; status?: unknown }): ExploreCanonicalFilters {
        const search = String(raw.search ?? '').trim().slice(0, 100);
        const category = String(raw.category ?? '').trim().toLowerCase().slice(0, 64);
        const subcategory = String(raw.subcategory ?? '').trim().toLowerCase().slice(0, 64);
        const statusRaw = String(raw.status ?? '').trim().toLowerCase();
        const canonical: ExploreCanonicalFilters = {
            search,
            category,
            subcategory,
            status: KNOWN_STATUSES.has(statusRaw) ? statusRaw : '',
        };
        // A valid subcategory with no parent canonicalizes to its known
        // parent (contract §9.5) — so ?subcategory=physics behaves as
        // science+physics everywhere, server and client alike.
        if (canonical.category === '' && isKnownSubcategory(canonical.subcategory)) {
            canonical.category = parentOfSubcategory(canonical.subcategory);
        }
        return canonical;
    }

    static canonicalKey(filters: ExploreCanonicalFilters): string {
        return JSON.stringify([filters.search, filters.category, filters.subcategory, filters.status]);
    }

    /**
     * R3-EXPLORE-CONTEXT-1 pair validation (contract §9.5): an unknown
     * subcategory, or a subcategory that belongs to a different parent, is
     * REJECTED (422/409 upstream) — never silently widened to All.
     * Returns an error token, or null when the pair is usable.
     */
    static validateExplorePair(filters: ExploreCanonicalFilters): string | null {
        if (filters.subcategory === '') return null;
        const parent = parentOfSubcategory(filters.subcategory);
        if (parent === '') return 'unknown_subcategory';
        if (filters.category !== '' && filters.category !== parent) {
            return 'subcategory_parent_mismatch';
        }
        return null;
    }

    static isValidGuestToken(token: string | null | undefined): token is string {
        return typeof token === 'string' && GUEST_TOKEN_PATTERN.test(token);
    }

    static issueGuestToken(): string {
        return crypto.randomUUID();
    }

    /**
     * Creation-time identity: the logged-in user wins; else the presented
     * guest token; else a freshly issued first-party guest token (never IP).
     */
    static identityForCreate(
        userId: number | null,
        guestToken: string | null
    ): { identity: ExploreIdentity; issuedGuestToken: string | null } {
        if (typeof userId === 'number' && Number.isInteger(userId) && userId > 0) {
            return { identity: { kind: 'user', key: `user:${userId}` }, issuedGuestToken: null };
        }
        if (ExploreSessionService.isValidGuestToken(guestToken)) {
            return { identity: { kind: 'guest', key: `guest:${guestToken}` }, issuedGuestToken: null };
        }
        const issued = ExploreSessionService.issueGuestToken();
        return { identity: { kind: 'guest', key: `guest:${issued}` }, issuedGuestToken: issued };
    }

    /** Read-time identity: strict, never issues (a stranger stays a stranger). */
    static identityForRead(userId: number | null, guestToken: string | null): ExploreIdentity | null {
        if (typeof userId === 'number' && Number.isInteger(userId) && userId > 0) {
            return { kind: 'user', key: `user:${userId}` };
        }
        if (ExploreSessionService.isValidGuestToken(guestToken)) {
            return { kind: 'guest', key: `guest:${guestToken}` };
        }
        return null;
    }

    static encodeCursor(sessionId: string, pos: number): string {
        const payload: ExploreCursorPayload = { v: 1, sid: sessionId, pos };
        return base64UrlEncode(JSON.stringify(payload));
    }

    static decodeCursor(raw: string | null | undefined, sessionId: string): { pos: number } | { failure: 'bad_cursor' } {
        if (raw === null || raw === undefined || raw === '') return { pos: 0 };
        if (typeof raw !== 'string' || raw.length > 500) return { failure: 'bad_cursor' };
        const text = base64UrlDecode(raw);
        if (text === null) return { failure: 'bad_cursor' };
        let parsed: unknown = null;
        try {
            parsed = JSON.parse(text);
        } catch {
            return { failure: 'bad_cursor' };
        }
        if (
            typeof parsed !== 'object' || parsed === null ||
            (parsed as { v?: unknown }).v !== 1 ||
            (parsed as { sid?: unknown }).sid !== sessionId
        ) {
            return { failure: 'bad_cursor' };
        }
        const pos = (parsed as { pos?: unknown }).pos;
        if (typeof pos !== 'number' || !Number.isInteger(pos) || pos < 0) return { failure: 'bad_cursor' };
        return { pos };
    }

    /**
     * Single Fisher–Yates pass with WebCrypto randomness — the ONE frozen
     * shuffle standing in for the current ORDER BY RANDOM() semantics.
     * D1/D2 replace this ordering step with their approved provider.
     */
    static freezeShuffle(ids: number[]): number[] {
        const out = [...ids];
        if (out.length < 2) return out;
        const rand = new Uint32Array(out.length);
        crypto.getRandomValues(rand);
        for (let i = out.length - 1; i > 0; i--) {
            const j = Number(rand[i] % (i + 1));
            const tmp = out[i] as number;
            out[i] = out[j] as number;
            out[j] = tmp;
        }
        return out;
    }

    /**
     * Live eligibility re-check mirroring the SQL predicate in
     * CompetitionModel.buildFilterWhere for the B7 canonical subset.
     * A row that no longer matches (deleted rows never reach here) is
     * skipped and the batch fills from later snapshot positions.
     */
    static matchesFilters(row: CompetitionWithDetails, filters: ExploreCanonicalFilters): boolean {
        if (filters.status !== '') {
            const s = row.status;
            if (filters.status === 'recorded') {
                if (s !== 'completed') return false;
                if (!ExploreSessionService.hasPlayableRecording(row)) return false;
            } else if (filters.status === 'completed') {
                if (s !== 'completed') return false;
            } else if (filters.status === 'live') {
                if (s !== 'live') return false;
            } else if (filters.status === 'pending') {
                if (s !== 'pending') return false;
            } else if (filters.status === 'accepted') {
                if (s !== 'accepted') return false;
            } else if (filters.status === 'upcoming') {
                if (s !== 'pending' && s !== 'accepted') return false;
            }
        }
        if (filters.category !== '') {
            const cat = filters.category;
            const byId = String(row.category_id) === cat || String(row.subcategory_id ?? '') === cat;
            if (!byId && row.category_slug !== cat) return false;
        }
        if (filters.subcategory !== '') {
            if (row.subcategory_slug !== filters.subcategory) return false;
        }
        if (filters.search !== '') {
            const q = filters.search.toLowerCase();
            const inTitle = row.title.toLowerCase().includes(q);
            const record = row as CompetitionWithDetails & { description?: string | null };
            const inDesc = (record.description || '').toLowerCase().includes(q);
            if (!inTitle && !inDesc) return false;
        }
        return true;
    }

    /**
     * Playable-recording predicate shared with the SQL gate above (and the
     * Home rail twin in CompetitionModel.findHomeRailIds): a trimmed vod_url
     * OR youtube_video_url. Null/empty/whitespace-only never counts.
     */
    static hasPlayableRecording(row: CompetitionWithDetails): boolean {
        const media = row as CompetitionWithDetails & {
            vod_url?: string | null;
            youtube_video_url?: string | null;
        };
        return (
            String(media.vod_url ?? '').trim() !== '' ||
            String(media.youtube_video_url ?? '').trim() !== ''
        );
    }

    // ------------------------------------------------------------------
    // Session lifecycle (provider-driven core + B7-compatible wrappers)
    // ------------------------------------------------------------------

    /**
     * Generic build: the provider supplies the full ordered id set; this
     * method persists it as bounded chunks and flips building → ready only
     * afterwards, so a partial snapshot is never exposed as complete.
     */
    async createSessionWithProvider(
        identity: ExploreIdentity,
        provider: ResultSessionProvider,
        lang: string,
        stats: ExploreSessionStats = {}
    ): Promise<{ session: ExploreResultSession }> {
        const started = Date.now();
        const sessionModel = new ExploreResultSessionModel(this.db);
        const chunkModel = new ExploreResultChunkModel(this.db);

        try {
            await sessionModel.deleteExpired();
        } catch {
            // Lazy hygiene is best-effort; the build below stays authoritative.
        }

        const frozen = await provider.buildOrderedIds(this.db, lang);

        const session = await sessionModel.create({
            surface: provider.surface,
            identityKind: identity.kind,
            identityKey: identity.key,
            filtersCanonical: provider.contextKey(),
            lang,
            chunkSize: EXPLORE_CHUNK_SIZE,
            ttlSeconds: EXPLORE_SESSION_TTL_SECONDS,
        });
        const chunks = await chunkModel.saveAll(session.id, frozen, EXPLORE_CHUNK_SIZE);
        await sessionModel.markReady(session.id, frozen.length);
        const ready = await sessionModel.findById(session.id);
        if (!ready) throw new Error('result session vanished during build');

        stats.buildMs = Date.now() - started;
        stats.candidates = frozen.length;
        stats.chunks = chunks;
        return { session: ready };
    }

    async createSession(
        identity: ExploreIdentity,
        rawFilters: { search?: unknown; category?: unknown; subcategory?: unknown; status?: unknown },
        uiLang: string,
        stats: ExploreSessionStats = {}
    ): Promise<{ session: ExploreResultSession }> {
        return this.createSessionWithProvider(
            identity,
            new ExploreResultProvider(rawFilters),
            uiLang,
            stats
        );
    }

    /**
     * Generic page read over any provider's frozen snapshot. The provider is
     * supplied by the calling endpoint (which owns the surface) and must
     * match the stored session surface — a cursor can never wander across
     * surfaces.
     */
    async readPageWithProvider(
        identity: ExploreIdentity | null,
        sessionId: string,
        options: {
            cursor?: string | null;
            limit?: unknown;
            provider: ResultSessionProvider;
            lang?: string;
            maxScan?: number;
        },
        stats: ExploreSessionStats = {}
    ): Promise<{ page: ExplorePage } | { failure: ExploreSessionFailure }> {
        const started = Date.now();
        const sessionModel = new ExploreResultSessionModel(this.db);

        if (identity === null) return { failure: 'session_not_found' };
        const session = await sessionModel.findFreshById(sessionId);
        if (!session) {
            // Distinguish “never existed / foreign” (404, enumeration-safe)
            // from “existed but lapsed” (410 refresh signal).
            const stale = await sessionModel.findById(sessionId);
            if (stale) {
                if (stale.identity_kind !== identity.kind || stale.identity_key !== identity.key) {
                    return { failure: 'session_not_found' };
                }
                try {
                    await sessionModel.deleteById(stale.id);
                } catch {
                    // Best-effort; the 410 below is what the client acts on.
                }
                return { failure: 'session_expired' };
            }
            return { failure: 'session_not_found' };
        }
        // Identity binding doubles as enumeration resistance: a foreign
        // identity learns nothing beyond “not found”.
        if (session.identity_kind !== identity.kind || session.identity_key !== identity.key) {
            return { failure: 'session_not_found' };
        }
        if (session.status !== 'ready') return { failure: 'session_building' };
        if (session.surface !== options.provider.surface) return { failure: 'session_not_found' };

        if (
            options.provider.contextKey() !== session.filters_canonical ||
            (options.lang ?? session.lang) !== session.lang
        ) {
            return { failure: 'session_context_mismatch' };
        }

        const limitRaw = options.limit;
        const limit = limitRaw === undefined || limitRaw === null || limitRaw === ''
            ? EXPLORE_DEFAULT_PAGE_LIMIT
            : Number(limitRaw);
        if (!Number.isInteger(limit) || limit < 1) return { failure: 'bad_limit' };
        const take = Math.min(limit, EXPLORE_MAX_PAGE_LIMIT);

        const decoded = ExploreSessionService.decodeCursor(options.cursor ?? null, session.id);
        if ('failure' in decoded) return { failure: decoded.failure };
        const total = session.total_count;
        if (decoded.pos >= total) {
            stats.readMs = Date.now() - started;
            stats.scanned = 0;
            stats.skipped = 0;
            return {
                page: {
                    items: [],
                    nextCursor: null,
                    hasMore: false,
                    session: { id: session.id, total, expires_at: session.expires_at },
                },
            };
        }

        const maxScan = typeof options.maxScan === 'number' && options.maxScan > 0
            ? Math.floor(options.maxScan)
            : EXPLORE_MAX_SCAN_PER_PAGE;
        const chunkModel = new ExploreResultChunkModel(this.db);
        const competitionModel = new CompetitionModel(this.db);
        const windowEnd = Math.min(total, decoded.pos + maxScan);
        const window = await chunkModel.loadRange(session.id, decoded.pos, windowEnd, session.chunk_size);
        const cards = await competitionModel.findByIds(window);
        const byId = new Map<number, CompetitionWithDetails>();
        for (const card of cards) byId.set(card.id, card);

        const items: CompetitionWithDetails[] = [];
        let examined = 0;
        let skipped = 0;
        for (const id of window) {
            if (items.length >= take) break;
            examined += 1;
            const row = byId.get(id) ?? null;
            if (!row || !options.provider.isEligible(row)) {
                skipped += 1;
                continue;
            }
            items.push(row);
        }
        const endPos = decoded.pos + examined;
        const exhausted = endPos >= total;

        stats.readMs = Date.now() - started;
        stats.scanned = examined;
        stats.skipped = skipped;
        return {
            page: {
                items,
                nextCursor: exhausted ? null : ExploreSessionService.encodeCursor(session.id, endPos),
                hasMore: !exhausted,
                session: { id: session.id, total, expires_at: session.expires_at },
            },
        };
    }

    async readPage(
        identity: ExploreIdentity | null,
        sessionId: string,
        options: {
            cursor?: string | null;
            limit?: unknown;
            filters?: { search?: unknown; category?: unknown; subcategory?: unknown; status?: unknown };
            uiLang?: string;
            maxScan?: number;
        },
        stats: ExploreSessionStats = {}
    ): Promise<{ page: ExplorePage } | { failure: ExploreSessionFailure }> {
        return this.readPageWithProvider(identity, sessionId, {
            cursor: options.cursor,
            limit: options.limit,
            maxScan: options.maxScan,
            provider: new ExploreResultProvider(options.filters ?? {}),
            lang: options.uiLang,
        }, stats);
    }
}

export default ExploreSessionService;
