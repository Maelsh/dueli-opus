# جرد مسارات API — مولَّد آلياً

> **لا تحرّر هذا الملف يدوياً.** أعد توليده: `node dev-tools/route-inventory.mjs`
> تاريخ التوليد: 2026-09-10T18:25:44.024Z

## الإجمالي: 172 مسار

| التصنيف | العدد |
|---|---|
| PUBLIC(auth-optional, in-handler check required) | 80 |
| UNGUARDED ⚠ | 44 |
| AUTHENTICATED | 48 |

## الحماية على مستوى المجموعات (main.ts)

| النمط | الوسيط |
|---|---|
| `*` | `securityHeaders(` |
| `/api/*` | `rateLimit(` |
| `/api/auth/*` | `rateLimit(` |
| `/api/*` | `csrfProtection(` |

## المسارات

| Method | Path | التصنيف | الحواجز | الملف |
|---|---|---|---|---|
| GET | `/api` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/schedule/routes.ts` |
| GET | `/api/ad-blocks` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/ad-blocks/routes.ts` |
| POST | `/api/ad-blocks` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/ad-blocks/routes.ts` |
| DELETE | `/api/ad-blocks/:adId` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/ad-blocks/routes.ts` |
| POST | `/api/ad-reports` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/ad-reports/routes.ts` |
| POST | `/api/ad-reports/admin/:id/review` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/ad-reports/routes.ts` |
| GET | `/api/ad-reports/admin/all` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/ad-reports/routes.ts` |
| GET | `/api/ad-reports/admin/pending` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/ad-reports/routes.ts` |
| GET | `/api/ad-reports/my-reports` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/ad-reports/routes.ts` |
| GET | `/api/ad-reports/reasons` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/ad-reports/routes.ts` |
| GET | `/api/admin/ads` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/admin/routes.ts` |
| POST | `/api/admin/ads` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/admin/routes.ts` |
| DELETE | `/api/admin/ads/:id` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/admin/routes.ts` |
| PUT | `/api/admin/ads/:id` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/admin/routes.ts` |
| GET | `/api/admin/arbitrations` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/admin/routes.ts` |
| PUT | `/api/admin/arbitrations/:id/assign` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/admin/routes.ts` |
| PUT | `/api/admin/arbitrations/:id/transition` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/admin/routes.ts` |
| GET | `/api/admin/audit-logs` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/admin/routes.ts` |
| POST | `/api/admin/competitions/:id/restore` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/admin/routes.ts` |
| POST | `/api/admin/competitions/:id/suspend` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/admin/routes.ts` |
| GET | `/api/admin/enhanced-stats` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/admin/routes.ts` |
| GET | `/api/admin/live-finance/:id` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/admin/routes.ts` |
| POST | `/api/admin/live-finance/:id/finalize` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/admin/routes.ts` |
| GET | `/api/admin/reports` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/admin/routes.ts` |
| PUT | `/api/admin/reports/:id` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/admin/routes.ts` |
| GET | `/api/admin/roles` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/admin/routes.ts` |
| POST | `/api/admin/roles` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/admin/routes.ts` |
| DELETE | `/api/admin/roles/:id` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/admin/routes.ts` |
| GET | `/api/admin/settings` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/admin/routes.ts` |
| PUT | `/api/admin/settings` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/admin/routes.ts` |
| GET | `/api/admin/stats` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/admin/routes.ts` |
| GET | `/api/admin/users` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/admin/routes.ts` |
| PUT | `/api/admin/users/:id/ban` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/admin/routes.ts` |
| GET | `/api/admin/withdrawals` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/admin/routes.ts` |
| PUT | `/api/admin/withdrawals/:id/approve` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/admin/routes.ts` |
| PUT | `/api/admin/withdrawals/:id/reject` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/admin/routes.ts` |
| GET | `/api/advertisements` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/advertisements/routes.ts` |
| GET | `/api/advertisements/:id` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/advertisements/routes.ts` |
| POST | `/api/advertisements/:id/click` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/advertisements/routes.ts` |
| POST | `/api/advertisements/:id/impression` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/advertisements/routes.ts` |
| GET | `/api/advertisements/competition/:id/revenue` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/advertisements/routes.ts` |
| POST | `/api/advertiser/campaigns` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/advertiser/routes.ts` |
| GET | `/api/advertiser/campaigns/:id/analytics` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/advertiser/routes.ts` |
| PUT | `/api/advertiser/campaigns/:id/pause` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/advertiser/routes.ts` |
| PUT | `/api/advertiser/campaigns/:id/resume` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/advertiser/routes.ts` |
| GET | `/api/advertiser/dashboard` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/advertiser/routes.ts` |
| GET | `/api/analytics/admin/dashboard` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/analytics/routes.ts` |
| GET | `/api/analytics/public` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/analytics/routes.ts` |
| POST | `/api/analytics/track` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/analytics/routes.ts` |
| POST | `/api/analytics/view` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/analytics/routes.ts` |
| POST | `/api/auth/forgot-password` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/auth/routes.ts` |
| POST | `/api/auth/login` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/auth/routes.ts` |
| POST | `/api/auth/logout` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/auth/routes.ts` |
| GET | `/api/auth/oauth/:provider` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/auth/oauth-routes.ts` |
| GET | `/api/auth/oauth/:provider/callback` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/auth/oauth-routes.ts` |
| POST | `/api/auth/register` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/auth/routes.ts` |
| POST | `/api/auth/resend-verification` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/auth/routes.ts` |
| POST | `/api/auth/reset-password` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/auth/routes.ts` |
| GET | `/api/auth/session` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/auth/routes.ts` |
| GET | `/api/auth/verify` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/auth/routes.ts` |
| POST | `/api/auth/verify-reset-code` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/auth/routes.ts` |
| GET | `/api/blocks` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/blocks/routes.ts` |
| POST | `/api/blocks` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/blocks/routes.ts` |
| DELETE | `/api/blocks/:userId` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/blocks/routes.ts` |
| GET | `/api/categories` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/categories/routes.ts` |
| GET | `/api/categories/:id` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/categories/routes.ts` |
| GET | `/api/categories/:id/subcategories` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/categories/routes.ts` |
| DELETE | `/api/chunks/:key` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/chunks/routes.ts` |
| GET | `/api/chunks/playlist/:id` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/chunks/routes.ts` |
| POST | `/api/chunks/register` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/chunks/routes.ts` |
| GET | `/api/chunks/verify` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/chunks/routes.ts` |
| GET | `/api/competitions` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/competitions/routes.ts` |
| POST | `/api/competitions` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/competitions/routes.ts` |
| DELETE | `/api/competitions/:competitionId/comments/:commentId` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/competitions/routes.ts` |
| DELETE | `/api/competitions/:id` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/competitions/routes.ts` |
| GET | `/api/competitions/:id` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/competitions/routes.ts` |
| PUT | `/api/competitions/:id` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/competitions/routes.ts` |
| POST | `/api/competitions/:id/accept-invite` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/competitions/routes.ts` |
| POST | `/api/competitions/:id/accept-request` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/competitions/routes.ts` |
| GET | `/api/competitions/:id/comments` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/competitions/routes.ts` |
| POST | `/api/competitions/:id/comments` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/competitions/routes.ts` |
| POST | `/api/competitions/:id/decline-invite` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/competitions/routes.ts` |
| POST | `/api/competitions/:id/decline-request` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/competitions/routes.ts` |
| POST | `/api/competitions/:id/end` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/competitions/routes.ts` |
| POST | `/api/competitions/:id/invite` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/competitions/routes.ts` |
| DELETE | `/api/competitions/:id/like` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/likes/routes.ts` |
| GET | `/api/competitions/:id/like` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/likes/routes.ts` |
| POST | `/api/competitions/:id/like` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/likes/routes.ts` |
| GET | `/api/competitions/:id/likes` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/likes/routes.ts` |
| POST | `/api/competitions/:id/rate` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/competitions/routes.ts` |
| DELETE | `/api/competitions/:id/remind` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/schedule/routes.ts` |
| GET | `/api/competitions/:id/remind` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/schedule/routes.ts` |
| POST | `/api/competitions/:id/remind` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/schedule/routes.ts` |
| DELETE | `/api/competitions/:id/request` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/competitions/routes.ts` |
| POST | `/api/competitions/:id/request` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/competitions/routes.ts` |
| GET | `/api/competitions/:id/requests` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/competitions/routes.ts` |
| POST | `/api/competitions/:id/start` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/competitions/routes.ts` |
| POST | `/api/competitions/:id/update-vod` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/competitions/routes.ts` |
| POST | `/api/complaints` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/complaints/routes.ts` |
| GET | `/api/complaints/:id` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/complaints/routes.ts` |
| GET | `/api/complaints/my` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/complaints/routes.ts` |
| GET | `/api/conversations` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/messages/routes.ts` |
| GET | `/api/conversations/:id/messages` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/messages/routes.ts` |
| POST | `/api/conversations/:id/messages` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/messages/routes.ts` |
| GET | `/api/countries` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/countries/routes.ts` |
| GET | `/api/countries/:code` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/countries/routes.ts` |
| POST | `/api/cron/run` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/cron/routes.ts` |
| POST | `/api/donations` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/donations/routes.ts` |
| POST | `/api/donations/:id/complete` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/donations/routes.ts` |
| GET | `/api/donations/my` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/donations/routes.ts` |
| GET | `/api/donations/top-supporters` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/donations/routes.ts` |
| GET | `/api/donations/total` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/donations/routes.ts` |
| POST | `/api/donations/webhook` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/donations/routes.ts` |
| GET | `/api/earnings` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/earnings/routes.ts` |
| GET | `/api/earnings/competition/:id` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/earnings/routes.ts` |
| GET | `/api/earnings/history` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/earnings/routes.ts` |
| GET | `/api/jitsi/config` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/jitsi/routes.ts` |
| GET | `/api/jitsi/status` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/jitsi/routes.ts` |
| GET | `/api/leaderboard` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/leaderboard/routes.ts` |
| POST | `/api/matchmaking/heartbeat` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/matchmaking/routes.ts` |
| POST | `/api/matchmaking/offline` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/matchmaking/routes.ts` |
| GET | `/api/matchmaking/online-users` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/matchmaking/routes.ts` |
| GET | `/api/messages/unread` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/messages/routes.ts` |
| GET | `/api/notifications` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/notifications/routes.ts` |
| POST | `/api/notifications/:id/read` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/notifications/routes.ts` |
| POST | `/api/notifications/read-all` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/notifications/routes.ts` |
| GET | `/api/payment-methods` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/payments/routes.ts` |
| POST | `/api/payment-methods` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/payments/routes.ts` |
| DELETE | `/api/payment-methods/:id` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/payments/routes.ts` |
| PUT | `/api/payment-methods/:id` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/payments/routes.ts` |
| POST | `/api/payment-methods/:id/default` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/payments/routes.ts` |
| GET | `/api/recommendations` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/recommendations/routes.ts` |
| GET | `/api/recommendations/competitor-stats/:userId` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/recommendations/routes.ts` |
| GET | `/api/reminders` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/schedule/routes.ts` |
| POST | `/api/reports` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/reports/routes.ts` |
| GET | `/api/reports/reasons` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/reports/routes.ts` |
| GET | `/api/search/competitions` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/search/routes.ts` |
| GET | `/api/search/live` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/search/routes.ts` |
| GET | `/api/search/pending` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/search/routes.ts` |
| GET | `/api/search/suggestions` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/search/routes.ts` |
| GET | `/api/search/trending` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/search/routes.ts` |
| GET | `/api/search/users` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/search/routes.ts` |
| GET | `/api/settings` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/settings/routes.ts` |
| PUT | `/api/settings` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/settings/routes.ts` |
| GET | `/api/settings/feed` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/settings/routes.ts` |
| POST | `/api/settings/posts` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/settings/routes.ts` |
| DELETE | `/api/settings/posts/:id` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/settings/routes.ts` |
| GET | `/api/settings/users/:id/posts` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/settings/routes.ts` |
| GET | `/api/signaling/config` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/signaling/routes.ts` |
| GET | `/api/signaling/ice-servers` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/signaling/routes.ts` |
| POST | `/api/signaling/room/create` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/signaling/routes.ts` |
| POST | `/api/signaling/verify` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/signaling/routes.ts` |
| GET | `/api/sse` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/sse/routes.ts` |
| GET | `/api/transparency` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/transparency/routes.ts` |
| GET | `/api/transparency/audit` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/transparency/routes.ts` |
| GET | `/api/transparency/daily` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/transparency/routes.ts` |
| GET | `/api/transparency/donations-feed` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/transparency/routes.ts` |
| GET | `/api/transparency/feed` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/transparency/routes.ts` |
| GET | `/api/transparency/payroll` | UNGUARDED ⚠ | group:rateLimit, group:csrf | `src/modules/api/transparency/routes.ts` |
| GET | `/api/users` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/users/routes.ts` |
| DELETE | `/api/users/:id/follow` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/users/routes.ts` |
| POST | `/api/users/:id/follow` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/users/routes.ts` |
| POST | `/api/users/:id/message` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/messages/routes.ts` |
| GET | `/api/users/:id/requests` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/users/routes.ts` |
| GET | `/api/users/:username` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/users/routes.ts` |
| POST | `/api/users/delete-account` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/users/delete-account.ts` |
| POST | `/api/users/delete-account/verify` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/users/delete-account.ts` |
| PUT | `/api/users/preferences` | PUBLIC(auth-optional, in-handler check required) | router:auth-optional, group:rateLimit, group:csrf | `src/modules/api/users/routes.ts` |
| GET | `/api/withdrawals` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/withdrawals/routes.ts` |
| POST | `/api/withdrawals` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/withdrawals/routes.ts` |
| DELETE | `/api/withdrawals/:id` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/withdrawals/routes.ts` |
| GET | `/api/withdrawals/:id` | AUTHENTICATED | router:auth, group:rateLimit, group:csrf | `src/modules/api/withdrawals/routes.ts` |

> **تنبيه:** التصنيف يعتمد فحص `authMiddleware` داخل ملف الراوتر المباشر فقط
> (لا يتتبّع طبقات وسيطة إضافية). راوتر بلا `authMiddleware` يُصنَّف `UNGUARDED ⚠`
> حتى لو كان عاماً عن قصد — راجع `docs/12-SECURITY-REMEDIATION.md` (SEC-13)
> قبل اعتبار أي علامة ⚠ ثغرة فعلية.
