# fix(core): polish RTL dark mode and mobile layout (B15)

## النتيجة للمستخدم
واجهة مسار Beta تعمل بالعربية RTL والإنجليزية LTR، ليلاً ونهاراً، وعلى الجوال —
بلا إعادة تصميم وبلا تغيير API/DB.

## ما تغيّر (ملف → سبب)
- `src/styles.css`: `body.dark` لـ`badge-live`/`badge-pending`/`tab-inactive`؛
  `overflow-x: clip` على `html,body` (يحفظ `sticky nav`)؛ `.dropdown-panel`
  بـ`max-width: calc(100vw - 2rem)`.
- `src/shared/components/navigation.ts`: إزالة `scale-x-[-1]` المحظور من زر
  الدخول (أيقونة `fa-sign-in-alt` محايدة) + فئة `dropdown-panel` على القوائم.
- `src/shared/components/user-card.ts`: فئات Tailwind ثابتة (`-left-1`/`-right-1`,
  `left-0`/`right-0`) بدل البناء الديناميكي الذي لا يراه JIT.
- `src/shared/components/competition-card.ts`: `me-1` بدل `mr-1`.
- `src/shared/components/competition-section.ts`: `t('previous'/'next')`
  للـaria-labels + أسهم ظاهرة على اللمس (`max-sm:opacity-100`).
- `src/modules/pages/competition-page.ts` + `create-page.ts`: `me-*` المنطقية
  بدل `mr-*/ml-*` الفيزيائية.
- `src/i18n/ar.ts` + `en.ts`: مفتاحا `previous`/`next` فقط (B15 بلا migration).
- `tests/ui/rtl-dark-mobile.test.ts` (جديد، 14): RTL/LTR + dark + mobile + i18n.
- `PLAN-STATUS.md` + `WORKLOG.md`: توثيق B15.

## مشاكل وجدت فعلاً
- RTL: `scale-x-[-1]` على زر الدخول؛ هوامش `mr/ml` لا تنعكس؛ فئات JIT
  ديناميكية ميتة؛ `aria-label` حرفية للإنجليزية.
- Dark: `badge-live`/`badge-pending`/`tab-inactive` بلا متغير داكن.
- Mobile: لا حارس `overflow-x`؛ قوائم `w-80` تتجاوز viewport؛ أسهم
  الكاروسيل hover-only.

## الاختبار الأحمر
`tests/ui/rtl-dark-mobile.test.ts` سُلّم أحمر أولاً: 6 فشل / 6 نجاح على
baseline، ثم 14/14 ✅ بعد الإصلاح (حساسية مثبتة، لا فشل مصطنع).

## التحقق
- B15: 14/14 ✅ · `npm test`: 73 suites / 188/188 ✅ · `npx tsc --noEmit`: ✅
  بلا مخرج · `npm run build`: ✅ (188 modules, `_worker.js` 926kB).
- LTR لم ينكسر (اختبارات en/the مقابل ar) · لا dependencies جديدة ·
  لا API/models/services/migrations.

## خارج النطاق (لم يُلمس)
`live/core.ts` + `live/scripts/client/shared.ts` (شارات VOD — البث مجمّد)؛
`|| 'English'` fallbacks (مهمة i18n المرحلة 8)؛ ternaries `ml/mr` في
التقارير/التبرعات (صفحات مجمّدة).

## التراجع
دفعة عكسية واحدة للكوميت (تغيير واجهة فقط، بلا مخطط).
