# 12 — موجّهات الإصلاح الأمني والمالي

> **الجمهور:** المطوّر أو الوكيل الذي ينفّذ الإصلاح.
> **القاعدة:** كل بند يحمل الملف والسطر، والتوجيه، ومعيار قبول قابلاً للاختبار. **لا تُعلَن أي مهمة مكتملة بلا الاختبار المذكور.**
> **المرجع:** `docs/10-ARCHITECTURE-ASSESSMENT.md` §2 — للسياق والأدلة.

---

## ترتيب التنفيذ الملزم

الترتيب ليس تفضيلاً — كل مجموعة تحمي التي تليها:

```
المجموعة أ  (يوم 1–3)   إيقاف نزيف المال والوصول    SEC-01 → SEC-04
المجموعة ب  (أسبوع 1–2)  شبكة الأمان                  docs/13-TEST-STRATEGY.md
المجموعة ج  (أسبوع 3)   المصادقة والجلسات            SEC-05 → SEC-09
المجموعة د  (أسبوع 4–5)  الوقت الحقيقي                SEC-10 → SEC-11
```

> **لماذا لا تُصلَح الجلسات أولاً؟** نقل المصادقة إلى الكوكيز يلمس 113 مساراً. بلا اختبارات، هذا يكسر المنصة بصمت. أما المجموعة أ فإصلاحاتها موضعية ومحدودة الأثر، وتفقد المال **الآن**.

---

# المجموعة أ — إيقاف النزيف

## SEC-01 ✅ مسار إكمال التبرع محذوف (أُغلق في 8.G)

> **الحالة (8.G):** المسار محذوف بالكامل من `src/modules/api/donations/routes.ts`
> (لا كتلة `/:id/complete` إطلاقاً) + `markCompleted()` محذوفة من
> `DonationModel` (لا مبدّل حالة مالي يدوي متبقٍّ) + الجرد المعاد توليده
> (`docs/14-ROUTE-INVENTORY.md`) بلا أي صف `complete` + اختبار
> `tests/api/donations-security.test.ts` يفرض 404 لكل المتغيرات
> (بلا مصادقة/غريب/مالك/بلا transaction_id) مع بقاء التبرع `pending`.
> Stripe webhook هو سلطة الإكمال الوحيدة. لا شيء في العميل يستدعيه
> (`grep /complete` ⇒ صفر خارج الاختبارات والتوثيق).

**الملف (تاريخي):** `src/modules/api/donations/routes.ts:148-182` (الكتلة المحذوفة)

**المشكلة (تاريخية):** `POST /api/donations/:id/complete` بلا مصادقة، يقبل `transaction_id` من العميل، ويُعلِّم التبرع مكتملاً. أي شخص يزوّر تبرعاً بأمر `curl` واحد. وwebhook Stripe الصحيح موجود أصلاً في السطر 189 — فهذا المسار **باب خلفي حول حماية قائمة**.

**التوجيه:**

1. **احذف الكتلة `148-182` كاملة.** لا تُصلحها بإضافة مصادقة — إكمال الدفع حدث لا يملكه العميل ولا المستخدم.
2. تحقّق أن لا شيء في العميل يستدعيه:
   ```bash
   grep -rn "/complete" src/client src/modules/pages
   ```
3. في `markCompleted()` أضف حماية عدم التكرار: التبرع المكتمل لا يُعاد إكماله.
4. أزِل `paypal` من وسائل الدفع المقبولة حتى يُنفَّذ فعلياً:
   ```bash
   grep -rn "paypal" src/ --include=*.ts
   ```
   عرض وسيلة دفع غير منفَّذة يُنتج تبرعات معلّقة أبدياً.

**معيار القبول:**
- [x] `POST /api/donations/1/complete` ⇒ **404** (المسار غير موجود — 8.G)
- [x] اختبار: webhook بتوقيع صحيح ⇒ `completed`
- [x] اختبار: webhook بتوقيع خاطئ ⇒ 400 والحالة لم تتغيّر
- [x] اختبار: **نفس** الـwebhook مرتين ⇒ أثر مالي واحد (M4)
- [x] اختبار: التحقق من تطابق المبلغ والعملة ومعرّف التبرع

---

## SEC-02 🔴 تصحيح المحاسبة وفرض الذرّية

> **الحالة الحالية (مطابقة UNIT40 — 2026-11-03):** هذا القسم تاريخي كما كُتب أول مرة ويبقى للسياق. التنفيذ النشط ليس `0011_financial_integrity.sql` ولا جدول `financial_ledger`؛ هو `migrations/0019_ledger_entries.sql` + `0021_withdrawals_lifecycle.sql` + `0038_withdrawal_payout_snapshot.sql` مع `LedgerService`، وحقول `available/pending/on_hold/withdrawn` في `user_earnings` **لم تعد مسار الرصيد**. **نتيجة المطابقة: 3 EVIDENCED · 4 EQUIVALENT-EVIDENCED · 3 GAP — البند يبقى مفتوحاً** (G1/G2/G3 أدناه).

**الملف:** `src/models/WithdrawalRequestModel.ts:110-210`
**المخطط:** `migrations/0001_initial_schema.sql:273`

**المشكلة — ثلاث طبقات (وصف تاريخي):**

1. **خلل محاسبي:** `withdrawn` تُزاد لحظة **الطلب** لا لحظة **الصرف** (سطر 129). فالطلب المعلّق يُحتسب مالاً مسحوباً. و`reject`/`cancel` تعكسان بالطرح — فـ`withdrawn` ليست حقلاً تراكمياً بل عدّاداً متذبذباً، وأي تقرير مالي مبني عليها خاطئ.
2. **حقل مهدور:** `on_hold` معرَّف في المخطط ولا يُستخدم — وهو **بالضبط** الحقل المطلوب للطلبات المعلّقة.
3. **لا ذرّية:** خطوتان منفصلتان (خصم، ثم إنشاء) مع rollback يدوي في `catch`. موت الـWorker بينهما ⇒ **خُصم المال ولا يوجد طلب**. مال يتلاشى بلا خطأ ولا سجل.

> لا تُقرأ هذه الطبقات كوصف للكود الحالي؛ ما تحقق من كل طبقة بالدليل في «مطابقة UNIT40» أسفل معايير القبول.

**التوجيه:**

نموذج الحالة الصحيح:

| الحركة | `available` | `on_hold` | `withdrawn` |
|---|---|---|---|
| طلب سحب | `− amount` | `+ amount` | — |
| موافقة (صرف فعلي) | — | `− amount` | `+ amount` |
| رفض | `+ amount` | `− amount` | — |
| إلغاء المستخدم | `+ amount` | `− amount` | — |

**خطوات التنفيذ الأصلية (تاريخية — نُفِّذت ببديل مكافئ):**

1. **ترحيل جديد** `migrations/0011_financial_integrity.sql`:
   - قيود `CHECK (available >= 0 AND on_hold >= 0 AND withdrawn >= 0)`
   - جدول `financial_ledger` **append-only**: `user_id, entry_type, amount, balance_before, balance_after, ref_type, ref_id, idempotency_key UNIQUE, created_at`
   - ترحيل بيانات: تصحيح `withdrawn`/`on_hold` للطلبات المعلّقة الحالية
2. **كل تحويل في `db.batch([...])` واحد.** احذف نمط rollback اليدوي.
3. أضف `on_hold` إلى كل واجهة تعرض الرصيد — المستخدم يجب أن يرى «قيد المعالجة».
4. `approve()` تُنفّذ التحويل المالي (حالياً تغيّر الحالة فقط).
5. اقرأ الرصيد وحدّثه **داخل** نفس الـbatch بشرط `WHERE available >= ?` — لا فحص ثم تحديث (سباق).

> **تاريخي:** لم تُنشأ `migrations/0011_financial_integrity.sql` ولا جدول `financial_ledger`. البديل النشط هو دفتر `ledger_entries` (0019) + دورة السحب (0021) + لقطة الصرف (0038)، والحجز/التحرير عبر `LedgerService` بـ`tx_id`.

**معيار القبول (محدَّث بمطابقة UNIT40):**

- [x] **C1 — EQUIVALENT-EVIDENCED:** الثابت الفعلي هو `Σdebit − Σcredit = 0` على `ledger_entries` (لا مجموع حقول `user_earnings`). الدليل: `src/lib/services/LedgerService.ts:261-278`. الاختبار: `tests/api/ledger-invariant.test.ts` ← «1. every movement writes a balanced pair» و«2. verifyInvariant() = 0 after 100 random movements» — نجحا ضمن **16/16**.
- [x] **C2 — EVIDENCED:** سحب يتجاوز الرصيد ⇒ رفض `insufficient_balance` والرصيد لم يتغيّر. الدليل: `LedgerService.ts:210-237` (INSERT شرطي). الاختبار: `tests/api/withdrawals-lifecycle.test.ts` ← «1. withdraw more than balance…» + `ledger-invariant` ← «3. withdrawal exceeding balance…» — **16/16**.
- [x] **C3 — EVIDENCED:** طلبان متزامنان ⇒ واحد فقط ينجح. الدليل: نفس حارس SQL الذري `LedgerService.ts:210-237`. الاختبار: `withdrawals-lifecycle` ← «2. two concurrent full-balance withdrawals…» + `ledger-invariant` ← «5. 20 concurrent movements…» — **16/16**.
- [x] **C4 — EQUIVALENT-EVIDENCED:** طلب ← رفض ⇒ رصيد المستخدم في الدفتر يعود إلى قيمته الابتدائية بالضبط ويُكتب قيد تحرير عكسي (debit للمستخدم + credit للمنصة) بدل تصفير حقل `on_hold`. الدليل: `WithdrawalRequestModel.ts:307-319`. الاختبار: `withdrawals-lifecycle` ← «5. reject ⇒ full balance restored…» — **16/16**.
- [ ] **C5 — GAP (SEC-02-G2):** لا وجود لعدّاد `on_hold`/`withdrawn` محدَّث: `user_earnings` لا يُكتب في المسار النشط، و`/api/withdrawals` يقرأ `on_hold` و`withdrawn` من الصف القديم فيعيدهما صفراً. الدليل: `migrations/0001_initial_schema.sql:273-281` + `src/controllers/WithdrawalController.ts:68-83`. المسبار: `tests/api/tmp-unit40-gap-probe.test.ts` ← «G2» — **4/4** (حُذف بعد التشغيل).
- [x] **C6 — EVIDENCED:** `available` لا يصبح سلبياً: الشرط في SQL نفسه (`WHERE (SELECT SUM…) >= ?`) وليس فحص JS. الدليل: `LedgerService.ts:210-237`. الاختبار: `ledger-invariant` ← «3» و«5» — **16/16**.
- [x] **C7 — EQUIVALENT-EVIDENCED:** كل حركة **مالية** تُنتج قيدين متوازنين في `ledger_entries` (لا `financial_ledger`)، والموافقة/الصرف تغيير حالة بلا قيد مالي جديد (المال حُجز عند الطلب). الدليل: `WithdrawalRequestModel.ts:231-254` (approve بلا ledger) + `LedgerService.ts:103-162`. الاختبار: `ledger-invariant` ← «1» و«4» + `withdrawals-lifecycle` ← «6» — **16/16**.

**الإجمالي: 3 EVIDENCED (C2, C3, C6) · 4 EQUIVALENT-EVIDENCED (L1, C1, C4, C7) · 3 GAP (L2→G2، L3→G3، C5→G2).**

> **تحديث UNIT41 (2026-11-04):** الفجوات الثلاث G1/G2/G3 **أُغلقت بالكود والاختبارات** — انظر «مطابقة UNIT41 — إغلاق فجوات SEC-02» أدناه. التصنيف أعلاه تاريخي على أساس UNIT40 ولا يُقرأ كحالة حالية.

> **أخطر بند في المشروع.** لا تُصلح المجموعة ج قبله.

### مطابقة UNIT40 — تصنيف SEC-02 بالدليل (2026-11-03)

> **نطاق:** توثيق فقط. لا كود ولا مخطط ولا اختبار ملتزم ولا إصلاح مال في هذه الوحدة. لم يُعَد فتح أي مسار مالي مغلق (8.A / 8.D / #94 / 36.1)، ولم يوجد عيب مثبت فيها.
> **الأساس:** `062600e5fce53921483f56d94d55069de4ed6847` (دمج PR #154 / UNIT39).
> **الطريقة:** قراءة المسار النشط والترحيلات، ثم تشغيل الاختبارات المسمّاة أدناه على هذا الأساس.

**الاصطلاحات:**
- `EVIDENCED`: السلوك المطلوب موجود حرفياً ويثبته اختبار نُفِّذ.
- `EQUIVALENT-EVIDENCED`: السلوك محقَّق بمعمارية مختلفة مثبتة (دفتر أستاذ بدل حقول الرصيد القديمة)، مع فرق موثق.
- `GAP`: غير محقَّق أو غير قابل للإثبات؛ يبقى مفتوحاً.

#### جدول التصنيف الموحَّد (10 بنود)

| البند | التصنيف | الدليل (file:line) | الاختبار / النتيجة |
|---|---|---|---|
| L1 — `withdrawn` لحظة الطلب | EQUIVALENT-EVIDENCED | `src/models/WithdrawalRequestModel.ts:200-207`؛ لا كتابة في `user_earnings` (`:12`)؛ النموذج القديم `src/models/EarningsModel.ts` كان بلا مستورد (حُذف في UNIT41) | كل اختبارات الحزمتين (7 + 9) = **16/16** |
| L2 — `on_hold` مهجور | **GAP — SEC-02-G2** (أُغلقت في UNIT41) | `migrations/0001_initial_schema.sql:273-281`؛ القراءة `src/controllers/WithdrawalController.ts:68-83` | مسبار «G2» (ضمن **4/4**) |
| L3 — لا ذرّية | **GAP — SEC-02-G3** (أُغلقت في UNIT41) | `WithdrawalRequestModel.ts:187-197` ثم `:200-207` ثم `:222`؛ `:307-308` | مسبار «G3a» و«G3b» (ضمن **4/4**) |
| C1 — ثابت الرصيد | EQUIVALENT-EVIDENCED | `src/lib/services/LedgerService.ts:261-278` | `ledger-invariant` 1، 2 |
| C2 — تجاوز الرصيد | EVIDENCED | `LedgerService.ts:210-237` | `withdrawals-lifecycle` 1 + `ledger-invariant` 3 |
| C3 — تزامن | EVIDENCED | `LedgerService.ts:210-237` | `withdrawals-lifecycle` 2 + `ledger-invariant` 5 |
| C4 — طلب ← رفض | EQUIVALENT-EVIDENCED | `WithdrawalRequestModel.ts:307-319` | `withdrawals-lifecycle` 5 |
| C5 — `withdrawn`/`on_hold` بعد الموافقة | **GAP — SEC-02-G2** (أُغلقت في UNIT41) | `WithdrawalController.ts:68-83`؛ `WithdrawalRequestModel.ts:231-254` | مسبار «G2» |
| C6 — `available` سالب | EVIDENCED | `LedgerService.ts:210-237` | `ledger-invariant` 3، 5 |
| C7 — سطر لكل حركة | EQUIVALENT-EVIDENCED | `LedgerService.ts:103-162`؛ `WithdrawalRequestModel.ts:231-254` | `ledger-invariant` 1، 4 + `withdrawals-lifecycle` 6 |

**الإجمالي:** 3 EVIDENCED · 4 EQUIVALENT-EVIDENCED · 3 GAP.

#### الفجوات المفتوحة في UNIT40 (أُغلقت كلها في UNIT41 — محفوظة كسجل تاريخي)

**SEC-02-G1 — خارج البنود العشرة — `/api/earnings` معطّل:**
- `GET /api/earnings` ⇒ **500** `{"error":"Failed to fetch earnings"}` وسجل `no such column: status` (مسبار «G1»). السبب: `AdvertisementModel.EarningsModel` يستعلم عن `status` و`amount` في `src/models/AdvertisementModel.ts:683-685` و`:708-718`، و`competition_id`/`created_at` في `:723-731` — وكلها غير موجودة في `user_earnings` (`migrations/0001_initial_schema.sql:273-281`). المسار مربوط في `src/main.ts:198`.
- `/history` و`/competition/:id` تستخدمان نفس الأعمدة المفقودة (`src/modules/api/earnings/routes.ts:55-56`، `:82-85`)؛ لم يُشغَّلا في المسبار، والاستنتاج من الاستعلام نفسه لا من تشغيل.
- لا عميل يستدعي هذه النقاط: `src/modules/pages/earnings-page.ts:228-229` يقرأ `/api/withdrawals`. الأثر الحالي API ميت، لا واجهة مستخدم.
- **لا إصلاح في UNIT40.** الإصلاح يحتاج قرار مالك: حذف النقاط الميتة أو إعادة كتابتها على `ledger_entries`.

**SEC-02-G2 — `on_hold` و`withdrawn` غير محدَّثين:**
- `user_earnings` يُقرأ في `WithdrawalController.ts:68-83` (السطور التاريخية قبل UNIT41) لكن لا يُكتب في المسار النشط؛ كل كتاباته كانت في `src/models/EarningsModel.ts` الميت (حُذف في UNIT41).
- الأثر المثبت (مسبار «G2»): بعد حجز 60$، `/api/withdrawals` يعيد `available: 4000` (من الدفتر) مع `on_hold: 0` و`withdrawn: 0` (من الصف القديم). المستخدم يرى «قيد المعالجة = 0» رغم أن المال محجوز، و`withdrawn` يبقى صفراً بعد الصرف.
- ليس فقدان مال؛ عيب عرض/تقارير. الإصلاح: إما حساب `on_hold`/`withdrawn` من الدفتر، أو كتابة الحقول في نفس الحركة — قرار مالي خارج نطاق هذه الوثيقة.

**SEC-02-G3 — نافذتا انهيار بلا استرداد:**
- التسلسل: إنشاء صف الطلب `WithdrawalRequestModel.ts:187-197` ← حجز الدفتر `:200-207` ← تحديث `hold_tx_id` `:222`. ثلاث كتابات منفصلة، لا `db.batch` واحداً.
- نافذة (أ): موت بعد إنشاء الصف وقبل الحجز ⇒ طلب `requested` بلا حجز. `approve()` `:231-254` يغيّر الحالة إلى `paid` بلا أي قيد مالي ⇒ **صرف بلا خصم** (مسبار «G3a»: الصف أصبح `paid` ورصيد المستخدم 10000 بلا قيود).
- نافذة (ب): موت بعد الحجز وقبل `hold_tx_id` ⇒ `releaseHold` يعود مبكراً `:307-308`، فلا يُكتب قيد التحرير عند الرفض/الإلغاء ⇒ **مال محجوز إلى الأبد** (مسبار «G3b»: بعد الرفض بقي الرصيد 4000 وصفر قيود تحرير).
- لا مهمة استرداد أو مصالحة: البحث عن `hold_tx_id` لا يجد أي مستهلك خارج النموذج/الترحيل/اختبار واحد.
- **أخطر فجوة مالية متبقية.** الإصلاح يحتاج معاملة ذرية واحدة أو مهمة تعويض/مصالحة — ليس في UNIT40.

#### حدود الإثبات

- المسبار `tests/api/tmp-unit40-gap-probe.test.ts` كان مؤقتاً: **4/4** ثم حُذف قبل الالتزام؛ لا ملف اختبار جديد في هذا الـPR.
- الاختبارات الملتزمة أعلاه تعمل على `SqliteD1` (محرك SQL الحقيقي) لكنها ليست إنتاجاً. لا وصول إنتاج ولا كتابة إنتاج في UNIT40.
- `EVIDENCED` هنا يعني «مثبت على BASE المذكور»، لا «مغلق نهائياً»: أي تراجع لاحق في الملفات نفسها يعيد الفجوة.

---

### مطابقة UNIT41 — إغلاق فجوات SEC-02 (2026-11-04)

> **الأساس:** `7b90838c619462ea40f0750d4bcff78f511b4670` (دمج PR #155 / UNIT40). **الحالة:** LOCAL VERIFIED / REMOTE PENDING.
> **النطاق:** G3 ثم G2 ثم G1 فقط. لم يُعَد فتح 8.A / 8.D / #94 / 36.1 ولا أي مسار مالي مغلق آخر.
> **قرار G1 القيادي:** المسارات الثلاثة ميتة (500، صفر مستهلك حي؛ `earnings-page` يقرأ `/api/withdrawals`) ⇒ حذفها وحذف كود `EarningsModel` الميت. تم التحقق من عدم وجود مستهلك قبل الحذف.

**SEC-02-G3 — مغلقة (fail-closed + استرداد حتمي من الدفتر):**
- `approve()` لم يعد ينتقل إلى `paid` بلا إثبات حجز قائم. الحارس داخل عبارة `UPDATE` نفسها في `src/models/WithdrawalRequestModel.ts:254-293`: صافي قيود المستخدم لهذا المرجع (`ref_type='withdrawal_request'`, `ref_id`) يجب أن يغطي `amount_cents + fee_cents`. بعد أي تحرير يصبح الصافي 0 فيفشل الحارس. طلب بلا حجز ⇒ 0 صفوف متغيرة ⇒ 409، والحالة والرصيد لا يتغيران، ولا يُكتب تدقيق دفع.
- `releaseHold()` لم يعد يعتمد على `hold_tx_id` ولا يعود مبكراً عندما يكون `NULL`. يشتق الحجز من `ledger_entries` (دائن حساب المستخدم بنفس المرجع) في `WithdrawalRequestModel.ts:355-379`، ويعكس **مبلغ الحجز الفعلي** (بما فيه الرسوم) لا `row.amount_cents`. إعادة التحرير بنفس `tx_id` الحتمي ⇒ no-op (M4).
- صف `requested` بلا حجز صار قابلاً للرفض/الإلغاء بأمان (تغيير حالة فقط، بلا قيد)، ومستحيل الدفع.
- الاختبارات الملتزمة: `tests/api/sec-02-g3-crash-windows.test.ts` (7 اختبارات: نافذة أ approve/reject/cancel، نافذة ب مع `hold_tx_id=NULL`، رسم غير صفري، approve على حجز قائم، ومنع الدفع بعد تحرير).

**SEC-02-G2 — مغلقة (اشتقاق من الدفتر حصراً):**
- `WithdrawalRequestModel.getWalletSummary()` في `src/models/WithdrawalRequestModel.ts:412-445` يشتق: `available` من `LedgerService.balance()`، و`on_hold` = صافي الحجز الموجب للطلبات غير المدفوعة، و`withdrawn` = صافي الحجز للطلبات `paid`، و`pending = 0`، و`total = available + on_hold + withdrawn`. كل القيم بالسنت (نفس وحدة `available` الحالية).
- `WithdrawalController.getMyWithdrawals()` في `src/controllers/WithdrawalController.ts:56-79` يستدعي النموذج فقط؛ أُزيل استعلام `user_earnings` من المتحكم. لا كتابة مزدوجة على `user_earnings`.
- الحالة `rejected` التي لم يصلها قيد التحرير بعد (نافذة انهيار) تظهر في `on_hold` ما دام المال محجوزاً فعلاً، ثم تصبح 0 بعد الاستشفاء — لا يختفي مال من العرض.
- الاختبارات: `tests/api/sec-02-g2-wallet-summary.test.ts` (6 اختبارات: تجاهل `user_earnings` القديمة، requested/approved، rejected، paid مرة واحدة، حالة انهيار، ومسار `/api/withdrawals`).

**SEC-02-G1 — مغلقة (حذف الميت):**
- حُذف `GET /api/earnings` و`/history` و`/competition/:id` مع ملف `src/modules/api/earnings/routes.ts`، وحُذف `src/models/EarningsModel.ts` و`AdvertisementModel.EarningsModel` و`UserEarnings` ومستورد `AdminController.ts:8` الميت. جرد المسارات أُعيد توليده: **262 → 259** (`docs/14-ROUTE-INVENTORY.md`).
- لا مستهلك حي: `src/modules/pages/earnings-page.ts:228-229` يقرأ `/api/withdrawals`، والصفحة تعمل.
- الاختبار: `tests/api/sec-02-g1-dead-earnings-routes.test.ts` (النقاط الثلاث 404 مقصود بلا أثر مالي، و`/api/withdrawals` + صفحة `/earnings` بلا انحدار).

#### حزمة اختبارات SEC-02 (SEC-02 test bundle)

الاسم المرجعي في هذا المستند: **حزمة اختبارات SEC-02**. ملفاتها:

1. `tests/api/ledger-invariant.test.ts`
2. `tests/api/withdrawals-lifecycle.test.ts`
3. `tests/api/sec-02-g1-dead-earnings-routes.test.ts`
4. `tests/api/sec-02-g2-wallet-summary.test.ts`
5. `tests/api/sec-02-g3-crash-windows.test.ts`
6. `tests/api/withdrawal-path-smoke.test.ts`

أمر واحد:

```bash
npx vitest run tests/api/ledger-invariant.test.ts tests/api/withdrawals-lifecycle.test.ts tests/api/sec-02-g1-dead-earnings-routes.test.ts tests/api/sec-02-g2-wallet-summary.test.ts tests/api/sec-02-g3-crash-windows.test.ts tests/api/withdrawal-path-smoke.test.ts
```

**النتيجة على HEAD النهائي:** 6 ملفات / **32 اختباراً خضراء** (2026-11-04). الـsmoke مسار كامل: طلب ⇒ حجز صحيح ⇒ رفض يعيد الكل ⇒ موافقة ⇒ paid مرة واحدة ⇒ تجاوز رصيد 422 بلا أثر.

#### حدود الإثبات (G1–G3)

- كل الاختبارات على `SqliteD1` بترحيلات الإنتاج الحقيقية — لا إنتاج ولا حسابات حية ولا مال حقيقي.
- الوحدة سنت في كل حقول المحفظة؛ `withdrawn` يساوي مبلغ الحجز الفعلي (`amount_cents + fee_cents`). سياسة الرسوم الحالية صفر (`WITHDRAWAL_FEE_CENTS = 0`)، لذا يساوي الأصل اليوم.
- الصفوف السابقة للدفتر (legacy) بلا قيود تساهم 0 في `on_hold`/`withdrawn`، ولا يمكن دفعها (approve fail-closed) لكن يمكن رفضها/إلغاؤها.
- القيود اليتيمة بلا صف طلب (أو لطلب محذوف) لا تدخل مجاميع المحفظة.
- `pending = 0` عمداً: لا مصدر قيود «معلّقة» في العقد الحالي.
- هذا إثبات محلي (LOCAL VERIFIED)؛ المراجعة المالية REMOTE وما بعد الدمج تبقى مطلوبة.

---

## SEC-03 🔴 مصادقة خادمية لنقاط الفيديو

**الملف:** `src/modules/api/chunks/routes.ts:25-40, 96, 133`

**المشكلة:** الحماية بترويسة `Origin`/`Referer` — وكلتاهما يضبطهما العميل. `curl -H "Origin: https://allowed.com"` يمرّ. و`DELETE /:key` محمي بها ⇒ **حذف فيديو بلا مصادقة**.

خلل ثانٍ: `origin.startsWith(allowed)` يجعل `https://dueli.maelshpro.com.attacker.net` يمرّ.

**التوجيه:**

1. توقيع HMAC-SHA256 خادم-لخادم بسرّ `UPLOAD_SERVER_SECRET`:
   - ترويسات: `X-Signature`, `X-Timestamp`, `X-Nonce`
   - الرسالة: `method + path + timestamp + nonce + bodyHash`
   - رفض `timestamp` أقدم من 5 دقائق
   - `nonce` يُخزَّن لمنع الإعادة
   - مقارنة **ثابتة الزمن** — لا `===` على النصوص السرّية
2. إن بقي فحص Origin كطبقة ثانية: **مطابقة تامة**، لا `startsWith`.

**معيار القبول:**
- [ ] اختبار: طلب بـ`Origin` مزوّر وبلا توقيع ⇒ 403
- [ ] اختبار: توقيع صحيح ⇒ 200
- [ ] اختبار: إعادة نفس التوقيع والـnonce ⇒ 403
- [ ] اختبار: توقيع عمره 6 دقائق ⇒ 403
- [ ] اختبار: `Origin: https://dueli.maelshpro.com.evil.net` ⇒ 403

---

## SEC-04 🔴 نقل سرّ الـcron إلى الترويسة

**الملف:** `src/modules/api/cron/routes.ts:20-30`

**المشكلة:** `?key=SECRET` يُسجَّل في كل سجلات الطلبات والوسائط. والمسار يشغّل **توزيع الأرباح** ⇒ تسريبه = تشغيل المحرك المالي عند الطلب.

**التوجيه:**
1. `Authorization: Bearer <CRON_SECRET>` فقط. أزِل قراءة `query('key')`.
2. مقارنة ثابتة الزمن.
3. `POST` فقط — `GET` قابل للتشغيل من متصفح أو زاحف.
4. حدّ تنفيذ: لا تشغيلان متزامنان (قفل في D1) — لمنع توزيع مزدوج.
5. سجّل كل تشغيل: وقت، مدة، عدد المهام المنفَّذة.

**معيار القبول:**
- [ ] اختبار: `?key=...` ⇒ 401
- [ ] اختبار: `GET` ⇒ 405
- [ ] اختبار: `Bearer` صحيح ⇒ 200
- [ ] اختبار: تشغيلان متزامنان ⇒ توزيع واحد فقط

---

# المجموعة ج — المصادقة والجلسات

> **شرط مسبق:** اختبارات المجموعة ب للمسارات المتأثرة موجودة وتمرّ.

## SEC-05 🔴 تقييد CORS

**الملف:** `src/main.ts:71` — `app.use('/api/*', cors())`

**المشكلة:** `cors()` بلا إعدادات ⇒ `Access-Control-Allow-Origin: *`. أي موقع يستدعي الـAPI. وهذا يُبطل عملياً `csrfProtection()` في السطر 83.

**التوجيه:** قائمة بيضاء من `ALLOWED_ORIGINS`، `credentials: true`، وتحديد `allowMethods`/`allowHeaders` صريحاً. الـorigin غير المصرَّح لا يحصل على ترويسة CORS إطلاقاً.

> **الحالة (UNIT30.3):** منفَّذ في `src/main.ts` بقائمة افتراضية + `ALLOWED_ORIGINS`. الحارس القديم `grep -n "cors()"` كان يطابق تعليق الشرح نفسه، فاستُبدل بفحص AST مانع (`node dev-tools/check-sec-guards.mjs sec05`) يحلل نداءات `cors()` التنفيذية فقط. اختبارات السلوك: `tests/api/sec-guards.test.ts` (4 حالات CORS). القبول الإنتاجي المشترك مؤجل إلى بوابة UNIT30–30.3.

**معيار القبول:**
- [x] اختبار: `Origin: https://evil.com` ⇒ لا ترويسة CORS
- [x] اختبار: origin مصرَّح ⇒ ترويسة صحيحة، وليست `*`
- [x] اختبار: preflight يعمل للمصرَّح

---

## SEC-06 🔴 توليد عشوائي آمن

**الملفات:** `src/middleware/security.ts:265` (**رمز CSRF**), `src/modules/api/chunks/routes.ts:18`

**المشكلة:** `Math.random()` ليس آمناً تعمّية. الأخطر أن أحد الاستخدامين هو **توليد رمز CSRF** ⇒ الحماية نفسها قابلة للتنبؤ، فهي شكلية.

**التوجيه:** دالة موحّدة في `src/lib/CryptoUtils` تستخدم `crypto.getRandomValues()`، وتُستدعى في الموضعين. اترك استخدامات `Math.random` غير الأمنية (معرّفات DOM في `competition-section.ts:21`) — لكن أضف تعليقاً يوضح أنها غير أمنية.

**معيار القبول:**
- [ ] `grep -rn "Math.random" src/middleware src/lib src/modules/api` ⇒ صفر
- [ ] اختبار: 10,000 رمز مولَّد ⇒ صفر تكرار
- [ ] فحص CI يمنع عودة النمط (§4)

---

## SEC-07 🔴 توحيد مفتاح الجلسة

**الملفات:** `AuthService.ts` يستخدم `sessionId`؛ `admin-dashboard-page.ts:168` و`advertiser-portal-page.ts:105,127,132,133` تستخدم `session_id`

**المشكلة:** **مفتاحان مختلفان لنفس الشيء.** من يدخل عبر التدفّق العادي لا يجد `session_id`، فلوحة الأدمن والمعلن تريانه غير مسجّل. هذا يفسّر أعراض «خروج غامض».

**التوجيه:** مفتاح واحد. نقطة وصول واحدة (`AuthService`) — لا قراءة مباشرة من `localStorage` في الصفحات. هذه خطوة تحضيرية لـSEC-08، ومنفصلة عنها لتقليل حجم المخاطرة.

> **الحالة (UNIT30.3):** منفَّذ: `sessionId` هو المفتاح القانوني في الخادم والعميل، و`session_id` القديم لا يُقرأ إلا كمسار هجرة محدود في `SessionAccess` (قراءة/إزالة فقط). حارس AST مانع (`node dev-tools/check-sec-guards.mjs sec07`) يرفض أي استخدام تنفيذي لـ`session_id` في middleware/controllers/auth/pages، ويتجاهل تعليقات التوثيق وأعمدة قاعدة البيانات المختلفة. اختبار السلوك: كوكي `session_id` صالحة تبقى مجهولة (200/user:null) في `tests/api/sec-guards.test.ts`.

**معيار القبول:**
- [x] `grep -rn "session_id'" src/modules/pages` ⇒ صفر (مُستبدل بحارس AST الأوسع)
- [x] `grep -rn "localStorage.getItem('sessionId')" src/modules/pages` ⇒ صفر (عبر `AuthService` فقط)
- [ ] E2E: دخول ⇒ لوحة الأدمن تتعرّف على الجلسة (تغطية API قائمة في `tests/api/sec08-httponly-session.test.ts`؛ E2E متصفح مؤجل)
- [ ] E2E: دخول ⇒ بوابة المعلن تتعرّف على الجلسة (نفس الملاحظة)

---

## SEC-08 🔴 نقل الجلسة إلى كوكي HttpOnly

**الملفات:** `AuthService.ts:38,70,93,162,241,467`, `ApiClient.ts:31`, و16 موضعاً في `src/modules/pages/*`

**المشكلة:** الجلسة في `localStorage` مقروءة لأي سكربت. ومع CSP تسمح بـ`unsafe-inline`/`unsafe-eval` (SEC-09) فأي XSS = سرقة حساب كاملة. و`window.sessionId` مكشوف عالمياً في `competition-page.ts:470`.

**التوجيه — على مراحل، لا دفعة واحدة:**

1. الخادم يُصدر `Set-Cookie: sessionId=...; HttpOnly; Secure; SameSite=Lax; Path=/`
2. **دوّر معرّف الجلسة بعد الدخول** (منع session fixation)
3. المرحلة الانتقالية: الخادم يقبل الكوكي **و**الـBearer معاً
4. حوّل العميل إلى `credentials: 'include'` وأزِل قراءة الرمز
5. فعّل CSRF حقيقياً — الكوكيز تجعله ضرورياً (double-submit أو رمز في الجلسة)
6. **أزِل** قبول الـBearer بعد التحقق، وأزِل `window.sessionId`
7. الخادم لا يعيد رمز الجلسة في أي جسم استجابة

> **الحالة (UNIT30.3):** منفَّذ: كوكي `sessionId` بـ`HttpOnly; Secure (HTTPS); SameSite=Lax; Path=/`، تدوير عند الدخول، CSRF double-submit، وBearer لغير المتصفح فقط. الهجرة القديمة محدودة في `SessionAccess` (قراءة/إزالة) ولا تُكتب أي جلسة إلى `localStorage`. الحارس القديم `grep -rn "localStorage.*[sS]ession"` كان يطابق تعليقات/نصوصاً ولا يسمح بالمسار الانتقالي، فاستُبدل بفحص AST (`node dev-tools/check-sec-guards.mjs sec08`) يسمح بالقراءة/الإزالة داخل `SessionAccess` فقط ويرفض الكتابة دائماً. اختبارات السلوك: `tests/api/sec08-httponly-session.test.ts` + `tests/api/sec-guards.test.ts` + `tests/client/session-access.test.ts`.

**معيار القبول:**
- [x] `grep -rn "localStorage.*[sS]ession" src/` ⇒ صفر (مُستبدل بحارس AST الذي يسمح بالهجرة المحدودة)
- [x] `grep -rn "window.sessionId" src/` ⇒ صفر
- [x] اختبار: الاستجابة لا تحتوي الرمز في الجسم
- [x] اختبار: طلب تغيير حالة بلا رمز CSRF ⇒ 403
- [x] اختبار: معرّف الجلسة تغيّر بعد الدخول
- [ ] E2E: كل الأدوار السبعة تعمل بالكوكيز (تغطية API للأدوار قائمة؛ E2E متصفح مؤجل)

---

## SEC-09 🟠 تشديد CSP

**الملف:** `src/middleware/security.ts:128-135`

**المشكلة:** `'unsafe-inline'` و`'unsafe-eval'` في `script-src` ⇒ CSP لا تمنع XSS فعلياً.

**التوجيه:**
1. ابدأ بـ`'unsafe-eval'` — أسهل، وغالباً غير مستخدم أصلاً. تحقّق: `grep -rn "eval(\|new Function" src/`
2. للسكربتات المضمّنة: أخرجها إلى ملفات، أو استخدم nonce لكل طلب
3. أضف `Report-Only` أولاً واجمع الانتهاكات قبل الفرض

**معيار القبول:**
- [ ] `'unsafe-eval'` محذوف والموقع يعمل
- [ ] خطة موثّقة لحذف `'unsafe-inline'`
- [ ] لا انتهاك CSP في وحدة تحكّم المتصفح على المسارات الرئيسية

---

# المجموعة د — الوقت الحقيقي

## SEC-10 🟠 إصلاح Durable Object بعد الـhibernation

**الملف:** `workers/dueli-realtime/src/index.ts:28,66,107,120,124`

**المشكلة:** الكود يستخدم `state.acceptWebSocket()` (يفعّل Hibernation) لكنه يبثّ من `this.sockets` — مجموعة في الذاكرة. بعد الإيقاظ تُبنى نسخة جديدة و`sockets` **فارغة** بينما الاتصالات حيّة. النتيجة: **البث يتوقف بصمت** — لا خطأ ولا سجل.

**التوجيه:** استخدم `this.state.getWebSockets()` في كل بثّ. احذف `this.sockets` نهائياً — الاحتفاظ بها كنسخة موازية يعيد الخلل. البيانات المرتبطة بكل اتصال تُخزَّن عبر `serializeAttachment()`.

> **الحالة (UNIT30.3):** منفَّذ في `workers/dueli-realtime/src/index.ts`: البثّ من `state.getWebSockets()` والاستقبال عبر `state.acceptWebSocket()`، ولا وجود لـ`this.sockets` تنفيذياً. الحارس القديم `grep -n "this.sockets" workers/` كان يطابق تعليق الشرح في رأس الملف، فاستُبدل بفحص AST مانع (`node dev-tools/check-sec-guards.mjs sec10`) يتجاهل التعليقات والنصوص. اختبار السلوك `tests/workers/sec10-realtime.test.ts` يثبت الوصول بعد إيقاظ (نسخة جديدة/نفس الحالة) وعدّ التسليم. **Worker لم يُنشَر ولم يُفعَّل (`REALTIME_WS_URL` غير مطلوب)؛ الـDO النشط والقبول الإنتاجي مؤجلان إلى البوابة المشتركة.**

**معيار القبول:**
- [x] `grep -n "this.sockets" workers/` ⇒ صفر (مُستبدل بحارس AST)
- [x] اختبار: بثّ بعد الإيقاظ يصل لكل الاتصالات (محاكاة حالة DO)
- [ ] اختبار: إعادة اتصال بعد قطع الشبكة بلا تكرار رسائل (يتطلب worker منشوراً/بيئة حية)
- [ ] اختبار: غرفتان متزامنتان معزولتان (مؤجل مع القبول الإنتاجي)

---

## SEC-11 🟠 تذكرة اتصال بدل الرمز في الـURL

**الملفات:** `src/middleware/auth.ts:31`, `src/client/services/SseService.ts:57,96`

**المشكلة:** `?token=<session>` يُسجَّل في سجلات Cloudflare، سجل المتصفح، ترويسة `Referer`، وأي proxy. المبرّر في الكود صحيح (`EventSource` لا يرسل ترويسات) لكن الحل خاطئ.

**التوجيه:**
1. `POST /api/realtime/ticket` (مصادقة عادية) ⇒ تذكرة: عمر 60 ثانية، استخدام واحد، مرتبطة بـ`(user_id, channel)`
2. SSE/WS يقبلان التذكرة فقط، ويحذفانها عند الاستهلاك
3. **أزِل `c.req.query('token')` من `authMiddleware`** — هذه هي الخطوة التي تُغلق الثغرة فعلاً

> **الحالة (UNIT30.3):** منفَّذ: `authMiddleware` لا يقرأ `?token=` إطلاقاً (Bearer أو `sessionId` فقط)، وSSE يستخدم تذكرة أحادية عبر `POST /api/realtime/ticket`. `verify-page.ts` يحتفظ بـ`?token=` لتحقق البريد لمرة واحدة، وهو خارج نطاق جلسة المصادقة. الحارس القديم لـSEC-11 كان `GRACE-PERIOD` تحذيرياً؛ أصبح فحص AST مانعاً (`node dev-tools/check-sec-guards.mjs sec11`) على middleware وصفحة الملف الشخصي، مع اختبار سلوك يثبت أن رمز جلسة صالحاً في `?token=` يعيد 401.

**معيار القبول:**
- [x] `grep -n "query('token')" src/middleware/auth.ts` ⇒ صفر (مُستبدل بحارس AST)
- [x] اختبار: تذكرة مستهلكة ⇒ 401 (`tests/api/sse-ticket.test.ts`)
- [x] اختبار: تذكرة عمرها 61 ثانية ⇒ 401 (`tests/api/sse-ticket.test.ts`)
- [x] اختبار: تذكرة مستخدم آخر ⇒ 403 (`tests/api/sse-ticket.test.ts`)
- [x] اختبار: رمز الجلسة الخام في `?token=` ⇒ 401 (`tests/api/sec-guards.test.ts`)

---

## SEC-12 🟠 Rate limiting موزَّع

**الملفات:** `src/middleware/rate-limit.ts:14`, `src/middleware/security.ts:12` (**مكرّران**)

**المشكلة:** مخزنان منفصلان، كلاهما `Map` في الذاكرة. على Workers الذاكرة غير مشتركة بين 300+ موقع حافة وتُمحى مع تدوير الـisolate ⇒ حدّ «10 محاولات دخول/15 دقيقة» يُتجاوز بتغيير موقع الاتصال. **حماية الدخول من التخمين معدومة.**

**التوجيه:**
1. احذف أحد المخزنين المكرّرين — تنفيذ واحد.
2. جدول `rate_limits (key, window_start, count)` في D1 بـ`PRIMARY KEY (key, window_start)`، وزيادة ذرّية بـ`INSERT ... ON CONFLICT DO UPDATE`.
3. Cloudflare WAF Rate Limiting كطبقة أولى للمسارات الحسّاسة.
4. حدود أدقّ: الدخول بـ`(IP + البريد)` لا الـIP فقط.
5. تنظيف النوافذ المنتهية في الـcron.

**معيار القبول:**
- [ ] اختبار: 11 محاولة دخول ⇒ الحادية عشرة 429
- [ ] اختبار: الحدّ يصمد عبر استدعاءات منفصلة (لا يعتمد ذاكرة العملية)
- [ ] اختبار: `Retry-After` صحيح
- [ ] `grep -c "new Map()" src/middleware/` ⇒ تنفيذ واحد

---

## SEC-13 🟠 إحكام مصفوفة الصلاحيات

**المرجع:** `docs/14-ROUTE-INVENTORY.md` (مولَّد آلياً)

**المشكلة:** 77 مساراً بـ`auth-optional` تعتمد فحصاً **داخل المعالج**. الوسيط يفشل **مغلقاً**؛ الفحص اليدوي يفشل **مفتوحاً** — نسيان سطر = ثغرة صامتة.

وعَرَض ملحوظ: `payment-methods` و`ad-blocks` تستدعي `requireAuth()` بينما `c.get('user')` غير مضبوط (لا وسيط auth مركّب). فهي ترجع 401 دائماً ⇒ **ميزات معطّلة يُظن أنها تعمل**.

**التوجيه:**
1. أعد توليد الجرد: `node dev-tools/route-inventory.mjs`
2. كل راوتر **يعلن سياسته صراحةً** بالوسيط. المسار العام يُعلَن عاماً عن قصد، لا بالسكوت.
3. أضف `authMiddleware` المفقود لـ`payments` و`ad-blocks` (يُصلح الميزة المعطّلة ويُحكم الحماية معاً).
4. لكل مسار محمي: اختبار منع وصول (401/403).
5. ملكية السجل مفحوصة في النموذج لا المعالج — المستخدم أ لا يلمس بيانات المستخدم ب.

**معيار القبول:**
- [ ] صفر مسار بتصنيف `UNGUARDED` عدا العامة المعلَنة صراحةً
- [ ] كل مسار مالي/إداري له اختبار منع وصول
- [ ] E2E: وسيلة دفع تُضاف بنجاح (إثبات أن الميزة عادت للعمل)
- [ ] اختبار: المستخدم أ لا يقرأ/يعدّل وسائل دفع المستخدم ب

---

## SEC-14 🟡 تقليل ضغط SSE على D1

**الملف:** `src/modules/api/sse/routes.ts:113,123`

**المشكلة:** استعلام كل ثانيتين لكل اتصال. 1,000 مستخدم ⇒ **43.2 مليون استعلام/يوم**. يتجاوز حدود D1 قبل أي حجم معقول.

**التوجيه:** WebSocket/DO المسار الأساسي (البنية موجودة بعد SEC-10). SSE fallback بفترة 10 ثوان، وحدّ أقصى لعمر الاتصال، وحدّ للاتصالات المتزامنة لكل مستخدم.

**معيار القبول:**
- [ ] استعلامات D1 لكل اتصال/دقيقة انخفضت ≥ 80%
- [ ] اختبار: عميل بلا WebSocket يسقط إلى SSE ويستقبل الأحداث
- [ ] قياس موثَّق قبل/بعد

---

## SEC-15 🟢 نظافة سلسلة الاعتماديات (إنتاج)

**الحالة (UNIT33.1 / R4-DEPS-SEC-1):** `npm audit --omit=dev` ⇒ **0** ثغرات على HEAD الوحدة. بوابة CI مانعة: `node dev-tools/check-audit-exceptions.mjs` (استثناءات محدودة في `dev-tools/audit-exceptions.json` فقط عند غياب إصلاح منشور).

**Hono (GHSA-5r4p-p66f-jhc7):** تخصّ `serveStatic` (فك ترميز مسار مرتين). الفحص على الكود: **لا `serveStatic` ولا `hono/jwt`/`jwk`** في `src`/`workers`. تم رفع lockfile إلى **≥ 4.13.11** (هدف 4.13.13).

**Zod (GHSA-mrhx-c7xc-m3w5):** مسار **R (إزالة)** — `src/middleware/validation.ts` غير مستورد ولا يوجد مستورد لـ`zod` في المنتج؛ أُزيلت الاعتمادية من `package.json`.

**سلسلة البناء/الاختبار:** ثغرات `high`/`moderate` المتبقية في `--omit=dev` **false** تُسجَّل في تقرير الوحدة (دفعات vite/wrangler/vitest) ولا تُعالَج ضمن 33.1.

**معيار القبول:**
- [x] `npm audit --omit=dev` ⇒ صفر `high` في تبعيات الإنتاج (بوابة مانعة)
- [x] البناء والأنواع والاختبارات ذات الصلة على HEAD الوحدة
- [x] موثَّق في `WORKLOG.md` / `PLAN-STATUS.md`

---

## 4. فحوص آلية تمنع الرجوع

تُضاف إلى `.github/workflows/quality-gate.yml`:

| الفحص | يمنع |
|---|---|
| `node dev-tools/check-sec06-math-random.mjs` | SEC-06 |
| `node dev-tools/check-sec-guards.mjs sec05` | SEC-05 (AST: نداء `cors()` تنفيذي فقط) |
| `node dev-tools/check-sec-guards.mjs sec07` | SEC-07 (AST: مفتاح `session_id` تنفيذي فقط) |
| `node dev-tools/check-sec-guards.mjs sec08` | SEC-08 (AST: لا سر مقروء من JS؛ هجرة محدودة في `SessionAccess`) |
| `node dev-tools/check-sec-guards.mjs sec10` | SEC-10 (AST: لا `this.sockets`؛ يثبت مسار `getWebSockets`) |
| `node dev-tools/check-sec-guards.mjs sec11` | SEC-11 (AST: لا `?token=` جلسة في middleware/profile) |
| `npx vitest run tests/api/sec-guards.test.ts tests/api/sec08-httponly-session.test.ts tests/api/auth-session-transient.test.ts tests/api/sse-user-auth.test.ts tests/ui/sec07-session-consumers.test.ts tests/ui/sec08-no-js-session.test.ts tests/client/session-access.test.ts tests/ui/auth-session-lifecycle.test.ts tests/workers/sec10-realtime.test.ts` | سلوك SEC-05/07/08/10/11 (CORS، هيمنة الكوكي، رفض legacy/query، HttpOnly/CSRF/Bearer، 401 مقابل 5xx، بثّ بعد الإيقاظ) |
| `npm audit --audit-level=high --omit=dev` | SEC-15 |
| تصنيف `UNGUARDED` في الجرد | SEC-13 |

> **الأصل:** كل ثغرة تُصلَح تُقفل بفحص آلي. البند الذي لا فحص له يعود.
>
> **درس UNIT30.3:** لا تستخدم `grep` على تعليقات/نصوص لتأكيد غياب نمط أمني — استخدم فحص AST على الكود التنفيذي، وإلا فالفحص إما يعطي إنذاراً كاذباً (SEC-05/10) أو لا يستطيع أن يصبح مانعاً (SEC-07/08/11). الأدلة: `tests/dev-tools/sec-guards-checker.test.ts` + `dev-tools/check-sec-guards.mjs`.

---

# ملحق UNIT40 — دليل المالك: `/admin`، حسابات التجربة، والبيانات التخليقية

> **الغرض:** مرجع واحد للمالك/القائد قبل UNIT42: أين تُدار المنصة، مَن الحسابات التجريبية، وكيف تُفصل عن البيانات التخليقية.
> **قاعدة الإثبات:** كل بند إما «متحقَّق من المستودع» مع `file:line`، أو **`NOT VERIFIED`** ولا يُخترع بديل. تاريخ التحقق: 2026-11-03، BASE `062600e5fce53921483f56d94d55069de4ed6847`.
> **تحذير H8:** لا تدوير كلمة مرور ولا حذف حساب ولا تغيير اعتماد في UNIT40. التنفيذ **فقط** في UNIT42 بعد 41 و41.1 و42.1، وبموافقة مالك مكتوبة. التصنيف الحرفي: `OPEN OWNER ACTION — DEFERRED TO UNIT42 CUTOVER`.

## 1. `/admin` — صفحة واحدة بأقسام، لا تبويبات

**المسار:** `GET /admin` (`src/main.ts:408`). **الحارس الخادمي:** جلسة غير مشرف ⇒ 403 فوراً بلا هيكل لوحة (`src/modules/pages/admin-dashboard-page.ts:20-40`). **حارس الـAPI:** `is_admin === 1` (`src/controllers/AdminController.ts:29-32`).

**ليست تبويبات عميل:** الصفحة HTML واحد يعرض كل الأقسام متتابعة؛ لا `role="tablist"` ولا تبديل أقسام. الأقسام الفعلية (بالترتيب):

| # | القسم | الأسطر | ملاحظة |
|---|---|---|---|
| 1 | بطاقات الإحصاء (مستخدمون/منافسات/تحكيمات/حملات) | 49-66 | تُملأ من `/api/admin/stats` |
| 2 | حسابي: اسم المستخدم/البريد/كلمة المرور | 68-90 | تدوير اعتماد المشرف من هنا |
| 3 | تسعير الإعلانات (بلد/مضاعفات/مدة) | 92-146 | قرارات 36.1 |
| 4 | إعلانات Dueli التعريفية | 148-184 | ينشئ `is_house=1` عبر `/api/admin/ads/house` (حد 3 نشطة) |
| 5 | الملخص المالي + الديموغرافيا | 186-195 | |
| 6 | أدوار الإدارة + سجل التدقيق | 197-207 | منح/سحب SuperAdmin فقط |
| 7 | المنافسات الأكثر تفاعلاً | 209-212 | |
| 8 | الوثائق المُدارة (H9) | 214-241 | مسودة/منشور، معاينة AR/EN |
| 9 | صندوق الدعم (H6) | 243-275 | نفس خيوط `/messages?tab=admin` |
| 10 | نموذج منح دور (مخفي يظهر بالزر) | 277-284 | SuperAdmin فقط |
| 11 | قائمة السحب | 286-302 | طلبات/مدفوع/مرفوض |
| 12 | نافذتا الموافقة والرفض | 304-332 | تتطلب `transaction_id` عند الموافقة |
| 13 | الفيتو الشفاف (إيقاف/استعادة بث) | 334-372 | لا يحذف المنافسة |

**حدود مؤكدة:** عناوين «Withdrawal Queue» و«Approve/Reject» و«Transparent Admin Veto» مكتوبة إنجليزية ثابتة في الصفحة (الأسطر 291، 307، 323، 338) وليست من `t()`؛ عيب عرض فقط، لم يُصلح في UNIT40.

## 2. `/messages?tab=admin`

- المسار `GET /messages` (`src/main.ts:381`)؛ تبويبان مستقلان: شخصي وإداري (`messages-page.ts:30-40`).
- `?tab=admin` يفتح تبويب الإدارة مباشرة (`:230-231`)، والتبديل يحدّث الرابط (`:849-870`).
- عدّاد غير مقروء مستقل لكل تبويب (`:34`، `:39`).
- الإشراف: أي مشرف (`is_admin=1`) يقرأ؛ الرد الرسمي SuperAdmin أو Moderator فقط؛ Auditor للقراءة فقط (`SupportController.ts:46-58`).
- نفس صندوق الوارد يظهر داخل `/admin` قسم 9؛ لا نظامين.

## 3. `/settings`

**المسار:** `GET /settings` (`src/main.ts:383`). الأقسام المتحققة من `src/modules/pages/settings-page.ts`:

| القسم | الأسطر | ملاحظة |
|---|---|---|
| الملف الشخصي (اسم العرض/النبذة) | 152-172 | |
| اللغة والبلد | 174-203 | تغيير اللغة يعيد التوجيه |
| الإشعارات (بريد/دفع) | 205-225 | |
| كلمة المرور | 251-299 | تختفي لحساب OAuth بلا كلمة مرور ويظهر رابط الاستعادة |
| حفظ الإعدادات | 229-234 | |
| منطقة الخطر (حذف الحساب) | 236-247 | حذف ذاتي فقط |

**تدوير كلمة مرور المشرف من `/settings`:** قسم «كلمة المرور» في الجدول أعلاه ← «Current / New (8+) / Confirm» ← «Update password». تغيير كلمة المرور يقتل **كل** جلسات الحساب ويعيد المصادقة (`tests/api/r2-a-admin.test.ts` ← «4. password change kills all sessions (reauth)…»؛ **32/32** مع حزمة الدليل).

## 4. اعتماد المشرف (H8) — بيان صريح

| الحقل | القيمة | المصدر |
|---|---|---|
| Username | `admin` | `WORKLOG.md` §UNIT36 (PENDING UNIT40/42)، `PLAN-STATUS.md` §UNIT36 |
| Email | `admin@dueli.local` | نفسه |
| Password | `admin` | نفسه (اعتماد تجريبي معروف، ليس سراً) |
| ID | `9053` | خطة المالك `dueli-plan/dueli-completion-plan/08-OWNER-DECISIONS.md:19-20` (خارج هذا المستودع) |
| Role | `SuperAdmin` | نفسه |

**هذا اعتماد تجربة H8، لا اعتماد إنتاج دائم.** وجوده في المستودع يعني أنه ليس سراً؛ يجب تدويره في UNIT42. لا يُعاد استخدامه في أي بيئة جديدة.

**فصل محلي مهم:** `docs/07-ONBOARDING.md:44-50` يصف مشرف تطوير محلياً `admin`/`admin` ينشئه `npm run admin:bootstrap` (`dev-tools/bootstrap-admin.mjs:27-30`). السكربت **يرفض** أي مسار remote (`:69-76`، خروج 2). هذا الحساب المحلي ليس صف الإنتاج `id=9053`، ولا يثبت أن الإنتاج أُنشئ بنفس الكلمة.

**تشغيلي:** `admin@dueli.local` نطاق `.local` محجوز غير قابل للتوجيه؛ افترض أن استعادة كلمة المرور بالبريد **لا تعمل**. دوّر من داخل جلسة مسجّلة، لا من «نسيت كلمة المرور».

## 5. حسابات التجربة الثلاثة

| # | الحساب | الحالة | ما نعرفه |
|---|---|---|---|
| 1 | `admin` / `admin@dueli.local` / `admin` (`id=9053`, SuperAdmin) | **متحقَّق من سجلات المستودع/الخطة** | المصادر أعلاه |
| 2 | الحساب التجريبي الثاني | **NOT VERIFIED** | لا اسم/بريد/دور/كلمة مرور في المستودع ولا في خطة المالك |
| 3 | الحساب التجريبي الثالث | **NOT VERIFIED** | نفسه |

**قاعدة:** لا تُخترع هوية ولا كلمة مرور للحسابين 2 و3. في UNIT42 يُجرَد الإنتاج **قراءة فقط** (انظر §7) ويُصنَّف كل حساب: مشرف/مستخدم، تابع مالي/تدقيقي أم لا. حتى ذلك الحين يبقى البندان `OPEN OWNER ACTION`.

## 6. البيانات التخليقية (`is_fake=1`) — ليست حسابات تجربة

**سياسة المصدر:** `db/seed.sql:2-8` — كل صفوف البذور تُدرَج **بدون** `is_fake` فيسري افتراضي المخطط `1` (تخليقي). كل إنشاء حقيقي يكتب `is_fake=0` صراحةً:
- `UserModel.create` — `src/models/UserModel.ts:118-136` (القيمة `0` في `:122`).
- `CompetitionModel.create` — `src/models/CompetitionModel.ts:448-452`.
- OAuth — `src/modules/api/auth/oauth-routes.ts:142-144`.

**بذور التطوير المحلية:** 20 مستخدماً (`db/seed.sql:119-139`)، كلمة مرورهم جميعاً `password123` (تجزئة SHA-256 `ef92b778…`، تحقّقتُ منها حسابياً). السكربت `npm run db:seed` محلي فقط (`--local`، `package.json`)، ولا يوجد سكربت بذر remote. **يُمنع استيراد `db/seed.sql` إلى الإنتاج.**

**آخر لقطة إنتاج موثقة (تاريخية، 2026-09-23):** 544 مستخدماً (2 حقيقيان `is_fake=0`) و1541 منافسة (12 حقيقية) — `docs/C7-D1-RECONCILIATION-RUNBOOK.md:16`. هذه ليست عدّادات حالية ولا تُستخدم كإثبات؛ مجرد سياق لحجم البيانات التخليقية.

**التمييز البصري:** الصفوف التخليقية تحمل شارة «Demo» في:
- بطاقة المستخدم `src/shared/components/user-card.ts:58`
- بطاقة المنافسة `src/shared/components/competition-card.ts:166`
- البروفايل `src/modules/pages/profile-page.ts:197`
- صفحة المنافسة `src/modules/pages/competition-page.ts:224`

**`SyntheticRetirementService` — ما يفعله فعلاً** (`src/lib/services/SyntheticRetirementService.ts:156-202`):
- بعد تسجيل حقيقي أو OAuth: يتقاعد **أقدم** صف `is_fake=1` غير مشرف، وبعد إنشاء منافسة حقيقية: أقدم منافسة `is_fake=1` — **واحد كحد أقصى**.
- يشترط **صفر** صفوف مرجِعة في كل جدول FK (`USER_DEPENDENTS` في `:21-93` و`COMPETITION_DEPENDENTS` بعده، مثبتة بـ`PRAGMA foreign_key_list`).
- حذف مباشر `DELETE`؛ أفضل جهد (فشل التقاعد لا يفشل التسجيل)؛ سطر سجل `[SyntheticRetirement]`.
- **ما لا يفعله:** لا مسح عمري/دفعي، لا حذف جماعي، لا dry-run، لا زر إدارة، لا cron، لا استرجاع. (مؤكد في `docs/20-SYNTHETIC-RETIREMENT-DESIGN.md:21-22`.)
- **لا يلمس `is_fake=0` أبداً** (`:166`، `:173`، `:189`، `:196`).

## 7. UNIT42 cutover — الخطوات الحرفية (لا تُنفَّذ الآن)

**الشروط المسبقة (كلها لازمة):** 41 و41.1 و42.1 مدموجة ومنشورة؛ Quality Gate + Deploy أخضران على SHA الدمج؛ موافقة مالك مكتوبة؛ نافذة صيانة معلنة؛ نسخة احتياطية خارج المستودع.

1. **جرد قراءة فقط (بلا كتابة).**
   ```bash
   npx wrangler d1 execute dueli-db --remote --command "SELECT u.id,u.username,u.email,u.is_admin,u.is_verified,u.is_fake,r.role FROM users u LEFT JOIN admin_roles r ON r.user_id=u.id ORDER BY u.id;"
   ```
   ومنه يُستخرج الثلاثة: `id=9053` + الحسابان 2 و3 (يعرّفهما المالك؛ غير معروفين في المستودع). سجّل الناتج خارج المستودع.
2. **فحص التبعيات لكل حساب قبل أي حذف.** استخدم `USER_DEPENDENTS` (`SyntheticRetirementService.ts:21-93`)؛ استثنِ الجداول العابرة (`sessions`, `realtime_tickets`) لأنها تُبطَل في الخطوة 4. أي صف مرجِع دائم > 0 ⇒ **توقف**: لا حذف، وانتقل إلى التعطيل (4ب).
3. **نسخة احتياطية موثقة.**
   ```bash
   npx wrangler d1 export dueli-db --remote --output <مسار-خارج-المستودع>\dueli-pre-unit42-<UTC>.sql
   ```
   تحقق أن الملف غير فارغ ويُحلَّل محلياً. لا تضع النسخة في المستودع (سياسة F-10).
4. **التنفيذ — الأقل تدميراً أولاً.**
   - **(أ) تدوير كلمة مرور `admin`:** دخول `/login` بالاعتماد القديم ← `/settings` ← كلمة المرور ← تحديث. هذا يقتل كل جلسات الحساب. لا تُسجّل الكلمة الجديدة في المستودع؛ سلّمها لمدير كلمات مرور المالك.
   - **(ب) الحسابان 2 و3 — التعطيل الافتراضي:** دوّر كلمة المرور إلى سرّ عشوائي يحفظه المالك، ثم:
     ```bash
     npx wrangler d1 execute dueli-db --remote --command "DELETE FROM sessions WHERE user_id IN (<id2>,<id3>);"
     ```
     واختيارياً `UPDATE users SET is_verified=0 WHERE id IN (<id2>,<id3>);` لمنع الدخول (الدخول يفحص `is_verified`). أبقِ الصف للسجل.
   - **(ج) الحذف — فقط إذا:** صفر تبعيات دائمة (خطوة 2)، ليس آخر SuperAdmin، وموافقة مالك صريحة. عندها وبعد النسخة:
     ```bash
     npx wrangler d1 execute dueli-db --remote --command "DELETE FROM users WHERE id IN (<id2>,<id3>) AND is_fake=0;"
     ```
     أي فشل FK ⇒ توقف فوراً وارجع إلى (ب).
5. **التحقق بعد التنفيذ (إلزامي).**
   - كلمة مرور `admin` القديمة ⇒ 401؛ الجديدة ⇒ 200.
   - الحسابان 2 و3 ⇒ 401 (كلمة مرور خاطئة/محذوف) أو 400 `auth_email_not_verified` إذا عُطِّل التوثيق.
   - `/admin` للمشرف ⇒ 200؛ لمستخدم عادي ⇒ 403؛ `/api/admin/stats` ⇒ 200 للمشرف و403 لغيره.
   - `/messages?tab=admin` يفتح صندوق الإدارة للمشرف.
   - `/api/withdrawals` ⇒ 200.
   - `SELECT id,username,is_admin,is_fake,is_verified FROM users WHERE id IN (9053,<id2>,<id3>);` يطابق الخطة.
6. **التسجيل والإغلاق.** أضف سطراً في `WORKLOG.md` و`PLAN-STATUS.md`: التاريخ/الوقت UTC، المنفّذ، المعرّفات، الطريقة (تدوير/تعطيل/حذف)، نتائج التحقق، مسار النسخة الاحتياطية — **بلا أسرار**. أغلق بند H8 في `PLAN-STATUS.md` بدليل التشغيل.
7. **التراجع.** إذا انكسر دخول المشرف: استعد النسخة الاحتياطية بقرار مالك فقط، ولا تُعد استيراداً جزئياً فوق الإنتاج.

## 8. خارج نطاق UNIT40 (`OPEN OWNER ACTION`)

- **`dueli.win` / DNS / إعادة التوجيه:** غير قابل للتحقق من المستودع؛ إجراء مالك/Cloudflare. لا كود في UNIT40.
- **قرارات UNIT36.1** (أسعار البلدات/المضاعفات، محتوى الإعلانات التعريفية، allow مقابل manual): لا تزال قرارات مالك، ولا قيم مخترعة هنا.
- **البنك/Stripe/H9:** لا تغيير ولا قرار في UNIT40؛ تبقى لمالك قبل الإطلاق.
- **UNIT41 / 41.1:** بنود البيانات التخليقية القادمة (استبعاد `is_fake=1` من matchmaking/invites، تقاعد أوسع، فيديو تعريفي، إلخ) — **لم تبدأ** في هذه الوحدة.
