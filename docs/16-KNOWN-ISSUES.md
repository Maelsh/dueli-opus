# 16 — مشكلات معروفة وتصحيحات (Known Issues / Corrections)

> **الدور:** المكان الوحيد لتوثيق المعلومات التاريخية المصححة التي يجب أن يعرفها
> أي Agent لاحق حتى لا يكرر أخطاء سابقة أو يعتمد وثيقة قديمة.
> خريطة مصادر الحقيقة: `docs/00-OVERVIEW.md`.

## 1. تكرار ترقيم الترحيلات التاريخي (0012 مكرر)

يوجد ملفّان باسم `0012` في `migrations/`:

| الملف | المحتوى |
|---|---|
| `0012_reports_ad_target.sql` | إعادة بناء `reports` للسماح بـ `target_type='ad'` |
| `0012_rate_limits.sql` | جدول `rate_limits` (حدّ المعدل الموزع، SEC-12) |

كلا الملفين مطبَّق ومقصود إبقاؤهما. **لا تُعِد الترقيم ولا تحذف ولا تدمج** —
إعادة التسمية تكسر سجل الترحيلات المطبقة في D1. أي ترحيل جديد يأخذ الرقم التالي
(0019 فصاعداً). `docs/02-DATABASE.md` يوثق الاثنين في صف واحد لهذا السبب.

## 2. افتراضات معمارية ثبت خطؤها وصُححت

| الافتراض الخاطئ | التصحيح | المرجع |
|---|---|---|
| جدول المتابعة اسمه `user_follows` | الاسم الفعلي `follows` (أُصلح في T1.1) | `AGENTS.md` |
| الدخول يفحص `email_verified` | العمود الفعلي المستخدم `is_verified`؛ `email_verified` عمود ميت من 0001 | `docs/02-DATABASE.md` |
| `docs/COMPLETE_PROJECT_PLANS.md` مرجع ملزم وحالات "مكتملة" صحيحة | أرشيف تاريخي؛ الحالات غير موثوقة؛ الحاكم `docs/11` + `docs/15` | `docs/10-ARCHITECTURE-ASSESSMENT.md` |
| `docs/10` أرقامه (صفر اختبارات، 265 SQL خارج النماذج…) تصف الحاضر | لقطة مؤرخة؛ F-1 → F-7 غيّرت الواقع (اختبارات في `tests/`، استخراج SQL) | ترويسة `docs/10` |
| cron يعمل بـ `?key=CRON_SECRET` (SEC-04 مفتوحة) | الكود يستخدم `POST` + `Authorization: Bearer` فقط (نُفّذ فعلاً) | `src/modules/api/cron/routes.ts` |
| `?token=` في query آلية مصادقة مقبولة | مرفوض هندسياً (SEC-11) — دين مؤقت مُعلن، لا تعتمد عليه في كود جديد | `AGENTS.md` |
| كل نموذج يجب أن يرث `BaseModel` بلا استثناء | `FollowModel` استثناء موثّق: نُقل كما هو (F-5B) دون وراثة عمداً | `docs/01-ARCHITECTURE-RULES.md` |
| منطق دورة المنافسة موزع بين `CronHandler` والمهام | `ScheduledTaskService` هو SSOT الوحيد (F-6)؛ `CronHandler` يفوّض | `docs/05-COMPETITION-LIFECYCLE.md` |
| `docs/04-STREAMING-PIPELINE.md` مفقود (كما تدّعي `docs/15` المرحلة 4) | الملف **موجود** وموثّق؛ بند الخارطة يُقرأ "حدّثه ليطابق الكود" لا "اكتبه من الصفر" | `docs/04-STREAMING-PIPELINE.md` |

## 3. فجوات توثيق معلنة (ليست أخطاء كود)

- دُمجت F-1 → F-7 دون سطور `PLAN-STATUS.md` لبعضها (F-1/F-2/F-3/F-7 بلا إدخال
  مخصص) — الدليل سجل الدمج في `git log`، لا تُعِد فتحها ولا تُلفّق لها حالات.
- ~~عدّاد `schema-contract` التكاملي قد يتخلف عن عدد ملفات `migrations/` بعد إضافة
  ترحيل جديد — تحديث القائمة مهمة منفصلة، لا تُوسّع نطاق مهمتك لإصلاحه صامتاً.~~
  **مُصحَّح 2026-09-19 (Beta Core Gate):** عُدّاد `schema-contract` حُدِّث إلى
  **19 ملف migration** (0015→0018) ويطابق `migrations/` فعلياً. **مُحدَّث 2026-09-22
  (debt-closure sweep):** العُدّاد الآن **29 ملف migration** (0015→0028: المال
  0019→0024 والإعلانات 0025→0028) ويطابق `migrations/` فعلياً. أي فشل جديد في
  العدّاد بعد ترحيل مستقبلي = drift متوقع يُصلَح بتحديث القائمة فقط (لا حذف
  ولا إعادة ترقيم migrations).
- **Route inventory drift (موثق، ليس ثغرة — 2026-09-19):** الجرد المولَّد قد
  يتخلف عن `src/modules/api/*/routes.ts` بعد إضافة مسارات (مثال: ‏B11 أضاف
  `DELETE /api/competitions/:id/rate` و`GET /api/competitions/:id/ratings/summary`
  فارتفع الإجمالي 174 → 176). الحل دائماً `node dev-tools/route-inventory.mjs`
  (يُحدِّث `docs/14-ROUTE-INVENTORY.md` + `dev-tools/route-inventory.json` معاً) —
  لا تغيير routes/صلاحيات لمطابقة الأرقام. `docs/14` مولَّدة آلياً وهي الحاكمة
  لعدد المسارات؛ لا تنسخ العدد في وثيقة ثانية.

## 5. Beta Core Gate — حقائق مثبتة (2026-09-19، لا تُعَد فتحها)

- **Block Enforcement:** منطق الحظر (`UserBlockModel.isBlockedBetween` عبر
  Comment/Rating/Message/Follow models) سليم. فشل الـ integration harness كان
  tooling فقط: إصدار Wrangler المحلي لا يعيد `meta.last_row_id` في writes،
  فأُضيف fallback داخل الاختبار (`SELECT MAX(id)` بعد الـ INSERT) —
  بلا أي تغيير في production code.
- **B16 Beta Core E2E:** ناجحة وموثقة في `PLAN-STATUS.md` (سطر B16: ‏2/2 ‏ar+en
  ثلاث مرات متتالية + إثبات الحساسية الأحمر). لا تُعِد تشغيلها إلا إذا مسّ
  تغييرك مسار Beta فعلياً.
- **Auth rate-limit (إصلاح منتج حقيقي):** ‏`checkAuth()` كان يمسح الجلسة عند
  أي `user` مفقود — بما فيه `429` — فتسبب rate limit ‏(`10/15min/IP` على
  `/api/auth/*`) في forced logout. الإصلاح: `429` يُبقي الجلسة (return false
  بلا clearAuth)، وأخطاء الشبكة لا تمسح أيضاً؛ الفشل الحقيقي (`user:null`)
  ما زال يمسح. الاختبار: `tests/api/auth-ratelimit-session.test.ts`.
- **getCategoryName fallback:** الحقول الصريحة (`category_name_<lang>` /
  `name_<lang>`) تسبق الآن slug-key lookup، والـ slug يُحل عبر المفتاح
  المسمّى `categories.<slug>` أولاً (الـ bare slug legacy فقط للتوافق).
  هذا يمنع عودة `Physics` في سياق عربي رغم وجود `name_ar`. الاختبار المباشر
  في `tests/api/auth-ratelimit-session.test.ts` (قسم getCategoryName).

## 4. ما ليس مصدر حقيقة (رغم مظهره)

> الجرد الكامل ل dot-folders والسياسة الملزمة: `docs/17-DOT-FOLDERS-POLICY.md` (F-9).

- `docs/archive/` — تاريخي غير موثوق (انظر `docs/archive/README.md`).
- `.blackbox/` و`.gemini/` و`.claude/` و`.plan/` — مخلفات وكلاء/خطط سابقة
  (ملفات `*_PLAN.md` و`TODO*` و`SRS*`)؛ لها قيمة تاريخية فقط، **ليست** خطط عمل.
- `.github/pr-body-*.md` — مسودات نصوص PR مدموجة؛ لا تعليمات سارية.
- `specs/001-competition-lifecycle/` و`.specify/` — مواصفات مهمة واحدة مكتملة؛
  لا تُعمّمها على المشروع.
