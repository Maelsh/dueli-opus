/**
 * Matchmaking Controller (Task 10)
 * متحكم المطابقة والدعوات
 * 
 * MVC-compliant controller for the dynamic invite panel.
 * Serves online, available users ranked by recommendation compatibility.
 */

import { BaseController, AppContext } from './base/BaseController';

/**
 * Matchmaking Controller Class
 * متحكم المطابقة الديناميكي
 */
export class MatchmakingController extends BaseController {

    /**
     * Get online available users for invite panel
     * GET /api/matchmaking/online-users
     * 
     * Returns online available users ranked by recommendation compatibility.
     * Filters out:
     * - The caller themselves
     * - Users blocked by/blocking the caller
     * - Users who are currently busy (in live competition)
     * - Users already invited to the specified competition
     * 
     * Query params:
     * - competition_id (required): the competition to invite to
     * - limit: max results (default 20)
     * - offset: pagination offset (default 0)
     * - search: optional name/username search filter
     */
    async getOnlineUsers(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const db = c.env.DB;

            const competitionId = this.getQueryInt(c, 'competition_id');
            const limit = this.getQueryInt(c, 'limit', 20);
            const offset = this.getQueryInt(c, 'offset', 0);
            const search = this.getQuery(c, 'search');

            if (!competitionId) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }

            // Verify the caller is the competition creator
            const competition = await db.prepare(`
                SELECT c.id, c.creator_id, c.opponent_id, c.status, c.category_id,
                       c.subcategory_id, c.language, c.country,
                       cat.slug AS category_slug, subcat.slug AS subcategory_slug
                  FROM competitions c
                  JOIN categories cat ON c.category_id = cat.id
                  LEFT JOIN categories subcat ON c.subcategory_id = subcat.id
                 WHERE c.id = ?
            `).bind(competitionId).first<any>();

            if (!competition) {
                return this.notFound(c, this.t('competition_errors.not_found', c));
            }

            if (competition.creator_id !== user.id) {
                return this.forbidden(c);
            }

            if (competition.opponent_id) {
                return this.error(c, this.t('matchmaking.already_has_opponent', c));
            }

            if (competition.status !== 'pending') {
                return this.error(c, this.t('matchmaking.competition_not_open', c));
            }

            // R3-D2 (h7-v1 §4 opponent): mandatory layers BEFORE score —
            // same subcategory+language+country → same subcategory+language
            // other country → close spec in main category → fallback. Fame /
            // Profile never bury a higher layer. busy NEVER excludes and
            // NEVER down-ranks (ranking snapshot); a followed qualifier
            // stays a candidate; invite eligibility is rechecked at SEND.
            const { UserSignalsModel } = await import('../models/UserSignalsModel');
            const ranking = await import('../lib/services/H7UserRankingService');
            const signals = new UserSignalsModel(db);
            const allIds = await signals.findAllActiveUserIds();
            const rows = await signals.loadUsers(allIds);
            const [blocked, invitees, requesters, closedRequests, following, viewerSpecs] = await Promise.all([
                signals.loadBlockedIds(user.id),
                signals.loadPendingInviteeIds(competitionId),
                signals.loadPendingRequesterIds(competitionId),
                signals.loadRequestsClosedIds(allIds),
                signals.loadFollowingIds(user.id),
                signals.loadSpecializations([user.id]),
            ]);
            const compCtx = {
                subcategory: String(competition.subcategory_slug ?? ''),
                category: String(competition.category_slug ?? ''),
                language: (competition.language as string | null) ?? null,
                country: (competition.country as string | null) ?? null,
            };
            const q = (search || '').trim();
            let eligible = rows.filter((r) => {
                if (r.id === user.id) return false;
                if (blocked.has(r.id)) return false;
                if (invitees.has(r.id)) return false;
                if (requesters.has(r.id)) return false;
                if (closedRequests.has(r.id)) return false;
                return true;
            });
            if (q !== '') {
                const lowered = q.toLowerCase();
                eligible = eligible.filter((r) =>
                    (r.username || '').toLowerCase().includes(lowered) ||
                    (r.display_name || '').toLowerCase().includes(lowered)
                );
            }
            const total = eligible.length;
            const viewerSpec = viewerSpecs.get(user.id) ?? null;
            const viewerMe = rows.find((r) => r.id === user.id);
            const viewerCtx = {
                viewerId: user.id,
                language: viewerMe?.language ?? null,
                country: viewerMe?.country ?? null,
                followingIds: following,
                viewerSpec,
            };
            const ids = eligible.map((r) => r.id);
            const [candSpecs, profiles] = await Promise.all([
                signals.loadSpecializations(ids),
                signals.getProfiles(ids),
            ]);
            const nowMs = Date.now();
            const byLayer = new Map<number, typeof eligible>();
            for (const row of eligible) {
                // Text search narrows inside the frozen H7 order: keep only
                // textual matches, then layer them (search layer never drops
                // the opponent layer — both apply: text match required, then
                // opponent layer, then intra-layer H7 score).
                const layer = ranking.h7OpponentLayer(row, candSpecs.get(row.id), compCtx);
                const arr = byLayer.get(layer) ?? [];
                arr.push(row);
                byLayer.set(layer, arr);
            }
            const known = {
                profile: ids.some((id) => (profiles.get(id)?.profile ?? null) !== null),
                specialization:
                    (viewerSpec?.totalParticipations ?? 0) > 0 ||
                    (viewerSpec?.explicitFavs.length ?? 0) > 0,
            };
            const orderedIds: number[] = [];
            for (const layer of [0, 1, 2, 3]) {
                const group = byLayer.get(layer) ?? [];
                if (group.length === 0) continue;
                const scored = group.map((row) => ({
                    id: row.id,
                    score: ranking.h7OpponentScore(row, candSpecs.get(row.id), profiles.get(row.id), viewerCtx, compCtx, nowMs, known),
                }));
                orderedIds.push(...ranking.h7OrderUserScored(scored).map((s) => s.id));
            }
            const pageIds = orderedIds.slice(Math.max(0, offset), Math.max(0, offset) + Math.max(1, limit));
            let users: unknown[] = [];
            if (pageIds.length > 0) {
                // D1 hotfix: hydrate in 80-id chunks — `limit` is client
                // controlled with no upper cap, so one statement could exceed
                // D1's 100-bind hard limit. Order is restored from pageIds
                // via byId, so chunking is transparent.
                const byId = new Map<number, unknown>();
                for (let i = 0; i < pageIds.length; i += 80) {
                    const batch = pageIds.slice(i, i + 80);
                    const placeholders = batch.map(() => '?').join(',');
                    const pageRes = await db.prepare(
                        `SELECT u.id, u.username, u.display_name, u.avatar_url, u.country,
                                u.language, u.is_online, u.last_seen_at, u.is_busy,
                                u.is_verified, u.is_fake, u.average_rating,
                                u.total_competitions, u.total_wins
                           FROM users u WHERE u.id IN (${placeholders})`
                    ).bind(...batch).all();
                    for (const item of (pageRes.results || [])) byId.set((item as { id: number }).id, item);
                }
                users = pageIds.map((id) => byId.get(id)).filter((r): r is unknown => !!r);
            }

            return this.success(c, {
                users,
                total,
                limit,
                offset,
            });
        } catch (error) {
            console.error('[MatchmakingController] getOnlineUsers error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Update current user's online status (heartbeat)
     * POST /api/matchmaking/heartbeat
     * 
     * Called periodically by the client to maintain online presence.
     */
    async heartbeat(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const db = c.env.DB;

            await db.prepare(`
                UPDATE users 
                SET is_online = 1, 
                    last_seen_at = datetime('now')
                WHERE id = ?
            `).bind(user.id).run();

            return this.success(c, { online: true });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Set current user offline
     * POST /api/matchmaking/offline
     */
    async goOffline(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const db = c.env.DB;

            await db.prepare(`
                UPDATE users 
                SET is_online = 0, 
                    last_seen_at = datetime('now')
                WHERE id = ?
            `).bind(user.id).run();

            return this.success(c, { online: false });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }
}

export default MatchmakingController;
