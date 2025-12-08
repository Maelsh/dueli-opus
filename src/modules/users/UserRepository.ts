/**
 * @file modules/users/UserRepository.ts
 * @description مستودع المستخدمين للتعامل مع قاعدة البيانات
 * @description_en User Repository for database operations
 * @module modules/users
 * @version 1.0.0
 * @author Dueli Team
 */

import { BaseRepository } from '../../core/database';
import type { User, Notification, PaginationOptions } from '../../core/http/types';

/**
 * بيانات تحديث المستخدم
 * User update data
 */
export interface UpdateUserData {
  display_name?: string;
  avatar_url?: string;
  country_code?: string;
  preferred_language?: string;
  bio?: string;
}

/**
 * بيانات تفضيلات المستخدم
 * User preferences data
 */
export interface UserPreferences {
  country_code?: string;
  preferred_language?: string;
  theme?: string;
  notifications_enabled?: boolean;
}

/**
 * مستخدم مع إحصائيات
 * User with stats
 */
export interface UserWithStats extends User {
  competitions_count?: number;
  wins_count?: number;
  followers_count?: number;
  following_count?: number;
  avg_rating?: number;
}

/**
 * علاقة المتابعة
 * Follow relationship
 */
export interface Follow {
  id: number;
  follower_id: number;
  following_id: number;
  created_at: string;
}

/**
 * مستودع المستخدمين الموسع
 * Extended User Repository
 */
export class UserProfileRepository extends BaseRepository<User> {
  constructor(db: D1Database) {
    super(db, 'users');
  }

  /**
   * الحصول على ملف مستخدم مع إحصائيات
   * Get user profile with stats
   */
  async findProfileWithStats(userId: number): Promise<UserWithStats | null> {
    const query = `
      SELECT 
        u.*,
        (SELECT COUNT(*) FROM competitions WHERE creator_id = u.id OR opponent_id = u.id) as competitions_count,
        (SELECT COUNT(*) FROM follows WHERE following_id = u.id) as followers_count,
        (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) as following_count,
        (SELECT AVG(r.score) FROM ratings r 
         JOIN competitions c ON r.competition_id = c.id 
         WHERE r.competitor_id = u.id) as avg_rating
      FROM users u
      WHERE u.id = ?
    `;

    return this.rawQueryFirst<UserWithStats>(query, [userId]);
  }

  /**
   * الحصول على ملف مستخدم باسم المستخدم
   * Get profile by username
   */
  async findProfileByUsername(username: string): Promise<UserWithStats | null> {
    const query = `
      SELECT 
        u.*,
        (SELECT COUNT(*) FROM competitions WHERE creator_id = u.id OR opponent_id = u.id) as competitions_count,
        (SELECT COUNT(*) FROM follows WHERE following_id = u.id) as followers_count,
        (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) as following_count,
        (SELECT AVG(r.score) FROM ratings r 
         JOIN competitions c ON r.competition_id = c.id 
         WHERE r.competitor_id = u.id) as avg_rating
      FROM users u
      WHERE LOWER(u.username) = LOWER(?)
    `;

    return this.rawQueryFirst<UserWithStats>(query, [username]);
  }

  /**
   * تحديث الملف الشخصي
   * Update profile
   */
  async updateProfile(userId: number, data: UpdateUserData): Promise<boolean> {
    const result = await this.update(userId, {
      ...data,
      updated_at: new Date().toISOString()
    } as any);
    return result.success;
  }

  /**
   * تحديث التفضيلات
   * Update preferences
   */
  async updatePreferences(userId: number, preferences: UserPreferences): Promise<boolean> {
    const result = await this.update(userId, {
      ...preferences,
      updated_at: new Date().toISOString()
    } as any);
    return result.success;
  }

  /**
   * تحديث الصورة الشخصية
   * Update avatar
   */
  async updateAvatar(userId: number, avatarUrl: string): Promise<boolean> {
    const result = await this.update(userId, {
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString()
    } as any);
    return result.success;
  }

  /**
   * البحث عن مستخدمين
   * Search users
   */
  async searchUsers(
    query: string,
    pagination: PaginationOptions
  ): Promise<{ data: User[]; total: number }> {
    const searchTerm = `%${query}%`;
    
    const countResult = await this.rawQueryFirst<{ total: number }>(
      `SELECT COUNT(*) as total FROM users 
       WHERE username LIKE ? OR display_name LIKE ? OR email LIKE ?`,
      [searchTerm, searchTerm, searchTerm]
    );
    const total = countResult?.total || 0;

    const data = await this.rawQuery<User>(
      `SELECT id, username, display_name, avatar_url, country_code, is_verified
       FROM users 
       WHERE username LIKE ? OR display_name LIKE ? OR email LIKE ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [searchTerm, searchTerm, searchTerm, pagination.limit, pagination.offset]
    );

    return { data, total };
  }

  /**
   * الحصول على المستخدمين الأكثر نشاطاً
   * Get top users
   */
  async getTopUsers(limit: number = 10): Promise<UserWithStats[]> {
    const query = `
      SELECT 
        u.id, u.username, u.display_name, u.avatar_url, u.country_code, u.is_verified,
        (SELECT COUNT(*) FROM competitions WHERE creator_id = u.id OR opponent_id = u.id) as competitions_count,
        (SELECT COUNT(*) FROM follows WHERE following_id = u.id) as followers_count,
        (SELECT AVG(r.score) FROM ratings r 
         JOIN competitions c ON r.competition_id = c.id 
         WHERE r.competitor_id = u.id) as avg_rating
      FROM users u
      WHERE u.is_active = 1
      ORDER BY competitions_count DESC, followers_count DESC
      LIMIT ?
    `;

    return this.rawQuery<UserWithStats>(query, [limit]);
  }
}

/**
 * مستودع المتابعات
 * Follow Repository
 */
export class FollowRepository extends BaseRepository<Follow> {
  constructor(db: D1Database) {
    super(db, 'follows');
  }

  /**
   * متابعة مستخدم
   * Follow user
   */
  async follow(followerId: number, followingId: number): Promise<boolean> {
    // التحقق من عدم وجود متابعة سابقة
    const existing = await this.findOneBy({
      follower_id: followerId,
      following_id: followingId
    } as any);

    if (existing) {
      return true; // متابع بالفعل
    }

    const result = await this.create({
      follower_id: followerId,
      following_id: followingId,
      created_at: new Date().toISOString()
    } as any);

    return result.success;
  }

  /**
   * إلغاء المتابعة
   * Unfollow user
   */
  async unfollow(followerId: number, followingId: number): Promise<boolean> {
    const result = await this.rawExecute(
      'DELETE FROM follows WHERE follower_id = ? AND following_id = ?',
      [followerId, followingId]
    );
    return result.success;
  }

  /**
   * التحقق من المتابعة
   * Check if following
   */
  async isFollowing(followerId: number, followingId: number): Promise<boolean> {
    const result = await this.findOneBy({
      follower_id: followerId,
      following_id: followingId
    } as any);
    return result !== null;
  }

  /**
   * الحصول على المتابعين
   * Get followers
   */
  async getFollowers(
    userId: number,
    pagination: PaginationOptions
  ): Promise<{ data: User[]; total: number }> {
    const countResult = await this.rawQueryFirst<{ total: number }>(
      'SELECT COUNT(*) as total FROM follows WHERE following_id = ?',
      [userId]
    );
    const total = countResult?.total || 0;

    const data = await this.rawQuery<User>(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, u.country_code, u.is_verified
       FROM follows f
       JOIN users u ON f.follower_id = u.id
       WHERE f.following_id = ?
       ORDER BY f.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, pagination.limit, pagination.offset]
    );

    return { data, total };
  }

  /**
   * الحصول على المتابَعين
   * Get following
   */
  async getFollowing(
    userId: number,
    pagination: PaginationOptions
  ): Promise<{ data: User[]; total: number }> {
    const countResult = await this.rawQueryFirst<{ total: number }>(
      'SELECT COUNT(*) as total FROM follows WHERE follower_id = ?',
      [userId]
    );
    const total = countResult?.total || 0;

    const data = await this.rawQuery<User>(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, u.country_code, u.is_verified
       FROM follows f
       JOIN users u ON f.following_id = u.id
       WHERE f.follower_id = ?
       ORDER BY f.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, pagination.limit, pagination.offset]
    );

    return { data, total };
  }
}

/**
 * مستودع الإشعارات
 * Notification Repository
 */
export class NotificationRepository extends BaseRepository<Notification> {
  constructor(db: D1Database) {
    super(db, 'notifications');
  }

  /**
   * إنشاء إشعار
   * Create notification
   */
  async createNotification(
    userId: number,
    type: string,
    title: string,
    message: string,
    data?: any
  ): Promise<{ id: number; success: boolean }> {
    return this.create({
      user_id: userId,
      type,
      title,
      message,
      data: data ? JSON.stringify(data) : null,
      is_read: false,
      created_at: new Date().toISOString()
    } as any);
  }

  /**
   * الحصول على إشعارات المستخدم
   * Get user notifications
   */
  async getUserNotifications(
    userId: number,
    pagination: PaginationOptions
  ): Promise<{ data: Notification[]; total: number; unread: number }> {
    const countResult = await this.rawQueryFirst<{ total: number }>(
      'SELECT COUNT(*) as total FROM notifications WHERE user_id = ?',
      [userId]
    );
    const total = countResult?.total || 0;

    const unreadResult = await this.rawQueryFirst<{ count: number }>(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
      [userId]
    );
    const unread = unreadResult?.count || 0;

    const data = await this.rawQuery<Notification>(
      `SELECT * FROM notifications 
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, pagination.limit, pagination.offset]
    );

    return { data, total, unread };
  }

  /**
   * تحديد كمقروء
   * Mark as read
   */
  async markAsRead(notificationId: number, userId: number): Promise<boolean> {
    const result = await this.rawExecute(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
      [notificationId, userId]
    );
    return result.success;
  }

  /**
   * تحديد الكل كمقروء
   * Mark all as read
   */
  async markAllAsRead(userId: number): Promise<boolean> {
    const result = await this.rawExecute(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
      [userId]
    );
    return result.success;
  }

  /**
   * حذف إشعار
   * Delete notification
   */
  async deleteNotification(notificationId: number, userId: number): Promise<boolean> {
    const result = await this.rawExecute(
      'DELETE FROM notifications WHERE id = ? AND user_id = ?',
      [notificationId, userId]
    );
    return (result.meta.changes as number) > 0;
  }

  /**
   * حذف الإشعارات القديمة
   * Delete old notifications
   */
  async deleteOld(daysOld: number = 30): Promise<number> {
    const result = await this.rawExecute(
      `DELETE FROM notifications 
       WHERE created_at < datetime('now', '-${daysOld} days')`
    );
    return result.meta.changes as number;
  }
}

export default { UserProfileRepository, FollowRepository, NotificationRepository };
