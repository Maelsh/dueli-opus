
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

