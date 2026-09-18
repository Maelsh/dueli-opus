# 17 — سياسة Dot-Folders / Agent Artifacts (F-9)

> **النطاق:** Documentation Policy فقط (F-9). لا حذف ولا نقل ولا إعادة تسمية
> لأي artifact، ولا تعديل كود/ترحيلات/APIs/tests، ولا خطة جديدة، ولا cleanup نهائي.
> أي cleanup/archiving نهائي خارج نطاق F-9.
> خريطة مصادر الحقيقة: `docs/00-OVERVIEW.md`. الحوكمة: `docs/11-DEFINITION-OF-DONE.md`.
> الخطة الحالية: `docs/15-ROADMAP.md`. التصحيحات: `docs/16-KNOWN-ISSUES.md`.

## 1. القاعدة (ملزمة لكل Agent لاحق)

1. كل dot-folder / agent artifact في المستودع **تاريخي أو مؤقت ما لم يثبت خلاف ذلك** بدليل صريح.
2. **ليس** Source of Truth للمشروع — مصادر الحقيقة الوحيدة هي ما ثبّتته F-8 في
   `docs/00-OVERVIEW.md` (الفئات A–G): الحوكمة `docs/11`، المعمارية `docs/01` + المرتبطة،
   الخطة `docs/15`، الحالة `PLAN-STATUS.md` + `WORKLOG.md`، تعليمات الوكلاء `AGENTS.md`،
   التصحيحات `docs/16`، الأرشيف `docs/archive/`.
3. **لا يجوز** لأي Agent استخدام هذه الـ artifacts كأساس للتخطيط أو اتخاذ القرارات المعمارية.
   أي تعارض بين artifact وبين مصادر الحقيقة يُحسم لصالح مصادر الحقيقة.
4. **لا يجوز** إنشاء dot-folders أو agent artifacts جديدة داخل المستودع دون إذن صريح موثّق.
5. وجود artifact تاريخي **لا يعني** أنه يجب حذفه الآن — يُحفظ كما هو حتى قرار منفصل.
6. أي cleanup/archiving نهائي لهذه الـ artifacts **ليس جزءًا من F-9** ولم يُنفَّذ هنا.

لا تُدخل هذه الوثيقة أي architectural decision جديد — هي تثبيت سياسة فقط.

## 2. الجرد الفعلي (على `origin/main` بعد دمج F-8)

فُحص المستودع فعليًا (الجذر + بحث متكرر حتى عمق 3، باستثناء `node_modules/` و`.git/`).
المجلدات/الملفات التالية هي **كل** ما وُجد ويُصنَّف agent artifacts ضمن نطاق هذه السياسة:

| المسار | ما وُجد فعلًا | التصنيف |
|---|---|---|
| `.agent/` | `commands/` (9 ملفات `speckit.*.md`)، `rules/specify-rules.md`، `skills/` (10 مجلدات `speckit-*` + `code-forensic`) | artifact تاريخي — أدوات speckit |
| `.blackbox/` | 6 ملفات MD في الجذر (`CODE_DOCUMENTATION_PLAN`، `DUELI_CORE_LOGIC_MASTER_PLAN`، `DUELI_FINAL_EGYPTIAN_SUMMARY`، `DUELI_FINAL_TODO_LIST`، `DUELI_MERGED_ANALYSIS_EGYPTIAN_STYLE`، `DUELI_TODO_IMPLEMENTATION`) + `agents/` (8 ملفات `AGENT_*` + `MASTER_COORDINATION.md`) + `docs/` (9 ملفات `00-index` و`03`–`10-SRS`) | artifact تاريخي — خطط وكيل سابق |
| `.claude/` | 7 ملفات (`01_VISION`، `02_GOALS`، `03_USER_SCENARIOS`، `04_ADMIN_SCENARIOS`، `05_FEATURES_LIST`، `DUELI_COMPLETE_DOCUMENTATION.html`، `SRS_TECHNICAL_REQUIREMENTS.md`) | artifact تاريخي — خطط/متطلبات سابقة |
| `.gemini/` | 3 ملفات (`DUELI_COMPREHENSIVE_ANALYSIS`، `DUELI_CORE_LOGIC_PLAN`، `DUELI_UNIFIED_MASTER_PLAN`) | artifact تاريخي — خطط سابقة |
| `.plan/` | ملفّان (`DUELI_COMPLETE_DOCUMENTATION.html`، `SRS_TECHNICAL_REQUIREMENTS.md`) | artifact تاريخي — خطط سابقة |
| `.specify/` | `memory/constitution.md`، `scripts/powershell/`، `specs/001-competition-lifecycle/`، `templates/` (6 قوالب)، `init-options.json` | artifact تاريخي — مواصفات مهمة واحدة مكتملة، لا تُعمَّم |
| `.testsprite/` | `config.json` فقط | artifact تاريخي — إعداد أداة سابقة |

لم يُسجَّل أي اسم غير موجود — القائمة أعلاه هي **فقط** ما وُجد.

## 3. ما ليس ضمن نطاق هذه السياسة (توضيح منعًا للالتباس)

| المسار | لماذا ليس artifact ضمن F-9 |
|---|---|
| `.git/` | نظام إدارة النسخ — ليس artifact وكيل |
| `.github/` (workflows + `CLI-NOTES.md` + `pr-body-*.md`) | CI ومسودات PR مدموجة — `pr-body-*.md` تاريخية غير سارية (انظر `docs/16` §4) لكنها ليست dot-artifact وكيل |
| `.vscode/` | إعداد محرر — ليس artifact وكيل |
| `.wrangler/`, `.wrangler-test/` | مخرجات أدوات Cloudflare — ليست sources ولا artifacts وكلاء |
| `.dev.vars`, `.dev.vars.example`, `.gitignore`, `.npmrc`, `.nvmrc` | ملفات dot قياسية للمشروع — ليست artifacts وكلاء |
| `specs/`, `testsprite_tests/` | مجلدات **بدون نقطة** بأسماء مشابهة — خارج تعريف dot-folders؛ `specs/001-competition-lifecycle/` مواصفات مهمة مكتملة (انظر `docs/16` §4) |

## 4. الربط بمصادر الحقيقة (F-8)

- `docs/00-OVERVIEW.md` — خريطة مصادر الحقيقة (A–G)؛ هذه الوثيقة (`docs/17`) تفصيل تنفيذي لها لبند dot-folders فقط.
- `AGENTS.md` — تعليمات الوكلاء؛ تُقرأ هذه السياسة مع قائمة "اقرأ أولاً" ولا تستبدلها.
- `docs/16-KNOWN-ISSUES.md` §4 — القائمة الحاكمة لـ"ما ليس مصدر حقيقة"؛ هذه الوثيقة توسّعها بالجرد الكامل دون تكرار الحكم.
- `docs/15-ROADMAP.md` — الخطة الحالية؛ لا تُنشئ هذه الوثيقة خطة جديدة ولا تُنفّذ F-10.
- `PLAN-STATUS.md` + `WORKLOG.md` — حالة وسجل F-9 فقط.

## 5. تأكيدات النطاق (F-9)

- لم يُحذف أو يُنقل أو يُعَد تسمية أي artifact في هذه المهمة.
- لم يُنشَأ أي dot-folder جديد في هذه المهمة.
- لم يُعدَّل أي source code أو migration/schema أو API أو test في هذه المهمة.
- لم تُتَّخذ أي architectural decision جديدة في هذه المهمة.
- لم يُنفَّذ أي جزء من F-10 في هذه المهمة.
