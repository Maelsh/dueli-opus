# 08 — واجهة برمجة التطبيقات العامة (Public API)

> ملاحظة للمطورين الخارجيين: هذه النقاط مستقرة وتُصمم للتكامل العام.
> المصدر الكامل: `docs/03-API-REFERENCE.md` (الداخلي).

## الأساسيات

- **Base URL:** `https://dueli.maelshpro.com`
- **الصيغة:** JSON في كل الاستجابات: `{ success: boolean, data?: ..., error?... }`
- **اللغة:** أضف `?lang=ar|en|<code>` لأي نقطة لرسائل مترجمة
- **المصادقة:** رأس `Authorization: Bearer <sessionId>` — الجلسة تُنشأ من `/api/auth/login` أو OAuth

## نقاط القراءة العامة (بلا مصادقة)

| الطريقة | المسار | الوصف |
|---------|--------|-------|
| GET | `/api/categories` | التصنيفات والتصنيفات الفرعية |
| GET | `/api/countries` | الدول واللغات |
| GET | `/api/competitions?status=live\|recorded\|upcoming&limit=&offset=` | قوائم المنافسات |
| GET | `/api/competitions/:id` | تفاصيل منافسة (تعليقات، مؤقت، تقييمات) |
| GET | `/api/search?q=&type=` | بحث شامل |
| GET | `/api/leaderboard` | لوحة المتصدرين حسب ELO |
| GET | `/api/donations/top-supporters` | أعلى الداعمين |
| GET | `/api/transparency` | السجل المالي الشفاف |
| GET | `/api/chunks/playlist/:id` | قائمة قطع تسجيل منافسة (VOD) |

## نقاط المستخدم الموثق

| الطريقة | المسار | الوصف |
|---------|--------|-------|
| POST | `/api/auth/register` → تحقق بالبريد | إنشاء حساب |
| POST | `/api/auth/login` | دخول بالبريد (حسابات OAuth ترجع إرشاداً) |
| GET | `/api/auth/oauth/:provider` | دخول Google/Microsoft/Facebook |
| POST | `/api/competitions` | إنشاء منافسة |
| POST | `/api/competitions/:id/join` | طلب انضمام |
| POST | `/api/competitions/:id/rate` | تقييم منافس (1–5) بعد الاكتمال |
| POST | `/api/competitions/:id/comments` | تعليق (`parent_id` للرد) |
| GET/POST | `/api/matchmaking/*` | من يصلح للدعوة + نبضات الحضور |
| POST | `/api/settings/posts` | نشر منشور على البروفايل |

## الأحداث اللحظية (Realtime)

```
GET /api/sse?channel=user:<id>&token=<session>     # إشعارات شخصية (SSE)
GET /api/sse?channel=competition:<id>              # تغذية تعليقات بث حي
```

أنواع الأحداث: `invite_sent`, `invite_accepted`, `invite_declined`,
`notification`, `withdrawal_status`, `comment_new`, `competition_suspended`.

> عند تمكين Durable Objects (T5.1): نفس القنوات عبر
> `wss://dueli-realtime.<subdomain>.workers.dev/ws?channel=...&token=...`

## Webhooks (من الشركاء)

| المسار | الغرض | الحماية |
|--------|-------|---------|
| POST | `/api/donations/webhook` | توقيع Stripe (`Stripe-Signature`) + نافذة زمنية 5 دقائق |

## حدود الاستخدام

Rate limiting مطبق على نقاط الكتابة الحساسة. للمشاركة في تشكيل حدود عامة
للمطورين تواصل عبر info@maelshpro.com.
