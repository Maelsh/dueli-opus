/**
 * Dueli Platform - Default Configuration
 * الإعدادات الافتراضية للمنصة
 * 
 * このファイルを編集して、デフォルト値を変更できます
 * Edit this file to change default values
 * 
 * ⚠️ هذه القيم تُستخدم فقط إذا لم يتم تعيين متغيرات البيئة
 * ⚠️ These values are only used if environment variables are not set
 */

// ============================================
// Streaming & Upload Servers
// خوادم البث والرفع
// ============================================

/** Default streaming server URL */
export const DEFAULT_STREAMING_URL = 'https://stream.maelshpro.com';

/** Default upload server URL */
export const DEFAULT_UPLOAD_URL = 'https://maelshpro.com/ffmpeg';

/** Default TURN server URL */
export const DEFAULT_TURN_URL = 'turn:maelshpro.com:3000';

/**
 * Origins allowed to access chunk APIs (verify/delete)
 * Comma-separated list
 * 
 * المواقع المسموح لها بالوصول لـ APIs القطع
 * قائمة مفصولة بفواصل
 */
export const DEFAULT_UPLOAD_SERVER_ORIGINS = 'https://maelshpro.com,https://stream.maelshpro.com,https://dueli.maelshpro.com,https://www.dueli.maelshpro.com';

// ============================================
// Platform URLs
// روابط المنصة
// ============================================

/**
 * Current platform URL (Custom Domain - Active!)
 * رابط المنصة الحالي (النطاق المخصص - نشط!)
 */
export const DEFAULT_PLATFORM_URL = 'https://dueli.maelshpro.com';

/**
 * Alternative platform URLs
 * روابط المنصة البديلة
 */
export const CLOUDFLARE_PAGES_URL = 'https://project-8e7c178d.pages.dev';
export const WWW_PLATFORM_URL = 'https://www.dueli.maelshpro.com';
