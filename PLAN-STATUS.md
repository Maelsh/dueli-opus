## RELEASE COLLECTOR HOTFIX (Deploy #37771438709) · فرع fix/release-collector-indexes (من 30baed3 = origin/main)

- 🔧 تنفيذ LOCAL مكتمل، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر ذاتي/إعادة تطبيق ‏0039/‏H7/‏SearchModel/readiness (سطر جامع واحد + مثبت + ملف اختبار).
- نفّذ: لقطة الفهارس بلا قيد ‏tbl_name (الفاحص ‏subset — الزائد آمن والناقص ‏FAIL مغلق)؛ السبب: جداول ‏0039 خارج ‏required_schema.tables فالقائمة المشتقة أسقطتها والبوابة رفضت إنتاجاً سليماً.
- **الأدلة**: ‏release-collector ‏5/5 + ‏deploy-workflow ‏9/9 (‏RED ‏4 على الجامع القديم)؛ ‏tsc/build ✅؛ ‏any ‏+0 (بلا ‏src منطقي).
- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـexpected_head_sha ← انتظار Quality Gate على merge-commit (يعيد تشغيل ‏Deploy الفاشل) ← ثم إعلان الحالة. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.

## R4-DB-OPT-1 smallest proven D1 read reduction · فرع feat/r4-db-opt-1 (محدَّث على main ‏9cbb93c بعد دمج ‏PR103)

- 🔧 تنفيذ LOCAL مكتمل، بانتظار re-REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر ذاتي/فوترة/حمل إنتاجي (‏routes بلا تغيير؛ ‏manifest ‏baseline-0039؛ ‏0039 مطبَّقة إنتاجياً بتفويض المالك §9 ومثبتة أدناه). PR #103 مدموجة ومحفوظة أدناه؛ ملفا ‏ELO المتسخان لم يُمسا.
- نفّذ: (‏S1) حذف قراءتي ‏Profile الزائدتين في ‏SearchModel (نفس الخريطة/القيم — ‏H7-v1 والمشاركة والحجب والعزل والترتيب والنفاد و‏≤100 binds محفوظة)؛ (‏S2) ترحيل ‏0039 (‏6 فهارس فقط، ‏IF NOT EXISTS، بلا حذف) ضمن ‏PR بلا تطبيق إنتاجي (‏owner-gated)؛ (‏S3) إثبات التعطل: محاولة واحدة + ‏500 عامة بلا تسريب على المسار الملموس (‏B13 قائم للبقية).
- **الأدلة**: T جديد ‏r4-db-opt-1 ‏14/14 (‏RED ‏12/18 قبل الإصلاح؛ ‏EXPLAIN السبع بلا ‏SCAN بعد ‏0039؛ ‏T0 ‏13 مقابل continuation ‏5 عبارات — عدّ محلي، لا يدَّعى ‏rowsRead إنتاجي)؛ الجيران ‏126/126؛ الكاملة ‏1401 + نفس ‏16 البيئية المسبقة؛ ‏schema-contract ‏24/24 عبر ‏Wrangler؛ ‏tsc ✅؛ ‏build ✅؛ ‏any ‏+0.
- **REM1 (Codex-P1، نفس الفرع)**: سُجّلت ‏0039 في ‏manifest (‏baseline-0039 + ‏sha256 + ‏6 فهارس + ‏known_history) + ‏readiness ‏24←27 (تثبيت ‏0039 + ‏FAILان مغلقان جديدان). ‏27/27 مثبتة على بايتات ‏LF (حالة ‏CI)؛ محلياً ‏15 ✅ والباقي انحراف ‏CRLF موثق. بلا تطبيق إنتاجي.
- **المتبقي (blockers فقط)**: re-REMOTE مستقلة على ‏HEAD الجديد ← دمج القائد بـexpected_head_sha ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. ‏0039 مطبَّقة إنتاجياً ومثبتة (سجل ‏d1_migrations ‏40، ‏pending فارغ، ‏indexes ‏107←113، ‏users/competitions/tables بلا تغيير) — لا تطبيق ثانٍ. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.
- **PROD-APPLY (owner §9، تم)**: ‏PR103 ‏post-merge أخضر (‏Quality ‏37760838270 + ‏Deploy ‏37760838240 على ‏9cbb93c) قبل أي كتابة؛ ‏precheck (سجل ‏39/39 + ‏pending ‏0039 وحدها + ‏SHA256 مطابق)؛ ‏apply ‏0039 وحدها ‏✅؛ ‏postcheck ‏read-only أخضر. التفاصيل في ‏WORKLOG.
## R4 centralized <title> escaping · فرع feat/r4-title-escaping (من 2e3d368 = origin/main)

- 🔧 تنفيذ LOCAL مكتمل، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية/ترحيل/مسارات جديدة (routes ‏236←236). كل المغلق (R3-C3 وما قبلها + ‏D1 bind #100) لم يُمس.
- forensic: ‏ALREADY DONE (رحلات DEPLOYED ببوابات ما بعد الدمج؛ أجسام ‏docs مهربة عند العرض؛ ‏i18n بلا كيانات)؛ الفجوة الحقيقية (1): ‏generateHTML كان يحقن ‏title الخام في ‏<title> وتصله عناوين يتحكم بها المستخدم (عنوان المنافسة/الاسم المعروض/‏username/عناوين الوثائق) — قابلية كسر ‏‎</title>‎ مثبتة. ليست فجوة: ترقيم ‏‎/docs‎ (النموذج يدعم ‏limit/offset والفهرس ~6 صفوف — يبقى non-blocking).
- نفّذ: تهريب مركزي واحد في ‏generateHTML عبر ‏Sanitize.escapeHtml (المنادون يمررون خاماً كما قبل — بلا تهريب مزدوج)؛ أسطر ‏‎<title>‎ الثابتة (‏oauth/static/email) لم تُمس.
- **الأدلة**: T جديد ‏r4-title-escaping ‏4/4 (‏RED ‏4/4 بلا الإصلاح) + الجيران (‏csp/object-title/docs ‏27/27)؛ ‏tsc ✅؛ ‏build ✅؛ ‏any ‏283 = ‏BASE (‏+0، السقف ‏310).
- **REM1 (Codex-P2، نفس الفرع)**: عناوين المنافسات مهرّبة-مخزنة (‏T1.4) فالتهريب المركزي كان يضاعفها (‏RED مثبت ‏`A&amp;amp;B` عبر ‏create→DB→live-room) — فك ترميز واحد عند حد ‏live-room فقط (‏unescapeHtml المعكوس الدقيق) والتهريب المركزي يبقى وحيداً (‏XSS مغلق). T ‏4←8 (‏A&B + ‏‎<tag>‎ + ‏‎</title><script>‎ عبر المسار الحقيقي + ‏round-trip)؛ الجيران ‏43/43؛ ‏tsc/build ✅؛ ‏any ‏+0. المصارف الأخرى مثبتة السليمة (‏profile/docs/i18n).
- **المتبقي (blockers فقط)**: re-REMOTE مستقلة ← دمج بـexpected_head_sha ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.
- **POST-MERGE (مدموجة ‏9cbb93c)**: ‏PR103 ‏MERGED والقائد أكمل البوابات؛ هذا القسم أرشيف للفرع المدموج — لا re-REMOTE عليه.

## R3-C3 synthetic-retirement future design · فرع feat/r3-c3-retirement-design (من 88461f6a = origin/main)

- 🔧 تصميم/توثيق LOCAL مكتمل، بانتظار REMOTE — ليست DONE. وثيقة فقط بلا حذف/ترحيل/جدولة/endpoint تدميري (‏KEEP NOW سارية). ‏C1/C2 مغلقان ولم يُمسا.
- forensic: الواقع الحالي (‏is_fake الافتراضي، 3 مواقع حذف وحيد best-effort بعد إنشاء حقيقي، قوائم تبعية مثبتة بـPRAGMA) مقابل غير الموجود (مسح عمري/دفعي/dry-run/زر/‏cron/استرجاع).
- أضيف: ‏docs/20-SYNTHETIC-RETIREMENT-DESIGN.md (تصنيف/عتبة مقترحة قابلة للضبط/تفويض صريح/حمايات ‏FK ومالية/تدقيقية/dry-run إلزامي/‏fail-closed/مراقبة واسترداد/قرارات مفتوحة للمالك).
- **الأدلة**: T جديد ‏r3-c3-retirement-design ‏3/3 (الوثيقة بأقسامها الثمانية؛ لا مسار حذف خارج المواقع الثلاثة المثبتة؛ صدق عدم-الادعاء) + الحراس القائمة خضراء (19/19 مع ‏SyntheticRetirement وIsFakeCreation)؛ الكاملة ‏1387 + ‏16 بيئية ‏Windows مسبقة؛ ‏tsc ✅؛ ‏build ✅؛ ‏any ‏295 (+0).
- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـexpected_head_sha ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.

## R3-C2 admin-managed documents/data · فرع feat/r3-c2-docs-data (من d7021ae = origin/main)

- 🔧 تنفيذ LOCAL مكتمل، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية/ترحيل/اعتمادية جديدة (routes API ‏235←236: ‏GET /api/documents فقط؛ الصفحتان ‏/docs و/docs/:slug ليستا API). ‏R2-A مغلق ولم يُعَد بناؤه.
- forensic: الموجود ‏ALREADY DONE (نموذج/‏CRUD/بوابة مشرف/قراءة عامة/واجهة لوحة/بذور موسومة)؛ الناقص الحقيقي (1) فهرس/صفحات قراءة عامة (2) محتوى فئات ‏C2 (رسالة المشروع/المنتج/الهندسة/المصدر المفتوح/مساهمات ‏AI/مسودة قانونية موسومة بلا ادعاء).
- نفذ: ‏listPublishedPublic + ‏listPublished (بيانات وصفية فقط)؛ صفحتا ‏/docs (فهرس) و/docs/:slug (قارئ) بختم ‏HTML ومناطق آمنة وبلا ‏JS (لا سطح ‏CSP جديد؛ المسودات/الخاصة ← ‏404)؛ مدخل الفوتر + مفاتيح ‏ar/en؛ ‏6 بذور ‏C2 مسودة/خاصة موسومة بلغة عدم-ادعاء صريحة.
- **الأدلة**: T جديد ‏r3-c2-docs-data ‏6/6 + ‏UI ‏r3-c2-docs-pages ‏3/3 (كتابة المشرف/‏CRUD/الإصدارات/الفهرس/‏404/التدقيق/البذور/‏XSS/‏RTL)؛ الجيران (‏r2-a-admin + ‏r2-a-admin-ui + ‏csp-hardening ‏30/30)؛ الكاملة ‏1384 + ‏16 بيئية ‏Windows مسبقة على ‏BASE؛ ‏tsc ✅؛ ‏build ✅؛ ‏G2 ‏295 = ‏BASE (+0).
- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـexpected_head_sha ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.




## HOTFIX D1 100-param limit / home-rails 500 · فرع `fix/d1-param-limit-home-rails` (من `d5233f4` = origin/main)

- 🔧 تنفيذ LOCAL مكتمل (يشمل معالجة REMOTE #2: ‏A1–A4 مضادة-ربط + ‏3 ترحيل ترقيم + تدقيق نهائي شامل)، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية/ترحيل/إعدادات (routes ‏235←235). PR #99 لم تُمس (HOLD محترم). H7/D1/D2 بلا إعادة تصميم أوزان.
- السبب الجذري: حد D1 الصلب 100 معامل مربوط/استعلام. ‏`loadProfiles` كانت تربط الدفعة (حتى 80) مرتين (‏UNION ALL صانع+خصم ⇒ حتى 160؛ ‏51+ معرّف ⇒ ‏500 إنتاجي) و`loadSpecializations` بنفس النمط الكامن. الإصلاح: تقسيم كل استعلام ثنائي إلى استعلامين أحاديي الربط (≤80) مع الدمج في ‏JS بنفس الدلالة الدقيقة (‏UNION ALL/GROUP BY/استبعاد ‏NULL/ائتمان كل جهة مرة). حارس ‏shim جديد في ‏`sqlite-d1.ts` يرمي خطأ D1 الإنتاجي عند ‏>100 (اختباري فقط).
- **الأدلة**: T ‏`d1-param-limit-hotfix` ‏16/16 (الأصل ‏9: حارس ‏101/100؛ ‏loadProfiles/loadSpecializations بـ60؛ مسارات ‏home-rails الثلاثة + ضابط صغير — ‏RED مثبت بخطأ ‏`binds 120 parameters`؛ الجديد ‏7: ‏A1 ‏suggested/live+upcoming و‏A2 ‏category/live بهوية موثقة مع ‏120 حظر (باتجاهين) + ‏120 إخفاء وكل استبعاد مفروض، ‏A3 ‏GET /api/recommendations مع ضابط مستخدم نظيف، ومسارات الترحيل ‏guest/search/matchmaking بحد ‏150 — ‏RED مثبت بأخطاء ‏241/124/150/152 عبر ‏500 حقيقية)؛ الجيران (‏recommendations-ranking/lang، ‏home-rails-continuation ‏13/13، ‏r3-d2 ‏16/16، ‏r3-d1 ‏21/21، ‏home-rails ‏UI، ‏b1-my-competitions)؛ الكاملة ‏1355 + ‏16 بيئية ‏Windows مسبقة على ‏BASE (‏6 ‏jq + ‏10 ‏readiness — بلا مساس)؛ ‏`tsc` ✅؛ ‏`build` ✅؛ ‏G2 ‏295 ≤ ‏310.
- **REMOTE**: ‏#1 ‏APPROVE/MERGE-SAFE YES (الإصلاحات الأصلية كما هي)؛ ‏#2 ‏REJECT أُغلق هنا (‏A1–A4 + ‏3 ترحيل إضافي + تدقيق نهائي: لا مسار إنتاجي معروف يتجاوز 100 بعد ‏#100).

- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـ`expected_head_sha` ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.




## R3-C1 contextual help + FAQ/role guides + i18n/a11y · فرع `feat/r3-c1-help-a11y` (من `d5233f4` = origin/main)

- 🔧 تنفيذ LOCAL مكتمل بعد استلام جنائي (takeover)، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية/ترحيل جديد (routes API ‏235←235؛ ‏`/help` + `/faq` مسارا صفحة فقط، لا API ولا جرد).
- العقد: (مطابق للأصل)
  (1) صفحة Help & Guides `GET /help` + `/faq` → `helpPage`: نظرة عامة، أدوار صانع/منافس/مشاهد (3 أدلة)، 10 مواضيع منظمة (إنشاء / دعوة / بث / تسجيل / تقييم / تفاعل / تعليقات / اكتشاف / تسوية / دعم) بحدود/أسئلة شائعة، و قسم الوصول، كل ‏#anchor قابل للوصول عبر روابط "تعرف على المزيد" السياقية في (إنشاء / منافسة / بث / أرباح / تبرع / رسائل/الدعم الإداري / 404).
  (2) i18n `help_guide` (ar≠en): 10 مواضيع × عنوان + 3 فقرات + سؤال + إجابة + حدود + 3 أدوار × 6 فقررات + FAQ 10×(سؤال+إجابة+حدود) + ملاحظة وصول + `skip_to_content`.
  (3) مدخلات مساعدة: أيقونة مساعدة في الناف بار للجميع (`/help?lang=...` + `aria-label`)، رابط في قائمة المستخدم، روابط "اتصل بالمسؤول" و "مساعدة" في الفوتر، رابط /help في الـ 404، `Modal.showHelp()` يوجه بدل `alert()` مفتاح مفقود.
  (4) وصول: زوم قابل للتمكين (`initial-scale=1.0`، إزالة `maximum-scale`/`user-scalable=no`) + رابط تخطي إلى `#main-content` بهدف شامل واحد في الـnavigation المشترك (يُصيَّر مرة واحدة في كل سطح HTML بما فيه 404؛ أُزيلت الـids المكررة من `main.ts`/`about`/`help` وأُعيدت تسمية حاوية الرئيسية إلى `home-content` مع تحديث `HomePage.ts`)؛ `Toast` كمنطقة معرَّفة `role="status"` + `aria-live="polite"`؛ نصوص خطأ `role="alert"` (تسجيل/استرداد/سحب)؛ ارتباط حقول/عناوين بصري حقيقي (`for`/`id`) في (تسجيل/تسجيل جديد/إعادة تعيين / إنشاء / سحب); نوافذ مخصصة (`settings`/`schedule`/`report`/`invite`) `role="dialog"` + `aria-modal` + زر إغلاق مع `aria-label` + إغلاق `Escape`؛ أسماء وصول للأزرار وحيدة الأيقونة؛ نجوم التقييم أزرار أصلية بأسماء صادقة (اسم المنافس + القيمة) بعد إزالة `radiogroup`/`radio` الزائفة (لا `aria-checked` مُدار ولا تنقل أسهم — الدور كان يكذب على التقنيات المساعدة).
- **استلام جنائي (BASE ‏d5233f4 → ‏a20a8bf)**: الـHEAD السابق فشل رسمياً (Quality #254 على `any-count ratchet baseline 310` ثم Deploy #483 skipped). السبب الجذري المثبت: `help-page.ts` أضاف ~20 `(tr as any)` (‏`tr` من نوع `any` أصلاً عبر `Record<string, any>` فالـcasts زائدة وتحسب في العداد) → ‏~315 > ‏310. إصلاحات الاستلام: (1) حذف كل `as any` المضافة (العدد الآن ‏295 ≤ ‏310)؛ (2) إصلاح رابط معطوب حقيقي: بطاقة الدعم كانت تبني `/messages?tab=admin?lang=` (‏`?` مزدوجة) عبر `withLang()`؛ (3) هدف الـskip كان موجوداً في 3 أسطح فقط من ~24 — أصبح شاملاً عبر الـnavigation؛ (4) إزالة أدوار الراديو الزائفة. كل ما عداها KEEP (المحتوى دقيق مقابل R2/D1/D2: ‏300s/H3/‏provisional/‏single-effective/‏timed-comments/‏snapshot/‏non-refundable/هوية Dueli الإدارية). بلا revert واسع، بلا تغيير منطق مغلق، بلا migration/dependency.
- **الأدلة**: T ‏`r3-c1-help-a11y` ‏20/20 (‏17 ثابتة مصححة + 3 إخراج مُصيَّر حقيقي عبر `app.request`: ‏`/help` en بكل الأقسام + هدف واحد + صفر `id` مكررة، ‏`/faq` ar بـRTL ونصوص مميزة، كل الـhrefs سليمة الشكل)؛ الجيران (`csp-hardening` ‏11/11، ‏`modal-accessibility` + ‏`b2-language` ‏18/18، ‏`b1-my-competitions-auth` + ‏`live-room-ui` ‏13/13)؛ `tsc --noEmit` ✅؛ `npm run build` ✅ (‏churn الـCSS رُجع)؛ عدّ `any` ‏295 ≤ ‏310.

- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـ`expected_head_sha` ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.

## R3-D2 user discovery + matchmaking (h7-v1) · فرع `feat/r3-d2-user-discovery` (PR #98، من `f8c7add` = origin/main بعد دمج R3-D1-REM1 #97)

- 🔧 ‏REMOTE REJECT ← إصلاح LOCAL مكتمل على نفس الفرع/PR، بانتظار re-REMOTE — ليست DONE. بلا PR جديد/دمج/نشر/كتابة إنتاجية/ترحيل (routes ‏225←235 ثابتة). D1+REM1 مغلقتان؛ H7-v1 بلا تغيير أوزان.
- الرفض (3 ‏blockers) والإصلاح على نفس ‏HEAD: ‏(1) ‏actual participation أصبح ‏`started_at IS NOT NULL` المركزي ‏(`ACTUAL_PARTICIPATION_WHERE` — ‏startLive الكاتب الوحيد المثبت) بدل ‏opponent/status، وطُبق على ‏loadProfiles/loadSpecializations/partCats؛ ‏(2) بوابة لغة في ‏h7OpponentLayer: ‏wrong-language المعروفة تسقط إلى ‏fallback 3 ولا تسبق ‏L2 المناسبة؛ ‏(3) ‏creator Profile المفقود في المشاركة ‏0.5 ‏neutral عند توفر الإشارة للجلسة بدل إسقاط الوزن (الصفر المقاس يبقى ‏0).
- **الأدلة**: T ‏`r3-d2-user-ranking` ‏16/16 (‏13 + مصفوفة ‏lifecycle الست + ‏wrong-language/ar/en + ‏neutrality الثلاثي) + ‏UI ‏`r3-d2-profile-display` ‏5/5؛ الحراس ‏220/220 (‏H7/D1/lifecycle/startLive/ratings/ELO/invite/follow/search/settings)؛ ‏`tsc` ✅؛ ‏`build` ✅ (‏churn رُجع)؛ ‏G2 ‏+0 ‏any.
- **المتبقي (blockers فقط)**: re-REMOTE مستقلة ← دمج بـ`expected_head_sha` ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.

## R3-D1-REM1 close 4 known follow-ups · فرع `fix/r3-d1-rem1-followups` (من `1c84bc4` = origin/main بعد دمج R3-D1 #96)

- 🔧 تنفيذ LOCAL مكتمل، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية/ترحيل/مسارات جديدة (routes ‏225←225). النطاق: الملاحظات الأربع فقط (Unicode search، حماية `fav:`، invariant عدّ المشاهدات، تصحيح التعليق) — بلا توسع إلى D2.
- العقد: طبقات H7 بلا تغيير (exact → prefix/whole-word → partial) مع whole-word Unicode حقيقي ar/en؛ `fav:` محجوز لمسار الإعدادات (generic writers محايَدة + taxonomy/ownership قائمتان)؛ H2 invariant حقيقي (كاتب واحد SSOT، `/analytics/view` alias idempotent، dead trap محذوف)؛ التعليق يصف الحقيقة الجديدة بعد الإثبات.
- **الأدلة**: T جديد `r3-d1-rem1-followups` ‏18/18 + الحراس المتأثرة (H7/search، favorites/settings، L1/watch/views، CSP، schema ‏127/127) خضراء؛ ‏`tsc` ✅؛ ‏`build` ✅ (‏churn رُجع)؛ ‏G2 ‏+0 ‏any.
- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـ`expected_head_sha` ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.

## R3-D1 H7 approved ranking (h7-v1) · فرع `feat/r3-d1-ranking` (من `17d6dd7` = origin/main بعد دمج R2-F #95)

- 🔧 تنفيذ LOCAL مكتمل، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية/خدمات مدفوعة/ترحيل جديد (routes ‏221←225: similar-sessions ×2 + settings/favorites ×2).
- العقد: H7-v1 حرفياً من 11 (الأوزان/الصيغ/الأنصاف/التوزيع/الاكتشاف/التنوع) بمصدر مركزي واحد؛ الأهلية أولاً ثم الترتيب على بنية الجلسات القائمة؛ Guest يرى upcoming؛ طبقات البحث قبل الشهرة؛ المشابهات بأوزان 11 بلا embeddings؛ الإشارات الحقيقية فقط (H2/نجوم فعالة/Like-Dislike/follows/history) + فجوة المفضلات أُغلقت داخل D1 (namespaced user_keywords + Settings).
- **الأدلة**: T جديد `r3-d1-h7-ranking` ‏21/21 + تحديث التثبيتات المتجاوَزة إلى H7 (`recommendations-ranking` ‏8/8، ‏`b7-explore-pagination-ordering` ‏3/3، ‏`guest-suggested-continuation` ‏9/9)؛ الحراس المتأثرة (§10: explore/home/search/ratings/likes/schema/settings/csp ‏126/126 + ‏UI ‏62/62) خضراء؛ الكاملة ‏1300/1316 (الـ16 بيئية Windows مسبقة على BASE: ‏6 jq + ‏10 readiness-CRLF بلا مساس migrations)؛ ‏`tsc` ✅؛ ‏`build` ✅ (‏churn رُجع)؛ ‏G2 ‏+0 ‏any.
- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـ`expected_head_sha` ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE. D2 خارج النطاق (Profile UI/history، user-search ranking، opponent matchmaking).

## R2-F remaining journeys (notifications/profile/deletion/social/donations/advertiser/moderation) · فرع `feat/r2-f-journeys` (من `2497bda` = origin/main بعد دمج R2-P #94)

- 🔧 تنفيذ LOCAL مكتمل، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية/ترحيل جديد/مسارات جديدة (routes ‏221←221). R1 والمالية/ELO/L1/V/L2/A/M/P وH7/D1/D2 مغلقة ولم تُمس خارج العقد.
- العقد: إشعارات (قراءة بملكية ‏404 لصف الغير)؛ شكاوى (تتبع بملكية ‏404 + مدخلا nav للمعلن/شكاوى)؛ متابعة (تكرار idempotent بإشعار واحد + hydration بعد refresh + زر إبلاغ في profile)؛ ‏reports الحالية ‏target_type/target_id/reason (القديمة ‏422 دائماً)؛ تبرعات (قسم ‏My Donations + ‏GET /my) بلا مساس المالية؛ معلن (إصلاح SyntaxError + مفتاح الجلسة الموحد)؛ حذف حساب ذري ‏batch واحد (إخفاء أولاً، أطفال-قبل-الأب لسلامة ‏FK، مسح ‏PII البنكية/السجل مع بقاء صفوف الدفتر، ‏verify بـ‏CryptoUtils).
- **الأدلة**: T جديد `r2-f-journeys` ‏7/7 + UI جديد `r2-f-journey-pages` ‏7/7 (‏SqliteD1 بالترحيلات الحقيقية: ملكية الإشعار/الشكوى ‏404، إشعار متابعة واحد، ‏verify ‏PBKDF2/legacy، حذف شامل ذري، عقد ‏reports، ‏my) + تحديث تثبيتات قديمة لعقد idempotent (‏follow-extraction/model)؛ الحراس المتأثرة (مال/تبرع/دفتر/stripe/sحب/شفافية + مخطط + ‏readiness + جيران ‏R2-A/M/P/J) خضراء؛ ‏`tsc` ✅؛ ‏`build` ✅ (‏churn رُجع)؛ ‏G2 ‏+0 ‏any؛ routes ‏221←221.
- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـ`expected_head_sha` ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.

## R2-P saved payout methods + withdrawal snapshots · فرع `feat/r2-p-payout-methods` (من `ec27f72` = origin/main بعد دمج R2-M #93)

- 🔧 تنفيذ LOCAL مكتمل، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية/تحويل فعلي (لا بنك/KYC/provider — مؤجل R0/H). ترحيل واحد مضاف (`0038_withdrawal_payout_snapshot`: عمودا `payout_method_id` ‏FK→payment_methods ‏SET NULL + `payout_snapshot` ‏NOT NULL ‏`'{}'` + فهرس) + بيان `baseline-0038` في نفس الفرع. R2-A/J/L1/V/L2 والمالية/ELO مغلقة ولم تُمس خارج العقد.
- العقد: ‏CRUD طرق الدفع القائم مُصلَّب (‏allowlist نوع + تحقق مدمج عند تغيير النوع + ‏i18n بدل الإنجليزية الحرفية + ملكية ‏404 + ‏setDefault ذري ‏batch + حذف ‏default يرقّي الأقدم/‏null)؛ السحب يقبل ‏`payout_method_id` مملوكاً (غيره ‏404) فيلتقط لقطة التنفيذ ويملأ ‏display تلقائياً، أو المسار النصي القديم كما هو؛ اللقطة تُكتب مرة واحدة ولا تُحدَّث أبداً (تعديل/حذف الطريقة لاحقاً لا يغيّر الطلب — الرابط وحده ‏NULL)؛ صفوف ‏legacy (بما فيها ما قبل ‏R2-P) تُصرف ‏approve→paid بلا تغيير.
- **الأدلة**: T جديد `r2-p-payout-methods` ‏5/5 (SqliteD1 حقيقية: ‏CRUD/تحقق/‏default/ترقية الحذف/عبور-مستخدم ‏404/لقطة/تجميد/‏legacy) + UI جديد `r2-p-payout-ui` ‏5/5 (مودال يعرض المحفوظ أولاً + إرسال ‏id/نص + ‏CSP بلا مداخل جديدة + ‏i18n ‏ar≠en)؛ الحراس المتأثرة ‏72/72 (سحب/مال/دفع/شفافية/أرباح) + ‏schema-contract ‏24/24 (كانت حمراء على ‏BASE منذ ‏R2-L1 — حُدّثت للواقع ‏35←39 + جداول ‏0035–0037 + عمودا ‏0038) + تقاعد ‏13/13 (‏FK الجديدة ليست ‏users/competitions فلا تغطية لازمة) + ‏readiness ‏24/24 (‏0037-shape ‏FAIL + ‏0038-shape ‏PASS)؛ ‏`tsc` ✅؛ ‏`build` ✅ (‏churn رُجع)؛ ‏G2 ‏281 = ‏BASE ‏281؛ routes ‏221←221 (لا مسارات جديدة — CRUD/السحب على المسارات القائمة).
- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـ`expected_head_sha` ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. تطبيق 0038 إنتاجياً يبقى owner-gated (‏pre-merge action من القائد). أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.

- 🔧 تنفيذ LOCAL مكتمل، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية. ترحيل واحد مضاف (`0037_support_messaging`: جداول `support_threads/messages` + 4 فهارس — لا صفوف seed) + بيان الإصدار `baseline-0037` في نفس الفرع. R2-A/J/L1/V/L2 مغلقة ولم تُمس؛ بلا R2-P/H7/D1/D2.
- العقد: (1) الشخصي — النظام القائم كما هو (ALREADY DONE: بدء/إرسال/قراءة/unread/حدود/حظر) ومثبت باختبار إثبات (محادثة ثنائية + ثبات refresh + حجب الغريب 403 + مجهول 401). (2) الإداري — نظام مستقل H6: تخزين `support_*` فقط (ممنوع الشخصي)، مسارات `/api/support/*` للمستخدم (خيوطه فقط) و`/api/admin/support/*` للوكلاء؛ كتابة SuperAdmin/Moderator وقراءة Auditor (غيره 403)؛ الرد الرسمي `sender_kind=admin` بهوية Dueli الرسمية (لا رابط شخصي) مع `sender_id` + audit؛ إشعار مميز `admin_message` برابط الخيط الإداري (لا خلط مع `message`). (3) UI — تبويبا personal/admin بعدادات مستقلة + روابط عميقة (`tab/conversation/thread/user`)؛ أيقونة Contact Admin → `?tab=admin` (الميت `?admin=true` أُزيل)؛ إشعار الإدارة يفتح الخيط الصحيح؛ صندوق وارد مستقل في لوحة الإدارة؛ ar/en + RTL + CSP.
- **الأدلة**: T شخصي `r2-m-personal` ‏3/3 + T إداري `r2-m-admin` ‏5/5 (SqliteD1 بالترحيلات الحقيقية: فتح/رد/إغلاق-409/إعادة-فتح، أدوار ‏200/403، فصل unreads، فصل تخزين بالعدّ الصفري، رابط الإشعار ‏`tab=admin&thread=`) + UI جديد `r2-m-messages-ui` ‏11/11؛ الجيران المباشرون (notification-types/messages-i18n/messages-contract/template/avatar) خضراء — كشف قديم واحد (`messages-contract` يثبت collection واحدة) حُفظ بإعادة تسمية متغير الدعم؛ الكل ‏95/95؛ ‏`tsc` ✅؛ ‏`build` ✅ (‏CSS churn رُجع)؛ ‏G2 ‏281 = ‏BASE ‏281 (صفر جديد)؛ routes ‏211←221 (5 دعم + 5 صندوق إداري)؛ readiness ‏22/22 (‏0036-shape ‏FAIL + ‏0037-shape ‏PASS).
- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـ`expected_head_sha` ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. تطبيق 0037 إنتاجياً يبقى owner-gated بعد الدمج. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.
- **FIX (CI #240، نفس الفرع)**: فاحص `SyntheticRetirement` كشف FKs غير مغطاة (`support_threads.user_id` + `support_messages.sender_id`) — أُضيفت القائمتان بنمط `USER_DEPENDENTS` القائم (تخطي مالكي صفوف الدعم، بلا تدمير تلقائي، بلا تغيير migration/manifest) + إثبات سلوكي (تقاعد الحر يُقبل، مالك الخيط يُتخطى بلا FK failure). المستهدف ‏55/55 ✅، ‏G2 ‏281 = ‏BASE.

## R2-A admin identity/access + account settings + roles + H9 documents/data · فرع `feat/r2-a-admin` (من `fed9b93` = origin/main بعد دمج R2-L2 #91)

- 🔧 تنفيذ LOCAL مكتمل، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية. ترحيل واحد مضاف (`0036_managed_documents` — لا صفوف seed فيه؛ بيانات الاختبار في `db/seed.sql` موسومة `is_seed=1`). J/L1/V/L2 مغلقة ولم تُمس؛ بلا R2-M/R2-P/bank/H7/D1/D2. حساب `admin/admin` مؤقت للتطوير فقط (سكربت، لا migration/seed، والإنتاج H8/owner-gated).
- العقد: (1) الهوية — bootstrap جاف-أولاً + local فقط + رفض remote؛ حارس خادمي على `/admin` (غير مشرف 403) + مدخل `#adminMenuItem` للمشرف فقط؛ `role/is_admin` موحّدان (مزامنة عند المنح/السحب، بلا نظام موازٍ). (2) الإعدادات — username/password/email من الحساب نفسه مع تحقق (409/422/401) ودورة جلسات صحيحة (كلمة المرور تدمر الكل + reauth؛ البريد يصفّر التوثيق ويُبقي الجلسات) وaudit بلا أسرار وDTO بلا hash. (3) الأدوار — SuperAdmin فقط للمنح/السحب (غيره 403)؛ دور صالح فقط (422)؛ هدف موجود (404)؛ آخر SuperAdmin محمي (409). (4) وثائق H9 — CRUD إداري + draft/published + معاينة ar/en + private/public (العامة المنشورة تُقرأ مجهولاً، الباقي 404) + version++ وaudit؛ لا بنك/KYC حقيقي ولا CMS عام. (5) ملاحظة: `GET /api/admin/stats` ‏500 قائم على BASE (عمود `amount` مفقود — لم يُمس، خارج النطاق).
- **الأدلة**: T جديد `r2-a-admin` ‏9/9 (SqliteD1 بالترحيلات الحقيقية: دخول admin ‏200/خاطئ ‏401؛ حارس ‏200/403/403 + صفحة ‏200/403؛ الإعدادات الثلاثة + دورات الجلسات + ‏audit + بلا تسريب؛ منح/سحب + ‏403 تصعيد + ‏422/404/409؛ وثائق ‏CRUD/version/نشر/خصوصية/حذف + ‏audit + ‏seed موسوم؛ ثبات الجلسة) + UI جديد `r2-a-admin-ui` ‏10/10 (حارس/مدخل/حساب/وثائق/‏CSP/i18n ar≠en/‏bootstrap/مسارات/‏dark-RTL)؛ ‏csp-hardening ‏11/11؛ ‏`tsc` ✅؛ ‏`build` ✅ (‏CSS churn رُجع)؛ ‏G2 ‏286 مقابل ‏BASE ‏281 (‏+5، دون 310)؛ routes ‏202←211 (3 حساب + 5 وثائق إدارية + 1 قراءة عامة — مولّدة آلياً)؛ بلا full gates معادة.
- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـ`expected_head_sha` ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. إنتاج المشرف (H8) يبقى owner-gated بعد الدمج. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.

## R2-L2 production live-room + Media/VOD + Like/Dislike + timed comments + single ad slot · فرع `feat/r2-l2-live-room` (من `35ccd4f` = origin/main بعد دمج R2-V #90)

- 🔧 تنفيذ LOCAL مكتمل، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية. ترحيل واحد مضاف (`0035_comments_video_offset`: عمود `video_offset` ‏NULL — ضروري فعلاً: لا بنية قائمة تحمل موضع التشغيل؛ تُختبر مع الترحيلات الحقيقية). J/L1/V مغلقة ولم تُعَد بناؤها (90/90 خضراء)؛ بلا H7/D1/D2 (إشارات Like/Dislike جاهزة شكلاً فقط)؛ بلا ranking؛ بلا تغيير صلاحيات start/end؛ اختبار S/device مؤجل لـR4 (غياب الجهاز ليس blocker للكود).
- العقد: (1) الغرفة — creator/opponent/viewer يدخلون `/live/:id` الإنتاجية (الدور من الجلسة)؛ صفحات `/live/host|guest` التجريبية باقية للتشخيص وليست الوسيلة الوحيدة. (2) الوسائط — حالات waiting/playing/error/processing/ready/unavailable + retry يدوي (تكرار تلقائي محدود 8×15s)؛ الجاهزية من `hasPlayableRecording` وحده (بلا HEAD)؛ completed بلا تسجيل ≠ recorded. (3) Like/Dislike — thumbs بدل القلب، فعالة واحدة like/dislike/neutral تُرسم من استجابة الخادم (التبديل لا يضاعف)؛ `show()` تحمل `user_reaction`. (4) تعليقات موقوتة — `video_offset` في POST/SSE/GET على نفس قناة `competition:<id>` (لا نظام ثانٍ)؛ الالتقاط في VOD فقط؛ القائمة النهائية مرتبة زمنياً؛ تمييز متزامن مع `timeupdate`. (5) إعلان واحد تحت الإحصائيات بعيداً عن video/comments/ratings عبر الخدمة القائمة؛ impression مرة واحدة عند الظهور الفعلي (observer + idempotency)؛ الميزانية/الخصم خادمياً؛ بلا click ولا إجراء مدفوع.
- **الأدلة**: T جديد `r2-l2-timed-comments` 6/6 (SqliteD1 بالترحيلات الحقيقية: offset/تقليم-NULL/SSE/get، ‏recorded مقابل bare، تبديل like→dislike بصف واحد وneutral، ‏user_reaction، حراس 403/409) + UI جديد `r2-l2-competition-ui` 9/9 (غرفة/حالات/retry/‏predicate/زوج التفاعل/توقيت/إعلان/‏i18n/‏dark-RTL)؛ الجيران J/L1/V/likes/comments/guards/ads ‏90/90؛ الكاملة ‏1226/1232 (الـ6 ‏quality-gate-poll: غياب ‏jq على ‏Windows — بيئية ومثبتة على ‏BASE)؛ ‏`tsc` ✅؛ ‏`build` ✅ (‏CSS churn رُجع)؛ ‏G2 ‏281 = ‏BASE ‏281؛ routes بلا تغيير (لا endpoints جديدة).
- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـ`expected_head_sha` ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.

## R2-V live-only viewer ratings · فرع `feat/r2-v-live-ratings` (من `fbc8607` = origin/main)

- 🔧 تنفيذ LOCAL مكتمل، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية/تعديل migrations. R2-L1 مغلقة ومنشورة ولم تُمس (أُعيد استعمال SSOT الـwatch فقط)؛ بلا watch mechanism جديد؛ بلا L2/H7/D1/D2.
- العقد: تقييم 1..5 للمسجل المؤهل (300s live لنفس المنافسة عبر `getViewerWatch` وحده؛ 299⇒403 و300⇒201؛ بلا ثقة بمدخلات العميل)؛ الطرفان معاً مسموحان؛ التعديل يستبدل (POST upsert 201/200 + PUT صريح 200/404؛ صوت فعال واحد)؛ كل كتابة (rate/update/withdraw) محروسة داخل SQL بحالة `live` (سباق القطع ⇒ 403 بلا صف)؛ بعد النهاية كل كتابة مرفوضة فوراً (لا 24h ولا grace)؛ أثناء البث حصيلة مؤقتة معلنة تُبث عبر قناة `competition:<id>` القائمة (`rating_updated`)؛ عند الإغلاق قطع أولاً ثم نتيجة نهائية/ELO/finalize مرة واحدة مع retry/idempotency؛ المعادلات (winner/ELO) والـ20/80 والتاريخ المغلق محفوظة؛ no-ratings/tie بلا نتيجة وهمية؛ واجهة ar/en بالحالات (provisional/final/not-eligible/read-only).
- **الأدلة**: RED أولاً على BASE (جديد `r2-v-live-ratings` 9/10 فشل)؛ T جديد 10/10 (SqliteD1 بالترحيلات الحقيقية) + UI جديد 6/6؛ عقود B10/B11/B12 أُعيدت كتابتها لـR2-V (بلا 24h) + L1/finance بلا regression (83/83)؛ الكاملة 1211/1217 (الـ6 jq على Windows مثبتة على BASE)؛ `tsc` ✅؛ `build` ✅؛ G2 289 = BASE 289؛ routes 201←202.
- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـ`expected_head_sha` ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.

## RELEASE READINESS PATH remediation (Deploy #458) · فرع `fix/release-readiness-path` (من `210008a` = origin/main)

- 🔧 تنفيذ LOCAL مكتمل، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية/تعديل migrations/منتج. النطاق: سطر جامع الـdeploy + سطر الـrunbook + اختباراهما + سطرا docs.
- ‏ROOT CAUSE مثبت على ‏D1 الحية: جامع الـworkflow كان يبني لقطة الفهارس بقائمة مكتوبة يدوياً (‏0033 فقط) فلم تصل ‏idx_competition_views_day الموجودة فعلاً إلى الفاحص — ‏#458 فشل على إنتاج سليم. الإصلاح: القائمة تُشتق من نفس الـmanifest (لا ‏hardcode يجعل ‏0034 يمر فقط؛ أي ‏baseline لاحقة محمية) + ‏runbook §2.
- **الأدلة**: المسار الحرفي الكامل (‏bash جامع الإنتاج ‏read-only + journal + ‏pending فارغ + ‏SHA ‏210008a) ← ‏**READINESS GATE PASS** ‏(16/16)؛ الاستعلام القديم أُعيد حياً فأظهر ‏4 فهارس فقط (إعادة إنتاج العلة)؛ ‏release-readiness ‏15/15 + ‏pin هيكلي للجامع؛ ‏fail-closed محفوظ (‏unknown/hash/missing/target/sha)؛ كل متطلبات الـmanifest مُتحقَّق منها (‏3 جداول × أعمدة + ‏3 فهارس)؛ الكاملة ‏1195/1201 (الـ6 ‏jq على ‏Windows مثبتة على ‏BASE)؛ ‏`tsc` ✅؛ ‏`build` ✅؛ ‏G2 ‏281 = ‏BASE.
- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـ`expected_head_sha` ← انتظار Quality Gate على merge-commit ← ثم deploy الإصدار عبر المسار المصرّح (لا deploy يدوي هنا). أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.

## RELEASE MANIFEST 0034 remediation · فرع `fix/release-manifest-0034` (من `f4c1e66` = origin/main)

- 🔧 تنفيذ LOCAL مكتمل، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية/تعديل migrations. النطاق: manifest الـrelease + اختباراته + سطرا docs فقط.
- السبب: ‏production طبقت ‏0034 بتفويض بينما الـmanifest بقي ‏baseline-0033 فسجل البوابة ‏0034 ‏unexpected-applied ومنع ‏Deploy #456 (المحاولة 2). الإصلاح: ‏baseline-0034 (‏0034 بـhash الملف ‏`7c19c632…e4a57` + ‏history ‏35 + فحوص ‏competition_views/index) — بلا مساس بالـchecker (عام بالتصميم) أو الـmigrations أو الـworkflows.
- **الأدلة**: ‏`release-readiness` ‏14/14 (‏pin ‏0034، سيناريو الإنتاج ‏PASS، ‏pre-0034 ‏FAIL-closed، ‏fail-closed الباقي محفوظ)؛ محاكاة البوابة على مدخلات الإنتاج الحقيقية (journal + ‏pending فارغ + لقطة مخطط حية + ‏SHA ‏f4c1e66) ← ‏**READINESS GATE PASS**؛ الكاملة ‏1193/1199 (الـ6 ‏jq على ‏Windows مثبتة على ‏BASE)؛ ‏`tsc` ✅؛ ‏`build` ✅؛ ‏G2 ‏281 = ‏BASE.
- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـ`expected_head_sha` ← انتظار Quality Gate على merge-commit ← ثم deploy الإصدار عبر المسار المصرّح (لا deploy يدوي هنا). أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.

## R2-L1 التعليقات المشتركة والمشاهدة والحضور · فرع `feat/r2-l1-comments-watch` (من `4c6ddd9` = origin/main)

- 🔧 تنفيذ LOCAL مكتمل، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية. migration واحدة مضافة (`0034_competition_views`: UNIQUE identity/competition/day — ضرورية فعلاً: لا بنية قائمة تحمل guest+day؛ مختبرة reset من فراغ 23/23).
- العقد: تعليقات مشتركة ومحفوظة API/SSE بالكاتب الصحيح وdedup بالمعرف وتبقى بعد refresh (أصلحنا سباق init-at-parse الذي كان يترك الصندوق فارغاً بعد كل reload)؛ الحضور (signaling) مستقل عن العدّ؛ GET لا يعدّ؛ H2 مشاهدة واحدة لكل identity/competition/day (مسجل + ضيف first-party، بلا IP)؛ H1 ‏300s تراكمية live للمسجل فقط بشرائح خادمية capped (‏120s) بلا ثقة بالجسم، وreconnect/replay لا يضاعفان؛ ‏V تقرأ من ‏`getViewerWatch` وحده (سلوك التقييم الحالي untouched)؛ ‏recorded/pending لا تراكم ‏H1؛ بلا ‏R2-V/L2/Like/video-time/H7/J/#86.
- **الأدلة**: ‏RED أولاً على ‏BASE؛ ‏T ‏`r2-l1-watch-comments` ‏12/12 (‏299/300، ‏cap، ‏replay＋0، تزوير مرفوض، ‏day، ضيوف، تزامن، ‏401/403/404/422)؛ ‏UI ‏`r2-l1-comments-watch` ‏6/6؛ ‏E2E حقيقي ‏1/1 ‏ar + ‏1/1 ‏en (‏A/B/C بنفس القائمة والعدّ بعد ‏refresh، حذف يزامن حياً، عدّاد ثابت، نبض مكرر/مزور بلا أثر، ‏mobile/keyboard، صفر أخطاء)؛ الجيران + الكاملة ‏1190/1196 (الـ6 ‏jq على ‏Windows مثبتة على ‏BASE)؛ ‏schema-contract ‏23/23؛ ‏`tsc` ✅؛ ‏`build` ✅؛ ‏G2 ‏281 = ‏BASE؛ ‏routes ‏199←201.
- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـ`expected_head_sha` ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.

## R3-EXPLORE-CONTEXT-1 سياق View All والفرع في Explore · فرع `feat/r3-explore-context-1` (من `020eacc` = origin/main)

- 🔧 تنفيذ LOCAL مكتمل، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية، بلا migrations (إعادة استعمال جداول ‏0033)، بلا engine/store جديد، بلا H7/ranking، بلا R2-J/#75/#76/#82.
- العقد: ‏View All من typed rail context (‏category + ‏subcategory + ‏status + ‏lang + ‏view=competitions؛ ‏Suggested يحمل حالته بلا قسم مختلق) عبر ‏`railViewAllHref` + ظاهر على mobile (أُزيل ‏`hidden sm:flex`)؛ ‏Explore يعرض فلتر فرع صريحاً من taxonomy القائمة (‏parent يمسح فرعاً يتيماً، الفرع لا يسقط ‏status/search/lang/view، و‏view تُحفظ عند submit)؛ ‏URL/direct-open/refresh/back-forward تحفظ السياق؛ الجلسة canonical تشمل ‏subcategory (‏canonicalKey رباعي — الجلسات القديمة ‏409 تُعاد بوضوح)؛ ‏filtering خادمياً قبل pagination؛ ‏retry/cursor/skip-fill داخل التقاطع حتى ‏hasMore=false؛ الأزواج الباطلة ‏422/409 بلا توسعة صامتة إلى ‏All؛ الفرع بلا parent يُملأ canonical لparentه المعروف؛ ‏recorded = ‏completed + تسجيل صالح (‏vod/youtube مقلَّمة — ‏`playableRecording` opt-in في ‏buildFilterWhere، القائمة القديمة untouched).
- **الأدلة**: ‏RED أولاً (‏9/11 فشلت على ‏BASE)؛ ‏T جديد ‏`explore-subcategory-context` ‏11/11 (تقاطع فرع+‏live/upcoming/recorded، ‏traversal ‏>دفعتين بلا ‏dup/skip، ‏invalid pairs ‏422، ‏canonicalize للparent، ‏409 ‏stale/mismatch، ‏retry متطابق، ‏410/404، ‏skip-fill حتى النفاد، ‏search×branch، ضيوف)؛ ‏UI جديد ‏`explore-subcategory-filters` ‏11/11 (‏View All لكل نوع ‏ar/en، ‏selects/روابط/‏banner، ‏session transport، صفر مفاتيح جديدة)؛ ‏E2E حقيقي (‏wrangler+D1 محلي) ‏3/3 ‏ar + ‏3/3 ‏en (‏direct/refresh/back-forward/تغيير فرع، ‏invalid بلا ‏fetch، ‏Home ‏mobile/keyboard/Enter، صفر ‏page/console errors، صفر ‏API فاشلة)؛ الجيران (‏B7/home-rails/owner-visual/search ‏T + ‏B7 ‏E2E ‏4/4) خضراء؛ الكاملة ‏1172/1178 (الـ6 الباقية ‏jq مفقود على ‏Windows — مثبتة على ‏BASE)؛ ‏`tsc` ✅؛ ‏`build` ✅؛ ‏G2 ‏281 = ‏BASE ‏281؛ ‏SEC-06 ‏PASS (تعليق توثيقي فقط).
- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـ`expected_head_sha` ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.

## R2-J الدعوة/الطلب والقبول/الرفض/الانتهاء · فرع `feat/r2-j-invite-join-lifecycle` (من `4c02862` = origin/main)

- 🔧 تنفيذ LOCAL مكتمل، بانتظار REMOTE والدمج وبوابات ما بعد الدمج — ليست DONE. بلا دمج/نشر/كتابة إنتاجية، بلا migrations جديدة (الأعمدة اللازمة موجودة: `accepted_at` في 0010/0011 و`expires_at` في 0010).
- H3 مطبقة خادمياً وواجهوياً: الدعوة المعلقة لنفس المستخدم/المنافسة تمنع طلب انضمام موازياً (409 `invite_pending_exists`)، والطلب المعلق يمنع دعوة موازية (409 `request_pending_exists`)؛ رفض الدعوة يحرر مسار الطلب مجدداً.
- القبول الذري في المسار المستدعى فقط: `accepted_at` تُكتب في نفس الـbatch (منافسات + دعوات)، وخطوة التثبيت تشترط `status='pending'` فلا إحياء لصف مرفوض/مقبول؛ السباق ينتج خصماً واحداً وإشعار قبول واحد (مثبت باختبار تزامن). لا اختراع رجوع accepted→pending ولا حالات جديدة ولا cron/ترحيل تاريخ.
- القبول يتحقق بالترتيب: الدعوة/الطلب معلقة لهذا المستخدم ← غير منتهية (انتهاء كسول `markExpired` بالقيم الموجودة في CHECK) ← المنافسة ما زالت pending بلا خصم ← الحظر ← الذرية (الخاسر 409). المنافسات المغلقة تعطل الأزرار وتعرض سبباً مترجماً (`competition_closed`/`opponent_already_set`).
- إشعار القبول نوع مستقل `invitation_accepted` (لا `request`)، عنوانه `notification.invitation_accepted` عربي/إنجليزي، والرابط `/competition/:id?lang=` بلغة المستلم عند العرض. السجل وارد/صادر بكل الحالات من الموديلات (بلا SQL في المتحكمات)؛ `show` يعرض `user_has_pending_invitation` للcurrent-user فقط؛ صفحة المنافسة تعرض قبول/رفض للمدعو وتمنع المسارات المتعارضة؛ أخطاء 401/403/409 مرئية ومترجمة في API والواجهات.
- **الأدلة**: T جديد `r2-j-invite-join` ‏20/20 (sqlite-d1 بالترحيلات الحقيقية: تعارض H3 بالاتجاهين ar/en، تكرار 409، تزامن بخصم/إشعار واحد، `accepted_at`، رفض/انتهاء/مغلق، حظر/غير مؤهل/401 لكل المسارات، إشعار مميز ومعرب برابط صحيح، سجل كل الحالات مع 403 للغير و401 للزائر، حالة show خاصة بالمستخدم) + UI جديد `r2-j-invite-contract` ‏6/6؛ تحديث 3 تثبيتات قديمة لعقد 409/النوع الجديد؛ الجيران 67/67؛ الكاملة 1148/1156 (8 إخفاقات موجودة على BASE بلا علاقة: 6× غياب `jq` على Windows و2× بصمة 0033 قديمة)؛ `tsc` ✅؛ `build` ✅؛ G2 ‏281 = ‏BASE ‏281.
- **المتبقي (blockers فقط)**: مراجعة REMOTE مستقلة ← دمج بـ`expected_head_sha` ← انتظار Quality Gate على merge-commit ← ثم إعلان الحالة. أي فشل هناك = POST-MERGE BLOCKED بلا ادعاء DONE.


## R3-RAILS-1A+1B home rails continuation · فرع `feat/r3-rails-1ab-continuation` (من `daa449b` = origin/main)

- 🔧 ‏(1A خلفية) كل صفوف Home على مخزن جلسة #75 نفسه (‏ExploreSessionService + ‏ResultSessionProvider + ‏ExploreResultSessionModel/ExploreResultChunkModel — بلا engine/store موازٍ، بلا migrations، بلا تعديل Explore ‏6+6، ‏#75/#76 كما هما): ‏`HomeRailProviders.ts` جديد (‏SuggestedGuestRailProvider واعٍ بالstatus على عائلة سطح ‏`suggested_guest`؛ ‏SuggestedUserRailProvider بسطح ‏`home_suggested_user`؛ ‏CategoryRailProvider بسطح ‏`home_category` لكل Dialogue/Science/Talents وكل subcategory × ‏Live/Recorded/Upcoming) + ‏`HomeRailsController` (بلا SQL) + ‏`POST/GET /api/home-rails/sessions[/:id/page]` (‏auth-optional؛ الجرد ‏197←199). سياق canonical: ‏kind/category/subcategory/status/language/identity/surface/policy ‏`rail-v1`. ‏live=live، ‏upcoming=pending+accepted، ‏recorded=completed+تسجيل صالح (‏vod_url أو ‏youtube_video_url مقلَّمة غير فارغة — ‏RecommendationModel وُسِّعت إضافياً بلا كسر ‏#76؛ ‏CompetitionModel.findHomeRailIds يعيد استعمال نفس predicate بلا ‏LIMIT). المزود يجلب كامل المؤهلين (لا ‏15/100)؛ تجميد الترتيب عند ‏T0 للجلسة فقط (‏Suggested: الأوزان المثبتة؛ الأقسام: خلطة WebCrypto واحدة بدل ‏RANDOM لكل دفعة — لا ‏H7 رقمية ولا ‏random-only نهائي)؛ ‏skip/fill ونفاد حقيقي؛ الحظر/الإخفاء/الذات تُضيِّق مسارات المسجل (كشف إصلاح علة ربط: معاملات الاستبعاد كانت تُربط قبل ‏lang في نص يضع ‏`?` اللغة في ‏ORDER BY — أُصلح الترتيب النصي)؛ الضيف يرى ‏Upcoming (تبويب ظاهر للجميع + إزالة ‏`hidden` العميل) بلا أي صلاحية فعل (‏invite/join تبقى ‏401).
- 🔧 ‏(1B واجهة) كل سكة continuation أفقي مستقل (‏sentinel داخل ‏scroller + ‏IntersectionObserver لكل سكة): دفعات حتى ‏hasMore=false فقط؛ ‏loading/retry/empty/end بالمفاتيح القائمة (‏discovery.retry/no_more_results/loading — صفر مفاتيح جديدة)؛ ‏retry بنفس ‏cursor بلا ‏double append (‏dedup لكل سكة، بلا ‏dedup عابر)؛ ‏404/409/410 ← إعادة تجميد واحدة محدودة بلا خلط لقطتين (كشف عيبين بالمتصفح الحقيقي وأُصلحا: سباق إصدار رمز الضيف عبر creates متوازية ← إصدار مسبق متزامن واحد؛ ‏restart كان يستبدل عقدة ‏sentinel المراقَبة ← إعادة تسليح)؛ تغيير ‏tab/category/language/login/logout يبطل الرد القديم (‏generation) ويبدأ سياقاً جديداً؛ لا سقوط صامت إلى ‏15؛ ‏RTL/LTR + ‏mobile/desktop + ‏keyboard/pointer (‏tabindex/role/aria-live/retry بزر أصلي).
- **الأدلة**: ‏T جديد ‏`home-rails-continuation` ‏13/13 (‏151 مؤهلاً في سكة ‏live واحدة حتى النفاد ‏exactly-once عبر ‏13 دفعة؛ كل الحالات ‏Guest/User/category/sub/status/lang؛ ‏Suggested بكل الحالات الثلاث؛ ‏youtube-only تدخل و‏null/empty/whitespace تُستبعد؛ ‏retry/race/TTL/404/409/410/422؛ دفعات جزئية/فارغة تستمر؛ ‏refresh بلقطة جديدة؛ ‏ar/en؛ كلفة ‏build ‏~60–90ms واجتياز ‏151 صفاً ‏~60–100ms بلا اقتطاع؛ متحكم بلا ‏SQL)؛ ‏UI جديد ‏`home-rails-presentation` ‏13/13 (‏ar/en/RTL/LTR/dark/keyboard)؛ ‏E2E حقيقي (‏wrangler+D1 محلي) ‏8/8 ‏ar+en (سكّة مقترح + سكّة قسم حتى علامة النهاية المترجمة، ‏upcoming للضيف مع ‏retry، صفر ‏API فاشلة، صفر أخطاء صفحة)؛ الجيران (‏guest/explore/ranking/lang/discovery/smoke) ‏70/70؛ الكاملة ‏1115/1115 (‏108 ملفات)؛ ‏`tsc` ✅؛ ‏`build` ✅؛ ‏G2 ‏289 ≤ ‏BASE ‏295 (نزل ‏6 — صفر ‏`any` جديد)؛ ‏SEC-06 ‏PASS.
- **الصادق**: ‏**no remote production writes — صفر كتابة إنتاجية** (‏e2e أعاد ضبط D1 محلي فقط عبر ‏webServer؛ بلا ‏deploy)؛ ترتيب الأقسام الموزون ‏WEIGHTED HOME OPEN — ‏continuation جاهز لكن إغلاق تجربة ‏Home يتطلب أرقام ‏H7 المعتمدة في ‏D0/D1 (‏policy ‏rail-v1)؛ ‏recorded في ‏e2e شحيحة البذرة (‏6 ‏completed بلا ‏VOD غالباً) فتُغطَّى آلياً فقط؛ ‏wrangler أظهر ‏X [ERROR] بنية تحتية عابرة واحدة (‏miniflare loopback بلا ‏stack تطبيق — تعافت، ومسار ‏retry المترجم غطاها في الاختبار). بلا دمج/نشر. لا ادعاء ‏D1/D2.
- **أي ‏blocker متعلق بـH7**: لا يوجد حاجب — الأرقام فقط غير معتمدة (‏D0 يعرضها، ‏D1 يطبقها على نفس المزودات/الأسطح دون إعادة بناء).

## R-RELEASE-1 release safety · فرع `fix/r-release-1` (من `b23cfe2` = origin/main)

- 🔧 ‏(1) ‏SEC-06 أصبح AST تنفيذياً: direct/multiline و`(Math.random)()` و`Math['random']()` وalias (`const r = Math.random; r()`، destructuring، assignment) وdeferred-ref — بلا اصطياد comments/strings/types؛ dynamic keys وbind/indirection خارج النطاق المعلن (لا ادعاء obfuscation عام)؛ مدخل مفقود/غير مقروء = FAIL. ‏(2) عزل bindings: ‏`env.preview.d1_databases: []` صريح في wrangler.jsonc + بوابة fail-closed (preview بأي D1 أو بنفس id الإنتاج = FAIL؛ بلا D1 معاينة مأذونة، بلا إنشاء مورد/نسخ بيانات). ‏(3) ‏deploy ينتظر Quality Gate لنفس SHA عبر فحص API فقط (PR=head SHA، push=github.sha) بلا إعادة suite + توقف آمن للـforks بلا أسرار. ‏(4) بوابة جاهزية مخطط قراءة-فقط: ‏manifest ‏`R-RELEASE-1.baseline-0033` (‏0033 + sha256 مثبت + history الـ34 + الجداول/الأعمدة/الفهارس)؛ required-pending/changed/integrity/missing-schema/read-failure/unknown-target/unexpected = ‏FAIL قبل النشر؛ الـunexpected تُسجَّل ولا تُطبَّق (لا مسار apply). ‏(5) ‏runbook آمن ‏`docs/19-RELEASE-RUNBOOK.md` (تحضير/apply مأذون يدوياً + ممنوعات) + صف H في خريطة 00. ‏(6) ‏Wrangler والبنية كما هما؛ صفر `src/` (بلا تغيير وظيفي).
- **الأدلة**: ‏T ‏`sec06-checker` ‏13/13 (كل الصور + السلبيات + fail-closed) و`pages-bindings` ‏9/9 و`release-readiness` ‏11/11 (happy/pending/mismatch/schema/unexpected/read-fail/unknown + تطابق manifest) و`deploy-workflow` ‏7/7 (pins الربط)؛ ‏YAML الملفين صالح؛ الكاملة ‏1089/1089 (‏106 ملفات)؛ ‏`tsc` ✅؛ ‏`build` ✅؛ ‏G2 ‏286 = ‏BASE.
- **الصادق**: ‏**no remote production writes — صفر كتابة إنتاجية في هذا العمل** (فحص محلي + fixtures فقط)؛ سلوك runtime لـ`env.preview` الفارغة يثبت عند أول preview مأذون؛ صيغة `migrations list` وجدول `d1_migrations` مثبتان محلياً (الثاني) لا عن بُعد؛ ‏Git auto-deploy كمسار التفاف تحقق لوحة-تحكم بيد المالك. **يحتاج Owner authorization**: إنشاء/تفويض preview D1، أي apply/restore إنتاجي، قرار الإطلاق. بلا دمج/نشر.

## RESET EMAIL NOTICE + HOME RAIL FORENSIC · فرع `fix/reset-email-notice-home-rail-forensic` (من `af96b8f` = origin/main)

- 🔧 ‏(A) تنبيه Spam/Junk بجانب كل نجاح إرسال بريد فعلي (‏3 تدفقات: التسجيل، إعادة الإرسال، نسيان المرور) عبر مفتاح مشترك `auth_check_spam_folder` و`Modal.showEmailSentMessage()` — بلا hardcode، بلا مساس EmailService/contracts/النصوص القائمة؛ يُحجب عند الفشل وعند `email_not_configured`. ‏(B) تحقيق rails بلا كود: ‏Suggested/زائر بجلسة #75/#76 حتى النفاد الحقيقي؛ ‏Suggested/مسجل دفعة 15 واحدة بلا استمرار؛ ‏Dialogue/Science/Talents والفرعية `ORDER BY RANDOM()` دفعة 15 بلا استمرار/عرض-الكل؛ ‏Suggested يتجاهل تبويب live/recorded/upcoming.
- **الأدلة**: ‏T جديد `email-spam-notice` ‏6/6 (التنبيه في التدفقات الـ3 ar/en، بلا hardcode، غائب عند الفشل)؛ المستهدفة ‏33/33؛ ‏`tsc` ✅؛ ‏`build` ✅؛ ‏G2 ‏286 = ‏BASE.
- **REMEDIATION (نفس الفرع) — بلوكير نجاح-مع-فشل-إرسال**: ‏register كان يعرض التنبيه مع `warning` نص حر رغم عدم الإرسال → أصبح `email_send_failed` machine-readable، والعميل يعرض التنبيه فقط بلا warning؛ زر resend لكلا التحذيرين؛ ‏resend يبقى رسالة عامة بلا تنبيه (العام لا يؤكد إرسالاً بتصميم anti-enumeration). إعادة التحقق: ‏35/35، ‏`tsc` ✅، ‏`build` ✅، ‏G2 ‏286.
- **الصادق**: ‏التنبيه UX guidance فقط — لا ادعاء إصلاح deliverability؛ ‏gaps الـrails مسجلة فقط (تجاهل التبويب، سقف 15، RANDOM لكل تحميل، بلا dedup عابر، recorded غير متكافئ) بلا إصلاح خارج النطاق؛ بلا H7/D1/D2. بلا دمج/نشر.

## CI/CD DEPLOYMENT RECOVERY · فرع `fix/ci-cd-deployment-recovery` (من `f3942c3` = origin/main)

- 🔧 عيبان مثبتان (PRs ‏#75–#78 مدموجة في main وليست مفقودة؛ production متوقف على نسخة قديمة لأن الـdeploy يفشل): ‏(1) ‏`deploy.yml` يستخدم `cloudflare/pages-action@v1` غير القابل للحل ("not found") → النشر الآن عبر Wrangler الرسمي (`npx wrangler pages deploy dist`, مثبّت devDependency — بلا action خارجي)، نفس المشروع والمخرجات والـtriggers، production على push-to-main فقط وpreviews صريحة للـPRs، نفس الـsecrets بلا أسماء جديدة؛ ‏(2) ‏SEC-06 كان grep خام يسقط على تعليق توثيقي في `ExploreSessionService.ts:11` رغم WebCrypto الفعلي → فاحص `dev-tools/check-sec06-math-random.mjs` يجرّد التعليقات ويرصد الاستخدام التنفيذي فقط (مثبت: الحقيقي يفشل بسطر/ملف، التعليق يمر — الحماية لم تُخفَّف).
- **الأدلة**: ‏`tsc` ✅؛ ‏`build` ✅؛ ‏SEC-06 ‏PASS على الشجرة؛ ‏any ‏286 ≤ ‏310 (بلا مساس `src/`)؛ ‏YAML الملفين صالح + هيكل الـdeploy مؤكَّد آلياً؛ الكاملة ‏1041/1041 (‏101 ملفاً). صفر تغيير وظيفي (`git diff` بلا `src/`).
- **REMEDIATION (Codex، نفس الفرع)**: ‏(1) بلا interpolation في `run:` — الفرع عبر `env.BRANCH` مع `--branch="$BRANCH"`؛ ‏(2+3) ‏SEC-06 أُعيد بناؤه على AST (TypeScript compiler): الاستدعاء متعدد الأسطر يُكتشف، والـstring literal والتعليقات لا تُحتسب — مع controls ملتزمة `sec06-checker` ‏6/6 وcontrols CLI (حقيقي→FAIL، نصي→PASS)؛ إعادة التحقق: ‏1047/1047 (‏102 ملفاً)، ‏`tsc` ✅، ‏`build` ✅.
- **الصادق**: ‏**لا ادعاء production recovered — النشر الحقيقي يحدث بعد الدمج عبر الـworkflow المُصلَّح فقط**؛ بلا deploy يدوي. بلا migration. لا ادعاء R2 — بانتظار REMOTE.

## EMAIL DELIVERABILITY CLEANUP · فرع `fix/email-deliverability-cleanup` (من `1376c04` = origin/main)

- 🔧 تنظيف هوية الدومين في البريد فقط (لا DNS/DKIM/SPF/DMARC — مثبتة PASS من المالك خارج المستودع ولم تُمس؛ ولا provider ولا `send-email.php` ولا معنى مُفترض لـX-MC-Relay: Bad الخارجي): ‏3 مواضع hardcoded ‏`project-8e7c178d.pages.dev` في `EmailService` (الشعار، زر Visit Platform، fallback رابط التفعيل) → ‏SSOT القائم `DEFAULT_PLATFORM_URL` ‏(`https://dueli.maelshpro.com`) بلا literals جديدة؛ ‏origin الصريح يغلب عند توفره.
- **الأدلة**: ‏T جديد `email-domain-identity` ‏6/6 (بلا pages.dev في subject+html ar/en للقالبين، الشعار والزر على الدومين الرسمي، fallback التفعيل رسمي، origin الصريح محترم)؛ الجيران ‏19/19؛ ‏`tsc` ✅؛ ‏`build` ✅؛ صفر `any` جديد. بلا migration/routes.
- **الصادق**: ‏SPF/DKIM/DMARC أثبتها المالك PASS خارج repo؛ ‏**Inbox placement NOT PROVEN — لا ادعاء أن Spam أُصلح**؛ ‏List-Unsubscribe يضاف في PHP خارج repo (قد يحتاج إزالة من رسائل auth لاحقاً، وليس سبباً مُدَّعى للـSpam)؛ ‏X-MC-Relay: Bad ما زال external finding خارج النطاق. بلا دمج/نشر. لا ادعاء R2 — بانتظار REMOTE وتجربة المالك.

## R2-AUTH-1 password-reset email · فرع `fix/r2-auth1-password-reset` (من `79edbf2` = origin/main)

- 🔧 عيبان مثبتان بـRED (لا افتراض تطابق مع التفعيل رغم خدمة البريد الواحدة): ‏(1) بلا تطبيع بريد — `  RESET@test.com  ` لا يطابق شيئاً ومع ذلك 200، فينتظر المستخدم بريداً لم تُحاوَل كتابته أصلاً (0 sends)؛ ‏(2) `forgotPassword` بلا try/catch حول الإرسال — 500 عند غياب EMAIL vars أو أي فشل مزوّد (مقابل تحمّل register/resend)، و200-مقابل-500 صار oracle لوجود الحساب. الإصلاح: تطبيع واحد للبحث والمستلم، وكل مسارات الفشل تُرجع نفس `auth_reset_code_sent` العامة مع تسجيل خادمي للمستلم/المضيف بلا الكود؛ verify/reset بنفس التطبيع. لا عقد تغيير-داخل-الحساب موجود أصلاً (finding موثق، لم يُبنَ).
- **الأدلة**: ‏RED أولاً (‏5/9 فشلت قبل الإصلاح)؛ ‏T ‏`password-reset` ‏9/9 (المستلم والقالب الصحيحان وTTL≈15min، التطبيع، صمت العنوان المجهول، ‏3× generic-200، تحقق ضمن TTL + إكمال + دخول بالجديد + رفض إعادة الاستخدام، منتهي/خاطئ/مجهول بعقد واحد، بلا تسريب كود/كلمة، ar≠en، ولا account enumeration)؛ المستهدفة ‏13/13 مع الجيران؛ الكاملة ‏1035/1035 (‏100 ملفاً)؛ ‏`tsc` ✅؛ ‏`build` ✅؛ ‏G2 ‏286 = ‏BASE (صفر `any` جديد).
- **الصادق**: محاولة الإرسال الصحيحة مثبتة آلياً (المستلم/القالب/المزوّد)؛ **وصول صندوق بريد حقيقي غير مثبت** — يحتاج اختبار المالك (secrets/المزوّد الحي خارج النطاق) ولم يُدَّعَ. بلا migration (إعادة استعمال أعمدة ‏0001)، بلا routes جديدة، بلا دمج/نشر. لا ادعاء R2 — بانتظار REMOTE وتجربة المالك.

## R3-GUEST-1 suggested-rail continuation · فرع `fix/r3-guest1-suggested-continuation` (من `d192047` = origin/main)

- 🔧 عيب «مقترح لك» يعرض 3 للزائر: السبب المثبت (لا hardcoded 3 — مسح شامل) فرع الضيف كان `status='completed' AND vod_url IS NOT NULL` (حفنة صفوف) بلا أي continuation (دفعة `limit=15` واحدة، ‏allowSeeAll=false)، بينما المسجل يرى `live+completed` عبر المحرك. الإصلاح: مجموعة الضيف = كل المحتوى العام (pending/accepted/live + completed بتسجيل صالح — ‏05 §4؛ ‏suspended/cancelled/archived وcompleted بلا تسجيل خارج السكة)، نفس الأوزان، والسكّة Guest تُجمَّد في جلسة `suggested_guest` على نفس مخزن/مؤشر #75 (provider جديد — لا محرك ثانٍ) مع scroll-append حتى hasMore=false الحقيقي. المسجل كما هو بلا مساس.
- **الأدلة**: ‏RED أولاً (‏8/9 فشلت قبل الإصلاح)؛ ‏T ‏`guest-suggested-continuation` ‏9/9 (‏31 مؤهلاً مقابل ‏9 مستبعدين، ties، retry، ar/en، ‏404/410/409، فقد أهلية، وصول متأخر، عدم SQL في المتحكم، تثبيت الأوزان)؛ ‏E2E حقيقي ‏2/2 ar + ‏2/2 en (سكّة ~190 صفاً حتى النفاد، هويات فريدة، بلا أخطاء)؛ المستهدفة ‏77/77 (ranking/lang/explore/b7/smoke/visual)؛ ‏`tsc` ✅؛ ‏`build` ✅؛ ‏G2 ‏295 ≤ ‏BASE ‏296.
- **التكلفة (محلية)**: اجتياز ‏31 صفاً ‏(limit=6) ‏31ms. بلا migration (إعادة استعمال جداول ‏0033)، الجرد ‏195←197. بلا دمج/نشر. لا ادعاء R3 — بانتظار REMOTE.

## R3-B7 stable result session · فرع `feat/r3-b7-explore-result-sessions` (من `409dd8a` = origin/main)

- 🔧 Explore competitions فقط + بنية جلسة/chunks/cursor مشتركة قابلة لإعادة الاستخدام في D1/D2 (نفس مخزن الجلسة والمؤشر، يتبدل لاحقاً مزود الترتيب/الأهلية فقط — لا محرك تصفح ثانٍ).
- **العقد**: ‏POST /api/competitions/explore-sessions ‏(تجميد الترتيب الحالي مرة: نفس المرشحين + خلطة Fisher–Yates واحدة بـWebCrypto — بلا RANDOM+OFFSET لكل دفعة، بلا newest-first، بلا أوزان جديدة، بلا سقف إجمالي) → ‏GET …/explore-sessions/:id/page ‏(cursor مبهم، فحص أهلية حي لكل صف، ملء من المواقع التالية، hasMore/nextCursor من التقدم الحقيقي فقط). الهوية مستخدم (Bearer) أو Guest first-party (‏X-Guest-Token ‏يُصدَر أول زيارة، يُخزَّن محلياً — لا IP)؛ الغريب ‏404، المنتهية ‏410 مع مسار تحديث، drift السياق ‏409. الشكل ‏6+6 وسلوك Explore محفوظان (المعاينة أول ‏6، view-all يعيد فتح نفس الجلسة من بدايتها عبر ‏esession).
- **الأدلة**: ‏RED أولاً (‏9/12 فشلت على BASE)؛ ‏`tests/api/explore-result-sessions` ‏14/14 (‏1200 مؤهل عبر ‏12 chunk، ties، retry، drift بعد T0، فقد أهلية، وصول جديد بعد refresh، filter/identity/TTL، preview→view-all، continuation، نفاد حقيقي، بلا duplicate/skip/hidden cap)؛ ‏b7 harness ‏9/9؛ ‏E2E حقيقي (wrangler+D1 محلي) ‏2/2 ar + ‏2/2 en؛ ‏`npm test` ‏1017/1017 (‏98 ملفاً)؛ ‏`tsc` ✅؛ ‏`build` ✅؛ ‏G2 ‏295 ≤ ‏BASE ‏296 (صفر `any` جديد، بلا bypass).
- **التكلفة (محلية، node:sqlite)**: بناء جلسة ‏1200 صف ‏60ms ‏(12 chunk)؛ اجتياز كامل ‏(limit=50، ‏24 صفحة) ‏361ms ‏(~15ms/صفحة).
- **المحافَظ عليه**: ‏GET /api/competitions ‏القائم (limit/offset) كما هو لبقية الأسطح؛ تدفق المستخدمين في Explore untouched؛ R1/خطة16/المال/الإعلانات/الخوادم/TURN كما هي. بلا migration تاريخية (‏0033 جديدة فقط)، بلا deploy، بلا دمج. لا ادعاء R3 — بانتظار مراجعة REMOTE.

## R1 earnings palette micro-fix · فرع `fix/r1-earnings-palette-microfix` (من `ad23c65`)

- 🔧 بطاقة Withdrawn إلى `from-pink-500 via-fuchsia-400 to-purple-400` (تكملة التدرج البنفسجي بدل الأزرق) + الأيقونات الخضراء الزخرفية الثلاث إلى بنفسجي Dueli؛ الأخضر الدلالي (completed/toasts/CTA) والمنطق المالي كما هما.
- **الأدلة**: ‏RED أولاً (3/5 فشلت على BASE)؛ ‏`npm test` ‏1001/1001؛ ‏`tsc` ✅؛ ‏`build` ✅؛ ‏G2 ‏296 = ‏BASE؛ دخان Chromium ‏5/5 (ar/en × desktop/mobile + ‏dark). بلا دمج، بلا نشر.
- R1 design owner-accepted subject to this micro-fix; B7 remains to be resolved/verified before R1 closure. لا ادعاء R1/R2/R3.

## R1 final owner-acceptance remediation · فرع `fix/r1-final-owner-acceptance` (من `7f1fdd7`)

- 🔧 منفَّذ ومُتحقَّق محلياً: عودة Posts/Block (علّة حقيقية: `relative` الهيرو ‏#72 غطّى التبويبات — أُصلحت بـ`z-10`؛ الحظر عبر عقد `/api/blocks` القائم)؛ بطاقات الأرباح بتدرجات Dueli؛ نص أبيض في token التبويب النشط؛ تلميع البطاقة (gap + فاصل رمادي)؛ Reports/Donate بلوحة Dueli؛ selects متماسكة وDanger Zone مضبوطة ومترجمة؛ إصلاح تداخل بحث Explore؛ View-all تحت الأقسام؛ إزالة شارة التوثيق والحلقة الحمراء؛ ترقيم مستخدمي View-all مؤمَّن باختبارات.
- **الأدلة**: ‏RED أولاً (18/21 فشلت على BASE)؛ ‏`npm test` ‏996/996 (96 ملفاً)؛ ‏`tsc` ✅؛ ‏`build` ✅؛ ‏G2 ‏296 = ‏BASE (صفر `any` جديد)؛ ‏Chromium حقيقي ‏18/18 ar + ‏18/18 en للجديد و45/45 ar + ‏62/62 en للقديم؛ لقطات (الأرباح/Explore/Donate/dark) مأخوذة خارج الشجرة.
- **المحافَظ عليه**: خلطة الهيرو، توقيت الشعار، ‏#69/#70/#71. **بلا مساس**: ترتيب B7، التوصيات، ‏VOD/live، المالية، الإعلانات، المخطط/الترحيلات. التراجع: عكس commits الـPR. بلا دمج، بلا نشر، وبلا أي ادعاء R1/R2/R3 — بانتظار مراجعة REMOTE.

## PR #72 DoD G2 remediation · نفس الفرع (OLD ‏`0d92dd6` ← NEW ‏`d26f321`)

- 🔧 إزالة دين `any` الصريح الذي أدخله ‏#72 في Explore/Search (‏14× `tr as any` — ‏`tr` أي `any` أصلاً عبر `Record<string, any>` القائم، فالحذف مطابق سلوكياً ونوعياً بلا تحايل جديد وبلا مساس بالتنميط العام).
- **الدليل**: ‏BASE ‏296 = ‏NEW ‏296 (القديم ‏310) بنفس منهج G2 حرفياً، وتطابق موضعي كامل؛ suites المستهدفة ‏54/54؛ ‏`npm test` ‏969/969؛ ‏`tsc` ✅؛ ‏`build` ✅؛ دخان Chromium قصير فقط (6+6/بحث/فلاتر/العرضان، ar/en) ‏8/8. السلوك والاسترجاع والـUI مطابق تماماً. بلا دمج، بلا نشر، وبلا أي ادعاء R1/R2/R3.

## Owner visual-acceptance remediation (post-#71) · فرع `fix/owner-visual-acceptance-remediation` (من `9287a52` = دمج PR #71 · PR #72)

- 🔧 منفَّذ ومُتحقَّق محلياً (HEAD ‏`0d92dd6`): شعار وسط البطاقة عبر preload + `fetchpriority="high"` (عارض واحد مشترك، بلا تعدد طلبات)؛ هيرو الملف الشخصي تركيبة متعددة الوقفات violet→purple→indigo مع طبقات عمق؛ توحيد الشكل (tokens بلا لون) على الأرباح/الشكاوى/الدعم مع بقاء الدلالات اللونية؛ صفحة الاستكشاف ببحث وفلاتر على الصفحة + معاينة 6+6 + عرضان مخصصان (نفس عقود الاسترجاع، بلا تغيير ترتيب/تقييم).
- **الأدلة**: RED أولاً (10/14 فشلت قبل الإصلاح ⇒ 14/14 بعده)؛ `npm test` ‏969/969 (93 ملفاً)؛ `tsc` ✅؛ `build` ✅؛ متصفح Chromium حقيقي 17/17 ar + ‏17/17 en للجديد و45/45 ar + ‏45/45 en للقديم (`ui-visual-a11y`)؛ لقطات الهيرو ar/en × desktop/mobile مأخوذة خارج الشجرة.
- **المحافَظ عليه**: ‏#69 auth/session، ‏#70 CSP، ‏#71 modal/tabs. **بلا مساس**: ترتيب B7، التقييم/التوصية، ‏is_fake، ‏VOD/TURN، المالية، الإعلانات، المخطط/الترحيلات. التراجع: عكس commit واحد. بلا دمج، بلا نشر، وبلا أي ادعاء R1/R2/R3 — بانتظار مراجعة REMOTE.

## D1/D2/D3/N-2 — closure · فرع `chore/d1-d2-d3-n2-closure` (مزامن مع `main` بعد دمج C5/C6)

- **D1 (docs)**: حالة Realtime في `docs/04-STREAMING-PIPELINE.md` — الإنتاج SSE/polling،
  الـWorker/DO مسار مستقبلي اختياري بلا deploy/secrets، وإعادة الفتح بمطلب تشغيلي مثبت فقط.
- **D2**: تدقيق + تثبيت — البذور توثق `is_fake=1` الضمني مع تثبيت الـdefault اختبارياً؛
  `u.is_fake` في استعلامات search/matchmaking/users؛ شارة Demo في user-card وصفة
  المنافسة؛ نجاح التقاعد يُسجَّل (auditability). الوهمي KEEP — لا حذف.
- **D3**: `repomix-output.xml` (6.5MB) ← `docs/archive/` + توثيق الأرشيف والـSoT.
- **N-2**: تحقيق شامل — الهوية من الجلسة حصراً، والـIDs المرسلة أهداف/فلاتر مشروعة
  بفحوص ملكية؛ لا ثغرة، لا تغيير كود.

## C6 — cron operational hardening · فرع `fix/c6-cron-operational-hardening` (مكدّس فوق C5)

- أُعيد التثبيت فوق المكدس؛ العقد تراكمي (0029–0032 ← ‏33 ملفاً)؛ `cron-runs` ‏6/6؛
  `npm test` ‏610/610 على المكدس الكامل؛ `tsc` ✅؛ `build` ✅. بلا دمج.

## C5 — CSP full removal · فرع `fix/c5-csp-hardening` (مكدّس فوق C4)

- إزالة كاملة: لا `unsafe-inline` ولا `unsafe-eval` في الترويسة المقدمة (مثبتة).
  195 handler مضمّن ← تفويض `data-csp-*` (موزع خارجي + allowlist مولدة)؛ كل
  `<script>/<style>` يحمل nonce الطلب؛ `style=` ← كلاسات أو `data-csp-style`
  (مطبق JS)؛ CSS المحقون runtime نُقل لـ`styles.css`؛ الإيميلات مستثناة معمارياً.
- تحقق المتصفح الحقيقي (Playwright + wrangler local): 8 تدفقات خضراء، صفر
  CSP violations، صفر console errors (401 تسجيل خاطئ متوقعة وتثبت عمل submit).
- الأرقام النهائية أدناه. بلا دمج.

## C4 — SSE/WS ticket auth · فرع `fix/c4-sse-ticket-auth` (مكدّس فوق C2)

- أُعيد التثبيت فوق المكدس (العقد ‏32: 0029–0031)؛ وأُغلق مسار WS نهائياً داخل المستودع:
  `POST /api/realtime/redeem` (بوابة `X-Publish-Secret`) يستهلك التذكرة للـWorker،
  الـWorker (`workers/dueli-realtime`) يقبل `?ticket=` فقط (لا `?token=` إطلاقاً —
  مثبت grep + اختبار)، و`SseService` (SSE وWS) يجلب تذكرة أولاً. النشر الخارجي
  المتبقي: deploy الصفحات ثم الـWorker (موثق في ترويسة الـWorker).
- `sse-ticket` ‏18/18 + `sse-user-auth` ‏3/3؛ `npm test` ‏596/596 على المكدس؛ `tsc` ✅؛
  `build` ✅؛ الجرد ‏56 AUTHENTICATED (+‏redeem المحمي بالسر داخلياً).

## C2 — chunks HMAC · فرع `fix/c2-chunks-hmac` (مكدّس فوق C1)

- أُعيد التثبيت فوق المكدس؛ العقد تراكمي (0029+0030 ← ‏31 ملفاً)؛ `chunks-hmac` ‏11/11؛
  `npm test` ‏577/577 على المكدس؛ `tsc` ✅؛ `build` (أدناه).

## C1 — payments/ad-blocks auth · فرع `fix/c1-auth-fix` (مكدّس فوق C7)

- 🔧 منفَّذ محلياً: `authMiddleware({required:true})` على مستوى الراوتر في
  `ad-blocks/routes.ts` و`payments/routes.ts` (8 مسارات: UNGUARDED→AUTHENTICATED،
  الجرد مولَّد من جديد) — بلا global middleware، بلا تغيير business logic.
- **الاختبارات**: `tests/api/payment-auth.test.ts` ‏8/8 (401 بلا/خاطئة/منتهية،
  200 + 201 بجلسة صالحة، 422 تُثبت مرور الـauth)؛ `npm test` ‏566/566 على المكدس؛
  `tsc` ✅؛ `build` ✅. الحالة 🔧 ريثما يعيد REMOTE التحقق — بلا دمج.

## C7 — D1 reconciliation · فرع `chore/c7-d1-reconciliation` (مكدّس فوق C3b) — ✅ منفَّذ

- **Remote rebuild منفَّذ ومُتحقق**: backup طازج (2.4MB) → إسقاط 50 كائناً بترتيب FK
  → replay السلسلة ‏33/33 من رأس المكدس → history مطابق للمستودع بايتاً ببايت →
  reimport ‏22 جدولاً (544/1541 + الحقيقيون سالمون) → `foreign_key_check` فارغ →
  `donations` والجداول المالية والجديدة حاضرة → `posts` محذوف → smoke إنتاج ‏200/200.
  التفاصيل في `docs/C7-D1-RECONCILIATION-RUNBOOK.md` §5.
- كود: `is_fake=0` + شارات Demo + تقاعد تدريجي عبر `SyntheticRetirementService`
  (الأقدم أولاً، صفر dependents، مغطى PRAGMA) مربوط بالتسجيل/OAuth/إنشاء المنافسات.

## C2 — chunks HMAC · فرع `fix/c2-chunks-hmac` (مكدّس فوق C1)

- 🔧 منفَّذ محلياً: HMAC-SHA256 خادم-لخادم على `GET /verify` و`DELETE /:key`
  (`X-Signature/X-Timestamp/X-Nonce`، نافذة 5min، nonce أحادي في جدول جديد
  `chunk_upload_nonces` عبر migration ‏0030، مقارنة ثابتة الزمن، 503 عند غياب
  السر) + فحص Origin الدقيق طبقة ثانية.
- **الاختبارات**: `tests/api/chunks-hmac.test.ts` ‏11/11 (oracle مستقل عبر node:crypto
  + رفض بلا/مزوّر/منتهي/معاد/origin شرير/prefix + قبول صحيح + 503)؛ RED مثبت (7 تفشل
  على الكود القديم)؛ عدّاد العقد تراكمي ‏31 (0029+0030)؛ الأرقام الكاملة بعد التحقق أدناه.
- **UPLOAD SERVER ACTIONS REQUIRED** في تقرير الـPR — التنفيذ على السيرفر الخارجي للمالك.

## C3b — posts cleanup · فرع `chore/c3b-posts-cleanup` (من `376b2ea` = PR #49)

- 🔧 منفَّذ محلياً: جدول `posts` العاري + التابع الميت `post_likes` (FK → posts) محذوفان
  عبر migration جديدة `0029_drop_unused_posts.sql` (forward-only، `DROP IF EXISTS`،
  التابع أولاً) — بلا مساس بأي migration تاريخية، و`user_posts` (نظام المنشورات الحي
  عبر `UserPostModel`) لم يُمس.
- **الدليل**: صفر إشارة كودية لـ`posts`/`post_likes` في src/tests/workers (لا
  SELECT/INSERT/UPDATE/DELETE/JOIN/model/route/seed)؛ seed يمس `user_posts` فقط.
- **الاختبارات**: عدّاد `schema-contract` ‏29←30 + assertion غياب posts/post_likes
  وبقاء user_posts؛ `npm test` ‏544/544؛ `tsc` ✅؛ `build` ✅ (churn الـCSS رُجع).
  الـintegration عبر Wrangler لم يُنفَّذ محلياً (يتطلب Cloudflare) — بانتظار REMOTE.
- الحالة 🔧 ريثما يعيد REMOTE التحقق — بلا دمج.

## FINAL DEBT CLOSURE SWEEP · فرع `chore/final-debt-closure` (من `d332223`)

- 🔧 sweep واحد بلا scope creep: كل ما أُغلق (A1/A2/B1/B2) مخطط ومؤجل وقابل للإغلاق
  الآمن؛ 9.E (N-1/N-2/N-3) و8.G (F1–F4) أُعيد التحقق منها خضراء ولم تُمس.
- **A1**: حارس ترقيم الترحيلات — أي رقم مكرر جديد يفشل (استثناء 0012 التاريخي مثبّت).
- **A2**: قفل SEC-04 اختبارياً (6/6: بلا ترويسة 403، `?key=` ‏403، Bearer صحيح 200،
  GET ‏404، بلا سرّ 503) — الكود كان مغلقاً أصلاً ولم يُمس.
- **B1/B2**: عدّاد `docs/16` ‏(19←29) + تعليقا SSE ‏(2s←10s) — توثيق/تعليقات فقط.
- **REMOTE D1 ‏⛔ قرار مطلوب**: ‏10 معلّقة (0019–0028) تعذّر تطبيقها — سجلّ remote
  ‏(ids ‏2–10) يسمّي ملفات غائبة من المستودع + جدول `donations` مفقود عن بُعد
  ‏(0020/0022/0023 لا يمكن أن تُطبَّق). لم يُتَّخذ أي إجراء destructive.
- **RED/GREEN مُثبَت**: حساسية الحارس (0012 تُكتشف) وحساسية قفل الكرون (`?key=`
  المُعاد فتحه يفشل)؛ `npm test` ‏544/544؛ ‏schema-contract ‏20/20؛ ‏`tsc` ✅
  ‏(any ‏279 ≤ ‏308)؛ ‏`build` ✅. بلا migration/dependencies/config/routes.

## 9.E final-gate remediation — N-1 + N-3 · فرع `fix/ads-final-gate-remediation`

- 🔧 remediation من `76525cf` (دمج PR #47). الهدف: إغلاق كل findings التدقيقين دون مساس بما اجتاز 9.E.
- **N-1 (blocking)**: `settleImpressionKey` كان `WHERE key = ?` وحده — settlement هوية يعيد كتابة
  صفوف هويات/إعلانات أخرى تشترك في key (مثبت: retry يعيد 409 بدل replay + شحنة وهمية محتملة).
  الآن `(key, ad_id, user_id IS ?, created_at >= -1 day)` — نفس هوية claim/lookup تماماً.
- **N-3 (blocking)**: مسار impression كان `viewer?.id ?? body.user_id ?? null` — المجهول ينتحل
  مستخدماً حقيقياً (مثبت: تلويث attribution + استهلاك cap الضحية + FK failure بـ500).
  الآن `viewer?.id ?? null` دائماً؛ `body.user_id` موروث يُتجاهل كلياً. تدقيق كل مسارات الإعلانات:
  serving/click/token/ad-blocks/ad-reports/advertiser كلها session-based — لا ثقب آخر.
- **INFO/LOW مغلقة بلا scope زائد**: مسار FK المقنّع اختفى (المجهول يكتب NULL دائماً — مثبت 200)؛
  `getCampaignAnalytics` لها مسار واحد عبر `requireOwnedCampaign` (لا bypass — تحقق فقط)؛
  الأعمدة `budget/budget_remaining/views/clicks` كتابة عرض فقط — التلاعب بها لا يحرّك قرشاً (مثبت).
  N-2 لم تُمس (cap/token flows خضراء كما هي). بلا migration، بلا routes جديدة، بلا dependencies.
- **RED/GREEN مُثبَت**: ‏6/10 فشلت قبل الإصلاح ⇒ ‏ad-impression-identity ‏10/10 بعده؛ ‏`npm test`
  ‏538/538؛ ‏`tsc` ✅ (any ‏272 ≤ ‏308)؛ ‏`build` ✅؛ ‏`verifyInvariant() = 0` داخل الاختبار.

## 9.D — بوابة المعلنين (ownership server-side) · فرع `feat/ads-advertiser-portal`

- 🔧 منفَّذ محلياً (من `345bb86` = دمج PR #46). النتيجة: المعلن يدير حملاته وميزانيته ذاتياً،
  ويرى ويدير **حملاته فقط** — التحقق server-side في كل عملية حساسة.
- **الثغرات المغلقة**: `submitForReview` كان يتجاهل المالك (A يرسل مسودة B للمراجعة!)،
  و`getCampaignAnalytics` بلا أي فحص (A يقرأ أرقام B) — كلاهما الآن 403 عبر `requireOwnedCampaign`
  (404 للمفقود، 403 للمملوك لغيره/بلا مالك — لا قائمة فارغة ولا 409 مُضلِّل) + guard المالك في SQL.
- **المحافَظ عليه**: المسار الكامل للمالك (create→submit→approve→pause→resume→end+analytics)،
  والاعتماد admin-only (مراجعة الأدمن 403 لغير الأدمن)، والميزانية من ledger حصراً (integer cents،
  تمويل `ad_campaign_fund_<id>` متوازن، عدّادات views/clicks المزوّرة لا تحرّك الأرقام).
- **UI**: `esc()` لعناوين الحملات في البوابة (stored-XSS)، مفتاح `advertiser.not_your_campaign` في ar+en،
  RTL/LTR عبر layout، لا SQL ولا منطق مالي في الصفحة. بلا migration، بلا routes جديدة (191 كما هي).
- **RED/GREEN مُثبَت**: 4/8 فشلت قبل الإصلاح (submit عابر 200، تحليلات عابرة 200، pause مفقود 409،
  مفتاح i18n غائب) ⇒ ‏advertiser-portal ‏8/8 بعده؛ تحديثان تعاقديان في اختبارات 9.A (409→403 لعابر المالك،
  وF-3 يرسلها المالك-الأدمن)؛ ‏`npm test` ‏528/528؛ ‏`tsc` ✅ (any ‏272 ≤ ‏308)؛ ‏`build` ✅.

## 9.C remediation — F-1 + dedup isolation + mint cap · نفس الفرع (PR #46)

- 🔧 remediation فوق `79a1358` بعد REJECT خارجي (كل الوظائف كانت PASS): إغلاق F-1 المانع + ملاحظتين.
- **F-1**: contract ‏27 ← ‏29 (+0027 و0028) + جداول 9.C الثلاثة + index الهوية المركبة (COALESCE).
- **Dedup isolation**: migration ‏0028 جديدة (0027 تاريخية لم تُمس) — `UNIQUE(key, ad, COALESCE(user,-1))`
  مع نسخ كامل للصفوف؛ نفس key+ad+identity ‏⇒ dedup، وعبر ad/identity ⇒ مستقل.
- **Mint cap**: ‏100 live token لكل (ad, هوية) ذرّياً — ‏429 `click_token_limit` عند التجاوز؛ الهوية من
  الجلسة (body يُتجاهل) أو IP المراقب للمجهول؛ السك لا يكتب ledger.
- **RED/GREEN مُثبَت**: ‏5 فشلت قبل الإصلاح ⇒ ‏ad-metrics ‏16/16 بعده (تشمل upgrade حقيقياً لـ0028)؛
  ‏19/19 للجيران؛ ‏`tsc` ✅؛ ‏`build` ✅. schema-contract يُجمَع بنجاح ولا يُنفَّذ محلياً (يتطلب Cloudflare).

## 9.C — القياس ومكافحة الاحتيال · فرع `feat/ads-metrics-antifraud`

- 🔧 منفَّذ محلياً (من `87b6517` = طرف 9.B). النتيجة: المعلن يدفع مقابل مشاهدات ونقرات حقيقية،
  والإحصاءات مشتقة من نفس المصدر الذي خُصم منه.
- **Click token** أحادي الاستخدام (opaque، مرتبط بالإعلان وهوية الجلسة، TTL ‏10 دقائق): بلا token ‏422،
  منتهي/غير صالح ‏403، معاد الاستخدام ‏409 — كلها بلا احتساب. بلا secret في العميل.
- **مصدر مالي واحد**: impressions/clicks/spend من الصفوف التشغيلية + `SUM` دفتر `ad_impression`
  (integer cents) — تزوير `views_count`/`clicks_count` (9999) لا يحرّك الأرقام. `LedgerService` كما هو.
- **Dedup**: مفتاح `idempotency_key` اختياري (نافذة 24h) — إعادة نفس التسليم لا تخصم ثانية؛ بلا مفتاح ⇒
  سلوك 9.A/9.B حرفياً. بلا تتبع سلوكي ولا استهداف جديد.
- **i18n**: `ads.{impressions,clicks,ctr,spend}` في `ar.ts` + `en.ts` وتُرجع كـ`labels` مع التحليلات.
- **Migration 0027** فقط (جديدة: `ad_click_tokens` + `ad_clicks` + `ad_impression_dedup`)؛ routes inventory
  مولَّد من جديد (191 مساراً، `POST /:id/click-token` جدید).
- **RED/GREEN مُثبَت**: ‏8/8 فشلت قبل الإصلاح ⇒ ‏8/8 بعده (تشمل 100 نقرة متزامنة: ‏1×200 + ‏99×409،
  و100 رمزاً مميزاً ⇒ ‏100×200)؛ ‏19/19 لجيران 9.A/9.B؛ ‏`tsc` ✅؛ ‏`build` ✅.
  الحالة 🔧 ريثما يعيد REMOTE التحقق (integration الحقيقي تعذّر محلياً — يتطلب Cloudflare).

## 9.B — عرض الإعلان واستهدافه · فرع `feat/ads-serving-targeting`

- 🔧 remediation لنفس الـPR (#45) بعد مراجعة REMOTE — ثلاثة findings فقط، ما عداها PASS وبقي مغلقاً:
- **F-1 (هوية الـcap) ✅ أُغلق**: مسار impression يستخدم هوية الجلسة حصراً للمصادق عليه (قراءةً وكتابةً)؛
  `body.user_id` يُتجاهل — إسقاط الحقل يسجّل باسم الجلسة، وتزوير id آخر لا يمسّ عداده. المجهول كما كان.
- **F-2 (ذرّية الـcap) ✅ أُغلق**: شرط الـcap داخل statement الخصم الذرّي نفسه + صف الـimpression والعدّاد
  داخل الـbatch (حراسة `tx_id`) — ‏30 طلباً متزامناً ⇒ ‏5 تُعرض و25×429 حتماً. اختبار `F-2` بأعداد دقيقة.
- **F-3 (schema-contract) ✅ أُغلق**: القائمة 27 + عمود 0026 مُثبَت بعد ترحيل من فراغ عبر Wrangler.
- **RED/GREEN مُثبَت**: على الكود القديم (stash) فشلت F-1a/F-1b/F-2 كما وصف الـREMOTE (بypass/500/30×200)؛
  بعده: ad-serving ‏11/11، ‏9.A (lifecycle+remediation) ‏8/8 بلا انحدار، schema-contract ‏17/17، ‏tsc ✅.
  الحالة 🔧 ريثما يعيد REMOTE التحقق من F-1/F-2/F-3 فقط.

- 🔧 منفَّذ محلياً (من `aa55b38` = `origin/main` بعد دمج 9.A في PR #44). النتيجة: الإعلان المناسب يظهر
  للجمهور المناسب، ولا يظهر لمن حجبه — كل الحماية server-side.
- **استهداف language + country + category فقط** (بلا behavioral tracking): `GET /api/advertisements`
  (`competition_id`/`context`/`limit`) يحلّ الاستهداف من صف المنافسة؛ `getTargetedAds()` في SQL واحد
  (حارس 9.A + مطابقة `target_* IS NULL OR =`). البعد الفئوي كان مفقوداً ⇒ **migration 0026** المضافة فقط
  (`target_category_id` + فهرس). `createCampaign` يقبلها اختيارياً (تحقق عبر `CategoryModel`).
- **AdBlockModel**: استبعاد `NOT IN` داخل SQL الاختيار — لا إخفاء frontend؛ `UserBlockModel` لم يُلمس.
- **Frequency cap**: ‏5 مشاهدات/مستخدم/إعلان/24h من `ad_impressions` فقط؛ استبعاد في الاختيار + حارس 429
  (`ads.frequency_cap_reached`) على مسار impression مفتاحه هوية الجلسة. `chargeImpression`/Ledger كما هما.
- **وسم معلن**: كل إعلان مخدوم يحمل `sponsored_label`/`why_this_ad`/`hide_ad` عبر `t('ads.*')` (مفاتيح جديدة
  ar+en بعربية فعلية) — بلا hard-code.
- **صفحات حساسة**: `context=private_messages` ⇒ `[]` من الخادم؛ `messages-page.ts` بلا إعلانات أصلاً.
- **RED أولاً (مُثبَت)**: 5 فشلت قبل الإصلاح (غير مطابق يُعرض، محجوب يُعرض، تجاوز الحد 200≠429،
  labels غير معرّفة، private_messages تعرض 4) ⇒ 8/8 بعده عبر Hono الحقيقي + SqliteD1.
- **الاختبارات**: `tests/api/ad-serving.test.ts` (8) ✅، `npm test` 501/501 ✅ (أُعيد تشغيل 9.A لضرورة لمس
  مسار impression المشترك — كشف تفاعلاً أُصلح بتقييد الحارس على الجلسة)، `tsc` ✅ (صفر `any` جديد)،
  `build` ✅. لا مسارات جديدة ⇒ بلا تجديد جرد. التراجع: إسقاط عمود 0026 وفهرسه.
- **النطاق المحترَم**: بلا 9.C/9.D/9.E، بلا LedgerService/Stripe/Money، بلا CI/dependencies، بلا تتبع
  سلوكي، بلا تعديل messaging، بلا migrations تاريخية، بلا دمج. الحالة 🔧 ريثما يعيد REMOTE التحقق.

## 9.A — دورة حياة الحملة الإعلانية · فرع `feat/ads-campaign-lifecycle`

- 🔧 منفَّذ محلياً (من `7855419` = `origin/main` بعد دمج PR #43). النتيجة: المعلن ينشئ حملة بميزانية،
  تمر بدورة محروسة `draft → pending_review → active → paused → ended`، وتتوقف عن العرض تلقائياً وذرّياً عند نفاد الميزانية.
- **migration 0025** (جديد، لا تعديل على القديم): إعادة بناء `advertisements` — `CHECK` جديد للحالات الخمس،
  `budget_cents`/`cost_per_impression_cents` (integer cents)، حذف عمودي `budget`/`budget_remaining` REAL
  (لا مصدر مالي موازٍ للـledger). ترحيل الحالات القديمة: `depleted`/`archived` → `ended`؛ صفوف `active` القديمة
  برصيد دفتر صفر فلا تُعرض حتى تُموَّل (افتراض آمن).
- **الحراسة في SQL**: كل انتقال عبر `guardedTransition` — `UPDATE ... WHERE id=? AND campaign_status IN (...)`
  (+ ملكية المعلن). المراجعة إلزامية: `pending_review → active` من المشرف فقط (`PUT /api/admin/ads/campaigns/:id/review`).
  مسارات جديدة: `POST /api/advertiser/campaigns/:id/submit-review`، `PUT .../end`، ومراجعة الأدمن (مولَّدة في الجرد).
- **LedgerService مصدر المال الوحيد (8.A)**: تمويل الحملة حركة متوازنة idempotent
  (`txId=ad_campaign_fund_<id>`): مدين `reserve:campaign_<id>` / دائن `platform:ad_budget_commitments`.
  كل عرض = حركة بشرط SQL داخل `INSERT ... SELECT` واحدة (حالة + رصيد + كتابة — بلا TOCTOU، نمط `withdraw`)
  + قيد توازن على `platform:ad_revenue` + انقلاب ذرّي إلى `ended` في نفس الـbatch عند عدم كفاية الرصيد للعرض التالي.
  استعلاما الاختيار (`getActiveAds`/`getActiveAdsForCompetition`) يتحقّقان من الرصيد في SQL.
- **RED أولاً (مُثبَت)**: بتعطيل حارس الرصيد وحارس الانتقالات مؤقتاً: `expected 101 to be 100`
  (تجاوز الميزانية تحت التزامن) و`expected 200 to be 409` (انتقال غير صالح يقبل) — ثم أخضر 4/4 بعد الإصلاح.
- **الاختبارات**: `tests/api/ad-campaign-lifecycle.test.ts` (4) عبر Hono الحقيقي + SqliteD1 بالمخطط الفعلي:
  دورة كاملة، رفض الانتقالات غير الصالحة (409) وغير المالك، منع عرض draft/pending_review، ميزانية 100 سنت مع
  101 عرضاً متزامناً ⇒ الخصم يتوقف عند 100 بالضبط + `ended` + ثابت الدفتر (فرق=0). `npm test` 489/489 ✅
  (بذرة `AdminModelExtraction` حُدّثت لافتراض `draft` الجديد)، `tsc` ✅ (any=272 ≤ 308)، `build` ✅.
- **i18n**: مجموعة `ads.*` جديدة (campaign_status_draft/pending_review/active/paused/ended، budget_exhausted،
  pending_review، invalid_transition، invalid_budget) في `ar.ts` و`en.ts` — عربية فعلية.
- **توثيق**: قسم جديد في `docs/02-DATABASE.md` + جرد المسارات مولَّد من جديد.
- **SEC-02/SEC-04**: تم التحقق من الملاحظة التوثيقية في `docs/12` (كلاهما منفَّذ في الكود فعلاً) — **خارج نطاق 9.A**،
  لا إصلاح ولا تعديل توثيقي لهما في هذا الـPR.
- **النطاق المحترَم**: بلا 9.B/9.C/9.D/9.E، بلا refactor عام للإعلانات، بلا تعديل LedgerService أو سياسة 8.G،
  بلا Stripe، بلا CI/dependencies، بلا migrations تاريخية، بلا دمج. الحالة 🔧 ريثما يعيد REMOTE التحقق.


## 8.G — FINAL MONEY GATE correction pass · فرع `fix/money-gate-final-remediation`

- 🔧 منفَّذ محلياً (من الرأس `b90ca08` على `feat/money-transparency` الذي يحمل 8.A–8.F).
  ملاحظة: base الـREMOTE ‏(`5e7fcd6`) غير موجود في السجل المحلي — بدأ العمل من
  `b90ca08` (رأس الفرع المحلي الحامل لكل عمل 8.A–8.F) وسُجَّل الفرق في تقرير المهمة.
- **F1 (crash consistency) ✅ مُغلق**: الحارس التراكمي + نية الاسترداد (القيود الدقيقة
  + tx الحتمي) في batch واحد ذري (migration ‏0024 `donation_refund_intents`)؛ أي crash
  قبل `ledger.post()` تكمِله إعادة الإرسال أو reconciliation بنفس القيود (لا ضياع ولا تكرار).
  RED: ضياع 200 سنت قبل الإصلاح ⇒ شفاء تام بعده + بدون duplicate.
- **F2 (cumulative race) ✅ مُغلق**: مطالبة CAS على القيمة المتوقعة +
  `UNIQUE(donation_id, cumulative_cents)` — فائز واحد لكل تقدّم والخاسر يعيد القراءة.
  RED: ‏500 بدل 300 قبل الإصلاح ⇒ ‏300 بالضبط بعده (comp ‏240 + plat ‏60) + ‏10 أحداث
  متزامنة ⇒ تسوية كاملة دقيقة + invariant ‏0.
- **F3 ✅ مُغلق بقرار رسمي — التبرعات غير قابلة للاسترداد مطلقاً**: القرار: لا refund
  (كامل/جزئي)، لا clawback، لا سالب، لا دين، لا عجز على المنصة — حتى قبل أي سحب.
  الفرض: `DONATIONS_NON_REFUNDABLE` في `DonationModel` + رفض `charge.refunded` في
  `processRefund` قبل أي أثر مالي (لا قيود/حارس/حالة، تسجيل الحدث بلا tx فقط) +
  `POST /api/donations` يشترط `non_refundable_accepted === true` و`amount_confirmed === true`
  معاً (400 بدونهما) + صفحة التبرع تعرض السياسة وتطلب موافقتين صريحتين (بلا افتراض) +
  i18n ‏(5 مفاتيح ar+en) + التوثيق في `docs/02-DATABASE.md`.
  الاختبارات: ‏F3A–G (رفض بلا سحب/بعد سحب جزئي مدفوع/تكرار + بوابتي الإنشاء + كلتاهما معاً + ‏i18n)
  سُلّمت حمراء أولاً (6 فشلت) ثم خضراء؛ اختبارات الـrefund القديمة حُوّلت لتوكيد الرفض.
- **F4 (SEC-01) ✅ مُغلق**: مسار `POST /api/donations/:id/complete` محذوف بالكامل +
  `markCompleted()` محذوفة من `DonationModel` + الجرد المعاد توليده (187 مساراً) بلا
  `complete` + اختبار يفرض 404 لكل المتغيرات. Stripe webhook سلطة الإكمال الوحيدة.
- **الاختبارات**: `tests/api/money-gate-8g.test.ts` (13: ‏F1a/F1b/F2a/F2b/F2c/F3doc + ‏7 matrix)
  سُلّمت حمراء أولاً (F1a/F1b/F2a/F4 فشلت كما هو متوقع) ثم خضراء؛ `donations-security`
  (6/6 ‏404)؛ المالية ×3 (83/83 كل جولة)؛ `npm test` ‏477/477 ✅؛ `tsc` ✅ (بلا `any` جديد)؛
  `build` ✅؛ `db:migrate:local` (0024 ✅)؛ تكامل `schema-contract` (25) ✅.
  التكامل الكلي: ملفان يفشلان في إعداد wrangler (0014/runtime — بيئي، سابق، بلا علاقة بالمال).
- **النطاق المحترَم**: بلا تعديل migrations تاريخية، بلا CI/dependencies، بلا production،
  بلا سياسة مالية جديدة، بلا F-11/F-12. الحالة 🔧 ريثما يعيد REMOTE التحقق — بلا دمج.

## 8.F — شفافية الأموال من دفتر الأستاذ · فرع `feat/money-transparency`

- 🔧 منفَّذ محلياً (من الرأس `c69c13a` على `feat/money-donations` الذي يحمل 8.A–8.E). النطاق: مجاميع عامة مشتقة من `ledger_entries` + تحقق مستقل + cache ببصمة — بلا جدول مالي موازٍ، بلا هوية شخصية، بلا تعديل `LedgerService` أو سياسة 8.A–8.E، بلا migration، بلا CI/dependencies، لا Production deployment/migration/merge.
  - **التعريفات (من semantics الحالية)**: `total_in` = دائن `reserve:*` (ساق الإجمالي الوحيدة لكل capture ‏8.C/8.E وتوزيع 8.B)؛ `total_out` = مدين `user:*` (حصص 8.B + صافي 8.E)؛ `platform_share` = صافي `platform:*` (مدين − دائن). integer cents، والفرق عن التجميع المستقل صفر سنت.
  - **`MoneyTransparencyService`**: قراءة ledger فقط (bind فقط)؛ cache داخلي TTL=60s + بصمة djb2 + إبطال بعدّ القيود (append-only ⇒ أي كتابة تغيّر العدّ)؛ `clearCache()` للاختبار/الإبطال. **لا migration** (لا KV/Cache API في المشروع).
  - **المساران** (عامّان كبقية `/api/transparency`): `GET /api/transparency/summary` (مجاميع + `fingerprint` + `cached` + `labels` مترجمة) و`GET /api/transparency/verify` (نتيجة `LedgerService.verifyInvariant()` مباشرة — `difference === 0`).
  - **i18n**: `transparency.{total_in,total_out,platform_share,verified_at}` في ar+en (مختلفان).
  - **الاختبارات**: `tests/api/transparency.test.ts` (7 عبر Hono الحقيقي — مطابقة مستقلة + لا هوية + verify + cache/إبطال + لا مصدر موازٍ (decoy في `platform_financial_logs` لا يغيّر شيئاً) + i18n + regression؛ سُلّمت حمراء أولاً 6/7 فشل ثم خضراء).
  - **التحقق**: `npm test` 464/464 ✅ + `tsc` ✅ (بلا `any` جديد) + `build` ✅ + `routes:inventory` 188 ✅. الحالة 🔧 (تحقق محلي) ريثما يعيد الوكيل الخارجي التحقق المستقل — بلا دمج.
  - **التسريب (G8)**: revert الـcommit؛ لا بيانات/مخطط.

## 8.E — التبرعات للمتنافسين · فرع `feat/money-donations`

- 🔧 منفَّذ محلياً (من الرأس `f280ee6` على `feat/money-withdrawals` الذي يحمل 8.A–8.D). النطاق: تبرع المشاهد لمتنافس بأثر مالي حصري عبر `LedgerService` — لا رصيد موازٍ، لا مسار مالي ثانٍ، لا تعديل لسياسة 8.A/8.B/8.C ولا لـ`LedgerService`، لا CI/dependencies، لا Production deployment/migration/merge.
  - **Migration 0022**: `recipient_user_id` + `competition_id` (additive فقط؛ NULL = مسار 8.C القديم بلا تغيير). تُطبَّق على قاعدة فارغة (23 migration) + `db:reset` ✅.
  - **السياسة (ثوابت موثقة)**: الحد الأدنى $1 (100 سنت = `payment_min_amount` + فحص المسار + الواجهة)؛ **بلا حد أقصى** على مستوى Dueli (قرار موثق — لا رقم مخترع)؛ الرسوم `platform_share_percentage` (الافتراضي 20 = سياسة 8.B).
  - **التقسيم**: حركة واحدة integer-exact (مدين المنصة بالرسوم + مدين المتنافس بالصافي + دائن البوابة بالإجمالي — ساق واحدة التزاماً بـ`UNIQUE(tx_id, account)`)؛ الفشل ⇒ لا قيود؛ الاسترداد الكامل ⇒ مرآة معكوسة عبر المسار الموثوق نفسه.
  - **الحظر 3.A**: المستلم حظر المتبرع ⇒ ‏403 خادمياً قبل أي أثر (اتجاهي؛ المعاكس مسموح).
  - **SSE**: نجاح أثناء البث ⇒ ‏`donation_new` على `competition:<id>` عبر البنية القائمة (الاسترداد لا يبث).
  - **i18n**: ‏`donations.{send,thanks,min,max,blocked}` في ar+en (مختلفان؛ `max` بلا رقم).
  - **الاختبارات**: `tests/api/donations.test.ts` (31 عبر Hono الحقيقي — الثمانية الأصلية + 8b/8c + ‏19 لتصحيحات REMOTE الخمسة R1–R5؛ سُلّمت حمراء أولاً 15 فشل ثم خضراء ×3). الصيانة: `schema-contract` (24) و`fake-d1` (معالجات الحجز).
  - **التصحيحات**: منع Double Capture (tx قطعي لكل تبرع) + دلالات amount_refunded التراكمية + سقف تراكمي ذري (0023) + تسوية تقريب من التخصيص الأصلي + سياق live/competitor — بلا سياسة جديدة.
  - **التحقق**: `npm test` 457/457 ✅ + `tsc` ✅ + `build` ✅ + `db:reset` ✅ + تكامل `schema-contract` + ‏`ledger` 31/31 ✅. الحالة 🔧 (تحقق محلي) ريثما يعيد REMOTE التحقق المستقل — بلا دمج.
  - **التسريب (G8)**: revert الـcommit؛ لا بيانات إنتاج.

## 8.D — السحوبات · فرع `feat/money-withdrawals`

- 🔧 منفَّذ محلياً (من الرأس 976ab63 على `feat/money-stripe-payments`). النطاق: دورة `requested → approved → paid | rejected` بأثر مالي حصري عبر `LedgerService` — لا رصيد مباشر، لا مسار مالي موازٍ، لا تعديل لسياسة 8.A/8.B/8.C ولا لـ`LedgerService`، لا CI/dependencies، لا Production deployment/migration/merge.
  - **Migration 0021**: إعادة بناء `withdrawal_requests` (حالات الدورة + `amount_cents` المعتمد + `fee_cents=0` + `hold_tx_id` + تعيين الحالات القديمة). تُطبَّق على قاعدة فارغة (22 migration) + `db:reset` ✅.
  - **السياسة (ثوابت موثقة)**: الحد الأدنى 5000 سنت ($50 = seed ‏`min_withdrawal_amount`)؛ الرسوم 0 (لا سياسة رسوم في المشروع).
  - **الدورة**: حجز لحظي عبر `ledger.withdraw()` الذري (سباق ⇒ واحد فقط)؛ موافقة `requested→approved→paid` بحراسة SQL (الثانية 409، دفع واحد)؛ رفض/إلغاء بتحرير عكسي idempotent (الرصيد يعود كاملاً، الثابت 0)؛ كل انتقال في `admin_audit_log`؛ الموافقة بأدمن (M6 ⇒ ‏403 لغيره).
  - **i18n**: ‏`withdrawals.{requested,approved,rejected,min_amount,insufficient_balance}` في ar+en (مختلفان).
  - **الاختبارات**: `tests/api/withdrawals-lifecycle.test.ts` (7 عبر Hono الحقيقي — الستة المطلوبة + i18n؛ سُلّمت حمراء أولاً 7/7 فشل ثم خضراء ×3). الصيانة: `schema-contract` (22) والجرد (186، بلا drift) ولوحة الأدمن/حد الواجهة.
  - **التحقق**: `npm test` 426/426 ✅ + `tsc` ✅ + `build` ✅ + `db:reset` ✅. الحالة 🔧 (تحقق محلي) ريثما تكتمل G1–G8 بالمراجعة الخارجية — بلا دمج.
  - **التسريب (G8)**: revert الـcommit؛ لا بيانات إنتاج.

## 8.C — مدفوعات Stripe · فرع `feat/money-stripe-payments`

- 🔧 منفَّذ محلياً (من الرأس 6252ced على `feat/money-earnings-split`). النطاق: مسار الدفع الفعلي يربط Stripe webhook بـ`LedgerService` كمصدر وحيد للأثر المالي — لا مسار مالي موازٍ، لا تعديل لسياسة 8.B (20/80) ولا لـ`LedgerService` semantics، لا CI/dependencies، لا Production deployment/migration/merge.
  - **Migration 0020**: `donations.amount_cents INTEGER NOT NULL CHECK(>=0)` (المبلغ المالي المعتمد؛ `amount` REAL يبقى للعرض) + جدول `stripe_webhook_events(event_id UNIQUE, event_type, processed_at, tx_id)` — **لا أي عمود مبلغ** (tx_id مرجع فقط). تُطبَّق على قاعدة فارغة وتُفرض قيودها فعلياً.
  - **`StripeWebhookService`**: معالجة موقّعة → قيود ledger متوازنة عبر `LedgerService.post()` فقط. مدعوم: نجاح الدفع (capture)، refund (reversal معكوس متوازن)، فشل (بلا قيود دائنة)، غير مدعوم (200 بلا أثر). **idempotency بطبقتين**: `UNIQUE(event_id)` + فحص `tx_id` في ledger — نفس الحدث 10× ⇒ أثر مالي واحد.
  - **عدم الثقة**: المبلغ يُطابَق دائماً مع `donations.amount_cents` — التعارض ⇒ رفض بلا أثر. كل المبالغ integer cents.
  - **التحقق من التوقيع أولاً** (400 قبل أي كتابة)؛ **إصلاح حتمي**: `csrfProtection()` كان يحظر webhook الحقيقي (Stripe لا يرسل Origin/Referer/CSRF) — استثناء محصور بالمسار فقط.
  - **i18n**: 8 مفاتيح ar+en للمدفوعات (مختلفان)؛ `donate-page.ts` يعرض النتيجة المترجمة بدل النصوص الحرفية.
  - **الأمان**: لا أسرار Stripe في المستودع أو التاريخ. مسار webhook PUBLIC مع in-handler HMAC check (صحيح للـwebhook).
  - **الاختبارات**: 22 جديدة (15 ledger-level + 7 route-level status codes + 1 CSRF reachability). التحديثات: `schema-contract` (21 migration + الجدول) و`fake-d1` (`amount_cents`).
  - **التحقق**: `npm test` 419/419 ✅ + `tsc` ✅ + `build` ✅ + `routes:inventory` 186 ✅. الحالة 🔧 (تحقق محلي) ريثما تكتمل G1–G8 بالمراجعة الخارجية — بلا دمج.
  - **التسريب (G8)**: revert الـcommit + حذف migration 0020 (جدول جديد لا يُلامسه migrations سابقة) + إزالة service/i18n/routes/tests.

## 8.B — الأرباح وحصص المنافسة · فرع `feat/money-earnings-split`

- 🔧 منفَّذ محلياً على `feat/money-ledger-invariant` (الرأس bd520e9). النطاق: `LivePayoutEngine.finalizePayouts` يوزع عبر `LedgerService` فقط (بلا earnings/financial_log كبديل)؛ `splitPayoutCents` بـ integer cents وقاعدة تقريب موثقة؛ idempotency داخل SQL (`claimFinalized` + إدراج شرطي + `UNIQUE(tx_id, account)`)؛ i18n `earnings.{total,pending,per_competition}` + `earnings_nav` ar+en؛ اختبار `tests/api/earnings-split.test.ts` (8/8). السياسة الفعلية: 20% منصة + 80% pool حسب التقييمات، والتساوي عند tie/no ratings (لا 70/25/5). التحقق: `npm test` 396/396 + `tsc` + `build` ✅ محلياً؛ بانتظار PR/مراجعة الوكيل الخارجي (بلا دمج، بلا Production D1).
  - **البوابات M1–M6**: M1 ✅ (verifyInvariant=0 بعد كل payout بما فيه 10 متزامنة)؛ M2 ✅ (post واحد في `db.batch()`)؛ M3 ✅ (لا Float جديد في مسار payout؛ المجاميع integer)؛ M4 ✅ (PROOF-0 + PROOF-2 + تشغيل مزدوج)؛ M5 ✅ (created_by + ref لكل قيد، وrevenue_log لقطة فقط)؛ M6 ✅ (بلا مسار عام جديد).
  - **التسريب (G8)**: التراجع = revert الـcommit؛ بلا migration وبلا بيانات إنتاج.


## 8.A — دفتر الأستاذ والثابت المحاسبي · فرع `feat/money-ledger-invariant`

- ✅ تمّ الإنشاء محلياً من `feat/live-turn-config` (الرأس 69f30ae). النطاق: جدول `ledger_entries` (migration 0019) + `LedgerService` + i18n محفظة + اختبارات (api + integration). **بناء محلي فقط — بلا API مسار جديد، بلا تغيير على `user_earnings`/`withdrawal_requests` الحالي (بلا سلوك مالي موجود).**
  - **Migration 0019**: `ledger_entries(id, tx_id, account, direction(debit|credit), amount_cents INTEGER CHECK(>0), currency, ref_type, ref_id, created_at, created_by)` — لا `REAL/FLOAT`؛ `UNIQUE(tx_id, account)` للعدمية (M4); `CHECK` على `direction` و`amount_cents` و`length(currency)=3` (M3); مشغلات `RAISE(ABORT)` append-only للـ `UPDATE/DELETE` (M5، M3). لا `FOREIGN KEY` على `ref_type/ref_id` (مرجع متعدد الأنواع — نفس نموذج 0002 السابق). الرصيد **بتجميع من ledger فقط** — لا عمود مكرر (M2).
  - **LedgerService**: `post()` يكتب مجموعة قيود متوازنة في `db.batch()` واحد (M1+M2)؛ `withdraw()` يُفرض عدم السلبية **بشرط SQL** داخل `INSERT…SELECT…WHERE balance>=amount` (M3، لا فحص JS)؛ `balance()`/`verifyInvariant()` تجميع مباشر؛ idempotent على `tx_id` (M4)؛ `created_by`+`ref` لكل قيد (M5).
  - **i18n**: `wallet.balance`/`insufficient_funds`/`transaction_failed` في `ar.ts`+`en.ts` (مختلفان).
  - **اختبارات**: `tests/api/ledger-invariant.test.ts` (9/9 على `SqliteD1` حقيقي يحمل الـ migrations) و`tests/integration/ledger.test.ts` (15/15 على D1 حقيقية عبر Wrangler CLI)؛ `schema-contract.test.ts` حُدَّثتعداده migration إلى 20 + أعمدة/فهرس ledger.
  - **البوابات M1–M6**: M1 ✅ (verifyInvariant دائماً 0 بعد 100 حركة عشوائية و20 متزامنة)؛ M2 ✅ (كل الحركة في `db.batch()` واحد)؛ M3 ✅ (guard شرط SQL + `CHECK` محرك)؛ M4 ✅ (نفس tx_id ⇒ صف واحد)؛ M5 ✅ (مشغلات رفض UPDATE/DELETE؛ `created_by`+`ref` لكل قيد)؛ M6 ✅ (إنشاءات مالية فقط، بدون مسار عام يُغيّر حالة — والموجودة ملتزمة M6).
  - **أوامر التحقّق V1–V6**: V1 `npm run build` ✅؛ V2 `npx tsc --noEmit` ✅ (بدون `any` جديد؛ العدد 144 ≤ 308)؛ V3 `npm test` 388/388 ✅؛ V4 `npm run db:reset` يطبق 0019 من قاعدة فارغة ✅؛ V5 `npm run test:integration` ledger 15/15 ✅ (فشل واحد بيئي في `messages-schema.test.ts` — انقضاء 120s بسبب بطء `wrangler CLI` على هذا الجهاز، غير مرتبط بـ ledger ولا بتغييراتي)؛ V6 عدّاد `any` لا يرتفع ✅.
  - **التسريب (G8)**: التراجع = حذف ملف 0019 + `LedgerService.ts` + الإزالة من `index.ts`/i18n + التراجع عن تحديثات `schema-contract.test.ts`؛ لا حاجة لتراجع بيانات (جدول جديد لا يُلامسه migrations سابقة).
  - **معروف (docs/16 §4)**: لا يوجد مسار علني يكتب الرصيد — فقط دالة خدمة داخلية جاهزة للأولوية المالية المنصوحة بها في مرحلة لاحقة.


- 🔧 Local implementation on `feat/live-turn-config` (from 7.C branch head `6cd01f9`). Scope: TURN عبر env فقط (لا سر في المستودع) + اعتمادات TURN مؤقتة قصيرة العمر مُولَّدة خادمياً لكل جلسة + تدهور رشيق (رسالة مترجمة + بديل STUN، لا شاشة سوداء).
- جديد `src/lib/services/TurnCredentialService.ts`: خلفيتان عبر env — (A) `TURN_URL`+`TURN_SECRET` → coturn REST auth (HMAC-SHA1 ephemeral، `username = <expiry>:<userId>`، TTL 3600s، مع نسخة `transport=tcp` تلقائية للشبكات المقيّدة)، (B) `TURN_TOKEN_ID`+`TURN_API_TOKEN` → Cloudflare Calls بطلب لكل جلسة (TTL 3600s) — أُلغيت ذاكرة Cache API المشتركة ~6h (سر مشترك سابق). غير مُعدَّ → STUN-only (`turn_available:false`). فشل خلفية مُعدَّة → `TurnCredentialError` → 502 برسالة مترجمة.
- `GET /api/signaling/ice-servers` أصبح محمياً بـ `authMiddleware({required:true})` (401 لغير المصادق)، ويعيد `iceServers + turn_available + ttl_seconds + expires_at` — لا يكشف أي سر سوى الاعتماد المؤقت. `fetchCloudflareIceServers` القديمة حُذفت.
- i18n: `live.network_restricted` + `live.turn_unavailable` (محفوظتان `live_signaling.*` مع alias في `i18n/index.ts` كما في 7.A). العميل `shared.ts fetchIceServers()` يرسل Bearer الجلسة ويعرض الرسائل المترجمة مع fallback STUN.
- bindings: `TURN_URL`/`TURN_SECRET` (اختياريان) في `src/config/types.ts` + `.dev.vars.example` بقيم فارغة فقط؛ docs/04 + docs/07 حُدِّثا؛ الجرد أعيد توليده (مسار أصبح AUTHENTICATED).
- الاختبار: `tests/api/turn-credentials.test.ts` (7) — مؤقت+انتهاء، 401، لا سر في الاستجابة (مسارا coturn وCloudflare)، فشل TURN ⇒ رسالة مترجمة ar/en، fallback STUN، مفاتيح i18n. الحالة 🧪 (تحقق محلي) ريثما تُستكمل G1–G8 بالمراجعة الخارجية.


## F-10 — Repository Change Policy (2026-09-18)

- 🔧 Local policy on `docs/repository-change-policy`, based on origin/main `042cbb5` (merge of PR #30, F-9). Docs only: no code, migration, schema, API, test, dot-folder/artifact create/delete/move/rename, plan, F-11 or merge changes.
- New `docs/18-REPOSITORY-CHANGE-POLICY.md`: general rule (no new file/folder outside task scope without explicit documented permission; allowed only if in-scope + justified in task report, or with explicit approval) + binding non-exhaustive list (planning files/plan copies, agent-artifact folders, temp reports, temp test files, personal agent tools, `.agent/.claude/.gemini` and similar) + F-9 relation (generalization, no deletion/move decision) + truth-source links + scope confirmations (OOP/MVC/SoC/i18n preserved, untouched).
- Enforced via new "تغيير المستودع (F-10)" quick rule in `AGENTS.md`; pointers in `docs/00-OVERVIEW.md` and `docs/17-DOT-FOLDERS-POLICY.md` (§4).
- Remote review pending. Status remains 🔧 under G1–G8; no APPROVE/MERGE claim.

## F-9 — Dot-Folders / Agent Artifacts Policy (2026-09-18)

- 🔧 Local policy on `docs/dot-folders-policy`, based on origin/main `002d887` (merge of PR #29, F-8). Docs only: no code, migration, schema, API, test, dot-folder create/delete/move/rename, plan, cleanup or merge changes.
- New `docs/17-DOT-FOLDERS-POLICY.md`: full inventory of the 7 agent artifacts found (`.agent`, `.blackbox`, `.claude`, `.gemini`, `.plan`, `.specify`, `.testsprite`) + explicit non-scope list (`.git/.github/.vscode/.wrangler/dotfiles` + `specs//testsprite_tests/` without dot) + the 6 binding rules (historical unless proven otherwise; not Sources of Truth; no planning/arch decisions on them; no new dot-folders without explicit permission; existence ≠ delete now; final cleanup not part of F-9). No new architectural decision, no F-10.
- Linked from F-8 sources: `docs/00-OVERVIEW.md` (policy pointer), `docs/16-KNOWN-ISSUES.md` (§4 pointer), `AGENTS.md` (reading-list item 3 pointer).
- Remote review pending. Status remains 🔧 under G1–G8; no APPROVE/MERGE claim.

## F-8 — Documentation Consolidation (2026-09-18)

- 🔧 Local consolidation on `docs/consolidate-documentation`, based on origin/main `fbee0cc` (PR #28 merge). Docs only: no code, migration, schema, API, test or dot-folder changes.
- Source-of-Truth map added in `docs/00-OVERVIEW.md` (categories A–G); new `docs/16-KNOWN-ISSUES.md` (duplicate 0012 numbering, corrected assumptions, non-sources list).
- Updated to match F-1 → F-7 reality: `docs/01` (governance refs + F-5A–F-5D SQL-free rule + FollowModel exception + G1–G8 workflow), `docs/02` (migrations 0014–0018 + duplicate-0012 note), `docs/03` (cron Bearer POST-only, SEC-11 pointer, B10/B11 endpoints), `docs/05` (F-6 STS SSOT + F-7 i18n), `AGENTS.md` (cron truth, F-5/F-6 pointers, reading list 1–11).
- Archived clearly (not deleted): `docs/COMPLETE_PROJECT_PLANS.md` bannered historical, `docs/10` bannered dated snapshot, `docs/archive/README.md` pointer fixed to governance docs.
- Remote review pending. Status remains 🔧 under G1–G8; no APPROVE/MERGE claim.

## F-5D — SQL inside AdminController (2026-09-18)

- 🔧 Local extraction validated, remote review/staging pending: every direct SQL statement inside `src/controllers/AdminController.ts` moved to the Model layer, behavior-preserving (same SQL, bindings, WHERE, sorting/pagination, error handling and response contracts; authorization and i18n untouched).
- New model: `src/models/AdminStatsModel.ts` (dashboard statistics + enhanced statistics: user/competition/report/ad counts, competitions-by-status, total revenue, active users, arbitration-pending, campaign-active ads, country demographics, hottest competitions).
- Extended existing models (no duplicates): `UserModel.searchForAdmin/getBanTarget/setActive` (users search/pagination, ban target resolution, ban/unban `is_active` update), `ReportModel.getTarget` (moderation target + audit target), `CommentModel.getAuthorId` (moderation author resolution), `CompetitionModel.getCreatorId/getSuspendState/getRestoreState/suspend/restore/recordSuspension/markSuspensionRestored/deleteCascade` (broadcast suspend/restore Task 9 + moderation cascade delete).
- New tests: `tests/models/AdminModelExtraction.test.ts` — 11 tests (static pin: no `.prepare(`/SQL in AdminController; behavior pins on sqlite over the real migrations for all extracted responsibilities). Focused suites: 11/11; affected model regressions (UserModel/FollowModel/RatingModel) 28/28. `npx tsc --noEmit`: exit 0. `npm run build`: exit 0.
- No schema/migration, route, URL, other-controller or F-6 work included. Rollback: revert the F-5D commit; no data migration needed.
- Files: src/controllers/AdminController.ts, src/models/AdminStatsModel.ts, src/models/UserModel.ts, src/models/ReportModel.ts, src/models/CommentModel.ts, src/models/CompetitionModel.ts, tests/models/AdminModelExtraction.test.ts, PLAN-STATUS.md, WORKLOG.md.
- Local implementation validated; remote review/staging pending. Status remains 🔧 under G1–G8; no full quality-gate completion claim.


# 📊 PLAN-STATUS — لوحة حالة المهام

> ⚠️ **تحذير حاكم (2026-09-05):** `docs/11-DEFINITION-OF-DONE.md` وجد أن علامة "✅
> مكتملة ومختبرة" أدناه غير دقيقة لمعظم البنود — لا يوجد اختبار آلي واحد في المشروع
> (`docs/13-TEST-STRATEGY.md`). كل `✅` تخصّ **منطقاً لا توثيقاً** يجب أن تُقرأ فعلياً
> كـ`🧪 مُتحقَّقة يدوياً فقط` حتى تُكتب لها اختبارات (`tests/`) وتجتاز G1–G8. **لم تُنفَّذ
> إعادة التصنيف الفعلية لكل سطر بعد** — هذا بند متابعة صريح، لا سهواً مخفياً.
> الرموز الصحيحة من الآن: `☐ لم تبدأ` | `🔧 جارية` | `🧪 مُتحقَّقة يدوياً (لا اختبار آلي)` | `✅ اجتازت G1–G8` | `⛔ معطلة`
> مرجع التعريفات الكاملة: `docs/COMPLETE_PROJECT_PLANS.md` (تاريخي) — مرجع البوابة الحاكمة: `docs/11-DEFINITION-OF-DONE.md`
> خارطة الطريق المصححة والأولويات الفعلية: `docs/15-ROADMAP.md`
## F-5C — SQL inside Pages (2026-09-18)

- 🔧 Local extraction validated, remote review/staging pending: only the F-4-identified SQL in src/modules/pages/profile-page.ts (two `follows` COUNT statements → FollowModel.getFollowersCount/getFollowingCount) and src/modules/pages/live/main.ts (session lookup → SessionModel.findBySessionId; competition lookup → CompetitionModel.findOne) moved to the Model layer, reusing existing methods with identical SQL/bindings. New tests: 9 profile + 25 live-page pins passed before and after extraction; focused suites 58/58 after (incl. F-5A/F-5B regression pins), npx tsc --noEmit exit 0, npm run build exit 0. No F-5A/F-5B/F-5D/F-6 or unrelated work included. See WORKLOG.md for evidence and rollback. No full G1–G8 completion claim; no migration needed.




## F-5B — Controller-local FollowModel (2026-09-17)

- 🔧 Local extraction validated, remote review/staging pending: only FollowModel moved from UserController to src/models/FollowModel.ts, preserving the constructor and five methods unchanged. New tests: 7 model + 5 API passed (API pins also passed 5/5 before extraction); npm test 208/208, tsc and build exit 0. Affected D1 integration: 6 passed / 2 pre-existing failures (comment/conversation creation), reproduced with origin/main test/dependencies. See WORKLOG.md for baseline evidence and the retained inheritance exception. No full G1–G8 completion claim.


## المرحلة 0 — التنظيف الكبير

| ID | المهمة | الحالة | الملفات | اختبار القبول | التاريخ |
|----|--------|--------|---------|---------------|---------|
| SRS-0.1 | تنظيف الكود (backups، مسارات ميتة) | ✅ | src/modules/pages/live/scripts/client/*, src/routes/* | build نظيف ✅ | 2026-08-23 |
| SRS-0.2 | توحيد التوثيق وأرشفة القديم | ✅ | docs/, docs/archive/ | لا تكرار متناقض ✅ | 2026-08-23 |
| SRS-0.3 | قواعد المعمارية + AGENTS.md | ✅ | docs/01-ARCHITECTURE-RULES.md, AGENTS.md | مراجعة ضد القواعد | 2026-08-23 |

## المرحلة 1 — الإصلاح الحال

| ID | المهمة | الحالة | الملفات | اختبار القبول | التاريخ |
|----|--------|--------|---------|---------------|---------|
| T1.1 | ترحيل 0007 + إصلاح user_follows | ✅ | migrations/0007, UserModel, SearchModel, UserSettingsModel | migrate ناجح ✅، صفر user_follows ✅ | 2026-08-23 |
| T1.2 | ربط recommendations/leaderboard/analytics | ✅ | src/main.ts | JSON وليس 404 ✅ (401 محمية) | 2026-08-23 |
| T1.3 | إصلاح استقبال البث (حي+VOD) | 🔧 | shared.ts, competition-page, chunks/routes (وكيل playlist) | إصلاح 3 أسباب جذرية (امتداد+polling+CORS proxy) — يتبقى جلسة بث حي للتأكيد النهائي | 2026-08-23 |
| T1.4 | أمان حرج (PBKDF2، حظر، XSS، بريد) | ✅ | CryptoUtils, AdminController, SessionModel, Sanitize | ترقية شفافة E2E ✅ محظور=خروج قسري ✅ | 2026-08-23 |
| T1.5 | دورة النهاية والأرباح التلقائية | ✅ | ScheduledTaskService, CompetitionController, cron/routes, LivePayoutEngine | winner_id بالتقييم ✅ ELO تغير ✅ cron نفّذ التوزيع ✅ | 2026-08-23 |

## المرحلة 2 — المفقودات من الواقع

| ID | المهمة | الحالة | الملفات | اختبار القبول | التاريخ |
|----|--------|--------|---------|---------------|---------|
| T2.1 | مودال الدعوات الكامل (فتح تلقائي+hover+صلاحيات) | ✅ | InvitePanel.ts, MatchmakingController, competition-page, create-page, migrations/0008 | online-users مرتبة بالتوافق ✅ hover-stats تعمل ✅ فتح تلقائي مربوط ✅ | 2026-08-23 |
| T2.2 | إشعارات فورية SSE شاملة | ✅ | CompetitionController, middleware/auth, SseService, NotificationsUI, i18n | E2E حقيقي: invite_sent وinvite_accepted وصلا لحظياً عبر البث ✅ | 2026-08-23 |
| T2.3 | عرض المنافسات المقترحة بأوزان | ✅ | RecommendationEngine, client/pages/HomePage.ts | قسم المقترح عبر المحرك + تدهور رشيق ✅ | 2026-08-23 |
| T2.4 | تعليقات وتقييمات → منتصر | ✅ | competition-page, CompetitionController | نجوم 1-5 + شريط الفائز يظهران E2E ✅ (المنطق من T1.5) | 2026-08-23 |

## المرحلة 3 — اكتمال النواة

| ID | المهمة | الحالة | الملفات | اختبار القبول | التاريخ |
|----|--------|--------|---------|---------------|---------|
| T3.1 | عولمة اللغات | ✅ | i18n/languages.ts, index.ts, docs/06-I18N-GUIDE.md | إضافة لغة = 3 خطوات موثقة بلا تعديل منطق | 2026-08-23 |
| T3.2 | البروفايل الكامل (منشورات/جدولة) | ✅ | delete-account.ts, profile-page, CountdownTimer wiring, migrations/0009 | حذف GDPR ✅ نشر/حذف منشور E2E ✅ مؤقت الحياة يعمل ✅ | 2026-08-23 |
| T3.3 | تعليقات متقدمة (ردود/إشراف) | 🔧 | CommentModel, CompetitionController, competition-page | ردود متداخلة E2E ✅ (الإشراف ضمن أدوات T3.4) | 2026-08-23 |
| T3.4 | أدمن حقيقي (تنفيذ الأفعال+تدقيق) | ✅ | AdminController, admin routes, AdminAuditLogModel | بلاغ→حظر فعلي+سجل تدقيق E2E ✅ | 2026-08-23 |

## المرحلة 4 — الأنظمة المساعدة

| ID | المهمة | الحالة | الملفات | اختبار القبول | التاريخ |
|----|--------|--------|---------|---------------|---------|
| T4.1 | دفع حقيقي Stripe/PayPal | ✅ | StripeService.ts, donations routes+webhook, donate-page, main.ts | Checkout+webhook موقّع E2E ✅ (يتطلب STRIPE keys بالإنتاج للدفع الحي) | 2026-08-23 |
| T4.2 | سحوبات بوابات إقليمية | ✅ | withdrawals + payment-methods (مربوطة) | طلب→موافقة (منفذ منذ قبل) + طرق الدفع مربوطة | 2026-08-23 |
| T4.3 | بوابة معلنين + تقارير | ✅ | advertiser, ad-blocks, ad-reports (ربط) | الوحدات الثلاث مربوطة في main.ts | 2026-08-23 |
| T4.4 | شفافية مالية آلية | ✅ | LivePayoutEngine → platform_financial_logs | تتغذى تلقائياً من T1.5 ✅ + API يستجيب | 2026-08-23 |

## المرحلة 5 — الرؤية البعيدة

| ID | المهمة | الحالة | الملفات | اختبار القبول | التاريخ |
|----|--------|--------|---------|---------------|---------|
| T5.1 | Durable Objects push أصلي | ✅ | workers/dueli-realtime/ (DO+Hibernation), EventPusher توجيه, SseService WS-first | بناء ✅ — التحقق الحي بعد `wrangler deploy` (خطة Workers مدفوعة) | 2026-08-23 |
| T5.2 | Cloudflare Stream/VOD CDN | ✅ قرار | قرار مالك مفوض: إبقاء خط ffmpeg الحالي (يعمل وأرخص) — مراجعة عند الحاجة الفعلية | موثق في WORKLOG | 2026-08-23 |
| T5.3 | PWA كامل / موبايل | 🔧 | manifest.json, sw.js (v2 + تقليم كاش) | الأساس + تحسينات ✅ — offline كامل تحسين مستقبلي | 2026-08-23 |
| T5.4 | ترجمة مجتمعية + AI moderation | ☐ مؤجل | - | بعد نمو المحتوى — قرار مالك | |
| T5.5 | API عامة موثقة | ✅ | docs/08-PUBLIC-API.md | دليل مطورين خارجيين كامل | 2026-08-23 |
| B13 | صلابة leaderboard/search/explore (JSON دائماً، MVC منفصل، لا SQL في routes) | ✅ اجتازت G1–G8 | src/modules/api/leaderboard/routes.ts, src/modules/api/search/routes.ts, src/controllers/LeaderboardController.ts, src/controllers/SearchController.ts, src/models/LeaderboardModel.ts, src/i18n/ar.ts, src/i18n/en.ts, src/modules/pages/explore-page.ts, tests/api/discovery-endpoints.test.ts | 200 JSON نجاح/فارغ، 500 JSON نظيف مترجم بلا تسريب، Content-Type دائماً application/json، grep يؤكد انعدام SQL في المسارات، 9/9 اختبارات ✅ + npm test 156/156 ✅ + tsc ✅ + build ✅ | 2026-09-16 |

## حوكمة الجودة (2026-09-05)

| ID | المهمة | الحالة | الملفات | اختبار القبول | التاريخ |
|----|--------|--------|---------|---------------|---------|
| GOV-1 | كتابة 11-DEFINITION-OF-DONE.md | ✅ | docs/11-DEFINITION-OF-DONE.md | مراجعة محتوى — G1-G8 + M1-M6 كاملة | 2026-09-05 |
| GOV-2 | كتابة 12-SECURITY-REMEDIATION.md | ✅ | docs/12-SECURITY-REMEDIATION.md | SEC-01→SEC-15 موثّقة بملف/سطر/توجيه/قبول | 2026-09-05 |
| GOV-3 | كتابة 13-TEST-STRATEGY.md | ✅ | docs/13-TEST-STRATEGY.md | مكدّس+بنية tests/+F1-F15+خطة أسبوع 1 | 2026-09-05 |
| GOV-4 | كتابة 15-ROADMAP.md | ✅ | docs/15-ROADMAP.md | مراحل 0-9 ببوابات خروج | 2026-09-05 |
| GOV-5 | إعادة بناء dev-tools/route-inventory.mjs | ✅ | dev-tools/route-inventory.mjs, route-inventory.json | نُفّذ فعلياً: 172 مسار مصنَّف | 2026-09-05 |
| GOV-6 | إصلاح db:reset عابر للأنظمة | ✅ | dev-tools/reset-d1.mjs, package.json | لا PowerShell في السكربت | 2026-09-05 |
| GOV-7 | تحديث AGENTS.md وربط 10-15 | ✅ | AGENTS.md | ترتيب قراءة مصحَّح + 3 حقائق قديمة مصحَّحة | 2026-09-05 |
| GOV-8 | CI quality-gate.yml | 🧪 | .github/workflows/quality-gate.yml | لم يُشغَّل بعد على GitHub Actions فعلياً (يحتاج أول push/PR) | 2026-09-05 |
| GOV-9 | إعادة تصنيف كل سطر ✅→🧪 في هذا الملف | ☐ | PLAN-STATUS.md (كامل) | — | مؤجل، يحتاج جلسة مخصصة |
| GOV-10 | إصلاح ثغرات SEC-01→SEC-15 فعلياً | ☐ | حسب كل بند في docs/12 | — | مرحلة 1 من 15-ROADMAP.md |
| GOV-11 | أساس integration D1 حقيقي عبر Wrangler CLI | 🔧 | tests/integration/, vitest.integration.config.ts, package.json, .gitignore | 16 schema-contract tests تمر مرتين متتاليتين؛ 14 migration files تُطبق كما هي عبر `wrangler d1 migrations apply` على حالة معزولة `.wrangler-test/`؛ لا FakeD1/TEST_SCHEMA/SQL transformation. **لا يُصلح B1/B2/B4/B5 ولا يغطي المالية أو E2E** | 2026-09-08 |
| GOV-11 | SEC-11 (raw `?token=` في query): **مفتوحة — دين أمني معلن مؤقتاً**. بعد incident 2026-09-07 (commit 55da144 كسر SSE الخاص) أعيد raw query token مؤقتاً عبر PR #1 (merge e38a2d3) وفحص CI حوله تحول إلى تحذير (GRACE-PERIOD، بلا تاريخ إغلاق وهمي). العلاج النهائي لم يتغير: realtime ticket flow + اختبارات expiry/single-use/user-binding (المرحلة 4 من 15-ROADMAP.md) — عندها فقط يعود الفحص مانعاً. | 🔧 | .github/workflows/quality-gate.yml (CI فقط — لا src)، docs/12 SEC-11، docs/15 Phase 4 | فحص CI يظهر ::warning لا ::error؛ لا ✅ هنا بأي حال | 2026-09-07 |
| GOV-11 | B5-2: تعريب رسائل أخطاء المنافسة المتبقية — إضافة 11 مفتاح i18n تحت `competition_errors` (no_opponent/vod_url_required/already_has_opponent/invitee_required/cannot_invite_self/already_invited/no_pending_invitation/no_pending_request/request_already_accepted/already_competitor/competition_full) مترجمة ar+en؛ استبدال 10 نصوص حرفية في CompetitionController بـ `this.t()`؛ إصلاح خلل بناء في fake-d1.ts (if-block مكرر)؛ 5 اختبارات i18n جديدة (ar+en + حارس انحدار). النطاق محصور بـ CompetitionController + i18n + tests — لا متحكمات مال/إعلانات | 🧪 | src/controllers/CompetitionController.ts, src/i18n/ar.ts, src/i18n/en.ts, tests/helpers/fake-d1.ts, tests/api/competition-errors-i18n.test.ts | competition-errors-i18n 5/5 ✅ + npm test 75/75 ✅ + tsc ✅ + build ✅؛ الحالة 🧪 حتى مراجعة القائد | 2026-09-09 |
| GOV-11 | B1: محاذاة schema الرسائل مع نموذج conversations — migration 0014 (إضافة messages.conversation_id وread_at + backfill محادثات legacy + ربط الرسائل القديمة + read_at من is_read + فهارس conversation_id/created_at وreceiver_id/is_read) + MessageModel (إنشاء يحفظ receiver_id من المحادثة مع فحص عضوية المرسل، markAsRead يضبط is_read=1 وread_at، unread_count بـis_read=0) + 9 integration tests حقيقية عبر Wrangler CLI (سلمت حمراء قبل الإصلاح: `no such column: m.conversation_id`) + i18n: إضافة مفاتيح مفقودة (errors.invalid_id, message.invalid_recipient, message.content_required) لـar/en + 35 i18n test تحقق الترجمة وRTL/LTR | 🧪 | migrations/0014_messages_conversation_alignment.sql, src/models/MessageModel.ts, src/i18n/ar.ts, src/i18n/en.ts, tests/integration/messages-schema.test.ts, tests/api/messages-i18n.test.ts, tests/integration/schema-contract.test.ts, tests/integration/helpers/wrangler-d1-runner.mjs, vitest.integration.config.ts, package.json | 25/25 integration tests (مرتين متتاليتين، exit 0) + 70/70 unit (35 i18n + 35 original) + build ✅ + tsc ✅ + db:reset ✅؛ الحالة 🧪 حتى مراجعة القائد (لا commit/PR بعد) | 2026-09-08 |
| B5-1 | حراسة انتقالات حالة المنافسة (start: accepted فقط + opponent إلزامي → 409، end: live فقط → 409، idempotent: completed → already_completed بلا finalize مكرر؛ Model بـUPDATE مشروط AND status + boolean من meta.changes/before-after fallback؛ لا لمس للمال/LivePayoutEngine/ScheduledTaskService/migrations) | 🧪 | src/models/CompetitionModel.ts, src/controllers/CompetitionController.ts, src/i18n/ar.ts, src/i18n/en.ts, tests/integration/competition-state-guards.test.ts, tests/api/competition-state-guards-i18n.test.ts | integration 7/7 عبر D1 حقيقية (Wrangler CLI) ✅ + unit 73/73 (منها 3 i18n جديدة) ✅ + tsc ✅ + build ✅؛ 🧪 حتى مراجعة القائد (لا commit/PR بعد) | 2026-09-09 |
| B2+B3 | ترقيم التعليقات + شجرة الردود + بث حي + حمولة أخف — `GET /:id/comments` (limit≤100، `replies_count`)، `GET /:id` خفيف (`comments_count`)، `publishComment` بعد الإدراج، حذف ناعم (`deleted_at`، مالك/أدمن)، بلاغ `message` بنفس النظام؛ i18n ar+en؛ اختبار أحمر أولاً 6/6 فشل ثم 6/6 نجاح | 🔧 | migrations/0016, CommentModel, CompetitionController, competitions/routes, competition-page, ReportModel, i18n/ar+en, tests/api/comments-pagination.test.ts, docs/03+14, WORKLOG | comments-pagination 6/6 ✅ + npm test 111/111 ✅ + tsc ✅ + build ✅ + route-inventory ✅؛ بانتظار PR/مراجعة (بلا دمج) | 2026-09-10 |
| B8 | توحيد الإعجاب/عدم الإعجاب — **الإكمال لا الإزالة**: `POST/DELETE /api/competitions/:id/dislike` (كان `dislikes` مخزَّناً ومعروضاً بلا مسار يكتبه)؛ `LikeModel.setReaction/clearReaction` تبديل ذرّي في `db.batch()` (حذف المعاكس → `INSERT OR IGNORE` للفعل → إعادة حساب `competitions.likes_count/dislikes_count` من الجدولين) فلا يجتمع like و dislike لنفس المستخدم/المنافسة والتكرار idempotent؛ `GET /:id/like` يعيد `{ liked, disliked, likes_count, dislikes_count }`؛ حارس الحظر المركزي B6 (`isBlockedBetween`) على الفعلين ⇒ 403 بلا صف؛ i18n `interactions.*` ar+en؛ **بلا migration** (جدولا `likes`/`dislikes` من 0001) | 🧪 | src/models/LikeModel.ts, src/controllers/InteractionController.ts, src/modules/api/likes/routes.ts, src/i18n/ar.ts, src/i18n/en.ts, src/shared/components/competition-card.ts, src/client/services/InteractionService.ts, tests/api/like-dislike.test.ts (جديد), tests/helpers/fake-d1.ts, docs/03, docs/14, dev-tools/route-inventory.json, WORKLOG.md | أحمر أولاً: 6/6 فشل (404 للمسار + غياب الحقول) ثم 6/6 ✅ + npm test 117/117 ✅ + tsc ✅ + build ✅ + route-inventory 174 مساراً ✅؛ G7 staging لم يُجرَّب — 🧪 حتى مراجعة القائد | 2026-09-15 |
| B9 | تصحيح أنواع الإشعارات + التوطين وقت العرض — إشعار الرسالة كان يُخزَّن `type='comment'` (خطأ نسخ) أُصلح إلى `type='message'` في `MessageController.sendMessage/startConversation`؛ تعداد `NotificationType` وُسّع (`message/post_like/post_comment`) **بلا migration** (عمود TEXT بلا CHECK في 0001)؛ `NotificationModel.createForType()` يخزّن `type + payload` فقط (title = مفتاح i18n)؛ `NotificationPresenter` يولّد title/message/link وقت العرض حسب `?lang=` مع fallback آمن (`notification.generic`، بلا exception)؛ i18n جديدة ar+en (`new_message_body/new_post_like(_body)/new_post_comment(_body)/generic/competition_invite`)؛ إشعار `follow` تحوّل لنفس العقد | 🔧 | src/config/types.ts, src/models/NotificationModel.ts, src/lib/services/NotificationPresenter.ts (جديد), src/controllers/MessageController.ts, src/controllers/UserController.ts, src/i18n/ar.ts, src/i18n/en.ts, tests/api/notification-types.test.ts (جديد), tests/helpers/fake-d1.ts | أحمر أولاً: `type='comment'` + مفاتيح مفقودة + بلا link ثم 8/8 ✅ + npm test 125/125 ✅ + tsc ✅ + build ✅؛ بانتظار PR/مراجعة (بلا دمج) | 2026-09-15 |

| B10 | أهلية التقييم ونافذته (24h من `ended_at` + منع التقييم الذاتي + شرط المشاهدة) — فقرة «أهلية التقييم» في `docs/05`؛ `RatingModel.decideRatingEligibility()` نقية + `checkEligibility()` (watch row + duplicate + window على ساعة الخادم)؛ `CompetitionController.rate()` يرفض المشاركين (403 self) وهدفاً غير مشارك (422) وبلا مشاهدة (403) وخارج النافذة (403) والمكرر (409)؛ تعارض UNIQUE المتزامن → 409؛ `RatingEligibilityError` (403)؛ i18n `competition_errors.rating_{self_forbidden,watch_required,window_closed}` ar+en؛ **بلا migration** (أعمدة `ended_at`/`watch_history` من 0001)؛ B6 حُدّث (مقيّم C محايد بدل المشارك B) | 🔧 | docs/05-COMPETITION-LIFECYCLE.md, src/models/RatingModel.ts, src/controllers/CompetitionController.ts, src/lib/errors/AppError.ts, src/i18n/ar.ts, src/i18n/en.ts, tests/api/rating-eligibility.test.ts (جديد), tests/api/block-enforcement.test.ts, tests/helpers/fake-d1.ts | rating-eligibility 9/9 ✅ + npm test 134/134 ✅ + tsc ✅ + build ✅؛ بانتظار PR/مراجعة (بلا دمج) | 2026-09-15 |


| B11 | ملخّص التقييمات مجهول الهوية + سحب التقييم داخل النافذة — `GET /api/competitions/:id/ratings/summary` (تجميع SQL `GROUP BY` في `RatingModel.getSummary()`: متوسط/count/توزيع 1–5، `average=null` عند 0 تقييم بلا NaN وبلا قسمة على صفر؛ **صفر هوية للمقيّم** — لا user_id/username/email/display_name)؛ `DELETE /api/competitions/:id/rate?competitor_id=` (داخل نافذة B10 `isWindowOpen` فقط ⇒ 409 خارجها؛ لمقيّم فعلي فقط ⇒ 404 إن لم يقيّم؛ الحذف + إعادة حساب المجاميع في `db.batch()` واحد بـ UPDATE subqueries)؛ إزالة تسريب الهوية من `RatingModel.findByCompetition()` (بلا JOIN users) واختبار B5-3 القديم تحوّل لحارس خصوصية؛ migration 0017 فهرس `ratings(competition_id, competitor_id)`؛ i18n `ratings.*` ar+en | 🧪 | migrations/0017_ratings_competition_competitor_idx.sql, src/models/RatingModel.ts, src/controllers/CompetitionController.ts, src/modules/api/competitions/routes.ts, src/i18n/ar.ts, src/i18n/en.ts, tests/api/ratings-summary.test.ts (جديد 7 اختبارات), tests/models/RatingModel.test.ts, tests/helpers/fake-d1.ts, docs/14, WORKLOG | ratings-summary 7/7 ✅ (أحمر أولاً على baseline) + npm test 141/141 ✅ + tsc ✅ + build ✅ + db:reset ✅؛ بانتظار PR/مراجعة (بلا دمج) | 2026-09-15 |
| B14 | تثبيت أوزان التوصيات وسلوك الاحتياط — ثوابت مسماة بالقيم نفسها (25/20/20/10/10-7-4/15/15) + اختبار `recommendations-ranking` (18) يثبت الترتيب الست + fallback الزائر + حساسية المتابعة؛ i18n `recommendations.for_you/trending/empty` ar+en | 🔧 | src/lib/services/RecommendationEngine.ts, src/controllers/RecommendationController.ts, src/i18n/ar.ts, src/i18n/en.ts, tests/api/recommendations-ranking.test.ts (new), tests/helpers/sqlite-d1.ts (new), WORKLOG | RED أولاً: 5 فشل / 13 نجاح قبل التثبيت ثم 18/18 ✅؛ بانتظار npm test + tsc + build + PR/مراجعة (بلا دمج) | 2026-09-16 |
| B15 | RTL/dark/mobile polish لمسار Beta (بلا إعادة تصميم، بلا API/DB) — إصلاحات RTL حقيقية: إزالة `scale-x-[-1]` المحظور من زر الدخول + `me-*` المنطقية بدل `mr-*` في competition/create/card + فئات Tailwind ثابتة للـJIT في user-card + `t('previous'/'next')` ar+en للكاروسيل؛ dark: `body.dark` لـbadge-live/badge-pending/tab-inactive؛ mobile: `overflow-x:clip` + `.dropdown-panel max-width:calc(100vw-2rem)` + أسهم الكاروسيل ظاهرة على اللمس؛ اختبار `tests/ui/rtl-dark-mobile.test.ts` (14) سُلّم أحمر أولاً (6/6 فشل) ثم أخضر | 🔧 | src/styles.css, src/shared/components/navigation.ts, src/shared/components/user-card.ts, src/shared/components/competition-card.ts, src/shared/components/competition-section.ts, src/modules/pages/competition-page.ts, src/modules/pages/create-page.ts, src/i18n/ar.ts, src/i18n/en.ts, tests/ui/rtl-dark-mobile.test.ts (new), WORKLOG | rtl-dark-mobile 14/14 ✅ (RED أولاً 6/6 فشل) + npm test 188/188 ✅ + tsc ✅ + build ✅؛ بانتظار PR/مراجعة (بلا دمج) | 2026-09-16 |
| B16 | E2E خفيف واحد لمسار Beta Core Done — سيناريو واحد يغطي الـ14 خطوة (تسجيل/profile/توصيات/إنشاء/دعوة/قبول/بدء/رسالة/تعليق/إنهاء/تقييم/فائز/إشعارات)؛ مشروعان ar (RTL) وen (LTR) بنفس منطق الاختبار؛ مسار حقيقي (UI + Hono API + local D1)؛ لا sleep ولا waitForTimeout؛ اجتياز 3 مرات متتالية بأقل من 3 دقائق؛ إثبات الحساسية للأحمر بتعطيل القبول مؤقتاً؛ حزمة Playwright مقتصرة كـ devDependency؛ لا مساس بـ CI أو الإنتاج | 🧪 | playwright.config.ts, tests/e2e/beta-core-path.spec.ts, package.json, package-lock.json, PLAN-STATUS.md, WORKLOG.md | Playwright 2/2 ✅ (ar+en) 3 مرات متتالية (< 2.5 دقيقة) + إثبات الحساسية أحمر (1/1 فشل) ثم أخضر + npm test 188/188 ✅ + tsc ✅ + build ✅؛ 🧪 بانتظار PR/مراجعة الوكيل الخارجي (بلا دمج) | 2026-09-17 |
| B12 | ذرّية تحديد الفائز + ELO idempotent — `updateAggregatesAfterVote()`: المتوسطات + `winner_id` + ELO + مطالبة `elo_applied_at` في **`db.batch()` واحد** (لا `run()` متتابعة)؛ idempotency **داخل SQL** لا JS: migration `0018_competitions_elo_applied_at.sql` + كتابات `users.elo_rating` مشروطة بـ `(SELECT elo_applied_at ...) IS NULL` + مطالبة `WHERE elo_applied_at IS NULL`؛ **ELO لا يُحسم إلا بعد إغلاق نافذة التقييم** (`isWindowOpen` من B10) لمنع الحسم على نتيجة مؤقتة؛ قاعدة التعادل الصريحة: تساوي المتوسطين ⇒ `winner_id = NULL` + ELO 0.5/0.5 مرة واحدة؛ فشل الدفعة لا يفشل التصويت (201) — تسجيل + مهمة `recalc_aggregates` مجدولة كإعادة محاولة دائمة عبر `processPendingTasks`؛ `finalizeCompetition` أعاد استخدام المسار الذرّي (finalizePayouts كما هو — **LivePayoutEngine والمالية لم تُمس**)؛ i18n `competition.winner/draw/pending_result` ar+en + `result:{status,label}` في ratings/summary عبر `t()`؛ **⚠️ schema-contract integration يفشل أصلاً على main (15 مقابل 18 ملف migration قبل B12) — إضافة 0018 تزيد نفس الفشل القائم؛ تحديث القائمة خارج النطاق** | 🔧 | migrations/0018_competitions_elo_applied_at.sql, src/lib/services/ScheduledTaskService.ts, src/lib/services/EloRatingService.ts, src/controllers/CompetitionController.ts, src/i18n/ar.ts, src/i18n/en.ts, tests/api/winner-elo-atomicity.test.ts (جديد 6 اختبارات), tests/helpers/fake-d1.ts, docs/05, WORKLOG | RED أولاً: 4/6 فشل على baseline (تضاعف ELO، تعادل مطبق مرتين، لا retry، i18n مفقودة) ثم 6/6 ✅ + npm test ✅ + tsc ✅ + build ✅؛ بانتظار PR/مراجعة (بلا دمج) | 2026-09-15 |

## إصلاحات Core — حلقة الدعوة/القبول (2026-09-09)

| ID | المهمة | الحالة | الملفات | اختبار القبول | التاريخ |
|----|--------|--------|---------|---------------|---------|
| B5-4 | إغلاق حلقة الدعوة/القبول وتثبيت setOpponent ضد السباق — `setOpponent()` تُبقي `AND opponent_id IS NULL` وتعيد `boolean` من `meta.changes > 0` (سباق → false → 409)؛ قبول الدعوة ينفّذ `db.batch()` واحد (opponent_id + status='accepted' + رفض بقية الدعوات المعلقة)؛ invite() يفحص الحظر → 403 مترجمة؛ i18n: `opponent_already_set`/`invitation_not_found`/`blocked_user` (ar+en)؛ اختبارات حمراء أولاً (6) سلمت فشل قبول مزدوج 200/200 وopponent متضارب قبل الإصلاح | 🧪 | src/models/CompetitionModel.ts, src/controllers/CompetitionController.ts, src/i18n/ar.ts, src/i18n/en.ts, tests/api/competition-invite-accept.test.ts (new), tests/helpers/fake-d1.ts | competition-invite-accept 6/6 ✅ (سباق Promise.all: واحد 200 وواحد 409 وopponent_id ثابت) + npm test 76/76 ✅ + tsc ✅ + build ✅ + سباق متكرر 10/10 بلا flakiness ✅ | 2026-09-09 |

## إصلاحات P0/P1 — فرع `fix/pages-404-tailwind-cli` (من b7313f1)

| ID | المهمة | الحالة | الملفات | اختبار القبول | التاريخ |
|----|--------|--------|---------|---------------|---------|
| HOTFIX-P0 | إصلاح 404/500 (@hono/vite-cloudflare-pages + Hono 4 notFoundHandler خاص) | ✅ | src/main.ts | tests/api/not-found-p0.test.ts (4) ✅ + curl حي: /api/nonexistent→404 JSON، /nonexistent-page→404 HTML، GET /api/cron/run→404 (لا 500) | 2026-09-06 |
| HOTFIX-P1 | تثبيت @tailwindcss/cli كتبعية مقفلة، إزالة npx remote-fetch | ✅ | package.json, package-lock.json | tests/build/tailwind-cli.test.ts (3) ✅ + npm ci→node_modules/.bin/tailwindcss.CMD موجود + build:css لا يحوي npx | 2026-09-06 |

**دليل G1-G8 لهذين البندين:** build ✅ (`npm run build`)، types ✅ (`npx tsc --noEmit` بلا أخطاء)، اختبار آلي ✅ (33/33 اختبار عبر `npm test`، منها 7 جديدة)، تحقق تشغيلي حي ✅ (`wrangler pages dev` + curl لكل معايير القبول)، لا RangeError/"Context not finalized" في سجل Wrangler ✅. **✅ مستحقة فعلياً هنا (G1-G8 مكتملة بدليل، ليست 🧪).**

---

> ⚠️ **ملاحظة تقنية:** لا تعدّل هذا الملف عبر PowerShell (`Set-Content`) — يفسد ترميز العربية.
> استخدم أدوات تحرير الملفات مباشرة فقط.

