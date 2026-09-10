## B5-2 — تعريب رسائل أخطاء المنافسة المتبقية

المستخدم العربي لم يعد يرى رسائل خطأ إنجليزية خام في صفحة المنافسة.

### التغييرات
- **i18n** (`ar.ts` + `en.ts`): 11 مفتاحاً جديداً تحت `competition_errors` مترجمة ar+en
- **CompetitionController.ts**: استبدال 10 نصوص حرفية بـ `this.t('competition_errors.<key>', c)` — لا تغيير في رموز HTTP أو شكل الاستجابة
- **fake-d1.ts**: إصلاح خلل بناء (if-block مكرر بلا إغلاق كان يسبب خطأ esbuild)
- **tests/api/competition-errors-i18n.test.ts** (جديد): 5 اختبارات — ar+en لكل من مساري no_opponent و vod_url_required + حارس انحدار يثبت زوال النصوص الحرفية

### التحقق
- `npm test`: 75/75 ✅ (5 جديدة)
- `npx tsc --noEmit`: نظيف ✅
- `npm run build`: ناجح ✅
- النطاق محصور بـ CompetitionController + i18n + tests — لا متحكمات مال/إعلانات

### ملاحظة
وسيط اللغة في `main.ts` يقرأ `?lang=` أو Cookie فقط (لا يقرأ `Accept-Language`) — لذا تمرر اللغة في الاختبارات عبر `?lang=` لتعكس السلوك الحقيقي.
