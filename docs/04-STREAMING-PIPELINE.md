# 04 — خط البثّ والفيديو (Streaming Pipeline)

> **حالة الوثيقة:** 🔧 **هيكل موثَّق من الكود، غير مكتمل.**
> كانت هذه الوثيقة مُشاراً إليها في المشروع وغير موجودة — أُنشئت الآن لتوثيق ما يفعله الكود **فعلاً**، مع تسمية الفجوات صراحةً بدل تركها مجهولة.
> **إكمالها من مهام المرحلة 4** في `docs/15-ROADMAP.md`.

---

## 1. المكوّنات

| المكوّن | الموقع | الدور |
|---|---|---|
| Signaling Worker | `STREAMING_URL` (Worker + Durable Object خارجي) | تبادل SDP/ICE بين الأطراف |
| Realtime DO | `workers/dueli-realtime/` | بثّ الأحداث اللحظية (WebSocket + Hibernation) |
| ffmpeg / Upload Server | `UPLOAD_URL` / `FFMPEG_SERVER_URL` | استقبال القطع، تجميع HLS، إنتاج VOD |
| Chunks API | `src/modules/api/chunks/routes.ts` | تسجيل مفاتيح القطع والتحقق منها والوكالة على الـplaylist |
| Signaling API | `src/modules/api/signaling/routes.ts` | إعداد الغرفة، ICE servers، التحقق من الأهلية |
| SSE fallback | `src/modules/api/sse/routes.ts` | بديل عند غياب WebSocket |

**التخزين:** `chunk_keys (competition_id, chunk_index, chunk_key UNIQUE)` — `migrations/0001`.

---

## 2. عقود الـendpoints (كما في الكود)

### Chunks API — `/api/chunks`

| Endpoint | الحماية الحالية | ملاحظة معمارية |
|---|---|---|
| `POST /register` | `authMiddleware({required:true})` ✅ | يولّد مفتاح القطعة — **بـ`Math.random()`** ⚠️ SEC-06 |
| `GET /verify` | `verifyUploadServerOrigin` ⚠️ | ترويسة `Origin` ليست مصادقة — SEC-03 |
| `DELETE /:key` | `verifyUploadServerOrigin` ⚠️ | **حذف فيديو بلا مصادقة خادمية** — SEC-03 |
| `GET /playlist/:id` | مفتوح | وكيل HLS لتجاوز CORS |

### Signaling API — `/api/signaling`

| Endpoint | الحماية | ملاحظة |
|---|---|---|
| `GET /ice-servers` | مفتوح | TURN من Cloudflare Calls؛ يسقط إلى STUN إن غابت المفاتيح |
| `GET /config` | مفتوح | يعيد `room_id` واسم خادم الإشارة |
| `POST /verify` | فحص جلسة داخل المعالج | يتحقق أن المستخدم منشئ أو خصم في المنافسة |
| `POST /room/create` | ⚠️ بلا وسيط | إنشاء غرفة على خادم البثّ |

---

## 3. التدفّق المقصود

```
1. المضيف يفتح صفحة المنافسة
2. GET  /api/signaling/config          → room_id + عنوان خادم الإشارة
3. POST /api/signaling/verify          → إثبات الأهلية (منشئ/خصم)
4. GET  /api/signaling/ice-servers     → STUN/TURN
5. POST /api/signaling/room/create     → إنشاء الغرفة
6. تبادل SDP/ICE عبر خادم الإشارة     → اتصال WebRTC نظير-لنظير
7. الأحداث اللحظية عبر Realtime DO (أو SSE fallback)
8. تسجيل القطع:
      POST /api/chunks/register        → مفتاح لكل قطعة
      الرفع إلى ffmpeg server          → تجميع HLS
      GET  /api/chunks/verify          (من الخادم) → تأكيد المفتاح
9. المشاهد يستهلك HLS عبر GET /api/chunks/playlist/:id
10. نهاية المنافسة → VOD قابل للمشاهدة
```

---

## 4. الفجوات المعروفة (لا تفترض عكسها)

كل بند فُحص في الكود. تسميتها صراحةً أفضل من وثيقة تُوهم الاكتمال.

| # | الفجوة | المرجع |
|---|---|---|
| S1 | **البثّ يتوقف بصمت بعد hibernation** — DO يبثّ من `Set` في الذاكرة تُمحى عند الإيقاظ | SEC-10 |
| S2 | مفاتيح القطع بـ`Math.random()` — قابلة للتنبؤ، بلا صلاحية زمنية، بلا ربط بالمستخدم | SEC-06 |
| S3 | `verify`/`delete` بترويسة `Origin` فقط + `startsWith` يسمح بـ`allowed.com.evil.net` | SEC-03 |
| S4 | `POST /room/create` بلا وسيط مصادقة | SEC-13 |
| S5 | لا استئناف للرفع (resumable) ولا checksum ولا منع تكرار القطع | المرحلة 4 |
| S6 | لا سياسة موثّقة لتخزين الفيديو وحذفه (retention) | المرحلة 4 / 9 |
| S7 | لا fallback معلَن عند توقف خادم ffmpeg | المرحلة 4 |
| S8 | TURN غير مُختبَر على شبكات الجوال وNAT الصعب | المرحلة 4 |
| S9 | لا مراقبة لحالات ICE ولا لجودة الاتصال | المرحلة 4 |
| S10 | SSE يستعلم D1 كل ثانيتين ⇒ ~43 مليون استعلام/يوم عند 1,000 متصل | SEC-14 |
| S11 | خادم ffmpeg خارج المستودع — لا عقد موثَّق ولا نسخة إصدار | المرحلة 4 |

---

## 5. متغيّرات البيئة

```bash
STREAMING_URL=""        # خادم الإشارة (Worker + DO)
UPLOAD_URL=""           # خادم ffmpeg
FFMPEG_SERVER_URL=""    # تجاوز اختياري لـ/api/chunks
TURN_TOKEN_ID=""        # Cloudflare Calls — غير سرّي
TURN_API_TOKEN=""       # سرّي — لا يُلتزَم به في git
UPLOAD_SERVER_ORIGINS="" # قائمة origins (تُستبدل بتوقيع HMAC في SEC-03)
```

بدون `TURN_*` يسقط `/api/signaling/ice-servers` إلى STUN فقط — أي فشل الاتصال خلف NAT متماثل (شائع في شبكات الجوال).

---

## 6. معيار قبول خطّ البثّ

من `docs/15-ROADMAP.md` المرحلة 5:

- [ ] مضيف + خصم + مشاهد على **أجهزة وشبكات مختلفة**
- [ ] بثّ بعد hibernation يصل لكل الاتصالات (يُغلق S1)
- [ ] إعادة اتصال بعد قطع الشبكة بلا تكرار ولا فقد حالة
- [ ] غرفتان متزامنتان معزولتان
- [ ] VOD قابل للمشاهدة بعد كل جلسة
- [ ] **20 جلسة متتالية** بلا فقد بثّ ولا توزيع أرباح مزدوج
- [ ] استعلامات D1 لكل اتصال انخفضت ≥ 80% (يُغلق S10)

---

## 7. ما يجب توثيقه لإكمال هذه الوثيقة

1. عقد خادم ffmpeg: endpoints، أشكال الطلب/الاستجابة، رموز الأخطاء، نسخة الإصدار.
2. مواصفة القطع: المدة، الترميز، معدل البت، التسمية.
3. سياسة الاحتفاظ والحذف: مدة بقاء VOD، من يحذف، ومتى.
4. مخطط تعافٍ: ماذا يرى المستخدم عند سقوط كل مكوّن.
5. أرقام السعة: أقصى مشاهدين متزامنين لكل غرفة، وأقصى غرف متزامنة.
