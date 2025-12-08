/**
 * @file core/http/types.ts
 * @description أنواع HTTP الأساسية للمشروع
 * @description_en Core HTTP types for the project
 * @module core/http/types
 * @version 1.0.0
 * @author Dueli Team
 */

import type { Context } from 'hono';

/**
 * الربط مع Cloudflare Workers
 * Cloudflare Workers bindings
 */
export type Bindings = {
  /** قاعدة البيانات D1 */
  DB: D1Database;
  /** مفتاح API لخدمة Resend للبريد */
  RESEND_API_KEY: string;
  /** معرف تطبيق Google OAuth */
  GOOGLE_CLIENT_ID: string;
  /** السر الخاص بتطبيق Google */
  GOOGLE_CLIENT_SECRET: string;
  /** معرف تطبيق Facebook OAuth */
  FACEBOOK_CLIENT_ID: string;
  /** السر الخاص بتطبيق Facebook */
  FACEBOOK_CLIENT_SECRET: string;
  /** معرف تطبيق Microsoft OAuth */
  MICROSOFT_CLIENT_ID: string;
  /** السر الخاص بتطبيق Microsoft */
  MICROSOFT_CLIENT_SECRET: string;
  /** معرف مستأجر Microsoft */
  MICROSOFT_TENANT_ID: string;
  /** مفتاح تطبيق TikTok */
  TIKTOK_CLIENT_KEY: string;
  /** السر الخاص بتطبيق TikTok */
  TIKTOK_CLIENT_SECRET: string;
};

/**
 * اللغات المدعومة
 * Supported languages
 */
export type Language = 'ar' | 'en';

/**
 * المتغيرات السياقية
 * Context variables
 */
export type Variables = {
  /** اللغة الحالية */
  lang: Language;
  /** المستخدم الحالي */
  user: User | null;
};

/**
 * سياق Hono المخصص
 * Custom Hono context
 */
export type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;

/**
 * استجابة API قياسية
 * Standard API response
 */
export interface ApiResponse<T = any> {
  /** نجاح العملية */
  success: boolean;
  /** البيانات المرجعة */
  data?: T;
  /** رسالة الخطأ */
  error?: string;
  /** رسالة إضافية */
  message?: string;
}

/**
 * نموذج المستخدم
 * User model
 */
export interface User {
  id: number;
  email: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
  country_code?: string;
  preferred_language?: Language;
  is_verified: boolean;
  is_active: boolean;
  oauth_provider?: string;
  oauth_id?: string;
  created_at: string;
  updated_at?: string;
}

/**
 * نموذج الجلسة
 * Session model
 */
export interface Session {
  id: number;
  user_id: number;
  token: string;
  expires_at: string;
  created_at: string;
}

/**
 * مستخدم OAuth
 * OAuth user
 */
export interface OAuthUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
  provider: 'google' | 'facebook' | 'microsoft' | 'tiktok';
  raw?: any;
}

/**
 * نموذج المسابقة
 * Competition model
 */
export interface Competition {
  id: number;
  title: string;
  description?: string;
  category_id: number;
  creator_id: number;
  opponent_id?: number;
  status: 'pending' | 'waiting' | 'live' | 'completed' | 'cancelled';
  scheduled_at?: string;
  started_at?: string;
  ended_at?: string;
  creator_video_url?: string;
  opponent_video_url?: string;
  rules?: string;
  is_public: boolean;
  created_at: string;
  updated_at?: string;
}

/**
 * نموذج التصنيف
 * Category model
 */
export interface Category {
  id: number;
  name_ar: string;
  name_en: string;
  description_ar?: string;
  description_en?: string;
  icon?: string;
  parent_id?: number;
  sort_order: number;
  is_active: boolean;
}

/**
 * نموذج التقييم
 * Rating model
 */
export interface Rating {
  id: number;
  competition_id: number;
  user_id: number;
  competitor_id: number;
  score: number;
  created_at: string;
}

/**
 * نموذج التعليق
 * Comment model
 */
export interface Comment {
  id: number;
  competition_id: number;
  user_id: number;
  content: string;
  created_at: string;
}

/**
 * نموذج الإشعار
 * Notification model
 */
export interface Notification {
  id: number;
  user_id: number;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  data?: string;
  created_at: string;
}

/**
 * خيارات الصفحات
 * Pagination options
 */
export interface PaginationOptions {
  limit: number;
  offset: number;
}

/**
 * نتيجة مع صفحات
 * Paginated result
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// Types are exported via named exports above
