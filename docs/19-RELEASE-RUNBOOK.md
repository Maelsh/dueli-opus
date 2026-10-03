# 19 — Release Runbook: النشر الآمن وإعداد المخطط (R-RELEASE-1)

> **بوابة الإصدار، لا تفويض كتابة.** هذا الملف runbook قابل للمراجعة فقط.
> أي كتابة إنتاجية (apply/restore) تتطلب تفويض المالك/القائد (H) خارج LOCAL/REMOTE.
> القاعدة: **fail-closed قبل pages deploy، ولا auto-apply migrations في deploy أبداً.**

## 1. ما تفرضه البوابات تلقائياً (CI)

| البوابة | أين | ماذا تفعل |
|---|---|---|
| Quality Gate لنفس SHA | `deploy.yml` job `quality-gate-check` | فحص API فقط (`gh run list --commit`) أن Quality Gate نجح لنفس الـcommit؛ بلا إعادة suite |
| عزل bindings | `deploy.yml` + `dev-tools/check-pages-bindings.mjs` | production = D1 المثبتة حصراً؛ preview = صفر D1 (لا D1 معاينة مأذونة) |
| جاهزية المخطط (قراءة فقط) | `deploy.yml` + `dev-tools/check-release-readiness.mjs` + `dev-tools/release-schema-manifest.json` | تقارن الهوية + المطبَّق + الـpending + لقطة المخطط مع الـmanifest؛ أي FAIL يمنع النشر |

## 2. جمع القراءات (أوامر قراءة فقط — آمنة)

```bash
# قائمة المتبقي (نص، يُمرَّر للبوابة كما هو)
npx wrangler d1 migrations list dueli-db --remote > /tmp/readiness-list.txt

# المطبَّق (جدول التتبع مثبت محلياً؛ غيابه عن بُعد = فشل مغلق، لا تخمين)
npx wrangler d1 execute dueli-db --remote --json \
  --command "SELECT name FROM d1_migrations ORDER BY rowid;"

# لقطة المخطط المطلوب (الجداول من الـmanifest؛ لا استعلام حر)
npx wrangler d1 execute dueli-db --remote --json \
  --command "SELECT name FROM pragma_table_info('explore_result_sessions') ORDER BY cid;"
npx wrangler d1 execute dueli-db --remote --json \
  --command "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name IN ('explore_result_sessions','explore_result_chunks');"
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
- لا فحص حساب Cloudflare كله؛ لا Git auto-deploy كمسار التفاف إن كان مفعلاً (تحقق لوحة التحكم — إجراء مالك).
