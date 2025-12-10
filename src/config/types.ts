/**
 * Dueli Platform - Core Types Configuration
 * ملف تعريف الأنواع الأساسية للمنصة
 */

// Environment Bindings - متغيرات البيئة
export type Bindings = {
  DB: D1Database;
  RESEND_API_KEY: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  FACEBOOK_CLIENT_ID: string;
  FACEBOOK_CLIENT_SECRET: string;
  MICROSOFT_CLIENT_ID: string;
  MICROSOFT_CLIENT_SECRET: string;
  MICROSOFT_TENANT_ID: string;
  TIKTOK_CLIENT_KEY: string;
  TIKTOK_CLIENT_SECRET: string;
}

// Language Type - نوع اللغة (supports all country languages)
export type Language = string;

// Context Variables - متغيرات السياق
export type Variables = {
  lang: Language;
  user: any;
}

// User Interface - واجهة المستخدم
export interface User {
  id: number;
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
  created_at?: string;
}

// Competition Interface - واجهة المنافسة
export interface Competition {
  id: number;
  title: string;
  description?: string;
  rules: string;
  category_id: number;
  subcategory_id?: number;
  creator_id: number;
  opponent_id?: number;
  status: 'pending' | 'accepted' | 'live' | 'completed' | 'cancelled';
  language: Language;
  country?: string;
  scheduled_at?: string;
  started_at?: string;
  ended_at?: string;
  youtube_live_id?: string;
  youtube_video_url?: string;
  total_views: number;
  total_comments: number;
  created_at: string;
  updated_at?: string;
}

// Category Interface - واجهة الفئة
export interface Category {
  id: number;
  name_ar: string;
  name_en: string;
  icon?: string;
  color?: string;
  slug?: string;
  parent_id?: number;
  sort_order?: number;
  is_active: boolean;
}

// Comment Interface - واجهة التعليق
export interface Comment {
  id: number;
  competition_id: number;
  user_id: number;
  content: string;
  is_live: boolean;
  created_at: string;
  display_name?: string;
  avatar_url?: string;
  username?: string;
}

// Rating Interface - واجهة التقييم
export interface Rating {
  id: number;
  competition_id: number;
  user_id: number;
  competitor_id: number;
  rating: number;
}

// Competition Request Interface - واجهة طلب الانضمام
export interface CompetitionRequest {
  id: number;
  competition_id: number;
  requester_id: number;
  message?: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  responded_at?: string;
  display_name?: string;
  avatar_url?: string;
  username?: string;
}

// Notification Interface - واجهة الإشعار
export interface Notification {
  id: number;
  user_id: number;
  type: string;
  title: string;
  message: string;
  reference_type?: string;
  reference_id?: number;
  is_read: boolean;
  created_at: string;
}

// Session Interface - واجهة الجلسة
export interface Session {
  id: string;
  user_id: number;
  expires_at: string;
  created_at: string;
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
