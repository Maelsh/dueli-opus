# 🏛️ قواعد المعمارية الملزمة — Dueli

> **هذه القواعد إلزامية لكل تعديل أو ميزة جديدة.** أي كود يخالفها يُرفض في المراجعة.
> المرجع الأم: `docs/COMPLETE_PROJECT_PLANS.md`

## 1. معمارية MVC الصارمة

```
src/
├── models/            ← طبقة البيانات: كل استعلام SQL يعيش هنا فقط
│   └── base/BaseModel.ts    (الأصل الذي ترث منه كل النماذج)
├── controllers/       ← طبقة التحكم: استقبال الطلب → نداء Model → رد HTTP
│   └── base/BaseController.ts
├── lib/services/      ← منطق الأعمال المعقد المشترك (Payout, Elo, Email...)
├── modules/api/*/     ← تعريف المسارات فقط (routes.ts) + ربط بالـController
├── modules/pages/     ← قوالب HTML للصفحات — يُمنع منطق أعمال هنا
└── main.ts            ← التجميع والتركيب فقط — يُمنع كتابة endpoints هنا
```

**قاعدة:** إذا وجدت استعلام SQL في controller أو صفحة، فهو مخالفة إلا إذا كان استثناءً موثقاً في WORKLOG.

### مثال صحيح (موجود في المشروع):
- `MatchmakingController` يستقبل الطلب ويستدعي الاستعلام عبر نموذج/خدمة، ثم يرجع `this.success()`.
- `EventPusher` خدمة في `lib/services` تُستهلك من أي متحكم.

## 2. البرمجة الكائنية OOP

1. كل نموذج جديد يرث `BaseModel` (`protected tableName`, دوال مشتركة).
2. كل متحكم جديد يرث `BaseController` (`success`, `error`, `unauthorized`, `t()`, `requireAuth()`...).
3. لا حقول `#private` — استخدم كلمة `private` (قيود توافق Cloudflare).
4. الخدمات المشتركة تكون classes في `lib/services/` وتُصدَّر من `lib/services/index.ts`.

## 3. نظام اللغات i18n

```typescript
// ❌ ممنوع تماماً
return `<h1>Welcome</h1>`;

// ✅ الصحيح
const tr = translations[getUILanguage(lang)];
return `<h1>${tr.welcome}</h1>`;
// أو في العميل:
Toast.show(t('matchmaking.invite_sent', State.lang), 'success');
```

1. أي نص جديد يدخل `src/i18n/ar.ts` **و** `en.ts` معاً في نفس المهمة.
2. مفاتيح مترابطة تُجمع تحت كائن فرعي (مثل `matchmaking.*`).
3. البنية جاهزة لإضافة لغة ثالثة: ملف جديد + تسجيل — بلا تعديل منطق.
4. دعم RTL/LTR تلقائي: `isRTL(lang)` + `dir="${rtl ? 'rtl' : 'ltr'}"`.

## 4. قاعدة البيانات (Cloudflare D1)

1. كل تغيير مخطط = migration مرقمة `migrations/00XX_*.sql` (لا تعدل ملفات قديمة أبداً).
2. **لا تكتب استعلاماً عن عمود قبل أن يكون موجوداً في migration** (خطأ تاريخي: `elo_rating`, `winner_id`, `user_follows`).
3. أضف فهارس للأعمدة المستخدمة في WHERE/JOIN/ORDER BY.
4. الجداول المتشابهة يجب توحيدها (درس `follows` vs `user_follows`).

## 5. الواجهة والتصميم

1. الوضع الليلي إلزامي: كل ألوان Tailwind مع `dark:` variant.
2. RTL/LTR: لا تستخدم `left/right` مباشرة دون مراعاة الاتجاه.
3. a11y: `aria-label` على الأزرار الأيقونية، تركيز لوحة مفاتيح واضح، تباين كافٍ.
4. استخدم مكوّنات `shared/components` بدل تكرار HTML.

## 6. الأمان (لا استثناءات)

1. كلمات المرور: PBKDF2 + salt فقط (لا SHA-256 مجرد).
2. كل نقطة API محمية تتطلب `authMiddleware({ required: true })`.
3. تنقية كل مدخل نصي يظهر للمستخدمين الآخرين (XSS).
4. Rate limiting على نقاط الكتابة الحساسة (login, register, invites).

## 7. سير العمل الإلزامي لكل مهمة

1. اقرأ `docs/COMPLETE_PROJECT_PLANS.md` + حدد ID المهمة.
2. حدّث حالتها إلى 🔧 في `PLAN-STATUS.md`.
3. نفذ التعديل وفق القواعد أعلاه.
4. اختبر وفق "اختبار القبول" الخاص بالمهمة.
5. سجّل في `WORKLOG.md` + حدّث الحالة ✅.
