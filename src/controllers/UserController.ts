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
                    u.is_verified,
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
     * Get user's requests (3 types)
     * GET /api/users/:id/requests?type=sent|received|invitations
     */
    async getRequests(c: AppContext) {
        try {
            const { DB } = c.env;
            const userId = this.getParamInt(c, 'id');
            const type = this.getQuery(c, 'type') || 'received';

            let result;

            if (type === 'sent') {
                // طلبات أرسلتها للانضمام لمنافسات الآخرين
                result = await DB.prepare(`
                    SELECT cr.*, 
                           c.title as competition_title, 
                           c.status as competition_status,
                           c.scheduled_at,
                           u.display_name as creator_name,
                           u.avatar_url as creator_avatar,
                           u.username as creator_username
                    FROM competition_requests cr
                    JOIN competitions c ON cr.competition_id = c.id
                    JOIN users u ON c.creator_id = u.id
                    WHERE cr.requester_id = ?
                    ORDER BY cr.created_at DESC
                `).bind(userId).all();

            } else if (type === 'received') {
                // طلبات استلمتها على منافساتي
                result = await DB.prepare(`
                    SELECT cr.*, 
                           c.title as competition_title, 
                           c.status as competition_status,
                           c.scheduled_at,
                           u.display_name as requester_name,
                           u.avatar_url as requester_avatar,
                           u.username as requester_username
                    FROM competition_requests cr
                    JOIN competitions c ON cr.competition_id = c.id
                    JOIN users u ON cr.requester_id = u.id
                    WHERE c.creator_id = ? AND cr.status = 'pending'
                    ORDER BY cr.created_at DESC
                `).bind(userId).all();

            } else if (type === 'invitations') {
                // دعوات استلمتها من منشئين آخرين
                result = await DB.prepare(`
                    SELECT ci.*, 
                           c.title as competition_title, 
                           c.status as competition_status,
                           c.scheduled_at,
                           u.display_name as inviter_name,
                           u.avatar_url as inviter_avatar,
                           u.username as inviter_username
                    FROM competition_invitations ci
                    JOIN competitions c ON ci.competition_id = c.id
                    JOIN users u ON ci.inviter_id = u.id
                    WHERE ci.invitee_id = ? AND ci.status = 'pending'
                    ORDER BY ci.created_at DESC
                `).bind(userId).all();

            } else {
                return this.validationError(c, 'Invalid type. Use: sent, received, or invitations');
            }

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

    /**
     * Delete user account
     * DELETE /api/users/me
     * 
     * Permanently deletes the user account and all associated data.
     * This action cannot be undone.
     */
    async deleteAccount(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const currentUser = this.getCurrentUser(c);

            const { DB } = c.env;
            const userId = currentUser.id;

            // Start transaction-like operations
            // Note: D1 doesn't support explicit transactions, so we do sequential deletes

            // 1. Delete user's sessions
            await DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();

            // 2. Delete user's notifications
            await DB.prepare('DELETE FROM notifications WHERE user_id = ?').bind(userId).run();

            // 3. Delete user's likes and dislikes
            await DB.prepare('DELETE FROM likes WHERE user_id = ?').bind(userId).run();
            await DB.prepare('DELETE FROM dislikes WHERE user_id = ?').bind(userId).run();

            // 4. Delete user's ratings
            await DB.prepare('DELETE FROM ratings WHERE user_id = ?').bind(userId).run();

            // 5. Delete user's comments (or anonymize)
            await DB.prepare('DELETE FROM comments WHERE user_id = ?').bind(userId).run();

            // 6. Delete user's competition requests
            await DB.prepare('DELETE FROM competition_requests WHERE requester_id = ?').bind(userId).run();

            // 7. Delete user's competition reminders
            await DB.prepare('DELETE FROM competition_reminders WHERE user_id = ?').bind(userId).run();

            // 8. Delete user's messages (both sent and received)
            await DB.prepare('DELETE FROM messages WHERE sender_id = ?').bind(userId).run();
            // For conversations, we need to handle both user1 and user2
            await DB.prepare('DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user1_id = ? OR user2_id = ?)').bind(userId, userId).run();
            await DB.prepare('DELETE FROM conversations WHERE user1_id = ? OR user2_id = ?').bind(userId, userId).run();

            // 9. Delete user's follows (both as follower and following)
            await DB.prepare('DELETE FROM follows WHERE follower_id = ? OR following_id = ?').bind(userId, userId).run();

            // 10. Delete user's reports
            await DB.prepare('DELETE FROM reports WHERE reporter_id = ?').bind(userId).run();

            // 11. Delete user's posts
            await DB.prepare('DELETE FROM user_posts WHERE user_id = ?').bind(userId).run();

            // 12. Delete user's settings
            await DB.prepare('DELETE FROM user_settings WHERE user_id = ?').bind(userId).run();

            // 13. Delete user's earnings
            await DB.prepare('DELETE FROM user_earnings WHERE user_id = ?').bind(userId).run();

            // 14. Handle user's competitions
            // For competitions where user is creator, set status to cancelled if pending
            await DB.prepare(`
                UPDATE competitions 
                SET status = 'cancelled', updated_at = datetime('now')
                WHERE creator_id = ? AND status = 'pending'
            `).bind(userId).run();

            // For live competitions, we should not delete but handle gracefully
            // Set opponent_id to NULL if user was opponent
            await DB.prepare(`
                UPDATE competitions 
                SET opponent_id = NULL, updated_at = datetime('now')
                WHERE opponent_id = ?
            `).bind(userId).run();

            // 15. Delete user's ad impressions
            await DB.prepare('DELETE FROM ad_impressions WHERE user_id = ?').bind(userId).run();

            // 16. Finally, delete the user record
            const result = await DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();

            if (result.meta.changes > 0) {
                // Clear the session cookie by returning a header
                // The client will handle redirecting to home page
                return c.json({
                    success: true,
                    message: this.t('account_deleted', c) || 'Account deleted successfully'
                });
            } else {
                return this.error(c, this.t('user_errors.delete_failed', c) || 'Failed to delete account');
            }
        } catch (error) {
            console.error('Delete account error:', error);
            return this.serverError(c, error as Error);
        }
    }
}

export default UserController;
