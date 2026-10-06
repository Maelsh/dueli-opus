/**
 * User Session Service — R3-D2 frozen user result sessions.
 * خدمة جلسات نتائج المستخدمين
 *
 * Reuses the B7/D1 session store (explore_result_sessions +
 * explore_result_chunks), the same cursor format/TTL/identity helpers and
 * the same skip-fill + exhaustion semantics as ExploreSessionService —
 * extended to USER id lists (the competition reader hydrates competitions
 * and cannot hydrate users, so the page-read half is mirrored here for
 * users while the store, cursor, TTL and failure vocabulary stay shared).
 *
 * Rules (§7):
 * - Full eligible id set frozen at T0 (no first-15/100 cap).
 * - Frozen order during one session; a new session recalculates.
 * - Presence/busy changes after T0 NEVER reorder an old scroll (ranking
 *   snapshot); hard-eligibility loss (block/deactivation/self) is skipped
 *   and the batch fills from later positions.
 * - No duplicates, full exhaustion, no RANDOM+OFFSET, no Math.random,
 *   no client-only final ranking.
 */

import {
    ExploreResultSessionModel,
    type ExploreIdentityKind,
} from '../../models/ExploreResultSessionModel';
import { ExploreResultChunkModel } from '../../models/ExploreResultChunkModel';
import { UserSignalsModel, type UserSignalRow } from '../../models/UserSignalsModel';
import {
    ExploreSessionService,
    EXPLORE_CHUNK_SIZE,
    EXPLORE_MAX_PAGE_LIMIT,
    EXPLORE_DEFAULT_PAGE_LIMIT,
    EXPLORE_MAX_SCAN_PER_PAGE,
    EXPLORE_SESSION_TTL_SECONDS,
    type ExploreIdentity,
    type ExploreSessionFailure,
} from './ExploreSessionService';

export interface UserSessionProvider {
    readonly surface: string;
    contextKey(): string;
    buildOrderedIds(db: D1Database, lang: string): Promise<number[]>;
    /** Hard-eligibility re-check at READ time (security/permission only). */
    isEligibleUser(row: UserSignalRow): boolean;
}

export interface UserPage {
    items: UserSignalRow[];
    nextCursor: string | null;
    hasMore: boolean;
    session: { id: string; total: number; expires_at: string };
}

export class UserSessionService {
    protected readonly db: D1Database;

    constructor(db: D1Database) {
        this.db = db;
    }

    static identityForCreate = ExploreSessionService.identityForCreate;
    static identityForRead = ExploreSessionService.identityForRead;
    static encodeCursor = ExploreSessionService.encodeCursor;
    static decodeCursor = ExploreSessionService.decodeCursor;
    static isValidGuestToken = ExploreSessionService.isValidGuestToken;

    async createSessionWithProvider(
        identity: ExploreIdentity,
        provider: UserSessionProvider,
        lang: string
    ): Promise<{ session: { id: string; total_count: number; expires_at: string } }> {
        const sessionModel = new ExploreResultSessionModel(this.db);
        const chunkModel = new ExploreResultChunkModel(this.db);
        try {
            await sessionModel.deleteExpired();
        } catch {
            // Best-effort hygiene; the build below stays authoritative.
        }
        const frozen = await provider.buildOrderedIds(this.db, lang);
        const session = await sessionModel.create({
            surface: provider.surface,
            identityKind: identity.kind as ExploreIdentityKind,
            identityKey: identity.key,
            filtersCanonical: provider.contextKey(),
            lang,
            chunkSize: EXPLORE_CHUNK_SIZE,
            ttlSeconds: EXPLORE_SESSION_TTL_SECONDS,
        });
        await chunkModel.saveAll(session.id, frozen, EXPLORE_CHUNK_SIZE);
        await sessionModel.markReady(session.id, frozen.length);
        const ready = await sessionModel.findById(session.id);
        if (!ready) throw new Error('user session vanished during build');
        return { session: ready };
    }

    async readPageWithProvider(
        identity: ExploreIdentity | null,
        sessionId: string,
        options: {
            cursor?: string | null;
            limit?: unknown;
            provider: UserSessionProvider;
            lang?: string;
            maxScan?: number;
        }
    ): Promise<{ page: UserPage } | { failure: ExploreSessionFailure }> {
        const sessionModel = new ExploreResultSessionModel(this.db);
        if (identity === null) return { failure: 'session_not_found' };
        const session = await sessionModel.findFreshById(sessionId);
        if (!session) {
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
        const limit =
            limitRaw === undefined || limitRaw === null || limitRaw === ''
                ? EXPLORE_DEFAULT_PAGE_LIMIT
                : Number(limitRaw);
        if (!Number.isInteger(limit) || limit < 1) return { failure: 'bad_limit' };
        const take = Math.min(limit, EXPLORE_MAX_PAGE_LIMIT);

        const decoded = ExploreSessionService.decodeCursor(options.cursor ?? null, session.id);
        if ('failure' in decoded) return { failure: decoded.failure };
        const total = session.total_count;
        if (decoded.pos >= total) {
            return {
                page: {
                    items: [],
                    nextCursor: null,
                    hasMore: false,
                    session: { id: session.id, total, expires_at: session.expires_at },
                },
            };
        }
        const maxScan =
            typeof options.maxScan === 'number' && options.maxScan > 0
                ? Math.floor(options.maxScan)
                : EXPLORE_MAX_SCAN_PER_PAGE;
        const chunkModel = new ExploreResultChunkModel(this.db);
        const signals = new UserSignalsModel(this.db);
        const windowEnd = Math.min(total, decoded.pos + maxScan);
        const window = await chunkModel.loadRange(session.id, decoded.pos, windowEnd, session.chunk_size);
        const cards = await signals.loadUsers(window);
        const byId = new Map<number, UserSignalRow>();
        for (const card of cards) byId.set(card.id, card);

        const items: UserSignalRow[] = [];
        let examined = 0;
        for (const id of window) {
            if (items.length >= take) break;
            examined += 1;
            const row = byId.get(id) ?? null;
            if (!row || !options.provider.isEligibleUser(row)) {
                continue;
            }
            items.push(row);
        }
        const endPos = decoded.pos + examined;
        const exhausted = endPos >= total;
        return {
            page: {
                items,
                nextCursor: exhausted ? null : ExploreSessionService.encodeCursor(session.id, endPos),
                hasMore: !exhausted,
                session: { id: session.id, total, expires_at: session.expires_at },
            },
        };
    }
}

export default UserSessionService;
