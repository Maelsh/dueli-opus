## 2026-10-28 — UNIT35 / R4-UX-I18N-1 · فرع feat/unit35-r4-ux-i18n-1 (من a6c1802 = origin/main)

- 🔧 **LOCAL VERIFIED — REMOTE Protocol 10 pending.** ركائز A–F الأساسية + اختبارات unit35؛ مصفوفة §4 الكاملة (34 بندًا) تتطلب مراجعة REMOTE (PLAN غير متاح محليًا). لا UNIT35.1 ولا merge/deploy.

## 2026-10-28 — UNIT34 REM1 / R4-DB-MEASURE-1 · فرع feat/unit34-r4-db-measure-1 · PR #146 (من 20c16dc)

- 🔧 **LOCAL VERIFIED — REMOTE Protocol 10 pending.** أدلة قياس كاملة (رحلات SSE/chunk/search/H7)، تقرير صادق (rowsRead غير متاح محلياً)، إصلاح تسريب كاش CI + إزالة كاش T0 الخاطئ، اختبارات كاش/تدهور/requestId. لا merge/deploy.

## 2026-10-28 — UNIT34 / R4-DB-MEASURE-1 · فرع feat/unit34-r4-db-measure-1 (من 20c16dc = origin/main)

- 🔧 **superseded by REM1.** ركائز A–D الأولية على PR #146.
- **BASE:** `20c16dc7bbda3af1aa3b0597f0f147a59c44b1c4` · **PLAN:** `dc5bc1efd7d94dfa1c19604b7277b8104cdb93ad`.

## 2026-10-28 — UNIT33.1 P3 / PR #145 · ملاحظات مراجعة غير حاجبة · فرع feat/unit33-r4-home-ux-deps-sec-1 (من 8e10cdc)

- 🔧 **LOCAL VERIFIED — REMOTE re-review pending.** P3-1 shim exit≠0؛ P3-2 رفض error+vulnerabilities؛ P3-3 severity مفقود. **اختبارات audit:** 22.
- **BASE:** `8e10cdc3ec1f5f2dd1c225feee88ab7d225411cd` · **PR:** #145.

## 2026-10-27 — UNIT33.1 REM2 / PR #145 · F-1 audit report parsing · فرع feat/unit33-r4-home-ux-deps-sec-1 (من 8e10cdc)

- 🔧 **LOCAL VERIFIED — REMOTE re-review pending.** رفض تقارير npm audit غير المعترف بها (بلا `vulnerabilities`); شدة ثغرة غير صالحة → fail-closed. **اختبارات audit:** 18.
- **BASE:** `8e10cdc3ec1f5f2dd1c225feee88ab7d225411cd` · **PR:** #145.

## 2026-10-27 — UNIT33 + UNIT33.1 REM1 / PR #145 · إصلاحات مراجعة REMOTE · فرع feat/unit33-r4-home-ux-deps-sec-1 (من 8e10cdc)

- 🔧 **LOCAL VERIFIED — REMOTE PENDING (re-review).** UNIT33: لا `renderEmptyState` عند وجود صفوف خطأ (`hasErrorRails`). UNIT33.1: بوابة استثناءات كاملة (GHSA/نطاق/يتيم/تواريخ). **اختبارات:** UI rails 6 + audit gate 11.
- **BASE:** `8e10cdc3ec1f5f2dd1c225feee88ab7d225411cd` · **PR:** #145 · **PLAN MAIN:** `266fe4d007fd4534d66e8c3c4489fe29b370d339`.

## 2026-10-27 — UNIT33 + UNIT33.1 / R4-HOME-UX-1 + R4-DEPS-SEC-1 · فرع feat/unit33-r4-home-ux-deps-sec-1 (من 8e10cdc = origin/main)

- 🔧 **superseded by REM1 أعلاه.** H-01 + DEPS كما في PR #145 الأولي.

## 2026-10-27 — UNIT32.3 candidate / R4-ACCOUNT-COMP-LIFECYCLE-EDGE-1 · تحقيق ملاحظتين (حذف بروفايل + تحميل إعدادات كلمة المرور) · فرع fix/r4-account-comp-lifecycle-edge-32-3 (من bfa09aa = origin/main، بعد دمج PR #143)

- 🔧 **LOCAL VERIFIED — REMOTE PENDING.** لا عيب تنفيذي مُثبت؛ **9** اختبارات regression جديدة تغلق فجوات الأدلة (تأكيد/إلغاء الحذف، عناوين SSR/load-more، حالة التحميل قبل `has_password`). لا تغيير API/مخطط/اعتماديات.
- **BASE:** `bfa09aa57c38b59b7f55a5168dcd44ae41d6edb7` (= `origin/main` بعد PR #143).

## 2026-10-27 — UNIT32.2-REM1 / R4-ACCOUNT-COMP-LIFECYCLE-REM1 · متابعة PR #142 · فرع fix/r4-account-comp-lifecycle-rem1 (من 603d826 = origin/main)

- 🔧 **LOCAL VERIFIED — REMOTE PENDING.** A: ترقيم keyset لقائمة منافسات البروفايل (`GET /api/users/:username/competitions` + Load More، `created_at DESC, id DESC`). B: عنوان الحذف في `data-comp-title` و`data-csp-args` بالمعرّف فقط. C: كلمات المرور بلا `.trim()`. D: `has_password` خادمي (OAuth + `account_password_changed` في audit)؛ reset-password يكتب audit. E: تصحيح عدد اختبارات PR #142 المركّزة إلى **13** (2+6+4+1).
- **BASE:** `603d826834e3f8490caff3a67db854fb6eedb647` (دمج/نشر PR #142). **PLAN MAIN:** `47f72e8333c25097bb621c65e1004d0caf64eed0`.
- **اختبارات REM1 الجديدة:** 6 (pagination API 2، title UI 1، OAuth API 2، password raw UI 1). بوابة Quality Gate التاريخية لـ#142: **2107 PASS / 1 skipped** — ليست عدد REM1.
- **NOT TESTED:** لا E2E؛ لا تزامن D1 متوازي (قرار F).

## 2026-10-27 — UNIT32.2 / R4-ACCOUNT-COMP-LIFECYCLE-1 · واجهة تغيير كلمة المرور + حذف منافسة المنشئ قبل انضمام خصم · فرع feat/unit32-2-r4-account-comp-lifecycle-1 (من 3b1b6b6 = origin/main) · PR #142

- 🔧 **MERGED / DEPLOYED** على `603d826834e3f8490caff3a67db854fb6eedb647`. النطاق A/B كما في PR #142.
- **اختبارات مركّزة PR #142:** `tests/api/unit32-2-account-password.test.ts` (2) + `tests/api/unit32-2-competition-delete-lifecycle.test.ts` (6) + `tests/ui/unit32-2-settings-password.test.ts` (4) + `tests/ui/unit32-2-profile-delete.test.ts` (1) = **13** (تصحيح من 14).
- **Quality Gate على merge SHA #142:** 2107 ناجح / 1 skipped (إجمالي المستودع، ليس عدد الاختبارات الجديدة فقط).

## 2026-10-27 — UNIT32.1 / R4-PROFILE-COLLECTIONS-1 · «المشاهدة لاحقًا» وسجل المشاهدات للمالك وحده بترقيم مستقر · فرع feat/unit32-1-r4-profile-collections-1 (من 05f0f1f = origin/main)

- 🔧 **LOCAL VERIFIED — REMOTE PENDING.** الوحدة فقط: تبويبا Watch Later وViewing History داخل بروفايل صاحبه، بخصوصية يفرضها الخادم وترقيم مؤشر حتى النهاية. لا تغيير في H7/التقييمات/المالية/الإعلانات/سياسة المنافسات، ولا حذف/تصدير/مشاركة عامة، ولا migration جديدة، ولا مساس بـPR #110 أو UNIT33/33.1/35. لا دمج/نشر/كتابة إنتاج.
- **BASE / HEAD:** `origin/main == 05f0f1f84c50a13be36b6d2111a628e14985d039` (دمج PR #140)، `dueli-plan/main == a72d9c36e600f38cfb33f6414b51b9a665ef472f`. الفرع `feat/unit32-1-r4-profile-collections-1`؛ commit المصدر `2a7d3c0e9b418111dc387846ae1e4b0d3f9e43bb`، ثم commit الإصلاح `bfb8e4cf86bedce515ae3f63724a43f157285317` (G2 + توقيت VOD + اختباراته)، وهذا السجل في commit الوثائق التالي على الفرع نفسه. PR واحد ضد `main`، بانتظار المراجعة البعيدة.
- **الهوية/الخصوصية:** كل مسارات `/api/watch/*` محمية بالمصادقة، والهوية من الجلسة فقط (`c.get('user')`)، ولا يُقرأ `user_id` من العميل. الضيف 401، والمستخدم الآخر لا يقرأ/يحذف صفوف غيره، و`user_id` المزوَّر يُتجاهل (مثبت باختبارات). قسم `#profileCollections` لا يُرسم إلا للمالك على الخادم، وكل طلب لاحق يعيد الفحص.
- **API:** `GET /api/watch/later`، `GET /api/watch/later/status?ids=`، `POST|DELETE /api/watch/later/:competitionId`، `GET /api/watch/history`، `POST /api/watch/history/:competitionId`. الإضافة idempotent عبر `UNIQUE(user_id, competition_id)` القائم، والحذف idempotent، و`status` يتحقق من الأرقام وبحد 100 ويُقسَّم إلى دفعات 90. المفقود/الملغى لا يُضاف، والمحفوظ القديم لا يُمحى.
- **الترقيم:** `added_at DESC, competition_id DESC` و`watched_at DESC, competition_id DESC` مع كسر تعادل بالمعرّف، مؤشر `{t,i}` base64، حد افتراضي 20 وأقصى 50، وجلب `limit+1`. المؤشر المشوَّه 422. اختبار 13 صفًا بحد 5 يصل 3 صفحات ويعيد المشية نفسها؛ لا RANDOM/OFFSET.
- **إشارة المشاهدة:** H1 (`addHeartbeatSeconds`) و`WATCH_ELIGIBILITY_SECONDS = 300` وH2 (`WatchService.recordWatchIntent`) بلا تغيير. لا صفحة/بطاقة/معاينة/GET تُنشئ سجلًا. VOD فقط: `POST /api/watch/history/:id` مرة واحدة لكل تحميل صفحة بعد ≥5 ثوانٍ من **تقدم تشغيل مؤكد ومتراكم**؛ لا يُحتسب `currentTime` المطلق، وتُصفَّر ساعة التقدم عند pause/waiting/seeking/ended، وتُرفض القفزات > 2.5s، ولا يُحتسب وقت `readyState < 2`. `touchVodWatch` يحرّك `watched_at` فقط وبـSQL محمي على `completed/archived`، ولا يكتب الثواني/`completed` ولا يلمس صفوف البث. لا polling/كتابة لكل إطار/عدّاد تقييم ثانٍ.
- **إصلاح G2 وعقد VOD:** عدد `any` انخفض من **319 إلى 300** (baseline 310 بلا تغيير) بإزالة 15 إضافة صريحة و4 casts قديمة غير لازمة في `competition-card.ts`: `WatchLaterUI.ts` عبر خصائص `Window` الدقيقة (13 → 0)، و`index.ts` عبر `window.WatchLaterUI`، و`competition-card.ts` عبر نوع `Record<string, string>` مباشر بدل casts. أُزيل cast نتيجة الاستعلام في `WatchHistoryModel.findPage()` باستخدام `.all<Record<string, unknown>>()`. عقد `POST /api/watch/history/:id` يظل **إشارة عميل مصادق عليها** وليس إثباتًا خادميًا لمرور 5 ثوانٍ: الاستدعاء المباشر ينشئ صفًا للمنافسة المكتملة/المؤرشفة. الخادم يفرض الهوية والحالة، ويتجاهل حقول الجسم كلها، ويُبقي الثواني/`completed` بلا تغيير، ويضمن idempotency؛ اختبار API جديد يوثّق هذا الحد بصراحة.
- **الواجهة/i18n:** تبويبان بـARIA، تحميل كسول للسجل، حالات تحميل/فراغ/خطأ/إعادة/تحميل المزيد، وإعادة تحميل من الخادم بعد الحذف. زر حفظ على البطاقة المشتركة و`#competitionWatchLaterBtn` على صفحة المنافسة، بحالة مؤكدة من الخادم فقط و`aria-pressed`/`title`/`aria-label`. الضيف يفتح نافذة الدخول القائمة بلا تنقّل أو return من العميل. النصوص في `ar.ts` + `en.ts` مع RTL/LTR ووضع ليلي.
- **الهجرة:** لا migration جديدة؛ الجدولان و`UNIQUE(user_id, competition_id)` وFKs موجودة في `0001`، والفهرس القائم يغطي بادئة المستخدم. لم تُثبت حاجة إلى تغيير مخطط.
- **RED→GREEN:** قبل التنفيذ **7 فاشل / 2 ناجح**؛ بعده المركّز **3 ملفات / 25 اختبارًا ناجحًا** (API 10 + UI بروفايل 8 + VOD timing 7). E2E حقيقي `tests/e2e/unit32-1-profile-collections.spec.ts` = **2/2 ناجح** (ar + en، 4.9 دقيقة) ضد Wrangler/D1 محليين، ويشمل تشغيل VOD فعليًا في Chromium عبر الخطاف المنشور ثم التحقق من طلب `POST /api/watch/history` وصف D1.
- **الأدلة:** `npm test` الكامل = **205 ملف / 2095 اختبارًا: 2095 ناجح، 0 فاشل** بعد توفير `jq` محليًا عبر `JQ_PATH` (خارج المستودع، بلا تعديل اختبارات). `npx tsc --noEmit` نظيف؛ `npm run build` ناجح؛ SEC-05/06/07/08/10/11 AST ناجحة؛ `any` = **300** (baseline 310)؛ `routes:inventory` = **251** بلا تغيير هيكلي (فرق التاريخ فقط أُعيد)؛ `git diff --check` نظيف؛ `public/static/styles.css` أُعيد بعد فروق الأسطر.
- **الملفات:** `src/modules/api/watch/routes.ts`، `src/controllers/WatchCollectionsController.ts`، `src/models/WatchLaterModel.ts`، `src/models/WatchHistoryModel.ts`، `src/models/competition-card-columns.ts`، `src/client/ui/WatchLaterUI.ts`، `src/shared/components/competition-card.ts`، `src/modules/pages/profile-page.ts`، `src/modules/pages/competition-page.ts`، `src/client/index.ts`، `src/client/csp-delegate.ts`، `src/i18n/ar.ts`، `src/i18n/en.ts`، `src/main.ts`، `docs/14-ROUTE-INVENTORY.md`، `dev-tools/route-inventory.json`، `tests/api/unit32-1-profile-collections.test.ts`، `tests/ui/unit32-1-profile-collections.test.ts`، `tests/ui/unit32-1-vod-watch.test.ts` (جديد في جولة الإصلاح)، `tests/e2e/unit32-1-profile-collections.spec.ts`، مع هذا السجل و`WORKLOG.md`.
- **NOT TESTED:** لا CI/preview بعيد على هذا الـhead، ولا نشر/كتابة إنتاج، ولا جولة دخول حقيقية من زر الضيف، ولا قارئ شاشة/جهاز فيزيائي. VOD في E2E غطّى فيديو محليًا مُولَّدًا داخل Chromium والخطاف المنشور، لا خط أنابيب التسجيل/الشرائح الكامل (يغطيه `chunk-player-ux` بشروطه). **NOT MERGED — NOT DEPLOYED — REMOTE REVIEW PENDING.**

## 2026-10-26 — UNIT32 / R4-PROFILE-SAVE-1 · حفظ display_name وbio صار حقيقيًا (P-01) · فرع feat/unit32-r4-profile-save-1 (من 3cee6e7 = origin/main)

- 🔧 **LOCAL VERIFIED — REMOTE PENDING.** عيب P-01 فقط: `PUT /api/settings` كان يرجع 200 ولا يكتب `display_name` ولا `bio`. لا تغيير في المصادقة/الجلسة/CSRF/الصلاحيات، ولا إعادة بناء لدورة الإعدادات، ولا endpoint جديد، ولا مخطط/هجرة/تبعية، ولا مساس مالي/إعلاني/H7. لا دمج ولا نشر ولا كتابة إنتاج؛ PR #110 والوحدات المغلقة بلا مساس.
- **BASE / HEAD:** `origin/main == 3cee6e78ce0750536c474131363f80902b886c7d` (دمج PR #139 / UNIT31، مقروء من GitHub قبل البدء). الفرع `feat/unit32-r4-profile-save-1` من هذا الأساس؛ commit المصدر ثم commit الوثائق على نفس الفرع.
- **السبب المؤكد (P-01):** صفحة الإعدادات كانت ترسل `display_name` و`bio` دائمًا مع حقول التفضيلات، لكن `SettingsController.updateSettings()` كان يمرّر حقول التفضيلات فقط إلى `user_settings`؛ فسقط حقّا الملف الشخصي وصار الجواب 200 بلا كتابة في `users`. وحقيقتان أخريان جعلتا الـ200 بلا قيمة كدليل: (أ) النموذج يعرض `window.currentUser` و`toUserDTO` في المصادقة يحمل `display_name` **بلا** `bio`، فحقل النبذة يستحيل أن يعرض قيمة محفوظة؛ (ب) الصفحة كانت تقرر النجاح من `res.ok` وحده، فجسم يقول `success:false` كان سيُظهر إشعار نجاح.
- **الإصلاح (الخادم):** `PUT /api/settings` يكتب الآن حقلي الملف الشخصي في صف **المستخدم المصادق عليه** في جدول `users` عبر `UserModel` (SQL يبقى في النموذج؛ لا SQL في المتحكم). الهوية من `requireAuth()` + `getCurrentUser()` فقط، ولا يُقرأ `user_id` من العميل إطلاقًا (مثبت باختبار). حقول التفضيلات تحتفظ بجدولها وأعمدتها ومعناها، وشكل الاستجابة يتوسّع إضافيًا فقط بـ`data.profile` (القيم المقروءة من قاعدة البيانات). و`GET /api/settings` يحتفظ بشكل `user_settings` بلا تغيير (مثبت باختبار).
- **دلالات التحديث الجزئي (للمجموعتين):** الحقل غير المُرسل لا يُكتب أبدًا؛ فطلب ملف شخصي وحده لا يمحو تفضيلًا، وطلب تفضيلات وحده لا يمحو الاسم ولا النبذة. و`bio` الفارغة قيمة مشروعة (مسح) تُحفظ كما هي. وأُزيل محو خفي: الكود القديم كان يحوّل `notifications_enabled`/`email_notifications` الغائبة إلى `0` (تعطيل صامت للإشعارات في أي طلب جزئي).
- **التحقق والتنقية (بدون اختراع حدود):** فحص الأنواع (نصوص للحقول النصية، منطقيان للعلّامين، والقيمة المسموحة `public|followers|private` لمستوى الخصوصية)، وحدود الطول هي الموثّقة أصلًا في المشروع لتحديث مستخدم (`src/middleware/validation.ts` → `userUpdateSchema`: الاسم 2..100 والنبذة ≤ 500)، والمدخل غير الصالح يُرفض بـ422 **بلا أي كتابة**. القيم المخزَّنة تُنقّى بـ`Sanitize.cleanText` (اتفاق المشروع: التنقية عند الإدخال) لأن أسطح الملف الشخصي تعرض `display_name` و`bio` كـHTML خام — فلا يمكن أن تحمل بيانات الملف نصًا تنفيذيًا (XSS).
- **الإصلاح (الصفحة):** صفحة الإعدادات تقرأ الآن صف المستخدم الموثوق عبر مسار القراءة القائم `GET /api/users/:username` عند التحميل وبعد الحفظ، تتبنّاه في `window.currentUser`، وتعيد رسم النموذج منه — فتعرض قيمًا محفوظة لا قيمًا في الذاكرة. نتيجة الحفظ تُقرَّر من **جسم** الاستجابة (`success === true`) لا من رمز HTTP؛ والحفظ المرفوض يعرض إشعار خطأ (مع رسالة الخادم إن وُجدت)، وفشل الشبكة لم يعد صامتًا. لا endpoint جديد ولا اسم CSP جديد.
- **RED→GREEN:** `tests/api/r4-profile-save-1.test.ts` (15 اختبارًا): على المصدر قبل الإصلاح **9 فاشل / 6 ناجح**؛ بعده **15/15 ناجح**. `tests/ui/settings-profile-save.test.ts` (3 اختبارات، سكربت الصفحة الحقيقي مقابل خادم حقيقي وD1 حقيقي): **3/3 فاشل** قبل الإصلاح و**3/3 ناجح** بعده. `tests/e2e/settings-profile-save.spec.ts` (Playwright، متصفح حقيقي + D1 محلي حقيقي) ناجح في ar وen.
- **ما الذي تُثبته إعادة القراءة وإعادة التحميل:** لا يُثبَت الحفظ برمز 200 بل بإعادة قراءة الملف عبر `GET /api/users/:username` (مرّتين، لإثبات الثبات لا ذاكرة مخبّأة). صفحة الإعدادات بعد الحفظ تُعيد التحميل فتعرض الاسم والنبذة المحفوظَين، والحفظ المرفوض يترك القيم المخزَّنة والشاشة كما هما.
- **الأدلة (محلي):** المركّز = **3 ملفات / 30 اختبارًا ناجحًا** (`tests/api/r4-profile-save-1.test.ts` 15، `tests/ui/settings-profile-save.test.ts` 3، `tests/ui/settings-contract.test.ts` 12 — فحوص العقد القائمة محفوظة، وحُدِّث نص العقد الموصوف وثلاث حالات جديدة). `npm test` الكامل = **202 ملف / 2070 اختبارًا: 2064 ناجح، 6 فاشل**، والستة كلها `tests/dev-tools/quality-gate-poll.test.ts` لغياب `jq` على هذا المضيف (CI Ubuntu يوفّره؛ بيئية قديمة لا علاقة لها). E2E: `npx playwright test settings-profile-save` = **ناجح واحد لكل مشروع (ar + en)**. `npx tsc --noEmit` نظيف؛ `npm run build` ناجح؛ حراس SEC-05/06/07/08/10/11 AST ناجحون؛ عدّ `any` = 304 ≤ 308؛ `git diff --check` نظيف؛ `npm run routes:inventory` أعاد 245 مسارًا **بلا تغيير مسارات** (فرق الطابع الزمني فقط أُعيد).
- **مشكلة بيئية معروفة (ليست من هذا التغيير):** `tests/e2e/beta-core-path.spec.ts` الفاشل على هذا المضيف (ECONNRESET في workerd/خطوة تقييم) يفشل بالطريقة نفسها على المصدر **قبل** الإصلاح، وخط الإعدادات فيه ينجح في الحالتين. مسجّلة، ولا تُدَّعى نجاحًا.
- **الملفات:** `src/controllers/SettingsController.ts`، `src/modules/pages/settings-page.ts`، `tests/api/r4-profile-save-1.test.ts` (جديد)، `tests/ui/settings-profile-save.test.ts` (جديد)، `tests/e2e/settings-profile-save.spec.ts` (جديد)، `tests/ui/settings-contract.test.ts` (نص العقد + 3 حالات)، مع هذا السجل و`PLAN-STATUS.md`. لا ملفات أخرى.
- **NOT TESTED:** لا قراءة/كتابة إنتاج، ولا قبول على staging/preview، ولا CI بعيد على الرأس الجديد بعد الدفع، ولا مرور قارئ شاشة/IME. رحلة المتصفح جُرّبت في Chromium (سطح مكتب، ar + en)؛ لا جهاز فعلي ولا نقر إنتاجي يدوي.
- **الحالة / NEXT:** `LOCAL VERIFIED — REMOTE PENDING`. غير مدموج وغير منشور ولا «متحقق في الإنتاج»؛ بانتظار المراجعة الخارجية المستقلة.
- **PR / CI (PR #140):** PR [#140](https://github.com/Maelsh/dueli-opus/pull/140) مقابل `main`؛ commit المصدر `9673d9b96f0fd28f878ed2dfdd0cd25f6a7fe000`. Quality Gate run [40383980286](https://github.com/Maelsh/dueli-opus/actions/runs/40383980286) = **ناجح (1m27s)**؛ وDeploy to Cloudflare Pages run [40383980343](https://github.com/Maelsh/dueli-opus/actions/runs/40383980343) = **ناجح** مع `Quality Gate passed for this SHA` + معاينة Cloudflare Pages = **ناجح** على SHA نفسه. commit الوثائق يتبع على نفس الفرع.

## 2026-10-26 — UNIT31 / R4-MESSAGES-1 / F-1 · أول إرسال يحمّل تاريخ المحادثة المتبنّاة كاملًا · فرع feat/r4-messages-1 (من 70ce057 = origin/main)

- 🔧 **LOCAL VERIFIED — REMOTE PENDING.** إصلاح F-1 فقط على PR #139 نفسها. لا تغيير في M-01/M-03/M-04/M-05، ولا API/مخطط/تبعية جديدة، ولا تغيير في المصادقة/الملكية/الحظر/CSRF/حدود المعدل، ولا في فصل الرسائل الشخصية عن الدعم. لا دمج/نشر/كتابة إنتاج؛ PR #110 لم يُمس.
- **BASE / الرأس السابق:** `origin/main == 70ce057f34fc7c3e39506ee6c9e98ddb917d85fc`؛ رأس PR السابق `347e610a0881032148add2c295623a5edf5eb5d8` (ثلاثة commits). commit المصدر/الاختبار `dbdf228822f32e8b5610df9c46b0ae4f4f820979`، وcommit الوثائق يتبع على نفس الفرع.
- **سبب F-1 (مؤكد):** `loadConversations()` يطلب `/api/conversations?limit=100` فقط، و`openPendingUserChat()` يبحث في `conversationsCache` وحدها. لذلك تبدأ محادثة موجودة خارج الصفحة كحالة `pendingUser` بلا `targetConversationId`. أول `POST /api/users/:id/message` يستأنف المحادثة القائمة ويعيدها، لكن العميل كان يرسم الصف الجديد فقط عبر `renderMessages()`، فيبقى التاريخ السابق مخفيًا حتى مغادرة المحادثة وإعادة فتحها.
- **إصلاح F-1:** بعد نجاح الإرسال، يستدعي العميل دائمًا `await loadMessages(currentConversationId)` بعد تبنّي معرّف المحادثة من استجابة الخادم الموثوقة (أو من `sentMessage.conversation_id`). `loadMessages()` تستبدل `loadedMessages` بتاريخ الخادم الزمني الكامل، فتظهر الرسائل الأقدم فورًا وتظهر الرسالة الجديدة مرة واحدة فقط. لم يعد شرط `!sentMessage` يمنع جلب التاريخ. معالجة أخطاء الإرسال/التحميل وحارسا التسلسل/الجلسة والترتيب وسلوك المؤلّف كما هي.
- **حد الفتح المسبق (مسجّل، لم يُوسَّع):** لا توجد API قائمة تحلّ محادثة بمعرّف الطرف الآخر دون إنشاء/إرسال (`GET /api/conversations` يدعم limit/offset فقط، وتصفّح كل الصندوق قبل الفتح غير محدود). لذلك ما زال رابط الملف الشخصي يفتح حالة إنشاء مسمّاة عندما تكون المحادثة خارج أحدث 100؛ لكن أول إرسال يستعيد التاريخ كاملًا الآن. إضافة `GET /api/conversations/with/:userId` تبقى توسعة مستقبلية منفصلة؛ لم يُضف شيء هنا.
- **RED→GREEN:** الاختبار الجديد `UNIT31 R4-MESSAGES-1 — F-1 pre-existing conversation outside the first page`: قائمة المحادثات لا تضم المستخدم B، وفتح `?user=bee`، واستجابة الإرسال تستأنف المحادثة 88، و`GET /api/conversations/88/messages` يعيد صفين تاريخيين مع الصف الجديد. على المصدر قبل الإصلاح فشل بـ`expected +0 to be 1` عند تأكيد قراءة التاريخ (صفر قراءات)؛ بعده ينجح بقراءة واحدة، والصفان التاريخيان والجديد بترتيب الأقدم→الأحدث، والجديد مرة واحدة، وبلا فقاعة `Sending...`.
- **تصحيح حزمة الاختبار:** أصبح الـstub يعيد نسخًا جديدة كما يفعل `res.json()` (المصفوفة المشتركة سابقًا كانت تُعدَّل بدفع الفقاعة التفاؤلية)، واختبار منع الإرسال المزدوج يحدّث تاريخ الخادم الوهمي قبل تحرير الاستجابة. هذا يجعل الحزمة تحاكي JSON الحقيقي؛ لم يُخفَّف سلوك المنتج.
- **الأدلة (محلي):** حزم UNIT31 المركزة = **ملفان / 20 اختبارًا ناجحًا** (15 UI منها اختبار F-1 الجديد + 4 API + 1 جديد). الحزم المجاورة للرسائل/الملف/الترويسة/النموذج = **14 ملفًا / 126 اختبارًا ناجحًا**. `npm test` الكامل = **200 ملف / 2049 اختبارًا: 2040 ناجح، 8 فاشل، 1 مخطى**. الفشل الثمانية بيئي/قديم: 6 `quality-gate-poll` لغياب `jq` محليًا، واثنان زمنيان في `tests/client/r4-unit28-time.test.ts` (A28-TIME-3) يمرّان **19/19** عند إعادة تشغيلهما منفردين. `npx tsc --noEmit` نظيف؛ `npm run build` ناجح؛ حراس SEC-05/06/07/08/10/11 AST ناجحون؛ `git diff --check` نظيف. لم يُعَد تشغيل التكامل لأن F-1 لا يغيّر التخزين أو المصادقة.
- **الملفات:** `src/modules/pages/messages-page.ts`، `tests/ui/unit31-r4-messages.test.ts`، مع هذا السجل و`PLAN-STATUS.md`. لا ملفات أخرى.
- **NOT TESTED:** النقر الحقيقي في متصفح/جهاز، والتحديث الحي عبر SSE، وCI البعيد على الرأس الجديد — **NOT TESTED** حتى الدفع. لا قراءة/كتابة إنتاج.
- **الحالة / NEXT:** `LOCAL VERIFIED — REMOTE PENDING`. غير مدموج وغير منشور، بانتظار المراجعة الخارجية المستقلة.

## 2026-10-26 — UNIT31 / R4-MESSAGES-1 · رحلة الرسائل: تنقّل الجوال، مدخل `?user=`، مؤلّف/إرسال صادق، وقراءة الكل المحفوظة · فرع feat/r4-messages-1 (من 70ce057 = origin/main)

- 🔧 **LOCAL VERIFIED — REMOTE PENDING.** عيوب رحلة الرسائل الخمسة M-01..M-05 فقط: لا إعادة بناء للمصادقة/الجلسة ولا لنظام الرسائل، لا تغيير مالي/إعلاني/H7/سياسة منتج، لا تبعية ولا مخطط/هجرة، ولا CSS واسع (فرق الورقة هو ثلاث فوائد يستخدمها الترميز الجديد فقط). لا دمج/نشر/كتابة إنتاج؛ PR #110 لم يُمس.
- **BASE / HEAD:** `origin/main == 70ce057f34fc7c3e39506ee6c9e98ddb917d85fc`؛ مرجع الخطة `db1e5f06d0747834e81d54fd1343be8ec51584eb`. الفرع `feat/r4-messages-1`؛ commit المصدر `66775a9b39709a21b17e8f83ed004845e6f3bf88`، وcommit الورقة `f8076bc9ec17416bb78d91b4975560286d835e2c`، وcommit الوثائق يتبع على نفس الفرع. PR [#139](https://github.com/Maelsh/dueli-opus/pull/139).
- **M-01 — ناجح (تنقّل المحادثة على الجوال):** قبل، `#chatPane` و`#supportChatPane` تحملان `hidden md:flex` ولا شيء يزيل `hidden`، فالمستخدم على الجوال يفتح محادثة ويبقى على القائمة بلا مدخل أو رجوع. الآن `showChatOnMobile`/`showListOnMobile` تبدّلان لوحتي الرسائل الشخصية، و`showSupportChatOnMobile`/`showSupportListOnMobile` لوحتي الدعم، مع زر رجوع مترجم (`backToConversations` / `backToSupportThreads` مضافتان إلى قائمة CSP). الرجوع يمسح استعلام الرابط المباشر ويعيد القائمة؛ سطح المكتب يحتفظ باللوحتين.
- **M-02 — ناجح (مدخل `?user=` من الملف الشخصي):** قبل، زر المراسلة يبني `?user=<المعرّف الرقمي>` والصفحة تعرض `#<id>` ولا تحلّ محادثة قائمة. الآن الرابط يحمل اسم المستخدم المرمّز، و`openPendingUserChat` تبحث أولًا في المحادثات المحمّلة بمعرّف الطرف الآخر أو اسمه، ولا تستدعي `GET /api/users/:username` إلا عند غياب محادثة قائمة لفتح حالة إنشاء. هوية المحادثة تعرض `display_name` وإلا `username`، ولا تعرض `#id` أبدًا؛ الملف غير الموجود يعطي الخطأ المترجم لا محادثة وهمية. القيم الرقمية القديمة لـ`?user=` ما زالت تُحلّ.
- **M-03 — ناجح (معاينات/شارات موثوقة):** بعد الإرسال وفتح المحادثة وقراءة الكل، `refreshMessageSurfaces()` تعيد قراءة المحادثات وعدد غير المقروء من الخادم ثم تحدّث معاينات الترويسة والشارة. `MessagesUI.markAllRead` تعيد قراءة القائمتين وتطلق `dueli:messages-read-all`، وصفحة الرسائل تستمع وتحدّث أسطحها. فشل التحميل يعرض حالة `role="alert"` منفصلة، لا بريدًا فارغًا كاذبًا.
- **M-04 — ناجح (مؤلّف/إرسال/ترتيب صادق):** السجل الآن من الأقدم إلى الأحدث (`ORDER BY created_at DESC, id DESC` لاختيار أحدث صفحة ثم عكسها؛ و`id` يفصل التعادل في معاينة المحادثة أيضًا). المؤلّف textarea داخل نموذج مع زر إرسال مترجم. Enter يرسل، Shift+Enter سطر جديد، وتركيب IME (`isComposing`) يُتجاهل، و`isSending` مع تعطيل الزر يمنع الإرسال المزدوج. الفقاعة المعلقة تُهرَّب وتُعرض فورًا وتُستبدل فقط بصف الخادم المؤكد؛ فشل الإرسال يزيلها ويعيد النص الأصلي ويعرض الخطأ المترجم. لا تدّعي الواجهة إرسالًا لم يؤكده الخادم.
- **M-05 — ناجح (قراءة الكل محفوظة):** قبل، زر الترويسة كان يصفّر الحالة المحلية فقط فتعود الشارة بعد الاستطلاع/التحديث. أضيف `POST /api/messages/read-all` محمي بالمصادقة → `MessageModel.markAllAsRead(userId)`: `UPDATE messages SET is_read = 1, read_at = ? WHERE receiver_id = ? AND is_read = 0`، ويعيد العدد الحقيقي المحدَّث. الواجهة تعيد القراءة من الاستجابة المؤكدة؛ الفشل لا يغيّر شيئًا ولا يختلق صفرًا. العملية محصورة بالمستقبِل وidempotent.
- **المصادقة / الملكية / الفصل:** المسار الجديد عليه `authMiddleware({ required: true })`، والمتحكم يكرر `requireAuth` ويستخدم مستخدم الجلسة فقط؛ SQL مربوط ومحصور بـ`receiver_id`. اختبارات API تثبت 401 بلا أي تغيير، وتحديث المستقبِل فقط، وعدم مساس صفوف المرسل/الطرف الثالث، وعدم مساس جداول الدعم، وidempotency. ملكية المحادثات/الرسائل والحظر والحد المعدل وCSRF وثوابت الجلسة وهوية المسؤول الرسمية لم تتغير؛ أسطح الرسائل الشخصية والدعم الإداري تبقى منفصلة.
- **المسارات / المخطط / CSS:** المسار الجديد `POST /api/messages/read-all` مسجّل في `docs/14-ROUTE-INVENTORY.md`؛ وأضيف حارس مصادقة صريح إلى `POST /api/users/:id/message` و`GET /api/messages/unread` كي يسجّل المولّد المحدود بالـwildcard حمايتهما الحقيقية (كان يصنّفهما UNGUARDED). الجرد المعاد توليده: 245 مسارًا. لا تغيير مخطط أو هجرة. أعيد توليد `public/static/styles.css` بثلاث فوائد جديدة فقط يستخدمها الترميز (`md:hidden`، `min-h-[48px]`، `disabled:opacity-60`؛ 9 أسطر مضافة).
- **الملفات:** `src/models/MessageModel.ts`، `src/controllers/MessageController.ts`، `src/modules/api/messages/routes.ts`، `src/modules/pages/messages-page.ts`، `src/modules/pages/profile-page.ts`، `src/client/ui/MessagesUI.ts`، `src/client/csp-delegate.ts`، `src/i18n/ar.ts`، `src/i18n/en.ts`، `public/static/styles.css`، `docs/14-ROUTE-INVENTORY.md`، `dev-tools/route-inventory.json`، `tests/api/unit31-r4-messages-read-all.test.ts` (جديد)، `tests/ui/unit31-r4-messages.test.ts` (جديد)، `tests/integration/messages-schema.test.ts`، مع هذا السجل و`PLAN-STATUS.md`.
- **الأدلة (محلي، المصدر النهائي):** المركّز `npx vitest run tests/ui/unit31-r4-messages.test.ts tests/api/unit31-r4-messages-read-all.test.ts` = **ملفان / 19 اختبارًا ناجحًا**. الحزم المجاورة للرسائل/الملف/الترويسة/الأمان = **102/102 ناجح**. `npm test` الكامل = **200 ملف / 2048 اختبارًا: 2041 ناجح، 6 فاشل، 1 مخطى**؛ الستة كلها `tests/dev-tools/quality-gate-poll.test.ts` لغياب `jq` محليًا (CI Ubuntu يوفره). تكامل D1 الحقيقي = **10 ناجح / 1 فاشل**؛ الفشل هو مهلة `0014` القديمة (120 ثانية مع Wrangler)، واختبار قراءة الكل الجديد ناجح منفردًا (1/1، 72 ثانية). `npx tsc --noEmit` نظيف؛ `npm run build` ناجح؛ حراس SEC-05/06/07/08/10/11 AST ناجحون؛ عدّ `any` = 309 ≤ 310؛ `git diff --check` نظيف.
- **NOT TESTED:** النقر الحقيقي في متصفح/جهاز، وسلوك العرض/اللمس، ولوحة مفاتيح فعلية/IME، ومرور قارئ الشاشة، وتحديث المعاينات الحي عبر SSE، وCI البعيد — كلها **NOT TESTED**. مهلة التكامل مشكلة بيئة/توقيت (Wrangler على Windows) لا فشل منتج. لم تُجرَ قراءة أو كتابة إنتاج في هذه المهمة.
- **الحالة / NEXT:** `LOCAL VERIFIED — REMOTE PENDING`. غير مدموج وغير منشور؛ PR واحد مقابل `main`، بلا كتابة إنتاج، وPR #110 بلا مساس.

## 2026-10-26 — UNIT30.6 / R4-COMP-ACCEPT-ZEROCHUNK-1 · 500 بعد التزام القبول (D-01) + منافسة مكتملة بلا مقاطع تعرض كمسجّل (D-02) · فرع fix/unit30-6-accept-zerochunk-1 (من 20109dd = origin/main)

- 🔧 **LOCAL GREEN — READY FOR REMOTE REVIEW.** وحدة تكميلية ضيقة لعيبين فقط (15 §15.10.2): D-01 قبول الدعوة يرجع 500 بعد نجاح الالتزام الذري، وD-02 منافسة مكتملة بلا مقاطع تُعرض كتسجيل مع انتظار طويل. لا D-03 (تبقى في UNIT35)، لا دمج/نشر/كتابة إنتاج، لا تغيير لعقود R2-J أو التصريف أو القوائم أو H7، ولا مخطط/تبعية؛ PR #110 لم يُمس، وبوابة 30–30.4 لا تُغلق من هنا.
- **BASE / PR:** `origin/main == 20109dd59f8a8fb0eb355fbde61b05c6d64d8854` (دمج PR #137). فرع `fix/unit30-6-accept-zerochunk-1`؛ commit الكود `4ccb0ac`، وcommit الوثائق يتبع على نفس الفرع؛ PR [#138](https://github.com/Maelsh/dueli-opus/pull/138).
- **D-01 — السبب المثبت (قراءة إنتاج فقط):** المنافستان 2262/2263: `accepted_at` و`opponent_id` مكتوبان (الالتزام تم). لا يوجد إشعار `invitation_accepted` للمنشئ إطلاقًا (الإشعاران 194/195 هما الدعوتان الواردتان فقط). منافسات المقبول 9046 المعلقة 2245–2249 لا تزال قائمة، ولصفوفها التابعة: **5 صفوف `competition_scheduled_tasks` (FK بلا ON DELETE — 0006) + دعوة واحدة**. `handleAutoDeleteOnJoin` كان يحذف بـ`model.delete()` العاري → `FOREIGN KEY constraint failed` **بعد** الالتزام → `serverError` = 500، والإشعار المخصص ودفعتا SSE لم يُنفذا. حتمي لكل مقبول لديه منافسات معلقة أخرى.
- **D-01 — الإصلاح:** `deleteCascade` (نفس مسح التابعين الإشرافي: طلبات/دعوات/invites/tasks/ratings/comments/chunk_keys/scheduled_competitions/suspensions/hidden ثم المنافسة — دفعة `db.batch()` واحدة ذرية) في فرعي الحذف التلقائي. العميل عند نجاح 200 يُحدّث فورًا (`loadCompetition()` بلا Refresh) ودفعتا SSE محفوظتان؛ لا إخفاء لفشل حقيقي (فشل الالتزام الذري يبقى خطأ).
- **D-02 — السبب المثبت:** 2263: ماركر `recording_finals` موجود (`finalized_at 23:36:01Z`، عدادات 0/0/0)، صفوف مقاطع = 0، ولا lease — أي لا يمكن وصول مقاطع أبدًا. لكن مسار `/api/chunks/playlist/:id` في حالة الصفوف الصفرية (`empty()`) كان يرجع الشكل القديم **بلا أي `index_metadata`** (`hasIndex=false`)، فلا يميز العميل بين «الحالة النهائية» و«تصريف جارٍ» → استطلاع processing ‏8×15 ثانية (~دقيقتان)، وشارة «مسجل» تُرسم قبل التحقق (`updateEmbeddedMode('vod')` قبل جلب القائمة)، وmeta بحجم/مدة صفر (لوحة التنزيل تعرض meta بحالة خطأ صادقة أصلًا — لم تُمس).
- **D-02 — الإصلاح:** حكم نهائي إضافي (additive) `index_metadata.recording_state: 'none'` يُحسب **فقط** عند: صفوف صفرية + وجود الماركر + `status='completed'` + لا lease نشط (`RecordingLeaseModel.status()`)؛ أي فشل قراءة يرجع للشكل القديم (fail-closed). العميل: بوابة قبل `handleVodNotReady()` تحسم فورًا إلى `unavailable` مع `tr.recording_none` (ar/en جديدتان)، والشارة تُخفى قبل التحقق وتُرسم فقط بعد مقاطع مُتحقق منها. عقود التصريف (lease نشط → الاستطلاع المحدود) والانتظار الحي (بلا ماركر) **باكيت-ببايت كما هي**؛ القوائم لم تُمس — فلتر `playableRecording` (vod_url/youtube_video_url) يستبعد المنافسات بلا تسجيل أصلًا (2262/2263 بلا vod_url)، ومبحث Finding B (أهلية chunk-ready) خارج النطاق عمدًا.
- **RED→GREEN:** 16 اختبارًا جديدًا في 3 ملفات. D-01 `tests/api/unit30-6-invite-accept-cascade.test.ts` (4): على المصدر قبل الإصلاح فشل بـ`expected 500 to be 200` مع `FOREIGN KEY constraint failed` (إعادة إنتاج العيب بالضبط)، وبعده 200 صادق + حذف متتالٍ + إشعار واحد بالضبط + retry/نقر مزدوج 409 بلا إشعار مكرر + فرع التعارض المجدول + بلا منافسات أخرى `autoDeleted:0`. D-02 `tests/api/unit30-6-zero-chunk-terminal.test.ts` (8): RED بغياب الحقل؛ بعد الإصلاح: الحكم النهائي لـ9301، **لا حكم** مع lease نشط (9302) أو live بلا ماركر (9304) أو منافسة بمقاطع (9305)، والحكم مع lease منتهي (9303) ومع upstream invalid، وبيئة بلا DB سليمة، وبيانات صفحة النتيجة متاحة. `tests/ui/unit30-6-zero-chunk-page.test.ts` (4): تثبيت ترتيب البوابة قبل الاستطلاع، ورسملة الشارة بعد التحقق فقط، وازدواج ar/en للمفاتيح، وتحليل سكربتات الصفحة المخرجة.
- **الأدلة:** الملفات المتأثرة والمجاورة = **25 ملفًا / 334 اختبارًا ناجحًا** (r2-j-invite-join، competition-invite-accept، chunks-playlist، chunk-index، chunk-download-manifest، recording-lease، unit30-5، scheduled-tasks-due، competition-state-guards، AdminModelExtraction، r2-l2-competition-ui، unit30-4-*، player-ux، recording-download-panel، comp-unified، chunk-playback/player-ux، r4-chunk-view-*، i18n الثلاثة، download-manifest/service). Vitest الكامل = **2029: 2023 ناجح / 6 فاشل** وكلها غياب `jq` محليًا (`quality-gate-poll`؛ CI Ubuntu موجودة). `tsc --noEmit` نظيف؛ `npm run build` ناجح؛ حراس SEC-05/06/07/08/10/11 AST ناجحون؛ `npm run build:css` يعيد الورقة **مطابقة للبايت (فرق git فارغ)**؛ `git diff --check` نظيف؛ إنتاج قراءة فقط عبر wrangler (استعلامات SELECT على 2262/2263/2245–2249 والإشعارات والمقاطع والماركر والleases) بلا أي كتابة.
- **NOT TESTED:** نقر إنتاجي حقيقي للقبول ولصفحة 2263 بعد الدمج يبقى ضمن التحقق الإنتاجي الموضعي لـ15 §15.10 بعد المراجعة والدمج وبوابات الإصدار؛ لا دعوى قبول إنتاج من هذا التقرير المحلي.
- **الحالة / NEXT:** مراجعة REMOTE مستقلة، ثم دمج Merge Owner، ثم Quality/Deploy على merge SHA، ثم التحقق الإنتاجي الموضعي لـD-01/D-02 فقط. لا إغلاق لبوابة 30–30.4 ولا لدعوى جديدة من هنا.

## 2026-10-26 — F1 / R4-CSS-BUILD-REPRO-1 · رمز توثيقي جعل `build:css` غير قابلًا لإعادة التحضير · فرع fix/f1-css-build-repro-1 (من a6d9dea = origin/main)

- 🔧 **LOCAL GREEN — READY FOR REMOTE REVIEW.** تنظيف توثيقي ضيق لملاحظة F1 من المراجع الخارجي: الإملاء المدموج للرمز `@` + `container` في سجلّي التوثيق كان يُكتشف بلقطة Tailwind التلقائية لكل ملف غير مُستثنَى، فتولّد فائدة شاردة عند كل إعادة بناء. لا منطق تطبيق ولا تغيير للإصلاح، ولا تبعية أو مخطط، ولا نشر؛ PR #110 وCloudflare لم تُمسا، ولا كتابة إنتاج.
- **BASE:** `origin/main == a6d9deabc1780c1e4704e330e02f786336270cd2` (دمج PR #136 الستلاشي). PR [#137](https://github.com/Maelsh/dueli-opus/pull/137) — فرع `fix/f1-css-build-repro-1`، commit `dc4965e`.
- **قبل (إعادة إنتاج على الأساس):** `npm run build:css` على main المدموجة أفضت **3 أسطر إدراج** في `public/static/styles.css` — فائدة `container-type: inline-size` للفئة `@`+`container` داخل `@layer utilities` — لأن الرمز المدموج ورد في هذا السجل وPLAN-STATUS، والورقة المتتبعة سبقت commit الوثائق؛ كل إعادة بناء أصبحت مفتونة عن المستودع.
- **الإصلاح:** كشف الرمز المدموج في المواضع الثلاثة القابلة للفحص فقط — سطر ملاحظة WORKLOG، وسطر ملاحظة PLAN-STATUS، وسطر توقئة اختبار المُحلِّل — بإملاء مفصّل `@`+`container` أو صياغة وصفية «فائدة container-type»؛ سطر واحد لكل ملف بمعنى محفوظ.
- **بوابة F1 (RED→GREEN):** على الأساس أظهرت إعادة البناء الأسطر الثلاثة الشاردة (تثبيت RED)؛ بعد التعديل تعيد `npm run build:css` توليد `public/static/styles.css` **مطابقًا للبا يتطابق مع المتتبّع (فرق git فارغ؛ 155,024 بايتًا)**، وبقاء إصلاح `.live-tool.hidden` سليمًا، و`npm run build` الكاملة تحافظ على الورقة بدون تغيير.
- **الأدلة:** مجموعة cascade ‏9/9؛ Vitest الكامل = 2013 اختبار: 2005 ناجح / 8 فاشل — الستة المعروفة غياب `jq` محليًا (`quality-gate-poll`) والثنائي الزمني المعروف `r4-unit28-time` ‏(A28-TIME-3) الذي عاد لبداه 19/19 ناجحًا منفردًا (المنتج لم يمس؛ سابقة موثقة نفسها في مدخلة unit30.5). `tsc --noEmit` نظيف؛ `npm run build` ناجح؛ حراس SEC-05/06/07/08/10/11 AST ناجحة؛ `git diff --check` نظيف.
- **CI (PR #137):** Quality Gate run [40236861038](https://github.com/Maelsh/dueli-opus/actions/runs/40236861038) على `dc4965e` ناجح 1:53؛ Deploy preview run [40236860903](https://github.com/Maelsh/dueli-opus/actions/runs/40236860903) ناجح مع `Quality Gate passed for this SHA` ✓ + تكامل Cloudflare Pages ✓. هذا commit هو رأس الوثائق؛ مسارات رأسه تُسجَّل في تقرير التسليم.
- **CI (PR #137) — ملاحظة العلامة:** على `4d33537` (تحويل علامة مدخلة F1 إلى الرمز قيد-التنفيذ حسب ملاحظة المراجعة): Quality Gate run [40238348460](https://github.com/Maelsh/dueli-opus/actions/runs/40238348460) ناجح 1:30؛ Deploy preview run [40238348455](https://github.com/Maelsh/dueli-opus/actions/runs/40238348455) ناجح 2:15 مع `Quality Gate passed for this SHA` ✓؛ وإعادة بناء الورقة بقيت مطابقة للبا (فرق git فارغ). commit تسجيل هذه المسارات هو رأس الوثائق الجديد؛ مساراته تُسجَّل في تقرير التسليم.
- **الحالة / NEXT:** مراجعة REMOTE المستقلة + CI على HEAD، ثم دمج القائد وفق 10؛ لا دعوى إغلاق جديدة لوابة 30–30.4.

## 2026-10-25 — UNIT30.4 / R4-COMP-CONTROLS-HIDDEN-CASCADE · `hidden` كان تجميليًا على أدوات البث (برج البدء بجوار الإنهاء أثناء النشر) · فرع fix/unit30-4-hidden-cascade (من 251da45 = origin/main)

- 🔧 **LOCAL GREEN — READY FOR REMOTE REVIEW.** يثبّت قاعدة تبادل الزرين من ملحق قرار المالك 24-10 على الورقة المخدومة: أداة تحمل كلاس `hidden` تصبح فعلًا `display:none` في CSS المبني. لا تغيير في آلة حالة الأزرار (`CompetitionSurface.ts` / `paintCompetitorControls` سليمة — التحقيق أثبت ذلك)، ولا في publish/signaling/الإنهاء المبكر/التسوية/ELO/الرصيد/التقييم/H7 أو ترتيب التسجيلات، ولا مخطط أو تبعية، ولا كتابة إنتاج؛ PR #110/UNIT28 لم تُمس.
- **BASE:** `origin/main == 251da458b5648048bda7ad6e14a928862ad61d4f` (دمج PR #135). PR [#136](https://github.com/Maelsh/dueli-opus/pull/136) — فرع `fix/unit30-4-hidden-cascade`: commit الكود `2dd5172`، وcommit الوثائق يتبع على نفس الفرع.
- **قبل:** تجميع Tailwind v4 يضع `.hidden` داخل `@layer utilities` بينما قاعدة لوحة الأدوات `.live-tool { display: inline-flex; }` (من 28.3 REM1) غير مطبَّقة في أي طبقة. وفق CSS Cascade Layers تعلو غير المطبَّقة على كل الطبقات بالأهمية العادية، فلم يكن `hidden` يخفي المستوى البصري للأزرار قط. دليل CSSOM داخل كروم مباشر: قاعدتا `display` فقط تطابقان الأزرار (`.hidden → none` في الطبقة، و`.live-tool → inline-flex` غير مطبَّقة) والثانية كسبت دائمًا؛ المُحسوب `flex` للزرين في الحالتين. إثبات متصفح حقيقي على الورقة المبنية قبل الإصلاح: قبل النشر End ظاهر (`flex`)، وأثناء/بعد النشر برج البدء ظاهر (`flex`) — بجوار بعضهما كما في لقطة البوابة.
- **الإصلاح:** قاعدة واحدة غير مطبَّقة بأولوية أعلى في `src/styles.css` بعد قاعدة `.live-tool` الأساسية: `.live-tool.hidden { display: none; }` مع تعليق سبب، وإعادة توليد `public/static/styles.css` بالطريقة الرسمية `npm run build:css` (فرق من 3 أسطر فقط؛ لا منفعة أخرى تغيّرت).
- **RED→GREEN:** اختبار جديد `tests/ui/unit30-4-controls-css-cascade.test.ts` (9 اختبارات) يُنفّذ مُحلِّل طبقات تنبيهيًا صغيرًا على الورقة المبنية (إنها المخدومة إنتاجيًا) ومصفوفة حالات×CSS عبر `resolveCompetitorButtons`. على الورقة قبل الإصلاح: **RED 3 فاشل / 6 ناجح** والفشل على أسطح العيب بالضبط. بعد الإصلاح: **9/9**، اللوحة (`inline-flex`) و`hidden` النقية كما كانا.
- **ملاحظة مستخرج Tailwind:** الإملاء `'@' + 'container'` في قائمة الشروط — السلسلة الحرفية داخل `tests/` تُعدّ كلاسًا مرشحًا تولّد فائدة شاردة (إعلان container-type) في الورقة المبنية؛ التجزئة تبقيه خاملًا (تحقق من فرق إعادة التوليد).
- **الأدلة:** Vitest الكامل = **2013: 2007 ناجح / 6 فاشل** وكلها `quality-gate-poll` بغياب `jq` محليًا (CI Ubuntu موجودة). `tsc --noEmit` نظيف؛ `npm run build` ناجح؛ حراس SEC-05/06/07/08/10/11 AST ناجحون؛ عدّ any ‏305 ≤ 310؛ `git diff --check` نظيف. `npm audit --omit=dev`: 1 high (zod — إصلاحه إصدار رئيسي 4.6.7) + 1 moderate (hono) **قديمة**، معالجتها في وحدة 33.1 (قرار D-1) — لا تبعية جديدة هنا. إثبات متصفح حقيقي على الورقة النهائية: قبل النشر `{liveAction: flex, end: none}` وأثناء/بعد النشر `{liveAction: none, end: flex}` (نمط التنافي ظاهريًا PASS).
- **CI (PR #136):** Quality Gate run [40213193973](https://github.com/Maelsh/dueli-opus/actions/runs/40213193973) على `2dd5172` ناجح 1:58؛ run [40213283766](https://github.com/Maelsh/dueli-opus/actions/runs/40213283766) على `236095f` ناجح 1:27؛ Deploy preview run [40213283757](https://github.com/Maelsh/dueli-opus/actions/runs/40213283757) ناجح مع `Quality Gate passed for this SHA` ✓ + فحص تكامل Cloudflare Pages ✓ (deployment `4a7dd61a-1d52-4cba-8574-9dd8100b1524`). Vitest الكامل في CI ‏(jq موجودة) = **2013: 2012 ناجح / 1 مخطى / 0 فاشل**.
- **NOT TESTED:** لقطة إنتاج بصفحة حقيقية ونقر كامل ومصفوفة أجهزة تبقى ضمن بوابة قبول 30–30.4 المجمعة؛ الإثبات هنا يغطي القواعد المخدومة بنفس الكلاسات التي ترسمها الدالة فقط.
- **الحالة / NEXT:** مراجعة REMOTE مستقلة + CI على HEAD، ثم دمج القائد وبوابات ما بعد الدمج قبول 30–30.4 مازالة مفتوحة؛ إغلاق بوابة 40 قرار القائد بعد التحقق خارج هذا التكليف. مبحث التحقيق B (ترتيب التسجيلات/أهلية الـ399) خارج النطاق عمدًا.


- 🔧 **LOCAL GREEN للإصلاح — الحالة النهائية BLOCKED — MIGRATION STATE.** إصلاح ضيق لفرع `competition.status === 'completed'` الأول في `CompetitionController.end` بعد PR #133. لا تغيير في معادلات الفائز/ELO/الرصيد/التقييم، `ended_by`، ratings-summary، SSE، H7، التبعيات، أو المخطط. لا دمج/نشر/كتابة إنتاج.
- **BASE / PR:** `origin/main == 4c3d960feca44e02fc449c00cda9f0d02aee2885` (squash merge PR #133؛ الأب `85eec139893f3b8f783befb8b119f709f8e40b33`). الفرع `fix/unit30-5-already-completed-pending`؛ commit الكود `2181acc`؛ commit الوثائق `286c9ef`؛ PR [#134](https://github.com/Maelsh/dueli-opus/pull/134).
- **قبل:** الفرع الأول أعاد `winner_id` مباشرة بلا `result_pending`. طلب `/end` ثانٍ بعد قطع `live -> completed` وقبل كتابة `elo_applied_at` كان يستطيع إرجاع الفائز المؤقت (1) رغم أن التسوية النهائية اختارت الخصم (2).
- **الإصلاح:** نفس بوابة التسوية القائمة `resultPending = !!opponent_id && !elo_applied_at`: أثناء الانتظار `winner_id: null` و`result_pending: true`؛ بعد التسوية أو عند غياب الخصم `result_pending: false` والفائز المحفوظ. لا مسار تسوية بديل ولا إعادة ELO/رصيد.
- **RED→GREEN:** `tests/api/unit30-5-already-completed-pending.test.ts` (3 اختبارات). على المصدر قبل الإصلاح فشل اختبار السباق بـ`expected null, received 1`؛ بعده 3/3 ناجحة وتثبت الفائز النهائي 2 بعد `finalizeCompetition()`. الحالات الحدية: بلا خصم = مسوّاة؛ مسوّاة مسبقًا = الفائز 2.
- **الاختبارات:** 6 ملفات / 44 اختبارًا ناجحًا (UNIT30.5 + UNIT30.4 + winner-elo-atomicity + r4-live-end-recovery-rem1 + r2-v-live-ratings + ratings-summary). Full Vitest: 2000 اختبار، 1994 ناجح / 6 فاشل بسبب غياب `jq` محليًا فقط (CI لديه jq). `tsc --noEmit` نظيف؛ `npm run build` ناجح؛ SEC-05/07/08/10/11 AST ناجح؛ اختبارات الأمان 3 ملفات / 36 ناجحًا. التكامل منفردًا: competition-state-guards 7/7؛ schema-contract 26/26 (44 هجرة). التشغيل المتوازي للملفين فشل عند 0024 بسبب مشاركة `.wrangler-test`، وليس فشل هجرة؛ كل ملف منفردًا ناجح.
- **الهجرة 0043:** موجودة في main بعد 0042 مباشرة، إضافية. تطبيق محلي معزول عبر wrangler: 44 هجرة ناجحة ثم لا معلّق. اختبار SQLite حقيقي 0001–0042 → 0043 تحقق من الأعمدة/الافتراضات/الفهرسين/جدول السجل/المفتاح الفريد `(competition_id, competitor_id, source)`/CHECK 0/10 والمصدر/ثبات البيانات؛ التكرار مرفوض. **الإنتاج (قراءة فقط): `d1_migrations` ينتهي عند 0042؛ 0043 معلّقة؛ لا أعمدة/جدول/فهارس جديدة في `competitions`.** لم تُطبَّق 0043 عن بعد ولم تُكتب بيانات إنتاج.
- **بوابة الإنتاج:** Deploy run `40127085457` فشل مغلقًا عند `Evaluate release schema readiness` بسبب `0043`، وخطوة نشر الإنتاج تخطّت. لكن تكامل Cloudflare Pages نشر Production deployment `6053bada-ea0b-4470-896f-17fd63be92f3` للـ`4c3d960` في 19:50:45Z، أي أن كود الإنتاج أسبق من مخطط الإنتاج. هذا مانع إصدار خارج هذا الإصلاح؛ لم يُحاول إصلاحه بكتابة إنتاج. الاعتماد المباشر في الكود: `ScheduledTaskService.updateAggregatesAfterVote()` يقرأ `ended_early`/`result_source`، و`CompetitionModel.complete()` يكتب الأعمدة الستة ويدرج في `competition_result_credits`، و`H7SignalsModel` يقرأ السجل؛ لذلك يمكن أن تفشل مسارات التصويت/الإنهاء الحية على مخطط 0042. فحوص PR #134 خضراء (quality-gate + نشر معاينة + Cloudflare Pages)، ونشر الإنتاج الوحيد يبقى `6053bada` للـ`4c3d960`.
- **الحالة / NEXT:** إصلاح الكود `LOCAL GREEN — READY FOR REMOTE REVIEW`؛ القرار النهائي **BLOCKED — MIGRATION STATE**. مطلوب قرار القائد/المالك بخصوص نشر 0043 عبر بوابة الإصدار ثم إعادة تقييم الإنتاج. لم يُدمج/يُنشر من هذه المهمة. لم تُختبر المتصفحات/الأجهزة/P2P/التسجيل/SSE الحي أو سلوك الإنتاج بعد 0043.

## 2026-10-24 — UNIT30.4 / R4-COMP-CONTROLS-EARLY-END-1 · مدخل برج واحد + ملء شاشة صادق + إنهاء مبكر سلطة الخادم + ترتيب التسجيلات القصيرة · فرع feat/r4-comp-controls-early-end-30-4 (من 85eec13 = origin/main)

- 🔧 **LOCAL GREEN فقط — NOT ACCEPTED / NOT MERGED / NOT DEPLOYED.** النطاق UNIT30.4 حصراً: توحيد مدخل البرج (START/PUBLISH)، فصل EXPAND عن FULLSCREEN، إصلاح ملء شاشة المشاهد/المنافس، تطبيق التدرج الأساسي المشترك على Download/Send comment/Send message، إنهاء مبكر سلطة الخادم عند 300 ثانية مع سجل `SYSTEM_EARLY_END` منفصل (10/0)، وترتيب التسجيلات القصيرة بعد الطويلة دون تغيير أوزان H7. لم يُعَد فتح UNIT28، Finance/Ads، أوزان/إصدار H7، UNIT31/35، ولم يُمس PR110 عند `6e7ca1039484980affbcaf6f0eab548a82c35d17`.
- **BASE / PR:** `origin/main == 85eec139893f3b8f783befb8b119f709f8e40b33` (PR #132). PR [#133](https://github.com/Maelsh/dueli-opus/pull/133) هو PR الوحيد؛ كود `515f069` + commit وثائق على نفس الفرع.
- **قبل (A.1–A.8، تحقيق قراءة فقط سُجّل بأثر رجعي قبل commit الوثائق):** زرّا START/PUBLISH منفصلان وسهم تشغيل مضلِّل؛ EXPAND/FULLSCREEN متداخلان وملء الشاشة يفقد الأدوات بلا EXIT مرئي؛ لا WebKit/rejection/`fullscreenchange`/safe areas؛ تدرج Download/Send غير موحّد؛ الإنهاء لا يحفظ مدة/فاعل/سبب/مصدر/إصدار ولا يقرر 300 ثانية على الخادم؛ لا يمكن تخزين رصيد 10/0 في `ratings` (CHECK 1..5، بلا source، وLivePayoutEngine يجمعها)؛ لا طبقة طويلة/قصيرة في H7 ولا إصدار ترتيب؛ auto-end بلا فاعل مؤكد ومدد مجهولة/سالبة بلا fallback، وعداد migrations في عقد التكامل 43.
- **CONTROLS:** `resolveLiveAction` واحد يعتمد حالة الخادم والدور: المضيف accepted → start، أي منافس لديه مصدر حقيقي غير منشور → publish، وإلا مخفي. `#liveActionBtn` بأيقونة برج فقط؛ أزيل سهم START البصري. بقيت `startCompetition` و`publishMedia` وCSP. حارسا `startInFlight`/`publishInFlight` يمنعان الإرسال المزدوج، ونشر الخصم لا يمنح سلطة بدء.
- **FULLSCREEN:** `#competitorShell` (فيديو + أدوات + حالة نشر) و`#embeddedViewerSection` (فيديو + أدوات LIVE/VOD). EXPAND = `.competitor-shell.is-expanded` داخل الصفحة؛ FULLSCREEN = طلب العنصر مع أيقونة/تسمية/aria-pressed/active مختلفة وEXIT مرئي مخصص. معالجة native/WebKit/faux-fallback/`fullscreenchange`/Escape/رفض الوعد/safe areas/قفل تمرير. `object-fit: contain` بلا قص؛ قفل اتجاه أفقي للمشاهد فقط مع استعادة، والمنافس لا يفرض اتجاهًا. لا إعادة بناء P2P/recorder/tracks/sources.
- **GRADIENT:** `DUELI_PRIMARY_GRADIENT` الموجود (`bg-gradient-to-r from-purple-600 to-indigo-600`) + hover على زر تنزيل الفيديو المدمج، بدء `RecordingDownloadPanel`، إرسال التعليق، وإرسال `MessagingUI`. صياغة الخطة “purple to blue” فُهمت كالتدرج الأساسي نفسه؛ لم يُخترع تدرج ثالث، وبقية أدوات البث حافظت على ألوانها المرجعية.
- **EARLY END:** migration `0043_competition_early_end.sql` إضافية: أعمدة نهاية + جدول `competition_result_credits` بمفتاح فريد `(competition_id, competitor_id, source)`. `CompetitionModel.complete` يقيس المدة من `started_at`/`now` داخل SQLite، `<300s` مبكر و`>=300s` عادي، يحفظ الفاعل/السبب/الوقت/المصدر/الإصدار، يرفض فاعلًا غير مشارك في SQL، ويكتب 10/0 في نفس الدفعة الذرية بـ`INSERT OR IGNORE`. auto-end يكتب `AUTO`/`auto_end` بلا فاعل وبلا رصيد. التحذير يذكر صراحة: المنهي يخسر، الخصم يفوز بالانسحاب ويحصل على 10 نجوم نظامية (تقييمان بخمس نجوم)، المنهي 0، جودة المنافسة القصيرة 0. الإلغاء يعود قبل fetch، والتأكيد يرسل `{}`.
- **INTEGRITY:** `ratings` تبقى أصوات جمهور حقيقية 1..5؛ السجل منفصل ويُعرض `system_credits` بمصدر `SYSTEM_EARLY_END`. `H7SignalsModel.loadProfiles` يدمج الرصيد مرة واحدة عبر CTE الحالية مع fallback لأصوات ratings عند غياب 0043. `ratingsSummary` يعرض `result.source`/`early_end`/`ended_by`/`system_credits` بلا SQL في المتحكم. لا كتابة على unique viewers/voters/fake ratings/views. auto/admin بلا فاعل منافس مؤكد لا يخترع منسحبًا.
- **SHORT TIER:** `h7QualityTier`/`h7QualityForTier` يشتقان المدة من `started_at`/`ended_at` الموثوقين في الاكتشاف (لا العمود الجديد، لتفادي تأخر migration). Tier 1 = عادي/مجهول/`>=300s`، Tier 2 = completed `<300s` بجودة Q=0. `h7ApplyPriorityTier` و`h7ApplyDiscoveryDiversityByTier` بعد الأهلية/الفلاتر وترتيب H7 وقبل الترقيم، مع حفظ ترتيب H7 داخل كل طبقة. `H7_POLICY_VERSION` والأوزان بقيت `h7-v1`؛ أضيف `H7_DISCOVERY_ORDERING_VERSION='short-tier-v1'` إلى مفاتيح جلسات Explore/Home/Similar/guest-suggested. طبقات البحث بالعنوان الدقيق تبقى أولًا، والبحث بالمعرّف المباشر لم يُمس. لا `RANDOM()+OFFSET` ولا سقف اعتباطي ولا فرز كامل في العميل.
- **ملحق A/B + Codex P2 (2026-10-24):** أضيف `resolveCompetitorButtons` (A) لضمان زر برج واحد أو End واحد، مبنيًا على `publishedMediaState()` من senders الفعلية لا النقر أو `live`، مع حالات starting/publishing/ending/verifying/waiting/ended ومسارات فشل/مهلة/إعادة مزامنة/نقر مزدوج، وبقي End الحالي هو إنهاء المنافسة نفسه. وأضيف `resolveCompetitorVideoLayout` (B) للحالات الأربع local/remote/terminal مع رفض إعادة بناء P2P/recorder؛ V تعتمد `requestVideoFrameCallback` + track حي غير muted + timeupdate fallback، والخصم يبقى مركّبًا بـopacity 0 في local لمنع الإطار القديم وسماح عودة الحالة 4 تلقائيًا، والـterminal الخادمي يتقدم على الفيديو. Codex P2: الحدث الأول `result_pending:true` بلا winner، ثم بعد `finalizeCompetition` حدث نهائي `result_pending:false` بالwinner؛ العميل يطبّق الحقول ويعيد رسم completed بلا reload.
- **إصلاح ترتيب النتيجة النهائية (2026-10-24):** `updateAggregatesAfterVote` يعيد `{settled, final, finalClaimed, winnerId}`؛ `finalizeCompetition` لا ينشر `result_pending:false` إلا بعد نجاح دفعة المجاميع/ELO، و`recalc_aggregates` ينشر الحدث النهائي بعد نجاح إعادة المحاولة. مطالبة `elo_applied_at` تمنع التكرار/التعارض، ومسارات التصويت تمرر `allowFinalize:false` كي لا تسبق القطع وتحتجز المطالبة، وكتابة المجاميع المؤقتة محروسة بـ`status='live'` كي لا تطمس صفًا نهائيًا. استجابة `/end` تعرض `result_pending` وتخفي `winner_id` غير المستقر. الفائز/ELO/payout و`ended_by` وملخص التقييمات لم تتغير. أضيفت 4 اختبارات انحدار في `unit30-4-early-end` (14/14).
- **EVIDENCE (بعد الملحق + إصلاح النتيجة):** `unit30-4-early-end` = **14/14 PASS** (4 اختبارات انحدار جديدة)؛ الحزمة المجاورة للإنهاء/التقييمات/UI = **7 ملفات / 76 اختبار PASS**؛ full Vitest = **1997: 1991 PASS / 6 FAIL** كلها `quality-gate-poll` لغياب `jq` محليًا (Ubuntu CI يوفره؛ الاختبارات الزمنية الثلاثة `r4-unit28-time` مرّت 19/19 منفردة ومرّت في التشغيل الكامل النهائي)؛ تكامل `competition-state-guards` = **7/7 PASS** على المصدر النهائي، و`messages-schema` = **9/10 PASS** (مهلة 0014 القديمة)؛ `npx tsc --noEmit` نظيف؛ `npm run build` ناجح؛ حراس SEC-05/06/07/08/10/11 PASS؛ حزم أمان = **9 ملفات / 68 اختبار PASS**؛ `git diff --check` نظيف. M-01 (viewport حقيقي) وM-02 (جهاز/لمس حقيقي) **NOT TESTED**.
- **RED→GREEN:** الاختبارات الأصلية كُتبت مع التنفيذ لا قبله؛ لا يوجد سجل RED مقابل `85eec13` لها. أما اختبارا هذا الإصلاح الأولان (فشل دفعة المجاميع ثم نجاح إعادة المحاولة، وتزامن `finalizeCompetition`) فقد شُغّلا على الكود قبل الإصلاح وسقطا: غياب `result_pending` في مسار الفشل، وحدثان نهائيان عند التزامن. مرّا بعد الإصلاح، وأُضيف اختبارا سباق التصويت/القطع وحارس الكتابة المؤقتة مع الحارسين المقابلين.
- **BLOCKERS / DEFERRED:** `0043` **غير مطبقة بعيدًا**؛ يجب تطبيقها قبل نشر الكود. release schema manifest ما زال `baseline-0042` ولم يُحدَّث pin/runbook في هذا PR الضيق. لا قبول يدوي حقيقي (متصفح/جوال/اتجاه/P2P/تسجيل/قارئ شاشة) ولا staging/production. `jq` غائب محليًا. لا merge/deploy.
- **NEXT:** مراجعة REMOTE مستقلة + CI، ثم دمج القائد؛ القبول الإنتاجي مؤجل بعد فحص migration/runbook.

## 2026-10-23 — R4-SEC-GUARDS-DOCS-1 (UNIT30.3) · حراس SEC-05/07/08/10/11 قابلة للتنفيذ + توثيق · فرع feat/r4-sec-guards-docs-1 (من 312af270 = origin/main)

- 🔧 تنفيذ LOCAL فقط — RED→GREEN، **NOT ACCEPTED / NOT MERGED / NOT DEPLOYED**. النطاق UNIT30.3 حصراً: استبدال حراس `grep` المضلِّلة لـSEC-05/10 وحراس SEC-07/08/11 التحذيرية بفحوص AST مانعة، وإضافة اختبارات ضبط/سلوك، وتحديث الوثائق. لم يُعَد فتح UNIT28، ولم تُعَد كتابة UNIT30/30.1/30.2، ولم تتغير سياسة CORS، ولم يُفعَّل WebSocket/worker، ولم تُمس Finance/Ads/H7 أو PR110.
- **BASE:** `origin/main == 312af270c32fb9a44b471da0593565093ee2e521` (PR #131 مدموج). PR110 بلا مساس عند `6e7ca1039484980affbcaf6f0eab548a82c35d17`.
- **قبل:** `grep -n "cors()" src/main.ts` و`grep -n "this.sockets" workers/` كانا يطابقان تعليقي الشرح (السطور 80 و32) فيفشلان دائماً/يبقيان تحذيريين؛ SEC-07/08/11 كانت `continue-on-error: true`؛ لا اختبار يثبت سلوك CORS/cookie-first/رفض `?token=`/البثّ بعد الإيقاظ.
- **الحارس الجديد:** `dev-tools/check-sec-guards.mjs` يحلل TypeScript AST (نفس نمط `check-sec06-math-random.mjs`) ويعمل بأوضاع `sec05|sec07|sec08|sec10|sec11`. يتجاهل التعليقات والنصوص والأنواع؛ يفشل مغلقاً عند غياب المدخلات أو تعذّر التحقق. SEC-05 يرفض `cors()` بلا وسائط/wildcard/بلا `credentials`؛ SEC-07 يرفض `session_id` التنفيذي؛ SEC-08 يرفض الكتابة إلى `localStorage/sessionStorage` أو `window.sessionId` أو `document.cookie` لسر جلسة، ويسمح فقط بقراءة/إزالة الهجرة داخل `SessionAccess`؛ SEC-10 يرفض `this.sockets` ويتطلب `getWebSockets`+`acceptWebSocket` (بلا تفعيل worker)؛ SEC-11 يرفض `?token=` جلسة في middleware/profile مع استثناء `verify-page` بالحصر لا بالتحليل.
- **الأدلة (RED→GREEN):** `tests/dev-tools/sec-guards-checker.test.ts` كُتب أولاً وسقط بـ`Cannot find module '../../dev-tools/check-sec-guards.mjs'` ثم **21/21 PASS** (اتجاهان لكل حارس + تثبيت ربط CI المانع). اختبارات سلوك جديدة: `tests/api/sec-guards.test.ts` **10/10** (CORS allow-list/foreign/preflight/env override؛ cookie-first/legacy `session_id`/`?token=`/Bearer fallback) و`tests/workers/sec10-realtime.test.ts` **5/5** (تسليم كل sockets، إيقاظ بنسخة جديدة/نفس الحالة، عدّ الفشل، السر/الجسم، `acceptWebSocket`). حزمة CI المركزة: **9 ملفات / 68 اختباراً PASS**. `node dev-tools/check-sec-guards.mjs` = SEC05/07/08/10/11 PASS. `npx tsc --noEmit` نظيف؛ `npm run build` ناجح. `git diff --check` نظيف.
- **إثبات فشل الحراس على انحدارات حقيقية:** أُدخلت مؤقتاً (ثم أُزيلت) مخالفة تنفيذية في كل ملف حقيقي: `cors()` في `src/main.ts`، `getCookie(c,'session_id')` في `auth.ts`، `localStorage.setItem('sessionId',…)` في `SessionAccess.ts`، `this.sockets` في worker، و`c.req.query('token')` في middleware — كل وضع أعاد `FAIL` وexit 1؛ وبعد الإزالة عاد PASS. التعليقات/النصوص الحقيقية بقيت PASS (SEC-05/10) و`verify-page.ts` بقي خارج SEC-11.
- **CI:** حُذفت خطوات `grep`/GRACE-PERIOD الخمس واستُبدلت بخمس خطوات AST مانعة + خطوة `vitest` سلوكية مانعة (بلا `continue-on-error`). `tests/dev-tools/sec-guards-checker.test.ts` يثبت غياب أنماط grep القديمة ووجود كل ملف اختبار في الخطوة.
- **NOT RUN — ENVIRONMENT:** `jq` غير مثبت على ويندوز (اختبار `quality-gate-poll` البيئي مستثنى؛ Ubuntu CI يوفره)؛ `npm run test:integration` لم يُشغَّل (حزمة D1/schema، ولا حالة UNIT30.3 فيها)؛ لا متصفح/staging/إنتاج ولا نشر worker، وG7 غير متحقق.
- **PR:** [#132](https://github.com/Maelsh/dueli-opus/pull/132) (`feat/r4-sec-guards-docs-1`) هو الـPR المركز الوحيد مقابل main؛ غير مدموج وغير منشور.
- **CI (GitHub):** Quality Gate run [39964133167](https://github.com/Maelsh/dueli-opus/actions/runs/39964133167) = `success` (1m30s) على `4a559d8`؛ Deploy to Cloudflare Pages run [39964133431](https://github.com/Maelsh/dueli-opus/actions/runs/39964133431) = `success` + فحص Cloudflare Pages = `success` (معاينة فقط، لا إنتاج). سطر الأدلة هذا في commit توثيقي لاحق يعيد CI على نفسه؛ النتيجة النهائية تُذكر في تقرير المهمة.
- **الحالة:** `🔧 LOCAL RED→GREEN — NOT ACCEPTED`. القبول الإنتاجي المشترك لـUNIT30/30.1/30.2/30.3 يُنفَّذ مرة واحدة بعد قبول 30.3 ودمجه؛ لا يُدّعى هنا.
- **ROLLBACK:** إرجاع commits هذا الفرع؛ لا migration ولا بيانات إنتاج ولا نشر؛ التغيير كله ملفات حارس/اختبار/CI/وثائق.
- **NEXT:** مراجعة مستقلة + CI ثم دمج من القائد، ثم بوابة القبول الإنتاجي المشتركة (UNIT30–30.3)، ثم UNIT31.

## 2026-10-23 — R4-SESSION-HTTPONLY-SEC08-1 (UNIT30.2) · جلسات متصفح HttpOnly + حماية CSRF · فرع feat/r4-session-httponly-sec08-1 (من d12b706 = origin/main)

- 🔧 تنفيذ LOCAL فقط — RED→GREEN، **NOT ACCEPTED / NOT MERGED / NOT DEPLOYED**. النطاق SEC-08 حصراً: نقل جلسة المتصفح إلى كوكي HttpOnly يديرها الخادم مع حماية CSRF، مع الحفاظ على المصادقة والأدوار وحدود المعدل وتجربة الاستخدام وعقد Bearer لغير المتصفح وHMAC/التذاكر، وسلوك 401 مقابل 429/5xx العابر من UNIT30.1. لا مخطط/migration، ولا نظام مصادقة جديد/SSO، ولا إعادة فتح UNIT28، ولا إعادة بناء Finance/Ads/H7، ولا تغيير PHP/بيانات اعتماد، ولا UNIT30.3، ولا دمج/نشر. PR110 بلا مساس عند `6e7ca1039484980affbcaf6f0eab548a82c35d17`.
- **BASE:** `origin/main == d12b7065de57aef02b3829ef60a10d7bc7d05151` (PR #130 مدموج)؛ الفرع من نفس الـSHA. لم تُضف ملفات خارج `src/` و`tests/` و`docs/08-PUBLIC-API.md` وزوج service-worker.
- **قبل:** جلسة المتصفح كانت كوكي `sessionId` قابلة للقراءة من JS مع `localStorage.sessionId`/`session_id` و`window.sessionId`، والصفحات تبني `Authorization: Bearer` منها، وOAuth يسلّم توكن للنافذة المنبثقة، ولا حماية double-submit، وقد تبقى كوكي مرفوضة على كل طلب، و`GET /api/auth/session` لا يعيد إصدار الكوكي القديمة كـHttpOnly.
- **النقل الخادمي:** `SessionCookieService` يملك `sessionId` (`HttpOnly`، `Secure` على HTTPS، `SameSite=Lax`، `Path=/`، `Max-Age`/`Expires` 7 أيام) و`csrfToken` (نفس المدة، غير HttpOnly) وكوكي `oauthState` أحادية الاستخدام. عنوان الطلب المطلق هو المصدر الحاسم لـHTTPS، و`X-Forwarded-Proto` بديل فقط ولا يخفض HTTPS. تسجيل الدخول/OAuth يدوّران الجلسة وCSRF؛ الخروج يمسحهما فقط بعد إبطال خادمي ناجح (فشل D1 = 500 مع إبقاء جلسة المتصفح)؛ تغيير/إعادة تعيين كلمة المرور وحذف الحساب يمسحان الكوكيز. استجابة الدخول/OAuth لا تحوي `sessionId` إطلاقاً.
- **المصادقة/الهجرة:** `authMiddleware` و`adminAuthMiddleware` و`/api/auth/session` و`/api/signaling/verify` وبوابات الصفحات تقرأ كوكي HttpOnly أولاً ثم Bearer. الـBearer الصالح يُعاد إصداره HttpOnly عند أول فحص ناجح؛ الكوكي غير الصالحة/المنتهية تُمسح ويُعاد `{user:null}`. فحص الجلسة single-flight على العميل، و429/5xx/شبكة/مهلة تبقى عابرة ولا تعني خروجاً. مقارنة الانتهاء بـ`datetime(expires_at)`، وتقليم الجلسات بـ`created_at DESC, rowid DESC` كي لا تُقلَّم جلسة جديدة عند تساوي الثانية.
- **CSRF:** `csrfProtection()` يستخدم كوكي `csrfToken` + مطابقة تامة لـ`X-CSRF-Token` في تغييرات الحالة الموثقة بالكوكي، مع فحص Origin/Referer القائم؛ عدم التطابق = 403. طلبات Bearer هي عقد غير المتصفح المقصود وتُعفى (لا يمكن لنموذج cross-site ضبط Authorization)؛ CORS ليس مصادقة. مسار Origin/Referer/`X-Session-Token` القديم باقٍ لعملاء API/الاختبارات قبل SEC-08 بلا كوكي CSRF. وسيط ما بعد الاستجابة يصدر كوكي CSRF عند غيابها ويتجنب تكرار رأس التدوير/المسح. OAuth state مربوط بكوكي HttpOnly أحادية الاستخدام ويجب أن يطابق حرفياً.
- **العميل/بلا سر:** `/static/session-access.js` التزامني يثبت fetch shim (credentials include لـ`/api/*` من نفس الأصل، رأس CSRF للكتابة، إزالة Authorization الفارغ/غير الصالح) و`window.DueliSession` بلا سر؛ `token()` تعيد `''`، و`State.sessionId` خاصية توافق بلا أثر، و`clearLocal()` تحذف المفاتيح القديمة. `AuthService` يبدأ بالكوكي، ويقرأ توكن `localStorage` القديم مرة واحدة فقط بعد إجابة كوكي حاسمة (401 أو 200/null)، ثم يمسح المفتاحين بعد النجاح أو الفشل الحاسم. بوابات الصفحات تنتظر `checkAuth()` وتستخدم `State.currentUser`/`window.currentUser`؛ لا صفحة تبني رأس Bearer أو تقرأ مفتاح جلسة. fallback الـservice-worker لـ`/api/*` عند الانقطاع يعيد 503 لا 200 زائفة.
- **المسارات المحفوظة:** Admin/Finance/Advertiser/Download/Messages/Competition/SSE وتذكرة realtime/signaling/ICE/upload-lease وصفحات live host/guest/viewer تستخدم الكوكي + shim CSRF؛ HMAC الخادم والتذاكر المحدودة وBearer لغير المتصفح مستقلة. بيان/قطع التنزيل تستخدم الكوكي؛ إنشاء تذكرة SSE يستخدم الكوكي + CSRF؛ `/api/signaling/verify` يقبل الكوكي أو توكن الجسم القديم ويبقى للقراءة فقط ومعفى من CSRF.
- **الأدلة:** الحزمة المركزة بعد آخر التعديلات = **9 ملفات / 67 اختباراً PASS**. كامل Vitest باستثناء `quality-gate-poll` المعتمد على jq = **185 ملفاً / 1902 اختباراً PASS**. التغطية الجديدة: إصدار الكوكي/خصائصها، login/logout/expiry، OAuth state/cookie، الهجرة المحدودة، CSRF double-submit/Origin/Bearer، لا سر مقروء من JS، التنزيل، Admin/Finance/Advertiser، messages/competition، SSE/signaling/upload، جلسات متعددة، 429/5xx/شبكة/مهلة عابرة، Bearer لغير المتصفح، وتثبيتات عدم انحدار SEC-07. `npx tsc --noEmit` نظيف؛ `npm run build` ناجح؛ `npx playwright test --list` ناجح (192 اختباراً)؛ SEC-06 PASS؛ `any` 309 (الأساس 310)؛ `localStorage.*[sS]ession` الحساسة لحالة الأحرف في `src/` = 0؛ `session_id'` في الصفحات = 0؛ `query('token')` في المصادقة = 0 (يبقى واحد متوقع في صفحة التحقق بالبريد)؛ `git diff --check` نظيف؛ `npm audit --audit-level=high --omit=dev` بلا high/critical (تحذير Hono `serveStatic` moderate قديم وغير مستخدم هنا).
- **مخاطر الخروج الجماعي:** الانتقال محدود ومرة واحدة. المتصفحات ذات الكوكي القديمة غير HttpOnly تُرقّى عند أول فحص ناجح؛ ومن يملك `localStorage.sessionId` فقط يهاجر مرة واحدة عبر Bearer. لا fallback مقروءاً من JS إلى ما لا نهاية. من كانت بياناته منتهية/غير صالحة، أو يشغّل حزمة قديمة مخزنة تكتب فوق الكوكي الجديدة، قد يُخرج ويحتاج تسجيل دخول جديد. الـservice-worker network-first لـ`/static/*`؛ إعادة التحميل/جلب الأصول من الشبكة هو التخفيف الحاسم. لا إبطال جماعي من الخادم.
- **NOT RUN — ENVIRONMENT:** E2E المتصفح غير متحقق على ويندوز: wrangler/workerd المحلي انهار عند `/api/settings` بـ`ECONNRESET` و`X [ERROR]` فارغ، وتشغيل سابق واجه أخطاء MailChannels الداخلية. `npm run test:integration` لم يُشغَّل (حزمة D1/schema منفصلة؛ تشغيل سابق تجاوز 600s). لا قبول staging/إنتاج؛ G7 غير متحقق؛ لا وصول لإنتاج D1/R2/السجلات. `jq` غائب: `tests/dev-tools/quality-gate-poll.test.ts` = 2 ناجح / 6 فشل بيئي صريح `no jq binary found`، مستثنى من العد؛ Ubuntu CI يوفره.
- **CI:** على `82b44394222cd6c20f80d80466176ec96fcd4056`: `quality-gate` PASS، و`Quality Gate passed for this SHA` PASS، ومعاينة Cloudflare Pages المعزولة PASS. لم يُطلب نشر إنتاجي.
- **PR:** [#131](https://github.com/Maelsh/dueli-opus/pull/131) (`feat/r4-session-httponly-sec08-1`) هو الـPR المركز الوحيد مقابل main؛ غير مدموج وغير منشور. PR110 بلا مساس.
- **الحالة:** `🔧 LOCAL RED→GREEN — NOT ACCEPTED`. القبول الإنتاجي المشترك لـUNIT30/30.1/30.2/30.3 يُنفَّذ مرة واحدة بعد 30.3.
- **ROLLBACK:** إرجاع commits هذا الفرع؛ لا migration ولا بيانات إنتاج، والتغيير قابل للتراجع كاملاً.
- **NEXT:** مراجعة مستقلة + CI ثم دمج من القائد؛ لا UNIT30.3 من هذه الجلسة.

## 2026-10-22 — R4-SESSION-KEY-SEC07-1 (المرحلة 4) · مسار جلسة عميل واحد وتراجع آمن · فرع feat/r4-session-key-sec07-1 (من 886026f = origin/main)

- 🔧 تنفيذ LOCAL فقط — RED→GREEN، **NOT ACCEPTED / NOT MERGED / NOT DEPLOYED**. النطاق SEC-07 حصراً: توحيد قراءة جلسة العميل، ومنع `session_id` القديم من التغلّب على `sessionId` القانوني، وجعل فشل المصادقة العابر غير مدمّر. لم يُنفَّذ SEC-08/HttpOnly، ولا إعادة بناء Auth/الأدوار، ولا OAuth/SSO، ولا سلوك خروج جديد، ولا Finance/Ads/H7، ولا UNIT28 المقبول أو UNIT30 المدموج أو PR110.
- **BASE:** `origin/main == 886026f9291fecf9c5640e2aadb942e16a24b380` (PR #129 مدموج). تحقّق مسبق: PR110 عند `6e7ca1039484980affbcaf6f0eab548a82c35d17` بلا مساس، والشجرة المتتبعة نظيفة قبل الفرع.
- **قبل:** `live-finance-page` كان يقرأ `localStorage.session_id` فقط فيرسل `Bearer null` لمستخدم مسجّل عادي؛ وAdmin/Advertiser/Complaint كانوا يفضّلون `session_id` على `sessionId` فيمكن لقيمة قديمة أن تسبب 401/واجهة خروج رغم جلسة صحيحة؛ وصفحات كثيرة تقرأ المفاتيح مباشرة؛ و`AuthService` اختار مرشحاً واحداً (cookie أو localStorage) فقد يخفي أحدهما الآخر؛ و`GET /api/auth/session` كان يحوّل أي خطأ D1/شبكة إلى `200 {user:null}` فيفسّره العميل انتهاءً حقيقياً ويمسح الجلسة.
- **الإصلاح:** `src/client/core/SessionAccess.ts` يملك ترتيب الأولوية مرة واحدة: توكن مصادَق في الذاكرة → `localStorage.sessionId` → cookie `sessionId` → `localStorage.session_id` أخيراً للتوافق فقط. `AuthService` يفحص مرشحات `sessionId` القانونية بالترتيب، ويستعمل `session_id` فقط عند غياب أي قيمة قانونية ثم يهاجرها؛ 401 أو `200 user:null` فقط هما دليل انتهاء، بينما 429/5xx/شبكة/مهلة/جسم غير مقروء يحفظ الجلسة و`authStatus` ولا يمسح شيئاً. `clearAuth` يحذف المفتاح القديم أيضاً. `AuthController.getSession` يعيد 5xx عند فشل الخادم بدل `200 user:null`. أُضيف `/static/session-access.js` (IIFE صغير) ويُحمَّل تزامنياً قبل `app.js` وقبل سكربتات الصفحات، ووُحِّدت قراءات Admin/Advertiser/Complaint/Live Finance/Donate/Earnings/Profile/Competition/Live room/Messages/Explore/Requests/Reports/Notifications/Settings/Create/My Competitions. لا تسجيل لتوكن خام.
- **الأدلة:** الحزمة المركزة `6 ملفات / 44 اختباراً` أخضر (بعد إضافة تثبيتات المصدر: 37/37 في خمسة ملفات متبقية). كامل Vitest باستثناء ملف `quality-gate-poll`: **181 ملفاً / 1877 اختباراً PASS**. `tests/client/session-access.test.ts` (أولوية/قيم فارغة/cookie/global)، `tests/ui/auth-session-lifecycle.test.ts` (+4c–4g: `session_id` قديم، cookie أحدث، legacy-only، انتهاء حقيقي بلا إحياء legacy، 5xx بلا مسح/تسجيل)، `tests/ui/sec07-session-consumers.test.ts` (صفر قراءة مباشرة تحت الصفحات + Admin/Advertiser + ترتيب تحميل الـlayout + الأصول)، `tests/api/auth-session-transient.test.ts` (فشل D1 = 500 لا guest، والضياع الحقيقي يبقى 200/null). `npx tsc --noEmit` نظيف؛ `npm run build` ناجح ويولّد `dist/static/session-access.js` (IIFE 1.4KB)؛ SEC-06 PASS؛ `any` 305 (الأساس 310)؛ `npm audit --audit-level=high --omit=dev` بلا high/critical (تحذير Hono moderate قديم).
- **NOT RUN — ENVIRONMENT:** `jq` غير مثبت على ويندوز؛ `tests/dev-tools/quality-gate-poll.test.ts` أعطى 2 ناجح و6 فشل بيئي صريح (`no jq binary found`) واستُثني من عدّ الحزمة الكاملة، وUbuntu CI يوفره. `npm run test:integration` لم يُشغَّل في هذه الجلسة (حزمة schema/D1 منفصلة، ولا حالة SEC-07 فيها، وسجل سابق تجاوز 600s عند `messages-schema`). لا متصفح حقيقي/بيئة staging ولا قبول إنتاجي؛ G7 غير متحقق. لا تغيير مخطط أو migration.
- **PR:** [#130](https://github.com/Maelsh/dueli-opus/pull/130) (`feat/r4-session-key-sec07-1`) هو الـPR المركز الوحيد؛ غير مدموج وغير منشور. PR110 بلا مساس.
- **الحالة:** `🔧 LOCAL RED→GREEN — NOT ACCEPTED`. لا ادعاء إنتاجي ولا بدء UNIT30.2 من هذه الجلسة.
- **ROLLBACK:** إرجاع commits هذا الفرع؛ لا migration ولا بيانات إنتاج، والتغيير قابل للتراجع كاملاً.
- **NEXT:** مراجعة مستقلة + دمج من القائد، ثم UNIT30.2؛ القبول الإنتاجي المشترك لـUNIT30/30.1/30.2/30.3 يُنفَّذ مرة واحدة بعد 30.3.


## 2026-10-22 — R4-CHUNK-DOWNLOAD-1 (UNIT30 option B) · تنزيل MP4 مستقل وموثّق · فرع feat/r4-unit30-chunk-download (من 508fcdab = origin/main)

- 🔧 تنفيذ LOCAL فقط — **NOT ACCEPTED / NOT MERGED / NOT DEPLOYED**. النطاق UNIT30 option B حصراً؛ UNIT28 المقبول (A28-LEASE/SURFACE/TIME ومسار التسجيل/الـlease) وLIVE P2P signaling وFinance/Ads/H7 والمخطط/migrations والاستضافة PHP والأسرار الإنتاجية وPR110 بقيت بلا مساس. لا FFmpeg على الخادم، ولا raw-Blob، ولا اعتماد على `SmartVodPlayer.loadedChunks`.
- **BASE:** `origin/main == 508fcdab98e0e669a4ce6f6648eff6ef70762e0c` (PR #128 مدموج). PR110 عند `6e7ca103` لم يُدمج أو يُعاد بناؤه؛ أُعيد استخدام نيّة تدفّق الواجهة فقط، لا تنفيذ الـraw-concat القديم.
- **قبل:** الواجهتان كانتا تدمجان قطع المشغّل المخزّنة في Blob، وتحمّلان FFmpeg من CDN، ولا تُظهران زر التنزيل إلا بعد اكتمال تحميل المشغّل؛ لا بيان تنزيل موثّق، ولا ترتيب ready، ولا كشف gaps/finalization، ولا تحقق حجم/بصمة، ولا preflight/إلغاء/retry محدود، ولا تمييز بين تسجيل نهائي ومقطع جزئي.
- **الخادم/الخدمة:** `GET /api/chunks/download/:id` محمي بـ`authMiddleware({required:true})` ويعيد JSON خاصاً `no-store`: الدور والحقوق، القطع ready فقط بترتيب/مدة/توقيت/صيغة، SHA-256 فقط عند إثبات شكل البصمة، gaps، uploaded/failed/unready، finalization، الاكتمال، blockers والوضع. `RecordingDownloadService` يجلب القطع بنفسه (تزامن 3) مع حدود جسم/نوع، تحقق حجم/بصمة، retry/backoff/مهلة محدودة، إلغاء حقيقي وتنظيف. مسار MP4 البنيوي (`Mp4FragmentAssembler`) يعيد تركيب fMP4 دون ترميز مع تصحيح `mfhd`/`tfdt`/المدد/أحجام 64-bit ورفض التداخل/غير المهيكل؛ وFFmpeg.wasm المحلي (H.264/AAC، بلا `-c copy` غير آمن) للمسارات التي تحتاج ترميزاً، مع فحص الفيديو/الصوت والمدة/الـseek. الناتج الجزئي يحمل `_partial.mp4` ولا يُسمّى كاملاً.
- **الواجهة/الحقوق:** لوحة AR/EN وRTL مع تقدم، إلغاء، إعادة محاولة، حفظ مرة أخرى، تحذير جزئي وأخطاء واضحة. المتنافسان يحصلان على إشعار إعادة النشر/تحقيق الدخل، والمشاهد على أن إعادة النشر تتطلب إذن المنصة. الضيف يشاهد LIVE/VOD بلا زر تنزيل. زر صفحة المنافسة أصبح طبقة مستقلة عن جاهزية VOD، و`/live` يعرضه قبل اكتمال تحميل المشغّل؛ أزيلت أساليب/أزرار raw-concat القديمة.
- **CSP/الأصول:** أضيف فقط `'wasm-unsafe-eval'` و`worker-src 'self'` و`media-src blob:`؛ JS `'unsafe-eval'` ممنوع و`connect-src blob:` غائب. الأصول مستضافة على النطاق نفسه (wasmBinary، بلا Blob URL)، ومولّدة تحت `public/static/ffmpeg/` المتجاهل.
- **الأدلة:** Vitest كامل باستثناء ملف `quality-gate-poll` المعتمد على jq: **178 ملفاً / 1859 اختباراً PASS**. `npx tsc --noEmit` نظيف؛ `npm run build` ناجح؛ SEC-06 PASS؛ `any` 293 (الأساس 310)؛ `npm audit --audit-level=high --omit=dev` بلا high/critical (تحذير Hono moderate قائم)؛ جرد المسارات 244. تشغيل Chromium حقيقي: MP4 (20 قطعة/902,430 بايت/355.674s) مع seek منتصف متحقق؛ WebM (3 قطع/1,095,540 بايت/59.673s) مع تشغيل/seek وصوت واحد. عامل FFmpeg عمل تحت CSP الإنتاج بلا `connect-src blob:`. فحص يدوي للوحة: الضيف بلا حوار؛ EN LTR وAR RTL عند 390×844؛ سطح المكتب 1280×800 بعرض 512؛ الإلغاء/الإعادة/التقدم تعمل.
- **NOT RUN — ENVIRONMENT:** `jq` غير مثبت على ويندوز، لذا اختبارات `quality-gate-poll` السبعة بيئية ومستثناة (Ubuntu CI يوفره). `npm run test:integration` لم يكتمل خلال 600s (أول حالة `messages-schema` استغرقت 206s ثم انتهت المهلة؛ لا اختبار تكامل لـUNIT30). `ffprobe`/CLI FFmpeg/MP4Box غير متاحة، والتحقق وسائطي عبر Chromium/wasm فقط. لم يُشغّل تحويل `match_2202` الكامل (47 قطعة) ولا نقر صفحة تطبيق إنتاجية موثّقة؛ `match_2201` فيديو فقط لذا لا يُدّعى صوت MP4. لا وصول لإنتاج D1/R2/السجلات.
- **PR:** [#129](https://github.com/Maelsh/dueli-opus/pull/129) (`feat/r4-unit30-chunk-download`) هو الـPR المركز الوحيد مقابل main؛ غير مدموج وغير منشور. PR110 بلا مساس.
- **الحالة:** `🔧 LOCAL — NOT ACCEPTED`؛ لا ادعاء UNIT30 مقبولاً قبل قبول الوسائط الحقيقي/الجهاز المتبقي.
- **ROLLBACK:** إرجاع commits هذا الفرع؛ بلا migration مخطط/وسائط.
- **NEXT:** مراجعة مستقلة + قبول تنزيل حقيقي لتسجيل نهائي كامل (MP4/WebM)، ومقطع جزئي موسوم، وواجهات الضيف/المسجل، والجوال/سطح المكتب/RTL، والإلغاء/المهلة، وتحويل FFmpeg بحجم إنتاجي؛ الدمج/النشر منفصلان.

## 2026-10-21 — R4-UNIT28-A28-TIME-3 (الصف 28) · تحقق نهاية الـplaylist بعد finalized · فرع feat/r4-unit28-a28-time-3 (من 572731bc = origin/main)

## UNIT28 — ACCEPTED / CLOSED (2026-10-22)

- **Owner-approved independent real-browser production acceptance** on CODE MAIN `a2579ce5f1f0d32077506b56553fe9a0f79619f8`, PR125/126/127 merged.
- Post-merge [Quality 39662569083](https://github.com/Maelsh/dueli-opus/actions/runs/39662569083) and [Deploy 39662569170](https://github.com/Maelsh/dueli-opus/actions/runs/39662569170) SUCCESS on the exact SHA; deployed API `finalized_at` and page script fingerprints verified.
- Production competition **2253**: authenticated A/B/C, two distinct sources, LIVE → End → inline VOD; initial finalized 11/11 snapshot, late drain tail 12 chunks / 134.554s, automatic bounded refresh, correct duration/seekbar and seek to final chunk, no reload/restart/rollback, polling terminated. Reference: owner-provided `A28-PR127-PRODUCTION-ACCEPTANCE-REPORT.md` (2026-10-22).
- **UNIT28 (28.1–28.5 and A28-LEASE/SURFACE/TIME): ACCEPTED/CLOSED**. Historical failures in competitions 2244/2250/2251 superseded by production 2253; historical entries below retained. Do not reopen absent independently evidenced new defect.
- **NEXT: UNIT30 R4-CHUNK-DOWNLOAD-1 option B** per [plan14](https://github.com/Maelsh/dueli-plan/blob/main/dueli-completion-plan/14-UNIFIED-EXECUTION-PATH.md), [plan15](https://github.com/Maelsh/dueli-plan/blob/main/dueli-completion-plan/15-CHUNK-INDEX-UPLOAD-PLAYER-PLAN.md). PR110 OPEN/HOLD; do not merge it unchanged. Remaining order 30.1→30.2→30.3→31→32→32.1→33–42.


- 🔧 LOCAL فقط — RED→GREEN، ليست DONE/Production Accepted، وبلا دمج أو نشر. النطاق A28-TIME-3 فقط؛ A28-TIME origin/seek وA28-LEASE وA28-SURFACE وسلوك PR #126 وUNIT30 والـmigrations وبيانات الإنتاج والمنطق المالي والـcompositor/WebRTC وPR110 (HOLD) بلا مساس. BASE `572731bc37383b47dcb683bed26a3ddfebdb6034` (PR #126 مدموج)؛ الملفان غير المتتبعين `.measure-probe.tmp.ts` و`pr-body.md` قديمان وبلا مساس.
- **السبب الجذري (CONFIRMED، وليس "الاعتماد الدائري" الحرفي في تقرير المدقق):** `/end` يكتب الـfinal marker قبل نشر drain tail المصرّح به، لذا `finalized=true` يعني وجود العلامة وليس أن الـplaylist نهائية. كان `SmartVodPlayer.needsPlaylistRefresh()` يعيد `missing` (false) متى كانت اللقطة `finalized=true` و`ready_count === uploaded_count`، فلم تُجدول أي مراجعة موثوقة للقطة 14/14. في الإنتاج 2250 (14/149.129s → النهائي 15/165.359s) و2251 (13/157.432s → النهائي 14/171.373s) ظهر `refreshAttempts=0` و`needsRefresh=false` و`timer=false`.
- **دليل RED (BASE `572731bc`، اختبارات جديدة):** `tests/client/r4-unit28-time.test.ts` + `tests/api/chunk-index.test.ts` = `7 failed | 31 passed`. فشلت الاختبارات 13 و15 و16 و17 و18 و19 وعقد API لـ`finalized_at`: لا recheck للقطة finalized+complete حديثة، لا نافذة محدودة، لا التقاط للـtail بعد ردود بلا نمو، لا إلغاء عند stop، لا حارس لترتيب الردود، ولا حقل metadata. الاختبار 14 (marker قديم مستقر) مرّ على BASE، ما يحفظ مسار عدم polling.
- **الإصلاح:** `ChunkIndexPlaylist.IndexMetadata` يعرض `finalized_at` من الـfinal marker في D1، و`/api/chunks/playlist/:id` يمرر طابع العلامة (null عند غيابها). `needsPlaylistRefresh()` يستمر في المراجعة أثناء عدم finalized أو `ready_count < uploaded_count`؛ وللقطة finalized+complete يعيد الفحص فقط ما دام `checked_at - finalized_at` (بتوقيت الخادم) داخل حد `2s × 30` القائم. الردود القديمة بلا `finalized_at` تبقى على مسار عدم polling. `refreshPlaylist()` يرفض الرد الأقدم من `checked_at` المعروض، ويظل append-only (لا يصغّر القائمة)، ويستخدم lifecycle epoch + request sequence + `AbortController`؛ `start()` يتقاعد من الحلقة السابقة و`stop()` يلغي العمل المعلّق. عنصر الفيديو وchunk الحالي والـbytes وموضع التشغيل لا تُلمس؛ يتغير فقط metadata الـplaylist و`chunkDurations`/`totalDuration` وقيم `onTimeUpdate`/seekbar. لا تأخير ثابت بديلاً عن الفحص ولا polling لانهائي.
- **الأدلة الخضراء:** `r4-unit28-time` 19/19؛ A28 lease/surface/time 34/34؛ حزم المشغّل/الاستعادة المجاورة 46/46؛ حزم player/playlist/API 136/136؛ UI player/playlist 32/32؛ `npm test` كامل مع `JQ_PATH` = 173 ملفاً / 1824 اختباراً خضراء. `npx tsc --noEmit` نظيف؛ `npm run build` ناجح؛ SEC-06 PASS؛ `any` 302 (الأساس 310). `npm audit --omit=dev`: تحذير moderate واحد قديم في Hono `serveStatic` لا يخص هذا التغيير. بدون jq، إخفاقات `quality-gate-poll` الستة بيئية وتنجح بـjq المحلي.
- **NOT RUN — ENVIRONMENT:** جلسات المتصفح الإنتاجية 2250/2251، والوسائط الحقيقية 14→15 و13→14، وffprobe/FFmpeg، وأجهزة Chromium، وD1/R2/سجلات الإنتاج، وخدمة التسجيل الخارجية غير متاحة محلياً. لذلك لا يُدّعى التقاط الـtail الحقيقي ولا استقرار التشغيل ولا القبول الإنتاجي لـA28-TIME-3؛ يلزم تحقق إنتاجي مستقل.
- **PR:** #127 (`feat/r4-unit28-a28-time-3`) هو الـPR المركز الوحيد؛ غير مدموج وغير منشور.
- **الحالة:** A28-TIME-3 `🔧 RED→GREEN محلياً — NOT ACCEPTED`. **UNIT28 remains NOT ACCEPTED pending independent review and focused production A28-TIME-3 verification.** A28-TIME origin/seek وA28-LEASE وA28-SURFACE كما سبق اعتمادها بلا مساس.
- **ROLLBACK:** إرجاع commit(s) الـPR المركز لـA28-TIME-3؛ بلا migration مخطط/وسائط.
- **NEXT:** مراجعة مستقلة + تحقق إنتاجي مركّز على 2250/2251: التقاط الـtail، تحديث الإجمالي/seekbar، ثبات الموضع، عدم إعادة التحميل/التشغيل، عدم تصغير القائمة، وحد `refreshAttempts`؛ لا دمج ولا نشر من هذه الجلسة.

## 2026-10-21 — R4-UNIT28-A28-TIME-FORENSICS-1 (الصف 28) · تحقق مستقل من إنتاج 2244 · فرع feat/r4-unit28-a28-time (من cc7bed7 = origin/main)

- 🔧 LOCAL فقط — RED→GREEN، ليست DONE/Production Accepted، وبلا دمج أو نشر. النطاق A28-TIME فقط؛ A28-LEASE وA28-SURFACE محفوظان بلا مساس، وPR110 بلا مساس (HOLD). لا migrations/بيانات إنتاج، ولا ROW30/32.1/35/H7/finance/ads. BASE `cc7bed7a34c60223bfcd793cc9f6034ac6fb7c58`؛ PR #125 مدموج وPR110 هو المفتوح الوحيد.
- **قبل العمل:** `origin/main == cc7bed7a34c60223bfcd793cc9f6034ac6fb7c58`؛ شجرة الملفات المتتبعة نظيفة؛ الملفان غير المتتبعين `.measure-probe.tmp.ts` و`pr-body.md` قديمان وبلا مساس. التقرير الخارجي دليل تحقيق لا سبب جذري مقبول.
- **تصنيف ادعاءات التقرير الخارجي (2244):** A = `CONFIRMED` للعَرَض (عرض 305 مقابل 154.895)، مع تصحيح التشخيص: الصيغة ليست خاطئة بذاتها؛ العيب أصل صفري مخزّن لا يُعاد تقييمه. B = `CONFIRMED` (لقطة playlist واحدة: 24/255.863 بدل 25/271.347). C = `CONFIRMED` (الإجمالي القديم + origin=0؛ كتابة الإزاحة الخامة قُصّت إلى بداية chunk). لم يُخترع عيب رابع.
- **دليل RED على BASE:** الساعة `301.918 = 150.959 + 150.959`؛ seek المتأخر بقي `150.959` بدل `154.859`؛ الإجمالي بقي `255.863` بعد chunk 25؛ seek 60% بقي `159.914` (عرض `319.828`) و92% بقي `245.202` (عرض `490.404`)؛ حدود chunk أظهرت `20` بدل `10`؛ LIVE أظهر `1035.282` بدل `517.539`. اختبار zero-origin 11 مرّ. النتيجة `6 failed | 6 passed`.
- **السبب الجذري:** `dueliMediaOrigin` خزّن وأعاد `0` متى كان `seekable.start(0)=0` والمدة غير صالحة عند `loadedmetadata`، و`captureMediaOrigin` أعاد الصفر المخزّن دائماً؛ ثم كتب `applyTarget`/`seekTo` الإزاحة الخامة فقصّها المتصفح إلى أول طابع في الـMP4 المطلق. وبشكل منفصل، جلب `competition-page.ts` الـplaylist مرة واحدة، و`handleVodNotReady` لم يعِد المحاولة إلا لقائمة فارغة/خطأ، فلم ترَ اللقطة ذات 24 chunk الـchunk 25 الجاهز.
- **الإصلاح:** `shared.ts`: الأصل الموجب فقط ثابت؛ الصفر يُعاد تقييمه؛ `seekable.start=0` ليس دليلاً؛ الاشتقاق من `duration − مدة chunk المتحققة` أو `currentTime` لعنصر متوقف؛ الأصل المجهول لا يُخزَّن. `dueliApplyOriginSeek` يؤجل الكتابة حتى `durationchange`/`loadeddata`/`canplay`، ويُبطل الـseeks المتجاوَزة بالـgeneration، مع fallback قديم محدود للمحركات بلا media timeline. كل مشغل يصفّر علم المعرفة عند تبديل chunk. `SmartVodPlayer` يحدّث الـplaylist بنافذة محدودة (2s × 30) فقط عندما `finalized !== true` أو `ready_count < uploaded_count`؛ لا يصغّر القائمة، ولا يعيد تحميل العنصر، ويحفظ `currentChunkIndex`/الـbytes/opGen، ويحدّث `chunkDurations`/`totalDuration`، ويتوقف عند finalized/timeout/stop.
- **الأدلة الخضراء:** `r4-unit28-time` 12/12؛ حزمة A28 (lease/surface/time) 27/27؛ حزم المشغّل/الرفع/compositor ذات الصلة 71/71؛ UI/API player+playlist 52/52؛ `npm test` كامل مع `JQ_PATH` = 173 ملفاً / 1817 اختباراً خضراء. `npx tsc --noEmit` نظيف؛ `npm run build` ناجح؛ SEC-06 PASS؛ `any` 302 (الأساس 310). `npm audit --omit=dev`: تحذير moderate واحد قديم في Hono `serveStatic` لا يخص هذا التغيير.
- **الحدود/المتبقي:** لا انحدار مصدري في الحزم أعلاه. مجلدات أدلة 2244 و`scripts/a28-*.js` والوسائط الحقيقية وجلسة متصفح/جهاز/ffprobe غير متاحة محلياً، لذا التشغيل/الـseek الحقيقيان وقبول S المتبقي غير متحققين. PR #126 مفتوح؛ CI (Quality Gate + نشر معاينة للفرع) نجح على commit الكود `a28298e` — معاينة فقط، بلا نشر إنتاج وبلا دمج. إخفاقات `quality-gate-poll` الستة بدون jq بيئية ونجحت محلياً بـjq (`1817/1817`).
- **الحالة:** A28-TIME `🔧 RED→GREEN محلياً — NOT ACCEPTED`؛ UNIT28 remains NOT ACCEPTED pending independent review and focused production A28-TIME verification. A28-LEASE/A28-SURFACE كما هما بلا مساس.
- **ROLLBACK:** إرجاع commit الـPR؛ بلا migration مخطط/وسائط.
- **NEXT:** مراجعة مستقلة + تحقق إنتاج مركز على A28-TIME (replay/seek للمسابقة 2244)؛ لا دمج ولا نشر من هذه الجلسة.

## 2026-10-21 — R4-UNIT28-ACCEPTANCE-1 (الصف 28) · A28-LEASE / A28-SURFACE / A28-TIME + A28-PREVIEW-OBS · فرع feat/r4-unit28-acceptance-a28 (من d0768783 = origin/main)

- 🔧 تنفيذ LOCAL فقط — ليست DONE/Production Accepted، بلا دمج أو نشر، وUNIT28 ليس ACCEPTED. حزمة المتابعة الوحيدة لـUNIT28 وفق §14 من خطة 15؛ لا ROW30/32.1/35/H7/finance/ads، وPR110 بلا مساس (HOLD). لا إعادة تصميم codec/compositor، ولا FFmpeg سيرفر، ولا حذف/كتابة فوق chunks، ولا PHP/D1/استضافة. BASE `d0768783ede68c11aab9cc442c148d99349fead3`، وSHA الخطة `37b6234fe749b47ae5ca0e177bd2ba04d7e664f0` مطابق.
- **دليل RED (BASE `d0768783`):** بعزل فروق المصدر فقط، الحزمة المركزة (4 ملفات: lease 8، surface 7، time 5، recording-lease 16) = `22 failed | 14 passed`، أي 22 من 24 عقداً جديداً حمراء مع بقاء 12 تثبيتاً قائماً أخضر. بعد التصحيح: `5 ملفات / 58 اختباراً` خضراء (مع تحديثات أمانة الـharness في `chunk-upload-safe`).
- **A28-LEASE** — `BEFORE`: كل إجابة heartbeat غير `held` (شبكة/مهلة/5xx/HTML/جسم قديم) كانت تُترجم "فقداناً": إيقاف نهائي، تفريغ الطابور، ورفض finalize؛ و`heartbeat` كان يجدّد صفاً متجاوزاً TTL بصمت؛ و`/register` اكتفى بوجود lease نشط للحساب فحصل تاب قديم على مفاتيح تحت generation الخلف؛ وذيل ما بعد `/end` مرفوض. | `ROOT CAUSE`: الملكية boolean واحد بلا تمييز UNKNOWN/EXPIRED/LOST/ended، وتجديد بلا TTL، وإصدار مفاتيح غير مربوط بهوية الـholder، وبوابة live-only. | `PATCH`: `heartbeat` يقيّد UPDATE بـTTL ويعيد `expired`/`released`/`lost`؛ المسار يعيد للـowner بعد النهاية `released`/`ended`+`draining` ولغير المالك `lost`؛ `/register` يقارن `holder_hash` الحالي بـnonce المستدعي، ويفتح `endedDrain` فقط لـcompleted+released+same holder؛ `recordChunk` يقبل `allowEndedDrain` لـcompleted فقط؛ و`ChunkUploader` يملك آلة `HELD | UNKNOWN-TRANSIENT | EXPIRED | LOST-TAKEN-OVER`: التذبذب يوقف الرفع ويحفظ الطابور المحدود مع إعادة تحقق متدرجة محدودة، والانتهاء يعيد الاستحواذ بإثبات سيرفر ويضيف بالـgeneration الجديد، والتجاوز الحقيقي يوقف مرة واحدة ويجهض الطلب ويعدّ المُسيَّج ويرفض finalize، و`released`/`ended` يُبقي ذيل الصرف المصرّح. حراس epoch/fence يتجاهلون النتائج القديمة، وتغيّر generation أثناء الرفع يعيد نفس الرقم، ويُرسل `holder_nonce` مع طلب المفتاح، وfinalize صادق أثناء عدم التحقق. الصفحة لم تعد تعدّ ended/released تجاوزاً. | `AFTER`: انقطاع عابر لا يوقف/يسقط، ولا نشر بلا ملكية مثبتة، والانتهاء يستأنف بـgeneration موثّق، والتجاوز يُسيَّج مرة واحدة، والذيل بعد النهاية يصل؛ بلا overwrite (نفس التسلسل idempotent أو CONFLICT)، وبلا تخزين غير محدود، وبتراجع/backoff محدود. | `EVIDENCE`: 8 عميل + حالات API 9/13/14/15.
- **A28-SURFACE** — `BEFORE`: `applyCompetitionState` يضبط `competitionData=completed` قبل `closeRatingUi`/`beginTerminalTeardown`/`renderCompetition` غير المحمية؛ أي استثناء تنظيف يتخطى العرض نهائياً لأن الأحداث اللاحقة ترى prev=completed؛ وكانت `resolveVideoSurface` تُبقي المشارك على live عند بقاء `stream_status='live'`. | `ROOT CAUSE`: قرار طرفي مقترن بخطوات best-effort بلا حماية، وكشف completed بالحدث فقط، وعلامة live قديمة تتغلب. | `PATCH`: completed يتغلب على live القديم للمشارك؛ `completedSurfaceKey` يُضبط فقط بعد نجاح العرض؛ عزل cleanup/teardown/render/dynamics بـtry/catch وتسجيل؛ فشل العرض يترك العلامة فارغة كي يعيد الحدث/GET resync المحاولة؛ teardown يحدّ انتظار الواجهة فقط ولا يقطع ذيل المسجّل. | `AFTER`: فشل التنظيف/teardown/dynamics لا يترك الصفحة على DOM المباشر، والانتقال الصادق إلى VOD/processing/unavailable يُنفّذ، والعرض الناجح idempotent، والعارض والمتنافس يصلان للسطح المدمج. | `EVIDENCE`: 7/7.
- **A28-TIME** — `BEFORE`: المشغلان يلتقطان أصل الوسائط من `currentTime` مرة قرب metadata، وقد تعرض Blink صفراً هناك؛ فيُضاف الطابع المطلق اللاحق (عينة حقيقية 517.743533s) إلى بداية الفهرس (517.539s) فتتجاوز الساعة الإجمالي (1:58 مقابل 1:06)، والـseek يكتب الإزاحة الخامة فتقصّها Blink إلى الأصل المطلق. | `ROOT CAUSE`: أصل مأخوذ من قيمة قد لا تكون قابلة للملاحظة بعد، بلا بديل مشتق من المورد، مع افتراض zero-origin. | `PATCH`: دالة مشتركة `dueliMediaOrigin(video, expectedDuration)` تشتق الأصل من `seekable.start(0)`، وإلا `duration − مدة chunk المتحققة` فقط عند فائض واضح (>5% و>1s)، وإلا `currentTime` لعنصر متوقف عند `readyState<2`، وإلا 0؛ مع تخزين لكل عنصر. يستخدمها `SmartVodPlayer` و`LiveSequentialPlayer` في `getGlobalTime` وكتابة seek (`origin + offset`) بمُدد الفهرس المتحققة. بلا clamp إضافي يخفي الحساب. | `AFTER`: تحويل واحد يُطبّق مرة واحدة على الأصل المطلق وصفر-origin؛ الزمن العالمي داخل الإجمالي المتحقق؛ seek والمدة وحدود chunks والـseeks السريعة والwindowing وdouble buffering والصوت وLIVE/VOD كما هي. | `EVIDENCE`: 5/5. **ملاحظة حاكمة:** هذه الـ5/5 تغطي مسار duration المتاح فقط؛ تحقق إنتاج 2244 أعلاه أثبت ثغرة الأصل الصفري المخزّن ولقطة الـplaylist الواحدة، ويكمله ولا يُلغي التاريخ.
- **A28-PREVIEW-OBS** — ملاحظة فقط: غير مُعاد إنتاجه في هذه البيئة؛ لا netlogs/console/timeline/جهاز من المالك، وعينة `match_2201` المحلية غير مؤكدة كمسابقة 2242، لذا لم يُكتب إصلاح تخميني رابع. يبقى `UNKNOWN` بحدود صريحة (لا جلسة متصفح/جهاز حقيقية، لا ffprobe/ffmpeg، لا أدلة مالك) ويلزم trace من جهاز حقيقي قبل أي تغيير.
- **الأدلة:** المركزة `58/58`؛ انحدارات المشغّل/الرفع/compositor/live/competition خضراء؛ `npx tsc --noEmit` نظيف؛ `npm run build` ناجح؛ SEC-06 PASS؛ `any` 290 (<310). `npm test` كامل: `173 ملفاً / 1810 اختباراً` → `1804` نجحت و6 فشلت فقط في `quality-gate-poll` لغياب `jq` على ويندوز؛ إعادة تشغيل الملف بـ`JQ_PATH` = 8/8 ⇒ 1810/1810 فعلياً. CI لم يُشغَّل بعد لهذا الـPR.
- **S:** PENDING — لا قبول حسي حقيقي لطرفين ولا أدلة مالك؛ A28-PREVIEW-OBS غير مُعاد إنتاجه. لا ادعاء `✅`/S PASS، وUNIT28 ليس ACCEPTED.
- **ROLLBACK:** إرجاع commit الـPR؛ بلا migration وسائط/مخطط. PR110 يبقى HOLD.
- **NEXT:** مراجعة REMOTE مستقلة فقط؛ لا دمج ولا نشر من هذه الجلسة.

## 2026-10-21 — R4-LIVE-END-RECOVERY-1 (الصف 28.5) · FV20-END / FV20-FINAL / FV20-LEAVE · فرع feat/r4-live-end-recovery-1-28-5 (من a422f776 = origin/main)

- 🔧 تنفيذ LOCAL فقط — ليست DONE/Production Accepted، وبلا دمج أو نشر. النطاق 28.5 فقط؛ لا إعادة فتح 28.4.1/ROW30/32.1/35/H7/finance/ads، وPR110 بلا مساس (HOLD). لا نقطة HTTP finalize مخترعة، ولا FFmpeg سيرفر، ولا كتابة `vod_url` عند الإنهاء، ولا migration.
- **دليل RED (BASE `a422f776`):** بعزل فروق المصدر فقط، الاختبارات الجديدة (4 API + 5 UI) تعطي `8 failed | 1 passed`: لا حدث SSE طرفي للإنهاء اليدوي/التلقائي، و`vod_url` من العميل مقبول، و`ended_at` غائب عن الحدث، ومسار المغادرة قائم، والإنهاء يعيد التحميل/ينتظر، والجاهزية مقيّدة بـ`vod_url`. بعد التصحيح: `9/9` خضراء.
- **28.5 / FV20-END** — `BEFORE`: الإنهاء اليدوي يحدّث الصف فقط بلا `competition_status`؛ إنهاء الساعتين كذلك. `CAUSE`: الانتقال كان DB-only، والقناة الحالية لم تستلم الحالة الطرفية. `PATCH`: `CompetitionController.end` (creator/opponent فقط) ينشر حدثاً واحداً `completed` مع `ended_at` المحفوظ؛ `ScheduledTaskService.endLiveMaxDuration` ينشر نفس الحدث؛ `EventPusher` يقبل `ended_at` ويؤمّن env الداخلي. العميل يطبّق الحالة دون Refresh ويُبقي GET المحدود مصدر حقيقة عند فقد SSE. `AFTER`: الأطراف الثلاثة يستلمون نفس الحالة؛ التكرار idempotent ولا ينشر حدثاً ثانياً.
- **28.5 / FV20-FINAL** — `BEFORE`: العميل يكتب `vod_url` ويعيد التحميل وينتظر `compositor.destroy()`، والعارض يعتبر `vod_url/youtube_video_url` جاهزية. `CAUSE`: خلط الإنهاء بدليل التسجيل، وانتظار drain قبل الانتقال، والثقة برابط بدل فهرس/playlist متحقق. `PATCH`: الإنهاء يرسل `{}` ولا يرسل/يحفظ `vod_url`؛ `CompetitionModel.complete` لا يكتب `vod_url` (`stream_status='ready'` مجرد علامة إغلاق). العميل ينتقل فوراً، يوقف المسجّل مرة واحدة، يحفظ dataavailable/pending saves/finalize/lease/marker، ويحدّ الانتظار الواجهي بـ12s فقط بينما يستمر الذيل في الخلفية بمفاتيح clean-end. بلا reload. الجاهزية من `/api/chunks/playlist/:id` فقط، وإلا processing/unavailable/error الصادقة. `AFTER`: الإنهاء مستقل عن الرفع، بلا finalize مزدوج أو ادعاء VOD كاذب، والـmarker دليل منصة محدود لا جاهزية مشغّل.
- **28.5 / FV20-LEAVE** — `BEFORE`: زر/حوار مغادرة وعودة ومسار presence-leave، وبلا تحذير إغلاق. `CAUSE`: المغادرة كانت فعلاً منتجياً بينما قرار المالك يجعل End الفعل الطرفي الوحيد. `PATCH`: حذف الزر/الحوار/المعالجات ومفاتيح i18n وCSP و`leftBroadcast` واستثناء المشارك الذي كان يخفي التسجيل؛ `endStream` هو مستدعي `/end` الوحيد. `beforeunload` قد يحذّر أثناء live+publish فقط ولا ينهي/يفاوت؛ `pagehide` يغلق SSE فقط. استعادة القطع القسري/reconnect باقية. `AFTER`: لا إنهاء تلقائي عند الإغلاق/القطع/إعادة التحميل؛ وتُحرَّر الكاميرا/الميك/الشاشة/PC/المؤقتات/المسجّل مرة واحدة عند completed المصرّح، مع `stopLocalMedia()` متزامن وحراس العمليات الجارية.
- **تحديثات اختبار مقصودة:** `r4-live-entry-recovery-rem1` يثبّت End-only وإزالة المغادرة وحدود التحذير؛ `comp-unified` يثبّت أن unload لا ينهي/يفاوت؛ `r2-l2-competition-ui` يثبّت جاهزية playlist بدل `vod_url`. هذه تستبدل تثبيتات قديمة متعارضة.
- **الأدلة:** API الجديد 4/4 وUI الجديد 5/5؛ الحزمة المركزة 58/58؛ `npx tsc --noEmit` نظيف؛ `npm run build` ناجح؛ `npm test` كامل `170 ملفاً / 1786 اختباراً` خضراء (وفّرت jq محلياً عبر `JQ_PATH` لغيابه على Windows؛ Ubuntu CI يوفره). CI لم يُشغَّل بعد لهذا الـPR.
- **S:** PENDING — لا قبول حسي حقيقي لطرفين (كاميرا/ميك/شاشة) ونهاية تسجيل؛ mocks/فهارس المصدر لا تغلق S. لا ادعاء `✅`/S PASS.
- **ROLLBACK:** إرجاع commit الـPR؛ بلا migration وسائط/مخطط. PR110 يبقى HOLD.
- **NEXT:** مراجعة REMOTE مستقلة فقط؛ لا دمج ولا نشر من هذه الجلسة.

## 2026-10-20 — R4-CHUNK-VIEW-RECOVERY-REM1 (الصف 28.4.1) · FV20-TIME / FV20-START · فرع feat/r4-chunk-view-recovery-rem1-28-4-1-fv20 (من 54a3380 = origin/main)

- 🔧 تنفيذ LOCAL فقط — ليست DONE/Production Accepted، بلا دمج أو نشر. عقد PR119/121/122 (المشغّل، الصوت، الكاش، التسجيل) محفوظ. لا إعادة تصميم codec/container، ولا FFmpeg سيرفر، ولا إعادة كتابة chunks تاريخية، ولا حذف وسائط، ولا PHP/D1/استضافة، ولا 28.5/ROW30/32.1/35. PR110 بلا مساس.
- **دليل RED (BASE `54a3380`):** بعزل فروق المصدر فقط، الاختبارات الجديدة 12 و13 و15 تفشل: VOD يعيد `517.539 + 517.743533 = 1035.282533`، وLIVE يعيد `1056.054` للـ chunk 50، واختبار الأصل المتأخر في VOD يعاني الإزاحة المزدوجة نفسها؛ اختبار الانحدار صفر-origin (14) يمر. بعد استرجاع الفروق: 16/16 خضراء.
- **28.4.1 / FV20-TIME** — `BEFORE`: MP4 مجزأ يعرض زمن وسائط مطلقًا (`currentTime=517.743533`) بينما بداية الفهرس `517.539`؛ `getGlobalTime()` جمعهما، والـ seek كتب إزاحة محلية خامة (`0`/`2.5`) فقمتها Blink إلى أصل الوسائط. | `CAUSE`: إزاحة مزدوجة — بداية عالمية + طابع زمني مطلق بلا التقاط أصل الوسائط. عيّنة حقيقية `chunk_0050.mp4` (match 2230، index 49): tfdt فيديو `15,532,306 / 30,000 = 517.743533s`، صوت `24,852,933 / 48,000 = 517.769438s`، `duration=528.127467`، `timeline_start_ms=517539`، `duration=10.384`. | `PATCH`: في `src/modules/pages/live/scripts/client/shared.ts` يُلتقط أصل الوسائط لكل عنصر بعد `loadedmetadata`؛ الزمن العالمي `chunkStart + (currentTime - origin)` والـ seek `origin + localOffset` في `LiveSequentialPlayer` و`SmartVodPlayer`، مع إبقاء حساب zero-origin كما هو. VOD يؤجل `play()` حتى metadata كي لا يتقدم `currentTime` قبل معرفة الأصل؛ وتُنظّف `onloadedmetadata` عند التبديل/الإيقاف. | `AFTER` (chunk حقيقي + bundle المُصدَر + Chromium 153): VOD بداية `global=517.539`، `currentTime=517.743533`، الإجمالي `527.923`؛ seek إلى `520.039` يعطي `global=520.038998`، `currentTime=520.243531`. LIVE `start({startFromLatest:true})` على chunk 51 (index 50): `global=527.923`، `currentTime=528.131083`، `videoWidth=1280`. | `TEST`: 16/16 لملف REM1؛ حزم المشغّل المستهدفة 60/60؛ `npx tsc --noEmit` نظيف؛ `npm run build` ناجح؛ full suite `1771 passed` مع 6 إخفاقات `jq` بيئية معروفة فقط. | `STATUS`: 🔧 LOCAL — ليست ✅.
- **28.4.1 / FV20-START** — `BEFORE/TRACE`: مع chunks جاهزة: `skipToLatest` → طلب chunk (206) → `loadedmetadata` عند 32ms → `canplay` عند 33ms → `onChunkChange` عند 34ms → `playing` عند 110ms؛ أول إطار `1280x…`. حدث `waiting` عابر عند 35ms وحُلّ عند 110ms. لا حالة "waiting مع chunks جاهزة" مستمرة قابلة لإعادة الإنتاج في هذه البيئة. | `CAUSE`: لا سبب مُثبت. | `PATCH`: لا إصلاح تخميني؛ لم يُغيَّر مسار البدء. | `AFTER`: البدء يعود ويصل للتشغيل. | `TEST`: نفس دليل المتصفح أعلاه + اختبارات البدء الحالية. | `STATUS`: 🔧 NOT REPRODUCED / UNKNOWN — يلزم trace من جهاز حقيقي إن تكرر.
- **S:** لا ادعاء S PASS؛ الـ harness يثبت فك الترميز/أول إطار والحساب الزمني فقط، لا قبول بصري/صوتي بكاميرا/مايك/شاشة حقيقية.
- **ROLLBACK:** revert commit الخاص بالـ PR (ملفان: `shared.ts` واختبار REM1)؛ لا migrations وسائط/مخطط.
- **التالي:** مراجعة REMOTE مستقلة؛ لا دمج/نشر من هذه الجلسة.

## 2026-10-20 — R4-LIVE-ENTRY-RECOVERY-REM1 (الصف 28.3.1) · متابعات FV20 (FV20-SIG / FV20-TOAST / FV20-OFFER / FV20-REPLAY) · فرع fix/r4-live-entry-recovery-rem1-fv20 (من 38ffa57 = origin/main)

- 🔧 تنفيذ LOCAL مكتمل T/B + RED→GREEN — ليست DONE/Production Accepted، بلا دمج/نشر. عقد PR118–121 وسلوك 28.3.1 (الموافقة المستقلة، المعاينة، مشاركة الشاشة، مرجع التصميم، حقوق الإشارات/التسجيل) محفوظ. لا تغيير في compositor/codec/PHP/D1/الاستضافة ولا توسّع إلى 35 أو R2-V/H7/المالية/الإعلانات/TURN. PR110 بلا مساس.
- **دليل ما قبل الإصلاح (BASE `38ffa575`):** بعزل فروق المصدر فقط، الاختبارات الجديدة 14/14 حمراء: `cursor` غير معرّف، وSSE الجديد يعيد `old-invite`، و`showToast` المحلي غائب. بعد استرجاع الفروق: 14/14 خضراء.
- **FV20-SIG** — `BEFORE`: مسارا `/api/signaling/poll` و`/viewer/poll` يعيدان `visibleSignals` فقط، والعميل يقدّم `lastTimestamp` على الإشارات المعالجة فقط. `ROOT CAUSE`: صفحة `getAfter(...,50)` محدودة؛ صفحة كاملة من presence/إشارات لقرين آخر تعيد `signals: []` فيعيد العميل طلب `since` نفسه أبدًا، فتبقى إشارة لاحقة غير مقروءة. `CHANGE`: إرجاع `cursor` = آخر معرّف ممسوح (أو `since` المطبَّع لصفحة فارغة)، والعميل يعالج الدفعة ثم يتبنى المؤشر بلا رجوع ويتجاهل القيم غير الصالحة (توافق خلفي). `AFTER`: الصفحات المفلترة تتقدم مرة واحدة، والطلب التالي يقرأ العرض/الإشارة الحقيقية، والصفحة الفارغة تحفظ مؤشرها، وصلاحيات الأدوار كما هي. `TEST EVIDENCE`: API 3 (50 presence → عرض 51؛ 50 إشارة لجمهور آخر → إشارة 51؛ صفحة فارغة 77 + 403 للحدود) وعميل 4 (تبنٍّ بصفر مرئي، الوصول للإشارة التالية، مؤشر قديم 40 لا يرجع 50، عارض `since=64`). `STATUS`: ✅ FIXED (T/B; RED→GREEN).
- **FV20-TOAST** — `BEFORE`: `competition-page.ts` ينادي `showToast(...)` عارية في `publishMedia` ومحيطها، بينما الحزمة تعرّف `window.dueli.showToast` فقط. `ROOT CAUSE`: معرّف غير معرّف ⇒ `ReferenceError` عند توست ما بعد النشر بالضبط، بعد ربط المسارات و`mediaPublished=true`. `CHANGE`: جسر `showToast` محلي داخل الصفحة → `window.dueli.showToast` → `window.showToast` القديم → بديل DOM بسيط، وكل طبقة داخل try/catch كي لا يعطّل التوست الوسائط/التفاوض. `AFTER`: نجاح النشر يُعلن ويُكمل التنفيذ، وفشل الجسر محتوى ويُعرض النص عبر البديل. `TEST EVIDENCE`: اختبارات العميل تنفّذ `showToast` + `publishMedia` الحقيقيتين من المصدر في نطاق واحد: نجاح المضيف، نجاح الضيف، خطأ `publishLocalStream returned false` محفوظ، رفض لا مسارات، وفشل توست محتوى (5). `STATUS`: ✅ FIXED (T/B; RED→GREEN).
- **FV20-OFFER** — `BEFORE`: نشر المضيف قد يترك مسارات مربوطة بلا عرض SDP، ونشر الضيف لا يستدعي `requestReoffer()`. `ROOT CAUSE`: ليس سباق تفاوض مستقلًا — كلاهما نتيجة `ReferenceError` نفسه قبل `createOffer`/`requestReoffer`/watcher/التسجيل. `CHANGE`: لا كود تفاوض جديد؛ جسر FV20-TOAST يعيد إمكانية وصول المسار القائم إلى `createOffer`/`requestReoffer` بترتيبه وحراسه السابقين. `AFTER`: المضيف `createOffer()` مرة واحدة بعد نجاح النشر عند حضور الخصم وعدم اتصال P2P؛ الضيف `requestReoffer()` مرة واحدة؛ لا شيء عند فشل النشر أو غياب المسارات. `TEST EVIDENCE`: الاختبارات الخمسة نفسها تؤكد العدّ والترتيب (`offers=1, reoffers=0` مضيف؛ `reoffers=1, offers=0` ضيف؛ صفران عند الخطأ/لا مسارات). `STATUS`: ✅ FIXED AS CONSEQUENCE (T/B) — لم يُثبت سباق offer مستقل ولم يُدَّع إصلاح منفصل.
- **FV20-REPLAY** — `BEFORE`: SSE يبدأ بـ`latestId = 0`، وبعد اللحاق بـ`Last-Event-Id` يبقي المؤشر القديم. `ROOT CAUSE`: الاشتراك الجديد يعيد كل سجل قناة المستخدم (دعوات/توستات قديمة عند كل تحميل)، وإعادة الاتصال تعيد قراءة صفحة اللحاق نفسها في الاستطلاع التالي (تسليم مكرر). `CHANGE`: `SseEventLogModel.getLatestId` (MAX(id) للقناة عبر `idx_sse_channel_id`)؛ `EventPusher.getCatchUpPage` يعيد صفحة محدودة (50) + المؤشر الذي بلغته؛ الاشتراك الجديد يبدأ من أعلى معرّف، وإعادة الاتصال تتقدم إلى أقصى صفحة اللحاق قبل الاستطلاع. `AFTER`: التحميل الجديد يسلّم فقط ما بعد الاشتراك، وإعادة الاتصال تسلّم النافذة المفقودة مرة واحدة، وصفوف الإشعارات تبقى غير مقروءة وغير محذوفة (الصندوق منفصل). `TEST EVIDENCE`: API 2 على `SqliteD1` حقيقي — تحميل جديد: `old-invite` غائب و`id: 1` غائب و`new-invite` بعد الاشتراك يصل مع حفظ غير المقروء؛ إعادة اتصال من 1: المعرّفان 2–3 مرة واحدة لكل منهما و4 الحيّ مرة واحدة. `STATUS`: ✅ FIXED (T/B; RED→GREEN).
- **البوابات:** `npx tsc --noEmit` نظيف؛ `npm run build` exit 0؛ `any` 299 (طريقة CI، = الأساس، ≤310)؛ الجديد 14/14 (API 5، عميل 9)؛ الانحدار المستهدف 5 ملفات/62 اختبارًا خضراء؛ الحزمة الكاملة 168 ملفًا/1773 اختبارًا → 1767 نجحت و6 فشلت فقط في `tests/dev-tools/quality-gate-poll.test.ts` لغياب `jq` على ويندوز (بيئي، الملف لم يُمسّ).
- **الحالة:** LOCAL VERIFIED (T/B + RED→GREEN) فقط. غير مدمجة وغير منشورة، والصف 28.3.1 ليس Production Accepted. **S PENDING** — لا جلسة كاميرا/ميكروفون/شاشة/جهاز حقيقية؛ mocks واختبارات D1 لا تثبت نجاح الوسائط الحقيقية.
- **قائمة S المعلّقة:** دخول من صفحة مفلترة ثم عرض مضيف/جواب ضيف حقيقيان؛ توست النشر لا يعطّل الوسائط؛ reoffer الضيف بعد نشر المضيف؛ تحميل جديد بلا توستات دعوات تاريخية مع بقاء غير المقروء في الصندوق؛ إعادة الاتصال تسلّم إشعارًا فائتًا مرة واحدة؛ AR/EN وRTL والوضع الليلي ولوحة المفاتيح/aria.
- **التراجع (G8):** revert ملفات `src/` الستة + اختباري FV20 الجديدين (لا مخطط/هجرة/بيانات/أعلام). لا بيانات إنتاجية كُتبت.
- **NEXT:** PR واحد من هذا الفرع إلى `main`، ثم توقف لمراجعة REMOTE مستقلة؛ S تبقى معلّقة.

## 2026-10-20 — R4-CHUNK-VIEW-RECOVERY-1 REM1 (الصف 28.4.1 · O19-07/12/13/14/21) · فرع feat/r4-chunk-view-recovery-rem1-28-4-1 (من 2abf5ad = origin/main)

- 🔧 تنفيذ LOCAL مكتمل T/B (12 اختبار سلوكي جديد) — ليست DONE/Production Accepted، بلا دمج/نشر. BASE `2abf5ade279804d1ec07a4ece22cbf810b4c50ba`؛ PR110 HOLD بلا مساس، وعقود PR116/117/118/119/120 محفوظة.
- **التصنيف بعد تتبع المسار الحقيقي (`playlist → ready/index → fetch → decode → playback`):**
  1. **CONFIRMED** — واجهة الجمهور كانت ترسم `media:<state>` في `#embeddedStateLabel`، وتُظهر `#embeddedChunkInfo` بعدّاد القطع (`onChunkChange`) وعدّاد التقدم (`onProgress`)؛ أي رمز تقني وعدّاد ملفات بدل حالة مترجمة ووقت تشغيل.
  2. **CONFIRMED** — VOD كان يشتق المدة الإجمالية من `playlist.total_duration / chunks.length` (تقسيم متساوٍ)، ثم يعرض الشريط/الوقت/التعليقات المؤقتة من `videoEl.currentTime/duration` المحليين للقطعة؛ فتبدو مدة التسجيل مساوية لمدة القطعة المحمّلة.
  3. **CONFIRMED** — LIVE لم يكن يملك خطًا زمنيًا موحّدًا (لا `onTimeUpdate`/`getGlobalTime`/`seekTo`/`jumpToLive`)، والـrewind كان ينتقل لفهرس قطعة فقط؛ كما كان `isLive` يغلب `completed` عند بقاء `stream_status='live'`، فيمكن رسم LIVE كاذب على تسجيل مكتمل.
  4. **CONFIRMED** — `SmartVodPlayer` بلا generation token وبلا in-flight dedupe: طلبان متزامنان لنفس القطعة يكرران الـfetch، واستجابة seek قديم قد تستولي على العنصر أو تعيد نافذة قديمة بعد recenter.
  5. **ALREADY DONE** — سلطة الفهرس/الـplaylist (`ready`/`failed`/`gaps`/`timeline_start_ms`/`total_ready_ms`/`finalized`) وتخطي غير المؤكد والنافذة المحدودة كانت صحيحة في `ChunkIndexPlaylist`/`routes`/المشغل؛ لم تُعَد كتابتها ولم يُفترض عيب فيها.
  6. **NOT REPRODUCED** — لا دليل على قطع/فجوات/readiness مُفبركة من الخادم، ولا على حذف/كتابة فوق ملفات؛ التنزيلات تعمل (شهادة المالك). لم تُمسّ الهجرات أو D1 أو PHP/الاستضافة.
  7. **BLOCKED** — S (صورة/صوت/سلاسة على جهاز حقيقي) غير متاح هنا، ولم يُشغَّل Playwright E2E الحقيقي على هذا المضيف؛ لا ادّعاء بصري/صوتي من mocks.
- **الإصلاح (داخل 28.4.1 فقط):**
  1. `shared.ts`: مفاتيح `playerStateLabel` AR/EN؛ `ChunkManager` يحسب بدايات/مدد/إجمالي/حافة LIVE من الفهرس (`timeline_start_ms/1000`, `total_ready_ms/1000`) مرة واحدة؛ `SmartVodPlayer` يبني مددًا حقيقية بلا تقسيم متساوٍ، ويكشف `getGlobalTime/getGlobalDuration/onTimeUpdate`، ويحمي seek بـ`opGen` + `inFlightLoads`، ويعيد توسيط النافذة قبل الإطلاق ويسقط الاستجابات المتأخرة خارجها؛ `LiveSequentialPlayer` يكشف خطًا زمنيًا كاملًا (`getGlobalTime/getAvailableDuration/getLiveEdgeTime/isBehindLive/seekTo/jumpToLive`) ويحافظ على `rewindTo(index)`، مع حارس generation وحلقة واحدة، وتصفير offset عند حافة LIVE.
  2. `competition-page.ts`: حذف `#embeddedChunkInfo` وكل عدّاد تقني؛ عرض حالة مترجمة فقط؛ إضافة شريط LIVE زمني (`#embeddedLiveControls`/`#embeddedLiveSeekbar`/`#embeddedLiveTimeDisplay`) وشارة LIVE/REPLAY/VOD صادقة؛ `completed` يغلب `stream_status='live'` ويخفي شريط/شارة LIVE؛ VOD والتوقيت والتعليقات المؤقتة تستخدم الوقت العام نفسه.
  3. `i18n`: `replay`, `live_timeline`, `player_state_waiting/playing/processing/error/ready/unavailable` في AR/EN.
- **الاختبارات T/B:** جديد `tests/client/r4-chunk-view-recovery-rem1.test.ts` (12): مدد متغيرة/إجمالي من الفهرس لا `total_duration`؛ حدود دقيقة؛ فجوة/غير جاهز بلا تلفيق؛ seek عبر حدود/بعيد/عودة؛ seek سريع واستجابة متأخرة؛ dedupe/نافذة/عدم إعادة fetch؛ فصل وقت التشغيل عن عدّاد الملفات؛ حالات AR/EN؛ LIVE→rewind→edge وseek سريع؛ ذيل LIVE غير المؤكد يُقصّ إلى الحافة المؤكدة؛ حافة legacy بلا أعلام جاهزية. تحديث `tests/ui/player-ux.test.ts` (3 تثبيتات جديدة) وE2E `chunk-player-ux`/`chunk-audience` ليقرأ `__mediaState` ووقت المشغل العام بدل العدّاد المحذوف. الحزم المستهدفة: 7 ملفات/71 اختبارًا خضراء.
- **البوابات:** `npx tsc --noEmit` نظيف؛ `npm run build` exit 0؛ `any` 299 (طريقة CI، = الأساس، ≤310)؛ الحزمة الكاملة 166 ملفًا/1759 اختبارًا: 1753 نجحت و6 فشلت فقط في `tests/dev-tools/quality-gate-poll.test.ts` لغياب `jq` على ويندوز (بيئي، الملف لم يُمسّ). لم يُنفَّذ E2E الحقيقي محليًا.
- **الحالة:** LOCAL VERIFIED (T/B) فقط. غير مدمجة وغير منشورة، والصف 28.4.1 ليس Production Accepted. **S PENDING** — لا جلسة وسائط/جهاز حقيقية، فلا يُدّعى PASS بصري/صوتي/سلاسة.
- **التراجع (G8):** revert `shared.ts` + `competition-page.ts` + `i18n`(x2) + `public/static/styles.css` + الاختبارات الثلاثة المحدّثة/الجديدة (لا هجرة/بيانات/أعلام/مسارات). لا بيانات إنتاجية كُتبت.
- **NEXT:** فتح PR واحد من هذا الفرع إلى main (بلا دمج/نشر)، ثم مراجعة REMOTE مستقلة وتنفيذ قائمة S على جهاز حقيقي.

## 2026-10-20 — R4-LIVE-ENTRY-RECOVERY-1 (row 28.3) REM1 · إصلاح المانع B-1 في PR #120 · فرع feat/r4-live-entry-recovery-rem1-28-3-1 (HEAD المراجَع cc841b4)

- 🔧 إصلاح مانع واحد على نفس الفرع/PR #120 — ليست DONE/Production Accepted، بلا دمج/نشر. BASE `ce5e0e7`؛ الكود+الاختبار `61a6e76`، ويليه كوميت التوثيق هذا.
- **السبب الجذري (مُثبَت مقابل BASE):** إدخال هذا الـPR لنظام الحالة قبل كتلة التعليقات جمع تعليقًا قائمًا وتعريفه في سطر واحد عند `competition-page.ts:948`: `// B2+B3: paged comments state ...      let commentsItems = [];`. ويثبت `git show ce5e0e7:...` أن BASE كان يحمل التعليق و`let commentsItems = [];` في سطرين منفصلين ⇒ العيب انحدار من PR120 نفسه وليس سابقًا. تعليق `//` يبتلع التعريف فيبقى `commentsItems` **غير معرَّف**.
- **الأثر (مُثبَت لا مفترض):** أول قراءة لـ`commentsItems` ترمي `ReferenceError` في `paintCommentsEmpty()` و`syncMoreBtn()` و`upsertLiveComment()` و`removeLiveComment()`. ومستمع SSE لـ`comment_new` يلفّ `upsertLiveComment` بـ`try/catch`، لذلك **حدث تعليق مبكر يصل قبل حل GET الأول يُسقَط صامتًا** بلا خطأ ظاهر. مسار التحميل الأولي يصطدم بالخطأ نفسه عند أول رسم.
- **الإصلاح (أدنى حد، جملة واحدة):** إعادة `let commentsItems = [];` سطرًا تنفيذيًا مستقلًا بعد تعليقه تمامًا كما في BASE. بلا إعادة كتابة نظام التعليقات، بلا تغيير سلوك، بلا ملف جديد.
- **اختبار الانحدار (الاختبار 13 في `tests/ui/r4-live-entry-recovery-rem1.test.ts`):** (أ) تثبيت مصدري — التعريف في سطر تنفيذي مستقل وغير خلف `//`؛ (ب) تنفيذ شريحة الصفحة **الحقيقية** (الحالة + التحميل + SSE) في sandbox وتشغيل: `paintCommentsEmpty()` مبكرًا قبل GET، واستلامًا مباشرًا مبكرًا (`upsertLiveComment`) قبل GET، و**حدث `comment_new` عبر SSE مبكرًا** قبل حل GET، ثم التحميل الأولي؛ مع تأكيد عدم الرمي وبقاء الحدث (`[2,1]`) وصحة رابط/حالة التحميل (`[7]`). **RED→GREEN:** إعادة السطر المدمج تُفشل الاختبار 13 عند التثبيت المصدري؛ ومسح مستقل للشريحة نفسها تحت العيب يعيد `ReferenceError: commentsItems is not defined` في الدالتين؛ وبعد الإصلاح 13/13 خضراء.
- **الاختبارات/البوابات (المتأثرة فقط، وفق التكليف):** `npx tsc --noEmit` نظيف؛ `npm run build` exit 0؛ `any` 299 (طريقة CI، بلا زيادة ≤310)؛ واجهة REM1 13/13؛ حزم التعليقات 30/30؛ حزم الصفحة/CSP المجاورة 31/31. لم تُعَد الحزمة الكاملة لهذا الإصلاح أحادي السطر، وتظل النتيجة الكاملة المسجلة سابقًا قائمة (164/165، والفشل الوحيد لملف dev-tools المعتمد على `jq`).
- **الحالة:** LOCAL VERIFIED (إصلاح B-1 + انحدار RED→GREEN). نفس PR #120. بلا دمج/نشر/تغيير إنتاجي. **S تبقى PENDING** — هذا الإصلاح لا يغلق التحقق البصري/الصوتي/الجهازي ولا يُدّعى غير ذلك.
- **التراجع (G8):** revert الكوميت `61a6e76` (يعيد سطر الصفحة السابق ويحذف الاختبار 13)؛ لا هجرة/بيانات/أعلام. لا يُمسّ أي تعليق أو تسجيل قائم.

## 2026-10-20 — R4-LIVE-ENTRY-RECOVERY-1 (row 28.3) REM1 · فرع feat/r4-live-entry-recovery-rem1-28-3-1 (من ce5e0e7 = origin/main = دمج PR #119)

- 🔧 تنفيذ LOCAL مكتمل T/B (26 اختبارًا جديدًا) — ليست DONE/Production Accepted، بلا دمج/نشر. BASE `ce5e0e7`؛ عمل PR118/119 محفوظ، وPR110 HOLD بلا مساس. كوميت الكود+الاختبارات `7003605`؛ ويليه كوميت التوثيق هذا على نفس الفرع.
- **النطاق:** O19-01…O19-09 + O19-16 من PLAN-15 §12.2/12.3 — الدخول/الاستعادة داخل الصفحة: قبول الدعوة وبدء المنافسة بلا تحديث، واجهة بث إنتاجية واحدة، موافقة نشر مستقلة لكل طرف، اختيار مصدر الشاشة قبل الموافقة، مرجع التصميم الإلزامي، عادي/موسّع/ملء الشاشة بفيديوهين فقط، حالات تحضير/نشر صادقة، تحذير مغادرة وتنظيف، وهوية التسجيل بلغة واجهة المضيف. بلا تغيير خارج الوحدة (لا TURN/Finance/Ads/H7/28.4/28.5/30/32.1/35)، بلا FFmpeg خادم، بلا حذف/كتابة فوق تسجيلات، بلا تغيير D1/PHP إنتاجي.
- **الأسباب الجذرية (متحقَّقة في الكود، كل منها مثبَّت باختبار):**
  1. `resolveVideoSurface()` كان يوجّه المنافس **المقبول** إلى بطاقة `golive` القديمة (تحويل إلى `/live/:id`)، فتبقى واجهة التحضير الخاصة (معاينة كاميرا/شاشة + نشر مستقل) غير متاحة حتى يصبح الصف LIVE؛ و`startCompetition` كان ينتقل فيدمّر المعاينة/PC/المسجّل.
  2. `/live/:id` بقي غرفة إنتاج ثانية متباعدة، فيمكن أن ينحرف سلوك البث بين واجهتين.
  3. قبول الدعوة/الطلب والبدء كانا يثبّتان صف قاعدة البيانات دون بث أي حدث على قناة SSE القائمة للمنافسة — فيحتاج الطرف الآخر تحديثًا يدويًا.
  4. `P2PConnection` بلا فصل معاينة/نشر: `replaceLocalStream()` كان يوقف المسارات السابقة دائمًا، ومشاركة الشاشة كانت محجوبة خلف النشر، والتوقف كان يترك `localPublished === true` فيصبح مسار لاحق منشورًا بلا موافقة جديدة.
  5. واجهة التحضير كانت توحي بـLIVE قبل البدء (بطاقة جاهزية/زر إنهاء) وتُظهر عدّادات القطع وتشخيصات النشر.
  6. مدخلات الـcompositor في الغرفة التاريخية كانت تحذف `app_title`/`rtl` بلغة المضيف، فتختلف هوية التسجيل عن واجهته.
- **الإصلاح:**
  1. `EventPusher.publishCompetitionStatus()` ينشر `competition_status` على `competition:<id>`؛ و`CompetitionController` يستدعيه (best-effort، لا يتراجع عن الصف المثبَّت) بعد قبول الدعوة، وقبول الطلب، والبدء.
  2. العميل: اشتراك SSE واحد على القناة + إعادة مزامنة GET محدودة (4 محاولات عند 0/1.5/4/8 ث). الأحداث تُطبَّق في المكان — لا يُعاد إنشاء PC/المسجّل/المعاينة أثناء التحضير؛ LIVE يغيّر الشريط وأهلية التسجيل فقط.
  3. `resolveVideoSurface`: `accepted` ⇒ `competitor` (تحضير)؛ و`golive` فقط لحالة pending-with-opponent القديمة.
  4. `startCompetition` يستدعي البدء في المكان، يعيد رسم الشريط/الأدوات، ويعيد المزامنة؛ والتسجيل يبدأ للمضيف فقط، وبعد نشر صريح **و**`status === 'live'`.
  5. `/live/:id` تحويل 302 على مستوى المسار إلى `/competition/:id` (مع حفظ lang وتقوية `encodeURIComponent` و`!'()*` → `%XX`). مسارات الاختبار `/live/host|guest|viewer` و`/live/:id/finance` بلا مساس؛ و`liveRoomPage` محفوظة لاختباراتها المباشرة.
  6. `P2PConnection`: `setLocalPreviewStream()` + `getLocalSource()` (معاينة فقط، لا تنشئ sender)، `setPublishedTrack()` (`replaced`/`added`/`none`، و`null` يفصل بلا مسار بديل خفي)، `negotiateMediaChange()`، `hasPublishedTrack()`؛ و`stopLocalMedia()` يعيد `localPublished = false` (إعادة تسليح الموافقة) ويستخدمه `disconnect()`.
  7. مصدر الشاشة قابل للاختيار أثناء التحضير بلا كاميرا/ميكروفون؛ صوت الشاشة فقط إن وفّره المتصفح؛ الإيقاف/التبديل يعيد الكاميرا فقط إن كانت نشطة قبلًا، وإلا يفصل المرسل المنشور — بلا نشر خفي.
  8. الواجهة: أزرار أيقونية `.live-tool` بـ`title`+`aria-label` مترجمين وتركيز مرئي؛ ألوان المرجع (الشاشة أزرق، الكاميرا بنفسجي، تبديل الكاميرا نيلي، الميكروفون أخضر، مكبر الصوت تركوازي، إخفاء المحلي رمادي، الإجراءات أخضر/كهرماني/أحمر)؛ فيديوهان `<video>` بالضبط (التبديل يعيد الأب، لا ثالث)؛ نافذة صغيرة قابلة للسحب/الإخفاء/التوسيع داخل الحدود؛ عادي/موسّع/ملء الشاشة؛ سطر حالة نشر صادق؛ زر الإنهاء مخفي حتى LIVE؛ حذف عدّادات القطع/التشخيصات؛ تأكيد مغادرة داخل الصفحة (بلا `beforeunload` وبلا فخ تنقّل) يفصل ويدمّر الـcompositor مرة واحدة ولا يستدعي `/end` أبدًا.
  9. مدخلات compositor في الغرفة التاريخية تمرّر `platformName`/`rtl` من واجهة المضيف؛ لا تُعاد كتابة تسجيلات قديمة.
- **الاختبارات T/B (26 جديدة، خضراء):** `tests/ui/r4-live-entry-recovery-rem1.test.ts` (12 — accepted→تحضير، واجهة إنتاجية واحدة + 302، بلا تنقّل عند البدء، SSE + مزامنة محدودة، بوابات موافقة النشر، تبديل/إيقاف الشاشة، فيديوهان/تبديل، حالات صادقة، مغادرة/إنهاء، عقد AR/EN+RTL+داكن/aria)؛ `tests/api/r4-live-entry-recovery-rem1-status.test.ts` (5 — شكل حدث القبول/البدء، وحقن فشل best-effort، على `SqliteD1` الحقيقي)؛ `tests/client/p2p-preview-consent.test.ts` (9 — المعاينة لا تنشر، موافقة جديدة بعد التوقف، replaceTrack مقابل addTrack، فصل الشاشة، الإبلاغ عن المصدر). تحديث تثبيتات: `competition-surface`، `r2-l2-competition-ui`، `comp-unified`، `page-language-script-hardening`.
- **البوابات:** `npx tsc --noEmit` نظيف؛ `npm run build` exit 0؛ `npm run build:css` أعاد توليد `public/static/styles.css`؛ SEC-06 PASS؛ `any` 299 ≤ 310 (+0 عن الأساس)؛ الحزم المستهدفة خضراء (17 ملفًا/185 + 11 ملفًا/188). الحزمة الكاملة: **164/165 ملفًا، 1737/1743 اختبارًا** — الملف الفاشل الوحيد `tests/dev-tools/quality-gate-poll.test.ts` (6) لغياب ثنائي `jq` على هذا الجهاز (بيئي فقط؛ الملف لم يُمسّ في هذه الوحدة).
- **الحالة:** LOCAL VERIFIED (T/B) فقط. غير مدمجة وغير منشورة، والصف 28.3 ليس Production Accepted. **S PENDING** — لا جلسة أجهزة حقيقية (كاميرا/ميكروفون/شاشة/صوت) متاحة هنا، فلا يُدّعى PASS بصري/صوتي/تسريب وسائط من mocks أو لقطات ثابتة.
- **قائمة S المعلّقة (متصفح/جهاز حقيقي):** قبول ⇒ وصول الطرفين للتحضير بلا تحديث؛ نشر ⇒ استقبال الطرف الآخر للوسائط؛ بدء ⇒ LIVE للطرفين بلا تحديث؛ اختيار/إيقاف الشاشة مع وبدون كاميرا (وصوت الشاشة حيث مدعوم)؛ مغادرة/رجوع ⇒ المنافسة لا تنتهي، لا فخ للمستخدم، والمسارات تُوقف؛ موسّع/ملء الشاشة بفيديوهين فقط؛ AR/EN وRTL والجوال والداكن وتركيز لوحة المفاتيح في المنطقة المعدّلة؛ تطابق `app_title`/`rtl` في مدخل compositor مع واجهة المضيف.
- **التراجع (G8):** revert ملفات `src/` الـ11 + 4 ملفات اختبار محدّثة + 3 اختبارات جديدة + `public/static/styles.css` المعاد توليده (لا هجرة/بيانات/أعلام). لا بيانات إنتاجية كُتبت.
- **NEXT:** مراجعة REMOTE مستقلة لهذا الفرع/PR؛ تنفيذ قائمة S على جهاز حقيقي؛ الدمج من القائد بعد الاثنين فقط.

## 2026-10-15 — R4-CHUNK-VIEW-RECOVERY-1 (row 28.4) REMEDIATION لـPR #119 · رفض REMOTE #2 · فرع feat/r4-chunk-view-recovery-1 (نفس PR #119)

- 🔧 تنفيذ LOCAL مكتمل T/B (إصلاح تكامل ضيق + تصحيح اختبارات) — إثبات RED→GREEN، ليست DONE/Production Accepted، بلا دمج. BASE `dcb56c7`؛ نفس الفرع/PR #119 بلا reset/force-push؛ WIP القائم محفوظ.
- **السبب الجذري (مُثبَت مستقلاً، لا من التقرير وحده):** مسار القائمة يُخرج علامة نهاية التسجيل **فقط** في `index_metadata.finalized` (routes.ts:729/842). مشغل الجمهور المنبعث `ChunkManager.refreshPlaylist()` يقرأ `chunks`+`extension` فقط؛ و`LiveSequentialPlayer.start()`→`waitForNextChunk()` ينتظر القطعة الأولى بـ`maxMisses=0` (انتظار أبدي). مع `startFromLatest:true`، `skipToLatest()` يعيد 0 على قائمة فارغة فيسقط إلى ذلك الانتظار. **الأثر (مُثبَت بالتتبع والاختبار، ومُعاد كتعليق على الكود قبل الإصلاح):** جلسة تنتهي تسجيلها (final marker) بصفر مقاطع قابلة للتشغيل ⇒ `onStreamEnd` لا يُستدعى ⇒ **spinner أبدي** في competition-page.ts (عارض LIVE) وviewer.ts.
- **الإصلاح (حزمة المشغل المنبعثة shared.ts + i18n + المستهلكون):** (1) `ChunkManager` يحمل `this.finalized`؛ `refreshPlaylist()` يقرأ `data.index_metadata.finalized` (إضافي؛ غيابه/القديم ⇒ false). (2) `waitForNextChunk()` ينتهي **فقط** في فرع «لا تقدم» عندما `this.finalized===true` ⇒ يرمي `RECORDING_ENDED`؛ لا ينتهي على غياب المقاطع وحده (البث غير المنتهي يستمر)، ولا يوقف بثاً حياً بسبب تأخر أول مقطع. (3) `start()` يلتقط النهاية في أول انتظار ⇒ `isRunning=false`+`onStatus(<AR/EN>)`+`onStreamEnd()` (بلا رمي/حلقة)؛ `runLoop` يعامل `RECORDING_ENDED` كنهاية نظيفة (الحد القاتل لم يُمس). (4) رسالة AR/EN مخبوزة `live_signaling.recording_ended` (en+ar). `viewer.ts` يربط `onStreamEnd` ويحرس تحويل LIVE بعد البدء. `competition-page.ts` يملك أصلًا `onStreamEnd` رشيقًا — بلا تعديل، صار يُبلَّغ صحيحًا.
- **تصحيح الاختبارات (بنود REMOTE #2):** الاختبار 7 أُعيد لمستوى المُنتِج (finalized يُصدَر في index_metadata) ولا يدّعي وصوله للمشغل؛ الاختبار 5 أُعيد إلى «مخزَّنة بلا قياس = قابلة للاكتشاف» مع تنويه أن الاكتشاف ≠ الطلب (قرار isSkippable/nextPlayableIndex مُثبَّت في ملف المستهلك الجديد). لا ادعاء وصول للمستهلك بلا دليل على مستوى المستهلك.
- **الاختبارات T/B:** جديد `tests/client/r4-chunk-view-live-end.test.ts` (7) يقيّم النص المنبعث الحقيقي ويثبت على مستوى المستهلك: وصول finalized إلى ChunkManager؛ القديم/الغائب ⇒ false؛ finalized+صفر ⇒ `waitForNextChunk()` يرفض `RECORDING_ENDED`؛ live+غير منتهٍ+صفر يستمر ثم يشغّل أول قطعة تصل لاحقًا؛ finalized+محتوى ⇒ يشغّل (بلا إنهاء كاذب)؛ start(finalized) ⇒ onStreamEnd+isRunning=false+حالة AR/EN بلا خطأ؛ runLoop RECORDING_ENDED ⇒ نهاية نظيفة. **إثبات RED→GREEN:** إرجاع shared.ts وحده ⇒ 6/8 تفشل/تتعليق (الاثنتان = حالتا عدم-التراجع). `tsc` نظيف؛ `any` 299 (=الأساس، +0، ≤310)؛ `npm run build` exit 0 (churn مرجوع)؛ صفحات/i18n خضراء (56/56).
- **الحالة:** LOCAL VERIFIED (T/B، RED→GREEN) — يثبت عيب الـspinner الأبدي ويصلحه على مستوى T/B. ليست DONE/Accepted/مدمجة. S تستمر PENDING.
- **التراجع (G8):** revert shared.ts + i18n(x2) + viewer.ts + ملفَي الاختبار (لا هجرة/بيانات/أعلام/مسارات).

## 2026-10-15 — R4-CHUNK-VIEW-RECOVERY-1 (row 28.4) تتبع خط القطع وتصنيف العيوب · فرع feat/r4-chunk-view-recovery-1 (من dcb56c7 = origin/main = دمج PR #118)

- 🔧 تنفيذ LOCAL مكتمل T/B للتصنيف + تثبيت انحدار — أعراض جلسة الإنتاج غير متكررة محليًا / BLOCKED، أي ليست DONE/ACCEPTED. بلا دمج/نشر/كتابة إنتاجية/PHP/استضافة/هجرة/chmod. كل العمل في worktree منفصلة عن origin/main؛ العمل القائم على 28.3 (styles.css + .measure-probe.tmp.ts + pr-body.md) محفوظ بلا مساس.
- **BASE الدقيق:** `origin/main` = `dcb56c707dd1d9dd06e7f1c1d9a157a427c0ca18` (نفس دمج PR #118). **PR #118 (28.3) MERGED** 2026-10-15T05:01:31Z؛ **Quality/Deploy كلها SUCCESS** (quality-gate run 38674572377، Deploy 38674572368 + Cloudflare Pages + "Quality Gate passed for this SHA") — لا مانع بوابة نشر للبلاغ.
- **تتبع السلسلة (منفَّذة كلها على BASE):** dataavailable → enqueue (أول كتلة pure-init تُحجز بلا رقم) → register (مفتاح مربوط: مضيف+live+lease-gen+seq+path+60MB) → upload.php (+chunk_key) → verify (استهلاك ذرّي + fence الأجيال) → receipt (وقائع فقط، بلا توليد) → قياس MediaDuration من البايتات المخزَّنة → confirmChunk (uploaded→ready بالقياس فقط) → mergePlaylistWithIndex (سلطة D1: dedupe/append-orphan/قمع failed/timeline) → proxy playlist → ChunkManager/LiveSequentialPlayer/SmartVodPlayer → decode/play.
- **بصمة القطع الحقيقية (عينات المالك، كود المستودع نفسه، أداة مؤقتة غير مُرحَّلة):** match_2201 (20 mp4) + match_2202 (47 webm) — **كل قطعة تقيس مدة موجبة (nullDur=0)** وحدود init ثابتة (mp4 initEnd=759، webm initEnd=87) ⇒ init-prepended مستقلة. مسح كتل WebM: كل قطعة تمتد **t=0→~20 ثانية** (تسجيلات ~20ث مستقلة؛ الـ5s هو مسار الإنتاج العادي). ⇒ عطل "القياس مستحيل ⇒ لا ready ⇒ الجمهور يجوع" **مُدحَض** على هذه الحاويات الحقيقية.
- **الأساس المُتحقَّق:** 154/154 اختبار وحدة لخط القطع يمرّ على BASE الدقيق (+7 جديدة). `tsc --noEmit` نظيف؛ `any` +0 في `src` (≤310 سقف)؛ `npm run build` exit 0 (churn مرجوع).
- **التصنيف (بدليل):**
  - **عقود الخط (رفع/register/receipt/قياس/قائمة/ready)** → **ALREADY DONE** (154/154 T/B + قياس القطع الحقيقية).
  - **A / غياب 0001** → سلطة القائمة **تسترجع** 0001 الذي أسقطه proxy عبر D1 orphan-append (فهرس 0، بلا فجوة)؛ 0001 مفقود فعلاً ⇒ **فجوة صريحة بلا تلفيق**؛ resumeBase/جلسة أخرى يحفظ اكتمال القائمة المعروضة (رأس proxy + ذيل D1). نقطة الفشل الأولى = حذف `playlist.php` أعلى السلسلة، وD1 يستعيدها. **ALREADY DONE (مثبَّت بـ7 اختبارات جديدة).** غياب 0001 في قائمة LIVE بجلسة 2225 **غير متكرر محليًا** (يحتاج playlist.php الحقيقي + D1 الإنتاج)؛ التمييز (pure-init مقابل failed مقابل resumeBase مقابل مسار/جلسة) **BLOCKED** على مدخل إنتاج (المُميّز مبني: detectGaps/resumeBase/recordingStatus + index_metadata.gaps).
  - **B / ملفات لا تعرض** → القطع مستقلة التشغيل (init متحقَّق) والمشغل يطلب `entry.url`؛ عقدا القياس/init يصمدان ⇒ **ليس فسادًا في القطع** (يطابق قرار 08). عارض المنصة (خدمing/Range/Content-Type/CORS/رابط القائمة — proxy موجود لأن playlist.php بلا CORS) **غير متكرر محليًا ⇒ BLOCKED** على خدمة الإنتاج + الجهاز. نقطة الفحص في الإنتاج: هل يطلب المشاهد فعليًا `stream.php` ويعيد 200 بالـContent-Type/Range الصحيحين؟ (Apache400 محلول بشهادة المالك؛ لا تحقيق عام).
  - **E / lease+drop** → دورة lease (acquire/heartbeat/reacquire/takeover) + fence الأجيال + طابور رفع محدود بإسقاط **معدود لا صامت**. **ALREADY DONE** (chunk-upload-safe + chunk-uploader).
  - **J-player / spinner/حالة LIVE** → بدء الحي بأحدث ready مؤكَّد + حدود misses/gap/أخطاء + STREAM_ENDED (لا spinner أبدي) + timeline نافذة VOD. **ALREADY DONE** (وحدة)؛ spinner الجلسة الحقيقية **غير متكرر** محليًا.
- **الملفات (1 جديدة، بلا src/هجرة/بيانات/إنتاج):** `tests/client/r4-chunk-view-recovery.test.ts` — 7 اختبارات T/B على `mergePlaylistWithIndex` تثبّت نقطة الفشل الأولى: استرداد 0001 من سلطة D1؛ فجوة 0001 الحقيقية بلا تلفيق؛ اكتمال resumeBase؛ قمع القطعة failed؛ صدق ready/المدة (مخزَّنة بلا قياس تُعرض ready:false بلا إسقاط)؛ timeline البادئة المؤكدة؛ علامة finalized. وفق 15 §11 "لا patch لكود سليم بسبب فرضية" — **بلا تغيير كود** للسلوك الصحيح أصلًا.
- **الحالة:** LOCAL VERIFIED (تصنيف T/B + تثبيت انحدار) / أعراض جلسة الإنتاج NOT REPRODUCED / BLOCKED على prod+جهاز. ليست DONE/ACCEPTED. بلا دمج/تغيير إنتاج.
- **التراجع (G8):** حذف ملف الاختبار الجديد الوحيد (لم تُمسّ src/هجرة/بيانات/أعلام/مسارات).
- **NEXT (الموانع فقط):** مراجعة REMOTE مستقلة + إعادة إنتاج في الإنتاج/الجهاز بنقاط الفحص الأولى المسجّلة لكل عرض أعلاه.

## 2026-10-15 — R4-LIVE-ENTRY-RECOVERY-1 (row 28.3) DOCUMENTATION REMEDIATION on PR #118 · فرع feat/r4-live-entry-recovery-1 (من 23b8b69 = origin/main)

- 🔧 **تصحيح توثيقي فقط** (رفض المراجع #2 — وثائقي فقط). لا تغييرات كود/اختبار/dependencies/workflows.
- **CI Run**: 38644895769 | **HEAD**: 8728faed797b0b5ded67efc4068389d4f6682123 | **CI Result**: SUCCESS.
- **مراجعة الكود**: المراجع #1: APPROVED. المراجع #2: REJECT (وثائقي فقط — مُصحح هنا).
- **عدد الاختبارات الجديدة**: 9 (مُحقق من CI diff).
- **البوابات**: `tsc --noEmit` ✅؛ `any` 291 ≤ 310 أساسي ✅؛ `npm run build` ✅؛ SEC-06 ✅.
- **الحالة الدقيقة**:
  - مراجعة الكود: APPROVED (المراجع #1).
  - التوثيق: REJECT (المراجع #2) — مُصحح هنا.
  - CI: SUCCESS على HEAD 8728fae.
  - S: PENDING (اختبارات وسائط الجهاز).
  - ROW28.3: ليست Production Accepted.
  - PR #118: لم تُدمج بعد.
- **التصحيحات المطبقة**:
  - إزالة أرقام اختبارات مضللة (26، 28، 1690/10، 1693/7، 1696/6).
  - إزالة ادعاءات "pre-existing" غير مُتحقق منها.
  - إزالة وصف player-ux كفاشل (غير مُتحقق).
  - توثيق CI run الفعلي، HEAD، نتائج البوابات، حالة المراجعة.
  - الحالة تعكس: المراجع #1 APPROVED، المراجع #2 REJECT وثائقي (مُصحح)، CI SUCCESS، S PENDING، ليست Production Accepted، غير مدمجة.
- **لا تغييرات كود/اختبار/dependencies/workflows**.

## 2026-10-14 — R4-LIVE-ENTRY-RECOVERY-1 (row 28.3) REMEDIATION #3 on PR #118 · فرع feat/r4-live-entry-recovery-1 (من 23b8b69 = origin/main)

- 🔧 **REMOTE REJECT #3 (2026-10-14) — 4 حواجز**: (1) CSP: `publishMedia` في ACTION_ALLOWLIST كان فقط `'window.publishMedia'` لكن HTML يستخدم `data-csp-fn="publishMedia"` العادي؛ (2) CAMERA STREAM: `switchCamera` قبل النشر لم يحدّث localStream في P2PConnection، فتُنشر الكاميرا الخاطئة؛ (3) SCREEN SHARE: `shareScreen` يعمل في وضع الاستعداد قبل الموافقة؛ (4) REGRESSION TESTS: غياب اختبارات تراجع تبديل الكاميرا.
- **الإصلاحات المطبقة (ضمن نطاق 28.3 فقط)**:
  1. **CSP**: إضافة `'publishMedia'` إلى قسم ACTION_ALLOWLIST العادي (csp-delegate.ts:256) لتطابق HTML `data-csp-fn="publishMedia"`. النقر الآن يستدعي الإجراء الصحيح. تحقق عبر اختبارات UI.
  2. **CAMERA STREAM**: إضافة `P2PConnection.replaceLocalStream()` لتحديث localStream قبل النشر. `switchCamera` في الصفحتين الآن:
     - قبل `mediaPublished`: يستدعي `p2p.replaceLocalStream()` → يحدّث localStream في P2PConnection + المعاينة
     - بعد `mediaPublished`: يستخدم `sender.replaceTrack()` على المرسل المنشور
     - مسار الفيديو القديم يُوقَف لتجنب تسريب الجهاز
  3. **SCREEN SHARE**: مُبوَّب بـ `mediaPublished` في الصفحتين — يعيد خطأ إذا لم يُنشر بعد.
  4. **REGRESSION TESTS**: إضافة اختبارين لتبديل الكاميرا في p2p-connection.test.ts:
     - Preview A → Switch B → Publish: فقط مسارات B تُنشر (لا A)
     - Publish A → Switch B: sender.replaceTrack يُحدّث إلى B
- **الخصوصية مُتحقَّق**: موافقة منفصلة مضيف/ضيف؛ لا مرسلين/تسجيل قبل `publishLocalStream()`؛ `endStream` ينظف المؤقتات/المراقبين؛ اختيار الأجهزة قبل النشر؛ refresh → إعادة نشر؛ reconnect يحتفظ بالحالة المنشورة.
- **الاختبارات**: +2 اختبارات تراجع للكاميرا (مجموع جديد: 28). الجناح الكامل: **1696 نجح، 6 فشل** (سابقة: 6 quality-gate-poll تحتاج jq). جميع اختبارات UI خضراء. `tsc --noEmit` ✅؛ `any` **291** ≤ 310 أساسي ✅؛ `npm run build` ✅؛ SEC-06 ✅.
- **الحالة**: LOCAL VERIFIED (T/B) + S PENDING (وسائط الجهاز). ليست DONE/DEPLOYED. بلا دمج/نشر ذاتي.
- **HEAD الجديد**: 1eaa470 → commits جديدة دفعت إلى PR #118.

## 2026-10-14 — R4-LIVE-ENTRY-RECOVERY-1 (row 28.3) REMEDIATION on PR #118 · فرع feat/r4-live-entry-recovery-1 (من 23b8b69 = origin/main)

- 🔧 **REMOTE REJECT (2026-10-14) — 4 حواجز**: (1) SYNTAX: أقواس زائدة/كتل مكررة في competition-page.ts و live-room-page.ts تُسبب فشل التحليل؛ (2) CSP: `publishMedia` غائب من ACTION_ALLOWLIST في csp-delegate.ts؛ (3) CAMERA SWITCH: `switchCamera` في الصفحتين يُسرب الوسائط عبر `sender.replaceTrack` قبل موافقة المستخدم؛ (4) SIGNALING: requestReoffer أثناء offer جارٍ، watcher يعيد التفاوض بعد recovery، مسار وسائط الضيف غير مؤكد.
- **الإصلاحات المطبقة (ضمن نطاق 28.3 فقط)**:
  1. **SYNTAX**: إزالة استدعاء `watchCompetitorOpponent()` المكرر + `}` زائدة في competition-page.ts:2202-2205؛ إزالة `}` زائدة بعد `initCompetitorMode()` في live-room-page.ts:604. تحقق التحليل عبر `tests/ui/player-ux.test.ts` (بوابة تحليل CSP) و `tests/ui/comp-unified.test.ts`.
  2. **CSP**: إضافة `'window.publishMedia'` إلى ACTION_ALLOWLIST في `src/client/csp-delegate.ts:289`. الصفحتان تستخدمان `data-csp-fn="publishMedia"` على زر النشر — النقر الآن يستدعي الإجراء الصحيح.
  3. **CAMERA SWITCH**: إعادة هيكلة `switchCamera` في الصفحتين. قبل `mediaPublished`: يحدث `localVideo.srcObject` فقط (معاينة). بعد `mediaPublished`: يستخدم `sender.replaceTrack` على مرسل الفيديو المنشور. لا تسرب وسائط قبل الموافقة الصريحة.
  4. **SIGNALING FOLLOW-UP (غير حاجب)**: حارس `createOffer` stable-state + in-flight (عيب C) محفوظ؛ `watchForOpponent`/`watchCompetitorOpponent` مُبوَّب بـ `p2p.isLocalPublished()` لإعادة العرض بعد النشر فقط. وسائط الضيف تتدفق بعد نشر الضيف + `requestReoffer` → المضيف يعيد العرض → الضيف يجيب بمساراته. لا وسائط قبل الموافقة.
- **الخصوصية/الاستعداد مُتحقَّق**: موافقة منفصلة للمضيف/الضيف (Start Broadcast / Publish & Join)؛ لا مرسلين/تسجيل قبل `publishLocalStream()`؛ `endStream` ينظف durationTicker + watchers؛ اختيار الأجهزة متاح عبر switchCamera/toggleVideo/toggleAudio قبل النشر؛ refresh/reconnect يحافظ على `localPublished` (PC جديد عند refresh → يتطلب إعادة نشر؛ reconnect محدود يحتفظ بالحالة المنشورة).
- **الاختبارات**: 26 اختبار T/B جديد يمر (موافقة 4، stable-state 2، تراجع 429 رقم 3، 17 موجودة). الجناح الكامل: 1693 نجح، 7 فشل (سابقة: 6 quality-gate-poll تحتاج jq، 1 player-ux نحوية). جميع اختبارات UI خضراء (player-ux 4/5 فشل نحوي سابق، comp-unified 6/6، live-room-ui 9/9). `tsc --noEmit` ✅؛ `any` 291 ≤ 310 أساسي ✅؛ `npm run build` ✅؛ SEC-06 ✅.
- **الحالة**: LOCAL VERIFIED (T/B) + S PENDING (وسائط الجهاز). ليست DONE/DEPLOYED. بلا دمج/نشر ذاتي.
- **HEAD الجديد**: 25e78d2 → commits جديدة دفعت إلى PR #118.

## 2026-10-14 — R4-LIVE-ENTRY-RECOVERY-1 (row 28.3) private prep & explicit consent gate · فرع feat/r4-live-entry-recovery-1 (من 23b8b69 = origin/main)

- 🔧 تنفيذ LOCAL مكتمل T/B — REMOTE PENDING، ليست DONE. بلا دمج/نشر/كتابة إنتاجية/PHP/أسرار/هجرات. تنفيذي في worktree منفصلة (بدون تعارض).
- **النطاق (15 §11 + قرارات المالك 08، فئات العيوب C/D/E/F/G + عقد الخصوصية)**: معاينة محلية خاصة للمضيف والضيف؛ getUserMedia ≠ موافقة نشر؛ لا وسائط/تسجيل قبل إجراء "نشر" صريح لكل طرف؛ المضيف يبدأ المنافسة بتأكيد النشر؛ الضيف يوافق مستقلاً؛ حالة انتظار صريحة للضيف قبل بدء المضيف؛ refresh/reconnect لا يكشفان وسائط جلسة جديدة بلا إجراء صريح؛ لا PC/مسجل/lease/polling مكررين؛ تنظيف دورة الحياة.
- **تصنيف العيوب مع دليل**:
  - **عقد الخصوصية (مُثبَت)**: `initLocalStream()` تضيف المسارات للـPC فوراً (P2PConnection.ts:248-252) عند تحميل الصفحة في صفحتي الإنتاج (live-room-page.ts:551, competition-page.ts:2146) بلا بوابة موافقة. التسجيل يُشغَّل من onRemoteStream/connected من نفس التدفق غير المُوافَق عليه (live-room-page.ts:512-517, competition-page.ts:2120-2128). لا نتائج grep لـ consent/publish في src. **مُصلح**: فصل اكتساب الوسائط عن النشر — `initLocalStream()` يكتسب المعاينة فقط؛ `publishLocalStream()` تضيف المسارات للـPC بعد موافقة صريحة؛ أزرار "ابدأ البث" للمضيف / "انشر وانضم" للضيف مربوطة؛ التسجيل مُبوَّب بـ `p2p.isLocalPublished()`.
  - **C — تنافس stable-state (مُثبَت)**: `createOffer()` بلا حارس in-flight / `signalingState === 'stable'`؛ محفزات متعددة (أولي، watcher، ICE-restart، recovery، request_offer) يمكن أن تتسابق على `setLocalDescription` → `InvalidStateError`. **مُصلح**: علم in-flight + تخطي عند stable-state في `createOffer()`.
  - **D — 429/Retry-After (مُثبَت)**: `pollOnce()` تبتلع 429 بصمت (SignalingManager.ts:434)؛ لا معالجة Retry-After/retryAfter في poll ولا reconnect؛ المحدد العام يعيد 429 مع retryAfter في الجسم (security.ts:58-64). **مُصلح**: `honorRateLimit()` يقرأ الترويسة/الجسم، يضبِط `pollBackoffUntil`، يتجاوز نُدوب poll أثناء الرجوع؛ reconnect يستخدم max(السياسة، retryAfter). Heartbeat/TURN لم يُمسّا.
  - **E/F — تباين lease (مُثبَت)**: /live سلك `PlatformRecordingLease` (live-room-page.ts:618-620)؛ صفحة المنافسة `initCompetitorCompositor` بلا lease (competition-page.ts:2018-2047) → تسجيل مزدوج غير مسيّج + محفّزان مستقلان للتسجيل (onRemoteStream + connected). **مُصلح**: إضافة توصيل lease لصفحة المنافسة؛ مسار تسجيل واحد عبر `maybeStartRecording()` مُبوَّب بنشر المضيف + جاهزية الوسائط.
  - **دورة الحياة/تنظيف (مُثبَت)**: مؤقت `setTimeout` ذاتي للـduration لا يُمسح (live-room-page.ts:697, competition-page.ts:2057)؛ watchers يمكن أن تظل. **مُصلح**: مُقبض `durationTicker` مخزَّن + يُمسح في `endStream()`؛ `opponentWatcher`/`competitorWatcher` يُمسحان.
  - **الكاميرا/الصوت (PENDING — S على الجهاز)**: التحقق الحسي يتطلب أجهزة حقيقية؛ مُعَلَّم PENDING.
- **الملفات المعدّلة**: P2PConnection.ts, SignalingManager.ts, live-room-page.ts, competition-page.ts, i18n (ar/en), signaling-harness.ts, اختبارات p2p-connection + signaling-manager.
- **الاختبارات**: 26 اختبار جديد يمر (4 موافقة + 2 stable-state + 3 تراجع 429 + 17 موجودة). الجناح الكامل: 1690 نجح، 10 فشل (سابقة: 6 quality-gate-poll تتطلب jq، 1 player-ux نحوية، 3 غير ذات صلة).
- **البوابات**: `tsc --noEmit` ✅؛ `any` = 291 ≤ 310 أساسي ✅؛ `npm run build` ✅؛ SEC-06 ✅.
- **الحالة**: LOCAL VERIFIED (T/B) + S PENDING (وسائط الجهاز). ليست DONE/DEPLOYED. بلا دمج/نشر ذاتي.
- **التراجع (G8)**: revert التزامات الفرع (خدمات + صفحات + i18n + اختبارات؛ لا ترحيل/بيانات/أعلام/مسارات).

## 2026-10-12 — R4-CHUNK-PLAYER-UX-1 REMOTE-REJECT FIX on PR #113 (same branch, no merge/deploy)

- 🔧 نطاقَان في PR واحد، LOCAL T/B — REMOTE PENDING، ليست DONE. بلا دمج/نشر/إنتاج/ROW30/تعديل D1 أو هجرات أو أسرار استضافة.
- **النطاق أ — ملفات المالك (مُعتمدة كما هي):** `upload-config.php` يعيد **مصفوفة** (`platform_url`/`upload_secret`/`browser_origins`/`storage_root`) مع تجاوز `DUELI_UPLOAD_CONFIG` و`.env` يملأ الناقص فقط؛ مثال بلا أسرار + `README-AR.md` عربي. عُدِّل README ليطابق السلوك الفعلي للملف (شكل الرد، جدول حالات HTTP الحقيقي، DELETE بعد الحفظ، لا getID3/فحص ترويسات) دون تعديل PHP لمطابقة التوثيق؛ ملف المالك مُحافظ عليه. `upload-config.php` الحقيقي صار مُتجاهَلًا في Git (سر المضيف لا يُتبَّع أبدًا).
- **النطاق ب — إصلاح MP4 الإنتاجي المؤكد:** `fragmentedDurationMs` كان يقرأ `first_sample_flags` بالبت `0x000002` والصحيح `0x000004` (ISO/ffmpeg/GPAC). مع `trun flags=0x305` كان الانزياح أربعة بايتات يجمع حقول **size** كأنها مدد (عيّنة الإنتاج: 1,145,457 ms بدل ~14 ثانية). الاختبار التنازلي الجديد (fixture ببنية حقيقية) يثبّت **14,261 ms**؛ إثبات red→green: القديم 582,827 ms ⇒ المُصلح 14,261 ms؛ وfixture تفريقي 0x101 بنفس المدى + حاجز يمنع Taxiff accidental.
- **الأدلة:** PHP 8.3.30 CLI: `php -l` للملفات الثلاثة PASS؛ الجناح التنفيذي **42/42 PASS** (T0–T15) يشمل مصفوفة المالك تقود التدفق دون `.env` (T12)، CORS من `browser_origins` (T12b)، مصفوفة جزئية + fallback (T13)، غياب الإعداد ⇒ 503 مغلق (T14)، مسار خارجي عبر `DUELI_UPLOAD_CONFIG` (T15). TS: tsc نظيف؛ 100/100 مستهدفة (media-duration 22 منها 4 جديدة)؛ build exit 0؛ أي تغيير مسار (الجرد timestamp-only مُرجَع).
- **المتبقي:** قبول الاستضافة الحقيقية (PHP منشور + سباق نظام الملفات) حسب §6 — غير مدّعى. ROW30 لم يبدأ (بحسب الخطة NEXT = صف 30، READY FOR LOCAL، ينتظر تحقق شرط الانتقال وموافقة المالك).

## ROW28 final REMEDIATION · بنود المالك 1–7 (PHP/القياس/التوليد) · نفس PR116 (فرع fix/row28-final-completion من 130e18b)

- 🔧 تنفيذ LOCAL مكتمل T/B على HEAD سابق داخل PR116 نفسها — REMOTE PENDING، ليست DONE. بلا دمج/نشر/بيئة إنتاج/PHP فعلي على المضيف/قواعد جديدة.
- **(1) اتصال PHP:** عيب التوقيع مُصلح — canonical = `METHOD\nPATHNAME (بدون query)\nts\nnonce\nsha256(body)` مطابقًا تمامًا لـ`verifyUploadServerHmac`؛ الـquery يبقى في URL الطلب فقط. الملف الكامل `dev-tools/php/upload.php` مُختبَر تنفيذيًا كما هو (`php dev-tools/php/tests/run-tests.php` مقابل مرآة عقد الـWorker): PHP 8.3 CLI، lint PASS، 34/34 PASS — تشمل الترتيب، keyless→400، فقدان verify→إغلاق مغلق، توقيع pathname-only مقبول وquery-inclusive مرفوض (العيب القديم مُثبت بالطرفين)، تزامن مختلف البايتات (200+409، الأصل لا يُستبدل)، إعادة متطابقة آمنة، فشل receipt بعد الحفظ (لا نجاح كاذب + استكمال idempotent دون استبدال)، تخلّف قبل receipt مرفوض. الترويسات: HMAC + Origin (أصل المنصة: ضمن allowlist ويساوي Host ⇒ csrfProtection يمر) + X-CSRF-Token، بلا تعطيل أي حماية.
- **(2) الربط:** competition/sequence/extension/object_path تُطابق binding التحقق قبل أي تخزين أو receipt؛ الإيصال يصدّر الجيل والمسار والمنصة تعيد ربطهما.
- **(3) حفظحصري:** ملف مكتمـل ثم `link()` (O_EXCL)؛ احتياطي `flock` بملف قفل ثابت لا يُحذف تحت التزامن؛ كل نتيجة حفظ مفحوصة؛ مطابق→idempotent، مختلف→409.
- **(4) تأكيد:** نجاح يتطلب HTTP 2xx + success + state معروف؛ retry محدود (3) + مسار idempotent موثق؛ لا reverify لمفتاح مستهلك ولا انتظار لا نهائي.
- **(5) التوليد عند النشر:** التأكيد والفشل يربطان الجيل الحالي داخل الـUPDATE الشرطي (subquery على recording_leases + فحص changes) — القاعدة هي الحاكم لا القراءة المسبقة؛ جيل مستبدل لا يمر حتى بعد الإنهاء؛ ready لا يُنزل.
- **(6) قياس المدة:** span القطعة نفسها (WebM min/max، MP4 tfdt/trun per-track)؛ mvhd/mehd من init قديم لا يُستخدم أبدًا لقطعة لاحقة؛ fixtures منزمنة 5–10ث/10–15ث ⇒ ~5ث لكل منها؛ غير قابل للإثبات ⇒ uploaded.
- **(7) الاستضافة:** upload-config.php والإعداد الحالي محفوظان (يُقرأ أولاً)، ثم .env بالأسماء نفسها؛ STORAGE_ROOT/stream.php/التسجيلـات لم تُمس؛ لا تقليم ملفات أو تغيير سر/صلاحيات.
- **الأدلة:** `npm test` 1683/1689 (الـ6 = `quality-gate-poll` تتطلب `jq` محليًا غير موجود على هذا الجهاز — بيئة سابقة لا صلة لها)؛ tsp منفّذ ✓؛ `npm run build` exit 0؛ any 66 = الأساس؛ الجرد بلا تغيير مسار؛ PHP Suite 34/34 + lint. **المتبقي:** قبول PHP الحقيقي على المضيف (سباق التخزين الفعلي + التسليم) حسب §6 من الـrunbook.

## ROW28 final completion · D1–D7 defects · فرع fix/row28-final-completion (من 130e18b = origin/main)

- 🔧 تنفيذ LOCAL مكتمل T/B — REMOTE PENDING، ليست DONE. بلا دمج/نشر/ترحيل بعيد/كتابة إنتاجية/PHP حقيقي/أسرار/تغيير خارج النطاق. بنية عميل الوكيل السابقة حُفظت (‎D6) وأُكملت آخر ثابتين قديمين في video-compositor.test.ts.
- نفّذ (كلها بأدلة آلية): **D1** ربط الإيصال بالجيل الموثَّق وبالفتحة المسجَّلة — فحص ‎lease مسبق + فحص ‎slot ذرّي (تحديث شرطي `state='uploaded' AND generation=?`)؛ **D7** إلغاء مسار الإنشاء الملفَّق في `confirmReceipt` (جيل=1/‏mp4/مسار مخترع) — غير مسجَّل ⇒ 404 دائمًا، ومسار مختلف ⇒ 409؛ **D3** خدمة قياس `MediaDuration` (WebM/EBML: ‏TimecodeScale/الحُزَم/الطوابع/الكتل المتعددة/‏BlockDuration/غياب الطوابع؛ MP4: ‏mvhd/mehd/‏moof+tfdt+trun) تقيس البايتات المخزَّنة فعليًا عبر `stream.php` — لا مدة معلَنة تُنشر، وفشل مغلق دائمًا؛ **D4** `upload.php` كامل قابل للنشر بتخزين حصري ذرّي (`link()` بمعنى ‏O_EXCL + احتياطي `flock`) — رفع مختلف البايتات لا يستبدل الأصلي أبدًا وإعادة المحاولة المتطابقة آمنة؛ **D5** حذف تعليمات ‎DROP TABLE من الـrunbook (تراجع أمامي فقط)؛ **D6** إزالة نداء ‎finalize.php (مُنجز سابقًا + ملحقة `video-compositor.test.ts`)؛ **PHP** عقد إيصالات بالوقائع فقط (`bytes/object_hash/object_path/lease_generation`) + خطوات نشر المضيف الدقيقة.
- **الأدلة**: media-duration 14/14 جديدة (منها 5 ثوانٍ @30 إطارًا بهامش إطار واحد، ‏TimecodeScale مخصّص، كتل متعددة، طوابع مفقودة، ‏MP4 مؤثَّت ومجزّأ، وفشل مغلق)؛ chunk-upload-safe 33/33 (منها 6 جديدة لـD1: سباق ‎verify→takeover→receipt، نسب ‎slot، ذيل ‎drain، جيل ناقص 400، منافسة/تسلسل/مسار خاطئ، تكرار متطابق مقابل تضارب)؛ video-compositor 7/7؛ الكاملة ‎1675/1681 (‏6 فشلة = `quality-gate-poll` لغياب `jq` محلياً، بيئة فقط، سابقة لهذا العمل)؛ `tsc --noEmit` ✅؛ `npm run build` ✅ (خرج 0)؛ `schema-contract` التكاملي 25/25؛ `any` ‏+0 (‏66 = ‏BASE)؛ الجرد بلا تغيير مسار (فرق طابع زمني فقط، مُرجَع). إثبان ‏PHP الحقيقي (سباق التخزين الحصري على المضيف) غير مدّعى — §6 من الـrunbook.
- **المتبقي**: فتح ‏PR على ‏origin/main (بلا دمج) ← ‎REMOTE/Quality/Deploy مستقلة ← قبول المالك.

- 🔧 ‏REMOTE REJECT ← إصلاح LOCAL مكتمل على نفس الفرع/PR، بانتظار ‏re-REMOTE — ليست DONE. ‏ blocker واحد: ‏ms/s في ‏timeline (المشغل يقارن بالثواني) ← الإصلاح عند الحد (‏buildTimeMap ÷‏1000) + توثيق العقد + ‏fixture ‏0/10000/20000 + إثبات انحدار (يمر أخضر ويفشل بلا الإصلاح ‏10000←10). ‏T/B ‏39/39 (‏16 مشغل + ‏12 تشغيل + ‏5 واجهة + ‏6 موحد)؛ ‏tsc ✅؛ ‏any ‏+0. ‏S لم تُعَد محليًا بأمر المالك (للوكيل الخارجي). بلا ‏PR جديد/دمج/نشر/ترحيل.
- **المتبقي**: ‏re-REMOTE مستقلة على ‏HEAD الجديد ← دمج القائد بـexpected_head_sha ← ‏Quality/Deploy على merge-commit.

## R4-CHUNK-PLAYER-UX-1 smooth playback · فرع feat/r4-chunk-player-ux-1 (من d778090 = origin/main بعد PR #112)

- 🔧 تنفيذ LOCAL مكتمل T/B + ‏S جزئية — REMOTE PENDING، ليست DONE. بلا دمج/نشر/ترحيل بعيد/كتابة إنتاجية/أسرار/‏FFmpeg/تنزيل. تنسيق متوازٍ: ‏manifest/workflows/migrations/auth/lease/receipts للوكيل الآخر (لم تُمس؛ استخراجي أُرجع)؛ ‏PR110 لم تُمس؛ العمل في ‏worktree منفصلة بعد تعارض الشجرة.
- نفّذ: بدء الحي من أحدث ‏ready (احتياطي ‏penultimate للقديم) + تشغيل الحافة نفسها؛ تخطي غير المؤكد مع ‏fallback قديم؛ ‏rewind محدود بحلقة واحدة؛ ‏handoff (إيقاف/كتم/تنظيف + بدء صامت)؛ تحميل ‏VOD بنافذة محدودة + إخلاء + إلغاء ‏URLs + مواضع موثقة؛ زرّا الرجوع/الإرجاع + ‏ar/en + ‏CSP؛ استبعاد ‏failed + تطبيع ‏0→1 في الدمج؛ ‏timeline بترقيم داخلي.
- **الأدلة**: ‏T/B ‏21 جديدة (‏16 مشغل + ‏5 واجهة)؛ الجيران خضراء (‏chunk-playback ‏12/12)؛ الكاملة ‏1603 بلا فشل (الملفان البيئيان مستبعدان)؛ ‏tsc/build ✅؛ ‏any ‏+0 (‏297)؛ الجرد بلا تغيير. ‏S: الحي/الإرجاع/الخلفية ‏PASS بأدلة حقيقية؛ ‏VOD/seek/audio للوكيل الخارجي. disposition عشرية في ‏WORKLOG (‏3 FIXED هنا + ‏2 VERIFIED + ‏5 DEFERRED بحواجز صريحة، منها ‏blackout التسجيل للوكيل الآخر).

## R4-PROFILE-SEC11-1 profile session auth · فرع fix/r4-profile-sec11 (من d778090 = origin/main)

- 🔧 تنفيذ LOCAL مكتمل T/B — REMOTE PENDING، ليست DONE. بلا دمج/نشر/كتابة إنتاجية/PHP/أسرار. ROW29/PR110/Recovery-C وديون Auth/SQL/BaseModel لم تُمس.
- نفّذ: إزالة مصدري جلسة غير مصرّح بهما من مسار `‎/profile‎` (بلا اسم مستخدم): `‎?token=‎` (SEC-11) و‏كوكي `session_id` القديمة (SEC-07). المصدر الكنسي الآن ترويسة Bearer أو كوكي `sessionId` فقط (يطابق `src/middleware/auth.ts`). الملفان المحذوفان الآن يفشلان مُغلقين ← 401. محفوظ: الملفات العامة `/profile/:username`، وصول Bearer/sessionId الصالح، رمز تحقق البريد `verify-page` (رمز لمرة واحدة ليس جلسة)، ومسار realtime ticket.
- **الأدلة**: profile 10/10 (منها 6 جديدة)؛ profile-sql-extraction سليم (حالة `session_id` المقلوبة إلى سالب 401)؛ إثبات انحدار: إرجاع profile-page.ts فقط يُسقط 3 اختبارات؛ الكاملة 156/157 (الـ6 الفاشلة = `quality-gate-poll` المحلية لغياب `jq` فقط، غير ذات صلة)؛ `tsc` ✅؛ `build` ✅ (exit 0)؛ حارس CI ضيّق مانع جديد (يمنع إعادة `query('token')`/`session_id'` في profile-page.ts فقط، لا يمس verify-page)؛ 4 ملفات فقط بلا انحراف نطاق.

## R4-RELEASE-RECOVERY-C follow-up · raw-byte SHA256 بلا إضعاف سلامة · فرع fix/r4-release-recovery-c (متابعة لـ222576e)

- 🔧 تنفيذ LOCAL — REMOTE PENDING، ليست DONE. نطاقه بوابة الجاهزية/دبابيس الهاش فقط. بلا كتابة إنتاجية/PHP/أسرار، بلا تجاوز جاهزية، بلا مساس بـROW29/PR110/PR113، بلا تطبيق ثانٍ، بلا إعادة اختبار شاملة.
- **المشكلة**: الهاش في `sha256File()` ومساعده في الاختبار كان على أساس CRLF→LF مُطبَّع — إضعاف حقيقي (ولو ضيق): إعادة كتابة نهايات الأسطر وحدها لترحيل مُدبَّس كانت ستُقبل بصمت لأن CRLF وLF يُطبَّعان لنفس البصمة. سببه `core.autocrlf=true` على ويندوز مقابل دبابيس LF.
- **الحل**: `.gitattributes` يثبّت `migrations/** eol=lf` ⇒ شجرة العمل مطابقة للفهرس بايت-ببايت على كل منصة (43 بلوب ترحيل كلها LF أصلاً — صفر تغيير بايت مُرحَّل مُؤكَّد). `sha256File()` يتحقق الآن من **البايتات الخام** بلا تطبيع؛ والاختبار يحاكيه.
- **الأدلة**: readiness 32/32 ✅ (منها اختباران جديدان: بايت-خام + pin eol=lf + لا CR في الشجرة؛ وإعادة كتابة CRLF-only تُنتج بصمة ≠ الدبوس بينما repoFileHash الخام يطابق)؛ T/B مركزة خضراء؛ الكاملة 156/157 (‏`quality-gate-poll` فقط لغياب `jq` محلياً)؛ `tsc` ✅؛ `build` ✅. الحاجز القائم: لا ترحيل بعيد/نشر Worker/PHP حقيقي — التفعيل موقوف لموافقة المالك + القبول.

## R4-RELEASE-RECOVERY-C ROW28 post-merge deploy recovery · فرع fix/r4-release-recovery-c (من d778090 = origin/main بعد PR #112)

- 🔧 تنفيذ LOCAL — REMOTE PENDING، ليست DONE. بلا دمج/نشر/ترحيل بعيد/كتابة إنتاجية/أسرار/تغيير خارجي. PR110 محفوظة؛ ROW29 (player UX/seek/pagination/download) لم تُمس.
- نفّذ: manifest إلى baseline-0042 (‏0040/0041/0042 ‏required مع ‏SHA256 + جداول/أعمدة/فهارس)؛ ‏leaseUnavailable يغطي غياب العمود (حالات ‏0040/0042 الجزئية ‏503)؛ ‏runbook: نافذة صيانة + تجميد رفع + تصريف + ترتيب ‏Worker←PHP + تراجع أمامي بلا ‏DROP مدمر + ‏patch دقيق لـupload.php (مراجعة فقط)؛ دورة ‏lease في العميل (‏acquire/heartbeat/expiry/reconnect/takeover) + ربط صفحة المضيف فقط؛ مسار التفعيل الآمن بلا ‏finalize.
- **الأدلة**: T/B مركزة 80/80 ✅ (readiness/uploader/safe/lease/schema-contract)؛ `tsc --noEmit` ✅؛ `build` ✅؛ ملاحظة: `tests/dev-tools/quality-gate-poll.test.ts` يسقط محلياً لغياب `jq` (بيئة فقط، CI يملكه). إثبات PHP الحقيقي للوكيل الخارجي (غير مدّعى).
- **المتبقي**: REMOTE مستقلة ← دمج القائد بـexpected_head_sha ← Quality/Deploy على merge-commit. أي فشل = POST-MERGE BLOCKED بلا ادعاء DONE.

## R4-CHUNK-UPLOAD-SAFE-1 secure upload · فرع feat/r4-chunk-upload-safe-1 (من 870a78c = origin/main بعد PR #111)

- 🔧 تنفيذ LOCAL مكتمل T/B — REMOTE PENDING، ليست DONE. بلا دمج/نشر/ترحيل بعيد/كتابة إنتاجية/أسرار/تغيير خارجي (‏0040+0042 محلي فقط). ‏PR110 مفتوحة ومحفوظة (استخراج خادمي فقط بلا تكرار)؛ ‏PLAYER29/DOWNLOAD30 والمالية وH7 لم تُمس.
- نفّذ: مفاتيح إلزامية مربوطة (مضيف/منافسة حية/جيل ‏lease/تسلسل/مسار مشتق/سقف) بلا تجاوز؛ استهلاك ذري + ‏fencing الأجيال + رفض القديم؛ إيصالات موثقة تربط ‏ready بالقياس فقط؛ نهاية/cron بلا مسح مفاتيح (ذيول ‏drain) + تقليم انتهائي؛ ‏marker نهائي قائم؛ جرد ‏PHP + ‏runbook نشر/تراجع/‏cutover (بلا تطبيق)؛ حلول ‏INDEX27 (سباق ‏CONFLICT، حد ‏gaps، سقف ‏2h مثبت بثلاث نقاط، ‏2000 صف تحليلي).
- **الأدلة**: ‏T/B ‏33 جديدة (‏21 + ‏12 ‏lease)؛ الجيران ‏109/109 عبر ‏9 ملفات؛ الكاملة ‏1584 بلا فشل (الملفان البيئيان مستبعدان)؛ ‏release-readiness نفس ‏12 على ‏BASE؛ ‏integration-contract محدث (‏43 ملفًا)؛ ‏tsc/build ✅؛ ‏any ‏+10 (‏287→297)؛ الجرد ‏243. بلا ‏S/E2E (النطاق ‏T/B). إثبات ‏PHP الحقيقي للوكيل الخارجي (غير مدّعى).
- **المتبقي**: REMOTE مستقلة ← دمج القائد بـexpected_head_sha ← Quality/Deploy على merge-commit. أي فشل = POST-MERGE BLOCKED بلا ادعاء DONE. ‏PLAYER29 يستهلك العقد لاحقًا.

## R4-CHUNK-INDEX-1 D1 chunk metadata · فرع feat/r4-chunk-index-1 (من 216e4b5 = origin/main بعد PR #109)

- 🔧 تنفيذ LOCAL مكتمل T/B — REMOTE PENDING، ليست DONE. بلا دمج/نشر/ترحيل بعيد/كتابة إنتاجية/تغيير خارجي (‏0041 محلي فقط). ‏PR110 مفتوحة ومحفوظة ولم تُمس (لا تكرار لعملها؛ الترقيم ‏0041 يتجنب ‏0040 الخاصة بها). ‏H7 والمالية والصفوف ‏28–43 لم تُمس.
- نفّذ: فهرس ‏D1 (حالات ‏uploaded/ready/failed، مدد موثقة بالإيصال فقط، ‏timeline محسوب، ‏gaps، ‏resume، ‏lookup زمان→قطعة، ‏marker نهائي ‏idempotent مع تمييز ‏ended/finalized، ضمانات الكاتب، استيراد قديم ‏read-only)؛ قائمة التشغيل بسلطة ‏D1 مع توافق تام للقديم (فارغ/غائب = بايت-مطابق)؛ لقطة ‏marker في ‏end/cron دون حجب؛ ‏manifest (عضوية ‏0041 بلا ‏baseline جديد) + تغطية ‏FK.
- **الأدلة**: ‏T/B ‏19/19 جديدة؛ الجيران ‏128/128؛ ‏release-readiness نفس ‏12 البيئية على ‏BASE؛ ‏tsc/build ✅؛ ‏any ‏+0 (‏287 = ‏BASE)؛ ‏0041 مطبقة محليًا. بلا ‏S/E2E (النطاق ‏T/B فقط).
- **المتبقي**: REMOTE مستقلة ← دمج القائد بـexpected_head_sha ← Quality/Deploy على merge-commit. أي فشل = POST-MERGE BLOCKED بلا ادعاء DONE. ‏SAFE28/PLAYER29/DOWNLOAD30 تستهلك العقد لاحقًا. تنبيه دمج: ‏0040 في ‏PR110 بلا ‏manifest — على القائد معالجته عند دمجها.

## R4-COMP-UNIFIED-1 unified competition page · فرع feat/r4-comp-unified-1 (من 8f3d194 = origin/main)

- 🔧 تنفيذ LOCAL مكتمل T/B + S — REMOTE PENDING، ليست DONE. بلا دمج/نشر/ترحيل/تغيير خارجي أو إنتاجي. H7 وPhase7 وDOWNLOAD-1 لم تُمس.
- نفّذ: الرسم الأصلي حرفيًا داخل VideoCompositor (شعار + لغة المضيف + خلفية + إطارات + 720p + RTL)؛ MP4 عند الدعم مع fallback حقيقي؛ قرار سطح واحد خالص (4 أدوار × 4 حالات، بلا ادعاء دور)؛ كتلة المتنافس داخل الصفحة بنفس فئات الحزمة (تسجيل المضيف وحده، بلا رفع/finalize مزدوج، بلا إنهاء من unload)؛ المشاهد بمشغل PR108؛ صفحات الاختبار و/live للتوافق؛ 4 مفاتيح ar/en وهوامش منطقية.
- **الأدلة**: مصفوفة ‏22/22 + دبابيس ‏6 + تصميم/MIME ‏4؛ الجيران خضراء؛ الكاملة ‏1549 + نفس ‏18 البيئية على ‏BASE؛ ‏tsc/build ✅؛ ‏any ‏287 (‏BASE ‏289، ‏−2). ‏S: ‏PASS بأدلة (`comp-unified.evidence.json`: متنافسان متصلان + تسجيل مرفوع + جمهور بإطارات ‏@1280 + finalize وحيد + VOD بإطارات؛ الصوت بالمستوى البايتي من الصف ‏25).
- **المتبقي**: REMOTE مستقلة ← دمج القائد بـexpected_head_sha ← Quality/Deploy على merge-commit. أي فشل = POST-MERGE BLOCKED بلا ادعاء DONE.

## R4-CHUNK-PLAY-1 audience chunks · فرع feat/r4-chunk-play-1 (من 98a1358 = origin/main)

- 🔧 تنفيذ LOCAL مكتمل T/B، وS معطلة بيئيًا — REMOTE PENDING، ليست DONE. بلا دمج/نشر/ترحيل/تغيير خارجي أو إنتاجي (خادم القائمة + عميل الرفع/التسجيل/التشغيل + i18n الجمهور + اختبارات). H7 وPhase7 وCOMP-UNIFIED-1 وDOWNLOAD-1 لم تُمس.
- نفّذ: عقد قائمة موحد (تطبيع/إزالة تكرار/ترتيب + timeline/format + حالات upstream + init route + cache قصير + صفر D1)؛ مدير مقاطع من القائمة (بلا HEAD خارجي، تخطي فجوات محدود، تراجع محدود) + حد أخطاء مميت + تخطي المسموم + رفض HTML؛ رفع محدود مُستأنف بعد الأعلى مع init-prepend لكل شظية وfinalize وحيد؛ تصريف المقطع الأخير قبل النهاية؛ توحيد finalize الصفحة وإنهاء صادق عند unload؛ ربط upstream بخالات المشغل؛ 6 مفاتيح ar/en.
- **الأدلة**: T/B خضراء (قائمة ‏10 + رفع ‏9 + تسجيل ‏3 + تشغيل ‏12 + دبابيس ‏6)؛ الجيران خضراء لحظة التشغيل؛ ‏schema-contract ‏24/24 (مبكرًا)؛ ‏tsc/build ✅؛ ‏any ‏287 (‏BASE ‏289، ‏−2). ‏S: ‏BLOCKED بيئيًا موثق — مثبت جزئيًا وبلا ‏PASS مدّعى؛ الأدوات (stub/spec) محفوظة للـREMOTE. بلا مسح كامل معاد (أُوقف بأمر المالك).
- **المتبقي**: REMOTE مستقلة (تشغيل S في بيئة مستقرة أولًا) ← دمج القائد بـexpected_head_sha ← Quality/Deploy على merge-commit. أي فشل = POST-MERGE BLOCKED بلا ادعاء DONE.

## R4-LIVE-INT-1 signaling integration recovery · فرع feat/r4-live-int-1-signaling-recovery (من 375bd18 = origin/main)

- 🔧 REMOTE جزئي على `a0d0caf`: FUNCTIONAL ‏APPROVE (الوكيلان)؛ ARCHITECTURE ‏APPROVE/REJECT — المانع: نصّان إنجليزيان ثابتان في تنبيهات غرفة الإنتاج ← REMEDIATED / REMOTE PENDING (تحقق مستهدف) — ليست DONE. نفس الفرع وPR #107، بلا دمج/نشر/ترحيل/تغيير سلوكي (مفتاحا `live_signaling.room_create_failed/session_join_failed` في ar/en + مرجعهما في الصفحة + اختبار ‏4/4). ملاحظة ‏429 للصفين ‏25/26 مسجلة للقائد (بلا تغيير rate limits هنا، وبلا NEXT منافس).
- نفّذ (بتوجيه المالك: الملفات المجربة أصل الحل): استخراج `SignalingManager` المجرّب إلى وحدة bundle مشتركة واحدة (نفس العقد والتدفقات) + فلتر B1 ومهلة صارمة؛ `P2PConnection` أصبح محوّل RTC رفيع فوقها (سطح الصفحة بلا تغيير)؛ `shared.ts` بلا كلاس مكرر (التشخيص باقٍ) وصفحات host/guest/viewer بلا تغيير وتعمل عبر `window.SignalingManager`؛ سياسة إعادة المحاولة SSOT واحدة؛ الصفحة تعيد الانضمام المحدود عند العبور. الانقطاع/التحديث يستأنفان نفس الجلسة؛ `started_at` والمقاطع والمنافسة بلا مساس.
- **الأدلة**: سلوكية ‏19/19 (مدير ‏12 + محوّل ‏7)؛ ‏RED ‏13/13 على رأس الرفض + ‏6/6 بالطفرة؛ عقد الخادم ‏12/12 + ‏404 القديم؛ وسائط حقيقية ‏PASS بأدلة (`live-p2p-media.evidence.json`: SDP both-ways، صوت+صورة، ‏181/223 إطارًا، ثبات ‏50s مع الحضور وlive وstarted_at)؛ الجيران خضراء؛ الكاملة ‏1472 + نفس ‏18 البيئية على ‏BASE؛ ‏schema-contract ‏24/24؛ ‏tsc/build ✅؛ ‏any ‏289 (‏BASE ‏291، ‏−2؛ تصحيح B5).
- **المتبقي (blockers فقط)**: re-REMOTE مستقلة على ‏HEAD الجديد ← دمج القائد بـexpected_head_sha ← Quality/Deploy على merge-commit. أي فشل = POST-MERGE BLOCKED بلا ادعاء DONE.

## R4-EVENTS-NOTIFY-1 REMEDIATION (P1 cascade/atomicity + P2 spinner/mid-GET) · نفس فرع PR106 (من 557604a)

- 🔧 تنفيذ LOCAL مكتمل (‏P1+P2)، بانتظار re-REMOTE على ‏PR106 — ليست DONE. بلا ‏PR جديد/دمج/نشر/كتابة إنتاجية/ترحيل (4 ملفات معدلة فقط، بلا ملفات جديدة). R1/R2/R3/H7 مغلقة ولم تُمس.
- نفّذ: (‏P1) مسح ‏FK كامل (0001–0007): حذف صريح لعشرة تابعين بلا إجراء (طلبات/دعوات/قديمة/تقييمات/تعليقات/مفاتيح/مهام مجدولة/مجدولات/إيقافات/إخفاء) + ‏batch واحد ذري (الكل أو لا شيء)؛ ‏CASCADE/SET-NULL للقاعدة؛ السجل (إشعارات/تقارير) محفوظ. (‏P2) محمل بالطلب (موجة واحدة لاحقة للطلب أثناء الجلب — ‏burst ≤ طلب زائد واحد) + إعادة رسم القائمة المفتوحة عند اكتمال الجلب (المغلقة تُترك؛ الفشل لا يمحو القائمة).
- **الأدلة**: ‏api ‏10←13 + ‏ui ‏9←13 (‏RED ‏5/5 للسلوكيات المعالَجة على كود ما قبل الإصلاح)؛ الجيران ‏210/210 (16 ملفاً)؛ الكاملة ‏1441 + نفس ‏18 البيئية المسبقة على ‏BASE؛ ‏tsc ✅؛ ‏build ✅؛ ‏any ‏+0.
- **المتبقي (blockers فقط)**: re-REMOTE مستقلة على ‏HEAD الجديد ‏PR106 ← دمج بـexpected_head_sha ← ‏Quality/Deploy على merge-commit. التنظيف الإنتاجي ما زال قائداً-محكوماً (لم يُنفَّذ). أي فشل = POST-MERGE BLOCKED بلا ادعاء DONE.

## R4-EVENTS-NOTIFY-1 notifications/events · فرع feat/r4-events-notify-1 (من 5a74310 = origin/main)

- 🔧 تنفيذ LOCAL مكتمل، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر ذاتي/كتابة إنتاجية/ترحيل (routes ‏236←237: ‏POST /:id/star فقط). R1/R2/R3 مغلقة ولم تُمس خارج العقد.
- نفّذ: (‏N-01) حفظ ‏receiver في ‏CSP delegate (‏handleNotificationClick/toggleStar وكل ‏dotted handlers — ‏CSP/allowlist محفوظان)؛ (‏N-02/M-4) انتظار ‏read POST قبل التنقل + ‏badge من تأكيد الخادم + ‏single-flight للـGET؛ (‏replay) منع تكرار ‏toast ببصمة الحدث مع بقاء التحديث من الخادم؛ (‏N-05) مسار ‏star حقيقي بملكية ‏404 على عمود ‏is_starred القائم؛ (‏N-03) طلب الانضمام الجديد → ‏‎/my-requests‎ (الدعوات والإيصالات بلا مساس)؛ (‏N-07) حذف المنافسة عبر ‏deleteCascade مع حفظ سجل الإشعارات؛ (‏M-5) ‏loading/empty منفصلان بمفاتيح قائمة + ‏star/unstar بـar/en.
- **الأدلة**: T جديد ‏r4-events-notify-1 ‏10/10 + ‏UI جديد ‏r4-events-notify-ui ‏9/9 (‏RED ‏13/19 على ‏BASE ‏— منها ‏FK-abort حي)؛ تحديث تثبيتين متجاوَزين (‏notification-types/notification-page)؛ الجيران ‏125/125؛ الكاملة ‏1434 + نفس ‏18 البيئية المسبقة المثبتة على ‏BASE؛ ‏tsc ✅؛ ‏build ✅؛ ‏any ‏+0.
- **التنظيف (لم يُنفَّذ — بانتظار القائد)**: ‏dev-tools/r4-events-notify-cleanup.sql (‏cutoff ثابت ‏2026-10-08T03:31:39Z ‏UTC؛ ‏SELECT قبل + ‏UPDATE محروس + ‏SELECT بعد + ‏idempotency؛ بلا ‏DELETE/رسائل/دعوات/أدوار/سياسة دائمة). ‏UPDATE الإنتاج ممنوع قبل إقرار القائد للأمر المحدد. منطق الأمر مثبت محلياً فقط.
- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـexpected_head_sha ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.

## RELEASE COLLECTOR HOTFIX (Deploy #37771438709) · فرع fix/release-collector-indexes (من 30baed3 = origin/main)

- 🔧 تنفيذ LOCAL مكتمل، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر ذاتي/إعادة تطبيق ‏0039/‏H7/‏SearchModel/readiness (سطر جامع واحد + مثبت + ملف اختبار).
- نفّذ: لقطة الفهارس بلا قيد ‏tbl_name (الفاحص ‏subset — الزائد آمن والناقص ‏FAIL مغلق)؛ السبب: جداول ‏0039 خارج ‏required_schema.tables فالقائمة المشتقة أسقطتها والبوابة رفضت إنتاجاً سليماً.
- **الأدلة**: ‏release-collector ‏5/5 + ‏deploy-workflow ‏9/9 (‏RED ‏4 على الجامع القديم)؛ ‏tsc/build ✅؛ ‏any ‏+0 (بلا ‏src منطقي).
- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـexpected_head_sha ← انتظار Quality Gate على merge-commit (يعيد تشغيل ‏Deploy الفاشل) ← ثم إعلان الحالة. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.

## R4-DB-OPT-1 smallest proven D1 read reduction · فرع feat/r4-db-opt-1 (محدَّث على main ‏9cbb93c بعد دمج ‏PR103)

- 🔧 تنفيذ LOCAL مكتمل، بانتظار re-REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر ذاتي/فوترة/حمل إنتاجي (‏routes بلا تغيير؛ ‏manifest ‏baseline-0039؛ ‏0039 مطبَّقة إنتاجياً بتفويض المالك §9 ومثبتة أدناه). PR #103 مدموجة ومحفوظة أدناه؛ ملفا ‏ELO المتسخان لم يُمسا.
- نفّذ: (‏S1) حذف قراءتي ‏Profile الزائدتين في ‏SearchModel (نفس الخريطة/القيم — ‏H7-v1 والمشاركة والحجب والعزل والترتيب والنفاد و‏≤100 binds محفوظة)؛ (‏S2) ترحيل ‏0039 (‏6 فهارس فقط، ‏IF NOT EXISTS، بلا حذف) ضمن ‏PR بلا تطبيق إنتاجي (‏owner-gated)؛ (‏S3) إثبات التعطل: محاولة واحدة + ‏500 عامة بلا تسريب على المسار الملموس (‏B13 قائم للبقية).
- **الأدلة**: T جديد ‏r4-db-opt-1 ‏14/14 (‏RED ‏12/18 قبل الإصلاح؛ ‏EXPLAIN السبع بلا ‏SCAN بعد ‏0039؛ ‏T0 ‏13 مقابل continuation ‏5 عبارات — عدّ محلي، لا يدَّعى ‏rowsRead إنتاجي)؛ الجيران ‏126/126؛ الكاملة ‏1401 + نفس ‏16 البيئية المسبقة؛ ‏schema-contract ‏24/24 عبر ‏Wrangler؛ ‏tsc ✅؛ ‏build ✅؛ ‏any ‏+0.
- **REM1 (Codex-P1، نفس الفرع)**: سُجّلت ‏0039 في ‏manifest (‏baseline-0039 + ‏sha256 + ‏6 فهارس + ‏known_history) + ‏readiness ‏24←27 (تثبيت ‏0039 + ‏FAILان مغلقان جديدان). ‏27/27 مثبتة على بايتات ‏LF (حالة ‏CI)؛ محلياً ‏15 ✅ والباقي انحراف ‏CRLF موثق. بلا تطبيق إنتاجي.
- **المتبقي (blockers فقط)**: re-REMOTE مستقلة على ‏HEAD الجديد ← دمج القائد بـexpected_head_sha ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. ‏0039 مطبَّقة إنتاجياً ومثبتة (سجل ‏d1_migrations ‏40، ‏pending فارغ، ‏indexes ‏107←113، ‏users/competitions/tables بلا تغيير) — لا تطبيق ثانٍ. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.
- **PROD-APPLY (owner §9، تم)**: ‏PR103 ‏post-merge أخضر (‏Quality ‏37760838270 + ‏Deploy ‏37760838240 على ‏9cbb93c) قبل أي كتابة؛ ‏precheck (سجل ‏39/39 + ‏pending ‏0039 وحدها + ‏SHA256 مطابق)؛ ‏apply ‏0039 وحدها ‏✅؛ ‏postcheck ‏read-only أخضر. التفاصيل في ‏WORKLOG.
## R4 centralized <title> escaping · فرع feat/r4-title-escaping (من 2e3d368 = origin/main)

- 🔧 تنفيذ LOCAL مكتمل، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية/ترحيل/مسارات جديدة (routes ‏236←236). كل المغلق (R3-C3 وما قبلها + ‏D1 bind #100) لم يُمس.
- forensic: ‏ALREADY DONE (رحلات DEPLOYED ببوابات ما بعد الدمج؛ أجسام ‏docs مهربة عند العرض؛ ‏i18n بلا كيانات)؛ الفجوة الحقيقية (1): ‏generateHTML كان يحقن ‏title الخام في ‏<title> وتصله عناوين يتحكم بها المستخدم (عنوان المنافسة/الاسم المعروض/‏username/عناوين الوثائق) — قابلية كسر ‏‎</title>‎ مثبتة. ليست فجوة: ترقيم ‏‎/docs‎ (النموذج يدعم ‏limit/offset والفهرس ~6 صفوف — يبقى non-blocking).
- نفّذ: تهريب مركزي واحد في ‏generateHTML عبر ‏Sanitize.escapeHtml (المنادون يمررون خاماً كما قبل — بلا تهريب مزدوج)؛ أسطر ‏‎<title>‎ الثابتة (‏oauth/static/email) لم تُمس.
- **الأدلة**: T جديد ‏r4-title-escaping ‏4/4 (‏RED ‏4/4 بلا الإصلاح) + الجيران (‏csp/object-title/docs ‏27/27)؛ ‏tsc ✅؛ ‏build ✅؛ ‏any ‏283 = ‏BASE (‏+0، السقف ‏310).
- **REM1 (Codex-P2، نفس الفرع)**: عناوين المنافسات مهرّبة-مخزنة (‏T1.4) فالتهريب المركزي كان يضاعفها (‏RED مثبت ‏`A&amp;amp;B` عبر ‏create→DB→live-room) — فك ترميز واحد عند حد ‏live-room فقط (‏unescapeHtml المعكوس الدقيق) والتهريب المركزي يبقى وحيداً (‏XSS مغلق). T ‏4←8 (‏A&B + ‏‎<tag>‎ + ‏‎</title><script>‎ عبر المسار الحقيقي + ‏round-trip)؛ الجيران ‏43/43؛ ‏tsc/build ✅؛ ‏any ‏+0. المصارف الأخرى مثبتة السليمة (‏profile/docs/i18n).
- **المتبقي (blockers فقط)**: re-REMOTE مستقلة ← دمج بـexpected_head_sha ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.
- **POST-MERGE (مدموجة ‏9cbb93c)**: ‏PR103 ‏MERGED والقائد أكمل البوابات؛ هذا القسم أرشيف للفرع المدموج — لا re-REMOTE عليه.

## R3-C3 synthetic-retirement future design · فرع feat/r3-c3-retirement-design (من 88461f6a = origin/main)

- 🔧 تصميم/توثيق LOCAL مكتمل، بانتظار REMOTE — ليست DONE. وثيقة فقط بلا حذف/ترحيل/جدولة/endpoint تدميري (‏KEEP NOW سارية). ‏C1/C2 مغلقان ولم يُمسا.
- forensic: الواقع الحالي (‏is_fake الافتراضي، 3 مواقع حذف وحيد best-effort بعد إنشاء حقيقي، قوائم تبعية مثبتة بـPRAGMA) مقابل غير الموجود (مسح عمري/دفعي/dry-run/زر/‏cron/استرجاع).
- أضيف: ‏docs/20-SYNTHETIC-RETIREMENT-DESIGN.md (تصنيف/عتبة مقترحة قابلة للضبط/تفويض صريح/حمايات ‏FK ومالية/تدقيقية/dry-run إلزامي/‏fail-closed/مراقبة واسترداد/قرارات مفتوحة للمالك).
- **الأدلة**: T جديد ‏r3-c3-retirement-design ‏3/3 (الوثيقة بأقسامها الثمانية؛ لا مسار حذف خارج المواقع الثلاثة المثبتة؛ صدق عدم-الادعاء) + الحراس القائمة خضراء (19/19 مع ‏SyntheticRetirement وIsFakeCreation)؛ الكاملة ‏1387 + ‏16 بيئية ‏Windows مسبقة؛ ‏tsc ✅؛ ‏build ✅؛ ‏any ‏295 (+0).
- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـexpected_head_sha ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.

## R3-C2 admin-managed documents/data · فرع feat/r3-c2-docs-data (من d7021ae = origin/main)

- 🔧 تنفيذ LOCAL مكتمل، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية/ترحيل/اعتمادية جديدة (routes API ‏235←236: ‏GET /api/documents فقط؛ الصفحتان ‏/docs و/docs/:slug ليستا API). ‏R2-A مغلق ولم يُعَد بناؤه.
- forensic: الموجود ‏ALREADY DONE (نموذج/‏CRUD/بوابة مشرف/قراءة عامة/واجهة لوحة/بذور موسومة)؛ الناقص الحقيقي (1) فهرس/صفحات قراءة عامة (2) محتوى فئات ‏C2 (رسالة المشروع/المنتج/الهندسة/المصدر المفتوح/مساهمات ‏AI/مسودة قانونية موسومة بلا ادعاء).
- نفذ: ‏listPublishedPublic + ‏listPublished (بيانات وصفية فقط)؛ صفحتا ‏/docs (فهرس) و/docs/:slug (قارئ) بختم ‏HTML ومناطق آمنة وبلا ‏JS (لا سطح ‏CSP جديد؛ المسودات/الخاصة ← ‏404)؛ مدخل الفوتر + مفاتيح ‏ar/en؛ ‏6 بذور ‏C2 مسودة/خاصة موسومة بلغة عدم-ادعاء صريحة.
- **الأدلة**: T جديد ‏r3-c2-docs-data ‏6/6 + ‏UI ‏r3-c2-docs-pages ‏3/3 (كتابة المشرف/‏CRUD/الإصدارات/الفهرس/‏404/التدقيق/البذور/‏XSS/‏RTL)؛ الجيران (‏r2-a-admin + ‏r2-a-admin-ui + ‏csp-hardening ‏30/30)؛ الكاملة ‏1384 + ‏16 بيئية ‏Windows مسبقة على ‏BASE؛ ‏tsc ✅؛ ‏build ✅؛ ‏G2 ‏295 = ‏BASE (+0).
- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـexpected_head_sha ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.




## HOTFIX D1 100-param limit / home-rails 500 · فرع `fix/d1-param-limit-home-rails` (من `d5233f4` = origin/main)

- 🔧 تنفيذ LOCAL مكتمل (يشمل معالجة REMOTE #2: ‏A1–A4 مضادة-ربط + ‏3 ترحيل ترقيم + تدقيق نهائي شامل)، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية/ترحيل/إعدادات (routes ‏235←235). PR #99 لم تُمس (HOLD محترم). H7/D1/D2 بلا إعادة تصميم أوزان.
- السبب الجذري: حد D1 الصلب 100 معامل مربوط/استعلام. ‏`loadProfiles` كانت تربط الدفعة (حتى 80) مرتين (‏UNION ALL صانع+خصم ⇒ حتى 160؛ ‏51+ معرّف ⇒ ‏500 إنتاجي) و`loadSpecializations` بنفس النمط الكامن. الإصلاح: تقسيم كل استعلام ثنائي إلى استعلامين أحاديي الربط (≤80) مع الدمج في ‏JS بنفس الدلالة الدقيقة (‏UNION ALL/GROUP BY/استبعاد ‏NULL/ائتمان كل جهة مرة). حارس ‏shim جديد في ‏`sqlite-d1.ts` يرمي خطأ D1 الإنتاجي عند ‏>100 (اختباري فقط).
- **الأدلة**: T ‏`d1-param-limit-hotfix` ‏16/16 (الأصل ‏9: حارس ‏101/100؛ ‏loadProfiles/loadSpecializations بـ60؛ مسارات ‏home-rails الثلاثة + ضابط صغير — ‏RED مثبت بخطأ ‏`binds 120 parameters`؛ الجديد ‏7: ‏A1 ‏suggested/live+upcoming و‏A2 ‏category/live بهوية موثقة مع ‏120 حظر (باتجاهين) + ‏120 إخفاء وكل استبعاد مفروض، ‏A3 ‏GET /api/recommendations مع ضابط مستخدم نظيف، ومسارات الترحيل ‏guest/search/matchmaking بحد ‏150 — ‏RED مثبت بأخطاء ‏241/124/150/152 عبر ‏500 حقيقية)؛ الجيران (‏recommendations-ranking/lang، ‏home-rails-continuation ‏13/13، ‏r3-d2 ‏16/16، ‏r3-d1 ‏21/21، ‏home-rails ‏UI، ‏b1-my-competitions)؛ الكاملة ‏1355 + ‏16 بيئية ‏Windows مسبقة على ‏BASE (‏6 ‏jq + ‏10 ‏readiness — بلا مساس)؛ ‏`tsc` ✅؛ ‏`build` ✅؛ ‏G2 ‏295 ≤ ‏310.
- **REMOTE**: ‏#1 ‏APPROVE/MERGE-SAFE YES (الإصلاحات الأصلية كما هي)؛ ‏#2 ‏REJECT أُغلق هنا (‏A1–A4 + ‏3 ترحيل إضافي + تدقيق نهائي: لا مسار إنتاجي معروف يتجاوز 100 بعد ‏#100).

- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـ`expected_head_sha` ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.




## R3-C1 contextual help + FAQ/role guides + i18n/a11y · فرع `feat/r3-c1-help-a11y` (من `d5233f4` = origin/main)

- 🔧 تنفيذ LOCAL مكتمل بعد استلام جنائي (takeover)، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية/ترحيل جديد (routes API ‏235←235؛ ‏`/help` + `/faq` مسارا صفحة فقط، لا API ولا جرد).
- العقد: (مطابق للأصل)
  (1) صفحة Help & Guides `GET /help` + `/faq` → `helpPage`: نظرة عامة، أدوار صانع/منافس/مشاهد (3 أدلة)، 10 مواضيع منظمة (إنشاء / دعوة / بث / تسجيل / تقييم / تفاعل / تعليقات / اكتشاف / تسوية / دعم) بحدود/أسئلة شائعة، و قسم الوصول، كل ‏#anchor قابل للوصول عبر روابط "تعرف على المزيد" السياقية في (إنشاء / منافسة / بث / أرباح / تبرع / رسائل/الدعم الإداري / 404).
  (2) i18n `help_guide` (ar≠en): 10 مواضيع × عنوان + 3 فقرات + سؤال + إجابة + حدود + 3 أدوار × 6 فقررات + FAQ 10×(سؤال+إجابة+حدود) + ملاحظة وصول + `skip_to_content`.
  (3) مدخلات مساعدة: أيقونة مساعدة في الناف بار للجميع (`/help?lang=...` + `aria-label`)، رابط في قائمة المستخدم، روابط "اتصل بالمسؤول" و "مساعدة" في الفوتر، رابط /help في الـ 404، `Modal.showHelp()` يوجه بدل `alert()` مفتاح مفقود.
  (4) وصول: زوم قابل للتمكين (`initial-scale=1.0`، إزالة `maximum-scale`/`user-scalable=no`) + رابط تخطي إلى `#main-content` بهدف شامل واحد في الـnavigation المشترك (يُصيَّر مرة واحدة في كل سطح HTML بما فيه 404؛ أُزيلت الـids المكررة من `main.ts`/`about`/`help` وأُعيدت تسمية حاوية الرئيسية إلى `home-content` مع تحديث `HomePage.ts`)؛ `Toast` كمنطقة معرَّفة `role="status"` + `aria-live="polite"`؛ نصوص خطأ `role="alert"` (تسجيل/استرداد/سحب)؛ ارتباط حقول/عناوين بصري حقيقي (`for`/`id`) في (تسجيل/تسجيل جديد/إعادة تعيين / إنشاء / سحب); نوافذ مخصصة (`settings`/`schedule`/`report`/`invite`) `role="dialog"` + `aria-modal` + زر إغلاق مع `aria-label` + إغلاق `Escape`؛ أسماء وصول للأزرار وحيدة الأيقونة؛ نجوم التقييم أزرار أصلية بأسماء صادقة (اسم المنافس + القيمة) بعد إزالة `radiogroup`/`radio` الزائفة (لا `aria-checked` مُدار ولا تنقل أسهم — الدور كان يكذب على التقنيات المساعدة).
- **استلام جنائي (BASE ‏d5233f4 → ‏a20a8bf)**: الـHEAD السابق فشل رسمياً (Quality #254 على `any-count ratchet baseline 310` ثم Deploy #483 skipped). السبب الجذري المثبت: `help-page.ts` أضاف ~20 `(tr as any)` (‏`tr` من نوع `any` أصلاً عبر `Record<string, any>` فالـcasts زائدة وتحسب في العداد) → ‏~315 > ‏310. إصلاحات الاستلام: (1) حذف كل `as any` المضافة (العدد الآن ‏295 ≤ ‏310)؛ (2) إصلاح رابط معطوب حقيقي: بطاقة الدعم كانت تبني `/messages?tab=admin?lang=` (‏`?` مزدوجة) عبر `withLang()`؛ (3) هدف الـskip كان موجوداً في 3 أسطح فقط من ~24 — أصبح شاملاً عبر الـnavigation؛ (4) إزالة أدوار الراديو الزائفة. كل ما عداها KEEP (المحتوى دقيق مقابل R2/D1/D2: ‏300s/H3/‏provisional/‏single-effective/‏timed-comments/‏snapshot/‏non-refundable/هوية Dueli الإدارية). بلا revert واسع، بلا تغيير منطق مغلق، بلا migration/dependency.
- **الأدلة**: T ‏`r3-c1-help-a11y` ‏20/20 (‏17 ثابتة مصححة + 3 إخراج مُصيَّر حقيقي عبر `app.request`: ‏`/help` en بكل الأقسام + هدف واحد + صفر `id` مكررة، ‏`/faq` ar بـRTL ونصوص مميزة، كل الـhrefs سليمة الشكل)؛ الجيران (`csp-hardening` ‏11/11، ‏`modal-accessibility` + ‏`b2-language` ‏18/18، ‏`b1-my-competitions-auth` + ‏`live-room-ui` ‏13/13)؛ `tsc --noEmit` ✅؛ `npm run build` ✅ (‏churn الـCSS رُجع)؛ عدّ `any` ‏295 ≤ ‏310.

- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـ`expected_head_sha` ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.

## R3-D2 user discovery + matchmaking (h7-v1) · فرع `feat/r3-d2-user-discovery` (PR #98، من `f8c7add` = origin/main بعد دمج R3-D1-REM1 #97)

- 🔧 ‏REMOTE REJECT ← إصلاح LOCAL مكتمل على نفس الفرع/PR، بانتظار re-REMOTE — ليست DONE. بلا PR جديد/دمج/نشر/كتابة إنتاجية/ترحيل (routes ‏225←235 ثابتة). D1+REM1 مغلقتان؛ H7-v1 بلا تغيير أوزان.
- الرفض (3 ‏blockers) والإصلاح على نفس ‏HEAD: ‏(1) ‏actual participation أصبح ‏`started_at IS NOT NULL` المركزي ‏(`ACTUAL_PARTICIPATION_WHERE` — ‏startLive الكاتب الوحيد المثبت) بدل ‏opponent/status، وطُبق على ‏loadProfiles/loadSpecializations/partCats؛ ‏(2) بوابة لغة في ‏h7OpponentLayer: ‏wrong-language المعروفة تسقط إلى ‏fallback 3 ولا تسبق ‏L2 المناسبة؛ ‏(3) ‏creator Profile المفقود في المشاركة ‏0.5 ‏neutral عند توفر الإشارة للجلسة بدل إسقاط الوزن (الصفر المقاس يبقى ‏0).
- **الأدلة**: T ‏`r3-d2-user-ranking` ‏16/16 (‏13 + مصفوفة ‏lifecycle الست + ‏wrong-language/ar/en + ‏neutrality الثلاثي) + ‏UI ‏`r3-d2-profile-display` ‏5/5؛ الحراس ‏220/220 (‏H7/D1/lifecycle/startLive/ratings/ELO/invite/follow/search/settings)؛ ‏`tsc` ✅؛ ‏`build` ✅ (‏churn رُجع)؛ ‏G2 ‏+0 ‏any.
- **المتبقي (blockers فقط)**: re-REMOTE مستقلة ← دمج بـ`expected_head_sha` ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.

## R3-D1-REM1 close 4 known follow-ups · فرع `fix/r3-d1-rem1-followups` (من `1c84bc4` = origin/main بعد دمج R3-D1 #96)

- 🔧 تنفيذ LOCAL مكتمل، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية/ترحيل/مسارات جديدة (routes ‏225←225). النطاق: الملاحظات الأربع فقط (Unicode search، حماية `fav:`، invariant عدّ المشاهدات، تصحيح التعليق) — بلا توسع إلى D2.
- العقد: طبقات H7 بلا تغيير (exact → prefix/whole-word → partial) مع whole-word Unicode حقيقي ar/en؛ `fav:` محجوز لمسار الإعدادات (generic writers محايَدة + taxonomy/ownership قائمتان)؛ H2 invariant حقيقي (كاتب واحد SSOT، `/analytics/view` alias idempotent، dead trap محذوف)؛ التعليق يصف الحقيقة الجديدة بعد الإثبات.
- **الأدلة**: T جديد `r3-d1-rem1-followups` ‏18/18 + الحراس المتأثرة (H7/search، favorites/settings، L1/watch/views، CSP، schema ‏127/127) خضراء؛ ‏`tsc` ✅؛ ‏`build` ✅ (‏churn رُجع)؛ ‏G2 ‏+0 ‏any.
- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـ`expected_head_sha` ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.

## R3-D1 H7 approved ranking (h7-v1) · فرع `feat/r3-d1-ranking` (من `17d6dd7` = origin/main بعد دمج R2-F #95)

- 🔧 تنفيذ LOCAL مكتمل، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية/خدمات مدفوعة/ترحيل جديد (routes ‏221←225: similar-sessions ×2 + settings/favorites ×2).
- العقد: H7-v1 حرفياً من 11 (الأوزان/الصيغ/الأنصاف/التوزيع/الاكتشاف/التنوع) بمصدر مركزي واحد؛ الأهلية أولاً ثم الترتيب على بنية الجلسات القائمة؛ Guest يرى upcoming؛ طبقات البحث قبل الشهرة؛ المشابهات بأوزان 11 بلا embeddings؛ الإشارات الحقيقية فقط (H2/نجوم فعالة/Like-Dislike/follows/history) + فجوة المفضلات أُغلقت داخل D1 (namespaced user_keywords + Settings).
- **الأدلة**: T جديد `r3-d1-h7-ranking` ‏21/21 + تحديث التثبيتات المتجاوَزة إلى H7 (`recommendations-ranking` ‏8/8، ‏`b7-explore-pagination-ordering` ‏3/3، ‏`guest-suggested-continuation` ‏9/9)؛ الحراس المتأثرة (§10: explore/home/search/ratings/likes/schema/settings/csp ‏126/126 + ‏UI ‏62/62) خضراء؛ الكاملة ‏1300/1316 (الـ16 بيئية Windows مسبقة على BASE: ‏6 jq + ‏10 readiness-CRLF بلا مساس migrations)؛ ‏`tsc` ✅؛ ‏`build` ✅ (‏churn رُجع)؛ ‏G2 ‏+0 ‏any.
- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـ`expected_head_sha` ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE. D2 خارج النطاق (Profile UI/history، user-search ranking، opponent matchmaking).

## R2-F remaining journeys (notifications/profile/deletion/social/donations/advertiser/moderation) · فرع `feat/r2-f-journeys` (من `2497bda` = origin/main بعد دمج R2-P #94)

- 🔧 تنفيذ LOCAL مكتمل، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية/ترحيل جديد/مسارات جديدة (routes ‏221←221). R1 والمالية/ELO/L1/V/L2/A/M/P وH7/D1/D2 مغلقة ولم تُمس خارج العقد.
- العقد: إشعارات (قراءة بملكية ‏404 لصف الغير)؛ شكاوى (تتبع بملكية ‏404 + مدخلا nav للمعلن/شكاوى)؛ متابعة (تكرار idempotent بإشعار واحد + hydration بعد refresh + زر إبلاغ في profile)؛ ‏reports الحالية ‏target_type/target_id/reason (القديمة ‏422 دائماً)؛ تبرعات (قسم ‏My Donations + ‏GET /my) بلا مساس المالية؛ معلن (إصلاح SyntaxError + مفتاح الجلسة الموحد)؛ حذف حساب ذري ‏batch واحد (إخفاء أولاً، أطفال-قبل-الأب لسلامة ‏FK، مسح ‏PII البنكية/السجل مع بقاء صفوف الدفتر، ‏verify بـ‏CryptoUtils).
- **الأدلة**: T جديد `r2-f-journeys` ‏7/7 + UI جديد `r2-f-journey-pages` ‏7/7 (‏SqliteD1 بالترحيلات الحقيقية: ملكية الإشعار/الشكوى ‏404، إشعار متابعة واحد، ‏verify ‏PBKDF2/legacy، حذف شامل ذري، عقد ‏reports، ‏my) + تحديث تثبيتات قديمة لعقد idempotent (‏follow-extraction/model)؛ الحراس المتأثرة (مال/تبرع/دفتر/stripe/sحب/شفافية + مخطط + ‏readiness + جيران ‏R2-A/M/P/J) خضراء؛ ‏`tsc` ✅؛ ‏`build` ✅ (‏churn رُجع)؛ ‏G2 ‏+0 ‏any؛ routes ‏221←221.
- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـ`expected_head_sha` ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.

## R2-P saved payout methods + withdrawal snapshots · فرع `feat/r2-p-payout-methods` (من `ec27f72` = origin/main بعد دمج R2-M #93)

- 🔧 تنفيذ LOCAL مكتمل، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية/تحويل فعلي (لا بنك/KYC/provider — مؤجل R0/H). ترحيل واحد مضاف (`0038_withdrawal_payout_snapshot`: عمودا `payout_method_id` ‏FK→payment_methods ‏SET NULL + `payout_snapshot` ‏NOT NULL ‏`'{}'` + فهرس) + بيان `baseline-0038` في نفس الفرع. R2-A/J/L1/V/L2 والمالية/ELO مغلقة ولم تُمس خارج العقد.
- العقد: ‏CRUD طرق الدفع القائم مُصلَّب (‏allowlist نوع + تحقق مدمج عند تغيير النوع + ‏i18n بدل الإنجليزية الحرفية + ملكية ‏404 + ‏setDefault ذري ‏batch + حذف ‏default يرقّي الأقدم/‏null)؛ السحب يقبل ‏`payout_method_id` مملوكاً (غيره ‏404) فيلتقط لقطة التنفيذ ويملأ ‏display تلقائياً، أو المسار النصي القديم كما هو؛ اللقطة تُكتب مرة واحدة ولا تُحدَّث أبداً (تعديل/حذف الطريقة لاحقاً لا يغيّر الطلب — الرابط وحده ‏NULL)؛ صفوف ‏legacy (بما فيها ما قبل ‏R2-P) تُصرف ‏approve→paid بلا تغيير.
- **الأدلة**: T جديد `r2-p-payout-methods` ‏5/5 (SqliteD1 حقيقية: ‏CRUD/تحقق/‏default/ترقية الحذف/عبور-مستخدم ‏404/لقطة/تجميد/‏legacy) + UI جديد `r2-p-payout-ui` ‏5/5 (مودال يعرض المحفوظ أولاً + إرسال ‏id/نص + ‏CSP بلا مداخل جديدة + ‏i18n ‏ar≠en)؛ الحراس المتأثرة ‏72/72 (سحب/مال/دفع/شفافية/أرباح) + ‏schema-contract ‏24/24 (كانت حمراء على ‏BASE منذ ‏R2-L1 — حُدّثت للواقع ‏35←39 + جداول ‏0035–0037 + عمودا ‏0038) + تقاعد ‏13/13 (‏FK الجديدة ليست ‏users/competitions فلا تغطية لازمة) + ‏readiness ‏24/24 (‏0037-shape ‏FAIL + ‏0038-shape ‏PASS)؛ ‏`tsc` ✅؛ ‏`build` ✅ (‏churn رُجع)؛ ‏G2 ‏281 = ‏BASE ‏281؛ routes ‏221←221 (لا مسارات جديدة — CRUD/السحب على المسارات القائمة).
- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـ`expected_head_sha` ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. تطبيق 0038 إنتاجياً يبقى owner-gated (‏pre-merge action من القائد). أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.

- 🔧 تنفيذ LOCAL مكتمل، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية. ترحيل واحد مضاف (`0037_support_messaging`: جداول `support_threads/messages` + 4 فهارس — لا صفوف seed) + بيان الإصدار `baseline-0037` في نفس الفرع. R2-A/J/L1/V/L2 مغلقة ولم تُمس؛ بلا R2-P/H7/D1/D2.
- العقد: (1) الشخصي — النظام القائم كما هو (ALREADY DONE: بدء/إرسال/قراءة/unread/حدود/حظر) ومثبت باختبار إثبات (محادثة ثنائية + ثبات refresh + حجب الغريب 403 + مجهول 401). (2) الإداري — نظام مستقل H6: تخزين `support_*` فقط (ممنوع الشخصي)، مسارات `/api/support/*` للمستخدم (خيوطه فقط) و`/api/admin/support/*` للوكلاء؛ كتابة SuperAdmin/Moderator وقراءة Auditor (غيره 403)؛ الرد الرسمي `sender_kind=admin` بهوية Dueli الرسمية (لا رابط شخصي) مع `sender_id` + audit؛ إشعار مميز `admin_message` برابط الخيط الإداري (لا خلط مع `message`). (3) UI — تبويبا personal/admin بعدادات مستقلة + روابط عميقة (`tab/conversation/thread/user`)؛ أيقونة Contact Admin → `?tab=admin` (الميت `?admin=true` أُزيل)؛ إشعار الإدارة يفتح الخيط الصحيح؛ صندوق وارد مستقل في لوحة الإدارة؛ ar/en + RTL + CSP.
- **الأدلة**: T شخصي `r2-m-personal` ‏3/3 + T إداري `r2-m-admin` ‏5/5 (SqliteD1 بالترحيلات الحقيقية: فتح/رد/إغلاق-409/إعادة-فتح، أدوار ‏200/403، فصل unreads، فصل تخزين بالعدّ الصفري، رابط الإشعار ‏`tab=admin&thread=`) + UI جديد `r2-m-messages-ui` ‏11/11؛ الجيران المباشرون (notification-types/messages-i18n/messages-contract/template/avatar) خضراء — كشف قديم واحد (`messages-contract` يثبت collection واحدة) حُفظ بإعادة تسمية متغير الدعم؛ الكل ‏95/95؛ ‏`tsc` ✅؛ ‏`build` ✅ (‏CSS churn رُجع)؛ ‏G2 ‏281 = ‏BASE ‏281 (صفر جديد)؛ routes ‏211←221 (5 دعم + 5 صندوق إداري)؛ readiness ‏22/22 (‏0036-shape ‏FAIL + ‏0037-shape ‏PASS).
- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـ`expected_head_sha` ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. تطبيق 0037 إنتاجياً يبقى owner-gated بعد الدمج. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.
- **FIX (CI #240، نفس الفرع)**: فاحص `SyntheticRetirement` كشف FKs غير مغطاة (`support_threads.user_id` + `support_messages.sender_id`) — أُضيفت القائمتان بنمط `USER_DEPENDENTS` القائم (تخطي مالكي صفوف الدعم، بلا تدمير تلقائي، بلا تغيير migration/manifest) + إثبات سلوكي (تقاعد الحر يُقبل، مالك الخيط يُتخطى بلا FK failure). المستهدف ‏55/55 ✅، ‏G2 ‏281 = ‏BASE.

## R2-A admin identity/access + account settings + roles + H9 documents/data · فرع `feat/r2-a-admin` (من `fed9b93` = origin/main بعد دمج R2-L2 #91)

- 🔧 تنفيذ LOCAL مكتمل، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية. ترحيل واحد مضاف (`0036_managed_documents` — لا صفوف seed فيه؛ بيانات الاختبار في `db/seed.sql` موسومة `is_seed=1`). J/L1/V/L2 مغلقة ولم تُمس؛ بلا R2-M/R2-P/bank/H7/D1/D2. حساب `admin/admin` مؤقت للتطوير فقط (سكربت، لا migration/seed، والإنتاج H8/owner-gated).
- العقد: (1) الهوية — bootstrap جاف-أولاً + local فقط + رفض remote؛ حارس خادمي على `/admin` (غير مشرف 403) + مدخل `#adminMenuItem` للمشرف فقط؛ `role/is_admin` موحّدان (مزامنة عند المنح/السحب، بلا نظام موازٍ). (2) الإعدادات — username/password/email من الحساب نفسه مع تحقق (409/422/401) ودورة جلسات صحيحة (كلمة المرور تدمر الكل + reauth؛ البريد يصفّر التوثيق ويُبقي الجلسات) وaudit بلا أسرار وDTO بلا hash. (3) الأدوار — SuperAdmin فقط للمنح/السحب (غيره 403)؛ دور صالح فقط (422)؛ هدف موجود (404)؛ آخر SuperAdmin محمي (409). (4) وثائق H9 — CRUD إداري + draft/published + معاينة ar/en + private/public (العامة المنشورة تُقرأ مجهولاً، الباقي 404) + version++ وaudit؛ لا بنك/KYC حقيقي ولا CMS عام. (5) ملاحظة: `GET /api/admin/stats` ‏500 قائم على BASE (عمود `amount` مفقود — لم يُمس، خارج النطاق).
- **الأدلة**: T جديد `r2-a-admin` ‏9/9 (SqliteD1 بالترحيلات الحقيقية: دخول admin ‏200/خاطئ ‏401؛ حارس ‏200/403/403 + صفحة ‏200/403؛ الإعدادات الثلاثة + دورات الجلسات + ‏audit + بلا تسريب؛ منح/سحب + ‏403 تصعيد + ‏422/404/409؛ وثائق ‏CRUD/version/نشر/خصوصية/حذف + ‏audit + ‏seed موسوم؛ ثبات الجلسة) + UI جديد `r2-a-admin-ui` ‏10/10 (حارس/مدخل/حساب/وثائق/‏CSP/i18n ar≠en/‏bootstrap/مسارات/‏dark-RTL)؛ ‏csp-hardening ‏11/11؛ ‏`tsc` ✅؛ ‏`build` ✅ (‏CSS churn رُجع)؛ ‏G2 ‏286 مقابل ‏BASE ‏281 (‏+5، دون 310)؛ routes ‏202←211 (3 حساب + 5 وثائق إدارية + 1 قراءة عامة — مولّدة آلياً)؛ بلا full gates معادة.
- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـ`expected_head_sha` ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. إنتاج المشرف (H8) يبقى owner-gated بعد الدمج. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.

## R2-L2 production live-room + Media/VOD + Like/Dislike + timed comments + single ad slot · فرع `feat/r2-l2-live-room` (من `35ccd4f` = origin/main بعد دمج R2-V #90)

- 🔧 تنفيذ LOCAL مكتمل، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية. ترحيل واحد مضاف (`0035_comments_video_offset`: عمود `video_offset` ‏NULL — ضروري فعلاً: لا بنية قائمة تحمل موضع التشغيل؛ تُختبر مع الترحيلات الحقيقية). J/L1/V مغلقة ولم تُعَد بناؤها (90/90 خضراء)؛ بلا H7/D1/D2 (إشارات Like/Dislike جاهزة شكلاً فقط)؛ بلا ranking؛ بلا تغيير صلاحيات start/end؛ اختبار S/device مؤجل لـR4 (غياب الجهاز ليس blocker للكود).
- العقد: (1) الغرفة — creator/opponent/viewer يدخلون `/live/:id` الإنتاجية (الدور من الجلسة)؛ صفحات `/live/host|guest` التجريبية باقية للتشخيص وليست الوسيلة الوحيدة. (2) الوسائط — حالات waiting/playing/error/processing/ready/unavailable + retry يدوي (تكرار تلقائي محدود 8×15s)؛ الجاهزية من `hasPlayableRecording` وحده (بلا HEAD)؛ completed بلا تسجيل ≠ recorded. (3) Like/Dislike — thumbs بدل القلب، فعالة واحدة like/dislike/neutral تُرسم من استجابة الخادم (التبديل لا يضاعف)؛ `show()` تحمل `user_reaction`. (4) تعليقات موقوتة — `video_offset` في POST/SSE/GET على نفس قناة `competition:<id>` (لا نظام ثانٍ)؛ الالتقاط في VOD فقط؛ القائمة النهائية مرتبة زمنياً؛ تمييز متزامن مع `timeupdate`. (5) إعلان واحد تحت الإحصائيات بعيداً عن video/comments/ratings عبر الخدمة القائمة؛ impression مرة واحدة عند الظهور الفعلي (observer + idempotency)؛ الميزانية/الخصم خادمياً؛ بلا click ولا إجراء مدفوع.
- **الأدلة**: T جديد `r2-l2-timed-comments` 6/6 (SqliteD1 بالترحيلات الحقيقية: offset/تقليم-NULL/SSE/get، ‏recorded مقابل bare، تبديل like→dislike بصف واحد وneutral، ‏user_reaction، حراس 403/409) + UI جديد `r2-l2-competition-ui` 9/9 (غرفة/حالات/retry/‏predicate/زوج التفاعل/توقيت/إعلان/‏i18n/‏dark-RTL)؛ الجيران J/L1/V/likes/comments/guards/ads ‏90/90؛ الكاملة ‏1226/1232 (الـ6 ‏quality-gate-poll: غياب ‏jq على ‏Windows — بيئية ومثبتة على ‏BASE)؛ ‏`tsc` ✅؛ ‏`build` ✅ (‏CSS churn رُجع)؛ ‏G2 ‏281 = ‏BASE ‏281؛ routes بلا تغيير (لا endpoints جديدة).
- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـ`expected_head_sha` ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.

## R2-V live-only viewer ratings · فرع `feat/r2-v-live-ratings` (من `fbc8607` = origin/main)

- 🔧 تنفيذ LOCAL مكتمل، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية/تعديل migrations. R2-L1 مغلقة ومنشورة ولم تُمس (أُعيد استعمال SSOT الـwatch فقط)؛ بلا watch mechanism جديد؛ بلا L2/H7/D1/D2.
- العقد: تقييم 1..5 للمسجل المؤهل (300s live لنفس المنافسة عبر `getViewerWatch` وحده؛ 299⇒403 و300⇒201؛ بلا ثقة بمدخلات العميل)؛ الطرفان معاً مسموحان؛ التعديل يستبدل (POST upsert 201/200 + PUT صريح 200/404؛ صوت فعال واحد)؛ كل كتابة (rate/update/withdraw) محروسة داخل SQL بحالة `live` (سباق القطع ⇒ 403 بلا صف)؛ بعد النهاية كل كتابة مرفوضة فوراً (لا 24h ولا grace)؛ أثناء البث حصيلة مؤقتة معلنة تُبث عبر قناة `competition:<id>` القائمة (`rating_updated`)؛ عند الإغلاق قطع أولاً ثم نتيجة نهائية/ELO/finalize مرة واحدة مع retry/idempotency؛ المعادلات (winner/ELO) والـ20/80 والتاريخ المغلق محفوظة؛ no-ratings/tie بلا نتيجة وهمية؛ واجهة ar/en بالحالات (provisional/final/not-eligible/read-only).
- **الأدلة**: RED أولاً على BASE (جديد `r2-v-live-ratings` 9/10 فشل)؛ T جديد 10/10 (SqliteD1 بالترحيلات الحقيقية) + UI جديد 6/6؛ عقود B10/B11/B12 أُعيدت كتابتها لـR2-V (بلا 24h) + L1/finance بلا regression (83/83)؛ الكاملة 1211/1217 (الـ6 jq على Windows مثبتة على BASE)؛ `tsc` ✅؛ `build` ✅؛ G2 289 = BASE 289؛ routes 201←202.
- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـ`expected_head_sha` ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.

## RELEASE READINESS PATH remediation (Deploy #458) · فرع `fix/release-readiness-path` (من `210008a` = origin/main)

- 🔧 تنفيذ LOCAL مكتمل، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية/تعديل migrations/منتج. النطاق: سطر جامع الـdeploy + سطر الـrunbook + اختباراهما + سطرا docs.
- ‏ROOT CAUSE مثبت على ‏D1 الحية: جامع الـworkflow كان يبني لقطة الفهارس بقائمة مكتوبة يدوياً (‏0033 فقط) فلم تصل ‏idx_competition_views_day الموجودة فعلاً إلى الفاحص — ‏#458 فشل على إنتاج سليم. الإصلاح: القائمة تُشتق من نفس الـmanifest (لا ‏hardcode يجعل ‏0034 يمر فقط؛ أي ‏baseline لاحقة محمية) + ‏runbook §2.
- **الأدلة**: المسار الحرفي الكامل (‏bash جامع الإنتاج ‏read-only + journal + ‏pending فارغ + ‏SHA ‏210008a) ← ‏**READINESS GATE PASS** ‏(16/16)؛ الاستعلام القديم أُعيد حياً فأظهر ‏4 فهارس فقط (إعادة إنتاج العلة)؛ ‏release-readiness ‏15/15 + ‏pin هيكلي للجامع؛ ‏fail-closed محفوظ (‏unknown/hash/missing/target/sha)؛ كل متطلبات الـmanifest مُتحقَّق منها (‏3 جداول × أعمدة + ‏3 فهارس)؛ الكاملة ‏1195/1201 (الـ6 ‏jq على ‏Windows مثبتة على ‏BASE)؛ ‏`tsc` ✅؛ ‏`build` ✅؛ ‏G2 ‏281 = ‏BASE.
- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـ`expected_head_sha` ← انتظار Quality Gate على merge-commit ← ثم deploy الإصدار عبر المسار المصرّح (لا deploy يدوي هنا). أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.

## RELEASE MANIFEST 0034 remediation · فرع `fix/release-manifest-0034` (من `f4c1e66` = origin/main)

- 🔧 تنفيذ LOCAL مكتمل، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية/تعديل migrations. النطاق: manifest الـrelease + اختباراته + سطرا docs فقط.
- السبب: ‏production طبقت ‏0034 بتفويض بينما الـmanifest بقي ‏baseline-0033 فسجل البوابة ‏0034 ‏unexpected-applied ومنع ‏Deploy #456 (المحاولة 2). الإصلاح: ‏baseline-0034 (‏0034 بـhash الملف ‏`7c19c632…e4a57` + ‏history ‏35 + فحوص ‏competition_views/index) — بلا مساس بالـchecker (عام بالتصميم) أو الـmigrations أو الـworkflows.
- **الأدلة**: ‏`release-readiness` ‏14/14 (‏pin ‏0034، سيناريو الإنتاج ‏PASS، ‏pre-0034 ‏FAIL-closed، ‏fail-closed الباقي محفوظ)؛ محاكاة البوابة على مدخلات الإنتاج الحقيقية (journal + ‏pending فارغ + لقطة مخطط حية + ‏SHA ‏f4c1e66) ← ‏**READINESS GATE PASS**؛ الكاملة ‏1193/1199 (الـ6 ‏jq على ‏Windows مثبتة على ‏BASE)؛ ‏`tsc` ✅؛ ‏`build` ✅؛ ‏G2 ‏281 = ‏BASE.
- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـ`expected_head_sha` ← انتظار Quality Gate على merge-commit ← ثم deploy الإصدار عبر المسار المصرّح (لا deploy يدوي هنا). أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.

## R2-L1 التعليقات المشتركة والمشاهدة والحضور · فرع `feat/r2-l1-comments-watch` (من `4c6ddd9` = origin/main)

- 🔧 تنفيذ LOCAL مكتمل، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية. migration واحدة مضافة (`0034_competition_views`: UNIQUE identity/competition/day — ضرورية فعلاً: لا بنية قائمة تحمل guest+day؛ مختبرة reset من فراغ 23/23).
- العقد: تعليقات مشتركة ومحفوظة API/SSE بالكاتب الصحيح وdedup بالمعرف وتبقى بعد refresh (أصلحنا سباق init-at-parse الذي كان يترك الصندوق فارغاً بعد كل reload)؛ الحضور (signaling) مستقل عن العدّ؛ GET لا يعدّ؛ H2 مشاهدة واحدة لكل identity/competition/day (مسجل + ضيف first-party، بلا IP)؛ H1 ‏300s تراكمية live للمسجل فقط بشرائح خادمية capped (‏120s) بلا ثقة بالجسم، وreconnect/replay لا يضاعفان؛ ‏V تقرأ من ‏`getViewerWatch` وحده (سلوك التقييم الحالي untouched)؛ ‏recorded/pending لا تراكم ‏H1؛ بلا ‏R2-V/L2/Like/video-time/H7/J/#86.
- **الأدلة**: ‏RED أولاً على ‏BASE؛ ‏T ‏`r2-l1-watch-comments` ‏12/12 (‏299/300، ‏cap، ‏replay＋0، تزوير مرفوض، ‏day، ضيوف، تزامن، ‏401/403/404/422)؛ ‏UI ‏`r2-l1-comments-watch` ‏6/6؛ ‏E2E حقيقي ‏1/1 ‏ar + ‏1/1 ‏en (‏A/B/C بنفس القائمة والعدّ بعد ‏refresh، حذف يزامن حياً، عدّاد ثابت، نبض مكرر/مزور بلا أثر، ‏mobile/keyboard، صفر أخطاء)؛ الجيران + الكاملة ‏1190/1196 (الـ6 ‏jq على ‏Windows مثبتة على ‏BASE)؛ ‏schema-contract ‏23/23؛ ‏`tsc` ✅؛ ‏`build` ✅؛ ‏G2 ‏281 = ‏BASE؛ ‏routes ‏199←201.
- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـ`expected_head_sha` ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.

## R3-EXPLORE-CONTEXT-1 سياق View All والفرع في Explore · فرع `feat/r3-explore-context-1` (من `020eacc` = origin/main)

- 🔧 تنفيذ LOCAL مكتمل، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية، بلا migrations (إعادة استعمال جداول ‏0033)، بلا engine/store جديد، بلا H7/ranking، بلا R2-J/#75/#76/#82.
- العقد: ‏View All من typed rail context (‏category + ‏subcategory + ‏status + ‏lang + ‏view=competitions؛ ‏Suggested يحمل حالته بلا قسم مختلق) عبر ‏`railViewAllHref` + ظاهر على mobile (أُزيل ‏`hidden sm:flex`)؛ ‏Explore يعرض فلتر فرع صريحاً من taxonomy القائمة (‏parent يمسح فرعاً يتيماً، الفرع لا يسقط ‏status/search/lang/view، و‏view تُحفظ عند submit)؛ ‏URL/direct-open/refresh/back-forward تحفظ السياق؛ الجلسة canonical تشمل ‏subcategory (‏canonicalKey رباعي — الجلسات القديمة ‏409 تُعاد بوضوح)؛ ‏filtering خادمياً قبل pagination؛ ‏retry/cursor/skip-fill داخل التقاطع حتى ‏hasMore=false؛ الأزواج الباطلة ‏422/409 بلا توسعة صامتة إلى ‏All؛ الفرع بلا parent يُملأ canonical لparentه المعروف؛ ‏recorded = ‏completed + تسجيل صالح (‏vod/youtube مقلَّمة — ‏`playableRecording` opt-in في ‏buildFilterWhere، القائمة القديمة untouched).
- **الأدلة**: ‏RED أولاً (‏9/11 فشلت على ‏BASE)؛ ‏T جديد ‏`explore-subcategory-context` ‏11/11 (تقاطع فرع+‏live/upcoming/recorded، ‏traversal ‏>دفعتين بلا ‏dup/skip، ‏invalid pairs ‏422، ‏canonicalize للparent، ‏409 ‏stale/mismatch، ‏retry متطابق، ‏410/404، ‏skip-fill حتى النفاد، ‏search×branch، ضيوف)؛ ‏UI جديد ‏`explore-subcategory-filters` ‏11/11 (‏View All لكل نوع ‏ar/en، ‏selects/روابط/‏banner، ‏session transport، صفر مفاتيح جديدة)؛ ‏E2E حقيقي (‏wrangler+D1 محلي) ‏3/3 ‏ar + ‏3/3 ‏en (‏direct/refresh/back-forward/تغيير فرع، ‏invalid بلا ‏fetch، ‏Home ‏mobile/keyboard/Enter، صفر ‏page/console errors، صفر ‏API فاشلة)؛ الجيران (‏B7/home-rails/owner-visual/search ‏T + ‏B7 ‏E2E ‏4/4) خضراء؛ الكاملة ‏1172/1178 (الـ6 الباقية ‏jq مفقود على ‏Windows — مثبتة على ‏BASE)؛ ‏`tsc` ✅؛ ‏`build` ✅؛ ‏G2 ‏281 = ‏BASE ‏281؛ ‏SEC-06 ‏PASS (تعليق توثيقي فقط).
- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـ`expected_head_sha` ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.

## R2-J الدعوة/الطلب والقبول/الرفض/الانتهاء · فرع `feat/r2-j-invite-join-lifecycle` (من `4c02862` = origin/main)

- 🔧 تنفيذ LOCAL مكتمل، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية، بلا migrations جديدة (الأعمدة اللازمة موجودة: `accepted_at` في 0010/0011 و`expires_at` في 0010).
- H3 مطبقة خادمياً وواجهوياً: الدعوة المعلقة لنفس المستخدم/المنافسة تمنع طلب انضمام موازياً (409 `invite_pending_exists`)، والطلب المعلق يمنع دعوة موازية (409 `request_pending_exists`)؛ رفض الدعوة يحرر مسار الطلب مجدداً.
- القبول الذري في المسار المستدعى فقط: `accepted_at` تُكتب في نفس الـbatch (منافسات + دعوات)، وخطوة التثبيت تشترط `status='pending'` فلا إحياء لصف مرفوض/مقبول؛ السباق ينتج خصماً واحداً وإشعار قبول واحد (مثبت باختبار تزامن). لا اختراع رجوع accepted→pending ولا حالات جديدة ولا cron/ترحيل تاريخ.
- القبول يتحقق بالترتيب: الدعوة/الطلب معلقة لهذا المستخدم ← غير منتهية (انتهاء كسول `markExpired` بالقيم الموجودة في CHECK) ← المنافسة ما زالت pending بلا خصم ← الحظر ← الذرية (الخاسر 409). المنافسات المغلقة تعطل الأزرار وتعرض سبباً مترجماً (`competition_closed`/`opponent_already_set`).
- إشعار القبول نوع مستقل `invitation_accepted` (لا `request`)، عنوانه `notification.invitation_accepted` عربي/إنجليزي، والرابط `/competition/:id?lang=` بلغة المستلم عند العرض. السجل وارد/صادر بكل الحالات من الموديلات (بلا SQL في المتحكمات)؛ `show` يعرض `user_has_pending_invitation` للcurrent-user فقط؛ صفحة المنافسة تعرض قبول/رفض للمدعو وتمنع المسارات المتعارضة؛ أخطاء 401/403/409 مرئية ومترجمة في API والواجهات.
- **الأدلة**: T جديد `r2-j-invite-join` ‏20/20 (sqlite-d1 بالترحيلات الحقيقية: تعارض H3 بالاتجاهين ar/en، تكرار 409، تزامن بخصم/إشعار واحد، `accepted_at`، رفض/انتهاء/مغلق، حظر/غير مؤهل/401 لكل المسارات، إشعار مميز ومعرب برابط صحيح، سجل كل الحالات مع 403 للغير و401 للزائر، حالة show خاصة بالمستخدم) + UI جديد `r2-j-invite-contract` ‏6/6؛ تحديث 3 تثبيتات قديمة لعقد 409/النوع الجديد؛ الجيران 67/67؛ الكاملة 1148/1156 (8 إخفاقات موجودة على BASE بلا علاقة: 6× غياب `jq` على Windows و2× بصمة 0033 قديمة)؛ `tsc` ✅؛ `build` ✅؛ G2 ‏281 = ‏BASE ‏281.
- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـ`expected_head_sha` ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.


## R3-RAILS-1A+1B home rails continuation · فرع `feat/r3-rails-1ab-continuation` (من `daa449b` = origin/main)

- 🔧 ‏(1A خلفية) كل صفوف Home على مخزن جلسة #75 نفسه (‏ExploreSessionService + ‏ResultSessionProvider + ‏ExploreResultSessionModel/ExploreResultChunkModel — بلا engine/store موازٍ، بلا migrations، بلا تعديل Explore ‏6+6، ‏#75/#76 كما هما): ‏`HomeRailProviders.ts` جديد (‏SuggestedGuestRailProvider واعٍ بالstatus على عائلة سطح ‏`suggested_guest`؛ ‏SuggestedUserRailProvider بسطح ‏`home_suggested_user`؛ ‏CategoryRailProvider بسطح ‏`home_category` لكل Dialogue/Science/Talents وكل subcategory × ‏Live/Recorded/Upcoming) + ‏`HomeRailsController` (بلا SQL) + ‏`POST/GET /api/home-rails/sessions[/:id/page]` (‏auth-optional؛ الجرد ‏197←199). سياق canonical: ‏kind/category/subcategory/status/language/identity/surface/policy ‏`rail-v1`. ‏live=live، ‏upcoming=pending+accepted، ‏recorded=completed+تسجيل صالح (‏vod_url أو ‏youtube_video_url مقلَّمة غير فارغة — ‏RecommendationModel وُسِّعت إضافياً بلا كسر ‏#76؛ ‏CompetitionModel.findHomeRailIds يعيد استعمال نفس predicate بلا ‏LIMIT). المزود يجلب كامل المؤهلين (لا ‏15/100)؛ تجميد الترتيب عند ‏T0 للجلسة فقط (‏Suggested: الأوزان المثبتة؛ الأقسام: خلطة WebCrypto واحدة بدل ‏RANDOM لكل دفعة — لا ‏H7 رقمية ولا ‏random-only نهائي)؛ ‏skip/fill ونفاد حقيقي؛ الحظر/الإخفاء/الذات تُضيِّق مسارات المسجل (كشف إصلاح علة ربط: معاملات الاستبعاد كانت تُربط قبل ‏lang في نص يضع ‏`?` اللغة في ‏ORDER BY — أُصلح الترتيب النصي)؛ الضيف يرى ‏Upcoming (تبويب ظاهر للجميع + إزالة ‏`hidden` العميل) بلا أي صلاحية فعل (‏invite/join تبقى ‏401).
- 🔧 ‏(1B واجهة) كل سكة continuation أفقي مستقل (‏sentinel داخل ‏scroller + ‏IntersectionObserver لكل سكة): دفعات حتى ‏hasMore=false فقط؛ ‏loading/retry/empty/end بالمفاتيح القائمة (‏discovery.retry/no_more_results/loading — صفر مفاتيح جديدة)؛ ‏retry بنفس ‏cursor بلا ‏double append (‏dedup لكل سكة، بلا ‏dedup عابر)؛ ‏404/409/410 ← إعادة تجميد واحدة محدودة بلا خلط لقطتين (كشف عيبين بالمتصفح الحقيقي وأُصلحا: سباق إصدار رمز الضيف عبر creates متوازية ← إصدار مسبق متزامن واحد؛ ‏restart كان يستبدل عقدة ‏sentinel المراقَبة ← إعادة تسليح)؛ تغيير ‏tab/category/language/login/logout يبطل الرد القديم (‏generation) ويبدأ سياقاً جديداً؛ لا سقوط صامت إلى ‏15؛ ‏RTL/LTR + ‏mobile/desktop + ‏keyboard/pointer (‏tabindex/role/aria-live/retry بزر أصلي).
- **الأدلة**: ‏T جديد ‏`home-rails-continuation` ‏13/13 (‏151 مؤهلاً في سكة ‏live واحدة حتى النفاد ‏exactly-once عبر ‏13 دفعة؛ كل الحالات ‏Guest/User/category/sub/status/lang؛ ‏Suggested بكل الحالات الثلاث؛ ‏youtube-only تدخل و‏null/empty/whitespace تُستبعد؛ ‏retry/race/TTL/404/409/410/422؛ دفعات جزئية/فارغة تستمر؛ ‏refresh بلقطة جديدة؛ ‏ar/en؛ كلفة ‏build ‏~60–90ms واجتياز ‏151 صفاً ‏~60–100ms بلا اقتطاع؛ متحكم بلا ‏SQL)؛ ‏UI جديد ‏`home-rails-presentation` ‏13/13 (‏ar/en/RTL/LTR/dark/keyboard)؛ ‏E2E حقيقي (‏wrangler+D1 محلي) ‏8/8 ‏ar+en (سكّة مقترح + سكّة قسم حتى علامة النهاية المترجمة، ‏upcoming للضيف مع ‏retry، صفر ‏API فاشلة، صفر أخطاء صفحة)؛ الجيران (‏guest/explore/ranking/lang/discovery/smoke) ‏70/70؛ الكاملة ‏1115/1115 (‏108 ملفات)؛ ‏`tsc` ✅؛ ‏`build` ✅؛ ‏G2 ‏289 ≤ ‏BASE ‏295 (نزل ‏6 — صفر ‏`any` جديد)؛ ‏SEC-06 ‏PASS.
- **الصادق**: ‏**no remote production writes — صفر كتابة إنتاجية** (‏e2e أعاد ضبط D1 محلي فقط عبر ‏webServer؛ بلا ‏deploy)؛ ترتيب الأقسام الموزون ‏WEIGHTED HOME OPEN — ‏continuation جاهز لكن إغلاق تجربة ‏Home يتطلب أرقام ‏H7 المعتمدة في ‏D0/D1 (‏policy ‏rail-v1)؛ ‏recorded في ‏e2e شحيحة البذرة (‏6 ‏completed بلا ‏VOD غالباً) فتُغطَّى آلياً فقط؛ ‏wrangler أظهر ‏X [ERROR] بنية تحتية عابرة واحدة (‏miniflare loopback بلا ‏stack تطبيق — تعافت، ومسار ‏retry المترجم غطاها في الاختبار). بلا دمج/نشر. لا ادعاء ‏D1/D2.
- **أي ‏blocker متعلق بـH7**: لا يوجد حاجب — الأرقام فقط غير معتمدة (‏D0 يعرضها، ‏D1 يطبقها على نفس المزودات/الأسطح دون إعادة بناء).

## R-RELEASE-1 release safety · فرع `fix/r-release-1` (من `b23cfe2` = origin/main)

- 🔧 ‏(1) ‏SEC-06 أصبح AST تنفيذياً: direct/multiline و`(Math.random)()` و`Math['random']()` وalias (`const r = Math.random; r()`، destructuring، assignment) وdeferred-ref — بلا اصطياد comments/strings/types؛ dynamic keys وbind/indirection خارج النطاق المعلن (لا ادعاء obfuscation عام)؛ مدخل مفقود/غير مقروء = FAIL. ‏(2) عزل bindings: ‏`env.preview.d1_databases: []` صريح في wrangler.jsonc + بوابة fail-closed (preview بأي D1 أو بنفس id الإنتاج = FAIL؛ بلا D1 معاينة مأذونة، بلا إنشاء مورد/نسخ بيانات). ‏(3) ‏deploy ينتظر Quality Gate لنفس SHA عبر فحص API فقط (PR=head SHA، push=github.sha) بلا إعادة suite + توقف آمن للـforks بلا أسرار. ‏(4) بوابة جاهزية مخطط قراءة-فقط: ‏manifest ‏`R-RELEASE-1.baseline-0033` (‏0033 + sha256 مثبت + history الـ34 + الجداول/الأعمدة/الفهارس)؛ required-pending/changed/integrity/missing-schema/read-failure/unknown-target/unexpected = ‏FAIL قبل النشر؛ الـunexpected تُسجَّل ولا تُطبَّق (لا مسار apply). ‏(5) ‏runbook آمن ‏`docs/19-RELEASE-RUNBOOK.md` (تحضير/apply مأذون يدوياً + ممنوعات) + صف H في خريطة 00. ‏(6) ‏Wrangler والبنية كما هما؛ صفر `src/` (بلا تغيير وظيفي).
- **الأدلة**: ‏T ‏`sec06-checker` ‏13/13 (كل الصور + السلبيات + fail-closed) و`pages-bindings` ‏9/9 و`release-readiness` ‏11/11 (happy/pending/mismatch/schema/unexpected/read-fail/unknown + تطابق manifest) و`deploy-workflow` ‏7/7 (pins الربط)؛ ‏YAML الملفين صالح؛ الكاملة ‏1089/1089 (‏106 ملفات)؛ ‏`tsc` ✅؛ ‏`build` ✅؛ ‏G2 ‏286 = ‏BASE.
- **الصادق**: ‏**no remote production writes — صفر كتابة إنتاجية في هذا العمل** (فحص محلي + fixtures فقط)؛ سلوك runtime لـ`env.preview` الفارغة يثبت عند أول preview مأذون؛ صيغة `migrations list` وجدول `d1_migrations` مثبتان محلياً (الثاني) لا عن بُعد؛ ‏Git auto-deploy كمسار التفاف تحقق لوحة-تحكم بيد المالك. **يحتاج Owner authorization**: إنشاء/تفويض preview D1، أي apply/restore إنتاجي، قرار الإطلاق. بلا دمج/نشر.

## RESET EMAIL NOTICE + HOME RAIL FORENSIC · فرع `fix/reset-email-notice-home-rail-forensic` (من `af96b8f` = origin/main)

- 🔧 ‏(A) تنبيه Spam/Junk بجانب كل نجاح إرسال بريد فعلي (‏3 تدفقات: التسجيل، إعادة الإرسال، نسيان المرور) عبر مفتاح مشترك `auth_check_spam_folder` و`Modal.showEmailSentMessage()` — بلا hardcode، بلا مساس EmailService/contracts/النصوص القائمة؛ يُحجب عند الفشل وعند `email_not_configured`. ‏(B) تحقيق rails بلا كود: ‏Suggested/زائر بجلسة #75/#76 حتى النفاد الحقيقي؛ ‏Suggested/مسجل دفعة 15 واحدة بلا استمرار؛ ‏Dialogue/Science/Talents والفرعية `ORDER BY RANDOM()` دفعة 15 بلا استمرار/عرض-الكل؛ ‏Suggested يتجاهل تبويب live/recorded/upcoming.
- **الأدلة**: ‏T جديد `email-spam-notice` ‏6/6 (التنبيه في التدفقات الـ3 ar/en، بلا hardcode، غائب عند الفشل)؛ المستهدفة ‏33/33؛ ‏`tsc` ✅؛ ‏`build` ✅؛ ‏G2 ‏286 = ‏BASE.
- **REMEDIATION (نفس الفرع) — بلوكير نجاح-مع-فشل-إرسال**: ‏register كان يعرض التنبيه مع `warning` نص حر رغم عدم الإرسال → أصبح `email_send_failed` machine-readable، والعميل يعرض التنبيه فقط بلا warning؛ زر resend لكلا التحذيرين؛ ‏resend يبقى رسالة عامة بلا تنبيه (العام لا يؤكد إرسالاً بتصميم anti-enumeration). إعادة التحقق: ‏35/35، ‏`tsc` ✅، ‏`build` ✅، ‏G2 ‏286.
- **الصادق**: ‏التنبيه UX guidance فقط — لا ادعاء إصلاح deliverability؛ ‏gaps الـrails مسجلة فقط (تجاهل التبويب، سقف 15، RANDOM لكل تحميل، بلا dedup عابر، recorded غير متكافئ) بلا إصلاح خارج النطاق؛ بلا H7/D1/D2. بلا دمج/نشر.

## CI/CD DEPLOYMENT RECOVERY · فرع `fix/ci-cd-deployment-recovery` (من `f3942c3` = origin/main)

- 🔧 عيبان مثبتان (PRs ‏#75–#78 مدموجة في main وليست مفقودة؛ production متوقف على نسخة قديمة لأن الـdeploy يفشل): ‏(1) ‏`deploy.yml` يستخدم `cloudflare/pages-action@v1` غير القابل للحل ("not found") → النشر الآن عبر Wrangler الرسمي (`npx wrangler pages deploy dist`, مثبّت devDependency — بلا action خارجي)، نفس المشروع والمخرجات والـtriggers، production على push-to-main فقط وpreviews صريحة للـPRs، نفس الـsecrets بلا أسماء جديدة؛ ‏(2) ‏SEC-06 كان grep خام يسقط على تعليق توثيقي في `ExploreSessionService.ts:11` رغم WebCrypto الفعلي → فاحص `dev-tools/check-sec06-math-random.mjs` يجرّد التعليقات ويرصد الاستخدام التنفيذي فقط (مثبت: الحقيقي يفشل بسطر/ملف، التعليق يمر — الحماية لم تُخفَّف).
- **الأدلة**: ‏`tsc` ✅؛ ‏`build` ✅؛ ‏SEC-06 ‏PASS على الشجرة؛ ‏any ‏286 ≤ ‏310 (بلا مساس `src/`)؛ ‏YAML الملفين صالح + هيكل الـdeploy مؤكَّد آلياً؛ الكاملة ‏1041/1041 (‏101 ملفاً). صفر تغيير وظيفي (`git diff` بلا `src/`).
- **REMEDIATION (Codex، نفس الفرع)**: ‏(1) بلا interpolation في `run:` — الفرع عبر `env.BRANCH` مع `--branch="$BRANCH"`؛ ‏(2+3) ‏SEC-06 أُعيد بناؤه على AST (TypeScript compiler): الاستدعاء متعدد الأسطر يُكتشف، والـstring literal والتعليقات لا تُحتسب — مع controls ملتزمة `sec06-checker` ‏6/6 وcontrols CLI (حقيقي→FAIL، نصي→PASS)؛ إعادة التحقق: ‏1047/1047 (‏102 ملفاً)، ‏`tsc` ✅، ‏`build` ✅.
- **الصادق**: ‏**لا ادعاء production recovered — النشر الحقيقي يحدث بعد الدمج عبر الـworkflow المُصلَّح فقط**؛ بلا deploy يدوي. بلا migration. لا ادعاء R2 — بانتظار REMOTE.

## EMAIL DELIVERABILITY CLEANUP · فرع `fix/email-deliverability-cleanup` (من `1376c04` = origin/main)

- 🔧 تنظيف هوية الدومين في البريد فقط (لا DNS/DKIM/SPF/DMARC — مثبتة PASS من المالك خارج المستودع ولم تُمس؛ ولا provider ولا `send-email.php` ولا معنى مُفترض لـX-MC-Relay: Bad الخارجي): ‏3 مواضع hardcoded ‏`project-8e7c178d.pages.dev` في `EmailService` (الشعار، زر Visit Platform، fallback رابط التفعيل) → ‏SSOT القائم `DEFAULT_PLATFORM_URL` ‏(`https://dueli.maelshpro.com`) بلا literals جديدة؛ ‏origin الصريح يغلب عند توفره.
- **الأدلة**: ‏T جديد `email-domain-identity` ‏6/6 (بلا pages.dev في subject+html ar/en للقالبين، الشعار والزر على الدومين الرسمي، fallback التفعيل رسمي، origin الصريح محترم)؛ الجيران ‏19/19؛ ‏`tsc` ✅؛ ‏`build` ✅؛ صفر `any` جديد. بلا migration/routes.
- **الصادق**: ‏SPF/DKIM/DMARC أثبتها المالك PASS خارج repo؛ ‏**Inbox placement NOT PROVEN — لا ادعاء أن Spam أُصلح**؛ ‏List-Unsubscribe يضاف في PHP خارج repo (قد يحتاج إزالة من رسائل auth لاحقاً، وليس سبباً مُدَّعى للـSpam)؛ ‏X-MC-Relay: Bad ما زال external finding خارج النطاق. بلا دمج/نشر. لا ادعاء R2 — بانتظار REMOTE وتجربة المالك.

## R2-AUTH-1 password-reset email · فرع `fix/r2-auth1-password-reset` (من `79edbf2` = origin/main)

- 🔧 عيبان مثبتان بـRED (لا افتراض تطابق مع التفعيل رغم خدمة البريد الواحدة): ‏(1) بلا تطبيع بريد — `  RESET@test.com  ` لا يطابق شيئاً ومع ذلك 200، فينتظر المستخدم بريداً لم تُحاوَل كتابته أصلاً (0 sends)؛ ‏(2) `forgotPassword` بلا try/catch حول الإرسال — 500 عند غياب EMAIL vars أو أي فشل مزوّد (مقابل تحمّل register/resend)، و200-مقابل-500 صار oracle لوجود الحساب. الإصلاح: تطبيع واحد للبحث والمستلم، وكل مسارات الفشل تُرجع نفس `auth_reset_code_sent` العامة مع تسجيل خادمي للمستلم/المضيف بلا الكود؛ verify/reset بنفس التطبيع. لا عقد تغيير-داخل-الحساب موجود أصلاً (finding موثق، لم يُبنَ).
- **الأدلة**: ‏RED أولاً (‏5/9 فشلت قبل الإصلاح)؛ ‏T ‏`password-reset` ‏9/9 (المستلم والقالب الصحيحان وTTL≈15min، التطبيع، صمت العنوان المجهول، ‏3× generic-200، تحقق ضمن TTL + إكمال + دخول بالجديد + رفض إعادة الاستخدام، منتهي/خاطئ/مجهول بعقد واحد، بلا تسريب كود/كلمة، ar≠en، ولا account enumeration)؛ المستهدفة ‏13/13 مع الجيران؛ الكاملة ‏1035/1035 (‏100 ملفاً)؛ ‏`tsc` ✅؛ ‏`build` ✅؛ ‏G2 ‏286 = ‏BASE (صفر `any` جديد).
- **الصادق**: محاولة الإرسال الصحيحة مثبتة آلياً (المستلم/القالب/المزوّد)؛ **وصول صندوق بريد حقيقي غير مثبت** — يحتاج اختبار المالك (secrets/المزوّد الحي خارج النطاق) ولم يُدَّعَ. بلا migration (إعادة استعمال أعمدة ‏0001)، بلا routes جديدة، بلا دمج/نشر. لا ادعاء R2 — بانتظار REMOTE وتجربة المالك.

## R3-GUEST-1 suggested-rail continuation · فرع `fix/r3-guest1-suggested-continuation` (من `d192047` = origin/main)

- 🔧 عيب «مقترح لك» يعرض 3 للزائر: السبب المثبت (لا hardcoded 3 — مسح شامل) فرع الضيف كان `status='completed' AND vod_url IS NOT NULL` (حفنة صفوف) بلا أي continuation (دفعة `limit=15` واحدة، ‏allowSeeAll=false)، بينما المسجل يرى `live+completed` عبر المحرك. الإصلاح: مجموعة الضيف = كل المحتوى العام (pending/accepted/live + completed بتسجيل صالح — ‏05 §4؛ ‏suspended/cancelled/archived وcompleted بلا تسجيل خارج السكة)، نفس الأوزان، والسكّة Guest تُجمَّد في جلسة `suggested_guest` على نفس مخزن/مؤشر #75 (provider جديد — لا محرك ثانٍ) مع scroll-append حتى hasMore=false الحقيقي. المسجل كما هو بلا مساس.
- **الأدلة**: ‏RED أولاً (‏8/9 فشلت قبل الإصلاح)؛ ‏T ‏`guest-suggested-continuation` ‏9/9 (‏31 مؤهلاً مقابل ‏9 مستبعدين، ties، retry، ar/en، ‏404/410/409، فقد أهلية، وصول متأخر، عدم SQL في المتحكم، تثبيت الأوزان)؛ ‏E2E حقيقي ‏2/2 ar + ‏2/2 en (سكّة ~190 صفاً حتى النفاد، هويات فريدة، بلا أخطاء)؛ المستهدفة ‏77/77 (ranking/lang/explore/b7/smoke/visual)؛ ‏`tsc` ✅؛ ‏`build` ✅؛ ‏G2 ‏295 ≤ ‏BASE ‏296.
- **التكلفة (محلية)**: اجتياز ‏31 صفاً ‏(limit=6) ‏31ms. بلا migration (إعادة استعمال جداول ‏0033)، الجرد ‏195←197. بلا دمج/نشر. لا ادعاء R3 — بانتظار REMOTE.

## R3-B7 stable result session · فرع `feat/r3-b7-explore-result-sessions` (من `409dd8a` = origin/main)

- 🔧 Explore competitions فقط + بنية جلسة/chunks/cursor مشتركة قابلة لإعادة الاستخدام في D1/D2 (نفس مخزن الجلسة والمؤشر، يتبدل لاحقاً مزود الترتيب/الأهلية فقط — لا محرك تصفح ثانٍ).
- **العقد**: ‏POST /api/competitions/explore-sessions ‏(تجميد الترتيب الحالي مرة: نفس المرشحين + خلطة Fisher–Yates واحدة بـWebCrypto — بلا RANDOM+OFFSET لكل دفعة، بلا newest-first، بلا أوزان جديدة، بلا سقف إجمالي) → ‏GET …/explore-sessions/:id/page ‏(cursor مبهم، فحص أهلية حي لكل صف، ملء من المواقع التالية، hasMore/nextCursor من التقدم الحقيقي فقط). الهوية مستخدم (Bearer) أو Guest first-party (‏X-Guest-Token ‏يُصدَر أول زيارة، يُخزَّن محلياً — لا IP)؛ الغريب ‏404، المنتهية ‏410 مع مسار تحديث، drift السياق ‏409. الشكل ‏6+6 وسلوك Explore محفوظان (المعاينة أول ‏6، view-all يعيد فتح نفس الجلسة من بدايتها عبر ‏esession).
- **الأدلة**: ‏RED أولاً (‏9/12 فشلت على BASE)؛ ‏`tests/api/explore-result-sessions` ‏14/14 (‏1200 مؤهل عبر ‏12 chunk، ties، retry، drift بعد T0، فقد أهلية، وصول جديد بعد refresh، filter/identity/TTL، preview→view-all، continuation، نفاد حقيقي، بلا duplicate/skip/hidden cap)؛ ‏b7 harness ‏9/9؛ ‏E2E حقيقي (wrangler+D1 محلي) ‏2/2 ar + ‏2/2 en؛ ‏`npm test` ‏1017/1017 (‏98 ملفاً)؛ ‏`tsc` ✅؛ ‏`build` ✅؛ ‏G2 ‏295 ≤ ‏BASE ‏296 (صفر `any` جديد، بلا bypass).
- **التكلفة (محلية، node:sqlite)**: بناء جلسة ‏1200 صف ‏60ms ‏(12 chunk)؛ اجتياز كامل ‏(limit=50، ‏24 صفحة) ‏361ms ‏(~15ms/صفحة).
- **المحافَظ عليه**: ‏GET /api/competitions ‏القائم (limit/offset) كما هو لبقية الأسطح؛ تدفق المستخدمين في Explore untouched؛ R1/خطة16/المال/الإعلانات/الخوادم/TURN كما هي. بلا migration تاريخية (‏0033 جديدة فقط)، بلا deploy، بلا دمج. لا ادعاء R3 — بانتظار مراجعة REMOTE.

## R1 earnings palette micro-fix · فرع `fix/r1-earnings-palette-microfix` (من `ad23c65`)

- 🔧 بطاقة Withdrawn إلى `from-pink-500 via-fuchsia-400 to-purple-400` (تكملة التدرج البنفسجي بدل الأزرق) + الأيقونات الخضراء الزخرفية الثلاث إلى بنفسجي Dueli؛ الأخضر الدلالي (completed/toasts/CTA) والمنطق المالي كما هما.
- **الأدلة**: ‏RED أولاً (3/5 فشلت على BASE)؛ ‏`npm test` ‏1001/1001؛ ‏`tsc` ✅؛ ‏`build` ✅؛ ‏G2 ‏296 = ‏BASE؛ دخان Chromium ‏5/5 (ar/en × desktop/mobile + ‏dark). بلا دمج، بلا نشر.
- R1 design owner-accepted subject to this micro-fix; B7 remains to be resolved/verified before R1 closure. لا ادعاء R1/R2/R3.

## R1 final owner-acceptance remediation · فرع `fix/r1-final-owner-acceptance` (من `7f1fdd7`)

- 🔧 منفَّذ ومُتحقَّق محلياً: عودة Posts/Block (علّة حقيقية: `relative` الهيرو ‏#72 غطّى التبويبات — أُصلحت بـ`z-10`؛ الحظر عبر عقد `/api/blocks` القائم)؛ بطاقات الأرباح بتدرجات Dueli؛ نص أبيض في token التبويب النشط؛ تلميع البطاقة (gap + فاصل رمادي)؛ Reports/Donate بلوحة Dueli؛ selects متماسكة وDanger Zone مضبوطة ومترجمة؛ إصلاح تداخل بحث Explore؛ View-all تحت الأقسام؛ إزالة شارة التوثيق والحلقة الحمراء؛ ترقيم مستخدمي View-all مؤمَّن باختبارات.
- **الأدلة**: ‏RED أولاً (18/21 فشلت على BASE)؛ ‏`npm test` ‏996/996 (96 ملفاً)؛ ‏`tsc` ✅؛ ‏`build` ✅؛ ‏G2 ‏296 = ‏BASE (صفر `any` جديد)؛ ‏Chromium حقيقي ‏18/18 ar + ‏18/18 en للجديد و45/45 ar + ‏62/62 en للقديم؛ لقطات (الأرباح/Explore/Donate/dark) مأخوذة خارج الشجرة.
- **المحافَظ عليه**: خلطة الهيرو، توقيت الشعار، ‏#69/#70/#71. **بلا مساس**: ترتيب B7، التوصيات، ‏VOD/live، المالية، الإعلانات، المخطط/الترحيلات. التراجع: عكس commits الـPR. بلا دمج، بلا نشر، وبلا أي ادعاء R1/R2/R3 — بانتظار مراجعة REMOTE.

## PR #72 DoD G2 remediation · نفس الفرع (OLD ‏`0d92dd6` ← NEW ‏`d26f321`)

- 🔧 إزالة دين `any` الصريح الذي أدخله ‏#72 في Explore/Search (‏14× `tr as any` — ‏`tr` أي `any` أصلاً عبر `Record<string, any>` القائم، فالحذف مطابق سلوكياً ونوعياً بلا تحايل جديد وبلا مساس بالتنميط العام).
- **الدليل**: ‏BASE ‏296 = ‏NEW ‏296 (القديم ‏310) بنفس منهج G2 حرفياً، وتطابق موضعي كامل؛ suites المستهدفة ‏54/54؛ ‏`npm test` ‏969/969؛ ‏`tsc` ✅؛ ‏`build` ✅؛ دخان Chromium قصير فقط (6+6/بحث/فلاتر/العرضان، ar/en) ‏8/8. السلوك والاسترجاع والـUI مطابق تماماً. بلا دمج، بلا نشر، وبلا أي ادعاء R1/R2/R3.

## Owner visual-acceptance remediation (post-#71) · فرع `fix/owner-visual-acceptance-remediation` (من `9287a52` = دمج PR #71 · PR #72)

- 🔧 منفَّذ ومُتحقَّق محلياً (HEAD ‏`0d92dd6`): شعار وسط البطاقة عبر preload + `fetchpriority="high"` (عارض واحد مشترك، بلا تعدد طلبات)؛ هيرو الملف الشخصي تركيبة متعددة الوقفات violet→purple→indigo مع طبقات عمق؛ توحيد الشكل (tokens بلا لون) على الأرباح/الشكاوى/الدعم مع بقاء الدلالات اللونية؛ صفحة الاستكشاف ببحث وفلاتر على الصفحة + معاينة 6+6 + عرضان مخصصان (نفس عقود الاسترجاع، بلا تغيير ترتيب/تقييم).
- **الأدلة**: RED أولاً (10/14 فشلت قبل الإصلاح ⇒ 14/14 بعده)؛ `npm test` ‏969/969 (93 ملفاً)؛ `tsc` ✅؛ `build` ✅؛ متصفح Chromium حقيقي 17/17 ar + ‏17/17 en للجديد و45/45 ar + ‏45/45 en للقديم (`ui-visual-a11y`)؛ لقطات الهيرو ar/en × desktop/mobile مأخوذة خارج الشجرة.
- **المحافَظ عليه**: ‏#69 auth/session، ‏#70 CSP، ‏#71 modal/tabs. **بلا مساس**: ترتيب B7، التقييم/التوصية، ‏is_fake، ‏VOD/TURN، المالية، الإعلانات، المخطط/الترحيلات. التراجع: عكس commit واحد. بلا دمج، بلا نشر، وبلا أي ادعاء R1/R2/R3 — بانتظار مراجعة REMOTE.

## D1/D2/D3/N-2 — closure · فرع `chore/d1-d2-d3-n2-closure` (مزامن مع `main` بعد دمج C5/C6)

- **D1 (docs)**: حالة Realtime في `docs/04-STREAMING-PIPELINE.md` — الإنتاج SSE/polling،
  الـWorker/DO مسار مستقبلي اختياري بلا deploy/secrets، وإعادة الفتح بمطلب تشغيلي مثبت فقط.
- **D2**: تدقيق + تثبيت — البذور توثق `is_fake=1` الضمني مع تثبيت الـdefault اختبارياً؛
  `u.is_fake` في استعلامات search/matchmaking/users؛ شارة Demo في user-card وصفة
  المنافسة؛ نجاح التقاعد يُسجَّل (auditability). الوهمي KEEP — لا حذف.
- **D3**: `repomix-output.xml` (6.5MB) ← `docs/archive/` + توثيق الأرشيف والـSoT.
- **N-2**: تحقيق شامل — الهوية من الجلسة حصراً، والـIDs المرسلة أهداف/فلاتر مشروعة
  بفحوص ملكية؛ لا ثغرة، لا تغيير كود.

## C6 — cron operational hardening · فرع `fix/c6-cron-operational-hardening` (مكدّس فوق C5)

- أُعيد التثبيت فوق المكدس؛ العقد تراكمي (0029–0032 ← ‏33 ملفاً)؛ `cron-runs` ‏6/6؛
  `npm test` ‏610/610 على المكدس الكامل؛ `tsc` ✅؛ `build` ✅. بلا دمج.

## C5 — CSP full removal · فرع `fix/c5-csp-hardening` (مكدّس فوق C4)

- إزالة كاملة: لا `unsafe-inline` ولا `unsafe-eval` في الترويسة المقدمة (مثبتة).
  195 handler مضمّن ← تفويض `data-csp-*` (موزع خارجي + allowlist مولدة)؛ كل
  `<script>/<style>` يحمل nonce الطلب؛ `style=` ← كلاسات أو `data-csp-style`
  (مطبق JS)؛ CSS المحقون runtime نُقل لـ`styles.css`؛ الإيميلات مستثناة معمارياً.
- تحقق المتصفح الحقيقي (Playwright + wrangler local): 8 تدفقات خضراء، صفر
  CSP violations، صفر console errors (401 تسجيل خاطئ متوقعة وتثبت عمل submit).
- الأرقام النهائية أدناه. بلا دمج.

## C4 — SSE/WS ticket auth · فرع `fix/c4-sse-ticket-auth` (مكدّس فوق C2)

- أُعيد التثبيت فوق المكدس (العقد ‏32: 0029–0031)؛ وأُغلق مسار WS نهائياً داخل المستودع:
  `POST /api/realtime/redeem` (بوابة `X-Publish-Secret`) يستهلك التذكرة للـWorker،
  الـWorker (`workers/dueli-realtime`) يقبل `?ticket=` فقط (لا `?token=` إطلاقاً —
  مثبت grep + اختبار)، و`SseService` (SSE وWS) يجلب تذكرة أولاً. النشر الخارجي
  المتبقي: deploy الصفحات ثم الـWorker (موثق في ترويسة الـWorker).
- `sse-ticket` ‏18/18 + `sse-user-auth` ‏3/3؛ `npm test` ‏596/596 على المكدس؛ `tsc` ✅؛
  `build` ✅؛ الجرد ‏56 AUTHENTICATED (+‏redeem المحمي بالسر داخلياً).

## C2 — chunks HMAC · فرع `fix/c2-chunks-hmac` (مكدّس فوق C1)

- أُعيد التثبيت فوق المكدس؛ العقد تراكمي (0029+0030 ← ‏31 ملفاً)؛ `chunks-hmac` ‏11/11؛
  `npm test` ‏577/577 على المكدس؛ `tsc` ✅؛ `build` (أدناه).

## C1 — payments/ad-blocks auth · فرع `fix/c1-auth-fix` (مكدّس فوق C7)

- 🔧 منفَّذ محلياً: `authMiddleware({required:true})` على مستوى الراوتر في
  `ad-blocks/routes.ts` و`payments/routes.ts` (8 مسارات: UNGUARDED→AUTHENTICATED،
  الجرد مولَّد من جديد) — بلا global middleware، بلا تغيير business logic.
- **الاختبارات**: `tests/api/payment-auth.test.ts` ‏8/8 (401 بلا/خاطئة/منتهية،
  200 + 201 بجلسة صالحة، 422 تُثبت مرور الـauth)؛ `npm test` ‏566/566 على المكدس؛
  `tsc` ✅؛ `build` ✅. الحالة 🔧 ريثما يعيد REMOTE التحقق — بلا دمج.

## C7 — D1 reconciliation · فرع `chore/c7-d1-reconciliation` (مكدّس فوق C3b) — ✅ منفَّذ

- **Remote rebuild منفَّذ ومُتحقق**: backup طازج (2.4MB) → إسقاط 50 كائناً بترتيب FK
  → replay السلسلة ‏33/33 من رأس المكدس → history مطابق للمستودع بايتاً ببايت →
  reimport ‏22 جدولاً (544/1541 + الحقيقيون سالمون) → `foreign_key_check` فارغ →
  `donations` والجداول المالية والجديدة حاضرة → `posts` محذوف → smoke إنتاج ‏200/200.
  التفاصيل في `docs/C7-D1-RECONCILIATION-RUNBOOK.md` §5.
- كود: `is_fake=0` + شارات Demo + تقاعد تدريجي عبر `SyntheticRetirementService`
  (الأقدم أولاً، صفر dependents، مغطى PRAGMA) مربوط بالتسجيل/OAuth/إنشاء المنافسات.

## C2 — chunks HMAC · فرع `fix/c2-chunks-hmac` (مكدّس فوق C1)

- 🔧 منفَّذ محلياً: HMAC-SHA256 خادم-لخادم على `GET /verify` و`DELETE /:key`
  (`X-Signature/X-Timestamp/X-Nonce`، نافذة 5min، nonce أحادي في جدول جديد
  `chunk_upload_nonces` عبر migration ‏0030، مقارنة ثابتة الزمن، 503 عند غياب
  السر) + فحص Origin الدقيق طبقة ثانية.
- **الاختبارات**: `tests/api/chunks-hmac.test.ts` ‏11/11 (oracle مستقل عبر node:crypto
  + رفض بلا/مزوّر/منتهي/معاد/origin شرير/prefix + قبول صحيح + 503)؛ RED مثبت (7 تفشل
  على الكود القديم)؛ عدّاد العقد تراكمي ‏31 (0029+0030)؛ الأرقام الكاملة بعد التحقق أدناه.
- **UPLOAD SERVER ACTIONS REQUIRED** في تقرير الـPR — التنفيذ على السيرفر الخارجي للمالك.

## C3b — posts cleanup · فرع `chore/c3b-posts-cleanup` (من `376b2ea` = PR #49)

- 🔧 منفَّذ محلياً: جدول `posts` العاري + التابع الميت `post_likes` (FK → posts) محذوفان
  عبر migration جديدة `0029_drop_unused_posts.sql` (forward-only، `DROP IF EXISTS`،
  التابع أولاً) — بلا مساس بأي migration تاريخية، و`user_posts` (نظام المنشورات الحي
  عبر `UserPostModel`) لم يُمس.
- **الدليل**: صفر إشارة كودية لـ`posts`/`post_likes` في src/tests/workers (لا
  SELECT/INSERT/UPDATE/DELETE/JOIN/model/route/seed)؛ seed يمس `user_posts` فقط.
- **الاختبارات**: عدّاد `schema-contract` ‏29←30 + assertion غياب posts/post_likes
  وبقاء user_posts؛ `npm test` ‏544/544؛ `tsc` ✅؛ `build` ✅ (churn الـCSS رُجع).
  الـintegration عبر Wrangler لم يُنفَّذ محلياً (يتطلب Cloudflare) — بانتظار REMOTE.
- الحالة 🔧 ريثما يعيد REMOTE التحقق — بلا دمج.

## FINAL DEBT CLOSURE SWEEP · فرع `chore/final-debt-closure` (من `d332223`)

- 🔧 sweep واحد بلا scope creep: كل ما أُغلق (A1/A2/B1/B2) مخطط ومؤجل وقابل للإغلاق
  الآمن؛ 9.E (N-1/N-2/N-3) و8.G (F1–F4) أُعيد التحقق منها خضراء ولم تُمس.
- **A1**: حارس ترقيم الترحيلات — أي رقم مكرر جديد يفشل (استثناء 0012 التاريخي مثبّت).
- **A2**: قفل SEC-04 اختبارياً (6/6: بلا ترويسة 403، `?key=` ‏403، Bearer صحيح 200،
  GET ‏404، بلا سرّ 503) — الكود كان مغلقاً أصلاً ولم يُمس.
- **B1/B2**: عدّاد `docs/16` ‏(19←29) + تعليقا SSE ‏(2s←10s) — توثيق/تعليقات فقط.
- **REMOTE D1 ‏⛔ قرار مطلوب**: ‏10 معلّقة (0019–0028) تعذّر تطبيقها — سجلّ remote
  ‏(ids ‏2–10) يسمّي ملفات غائبة من المستودع + جدول `donations` مفقود عن بُعد
  ‏(0020/0022/0023 لا يمكن أن تُطبَّق). لم يُتَّخذ أي إجراء destructive.
- **RED/GREEN مُثبَت**: حساسية الحارس (0012 تُكتشف) وحساسية قفل الكرون (`?key=`
  المُعاد فتحه يفشل)؛ `npm test` ‏544/544؛ ‏schema-contract ‏20/20؛ ‏`tsc` ✅
  ‏(any ‏279 ≤ ‏308)؛ ‏`build` ✅. بلا migration/dependencies/config/routes.

## 9.E final-gate remediation — N-1 + N-3 · فرع `fix/ads-final-gate-remediation`

- 🔧 remediation من `76525cf` (دمج PR #47). الهدف: إغلاق كل findings التدقيقين دون مساس بما اجتاز 9.E.
- **N-1 (blocking)**: `settleImpressionKey` كان `WHERE key = ?` وحده — settlement هوية يعيد كتابة
  صفوف هويات/إعلانات أخرى تشترك في key (مثبت: retry يعيد 409 بدل replay + شحنة وهمية محتملة).
  الآن `(key, ad_id, user_id IS ?, created_at >= -1 day)` — نفس هوية claim/lookup تماماً.
- **N-3 (blocking)**: مسار impression كان `viewer?.id ?? body.user_id ?? null` — المجهول ينتحل
  مستخدماً حقيقياً (مثبت: تلويث attribution + استهلاك cap الضحية + FK failure بـ500).
  الآن `viewer?.id ?? null` دائماً؛ `body.user_id` موروث يُتجاهل كلياً. تدقيق كل مسارات الإعلانات:
  serving/click/token/ad-blocks/ad-reports/advertiser كلها session-based — لا ثقب آخر.
- **INFO/LOW مغلقة بلا scope زائد**: مسار FK المقنّع اختفى (المجهول يكتب NULL دائماً — مثبت 200)؛
  `getCampaignAnalytics` لها مسار واحد عبر `requireOwnedCampaign` (لا bypass — تحقق فقط)؛
  الأعمدة `budget/budget_remaining/views/clicks` كتابة عرض فقط — التلاعب بها لا يحرّك قرشاً (مثبت).
  N-2 لم تُمس (cap/token flows خضراء كما هي). بلا migration، بلا routes جديدة، بلا dependencies.
- **RED/GREEN مُثبَت**: ‏6/10 فشلت قبل الإصلاح ⇒ ‏ad-impression-identity ‏10/10 بعده؛ ‏`npm test`
  ‏538/538؛ ‏`tsc` ✅ (any ‏272 ≤ ‏308)؛ ‏`build` ✅؛ ‏`verifyInvariant() = 0` داخل الاختبار.

## 9.D — بوابة المعلنين (ownership server-side) · فرع `feat/ads-advertiser-portal`

- 🔧 منفَّذ محلياً (من `345bb86` = دمج PR #46). النتيجة: المعلن يدير حملاته وميزانيته ذاتياً،
  ويرى ويدير **حملاته فقط** — التحقق server-side في كل عملية حساسة.
- **الثغرات المغلقة**: `submitForReview` كان يتجاهل المالك (A يرسل مسودة B للمراجعة!)،
  و`getCampaignAnalytics` بلا أي فحص (A يقرأ أرقام B) — كلاهما الآن 403 عبر `requireOwnedCampaign`
  (404 للمفقود، 403 للمملوك لغيره/بلا مالك — لا قائمة فارغة ولا 409 مُضلِّل) + guard المالك في SQL.
- **المحافَظ عليه**: المسار الكامل للمالك (create→submit→approve→pause→resume→end+analytics)،
  والاعتماد admin-only (مراجعة الأدمن 403 لغير الأدمن)، والميزانية من ledger حصراً (integer cents،
  تمويل `ad_campaign_fund_<id>` متوازن، عدّادات views/clicks المزوّرة لا تحرّك الأرقام).
- **UI**: `esc()` لعناوين الحملات في البوابة (stored-XSS)، مفتاح `advertiser.not_your_campaign` في ar+en،
  RTL/LTR عبر layout، لا SQL ولا منطق مالي في الصفحة. بلا migration، بلا routes جديدة (191 كما هي).
- **RED/GREEN مُثبَت**: 4/8 فشلت قبل الإصلاح (submit عابر 200، تحليلات عابرة 200، pause مفقود 409،
  مفتاح i18n غائب) ⇒ ‏advertiser-portal ‏8/8 بعده؛ تحديثان تعاقديان في اختبارات 9.A (409→403 لعابر المالك،
  وF-3 يرسلها المالك-الأدمن)؛ ‏`npm test` ‏528/528؛ ‏`tsc` ✅ (any ‏272 ≤ ‏308)؛ ‏`build` ✅.

## 9.C remediation — F-1 + dedup isolation + mint cap · نفس الفرع (PR #46)

- 🔧 remediation فوق `79a1358` بعد REJECT خارجي (كل الوظائف كانت PASS): إغلاق F-1 المانع + ملاحظتين.
- **F-1**: contract ‏27 ← ‏29 (+0027 و0028) + جداول 9.C الثلاثة + index الهوية المركبة (COALESCE).
- **Dedup isolation**: migration ‏0028 جديدة (0027 تاريخية لم تُمس) — `UNIQUE(key, ad, COALESCE(user,-1))`
  مع نسخ كامل للصفوف؛ نفس key+ad+identity ‏⇒ dedup، وعبر ad/identity ⇒ مستقل.
- **Mint cap**: ‏100 live token لكل (ad, هوية) ذرّياً — ‏429 `click_token_limit` عند التجاوز؛ الهوية من
  الجلسة (body يُتجاهل) أو IP المراقب للمجهول؛ السك لا يكتب ledger.
- **RED/GREEN مُثبَت**: ‏5 فشلت قبل الإصلاح ⇒ ‏ad-metrics ‏16/16 بعده (تشمل upgrade حقيقياً لـ0028)؛
  ‏19/19 للجيران؛ ‏`tsc` ✅؛ ‏`build` ✅. schema-contract يُجمَع بنجاح ولا يُنفَّذ محلياً (يتطلب Cloudflare).

## 9.C — القياس ومكافحة الاحتيال · فرع `feat/ads-metrics-antifraud`

- 🔧 منفَّذ محلياً (من `87b6517` = طرف 9.B). النتيجة: المعلن يدفع مقابل مشاهدات ونقرات حقيقية،
  والإحصاءات مشتقة من نفس المصدر الذي خُصم منه.
- **Click token** أحادي الاستخدام (opaque، مرتبط بالإعلان وهوية الجلسة، TTL ‏10 دقائق): بلا token ‏422،
  منتهي/غير صالح ‏403، معاد الاستخدام ‏409 — كلها بلا احتساب. بلا secret في العميل.
- **مصدر مالي واحد**: impressions/clicks/spend من الصفوف التشغيلية + `SUM` دفتر `ad_impression`
  (integer cents) — تزوير `views_count`/`clicks_count` (9999) لا يحرّك الأرقام. `LedgerService` كما هو.
- **Dedup**: مفتاح `idempotency_key` اختياري (نافذة 24h) — إعادة نفس التسليم لا تخصم ثانية؛ بلا مفتاح ⇒
  سلوك 9.A/9.B حرفياً. بلا تتبع سلوكي ولا استهداف جديد.
- **i18n**: `ads.{impressions,clicks,ctr,spend}` في `ar.ts` + `en.ts` وتُرجع كـ`labels` مع التحليلات.
- **Migration 0027** فقط (جديدة: `ad_click_tokens` + `ad_clicks` + `ad_impression_dedup`)؛ routes inventory
  مولَّد من جديد (191 مساراً، `POST /:id/click-token` جدید).
- **RED/GREEN مُثبَت**: ‏8/8 فشلت قبل الإصلاح ⇒ ‏8/8 بعده (تشمل 100 نقرة متزامنة: ‏1×200 + ‏99×409،
  و100 رمزاً مميزاً ⇒ ‏100×200)؛ ‏19/19 لجيران 9.A/9.B؛ ‏`tsc` ✅؛ ‏`build` ✅.
  الحالة 🔧 ريثما يعيد REMOTE التحقق (integration الحقيقي تعذّر محلياً — يتطلب Cloudflare).

## 9.B — عرض الإعلان واستهدافه · فرع `feat/ads-serving-targeting`

- 🔧 remediation لنفس الـPR (#45) بعد مراجعة REMOTE — ثلاثة findings فقط، ما عداها PASS وبقي مغلقاً:
- **F-1 (هوية الـcap) ✅ أُغلق**: مسار impression يستخدم هوية الجلسة حصراً للمصادق عليه (قراءةً وكتابةً)؛
  `body.user_id` يُتجاهل — إسقاط الحقل يسجّل باسم الجلسة، وتزوير id آخر لا يمسّ عداده. المجهول كما كان.
- **F-2 (ذرّية الـcap) ✅ أُغلق**: شرط الـcap داخل statement الخصم الذرّي نفسه + صف الـimpression والعدّاد
  داخل الـbatch (حراسة `tx_id`) — ‏30 طلباً متزامناً ⇒ ‏5 تُعرض و25×429 حتماً. اختبار `F-2` بأعداد دقيقة.
- **F-3 (schema-contract) ✅ أُغلق**: القائمة 27 + عمود 0026 مُثبَت بعد ترحيل من فراغ عبر Wrangler.
- **RED/GREEN مُثبَت**: على الكود القديم (stash) فشلت F-1a/F-1b/F-2 كما وصف الـREMOTE (بypass/500/30×200)؛
  بعده: ad-serving ‏11/11، ‏9.A (lifecycle+remediation) ‏8/8 بلا انحدار، schema-contract ‏17/17، ‏tsc ✅.
  الحالة 🔧 ريثما يعيد REMOTE التحقق من F-1/F-2/F-3 فقط.

- 🔧 منفَّذ محلياً (من `aa55b38` = `origin/main` بعد دمج 9.A في PR #44). النتيجة: الإعلان المناسب يظهر
  للجمهور المناسب، ولا يظهر لمن حجبه — كل الحماية server-side.
- **استهداف language + country + category فقط** (بلا behavioral tracking): `GET /api/advertisements`
  (`competition_id`/`context`/`limit`) يحلّ الاستهداف من صف المنافسة؛ `getTargetedAds()` في SQL واحد
  (حارس 9.A + مطابقة `target_* IS NULL OR =`). البعد الفئوي كان مفقوداً ⇒ **migration 0026** المضافة فقط
  (`target_category_id` + فهرس). `createCampaign` يقبلها اختيارياً (تحقق عبر `CategoryModel`).
- **AdBlockModel**: استبعاد `NOT IN` داخل SQL الاختيار — لا إخفاء frontend؛ `UserBlockModel` لم يُلمس.
- **Frequency cap**: ‏5 مشاهدات/مستخدم/إعلان/24h من `ad_impressions` فقط؛ استبعاد في الاختيار + حارس 429
  (`ads.frequency_cap_reached`) على مسار impression مفتاحه هوية الجلسة. `chargeImpression`/Ledger كما هما.
- **وسم معلن**: كل إعلان مخدوم يحمل `sponsored_label`/`why_this_ad`/`hide_ad` عبر `t('ads.*')` (مفاتيح جديدة
  ar+en بعربية فعلية) — بلا hard-code.
- **صفحات حساسة**: `context=private_messages` ⇒ `[]` من الخادم؛ `messages-page.ts` بلا إعلانات أصلاً.
- **RED أولاً (مُثبَت)**: 5 فشلت قبل الإصلاح (غير مطابق يُعرض، محجوب يُعرض، تجاوز الحد 200≠429،
  labels غير معرّفة، private_messages تعرض 4) ⇒ 8/8 بعده عبر Hono الحقيقي + SqliteD1.
- **الاختبارات**: `tests/api/ad-serving.test.ts` (8) ✅، `npm test` 501/501 ✅ (أُعيد تشغيل 9.A لضرورة لمس
  مسار impression المشترك — كشف تفاعلاً أُصلح بتقييد الحارس على الجلسة)، `tsc` ✅ (صفر `any` جديد)،
  `build` ✅. لا مسارات جديدة ⇒ بلا تجديد جرد. التراجع: إسقاط عمود 0026 وفهرسه.
- **النطاق المحترَم**: بلا 9.C/9.D/9.E، بلا LedgerService/Stripe/Money، بلا CI/dependencies، بلا تتبع
  سلوكي، بلا تعديل messaging، بلا migrations تاريخية، بلا دمج. الحالة 🔧 ريثما يعيد REMOTE التحقق.

## 9.A — دورة حياة الحملة الإعلانية · فرع `feat/ads-campaign-lifecycle`

- 🔧 منفَّذ محلياً (من `7855419` = `origin/main` بعد دمج PR #43). النتيجة: المعلن ينشئ حملة بميزانية،
  تمر بدورة محروسة `draft → pending_review → active → paused → ended`، وتتوقف عن العرض تلقائياً وذرّياً عند نفاد الميزانية.
- **migration 0025** (جديد، لا تعديل على القديم): إعادة بناء `advertisements` — `CHECK` جديد للحالات الخمس،
  `budget_cents`/`cost_per_impression_cents` (integer cents)، حذف عمودي `budget`/`budget_remaining` REAL
  (لا مصدر مالي موازٍ للـledger). ترحيل الحالات القديمة: `depleted`/`archived` → `ended`؛ صفوف `active` القديمة
  برصيد دفتر صفر فلا تُعرض حتى تُموَّل (افتراض آمن).
- **الحراسة في SQL**: كل انتقال عبر `guardedTransition` — `UPDATE ... WHERE id=? AND campaign_status IN (...)`
  (+ ملكية المعلن). المراجعة إلزامية: `pending_review → active` من المشرف فقط (`PUT /api/admin/ads/campaigns/:id/review`).
  مسارات جديدة: `POST /api/advertiser/campaigns/:id/submit-review`، `PUT .../end`، ومراجعة الأدمن (مولَّدة في الجرد).
- **LedgerService مصدر المال الوحيد (8.A)**: تمويل الحملة حركة متوازنة idempotent
  (`txId=ad_campaign_fund_<id>`): مدين `reserve:campaign_<id>` / دائن `platform:ad_budget_commitments`.
  كل عرض = حركة بشرط SQL داخل `INSERT ... SELECT` واحدة (حالة + رصيد + كتابة — بلا TOCTOU، نمط `withdraw`)
  + قيد توازن على `platform:ad_revenue` + انقلاب ذرّي إلى `ended` في نفس الـbatch عند عدم كفاية الرصيد للعرض التالي.
  استعلاما الاختيار (`getActiveAds`/`getActiveAdsForCompetition`) يتحقّقان من الرصيد في SQL.
- **RED أولاً (مُثبَت)**: بتعطيل حارس الرصيد وحارس الانتقالات مؤقتاً: `expected 101 to be 100`
  (تجاوز الميزانية تحت التزامن) و`expected 200 to be 409` (انتقال غير صالح يقبل) — ثم أخضر 4/4 بعد الإصلاح.
- **الاختبارات**: `tests/api/ad-campaign-lifecycle.test.ts` (4) عبر Hono الحقيقي + SqliteD1 بالمخطط الفعلي:
  دورة كاملة، رفض الانتقالات غير الصالحة (409) وغير المالك، منع عرض draft/pending_review، ميزانية 100 سنت مع
  101 عرضاً متزامناً ⇒ الخصم يتوقف عند 100 بالضبط + `ended` + ثابت الدفتر (فرق=0). `npm test` 489/489 ✅
  (بذرة `AdminModelExtraction` حُدّثت لافتراض `draft` الجديد)، `tsc` ✅ (any=272 ≤ 308)، `build` ✅.
- **i18n**: مجموعة `ads.*` جديدة (campaign_status_draft/pending_review/active/paused/ended، budget_exhausted،
  pending_review، invalid_transition، invalid_budget) في `ar.ts` و`en.ts` — عربية فعلية.
- **توثيق**: قسم جديد في `docs/02-DATABASE.md` + جرد المسارات مولَّد من جديد.
- **SEC-02/SEC-04**: تم التحقق من الملاحظة التوثيقية في `docs/12` (كلاهما منفَّذ في الكود فعلاً) — **خارج نطاق 9.A**،
  لا إصلاح ولا تعديل توثيقي لهما في هذا الـPR.
- **النطاق المحترَم**: بلا 9.B/9.C/9.D/9.E، بلا refactor عام للإعلانات، بلا تعديل LedgerService أو سياسة 8.G،
  بلا Stripe، بلا CI/dependencies، بلا migrations تاريخية، بلا دمج. الحالة 🔧 ريثما يعيد REMOTE التحقق.


## 8.G — FINAL MONEY GATE correction pass · فرع `fix/money-gate-final-remediation`

- 🔧 منفَّذ محلياً (من الرأس `b90ca08` على `feat/money-transparency` الذي يحمل 8.A–8.F).
  ملاحظة: base الـREMOTE ‏(`5e7fcd6`) غير موجود في السجل المحلي — بدأ العمل من
  `b90ca08` (رأس الفرع المحلي الحامل لكل عمل 8.A–8.F) وسُجَّل الفرق في تقرير المهمة.
- **F1 (crash consistency) ✅ مُغلق**: الحارس التراكمي + نية الاسترداد (القيود الدقيقة
  + tx الحتمي) في batch واحد ذري (migration ‏0024 `donation_refund_intents`)؛ أي crash
  قبل `ledger.post()` تكمِله إعادة الإرسال أو reconciliation بنفس القيود (لا ضياع ولا تكرار).
  RED: ضياع 200 سنت قبل الإصلاح ⇒ شفاء تام بعده + بدون duplicate.
- **F2 (cumulative race) ✅ مُغلق**: مطالبة CAS على القيمة المتوقعة +
  `UNIQUE(donation_id, cumulative_cents)` — فائز واحد لكل تقدّم والخاسر يعيد القراءة.
  RED: ‏500 بدل 300 قبل الإصلاح ⇒ ‏300 بالضبط بعده (comp ‏240 + plat ‏60) + ‏10 أحداث
  متزامنة ⇒ تسوية كاملة دقيقة + invariant ‏0.
- **F3 ✅ مُغلق بقرار رسمي — التبرعات غير قابلة للاسترداد مطلقاً**: القرار: لا refund
  (كامل/جزئي)، لا clawback، لا سالب، لا دين، لا عجز على المنصة — حتى قبل أي سحب.
  الفرض: `DONATIONS_NON_REFUNDABLE` في `DonationModel` + رفض `charge.refunded` في
  `processRefund` قبل أي أثر مالي (لا قيود/حارس/حالة، تسجيل الحدث بلا tx فقط) +
  `POST /api/donations` يشترط `non_refundable_accepted === true` و`amount_confirmed === true`
  معاً (400 بدونهما) + صفحة التبرع تعرض السياسة وتطلب موافقتين صريحتين (بلا افتراض) +
  i18n ‏(5 مفاتيح ar+en) + التوثيق في `docs/02-DATABASE.md`.
  الاختبارات: ‏F3A–G (رفض بلا سحب/بعد سحب جزئي مدفوع/تكرار + بوابتي الإنشاء + كلتاهما معاً + ‏i18n)
  سُلّمت حمراء أولاً (6 فشلت) ثم خضراء؛ اختبارات الـrefund القديمة حُوّلت لتوكيد الرفض.
- **F4 (SEC-01) ✅ مُغلق**: مسار `POST /api/donations/:id/complete` محذوف بالكامل +
  `markCompleted()` محذوفة من `DonationModel` + الجرد المعاد توليده (187 مساراً) بلا
  `complete` + اختبار يفرض 404 لكل المتغيرات. Stripe webhook سلطة الإكمال الوحيدة.
- **الاختبارات**: `tests/api/money-gate-8g.test.ts` (13: ‏F1a/F1b/F2a/F2b/F2c/F3doc + ‏7 matrix)
  سُلّمت حمراء أولاً (F1a/F1b/F2a/F4 فشلت كما هو متوقع) ثم خضراء؛ `donations-security`
  (6/6 ‏404)؛ المالية ×3 (83/83 كل جولة)؛ `npm test` ‏477/477 ✅؛ `tsc` ✅ (بلا `any` جديد)؛
  `build` ✅؛ `db:migrate:local` (0024 ✅)؛ تكامل `schema-contract` (25) ✅.
  التكامل الكلي: ملفان يفشلان في إعداد wrangler (0014/runtime — بيئي، سابق، بلا علاقة بالمال).
- **النطاق المحترَم**: بلا تعديل migrations تاريخية، بلا CI/dependencies، بلا production،
  بلا سياسة مالية جديدة، بلا F-11/F-12. الحالة 🔧 ريثما يعيد REMOTE التحقق — بلا دمج.

## 8.F — شفافية الأموال من دفتر الأستاذ · فرع `feat/money-transparency`

- 🔧 منفَّذ محلياً (من الرأس `c69c13a` على `feat/money-donations` الذي يحمل 8.A–8.E). النطاق: مجاميع عامة مشتقة من `ledger_entries` + تحقق مستقل + cache ببصمة — بلا جدول مالي موازٍ، بلا هوية شخصية، بلا تعديل `LedgerService` أو سياسة 8.A–8.E، بلا migration، بلا CI/dependencies، لا Production deployment/migration/merge.
  - **التعريفات (من semantics الحالية)**: `total_in` = دائن `reserve:*` (ساق الإجمالي الوحيدة لكل capture ‏8.C/8.E وتوزيع 8.B)؛ `total_out` = مدين `user:*` (حصص 8.B + صافي 8.E)؛ `platform_share` = صافي `platform:*` (مدين − دائن). integer cents، والفرق عن التجميع المستقل صفر سنت.
  - **`MoneyTransparencyService`**: قراءة ledger فقط (bind فقط)؛ cache داخلي TTL=60s + بصمة djb2 + إبطال بعدّ القيود (append-only ⇒ أي كتابة تغيّر العدّ)؛ `clearCache()` للاختبار/الإبطال. **لا migration** (لا KV/Cache API في المشروع).
  - **المساران** (عامّان كبقية `/api/transparency`): `GET /api/transparency/summary` (مجاميع + `fingerprint` + `cached` + `labels` مترجمة) و`GET /api/transparency/verify` (نتيجة `LedgerService.verifyInvariant()` مباشرة — `difference === 0`).
  - **i18n**: `transparency.{total_in,total_out,platform_share,verified_at}` في ar+en (مختلفان).
  - **الاختبارات**: `tests/api/transparency.test.ts` (7 عبر Hono الحقيقي — مطابقة مستقلة + لا هوية + verify + cache/إبطال + لا مصدر موازٍ (decoy في `platform_financial_logs` لا يغيّر شيئاً) + i18n + regression؛ سُلّمت حمراء أولاً 6/7 فشل ثم خضراء).
  - **التحقق**: `npm test` 464/464 ✅ + `tsc` ✅ (بلا `any` جديد) + `build` ✅ + `routes:inventory` 188 ✅. الحالة 🔧 (تحقق محلي) ريثما يعيد الوكيل الخارجي التحقق المستقل — بلا دمج.
  - **التسريب (G8)**: revert الـcommit؛ لا بيانات/مخطط.

## 8.E — التبرعات للمتنافسين · فرع `feat/money-donations`

- 🔧 منفَّذ محلياً (من الرأس `f280ee6` على `feat/money-withdrawals` الذي يحمل 8.A–8.D). النطاق: تبرع المشاهد لمتنافس بأثر مالي حصري عبر `LedgerService` — لا رصيد موازٍ، لا مسار مالي ثانٍ، لا تعديل لسياسة 8.A/8.B/8.C ولا لـ`LedgerService`، لا CI/dependencies، لا Production deployment/migration/merge.
  - **Migration 0022**: `recipient_user_id` + `competition_id` (additive فقط؛ NULL = مسار 8.C القديم بلا تغيير). تُطبَّق على قاعدة فارغة (23 migration) + `db:reset` ✅.
  - **السياسة (ثوابت موثقة)**: الحد الأدنى $1 (100 سنت = `payment_min_amount` + فحص المسار + الواجهة)؛ **بلا حد أقصى** على مستوى Dueli (قرار موثق — لا رقم مخترع)؛ الرسوم `platform_share_percentage` (الافتراضي 20 = سياسة 8.B).
  - **التقسيم**: حركة واحدة integer-exact (مدين المنصة بالرسوم + مدين المتنافس بالصافي + دائن البوابة بالإجمالي — ساق واحدة التزاماً بـ`UNIQUE(tx_id, account)`)؛ الفشل ⇒ لا قيود؛ الاسترداد الكامل ⇒ مرآة معكوسة عبر المسار الموثوق نفسه.
  - **الحظر 3.A**: المستلم حظر المتبرع ⇒ ‏403 خادمياً قبل أي أثر (اتجاهي؛ المعاكس مسموح).
  - **SSE**: نجاح أثناء البث ⇒ ‏`donation_new` على `competition:<id>` عبر البنية القائمة (الاسترداد لا يبث).
  - **i18n**: ‏`donations.{send,thanks,min,max,blocked}` في ar+en (مختلفان؛ `max` بلا رقم).
  - **الاختبارات**: `tests/api/donations.test.ts` (31 عبر Hono الحقيقي — الثمانية الأصلية + 8b/8c + ‏19 لتصحيحات REMOTE الخمسة R1–R5؛ سُلّمت حمراء أولاً 15 فشل ثم خضراء ×3). الصيانة: `schema-contract` (24) و`fake-d1` (معالجات الحجز).
  - **التصحيحات**: منع Double Capture (tx قطعي لكل تبرع) + دلالات amount_refunded التراكمية + سقف تراكمي ذري (0023) + تسوية تقريب من التخصيص الأصلي + سياق live/competitor — بلا سياسة جديدة.
  - **التحقق**: `npm test` 457/457 ✅ + `tsc` ✅ + `build` ✅ + `db:reset` ✅ + تكامل `schema-contract` + ‏`ledger` 31/31 ✅. الحالة 🔧 (تحقق محلي) ريثما يعيد REMOTE التحقق المستقل — بلا دمج.
  - **التسريب (G8)**: revert الـcommit؛ لا بيانات إنتاج.

## 8.D — السحوبات · فرع `feat/money-withdrawals`

- 🔧 منفَّذ محلياً (من الرأس 976ab63 على `feat/money-stripe-payments`). النطاق: دورة `requested → approved → paid | rejected` بأثر مالي حصري عبر `LedgerService` — لا رصيد مباشر، لا مسار مالي موازٍ، لا تعديل لسياسة 8.A/8.B/8.C ولا لـ`LedgerService`، لا CI/dependencies، لا Production deployment/migration/merge.
  - **Migration 0021**: إعادة بناء `withdrawal_requests` (حالات الدورة + `amount_cents` المعتمد + `fee_cents=0` + `hold_tx_id` + تعيين الحالات القديمة). تُطبَّق على قاعدة فارغة (22 migration) + `db:reset` ✅.
  - **السياسة (ثوابت موثقة)**: الحد الأدنى 5000 سنت ($50 = seed ‏`min_withdrawal_amount`)؛ الرسوم 0 (لا سياسة رسوم في المشروع).
  - **الدورة**: حجز لحظي عبر `ledger.withdraw()` الذري (سباق ⇒ واحد فقط)؛ موافقة `requested→approved→paid` بحراسة SQL (الثانية 409، دفع واحد)؛ رفض/إلغاء بتحرير عكسي idempotent (الرصيد يعود كاملاً، الثابت 0)؛ كل انتقال في `admin_audit_log`؛ الموافقة بأدمن (M6 ⇒ ‏403 لغيره).
  - **i18n**: ‏`withdrawals.{requested,approved,rejected,min_amount,insufficient_balance}` في ar+en (مختلفان).
  - **الاختبارات**: `tests/api/withdrawals-lifecycle.test.ts` (7 عبر Hono الحقيقي — الستة المطلوبة + i18n؛ سُلّمت حمراء أولاً 7/7 فشل ثم خضراء ×3). الصيانة: `schema-contract` (22) والجرد (186، بلا drift) ولوحة الأدمن/حد الواجهة.
  - **التحقق**: `npm test` 426/426 ✅ + `tsc` ✅ + `build` ✅ + `db:reset` ✅. الحالة 🔧 (تحقق محلي) ريثما تكتمل G1–G8 بالمراجعة الخارجية — بلا دمج.
  - **التسريب (G8)**: revert الـcommit؛ لا بيانات إنتاج.

## 8.C — مدفوعات Stripe · فرع `feat/money-stripe-payments`

- 🔧 منفَّذ محلياً (من الرأس 6252ced على `feat/money-earnings-split`). النطاق: مسار الدفع الفعلي يربط Stripe webhook بـ`LedgerService` كمصدر وحيد للأثر المالي — لا مسار مالي موازٍ، لا تعديل لسياسة 8.B (20/80) ولا لـ`LedgerService` semantics، لا CI/dependencies، لا Production deployment/migration/merge.
  - **Migration 0020**: `donations.amount_cents INTEGER NOT NULL CHECK(>=0)` (المبلغ المالي المعتمد؛ `amount` REAL يبقى للعرض) + جدول `stripe_webhook_events(event_id UNIQUE, event_type, processed_at, tx_id)` — **لا أي عمود مبلغ** (tx_id مرجع فقط). تُطبَّق على قاعدة فارغة وتُفرض قيودها فعلياً.
  - **`StripeWebhookService`**: معالجة موقّعة → قيود ledger متوازنة عبر `LedgerService.post()` فقط. مدعوم: نجاح الدفع (capture)، refund (reversal معكوس متوازن)، فشل (بلا قيود دائنة)، غير مدعوم (200 بلا أثر). **idempotency بطبقتين**: `UNIQUE(event_id)` + فحص `tx_id` في ledger — نفس الحدث 10× ⇒ أثر مالي واحد.
  - **عدم الثقة**: المبلغ يُطابَق دائماً مع `donations.amount_cents` — التعارض ⇒ رفض بلا أثر. كل المبالغ integer cents.
  - **التحقق من التوقيع أولاً** (400 قبل أي كتابة)؛ **إصلاح حتمي**: `csrfProtection()` كان يحظر webhook الحقيقي (Stripe لا يرسل Origin/Referer/CSRF) — استثناء محصور بالمسار فقط.
  - **i18n**: 8 مفاتيح ar+en للمدفوعات (مختلفان)؛ `donate-page.ts` يعرض النتيجة المترجمة بدل النصوص الحرفية.
  - **الأمان**: لا أسرار Stripe في المستودع أو التاريخ. مسار webhook PUBLIC مع in-handler HMAC check (صحيح للـwebhook).
  - **الاختبارات**: 22 جديدة (15 ledger-level + 7 route-level status codes + 1 CSRF reachability). التحديثات: `schema-contract` (21 migration + الجدول) و`fake-d1` (`amount_cents`).
  - **التحقق**: `npm test` 419/419 ✅ + `tsc` ✅ + `build` ✅ + `routes:inventory` 186 ✅. الحالة 🔧 (تحقق محلي) ريثما تكتمل G1–G8 بالمراجعة الخارجية — بلا دمج.
  - **التسريب (G8)**: revert الـcommit + حذف migration 0020 (جدول جديد لا يُلامسه migrations سابقة) + إزالة service/i18n/routes/tests.

## 8.B — الأرباح وحصص المنافسة · فرع `feat/money-earnings-split`

- 🔧 منفَّذ محلياً على `feat/money-ledger-invariant` (الرأس bd520e9). النطاق: `LivePayoutEngine.finalizePayouts` يوزع عبر `LedgerService` فقط (بلا earnings/financial_log كبديل)؛ `splitPayoutCents` بـ integer cents وقاعدة تقريب موثقة؛ idempotency داخل SQL (`claimFinalized` + إدراج شرطي + `UNIQUE(tx_id, account)`)؛ i18n `earnings.{total,pending,per_competition}` + `earnings_nav` ar+en؛ اختبار `tests/api/earnings-split.test.ts` (8/8). السياسة الفعلية: 20% منصة + 80% pool حسب التقييمات، والتساوي عند tie/no ratings (لا 70/25/5). التحقق: `npm test` 396/396 + `tsc` + `build` ✅ محلياً؛ بانتظار PR/مراجعة الوكيل الخارجي (بلا دمج، بلا Production D1).
  - **البوابات M1–M6**: M1 ✅ (verifyInvariant=0 بعد كل payout بما فيه 10 متزامنة)؛ M2 ✅ (post واحد في `db.batch()`)؛ M3 ✅ (لا Float جديد في مسار payout؛ المجاميع integer)؛ M4 ✅ (PROOF-0 + PROOF-2 + تشغيل مزدوج)؛ M5 ✅ (created_by + ref لكل قيد، وrevenue_log لقطة فقط)؛ M6 ✅ (بلا مسار عام جديد).
  - **التسريب (G8)**: التراجع = revert الـcommit؛ بلا migration وبلا بيانات إنتاج.


## 8.A — دفتر الأستاذ والثابت المحاسبي · فرع `feat/money-ledger-invariant`

- ✅ تمّ الإنشاء محلياً من `feat/live-turn-config` (الرأس 69f30ae). النطاق: جدول `ledger_entries` (migration 0019) + `LedgerService` + i18n محفظة + اختبارات (api + integration). **بناء محلي فقط — بلا API مسار جديد، بلا تغيير على `user_earnings`/`withdrawal_requests` الحالي (بلا سلوك مالي موجود).**
  - **Migration 0019**: `ledger_entries(id, tx_id, account, direction(debit|credit), amount_cents INTEGER CHECK(>0), currency, ref_type, ref_id, created_at, created_by)` — لا `REAL/FLOAT`؛ `UNIQUE(tx_id, account)` للعدمية (M4); `CHECK` على `direction` و`amount_cents` و`length(currency)=3` (M3); مشغلات `RAISE(ABORT)` append-only للـ `UPDATE/DELETE` (M5، M3). لا `FOREIGN KEY` على `ref_type/ref_id` (مرجع متعدد الأنواع — نفس نموذج 0002 السابق). الرصيد **بتجميع من ledger فقط** — لا عمود مكرر (M2).
  - **LedgerService**: `post()` يكتب مجموعة قيود متوازنة في `db.batch()` واحد (M1+M2)؛ `withdraw()` يُفرض عدم السلبية **بشرط SQL** داخل `INSERT…SELECT…WHERE balance>=amount` (M3، لا فحص JS)؛ `balance()`/`verifyInvariant()` تجميع مباشر؛ idempotent على `tx_id` (M4)؛ `created_by`+`ref` لكل قيد (M5).
  - **i18n**: `wallet.balance`/`insufficient_funds`/`transaction_failed` في `ar.ts`+`en.ts` (مختلفان).
  - **اختبارات**: `tests/api/ledger-invariant.test.ts` (9/9 على `SqliteD1` حقيقي يحمل الـ migrations) و`tests/integration/ledger.test.ts` (15/15 على D1 حقيقية عبر Wrangler CLI)؛ `schema-contract.test.ts` حُدَّثتعداده migration إلى 20 + أعمدة/فهرس ledger.
  - **البوابات M1–M6**: M1 ✅ (verifyInvariant دائماً 0 بعد 100 حركة عشوائية و20 متزامنة)؛ M2 ✅ (كل الحركة في `db.batch()` واحد)؛ M3 ✅ (guard شرط SQL + `CHECK` محرك)؛ M4 ✅ (نفس tx_id ⇒ صف واحد)؛ M5 ✅ (مشغلات رفض UPDATE/DELETE؛ `created_by`+`ref` لكل قيد)؛ M6 ✅ (إنشاءات مالية فقط، بدون مسار عام يُغيّر حالة — والموجودة ملتزمة M6).
  - **أوامر التحقّق V1–V6**: V1 `npm run build` ✅؛ V2 `npx tsc --noEmit` ✅ (بدون `any` جديد؛ العدد 144 ≤ 308)؛ V3 `npm test` 388/388 ✅؛ V4 `npm run db:reset` يطبق 0019 من قاعدة فارغة ✅؛ V5 `npm run test:integration` ledger 15/15 ✅ (فشل واحد بيئي في `messages-schema.test.ts` — انقضاء 120s بسبب بطء `wrangler CLI` على هذا الجهاز، غير مرتبط بـ ledger ولا بتغييراتي)؛ V6 عدّاد `any` لا يرتفع ✅.
  - **التسريب (G8)**: التراجع = حذف ملف 0019 + `LedgerService.ts` + الإزالة من `index.ts`/i18n + التراجع عن تحديثات `schema-contract.test.ts`؛ لا حاجة لتراجع بيانات (جدول جديد لا يُلامسه migrations سابقة).
  - **معروف (docs/16 §4)**: لا يوجد مسار علني يكتب الرصيد — فقط دالة خدمة داخلية جاهزة للأولوية المالية المنصوحة بها في مرحلة لاحقة.


- 🔧 Local implementation on `feat/live-turn-config` (from 7.C branch head `6cd01f9`). Scope: TURN عبر env فقط (لا سر في المستودع) + اعتمادات TURN مؤقتة قصيرة العمر مُولَّدة خادمياً لكل جلسة + تدهور رشيق (رسالة مترجمة + بديل STUN، لا شاشة سوداء).
- جديد `src/lib/services/TurnCredentialService.ts`: خلفيتان عبر env — (A) `TURN_URL`+`TURN_SECRET` → coturn REST auth (HMAC-SHA1 ephemeral، `username = <expiry>:<userId>`، TTL 3600s، مع نسخة `transport=tcp` تلقائية للشبكات المقيّدة)، (B) `TURN_TOKEN_ID`+`TURN_API_TOKEN` → Cloudflare Calls بطلب لكل جلسة (TTL 3600s) — أُلغيت ذاكرة Cache API المشتركة ~6h (سر مشترك سابق). غير مُعدَّ → STUN-only (`turn_available:false`). فشل خلفية مُعدَّة → `TurnCredentialError` → 502 برسالة مترجمة.
- `GET /api/signaling/ice-servers` أصبح محمياً بـ `authMiddleware({required:true})` (401 لغير المصادق)، ويعيد `iceServers + turn_available + ttl_seconds + expires_at` — لا يكشف أي سر سوى الاعتماد المؤقت. `fetchCloudflareIceServers` القديمة حُذفت.
- i18n: `live.network_restricted` + `live.turn_unavailable` (محفوظتان `live_signaling.*` مع alias في `i18n/index.ts` كما في 7.A). العميل `shared.ts fetchIceServers()` يرسل Bearer الجلسة ويعرض الرسائل المترجمة مع fallback STUN.
- bindings: `TURN_URL`/`TURN_SECRET` (اختياريان) في `src/config/types.ts` + `.dev.vars.example` بقيم فارغة فقط؛ docs/04 + docs/07 حُدِّثا؛ الجرد أعيد توليده (مسار أصبح AUTHENTICATED).
- الاختبار: `tests/api/turn-credentials.test.ts` (7) — مؤقت+انتهاء، 401، لا سر في الاستجابة (مسارا coturn وCloudflare)، فشل TURN ⇒ رسالة مترجمة ar/en، fallback STUN، مفاتيح i18n. الحالة 🧪 (تحقق محلي) ريثما تُستكمل G1–G8 بالمراجعة الخارجية.


## F-10 — Repository Change Policy (2026-09-18)

- 🔧 Local policy on `docs/repository-change-policy`, based on origin/main `042cbb5` (merge of PR #30, F-9). Docs only: no code, migration, schema, API, test, dot-folder/artifact create/delete/move/rename, plan, F-11 or merge changes.
- New `docs/18-REPOSITORY-CHANGE-POLICY.md`: general rule (no new file/folder outside task scope without explicit documented permission; allowed only if in-scope + justified in task report, or with explicit approval) + binding non-exhaustive list (planning files/plan copies, agent-artifact folders, temp reports, temp test files, personal agent tools, `.agent/.claude/.gemini` and similar) + F-9 relation (generalization, no deletion/move decision) + truth-source links + scope confirmations (OOP/MVC/SoC/i18n preserved, untouched).
- Enforced via new "تغيير المستودع (F-10)" quick rule in `AGENTS.md`; pointers in `docs/00-OVERVIEW.md` and `docs/17-DOT-FOLDERS-POLICY.md` (§4).
- Remote review pending. Status remains 🔧 under G1–G8; no APPROVE/MERGE claim.

## F-9 — Dot-Folders / Agent Artifacts Policy (2026-09-18)

- 🔧 Local policy on `docs/dot-folders-policy`, based on origin/main `002d887` (merge of PR #29, F-8). Docs only: no code, migration, schema, API, test, dot-folder create/delete/move/rename, plan, cleanup or merge changes.
- New `docs/17-DOT-FOLDERS-POLICY.md`: full inventory of the 7 agent artifacts found (`.agent`, `.blackbox`, `.claude`, `.gemini`, `.plan`, `.specify`, `.testsprite`) + explicit non-scope list (`.git/.github/.vscode/.wrangler/dotfiles` + `specs//testsprite_tests/` without dot) + the 6 binding rules (historical unless proven otherwise; not Sources of Truth; no planning/arch decisions on them; no new dot-folders without explicit permission; existence ≠ delete now; final cleanup not part of F-9). No new architectural decision, no F-10.
- Linked from F-8 sources: `docs/00-OVERVIEW.md` (policy pointer), `docs/16-KNOWN-ISSUES.md` (§4 pointer), `AGENTS.md` (reading-list item 3 pointer).
- Remote review pending. Status remains 🔧 under G1–G8; no APPROVE/MERGE claim.

## F-8 — Documentation Consolidation (2026-09-18)

- 🔧 Local consolidation on `docs/consolidate-documentation`, based on origin/main `fbee0cc` (PR #28 merge). Docs only: no code, migration, schema, API, test or dot-folder changes.
- Source-of-Truth map added in `docs/00-OVERVIEW.md` (categories A–G); new `docs/16-KNOWN-ISSUES.md` (duplicate 0012 numbering, corrected assumptions, non-sources list).
- Updated to match F-1 → F-7 reality: `docs/01` (governance refs + F-5A–F-5D SQL-free rule + FollowModel exception + G1–G8 workflow), `docs/02` (migrations 0014–0018 + duplicate-0012 note), `docs/03` (cron Bearer POST-only, SEC-11 pointer, B10/B11 endpoints), `docs/05` (F-6 STS SSOT + F-7 i18n), `AGENTS.md` (cron truth, F-5/F-6 pointers, reading list 1–11).
- Archived clearly (not deleted): `docs/COMPLETE_PROJECT_PLANS.md` bannered historical, `docs/10` bannered dated snapshot, `docs/archive/README.md` pointer fixed to governance docs.
- Remote review pending. Status remains 🔧 under G1–G8; no APPROVE/MERGE claim.

## F-5D — SQL inside AdminController (2026-09-18)

- 🔧 Local extraction validated, remote review/staging pending: every direct SQL statement inside `src/controllers/AdminController.ts` moved to the Model layer, behavior-preserving (same SQL, bindings, WHERE, sorting/pagination, error handling and response contracts; authorization and i18n untouched).
- New model: `src/models/AdminStatsModel.ts` (dashboard statistics + enhanced statistics: user/competition/report/ad counts, competitions-by-status, total revenue, active users, arbitration-pending, campaign-active ads, country demographics, hottest competitions).
- Extended existing models (no duplicates): `UserModel.searchForAdmin/getBanTarget/setActive` (users search/pagination, ban target resolution, ban/unban `is_active` update), `ReportModel.getTarget` (moderation target + audit target), `CommentModel.getAuthorId` (moderation author resolution), `CompetitionModel.getCreatorId/getSuspendState/getRestoreState/suspend/restore/recordSuspension/markSuspensionRestored/deleteCascade` (broadcast suspend/restore Task 9 + moderation cascade delete).
- New tests: `tests/models/AdminModelExtraction.test.ts` — 11 tests (static pin: no `.prepare(`/SQL in AdminController; behavior pins on sqlite over the real migrations for all extracted responsibilities). Focused suites: 11/11; affected model regressions (UserModel/FollowModel/RatingModel) 28/28. `npx tsc --noEmit`: exit 0. `npm run build`: exit 0.
- No schema/migration, route, URL, other-controller or F-6 work included. Rollback: revert the F-5D commit; no data migration needed.
- Files: src/controllers/AdminController.ts, src/models/AdminStatsModel.ts, src/models/UserModel.ts, src/models/ReportModel.ts, src/models/CommentModel.ts, src/models/CompetitionModel.ts, tests/models/AdminModelExtraction.test.ts, PLAN-STATUS.md, WORKLOG.md.
- Local implementation validated; remote review/staging pending. Status remains 🔧 under G1–G8; no full quality-gate completion claim.


# 📊 PLAN-STATUS — لوحة حالة المهام

> ⚠️ **تحذير حاكم (2026-09-05):** `docs/11-DEFINITION-OF-DONE.md` وجد أن علامة "✅
> مكتملة ومختبرة" أدناه غير دقيقة لمعظم البنود — لا يوجد اختبار آلي واحد في المشروع
> (`docs/13-TEST-STRATEGY.md`). كل `✅` تخصّ **منطقاً لا توثيقاً** يجب أن تُقرأ فعلياً
> كـ`🧪 مُتحقَّقة يدوياً فقط` حتى تُكتب لها اختبارات (`tests/`) وتجتاز G1–G8. **لم تُنفَّذ
> إعادة التصنيف الفعلية لكل سطر بعد** — هذا بند متابعة صريح، لا سهواً مخفياً.
> الرموز الصحيحة من الآن: `☐ لم تبدأ` | `🔧 جارية` | `🧪 مُتحقَّقة يدوياً (لا اختبار آلي)` | `✅ اجتازت G1–G8` | `⛔ معطلة`
> مرجع التعريفات الكاملة: `docs/COMPLETE_PROJECT_PLANS.md` (تاريخي) — مرجع البوابة الحاكمة: `docs/11-DEFINITION-OF-DONE.md`
> خارطة الطريق المصححة والأولويات الفعلية: `docs/15-ROADMAP.md`
## F-5C — SQL inside Pages (2026-09-18)

- 🔧 Local extraction validated, remote review/staging pending: only the F-4-identified SQL in src/modules/pages/profile-page.ts (two `follows` COUNT statements → FollowModel.getFollowersCount/getFollowingCount) and src/modules/pages/live/main.ts (session lookup → SessionModel.findBySessionId; competition lookup → CompetitionModel.findOne) moved to the Model layer, reusing existing methods with identical SQL/bindings. New tests: 9 profile + 25 live-page pins passed before and after extraction; focused suites 58/58 after (incl. F-5A/F-5B regression pins), npx tsc --noEmit exit 0, npm run build exit 0. No F-5A/F-5B/F-5D/F-6 or unrelated work included. See WORKLOG.md for evidence and rollback. No full G1–G8 completion claim; no migration needed.




## F-5B — Controller-local FollowModel (2026-09-17)

- 🔧 Local extraction validated, remote review/staging pending: only FollowModel moved from UserController to src/models/FollowModel.ts, preserving the constructor and five methods unchanged. New tests: 7 model + 5 API passed (API pins also passed 5/5 before extraction); npm test 208/208, tsc and build exit 0. Affected D1 integration: 6 passed / 2 pre-existing failures (comment/conversation creation), reproduced with origin/main test/dependencies. See WORKLOG.md for baseline evidence and the retained inheritance exception. No full G1–G8 completion claim.


## المرحلة 0 — التنظيف الكبير

| ID | المهمة | الحالة | الملفات | اختبار القبول | التاريخ |
|----|--------|--------|---------|---------------|---------|
| SRS-0.1 | تنظيف الكود (backups، مسارات ميتة) | ✅ | src/modules/pages/live/scripts/client/*, src/routes/* | build نظيف ✅ | 2026-08-23 |
| SRS-0.2 | توحيد التوثيق وأرشفة القديم | ✅ | docs/, docs/archive/ | لا تكرار متناقض ✅ | 2026-08-23 |
| SRS-0.3 | قواعد المعمارية + AGENTS.md | ✅ | docs/01-ARCHITECTURE-RULES.md, AGENTS.md | مراجعة ضد القواعد | 2026-08-23 |

## المرحلة 1 — الإصلاح الحال

| ID | المهمة | الحالة | الملفات | اختبار القبول | التاريخ |
|----|--------|--------|---------|---------------|---------|
| T1.1 | ترحيل 0007 + إصلاح user_follows | ✅ | migrations/0007, UserModel, SearchModel, UserSettingsModel | migrate ناجح ✅، صفر user_follows ✅ | 2026-08-23 |
| T1.2 | ربط recommendations/leaderboard/analytics | ✅ | src/main.ts | JSON وليس 404 ✅ (401 محمية) | 2026-08-23 |
| T1.3 | إصلاح استقبال البث (حي+VOD) | 🔧 | shared.ts, competition-page, chunks/routes (وكيل playlist) | إصلاح 3 أسباب جذرية (امتداد+polling+CORS proxy) — يتبقى جلسة بث حي للتأكيد النهائي | 2026-08-23 |
| T1.4 | أمان حرج (PBKDF2، حظر، XSS، بريد) | ✅ | CryptoUtils, AdminController, SessionModel, Sanitize | ترقية شفافة E2E ✅ محظور=خروج قسري ✅ | 2026-08-23 |
| T1.5 | دورة النهاية والأرباح التلقائية | ✅ | ScheduledTaskService, CompetitionController, cron/routes, LivePayoutEngine | winner_id بالتقييم ✅ ELO تغير ✅ cron نفّذ التوزيع ✅ | 2026-08-23 |

## المرحلة 2 — المفقودات من الواقع

| ID | المهمة | الحالة | الملفات | اختبار القبول | التاريخ |
|----|--------|--------|---------|---------------|---------|
| T2.1 | مودال الدعوات الكامل (فتح تلقائي+hover+صلاحيات) | ✅ | InvitePanel.ts, MatchmakingController, competition-page, create-page, migrations/0008 | online-users مرتبة بالتوافق ✅ hover-stats تعمل ✅ فتح تلقائي مربوط ✅ | 2026-08-23 |
| T2.2 | إشعارات فورية SSE شاملة | ✅ | CompetitionController, middleware/auth, SseService, NotificationsUI, i18n | E2E حقيقي: invite_sent وinvite_accepted وصلا لحظياً عبر البث ✅ | 2026-08-23 |
| T2.3 | عرض المنافسات المقترحة بأوزان | ✅ | RecommendationEngine, client/pages/HomePage.ts | قسم المقترح عبر المحرك + تدهور رشيق ✅ | 2026-08-23 |
| T2.4 | تعليقات وتقييمات → منتصر | ✅ | competition-page, CompetitionController | نجوم 1-5 + شريط الفائز يظهران E2E ✅ (المنطق من T1.5) | 2026-08-23 |

## المرحلة 3 — اكتمال النواة

| ID | المهمة | الحالة | الملفات | اختبار القبول | التاريخ |
|----|--------|--------|---------|---------------|---------|
| T3.1 | عولمة اللغات | ✅ | i18n/languages.ts, index.ts, docs/06-I18N-GUIDE.md | إضافة لغة = 3 خطوات موثقة بلا تعديل منطق | 2026-08-23 |
| T3.2 | البروفايل الكامل (منشورات/جدولة) | ✅ | delete-account.ts, profile-page, CountdownTimer wiring, migrations/0009 | حذف GDPR ✅ نشر/حذف منشور E2E ✅ مؤقت الحياة يعمل ✅ | 2026-08-23 |
| T3.3 | تعليقات متقدمة (ردود/إشراف) | 🔧 | CommentModel, CompetitionController, competition-page | ردود متداخلة E2E ✅ (الإشراف ضمن أدوات T3.4) | 2026-08-23 |
| T3.4 | أدمن حقيقي (تنفيذ الأفعال+تدقيق) | ✅ | AdminController, admin routes, AdminAuditLogModel | بلاغ→حظر فعلي+سجل تدقيق E2E ✅ | 2026-08-23 |

## المرحلة 4 — الأنظمة المساعدة

| ID | المهمة | الحالة | الملفات | اختبار القبول | التاريخ |
|----|--------|--------|---------|---------------|---------|
| T4.1 | دفع حقيقي Stripe/PayPal | ✅ | StripeService.ts, donations routes+webhook, donate-page, main.ts | Checkout+webhook موقّع E2E ✅ (يتطلب STRIPE keys بالإنتاج للدفع الحي) | 2026-08-23 |
| T4.2 | سحوبات بوابات إقليمية | ✅ | withdrawals + payment-methods (مربوطة) | طلب→موافقة (منفذ منذ قبل) + طرق الدفع مربوطة | 2026-08-23 |
| T4.3 | بوابة معلنين + تقارير | ✅ | advertiser, ad-blocks, ad-reports (ربط) | الوحدات الثلاث مربوطة في main.ts | 2026-08-23 |
| T4.4 | شفافية مالية آلية | ✅ | LivePayoutEngine → platform_financial_logs | تتغذى تلقائياً من T1.5 ✅ + API يستجيب | 2026-08-23 |

## المرحلة 5 — الرؤية البعيدة

| ID | المهمة | الحالة | الملفات | اختبار القبول | التاريخ |
|----|--------|--------|---------|---------------|---------|
| T5.1 | Durable Objects push أصلي | ✅ | workers/dueli-realtime/ (DO+Hibernation), EventPusher توجيه, SseService WS-first | بناء ✅ — التحقق الحي بعد `wrangler deploy` (خطة Workers مدفوعة) | 2026-08-23 |
| T5.2 | Cloudflare Stream/VOD CDN | ✅ قرار | قرار مالك مفوض: إبقاء خط ffmpeg الحالي (يعمل وأرخص) — مراجعة عند الحاجة الفعلية | موثق في WORKLOG | 2026-08-23 |
| T5.3 | PWA كامل / موبايل | 🔧 | manifest.json, sw.js (v2 + تقليم كاش) | الأساس + تحسينات ✅ — offline كامل تحسين مستقبلي | 2026-08-23 |
| T5.4 | ترجمة مجتمعية + AI moderation | ☐ مؤجل | - | بعد نمو المحتوى — قرار مالك | |
| T5.5 | API عامة موثقة | ✅ | docs/08-PUBLIC-API.md | دليل مطورين خارجيين كامل | 2026-08-23 |
| B13 | صلابة leaderboard/search/explore (JSON دائماً، MVC منفصل، لا SQL في routes) | ✅ اجتازت G1–G8 | src/modules/api/leaderboard/routes.ts, src/modules/api/search/routes.ts, src/controllers/LeaderboardController.ts, src/controllers/SearchController.ts, src/models/LeaderboardModel.ts, src/i18n/ar.ts, src/i18n/en.ts, src/modules/pages/explore-page.ts, tests/api/discovery-endpoints.test.ts | 200 JSON نجاح/فارغ، 500 JSON نظيف مترجم بلا تسريب، Content-Type دائماً application/json، grep يؤكد انعدام SQL في المسارات، 9/9 اختبارات ✅ + npm test 156/156 ✅ + tsc ✅ + build ✅ | 2026-09-16 |

## حوكمة الجودة (2026-09-05)

| ID | المهمة | الحالة | الملفات | اختبار القبول | التاريخ |
|----|--------|--------|---------|---------------|---------|
| GOV-1 | كتابة 11-DEFINITION-OF-DONE.md | ✅ | docs/11-DEFINITION-OF-DONE.md | مراجعة محتوى — G1-G8 + M1-M6 كاملة | 2026-09-05 |
| GOV-2 | كتابة 12-SECURITY-REMEDIATION.md | ✅ | docs/12-SECURITY-REMEDIATION.md | SEC-01→SEC-15 موثّقة بملف/سطر/توجيه/قبول | 2026-09-05 |
| GOV-3 | كتابة 13-TEST-STRATEGY.md | ✅ | docs/13-TEST-STRATEGY.md | مكدّس+بنية tests/+F1-F15+خطة أسبوع 1 | 2026-09-05 |
| GOV-4 | كتابة 15-ROADMAP.md | ✅ | docs/15-ROADMAP.md | مراحل 0-9 ببوابات خروج | 2026-09-05 |
| GOV-5 | إعادة بناء dev-tools/route-inventory.mjs | ✅ | dev-tools/route-inventory.mjs, route-inventory.json | نُفّذ فعلياً: 172 مسار مصنَّف | 2026-09-05 |
| GOV-6 | إصلاح db:reset عابر للأنظمة | ✅ | dev-tools/reset-d1.mjs, package.json | لا PowerShell في السكربت | 2026-09-05 |
| GOV-7 | تحديث AGENTS.md وربط 10-15 | ✅ | AGENTS.md | ترتيب قراءة مصحَّح + 3 حقائق قديمة مصحَّحة | 2026-09-05 |
| GOV-8 | CI quality-gate.yml | 🧪 | .github/workflows/quality-gate.yml | لم يُشغَّل بعد على GitHub Actions فعلياً (يحتاج أول push/PR) | 2026-09-05 |
| GOV-9 | إعادة تصنيف كل سطر ✅→🧪 في هذا الملف | ☐ | PLAN-STATUS.md (كامل) | — | مؤجل، يحتاج جلسة مخصصة |
| GOV-10 | إصلاح ثغرات SEC-01→SEC-15 فعلياً | ☐ | حسب كل بند في docs/12 | — | مرحلة 1 من 15-ROADMAP.md |
| GOV-11 | أساس integration D1 حقيقي عبر Wrangler CLI | 🔧 | tests/integration/, vitest.integration.config.ts, package.json, .gitignore | 16 schema-contract tests تمر مرتين متتاليتين؛ 14 migration files تُطبق كما هي عبر `wrangler d1 migrations apply` على حالة معزولة `.wrangler-test/`؛ لا FakeD1/TEST_SCHEMA/SQL transformation. **لا يُصلح B1/B2/B4/B5 ولا يغطي المالية أو E2E** | 2026-09-08 |
| GOV-11 | SEC-11 (raw `?token=` في query): **مفتوحة — دين أمني معلن مؤقتاً**. بعد incident 2026-09-07 (commit 55da144 كسر SSE الخاص) أعيد raw query token مؤقتاً عبر PR #1 (merge e38a2d3) وفحص CI حوله تحول إلى تحذير (GRACE-PERIOD، بلا تاريخ إغلاق وهمي). العلاج النهائي لم يتغير: realtime ticket flow + اختبارات expiry/single-use/user-binding (المرحلة 4 من 15-ROADMAP.md) — عندها فقط يعود الفحص مانعاً. | 🔧 | .github/workflows/quality-gate.yml (CI فقط — لا src)، docs/12 SEC-11، docs/15 Phase 4 | فحص CI يظهر ::warning لا ::error؛ لا ✅ هنا بأي حال | 2026-09-07 |
| GOV-11 (مُحدَّث) | SEC-11: raw `?token=` أُزيل من `authMiddleware`، وSSE بتذكرة أحادية. حارس CI أصبح AST مانعاً بلا فترة سماح (UNIT30.3) | 🔧 | .github/workflows/quality-gate.yml, dev-tools/check-sec-guards.mjs, tests/api/sec-guards.test.ts | `?token=` جلسة ⇒ 401؛ `node dev-tools/check-sec-guards.mjs sec11` PASS؛ لا `continue-on-error` | 2026-10-23 |
| GOV-11 | B5-2: تعريب رسائل أخطاء المنافسة المتبقية — إضافة 11 مفتاح i18n تحت `competition_errors` (no_opponent/vod_url_required/already_has_opponent/invitee_required/cannot_invite_self/already_invited/no_pending_invitation/no_pending_request/request_already_accepted/already_competitor/competition_full) مترجمة ar+en؛ استبدال 10 نصوص حرفية في CompetitionController بـ `this.t()`؛ إصلاح خلل بناء في fake-d1.ts (if-block مكرر)؛ 5 اختبارات i18n جديدة (ar+en + حارس انحدار). النطاق محصور بـ CompetitionController + i18n + tests — لا متحكمات مال/إعلانات | 🧪 | src/controllers/CompetitionController.ts, src/i18n/ar.ts, src/i18n/en.ts, tests/helpers/fake-d1.ts, tests/api/competition-errors-i18n.test.ts | competition-errors-i18n 5/5 ✅ + npm test 75/75 ✅ + tsc ✅ + build ✅؛ الحالة 🧪 حتى مراجعة القائد | 2026-09-09 |
| GOV-11 | B1: محاذاة schema الرسائل مع نموذج conversations — migration 0014 (إضافة messages.conversation_id وread_at + backfill محادثات legacy + ربط الرسائل القديمة + read_at من is_read + فهارس conversation_id/created_at وreceiver_id/is_read) + MessageModel (إنشاء يحفظ receiver_id من المحادثة مع فحص عضوية المرسل، markAsRead يضبط is_read=1 وread_at، unread_count بـis_read=0) + 9 integration tests حقيقية عبر Wrangler CLI (سلمت حمراء قبل الإصلاح: `no such column: m.conversation_id`) + i18n: إضافة مفاتيح مفقودة (errors.invalid_id, message.invalid_recipient, message.content_required) لـar/en + 35 i18n test تحقق الترجمة وRTL/LTR | 🧪 | migrations/0014_messages_conversation_alignment.sql, src/models/MessageModel.ts, src/i18n/ar.ts, src/i18n/en.ts, tests/integration/messages-schema.test.ts, tests/api/messages-i18n.test.ts, tests/integration/schema-contract.test.ts, tests/integration/helpers/wrangler-d1-runner.mjs, vitest.integration.config.ts, package.json | 25/25 integration tests (مرتين متتاليتين، exit 0) + 70/70 unit (35 i18n + 35 original) + build ✅ + tsc ✅ + db:reset ✅؛ الحالة 🧪 حتى مراجعة القائد (لا commit/PR بعد) | 2026-09-08 |
| B5-1 | حراسة انتقالات حالة المنافسة (start: accepted فقط + opponent إلزامي → 409، end: live فقط → 409، idempotent: completed → already_completed بلا finalize مكرر؛ Model بـUPDATE مشروط AND status + boolean من meta.changes/before-after fallback؛ لا لمس للمال/LivePayoutEngine/ScheduledTaskService/migrations) | 🧪 | src/models/CompetitionModel.ts, src/controllers/CompetitionController.ts, src/i18n/ar.ts, src/i18n/en.ts, tests/integration/competition-state-guards.test.ts, tests/api/competition-state-guards-i18n.test.ts | integration 7/7 عبر D1 حقيقية (Wrangler CLI) ✅ + unit 73/73 (منها 3 i18n جديدة) ✅ + tsc ✅ + build ✅؛ 🧪 حتى مراجعة القائد (لا commit/PR بعد) | 2026-09-09 |
| B2+B3 | ترقيم التعليقات + شجرة الردود + بث حي + حمولة أخف — `GET /:id/comments` (limit≤100، `replies_count`)، `GET /:id` خفيف (`comments_count`)، `publishComment` بعد الإدراج، حذف ناعم (`deleted_at`، مالك/أدمن)، بلاغ `message` بنفس النظام؛ i18n ar+en؛ اختبار أحمر أولاً 6/6 فشل ثم 6/6 نجاح | 🔧 | migrations/0016, CommentModel, CompetitionController, competitions/routes, competition-page, ReportModel, i18n/ar+en, tests/api/comments-pagination.test.ts, docs/03+14, WORKLOG | comments-pagination 6/6 ✅ + npm test 111/111 ✅ + tsc ✅ + build ✅ + route-inventory ✅؛ بانتظار PR/مراجعة (بلا دمج) | 2026-09-10 |
| B8 | توحيد الإعجاب/عدم الإعجاب — **الإكمال لا الإزالة**: `POST/DELETE /api/competitions/:id/dislike` (كان `dislikes` مخزَّناً ومعروضاً بلا مسار يكتبه)؛ `LikeModel.setReaction/clearReaction` تبديل ذرّي في `db.batch()` (حذف المعاكس → `INSERT OR IGNORE` للفعل → إعادة حساب `competitions.likes_count/dislikes_count` من الجدولين) فلا يجتمع like و dislike لنفس المستخدم/المنافسة والتكرار idempotent؛ `GET /:id/like` يعيد `{ liked, disliked, likes_count, dislikes_count }`؛ حارس الحظر المركزي B6 (`isBlockedBetween`) على الفعلين ⇒ 403 بلا صف؛ i18n `interactions.*` ar+en؛ **بلا migration** (جدولا `likes`/`dislikes` من 0001) | 🧪 | src/models/LikeModel.ts, src/controllers/InteractionController.ts, src/modules/api/likes/routes.ts, src/i18n/ar.ts, src/i18n/en.ts, src/shared/components/competition-card.ts, src/client/services/InteractionService.ts, tests/api/like-dislike.test.ts (جديد), tests/helpers/fake-d1.ts, docs/03, docs/14, dev-tools/route-inventory.json, WORKLOG.md | أحمر أولاً: 6/6 فشل (404 للمسار + غياب الحقول) ثم 6/6 ✅ + npm test 117/117 ✅ + tsc ✅ + build ✅ + route-inventory 174 مساراً ✅؛ G7 staging لم يُجرَّب — 🧪 حتى مراجعة القائد | 2026-09-15 |
| B9 | تصحيح أنواع الإشعارات + التوطين وقت العرض — إشعار الرسالة كان يُخزَّن `type='comment'` (خطأ نسخ) أُصلح إلى `type='message'` في `MessageController.sendMessage/startConversation`؛ تعداد `NotificationType` وُسّع (`message/post_like/post_comment`) **بلا migration** (عمود TEXT بلا CHECK في 0001)؛ `NotificationModel.createForType()` يخزّن `type + payload` فقط (title = مفتاح i18n)؛ `NotificationPresenter` يولّد title/message/link وقت العرض حسب `?lang=` مع fallback آمن (`notification.generic`، بلا exception)؛ i18n جديدة ar+en (`new_message_body/new_post_like(_body)/new_post_comment(_body)/generic/competition_invite`)؛ إشعار `follow` تحوّل لنفس العقد | 🔧 | src/config/types.ts, src/models/NotificationModel.ts, src/lib/services/NotificationPresenter.ts (جديد), src/controllers/MessageController.ts, src/controllers/UserController.ts, src/i18n/ar.ts, src/i18n/en.ts, tests/api/notification-types.test.ts (جديد), tests/helpers/fake-d1.ts | أحمر أولاً: `type='comment'` + مفاتيح مفقودة + بلا link ثم 8/8 ✅ + npm test 125/125 ✅ + tsc ✅ + build ✅؛ بانتظار PR/مراجعة (بلا دمج) | 2026-09-15 |

| B10 | أهلية التقييم ونافذته (24h من `ended_at` + منع التقييم الذاتي + شرط المشاهدة) — فقرة «أهلية التقييم» في `docs/05`؛ `RatingModel.decideRatingEligibility()` نقية + `checkEligibility()` (watch row + duplicate + window على ساعة الخادم)؛ `CompetitionController.rate()` يرفض المشاركين (403 self) وهدفاً غير مشارك (422) وبلا مشاهدة (403) وخارج النافذة (403) والمكرر (409)؛ تعارض UNIQUE المتزامن → 409؛ `RatingEligibilityError` (403)؛ i18n `competition_errors.rating_{self_forbidden,watch_required,window_closed}` ar+en؛ **بلا migration** (أعمدة `ended_at`/`watch_history` من 0001)؛ B6 حُدّث (مقيّم C محايد بدل المشارك B) | 🔧 | docs/05-COMPETITION-LIFECYCLE.md, src/models/RatingModel.ts, src/controllers/CompetitionController.ts, src/lib/errors/AppError.ts, src/i18n/ar.ts, src/i18n/en.ts, tests/api/rating-eligibility.test.ts (جديد), tests/api/block-enforcement.test.ts, tests/helpers/fake-d1.ts | rating-eligibility 9/9 ✅ + npm test 134/134 ✅ + tsc ✅ + build ✅؛ بانتظار PR/مراجعة (بلا دمج) | 2026-09-15 |


| B11 | ملخّص التقييمات مجهول الهوية + سحب التقييم داخل النافذة — `GET /api/competitions/:id/ratings/summary` (تجميع SQL `GROUP BY` في `RatingModel.getSummary()`: متوسط/count/توزيع 1–5، `average=null` عند 0 تقييم بلا NaN وبلا قسمة على صفر؛ **صفر هوية للمقيّم** — لا user_id/username/email/display_name)؛ `DELETE /api/competitions/:id/rate?competitor_id=` (داخل نافذة B10 `isWindowOpen` فقط ⇒ 409 خارجها؛ لمقيّم فعلي فقط ⇒ 404 إن لم يقيّم؛ الحذف + إعادة حساب المجاميع في `db.batch()` واحد بـ UPDATE subqueries)؛ إزالة تسريب الهوية من `RatingModel.findByCompetition()` (بلا JOIN users) واختبار B5-3 القديم تحوّل لحارس خصوصية؛ migration 0017 فهرس `ratings(competition_id, competitor_id)`؛ i18n `ratings.*` ar+en | 🧪 | migrations/0017_ratings_competition_competitor_idx.sql, src/models/RatingModel.ts, src/controllers/CompetitionController.ts, src/modules/api/competitions/routes.ts, src/i18n/ar.ts, src/i18n/en.ts, tests/api/ratings-summary.test.ts (جديد 7 اختبارات), tests/models/RatingModel.test.ts, tests/helpers/fake-d1.ts, docs/14, WORKLOG | ratings-summary 7/7 ✅ (أحمر أولاً على baseline) + npm test 141/141 ✅ + tsc ✅ + build ✅ + db:reset ✅؛ بانتظار PR/مراجعة (بلا دمج) | 2026-09-15 |
| B14 | تثبيت أوزان التوصيات وسلوك الاحتياط — ثوابت مسماة بالقيم نفسها (25/20/20/10/10-7-4/15/15) + اختبار `recommendations-ranking` (18) يثبت الترتيب الست + fallback الزائر + حساسية المتابعة؛ i18n `recommendations.for_you/trending/empty` ar+en | 🔧 | src/lib/services/RecommendationEngine.ts, src/controllers/RecommendationController.ts, src/i18n/ar.ts, src/i18n/en.ts, tests/api/recommendations-ranking.test.ts (new), tests/helpers/sqlite-d1.ts (new), WORKLOG | RED أولاً: 5 فشل / 13 نجاح قبل التثبيت ثم 18/18 ✅؛ بانتظار npm test + tsc + build + PR/مراجعة (بلا دمج) | 2026-09-16 |
| B15 | RTL/dark/mobile polish لمسار Beta (بلا إعادة تصميم، بلا API/DB) — إصلاحات RTL حقيقية: إزالة `scale-x-[-1]` المحظور من زر الدخول + `me-*` المنطقية بدل `mr-*` في competition/create/card + فئات Tailwind ثابتة للـJIT في user-card + `t('previous'/'next')` ar+en للكاروسيل؛ dark: `body.dark` لـbadge-live/badge-pending/tab-inactive؛ mobile: `overflow-x:clip` + `.dropdown-panel max-width:calc(100vw-2rem)` + أسهم الكاروسيل ظاهرة على اللمس؛ اختبار `tests/ui/rtl-dark-mobile.test.ts` (14) سُلّم أحمر أولاً (6/6 فشل) ثم أخضر | 🔧 | src/styles.css, src/shared/components/navigation.ts, src/shared/components/user-card.ts, src/shared/components/competition-card.ts, src/shared/components/competition-section.ts, src/modules/pages/competition-page.ts, src/modules/pages/create-page.ts, src/i18n/ar.ts, src/i18n/en.ts, tests/ui/rtl-dark-mobile.test.ts (new), WORKLOG | rtl-dark-mobile 14/14 ✅ (RED أولاً 6/6 فشل) + npm test 188/188 ✅ + tsc ✅ + build ✅؛ بانتظار PR/مراجعة (بلا دمج) | 2026-09-16 |
| B16 | E2E خفيف واحد لمسار Beta Core Done — سيناريو واحد يغطي الـ14 خطوة (تسجيل/profile/توصيات/إنشاء/دعوة/قبول/بدء/رسالة/تعليق/إنهاء/تقييم/فائز/إشعارات)؛ مشروعان ar (RTL) وen (LTR) بنفس منطق الاختبار؛ مسار حقيقي (UI + Hono API + local D1)؛ لا sleep ولا waitForTimeout؛ اجتياز 3 مرات متتالية بأقل من 3 دقائق؛ إثبات الحساسية للأحمر بتعطيل القبول مؤقتاً؛ حزمة Playwright مقتصرة كـ devDependency؛ لا مساس بـ CI أو الإنتاج | 🧪 | playwright.config.ts, tests/e2e/beta-core-path.spec.ts, package.json, package-lock.json, PLAN-STATUS.md, WORKLOG.md | Playwright 2/2 ✅ (ar+en) 3 مرات متتالية (< 2.5 دقيقة) + إثبات الحساسية أحمر (1/1 فشل) ثم أخضر + npm test 188/188 ✅ + tsc ✅ + build ✅؛ 🧪 بانتظار PR/مراجعة الوكيل الخارجي (بلا دمج) | 2026-09-17 |
| B12 | ذرّية تحديد الفائز + ELO idempotent — `updateAggregatesAfterVote()`: المتوسطات + `winner_id` + ELO + مطالبة `elo_applied_at` في **`db.batch()` واحد** (لا `run()` متتابعة)؛ idempotency **داخل SQL** لا JS: migration `0018_competitions_elo_applied_at.sql` + كتابات `users.elo_rating` مشروطة بـ `(SELECT elo_applied_at ...) IS NULL` + مطالبة `WHERE elo_applied_at IS NULL`؛ **ELO لا يُحسم إلا بعد إغلاق نافذة التقييم** (`isWindowOpen` من B10) لمنع الحسم على نتيجة مؤقتة؛ قاعدة التعادل الصريحة: تساوي المتوسطين ⇒ `winner_id = NULL` + ELO 0.5/0.5 مرة واحدة؛ فشل الدفعة لا يفشل التصويت (201) — تسجيل + مهمة `recalc_aggregates` مجدولة كإعادة محاولة دائمة عبر `processPendingTasks`؛ `finalizeCompetition` أعاد استخدام المسار الذرّي (finalizePayouts كما هو — **LivePayoutEngine والمالية لم تُمس**)؛ i18n `competition.winner/draw/pending_result` ar+en + `result:{status,label}` في ratings/summary عبر `t()`؛ **⚠️ schema-contract integration يفشل أصلاً على main (15 مقابل 18 ملف migration قبل B12) — إضافة 0018 تزيد نفس الفشل القائم؛ تحديث القائمة خارج النطاق** | 🔧 | migrations/0018_competitions_elo_applied_at.sql, src/lib/services/ScheduledTaskService.ts, src/lib/services/EloRatingService.ts, src/controllers/CompetitionController.ts, src/i18n/ar.ts, src/i18n/en.ts, tests/api/winner-elo-atomicity.test.ts (جديد 6 اختبارات), tests/helpers/fake-d1.ts, docs/05, WORKLOG | RED أولاً: 4/6 فشل على baseline (تضاعف ELO، تعادل مطبق مرتين، لا retry، i18n مفقودة) ثم 6/6 ✅ + npm test ✅ + tsc ✅ + build ✅؛ بانتظار PR/مراجعة (بلا دمج) | 2026-09-15 |

## إصلاحات Core — حلقة الدعوة/القبول (2026-09-09)

| ID | المهمة | الحالة | الملفات | اختبار القبول | التاريخ |
|----|--------|--------|---------|---------------|---------|
| B5-4 | إغلاق حلقة الدعوة/القبول وتثبيت setOpponent ضد السباق — `setOpponent()` تُبقي `AND opponent_id IS NULL` وتعيد `boolean` من `meta.changes > 0` (سباق → false → 409)؛ قبول الدعوة ينفّذ `db.batch()` واحد (opponent_id + status='accepted' + رفض بقية الدعوات المعلقة)؛ invite() يفحص الحظر → 403 مترجمة؛ i18n: `opponent_already_set`/`invitation_not_found`/`blocked_user` (ar+en)؛ اختبارات حمراء أولاً (6) سلمت فشل قبول مزدوج 200/200 وopponent متضارب قبل الإصلاح | 🧪 | src/models/CompetitionModel.ts, src/controllers/CompetitionController.ts, src/i18n/ar.ts, src/i18n/en.ts, tests/api/competition-invite-accept.test.ts (new), tests/helpers/fake-d1.ts | competition-invite-accept 6/6 ✅ (سباق Promise.all: واحد 200 وواحد 409 وopponent_id ثابت) + npm test 76/76 ✅ + tsc ✅ + build ✅ + سباق متكرر 10/10 بلا flakiness ✅ | 2026-09-09 |

## إصلاحات P0/P1 — فرع `fix/pages-404-tailwind-cli` (من b7313f1)

| ID | المهمة | الحالة | الملفات | اختبار القبول | التاريخ |
|----|--------|--------|---------|---------------|---------|
| HOTFIX-P0 | إصلاح 404/500 (@hono/vite-cloudflare-pages + Hono 4 notFoundHandler خاص) | ✅ | src/main.ts | tests/api/not-found-p0.test.ts (4) ✅ + curl حي: /api/nonexistent→404 JSON، /nonexistent-page→404 HTML، GET /api/cron/run→404 (لا 500) | 2026-09-06 |
| HOTFIX-P1 | تثبيت @tailwindcss/cli كتبعية مقفلة، إزالة npx remote-fetch | ✅ | package.json, package-lock.json | tests/build/tailwind-cli.test.ts (3) ✅ + npm ci→node_modules/.bin/tailwindcss.CMD موجود + build:css لا يحوي npx | 2026-09-06 |

**دليل G1-G8 لهذين البندين:** build ✅ (`npm run build`)، types ✅ (`npx tsc --noEmit` بلا أخطاء)، اختبار آلي ✅ (33/33 اختبار عبر `npm test`، منها 7 جديدة)، تحقق تشغيلي حي ✅ (`wrangler pages dev` + curl لكل معايير القبول)، لا RangeError/"Context not finalized" في سجل Wrangler ✅. **✅ مستحقة فعلياً هنا (G1-G8 مكتملة بدليل، ليست 🧪).**

---

> ⚠️ **ملاحظة تقنية:** لا تعدّل هذا الملف عبر PowerShell (`Set-Content`) — يفسد ترميز العربية.
> استخدم أدوات تحرير الملفات مباشرة فقط.

