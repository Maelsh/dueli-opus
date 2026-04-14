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
                SELECT id, creator_id, opponent_id, status, category_id, language, country
                FROM competitions WHERE id = ?
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

            // Build the main query with recommendation scoring
            const lang = this.getLanguage(c);

            // Get user's followed users for scoring
            const followedRes = await db.prepare(`
                SELECT following_id FROM follows WHERE follower_id = ?
            `).bind(user.id).all();
            const followedIds = (followedRes.results || []).map((f: any) => f.following_id);
            const followedClause = followedIds.length > 0
                ? followedIds.join(',')
                : '0';

            // Build search clause
            let searchClause = '';
            const params: any[] = [
                user.id,    // exclude self
                user.id,    // block check 1
                user.id,    // block check 2
                competitionId, // already invited check
                competition.language || lang,  // language scoring
                competition.country || 'SA',   // country scoring
            ];

            if (search && search.trim()) {
                searchClause = `AND (u.display_name LIKE ? OR u.username LIKE ?)`;
                params.push(`%${search.trim()}%`, `%${search.trim()}%`);
            }

            params.push(limit, offset);

            const query = `
                SELECT 
                    u.id,
                    u.username,
                    u.display_name,
                    u.avatar_url,
                    u.country,
                    u.language,
                    u.is_online,
                    u.last_seen_at,
                    u.is_busy,
                    u.is_verified,
                    u.average_rating,
                    u.total_competitions,
                    u.total_wins,
                    (
                        CASE WHEN u.is_online = 1 THEN 30 ELSE 0 END +
                        CASE WHEN u.language = ? THEN 25 ELSE 0 END +
                        CASE WHEN u.country = ? THEN 20 ELSE 0 END +
                        CASE WHEN u.id IN (${followedClause}) THEN 15 ELSE 0 END +
                        COALESCE(u.average_rating, 0) * 2 +
                        CASE WHEN u.total_competitions > 0 THEN 5 ELSE 0 END
                    ) as compatibility_score
                FROM users u
                WHERE u.id != ?
                AND u.is_active = 1
                AND u.is_busy = 0
                AND u.id NOT IN (
                    SELECT blocked_id FROM user_blocks WHERE blocker_id = ?
                    UNION
                    SELECT blocker_id FROM user_blocks WHERE blocked_id = ?
                )
                AND u.id NOT IN (
                    SELECT invitee_id FROM competition_invitations 
                    WHERE competition_id = ? AND status = 'pending'
                )
                ${searchClause}
                ORDER BY 
                    u.is_online DESC,
                    compatibility_score DESC,
                    u.last_seen_at DESC NULLS LAST
                LIMIT ? OFFSET ?
            `;

            // Re-order params to match SQL placeholder order
            // The scoring params (language, country) come before the WHERE clause params
            const orderedParams = [
                competition.language || lang,   // scoring: language
                competition.country || 'SA',    // scoring: country
                user.id,                        // exclude self
                user.id,                        // block check blocker
                user.id,                        // block check blocked
                competitionId,                  // already invited check
                ...(search && search.trim() ? [`%${search.trim()}%`, `%${search.trim()}%`] : []),
                limit,
                offset,
            ];

            const result = await db.prepare(query).bind(...orderedParams).all();

            // Get total count for pagination
            const countQuery = `
                SELECT COUNT(*) as total
                FROM users u
                WHERE u.id != ?
                AND u.is_active = 1
                AND u.is_busy = 0
                AND u.id NOT IN (
                    SELECT blocked_id FROM user_blocks WHERE blocker_id = ?
                    UNION
                    SELECT blocker_id FROM user_blocks WHERE blocked_id = ?
                )
                AND u.id NOT IN (
                    SELECT invitee_id FROM competition_invitations 
                    WHERE competition_id = ? AND status = 'pending'
                )
                ${searchClause ? 'AND (u.display_name LIKE ? OR u.username LIKE ?)' : ''}
            `;

            const countParams = [
                user.id,
                user.id,
                user.id,
                competitionId,
                ...(search && search.trim() ? [`%${search.trim()}%`, `%${search.trim()}%`] : []),
            ];

            const countResult = await db.prepare(countQuery).bind(...countParams).first<{ total: number }>();

            return this.success(c, {
                users: result.results || [],
                total: countResult?.total || 0,
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
