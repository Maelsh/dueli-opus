/**
 * Dueli Platform - Core Types Configuration
 * ملف تعريف الأنواع الأساسية للمنصة
 * 
 * This module defines all core TypeScript interfaces and types used across the platform.
 * Following OOP principles with proper abstraction and interface segregation.
 */

// ============================================
// Environment & Context Types
// ============================================

/** Environment bindings for Cloudflare Workers */
export type Bindings = {
  DB: D1Database;
  BASE_URL?: string;          // Base URL for the application (e.g., https://dueli.workers.dev)
  // Email Configuration - iFastNet SMTP API
  EMAIL_API_KEY: string;        // Secret key for your PHP email endpoint
  EMAIL_API_URL: string;        // URL to your send-email.php script
  EMAIL_FROM?: string;          // From email address (optional, has default)
  // Legacy (deprecated, but kept for reference)
  RESEND_API_KEY?: string;
  // OAuth Configuration
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  FACEBOOK_CLIENT_ID: string;
  FACEBOOK_CLIENT_SECRET: string;
  MICROSOFT_CLIENT_ID: string;
  MICROSOFT_CLIENT_SECRET: string;
  MICROSOFT_TENANT_ID: string;
  TIKTOK_CLIENT_KEY: string;
  TIKTOK_CLIENT_SECRET: string;
  CLOUDFLARE_API_TOKEN?: string;
  // Streaming Services
  STREAMING_URL: string;      // https://stream.maelsh.pro
  UPLOAD_URL: string;         // https://maelsh.pro/ffmpeg
  TURN_URL: string;           // turn:maelsh.pro:3000
  TURN_SECRET: string;        // Shared secret with Coturn
  UPLOAD_SERVER_ORIGINS?: string; // Allowed origins for chunk APIs, comma-separated (e.g., "https://maelsh.pro,https://stream.maelsh.pro")
}

/** Language code type (supports all country languages) */
export type Language = string;

/** Context variables for Hono middleware */
export type Variables = {
  lang: Language;
  user: User | null;
}

// ============================================
// Base Interfaces (OOP Abstractions)
// ============================================

/**
 * Base Entity Interface
 * All database entities should extend this interface
 * جميع الكيانات في قاعدة البيانات يجب أن ترث من هذه الواجهة
 */
export interface BaseEntity {
  readonly id: number;
  readonly created_at?: string;
  updated_at?: string;
}

/**
 * Timestamped Entity Interface
 * For entities with both created_at and updated_at
 */
export interface TimestampedEntity extends BaseEntity {
  readonly created_at: string;
  updated_at?: string;
}

/**
 * Localizable Interface
 * For entities that support multiple languages
 */
export interface Localizable {
  name_key?: string;
  name_ar?: string;
  name_en?: string;
}

// ============================================
// Domain Enums & Types
// ============================================

/** Competition status values */
export type CompetitionStatus = 'pending' | 'accepted' | 'live' | 'completed' | 'cancelled';

/** Competition request status values */
export type RequestStatus = 'pending' | 'accepted' | 'declined';

/** Notification types */
export type NotificationType = 'request' | 'follow' | 'comment' | 'rating' | 'system' | 'invitation';

// ============================================
// Domain Interfaces
// ============================================

/**
 * User Interface
 * واجهة المستخدم
 */
export interface User extends BaseEntity {
  email: string;
  username: string;
  display_name: string;
  avatar_url: string;
  country?: string;
  language?: Language;
  is_admin?: boolean;
  bio?: string;
  total_competitions?: number;
  total_wins?: number;
  total_views?: number;
  average_rating?: number;
  total_earnings?: number;
  is_verified?: boolean;
  is_busy?: boolean;
  is_banned?: boolean;
  current_competition_id?: number;
  busy_since?: string;
  last_active_at?: string;
}

/**
 * Competition Interface
 * واجهة المنافسة
 */
export interface Competition extends TimestampedEntity {
  title: string;
  description?: string;
  rules: string;
  category_id: number;
  subcategory_id?: number;
  creator_id: number;
  opponent_id?: number;
  status: CompetitionStatus;
  language: Language;
  country?: string;
  scheduled_at?: string;
  started_at?: string;
  ended_at?: string;
  youtube_live_id?: string;
  youtube_video_url?: string;
  total_views: number;
  total_comments: number;
  likes_count?: number;
  dislikes_count?: number;
  // Joined Category Data
  category_name_key?: string;
  category_slug?: string;
  category_icon?: string;
  category_color?: string;
  subcategory_name_key?: string;
  subcategory_slug?: string;
  // Joined User Data
  creator_name?: string;
  creator_username?: string;
  creator_avatar?: string;
  opponent_name?: string;
  opponent_username?: string;
  opponent_avatar?: string;
}

/**
 * Category Interface
 * واجهة الفئة
 */
export interface Category extends BaseEntity, Localizable {
  icon?: string;
  color?: string;
  slug?: string;
  parent_id?: number;
  sort_order?: number;
  is_active: boolean;
}

/**
 * Comment Interface
 * واجهة التعليق
 */
export interface Comment extends TimestampedEntity {
  competition_id: number;
  user_id: number;
  content: string;
  is_live: boolean;
  // Joined user data
  display_name?: string;
  avatar_url?: string;
  username?: string;
}

/**
 * Rating Interface
 * واجهة التقييم
 */
export interface Rating extends BaseEntity {
  competition_id: number;
  user_id: number;
  competitor_id: number;
  rating: number;
}

/**
 * Competition Request Interface
 * واجهة طلب الانضمام
 */
export interface CompetitionRequest extends TimestampedEntity {
  competition_id: number;
  requester_id: number;
  message?: string;
  status: RequestStatus;
  responded_at?: string;
  // Joined user data
  display_name?: string;
  avatar_url?: string;
  username?: string;
}

/**
 * Notification Interface
 * واجهة الإشعار
 */
export interface Notification extends TimestampedEntity {
  user_id: number;
  type: NotificationType;
  title: string;
  message: string;
  reference_type?: string;
  reference_id?: number;
  is_read: boolean;
}

/**
 * Session Interface
 * واجهة الجلسة
 */
export interface Session {
  readonly id: string;
  user_id: number;
  expires_at: string;
  readonly created_at: string;
}

// OAuth User Interface - واجهة مستخدم OAuth
export interface OAuthUser {
  id: string;
  email?: string;
  name?: string;
  picture?: string;
}

// API Response Interface - واجهة استجابة API
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
