# 00 — نظرة عامة على Dueli

**Dueli** منصة عالمية للحوار والمنافسات الحية ثنائية الاتجاه (RTL/LTR)، مبنية على:

| الطبقة | التقنية |
|--------|---------|
| الاستضافة | Cloudflare Pages/Workers (Serverless) |
| الخلفية | Hono 4 (TypeScript) |
| قاعدة البيانات | Cloudflare D1 (SQLite) |
| الواجهة | TypeScript + Tailwind CSS 4 + Vite (بلا إطار JS) |
| البث | WebRTC P2P → تجميع عند المضيف → رفع chunks → دمج/VOD للمشاهد |

## خط البث المعتمد
```
المضيف ──WebRTC P2P──▶ الضيف (مناظر حي)
المضيف/الضيف ──MediaRecorder chunks──▶ POST /api/chunks ──▶ D1/R2
المشاهد ◀── بث حي عبر P2P/signaling أو VOD مجمّع بعد النهاية
```
> Jitsi مهجور (`modules/api/jitsi`) — يُستخدم كمرجع فقط وقد يعود مستقبلاً.

## دورة حياة المنافسة
`pending` (بانتظار منافس) ← `scheduled` / `live` ← `completed` ← `archived`
قواعد المؤقتات: فوري بلا منافس خلال ساعة = حذف؛ مجدول لم يبدأ بعد موعده بساعة = إلغاء؛ البث الأقصى ساعتان.

## خريطة الكود
راجع `docs/01-ARCHITECTURE-RULES.md` لفهم البنية والقواعد، و`PLAN-STATUS.md` لحالة العمل.

## 🗺️ خريطة مصادر الحقيقة (F-8 — ملزمة)

لكل نوع معلومة **مصدر حالي واحد**. أي وثيقة خارج هذه الخريطة تدّعي أنها
"الحالية" أو "المرجع الوحيد" تُعامل كتاريخية (انظر `docs/16-KNOWN-ISSUES.md` §4).

| الفئة | المصدر الحالي | ما ليس مصدراً |
|---|---|---|
| **A — الحوكمة** | `docs/11-DEFINITION-OF-DONE.md` (بوابة G1–G8 + M1–M6) | ادعاءات "مكتملة" في الخطط القديمة |
| **B — المعمارية** | `docs/01-ARCHITECTURE-RULES.md` + `docs/05-COMPETITION-LIFECYCLE.md` (الدورة) + `docs/02-DATABASE.md` (المخطط) | `docs/10` (لقطة مؤرخة للتشخيص فقط) |
| **C — الخطة** | `docs/15-ROADMAP.md` (المراحل 0–9 بالترتيب الملزم) — لا خطة جديدة | `docs/COMPLETE_PROJECT_PLANS.md` (أرشيف) وكل `*_PLAN.md` في dot-folders |
| **D — حالة المشروع** | `PLAN-STATUS.md` (بالرموز المصححة) + `WORKLOG.md` (السجل) | أي جدول حالة داخل وثيقة أخرى |
| **E — تعليمات الوكلاء** | `AGENTS.md` (يقرأ أولاً) | `.github/pr-body-*.md` ومواصفات `specs/` المكتملة |
| **F — الأرشيف** | `docs/archive/` + ترويسات "تاريخي" على `COMPLETE_PROJECT_PLANS` و`docs/10` | — (يُحفظ ولا يُعتمد عليه) |
| **G — تصحيحات** | `docs/16-KNOWN-ISSUES.md` | الافتراضات القديمة قبل تصحيحها |

> dot-folders (`.blackbox/` `.gemini/` `.claude/` `.plan/`) مخلفات تاريخية لوكلاء
> سابقين — ليست خطط عمل ولا مصادر حقيقة (التفاصيل في `docs/16` §4).

## نقاط دخول رئيسية
- السيرفر: `src/main.ts`
- المسارات: `src/modules/api/*/routes.ts`
- العميل: `src/client/index.ts`
- الصفحات: `src/modules/pages/`
