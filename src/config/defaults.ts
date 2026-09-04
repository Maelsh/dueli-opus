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

/**
 * Default signaling/streaming server URL.
 * Used for: WebRTC signaling (HTTP-polling room/create/join/signal/poll/leave —
 * see src/modules/api/signaling/routes.ts and scripts/client/shared.ts SignalingManager).
 *
 * Migrated 2026-09-05 from the old Node signaling server (stream.maelshpro.com) to a
 * Cloudflare Worker + Durable Object (source: D:\projects\opus-dueli\signaling-server,
 * a separate repo/Worker, not part of this Pages project). Override via STREAMING_URL
 * in .dev.vars / Cloudflare Pages env if the Worker is ever redeployed under a new URL
 * or a custom domain is attached to it.
 */
export const DEFAULT_STREAMING_URL = 'https://signaling-server.maelshspro.workers.dev';

/** Default upload server URL */
export const DEFAULT_UPLOAD_URL = 'https://maelshpro.com/ffmpeg';

// NOTE: DEFAULT_TURN_URL (self-hosted coturn, turn:maelshpro.com:3000) removed —
// migrated to Cloudflare Calls TURN (rtc.live.cloudflare.com), see
// src/modules/api/signaling/routes.ts fetchCloudflareIceServers(). No default needed:
// without TURN_TOKEN_ID/TURN_API_TOKEN, /api/signaling/ice-servers falls back to STUN-only.

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
