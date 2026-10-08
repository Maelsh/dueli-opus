/**
 * User Controller
 * متحكم المستخدمين
 * 
 * MVC-compliant controller for all user operations.
 * Gets dependencies from Hono context.
 */

import { BaseController, AppContext } from './base/BaseController';
import { UserModel, CompetitionModel, NotificationModel } from '../models';
import { CompetitionRequestModel } from '../models/CompetitionRequestModel';
import { CompetitionInvitationModel } from '../models/CompetitionInvitationModel';
import { FollowModel } from '../models/FollowModel';
import { NotificationPresenter } from '../lib/services/NotificationPresenter';
import { BlockedInteractionError } from '../lib/errors/AppError';

/**
 * User Controller Class
 * متحكم المستخدمين
 */
export class UserController extends BaseController {

    /**
     * List users
     * GET /api/users
     */
    async index(c: AppContext) {
        try {
            const { DB } = c.env;
            const limit = this.getQueryInt(c, 'limit') || 20;
            const offset = this.getQueryInt(c, 'offset') || 0;

            const userModel = new UserModel(DB);

            // Get users with basic stats
            const result = await DB.prepare(`
                SELECT 
                    u.id, u.username, u.display_name, u.avatar_url, u.bio, u.country,
                    u.is_verified, u.is_fake,
                    (SELECT COUNT(*) FROM follows WHERE following_id = u.id) as followers_count,
                    (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) as following_count,
                    (SELECT COUNT(*) FROM competitions WHERE creator_id = u.id OR opponent_id = u.id) as competitions_count
                FROM users u
                WHERE u.is_active = 1
                ORDER BY u.created_at DESC
                LIMIT ? OFFSET ?
            `).bind(limit, offset).all();

            return this.success(c, result.results || []);
        } catch (error) {
            console.error('List users error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get user profile by username
     * GET /api/users/:username
     */
    async show(c: AppContext) {
        try {
            const { DB } = c.env;
            const username = this.getParam(c, 'username');

            const userModel = new UserModel(DB);
            const followModel = new FollowModel(DB);
            const competitionModel = new CompetitionModel(DB);

            const user = await userModel.findByUsername(username);
            if (!user) {
                return this.notFound(c, this.t('user_errors.not_found', c));
            }

            const { UserSignalsModel } = await import('../models/UserSignalsModel');
            const [followersCount, followingCount, competitions, competitorProfile] = await Promise.all([
                followModel.getFollowersCount(user.id),
                followModel.getFollowingCount(user.id),
                competitionModel.findByUser(user.id, { limit: 10 }),
                new UserSignalsModel(DB).getProfile(user.id),
            ]);

            // Check if current user is following
            const currentUser = this.getCurrentUser(c);
            const isFollowing = currentUser
                ? await followModel.isFollowing(currentUser.id, user.id)
                : false;

            return this.success(c, {
                id: user.id,
                username: user.username,
                display_name: user.display_name,
                avatar_url: user.avatar_url,
                bio: user.bio,
                country: user.country,
                language: user.language,
                total_competitions: user.total_competitions,
                total_wins: user.total_wins,
                total_views: user.total_views,
                average_rating: user.average_rating,
                // R3-D2 Profile (08/11 SSOT): SUM effective stars /
                // contested competitions (denominator = competitions, never
                // raters/ratings). May exceed 5 — never clamped. Null when
                // the user contested zero competitions (no division by zero).
                profile_score: competitorProfile.profile,
                profile_competitions: competitorProfile.competitions,
                profile_stars: competitorProfile.starsSum,
                is_verified: (user as any).is_verified,
                created_at: user.created_at,
                followers_count: followersCount,
                following_count: followingCount,
                is_following: isFollowing,
                competitions
            });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Update user preferences
     * PUT /api/users/preferences
     */
    async updatePreferences(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const currentUser = this.getCurrentUser(c);

            const { DB } = c.env;
            const body = await this.getBody<{
                country?: string;
                language?: string;
            }>(c);

            if (!body?.country && !body?.language) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }

            const userModel = new UserModel(DB);
            await userModel.update(currentUser.id, {
                country: body.country,
                language: body.language
            });

            return this.success(c, { success: true });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get user's requests (3 types)
     * GET /api/users/:id/requests?type=sent|received|invitations
     *
     * R2-J: persistence lives in the models (no SQL here); received and
     * invitations return full history (every status), not pending-only rows.
     * Rows are the caller's own — reading another user's inbox is 403.
     */
    async getRequests(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const currentUser = this.getCurrentUser(c);
            const { DB } = c.env;
            const userId = this.getParamInt(c, 'id');
            if (currentUser.id !== userId) {
                return this.forbidden(c);
            }
            const type = this.getQuery(c, 'type') || 'received';

            let result: unknown[];

            if (type === 'sent') {
                // طلبات أرسلتها للانضمام لمنافسات الآخرين — كل الحالات
                result = await new CompetitionRequestModel(DB).findSentByRequesterFull(userId);

            } else if (type === 'received') {
                // طلبات استلمتها على منافساتي — كل الحالات
                result = await new CompetitionRequestModel(DB).findReceivedByCreator(userId);

            } else if (type === 'invitations') {
                // دعوات استلمتها من منشئين آخرين — كل الحالات
                result = await new CompetitionInvitationModel(DB).findReceivedHistory(userId);

            } else {
                return this.validationError(c, 'Invalid type. Use: sent, received, or invitations');
            }

            return this.success(c, result);
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Follow user
     * POST /api/users/:id/follow
     */
    async follow(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const currentUser = this.getCurrentUser(c);
            const targetId = this.getParamInt(c, 'id');

            if (currentUser.id === targetId) {
                return this.error(c, this.t('user_errors.cannot_follow_self', c));
            }

            const { DB } = c.env;
            const followModel = new FollowModel(DB);
            const notificationModel = new NotificationModel(DB);

            const created = await followModel.follow(currentUser.id, targetId);

            // R2-F: repeat POST is idempotent — only a newly-created follow
            // emits a notification (no duplicate notifications on retry).
            if (created) {
                // B9: stored as `type + payload`; label rendered at read time.
                await notificationModel.createForType({
                    user_id: targetId,
                    type: 'follow',
                    payload: { actor: currentUser.display_name || currentUser.username },
                    reference_type: 'user',
                    reference_id: currentUser.id
                });
            }

            return this.success(c, { followed: true });
        } catch (error) {
            if (error instanceof BlockedInteractionError) {
                return this.forbidden(c, this.t('errors.blocked_interaction', c));
            }
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Unfollow user
     * DELETE /api/users/:id/follow
     */
    async unfollow(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const currentUser = this.getCurrentUser(c);
            const targetId = this.getParamInt(c, 'id');

            const { DB } = c.env;
            const followModel = new FollowModel(DB);

            await followModel.unfollow(currentUser.id, targetId);

            return this.success(c, { unfollowed: true });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get user's notifications
     * GET /api/notifications (mounted separately)
     */
    async getNotifications(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const currentUser = this.getCurrentUser(c);

            const { DB } = c.env;
            const notificationModel = new NotificationModel(DB);

            const limit = this.getQueryInt(c, 'limit', 50);
            const rows = await notificationModel.findByUser(currentUser.id, { limit });
            const unreadCount = await notificationModel.countUnread(currentUser.id);

            // B9: `type + payload` is stored; the label/body/deep link are
            // generated HERE, in the recipient's request language (`?lang=`).
            const lang = this.getLanguage(c);
            const notifications = rows.map((row) => NotificationPresenter.present(row, lang));

            return this.success(c, { notifications, unreadCount });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Mark notification as read
     * POST /api/notifications/:id/read
     */
    async markNotificationRead(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const currentUser = this.getCurrentUser(c);

            const { DB } = c.env;
            const notificationId = this.getParamInt(c, 'id');

            const notificationModel = new NotificationModel(DB);
            // R2-F: ownership-scoped — another user's row is 404, never marked.
            const marked = await notificationModel.markAsReadForUser(notificationId, currentUser.id);
            if (!marked) {
                return this.notFound(c, this.t('not_found', c));
            }

            return this.success(c, { success: true });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Star / unstar a notification
     * POST /api/notifications/:id/star { starred: boolean }
     *
     * R4-EVENTS-NOTIFY-1 (N-05): the dropdown star control posted here but
     * the route never existed (404, state kept in memory only). Persists
     * `is_starred` ownership-scoped — another user's row is 404, never
     * touched. No new migration: the column exists since migrations/0001.
     */
    async toggleNotificationStar(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const currentUser = this.getCurrentUser(c);

            const { DB } = c.env;
            const notificationId = this.getParamInt(c, 'id');
            const body = await this.getBody<{ starred?: unknown }>(c);
            if (typeof body?.starred !== 'boolean') {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }

            const notificationModel = new NotificationModel(DB);
            const starred = await notificationModel.setStarredForUser(
                notificationId, currentUser.id, body.starred
            );
            if (starred === null) {
                return this.notFound(c, this.t('not_found', c));
            }

            return this.success(c, { starred });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Mark all notifications as read
     * POST /api/notifications/read-all
     */
    async markAllNotificationsRead(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const currentUser = this.getCurrentUser(c);

            const { DB } = c.env;
            const notificationModel = new NotificationModel(DB);
            const count = await notificationModel.markAllAsRead(currentUser.id);

            return this.success(c, { markedCount: count });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }
}

export default UserController;
