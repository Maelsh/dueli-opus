# 06 — دعم اللغات في Dueli (i18n)

> الهدف: **منصة عالمية** — إضافة لغة جديدة لا تتطلب أي تعديل في منطق المنصة.

## البنية

| الملف | الدور |
|-------|-------|
| `src/i18n/languages.ts` | السجل المركزي: الكود، الاسم الأصلي، الاتجاه (RTL/LTR)، التفعيل |
| `src/i18n/<code>.ts` | حزمة الترجمة (نفس شكل ar.ts/en.ts) |
| `src/i18n/index.ts` | المحرك: `t()` مع سقوط تلقائي للإنجليزية + `registerLanguage()` |

## قواعد ملزمة للمطورين

1. يُمنع أي نص ظاهر للمستخدم خارج `t()` / `translations` — لا استثناءات.
2. كل مفتاح جديد يدخل `ar.ts` و`en.ts` معاً في نفس المهمة.
3. النصوص تُجمع تحت كائنات فرعية مترابطة (`matchmaking.*`, `sse.*`).
4. الاتجاه لا يُكتب يدوياً — `isRTL(lang)/getDir(lang)` يشتقان من السجل.

## ➕ كيف تضيف لغة جديدة (مثال: الفرنسية)

```
1. src/i18n/fr.ts        → export const fr = { ...same keys as en.ts... };
2. src/i18n/languages.ts → أضف: { code:'fr', nativeName:'Français', dir:'ltr', enabled:true }
3. src/i18n/index.ts     → import { fr } from './fr'; registerLanguage('fr', fr);
4. انتهى. القائمة، الاتجاه، والسقوط للإنجليزية تعمل تلقائياً.
```

## آليات السقوط (Fallback)

1. مفتاح غير موجود في اللغة الحالية → الإنجليزية.
2. لغة بلا حزمة محمّلة → الإنجليزية (`getUILanguage`).
3. اسم عنصر (تصنيف/دولة) → `name_key` ثم slug ثم `name_<lang>` ثم `name_en` ثم أي متاح.

## أولوية كشف اللغة (main.ts)

رابط URL `?lang=` ← كوكي `lang` ← الافتراضية (en).
تسجيل المستخدم يحفظ تفضيله من جهازه أو حسابه ويُطبق عند الدخول.

## حالة RTL/LTR في الواجهة

- الخادم: `generateHTML(content, lang, title)` يضبط `<html dir>`.
- العميل: `State.lang` + صنافرات Tailwind المنطقية (`ms-`, `me-`, `ps-`, `border-s-`) بدل left/right.
