/**
 * @file modules/users/UserController.ts
 * @description متحكم المستخدمين - معالجة طلبات HTTP
 * @description_en User Controller - HTTP request handling
 * @module modules/users
 * @version 1.0.0
 * @author Dueli Team
 */

import { BaseController, ControllerContext, ValidationSchema } from '../../core';
import { UserService } from './UserService';
import { UpdateUserData, UserPreferences } from './UserRepository';
import { AuthService } from '../auth/AuthService';

/**
 * مخطط تحديث الملف الشخصي
 * Update profile schema
 */
const updateProfileSchema: ValidationSchema<UpdateUserData> = {
  display_name: ['string', { maxLength: 100 }],
  avatar_url: ['string', 'url'],
  country_code: ['string', { maxLength: 2 }],
  preferred_language: [{ enum: ['ar', 'en'] as const }],
  bio: ['string', { maxLength: 500 }]
};

/**
 * متحكم المستخدمين
 * User Controller
 */
export class UserController extends BaseController {
  constructor() {
    super('UserController');
  }

  /**
   * الحصول على خدمة المستخدمين
   */
  private getService(c: ControllerContext): UserService {
    return new UserService(this.getDB(c));
  }

  /**
   * الحصول على المستخدم الحالي
   */
  private async getCurrentUser(c: ControllerContext) {
    const token = this.getCookie(c, 'session_token');
    if (!token) return null;

    const authService = new AuthService(this.getDB(c), '');
    return authService.validateSession(token);
  }

  // ============================================
  // Profile Endpoints - نقاط الملف الشخصي
  // ============================================

  /**
   * الحصول على ملف المستخدم الحالي
   * GET /api/users/me
   */
  async getMe(c: ControllerContext) {
    const user = await this.getCurrentUser(c);
    
    if (!user) {
      return this.unauthorized(c);
    }

    const service = this.getService(c);
    const profile = await service.getProfile(user.id);

    return this.ok(c, profile);
  }

  /**
   * الحصول على ملف مستخدم بالمعرف
   * GET /api/users/:id
   */
  async getProfile(c: ControllerContext) {
    const id = this.getParamInt(c, 'id');
    
    if (!id) {
      return this.badRequest(c, 'User ID is required');
    }

    const service = this.getService(c);
    const profile = await service.getProfile(id);

    if (!profile) {
      return this.notFound(c, 'User not found');
    }

    // التحقق من المتابعة إذا كان المستخدم مسجل
    const currentUser = await this.getCurrentUser(c);
    let isFollowing = false;
    
    if (currentUser && currentUser.id !== id) {
      isFollowing = await service.isFollowing(currentUser.id, id);
    }

    return this.ok(c, { ...profile, isFollowing });
  }

  /**
   * الحصول على ملف مستخدم باسم المستخدم
   * GET /api/users/username/:username
   */
  async getProfileByUsername(c: ControllerContext) {
    const username = this.getParam(c, 'username');
    
    if (!username) {
      return this.badRequest(c, 'Username is required');
    }

    const service = this.getService(c);
    const profile = await service.getProfileByUsername(username);

    if (!profile) {
      return this.notFound(c, 'User not found');
    }

    // التحقق من المتابعة إذا كان المستخدم مسجل
    const currentUser = await this.getCurrentUser(c);
    let isFollowing = false;
    
    if (currentUser && currentUser.id !== profile.id) {
      isFollowing = await service.isFollowing(currentUser.id, profile.id);
    }

    return this.ok(c, { ...profile, isFollowing });
  }

  /**
   * تحديث الملف الشخصي
   * PUT /api/users/me
   */
  async updateProfile(c: ControllerContext) {
    const user = await this.getCurrentUser(c);
    
    if (!user) {
      return this.unauthorized(c);
    }

    const result = await this.parseAndValidate<UpdateUserData>(c, updateProfileSchema);
    
    if (!result.success) {
      return this.validationError(c, result.errors);
    }

    const service = this.getService(c);
    const lang = this.getLang(c);
    
    const updateResult = await service.updateProfile(user.id, result.data!, lang);
    
    if (!updateResult.success) {
      return this.badRequest(c, updateResult.error || 'Failed to update profile');
    }

    // إرجاع الملف المحدث
    const profile = await service.getProfile(user.id);

    return this.ok(c, profile);
  }

  /**
   * تحديث التفضيلات
   * PUT /api/users/preferences
   */
  async updatePreferences(c: ControllerContext) {
    const user = await this.getCurrentUser(c);
    
    if (!user) {
      return this.unauthorized(c);
    }

    const body = await this.parseBody<UserPreferences>(c);
    
    if (!body) {
      return this.badRequest(c, 'Invalid request body');
    }

    const service = this.getService(c);
    const result = await service.updatePreferences(user.id, body);
    
    if (!result.success) {
      return this.badRequest(c, 'Failed to update preferences');
    }

    return this.ok(c, { message: 'Preferences updated successfully' });
  }

  /**
   * البحث عن مستخدمين
   * GET /api/users/search?q=xxx
   */
  async searchUsers(c: ControllerContext) {
    const query = this.getQuery(c, 'q', '');
    
    if (!query || query.length < 2) {
      return this.badRequest(c, 'Search query must be at least 2 characters');
    }

    const pagination = this.getPagination(c);
    const service = this.getService(c);
    
    const result = await service.searchUsers(query, pagination);
    
    return this.ok(c, result);
  }

  /**
   * الحصول على أفضل المستخدمين
   * GET /api/users/top
   */
  async getTopUsers(c: ControllerContext) {
    const limit = this.getQueryInt(c, 'limit', 10);
    const service = this.getService(c);
    
    const users = await service.getTopUsers(Math.min(limit, 50));
    
    return this.ok(c, users);
  }

  // ============================================
  // Follow Endpoints - نقاط المتابعة
  // ============================================

  /**
   * متابعة مستخدم
   * POST /api/users/:id/follow
   */
  async follow(c: ControllerContext) {
    const user = await this.getCurrentUser(c);
    
    if (!user) {
      return this.unauthorized(c);
    }

    const targetId = this.getParamInt(c, 'id');
    
    if (!targetId) {
      return this.badRequest(c, 'User ID is required');
    }

    const service = this.getService(c);
    const lang = this.getLang(c);
    
    const result = await service.followUser(user.id, targetId, lang);
    
    if (!result.success) {
      return this.badRequest(c, result.error || 'Failed to follow user');
    }

    return this.ok(c, { message: 'Followed successfully' });
  }

  /**
   * إلغاء المتابعة
   * POST /api/users/:id/unfollow
   */
  async unfollow(c: ControllerContext) {
    const user = await this.getCurrentUser(c);
    
    if (!user) {
      return this.unauthorized(c);
    }

    const targetId = this.getParamInt(c, 'id');
    
    if (!targetId) {
      return this.badRequest(c, 'User ID is required');
    }

    const service = this.getService(c);
    const result = await service.unfollowUser(user.id, targetId);
    
    if (!result.success) {
      return this.badRequest(c, 'Failed to unfollow user');
    }

    return this.ok(c, { message: 'Unfollowed successfully' });
  }

  /**
   * الحصول على المتابعين
   * GET /api/users/:id/followers
   */
  async getFollowers(c: ControllerContext) {
    const userId = this.getParamInt(c, 'id');
    
    if (!userId) {
      return this.badRequest(c, 'User ID is required');
    }

    const pagination = this.getPagination(c);
    const service = this.getService(c);
    
    const result = await service.getFollowers(userId, pagination);
    
    return this.ok(c, result);
  }

  /**
   * الحصول على المتابَعين
   * GET /api/users/:id/following
   */
  async getFollowing(c: ControllerContext) {
    const userId = this.getParamInt(c, 'id');
    
    if (!userId) {
      return this.badRequest(c, 'User ID is required');
    }

    const pagination = this.getPagination(c);
    const service = this.getService(c);
    
    const result = await service.getFollowing(userId, pagination);
    
    return this.ok(c, result);
  }

  // ============================================
  // Notification Endpoints - نقاط الإشعارات
  // ============================================

  /**
   * الحصول على الإشعارات
   * GET /api/notifications
   */
  async getNotifications(c: ControllerContext) {
    const user = await this.getCurrentUser(c);
    
    if (!user) {
      return this.unauthorized(c);
    }

    const pagination = this.getPagination(c);
    const service = this.getService(c);
    
    const result = await service.getNotifications(user.id, pagination);
    
    return this.ok(c, result);
  }

  /**
   * تحديد إشعار كمقروء
   * POST /api/notifications/:id/read
   */
  async markAsRead(c: ControllerContext) {
    const user = await this.getCurrentUser(c);
    
    if (!user) {
      return this.unauthorized(c);
    }

    const notificationId = this.getParamInt(c, 'id');
    
    if (!notificationId) {
      return this.badRequest(c, 'Notification ID is required');
    }

    const service = this.getService(c);
    const result = await service.markNotificationAsRead(notificationId, user.id);
    
    return this.ok(c, { success: result.success });
  }

  /**
   * تحديد كل الإشعارات كمقروءة
   * POST /api/notifications/read-all
   */
  async markAllAsRead(c: ControllerContext) {
    const user = await this.getCurrentUser(c);
    
    if (!user) {
      return this.unauthorized(c);
    }

    const service = this.getService(c);
    const result = await service.markAllNotificationsAsRead(user.id);
    
    return this.ok(c, { success: result.success });
  }

  /**
   * حذف إشعار
   * DELETE /api/notifications/:id
   */
  async deleteNotification(c: ControllerContext) {
    const user = await this.getCurrentUser(c);
    
    if (!user) {
      return this.unauthorized(c);
    }

    const notificationId = this.getParamInt(c, 'id');
    
    if (!notificationId) {
      return this.badRequest(c, 'Notification ID is required');
    }

    const service = this.getService(c);
    const result = await service.deleteNotification(notificationId, user.id);
    
    if (!result.success) {
      return this.badRequest(c, 'Failed to delete notification');
    }

    return this.ok(c, { message: 'Notification deleted successfully' });
  }
}

// تصدير نسخة واحدة
export const userController = new UserController();
export default UserController;
