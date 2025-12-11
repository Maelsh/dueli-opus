/**
 * User Controller
 * متحكم المستخدمين
 */

import { BaseController, AppContext } from './base/BaseController';
import { UserModel, CompetitionModel, NotificationModel } from '../models';

/**
 * User Controller Class
 */
export class UserController extends BaseController {
    private userModel: UserModel;
    private competitionModel: CompetitionModel;
    private notificationModel: NotificationModel;

    constructor(db: D1Database) {
        super();
        this.userModel = new UserModel(db);
        this.competitionModel = new CompetitionModel(db);
        this.notificationModel = new NotificationModel(db);
    }

    /**
     * Get user profile by username
     * GET /api/users/:username
     */
    async show(c: AppContext) {
        try {
            const username = this.getParam(c, 'username');
            const user = await this.userModel.findWithStats(username);

            if (!user) {
                return this.notFound(c, 'User not found');
            }

            // Get user's competitions
            const competitions = await this.competitionModel.findByUser(user.id, { limit: 10 });

            return this.success(c, {
                user: {
                    id: user.id,
                    username: user.username,
                    display_name: user.display_name,
                    avatar_url: user.avatar_url,
                    bio: user.bio,
                    total_competitions: user.total_competitions,
                    total_wins: user.total_wins,
                    created_at: user.created_at
                },
                competitions
            });

        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Update current user profile
     * PUT /api/users/me
     */
    async updateProfile(c: AppContext) {
        try {
            const currentUser = this.getCurrentUser(c);
            if (!currentUser) {
                return this.unauthorized(c);
            }

            const body = await this.getBody<{
                display_name?: string;
                bio?: string;
                avatar_url?: string;
                country?: string;
                language?: string;
            }>(c);

            if (!body) {
                return this.validationError(c, 'Invalid request body');
            }

            const updatedUser = await this.userModel.update(currentUser.id, body);

            return this.success(c, { user: updatedUser });

        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get user's notifications
     * GET /api/users/me/notifications
     */
    async getNotifications(c: AppContext) {
        try {
            const currentUser = this.getCurrentUser(c);
            if (!currentUser) {
                return this.unauthorized(c);
            }

            const notifications = await this.notificationModel.findByUser(currentUser.id, {
                limit: this.getQueryInt(c, 'limit', 50)
            });

            const unreadCount = await this.notificationModel.countUnread(currentUser.id);

            return this.success(c, { notifications, unreadCount });

        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Mark notification as read
     * POST /api/users/me/notifications/:id/read
     */
    async markNotificationRead(c: AppContext) {
        try {
            const currentUser = this.getCurrentUser(c);
            if (!currentUser) {
                return this.unauthorized(c);
            }

            const notificationId = this.getParamInt(c, 'id');
            await this.notificationModel.markAsRead(notificationId);

            return this.success(c, { message: 'Marked as read' });

        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Mark all notifications as read
     * POST /api/users/me/notifications/read-all
     */
    async markAllNotificationsRead(c: AppContext) {
        try {
            const currentUser = this.getCurrentUser(c);
            if (!currentUser) {
                return this.unauthorized(c);
            }

            const count = await this.notificationModel.markAllAsRead(currentUser.id);

            return this.success(c, { markedCount: count });

        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }
}

export default UserController;
