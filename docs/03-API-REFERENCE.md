# 03 — مرجع الـAPI الحقيقي

> مُحدّث يدوياً من `main.ts` — **الحقيقة الوحيد**. أي مسار غير مربوط هنا = 404 فعلياً.
> آخر تحديث: 2026-08-23

## ✅ مربوطة وتعمل في main.ts

| البادئة | الوحدة | الحالة |
|---------|--------|--------|
| `/api/categories` | modules/api/categories | ✅ |
| `/api/competitions` | modules/api/competitions | ✅ (شامل invite/accept-invite/decline-invite/end + دفع SSE للدعوات T2.2) |
| `/api/users` | modules/api/users | ✅ |
| `/api/notifications` | modules/api/notifications | ✅ (الدفع الفوري أُضيف في T2.2) |
| `/api/auth` (+`/oauth/:provider`) | modules/api/auth | ✅ |
| `/api/countries` | modules/api/countries | ✅ |
| `/api/jitsi` | modules/api/jitsi | 🧊 مهجورة — مرجع فقط |
| `/api/signaling` | modules/api/signaling | ✅ WebRTC |
| `/api/chunks` | modules/api/chunks | ⚠️ BUG-11 يمنع الخصم من الرفع (T1.3) |
| `/api/search` | modules/api/search | ✅ |
| `/api/likes`, `/api/reports`, `/api/messages`, `/api/schedule` | مربوطة على `/api` مباشرة | ✅ |
| `/api/admin` | modules/api/admin | ✅ (زر الحظر زائف — T1.4) |
| `/api/settings` | modules/api/settings | ✅ |
| `/api/earnings`, `/api/withdrawals` | مربوطة | ✅ |
| `/api/advertisements`, `/api/transparency`, `/api/advertiser`, `/api/complaints` | مربوطة | ✅ |
| `/api/matchmaking` | modules/api/matchmaking | ✅ (online-users, heartbeat, offline) |
| `/api/sse` | modules/api/sse | ✅ مربوطة + العميل يتصل الآن عبر SseService (T2.2) — تدعم `?token=` |
| `/api/recommendations` | modules/api/recommendations | ✅ مربوطة (T1.2) — شاملة competitor-stats/:userId |
| `/api/leaderboard` | modules/api/leaderboard | ✅ مربوطة (T1.2) |
| `/api/analytics` | modules/api/analytics | ✅ مربوطة (T1.2) |
| `/api/cron/run?key=` | modules/api/cron | ✅ (T1.5) — محمية بـCRON_SECRET، تُستدعى من مجدول خارجي كل دقيقة |
| `/api/users/delete-account` (+`/verify`) | modules/api/users/delete-account | ✅ مربوطة (T3.2) — حذف GDPR مع إخفاء الهوية |
| `/api/admin/*` | modules/api/admin | ✅ (T3.4) — رُكّب authMiddleware؛ أفعال البلاغات تُنفذ فعلياً مع سجل تدقيق |
| `/api/reports`, `/api/likes` | mounted at /api | ✅ (T3.4) — أُضيف authMiddleware الاختياري (كانت 401 للأبد) |
| `/api/donations` (+`/webhook`) | modules/api/donations | ✅ مربوطة (T4.1) — Stripe Checkout + webhook موقّع بـHMAC |
| `/api/payment-methods` | modules/api/payments | ✅ مربوطة (T4.2) — طرق السحب للسحوبات |
| `/api/ad-blocks`, `/api/ad-reports` | modules/api/ad-* | ✅ مربوطة (T4.3) |

## ❌ موجودة ككود لكنها غير مربوطة (404)

| البادئة | الوحدة | الخطة |
|---------|--------|-------|
| `/api/seed` | modules/api/seed | قرار لاحق (بيئة تطوير فقط) |

## نقاط حرجة داخل المسارات المربوطة

- `POST /api/competitions/:id/end` — يجب أن يستدعي التقييم←الفائز←الأرباح (T1.5)
- ~~`POST /api/competitions/:id/invite` ينشئ إشعار DB صامت~~ — ✅ يدفع SSE الآن (T2.2)
- المصادقة: Bearer header **أو** `?token=` **أو** cookie sessionId (مطلوب لـEventSource)

> ⚠️ لا تعدّل هذا الملف عبر PowerShell (`Set-Content`) — يفسد ترميز العربية.
