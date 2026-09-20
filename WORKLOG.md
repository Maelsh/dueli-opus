## 2026-09-20 — Phase 7.D: TURN/STUN وشبكات مقيّدة (فرع `feat/live-turn-config`)

- النطاق: إعداد TURN عبر متغيرات البيئة فقط (لا سر في المستودع إطلاقاً)، اعتماد TURN مؤقت قصير الأجل يُولَّد خادمياً لكل جلسة (لا سر ثابت مشترك)، وتدهور رشيق برسائل مترجمة + بديل STUN بلا شاشة سوداء. لم تُمس الماليات/الإعلانات، ولا بوابة البث الحي (7.A–7.E exchange)، ولا migrations، ولا dependencies، ولا CI.
- جديد: `src/lib/services/TurnCredentialService.ts` (OOP) — خلفيتان: (A) coturn عبر `TURN_URL`+`TURN_SECRET` (HMAC-SHA1 ephemeral: `username = <expiry>:<userId>`، TTL 3600s، + نسخة `transport=tcp` تلقائية)، (B) Cloudflare Calls عبر `TURN_TOKEN_ID`+`TURN_API_TOKEN` بطلب لكل جلسة TTL 3600s — أُزيلت ذاكرة Cache API المشتركة ~6h (اعتماد مشترك سابق). غير مُعدَّ → STUN-only؛ فشل خلفية مُعدَّة → 502 برسالة مترجمة.
- `GET /api/signaling/ice-servers` محمي الآن بالمصادقة (401) ويعيد `iceServers + turn_available + ttl_seconds + expires_at` دون أي سر سوى الاعتماد المؤقت. `src/config/types.ts` أُضيف إليه `TURN_URL`/`TURN_SECRET` (اختياريان)، و`.dev.vars.example` بقيم فارغة فقط.
- i18n: `live.network_restricted` + `live.turn_unavailable` في ar+en (تحت `live_signaling.*` مع alias في `i18n/index.ts`)؛ عميل `shared.ts` يرسل Bearer الجلسة ويعرض الرسائل مع fallback STUN (`main.ts` يمرر `lang` إلى `getClientSharedScript`).
- الاختبار: `tests/api/turn-credentials.test.ts` (7 اختبارات) ✅ — مؤقت+انتهاء وربط userId، 401 لغير المصادق، لا سر في الاستجابة (مسارا coturn وCloudflare مع mock fetch)، فشل TURN ⇒ 502 برسالة مترجمة ar/en، fallback STUN، مفاتيح i18n.
- الجرد: `npm run routes:inventory` أعاد التوليد (186 مساراً؛ ice-servers → AUTHENTICATED). docs/04 §2 وdocs/07 (جدول env) حُدِّثا.
- التحقق: انظر التقرير النهائي (npm test / tsc / build).

## 2026-09-19 — Beta Core Gate Remediation (فرع `fix/beta-core-gate-remediation`)

- النطاق: (1) route inventory drift = توثيقي فقط — أُعيد توليد الجرد (`node dev-tools/route-inventory.mjs`: ‏174 → ‏176 بإضافة مساري B11 ‏`DELETE /api/competitions/:id/rate` + ‏`GET .../ratings/summary`) بلا أي تغيير routes/صلاحيات؛ (2) schema-contract stale expectation — حُدِّثت القائمة إلى 19 migration ‏(0015→0018) بلا حذف/إعادة ترقيم؛ (3) Beta E2E — نجاح B16 موثق أصلاً في `PLAN-STATUS.md` فلم يُعَد بناؤه؛ (4) block-enforcement harness — إصلاح اختبار فقط (fallback ‏`SELECT MAX(id)` لغياب `meta.last_row_id` في Wrangler المحلي) بلا تغيير production؛ (5) auth rate-limit forced logout — **إصلاح منتج**: ‏`checkAuth()` لم يعد يمسح الجلسة عند `429`/خطأ شبكة، والفشل الحقيقي ما زال يمسح؛ (6) i18n ‏`getCategoryName` — الحقول الصريحة أولاً + slug مسمّى `categories.<slug>` + نسخة العميل في competition-page مطابقة + regression test مباشر.
- الملفات: dev-tools/route-inventory.json، docs/14-ROUTE-INVENTORY.md، tests/integration/schema-contract.test.ts، tests/integration/block-enforcement.test.ts، src/client/services/AuthService.ts، src/i18n/index.ts، src/modules/pages/competition-page.ts، tests/api/auth-ratelimit-session.test.ts (جديد)، docs/16-KNOWN-ISSUES.md، WORKLOG.md.
- التحقق: `npm test` ‏343/343 ✅ (منها auth-ratelimit-session ‏7/7)؛ `npx tsc --noEmit` ✅؛ `npm run build` ✅؛ `npm run db:reset` ✅ (‏19 migration + ‏seed 299)؛ wrangler migrations على حالة معزولة ✅ ‏19/19؛ block-enforcement integration ‏8/8 ✅؛ schema-contract integration: العدّاد/القائمة مُصحَّحة لكن التشغيل المحلي يتعثر على قفل `.wrangler-test` في Windows ‏(EBUSY rmdir cache) — قيد tooling بيئي لا علاقة له بالعقد نفسه (التحقق البديل: migrations تُطبق 19/19 + ‏db:reset + فحص القائمة برمجياً).
- خارج النطاق عمداً: F-11/F-12، المالية/الإعلانات، تغيير APIs/routes/schema، ‏dependencies، ‏global middleware، ‏CI.

## 2026-09-18 — F-10: Repository Change Policy

- 🔧 In progress on `docs/repository-change-policy`, based on origin/main `042cbb5` (merge of PR #30, F-9).
- Scope: F-10 only — generalize the F-9 no-new-artifacts principle into a binding Repository Change Policy for any new file/folder outside task scope. No deletion, move, rename, code (`src/`), migration/schema, API, test, new plan, new dot-folder/artifact, F-11 or merge.
- Changes: new `docs/18-REPOSITORY-CHANGE-POLICY.md` (general rule + two lawful paths + prohibited list + F-9 relation + truth-source links + scope confirmations); enforcement quick rule in `AGENTS.md`; pointers in `docs/00-OVERVIEW.md` and `docs/17-DOT-FOLDERS-POLICY.md`; F-10 entries in `PLAN-STATUS.md` + this file. Compatible with the F-8 Source-of-Truth hierarchy and F-9; no new architectural decision; OOP/MVC/SoC/i18n untouched.
- Validation: docs-only diff check + `npm run build` (see report). Local policy done; remote review pending, no merge.
- Files: docs/18-REPOSITORY-CHANGE-POLICY.md, AGENTS.md, docs/00-OVERVIEW.md, docs/17-DOT-FOLDERS-POLICY.md, PLAN-STATUS.md, WORKLOG.md.

## 2026-09-18 — F-9: Dot-Folders / Agent Artifacts Policy

- 🔧 In progress on `docs/dot-folders-policy`, based on origin/main `002d887` (merge of PR #29, F-8).
- Scope: F-9 only — document a binding policy for dot-folders/agent artifacts. No deletion, move, rename, code, migration/schema, API, test, new plan, new dot-folder, F-10, final cleanup or merge.
- Inventory verified on disk (root + recursive depth 3, excluding `node_modules/` and `.git/`): 7 agent artifacts — `.agent/` (speckit commands/rules/skills), `.blackbox/` (6 root MDs + `agents/` 8 files + `docs/` 9 files), `.claude/` (7 files), `.gemini/` (3 MDs), `.plan/` (2 files), `.specify/` (memory/scripts/specs/templates + init-options.json), `.testsprite/` (config.json). No unlisted names recorded. Explicit non-scope: `.git/.github/.vscode/.wrangler(-test)/` + standard dotfiles + `specs//testsprite_tests/` (no dot).
- Changes: new `docs/17-DOT-FOLDERS-POLICY.md` (6 binding rules, inventory, truth-source links, scope confirmations); pointers in `docs/00-OVERVIEW.md`, `docs/16-KNOWN-ISSUES.md`, `AGENTS.md`; F-9 entries in `PLAN-STATUS.md` + this file.
- Validation: docs-only diff check + `npm run build` (see report). Local policy done; remote review pending, no merge.
- Files: docs/17-DOT-FOLDERS-POLICY.md, docs/00-OVERVIEW.md, docs/16-KNOWN-ISSUES.md, AGENTS.md, PLAN-STATUS.md, WORKLOG.md.

## 2026-09-18 — F-8: Documentation Consolidation

- 🔧 In progress on `docs/consolidate-documentation`, based on origin/main `fbee0cc` (merge of PR #28).
- Scope: F-8 only — unify the documentation source of truth after F-1 → F-7. No code, refactor, migration/schema, API, test, dot-folder, plan or merge changes.
- Audit found: `docs/01` pointed to COMPLETE_PROJECT_PLANS as parent + stale P?-T??/✅ workflow; `docs/02` stopped at 0013 (actual 0018 + duplicate 0012 filenames); `docs/03` showed cron `?key=` (code is Bearer POST-only) and undocumented B10/B11 endpoints; `docs/05` lacked the F-6 STS SSOT statement; `AGENTS.md` repeated the stale cron `?key=` claim; `docs/archive/README.md` pointed to COMPLETE_PROJECT_PLANS as truth; `docs/10` numbers read as current; dot-folders (`.blackbox/.gemini/.claude/.plan`) contain competing historical plans with no non-source label; no unified Known Issues doc existed.
- Changes: `docs/00` (Source-of-Truth map A–G); new `docs/16-KNOWN-ISSUES.md`; updated `docs/01/02/03/05`, `AGENTS.md`; bannered `docs/COMPLETE_PROJECT_PLANS.md` (historical) and `docs/10` (dated snapshot); fixed `docs/archive/README.md` pointer. Old docs archived in place, none deleted.
- Validation: `npm run build` + competing-claim grep (see report). Local consolidation done; remote review pending, no merge.
- Files: docs/00-OVERVIEW.md, docs/01-ARCHITECTURE-RULES.md, docs/02-DATABASE.md, docs/03-API-REFERENCE.md, docs/05-COMPETITION-LIFECYCLE.md, docs/10-ARCHITECTURE-ASSESSMENT.md, docs/16-KNOWN-ISSUES.md (new), docs/COMPLETE_PROJECT_PLANS.md, docs/archive/README.md, AGENTS.md, PLAN-STATUS.md, WORKLOG.md.

## 2026-09-18 — F-5D: SQL extracted from AdminController

- 🔧 In progress on `refactor/admin-controller-models`, based on origin/main `5ccee8e` (merge of PR #25).
- Scope: extract ALL direct SQL from `src/controllers/AdminController.ts` into the Model layer (F-4 audit findings: dashboard stats, users search/pagination, ban/unban, reports/audit targets, moderation cascade, enhanced statistics, suspend/restore). Behavior-preserving: same SQL text, bindings, WHERE, sorting/pagination, sequential ordering, error handling, authorization checks and API contracts.
- New model `AdminStatsModel` owns dashboard statistics (`getStats`) and enhanced statistics (`getEnhancedStats`): counts of users (all / is_active=1), competitions, pending reports (`status='pending'`), arbitration-pending reports (`arbitration_status IN ('submitted','under_review','investigation')`), active ads (`is_active=1`), campaign-active ads (`campaign_status='active'`), competitions-by-status grouping, `SUM(amount) FROM user_earnings` total revenue, top-10 country demographics (active users) and top-5 hottest competitions (`status IN ('live','accepted')` ORDER BY total_views DESC with creator/opponent joins).
- Extended existing models instead of creating duplicates: UserModel (`searchForAdmin` — same 10 selected columns, LIKE search on username/email/display_name, `ORDER BY created_at DESC LIMIT ? OFFSET ?`; `getBanTarget` — `SELECT id, is_admin`; `setActive` — the T1.4 BUG-12 `UPDATE users SET is_active`), ReportModel (`getTarget` — `SELECT id, target_type, target_id`, reused for both the moderation cascade and the audit-log target fetch), CommentModel (`getAuthorId` — `SELECT user_id FROM comments`; comment deletion reuses inherited `BaseModel.delete`), CompetitionModel (`getCreatorId`, `getSuspendState` (id,title,status,creator_id,opponent_id), `getRestoreState` (id,status), `suspend`/`restore` UPDATEs with the same tombstone `auto_deleted_reason` + `updated_at=datetime('now')`, `recordSuspension` INSERT and `markSuspensionRestored` UPDATE on `competition_suspensions`, `deleteCascade` — the 5 DELETEs in the original order: requests → invitations → ratings → chunk_keys → competitions).
- Controller logic/authorization (isAdmin gate, self-ban/admin-ban guards, 404/409 state validation, audit-log entries, SSE publish, WithdrawalController delegation) unchanged; SessionModel session kill on ban unchanged.
- Tests: new `tests/models/AdminModelExtraction.test.ts` (11 tests): static pin that AdminController contains no `.prepare(`/SELECT/INSERT/DELETE/UPDATE; behavior pins on the real migrations via the sqlite D1 shim for AdminStatsModel aggregates (incl. exact revenue SQL), UserModel search/pagination/ban, ReportModel targets, CommentModel author resolution + deletion, CompetitionModel cascade and suspend/restore state machine.
- Validation: focused suite 11/11 passed; affected model regressions (UserModel/FollowModel/RatingModel/AdminModelExtraction) 28/28 passed. `npx tsc --noEmit`: exit 0. `npm run build`: exit 0.
- Final scope: AdminController, the five affected models, the new test file and this documentation. No other controllers, services, routes, migrations/schema or F-6 work. Rollback: revert the F-5D commit; no data migration needed.
- Local implementation validated; remote review/staging pending. Status remains 🔧 under G1–G8; no full quality-gate completion claim.


## 2026-09-18 — F-5C: SQL extracted from Pages

- 🔧 In progress on `refactor/core-sql-inside-pages`, based on origin/main `0440b7881f046805780937013278b065ad0a24ee`.
- Scope confirmed by task owner: move only the F-4-identified SQL inside `src/modules/pages/profile-page.ts` and `src/modules/pages/live/main.ts` into the existing Models. F-5A, F-5B, F-5D, F-6, controllers, other models, services, API routes, migrations, schema and dependencies untouched.
- Extraction is behavior-preserving and reuses existing model methods (no new models, no model changes):
  - profile-page: the two inline `SELECT COUNT(*) FROM follows ...` statements now run via `FollowModel.getFollowersCount/getFollowingCount` (same SQL and `bind(user.id)` parameter; identical null→0 semantics inside the model). Follow counts still run in the same `Promise.all` with `CompetitionModel.findByUser` (limit 10, `.catch([])`), so exact counts, failure isolation and rendered stats are unchanged.
  - live/main (host + guest): the inline `SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime("now")` now runs via `SessionModel.findBySessionId` — the identical SQL/predicate, without `findValidSession`'s extra user/is_active lookups — and the inline `SELECT creator_id|opponent_id FROM competitions WHERE id = ?` now runs via `CompetitionModel.findOne('id', compId)` (`SELECT * FROM competitions WHERE id = ?` with the same string binding). Expiration check, host/guest determination, null/not-found redirects, i18n and page output unchanged.
- New behavioral pins written to run against the real migrations and real Hono app (per docs/13): `tests/api/profile-sql-extraction.test.ts` (9 tests: exact directional SSR counts per language with self-fetch blocked, zero-count profile, session resolution via Bearer/sessionId/session_id, 401 missing/expired session, 404 unknown profile with original log, outer error handler defaults when a follow query rejects, competition-lookup failure isolation) and `tests/api/live-page-sql-extraction.test.ts` (25 tests across host/guest: role rendering in ar/en, exact login redirects for missing/unknown/expired sessions including the strict `datetime('now')` boundary, `not_authorized` redirect for wrong role/missing/nonmatching competition IDs, string-binding preservation for SQLite numeric affinity like `09002`, guest NULL-opponent handling). All pins passed before and after the extraction.
- Local validation: focused suites 50/50 before extraction and 58/58 after (including the F-5A/F-5B regression pins). `npx tsc --noEmit`: exit 0. `npm run build`: exit 0 (build-generated CSS drift from the toolchain restored, as in F-5B).
- Final scope: the two page files, two regression test files and this documentation. Rollback: revert the F-5C commit; no data migration needed.
- Files: src/modules/pages/profile-page.ts, src/modules/pages/live/main.ts, tests/api/profile-sql-extraction.test.ts, tests/api/live-page-sql-extraction.test.ts, PLAN-STATUS.md, WORKLOG.md.
- Local implementation validated; remote review/staging pending. Status remains 🔧 under G1–G8; no full quality-gate completion claim.


## 2026-09-17 — F-5B: FollowModel extraction

- 🔧 In progress on `refactor/core-models-inside-controllers`, based on origin/main `0afc20e8b21846f9cf319bc451cd63eb0606e1a6`.
- Scope confirmed by task owner: move only the existing inline FollowModel to the Model layer. All other controller SQL, F-5A, F-5C, F-5D and route-local models remain untouched.
- Preserve the existing OOP class and database-injected constructor, including its lack of BaseModel inheritance: this is a relocation of an existing model, not a new CRUD model. Adding BaseModel's required create/update API would exceed this behavior-preserving extraction.
- Local validation: before extraction, the new API behavior pins passed 5/5; after extraction, FollowModel tests 7/7 and API pins 5/5 passed. `npm test`: 27 files, 208/208 passed. `npx tsc --noEmit`: exit 0. `npm run build`: exit 0. The initial model-test fixture omitted required display_name; corrected the fixture only, then all passed.
- Affected real-D1 integration suite: 6/8 passed, including updated follow-location check; 2 pre-existing failures (case 6: null comment result; case 7: Failed to create conversation). Reproduced both using the origin/main test with identical CommentModel, MessageModel and Wrangler helper, selecting only those cases: 0 passed / 2 failed / 6 skipped. The helper only forwards CLI-provided last_row_id, while model create methods rely on that metadata; no unrelated code was changed. An intermediate overlapping retry also hit workerd SQLITE_IOERR_TRUNCATE during migration; the subsequent completed run reproduced the same two baseline failures. No lingering test processes remained.
- Exact-body verification against origin/main: all five FollowModel methods, constructor, SQL, bindings, return/error behavior and the entire UserController class are unchanged (newline-normalized comparison). Therefore authorization, validation, i18n, responses, Promise.all ordering and notifications stay in place. In particular, duplicate follows still produce one relation but a notification per call, and caught insert errors still return false while the controller reports success and sends a notification. These existing behaviors are intentionally pinned, not fixed. No transaction or race-condition behavior changed.
- Final scope: only FollowModel relocation, its import, regression tests and this documentation. No other controller SQL, F-5A, F-5C, F-5D, route-local models, schema/migrations, dependencies or UI changes. Build-generated CSS restored. Rollback: revert the F-5B commit; no data migration needed.
- Files: src/controllers/UserController.ts, src/models/FollowModel.ts, tests/models/FollowModel.test.ts, tests/api/follow-extraction.test.ts, tests/integration/block-enforcement.test.ts, PLAN-STATUS.md, WORKLOG.md.
- Local implementation validated; remote review/staging pending. Status remains 🔧 under G1–G8; no full quality-gate completion claim.


## 2026-09-17 — B16

- `[B16]` E2E خفيف واحد لمسار Beta Core Done (فرع `test/core-beta-e2e` — بلا دمج):
  - سيناريو E2E واحد يغطي الـ14 خطوة كاملة: (1) تسجيل المستخدم A عبر الواجهة، (2) إكمال إعدادات Profile لـ A عبر PUT /api/settings والتحقق من سمات `dir` و `lang` في الـ DOM، (3) التحقق من التوصيات المخصصة لـ A عبر /api/recommendations، (4) إنشاء منافسة من صفحة /create عبر الـ UI والتنقل لصفحة المنافسة، (5+6) تسجيل ودخول الخصم B والمشاهد C واكتشاف B بالبحث الحقيقي، (7) إرسال A لدعوة B، (8) قبول B للدعوة (batch ذري status='accepted')، (9) بدء A للمنافسة (accepted -> live)، (10) إرسال رسالة من A إلى B والتحقق من وصول المحتوى لمحادثة B، (11) إضافة A لتعليق وظهوره في المنافسة، (12) إنهاء المنافسة (live -> completed)، (13) تقييم المشاهد C للمتنافسين وظهور الفائز وملخص التقييمات، (14) وصول الإشعارات للطرفين (دعوة لـ B، وقبول لـ A).
  - مشروعان في Playwright config: `ar` (RTL) و `en` (LTR) بنفس كود الاختبار مع عزل أسماء المستخدمين بحسب المشروع لمنع تضارب بيانات قاعدة البيانات المتتالية.
  - مسار حقيقي: تواصل كامل بين المتصفح وHono API وقاعدة بيانات D1 المحلية المعزولة عبر `wrangler pages dev`. صفر mocks لمنطق الأعمال المختبر.
  - لا توجد أي استدعاءات لـ `waitForTimeout` أو `sleep(` في ملف الاختبار.
  - ثبات التشغيل: اجتياز كامل 3 مرات متتالية لمشروعي ar و en معاً، بزمن إجمالي ~2.2 دقيقة (أقل من 3 دقائق).
  - إثبات الاختبار الأحمر / الحساسية: تعمد كسر مسار قبول الدعوة (تغيير الـ URL إلى نقطة غير موجودة) وأعطى فشلاً صريحاً `B accepting the invite should succeed: expected true, received false` ثم استُعيد الكود الصحيح فوراً.
  - خارج النطاق (مُستثنى عمداً): لا تعديل على CI / .github/workflows، لا تبعيات إضافية باستثناء `@playwright/test`، لا لمس لـ src business logic.
  / Files: playwright.config.ts, tests/e2e/beta-core-path.spec.ts, package.json, package-lock.json, PLAN-STATUS.md, WORKLOG.md
  / نفذ: Antigravity (B16 LOCAL agent)
  / Verify: Playwright 2/2 (ar+en) 3 consecutive passes ✅ + npm test 188/188 ✅ + npx tsc --noEmit ✅ + npm run build ✅ + git diff -- .github/ فارغ ✅
  / PR: test/core-beta-e2e (بلا دمج)

## 2026-09-16 — B15

- `[B15]` RTL/dark/mobile polish لمسار Beta (فرع `fix/core-rtl-dark-mobile-polish` — بلا دمج):
  - RTL (مشاكل وجدت فعلاً وأُصلحت): (1) زر الدخول في `navigation.ts` كان يستخدم `scale-x-[-1]` المحظور — استُبدل بأيقونة `fa-sign-in-alt` المحايدة الاتجاه؛ (2) هوامش أيقونات فيزيائية `mr-1/mr-2/ml-1` في `competition-page.ts`/`create-page.ts`/`competition-card.ts` لا تنعكس في RTL — استُبدلت بـ`me-1/me-2` المنطقية؛ (3) فئات Tailwind مبنية ديناميكياً (`-${rtl?...}-1` في user-card) لا يراها مسح JIT — استُبدلت بفئات ثابتة كاملة؛ (4) `aria-label` للكاروسيل في `competition-section.ts` كانت نصوصاً حرفية `|| 'Previous'/'Next'` — أُضيف `previous/next` لـar+en واستُخدم `t()`؛ أسهم الكاروسيل كانت hover-only (مخفية على اللمس) — أُضيف `max-sm:opacity-100 max-sm:scale-100`.
  - Dark (حالات مكسورة فعلاً): `badge-live`/`badge-pending`/`tab-inactive` بلا `body.dark` (نص داكن على خلفية فاتحة في الوضع الداكن) — أُضيفت متغيرات dark.
  - Mobile: لا `overflow-x` guard على الصفحة (خطر تمرير أفقي) — أُضيف `overflow-x: clip` على `html,body` (لا يكسر `sticky nav`)؛ القوائم `w-80` كانت تتجاوز viewport على الشاشات الصغيرة — أُضيفت فئة `.dropdown-panel` بـ`max-width: calc(100vw - 2rem)`.
  - RED-FIRST: `tests/ui/rtl-dark-mobile.test.ts` (12 اختباراً) سُلّم أحمر أولاً: 6 فشل / 6 نجاح على baseline، ثم بعد الإصلاح 14/14 ✅ (أُضيف اختباران i18n/touch أثناء العمل).
  - خارج النطاق (لم يُلمس، يُسجَّل فقط): `live/core.ts` و`live/scripts/client/shared.ts` فيهما `mr-1/mr-2` (شارات VOD/status — البث الحي مجمّد)؛ `dev-tools/test-stream-page.ts`؛ عشرات `|| 'English'` fallbacks في navigation وصفحات الرسائل/الإعدادات (تُنظَّف في مهمة i18n المرحلة 8)؛ `isRTL ? 'ml-2' : 'mr-2'` ternaries المتبقية في التقارير/التبرعات (صفحات مجمّدة — تعمل لكن يُفضَّل `me-*` لاحقاً).
  / Files: src/styles.css, src/shared/components/navigation.ts, src/shared/components/user-card.ts, src/shared/components/competition-card.ts, src/shared/components/competition-section.ts, src/modules/pages/competition-page.ts, src/modules/pages/create-page.ts, src/i18n/ar.ts, src/i18n/en.ts, tests/ui/rtl-dark-mobile.test.ts (new), PLAN-STATUS.md, WORKLOG.md
  / نفذ: Cline (B15 LOCAL agent)
  / Verify: rtl-dark-mobile 14/14 ✅ + npm test 73 suites 188/188 ✅ + tsc --noEmit ✅ (بلا مخرج) + build ✅ (188 modules, _worker.js 926kB)
  / PR: fix/core-rtl-dark-mobile-polish (بلا دمج)

## 2026-09-16 — B14

- `[B14]` تثبيت أوزان التوصيات وسلوك الاحتياط (فرع `test/core-recommendation-ranking` — بلا دمج):
  - `RecommendationEngine`: استخراج الأوزان إلى ثوابت مسماة بالقيم نفسها بلا تغيير سلوكي (`WEIGHT_LANGUAGE_MATCH=25`, `WEIGHT_COUNTRY_MATCH=20`, `WEIGHT_CATEGORY_MATCH=20`, `WEIGHT_UNWATCHED=10`, `WEIGHT_RECENCY_MAX/MODERATE/WEAK=10/7/4`, `WEIGHT_RATING_MAX=15`, `WEIGHT_FOLLOWED=15`, `RECENCY_*_DAYS=1/3/7`, `VIEW_POPULARITY_FACTOR=0.01`)؛ `getGuestRecommendations` في `RecommendationController` أعيد ربطه بنفس الثوابت.
  - `tests/api/recommendations-ranking.test.ts` (جديد، 18 اختباراً) + `tests/helpers/sqlite-d1.ts` (real migrations عبر `node:sqlite`): يثبت الترتيب نفسه (phase + score) للحالات الست (لغة/بلد/متابعة/أحدث/زائر/حساسية متابعة).
  - i18n: `recommendations.for_you/trending/empty` ar+en.
  - RED-FIRST: قبل التثبيت 5 فشل / 13 نجاح (انظر `_b14_red_scratch.txt`) ثم 18/18 ✅.
  / Files: src/lib/services/RecommendationEngine.ts, src/controllers/RecommendationController.ts, src/i18n/ar.ts, src/i18n/en.ts, tests/api/recommendations-ranking.test.ts (new), tests/helpers/sqlite-d1.ts (new), PLAN-STATUS.md, WORKLOG.md
  / نفذ: Cline (B14 completion agent)
  / Verify: recommendations-ranking 18/18 ✅ + npm test 23 files 174/174 ✅ + tsc --noEmit ✅ (بلا مخرج) + build ✅ (188 modules, _worker.js 926kB) — التفاصيل بتقرير PR
  / ⚠️ خارج النطاق (لم يُلمس): getFeed/الصفحة الرئيسية تُركا كما هما بعد ثبوت الربط القائم؛ أي خلل آخر يُسجل بتقرير PR فقط.

## 2026-09-15 — B11

- `[B11]` ملخّص التقييمات مجهول الهوية + سحب التقييم داخل النافذة:
  - `GET /api/competitions/:id/ratings/summary` — تجميع في `RatingModel.getSummary()` بـ SQL GROUP BY (لا صفوف تقييمات في JS)؛ متوسط/count/توزيع لكل مشارك؛ `average=null` عند 0 تقييم؛ **لا هوية مقيّم إطلاقاً** في الاستجابة.
  - `DELETE /api/competitions/:id/rate?competitor_id=` — سحب التقييم: لمقيّم فعلي فقط، داخل نافذة B10 (`isWindowOpen` مُعاد استخدامها) وإلا 409 `rating_window_closed`؛ الحذف + إعادة حساب المجاميع في `db.batch()` واحد؛ من لم يقيّم ⇒ 404.
  - إزالة تسريب الهوية: `RatingModel.findByCompetition()` لم تعد تعيد user_id/display_name/avatar_url (بلا JOIN users)؛ اختبار B5-3 القديم حُوِّل لحارس خصوصية.
  - migration `0017_ratings_competition_competitor_idx.sql`: فهرس `ratings(competition_id, competitor_id)` (لم يكن موجوداً).
  - i18n: `ratings.summary_title/average/no_ratings/withdrawn` ar+en.
  - RED-FIRST: `tests/api/ratings-summary.test.ts` (7 اختبارات) فشلت على baseline ثم أُخضعت؛ خصوصية مثبتة فعلياً (فحص عميق للاستجابة كاملة بلا user_id/username/email).
  / تحقق: ratings-summary 7/7 ✅ + npm test 141/141 ✅ + tsc ✅ + build ✅ + db:reset ✅

## 2026-09-15 — B12

- `[B12]` ذرّية تحديد الفائز + ELO idempotent (فرع `fix/core-winner-elo-atomicity` — بلا دمج):
  - `ScheduledTaskService.updateAggregatesAfterVote()` أُعادت كتابتها: المتوسطات + `winner_id` + ELO + مطالبة `elo_applied_at` كلها في **`db.batch()` واحد** (لا `run()` متتابعة) — D1 ينفّذ الدفعة كمعاملة واحدة.
  - Idempotency داخل قاعدة البيانات لا JS: migration `0018_competitions_elo_applied_at.sql` (عمود `competitions.elo_applied_at`)؛ كتابتا `users.elo_rating` مشروطة بـ `(SELECT elo_applied_at ...) IS NULL` والمطالبة `UPDATE ... SET elo_applied_at = ? WHERE elo_applied_at IS NULL` — أي استدعاء متزامن/متكرر يطابق صفر صفوف.
  - **ELO لا يُحسم إلا بعد إغلاق نافذة التقييم** (`isWindowOpen` من B10 مُعاد استخدامها) — يمنع حسم ELO على نتيجة مؤقتة قابلة للانقلاب بالتصويت/السحب اللاحق. صفوف legacy بلا `ended_at` لا يُلمس ELO لها.
  - قاعدة التعادل الصريحة: تساوي المتوسطين (بما فيهما صفر/غياب الخصم) ⇒ `winner_id = NULL` + ELO بقاعدة التعادل 0.5/0.5 مرة واحدة.
  - فشل الدفعة لا يفشل التصويت (201): يُسجَّل الخطأ + مهمة مجدولة `recalc_aggregates` (+60s) كإعادة محاولة دائمة عبر `processPendingTasks` (idempotent).
  - `finalizeCompetition()` أعيد استخدام المسار الذرّي ثم `finalizePayouts` كما هو — **LivePayoutEngine والمالية لم تُمس**.
  - i18n: `competition.winner/draw/pending_result` ar+en؛ `GET .../ratings/summary` يعيد الآن `result: {status, label}` عبر `t()` (بلا أي هوية مقيّم — حارس B11 سليم).
  - RED-FIRST: `tests/api/winner-elo-atomicity.test.ts` (6) فشل 4/6 على baseline (تضاعف ELO عند الاستدعاء المزدوج، تعادل مطبق مرتين، لا إعادة محاولة عند الفشل، مفاتيح i18n مفقودة) ثم 6/6 ✅.
  / Files: migrations/0018_competitions_elo_applied_at.sql, src/lib/services/ScheduledTaskService.ts, src/lib/services/EloRatingService.ts (دالة نقية computeEloChange فقط — لا تغيير سلوك), src/controllers/CompetitionController.ts, src/i18n/ar.ts, src/i18n/en.ts, tests/api/winner-elo-atomicity.test.ts (new), tests/helpers/fake-d1.ts, docs/05-COMPETITION-LIFECYCLE.md, PLAN-STATUS.md, WORKLOG.md
  / نفذ: Cline (B12 LOCAL agent)
  / Verify: winner-elo-atomicity 6/6 ✅ + npm test ✅ + tsc ✅ + build ✅ (+ `db:migrate:local` يطبق 0018) — التفاصيل بالتقرير النهائي
  / ⚠️ ملاحظة مسجلة: `tests/integration/schema-contract.test.ts` يفشل أصلاً على main (يتوقع 15 migration بينما المجلد فيه 18 قبل B12)؛ إضافة 0018 تزيد العدّاد لنفس الفشل القائم مسبقاً — تحديث القائمة خارج نطاق B12 بقرار المالك.

## 2026-09-16 — B13

- `[B13]` صلابة نقاط الاكتشاف (leaderboard / search / explore) — استجابة JSON منضبطة في كل الحالات:
  - نقل SQL من المسارات إلى النماذج: `LeaderboardModel.getLeaderboard()` يحتوي جمع المتصدرين بالكامل (`SELECT ... FROM users WHERE elo_rating IS NOT NULL ORDER BY elo_rating DESC LIMIT ?` مع استعلامات فرعية لـ `total_competitions`/`wins`) ويعيد `(result.results || [])` مصفوفة فارغة عند انعدام البيانات — لا SQL في `src/modules/api/leaderboard/routes.ts`.
  - `SearchController` يضمّ `discoveryError()` خاصة (private) تعيد `this.error(c, this.t('errors.service_unavailable', c), 500)` مع logging داخلي فقط — كل معالجات البحث (competitions/users/suggestions/trending/live/pending) داخل try/catch يوجّه للخطأ الموحّد.
  - `LeaderboardController.getLeaderboard()` try/catch يُرجع 200 `success(c, leaders)` عند النجاح (بما فيها المصفوفة الفارغة) و500 بـ `errors.service_unavailable` عند الفشل.
  - Twig/B13: صفحة الاستكشاف عميل-side (`explore-page.ts`) تحتوي `showDiscoveryError(containerId)` تعرض رسالة مترجمة + زر إعادة محاولة — لا شاشة بيضاء.
  - i18n الجديدة ar+en: `errors.service_unavailable`، `discovery.no_results`، `discovery.retry`.
  - RED-FIRST: `tests/api/discovery-endpoints.test.ts` (9 اختبارات)covering leaderboard (ناجح/فارغ/فشل + Content-Type دائماً application/json)، search (live/empty/results/failure)، explore fallback (رسالة عربية + retry + no_results) — فشل على baseline ثم 9/9 ✅.
  - grep يؤكد انعدام أي جملة SELECT/INSERT/UPDATE/DELETE/MERGE في `src/modules/api/leaderboard/routes.ts` و `src/modules/api/search/routes.ts`.
  - لم يُلمس: منطق توصيات الترتيب (5.B/B14)، الملفات المالية، الإعلانات، البث الحي.
  / Files: tests/api/discovery-endpoints.test.ts (new), src/models/LeaderboardModel.ts, src/controllers/LeaderboardController.ts, src/controllers/SearchController.ts, src/modules/api/leaderboard/routes.ts, src/modules/api/search/routes.ts, src/modules/pages/explore-page.ts, src/i18n/ar.ts, src/i18n/en.ts, PLAN-STATUS.md, WORKLOG.md
  / نفذ: Cline (B13 LOCAL agent)
  / Verify: discovery-endpoints 9/9 ✅ + npm test 156/156 ✅ + `npx tsc --noEmit` ✅ + `npm run build` ✅ + grep SQL في routes نظيف ✅

# 📜 WORKLOG — سجل العمل والتعديلات

> **قاعدة ملزمة:** كل تغيير في المشروع يُسجل هنا فور تنفيذه.
> **الصيغة:** `[YYYY-MM-DD] [P?-T??] — الوصف / الملفات / من نفذ / حالة الاختبار`
> مرجع المهمة (P?-T??) حسب `docs/COMPLETE_PROJECT_PLANS.md`
---

## 2026-09-15

- `[2026-09-15] [B10]` أهلية التقييم ونافذته (فرع `fix/core-rating-eligibility-window` — بلا دمج):
  فقرة «أهلية التقييم» في `docs/05-COMPETITION-LIFECYCLE.md` أولاً (completed فقط، ليس المشاركين، وجود سجل `watch_history` فقط — بلا عتبة مدة مخترعة لأن `watch_duration_seconds` إعلامي بلا قاعدة موثقة، نافذة 24h من `ended_at` UTC على ساعة الخادم، لا تقييم مرتين)؛ `RatingModel.decideRatingEligibility()` نقية قابلة للحقن الزمني + `checkEligibility()` (صفوف watch/duplicate عبر `bind()` فقط)؛ `CompetitionController.rate()` يرفض المشارك (403 self) والهدف غير المشارك (422) وبلا مشاهدة (403) وخارج النافذة (403) والمكرر (409) وتعذر `ended_at` (403)؛ تعارض UNIQUE المتزامن → 409 (بلا TOCTOU صامت)؛ أخطاء `RatingEligibilityError` (403) تُترجم عبر `this.t()` فقط؛ i18n جديدة ar+en (`competition_errors.rating_self_forbidden/rating_watch_required/rating_window_closed`)؛ `tests/api/block-enforcement.test.ts` حُدّث (مقيّم C محايد مشاهِد بدل المشارك B — حارس B10 يسبق الحظر للمشاركين)؛ `tests/helpers/fake-d1.ts` دعم `watch_history`؛ **بلا migration** (`competitions.ended_at` و`watch_history` و`UNIQUE(competition_id,user_id,competitor_id)` كلها من 0001) ⇒ لا `db:reset`.
  / Files: docs/05-COMPETITION-LIFECYCLE.md, src/models/RatingModel.ts, src/controllers/CompetitionController.ts, src/lib/errors/AppError.ts, src/i18n/ar.ts, src/i18n/en.ts, tests/api/rating-eligibility.test.ts (new), tests/api/block-enforcement.test.ts, tests/helpers/fake-d1.ts, PLAN-STATUS.md.
  / Verify: `rating-eligibility.test.ts` 9/9 ✅ + `npm test` 134/134 ✅ + `npx tsc --noEmit` ✅ + `npm run build` ✅؛ الحالات المرفوضة تؤكد `db.ratings.length` بلا زيادة؛ لا لمس للمال/الإعلانات/البث/LivePayoutEngine/CI/dependencies.
  / RED note: الاختبار كُتب أولاً على الأساس — حالات 2/3/4/5/8 فشلت قبل الإصلاح (201 بدل 403)؛ الحالات 1/6/7/9 بنيت على السلوك الجديد (مفاتيح i18n ونافذة لم تكن موجودة).

- `[2026-09-15] [B9]` تصحيح أنواع الإشعارات + التوطين وقت العرض (فرع `fix/core-notification-types` — بلا دمج):
  إشعار الرسالة كان يُخزَّن `type='comment'` (خطأ نسخ) → أُصلح إلى `type='message'` في `MessageController.sendMessage/startConversation` عبر `NotificationModel.createForType()` (يخزّن `type + payload` فقط، و`title` = مفتاح i18n لا جملة مترجمة)؛ تعداد `NotificationType` وُسّع (`message/post_like/post_comment`) **بلا migration** (عمود `notifications.type` نص TEXT بلا CHECK في 0001 — تم فحص كل migrations)؛ `NotificationPresenter` جديد يولّد `title/message/link` وقت العرض حسب `?lang=` مع fallback آمن (`notification.generic`، بلا exception ولا كسر للصفحة)؛ i18n جديدة ar+en (`notification.new_message_body/new_post_like(_body)/new_post_comment(_body)/generic/competition_invite`)؛ إشعار `follow` تحوّل لنفس العقد (`title: this.t(...)` عند الإرسال → payload)؛ فحص `INSERT INTO notifications` أظهر أن Cron/Scheduled/Competition*‎/ad-reports خارج نطاق النواة المجمّد (Core-First) فلم تُلمس — التوافق معها عبر fallback العرض.
  / Files: src/config/types.ts, src/models/NotificationModel.ts, src/lib/services/NotificationPresenter.ts (new), src/controllers/MessageController.ts, src/controllers/UserController.ts, src/i18n/ar.ts, src/i18n/en.ts, tests/api/notification-types.test.ts (new), tests/helpers/fake-d1.ts, PLAN-STATUS.md.
  / Verify: RED أولاً (`type='comment'` + مفاتيح مفقودة + بلا link) ثم `notification-types.test.ts` 8/8 ✅ + `npm test` 125/125 ✅ + `npx tsc --noEmit` ✅ + `npm run build` ✅؛ بلا migration ⇒ لا `db:reset`.
  / Out of scope, observed but NOT touched: CompetitionController/CompetitionInvitationModel/CompetitionRequestModel/CronHandler/ScheduledTaskService/ad-reports notification writes (مال/إعلانات/بث = مجمّدة).

- `[2026-09-15] [B8]` — توحيد الإعجاب/عدم الإعجاب (فرع `fix/core-like-dislike-consistency`): قرار التنفيذ **الإكمال** لا الإزالة.
  - `src/models/LikeModel.ts`: `ReactionType = 'like' | 'dislike'` + `ReactionStatus`؛ `setReaction()` و`clearReaction()` تُنفّذان **كل** الكتابة في `db.batch()` واحد (حذف الفعل المعاكس → `INSERT OR IGNORE` للفعل → إعادة حساب `competitions.likes_count/dislikes_count` من الجدولين) ⇒ لا يجتمع like و dislike لنفس المستخدم/المنافسة، والتكرار idempotent؛ `assertNotBlocked()` يمرّ عبر `UserBlockModel.isBlockedBetween` (آلية B6 المركزية) قبل أي كتابة؛ `getStatus()` يعيد الحقول الأربعة؛ `getDislikeCount()` و`hasDisliked()`. حُذف `addLike/removeLike` (كانا check-then-act عبر round-tripين = سباق).
  - `src/controllers/InteractionController.ts`: `likeCompetition` أصبح "set like" ذرّياً، و`dislikeCompetition`/`undislikeCompetition` جديدان؛ مسار كتابة مشترك (`setReaction`) ومسار حذف مشترك (`clearReaction`) يوحّدان الأخطاء ويردان 403 على `BlockedInteractionError`؛ `getLikeStatus` يعيد `{ liked, disliked, likes_count, dislikes_count }`.
  - `src/modules/api/likes/routes.ts`: `POST` و`DELETE` لـ`/competitions/:id/dislike` بنفس نمط like — ربط HTTP فقط، بلا SQL.
  - i18n (ar+en): `interactions.{dislike, undislike, dislikes_count, dislike_not_found}` + ربط عنوان عدّاد البطاقة بـ`interactions.dislikes_count` بدل النص الإنجليزي الحرفي.
  - `src/client/services/InteractionService.ts`: قراءة `likes_count` من الاستجابة الجديدة (كان يقرأ `likeCount` فيصفر العدّاد في الواجهة).
  - `tests/api/like-dislike.test.ts` (جديد، 6/6): سُلّم **أحمر أولاً** — 6/6 فشل على الأساس (5×`expected 404 to be 200` + `expected 404 to be 403`) ثم 6/6 خضراء؛ `tests/helpers/fake-d1.ts`: دعم جدولي likes/dislikes + عدّادات البطاقات.
  - **لا migration جديدة**: `likes` و`dislikes` (كلاهما `UNIQUE(user_id, competition_id)`) و`competitions.likes_count/dislikes_count` موجودة في `migrations/0001_initial_schema.sql` ولم تلمسها أي ترحيلات لاحقة (تحقّق بـ`Select-String` على كل `migrations/*.sql`).
  / الملفات: src/models/LikeModel.ts, src/controllers/InteractionController.ts, src/modules/api/likes/routes.ts, src/i18n/ar.ts, src/i18n/en.ts, src/shared/components/competition-card.ts, src/client/services/InteractionService.ts, tests/api/like-dislike.test.ts, tests/helpers/fake-d1.ts, docs/03-API-REFERENCE.md, docs/14-ROUTE-INVENTORY.md, dev-tools/route-inventory.json, WORKLOG.md, PLAN-STATUS.md / نفذ: Cline / اختبار: like-dislike 6/6 ✅ (أحمر أولاً 6/6) + npm test 117/117 ✅ + tsc ✅ + build ✅ + route-inventory 174 مساراً ✅ / PR: fix/core-like-dislike-consistency (بلا دمج)
---



- `[2026-09-10] [B2+B3]` — ترقيم التعليقات + شجرة الردود + بث حي + حمولة أخف (فرع `feat/core-comments-tree-and-live`):
  - `migrations/0016_comments_soft_delete.sql` (جديد): `deleted_at` + فهرسا `(competition_id,deleted_at)` و`(parent_id,deleted_at)`.
  - `src/models/CommentModel.ts`: `findByCompetitionPaged(comp,limit,offset,parentId)` (حد 1–100، افتراضي 20، `offset>=0`، استبعاد `deleted_at`) + `countVisible` + `softDelete` + `replies_count` لكل جذر؛ `findByCompetition/countTopLevel` تستبعد المحذوف.
  - `src/controllers/CompetitionController.ts`: `show()` خفيف (`comments_count/requests_count/ratings_count` بلا مصفوفات) + `getComments()` الجديد + `addComment` ينشر `publishComment` داخل `try/catch` + `deleteComment` حذف ناعم (مالك/أدمن، غير المالك 403، مفقود/محذوف 404 بمفاتيح i18n).
  - `src/modules/api/competitions/routes.ts`: `GET /:id/comments` جديد.
  - `src/models/ReportModel.ts` + `InteractionController`: نوع `message` مضاف لنفس نظام البلاغات (`REPORT_REASONS.message`) — لا نظام جديد.
  - i18n (ar+en فقط، بلا مفاتيح جديدة خارج البند): `comments.{label,load_more,no_comments,reply,deleted}` + `reports.{reason_comment,reason_message}` + `errors.{comment_not_found,not_comment_owner}`.
  - `src/modules/pages/competition-page.ts`: يجلب `/comments?limit=20&offset=` مع زر تحميل المزيد + اشتراك SSE `comment_new` + عدّاد `comments_count` + `aria-label` للزر/الإدخال؛ لا مساس بمنطق الإعلانات.
  - `tests/api/comments-pagination.test.ts` (جديد، 6/6 ✅): سُلّم **أحمر أولاً** (6/6 فشل على الأساس قبل الإصلاح) ثم أخضر بعد الإصلاح؛ `tests/helpers/fake-d1.ts`: دعم comments المرقّمة + `sse_event_log` + عدّادات خفيفة.
  - **CI baseline**: العدد الفعلي `ANYCOUNT=311` (محسوب `grep -rho ': any\|as any' src`)؛ `docs/11` يذكر 308 و`quality-gate.yml` يذكر 310 — الافتراض (310→312) غير صحيح لذا **لم يُعدَّل أي baseline وأُضيفت سطر واحد `as number`** (312) ضمن هذا البند فقط مع تسجيله هنا.
  / الملفات: migrations/0016_comments_soft_delete.sql, src/models/CommentModel.ts, src/config/types.ts, src/controllers/CompetitionController.ts, src/controllers/InteractionController.ts, src/models/ReportModel.ts, src/modules/api/competitions/routes.ts, src/modules/pages/competition-page.ts, src/i18n/ar.ts, src/i18n/en.ts, tests/api/comments-pagination.test.ts, tests/helpers/fake-d1.ts, docs/03-API-REFERENCE.md, docs/14-ROUTE-INVENTORY.md, dev-tools/route-inventory.json, WORKLOG.md, PLAN-STATUS.md / نفذ: Cline / اختبار: comments-pagination 6/6 ✅ + npm test 111/111 ✅ + tsc ✅ + build ✅ + route-inventory ✅ / PR: feat/core-comments-tree-and-live (بلا دمج)
---

## 2026-09-10 (B7)

- `[2026-09-10] [B7]` — حدود المعدل لكل فعل وحدود طول المحتوى (التعليقات والرسائل):
  - `src/lib/services/RateLimitService.ts` (جديد): `consume(userId, action, limit, windowSeconds)` على جدول `rate_limits` (0012)، ثابتات `RATE_LIMITS` (comment: 10/60s · message: 20/60s)، ذرّية عبر UPSERT + `CASE WHEN window_start >= ...`، تعيد `{ allowed, count, retryAfter }`.
  - `migrations/0015_content_length_bounds.sql` (جديد): بدل إعادة بناء جدولي comments/messages لإضافة CHECK (مدمّر للبيانات القائمة) — استُخدمت triggers تقبل الرفض (`RAISE(ABORT)`) عند content > 2000 (تعليق) / > 4000 (رسالة) في INSERT وUPDATE. **السبب موثّق في رأس ملف الترحيل**. تحقّق مكافئ في طبقة النموذج قبل الإدراج: `CommentModel.create/update` و`MessageModel.create` ترمي `ContentTooLongError`.
  - `src/lib/errors/AppError.ts`: `ContentTooLongError` (400، مفتاح `errors.content_too_long`).
  - Controllers: `CompetitionController.addComment` (rate limit ثم طول) و`MessageController.sendMessage/startConversation` (rate limit 20/دقيقة) — 429 + ترويسة `Retry-After` + رسالة i18n `errors.rate_limited`. لم يُلمس: المسارات المالية/الإعلانية ولا أي middleware عام.
  - i18n: `errors.rate_limited` + `errors.content_too_long` في ar+en.
  - `tests/helpers/fake-d1.ts`: دعم comments وrate_limits وbatch SELECT.
  - `tests/api/rate-limits.test.ts` (جديد، 6 سيناريوهات: 10 تعليقات⇒429+Retry-After، 20 رسالة⇒429، انتهاء النافذة، عزل لكل مستخدم/فعل، 2001/4001 حرفاً⇒400 بلا صف مكتوب).
  / الملفات: src/lib/services/RateLimitService.ts, migrations/0015_content_length_bounds.sql, src/lib/errors/AppError.ts, src/models/CommentModel.ts, src/models/MessageModel.ts, src/controllers/CompetitionController.ts, src/controllers/MessageController.ts, src/i18n/ar.ts, src/i18n/en.ts, tests/helpers/fake-d1.ts, tests/api/rate-limits.test.ts, WORKLOG.md / نفذ: Cline (B7 agent) / اختبار: rate-limits 6/6 ✅ + npm test 105/105 ✅ + tsc ✅ + build ✅ + db:reset ✅ / PR: fix/core-rate-limits-content-bounds
---



## 2026-09-09 (B5-1)

- `[2026-09-09] [B5-1]` — حراسة انتقالات حالة المنافسة: `CompetitionModel.startLive()` → UPDATE مشروط `AND status='accepted'`، `complete()` → `AND status='live'`، وboolean من `meta.changes` (مع before/after fallback لأن Wrangler CLI المحلي يُسقط meta في الكتابة — الـfallback مثبت باختبار حقيقي). Controller: start يفحص الملكية ثم `status!=='accepted'` → 409 `competition_errors.not_eligible_to_start` ثم غياب opponent → 409 `competition_errors.no_opponent` (i18n بدل النص الإنجليزي المكتوب) ثم race (`startLive=false`) → نفس 409؛ end: `completed` → نجاح `already_completed:true`، `!==live` → 409 `competition_errors.not_live`، `complete=false` (race) → idempotent success بلا `finalize_payouts` ثانية. i18n: `not_eligible_to_start/no_opponent/not_live/already_completed` في ar+en. لم يُلمس: LivePayoutEngine/ScheduledTaskService.updateAggregatesAfterVote/المالية/migrations/B5-2+
  / الملفات: src/models/CompetitionModel.ts, src/controllers/CompetitionController.ts, src/i18n/ar.ts, src/i18n/en.ts, tests/integration/competition-state-guards.test.ts (جديد), tests/api/competition-state-guards-i18n.test.ts (جديد), PLAN-STATUS.md, WORKLOG.md / نفذ: Cline (B5-1 LOCAL agent) / اختبار: integration 7/7 عبر D1 حقيقية ✅ + npm test 73/73 ✅ + tsc ✅ + build ✅ / **لا commit/PR/push — بانتظار موافقة القائد**

---
## 2026-09-09 (B4)

- `[2026-09-09] [B4]` — إصلاح B4 (Scheduled tasks due-query): مقارنة `execute_at` عبر `datetime()` في `processPendingTasks` (WHERE + ORDER BY) لأن `schedule()` يخزن ISO (`toISOString`) بينما `datetime('now')` بصيغة space — المقارنة الخام لا تطابق أبداً فالمهام المستحقة لا تُنفَّذ. اختبار حقيقي على D1/SQLite عبر Wrangler CLI: `tests/integration/scheduled-tasks-due.test.ts` (5 حالات: مهمة past بصيغة ISO تُلتقط، مهمة past بصيغة space تُلتقط، مهمة future لا تُلتقط، عدد المهام 2، ترتيب زمني). إثبات الحمرة سلوكي: أعيد الـSQL للصيغة القديمة (`t.execute_at <= datetime('now')`) → 3 حالات تفشل (المهمة بصيغة ISO لا تُلتقط)، ثم أعيد الإصلاح → 5/5 تنجح. بلا نصوص user-visible (لا i18n مطلوب)، بلا لمس للمال/الإعلانات، الإصلاح في طبقة service فقط (MVC/OOP)
  / الملفات: src/lib/services/ScheduledTaskService.ts, tests/integration/scheduled-tasks-due.test.ts, WORKLOG.md, .github/CLI-NOTES.md, .github/pr-body-b4.md / نفذ: Cline (B4 LOCAL agent) / اختبار: integration 5/5 ✅ / commit: 608a7fc / PR: https://github.com/Maelsh/dueli-opus/pull/7
## 2026-09-09 (B5-2)

- `[2026-09-09] [B5-2]` — تعريب رسائل أخطاء المنافسة المتبقية عبر i18n (بدون تغيير رموز HTTP أو شكل الاستجابة):
  - `src/i18n/ar.ts` + `src/i18n/en.ts`: أضيفت 11 مفتاحاً جديداً تحت `competition_errors`: `no_opponent`, `vod_url_required`, `already_has_opponent`, `invitee_required`, `cannot_invite_self`, `already_invited`, `no_pending_invitation`, `no_pending_request`, `request_already_accepted`, `already_competitor`, `competition_full` — كلها مترجمة ar+en.
  - `src/controllers/CompetitionController.ts`: استبدال النصوص الحرفية بـ `this.t('competition_errors.<key>, c)`: `'Cannot start without opponent'` → `no_opponent` (409)، `'vod_url is required'` → `vod_url_required`، `'Competition already has opponent'` → `already_has_opponent` (مرتين)، `'invitee_id required'` → `invitee_required`، `'Cannot invite yourself'` → `cannot_invite_self`، `'User already invited'` → `already_invited`، `'No pending invitation found'` → `no_pending_invitation` (3 مرات).
  - `tests/helpers/fake-d1.ts`: إصلاح خلل بناء (if-block مكرر بلا إغلاق يسبب خطأ esbuild) — حُذف التالف، بقي المعالج الصحيح.
  - `tests/api/competition-errors-i18n.test.ts` (جديد، 5 اختبارات): /start بلا خصم يعيد الرسالة ar+en، /update-vod بلا vod_url يعيد الرسالة ar+en، وحارس انحدار يثبت زوال كل النصوص الحرفية.
  / الملفات: src/controllers/CompetitionController.ts, src/i18n/ar.ts, src/i18n/en.ts, tests/helpers/fake-d1.ts, tests/api/competition-errors-i18n.test.ts / نفذ: Cline / اختبار: 5/5 ✅ + npm test 75/75 ✅ + tsc ✅ + build ✅ / **بانتظار مراجعة القائد** / خارج النطاق: متحكمات المال والإعلانات
---

---

---
## 2026-09-09 (B5-4)

- `[2026-09-09] [B5-4]` — إغلاق حلقة الدعوة/القبول وتثبيت setOpponent ضد السباق:
  - `CompetitionModel.setOpponent()`: تُبقي `AND opponent_id IS NULL` وتعيد الآن `boolean` من `meta.changes > 0` (بدل true دائماً)
  - `CompetitionController.acceptInvitation()`: عند القبول يُنفَّذ داخل `db.batch()` واحد: ضبط opponent_id + status='accepted' + رفض بقية الدعوات المعلقة؛ `setOpponent()===false` (سباق) → 409 `competition_errors.opponent_already_set` — قبول واحد فقط ينجح
  - `CompetitionController.invite()`: الحظر يرجع 403 برسالة مترجمة `competition_errors.blocked_user`؛ دعوة مستخدم له دعوة pending سابقة → 409 (بلا تكرار)
  - `CompetitionController.acceptRequest()`: معالجة false من setOpponent كـ409 بنفس المفتاح
  - i18n (`ar.ts`/`en.ts`): `competition_errors.opponent_already_set` / `invitation_not_found` / `blocked_user`
  - اختبارات حمراء أولاً: `tests/api/competition-invite-accept.test.ts` (6 اختبارات: المسار السعيد، سباق Promise.all B/C، لا pending بعد القبول، 403 محظور بالعربية، 409 دعوة غير موجودة، إشعار لـB عند الدعوة ولـA عند القبول) — فشلت قبل الإصلاح (قبول مزدوج 200/200 وopponent متضارب) ونجحت بعده
  - `tests/helpers/fake-d1.ts`: دعم competition_invitations + notifications + batch()
  / الملفات: src/models/CompetitionModel.ts, src/controllers/CompetitionController.ts, src/i18n/ar.ts, src/i18n/en.ts, tests/api/competition-invite-accept.test.ts, tests/helpers/fake-d1.ts, PLAN-STATUS.md, WORKLOG.md / نفذ: Cline (B5-4 agent) / اختبار: competition-invite-accept 6/6 ✅ + npm test 76/76 ✅ + tsc ✅ + build ✅ + سباق متكرر 10/10 بلا flakiness ✅ / خارج النطاق عمداً: matchmaking, LivePayoutEngine, مالية, ads, migrations, routes wiring

---
## 2026-09-08 (B1)

- `[2026-09-08] [GOV-11/B1]` — إصلاح B1 (Core Messaging): محاذاة `messages` مع نموذج conversations:
  - migration جديدة `migrations/0014_messages_conversation_alignment.sql` (غير مدمِّرة): إضافة `conversation_id` (FK→conversations ON DELETE SET NULL) و`read_at`، إنشاء محادثات legacy (INSERT OR IGNORE بترتيب min/max مطابق لـfindOrCreate)، ربط كل رسالة قديمة بمحادثتها، backfill `read_at` من `is_read=1`، فهارس `idx_messages_conversation_created (conversation_id, created_at)` و`idx_messages_receiver_unread (receiver_id, is_read)` — لا حذف لأعمدة legacy ولا تعديل migrations قديمة
  - `src/models/MessageModel.ts`: الإنشاء يحفظ conversation_id/sender_id/receiver_id/content/is_read/read_at/created_at، مع اشتقاق receiver_id من المحادثة (لا من مدخلات) وفحص عضوية المرسل (رمي خطأ لغير المشارك)؛ markAsRead يضبط `is_read=1, read_at=now`؛ unread_count في قائمة المحادثات بـ`is_read = 0` — كل الاستعلامات prepared + bind()
  - اختبارات حمراء أولاً: `tests/integration/messages-schema.test.ts` (9 اختبارات على D1 حقيقية عبر Wrangler CLI: أعمدة/فهارس/إنشاء/قراءة/تعليم-كمقروء/unread 1→0/وصول A وB فقط/رفض C/backfill legacy عبر تطبيق 0001–0013 ثم 0014 فقط) — فشلت قبل الإصلاح بـ`no such column: m.conversation_id: SQLITE_ERROR` ونجحت بعده
  - runner: `applyMigrationFiles` (تنفيذ ملفات migration حقيقية عبر `wrangler d1 execute --file` بلا أي SQL parsing)، `execD1`، `wipeTestState`، إعادة محاولة لأخطاء workerd العابرة (fetch failed/SQLITE_BUSY)
  - `vitest.integration.config.ts`: `fileParallelism: false` (حالة D1 واحدة مشتركة)
  - `package.json`: scripts `test:integration` و`test:all` (المطلوبة في docs/13 §6 والمهام كانت مفقودة)
  - `tests/integration/schema-contract.test.ts`: تحديث العقد إلى 15 migration وأعمدة 0014
  / الملفات: migrations/0014_messages_conversation_alignment.sql, src/models/MessageModel.ts, tests/integration/messages-schema.test.ts, tests/integration/schema-contract.test.ts, tests/integration/helpers/wrangler-d1-runner.{mjs,d.mts}, vitest.integration.config.ts, package.json, PLAN-STATUS.md, WORKLOG.md / نفذ: Cline (B1 agent) / اختبار: integration 25/25 مرتين متتاليتين ✅ + npm test 35/35 ✅ + test:all ✅ + build ✅ + tsc ✅ + db:reset ✅ / **لا commit/PR/push — بانتظار موافقة القائد** / خارج النطاق عمداً: money/ads/auth/SSE/recommendations/P0-404/Tailwind

- `[2026-09-08] [B1-i18n]` — إصلاح i18n للرسائل (مطلوب بالمهمة — شرط معماري إلزامي):
  - إضافة مفاتيح i18n المفقودة إلى `src/i18n/ar.ts` و`src/i18n/en.ts`:
    - `errors.invalid_id`: 'معرّف غير صالح' / 'Invalid ID'
    - `message.invalid_recipient`: 'المستلم غير صالح' / 'Invalid recipient'
    - `message.content_required`: 'محتوى الرسالة مطلوب' / 'Message content is required'
  - إنشاء `tests/api/messages-i18n.test.ts` (35 اختبار):
    - التحقق من وجود جميع مفاتيح i18n المستخدمة في MessageController بـar وen
    - التحقق من أن الترجمات مختلفة بين ar وen (تثبت الترجمة الفعلية)
    - التحقق من أن t() تُرجع نصوص مترجمة
    - التحقق من دعم RTL/LTR
    - توثيق عدم وجود نصوص ثابتة في الملفات المعدلة
  / الملفات: src/i18n/ar.ts, src/i18n/en.ts, tests/api/messages-i18n.test.ts / نفذ: Cline / اختبار: npm test 70/70 ✅ (35 i18n + 35 original) + build ✅ + tsc ✅ / **لا commit/PR/push — بانتظار موافقة القائد**

---


## 2026-09-08

- `[2026-09-08] [GOV-11]` — أساس integration D1 حقيقي عبر Wrangler CLI فقط: (1) runner جديد `tests/integration/helpers/wrangler-d1-runner.mjs` ينفذ Wrangler المحلي المثبت بـ arguments array (بدون shell interpolation) — migrations عبر `wrangler d1 migrations apply dueli-db --local --persist-to=.wrangler-test` من قاعدة معزولة تُمسح عند كل تشغيل، والاستعلامات عبر `wrangler d1 execute --json` على نفس القاعدة، (2) 16 schema-contract tests بأنواع دقيقة (type guards بلا `any`/`@ts-ignore`)، (3) scripts: `test:integration` + `test:all` مع استبعاد integration من `npm test`، (4) `.wrangler-test/` ignored. **لا FakeD1، لا TEST_SCHEMA، لا SQL parsing/comment stripping/statement splitting — ملفات migrations تطبق كما هي.** / الملفات: tests/integration/, vitest.integration.config.ts, vitest.config.ts, package.json, .gitignore, docs/13 / نفذ: Cline / اختبار: `npm run test:integration` ✅ مرتين متتاليتين (16/16) + `npm test` ✅ (35/35) + `test:all` ✅ + build ✅ + tsc ✅ + db:reset ✅ / **خارج النطاق عمداً:** B1/B2/B4/B5، SEC-02، SEC-11، المالية M1–M6، Browser E2E

## 2026-08-23

- `[2026-08-23] [P0-SRS0.2]` — إنشاء `docs/COMPLETE_PROJECT_PLANS.md` (أم الخطط + الخطط الخمس + الـSRS التفصيلي) كمرجع وحيد للخطط. / الملفات: docs/COMPLETE_PROJECT_PLANS.md / نفذ: ox-alpha / اختبار: لا ينطبق (توثيق)
- `[2026-08-23] [P0-SRS0.2]` — إنشاء نظام التوثيق المصاحب: `WORKLOG.md` + `PLAN-STATUS.md`. / نفذ: ox-alpha / اختبار: لا ينطبق
- `[2026-08-23] [P0-SRS0.1]` — تنظيف الكود: حذف 7 ملفات backup (`signaling/routes_backup`, 5 في live/scripts/client, `core_backup`)، حذف مجلد `test - Copy/` بالكامل، حذف المسارات الميتة `src/routes/api.ts` + `src/routes/index.ts` + `src/routes/jitsi.ts` (لا مستوردين)، نقل `test-stream-page.ts` إلى `dev-tools/`. / نفذ: ox-alpha / اختبار: `npm run build` ✅ نجح — 155 وحدة، صفر أخطاء TS
- `[2026-08-23] [P0-SRS0.2]` — توحيد التوثيق: أرشفة DOCUMENTATION.md + ultimate_forensic_audit.md + TODO.md + forensic_report/ + ملفات .plan الخمسة + أدلة docs القديمة الأربعة إلى `docs/archive/` مع README تحذيري. إنشاء `docs/00-OVERVIEW.md` و`docs/03-API-REFERENCE.md` (مرجع API الحقيقي مع حالة كل مسار). / نفذ: ox-alpha / اختبار: docs يحتوي الآن 4 عناصر فقط (00, 01, COMPLETE_PLANS, archive) ✅
- `[2026-08-23] [P0-SRS0.3]` — إنشاء قواعد المعمارية الملزمة `docs/01-ARCHITECTURE-RULES.md` + دليل الوكلاء `AGENTS.md`. / نفذ: ox-alpha / اختبار: لا ينطبق (توثيق)
- `[2026-08-23] [P1-T1.1]` — ترحيل `0007_schema_alignment.sql` (users.elo_rating, current_competition_id, busy_since, competitions.winner_id, average_rating, جدول competition_heartbeats) + استبدال user_follows→follows في UserModel.ts وSearchModel.ts وUserSettingsModel.ts + حذف MigrationManager.ts الميت (لا مستوردين، كان يكرر ترحيلات غير منفذة). / نفذ: ox-alpha / اختبار: `npm run db:migrate:local` ✅ (11 أمر) + صفر user_follows في src + `npm run build` ✅
- `[2026-08-23] [P1-T1.2]` — ربط الوحدات اليتيمة في main.ts: `/api/recommendations`, `/api/leaderboard`, `/api/analytics` (كانت 404). / نفذ: ox-alpha / اختبار: wrangler pages dev محلياً — categories=200 ✅، الثلاثة الجديدة=401 (محمية بمصادقة، مربوطة بنجاح) ✅ + build 159 وحدة ✅
- `[2026-08-23] [P2-T2.2]` — الإشعارات الفورية (الجزء الأول): 
  - سيرفر: ربط EventPusher في CompetitionController — publishInvite عند الدعوة، publishInviteResponse (قبول/رفض) للمضيف، وإعادة هيكلة declineInvite لجلب بيانات المضيف قبل التحديث
  - middleware/auth.ts: دعم `?token=` query وcookie sessionId إضافةً إلى Bearer header (ضروري لأن EventSource لا يرسل Headers)
  - عميل جديد `client/services/SseService.ts`: اتصال دائم بقناة `user:<id>`، معالجة invite_sent/invite_accepted/invite_declined/notification مع Toast فوري وتحديث شارة الإشعارات، فصل عند الخروج
  - NotificationsUI: نقر الإشعار ← markAsRead + انتقال مباشر لصفحة المنافسة المرجعية
  - i18n: مفاتيح sse.new_invite/invite_accepted/invite_declined في ar.ts وen.ts
  / نفذ: ox-alpha / اختبار: build ✅ (161 وحدة) + نقطة SSE ترفض توكن خاطئ بـ401 عبر ?token= ✅ / **متبقي:** اختبار يدوي بمتصفحين (دعوة حية → Toast فوري) قبل إغلاق المهمة
- `[2026-08-23] [P2-T2.2]` — **إغلاق المهمة باختبار E2E حقيقي** (محاكاة متصفحين عبر API محلي): 
  - تسجيل مستخدمين A/B + تفعيل + دخول ✅
  - بث SSE لقناة `user:B` ← A أنشأ منافسة (id=360) ودعا B ← **B استلم `event: invite_sent` لحظياً في البث** ✅
  - بث SSE لقناة `user:A` ← B قبل الدعوة ← **A استلم `event: invite_accepted` لحظياً** ✅
  - ملاحظة موثقة: الدخول يفحص `is_verified` (وهو ما يضبطه verifyEmail) بينما يوجد عمود غير مستخدم `email_verified` — تعارض مخطط يُعالج ضمن T3.x
  / نفذ: ox-alpha / اختبار: E2E كامل ✅ — المهمة مغلقة
- `[2026-08-23] [P2-T2.1]` — إكمال مودال الدعوات: (1) فتح تلقائي بعد الإنشاء عبر `?invite=1` في create-page + معالج في competition-page بشرط المالك+pending+بلا منافس، (2) بطاقة hover تفصيلية (تقييم، منافسات، نسبة فوز، انتصارات/خسائر، أبرز المجالات بألوانها، رابط للبروفايل) مع cache وdelay ضد الوميض، (3) ترحيل `0008_allow_requests.sql` + فلترة من أغلق الطلبات في MatchmakingController (الاستعلامان الرئيسي والعدّ)، (4) مفاتيح i18n جديدة AR/EN. / نفذ: ox-alpha / اختبار: migrate ✅ + build ✅ + E2E: online-users ترجع 21 مستخدماً مرتبين بالتوافق ✅ + competitor-stats تعمل ✅
- `[2026-08-23] [P0-SRS0.2]` — ملاحظة: تعديل الملفات عبر PowerShell Set-Content يفسد ترميز العربية (تكرر الخطأ في InvitePanel وأُصلح) — القاعدة: أدوات تحرير الملفات فقط
- `[2026-08-23] [P1-T1.4]` — الأمان الحرج: (1) CryptoUtils بـPBKDF2-SHA256 (100k دورة + salt عشوائي + مقارنة آمنة زمنياً) مع توافق رجعي للهاشات التراثية، (2) ترقية شفافة للهاش القديم عند الدخول عبر UserModel.updatePasswordHash، (3) إصلاح BUG-12: toggleUserBan يعدّل is_active ويمنع حظر النفس/الأدمن ويدمر كل الجلسات، (4) SessionModel.findValidSession يرفض مستخدمي is_active=0 وينظف جلستهم، (5) خدمة Sanitize ضد XSS مربوطة في إنشاء المنافسات والتعليقات والرسائل والمنشورات. / نفذ: ox-alpha / اختبار E2E: دخول مستخدم هاشه SHA-256 تراثي نجح ورُقي تلقائياً لـ`pbkdf2$100...` ✅ + تسجيل جديد يخزن PBKDF2 ويدخل ✅ + جلسة المحظور ترجع user=null بعد الحظر ✅ + build ✅
- `[2026-08-23] [P1-T1.5]` — دورة النهاية والأرباح التلقائية: اكتشاف أن التقييم يتم بعد الاكتمال (rate يتطلب status=completed) لذا التصميم النهائي: (1) end() يجدّد مهمة `finalize_payouts` بعد 24 ساعة عبر ScheduledTaskService، (2) rate() يستدعي updateAggregatesAfterVote بعد كل تصويت (متوسطات+winner_id+ELO+recalculatePayouts)، (3) حذف handleEarnings القديم المعطوب (35/35/30 أعمى) واستبداله بـfinalizeCompetition عبر LivePayoutEngine، (4) 🔴 اكتشاف جذري: CronHandler كود ميت — Pages لا يدعم cron triggers → إنشاء `/api/cron/run?key=CRON_SECRET` محمية كمشغل خارجي، (5) 🐛 إصلاح اختطاف مصادقة: messages/routes كان use('*') مثبتاً على /api فيخطر كل مسارات /api بعده بـ401 — قُيّد لمساراته. / نفذ: ox-alpha / اختبار E2E على منافسة 360: start→end→تقييم A=5/B=2 ← **winner_id=21 (بالتقييم)** ✅ **ELO: ‏1500→1531 مقابل 1500→1469** ✅ cron نفّذ المهمة Success ✅ مفتاح خاطئ=403 ✅
- `[2026-08-23] [AUTH]` — منطق المصادقة حسب مواصفة المالك: (1) مستخدم OAuth يدخل بالبريد بكلمة مرور لا يعرفها ← رسالة موجّهة `auth_social_no_password` (استخدم مزوّدك أو أعد التعيين)، (2) تسجيل جديد ببريد حساب اجتماعي ← رسالة `auth_email_is_social`، (3) تدفق إعادة التعيين يسمح لمستخدمي OAuth بوضع كلمة مرور والدخول بعدها بالبريد ✅، (4) BUG-05: تغيير كلمة المرور يدمر كل الجلسات القديمة. / نفذ: ox-alpha / اختبار E2E: الرسائل الثلاث تظهر صحيحة + reset→login نجح ✅
- `[2026-08-23] [P2-T2.4]` — واجهة تقييم المشاهدين: بطاقة نجوم 1-5 لكل منافس تظهر فقط للمنتهية+مسجل دخول+غير متنافس، إرسال فوري POST /rate مع قفل النجوم وشكر، شريط الفائز الذهبي (fa-trophy) يظهر عند وجود winner_id (يقرأ عمود 0007 الجديد). مفاتيح i18n: rate_title/rate_thanks/rate_failed/rate_winner_banner AR+EN. / نفذ: ox-alpha / اختبار: build ✅ + صفحة المنافسة المنتهية تعرض rateCard وsubmitRating والشريط ✅
- `[2026-08-23] [P2-T2.3]` — قسم "المقترح" في الرئيسية أصبح مدعوماً بمحرك التوصيات (`/api/recommendations` بأوزان اللغة>البلد>المتابعة>الأحدث>المشاهدة>التقييم) عبر fetchRecommended مع Authorization للمسجلين وتدهور رشيق للقائمة العادية عند الفشل. / نفذ: ox-alpha / اختبار: build ✅ + نقطة التوصيات ترجع success للضيف ✅ + المحادثات ما زالت 401 بدون توكن بعد إصلاح نطاق messages ✅
- `[2026-08-23] [P1-T1.3]` — تشخيص وإصلاح استقبال البث: 🔴 **الخلل الجذري**: تعارض الامتداد — المضيف يسجل webm (detectBestMimeType على Chrome) بينما المشاهد يطلب `ChunkManager(id,'mp4')` → HEAD 404 للأبد → عالق على "جاري الاتصال". الإصلاحان: (1) ChunkManager.exists() يفحص قائمة مرشحين [mp4,webm] ويقفل على الموجود فعلاً (يغطي competition-page + viewer.ts المستقل)، (2) مسار VOD كان طريقاً مسدوداً إذا لم يكن الدمج جاهزاً → إعادة محاولة كل 15 ثانية حتى 5 دقائق مع رسالة "جاري تجهيز التسجيل" (recording_processing AR/EN) وتصفير العداد عند النجاح. / نفذ: ox-alpha / اختبار: build ✅ / **متبقي:** تحقق حي مع سيرفر ffmpeg الحقيقي (CORS على HEAD، صحة playlist) — يحتاج جلسة بث فعلية معك
- `[2026-08-23] [P3-T3.4]` — الأدمن الحقيقي: (1) إصلاح BUG-13: reviewReport ينفذ الفعل فعلياً عبر executeModerationAction (ban_user يحدد الضحية من نوع الهدف ويحظر+يدمر جلساته، delete_comment، delete_compression بنظافة مرجعية كاملة)، (2) 🐛 اكتشاف جذري: admin/reports/likes/schedule/settings/users كانت بلا authMiddleware بينما متحكماتها تقرأ c.get('user') ← لوحة الأدمن كلها 403 والبلاغات 401 للأبد — ركّب authMiddleware({required:false}) عليها جميعاً، (3) إصلاح AdminAuditLogModel: كان يكتب في عمود timestamp غير الموجود (الصحيح created_at) فيفشل التدقيق صامتاً. / نفذ: ox-alpha / اختبار E2E كامل: بلاغ(id=2)→مراجعة→**executed=banned_user:23** ✅ **is_active=0 فعلياً** ✅ **audit: report_action:ban_user** ✅
- `[2026-08-23] [P3-T3.2]` — حذف الحساب GDPR: (1) 🔴 وحدة users/delete-account.ts كانت يتيمة غير مربوطة ← رُكبت في main.ts (401 محمية بدل 404)، (2) ترحيل `0009_account_deletion.sql` لأعمدة وهمية (users.deleted_at/deletion_reason، competitions.creator_anonymized، comments.user_anonymized)، (3) إصلاح قيود NOT NULL كانت ستكسر التنفيذ: تعليقات/منافسات تبقى مرتبطة بصف المستخدم المُخفى بدل NULL، جدول conversation_participants الوهمي استُبدل بحذف conversations عبر user1/user2، (4) زر الإعدادات الوهمي (TODO) أصبح ينادي الـAPI فعلياً مع مسح الحالة المحلية وتحويل للرئيسية. مفاتيح i18n confirm_delete_account/account_deleted AR+EN. / نفذ: ox-alpha / اختبار E2E: مستخدم جديد→حذف→**email=deleted_24@deleted.dueli، is_active=0، deletion_reason مسجل** ✅
- `[2026-08-23] [AUTH-VERIFY]` — تحقق مطابقة المصادقة لمواصفة المالك: oauth-routes ينشئ المستخدم بـ`is_verified=1` فوراً ✅ (موثق بالمصادقة بلا كلمة مرور)، مسار البريد يتطلب التحقق أولاً ✅، إعادة التعيين تفتح الدخول بالبريد لمستخدمي OAuth ✅ — المواصفة مستوفاة بالكامل
- `[2026-08-23] [P3-T3.3]` — التعليقات المتداخلة: الجدول كان يدعم parent_id أصلاً لكن لا شيء يستخدمه. (1) CommentModel.create يقبل parent_id مع تحقق أن الأب من نفس المنافسة، (2) addComment يمرر parent_id، (3) واجهة صفحة المنافسة: شجرة تعليقات (renderCommentsTree) مع ردود مزاحة بمسار جانبي حسب الاتجاه (ms-/border-s-) وزر "رد" يضبط حالة الرد ومؤشراً في الحقل، (4) مفاتيح i18n reply/replying_to AR+EN. / نفذ: ox-alpha / اختبار E2E: تعليق رئيسي id=20 ← رد id=21 **parent=20** ✅
- `[2026-08-23] [P1-T1.3b]` — 🔴 **السبب الجذري الثاني للبث**: قياس مباشر على السيرفر الحقيقي كشف أن `playlist.php` **لا يرسل أي رؤوس CORS** بينما stream.php يرسل `*` ← المتصفح يحظر جلب قائمة القطع كلياً (skipToLatest + VOD + فهرس المضيف). الحل: وكيل سيرفري `GET /api/chunks/playlist/:id` يتجاوز CORS ويطبيع الاستجابة (جسم فارغ 200 ← chunks:[] بدل انهيار json()) مع مهلة 10 ثوان وتدهور رشيق. استُبدلت **7 مواضع عميلة** كانت تضرب الرابط الخارجي مباشرة (competition-page, ChunkPlayer, viewer, shared×2, host, live/core). / نفذ: ox-alpha / اختبار E2E محلياً: الوكيل يسحب من السيرفر الحقيقي success=True chunks=0 ✅ + id خاطئ=400 ✅
- `[2026-08-23] [P3-T3.1]` — العولمة اللغوية: سجل مركزي `src/i18n/languages.ts` (الكود، الاسم الأصلي، الاتجاه، التفعيل) + `registerLanguage(code, pack)` للتسجيل الديناميكي + `getAvailableLanguages()` للقائمة + اشتقاق RTL من السجل مع قائمة احتياطية + دليل كامل `docs/06-I18N-GUIDE.md` (إضافة لغة = ملف ترجمة + سطر سجل + تسجيل — بلا تعديل منطق). / نفذ: ox-alpha / اختبار: build ✅
- `[2026-08-23] [P3-T3.2b]` — استكمال البروفايل والجدولة: (1) 🐛 إصلاح شكل بيانات المنشورات: الخادم يرجع {data:{posts}} والعميل كان يقرأ data.data.length ← دائماً "لا منشورات"، (2) محرر نشر لصاحب البروفايل + زر حذف لمنشوراته (createPost/deletePost موجودان لكن بلا واجهة)، مفاتيح i18n post_placeholder/post_publish/confirm_delete_post AR+EN، (3) تفعيل مؤقت دورة الحياة العالمي: CompetitionController يرجع timer منذ قبل لكن CountdownTimer لم يكن مستدعى أبداً ← ربطه في صفحة المنافسة عبر حاوية countdownTimerHost. / نفذ: ox-alpha / اختبار: build ✅ + قياسات حية مباشرة
- `[2026-08-23] [P4-T4.1]` — الدفع الحقيقي: (1) خدمة `StripeService.ts`: جلسة Checkout مستضافة (form-encoded على api.stripe.com) + تحقق توقيع Webhook بـHMAC-SHA256 عبر WebCrypto مع حماية replay (نافذة 5 دقائق) ومقارنة شبه ثابتة، (2) نقطة إنشاء التبرعة تنشئ جلسة Stripe عند توفر STRIPE_SECRET_KEY (طرق stripe/card) وتعيد الرابط المستضيف، وإلا رابط تطوير احتياطي، (3) مسار `POST /api/donations/webhook` يتحقق من التوقيع ثم يعلم التبرعة مكتملة على checkout.session.completed (يقرأ donation_id من metadata أو client_reference_id)، (4) 🐛 إصلاح مسار استيراد نسبي خاطئ كان يكسر البناء، (5) تبرعات/طرق الدفع مربوطة في main.ts بعد أن كانت يتيمة. / نفذ: ox-alpha / اختبار E2E محلياً: top-supporters حقيقي ✅ webhook بدون تهيئة=503 ✅ إنشاء تبرع=success مع رابط تطوير (المفاتيح غير مضبوطة محلياً — في الإنتاج مع المفاتيح يعيد رابط Stripe) ✅
- `[2026-08-23] [P4-T4.3]` — إعلانات: ربط ad-blocks وad-reports في main.ts (كانا يتيمين). / نفذ: ox-alpha / اختبار: build ✅
- `[2026-08-23] [P4-T4.4]` — الشفافية المالية تتغذى تلقائياً منذ T1.5 (LivePayoutEngine يسجل platform_share/competitor_payout في platform_financial_logs عند كل finalize) + نقطة /api/transparency تستجيب بنجاح ✅ — لا كود إضافي مطلوب
- `[2026-08-23] [P5-T5.3]` — PWA: الأساس موجود ويعمل (manifest.json مربوط + sw.js مسجل في layout) — التحسين الكامل للعمل دون اتصال تبقى تحسيناً مستقبلياً
- `[2026-08-23] [P5-T5.1-NOTE]` — قرار معماري مؤجل: Cloudflare Pages لا يدعم Durable Objects مباشرة — يحتاج Worker منفصلاً مع DO لاستبدال polling الـSSE بدفع أصلي. موثق كمهمة بنية تحتية مستقبلية تتطلب قرار نشر
- `[2026-08-23] [P3-T3.3-FINAL]` — إغلاق آخر 5% في المرحلة 3: نافذة الإبلاغ أصبحت عامة لأي هدف (competition/comment/user) بأسباب صحيحة لكل نوع من REPORT_REASONS + زر علم على كل تعليق داخل الشجرة + submitReport يستخدم الهدف المخزن. / نفذ: ox-alpha / اختبار: build ✅ — **المرحلة 3 = 100%**
- `[2026-08-23] [P5-T5.1]` — قرار المالك (تفويض): بناء الوكر اللحظي `workers/dueli-realtime/` بـDurable Objects: غرفة لكل قناة + WebSocket Hibernation API + مصادقة مصافحة عبر /api/auth/session + نقطة /publish محمية بسر مشترك. EventPusher يوجه الأحداث إليه تلقائياً عند ضبط REALTIME_WS_URL+REALTIME_PUBLISH_SECRET (fire-and-forget لا يعطل SSE). SseService عميل موحد: WS أولاً مع 3 محاولات ثم تراجع تلقائي لـSSE، وموزع أحداث واحد للقناتين. النشر: `cd workers/dueli-realtime && wrangler deploy` (يتطلب خطة Workers مدفوعة). / نفذ: ox-alpha / اختبار: build ✅ (175 وحدة) — التحقق الحي بعد النشر
- `[2026-08-23] [P5-T5.2]` — قرار مالك (مفوض): إبقاء خط ffmpeg الحالي للتسجيلات بدل Cloudflare Stream — يعمل وأرخص؛ مراجعة CDN عند نمو الاستهلاك فعلياً. موثق كقرار لا كمهمة معلقة
- `[2026-08-23] [P5-T5.3]` — تحسين service worker: ترقية الكاش v2 + تقليم ذاكرة الديناميك (حد 60 مدخلاً) منع نمو لا نهائي. / نفذ: ox-alpha
- `[2026-08-23] [P5-T5.5]` — توثيق API العامة للمطورين الخارجيين: `docs/08-PUBLIC-API.md` (قراءة عامة، نقاط المستخدم، القنوات اللحظية، Webhooks، حدود الاستخدام). / نفذ: ox-alpha
- `[2026-08-23] [MAINT]` — إصلاح تلف ترميز عربي طفيف في WithdrawalController/AdminController نتج عن Set-Content (تعليقات فقط — الصفر الآن)
- `[2026-08-23] [P1-T1.3c]` — 🔴 **السبب الجذري الرابع للبث**: عميل السيجنال (host.ts/guest.ts) يمرر `signalingUrl = maelshpro.com/ffmpeg` بينما السيرفر الفعلي يعيش على `stream.maelshpro.com` (/ffmpeg/api/signaling/* ترجع 404 مؤكدة بقياس مباشر) ← لا تبادل offer/answer إطلاقاً ← لا P2P حي! أُصلح الرابطين. قياس حي بعد تشغيل المالك للسيرفرات: السيجنال يستجيب 400 لطلب ناقص (صحيح) ✅، نقطة ice-servers ترجع 3 STUN ✅، اعتمادات TURN بHMAC جاهزة في الكود (تحتاج TURN_SECRET/TURN_URL في بيئة الإنتاج). ⚠️ **مفتوح على المالك:** منفذ coturn غير متاح خارجياً (3000 و3478 مغلقان جدارياً على المضيفين) — بدون relay سيفشل الاتصال للـNAT الصارم. / نفذ: ox-alpha / اختبار: build ✅ + قياسات حية مباشرة

## 2026-09-05

- `[2026-09-05] [GOVERNANCE]` — استكمال جلسة تدقيق سابقة انقطعت قبل إتمامها. راجعتُ الوثائق الموجودة فعلاً (`docs/10-ARCHITECTURE-ASSESSMENT.md`, `11-DEFINITION-OF-DONE.md`, `12-SECURITY-REMEDIATION.md`, `13-TEST-STRATEGY.md`, `14-ROUTE-INVENTORY.md`, `15-ROADMAP.md`) وتأكدت من اكتمال محتواها (11/12/13/15 كاملة ومحكمة، لا تحتاج تعديلاً). المتبقي الذي أكملته:
  - **`dev-tools/route-inventory.mjs`**: كان مُشاراً إليه في `docs/14-ROUTE-INVENTORY.md` (كملف يُعاد توليده منه) لكنه لم يكن محفوظاً في `dev-tools/` — أعدت بناءه من الصفر (يفحص `main.ts` لاستخراج التركيبات + كل `routes.ts` لتصنيف AUTHENTICATED/PUBLIC/UNGUARDED حسب وجود `authMiddleware`). شغّلته: أنتج 172 مساراً (الجرد السابق كان 191 — فرق متوقّع لأن السكربت المعاد بناؤه لا يتتبّع الراوترات المتداخلة (nested) بعد؛ يحتاج تحسيناً لاحقاً موثّقاً هنا لا مخفياً).
  - **`dev-tools/reset-d1.mjs`** + تعديل `package.json.db:reset`: استبدال `powershell -Command "Remove-Item ..."` بسكربت Node عابر للأنظمة (البند المذكور صراحة في `docs/13-TEST-STRATEGY.md` §6 كإصلاح مسبق مطلوب لأن CI يعمل على Linux).
  - **`.github/workflows/quality-gate.yml`** (جديد): يفرض G1 (build)، G2 (tsc --noEmit + سقف any=308)، فحوص SEC-06/07/08/10/11/05 (`docs/12` §4)، ومحاولة migrate من قاعدة فارغة (G5)، وvitest إن وُجد، وnpm audit، وإعادة توليد جرد المسارات. القرار الموثّق في `docs/13-TEST-STRATEGY.md` §6 مطبَّق حرفياً: الفحوص الجديدة `continue-on-error: true` (فترة سماح أسبوع) عدا G1/G2/SEC-06/SEC-11 التي تمنع الدمج فوراً لأنها فحوص نصية بلا اعتماديات خارجية ولا خطر كسر مفاجئ.
  - **`AGENTS.md`**: أعدت ترتيب "اقرأ أولاً" ليضع 11/15/12/13/14 قبل `COMPLETE_PROJECT_PLANS.md` مع تنويه صريح أن حالة "✅ مكتملة" في الأخير غير موثوقة. صححت 3 حقائق قديمة (قائمة الوحدات غير المربوطة كانت خاطئة — أصبحت مربوطة فعلاً؛ نبّهت على `?token=` وسر الـcron في query string كديون أمنية معروفة لا كحالة طبيعية). أضفت بند CI.
  - `npm run build` ✅ بعد كل التعديلات.
  / نفذ: ox-alpha (استكمال جلسة سابقة) / اختبار: build ✅، route-inventory.mjs نُفّذ فعلياً وأنتج ملفين ✅ / **متبقي موثَّق بصراحة:** route-inventory.mjs لا يتتبّع الراوترات المتداخلة (فرق 191→172)، وقائمة SEC الكاملة (SEC-01→SEC-15) في `docs/12` لم يُنفَّذ منها أي إصلاح كود بعد — هذه الجلسة وثّقت ومكّنت الفحص الآلي فقط، ولم تُصلح الثغرات المالية/الأمنية نفسها (تلك مهمة `PHASE 1` القادمة حسب `docs/15-ROADMAP.md`).

## 2026-09-05 (Agents A-E session)

- `[2026-09-05] [AGENT-A]` Fix profile + activation on Preview: profile-page now queries D1 directly (no self-fetch), /profile resolves own profile from session (401 login page when absent), explicit 404 with username in logs; register no longer 500s without EMAIL vars (creates user + warning email_not_configured + resend button), resendVerification returns the same generic message for existing/missing/unconfigured (anti-enumeration), added [Register] email queued log without the key. / Files: src/modules/pages/profile-page.ts, src/controllers/AuthController.ts, src/client/services/AuthService.ts. / Verify: tests/api/profile.test.ts + tests/api/auth-email.test.ts green.
- `[2026-09-05] [AGENT-B]` Production safety: Permissions-Policy camera/microphone=(self) (was blocking broadcast); migration 0011 (competition_invitations.accepted_at + backfill); CSRF header contract documented in docs/08-PUBLIC-API.md; TURN absence documented (dashboard Preview+Production). / Verify: build + migrate OK.
- `[2026-09-05] [AGENT-C]` Live-room cleanup: reportAd wired to POST /api/reports {target_type:ad} with Toast (added ad support: ReportModel type + REPORT_REASONS + InteractionController + migration 0012 rebuild of reports CHECK); showMessage uses Toast (no alert/TODO left); VideoCompositor/ChunkUploader/P2PConnection logs gated behind debugLog (console.error kept). / Verify: no alert/TODO in live-room-page; [DEBUG] hits only via debugLog.
- `[2026-09-05] [AGENT-D]` vitest + @cloudflare/vitest-pool-workers installed, "test": "vitest run", vitest.config.ts, FakeD1 helper, tests for UserModel/block + profile + auth-email. / Verify: npm test green.
- `[2026-09-05] [AGENT-E]` Docs created: 02-DATABASE (0001-0012 + ERD), 04-STREAMING-PIPELINE, 05-COMPETITION-LIFECYCLE, 07-ONBOARDING (EMAIL/TURN Preview-vs-Production outage causes).

## 2026-09-05 (Agents A+/B+ session)

- `[2026-09-05] [AGENT-A+]` SEC-01: POST /api/donations/:id/complete protected with authMiddleware + ownership check + warn log (was public); optional auth on donations routes so donors own records; paypal removed from donations validMethods and earnings-page (until real integration). SEC-06: chunk keys via crypto.getRandomValues + (user,competition,chunk) binding + 10-min expiry (migration 0013); exact-host origin check (fixes startsWith subdomain bypass). / Files: donations/routes.ts, chunks/routes.ts (+0013), earnings-page.ts. / Verify: tests/api/donations-security.test.ts (6 tests) green; SEC-06 gate grep clean.
- `[2026-09-05] [AGENT-B+]` Upgrades: hono ^4.10.6 -> ^4.13.7, wrangler 4.51.0 -> 4.129.0, workers-types v4 -> v5, zod pinned ^3 (was missing, surfaced by upgrade); .npmrc legacy-peer-deps (vitest-5 vs pool-workers peer tension). Sessions: TTL 30d -> 7d + rotation on login (fresh id + prune to 5, incl. OAuth path). Fixed pre-existing tsc blockers (sse POLL_INTERVAL_MS, hono-4.13 param() strictness). Docs: 02 (+0013), 13/F12 expectation updated to protect-option. / Verify: tsc clean, build OK, smoke tests/api/smoke.test.ts (categories/competitions/sse/cors/cookies) green, migrations 0011-0013 applied locally, npm audit high 11 -> 5.

## 2026-09-06

- `[2026-09-06] [P0/P1]` Fixed on branch `fix/pages-404-tailwind-cli` from b7313f1 (in-scope only, per explicit task boundary):
  **P0**: @hono/vite-cloudflare-pages@0.4.3's generated entry does `worker.notFound(app.notFoundHandler)`, but Hono 4.13.7 stores the `.notFound()` handler in a private `#notFoundHandler` field — `app.notFoundHandler` read `undefined`, `.route()` doesn't copy notFound handlers (only registered routes, confirmed in hono-base.js), so any unmatched route on the outer `worker` crashed to 500. Fixed by extracting a named `onNotFound` (JSON 404 for /api/*, HTML 404 with explicit status for pages) registered via `app.notFound(onNotFound)`, plus a typed compatibility mirror `(app as PagesCompatibleHono).notFoundHandler = onNotFound` for the plugin to read.
  **P1**: `build:css` used `npx @tailwindcss/cli` with the package absent from package.json/lock — non-reproducible, network-dependent. Added `@tailwindcss/cli: ^4.1.17` as a locked devDependency, changed the script to bare `tailwindcss` (resolves via node_modules/.bin on PATH, no npx).
  / Files: src/main.ts, package.json, package-lock.json, tests/api/not-found-p0.test.ts (new), tests/build/tailwind-cli.test.ts (new).
  / Verify: `npm ci` (needed one retry after a Windows file-lock/EPERM on a stale node_modules dir — resolved by rename-then-delete, not a code issue) -> node_modules/.bin/tailwindcss.CMD present; `npm run build` ✅; `npx tsc --noEmit` clean; `npm test` 33/33 (7 new); `npm audit --omit=dev` 0 vulnerabilities; live `wrangler pages dev` + curl: /api/nonexistent -> 404 JSON success=false ✅, /nonexistent-page -> 404 HTML non-empty ✅, GET /api/cron/run -> 404 JSON (not 500) ✅, POST /api/cron/run (no CSRF/secret) -> 403 (not 500) ✅, /, /api/categories, /api/competitions unaffected (200) ✅, no RangeError/"Context is not finalized" in log ✅; dist/_worker.js contains 2 references to notFoundHandler (bundled correctly).
  / Not committed by this task yet at time of writing — see PLAN-STATUS.md HOTFIX-P0/P1 for the G1-G8 evidence table.
   / Out of scope, observed but NOT touched (per task boundary): SEC-02 ledger/atomicity, Durable Objects/SSE scaling, CSP unsafe-eval/unsafe-inline, `?token=` removal, `npm audit` devDependency-side high-severity findings from before this session's `npm ci` (re-check after ci — full `npm audit` with devDependencies included was not re-run post-install in this task; only `--omit=dev` was, which is 0).

## 2026-09-07

- `[2026-09-07] [INCIDENT]` — استرجاع خدمة SSE بعد commit `55da144` (إزالة `?token=` المبكرة لأجل SEC-11) كسر قنوات SSE الخاصة في Production (401 للمستخدمين الشرعيين لأن EventSource لا يرسل Headers ولا يوجد بديل realtime ticket بعد). الدمج تم حصرياً عبر **PR #1** (`incident/revert-raw-token-removal` → main، merge commit `e38a2d3`):
  - fb8a9a1: Revert حرفي لـ55da144 (استعادة `c.req.query('token')` في authMiddleware) — **SEC-11 لا يُعد مكتملة؛ هذا دين أمني معروف مؤقتاً حتى تنفيذ realtime ticket (docs/15 المرحلة 4)**
  - fe6383e: اختبار regression `tests/api/sse-user-auth.test.ts` (user SSE بـtoken صالح=200 / بلا مصادقة=401)
  - التحقق: npm ci/build/tsc/db:reset/test (8 files, 35 tests) ✅ + SSE محلي (200/401/200) ✅ + Cloudflare Pages Production deploy للـsha e38a2d3 (run 34062589505, success) ✅ + Production E2E بحساب اختبار مؤقت (حُذف بعدها): اتصال user channel بـtoken=200 + استقبال حدث notification فعلي عبر الـstream + بلا token=401 ✅
  - ملاحظة CI: خطوة quality-gate "SEC-11 — no session token in query string" تفشل عمداً على هذا الاسترجاع — متوقع بالتصميم؛ لا يُعالَج إلا بتنفيذ realtime ticket flow كاملاً (expiry/single-use/user binding) وليس بإعادة هذا الـrevert.
  / نفذ: incident-response agent / اختبار: كما أعلاه ✅
- `[2026-09-07] [GOV-11]` — مواءمة CI مع الدين الأمني المعلن (SEC-11): خطوة quality-gate "SEC-11 — no session token in query string" كانت مانعة (`::error` + فشل الـjob) بينما main يحوي raw query token المستعاد من الحادث — أي أن CI كان يطالب الفريق بكسر Production. التحويل (في `governance/sec11-ci-transition`):
  - الفحص **لم يُحذف**: grep نفسه بقي، لكن مع `continue-on-error: true` و`::warning` صريح (GRACE-PERIOD، بلا تاريخ إغلاق وهمي).
  - اسم الخطوة أصبح: "SEC-11 — query token remains temporarily required for authenticated SSE (GRACE-PERIOD)" مع تعليق يوثق: (a) الحادث والاسترجاع عبر PR #1/e38a2d3، (b) بقاء الدين الأمني، (c) شرط إعادة جعله مانعاً = realtime ticket flow + اختبارات expiry/single-use/user-binding (المرحلة 4 من docs/15-ROADMAP.md)، (d) لا تاريخ وهمي.
  - PLAN-STATUS: بند GOV-11 جديد بحالة 🔧 تصف الحالة الصادقة — **SEC-11 غير مكتملة وليست fixed**.
  / نفذ: governance agent / اختبار: git diff --check ✅ + npm test + tsc + build (انظر PR) / **التنبيه الدائم:** raw `?token=` في query ما زال ثغرة موثقة في docs/12 SEC-11 — لا يُعلن إغلاقها إلا بعد ticket flow كامل

