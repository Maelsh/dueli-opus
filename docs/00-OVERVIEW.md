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

## نقاط دخول رئيسية
- السيرفر: `src/main.ts`
- المسارات: `src/modules/api/*/routes.ts`
- العميل: `src/client/index.ts`
- الصفحات: `src/modules/pages/`
