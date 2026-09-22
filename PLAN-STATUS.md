


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

