# 07 — دليل الانضمام (Onboarding)

## الإقلاع السريع

```bash
npm install
cp .dev.vars.example .dev.vars   # ثم املأ القيم (لا تلتزم .dev.vars أبداً)
npm run db:migrate:local && npm run db:seed
npm run build
npm run dev:sandbox              # محلي مع D1 المحلية على :5173
npm test                         # vitest — يجب أن يكون أخضر
```

## متغيرات البيئة

| المتغير | سري؟ | الغرض | بدونها ماذا يحدث؟ |
|---------|------|-------|-------------------|
| `EMAIL_API_URL` / `EMAIL_API_KEY` / `EMAIL_FROM` | الثانية سرية | إرسال التفعيل/الاستعادة عبر PHP على استضافتك | التسجيل **ينجح** مع `warning: email_not_configured` + زر "إعادة الإرسال" (لا 500 بعد الإصلاح) |
| `TURN_TOKEN_ID` / `TURN_API_TOKEN` | الثانية سرية | بيانات Cloudflare Calls TURN | `/api/signaling/ice-servers` يرجع **STUN-only** — البث يفشل خلف NAT |
| `STREAMING_URL` | لا | سيرفر الإشارة (Worker+DO) | الافتراضي `DEFAULT_STREAMING_URL` |
| `UPLOAD_URL` / `FFMPEG_SERVER_URL` | لا | رفع القطع والـ finalize | الافتراضي `maelshpro.com/ffmpeg` |
| OAuth (`GOOGLE_*`, `FACEBOOK_*`, `MICROSOFT_*`, `TIKTOK_*`) | سرية | الدخول الاجتماعي | أزرار الدخول تفشل فقط |
| `STRIPE_*` | سرية | التبرعات/webhook | التبرعات معطلة فقط |
| `CRON_SECRET` | سرية | حماية `/api/cron/*` | طلبات cron تُرفض بـ 503 |
| `CLOUDFLARE_API_TOKEN` | سرية | عمليات Cloudflare | — |

## Preview مقابل Production (سبب عطليك)

Cloudflare Pages لديها **مجموعتا متغيرات منفصلتان**: Preview وProduction.
العطلان اللذان ضربا رابط Preview كانا لهذا السبب بالذات:

1. **عطل التسجيل/البروفايل**: متغيرات `EMAIL_*` لم تكن مضبوطة على Preview،
   والكود القديم كان يرجع `500 Server configuration error` **قبل** إنشاء
   المستخدم. وفوق ذلك صفحة `/profile/:username` كانت تعمل `self-fetch`
   (`fetch(origin/api/users/...)`) من داخل الـ Worker — وهو ما ينكسر على
   Preview (subrequest بدون سياق). الإصلاح: استعلام D1 مباشر
   (`UserModel.findByUsername`) + إنشاء المستخدم أولاً ثم تحذير
   `email_not_configured` مع زر يستدعي `POST /api/auth/resend-verification`.
2. **عطل الكاميرا**: `TURN_*` مضبوطة على Production فقط → الـ Preview كان
   STUN-only. لا تضع القيم الحقيقية في الكود أبداً؛ اضبطها في:
   داشبورد Cloudflare → Pages → مشروعك → Settings → Environment variables
   → **اختر Preview وProduction معاً** ثم أعد النشر.

## عادات يومية

- سجلات التصحيح: `localStorage.setItem('dueli_debug','1')` في DevTools —
  كل `debugLog()` (البث، `VideoCompositor`، `ChunkUploader`، `P2PConnection`)
  يظهر فقط عندها. `console.error` للأخطاء الحقيقية دائماً.
- POST خارج المتصفح (curl/SDK): أضف `-H "X-CSRF-Token: 1"` وإلا رُفض بـ 403
  (انظر `docs/08-PUBLIC-API.md`).
- ترحيل جديد؟ انسخ نمط 0012 (إعادة بناء آمنة عند مساس CHECK) وحدّث
  `docs/02-DATABASE.md`.
- قبل الدفع: `npm run build` + `npm test`.
