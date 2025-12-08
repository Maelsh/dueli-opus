/**
 * @file types/index.ts
 * @description أنواع TypeScript المركزية للمشروع
 * @description_en Central TypeScript types for the project
 * @module types
 * @version 1.0.0
 * @author Dueli Team
 */

// ===============================
// أنواع البيئة والربط - Environment & Bindings
// ===============================

/**
 * متغيرات البيئة من Cloudflare
 * @description تحتوي على جميع المتغيرات البيئية والاتصالات
 */
export interface Bindings {
  /** قاعدة بيانات D1 */
  DB: D1Database;
  /** مفتاح API لخدمة Resend للبريد الإلكتروني */
  RESEND_API_KEY: string;
  /** معرف عميل Google OAuth */
  GOOGLE_CLIENT_ID: string;
  /** السر الخاص بـ Google OAuth */
  GOOGLE_CLIENT_SECRET: string;
  /** معرف عميل Facebook OAuth */
  FACEBOOK_CLIENT_ID: string;
  /** السر الخاص بـ Facebook OAuth */
  FACEBOOK_CLIENT_SECRET: string;
  /** معرف عميل Microsoft OAuth */
  MICROSOFT_CLIENT_ID: string;
  /** السر الخاص بـ Microsoft OAuth */
  MICROSOFT_CLIENT_SECRET: string;
  /** معرف المستأجر لـ Microsoft */
  MICROSOFT_TENANT_ID: string;
  /** مفتاح عميل TikTok OAuth */
  TIKTOK_CLIENT_KEY: string;
  /** السر الخاص بـ TikTok OAuth */
  TIKTOK_CLIENT_SECRET: string;
  /** رمز API لـ Cloudflare (اختياري) */
  CLOUDFLARE_API_TOKEN?: string;
}

/**
 * المتغيرات المتاحة في السياق
 */
export interface Variables {
  /** اللغة الحالية */
  lang: 'ar' | 'en';
  /** بيانات المستخدم المسجل دخوله (إن وجد) */
  user: User | null;
}

// ===============================
// أنواع المستخدم - User Types
// ===============================

/**
 * نموذج المستخدم الكامل
 * @description يمثل مستخدم في قاعدة البيانات
 */
export interface User {
  /** معرف المستخدم الفريد */
  id: number;
  /** اسم المستخدم للعرض في URL */
  username: string;
  /** البريد الإلكتروني */
  email: string;
  /** هاش كلمة المرور */
  password_hash?: string;
  /** الاسم المعروض */
  display_name: string;
  /** رابط صورة الملف الشخصي */
  avatar_url?: string;
  /** نبذة عن المستخدم */
  bio?: string;
  /** كود البلد */
  country?: string;
  /** لغة المستخدم المفضلة */
  language?: string;
  /** هل تم التحقق من البريد */
  email_verified?: boolean;
  /** رمز التحقق */
  verification_token?: string;
  /** تاريخ انتهاء رمز التحقق */
  verification_expires?: string;
  /** رمز إعادة تعيين كلمة المرور */
  reset_token?: string;
  /** تاريخ انتهاء رمز إعادة التعيين */
  reset_expires?: string;
  /** مزود OAuth */
  oauth_provider?: string;
  /** معرف المستخدم لدى مزود OAuth */
  oauth_id?: string;
  /** هل المستخدم مفعل */
  is_active?: boolean;
  /** هل المستخدم موثق */
  is_verified?: boolean;
  /** هل المستخدم مسؤول */
  is_admin?: boolean;
  /** إجمالي المنافسات */
  total_competitions?: number;
  /** إجمالي الانتصارات */
  total_wins?: number;
  /** إجمالي المشاهدات */
  total_views?: number;
  /** متوسط التقييم */
  average_rating?: number;
  /** إجمالي الأرباح */
  total_earnings?: number;
  /** تاريخ الإنشاء */
  created_at?: string;
  /** تاريخ آخر تحديث */
  updated_at?: string;
}

/**
 * بيانات المستخدم للعرض (بدون معلومات حساسة)
 */
export interface UserPublic {
  id: number;
  username: string;
  display_name: string;
  avatar_url?: string;
  bio?: string;
  country?: string;
  language?: string;
  is_verified?: boolean;
  total_competitions?: number;
  total_wins?: number;
  total_views?: number;
  average_rating?: number;
  created_at?: string;
}

/**
 * بيانات الجلسة
 */
export interface Session {
  /** معرف الجلسة (UUID) */
  id: string;
  /** معرف المستخدم */
  user_id: number;
  /** تاريخ انتهاء الصلاحية */
  expires_at: string;
  /** تاريخ الإنشاء */
  created_at?: string;
}

// ===============================
// أنواع المنافسات - Competition Types
// ===============================

/**
 * حالات المنافسة الممكنة
 */
export type CompetitionStatus = 
  | 'pending'    // في انتظار منافس
  | 'accepted'   // تم قبول المنافس
  | 'live'       // مباشر
  | 'completed'  // منتهية
  | 'cancelled'; // ملغاة

/**
 * نموذج المنافسة الكامل
 */
export interface Competition {
  /** معرف المنافسة */
  id: number;
  /** عنوان المنافسة */
  title: string;
  /** وصف المنافسة */
  description?: string;
  /** قوانين المنافسة */
  rules: string;
  /** معرف القسم الرئيسي */
  category_id: number;
  /** معرف القسم الفرعي */
  subcategory_id?: number;
  /** معرف المنشئ */
  creator_id: number;
  /** معرف المنافس */
  opponent_id?: number;
  /** حالة المنافسة */
  status: CompetitionStatus;
  /** لغة المنافسة */
  language?: string;
  /** بلد المنافسة */
  country?: string;
  /** موعد البدء المجدول */
  scheduled_at?: string;
  /** وقت البدء الفعلي */
  started_at?: string;
  /** وقت الانتهاء */
  ended_at?: string;
  /** معرف البث المباشر على YouTube */
  youtube_live_id?: string;
  /** رابط الفيديو على YouTube */
  youtube_video_url?: string;
  /** إجمالي المشاهدات */
  total_views?: number;
  /** إجمالي التعليقات */
  total_comments?: number;
  /** تاريخ الإنشاء */
  created_at?: string;
  /** تاريخ آخر تحديث */
  updated_at?: string;
}

/**
 * منافسة مع بيانات موسعة للعرض
 */
export interface CompetitionWithDetails extends Competition {
  // بيانات القسم
  category_name_ar?: string;
  category_name_en?: string;
  category_icon?: string;
  category_color?: string;
  category_slug?: string;
  // بيانات القسم الفرعي
  subcategory_name_ar?: string;
  subcategory_name_en?: string;
  subcategory_color?: string;
  // بيانات المنشئ
  creator_name?: string;
  creator_avatar?: string;
  creator_username?: string;
  creator_bio?: string;
  // بيانات المنافس
  opponent_name?: string;
  opponent_avatar?: string;
  opponent_username?: string;
  opponent_bio?: string;
  // بيانات إضافية
  comments?: Comment[];
  ratings?: RatingSummary[];
  requests?: CompetitionRequest[];
}

// ===============================
// أنواع الأقسام - Category Types
// ===============================

/**
 * نموذج القسم
 */
export interface Category {
  /** معرف القسم */
  id: number;
  /** الاسم بالعربية */
  name_ar: string;
  /** الاسم بالإنجليزية */
  name_en: string;
  /** الرابط المختصر */
  slug: string;
  /** أيقونة القسم */
  icon?: string;
  /** لون القسم */
  color?: string;
  /** معرف القسم الأب */
  parent_id?: number;
  /** ترتيب العرض */
  sort_order?: number;
  /** هل القسم مفعل */
  is_active?: boolean;
  /** تاريخ الإنشاء */
  created_at?: string;
}

// ===============================
// أنواع طلبات الانضمام - Join Request Types
// ===============================

/**
 * حالات طلب الانضمام
 */
export type RequestStatus = 'pending' | 'accepted' | 'declined';

/**
 * نموذج طلب الانضمام للمنافسة
 */
export interface CompetitionRequest {
  /** معرف الطلب */
  id: number;
  /** معرف المنافسة */
  competition_id: number;
  /** معرف مقدم الطلب */
  requester_id: number;
  /** رسالة الطلب */
  message?: string;
  /** حالة الطلب */
  status: RequestStatus;
  /** تاريخ الإنشاء */
  created_at?: string;
  /** تاريخ الرد */
  responded_at?: string;
  // بيانات موسعة
  display_name?: string;
  avatar_url?: string;
  username?: string;
}

// ===============================
// أنواع التعليقات - Comment Types
// ===============================

/**
 * نموذج التعليق
 */
export interface Comment {
  /** معرف التعليق */
  id: number;
  /** معرف المنافسة */
  competition_id: number;
  /** معرف المستخدم */
  user_id: number;
  /** محتوى التعليق */
  content: string;
  /** هل تعليق مباشر */
  is_live?: boolean;
  /** تاريخ الإنشاء */
  created_at?: string;
  // بيانات المستخدم
  display_name?: string;
  avatar_url?: string;
  username?: string;
}

// ===============================
// أنواع التقييم - Rating Types
// ===============================

/**
 * نموذج التقييم
 */
export interface Rating {
  /** معرف التقييم */
  id: number;
  /** معرف المنافسة */
  competition_id: number;
  /** معرف المستخدم المقيِّم */
  user_id: number;
  /** معرف المتنافس المقيَّم */
  competitor_id: number;
  /** قيمة التقييم (1-5) */
  rating: number;
  /** تاريخ الإنشاء */
  created_at?: string;
}

/**
 * ملخص التقييمات
 */
export interface RatingSummary {
  /** معرف المتنافس */
  competitor_id: number;
  /** متوسط التقييم */
  avg_rating: number;
  /** عدد التقييمات */
  count: number;
}

// ===============================
// أنواع الإشعارات - Notification Types
// ===============================

/**
 * أنواع الإشعارات
 */
export type NotificationType = 
  | 'request'   // طلب انضمام
  | 'accepted'  // قبول طلب
  | 'declined'  // رفض طلب
  | 'comment'   // تعليق جديد
  | 'rating'    // تقييم جديد
  | 'live'      // بدء بث مباشر
  | 'system';   // إشعار نظام

/**
 * نموذج الإشعار
 */
export interface Notification {
  /** معرف الإشعار */
  id: number;
  /** معرف المستخدم */
  user_id: number;
  /** نوع الإشعار */
  type: NotificationType;
  /** عنوان الإشعار */
  title: string;
  /** محتوى الإشعار */
  message: string;
  /** نوع المرجع */
  reference_type?: string;
  /** معرف المرجع */
  reference_id?: number;
  /** هل تم القراءة */
  is_read?: boolean;
  /** تاريخ الإنشاء */
  created_at?: string;
}

// ===============================
// أنواع المتابعة - Follow Types
// ===============================

/**
 * نموذج المتابعة
 */
export interface Follow {
  /** معرف المتابعة */
  id: number;
  /** معرف المتابِع */
  follower_id: number;
  /** معرف المتابَع */
  following_id: number;
  /** تاريخ الإنشاء */
  created_at?: string;
}

// ===============================
// أنواع الاستجابة - Response Types
// ===============================

/**
 * استجابة API عامة
 */
export interface ApiResponse<T = any> {
  /** هل نجحت العملية */
  success: boolean;
  /** البيانات */
  data?: T;
  /** رسالة */
  message?: string;
  /** رسالة الخطأ */
  error?: string;
}

/**
 * استجابة مع قائمة وترقيم
 */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  /** العدد الإجمالي */
  total?: number;
  /** الصفحة الحالية */
  page?: number;
  /** عدد العناصر في الصفحة */
  limit?: number;
}

// ===============================
// أنواع OAuth - OAuth Types
// ===============================

/**
 * بيانات المستخدم من OAuth
 */
export interface OAuthUser {
  /** معرف المستخدم لدى المزود */
  id: string;
  /** البريد الإلكتروني */
  email: string;
  /** الاسم */
  name: string;
  /** رابط الصورة */
  picture?: string | null;
  /** اسم المزود */
  provider: string;
  /** البيانات الخام من المزود */
  raw?: any;
}

/**
 * خطأ OAuth
 */
export interface OAuthError {
  /** كود الخطأ */
  code: string;
  /** رسالة الخطأ */
  message: string;
}

/**
 * إعدادات مزود OAuth
 */
export interface OAuthProviderConfig {
  /** معرف العميل */
  clientId: string;
  /** السر الخاص بالعميل */
  clientSecret: string;
  /** رابط إعادة التوجيه */
  redirectUri: string;
  /** رابط صفحة المصادقة */
  authUrl: string;
  /** رابط الحصول على الرمز */
  tokenUrl: string;
  /** رابط الحصول على بيانات المستخدم */
  userUrl: string;
  /** الصلاحيات المطلوبة */
  scope: string;
}
