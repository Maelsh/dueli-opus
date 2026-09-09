# 16 — خطة الموجّهات التنفيذية (وكيل محلي + وكيل خارجي)

> **الغرض:** تفصيل «الخطة الموحدة الكاملة — Dueli Core Beta» إلى **موجّهات جاهزة للإسناد**.
> لكل بند (من المرحلة 0 حتى ما بعد Beta بما فيها المال والإعلانات) موجّهان:
> - **🟦 LOCAL** — الوكيل المحلي على جهاز المشروع: ينفّذ، يختبر محلياً، يلتزم، يرفع، يفتح PR.
> - **🟧 REMOTE** — الوكيل الخارجي (جهاز آخر، يستنسخ من GitHub): يتحقّق مستقلاً من الـPR، لا يكتب كود إنتاج، يعطي `APPROVE` أو `REJECT` بأسباب.
>
> **قاعدة الفصل:** REMOTE لا يدفع إلى فرع الميزة أبداً. إن لزم إصلاح، يكتبه كتعليق/patch في مراجعة الـPR ويعيده لـLOCAL.
>
> الحالة المرجعية عند كتابة الوثيقة: `main = 6753f84` (Merge PR #5 — B1 الرسائل).

---

## 0. مقدمة ثابتة (تُلصق حرفياً في رأس كل موجّه)

### 0.1 المقدمة الثابتة لـ🟦 LOCAL

```
أنت وكيل تنفيذ محلي على مستودع Dueli (Cloudflare Pages/Workers + Hono + D1 + TypeScript).
اقرأ قبل أي سطر: AGENTS.md، docs/11-DEFINITION-OF-DONE.md، docs/15-ROADMAP.md، docs/01-ARCHITECTURE-RULES.md.

قواعد غير قابلة للتفاوض:
1. Core-First: المال والإعلانات والبث الحي مجمّدة. لا تلمسها إلا إذا كان البند من مراحل ما بعد Beta صراحةً.
2. PR واحد = نتيجة مستخدم واحدة. عنوان الالتزام: fix(core): … أو feat(core): … (لا "fix core").
3. لا "تحسين بنية" داخل PR نواة: ممنوع تغيير CI/framework/dependencies/Tailwind/refactor عام.
4. MVC: المنطق في models/ أو lib/services/، المسارات في src/modules/api/*/routes.ts تربط HTTP فقط.
   لا SQL في pages/templates/client. وراثة BaseModel/BaseController. لا حقول #private (استخدم private).
5. i18n إلزامي: أي نص يراه المستخدم يمرّ عبر src/i18n/ar.ts و en.ts معاً. لا نص إنجليزي مكتوب في الكود.
   الاستثناء: SQL، أسماء أعمدة/routes/enums، logs، fixtures، تعليقات، رسائل الالتزام.
6. أي تغيير مخطط = ملف migration جديد برقم غير مستخدم. راجع `ls migrations` أولاً — يوجد سابقة تكرار
   رقم (0012_rate_limits و 0012_reports_ad_target) لا تُكرَّر.
7. اكتب الاختبار الأحمر أولاً: يفشل قبل التغيير وينجح بعده. أرفق مخرج الفشل في وصف الـPR.
8. لا ترمز "✅" لأي بند لم يجتز G1–G8. المُتحقَّق يدوياً = 🧪. سجّل في WORKLOG.md فور الانتهاء
   بالصيغة: [YYYY-MM-DD] [المعرّف] — الوصف / الملفات / نفذ: <اسمك> / اختبار: <النتائج>.
9. حدّث PLAN-STATUS.md للبند المعني.

مسار الرفع الإلزامي في نهاية كل بند:
  git checkout -b <اسم الفرع المحدد في البند>
  git add -A && git commit -m "<رسالة الالتزام المحددة>"
  git fetch origin main && git rebase origin/main     # عند التعارض: قدّم كود origin/main إلا إذا كان تغييرك جوهر البند
  git reset --soft $(git merge-base HEAD origin/main) && git commit -m "<نفس الرسالة الشاملة>"   # squash إلى التزام واحد
  git push -u origin <الفرع> --force-with-lease
  gh pr create --base main --head <الفرع> --title "<العنوان>" --body-file <ملف وصف>
ثم أعطِ رابط الـPR للقائد، وتوقّف. لا تدمج بنفسك — الدمج بعد APPROVE من الوكيل الخارجي.

وصف الـPR يجب أن يحوي: (أ) النتيجة للمستخدم بجملة واحدة، (ب) الملفات المعدّلة وسبب كل ملف،
(ج) الاختبار الأحمر: اسمه + مخرج فشله قبل الإصلاح، (د) مخرجات الأوامر الأربعة إلى الستة،
(هـ) مفاتيح i18n المضافة (ar+en)، (و) ما لم يُلمس عمداً، (ز) خطة التراجع (G8).
```

### 0.2 المقدمة الثابتة لـ🟧 REMOTE

```
أنت وكيل تحقّق مستقل، على جهاز منفصل عن جهاز التطوير. لا تملك حالة محلية سابقة.
مهمتك: إثبات أو نفي أن الـPR المحدد يحقق نتيجته المعلنة، دون أن تثق بادعاءات وصف الـPR.

التهيئة (مرة واحدة لكل PR):
  git clone https://github.com/Maelsh/dueli-opus.git dueli-verify && cd dueli-verify
  gh pr checkout <رقم الـPR>
  npm ci
  # قاعدة نظيفة عند الحاجة للتكامل:
  npm run db:reset

قواعد التحقّق:
1. شغّل أوامر البند فقط (4–6 أوامر). ممنوع التدقيق الواسع (مراجعة مالية، جرد مسارات كامل، فحص SEC شامل)
   إلا في بنود "بوابة المرحلة" المعلّمة بـ[GATE].
2. أثبت أن الاختبار الجديد **أحمر بدون الإصلاح**: احذف/اعكس سطر الإصلاح مؤقتاً (git stash أو تعديل محلي
   غير مرفوع) وشغّل الاختبار، ثم أعِد الحالة. إن نجح الاختبار بدون الإصلاح → REJECT (اختبار زائف).
3. تحقّق من i18n آلياً: كل مفتاح جديد موجود في ar.ts و en.ts معاً، ولا نص user-visible خارج t().
4. تحقّق من المعمار: لا SQL في src/modules/pages أو src/client، لا #private جديد، لا تغيير CI/deps.
5. تحقّق من النطاق: diff لا يلمس ملفات خارج قائمة البند (خاصة الملفات المالية/الإعلانية المجمّدة).
6. لا تكتب كود إنتاج ولا تدفع إلى الفرع. مخرجك: تقرير مراجعة على الـPR عبر
   gh pr review <رقم> --approve|--request-changes --body "<التقرير>".

صيغة التقرير:
  ## نتيجة التحقّق: APPROVE | REJECT
  | الفحص | الأمر | النتيجة |
  ثم: (أ) إثبات الاختبار الأحمر، (ب) أي انحراف معماري/i18n/نطاق، (ج) قائمة الإصلاحات المطلوبة إن وُجدت.
```

### 0.3 أوامر التحقّق القياسية (يُختار منها 4–6 لكل بند)

| الرمز | الأمر | متى |
|---|---|---|
| V1 | `npm run build` | دائماً |
| V2 | `npx tsc --noEmit` | دائماً |
| V3 | `npm test` | دائماً |
| V4 | `npx vitest run <ملف الاختبار الجديد>` | دائماً |
| V5 | `npm run test:integration` | عند لمس المخطط/D1 |
| V6 | `npm run db:reset` | عند migration جديدة |
| V7 | `grep -rho ': any\|as any' src --include=*.ts \| wc -l` (لا يرتفع عن 308) | عند إضافة أنواع |
| V8 | `node dev-tools/route-inventory.mjs` + مطابقة `docs/14-ROUTE-INVENTORY.md` | عند مسار جديد |
| V9 | `npx playwright test <spec>` | المرحلة 6 وما بعدها |
| V10 | فحص i18n: `node -e "..."` مقارنة مفاتيح ar/en (سكربت البند A0-2) | عند مفاتيح جديدة |

---

## المرحلة 0 — تثبيت B4 (نصف يوم)

### 0.A — رفع إصلاح المهام المجدولة (B4)

**المعرّف:** `B4` · **الفرع:** `fix/core-scheduled-tasks-b4` · **PR واحد**

#### 🟦 LOCAL — موجّه التنفيذ

```
[المقدمة الثابتة 0.1]

المهمة: رفع إصلاح B4 المنجز محلياً بلا توسيع.

الحالة الحالية في شجرة العمل (تحقّق منها بـ git status، لا تفترض):
  M WORKLOG.md
  M src/lib/services/ScheduledTaskService.ts   (إصلاح مقارنة الوقت في processPendingTasks)
  ?? tests/api/scheduled-tasks-due.test.ts

النتيجة للمستخدم: المهام المجدولة المستحقة (بدء/إنهاء منافسة مجدولة) تُلتقط فعلياً عند حلول وقتها
بدل بقائها معلّقة بسبب مقارنة نصية بين صيغ تاريخ مختلفة.

موجّهات العمل:
- الملف الوحيد المسموح بتعديله في المنطق: src/lib/services/ScheduledTaskService.ts
  السطر ~115: `WHERE t.execute_at <= datetime('now')` → `WHERE datetime(t.execute_at) <= datetime('now')`
  وكذلك أي مقارنة/ترتيب زمني آخر على execute_at في نفس الدالة (السطر ~117 ORDER BY يبقى كما هو
  إلا إذا أثبت الاختبار خللاً في الترتيب).
- ممنوع: تعديل جدول scheduled_tasks، إضافة migration، لمس CronHandler أو مسار /api/cron،
  إصلاح SEC-04 (سرّ الكرون في query string) — دين موثّق، ليس من هذا البند.
- i18n: لا نص جديد يراه المستخدم في هذا البند. إن اضطررت لرسالة خطأ، أضفها في ar.ts و en.ts معاً.

موجّهات الاختبار:
- tests/api/scheduled-tasks-due.test.ts (موجود): يجب أن يثبت أن مهمة execute_at بصيغة غير معيارية
  (مثال: '2026-01-01T10:00:00.000Z' أو '2026-01-01 10:00:00') وموعدها في الماضي **تُلتقط**،
  وأن مهمة موعدها في المستقبل **لا تُلتقط**.
- أثبت الحمرة: أعِد السطر إلى صيغته القديمة، شغّل الاختبار، احفظ مخرج الفشل في وصف الـPR، ثم أعِد الإصلاح.

أوامر التحقّق: V4, V3, V2, V1
بوابة الخروج: الاختبار الجديد 1/1 ✅ · npm test أخضر بالكامل (كان 71/71) · tsc 0 أخطاء · build ناجح.

الفرع: fix/core-scheduled-tasks-b4
رسالة الالتزام: fix(core): pick up due scheduled tasks regardless of stored datetime format
```

#### 🟧 REMOTE — موجّه التحقّق

```
[المقدمة الثابتة 0.2]

الـPR: fix/core-scheduled-tasks-b4 — "المهام المجدولة المستحقة تُلتقط فعلياً".

أوامر التحقّق:
1. npx vitest run tests/api/scheduled-tasks-due.test.ts        → متوقع 1/1 (أو كل حالاته) أخضر
2. إثبات الحمرة: عدّل محلياً datetime(t.execute_at) → t.execute_at في
   src/lib/services/ScheduledTaskService.ts، أعد تشغيل الأمر 1 → **يجب أن يفشل**، ثم git checkout -- .
3. npm test                                                     → أخضر بالكامل، وعدد الاختبارات ≥ السابق
4. npx tsc --noEmit                                             → 0
5. npm run build                                                → ناجح
6. git diff origin/main --stat                                  → يجب ألا يتجاوز 3 ملفات:
   WORKLOG.md، src/lib/services/ScheduledTaskService.ts، tests/api/scheduled-tasks-due.test.ts

REJECT إذا: الأمر 2 نجح بدون الإصلاح · أو diff لمس migrations/CI/ملفات مالية · أو WORKLOG لم يُحدَّث.
```

**[GATE] بوابة المرحلة 0:** `main` يحتوي B4 · `npm test` أخضر · لا ملفات معلّقة في شجرة العمل المحلية.

---

## المرحلة 1 — دورة المنافسات (B5) · 2–3 أيام · 3 PRs

### 1.A — حراسة انتقالات الحالة (start/end/complete)

**المعرّف:** `B5-1` · **الفرع:** `fix/core-competition-state-guards` · **PR واحد**

#### 🟦 LOCAL — موجّه التنفيذ

```
[المقدمة الثابتة 0.1]

النتيجة للمستخدم: لا يمكن بدء منافسة إلا وهي مقبولة ولها خصم، ولا إنهاؤها إلا وهي حيّة،
ولا تُنهى مرتين — فلا تظهر منافسة "منتهية" لم تبدأ أصلاً.

الحقائق المؤكَّدة في الكود (تحقّق قبل التعديل):
- src/controllers/CompetitionController.ts:495 `start()` — يفحص الملكية ووجود opponent_id فقط، **لا يفحص status**.
- src/controllers/CompetitionController.ts:546 `end()` — فيه حارس idempotency للحالة 'completed' فقط،
  لكنه يقبل الإنهاء من حالة 'pending' أو 'accepted'.
- src/models/CompetitionModel.ts:282 `startLive()` و:305 `complete()` — تحديثات بلا شرط status في WHERE.

موجّهات العمل:
1. src/models/CompetitionModel.ts
   - startLive(): أضف `AND status = 'accepted'` إلى WHERE، وأعِد boolean من meta.changes > 0.
   - complete(): أضف `AND status = 'live'` إلى WHERE، وأعِد boolean من meta.changes > 0.
   - (الحراسة في طبقة النموذج هي المصدر الوحيد للحقيقة — الحارس في المتحكم للرسالة فقط، لا للسلامة.)
2. src/controllers/CompetitionController.ts
   - start(): بعد فحص الملكية — إن كان status !== 'accepted' → 409 برسالة i18n
     competition_errors.not_eligible_to_start. أبقِ فحص opponent_id لكن عبر i18n (انظر البند 1.B).
     إن أعادت startLive() false → 409 بنفس المفتاح (سباق).
   - end(): إن كان status === 'completed' → أبقِ السلوك الحالي (نجاح + already_completed: true).
     إن كان status !== 'live' → 409 برسالة competition_errors.not_live.
     إن أعادت complete() false → عالج كـ already_completed (سباق) بلا مضاعفة finalize_payouts.
3. لا تلمس: LivePayoutEngine، ScheduledTaskService.updateAggregatesAfterVote، أي منطق مالي.
   جدولة finalize_payouts تبقى كما هي لكن لا تُنفَّذ إلا في المسار الذي أنهى المنافسة فعلياً.
4. رمز HTTP: استخدم 409 للتعارض الحالي (وليس 400). إن لم يكن في BaseController مساعد conflict()
   فأضفه بجوار forbidden()/notFound() — إضافة صغيرة مسموحة لأنها في صلب البند.

مفاتيح i18n المطلوبة (ar.ts + en.ts، داخل competition_errors):
  not_eligible_to_start : 'لا يمكن بدء المنافسة في حالتها الحالية' / 'Competition cannot be started in its current state'
  not_live              : 'المنافسة ليست جارية' / 'Competition is not live'
  already_completed     : 'المنافسة منتهية بالفعل' / 'Competition is already completed'

موجّهات الاختبار — ملف جديد: tests/api/competition-transitions.test.ts (أحمر أولاً)
  1. pending → POST /end          ⇒ 409 + الحالة تبقى pending
  2. accepted بلا opponent → /start ⇒ 400/409 + رسالة مترجمة (لا نص إنجليزي حرفي)
  3. accepted مع opponent → /start ⇒ 200 والحالة live
  4. live → /start                ⇒ 409 (لا إعادة بدء)
  5. live → /end                  ⇒ 200 والحالة completed
  6. نفس المنافسة → /end مرة ثانية ⇒ 200 + already_completed: true، وعدد صفوف completed تحديث واحد
     (تحقّق أن finalize_payouts لم يُجدوَل مرتين)

أوامر التحقّق: V4, V3, V2, V1
بوابة الخروج: الحالات الست خضراء · npm test بلا انحدار · كل رسالة جديدة عبر t() · لا SQL خارج النموذج.

الفرع: fix/core-competition-state-guards
رسالة الالتزام: fix(core): enforce competition state transitions for start/end
```

#### 🟧 REMOTE — موجّه التحقّق

```
[المقدمة الثابتة 0.2]

الـPR: fix/core-competition-state-guards.

أوامر التحقّق:
1. npx vitest run tests/api/competition-transitions.test.ts     → كل الحالات خضراء
2. إثبات الحمرة: احذف محلياً شرطي `AND status = 'accepted'` و`AND status = 'live'` من
   src/models/CompetitionModel.ts، أعد تشغيل الأمر 1 → **يجب أن يفشل** (حالتا pending→end و live→start)،
   ثم git checkout -- .
3. npm test && npx tsc --noEmit
4. npm run build
5. فحص i18n: تأكد أن not_eligible_to_start / not_live / already_completed موجودة في
   src/i18n/ar.ts و src/i18n/en.ts معاً، وأن قيمة ar عربية فعلاً (ليست منسوخة من en).
   grep -n "not_eligible_to_start\|not_live\|already_completed" src/i18n/ar.ts src/i18n/en.ts
6. فحص النطاق: git diff origin/main --name-only → مسموح فقط: CompetitionModel.ts، CompetitionController.ts،
   (اختيارياً controllers/base/*)، i18n/ar.ts، i18n/en.ts، الاختبار الجديد، WORKLOG.md، PLAN-STATUS.md.

REJECT إذا: الأمر 2 نجح بدون الحراسة · أو الحراسة في المتحكم فقط دون النموذج (قابلة للالتفاف عبر أي مستدعٍ آخر)
· أو ظهر نص إنجليزي حرفي في استجابة API · أو diff لمس LivePayoutEngine/الملفات المالية.
```

---

### 1.B — تعريب رسائل أخطاء المنافسة المتبقّية

**المعرّف:** `B5-2` · **الفرع:** `fix/core-competition-errors-i18n` · **PR واحد**

#### 🟦 LOCAL

```
[المقدمة الثابتة 0.1]

النتيجة للمستخدم: المستخدم العربي لا يرى رسائل خطأ إنجليزية خام في صفحة المنافسة.

موجّهات العمل:
1. ابحث عن كل نص إنجليزي حرفي داخل استجابات المتحكمات:
   grep -rn "this.error(c, '\|this.validationError(c, '\|message: '" src/controllers src/modules/api | grep -v "this.t("
   ابدأ بـ CompetitionController.ts: 'Cannot start without opponent' و 'vod_url is required' (والمثيلات المشابهة).
2. انقلها إلى مجموعة competition_errors في src/i18n/ar.ts و en.ts:
   no_opponent    : 'لا يمكن البدء بدون خصم' / 'Cannot start without an opponent'
   vod_url_required : 'رابط التسجيل مطلوب' / 'Recording URL (vod_url) is required'
   (أضف أي مفتاح آخر يكشفه الـgrep بنفس النمط، اسم المفتاح بالإنجليزية والقيمتان مترجمتان.)
3. استبدل النص الحرفي بـ this.t('competition_errors.<key>', c).
4. النطاق: CompetitionController.ts فقط + ملفا i18n. لا تعرّب متحكمات المال/الإعلانات (مجمّدة).
5. لا تغيّر رموز HTTP ولا شكل الاستجابة — تعريب بحت.

موجّهات الاختبار — أضف إلى tests/api/competition-transitions.test.ts أو ملف
tests/api/competition-errors-i18n.test.ts:
  1. طلب /start بلا خصم مع Accept-Language: ar ⇒ الرسالة = القيمة العربية من ar.ts
  2. نفس الطلب مع en ⇒ القيمة الإنجليزية
  3. طلب /end بلا vod_url (حيث تلزم) ⇒ الرسالة المترجمة في اللغتين
  4. حارس انحدار: grep داخل الاختبار (أو سكربت) يثبت خلوّ CompetitionController.ts من
     'Cannot start without opponent' و 'vod_url is required' كنصوص حرفية.

أوامر التحقّق: V4, V3, V2, V1
بوابة الخروج: لا نص حرفي متبقٍ في CompetitionController · المفاتيح في ar و en · npm test أخضر.

الفرع: fix/core-competition-errors-i18n
رسالة الالتزام: fix(core): translate remaining competition error messages via i18n
```

#### 🟧 REMOTE

```
[المقدمة الثابتة 0.2]

1. npx vitest run tests/api/competition-errors-i18n.test.ts (أو ملف البند)   → أخضر
2. grep -rn "Cannot start without opponent\|vod_url is required" src/        → **صفر نتائج** خارج i18n/en.ts
3. سكربت تكافؤ المفاتيح: تأكد أن كل مفتاح تحت competition_errors في en.ts له نظير في ar.ts والعكس.
4. تحقّق يدوي أن القيم العربية عربية فعلاً (لا نسخ من الإنجليزية) لكل مفتاح جديد.
5. npm test && npx tsc --noEmit && npm run build
6. git diff origin/main --name-only → CompetitionController.ts, i18n/ar.ts, i18n/en.ts, الاختبار, WORKLOG, PLAN-STATUS فقط.

REJECT إذا: بقي نص حرفي · أو المفتاح في en فقط · أو تغيّر رمز HTTP لأي مسار.
```

---

### 1.C — استخراج RatingModel من المتحكم

**المعرّف:** `B5-3` · **الفرع:** `refactor/core-extract-rating-model` · **PR واحد**

#### 🟦 LOCAL

```
[المقدمة الثابتة 0.1]

النتيجة للمستخدم: لا تغيّر سلوكياً — تنظيف انتهازي مسموح صراحةً بسياسة docs/15-ROADMAP.md
لأن المرحلة 4 ستبني على منطق التقييم. الهدف: لا SQL داخل المتحكم.

الحقيقة المؤكَّدة: يوجد `class RatingModel` مضمّن داخل src/controllers/CompetitionController.ts
(يبدأ نحو السطر 108) يحوي create/hasRated/findByCompetition وغيرها. وهناك أيضاً كلاسات مضمّنة أخرى
في نفس الملف — **انقل RatingModel فقط**، لا تنقل غيره في هذا الـPR.

موجّهات العمل:
1. أنشئ src/models/RatingModel.ts: كلاس يرث BaseModel (كبقية النماذج)، بنفس التواقيع بالضبط،
   private وليس #private، كل الاستعلامات prepared + bind.
2. صدّره من src/models/index.ts.
3. احذف الكلاس المضمّن من CompetitionController.ts واستورده من '../models'.
4. **ممنوع تغيير أي استعلام SQL أو توقيع دالة في هذا الـPR** — نقل حرفي فقط. أي تحسين منطقي مؤجَّل
   للمرحلة 4 (البند 4.A).
5. i18n: لا تغيير.

موجّهات الاختبار — ملف جديد: tests/models/RatingModel.test.ts
  1. create() يُدخل صفاً ويعيد id
  2. hasRated() = false قبل و true بعد
  3. findByCompetition() يعيد الصفوف مع بيانات المستخدم
  4. حارس معماري: اختبار (أو grep في الاختبار) يثبت خلوّ CompetitionController.ts من
     `class RatingModel` ومن `INSERT INTO ratings`.

أوامر التحقّق: V4, V3, V2, V1
بوابة الخروج: لا انحدار في npm test (سلوك التقييم مطابق) · لا SQL لجدول ratings في المتحكم.

الفرع: refactor/core-extract-rating-model
رسالة الالتزام: refactor(core): extract RatingModel from CompetitionController into models layer
```

#### 🟧 REMOTE

```
[المقدمة الثابتة 0.2]

1. npx vitest run tests/models/RatingModel.test.ts               → أخضر
2. npm test                                                       → **نفس عدد الاختبارات السابق + الجديدة، بلا فشل**
3. grep -n "class RatingModel\|INSERT INTO ratings" src/controllers/CompetitionController.ts → صفر
4. مراجعة diff بالعين: قارن جسم كل دالة في src/models/RatingModel.ts بنسختها المحذوفة من المتحكم
   (git show origin/main:src/controllers/CompetitionController.ts | sed -n '100,170p') →
   **يجب أن يكون SQL متطابقاً حرفياً**. أي تعديل منطقي = REJECT (خارج نطاق نقل).
5. grep -n "#" src/models/RatingModel.ts | grep "private\|#[a-z]"  → لا حقول #private
6. npx tsc --noEmit && npm run build

REJECT إذا: تغيّر أي SQL · أو الكلاس لا يرث BaseModel · أو لم يُصدَّر من models/index.ts.
```

**[GATE] بوابة المرحلة 1:** pending→end مرفوض · live→end→end = إنهاء واحد · صفر نص حرفي في مسارات المنافسة · `RatingModel` في طبقة النماذج · `npm test` أخضر.

---

## المرحلة 2 — الدعوات والقبول · 1–2 يوم · 2 PRs

### 2.A — إغلاق حلقة الدعوة/القبول وتثبيت `setOpponent` ضد السباق

**المعرّف:** `B5-4` · **الفرع:** `fix/core-invite-accept-loop` · **PR واحد**

#### 🟦 LOCAL

```
[المقدمة الثابتة 0.1]

النتيجة للمستخدم: A ينشئ منافسة → يدعو B → B يقبل → يصبح B الخصم نهائياً، ولا يستطيع C
اختطاف المقعد، ولا تبقى طلبات معلّقة متضاربة.

الحقائق المؤكَّدة:
- src/models/CompetitionModel.ts:272 `setOpponent()` — فيه بالفعل `AND opponent_id IS NULL` (حماية سباق).
  المطلوب: **تثبيتها باختبار**، لا إعادة كتابتها.
- src/models/CompetitionInvitationModel.ts:86 — يفحص الحظر عند الدعوة (موجود، يُثبَّت باختبار).
- src/models/CompetitionRequestModel.ts — طلبات الانضمام.

موجّهات العمل:
1. setOpponent(): تأكّد أنها تعيد boolean من meta.changes > 0 (وليس true دائماً). عدّل المستدعين
   ليعالجوا false كـ 409 competition_errors.opponent_already_set.
2. عند نجاح القبول (invite أو request): داخل **db.batch() واحد** — ضبط opponent_id + status='accepted'
   + رفض/إلغاء بقية الطلبات والدعوات المعلّقة لنفس المنافسة (status='rejected' أو 'cancelled').
   لا تترك طلبين مقبولين.
3. إشعارات الدعوة/القبول موجودة — تحقّق منها ولا تعِد كتابتها؛ فقط أضف الإشعار الناقص إن كشفه الاختبار.
4. المسارات: src/modules/api/competitions/routes.ts — لا منطق فيها، ربط HTTP فقط.
5. لا تلمس: matchmaking، LivePayoutEngine، ads.

مفاتيح i18n (ar+en، competition_errors):
  opponent_already_set : 'تم تعيين الخصم بالفعل' / 'An opponent has already been set'
  invitation_not_found : 'الدعوة غير موجودة أو منتهية' / 'Invitation not found or expired'
  blocked_user         : 'لا يمكن التفاعل مع هذا المستخدم' / 'You cannot interact with this user'

موجّهات الاختبار — ملف جديد: tests/api/competition-invite-accept.test.ts
  1. المسار السعيد: A ينشئ → invite(B) → B يقبل ⇒ opponent_id = B، status = accepted
  2. سباق: استدعاءان متزامنان لـ accept من B و C على نفس المنافسة (Promise.all) ⇒ **قبول واحد فقط**
     ينجح، والآخر 409؛ opponent_id واحد ثابت
  3. بعد قبول B، طلب C المعلّق ⇒ حالته rejected/cancelled (لا يبقى pending)
  4. A يدعو مستخدماً حاظراً/محظوراً ⇒ 403 برسالة مترجمة
  5. قبول دعوة غير موجودة أو ملغاة ⇒ 404/409 برسالة مترجمة
  6. إشعار وصل إلى B عند الدعوة وإلى A عند القبول

أوامر التحقّق: V4, V3, V2, V1
بوابة الخروج: حالة السباق تعطي فائزاً واحداً · لا طلبات معلّقة متضاربة · الرسائل مترجمة.

الفرع: fix/core-invite-accept-loop
رسالة الالتزام: fix(core): close competition invite/accept loop and make opponent assignment race-safe
```

#### 🟧 REMOTE

```
[المقدمة الثابتة 0.2]

1. npx vitest run tests/api/competition-invite-accept.test.ts        → كل الحالات خضراء
2. إثبات الحمرة: احذف `AND opponent_id IS NULL` من setOpponent في CompetitionModel.ts →
   حالة السباق (2) **يجب أن تفشل**؛ ثم أعِد. وبالمثل: عطّل تنظيف الطلبات المعلّقة → الحالة (3) تفشل.
3. أعد تشغيل حالة السباق **5 مرات متتالية** (`for i in {1..5}; do npx vitest run <file> -t "race"; done`)
   → لا وميض (flake). أي فشل واحد = REJECT.
4. npm test && npx tsc --noEmit && npm run build
5. تحقّق أن الرفض الجماعي للطلبات يتم داخل db.batch() (ذرّية) وليس استدعاءات متتابعة:
   grep -n "batch(" src/models/CompetitionModel.ts src/controllers/CompetitionController.ts
6. i18n: opponent_already_set / invitation_not_found / blocked_user في ar و en.

REJECT إذا: وميض في السباق · أو التنظيف غير ذرّي · أو ظهر عمود/جدول جديد بلا migration.
```

---

### 2.B — [GATE] بوابة المرحلة 2 (فحص تكاملي قصير)

#### 🟧 REMOTE فقط

```
[المقدمة الثابتة 0.2] — هذه بوابة مرحلة، يُسمح فيها بفحص أوسع قليلاً.

على origin/main بعد دمج 2.A:
1. npm ci && npm run db:reset
2. npm run test:integration                        → أخضر
3. npm test                                        → أخضر
4. سيناريو يدوي على npm run dev:sandbox: أنشئ منافسة بحساب A، ادعُ B، اقبل من B، تحقّق من
   GET /api/competitions/:id أن opponent_id = B و status = accepted.
5. node dev-tools/route-inventory.mjs — قارن بـ docs/14-ROUTE-INVENTORY.md؛ أبلغ عن أي مسار
   دعوة/قبول بلا authMiddleware (لا تُصلحه، بلّغ فقط).
مخرج: تقرير بوابة على شكل issue أو تعليق، وقرار: المضي للمرحلة 3 أم لا.
```

---

## المرحلة 3 — الملفات والتفاعل الأساسي · 2–3 أيام · 5 PRs

### 3.A — فرض الحظر مركزياً (ثغرة سلامة B6)

**المعرّف:** `B6` · **الفرع:** `fix/core-central-block-enforcement` · **PR واحد**

#### 🟦 LOCAL

```
[المقدمة الثابتة 0.1]

النتيجة للمستخدم: من حظرته لا يستطيع مراسلتك، ولا بدء محادثة معك، ولا التعليق عليك،
ولا متابعتك، ولا تقييمك — لا عند الدعوات فقط كما هو الحال اليوم.

الحقائق المؤكَّدة:
- src/models/UserBlockModel.ts:98 `isBlocked(userId1, userId2)` موجودة.
- src/lib/services/UserStatusService.ts:101 `isBlocked()` — تكرار ثانٍ.
- الفحص مستدعى فعلياً في src/models/CompetitionInvitationModel.ts:86 فقط.

موجّهات العمل:
1. وحّد المصدر: دالة واحدة `isBlockedBetween(a, b): Promise<boolean>` في src/models/UserBlockModel.ts
   (اتجاهان: a حظر b أو b حظر a). اجعل UserStatusService.isBlocked يفوّض إليها (لا يكرر SQL).
2. استدعها **في طبقة النموذج/الخدمة** (لا في المسارات) عند:
   - MessageModel: إنشاء رسالة + findOrCreate محادثة
   - CommentModel: إضافة تعليق على محتوى مستخدم حاظر
   - UserModel/follow: المتابعة
   - RatingModel/rate: التقييم
   - (الدعوات: موجود — وحّده على الدالة الجديدة)
3. الاستجابة: 403 برسالة i18n واحدة errors.blocked_interaction. لا تُفصح عن هوية الحاظر
   ولا عن اتجاه الحظر (تسريب خصوصية).
4. الأداء: استعلام واحد بـ OR، لا استعلامان.
5. لا تلمس: منطق الحظر الإعلاني (AdBlockModel — شيء مختلف تماماً رغم تشابه الاسم).

مفاتيح i18n (ar+en):
  errors.blocked_interaction : 'لا يمكن إتمام هذا الإجراء' / 'This action is not available'

موجّهات الاختبار — ملف جديد: tests/api/block-enforcement.test.ts (الحالات الخمس)
  1. A حظر B → B يرسل رسالة إلى A            ⇒ 403 + لا صف في messages
  2. A حظر B → B يبدأ محادثة مع A            ⇒ 403 + لا صف في conversations
  3. A حظر B → B يعلّق على منافسة A          ⇒ 403 + لا صف في comments
  4. A حظر B → B يتابع A                     ⇒ 403 + لا صف في follows
  5. A حظر B → B يقيّم A                     ⇒ 403 + لا صف في ratings
  6. الاتجاه المعاكس: B حظر A → A يرسل لـB  ⇒ 403 (الحظر ثنائي الاتجاه)
  7. بلا حظر ⇒ 200 لكل الأفعال الخمسة (لا انحدار)

أوامر التحقّق: V4, V3, V2, V1
بوابة الخروج: 403 في الحالات الست + لا صفوف مكتوبة + 200 بلا حظر + رسالة موحّدة مترجمة.

الفرع: fix/core-central-block-enforcement
رسالة الالتزام: fix(core): enforce user blocks centrally across messages, comments, follows and ratings
```

#### 🟧 REMOTE

```
[المقدمة الثابتة 0.2]

1. npx vitest run tests/api/block-enforcement.test.ts     → 7 حالات خضراء
2. إثبات الحمرة: علّق استدعاء isBlockedBetween في MessageModel فقط → الحالة (1) و(6) تفشلان؛ أعِد.
   كرّر للتعليقات والمتابعة (استدعاء واحد كل مرة) — كل استدعاء يجب أن يكون **ضرورياً**.
3. تحقّق أن الفحص في طبقة النموذج/الخدمة لا في routes:
   grep -rn "isBlockedBetween" src/modules/api → **يجب أن يكون صفراً**
   grep -rn "isBlockedBetween" src/models src/lib/services → ≥ 5 استدعاءات
4. تحقّق من عدم تسريب الخصوصية: نص الاستجابة 403 لا يحوي اسم/معرّف الحاظر ولا كلمة "blocked/محظور"
   بما يكشف الاتجاه.
5. npm test && npx tsc --noEmit && npm run build
6. تحقّق من عدم تكرار SQL الحظر: grep -rn "FROM user_blocks\|FROM blocks" src → مصدر واحد فقط
   (UserBlockModel).

REJECT إذا: أي مسار غير محمي من الخمسة · أو الفحص في routes · أو بقي SQL حظر مكرر في UserStatusService.
```

---

### 3.B — حدود المعدل وحدود المحتوى (B7 — الحد الأدنى للنواة)

**المعرّف:** `B7` · **الفرع:** `fix/core-rate-limits-content-bounds` · **PR واحد**

#### 🟦 LOCAL

```
[المقدمة الثابتة 0.1]

النتيجة للمستخدم: لا يستطيع مسيء إغراق منافسة بالتعليقات أو مستخدماً بالرسائل،
ولا إدخال نص ضخم يكسر الواجهة.

الحقائق المؤكَّدة:
- جدول rate_limits موجود عبر migrations/0012_rate_limits.sql.
- ⚠ يوجد ترحيلان بالرقم 0012 (0012_rate_limits.sql و 0012_reports_ad_target.sql) — **لا تكرر ذلك.**
  رقم ترحيلك الجديد = أعلى رقم موجود + 1 بعد `ls migrations`.

موجّهات العمل:
1. خدمة واحدة: src/lib/services/RateLimitService.ts (جديدة) — `consume(userId, action, limit, windowSeconds)`
   تعتمد جدول rate_limits الموجود، ذرّية عبر UPSERT/batch، تعيد { allowed, retryAfter }.
   لا تكرر منطق العدّ في المتحكمات.
2. الحدود (ثوابت في الخدمة، لا أرقام سحرية متناثرة):
   comment: 10/دقيقة · message: 20/دقيقة
3. حدود الطول — **في المخطط والمتحكم معاً، لا في الواجهة وحدها**:
   - migration جديدة (رقم متسلسل صحيح): CHECK على طول comments.content و messages.content
     (اقتراح: تعليق ≤ 2000 حرف، رسالة ≤ 4000 حرف). في SQLite تحتاج إعادة إنشاء الجدول لإضافة CHECK —
     إن كان ذلك مدمّراً، اكتفِ بالتحقّق في طبقة النموذج **ووثّق السبب في WORKLOG وفي رأس ملف الترحيل**.
   - تحقّق مكافئ في CommentModel/MessageModel قبل الإدراج.
4. الاستجابة عند التجاوز: 429 + ترويسة Retry-After + رسالة i18n.
5. لا تلمس: rate limiting للمسارات المالية/الإعلانية (مجمّدة)، ولا middleware عام لكل المسارات.

مفاتيح i18n (ar+en):
  errors.rate_limited     : 'محاولات كثيرة، حاول بعد قليل' / 'Too many attempts, please try again shortly'
  errors.content_too_long : 'النص أطول من الحد المسموح' / 'Text exceeds the allowed length'

موجّهات الاختبار — ملف جديد: tests/api/rate-limits.test.ts
  1. 10 تعليقات في الدقيقة ⇒ كلها 200 · التعليق 11 ⇒ 429 + Retry-After موجودة
  2. 20 رسالة ⇒ 200 · الرسالة 21 ⇒ 429
  3. بعد انتهاء النافذة (تزييف الوقت أو تعديل الصف مباشرة) ⇒ 200 مجدداً
  4. الحد لكل مستخدم لكل فعل: مستخدم آخر غير متأثر · والتعليق لا يستهلك حصة الرسائل
  5. تعليق 2001 حرفاً ⇒ 400 برسالة مترجمة + لا صف مكتوب
  6. رسالة 4001 حرفاً ⇒ 400 + لا صف مكتوب

أوامر التحقّق: V4, V3, V2, V6, V1
بوابة الخروج: 11 تعليقاً = 429 · طول زائد = 400 · نافذة جديدة تعيد السماح · db:reset ينجح على قاعدة فارغة.

الفرع: fix/core-rate-limits-content-bounds
رسالة الالتزام: feat(core): add per-action rate limits and content length bounds for comments and messages
```

#### 🟧 REMOTE

```
[المقدمة الثابتة 0.2]

1. npm run db:reset                                        → الترحيل الجديد يطبَّق من قاعدة فارغة بلا خطأ
2. ls migrations | sort → **لا رقمان متطابقان** (باستثناء 0012 التاريخي الموجود مسبقاً)
3. npx vitest run tests/api/rate-limits.test.ts             → 6 حالات خضراء
4. إثبات الحمرة: ارفع الحد في RateLimitService إلى 1000 → الحالتان (1)(2) تفشلان؛ أعِد.
5. npm test && npx tsc --noEmit && npm run build
6. اختبار ذرّية: أطلق 30 تعليقاً متزامناً (Promise.all) → عدد الناجحين **بالضبط 10**، لا 11 ولا 12.
   إن لم يكن هذا الاختبار موجوداً في الـPR، اكتبه في نسختك المحلية للتحقّق فقط وأبلغ بالنتيجة.

REJECT إذا: العدّ غير ذرّي (تجاوز تحت التزامن) · أو الحد مفروض في الواجهة فقط · أو رقم ترحيل مكرر جديد.
```

---

### 3.C — التعليقات: ترقيم، شجرة، بثّ حي، حمولة أخفّ

**المعرّف:** `B2+B3` · **الفرع:** `feat/core-comments-tree-and-live` · **PR واحد**

#### 🟦 LOCAL

```
[المقدمة الثابتة 0.1]

النتيجة للمستخدم: صفحة المنافسة تحمّل التعليقات بسرعة وبصفحات، والردود تظهر تحت أصلها،
والتعليق الجديد يصل للمشاهدين بلا إعادة تحميل.

الحقائق المؤكَّدة:
- GET /api/competitions/:id يُخرج comments + requests + ratings كاملة في استجابة واحدة (حمولة ثقيلة).
- publishComment موجودة في EventPusher/SSE لكنها **غير مستدعاة** من addComment
  (src/controllers/CompetitionController.ts:639) — الربط ثلاثة أسطر.

موجّهات العمل:
1. مسار جديد: GET /api/competitions/:id/comments?limit=&offset=&parent_id=
   - limit افتراضي 20، أقصى 100؛ offset ≥ 0؛ parent_id اختياري (null = الجذور).
   - الإخراج: { items: [...], total, limit, offset } وكل تعليق جذر يحمل replies_count.
   - المنطق كله في CommentModel (findByCompetitionPaged) — لا SQL في routes.
2. تقليص GET /api/competitions/:id: أزل المصفوفات الكاملة واستبدلها بملخّص خفيف
   { comments_count, requests_count, ratings_count } + المسارات الفرعية.
   ⚠ **تغيير عقد API** — سجّله في docs/03-API-REFERENCE.md و docs/14-ROUTE-INVENTORY.md،
   وحدّث مستهلكيه في src/client قبل الدمج (لا تكسر الواجهة).
3. اربط publishComment في addComment بعد نجاح الإدراج (داخل try/catch — فشل البثّ لا يُفشل التعليق).
4. حذف ناعم: عمود deleted_at في comments (migration جديدة برقم متسلسل صحيح)؛ استعلامات القراءة
   تستثني `deleted_at IS NOT NULL`؛ DELETE /api/comments/:id يضبط deleted_at (المالك أو الأدمن).
5. البلاغات: أضف نوعي هدف 'comment' و'message' إلى ReportModel/طابور الأدمن الموجود
   (لا تبنِ طابوراً جديداً).
6. لا تلمس: منطق الإعلانات في نفس الصفحة، ولا SSE للمال.

مفاتيح i18n (ar+en):
  comments.load_more / comments.no_comments / comments.reply / comments.deleted
  errors.comment_not_found / errors.not_comment_owner
  reports.reason_comment / reports.reason_message

موجّهات الاختبار — ملف جديد: tests/api/comments-pagination.test.ts
  1. 25 تعليقاً ⇒ limit=20 يعيد 20 و total=25 · offset=20 يعيد 5
  2. limit=500 ⇒ يُقيَّد إلى 100 (لا استنزاف)
  3. parent_id=X ⇒ الردود فقط، وكل جذر يحمل replies_count صحيحاً
  4. GET /api/competitions/:id ⇒ **لا يحوي مصفوفة comments كاملة**، يحوي comments_count
  5. تعليق محذوف ناعماً ⇒ لا يظهر في القائمة، ولا يُحذف صفه من الجدول
  6. addComment ⇒ publishComment استُدعيت مرة واحدة (spy/mock)
  7. حذف تعليق بمستخدم غير المالك ⇒ 403

أوامر التحقّق: V4, V3, V2, V6, V1
بوابة الخروج: الترقيم يعمل · حمولة /:id أخفّ والواجهة لا تنكسر · تعليق حي يصل لمشاهد ثانٍ بلا reload.

الفرع: feat/core-comments-tree-and-live
رسالة الالتزام: feat(core): paginate competition comments, add threaded replies, soft delete and live publish
```

#### 🟧 REMOTE

```
[المقدمة الثابتة 0.2]

1. npm run db:reset && npx vitest run tests/api/comments-pagination.test.ts   → 7 حالات خضراء
2. إثبات الحمرة: احذف استدعاء publishComment من addComment → الحالة (6) تفشل؛ أعِد.
3. **فحص كسر الواجهة (إلزامي لهذا البند):**
   grep -rn "\.comments\b\|\.ratings\b\|\.requests\b" src/client src/modules/pages
   → كل مستهلك للمصفوفات المحذوفة يجب أن يكون محدّثاً للمسار الفرعي. أي مستهلك متبقٍ = REJECT.
4. تحقّق يدوي عبر npm run dev:sandbox: افتح صفحة منافسة، أضف تعليقاً من متصفح آخر
   → يظهر بلا إعادة تحميل. أرفق ملاحظة النتيجة.
5. node dev-tools/route-inventory.mjs → المسار الجديد مسجَّل في docs/14-ROUTE-INVENTORY.md
   و docs/03-API-REFERENCE.md محدَّث (G6).
6. npm test && npx tsc --noEmit && npm run build

REJECT إذا: مستهلك واجهة مكسور · أو SQL في routes · أو limit غير مقيَّد بسقف · أو الحذف صلب بدل ناعم.
```

---

### 3.D — توحيد الإعجاب/عدم الإعجاب

**المعرّف:** `B8` · **الفرع:** `fix/core-like-dislike-consistency` · **PR واحد**

#### 🟦 LOCAL

```
[المقدمة الثابتة 0.1]

النتيجة للمستخدم: زر عدم الإعجاب إمّا يعمل فعلاً أو يختفي — لا زر يُظهر عدداً ولا يقبل نقرة.

الحقيقة المؤكَّدة: dislike مخزَّن ومعروض في الواجهة لكن **بلا مسار API** يكتبه.
القرار المطلوب من القائد قبل التنفيذ (اسأل إن لم يكن محسوماً): إكمال أم إزالة.
الافتراضي الموصى به للنواة: **إكماله** (تكلفة أقل من تعديل الواجهة والمخطط والبيانات القائمة).

موجّهات العمل (مسار الإكمال):
1. LikeModel: عمود/قيمة type ('like' | 'dislike') — استخدم العمود الموجود إن وُجد، وإلا migration جديدة.
2. المسارات: POST /api/competitions/:id/dislike و DELETE مقابله (بنفس نمط like الموجود).
   التبديل ذرّي: الإعجاب يلغي عدم الإعجاب والعكس، داخل db.batch() — لا يجتمعان لنفس المستخدم.
3. getLikeStatus يعيد { liked, disliked, likes_count, dislikes_count }.
4. المنطق في LikeModel وInteractionController فقط.
(مسار الإزالة، إن اختاره القائد: احذف عناصر dislike من src/client والقوالب، وأبقِ العمود في المخطط
 موثَّقاً كدين، وحدّث i18n. الاختبارات تصبح: الزر غير موجود في DOM + العدّاد لا يُعرض.)

مفاتيح i18n (ar+en): interactions.dislike / interactions.undislike / interactions.dislikes_count

موجّهات الاختبار — ملف جديد: tests/api/like-dislike.test.ts
  1. dislike ⇒ 200 وdislikes_count = 1
  2. like بعد dislike ⇒ likes_count = 1 و dislikes_count = 0 (تبديل ذرّي)
  3. dislike مكرر من نفس المستخدم ⇒ لا مضاعفة (idempotent)
  4. حذف الـdislike ⇒ العدّاد 0
  5. getLikeStatus يعيد الحقول الأربعة
  6. مستخدم محظور (البند 3.A) ⇒ 403

أوامر التحقّق: V4, V3, V2, V1
بوابة الخروج: لا حالة يجتمع فيها like و dislike لنفس المستخدم · العدّادات متسقة بعد التبديل.

الفرع: fix/core-like-dislike-consistency
رسالة الالتزام: fix(core): make dislike a real API action with atomic like/dislike toggle
```

#### 🟧 REMOTE

```
[المقدمة الثابتة 0.2]

1. npx vitest run tests/api/like-dislike.test.ts        → 6 حالات خضراء
2. اختبار تزامن: like و dislike متزامنان من نفس المستخدم (Promise.all) ×5 مرات
   → النتيجة النهائية دائماً حالة واحدة متسقة، لا صفّان. أي وميض = REJECT.
3. grep -rn "dislike" src/client src/modules/pages → كل عنصر واجهة له مسار API مقابل موجود فعلاً
   (أو أُزيل بالكامل إن اختير مسار الإزالة).
4. npm test && npx tsc --noEmit && npm run build
5. i18n: مفاتيح dislike في ar و en.

REJECT إذا: التبديل غير ذرّي · أو بقي زر بلا مسار · أو migration بلا اختبار db:reset.
```

---

### 3.E — تصحيح أنواع الإشعارات

**المعرّف:** `B9` · **الفرع:** `fix/core-notification-types` · **PR واحد**

#### 🟦 LOCAL

```
[المقدمة الثابتة 0.1]

النتيجة للمستخدم: الإشعار يقول ما حدث فعلاً — "رسالة جديدة" لا "تعليق جديد" — والنقر عليه
يفتح الوجهة الصحيحة.

الحقيقة المؤكَّدة: إشعار الرسالة يُرسل بـ type: 'comment' (خطأ نسخ)، وتعداد الأنواع
لا يحوي 'message' / 'post_like' / 'post_comment'.

موجّهات العمل:
1. NotificationModel: وسّع تعداد الأنواع ليشمل message, post_like, post_comment
   (مع القيم الموجودة). إن كان التعداد مفروضاً بـ CHECK في المخطط → migration جديدة بترقيم صحيح.
2. أصلح موضع إرسال إشعار الرسالة ليستخدم 'message'.
3. لكل نوع: مفتاح i18n لعنوان/نص الإشعار + رابط الوجهة (deep link) الصحيح.
   الترجمة **وقت العرض** حسب لغة المستقبِل، لا وقت الإنشاء — لا تخزّن نصاً مترجماً في قاعدة البيانات؛
   خزّن type + payload وترجم في طبقة العرض.
4. تحقّق من عدم كسر الإشعارات القديمة المخزّنة بنوع 'comment' (توافق خلفي: fallback آمن).

مفاتيح i18n (ar+en، مجموعة notifications):
  new_message / new_post_like / new_post_comment (+ أي نوع ناقص يكشفه الفحص)

موجّهات الاختبار — ملف جديد: tests/api/notification-types.test.ts
  1. إرسال رسالة ⇒ إشعار type = 'message' (لا 'comment')
  2. تعليق ⇒ type = 'comment'
  3. GET /api/notifications بلغة ar ⇒ النص عربي · بلغة en ⇒ إنجليزي (لنفس الصف المخزَّن)
  4. إشعار قديم بنوع غير معروف ⇒ يُعرض بنص احتياطي، لا يرمي استثناء
  5. رابط الوجهة صحيح لكل نوع

أوامر التحقّق: V4, V3, V2, V1
بوابة الخروج: لا نوع خاطئ · لا نص مترجم مخزَّن في DB · fallback آمن للأنواع القديمة.

الفرع: fix/core-notification-types
رسالة الالتزام: fix(core): correct notification types and localize notifications at render time
```

#### 🟧 REMOTE

```
[المقدمة الثابتة 0.2]

1. npx vitest run tests/api/notification-types.test.ts          → 5 حالات خضراء
2. إثبات الحمرة: أعِد type: 'comment' لإشعار الرسالة → الحالة (1) تفشل؛ أعِد.
3. **فحص حاسم:** grep -rn "INSERT INTO notifications" src → تأكّد أن أي نص مخزَّن ليس جملة
   مترجمة جاهزة (يجب تخزين مفتاح/نوع + payload). وجود نص عربي/إنجليزي حرفي في الإدراج = REJECT.
4. npm test && npx tsc --noEmit && npm run build
5. i18n: مفاتيح notifications الجديدة في ar و en.

REJECT إذا: نص مترجم مخزَّن في DB · أو نوع قديم يرمي استثناء · أو الأنواع الجديدة بلا CHECK/migration
حيث يفرضها المخطط.
```

**[GATE] بوابة المرحلة 3:** محظور→مراسلة = 403 · 11 تعليقاً/دقيقة = 429 · تعليق حي يصل لمشاهد ثانٍ بلا reload · `GET /:id` بحمولة خفيفة والواجهة سليمة · لا نوع إشعار خاطئ.

---

## المرحلة 4 — التقييم والفائز وELO · 2–3 أيام · 3 PRs
> مسار **حسّاس** يُعامل كموثوقية لا كميزة. `LivePayoutEngine` وتوزيع المال **مجمّدان** — المطلوب فقط
> ثبات الفائز وELO. تنطبق بوابات M1–M6 من `docs/11-DEFINITION-OF-DONE.md` على كل ما يمسّ الحساب.

### 4.A — أهلية التقييم ونافذته ومنع التقييم الذاتي

**المعرّف:** `B10` · **الفرع:** `fix/core-rating-eligibility-window` · **PR واحد**

#### 🟦 LOCAL

```
[المقدمة الثابتة 0.1]

النتيجة للمستخدم: التقييم لمن شاهد فعلاً، خلال نافذة محددة، ولا أحد يقيّم نفسه أو يقيّم خصمه،
وبعد إغلاق النافذة لا تتغيّر النتيجة.

الحقائق المؤكَّدة:
- src/controllers/CompetitionController.ts:708 `rate()` — يفحص status='completed' وhasRated فقط.
  لا يفحص المشاهدة، ولا نافذة زمنية، ولا التقييم الذاتي.
- جدول watch_history + WatchHistoryModel موجودان.
- بعد البند 1.C، منطق التقييم في src/models/RatingModel.ts.

موجّهات العمل:
1. **وثّق القاعدة أولاً** في docs/05-COMPETITION-LIFECYCLE.md (فقرة "أهلية التقييم"):
   شرط الأهلية = وجود صف watch_history للمستخدم على المنافسة (وحدّ أدنى للمدة إن كان مخزَّناً)،
   والنافذة = 24 ساعة من ended_at (متسقة مع جدولة finalize_payouts الحالية). القاعدة في الوثيقة
   قبل الكود — G6.
2. RatingModel/الخدمة (لا المتحكم): دوال `isEligibleToRate(competitionId, userId)` و
   `isWindowOpen(competition)`. المتحكم يستدعي ويترجم إلى HTTP فقط.
3. الحراسة المطلوبة في rate():
   - غير مشاهد → 403 competition_errors.not_eligible_to_rate
   - المقيِّم = أحد المتنافسَين → 403 competition_errors.self_rating_forbidden
   - competitor_id ليس أحد متنافسي هذه المنافسة → 400
   - النافذة مغلقة → 409 competition_errors.rating_window_closed
4. الثوابت (مدة النافذة، الحد الأدنى للمشاهدة) في النموذج/الخدمة، لا أرقام سحرية في المتحكم.
5. لا تلمس: LivePayoutEngine، التوزيع المالي، Stripe.

مفاتيح i18n (ar+en، competition_errors):
  not_eligible_to_rate    : 'يجب مشاهدة المنافسة لتقييمها' / 'You must watch the competition before rating it'
  self_rating_forbidden   : 'لا يمكنك تقييم نفسك' / 'You cannot rate yourself'
  rating_window_closed    : 'انتهت مدة التقييم' / 'The rating period has ended'
  invalid_competitor      : 'المتنافس غير صحيح لهذه المنافسة' / 'Invalid competitor for this competition'

موجّهات الاختبار — ملف جديد: tests/api/rating-eligibility.test.ts
  1. مستخدم بلا watch_history ⇒ 403 + لا صف في ratings
  2. مستخدم مشاهد ⇒ 201
  3. المنافس نفسه يقيّم نفسه ⇒ 403
  4. المنافس يقيّم خصمه ⇒ 403
  5. competitor_id لمستخدم خارج المنافسة ⇒ 400
  6. تقييم بعد 24 ساعة (تزييف ended_at) ⇒ 409 + الفائز المخزَّن لم يتغيّر
  7. تقييم داخل النافذة بعد بدئها ⇒ 201

أوامر التحقّق: V4, V3, V2, V1
بوابة الخروج: الحالات السبع خضراء · القاعدة موثّقة في docs/05 · لا أرقام سحرية في المتحكم.

الفرع: fix/core-rating-eligibility-window
رسالة الالتزام: fix(core): enforce rating eligibility, self-rating ban and rating window
```

#### 🟧 REMOTE

```
[المقدمة الثابتة 0.2]

1. npx vitest run tests/api/rating-eligibility.test.ts       → 7 حالات خضراء
2. إثبات الحمرة: عطّل فحص الأهلية ثم فحص النافذة (كلاً على حدة) → الحالات (1) و(6) تفشلان؛ أعِد.
3. G6: افتح docs/05-COMPETITION-LIFECYCLE.md → قاعدة الأهلية والنافذة موصوفة ومطابقة للثوابت في الكود.
   grep -n "24" src/models/RatingModel.ts src/lib/services/*.ts → القيمة في مكان واحد فقط.
4. npm test && npx tsc --noEmit && npm run build
5. i18n: المفاتيح الأربعة في ar و en.
6. فحص التجميد: git diff origin/main --name-only | grep -i "payout\|stripe\|earning\|withdraw\|ledger"
   → **يجب أن يكون فارغاً**.

REJECT إذا: الحراسة في المتحكم دون النموذج · أو الوثيقة غير محدَّثة · أو لُمس أي ملف مالي.
```

---

### 4.B — ملخّص التقييمات مجهول الهوية + سحب التقييم داخل النافذة

**المعرّف:** `B11` · **الفرع:** `feat/core-ratings-summary-and-withdraw` · **PR واحد**

#### 🟦 LOCAL

```
[المقدمة الثابتة 0.1]

النتيجة للمستخدم: يرى الجميع متوسط التقييم وتوزيعه وعدده — بلا كشف من قيّم بماذا — ويستطيع
المقيّم تعديل رأيه (سحب التقييم) ما دامت النافذة مفتوحة.

موجّهات العمل:
1. مسار جديد: GET /api/competitions/:id/ratings/summary
   الإخراج: { competitors: [{ competitor_id, average, count, distribution: {1..5} }] }
   **ممنوع** إخراج user_id أو أي حقل يربط تقييماً بمقيِّم (تسريب خصوصية).
   الاستعلام تجميعي في RatingModel (GROUP BY)، لا جلب الصفوف وتجميعها في JS.
2. مسار جديد: DELETE /api/competitions/:id/rate?competitor_id=
   - داخل النافذة فقط (يعيد استخدام isWindowOpen من 4.A)، ولمقيِّم فعلي فقط.
   - الحذف + إعادة حساب المجاميع داخل **db.batch() واحد**.
   - خارج النافذة ⇒ 409 rating_window_closed.
3. راجع GET /api/competitions/:id ومسار ratings القديم: أزل أي إخراج لـ user_id في التقييمات العامة.
   (إن كان الأدمن يحتاج التفاصيل، فذلك مسار أدمن منفصل — ليس من هذا البند.)
4. الترقيم/الأداء: أضف فهرساً على ratings(competition_id, competitor_id) إن لم يوجد
   (migration جديدة بترقيم صحيح).

مفاتيح i18n (ar+en): ratings.summary_title / ratings.average / ratings.no_ratings / ratings.withdrawn

موجّهات الاختبار — ملف جديد: tests/api/ratings-summary.test.ts
  1. 5 تقييمات ⇒ average و count و distribution صحيحة حسابياً
  2. استجابة summary ⇒ **لا تحوي user_id** (فحص نصي على JSON كاملاً)
  3. DELETE داخل النافذة ⇒ 200 والمتوسط يُعاد حسابه فوراً
  4. DELETE خارج النافذة ⇒ 409 والمتوسط لم يتغيّر
  5. DELETE من مستخدم لم يقيّم ⇒ 404/403
  6. لا تقييمات ⇒ average = null (لا قسمة على صفر ولا NaN)

أوامر التحقّق: V4, V3, V2, V6, V1
بوابة الخروج: summary بلا user_id · الحساب صحيح · السحب ذرّي · لا NaN.

الفرع: feat/core-ratings-summary-and-withdraw
رسالة الالتزام: feat(core): add anonymous ratings summary endpoint and in-window rating withdrawal
```

#### 🟧 REMOTE

```
[المقدمة الثابتة 0.2]

1. npm run db:reset && npx vitest run tests/api/ratings-summary.test.ts   → 6 حالات خضراء
2. **فحص خصوصية مستقل:** شغّل الخادم محلياً، أنشئ تقييمات، واستدعِ المسار:
   curl -s localhost:5173/api/competitions/1/ratings/summary | grep -i "user_id\|username\|email"
   → **صفر نتائج**. أي ظهور = REJECT.
3. إثبات الحمرة: احذف حارس النافذة من DELETE → الحالة (4) تفشل؛ أعِد.
4. تحقّق حسابي يدوي: أدخل تقييمات 5,4,4,3,1 → average يجب أن يساوي 3.4 بالضبط (لا تقريب خاطئ)
   و distribution = {1:1, 3:1, 4:2, 5:1}.
5. grep -n "batch(" src/models/RatingModel.ts → الحذف وإعادة الحساب في batch واحد.
6. npm test && npx tsc --noEmit && npm run build

REJECT إذا: تسرّب هوية · أو حساب خاطئ · أو إعادة الحساب خارج batch.
```

---

### 4.C — ذرّية تحديد الفائز وELO تحت التزامن

**المعرّف:** `B12` · **الفرع:** `fix/core-winner-elo-atomicity` · **PR واحد** · **بوابة M1–M6**

#### 🟦 LOCAL

```
[المقدمة الثابتة 0.1]

النتيجة للمستخدم: مهما تزامنت الأصوات، للمنافسة فائز واحد ثابت، وتقييم ELO يُطبَّق مرة واحدة فقط.

الحقيقة المؤكَّدة: ScheduledTaskService.updateAggregatesAfterVote تُستدعى بعد كل تصويت
(CompetitionController.rate) — تحتاج ذرّية.

موجّهات العمل:
1. اجمع كل كتابات updateAggregatesAfterVote (المتوسطات + winner_id + ELO) في **db.batch() واحد**.
   لا استدعاءات run() متتابعة.
2. Idempotency لـELO: ELO يُطبَّق مرة واحدة لكل منافسة. أضف علامة (عمود elo_applied_at
   أو صف في جدول موجود) — migration جديدة بترقيم صحيح — والتحديث مشروط بأنها فارغة
   (UPDATE ... WHERE elo_applied_at IS NULL) لتكون الذرّية في قاعدة البيانات لا في التطبيق.
3. حالة التعادل: عرّفها صراحةً ووثّقها في docs/05-COMPETITION-LIFECYCLE.md
   (اقتراح: لا فائز، winner_id = NULL، ELO بلا تغيير أو تغيير متعادل). لا تتركها ضمنية.
4. تعامل مع فشل الحساب: لا تبتلع الخطأ صامتاً (اليوم console.error فقط) — سجّل + أعِد المحاولة
   عبر مهمة مجدولة، ولا تُفشل تصويت المستخدم.
5. لا تلمس: LivePayoutEngine ولا أي توزيع مالي. إن كان winner_id يغذّي التوزيع، اكتفِ بتثبيته
   ولا تعدّل مستهلكه.

مفاتيح i18n (ar+en): competition.winner / competition.draw / competition.pending_result

موجّهات الاختبار — ملف جديد: tests/api/winner-elo-atomicity.test.ts
  1. 50 تصويتاً متزامناً (Promise.all) ⇒ **winner_id واحد** وعدد التقييمات = 50
  2. تشغيل updateAggregatesAfterVote مرتين ⇒ ELO المطبَّق **لا يتضاعف**
  3. تعادل ⇒ winner_id = NULL (أو السلوك الموثَّق) وELO حسب القاعدة الموثقة
  4. فشل داخل الحساب ⇒ التصويت نفسه نجح (201) والحالة غير فاسدة
  5. ثبات: بعد إغلاق النافذة، تصويت متأخر لا يغيّر winner_id (يتقاطع مع 4.A)

أوامر التحقّق: V4, V3, V2, V6, V1
بوابة الخروج (M1–M6): ثابت محاسبي محفوظ · ذرّية · لا تكرار (idempotency) · أثر تدقيق للتغيير · بلا سلطة لا تغيير.

الفرع: fix/core-winner-elo-atomicity
رسالة الالتزام: fix(core): make winner determination and ELO application atomic and idempotent
```

#### 🟧 REMOTE — **تحقّق موسّع (بند حسّاس)**

```
[المقدمة الثابتة 0.2] — استثناء مسموح: تحقّق أعمق من المعتاد، هذا بند بوابة M.

1. npm run db:reset && npx vitest run tests/api/winner-elo-atomicity.test.ts   → 5 حالات خضراء
2. **اختبار عدم الذرّية (إلزامي):** شغّل حالة الـ50 تصويتاً المتزامنة **10 مرات متتالية**.
   أي مرة واحدة تعطي winner_id مختلفاً أو ELO مضاعفاً = REJECT فوري.
   for i in $(seq 1 10); do npx vitest run tests/api/winner-elo-atomicity.test.ts -t "concurrent" || echo "FAIL@$i"; done
3. إثبات الحمرة: استبدل db.batch() باستدعاءات run() متتابعة → الحالة (1) يجب أن تفشل (ولو أحياناً)؛ أعِد.
4. راجع أن idempotency ELO مفروضة في **شرط SQL** (WHERE ... IS NULL) وليس بفحص JS قبل التحديث:
   grep -n "elo_applied_at" src/ → يجب أن يظهر داخل عبارة UPDATE/WHERE.
5. G6: docs/05-COMPETITION-LIFECYCLE.md يصف قاعدة التعادل وقاعدة ELO مرة واحدة.
6. فحص التجميد: git diff origin/main --name-only | grep -i "payout\|stripe\|earning\|withdraw\|ledger\|donation"
   → فارغ.
7. npm test && npm run test:integration && npx tsc --noEmit && npm run build

REJECT إذا: أي وميض في العشر جولات · أو idempotency في JS لا في SQL · أو لُمس ملف مالي.
```

**[GATE] بوابة المرحلة 4:** غير مشاهد→403 · ذاتي→403 · بعد الإغلاق→409 والفائز ثابت · 50 تصويتاً متزامناً → فائز واحد · summary بلا هوية.

---

## المرحلة 5 — الاكتشاف · 2–3 أيام · 3 PRs

### 5.0 — تشخيص إنتاج قبل أي كود (leaderboard)

**المعرّف:** `B13-0` · **لا PR — تقرير فقط**

#### 🟧 REMOTE (يبدأ هذا البند، لا LOCAL)

```
[المقدمة الثابتة 0.2] — هذا بند تشخيص، لا تعديل كود إطلاقاً.

الفرضية المطلوب حسمها: فشل /api/leaderboard في الإنتاج (https://dueli.maelshpro.com/) سببه
**ترحيلات ناقصة في قاعدة الإنتاج**، لا خطأ في الكود.

خطوات التشخيص:
1. curl -i https://dueli.maelshpro.com/api/leaderboard   → سجّل رمز الحالة ونوع المحتوى ونص الخطأ.
   إن كان HTML بدل JSON، سجّل ذلك صراحةً.
2. اطلب من القائد مخرج: npx wrangler d1 execute dueli-db --remote --command "SELECT name FROM d1_migrations ORDER BY id"
   (أنت لا تملك اعتماد الإنتاج — اطلبه، لا تحاول الوصول.)
3. قارن القائمة بـ `ls migrations` في المستودع → استخرج قائمة الترحيلات غير المطبَّقة.
4. تحقّق أن الجداول/الأعمدة التي يستعلمها src/modules/api/leaderboard/routes.ts موجودة في تلك الترحيلات.

المخرج: تقرير من فقرة واحدة يحسم: (أ) ترحيلات ناقصة — والحل تشغيلي (تطبيق الترحيلات)، أم
(ب) خطأ كود — وعندها فقط ينتقل البند 5.A إلى LOCAL. **لا يُكتب كود قبل هذا الحسم.**
```

---

### 5.A — صلابة leaderboard/search/explore

**المعرّف:** `B13` · **الفرع:** `fix/core-discovery-endpoints-resilience` · **PR واحد** (مشروط بنتيجة 5.0)

#### 🟦 LOCAL

```
[المقدمة الثابتة 0.1]

النتيجة للمستخدم: صفحات المتصدرين والبحث والاستكشاف تعيد نتيجة أو رسالة واضحة — لا صفحة بيضاء
ولا خطأ HTML خام.

شرط مسبق: اقرأ تقرير البند 5.0. إن كان السبب ترحيلات ناقصة، فمهمتك **ليست** إخفاء الخطأ —
مهمتك أن تجعل الفشل مقروءاً (JSON منظّم + رمز صحيح) وأن تُنبّه القائد لتطبيق الترحيلات.

موجّهات العمل:
1. src/modules/api/leaderboard/routes.ts (وsearch/explore بنفس النمط): كل معالج داخل try/catch،
   يعيد **JSON دائماً** (Content-Type: application/json) بشكل موحّد { success, data|error }.
   500 يعيد رسالة i18n عامة، والتفصيل في اللوج فقط (لا تسريب SQL/stack للمستخدم).
2. منطق الاستعلام إلى SearchModel/نموذج مخصص — لا SQL في routes (اليوم هناك SQL في routes).
3. حالة "لا بيانات" ⇒ 200 مع مصفوفة فارغة، لا 500.
4. الواجهة: fallback عند فشل endpoint (رسالة i18n + إعادة محاولة)، لا شاشة فارغة.
5. لا تلمس: منطق ترتيب التوصيات (البند 5.B).

مفاتيح i18n (ar+en):
  errors.service_unavailable / discovery.no_results / discovery.retry

موجّهات الاختبار — ملف جديد: tests/api/discovery-endpoints.test.ts
  1. GET /api/leaderboard على قاعدة مهيّأة ⇒ 200 + JSON مصفوفة
  2. على قاعدة بلا بيانات ⇒ 200 + مصفوفة فارغة (لا 500)
  3. عند رمي استعلام خطأً (mock) ⇒ 500 + **JSON** + رسالة مترجمة عامة، لا نص SQL
  4. Content-Type دائماً application/json في الحالات الثلاث
  5. نفس الحالات لـ /api/search و /api/explore

أوامر التحقّق: V4, V3, V2, V1
بوابة الخروج: 200 JSON في الحالة السعيدة والفارغة · 500 JSON نظيف عند الخطأ · لا SQL في routes.

الفرع: fix/core-discovery-endpoints-resilience
رسالة الالتزام: fix(core): make leaderboard, search and explore endpoints return structured JSON in all cases
```

#### 🟧 REMOTE

```
[المقدمة الثابتة 0.2]

1. npx vitest run tests/api/discovery-endpoints.test.ts   → كل الحالات خضراء
2. **فحص تسريب:** في حالة الخطأ، تأكّد أن جسم الاستجابة لا يحوي: "SQLITE", "SELECT", "no such column",
   ولا stack trace. أي ظهور = REJECT (تسريب معلومات).
3. grep -n "SELECT\|INSERT\|UPDATE" src/modules/api/leaderboard/routes.ts src/modules/api/search/routes.ts
   → **صفر** (المنطق في النماذج).
4. تحقّق من الواجهة: أوقف الـendpoint (mock فشل) → الصفحة تعرض رسالة مترجمة، لا شاشة بيضاء.
5. npm test && npx tsc --noEmit && npm run build
6. i18n: service_unavailable / no_results / retry في ar و en.

REJECT إذا: تسريب SQL · أو SQL باقٍ في routes · أو 500 بجسم HTML.
```

---

### 5.B — تثبيت أوزان التوصيات وسلوك الاحتياط

**المعرّف:** `B14` · **الفرع:** `test/core-recommendation-ranking` · **PR واحد**

#### 🟦 LOCAL

```
[المقدمة الثابتة 0.1]

النتيجة للمستخدم: ما يُعرض في الرئيسية يتغيّر فعلاً حسب لغة المستخدم وبلده ومن يتابع وما شاهد —
ولا يبقى ثابتاً لكل الناس.

الحقيقة المؤكَّدة: src/lib/services/RecommendationEngine.ts يطبّق أوزاناً بالترتيب:
لغة > بلد > متابعة > أحدث > مشاهدة > تقييم. المطلوب **تثبيتها باختبار**، لا إعادة تصميمها.

موجّهات العمل:
1. أخرج الأوزان إلى ثوابت مسمّاة في RecommendationEngine (إن كانت أرقاماً سحرية داخل SQL/JS)
   بلا تغيير قيمها — التغيير السلوكي ممنوع في هذا الـPR.
2. تأكّد من وجود fallback: عند غياب بيانات المستخدم (زائر جديد) ⇒ أحدث/أشهر، لا قائمة فارغة.
3. اربط getFeed بالصفحة الرئيسية **فقط إن كان الاختبار يثبت أنها لا تستدعيه اليوم**. إن كانت مربوطة،
   لا تلمسها.
4. لا SQL في الصفحات؛ المنطق في الخدمة.

مفاتيح i18n (ar+en): recommendations.for_you / recommendations.trending / recommendations.empty

موجّهات الاختبار — ملف جديد: tests/api/recommendations-ranking.test.ts
  1. مستخدم لغته ar ⇒ المنافسات العربية تسبق الإنجليزية في الترتيب
  2. تساوي اللغة ⇒ نفس البلد يسبق
  3. تساوي اللغة والبلد ⇒ منافسة من متابَع تسبق
  4. تساوي كل ما سبق ⇒ الأحدث يسبق
  5. زائر بلا بيانات ⇒ قائمة غير فارغة (fallback)
  6. **حساسية التفاعل:** بعد أن يتابع المستخدم X، ترتيب منافسات X **يرتفع** مقارنةً بالقياس قبل المتابعة

أوامر التحقّق: V4, V3, V2, V1
بوابة الخروج: الأوزان الستة مثبَّتة باختبار ترتيبي · fallback يعمل · التوصيات تتغيّر بالتفاعل.

الفرع: test/core-recommendation-ranking
رسالة الالتزام: test(core): pin recommendation ranking weights and fallback behaviour
```

#### 🟧 REMOTE

```
[المقدمة الثابتة 0.2]

1. npx vitest run tests/api/recommendations-ranking.test.ts   → 6 حالات خضراء
2. **إثبات أن الاختبار يقيس الترتيب لا الوجود:** اعكس ترتيب وزنين (اللغة والبلد) في المحرّك →
   الحالتان (1)(2) يجب أن تفشلا؛ أعِد. إن مرّتا رغم العكس = اختبار زائف = REJECT.
3. تحقّق أن قيم الأوزان **لم تتغيّر** عن origin/main:
   git diff origin/main -- src/lib/services/RecommendationEngine.ts → استخراج ثوابت فقط، لا تغيير قيم.
4. npm test && npx tsc --noEmit && npm run build
5. i18n: مفاتيح recommendations في ar و en.

REJECT إذا: تغيّرت قيمة وزن · أو الاختبار لا يفشل عند عكس الأوزان.
```

**[GATE] بوابة المرحلة 5:** leaderboard يعيد 200 JSON · fallback عند فشل endpoint · التوصيات تتغيّر بالتفاعل.

---

## المرحلة 6 — تجربة المستخدم وE2E · 2–3 أيام · 3 PRs

### 6.A — RTL/LTR + dark + mobile للمسارات الممسوحة

**المعرّف:** `B15` · **الفرع:** `fix/core-rtl-dark-mobile-polish` · **PR واحد**

#### 🟦 LOCAL

```
[المقدمة الثابتة 0.1]

النتيجة للمستخدم: مسار Beta كامل يعمل بصرياً بالعربية (RTL) والإنجليزية (LTR)، ليلاً ونهاراً،
على الجوال.

النطاق **محدود حصراً** بصفحات مسار Beta Core Done:
التسجيل/الدخول · الملف الشخصي · الرئيسية/التوصيات · إنشاء منافسة · صفحة المنافسة (تعليقات/تقييم)
· المحادثات/الرسائل · الإشعارات. **لا تلمس صفحات المال/الإعلانات/الأدمن.**

موجّهات العمل:
1. لكل صفحة في النطاق: RTL منطقي (استخدم start/end لا left/right)، dark: على كل عنصر،
   نقاط توقف الجوال، aria-label لكل زر أيقوني، ترتيب تركيز لوحة المفاتيح سليم.
2. **كل نص ظاهر عبر i18n** — بما فيها: placeholders، tooltips، aria-labels، حالات empty/loading،
   رسائل toast/modal، نصوص SSE. هذا الشرط أكثر ما يُنتهك — امسح صفحاتك بالـgrep قبل الالتزام.
3. لا تغيّر إعداد Tailwind ولا تضف مكتبة UI (ممنوع في PR نواة).
4. لا تعيد تصميم — تصحيح انكسارات فقط.

مفاتيح i18n: كل نص مكتشف أثناء المسح (ar+en). سجّل قائمتها في وصف الـPR.

موجّهات الاختبار:
- tests/build/i18n-coverage.test.ts (جديد أو موسَّع): يفشل إذا وُجد نص user-visible حرفي في
  صفحات النطاق (heuristic: سلسلة تحوي حرفين لاتينيين متتاليين داخل JSX/HTML خارج t()).
- الفحص البصري يدوي في هذا الـPR (E2E في 6.B).

أوامر التحقّق: V4, V3, V2, V1
بوابة الخروج: اختبار تغطية i18n أخضر · لقطات RTL/LTR وdark لكل صفحة نطاق مرفقة بوصف الـPR.

الفرع: fix/core-rtl-dark-mobile-polish
رسالة الالتزام: fix(core): polish RTL/LTR, dark mode and mobile layout for beta core pages
```

#### 🟧 REMOTE

```
[المقدمة الثابتة 0.2]

1. npx vitest run tests/build/i18n-coverage.test.ts      → أخضر
2. إثبات الحمرة: أضف نصاً إنجليزياً حرفياً في إحدى صفحات النطاق → الاختبار **يجب أن يفشل**؛ أعِد.
3. فحص بصري مستقل على npm run dev:sandbox — لكل صفحة نطاق، أربع لقطات:
   (ar+light) (ar+dark) (en+light) (en+dark) بعرض 375px. تحقّق تحديداً من:
   - لا تداخل نص/أيقونة عند RTL
   - لا نص أبيض على أبيض في dark
   - لا تمرير أفقي على 375px
4. grep -rn "left-\|right-\|ml-\|mr-\|pl-\|pr-" src/modules/pages src/client → أبلغ عن أي استخدام
   اتجاهي مطلق في صفحات النطاق (يجب أن يكون start/end).
5. npm test && npx tsc --noEmit && npm run build
6. تأكّد أن tailwind.config.js وpackage.json **لم يتغيّرا**.

REJECT إذا: نص حرفي · أو انكسار في أي من اللقطات الأربع · أو تغيّر إعداد البناء/التنسيق.
```

---

### 6.B — E2E خفيف واحد لمسار Beta Core Done

**المعرّف:** `B16` · **الفرع:** `test/core-beta-e2e` · **PR واحد**

#### 🟦 LOCAL

```
[المقدمة الثابتة 0.1]

النتيجة: أمر واحد يثبت أن مسار Beta كاملاً يعمل — هذا هو الأصل الذي يحمي كل ما سبق.

موجّهات العمل:
1. أضف Playwright كـdevDependency + سكربت `test:e2e` + ملف تهيئة يشغّل dev:sandbox تلقائياً.
   ⚠ هذا **استثناء مصرَّح به** لقاعدة "لا تغيير dependencies" لأن E2E هو نتيجة البند نفسه.
   لا تضف أي حزمة أخرى.
2. سيناريو واحد فقط في tests/e2e/beta-core-path.spec.ts:
   تسجيل A → إكمال profile → رؤية توصيات → إنشاء منافسة → دعوة B → تسجيل/دخول B → قبول →
   بدء → رسالة من A تصل لـB → تعليق يظهر → إنهاء → تقييم من مشاهد C → ظهور الفائز →
   وصول إشعار للطرفين.
3. شغّل السيناريو مرتين: locale=ar (RTL) و locale=en (LTR) — عبر project في تهيئة Playwright.
4. بيانات الاختبار: عبر db:reset + seed، بلا اعتماد على حالة سابقة؛ السيناريو قابل لإعادة التشغيل.
5. لا تضف E2E للمال/الإعلانات (مجمّدة).
6. ⚠ CI: **لا تعدّل .github/workflows في هذا الـPR** (ممنوع في PR نواة). اقترح إضافة الخطوة
   في وصف الـPR ليقرّرها القائد في PR حوكمة منفصل.

موجّهات الاختبار: السيناريو نفسه هو الاختبار. اشترط:
  - زمن التشغيل < 3 دقائق
  - صفر انتظار ثابت (sleep) — انتظار على المحدِّدات فقط
  - يمرّ 3 مرات متتالية بلا وميض

أوامر التحقّق: `npx playwright test`، V3, V2, V1
بوابة الخروج: السيناريو أخضر في ar وen، ثلاث مرات متتالية.

الفرع: test/core-beta-e2e
رسالة الالتزام: test(core): add end-to-end Playwright scenario for the beta core user path
```

#### 🟧 REMOTE

```
[المقدمة الثابتة 0.2]

1. npm ci && npx playwright install --with-deps && npm run db:reset
2. npx playwright test                                   → أخضر في مشروعَي ar و en
3. **فحص الوميض:** for i in 1 2 3; do npx playwright test || echo "FAIL@$i"; done → صفر فشل
4. grep -rn "waitForTimeout\|sleep(" tests/e2e → **صفر** (لا انتظار ثابت)
5. تحقّق أن السيناريو يفشل فعلاً عند كسر المسار: عطّل مسار القبول (رجوع 500 مؤقتاً) →
   E2E يجب أن يفشل عند خطوة القبول تحديداً، برسالة مفهومة؛ ثم أعِد.
6. git diff origin/main -- .github/ → **فارغ** (لا تعديل CI في PR نواة)
7. npm test && npx tsc --noEmit && npm run build

REJECT إذا: وميض · أو انتظار ثابت · أو تعديل CI · أو السيناريو يمرّ رغم كسر المسار.
```

---

### 6.C — [GATE] بوابة Beta Core Done

#### 🟧 REMOTE — مراجعة شاملة (أول تدقيق واسع مسموح منذ المرحلة 0)

```
[المقدمة الثابتة 0.2] — **هنا يُسمح بالتدقيق الواسع** المؤجَّل طوال المراحل 1–6.

على origin/main بعد دمج 6.B:
1. npm ci && npm run db:reset && npm run test:all && npx playwright test   → الكل أخضر
2. npm run build && npx tsc --noEmit
3. G2 ratchet: grep -rho ': any\|as any' src --include=*.ts | wc -l   → **≤ 308**
4. جرد المسارات الكامل: node dev-tools/route-inventory.mjs → قارن بـ docs/14-ROUTE-INVENTORY.md؛
   اذكر كل مسار نواة (غير مالي) بلا authMiddleware.
5. تكافؤ i18n الكامل: قارن مجموعة مفاتيح ar.ts وen.ts → يجب أن تتطابقا تماماً. اذكر الفروق.
6. فحص SEC للنواة فقط: راجع docs/12-SECURITY-REMEDIATION.md — أي بند SEC يمسّ مسار Beta
   ولا يزال مفتوحاً؟ (SEC-11 الكامل وSEC المالية تبقى ديوناً مقبولة.)
7. مطابقة تعريف Beta Core Done حرفياً: مرّ بالمسار يدوياً بالعربية والإنجليزية على الجوال والوضع الليلي.
8. سلامة المخطط: ls migrations | تحقّق من عدم وجود أرقام مكررة جديدة، وأن db:reset ينجح من الصفر.

المخرج: تقرير بوابة "Beta Core Done" — قائمة GO / NO-GO ببنود مرقّمة، وكل NO-GO يُترجم إلى بند
جديد بموجّه LOCAL+REMOTE على نفس نمط هذه الوثيقة.
```

---

# القسم الثاني — ما بعد Beta (يبدأ **فقط** بعد GO في البند 6.C)

> **قاعدة فتح التجميد:** لا يُفتح أي بند من هذا القسم قبل: (أ) GO في 6.C، (ب) قرار مكتوب من القائد
> يسمّي البند المفتوح تحديداً، (ج) إعادة تفعيل التدقيق الواسع (المؤجَّل في القسم الأول) لكل PR مالي.
> **كل بند مالي يخضع لبوابة M1–M6 كاملة + مراجعة أمنية G4، لا استثناء.**
> وكيل REMOTE في هذا القسم يعمل بصلاحية **رفض مطلق**: الشك في المال = REJECT.

## المرحلة 7 — البث الحي الحقيقي (2–3 أسابيع) · 5 PRs

### 7.A — إشارات WebRTC وتفاوض host/guest

**الفرع:** `feat/live-webrtc-signaling`

#### 🟦 LOCAL
```
[المقدمة الثابتة 0.1] — مع رفع تجميد "البث الحي" فقط، بقرار القائد. المال والإعلانات تبقى مجمّدة.

النتيجة للمستخدم: متنافسان يريان ويسمعان بعضهما داخل المنصة، بلا أداة خارجية.

الحقائق: src/lib/services/P2PConnection.ts و src/modules/api/signaling/routes.ts موجودان (هيكل).
موجّهات العمل:
1. خادم الإشارات: offer/answer/ICE عبر المسار الموجود؛ الحالة في Durable Object أو D1 حسب ما هو
   مستخدم فعلاً — **لا تُدخل بنية تخزين جديدة**.
2. الأدوار: host (المنشئ) / guest (الخصم) — الصلاحية مفروضة في الخدمة بناءً على creator_id/opponent_id،
   لا على مدخلات العميل.
3. لا انضمام لغرفة منافسة ليست 'live' أو 'accepted' (يعيد استخدام حراسة المرحلة 1).
4. المصادقة على الإشارات إلزامية — لا غرفة مفتوحة بمعرّف مخمَّن.
مفاتيح i18n: live.connecting / live.connected / live.connection_failed / live.permission_denied
موجّهات الاختبار — tests/api/signaling-auth.test.ts:
  1. غير مصادق ⇒ 401 · 2. مصادق ليس طرفاً ⇒ 403 · 3. host يرسل offer ⇒ guest يستقبله
  4. منافسة pending ⇒ 409 · 5. معرّف غرفة مخمَّن لطرف ثالث ⇒ 403
أوامر التحقّق: V4, V3, V2, V1
```
#### 🟧 REMOTE
```
[المقدمة الثابتة 0.2]
1. npx vitest run tests/api/signaling-auth.test.ts → 5 خضراء
2. **فحص أمني موسّع (بند حسّاس):** حاول الانضمام كطرف ثالث بمعرّفات متسلسلة/مخمّنة → 403 دائماً.
3. تحقّق أن الأدوار مشتقّة من قاعدة البيانات لا من جسم الطلب:
   grep -n "body.*role\|req.*role" src/lib/services/P2PConnection.ts src/modules/api/signaling/ → صفر ثقة بالعميل
4. اختبار متصفحين حقيقيين: افتح جلستين، تحقّق من تدفق الصوت/الصورة في الاتجاهين.
5. npm test && npx tsc --noEmit && npm run build
REJECT إذا: دور من العميل · أو غرفة بلا مصادقة · أو تسريب معرّفات.
```

---

### 7.B — المشاهدون والانضمام المتأخر · **الفرع:** `feat/live-viewers`
#### 🟦 LOCAL
```
[المقدمة الثابتة 0.1]
النتيجة: المشاهد يدخل بثاً جارياً ويرى من نقطة دخوله، ويُحتسب في watch_history (شرط أهلية التقييم).
موجّهات: مسار viewer منفصل (استقبال فقط، لا إرسال)؛ عدّاد مشاهدين حي عبر SSE الموجود؛
كتابة watch_history عند تجاوز حد أدنى للمدة (نفس ثابت المرحلة 4 — مصدر واحد).
i18n: live.viewers_count / live.joined / live.left
اختبار — tests/api/live-viewers.test.ts: انضمام متأخر ⇒ 200 · مشاهد لا يستطيع الإرسال ⇒ 403 ·
watch_history يُكتب مرة واحدة لا لكل reconnect · العدّاد يتناقص عند الخروج.
```
#### 🟧 REMOTE
```
[المقدمة الثابتة 0.2]
1. الاختبار أخضر · 2. reconnect ×5 ⇒ صف watch_history واحد (لا تضخيم أهلية التقييم — **حرج**)
3. مشاهد يحاول الإرسال ⇒ 403 · 4. تسرّب عدّاد: العدّاد لا يكشف هويات المشاهدين
5. npm test && tsc && build
REJECT إذا: تعدّد صفوف watch_history لنفس المشاهد (يفسد أهلية التقييم ومن ثمّ نتيجة المنافسة).
```

---

### 7.C — إعادة الاتصال والصمود · **الفرع:** `feat/live-reconnect`
#### 🟦 LOCAL
```
[المقدمة الثابتة 0.1]
النتيجة: انقطاع شبكة قصير لا ينهي المنافسة.
موجّهات: مهلة سماح (grace period) قبل اعتبار الطرف منسحباً — ثابت موثَّق في docs/04-STREAMING-PIPELINE.md؛
إعادة تفاوض ICE تلقائية؛ حالة 'reconnecting' معروضة للطرفين؛ auto_end_live الموجود لا يُطلق أثناء الـgrace.
i18n: live.reconnecting / live.reconnect_failed / live.opponent_disconnected
اختبار — tests/api/live-reconnect.test.ts: انقطاع < المهلة ⇒ استئناف · > المهلة ⇒ إنهاء موثَّق ·
لا إنهاء مزدوج مع auto_end_live · الحالة المعروضة صحيحة في كل طور.
```
#### 🟧 REMOTE
```
[المقدمة الثابتة 0.2]
1. الاختبار أخضر · 2. تعارض auto_end_live مع reconnect: شغّل الحالتين متزامنتين ×5 ⇒ إنهاء واحد فقط
3. G6: المهلة موثّقة في docs/04 ومطابقة للثابت في الكود · 4. npm test && tsc && build
REJECT إذا: إنهاء مزدوج · أو مهلة كرقم سحري مكرر.
```

---

### 7.D — TURN/STUN وشبكات مقيّدة · **الفرع:** `feat/live-turn-config`
#### 🟦 LOCAL
```
[المقدمة الثابتة 0.1]
النتيجة: البث يعمل خلف NAT/جدار ناري.
موجّهات: إعداد TURN عبر متغيرات بيئة (wrangler secrets) — **لا اعتماد في المستودع إطلاقاً**؛
اعتماد TURN مؤقت قصير الأجل يُولَّد خادمياً لكل جلسة، لا سرّ ثابت مشترك؛
تدهور رشيق: فشل TURN ⇒ رسالة مفهومة + خيار بديل، لا شاشة سوداء.
i18n: live.network_restricted / live.turn_unavailable
اختبار — tests/api/turn-credentials.test.ts: الاعتماد مؤقت وله انتهاء · غير مصادق ⇒ 401 ·
لا سرّ في استجابة العميل غير الاعتماد المؤقت · فشل TURN ⇒ رسالة مترجمة.
```
#### 🟧 REMOTE
```
[المقدمة الثابتة 0.2]
1. الاختبار أخضر
2. **فحص أسرار إلزامي:** git log -p --all | grep -iE "turn|stun" | grep -iE "secret|password|credential"
   وكذلك grep -rn "turn:" src/ wrangler.jsonc → **صفر سرّ مكتوب**. أي سرّ = REJECT فوري + إبلاغ القائد بتدويره.
3. تحقّق أن الاعتماد له TTL قصير (≤ ساعة) ومرتبط بالمستخدم.
4. npm test && tsc && build
REJECT إذا: سرّ في المستودع أو التاريخ · أو اعتماد دائم.
```

---

### 7.E — [GATE] بوابة البث الحي
#### 🟧 REMOTE
```
[المقدمة الثابتة 0.2] — تدقيق بث كامل.
1. جلسة حقيقية: متنافسان + 3 مشاهدين، 10 دقائق، شبكتان مختلفتان ⇒ لا انقطاع غير مبرَّر.
2. E2E للبث (امتداد لـ6.B) أخضر ×3 · 3. watch_history صحيح لكل مشاهد (صف واحد)
4. المنافسة تنتهي مرة واحدة والفائز يُحتسب (تقاطع مع المرحلة 4) · 5. npm run test:all && build
المخرج: GO/NO-GO لفتح المرحلة 8.
```

---

## المرحلة 8 — الماليات (بعد Beta + بعد البث) · 7 PRs · **بوابة M1–M6 لكل بند**

> **تحذير حاكم لكل بنود المرحلة 8:** لا يُدمج أي PR مالي إلا بـ: اختبار وحدة + اختبار تكامل +
> **اختبار عدم ذرّية** (G3 للمسار المالي)، وثابت محاسبي مُثبَت (M1)، وأثر تدقيق (M5).
> أي مبلغ يُحسب في JS ثم يُكتب بلا شرط SQL = REJECT.
> **العملة تُخزَّن أعداداً صحيحة بأصغر وحدة (سنتات)، لا float** — تحقّق من هذا في كل بند.

### 8.A — دفتر الأستاذ والثابت المحاسبي · **الفرع:** `feat/money-ledger-invariant`
#### 🟦 LOCAL
```
[المقدمة الثابتة 0.1] — تجميد المال مرفوع لهذا البند بقرار القائد. اقرأ docs/11 §4 (M1–M6) كاملة أولاً.
النتيجة: كل حركة مال لها قيدان متوازنان، ومجموع النظام قابل للتحقق في أي لحظة.
موجّهات:
1. جدول ledger_entries (migration جديدة برقم صحيح): id, tx_id, account, direction(debit|credit),
   amount_cents INTEGER, currency, ref_type, ref_id, created_at, created_by. **لا REAL/FLOAT.**
2. LedgerService: كل حركة = مجموعة قيود داخل db.batch() واحد، ومجموع المدين = مجموع الدائن (M1).
   دالة verifyInvariant() تعيد الفرق (يجب أن يكون صفراً دائماً).
3. لا رصيد محسوب في مكانين: الرصيد = تجميع من ledger، لا عمود مكرَّر يُحدَّث يدوياً
   (أو إن وُجد عمود cache فهو مشتق ومُختبَر ضد التجميع).
4. منع السلبية (M3): شرط SQL يمنع رصيداً سالباً، لا فحص JS.
5. Idempotency (M4): tx_id فريد (UNIQUE) — إعادة إرسال نفس العملية لا تُنشئ قيداً ثانياً.
6. أثر تدقيق (M5): created_by + ref لكل قيد، ولا حذف ولا تعديل لقيد (append-only، UPDATE ممنوع).
i18n: wallet.balance / wallet.insufficient_funds / wallet.transaction_failed
اختبار — tests/api/ledger-invariant.test.ts (+ tests/integration/ledger.test.ts):
  1. كل حركة ⇒ debit = credit · 2. verifyInvariant() = 0 بعد 100 حركة عشوائية
  3. سحب يتجاوز الرصيد ⇒ مرفوض والرصيد لم يتغيّر · 4. نفس tx_id مرتين ⇒ قيد واحد
  5. 20 حركة متزامنة ⇒ الثابت محفوظ ولا رصيد سالب · 6. محاولة UPDATE/DELETE على قيد ⇒ مرفوضة
أوامر التحقّق: V4, V5, V3, V2, V6, V1
```
#### 🟧 REMOTE — **رفض مطلق عند الشك**
```
[المقدمة الثابتة 0.2] — تدقيق مالي كامل، لا اختصار.
1. npm run db:reset && npx vitest run tests/api/ledger-invariant.test.ts && npm run test:integration
2. **اختبار عدم الذرّية:** 100 حركة متزامنة ×10 جولات ⇒ verifyInvariant() = 0 في **كل** جولة.
   أي جولة ≠ 0 = REJECT فوري.
3. grep -rn "REAL\|FLOAT\|parseFloat\|Number(" على الملفات المالية ⇒ **لا حساب عملة بأرقام عشرية**.
4. تحقّق أن منع السلبية شرط SQL: grep -n "WHERE.*balance\|CHECK.*>= 0" migrations/ src/
5. تحقّق أن الجدول append-only فعلياً (لا مسار UPDATE/DELETE في LedgerService).
6. أعد حساب الرصيد يدوياً بـ SQL مستقل وقارنه بما يعرضه الـAPI ⇒ تطابق تام.
7. npm test && tsc && build
REJECT إذا: أي فرق في الثابت · أو float · أو منع سلبية في JS · أو إمكانية تعديل قيد.
```

---

### 8.B — الأرباح وحصص المنافسة · **الفرع:** `feat/money-earnings-split`
#### 🟦 LOCAL
```
[المقدمة الثابتة 0.1]
النتيجة: المتنافس يرى ما استحقه فعلاً من منافسة منتهية، محسوباً مرة واحدة لا مرتين.
موجّهات: LivePayoutEngine يُعاد ربطه بـLedgerService (8.A) — كل توزيع = قيود، لا أعمدة مباشرة؛
نسب التوزيع ثوابت موثّقة في docs/02-DATABASE.md أو وثيقة سياسة، لا أرقام سحرية؛
التوزيع مرة واحدة لكل منافسة (علامة payout_applied_at + WHERE IS NULL — نفس نمط ELO في 4.C)؛
الكسور: التقريب بالسنتات مع قاعدة موثّقة، والباقي يذهب لحساب النظام — **لا سنت يضيع ولا يُخلَق**.
i18n: earnings.total / earnings.pending / earnings.per_competition
اختبار — tests/api/earnings-split.test.ts:
  1. مبلغ 1000 سنت بنسب 70/25/5 ⇒ المجموع 1000 بالضبط · 2. مبلغ لا يقبل القسمة (مثل 1001) ⇒ المجموع 1001
  3. تشغيل التوزيع مرتين ⇒ قيود مرة واحدة · 4. منافسة بلا فائز (تعادل) ⇒ سلوك موثَّق
  5. 10 توزيعات متزامنة ⇒ الثابت المحاسبي محفوظ
```
#### 🟧 REMOTE
```
[المقدمة الثابتة 0.2] — تدقيق مالي كامل.
1. الاختبارات خضراء + test:integration
2. **فحص حفظ المبلغ:** جرّب 17 مبلغاً أوّلياً غير قابل للقسمة (7, 11, 13, 101, 1001 ...) ⇒
   مجموع الحصص = المبلغ الأصلي بالضبط في كل حالة. أي سنت مفقود/زائد = REJECT.
3. تكرار التوزيع ×10 ⇒ قيود مرة واحدة · 4. verifyInvariant() = 0 بعد كل سيناريو
5. النسب موثّقة ومطابقة للكود (G6) · 6. npm test && tsc && build
REJECT إذا: سنت ضائع · أو توزيع مكرر · أو نسبة غير موثّقة.
```

---

### 8.C — Stripe: الدفع والويبهوك · **الفرع:** `feat/money-stripe-webhooks`
#### 🟦 LOCAL
```
[المقدمة الثابتة 0.1]
النتيجة: الدفع الحقيقي يعمل، وكل حدث من Stripe يُعالَج مرة واحدة فقط.
موجّهات:
1. **تحقّق توقيع الويبهوك إلزامي** (constructEvent بسرّ الويبهوك) — طلب بلا توقيع صحيح ⇒ 400، دائماً.
2. Idempotency: event.id مخزَّن بـUNIQUE؛ إعادة إرسال Stripe لنفس الحدث ⇒ لا أثر مالي ثانٍ.
3. كل تأثير مالي يمرّ عبر LedgerService (8.A) — لا كتابة مباشرة على أرصدة.
4. الأسرار في wrangler secrets فقط — **لا مفتاح في المستودع ولا في wrangler.jsonc**.
5. الأحداث المدعومة محدَّدة صراحةً (allowlist)؛ حدث غير معروف ⇒ 200 + تجاهل مسجَّل، لا 500.
6. وضع الاختبار (test mode) منفصل عن الإنتاج بإعداد، لا بفرع كود.
i18n: payments.succeeded / payments.failed / payments.pending / payments.requires_action
اختبار — tests/api/stripe-webhooks.test.ts:
  1. توقيع خاطئ ⇒ 400 ولا أثر · 2. توقيع صحيح ⇒ قيود صحيحة
  3. نفس event.id مرتين ⇒ أثر واحد · 4. حدث غير مدعوم ⇒ 200 بلا أثر
  5. فشل الدفع ⇒ لا قيود دائنة · 6. استرداد (refund) ⇒ قيود عكسية متوازنة
```
#### 🟧 REMOTE — **أعلى مستوى تدقيق**
```
[المقدمة الثابتة 0.2]
1. الاختبارات خضراء + test:integration
2. **فحص أسرار:** git log -p --all | grep -iE "sk_live|sk_test|whsec_|pk_live" → **صفر**.
   أي مفتاح = REJECT فوري + أبلغ القائد بتدويره في Stripe فوراً.
3. **تزوير ويبهوك:** أرسل طلباً بجسم صحيح وتوقيع مزوّر/غائب ⇒ 400 دائماً (جرّب 5 صيغ تزوير).
4. **إعادة إرسال:** أرسل نفس الحدث 10 مرات ⇒ أثر مالي واحد و verifyInvariant() = 0.
5. تحقّق أن معالج الويبهوك **لا يثق بأي مبلغ من جسم الطلب** بلا مطابقته بسجل داخلي.
6. تحقّق من عدم وجود مسار يكتب على الأرصدة خارج LedgerService:
   grep -rn "UPDATE.*balance\|INSERT INTO earnings" src/ → عبر الخدمة فقط.
7. npm run test:all && tsc && build
REJECT إذا: سرّ مسرَّب · أو ويبهوك بلا توقيع · أو أثر مضاعف · أو ثقة بمبلغ العميل.
```

---

### 8.D — السحوبات · **الفرع:** `feat/money-withdrawals`
#### 🟦 LOCAL
```
[المقدمة الثابتة 0.1]
النتيجة: المستخدم يسحب رصيده الفعلي، مرة واحدة، بموافقة موثّقة.
موجّهات: حالة السحب (requested→approved→paid|rejected) بانتقالات محروسة في SQL (نفس نمط 1.A)؛
حجز المبلغ (hold) لحظة الطلب عبر قيود، فلا يُسحب مرتين؛ حد أدنى ورسوم موثّقة كثوابت؛
الموافقة تتطلب سلطة أدمن (M6) وتُسجَّل في admin_audit_log؛ الرفض يحرّر الحجز بقيود عكسية.
i18n: withdrawals.requested / withdrawals.approved / withdrawals.rejected / withdrawals.min_amount
     / withdrawals.insufficient_balance
اختبار — tests/api/withdrawals-lifecycle.test.ts:
  1. سحب > الرصيد ⇒ مرفوض · 2. سحبان متزامنان بكامل الرصيد ⇒ **واحد فقط** ينجح
  3. الموافقة بلا سلطة أدمن ⇒ 403 · 4. الموافقة مرتين ⇒ دفع واحد
  5. الرفض ⇒ الرصيد يعود كاملاً و verifyInvariant() = 0 · 6. كل انتقال مسجَّل في admin_audit_log
```
#### 🟧 REMOTE
```
[المقدمة الثابتة 0.2] — تدقيق مالي كامل.
1. الاختبارات خضراء + test:integration
2. **سباق السحب المزدوج ×10 جولات:** رصيد 100، طلبان متزامنان بـ100 ⇒ واحد ينجح في كل جولة. أي جولة
   ينجح فيها الاثنان = REJECT فوري (ثغرة استنزاف).
3. verifyInvariant() = 0 بعد كل سيناريو · 4. الموافقة بلا سلطة ⇒ 403 (جرّب مستخدماً عادياً وموظفاً بلا دور)
5. تحقّق أن الحجز والتحرير قيود، لا أعمدة مباشرة · 6. أثر التدقيق كامل لكل انتقال
7. npm run test:all && tsc && build
REJECT إذا: نجاح سحبين · أو تحرير حجز بلا قيود · أو موافقة بلا سلطة أو بلا أثر تدقيق.
```

---

### 8.E — التبرعات · **الفرع:** `feat/money-donations`
#### 🟦 LOCAL
```
[المقدمة الثابتة 0.1]
النتيجة: المشاهد يتبرع لمتنافس، ويصل المبلغ صحيحاً بعد رسوم موثّقة.
موجّهات: كل تبرع = قيود عبر LedgerService؛ رسوم المنصة نسبة موثّقة؛ حد أدنى/أقصى؛
حراسة الحظر (3.A) تنطبق — لا تبرع لمن حظرك؛ التبرع أثناء البث يُبثّ عبر SSE الموجود؛
الاسترداد يمرّ بنفس مسار Stripe (8.C).
i18n: donations.send / donations.thanks / donations.min / donations.max / donations.blocked
اختبار — tests/api/donations.test.ts: مبلغ صحيح ⇒ قيود متوازنة · تحت الحد ⇒ 400 ·
محظور ⇒ 403 · فشل الدفع ⇒ لا قيود · تبرعان متزامنان ⇒ كلاهما صحيح والثابت محفوظ.
```
#### 🟧 REMOTE
```
[المقدمة الثابتة 0.2]
1. الاختبارات خضراء · 2. verifyInvariant() = 0 بعد 50 تبرعاً متزامناً ×5 جولات
3. تحقّق أن الرسوم لا تُحسب في العميل: grep -rn "fee" src/client → لا حساب، عرض فقط
4. الحظر مفروض (تقاطع 3.A) · 5. npm run test:all && tsc && build
REJECT إذا: رسوم من العميل · أو ثابت مكسور · أو تجاوز الحظر.
```

---

### 8.F — الشفافية المتقدمة · **الفرع:** `feat/money-transparency`
#### 🟦 LOCAL
```
[المقدمة الثابتة 0.1]
النتيجة: أي مستخدم يرى أين تذهب أموال المنصة، بأرقام مشتقّة من الدفتر لا من جداول موازية.
موجّهات: كل رقم شفافية = تجميع من ledger_entries (مصدر واحد)؛ **بلا هويات** في الأرقام العامة؛
تخزين مؤقت (cache) مع بصمة تحقّق، والفرق بين المعروض والمحسوب يجب أن يكون صفراً؛
مسار تحقّق عام: GET /api/transparency/verify يعيد نتيجة verifyInvariant().
i18n: transparency.total_in / transparency.total_out / transparency.platform_share / transparency.verified_at
اختبار — tests/api/transparency.test.ts: الأرقام = التجميع المستقل · لا هوية في الاستجابة ·
verify يعيد 0 · الـcache لا يقدّم رقماً قديماً أكثر من المهلة الموثّقة.
```
#### 🟧 REMOTE
```
[المقدمة الثابتة 0.2]
1. الاختبارات خضراء · 2. احسب المجاميع بـSQL مستقل وقارنها بالـAPI ⇒ تطابق تام
3. فحص خصوصية: الاستجابة بلا user_id/email/اسم · 4. verify يعيد 0 على بيانات حقيقية
5. npm run test:all && tsc && build
REJECT إذا: رقم لا يطابق الدفتر · أو تسريب هوية.
```

---

### 8.G — [GATE] بوابة المال
#### 🟧 REMOTE
```
[المقدمة الثابتة 0.2] — تدقيق مالي شامل قبل تفعيل المال في الإنتاج.
1. npm run test:all + كل اختبارات 8.A–8.F ×3 جولات ⇒ أخضر
2. verifyInvariant() = 0 على قاعدة إنتاج مستنسخة (نسخة، لا الإنتاج نفسه)
3. مراجعة M1–M6 بنداً بنداً لكل PR من 8.A–8.F — جدول مطابقة
4. مسح أسرار كامل على التاريخ: git log -p --all | grep -iE "sk_live|whsec_|password|secret" → صفر
5. مراجعة docs/12-SECURITY-REMEDIATION.md: كل بند SEC مالي مغلق أو موثَّق بقبول مخاطرة موقَّع من القائد
6. اختبار استرداد/نزاع (dispute) من طرف إلى طرف
المخرج: GO/NO-GO لتفعيل المال. NO-GO واحد يمنع التفعيل بالكامل.
```

---

## المرحلة 9 — الإعلانات (آخر ما يُفتح) · 4 PRs

### 9.A — دورة حياة الحملة · **الفرع:** `feat/ads-campaign-lifecycle`
#### 🟦 LOCAL
```
[المقدمة الثابتة 0.1] — تجميد الإعلانات مرفوع بقرار القائد، بعد GO في 8.G.
النتيجة: المعلن ينشئ حملة بميزانية، وتتوقف تلقائياً عند نفادها.
موجّهات: AdCampaignManager موجود — أكمله ولا تعِد بناءه؛ حالات (draft→pending_review→active→paused→ended)
بانتقالات محروسة في SQL؛ الميزانية تُخصم عبر LedgerService (8.A) لا بعمود مباشر؛
نفاد الميزانية يوقف العرض **فوراً وذرّياً** (شرط SQL في استعلام الاختيار، لا فحص لاحق).
i18n: ads.campaign_status_* / ads.budget_exhausted / ads.pending_review
اختبار — tests/api/ad-campaign-lifecycle.test.ts: انتقالات محروسة · ميزانية 100 و101 عرضاً ⇒
الخصم يتوقف عند 100 · نفاد ⇒ لا عرض · مراجعة إلزامية قبل النشاط.
```
#### 🟧 REMOTE
```
[المقدمة الثابتة 0.2] — يخضع لبوابة M (الميزانية مال).
1. الاختبارات خضراء · 2. **تجاوز الميزانية تحت التزامن:** 200 عرض متزامن على ميزانية 100 ⇒
   الخصم = 100 بالضبط في 10 جولات. أي تجاوز = REJECT.
3. verifyInvariant() = 0 · 4. حملة غير مراجَعة لا تُعرض أبداً · 5. npm run test:all && tsc && build
```

### 9.B — العرض والاستهداف · **الفرع:** `feat/ads-serving-targeting`
#### 🟦 LOCAL
```
[المقدمة الثابتة 0.1]
النتيجة: الإعلان المناسب يظهر للجمهور المناسب، ولا يظهر لمن حجبه.
موجّهات: الاستهداف بلغة/بلد/فئة فقط (لا تتبّع سلوكي دقيق بلا موافقة)؛ AdBlockModel الموجود يُحترم؛
حدّ تكرار العرض لكل مستخدم؛ الإعلان موسوم بوضوح كـ"إعلان" (i18n) — التزام قانوني؛
لا SQL في الصفحات؛ لا إعلان في صفحات حسّاسة (الرسائل الخاصة).
i18n: ads.sponsored_label / ads.why_this_ad / ads.hide_ad
اختبار — tests/api/ad-serving.test.ts: الاستهداف صحيح · محجوب لا يظهر · حد التكرار مفروض ·
وسم "إعلان" حاضر دائماً · لا إعلان في الرسائل.
```
#### 🟧 REMOTE
```
[المقدمة الثابتة 0.2]
1. الاختبارات خضراء · 2. **فحص الوسم:** كل استجابة إعلان تحوي وسم sponsored — أي إعلان بلا وسم = REJECT (قانوني)
3. المحجوب لا يظهر في 100 طلب متتالٍ · 4. لا تتبّع بلا موافقة: grep على أي تخزين سلوكي جديد
5. npm test && tsc && build
```

### 9.C — القياس ومكافحة الاحتيال · **الفرع:** `feat/ads-metrics-antifraud`
#### 🟦 LOCAL
```
[المقدمة الثابتة 0.1]
النتيجة: المعلن يدفع مقابل مشاهدات ونقرات حقيقية.
موجّهات: عدّ الظهور/النقر عند التحقق الخادمي فقط، لا من العميل وحده؛ إزالة التكرار
(نفس المستخدم/الجلسة خلال نافذة)؛ توقيع/رمز مؤقت لكل انطباع يمنع التزوير؛
الإحصاءات المعروضة للمعلن مشتقّة من نفس المصدر المخصوم منه (لا رقمان).
i18n: ads.impressions / ads.clicks / ads.ctr / ads.spend
اختبار — tests/api/ad-metrics.test.ts: نقرة مزوّرة بلا رمز ⇒ مرفوضة · نقرة مكررة ⇒ تُحتسب مرة ·
الإحصاء = المخصوم · 100 نقرة متزامنة ⇒ العدّ دقيق.
```
#### 🟧 REMOTE
```
[المقدمة الثابتة 0.2] — بوابة M (القياس = فوترة).
1. الاختبارات خضراء · 2. **محاولة احتيال:** أرسل 1000 نقرة مزوّرة (بلا رمز/برمز منتهٍ/برمز معاد استخدامه)
   ⇒ صفر احتساب. أي احتساب = REJECT.
3. الإحصاء المعروض = المخصوم من الميزانية بالضبط · 4. verifyInvariant() = 0
5. npm run test:all && tsc && build
```

### 9.D — بوابة المعلنين · **الفرع:** `feat/ads-advertiser-portal`
#### 🟦 LOCAL
```
[المقدمة الثابتة 0.1]
النتيجة: المعلن يدير حملاته وميزانيته ذاتياً بلا تدخل أدمن.
موجّهات: صلاحيات معزولة (معلن يرى حملاته فقط — فحص ملكية في كل استعلام، لا في الواجهة)؛
i18n كامل RTL/LTR للبوابة؛ لا SQL في الصفحات؛ الشحن يمر بـStripe (8.C) والدفتر (8.A).
i18n: مجموعة advertiser.* كاملة
اختبار — tests/api/advertiser-portal.test.ts: معلن A لا يرى حملات B (401/403 وليس قائمة فارغة فقط) ·
شحن الرصيد يمر بالدفتر · كل نص مترجم.
```
#### 🟧 REMOTE
```
[المقدمة الثابتة 0.2]
1. الاختبارات خضراء
2. **فحص عزل بيانات (IDOR):** بحساب المعلن A، اطلب معرّفات حملات B مباشرةً (10 معرّفات) ⇒ 403/404 دائماً.
   أي تسريب = REJECT فوري.
3. تكافؤ i18n لمجموعة advertiser في ar/en · 4. npm run test:all && tsc && build
```

### 9.E — [GATE] بوابة الإعلانات
#### 🟧 REMOTE
```
[المقدمة الثابتة 0.2]
1. كل اختبارات 9.A–9.D ×3 ⇒ أخضر · 2. verifyInvariant() = 0
3. مسح IDOR شامل على مسارات المعلنين · 4. كل إعلان موسوم · 5. مراجعة قانونية/خصوصية موجزة للاستهداف
المخرج: GO/NO-GO لتفعيل الإعلانات.
```

---

## المرحلة 10 — الديون المؤجَّلة (تُفتح فرادى بقرار القائد)

| البند | الموجّه المختصر | LOCAL | REMOTE |
|---|---|---|---|
| **SEC-11 الكامل** (إزالة `?token=`) | حذف دعم `?token=` من المصادقة نهائياً بعد نقل كل المستهلكين إلى Bearer/cookie | فرع `fix/sec11-remove-token-query`؛ اختبار: `?token=` صالح ⇒ **401**؛ Bearer ⇒ 200؛ cookie ⇒ 200؛ SSE يعمل بلا token في الرابط | فحص: `grep -rn "token=" src/` صفر خارج التاريخ؛ SSE وتحميل الملفات يعملان؛ لا مستهلك مكسور |
| **SEC-04** (سرّ الكرون في query) | نقل `?key=CRON_SECRET` إلى ترويسة `Authorization: Bearer` | فرع `fix/sec04-cron-auth-header`؛ اختبار: بلا ترويسة ⇒ 401، بترويسة صحيحة ⇒ 200، `?key=` القديم ⇒ 401 | تحقّق من تحديث المجدول الخارجي قبل الدمج (وإلا يتوقف الكرون) — **تنسيق تشغيلي إلزامي مع القائد** |
| **CSP الكامل** | ترويسات أمان كاملة بلا كسر الصفحات | فرع `feat/security-csp-headers`؛ اختبار: الترويسات حاضرة؛ لا `unsafe-inline` جديد؛ الصفحات تعمل | فحص كل صفحة نطاق Beta في المتصفح: صفر خطأ CSP في console |
| **المنشورات** (`posts` vs `user_posts`) | حسم الازدواج: جدول واحد، ترحيل بيانات، `/api/posts` موحّد، صور R2 | فرع `feat/posts-unification`؛ ترحيل غير مدمّر + اختبار سلامة مرجعية + اختبار رفع صورة | تحقّق: لا فقدان صف بعد الترحيل (عدّ قبل/بعد)؛ R2 لا تقبل رفعاً بلا مصادقة ولا نوعاً غير مسموح |
| **Durable Objects scaling** | ترحيل حالة البث/SSE إلى DO عند تجاوز حدود D1 | فرع `feat/infra-durable-objects`؛ اختبار حمل + سلوك مطابق قبل/بعد | اختبار حمل مستقل + مقارنة سلوكية؛ REJECT عند أي اختلاف سلوكي غير موثَّق |
| **إزالة ترحيل 0012 المكرر** | توثيق/تسوية ازدواج رقم 0012 دون كسر قواعد قائمة | فرع `chore/migrations-numbering-policy`؛ **لا تعديل للملفات القديمة** — أضف سياسة + فحص آلي يمنع التكرار مستقبلاً | تحقّق أن الفحص يفشل عند إضافة رقم مكرر تجريبي |

---

## ملحق أ — جدول الإسناد السريع

| # | البند | المعرّف | الفرع | LOCAL | REMOTE | يعتمد على |
|---|---|---|---|---|---|---|
| 1 | المهام المجدولة | B4 | `fix/core-scheduled-tasks-b4` | ✔ | ✔ | — |
| 2 | حراسة الحالات | B5-1 | `fix/core-competition-state-guards` | ✔ | ✔ | 1 |
| 3 | تعريب أخطاء المنافسة | B5-2 | `fix/core-competition-errors-i18n` | ✔ | ✔ | 2 |
| 4 | استخراج RatingModel | B5-3 | `refactor/core-extract-rating-model` | ✔ | ✔ | 2 |
| 5 | حلقة الدعوة/القبول | B5-4 | `fix/core-invite-accept-loop` | ✔ | ✔ | 2 |
| 6 | بوابة المرحلة 2 | GATE | — | — | ✔ | 5 |
| 7 | فرض الحظر مركزياً | B6 | `fix/core-central-block-enforcement` | ✔ | ✔ | 6 |
| 8 | حدود المعدل والمحتوى | B7 | `fix/core-rate-limits-content-bounds` | ✔ | ✔ | 7 |
| 9 | التعليقات والبث الحي | B2+B3 | `feat/core-comments-tree-and-live` | ✔ | ✔ | 7, 8 |
| 10 | الإعجاب/عدم الإعجاب | B8 | `fix/core-like-dislike-consistency` | ✔ | ✔ | 7 |
| 11 | أنواع الإشعارات | B9 | `fix/core-notification-types` | ✔ | ✔ | 9 |
| 12 | أهلية التقييم | B10 | `fix/core-rating-eligibility-window` | ✔ | ✔ | 4, 11 |
| 13 | ملخص التقييمات والسحب | B11 | `feat/core-ratings-summary-and-withdraw` | ✔ | ✔ | 12 |
| 14 | ذرّية الفائز وELO | B12 | `fix/core-winner-elo-atomicity` | ✔ | ✔ | 13 |
| 15 | تشخيص leaderboard | B13-0 | — | — | ✔ | — |
| 16 | صلابة الاكتشاف | B13 | `fix/core-discovery-endpoints-resilience` | ✔ | ✔ | 15 |
| 17 | أوزان التوصيات | B14 | `test/core-recommendation-ranking` | ✔ | ✔ | 16 |
| 18 | RTL/dark/mobile | B15 | `fix/core-rtl-dark-mobile-polish` | ✔ | ✔ | 17 |
| 19 | E2E مسار Beta | B16 | `test/core-beta-e2e` | ✔ | ✔ | 18 |
| 20 | **بوابة Beta Core Done** | GATE | — | — | ✔ | 19 |
| 21–25 | البث الحي | 7.A–7.E | `feat/live-*` | ✔ | ✔ | 20 |
| 26–32 | الماليات | 8.A–8.G | `feat/money-*` | ✔ | ✔ | 20 (+25 موصى) |
| 33–37 | الإعلانات | 9.A–9.E | `feat/ads-*` | ✔ | ✔ | 32 |
| 38+ | الديون المؤجَّلة | المرحلة 10 | متفرقة | ✔ | ✔ | حسب القرار |

## ملحق ب — أخطاء متكررة تُرفض فوراً

1. اختبار يمرّ قبل الإصلاح (اختبار زائف).
2. مفتاح i18n في `en.ts` دون `ar.ts` (أو قيمة عربية منسوخة من الإنجليزية).
3. SQL في `routes.ts` أو في الصفحات أو العميل.
4. حراسة سلامة في المتحكم دون النموذج (قابلة للالتفاف).
5. Idempotency/منع سلبية مفروض في JS بدل شرط SQL.
6. رقم ترحيل مكرر.
7. تعديل CI أو dependencies داخل PR نواة (الاستثناء الوحيد: Playwright في 6.B).
8. لمس ملف مالي/إعلاني في PR نواة.
9. رمز `✅` بلا اجتياز G1–G8.
10. نص مترجم مخزَّن في قاعدة البيانات بدل الترجمة وقت العرض.
11. عملة بـfloat بدل أعداد صحيحة بالسنتات.
12. سرّ (Stripe/TURN/CRON) في المستودع أو في تاريخ Git.
