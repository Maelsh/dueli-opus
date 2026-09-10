# 📊 PLAN-STATUS — لوحة حالة المهام

> ⚠️ **تحذير حاكم (2026-09-05):** `docs/11-DEFINITION-OF-DONE.md` وجد أن علامة "✅
> مكتملة ومختبرة" أدناه غير دقيقة لمعظم البنود — لا يوجد اختبار آلي واحد في المشروع
> (`docs/13-TEST-STRATEGY.md`). كل `✅` تخصّ **منطقاً لا توثيقاً** يجب أن تُقرأ فعلياً
> كـ`🧪 مُتحقَّقة يدوياً فقط` حتى تُكتب لها اختبارات (`tests/`) وتجتاز G1–G8. **لم تُنفَّذ
> إعادة التصنيف الفعلية لكل سطر بعد** — هذا بند متابعة صريح، لا سهواً مخفياً.
> الرموز الصحيحة من الآن: `☐ لم تبدأ` | `🔧 جارية` | `🧪 مُتحقَّقة يدوياً (لا اختبار آلي)` | `✅ اجتازت G1–G8` | `⛔ معطلة`
> مرجع التعريفات الكاملة: `docs/COMPLETE_PROJECT_PLANS.md` (تاريخي) — مرجع البوابة الحاكمة: `docs/11-DEFINITION-OF-DONE.md`
> خارطة الطريق المصححة والأولويات الفعلية: `docs/15-ROADMAP.md`

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

