# 🎯 الخطة الموحدة النهائية لإكمال منطق منصة ديولي
# Dueli Unified Master Plan – Gemini × Blackbox Merged Edition

> **النسخة النهائية المعتمدة** – جمع وترتيب وتصحيح خطتي الوكيلين (Gemini + Blackbox) مع محاذير المستخدم.

---

## ⚠️ محاذير حاسمة (خطوط حمراء)

قبل أي تنفيذ، يجب مراعاة هذه القواعد الصارمة:

| # | المحذور | التفاصيل |
|---|---------|----------|
| 🔴 1 | **لا تمس البث الخارجي** | منطق Signaling Server و TURN Servers خارجي ومتكامل. لا نعيد كتابته. نتعامل مع الموجود كـ API خارجي |
| 🔴 2 | **لا تمس التصميم** | الواجهة والتصميم الحالي لا يُعدّل. كل التغييرات في المنطق فقط (Backend + Client Logic) |
| 🔴 3 | **الأولوية للمنطق الأساسي** | لا نعمل على التحسينات أو ما بعد الإطلاق حتى يكتمل كل المنطق الأساسي |

---

## 📊 تقييم مقارن: أين اتفقنا وأين اختلفنا؟

### ✅ ما اتفقنا عليه (Gemini + Blackbox):

| # | النقطة | Gemini | Blackbox | الحكم |
|---|--------|--------|----------|-------|
| 1 | حالة `is_busy` للمستخدمين | ✅ | ✅ | **متفق – حاسم** |
| 2 | Cron Jobs (5 دقائق / شهري / سنوي) | ✅ | ✅ | **متفق – ضروري** |
| 3 | Cascade Delete للمنافسات | ✅ | ✅ | **متفق – ضروري** |
| 4 | حد 3 منافسات pending | ✅ | ✅ | **متفق** |
| 5 | حد 10 طلبات معلقة | ✅ | ✅ | **متفق** |
| 6 | ساعتان حد أقصى للمنافسة الحية | ✅ | ✅ | **متفق** |
| 7 | فحص التضارب الزمني | ✅ | ✅ | **متفق – حاسم** |
| 8 | جدول `user_blocks` | ✅ | ✅ | **متفق** |
| 9 | SSE للإشعارات الفورية | ✅ | ✅ | **متفق** |
| 10 | Heartbeat System | ❌ لم يُذكر صراحة | ✅ | **نأخذ من Blackbox** |
| 11 | نظام التوصيات (11 معيار) | ✅ | ✅ | **متفق** |
| 12 | Schema.sql مفقود | ✅ | ✅ | **متفق – حرج** |
| 13 | Error Classes مركزية | ✅ | ✅ | **متفق** |
| 14 | Retry Queue لرفع القطع | ✅ | ✅ | **متفق** |

### 🔀 أين أضاف كل وكيل:

| النقطة | Gemini أضاف | Blackbox أضاف |
|--------|-------------|---------------|
| **Heartbeat System** (نبضات كل 30 ثانية) | ❌ | ✅ نأخذه |
| **Busy Timeout** (10 دقائق بدون منافسة حية) | ✅ | ❌ نأخذه |
| **تحذير بالبريد قبل حذف المستخدم** | ✅ | ❌ نأخذه |
| **جدول `competition_scheduled_tasks`** | ❌ | ✅ نأخذه |
| **جدول `competition_heartbeats`** | ❌ | ✅ نأخذه |
| **جدول `competition_invitations`** (دعوات) | ❌ | ✅ نأخذه |
| **جدول `watch_later`** | ✅ | ❌ نأخذه |
| **جدول `user_keywords`** | ✅ | ❌ نأخذه |
| **MigrationManager class** | ❌ | ✅ نأخذه |
| **Validation بـ Zod** | ✅ | ❌ نأخذه |
| **Rate Limiting** | ✅ | ❌ نأخذه |
| **CSRF Protection** | ✅ | ❌ نأخذه |
| **عرض المتنافسين المتاحين** | ✅ Gemini ذكره كمخاطر | ✅ Blackbox كتب الكود | **نأخذ كود Blackbox** |

### ⚠️ تصحيحات على عمل الزميل (Blackbox):

| # | الملاحظة | التصحيح |
|---|----------|---------|
| 1 | **ملف `DUELI_TODO_IMPLEMENTATION.md` مبتور** (سطر 531-595 نص completion XML) | نتجاهل الجزء المبتور ونعتمد `FINAL_TODO_LIST.md` |
| 2 | **`DUELI_FINAL_TODO_LIST.md` مبتور عند سطر 912** (دالة `endStreaming` ناقصة) | نُكمل المنطق الناقص في الخطة الموحدة |
| 3 | **SQL Injection في التوصيات**: `c.title LIKE '%${k}%'` (سطر 784 في MASTER_PLAN) | يجب استخدام parameterized queries |
| 4 | **`BEGIN IMMEDIATE` و `COMMIT`/`ROLLBACK`** غير مدعوم في D1 | نستخدم `db.batch()` بدلاً منه (كما فعل Blackbox في FINAL_TODO) |
| 5 | **نوع الإشعار `request_declined`** غير موجود في CHECK constraint | يجب إضافته لقائمة أنواع الإشعارات |
| 6 | **الحظر يمنع المشاهدة؟** Blackbox لم يحدد. Gemini حدد: لا يمنع المشاهدة | **نعتمد Gemini**: الحظر يمنع الطلبات والدعوات فقط، لا المشاهدة |

---

## 🏗️ القسم الأول: قاعدة البيانات الموحدة (Unified Schema)

### 1.1 الجداول الأساسية الموجودة (تحتاج تعريف رسمي في schema.sql)

```
الجداول الموجودة في seed.sql والمستخدمة في الكود:
├── users
├── competitions
├── categories
├── countries
├── sessions
├── competition_requests
├── ratings
├── comments
├── notifications
├── follows
├── reports
├── likes / dislikes
├── messages / conversations
├── advertisements
├── ad_impressions
├── user_earnings
├── user_settings
├── user_posts
└── competition_reminders
```

### 1.2 الجداول الجديدة المطلوبة (متفق عليها من الخطتين)

```sql
-- ==========================================
-- الجداول الجديدة (يُضاف في schema.sql)
-- ==========================================

-- 1. الحظر بين المستخدمين
CREATE TABLE user_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(blocker_id, blocked_id)
);
CREATE INDEX idx_blocks_blocker ON user_blocks(blocker_id);
CREATE INDEX idx_blocks_blocked ON user_blocks(blocked_id);

-- 2. سجل المشاهدات
CREATE TABLE watch_history (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    watched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    watch_duration_seconds INTEGER DEFAULT 0,
    completed BOOLEAN DEFAULT 0,
    PRIMARY KEY (user_id, competition_id)
);
CREATE INDEX idx_watch_history_user ON watch_history(user_id);
CREATE INDEX idx_watch_history_watched ON watch_history(watched_at);

-- 3. كلمات مفتاحية المستخدم (من العناوين والمشاهدات)
CREATE TABLE user_keywords (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    keyword TEXT NOT NULL,
    weight REAL DEFAULT 1.0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, keyword)
);

-- 4. قائمة المشاهدة اللاحقة
CREATE TABLE watch_later (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, competition_id)
);

-- 5. نبضات المنافسة (Heartbeats) – من Blackbox
CREATE TABLE competition_heartbeats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(competition_id, user_id)
);
CREATE INDEX idx_heartbeats_last_seen ON competition_heartbeats(last_seen);

-- 6. المهام المجدولة – من Blackbox
CREATE TABLE competition_scheduled_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    task_type TEXT NOT NULL CHECK (task_type IN (
        'auto_delete_if_not_live',
        'auto_end_live',
        'send_reminder',
        'distribute_earnings',
        'check_disconnection'
    )),
    execute_at DATETIME NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    result_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    executed_at DATETIME
);
CREATE INDEX idx_scheduled_tasks_execute ON competition_scheduled_tasks(execute_at, status);

-- 7. دعوات المنافسة (من المنشئ للمتنافس) – من Blackbox
CREATE TABLE competition_invitations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    inviter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invitee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
    expires_at DATETIME DEFAULT (datetime('now', '+24 hours')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(competition_id, invitee_id)
);

-- 8. المنافسات المخفية (لاستبعادها من التوصيات)
CREATE TABLE user_hidden_competitions (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    hidden_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, competition_id)
);

-- 9. أرباح المنصة
CREATE TABLE platform_earnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER REFERENCES competitions(id),
    amount REAL NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 10. جدول الـ Migrations
CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 1.3 الحقول المضافة للجداول الموجودة

```sql
-- في جدول users:
ALTER TABLE users ADD COLUMN is_busy BOOLEAN DEFAULT 0;
ALTER TABLE users ADD COLUMN current_competition_id INTEGER REFERENCES competitions(id);
ALTER TABLE users ADD COLUMN busy_since DATETIME;
ALTER TABLE users ADD COLUMN elo_rating INTEGER DEFAULT 1500;
ALTER TABLE users ADD COLUMN last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP;

-- في جدول competitions:
ALTER TABLE competitions ADD COLUMN accepted_at DATETIME;
ALTER TABLE competitions ADD COLUMN max_duration INTEGER DEFAULT 7200;
ALTER TABLE competitions ADD COLUMN recording_url TEXT;

-- في جدول competition_requests:
ALTER TABLE competition_requests ADD COLUMN expires_at DATETIME DEFAULT (datetime('now', '+24 hours'));

-- في جدول notifications: التأكد من وجود
-- reference_type TEXT, reference_id INTEGER, is_delivered BOOLEAN DEFAULT 0
```

### 1.4 توحيد حالات المنافسة

```
الحالات الرسمية المعتمدة (5 حالات فقط):
├── pending     → بانتظار خصم
├── accepted    → تم قبول الخصم، بانتظار البث
├── live        → البث جارٍ
├── completed   → انتهت وتم تسجيلها
└── cancelled   → تم إلغاؤها

⚠️ يجب استبدال 'recorded' بـ 'completed' في كل مكان (seed.sql + الكود)
```

### 1.5 أنواع الإشعارات المعتمدة

```sql
CHECK (type IN (
    'competition_request',       -- طلب انضمام جديد
    'competition_invitation',    -- دعوة من منشئ
    'request_accepted',          -- تم قبول طلبك
    'request_declined',          -- تم رفض طلبك / اختيار غيرك
    'competition_starting',      -- المنافسة ستبدأ قريباً
    'competition_ended',         -- المنافسة انتهت
    'competition_cancelled',     -- المنافسة أُلغيت
    'follow',                    -- متابعة جديدة
    'like',                      -- إعجاب
    'comment',                   -- تعليق جديد
    'earnings',                  -- أرباح جديدة
    'busy_conflict',             -- أنت مشغول ولديك منافسة أخرى
    'system'                     -- نظام
))
```

---

## ⚔️ القسم الثاني: دورة حياة المنافسة الكاملة (Competition Lifecycle)

### 2.1 مخطط الانتقالات

```
[إنشاء] → pending
    │
    ├── (قبول طلب أو دعوة) → accepted
    │       │
    │       ├── (بدء بث الطرفين) → live
    │       │       │
    │       │       ├── (إنهاء يدوي أو انتهاء ساعتين) → completed ✅
    │       │       └── (إلغاء من الإدارة فقط) → cancelled
    │       │
    │       └── (لم يبث أحد خلال ساعة) → cancelled → حذف
    │
    ├── (لم ينضم أحد خلال ساعة) → حذف مباشر
    │
    └── (إلغاء من المنشئ) → cancelled → حذف
```

### 2.2 الانتقالات المسموحة (State Machine)

```typescript
const allowedTransitions: Record<CompetitionStatus, CompetitionStatus[]> = {
    'pending':   ['accepted', 'cancelled'],
    'accepted':  ['live', 'cancelled'],
    'live':      ['completed'],
    'completed': [],  // لا شيء – نهائي
    'cancelled': []   // لا شيء – نهائي
};
```

### 2.3 الفرق بين الفورية والمجدولة

| | الفورية (Immediate) | المجدولة (Scheduled) |
|---|---|---|
| `scheduled_at` | `NULL` | تاريخ ووقت |
| متى تُحذف إن لم ينضم أحد | ساعة من الإنشاء | ساعة من الموعد المجدول |
| متى تُحذف بعد القبول | ساعة من القبول | ساعة من الموعد المجدول |
| متى تتحول لحية | فور بث الطرفين | فور بث الطرفين (الموعد مرجع فقط) |

### 2.4 المؤقتات (Timers)

| المؤقت | الشرط | المدة | الإجراء |
|--------|-------|-------|---------|
| حذف pending بدون خصم | `status = 'pending'` AND `opponent_id IS NULL` | ساعة | حذف |
| حذف accepted بدون بث | `status = 'accepted'` | ساعة من القبول/الموعد | إلغاء |
| إنهاء live | `status = 'live'` | ساعتان من `started_at` | تحويل لـ completed |
| تحذير قبل الانتهاء | `status = 'live'` | 10 دقائق + 1 دقيقة قبل | إشعار |
| تحرير busy بدون live | `is_busy = 1` ومنافسته ليست live | 10 دقائق | تحرير |
| انقطاع بث أحد الطرفين | heartbeat قديم > 2 دقيقة | 3 دقائق سماح | سؤال الطرف الآخر |

---

## 🛡️ القسم الثالث: المخاطر والحلول الموحدة (15 مخاطر)

### خطر 1: مشاركة متنافس في أكثر من منافسة حية ⚔️
**المصدر:** Gemini + Blackbox (متفق)
**الحل:** حالة `is_busy` + `current_competition_id` + `busy_since`
```
عند بدء البث:
├── التحقق: is_busy = false (أو current_competition_id = نفس المنافسة)
├── تعيين is_busy = true
└── تسجيل busy_since

عند الانتهاء:
├── تعيين is_busy = false
├── مسح current_competition_id
└── مسح busy_since
```

### خطر 2: هجر المنافسات 🏚️
**المصدر:** Gemini + Blackbox (متفق)
**الحل:** Cron كل 5 دقائق + جدول scheduled_tasks
```
Cron يفحص:
1. فورية pending > ساعة → حذف
2. فورية accepted > ساعة من القبول → إلغاء
3. مجدولة تخطت موعدها + ساعة → إلغاء
4. حية > ساعتين → تحويل لمسجلة
```

### خطر 3: انقطاع البث 📡
**المصدر:** Gemini (فكرة) + Blackbox (تفصيل Heartbeat)
**الحل:** Heartbeat كل 30 ثانية من Client → Server
```
Client يرسل POST /api/competitions/heartbeat كل 30 ثانية
Server يسجل في competition_heartbeats

Cron كل دقيقة:
├── إذا heartbeat أقدم من 2 دقيقة → المستخدم انقطع
├── فترة سماح 3 دقائق
│   ├── عاد → يستمر
│   └── لم يعد → سؤال الطرف الآخر: إنهاء أم انتظار 3 دقائق إضافية
```

### خطر 4: قبول أكثر من طلب 🔀
**المصدر:** Gemini + Blackbox (متفق)
**الحل:** `db.batch()` عملية ذرية
```
عند قبول طلب:
1. UPDATE competitions SET opponent_id WHERE opponent_id IS NULL ← شرط ذري
2. UPDATE competition_requests SET status = 'accepted'
3. DELETE الطلبات الأخرى
4. INSERT إشعارات للمرفوضين
```

### خطر 5: طلبات معلقة للأبد 📨
**المصدر:** Gemini + Blackbox (متفق)
**الحل:** TTL 24 ساعة + حذف مع المنافسة
```
الطلب يُحذف عند:
├── حذف المنافسة (CASCADE)
├── قبول طلب آخر
├── إلغاء يدوي من المرسل
├── انتهاء 24 ساعة (expires_at)
└── حظر بين الطرفين
```

### خطر 6: إشعارات معلقة للأبد 🔔
**المصدر:** Gemini + Blackbox (متفق)
**الحل:** Cron شهري يحذف الإشعارات > 30 يوم

### خطر 7: مستخدمين غير نشطين 👻
**المصدر:** Gemini + Blackbox (متفق + إضافة Gemini)
**الحل:** Cron سنوي + **تحذير بالبريد قبل الحذف بأسبوع** (إضافة Gemini)
```
1. أرسل بريد تحذيري قبل الحذف بأسبوع
2. إذا لم يسجل دخول خلال أسبوع → حذف متتالي
3. لا تحذف المشرفين أو من لديه منافسات مسجلة
```

### خطر 8: تضارب زمني ⏰
**المصدر:** Gemini + Blackbox (متفق)
**الحل:** فحص قبل الإنشاء وقبل القبول
```sql
SELECT 1 FROM competitions
WHERE (creator_id = ? OR opponent_id = ?)
AND status IN ('accepted', 'live')
AND scheduled_at IS NOT NULL
AND ABS(strftime('%s', scheduled_at) - strftime('%s', ?)) < 7200
```

### خطر 9: busy timeout 🕐
**المصدر:** Gemini (حصري)
**الحل:** Cron كل 10 دقائق
```
إذا is_busy = 1 ومنافسته ليست 'live':
├── إذا مر 10 دقائق → حرر المستخدم تلقائياً
└── سجل الحدث في log
```

### خطر 10: إنشاء مفرط 📝
**المصدر:** Gemini + Blackbox (متفق)
**الحل:** حد 3 منافسات pending لكل مستخدم

### خطر 11: طلبات مفرطة 📨
**المصدر:** Gemini + Blackbox (متفق)
**الحل:** حد 10 طلبات معلقة لكل مستخدم

### خطر 12: لا تغيير بعد القبول 🔒
**المصدر:** Gemini + Blackbox (متفق)
**الحل:** بعد `status = 'accepted'`:
- لا يمكن تغيير `opponent_id`
- لا يمكن تغيير `creator_id`
- فقط `title`, `description`, `rules` قابلة للتعديل

### خطر 13: الحظر غير الفعال 🚫
**المصدر:** Gemini + Blackbox (مع تصحيح Gemini)
**الحل:**
```
الحظر يمنع:
├── إرسال طلبات انضمام
├── إرسال/استقبال دعوات
├── ظهور في "المتنافسين المتاحين"
└── إرسال رسائل خاصة

الحظر لا يمنع:
├── مشاهدة المنافسات
├── التعليق (ما لم يكن moderator)
└── التقييم
```

### خطر 14: فقدان القطع أثناء الرفع 📹
**المصدر:** Gemini + Blackbox (متفق)
**الحل:** Retry Queue مع exponential backoff
```
1. لا ننتقل للقطعة التالية بدون تأكيد السابقة
2. حد 3 محاولات لكل قطعة
3. بعد الدمج → حذف فوري لكل القطع
4. Origin check + session token على السيرفر
```
**⚠️ ملاحظة:** هذا المنطق يتعامل مع السيرفر الخارجي كـ API. لا نعدل السيرفر الخارجي.

### خطر 15: تزوير التقييمات ⭐
**المصدر:** Blackbox (حصري)
**الحل:** Rate limit + UNIQUE constraint + تقييم بعد المشاهدة فقط

---

## 📡 القسم الرابع: البث – حدود التكامل مع الخارجي

### 4.1 ما هو خارجي (لا نمسه)

```
الأنظمة الخارجية المتكاملة:
├── Signaling Server (routes.ts في src/modules/api/signaling/)
│   └── يتعامل مع WebRTC signaling + TURN credentials
├── TURN Servers (metered.ca)
│   └── يوفر TURN credentials ديناميكية
├── Jitsi Meet API (LiveRoom.ts)
│   └── يدير غرف المؤتمر
├── P2P Connection (P2PConnection.ts)
│   └── يدير WebRTC peers
└── سيرفر البث الخارجي (stream.maelsh.pro)
    └── يستقبل القطع ويدمجها
```

### 4.2 ما نتعامل معه (المنطق الداخلي فقط)

```
المنطق الذي نضيفه/نعدله:
├── متى نبدأ البث (ربط بحالة المنافسة)
├── متى ننهي البث (ربط بالمؤقتات)
├── Heartbeat (نبضة من Client لسيرفرنا، ليس لسيرفر البث)
├── Retry Queue (في Client فقط، عند رفع القطع)
├── حالة is_busy للمتنافسين
└── إشعارات البث (بدء/انقطاع/انتهاء)
```

### 4.3 قاعدة التكامل

```
المنافسة accepted + الطرفان بدءا البث → سيرفرنا يحول المنافسة لـ live
المنافسة live + الطرفان أنهيا البث → سيرفرنا يحول لـ completed
المنافسة live + heartbeat قديم → سيرفرنا يُعلم الطرف الآخر (لا يوقف البث)

⚠️ إيقاف/بدء البث الفعلي يتم من خلال الأنظمة الخارجية.
   سيرفرنا يدير الحالة (state) فقط.
```

---

## 🎯 القسم الخامس: نظام التوصيات الموحد

### 5.1 المعايير (11 معيار – متفق)

| # | المعيار | الوزن | المصدر |
|---|---------|-------|--------|
| 1 | لغة المستخدم | 25% | user.language |
| 2 | بلد المستخدم | 20% | user.country |
| 3 | الأحدث | 15% | ORDER BY created_at DESC |
| 4 | الأعلى مشاهدة | 10% | total_views |
| 5 | الأعلى تقييماً | 10% | rating |
| 6 | متنافسون يتابعهم | 15% | follows |
| 7 | أقسام يشاهدها كثيراً | 10% | watch_history + category_id |
| 8 | مشابهة لما أعجبه | 10% | likes |
| 9 | كلمات مفتاحية | 10% | user_keywords |
| 10 | مشابهة لما شاهده | 10% | watch_history |
| 11 | **استبعاد ما شاهده** | -100% | NOT IN watch_history |

### 5.2 القواعد

```
1. ما شاهده لا يظهر في التوصيات (يظهر فقط في سجل المشاهدة)
2. ترتيب عشوائي داخل كل مجموعة (RANDOM())
3. المنافسات المخفية لا تظهر أبداً
4. التوصيات server-side (ليس client-side فقط)
```

### 5.3 ⚠️ تصحيح خطأ Blackbox في كود التوصيات

```typescript
// ❌ خطأ Blackbox – SQL Injection ممكن:
const keywordConditions = keywords.map(k =>
    `c.title LIKE '%${k}%'`
).join(' OR ');

// ✅ الحل الصحيح – parameterized:
const keywordConditions = keywords.map(() =>
    `c.title LIKE '%' || ? || '%' OR c.description LIKE '%' || ? || '%'`
).join(' OR ');
// ثم bind(...keywords.flatMap(k => [k, k]))
```

---

## 📋 القسم السادس: الملفات وهيكل التنفيذ

### 6.1 الملفات الجديدة المطلوبة

```
schema.sql                                    ← هيكل قاعدة البيانات الكامل
src/lib/db/migrate.ts                         ← MigrationManager
src/lib/errors/AppError.ts                    ← Error classes (8 أنواع)
src/middleware/error-handler.ts               ← Error handler middleware
src/middleware/rate-limit.ts                  ← Rate limiter
src/middleware/validation.ts                  ← Zod validation middleware
src/models/CompetitionRequestModel.ts         ← منطق الطلبات
src/models/CompetitionInvitationModel.ts      ← منطق الدعوات
src/models/WatchHistoryModel.ts               ← سجل المشاهدة
src/models/WatchLaterModel.ts                 ← قائمة المشاهدة اللاحقة
src/models/UserBlockModel.ts                  ← نظام الحظر
src/controllers/ScheduleController.ts         ← Cron jobs handler
src/controllers/RecommendationController.ts   ← نظام التوصيات
src/controllers/BlockController.ts            ← نظام الحظر
src/client/services/NotificationService.ts    ← SSE client listener
```

### 6.2 الملفات الموجودة التي تحتاج تعديل

```
wrangler.jsonc                                ← إضافة triggers.crons
src/main.ts                                   ← إضافة scheduled handler + error middleware
src/config/types.ts                           ← إضافة CompetitionStatus type + أنواع جديدة
seed.sql                                      ← استبدال 'recorded' بـ 'completed'
src/models/CompetitionModel.ts                ← إضافة: hasTimeConflict, getPendingCount, updateStatus, deleteWithRelations
src/models/UserModel.ts                       ← إضافة: setBusy, setFree, checkAvailability
src/models/NotificationModel.ts               ← إضافة: أنواع جديدة + cleanup
src/controllers/CompetitionController.ts      ← تعديل: create, delete, startStreaming, endStreaming + إضافة: invite, acceptInvitation, listAvailableCompetitors
src/models/base/BaseModel.ts                  ← إضافة: validateColumn (SQL Injection fix)
src/models/index.ts                           ← تصدير الـ Models الجديدة
src/controllers/index.ts                      ← تصدير الـ Controllers الجديدة
```

### 6.3 الملفات التي لا نمسها

```
❌ src/modules/api/signaling/                  ← البث الخارجي
❌ src/client/services/P2PConnection.ts        ← WebRTC خارجي
❌ src/client/services/LiveRoom.ts             ← Jitsi خارجي
❌ src/client/services/VideoCompositor.ts      ← منطق الدمج (نعدل ChunkUploader فقط)
❌ كل ملفات الـ CSS والتصميم                   ← لا نمس التصميم
❌ src/modules/pages/test - Copy/              ← لن نحذف الآن (تنظيف لاحق)
❌ src/modules/pages/live/core.ts              ← ملف البث الضخم (خارجي)
```

---

## 🚀 القسم السابع: خطة التنفيذ المرحلية (6 مراحل)

### المرحلة 1: البنية التحتية (P0 – الأسبوع 1-2) 🏗️

| # | المهمة | الملفات | ساعات | الوصف |
|---|--------|---------|:-----:|-------|
| 1.1 | إنشاء `schema.sql` كامل | `schema.sql` (جديد) | 10 | كل الجداول الموجودة + الجديدة + indexes + constraints |
| 1.2 | إنشاء `MigrationManager` | `src/lib/db/migrate.ts` | 4 | إدارة تغييرات DB |
| 1.3 | إنشاء Error Classes | `src/lib/errors/AppError.ts` | 3 | 8 أنواع أخطاء |
| 1.4 | إنشاء Error Handler Middleware | `src/middleware/error-handler.ts` | 2 | معالجة مركزية |
| 1.5 | إنشاء Rate Limiter | `src/middleware/rate-limit.ts` | 4 | حماية من الهجمات |
| 1.6 | إعداد Cron Jobs في wrangler | `wrangler.jsonc` + `main.ts` | 3 | 4 مواقيت cron |
| 1.7 | إصلاح SQL Injection في BaseModel | `BaseModel.ts` | 2 | Whitelist للأعمدة |
| 1.8 | توحيد CompetitionStatus | `types.ts` + `seed.sql` | 2 | `recorded` → `completed` |
| 1.9 | إنشاء Validation Middleware (Zod) | `src/middleware/validation.ts` | 4 | schemas لكل endpoint |

**اختبار المرحلة 1:**
```
□ wrangler d1 execute --local --file=schema.sql → بدون أخطاء
□ npm run dev → يعمل
□ Cron يظهر في dashboard
□ Rate limiter يرفض الطلب 101
□ Error handler يعيد JSON منظم
```

---

### المرحلة 2: منطق المنافسات والطلبات (P0 – الأسبوع 3-4) ⚔️

| # | المهمة | الملفات | ساعات |
|---|--------|---------|:-----:|
| 2.1 | إنشاء `CompetitionRequestModel` | جديد | 6 |
| 2.2 | إنشاء `CompetitionInvitationModel` | جديد | 4 |
| 2.3 | تحديث `CompetitionModel` (hasTimeConflict, getPendingCount, updateStatus, deleteWithRelations) | تعديل | 8 |
| 2.4 | تحديث `CompetitionController` (create مع حد 3, accept مع ذرية, delete مع cascade) | تعديل | 10 |
| 2.5 | إضافة `listAvailableCompetitors` | تعديل Controller | 4 |
| 2.6 | إضافة `invite` + `acceptInvitation` | تعديل Controller | 6 |
| 2.7 | لا تغيير بعد القبول (Immutable after acceptance) | تعديل Controller | 2 |
| 2.8 | إنشاء `UserBlockModel` + `BlockController` | جديد | 4 |

**اختبار المرحلة 2:**
```
□ إنشاء 4 منافسات → الرابعة مرفوضة
□ إرسال 11 طلب → الحادي عشر مرفوض
□ قبول طلب → الطلبات الأخرى تُحذف + إشعارات
□ حظر مستخدم → لا يمكنه إرسال طلبات
□ منافسة مع تضارب زمني → مرفوضة
□ تغيير opponent_id بعد القبول → مرفوض
```

---

### المرحلة 3: المؤقتات والتنظيف (P0 – الأسبوع 5-6) ⏰

| # | المهمة | الملفات | ساعات |
|---|--------|---------|:-----:|
| 3.1 | Cron كل 5 دقائق: حذف/إلغاء المنافسات المنتهية | `ScheduleController.ts` | 6 |
| 3.2 | Cron كل دقيقة: تنفيذ scheduled_tasks | `ScheduleController.ts` | 4 |
| 3.3 | Cron شهري: حذف إشعارات > 30 يوم | `ScheduleController.ts` | 2 |
| 3.4 | Cron سنوي: تنظيف مستخدمين غير نشطين (مع تحذير بريدي) | `ScheduleController.ts` | 4 |
| 3.5 | حد ساعتين للحية + تحذير عند 10 و 1 دقيقة | `ScheduleController.ts` | 4 |
| 3.6 | تحرير busy timeout (10 دقائق) | `ScheduleController.ts` | 3 |
| 3.7 | Heartbeat endpoint + فحص الانقطاع | API + Cron | 4 |
| 3.8 | عداد تنازلي (Client-side JS فقط، لا تعديل تصميم) | Client logic | 4 |

**اختبار المرحلة 3:**
```
□ منافسة فورية pending > ساعة → تُحذف
□ منافسة مجدولة تخطت موعدها + ساعة → تُلغى
□ منافسة حية > ساعتين → تتحول لمسجلة
□ مستخدم busy بدون live > 10 دقائق → يتحرر
□ Heartbeat يسجل بنجاح
□ إشعارات > 30 يوم → تُحذف
```

---

### المرحلة 4: الإشعارات الفورية وحالة البث (P1 – الأسبوع 7-8) 🔔

| # | المهمة | الملفات | ساعات |
|---|--------|---------|:-----:|
| 4.1 | SSE Endpoint | API جديد | 6 |
| 4.2 | Client SSE Listener | `NotificationService.ts` | 4 |
| 4.3 | إشعار "أنت مشغول" مع خيارين | Client logic | 4 |
| 4.4 | ربط startStreaming/endStreaming بحالة المنافسة | `CompetitionController.ts` | 6 |
| 4.5 | عرض حالة "مشغول" في البحث والملف الشخصي | Client logic (بدون تغيير تصميم) | 3 |
| 4.6 | ربط توزيع الأرباح عند completion | `CompetitionController.ts` | 4 |

**اختبار المرحلة 4:**
```
□ إشعار فوري يظهر بدون تحديث الصفحة
□ مستخدم busy يظهر كـ "مشغول"
□ بدء بث → المستخدم يتحول لـ busy
□ إنهاء بث → المستخدم يتحرر
□ إكمال المنافسة → أرباح تُوزع
```

---

### المرحلة 5: نظام التوصيات والسجلات (P2 – الأسبوع 9-10) 🎯

| # | المهمة | الملفات | ساعات |
|---|--------|---------|:-----:|
| 5.1 | `WatchHistoryModel` + تسجيل تلقائي | جديد | 5 |
| 5.2 | `WatchLaterModel` | جديد | 3 |
| 5.3 | استخراج كلمات مفتاحية من العناوين | `user_keywords` logic | 4 |
| 5.4 | `RecommendationController` (11 معيار) | جديد | 10 |
| 5.5 | استبعاد ما شاهده + ترتيب عشوائي | ضمن 5.4 | 3 |
| 5.6 | المنافسات المشابهة في كل صفحة | تعديل | 4 |
| 5.7 | صفحة سجل المشاهدة + بحث + حذف | Client logic | 4 |

---

### المرحلة 6: استقرار البث والاختبار (P2 – الأسبوع 11-12) 📡

| # | المهمة | الملفات | ساعات |
|---|--------|---------|:-----:|
| 6.1 | Retry Queue في ChunkUploader (Client) | `ChunkUploader.ts` | 5 |
| 6.2 | حذف القطع بعد دمج MP4 | Client logic | 2 |
| 6.3 | Origin check على API الرفع | Backend | 2 |
| 6.4 | منطق الانقطاع (3 دقائق سماح) | Client + Backend | 5 |
| 6.5 | اختبارات شاملة (Vitest) | `src/__tests__/` | 12 |
| 6.6 | مراجعة نهائية وتوثيق | مختلف | 4 |

---

## ✅ القسم الثامن: قائمة الاختبار الشاملة

```
السيناريو 1: دورة حياة منافسة فورية كاملة
□ إنشاء → ظهور → طلب انضمام → قبول → بدء بث → حية → إنهاء → مسجلة

السيناريو 2: منافسة مجدولة
□ إنشاء → ظهور → قبول → انتظار الموعد → بدء بث → حية → مسجلة

السيناريو 3: الحذف التلقائي
□ فورية بدون خصم بعد ساعة → محذوفة
□ مجدولة تخطت موعدها بساعة → ملغاة
□ حية تخطت ساعتين → مسجلة

السيناريو 4: التضارب
□ مستخدم مشغول يحاول بث آخر → مرفوض
□ منافستان في نفس الوقت → الثانية مرفوضة
□ قبول طلبين لنفس المنافسة → الثاني مرفوض
□ 4 منافسات pending → الرابعة مرفوضة
□ 11 طلب معلق → الحادي عشر مرفوض

السيناريو 5: الإشعارات
□ إشعار فوري عند قبول طلب (SSE)
□ إشعار "أنت مشغول" مع خيارين
□ إشعارات > 30 يوم → محذوفة
□ إشعار تذكير قبل الموعد المجدول

السيناريو 6: الحظر
□ حظر → لا يمكنه إرسال طلبات
□ حظر → يمكنه المشاهدة والتعليق
□ حظر → لا يظهر في "المتنافسين المتاحين"

السيناريو 7: البث
□ Heartbeat يسجل كل 30 ثانية
□ انقطاع > 3 دقائق → سؤال الطرف الآخر
□ Retry للقطع الفاشلة (3 محاولات)

السيناريو 8: التوصيات
□ منافسة شاهدها لا تظهر في التوصيات
□ تظهر في سجل المشاهدة
□ التوصيات تراعي اللغة والبلد
```

---

## 📊 الملخص النهائي

| المقياس | القيمة |
|---------|--------|
| إجمالي المهام | **51 مهمة** |
| إجمالي الساعات | **~210 ساعة** |
| ملفات جديدة | **~15 ملف** |
| ملفات تعديل | **~12 ملف** |
| جداول جديدة | **10 جداول** |
| حقول جديدة | **~8 حقول** |
| Cron jobs | **4 (كل دقيقة، كل 5 دقائق، شهري، سنوي)** |
| مراحل التسليم | **6 مراحل × أسبوعين** |

---

## 🤝 الاعتمادات

| المصدر | المساهمة |
|--------|----------|
| **المستخدم** | الحلول الأصلية التسعة + المحاذير + التوجيه |
| **Gemini (Antigravity)** | التحليل الشامل + 6 مخاطر إضافية + خطة 6 مراحل + تفاصيل التوصيات |
| **Blackbox** | Schema تفصيلي + Heartbeat System + Scheduled Tasks + كود تنفيذي مفصل + CompetitionRequestModel |
| **هذا الملف** | الجمع والترتيب والتصحيح والتوحيد |

---

*\"الفكرة ممتازة. المنطق متكامل. الخطة واضحة. الخطوة التالية: التنفيذ المرحلي بدءاً من المرحلة 1 (البنية التحتية).\"*
