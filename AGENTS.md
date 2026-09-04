# AGENTS.md — دليل الوكلاء الآليين لمشروع Dueli

منصة Dueli: حوارات ومنافسات مباشرة | Cloudflare Pages/Workers + Hono + D1 + TypeScript.

## اقرأ أولاً (إلزامي قبل أي تغيير)

1. `docs/COMPLETE_PROJECT_PLANS.md` — الخطط الكاملة ومعرّف المهام (P?-T??)
2. `docs/01-ARCHITECTURE-RULES.md` — القواعد المعمارية الملزمة
3. `PLAN-STATUS.md` — حالة المهام (حدّثها بعد كل مهمة)
4. `WORKLOG.md` — سجل التغييرات (سجّل فيه بعد كل مهمة)

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
- وحدات غير مربوطة بعد في `main.ts`: ad-blocks, ad-reports, donations, payments (خطة 4)
- **لا تعدّل الملفات العربية عبر PowerShell Set-Content** — يفسد الترميز. أدوات تحرير الملفات فقط
- المصادقة: Bearer header أو `?token=` أو cookie sessionId
- cron: لا يوجد cron أصلي في Pages — المجدول الخارجي يضرب `/api/cron/run?key=CRON_SECRET` كل دقيقة
- الدخول يفحص `is_verified` (وليس `email_verified` غير المستخدم) — تعارض مخطط مؤجل لـT3.x
