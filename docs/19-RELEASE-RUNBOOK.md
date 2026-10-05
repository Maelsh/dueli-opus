# 19 — Release Runbook: النشر الآمن وإعداد المخطط (R-RELEASE-1)

> **بوابة الإصدار، لا تفويض كتابة.** هذا الملف runbook قابل للمراجعة فقط.
> أي كتابة إنتاجية (apply/restore) تتطلب تفويض المالك/القائد (H) خارج LOCAL/REMOTE.
> القاعدة: **fail-closed قبل pages deploy، ولا auto-apply migrations في deploy أبداً.**

## 1. ما تفرضه البوابات تلقائياً (CI)

| البوابة | أين | ماذا تفعل |
|---|---|---|
| Quality Gate لنفس SHA+event | `deploy.yml` job `quality-gate-check` | انتظار API فقط (`gh run list --commit --event --repo`) حتى `completed` ثم اشتراط `conclusion == success` بمهلة صريحة (1800s)؛ «لا run بعد/غير مكتمل» = انتظار لا فشل؛ غير النجاح أو المهلة = منع النشر؛ بلا إعادة suite |
| عزل bindings | `deploy.yml` + `dev-tools/check-pages-bindings.mjs` | production = D1 المثبتة حصراً؛ preview = صفر D1 (لا D1 معاينة مأذونة) |
| جاهزية المخطط (قراءة فقط) | `deploy.yml` + `dev-tools/check-release-readiness.mjs` + `dev-tools/release-schema-manifest.json` | تقارن الهوية + المطبَّق + الـpending + لقطة المخطط مع الـmanifest؛ أي FAIL يمنع النشر |

## 2. جمع القراءات (أوامر قراءة فقط — آمنة)

```bash
# قائمة المتبقي (نص، يُمرَّر للبوابة كما هو)
npx wrangler d1 migrations list dueli-db --remote > /tmp/readiness-list.txt

# المطبَّق (جدول التتبع مثبت محلياً؛ غيابه عن بُعد = فشل مغلق، لا تخمين)
npx wrangler d1 execute dueli-db --remote --json \
  --command "SELECT name FROM d1_migrations ORDER BY rowid;"

# لقطة المخطط المطلوب (الجداول من الـmanifest؛ لا استعلام حر ولا قائمة
# جداول مكتوبة يدوياً — قائمة الفهارس تُشتق من نفس الـmanifest وإلا سقطت
# جداول الأساسيات اللاحقة من اللقطة بصمت كما حدث مع competition_views في #458)
npx wrangler d1 execute dueli-db --remote --json \
  --command "SELECT name FROM pragma_table_info('explore_result_sessions') ORDER BY cid;"
TABLES=$(node -e "console.log(Object.keys(require('./dev-tools/release-schema-manifest.json').required_schema.tables).join(' '))")
INDEX_TABLES=$(node -e "console.log(Object.keys(require('./dev-tools/release-schema-manifest.json').required_schema.tables).map(t=>\"'\"+t+\"'\").join(','))")
npx wrangler d1 execute dueli-db --remote --json \
  --command "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name IN (${INDEX_TABLES});"
```

## 3. إعداد migration (يدوي، بتفويض، قبل أي apply)

1. `migrations list --remote`: سجّل **كل** pending (الأمر يطبق المتبقي كله — لا تعامله كاختيار ملف واحد).
2. لكل pending: قارن sha256 ملف الـrepo مع `release-schema-manifest.json` وسجل التوافق مع الكود القديم والجديد.
3. أكّد الهوية الدقيقة: project + database + SHA (نفس ما تسجله البوابة في نتيجتها).
4. أكّد نقطة استرجاع متاحة (Time Travel إجراء استثنائي بتفويض المالك بعد تقييم فقد الكتابات — ليس rollback آلياً).
5. وحّد التغيير والنشر على تسلسل واحد (serialize)؛ لا تلغِ migration جارية.
6. عند pending إضافية/متغيرة أو HEAD غير مطابق: **توقف** — البوابة ستمنع النشر؛ راجع القائد قبل أي فعل.

## 4. التطبيق المأذون (القائد/المالك فقط)

```bash
npx wrangler d1 migrations apply dueli-db --remote
```

ثم **أعد فحص الجاهزية** (البند 2 + البوابة) قبل النشر، وسجّل target/SHA/manifest والنتيجة — بلا أسرار ولا بيانات مستخدمين.

## 5. ممنوعات صريحة

- لا auto-apply migrations في deploy (ولا في أي workflow).
- لا remote write/restore/reset/seed/DROP/down تلقائي ضمن عمل LOCAL/REMOTE.
- لا إنشاء Cloudflare resource ولا نسخ production data دون تفويض.
- لا نشر مع تحذير: FAIL البوابة = بقاء الإصدار السابق العامل.
- بعد additive ناجح وفشل deploy: احتفظ بالمخطط المتوافق وأصلح للأمام؛ rollback للكود المتوافق فقط.
- لا فحص حساب Cloudflare كله؛ لا Git auto-deploy كمسار التفاف إن كان مفعلاً (التفصيل والإجراء في §6 — تحقق لوحة التحكم، إجراء مالك).

## 6. مسار Cloudflare Git الموازي — مثبت، والمنع إجراء مالك (R-RELEASE-1-REM1)

**الدليل (قراءة فقط، بلا استعلامات جديدة):** لدمج `cb80789` سجّل فحص Cloudflare
Pages ذو المعرّف `111209903606` نشراً ناجحاً عند `13:14:40Z`، بينما انتهت Quality
الخاصة بنفس الـcommit (`run37125477474`) بالفشل عند `13:15:12Z`. أي أن بناءً من
طرف Cloudflare نُشر **قبل** اكتمال Quality — وهذا يثبت وجود مسار نشر عبر
Cloudflare Git integration لا ينتظر بوابة Quality الخاصة بنا. لا يثبت وحده نوع
البيئة (production/preview) — يُحسم من لوحة التحكم أدناه.

**لماذا لا يغلقه كود المستودع:** ترتيب `needs: [quality-gate-check]` في
`deploy.yml` يقيّد jobs داخل GitHub Actions فقط. تطبيق Cloudflare GitHub App
يبني عند كل push بمعزل عن Actions؛ لا يوجد في المستودع مفتاح يمنعه — المنع من
لوحة تحكم Cloudflare حصراً، ولا ينفّذه LOCAL/REMOTE (ممنوع dashboard changes).

**إجراء المالك الدقيق (لوحة التحكم فقط، بلا أوامر نشر):**

1. Cloudflare dashboard ← Workers & Pages ← المشروع `project-8e7c178d`
   (نفس `name` في `wrangler.jsonc`) ← Settings ← Builds & deployments
   (أو Build ← Branch control حسب التسمية الحالية).
2. الإنتاج: ألغِ تفعيل `Enable automatic production branch deployments`
   (إيقاف البناء التلقائي لفرع الإنتاج) واحفظ الإعدادات.
3. المعاينة: اضبط Preview branch على `None` (إيقاف البناء التلقائي لفروع
   المعاينة) — أو قائمة فروع مخصصة عند الحاجة، ولا بناء تلقائي للـforks.
4. التحقق: أي push لاحق إلى main يجب **ألا** يظهر له فحص/نشر Cloudflare
   تلقائي؛ النشر الوحيد المسموح بعده هو workflow الـActions المربوط بالبوابة
   (`Deploy to Cloudflare Pages`) الذي ينشر عبر Wrangler حصراً.
5. حتى إتمام ما سبق: اعتبر كل push إلى main **منشوراً تلقائياً عبر المسار
   الموازي** — غياب run ناجح في Actions لا يعني غياب النشر.

المرجع الرسمي: `Branch deployment controls` و`Git integration`
(developers.cloudflare.com/pages/configuration) — إيقاف البناء التلقائي ثم
النشر عبر Wrangler هو المسار الموثق للمشاريع المرتبطة بـGit.
