# 05 — دورة حياة المنافسة

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
- **تقييم**: `POST /api/competitions/:id/rate` (1–5) بعد الاكتمال فقط.
- **تعليقات/ردود**: `parent_id` للردود؛ إعجابات عبر `/api/*likes*`.
- **بلاغات**: `POST /api/reports` (`user|competition|comment|ad`) → مراجعة
  إدارية وتحكيم (`arbitration_*`).
- **سحب الأرباح**: `POST /api/withdrawals` → موافقة إدارية → دفع.

## أهلية التقييم

التقييم حق لمن شاهد المنافسة فعلاً، ويُفرض على مستوى الخادم (وليس بإخفاء الزر في الواجهة):

* المنافسة `completed` فقط.
* المقيِّم ليس `creator_id` ولا `opponent_id` (منع التقييم الذاتي — تُستخدم هوية المشاركين الفعلية من صف المنافسة، لا بيانات العميل).
* يوجد سجل `watch_history` للمستخدم على المنافسة (`SELECT 1 FROM watch_history WHERE user_id = ? AND competition_id = ?`).
  لا يوجد حد أدنى موثق لمدة المشاهدة في المخطط الحالي (`watch_history.watch_duration_seconds` حقل إعلامي فقط بلا قاعدة حد أدنى)،
  لذا الشرط هو وجود السجل فقط — ولم تُخترع عتبة جديدة.
* نافذة التقييم **24 ساعة من `competitions.ended_at` (UTC)**: `now <= ended_at + 24h`.
  تُحسب على ساعة الخادم (`Date.now()`) — أي `ended_at`/`now` قادم من العميل يُتجاهل ولا يوسّع النافذة.
  بعد انتهاء النافذة يُرفض `POST /api/competitions/:id/rate` بـ`403` حتى لو شاهد المستخدم ولم يقيّم من قبل.
* لا تقييم مرتين: الزوج `(competition_id, user_id, competitor_id)` فريد (`UNIQUE` في `ratings`)،
  والتحقق `hasRated` يتم قبل الكتابة، وتعارض الإدراج المتزامن يُترجم لنفس خطأ التقييم المكرر.

## مسارات الإدارة
- تعليق منافسة مسيئة (`suspended`)، إيقاف مستخدم (`is_active=0` → جلساته
  تُمسح فوراً)، حدود البلاغات اليومية (`max_reports_per_user_daily`).
