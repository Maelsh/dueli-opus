# 05 — دورة حياة المنافسة

> **المصدر الوحيد (SSOT) لمنطق الدورة:** `ScheduledTaskService`
> (`src/lib/services/ScheduledTaskService.ts`) — كل انتقالات الحالة وآثارها
> الجانبية تعيش هناك فقط (F-6). `CronHandler` (`src/lib/services/CronHandler.ts`)
> يحتفظ بفحوص المؤقتات (القواعد A/B/C: فوري بلا منافس خلال ساعة = حذف؛ مجدول لم
> يبدأ بعد موعده بساعة = إلغاء؛ بث يتجاوز ساعتين) **ويفوّض** التنفيذ للعمليات
> المشتركة في `ScheduledTaskService` — لا SQL دورة مكرراً في `CronHandler`.
> إشعارات الدورة مترجمة عبر `t()` (F-7): لا نصوص حرفية في مسارات الإشعارات.

## الحالات

```
pending ──▶ accepted ──▶ live ──▶ completed (recorded/VOD)
   │            │           │
   │            │           └──▶ cancelled (إلغاء)
   └──▶ cancelled            └──▶ suspended (veto إداري)
```

> القيم في الكود: `'pending' | 'accepted' | 'live' | 'completed' | 'cancelled'`
> (`src/config/types.ts`). الواجهة تعرض أيضاً `scheduled/upcoming/recorded`
> كمشتقات عرضية (مجدولة = `accepted` مع `scheduled_at` مستقبلي).

## الخطوات

### 1. الإنشاء (`POST /api/competitions`)
- المنشئ = `creator_id`، الحالة `pending`، النوع `instant` أو `scheduled`.
- `CompetitionController.create` — يتطلب جلسة (`Authorization: Bearer`).

### 2. الانضمام (طلبات + دعوات)
- **طلب انضمام**: `POST /api/competitions/:id/request` → صف في
  `competition_requests` (`pending`, `expires_at` = +24h).
- **دعوة**: المنشئ يدعو مستخدماً → `competition_invitations` (`pending`).
- **قبول الطلب**: `POST .../request/:requestId/accept` → المنافسة `accepted`،
  `accepted_at` يُكتب في `competitions` (0010) وفي الدعوة (0011)،
  وتُرفض بقية الطلبات المعلقة (`declineAllOther`).
- **رفض/إلغاء**: `declineRequest` / `cancelRequest`.
- انتهاء الصلاحية: مهمة cron (`ScheduledTaskService.expireOldRequests`)
  تُسقط ما تجاوز `expires_at`.

### 3. البث (`accepted` → `live`)
- `POST /api/competitions/:id/start` → `live` (+ `started_at`).
- غرفة الإشارة تُنشأ (`/api/signaling/room/create`)، والطرفان ينضمان
  عبر `/live/:id` (انظر `docs/04-STREAMING-PIPELINE.md`).
- التعليقات الحية: `POST /api/competitions/:id/comments` + قناة SSE
  `competition:<id>`.

### 4. الإنهاء (`live` → `completed`)
- `endStream()` (العميل) → finalize الفيديو → 
  `POST /api/competitions/:id/end {vod_url}` → `completed` (+ `ended_at`).
- تُحتسب المشاهدات والأرباح (`LivePayoutEngine`، سجل الشفافية).

### 5. ما بعد البث
- **تقييم (R2-V: أثناء البث فقط)**: `POST /api/competitions/:id/rate` (1–5)
  للمشاهد المؤهل (300s live) أثناء `live` فقط؛ `PUT` للاستبدال و`DELETE`
  للسحب بنفس الحراسة. بعد `completed` كل كتابة مرفوضة فوراً (لا نافذة).
- **تعليقات/ردود**: `parent_id` للردود؛ إعجابات عبر `/api/*likes*`.
- **بلاغات**: `POST /api/reports` (`user|competition|comment|ad`) → مراجعة
  إدارية وتحكيم (`arbitration_*`).
- **سحب الأرباح**: `POST /api/withdrawals` → موافقة إدارية → دفع.

## أهلية التقييم (R2-V: live-only + L1 300s — تحل محل نافذة 24h الملغاة)

التقييم حق لمن شاهد البث المباشر فعلاً (300s)، ويُفرض على مستوى الخادم
(وليس بإخفاء الزر في الواجهة):

* المنافسة `live` فقط — بعد القطع (`completed`) كل كتابة (`POST`/`PUT`/
  `DELETE`) مرفوضة فوراً (`403`) بلا نافذة 24h وبلا مهلة سماح.
* المقيِّم مسجل (جلسة) وليس `creator_id` ولا `opponent_id` (منع التقييم
  الذاتي — تُستخدم هوية المشاركين الفعلية من صف المنافسة، لا بيانات العميل).
* الأهلية من SSOT الـL1 وحده: `watch_history.watch_duration_seconds >= 300`
  لنفس `(user, competition)` عبر `WatchService.getViewerWatch` — أي
  `seconds`/`user_id`/`live` قادمة من العميل تُتجاهل بالبناء (299 مرفوض،
  300 مسموح). الضيوف لا يراكمون H1 فلا أهلية لهم.
* صوت فعال واحد لكل `(competition_id, user_id, competitor_id)` (`UNIQUE`
  في `ratings`) — التعديل **يستبدل** القيمة السابقة (upsert: `POST` إنشاء
  201 أو استبدال 200؛ `PUT` استبدال صريح)، ويمكن تقييم الطرفين معاً.
* كل كتابة محروسة **داخل SQL** بحالة `live` (لا check-then-write منفصل):
  سباق الإغلاق-مقابل-التقييم ينتهي بلا صف ما بعد القطع، والتزامن على نفس
  المفتاح يتسلسل لصف واحد (إعادة محاولة الاستبدال عند تعارض `UNIQUE`).

## النتيجة النهائية: الفائز، التعادل، وذرّية ELO (B12)

### قاعدة الفائز
* الفائز = صاحب **أعلى متوسط تقييم مشاهدين** (`creator_rating` / `opponent_rating` محسوبان من `ratings`).
* **التعادل (قاعدة صريحة):** تساوي المتوسطين — بما في ذلك كلاهما صفر أو غياب الخصم —
  ⇒ `winner_id = NULL` **و** ELO بقاعدة التعادل (0.5 لكل طرف) تُطبَّق مرة واحدة. لا تُترك حالة التعادل ضمنية أبداً.

### الذرّية (B12 + R2-V)
* أثناء `live`: بعد كل تصويت/استبدال/سحب، تُكتب (المتوسطات + `winner_id`
  **المؤقت**) في **`db.batch()` واحد** — D1 ينفّذ الدفعة كمعاملة واحدة
  مُتسلسلة، فلا يمكن أن تُلاحظ حالة نصف-مكتوبة. الحصيلة المؤقتة معروضة
  بوضوح وتُبث عبر قناة `competition:<id>` القائمة (`rating_updated`).
* عند الإغلاق: القطع أولاً (`live → completed` المحروس)، ثم النتيجة
  النهائية + ELO + `finalizePayouts` **مرة واحدة** عبر `finalizeCompetition`
  (idempotent) مع مهمة `finalize_payouts`/`recalc_aggregates` كإعادة دائمة.
* `winner_id` يبقى مؤقتاً مع كل تصويت أثناء البث، ثم يتثبت نهائياً عند القطع.

### ELO مرة واحدة فقط (idempotency داخل قاعدة البيانات)
* عمود جديد `competitions.elo_applied_at` (migration **0018**).
* **ELO لا يُحسم إلا عند القطع** (`live → completed`) — عندها النتيجة نهائية
  ولا يمكن لأي كتابة لاحقة (مرفوضة كلها) أن تجعل ELO متناقضاً مع النتيجة.
  أثناء البث يبقى ELO untouched. الصفوف التاريخية `completed` لا يُعاد
  احتسابها (الـ`end` عليها no-op).
* المنع **داخل SQL، لا JavaScript**: كتابتا `users.elo_rating` مشروطتان بـ
  `(SELECT elo_applied_at FROM competitions WHERE id = ?) IS NULL`، والمطالبة نفسها
  `UPDATE competitions SET elo_applied_at = ? WHERE id = ? AND elo_applied_at IS NULL`
  — أي استدعاء متزامن/متكرر (بعد تسلسل الدفعات) يجد العمود معبأً وتطابق كتاباته صفر صفوف.
* كل ذلك داخل **نفس الدفعة الذرّية** أعلاه.

### فشل حساب الـaggregates
* فشل الدفعة **لا يفشل التصويت** (يبقى `201`)؛ لا ابتلاع صامت: يُسجَّل الخطأ
  **وتُجدول مهمة `recalc_aggregates` (+60 ثانية)** كسجل دائم، تُنفَّذ عبر
  `processPendingTasks` — إعادة التنفيذ آمنة لأن المسار idempotent.

### حدود
* `LivePayoutEngine` وكل المنطق المالي لم يُمَس (المعادلات 20/80 كما هي)؛
  `finalizeCompetition` أعيد استخدام المسار الذرّي أعلاه ثم يستدعي
  `finalizePayouts` كما هو — تغيّر **التوقيت/الربط فقط** (فوري عند القطع
  بدل +24h) لزوم R2-V.

## مسارات الإدارة
- تعليق منافسة مسيئة (`suspended`)، إيقاف مستخدم (`is_active=0` → جلساته
  تُمسح فوراً)، حدود البلاغات اليومية (`max_reports_per_user_daily`).
