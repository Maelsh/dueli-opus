# AGENTS.md — دليل الوكلاء الآليين لمشروع Dueli

منصة Dueli: حوارات ومنافسات مباشرة | Cloudflare Pages/Workers + Hono + D1 + TypeScript.

## اقرأ أولاً (إلزامي قبل أي تغيير)

> ⚠️ **تحديث حاكم:** تدقيق لاحق (`docs/10-ARCHITECTURE-ASSESSMENT.md`) وجد أن
> `PLAN-STATUS.md` صنّف 20+ مهمة "✅ مكتملة ومختبرة" بينما المشروع يحتوي **صفر
> اختبارات آلية** وفيه ثغرات مالية/أمنية نشطة. عند التعارض بين `COMPLETE_PROJECT_PLANS.md`
> والوثائق 10–15 أدناه، **الوثائق 10–15 هي الصائبة** — راجع `docs/15-ROADMAP.md` قبل
> `COMPLETE_PROJECT_PLANS.md` لأي عمل جديد.

1. `docs/11-DEFINITION-OF-DONE.md` — **بوابة الجودة الحاكمة** — لا تُعلن مهمة "✅ مكتملة" قبل اجتيازها (8 شروط G1–G8، + M1–M6 للمسارات المالية)
2. `docs/15-ROADMAP.md` — خارطة الطريق التنفيذية المصححة (المراحل 0–9، بالترتيب الملزم)
3. `docs/12-SECURITY-REMEDIATION.md` — كل ثغرة أمنية/مالية معروفة (SEC-01 → SEC-15) بالملف والسطر والتوجيه ومعيار القبول
4. `docs/13-TEST-STRATEGY.md` — استراتيجية الاختبار (Vitest/Playwright) وبنية `tests/` قبل كتابة أي اختبار
5. `docs/14-ROUTE-INVENTORY.md` — جرد المسارات (مولَّد: `npm run routes:inventory`) — لا تفترض حماية مسار بلا التحقق منه هنا
6. `docs/01-ARCHITECTURE-RULES.md` — القواعد المعمارية الملزمة (لا تزال سارية)
7. `docs/COMPLETE_PROJECT_PLANS.md` — الأرشيف التاريخي لمعرّف المهام (P?-T??) — **حالة "مكتملة" فيه غير موثوقة**، اعتمد `PLAN-STATUS.md` + G1–G8 بدلاً منها
8. `PLAN-STATUS.md` — حالة المهام (حدّثها بعد كل مهمة، بالرموز المصحَّحة: ☐ / 🔧 / 🧪 مُتحقَّقة يدوياً بلا اختبار / ✅ اجتازت G1–G8 / ⛔)
9. `WORKLOG.md` — سجل التغييرات (سجّل فيه بعد كل مهمة)

## قواعد سريعة

- **MVC:** المنطق في `models/` أو `lib/services/`، المسارات في `modules/api/*/routes.ts`. لا SQL في الصفحات.
- **OOP:** وراثة `BaseModel`/`BaseController`. لا حقول `#private` (استخدم `private`) لتوافق Cloudflare.
- **i18n:** لا نصوص ظاهرة خارج `t()` / `translations`. النصوص الجديدة تدخل `i18n/ar.ts` + `en.ts`.
- **DB:** أي تغيير مخطط عبر `migrations/00XX_*.sql` جديد. لا تستعلم عن أعمدة غير موجودة في migrations.
- **UI:** وضع ليلي `dark:` إلزامي + RTL/LTR + aria-labels.
- **بناء:** `npm run build` يجب أن ينجح قبل اعتبار أي مهمة مكتملة.
- **اختبار محلي:** `npm run dev:sandbox` (wrangler pages dev) بعد `npm run db:migrate:local && npm run db:seed`.

## ملفات لا تمسها بدون سبب موثق

- `migrations/*.sql` القديمة (0001–0006) — للقراءة فقط
- `.wrangler/`, `dist/`, `node_modules/`

## حالة معروفة (تحقق قبل افتراض عكسها)

- جدول المتابعة الفعلي اسمه `follows` وليس `user_follows` (أُصلح في T1.1)
- ad-blocks, ad-reports, donations, payment-methods مربوطة في `main.ts` (خطة 4) — لكن راجع `docs/14-ROUTE-INVENTORY.md` قبل افتراض أنها محمية؛ عدّة مسارات فيها بلا `authMiddleware` (SEC-13)
- **لا تعدّل الملفات العربية عبر PowerShell Set-Content** — يفسد الترميز. أدوات تحرير الملفات فقط
- المصادقة: Bearer header أو `?token=` أو cookie sessionId — **⚠ `?token=` مرفوض هندسياً (SEC-11): يُسجَّل في سجلات الطرف الثالث. الإزالة مجدولة بالمرحلة 4 من `15-ROADMAP.md`، لا تعتمد عليه في كود جديد**
- cron: لا يوجد cron أصلي في Pages — المجدول الخارجي يضرب `/api/cron/run?key=CRON_SECRET` كل دقيقة — **⚠ سرّ في query string (SEC-04): يُنقل لترويسة `Authorization: Bearer` بالمرحلة 1**
- الدخول يفحص `is_verified` (وليس `email_verified` غير المستخدم) — تعارض مخطط مؤجل لـT3.x
- CI: `.github/workflows/quality-gate.yml` يفرض جزءاً من `docs/11-DEFINITION-OF-DONE.md` — بعض الفحوص لا تزال `continue-on-error: true` (فترة سماح أسبوع من أول تشغيل ناجح) ثم تصبح مانعة — راجع تعليقات الملف قبل تعديله
