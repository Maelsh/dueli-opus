# 13 — استراتيجية الاختبار وCI

> **الحالة الابتدائية:** صفر ملفات اختبار مقابل 43,762 سطراً و191 مساراً.
> **الهدف:** ليس «تغطية 80%». الهدف أن **كل مسار يفقد مالاً أو يسرّب بيانات محميّ باختبار يفشل عند كسره.**

---

## 1. المبدأ الحاكم: ابنِ الشبكة حيث السقوط قاتل

القرار المعماري الأهم هنا هو **الترتيب**، لا الأداة.

الخطأ الشائع: البدء بتغطية شاملة ⇒ أسابيع من كتابة اختبارات لدوال مساعدة، والمنصة ما زالت تفقد المال. الترتيب الصحيح يتبع **تكلفة الفشل**:

| المستوى | تكلفة الفشل | الأولوية |
|---|---|---|
| المال (أرباح، سحب، تبرع) | لا يمكن التراجع — مال حقيقي | **1** |
| الصلاحيات | تسريب بيانات، ضرر قانوني | **2** |
| دورة المنافسة | فقدان ثقة، بيانات متناقضة | **3** |
| الوقت الحقيقي والبث | تجربة سيئة، قابل للإصلاح | 4 |
| الواجهة والعولمة | إزعاج، قابل للإصلاح | 5 |

> **قاعدة:** لا تُكتب أي اختبار في المستوى 4 قبل اكتمال 1 و2. الاختبار في غير موضعه شعور بالأمان لا أمان.

---

## 2. المكدّس المقترح

| الطبقة | الأداة | السبب |
|---|---|---|
| Unit | **Vitest** | سريع، يدعم TS أصلاً، متوافق مع Vite الموجود |
| Integration | **Vitest + `@cloudflare/vitest-pool-workers`** | يشغّل الكود في بيئة Workers الحقيقية مع D1 محلية — لا محاكاة كاذبة |
| E2E | **Playwright** | تعدد أدوار، RTL، أذونات كاميرا/ميكروفون |
| Load | **k6** أو `autocannon` | لتحقق حدود D1 وSSE |

**قرار معماري:** الاختبارات التكاملية تعمل على **D1 حقيقية محليّة**، لا mocks. مشروع مبني على SQL خام لا تكشف mocks أخطاءه الحقيقية (أنواع، قيود، سباقات).

```bash
npm i -D vitest @cloudflare/vitest-pool-workers @playwright/test
```

### البنية

```
tests/
├── unit/
│   ├── crypto.test.ts            # SEC-06
│   ├── elo.test.ts
│   ├── payout.test.ts            # منطق التوزيع
│   ├── sanitize.test.ts
│   └── stripe-signature.test.ts
├── integration/
│   ├── schema-contract.test.ts    # عقد schema على D1 حقيقية عبر Wrangler CLI
│   ├── helpers/
│   │   ├── wrangler-d1-runner.mjs     # ينفذ Wrangler CLI المحلي (migrations + queries)
│   │   └── wrangler-d1-runner.d.mts   # أنواع دقيقة لمخرجات الـ runner
│   ├── financial/                # ← يُكتب أولاً
│   │   ├── invariant.test.ts     # M1
│   │   ├── withdrawal.test.ts    # SEC-02
│   │   ├── donation-webhook.test.ts # SEC-01
│   │   └── concurrency.test.ts   # سباقات
│   ├── authz/                    # ← يُكتب ثانياً
│   │   ├── route-matrix.test.ts  # مولَّد من الجرد
│   │   └── ownership.test.ts
│   └── competition/
│       └── lifecycle.test.ts
├── e2e/
│   ├── fixtures/roles.ts
│   └── competition-full.spec.ts
└── helpers/
    ├── db.ts
    └── factories.ts
```

### أوامر الاختبار الفعلية

```bash
npm test                  # unit/API suite الحالية (35 اختباراً)
npm run test:integration  # D1 schema-contract integration suite (16 اختباراً)
npm run test:all          # unit ثم integration بالترتيب
```

كيف تعمل integration suite:
- تعتمد **Wrangler CLI المحلي المثبت** (`node_modules/wrangler/bin/wrangler.js`) حصراً.
- تطبيق الـ migrations: `wrangler d1 migrations apply dueli-db --local --persist-to=.wrangler-test` على حالة معزولة تُمسح وتُبنى فارغة عند كل تشغيل.
- الاستعلامات (PRAGMA/SELECT فقط): `wrangler d1 execute dueli-db --local --persist-to=.wrangler-test --json` على **نفس قاعدة D1 المعزولة**، وتفحص Vitest مخرجات JSON.
- كل ملفات `migrations/*.sql` تطبق **كما هي** عبر Wrangler — لا FakeD1، لا TEST_SCHEMA، ولا أي SQL parsing/comment stripping/statement splitting.
- `.wrangler-test/` حالة محلية ignored في `.gitignore` ولا تدخل Git.
- **حدود هذه البنية:** لا تُصلح B1/B2/B4/B5، ولا تغطي المالية (M1–M6) ولا Browser E2E بالكامل — هي أساس مخطط فقط.

---

## 3. المستوى 1 — الاختبارات المالية (أولاً، بلا استثناء)

### 3.1 الثابت المحاسبي — الاختبار الأهم في المشروع

```ts
// tests/integration/financial/invariant.test.ts
const INVARIANT = 'total == available + pending + on_hold + withdrawn';

async function assertInvariant(db: D1Database, userId: number) {
  const w = await db.prepare('SELECT * FROM user_earnings WHERE user_id = ?')
                    .bind(userId).first();
  const sum = w.available + w.pending + w.on_hold + w.withdrawn;
  // مقارنة بهامش للعوم — REAL في SQLite
  expect(Math.abs(w.total - sum)).toBeLessThan(0.001);
}
```

يُستدعى بعد **كل** حركة مالية في كل اختبار.

> **ملاحظة معمارية:** الحقول المالية `REAL` (`migrations/0001:275-279`). الفاصلة العائمة **لا تصلح للمال** — `0.1 + 0.2 !== 0.3`. تراكم أخطاء التقريب عبر آلاف الحركات يُنتج فروقاً حقيقية. **التوصية:** ترحيل إلى تخزين صحيح بالسنت (`INTEGER`). حتى ذلك، الاختبارات تستخدم هامشاً — وهذا دين تقني يجب تسجيله لا تجاهله.

### 3.2 السيناريوهات الإلزامية

| # | السيناريو | النتيجة المتوقّعة | يغطّي |
|---|---|---|---|
| F1 | سحب ≤ الرصيد | نجاح، `available−`, `on_hold+` | SEC-02 |
| F2 | سحب > الرصيد | رفض، **الرصيد لم يتغيّر** | SEC-02 |
| F3 | سحب ← رفض | الرصيد يعود بالضبط | SEC-02 |
| F4 | سحب ← موافقة | `withdrawn+` مرة واحدة، `on_hold`=0 | SEC-02 |
| F5 | سحب ← إلغاء المستخدم | الرصيد يعود بالضبط | SEC-02 |
| F6 | **طلبان متزامنان** بمجموع > الرصيد | واحد فقط ينجح | سباق |
| F7 | محاولة رصيد سلبي | مرفوضة على مستوى المخطط | M3 |
| F8 | webhook بتوقيع صحيح | التبرع `completed` | SEC-01 |
| F9 | webhook بتوقيع خاطئ | 400، الحالة لم تتغيّر | SEC-01 |
| F10 | **نفس** webhook مرتين | أثر مالي **واحد** | M4 |
| F11 | webhook بمبلغ مخالف | مرفوض | SEC-01 |
| F12 | `POST /donations/:id/complete` | **404 (delete) أو 401/403 + مالك فقط (protect)** — نُفذت الحماية: `tests/api/donations-security.test.ts` (6 اختبارات) | SEC-01 |
| F13 | منافسة تنتهي مرتين | توزيع واحد | idempotency |
| F14 | توزيع أرباح | مجموع الحصص == الإيراد | محاسبة |
| F15 | تشغيل cron متزامن | توزيع واحد | SEC-04 |

**F6 و F10 و F13 و F15 هي الأهم** — لأنها تكشف الأخطاء التي لا يجدها الفحص اليدوي إطلاقاً.

---

## 4. المستوى 2 — مصفوفة الصلاحيات (مولَّدة، لا مكتوبة يدوياً)

191 مساراً × 3 أدوار = 573 حالة. كتابتها يدوياً غير عملية وستتعفّن.

**النهج:** توليد الاختبارات من `dev-tools/route-inventory.json`:

```ts
// tests/integration/authz/route-matrix.test.ts
import inventory from '../../../dev-tools/route-inventory.json';

const protectedRoutes = inventory.routes.filter(
  r => r.classification === 'AUTHENTICATED' || r.classification === 'ADMIN'
);

describe.each(protectedRoutes)('$method $path', (route) => {
  it('يرفض غير المصادَق بـ401', async () => {
    const res = await request(route.method, route.path);   // بلا اعتماد
    expect(res.status).toBe(401);
  });

  it('يرفض غير المشرف بـ403 إن كان إدارياً', async () => {
    if (route.classification !== 'ADMIN') return;
    const res = await request(route.method, route.path, { as: 'user' });
    expect([401, 403]).toContain(res.status);
  });
});
```

**الفائدة المعمارية:** أي مسار جديد يُضاف إلى الجرد يحصل على اختبار منع وصول **تلقائياً**. المطوّر لا يستطيع نسيانه.

### ملكية السجل

الصلاحية لا تكفي — المستخدم المصادَق قد يلمس بيانات غيره:

| الاختبار | المتوقّع |
|---|---|
| أ يقرأ وسائل دفع ب | 403/404 |
| أ يحذف وسيلة دفع ب | 403/404 |
| أ يقرأ سحوبات ب | 403/404 |
| أ يعدّل منافسة ب | 403 |
| أ يقرأ محادثات ب | 403 |
| أ يحذف تعليق ب | 403 |
| مشرف يعدّل سجله التأديبي | مرفوض |

---

## 5. المستوى 3 — دورة المنافسة (E2E)

الاختبار الوظيفي الجامع. حالة نجاح واحدة كاملة:

```
1.  أ ينشئ منافسة
2.  أ يدعو ب
3.  الإشعار يصل إلى ب فورياً
4.  ب يقبل
5.  أ وب يفتحان الكاميرا والميكروفون
6.  مشاهد ج ينضم ويرى ويسمع الطرفين
7.  انقطاع شبكة + إعادة تحميل
8.  البث يعود بلا تكرار ولا فقد حالة        ← يكشف SEC-10
9.  التعليقات والتقييمات تظهر فورياً
10. المنافسة تنتهي مرة واحدة فقط             ← يكشف تكرار التوزيع
11. الفائز يُحدَّد
12. ELO يتغيّر للطرفين
13. الأرباح تُوزَّع مرة واحدة                 ← F13
14. VOD قابل للمشاهدة
15. النتيجة تظهر في الملفات والشفافية المالية
```

**معيار القبول:** 20 جلسة متتالية بلا فقد بثّ ولا توزيع مزدوج.

الأدوار المطلوبة في `fixtures/roles.ts`: زائر، مستخدم، مضيف، خصم، مشاهد، معلن، مشرف.

> Playwright يمنح أذونات الكاميرا/الميكروفون بـ`context.grantPermissions(['camera','microphone'])` و`--use-fake-device-for-media-stream`.

---

## 6. CI — بوابة الجودة

`.github/workflows/quality-gate.yml` يفرض `docs/11-DEFINITION-OF-DONE.md`.

| المرحلة | الأمر | يوقف الدمج؟ |
|---|---|---|
| الأنواع | `npx tsc --noEmit` | ✅ |
| سقف `any` | مقارنة بالأساس 308 | ✅ |
| فحوص أمنية نمطية | `grep` (SEC-06/08/11/05/07/10) | ✅ |
| الترحيل من صفر | `db:migrate:local` على قاعدة فارغة | ✅ |
| Unit | `npm test` (vitest run) | ✅ |
| Integration | `npm run test:integration` | ✅ |
| البناء | `npm run build` | ✅ |
| `npm audit` (إنتاج) | `--audit-level=high --omit=dev` | ✅ |
| جرد المسارات | إعادة توليد + كشف `UNGUARDED` | ⚠️ تحذير أولاً |
| E2E smoke | `playwright test --grep @smoke` | ✅ (بعد بنائها) |
| مراجع الوثائق | كشف ملفات مُشار إليها وغير موجودة | ⚠️ |

**قرار:** تبدأ الفحوص الجديدة **تحذيرية** لأسبوع، ثم تصبح مانعة. البوابة التي تكسر كل شيء يوم تشغيلها يُعطّلها الفريق.

### إصلاح مسبق مطلوب

`package.json` يحتوي:
```json
"db:reset": "powershell -Command \"Remove-Item ...\""
```
**PowerShell لا يعمل على CI أو Linux/macOS.** يجب استبداله بـ`rm -rf` أو سكربت Node عابر للأنظمة. وهذا يفسّر أيضاً تناقض `README` حول أوامر الترحيل.

---

## 7. أهداف التغطية (مرتّبة زمنياً)

التغطية **نتيجة** لا هدف. الأهداف الملزمة:

| المنطقة | الهدف | الموعد |
|---|---|---|
| المسارات المالية | **100%** فروع | المرحلة 2 |
| المصادقة والصلاحيات | **100%** مسار محمي له اختبار منع | المرحلة 2 |
| دورة المنافسة | 100% للمسار السعيد + الأخطاء الرئيسية | المرحلة 4 |
| النماذج والخدمات | 80% أسطر | المرحلة 5 |
| الواجهة | E2E للأدوار السبعة | المرحلة 7 |

> **يُمنع** عدّ ملف يستورد وحدة ويتحقق من عدم انهيارها كتغطية.

---

## 8. أول أسبوع — خطة ملموسة

لتجنّب شلل «من أين نبدأ»:

| اليوم | العمل | المخرَج |
|---|---|---|
| 1 | تركيب Vitest + `vitest-pool-workers` + `setup.ts` يبني D1 من `migrations/` | اختبار واحد أخضر |
| 1 | إصلاح `db:reset` العابر للأنظمة | يعمل على Linux |
| 2 | `invariant.test.ts` + F1–F5 | خلل SEC-02 **مُبرهَن باختبار أحمر** |
| 3 | F6–F7 (السباقات والسلبية) | إثبات غياب الذرّية |
| 4 | F8–F12 (webhook والتبرعات) | إثبات ثغرة SEC-01 |
| 5 | `route-matrix.test.ts` مولَّد من الجرد | 36+ اختبار منع وصول |
| 5 | `quality-gate.yml` تحذيري | CI يعمل |

**نتيجة الأسبوع:** كل ثغرة P0 مالية **مُبرهَنة باختبار أحمر** قبل كتابة أي إصلاح.

> هذا هو الترتيب الهندسي الصحيح: **الاختبار الأحمر أولاً**. لأنه يُثبت وجود الخلل، ويُثبت أن الإصلاح أصلحه فعلاً، ويمنع رجوعه. الإصلاح بلا اختبار أحمر سابق = أمل لا هندسة.
