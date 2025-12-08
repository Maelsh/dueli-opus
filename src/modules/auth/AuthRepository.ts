/**
 * @file modules/auth/AuthRepository.ts
 * @description مستودع المصادقة للتعامل مع قاعدة البيانات
 * @description_en Authentication Repository for database operations
 * @module modules/auth
 * @version 1.0.0
 * @author Dueli Team
 */

import { BaseRepository } from '../../core/database';
import type { User, Session } from '../../core/http/types';

/**
 * بيانات إنشاء مستخدم
 * User creation data
 */
export interface CreateUserData {
  email: string;
  username: string;
  password_hash: string;
  display_name?: string;
  country_code?: string;
  preferred_language?: string;
  verification_token?: string;
  verification_expires?: string;
}

/**
 * بيانات إنشاء مستخدم OAuth
 * OAuth user creation data
 */
export interface CreateOAuthUserData {
  email: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
  oauth_provider: string;
  oauth_id: string;
  is_verified?: boolean;
}

/**
 * بيانات إنشاء جلسة
 * Session creation data
 */
export interface CreateSessionData {
  user_id: number;
  token: string;
  expires_at: string;
}

/**
 * مستودع المستخدمين
 * User Repository
 * 
 * يتعامل مع عمليات قاعدة البيانات المتعلقة بالمستخدمين
 */
export class UserRepository extends BaseRepository<User> {
  constructor(db: D1Database) {
    super(db, 'users');
  }

  /**
   * البحث عن مستخدم بالبريد الإلكتروني
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.rawQueryFirst<User>(
      'SELECT * FROM users WHERE LOWER(email) = LOWER(?)',
      [email]
    );
  }

  /**
   * البحث عن مستخدم باسم المستخدم
   * Find user by username
   */
  async findByUsername(username: string): Promise<User | null> {
    return this.rawQueryFirst<User>(
      'SELECT * FROM users WHERE LOWER(username) = LOWER(?)',
      [username]
    );
  }

  /**
   * البحث عن مستخدم بـ OAuth
   * Find user by OAuth
   */
  async findByOAuth(provider: string, oauthId: string): Promise<User | null> {
    return this.rawQueryFirst<User>(
      'SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?',
      [provider, oauthId]
    );
  }

  /**
   * البحث برمز التحقق
   * Find by verification token
   */
  async findByVerificationToken(token: string): Promise<User | null> {
    return this.rawQueryFirst<User>(
      'SELECT * FROM users WHERE verification_token = ?',
      [token]
    );
  }

  /**
   * البحث برمز إعادة تعيين كلمة المرور
   * Find by reset token
   */
  async findByResetToken(token: string): Promise<User | null> {
    return this.rawQueryFirst<User>(
      'SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > datetime("now")',
      [token]
    );
  }

  /**
   * إنشاء مستخدم جديد
   * Create new user
   */
  async createUser(data: CreateUserData): Promise<{ id: number; success: boolean }> {
    const now = new Date().toISOString();
    return this.create({
      ...data,
      is_verified: false,
      is_active: true,
      created_at: now,
      updated_at: now
    } as any);
  }

  /**
   * إنشاء مستخدم OAuth
   * Create OAuth user
   */
  async createOAuthUser(data: CreateOAuthUserData): Promise<{ id: number; success: boolean }> {
    const now = new Date().toISOString();
    return this.create({
      ...data,
      password_hash: '',
      is_verified: data.is_verified ?? true,
      is_active: true,
      created_at: now,
      updated_at: now
    } as any);
  }

  /**
   * تحديث تحقق البريد
   * Update email verification
   */
  async verifyEmail(userId: number): Promise<boolean> {
    const result = await this.update(userId, {
      is_verified: true,
      verification_token: null,
      verification_expires: null,
      updated_at: new Date().toISOString()
    } as any);
    return result.success;
  }

  /**
   * تعيين رمز إعادة تعيين كلمة المرور
   * Set reset password token
   */
  async setResetToken(userId: number, token: string, expires: string): Promise<boolean> {
    const result = await this.update(userId, {
      reset_token: token,
      reset_token_expires: expires,
      updated_at: new Date().toISOString()
    } as any);
    return result.success;
  }

  /**
   * تحديث كلمة المرور
   * Update password
   */
  async updatePassword(userId: number, passwordHash: string): Promise<boolean> {
    const result = await this.update(userId, {
      password_hash: passwordHash,
      reset_token: null,
      reset_token_expires: null,
      updated_at: new Date().toISOString()
    } as any);
    return result.success;
  }

  /**
   * تحديث OAuth
   * Link OAuth account
   */
  async linkOAuth(userId: number, provider: string, oauthId: string): Promise<boolean> {
    const result = await this.update(userId, {
      oauth_provider: provider,
      oauth_id: oauthId,
      is_verified: true,
      updated_at: new Date().toISOString()
    } as any);
    return result.success;
  }

  /**
   * الحصول على تجزئة كلمة المرور
   * Get password hash (for login)
   */
  async getPasswordHash(email: string): Promise<string | null> {
    const result = await this.rawQueryFirst<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE LOWER(email) = LOWER(?)',
      [email]
    );
    return result?.password_hash || null;
  }

  /**
   * التحقق من تفرد البريد
   * Check email uniqueness
   */
  async isEmailUnique(email: string): Promise<boolean> {
    const count = await this.rawQueryFirst<{ count: number }>(
      'SELECT COUNT(*) as count FROM users WHERE LOWER(email) = LOWER(?)',
      [email]
    );
    return (count?.count || 0) === 0;
  }

  /**
   * التحقق من تفرد اسم المستخدم
   * Check username uniqueness
   */
  async isUsernameUnique(username: string): Promise<boolean> {
    const count = await this.rawQueryFirst<{ count: number }>(
      'SELECT COUNT(*) as count FROM users WHERE LOWER(username) = LOWER(?)',
      [username]
    );
    return (count?.count || 0) === 0;
  }
}

/**
 * مستودع الجلسات
 * Session Repository
 */
export class SessionRepository extends BaseRepository<Session> {
  constructor(db: D1Database) {
    super(db, 'sessions');
  }

  /**
   * البحث عن جلسة بالرمز
   * Find session by token
   */
  async findByToken(token: string): Promise<Session | null> {
    return this.rawQueryFirst<Session>(
      'SELECT * FROM sessions WHERE token = ? AND expires_at > datetime("now")',
      [token]
    );
  }

  /**
   * إنشاء جلسة جديدة
   * Create new session
   */
  async createSession(data: CreateSessionData): Promise<{ id: number; success: boolean }> {
    return this.create({
      ...data,
      created_at: new Date().toISOString()
    } as any);
  }

  /**
   * حذف جلسة بالرمز
   * Delete session by token
   */
  async deleteByToken(token: string): Promise<boolean> {
    const result = await this.rawExecute(
      'DELETE FROM sessions WHERE token = ?',
      [token]
    );
    return result.success;
  }

  /**
   * حذف جلسات المستخدم
   * Delete user sessions
   */
  async deleteByUserId(userId: number): Promise<boolean> {
    const result = await this.rawExecute(
      'DELETE FROM sessions WHERE user_id = ?',
      [userId]
    );
    return result.success;
  }

  /**
   * تنظيف الجلسات المنتهية
   * Clean expired sessions
   */
  async cleanExpired(): Promise<number> {
    const result = await this.rawExecute(
      'DELETE FROM sessions WHERE expires_at < datetime("now")'
    );
    return result.meta.changes as number;
  }

  /**
   * الحصول على جلسة مع بيانات المستخدم
   * Get session with user data
   */
  async findSessionWithUser(token: string): Promise<(Session & { user: User }) | null> {
    return this.rawQueryFirst<Session & { user: User }>(
      `SELECT s.*, 
              u.id as user_id, u.email, u.username, u.display_name, 
              u.avatar_url, u.country_code, u.preferred_language,
              u.is_verified, u.is_active, u.oauth_provider
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token = ? AND s.expires_at > datetime("now")`,
      [token]
    );
  }
}

export default { UserRepository, SessionRepository };
