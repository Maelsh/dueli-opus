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

**الملف:** `src/models/WithdrawalRequestModel.ts:110-210`
**المخطط:** `migrations/0001_initial_schema.sql:273`

**المشكلة — ثلاث طبقات:**

1. **خلل محاسبي:** `withdrawn` تُزاد لحظة **الطلب** لا لحظة **الصرف** (سطر 129). فالطلب المعلّق يُحتسب مالاً مسحوباً. و`reject`/`cancel` تعكسان بالطرح — فـ`withdrawn` ليست حقلاً تراكمياً بل عدّاداً متذبذباً، وأي تقرير مالي مبني عليها خاطئ.
2. **حقل مهدور:** `on_hold` معرَّف في المخطط ولا يُستخدم — وهو **بالضبط** الحقل المطلوب للطلبات المعلّقة.
3. **لا ذرّية:** خطوتان منفصلتان (خصم، ثم إنشاء) مع rollback يدوي في `catch`. موت الـWorker بينهما ⇒ **خُصم المال ولا يوجد طلب**. مال يتلاشى بلا خطأ ولا سجل.

**التوجيه:**

نموذج الحالة الصحيح:

| الحركة | `available` | `on_hold` | `withdrawn` |
|---|---|---|---|
| طلب سحب | `− amount` | `+ amount` | — |
| موافقة (صرف فعلي) | — | `− amount` | `+ amount` |
| رفض | `+ amount` | `− amount` | — |
| إلغاء المستخدم | `+ amount` | `− amount` | — |

خطوات التنفيذ:

1. **ترحيل جديد** `migrations/0011_financial_integrity.sql`:
   - قيود `CHECK (available >= 0 AND on_hold >= 0 AND withdrawn >= 0)`
   - جدول `financial_ledger` **append-only**: `user_id, entry_type, amount, balance_before, balance_after, ref_type, ref_id, idempotency_key UNIQUE, created_at`
   - ترحيل بيانات: تصحيح `withdrawn`/`on_hold` للطلبات المعلّقة الحالية
2. **كل تحويل في `db.batch([...])` واحد.** احذف نمط rollback اليدوي.
3. أضف `on_hold` إلى كل واجهة تعرض الرصيد — المستخدم يجب أن يرى «قيد المعالجة».
4. `approve()` تُنفّذ التحويل المالي (حالياً تغيّر الحالة فقط).
5. اقرأ الرصيد وحدّثه **داخل** نفس الـbatch بشرط `WHERE available >= ?` — لا فحص ثم تحديث (سباق).

**معيار القبول:**
- [ ] اختبار الثابت `total == available + pending + on_hold + withdrawn` بعد **كل** حركة
- [ ] اختبار: سحب يتجاوز الرصيد ⇒ رفض، والرصيد لم يتغيّر
- [ ] اختبار: طلبان متزامنان بمجموع > الرصيد ⇒ أحدهما فقط ينجح
- [ ] اختبار: طلب ← رفض ⇒ الرصيد يعود لقيمته الابتدائية بالضبط
- [ ] اختبار: طلب ← موافقة ⇒ `withdrawn` تزيد **مرة واحدة**، `on_hold` تعود صفراً
- [ ] اختبار: `available` لا يصبح سلبياً في أي مسار
- [ ] كل حركة كتبت سطراً في `financial_ledger`

> **أخطر بند في المشروع.** لا تُصلح المجموعة ج قبله.

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
