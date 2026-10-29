# 03 — مرجع الـAPI الحقيقي

> مُحدّث يدوياً من `main.ts` — مرجع بشرى للمسارات المربوطة. أي مسار غير مربوط هنا = 404 فعلياً.
> الجرد الآلي المولَّد (بما فيه تصنيف الحماية): `docs/14-ROUTE-INVENTORY.md` (`npm run routes:inventory`).
> عند التعارض في وجود مسار: الكود (`src/main.ts`) هو الفيصل.
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
| `/api/sse` | modules/api/sse | ✅ مربوطة + العميل يتصل الآن عبر SseService (T2.2) — تذكرة `?ticket=` فقط (لا رمز جلسة في الـURL) |
| `/api/recommendations` | modules/api/recommendations | ✅ مربوطة (T1.2) — شاملة competitor-stats/:userId |
| `/api/leaderboard` | modules/api/leaderboard | ✅ مربوطة (T1.2) |
| `/api/analytics` | modules/api/analytics | ✅ مربوطة (T1.2) |
| `/api/cron/run` | modules/api/cron | ✅ (T1.5، حُصّن لاحقاً SEC-04) — `POST` فقط + `Authorization: Bearer <CRON_SECRET>` فقط (لا `?key=`)، تُستدعى من مجدول خارجي كل دقيقة |
| `/api/users/delete-account` (+`/verify`) | modules/api/users/delete-account | ✅ مربوطة (T3.2) — حذف GDPR مع إخفاء الهوية |
| `/api/admin/*` | modules/api/admin | ✅ (T3.4) — رُكّب authMiddleware؛ أفعال البلاغات تُنفذ فعلياً مع سجل تدقيق |
| `/api/reports`, `/api/likes` | mounted at /api | ✅ (T3.4) — أُضيف authMiddleware الاختياري (كانت 401 للأبد) |
| `/api/donations` (+`/webhook`) | modules/api/donations | ✅ مربوطة (T4.1) — Stripe Checkout + webhook موقّع بـHMAC |
| `/api/payment-methods` | modules/api/payments | ✅ مربوطة (T4.2) — طرق السحب للسحوبات |
| `/api/ad-blocks`, `/api/ad-reports` | modules/api/ad-* | ✅ مربوطة (T4.3) |

## B2+B3 — التعليقات (2026-09-10)

- `GET /api/competitions/:id/comments?limit=&offset=&parent_id=` — ترقيم (افتراضي 20، أقصى 100، `offset>=0`)؛ `parent_id` غائب/`null` = جذور مع `replies_count`؛ رقم = ردود مباشرة. الإخراج `{ items, total, limit, offset }`.
- `GET /api/competitions/:id` — حمولة خفيفة: **لا مصفوفات** `comments/requests/ratings`؛ بدلها `{ comments_count, requests_count, ratings_count }`.
- `POST /api/competitions/:id/comments` — بعد الإدراج ينشر `comment_new` عبر `EventPusher.publishComment` داخل `try/catch` (فشل البث لا يفشل الإنشاء).
- `DELETE /api/competitions/:competitionId/comments/:commentId` — حذف ناعم (`deleted_at`)؛ المالك أو الأدمن فقط (غير المالك → 403).
- البلاغات: `comment` موجودة + `message` مضافة (`REPORT_REASONS.message`) عبر نفس `/api/reports` وطابور الأدمن — لا نظام جديد.

## B8 — توحيد الإعجاب/عدم الإعجاب (2026-09-15)

- `POST /api/competitions/:id/dislike` — **جديد**: كان `dislikes` مخزَّناً ومعروضاً في الواجهة بلا أي مسار يكتبه.
- `DELETE /api/competitions/:id/dislike` — **جديد**: حذف عدم الإعجاب (404 + `interactions.dislike_not_found` إن لم يكن موجوداً).
- التبديل **ذرّي** في `db.batch()` واحد: الإعجاب يلغي عدم الإعجاب والعكس، ولا يجتمعان لنفس المستخدم/المنافسة؛ تكرار نفس الفعل idempotent (`INSERT OR IGNORE`).
- `GET /api/competitions/:id/like` — يُعيد الآن `{ liked, disliked, likes_count, dislikes_count }` (كان `{ liked, likeCount }`).
- `competitions.likes_count/dislikes_count` يُعاد حسابهما من الجدولين داخل نفس المعاملة (هما ما تقرأه البطاقات عبر `SELECT c.*`).
- الحظر المركزي (B6) مطبَّق على الفعلين: زوج محظور ⇒ 403 `errors.blocked_interaction` بلا كتابة أي صف.
- لا ترحيل جديد: الجدولان `likes` و`dislikes` موجودان في `0001_initial_schema.sql`.

## R2-V — التقييم: live-only + استبدال + قطع فوري (تحل محل نافذة 24h الملغاة)

- `POST /api/competitions/:id/rate` — للمشاهد المسجل المؤهل فقط (لا تقييم
  ذاتي)، `live` فقط + `watch_history.watch_duration_seconds >= 300` (SSOT
  L1؛ 299⇒403، 300⇒201)، upsert: إنشاء 201 أو **استبدال** 200 (صوت فعال
  واحد لكل viewer/competition/competitor؛ الطرفان معاً مسموحان). كل كتابة
  محروسة داخل SQL بحالة `live` — سباق القطع ⇒ 403 بلا صف. التفاصيل في
  `docs/05-COMPETITION-LIFECYCLE.md` (أهلية التقييم).
- `PUT /api/competitions/:id/rate` — **جديد**: استبدال صريح (200؛ بلا صف
  سابق ⇒ 404) بنفس حراسة `live` + 300s.
- `GET /api/competitions/:id/ratings/summary` — متوسط/count/توزيع 1–5 لكل مشارك
  (`average=null` عند الصفر) + `result:{status,label}` + `provisional/final`؛
  **بلا أي هوية مقيّم**. أثناء البث مؤقتة (SSE `rating_updated`)، وبعده نهائية.
- `DELETE /api/competitions/:id/rate?competitor_id=` — سحب التقييم أثناء `live`
  فقط (بعد القطع ⇒ 403)؛ الحذف محروس داخل SQL بحالة `live`.
- الفائز/ELO ذرّيان (B12): `winner_id` مؤقت أثناء البث ويتثبت عند القطع، وELO
  مرة واحدة عبر مطالبة `elo_applied_at` (0018) عند `finalizeCompetition`
  الفوري — انظر `docs/05` (النتيجة النهائية). المعادلات والـ20/80 كما هي.

## ❌ موجودة ككود لكنها غير مربوطة (404)

| البادئة | الوحدة | الخطة |
|---------|--------|-------|
| `/api/seed` | modules/api/seed | قرار لاحق (بيئة تطوير فقط) |

## UNIT36.1 — تسعير الإعلانات + تحكّم المنافس + الإعلانات الرسمية (2026-10-29)

**التسعير (خدمة حساب واحدة — `src/lib/services/AdPricing.ts`):**
السعر الفعلي بالسنت = `country_base_cents[بلد] × h7 × targeting × media × duration`،
مع تقريب واحد (`Math.round`) ثم حد أدنى سنت واحد. أي مضاعف غير مُعدّ = ×1، وبلا إعداد
يعود السعر إلى `cost_per_impression_cents` للحملة كما هو تماماً. الخصم والدفتر
وتوزيع 80/20 تستخدم السعر الفعلي نفسه، وسعر كل انطباع يُخزَّن في
`ad_impressions.charged_cents`.

**مسارات جديدة (كلها داخل `modules/api`):**

| المسار | الصلاحية | الوظيفة |
|--------|----------|--------|
| `GET /api/admin/ad-pricing` | أدخل فقط (401 للزائر، 403 لغير الأدمن) | إعداد التسعير الحالي (مُتحقَّق منه) |
| `PUT /api/admin/ad-pricing` | أدخل فقط | حفظ/مسح مفاتيح التسعير (تحقّق صارم: مفاتيح مجهولة تُرفض 422) |
| `POST /api/admin/ads/house` | أدخل فقط | إنشاء إعلان رسمي (حد أقصى 3 نشطة، ذرّي داخل الـ INSERT) |
| `GET /api/advertisements/policy` | جلسة فقط | وضع تحكّم الإعلانات + قائمة المنح للمستخدم نفسه |
| `PUT /api/advertisements/policy` | جلسة فقط | `mode` ∈ `auto`/`allow`/`manual`/`block` (422 لقيمة أخرى) |
| `GET /api/advertisements/policy/candidates` | جلسة فقط | الإعلانات المدفوعة القابلة للموافقة (لا رسمية) |
| `POST /api/advertisements/grants` | جلسة فقط | الموافقة على إعلان (422 لإعلان رسمي، 404 لغير موجود) |
| `DELETE /api/advertisements/grants/:adId` | جلسة فقط | إلغاء الموافقة |

- **لا يقبل أي مسار معرّف مستخدم آخر**: هوية الجلسة هي المرجع الوحيد، فلا يستطيع منافس تغيير إعدادات منافس آخر.
- **الإعلانات الرسمية (`is_house=1`)**: لا تُحظر لا لسياسة منافس ولا لـ`ad_blocks`، ولا تُخصم منها ميزانية ولا قيود دفعية، وتعمل كبديل حين لا يوجد إعلان مدفوع مؤهّل.
- **أنماط العرض**: `auto` (سلوك اليوم + حظر كل إعلان على حدة)، `allow` (إذن شامل + بقاء الحظر لكل إعلان)، `manual` (موافقة لكل إعلان من كل منافس يدوي)، `block` (لا إعلانات طرف ثالث إطلاقاً — الرسمي فقط).
- **الوسائط**: خانة إعلانات واحدة ثابتة تقبل `image`/`gif`/`video` (`advertisements.media_kind` + `duration_sec`).

## نقاط حرجة داخل المسارات المربوطة

- `POST /api/competitions/:id/end` — يجب أن يستدعي التقييم←الفائز←الأرباح (T1.5)
- ~~`POST /api/competitions/:id/invite` ينشئ إشعار DB صامت~~ — ✅ يدفع SSE الآن (T2.2)
- المصادقة: `Authorization: Bearer` (غير المتصفح) **أو** كوكي `sessionId` HttpOnly. لا يُقبل رمز جلسة في `?token=` إطلاقاً (SEC-11). `EventSource` يستخدم تذكرة أحادية قصيرة العمر: `POST /api/realtime/ticket` ثم `?ticket=` — وليس رمز الجلسة. رمز `?token=` في `verify-page.ts` مخصّص لتحقق البريد لمرة واحدة وليس جلسة.

> ⚠️ لا تعدّل هذا الملف عبر PowerShell (`Set-Content`) — يفسد ترميز العربية.
