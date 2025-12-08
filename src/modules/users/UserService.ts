/**
 * @file modules/users/UserService.ts
 * @description خدمة المستخدمين - المنطق التجاري
 * @description_en User Service - Business Logic
 * @module modules/users
 * @version 1.0.0
 * @author Dueli Team
 */

import { 
  UserProfileRepository, 
  FollowRepository, 
  NotificationRepository,
  UpdateUserData,
  UserPreferences,
  UserWithStats
} from './UserRepository';
import type { User, PaginationOptions, Language } from '../../core/http/types';
import { t } from '../../core/i18n';

/**
 * خدمة المستخدمين
 * User Service
 */
export class UserService {
  private userRepo: UserProfileRepository;
  private followRepo: FollowRepository;
  private notificationRepo: NotificationRepository;

  constructor(db: D1Database) {
    this.userRepo = new UserProfileRepository(db);
    this.followRepo = new FollowRepository(db);
    this.notificationRepo = new NotificationRepository(db);
  }

  // ============================================
  // Profile Methods - دوال الملف الشخصي
  // ============================================

  /**
   * الحصول على ملف المستخدم
   * Get user profile
   */
  async getProfile(userId: number): Promise<UserWithStats | null> {
    return this.userRepo.findProfileWithStats(userId);
  }

  /**
   * الحصول على ملف المستخدم باسم المستخدم
   * Get profile by username
   */
  async getProfileByUsername(username: string): Promise<UserWithStats | null> {
    return this.userRepo.findProfileByUsername(username);
  }

  /**
   * تحديث الملف الشخصي
   * Update profile
   */
  async updateProfile(
    userId: number,
    data: UpdateUserData,
    lang: Language = 'ar'
  ): Promise<{ success: boolean; error?: string }> {
    // التحقق من طول الاسم
    if (data.display_name && data.display_name.length > 100) {
      return { 
        success: false, 
        error: lang === 'ar' 
          ? 'الاسم المعروض طويل جداً' 
          : 'Display name is too long'
      };
    }

    const updated = await this.userRepo.updateProfile(userId, data);
    
    if (!updated) {
      return { success: false, error: t('errors.server_error', lang) };
    }

    return { success: true };
  }

  /**
   * تحديث التفضيلات
   * Update preferences
   */
  async updatePreferences(
    userId: number,
    preferences: UserPreferences
  ): Promise<{ success: boolean; error?: string }> {
    const updated = await this.userRepo.updatePreferences(userId, preferences);
    
    return { success: updated };
  }

  /**
   * تحديث الصورة الشخصية
   * Update avatar
   */
  async updateAvatar(
    userId: number,
    avatarUrl: string
  ): Promise<{ success: boolean; error?: string }> {
    const updated = await this.userRepo.updateAvatar(userId, avatarUrl);
    
    return { success: updated };
  }

  /**
   * البحث عن مستخدمين
   * Search users
   */
  async searchUsers(
    query: string,
    pagination: PaginationOptions
  ): Promise<{ data: User[]; total: number; hasMore: boolean }> {
    const result = await this.userRepo.searchUsers(query, pagination);
    return {
      ...result,
      hasMore: pagination.offset + pagination.limit < result.total
    };
  }

  /**
   * الحصول على أفضل المستخدمين
   * Get top users
   */
  async getTopUsers(limit: number = 10): Promise<UserWithStats[]> {
    return this.userRepo.getTopUsers(limit);
  }

  // ============================================
  // Follow Methods - دوال المتابعة
  // ============================================

  /**
   * متابعة مستخدم
   * Follow user
   */
  async followUser(
    followerId: number,
    followingId: number,
    lang: Language = 'ar'
  ): Promise<{ success: boolean; error?: string }> {
    // لا يمكن متابعة نفسك
    if (followerId === followingId) {
      return { 
        success: false, 
        error: lang === 'ar' 
          ? 'لا يمكنك متابعة نفسك' 
          : 'You cannot follow yourself'
      };
    }

    // التحقق من وجود المستخدم
    const targetUser = await this.userRepo.findById(followingId);
    if (!targetUser) {
      return { success: false, error: t('errors.not_found', lang) };
    }

    const followed = await this.followRepo.follow(followerId, followingId);
    
    if (followed) {
      // إرسال إشعار
      const follower = await this.userRepo.findById(followerId);
      await this.notificationRepo.createNotification(
        followingId,
        'follow',
        lang === 'ar' ? 'متابع جديد' : 'New Follower',
        lang === 'ar' 
          ? `${follower?.display_name || follower?.username} بدأ متابعتك`
          : `${follower?.display_name || follower?.username} started following you`,
        { follower_id: followerId }
      );
    }

    return { success: followed };
  }

  /**
   * إلغاء المتابعة
   * Unfollow user
   */
  async unfollowUser(
    followerId: number,
    followingId: number
  ): Promise<{ success: boolean }> {
    const unfollowed = await this.followRepo.unfollow(followerId, followingId);
    return { success: unfollowed };
  }

  /**
   * التحقق من المتابعة
   * Check if following
   */
  async isFollowing(followerId: number, followingId: number): Promise<boolean> {
    return this.followRepo.isFollowing(followerId, followingId);
  }

  /**
   * الحصول على المتابعين
   * Get followers
   */
  async getFollowers(
    userId: number,
    pagination: PaginationOptions
  ): Promise<{ data: User[]; total: number; hasMore: boolean }> {
    const result = await this.followRepo.getFollowers(userId, pagination);
    return {
      ...result,
      hasMore: pagination.offset + pagination.limit < result.total
    };
  }

  /**
   * الحصول على المتابَعين
   * Get following
   */
  async getFollowing(
    userId: number,
    pagination: PaginationOptions
  ): Promise<{ data: User[]; total: number; hasMore: boolean }> {
    const result = await this.followRepo.getFollowing(userId, pagination);
    return {
      ...result,
      hasMore: pagination.offset + pagination.limit < result.total
    };
  }

  // ============================================
  // Notification Methods - دوال الإشعارات
  // ============================================

  /**
   * الحصول على الإشعارات
   * Get notifications
   */
  async getNotifications(
    userId: number,
    pagination: PaginationOptions
  ): Promise<{ 
    data: any[]; 
    total: number; 
    unread: number; 
    hasMore: boolean 
  }> {
    const result = await this.notificationRepo.getUserNotifications(userId, pagination);
    return {
      ...result,
      hasMore: pagination.offset + pagination.limit < result.total
    };
  }

  /**
   * تحديد إشعار كمقروء
   * Mark notification as read
   */
  async markNotificationAsRead(
    notificationId: number,
    userId: number
  ): Promise<{ success: boolean }> {
    const marked = await this.notificationRepo.markAsRead(notificationId, userId);
    return { success: marked };
  }

  /**
   * تحديد كل الإشعارات كمقروءة
   * Mark all notifications as read
   */
  async markAllNotificationsAsRead(
    userId: number
  ): Promise<{ success: boolean }> {
    const marked = await this.notificationRepo.markAllAsRead(userId);
    return { success: marked };
  }

  /**
   * حذف إشعار
   * Delete notification
   */
  async deleteNotification(
    notificationId: number,
    userId: number
  ): Promise<{ success: boolean }> {
    const deleted = await this.notificationRepo.deleteNotification(notificationId, userId);
    return { success: deleted };
  }

  /**
   * إرسال إشعار
   * Send notification
   */
  async sendNotification(
    userId: number,
    type: string,
    title: string,
    message: string,
    data?: any
  ): Promise<{ success: boolean }> {
    const result = await this.notificationRepo.createNotification(
      userId,
      type,
      title,
      message,
      data
    );
    return { success: result.success };
  }
}

export default UserService;
