/**
 * User Controller
 * متحكم المستخدمين
 * 
 * MVC-compliant controller for all user operations.
 * Gets dependencies from Hono context.
 */

import { BaseController, AppContext } from './base/BaseController';
import { UserModel, CompetitionModel, NotificationModel } from '../models';

/**
 * Follow Model (inline)
 */
class FollowModel {
    constructor(private db: D1Database) { }

    async follow(followerId: number, followingId: number): Promise<boolean> {
        try {
            await this.db.prepare(
                'INSERT OR IGNORE INTO follows (follower_id, following_id, created_at) VALUES (?, ?, datetime("now"))'
            ).bind(followerId, followingId).run();
            return true;
        } catch {
            return false;
        }
    }

    async unfollow(followerId: number, followingId: number): Promise<boolean> {
        const result = await this.db.prepare(
            'DELETE FROM follows WHERE follower_id = ? AND following_id = ?'
        ).bind(followerId, followingId).run();
        return result.meta.changes > 0;
    }

    async isFollowing(followerId: number, followingId: number): Promise<boolean> {
        const result = await this.db.prepare(
            'SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?'
        ).bind(followerId, followingId).first();
        return result !== null;
    }

    async getFollowersCount(userId: number): Promise<number> {
        const result = await this.db.prepare(
            'SELECT COUNT(*) as count FROM follows WHERE following_id = ?'
        ).bind(userId).first() as { count: number } | null;
        return result?.count || 0;
    }

    async getFollowingCount(userId: number): Promise<number> {
        const result = await this.db.prepare(
            'SELECT COUNT(*) as count FROM follows WHERE follower_id = ?'
        ).bind(userId).first() as { count: number } | null;
        return result?.count || 0;
    }
}

/**
 * User Controller Class
 * متحكم المستخدمين
 */
export class UserController extends BaseController {

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

            const [followersCount, followingCount, competitions] = await Promise.all([
                followModel.getFollowersCount(user.id),
                followModel.getFollowingCount(user.id),
                competitionModel.findByUser(user.id, { limit: 10 })
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
     * Get user's pending requests
     * GET /api/users/:id/requests
     */
    async getRequests(c: AppContext) {
        try {
            const { DB } = c.env;
            const userId = this.getParamInt(c, 'id');

            const result = await DB.prepare(`
                SELECT cr.*, c.title as competition_title, c.status as competition_status
                FROM competition_requests cr
                JOIN competitions c ON cr.competition_id = c.id
                WHERE cr.requester_id = ?
                ORDER BY cr.created_at DESC
            `).bind(userId).all();

            return this.success(c, result.results);
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

            await followModel.follow(currentUser.id, targetId);

            // Create notification
            await notificationModel.create({
                user_id: targetId,
                type: 'follow',
                title: this.t('new_follower', c),
                message: `${currentUser.display_name || currentUser.username}`,
                reference_type: 'user',
                reference_id: currentUser.id
            });

            return this.success(c, { followed: true });
        } catch (error) {
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
            const notifications = await notificationModel.findByUser(currentUser.id, { limit });
            const unreadCount = await notificationModel.countUnread(currentUser.id);

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

            const { DB } = c.env;
            const notificationId = this.getParamInt(c, 'id');

            const notificationModel = new NotificationModel(DB);
            await notificationModel.markAsRead(notificationId);

            return this.success(c, { success: true });
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
