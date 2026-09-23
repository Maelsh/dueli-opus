# 04 — خط البث (Streaming Pipeline)

> من الضغط على "ابدأ البث" إلى فيديو VOD قابل لإعادة المشاهدة.

## الخريطة الكاملة

```
┌──────────┐  join/create/verify   ┌─────────────────────────┐
│  Pages   │ ────────────────────▶ │ Signaling Worker + DO   │
│ (Hono)   │  POST /api/signaling  │ signaling-server.*      │
│          │  /room/create,        │ (repo منفصل، HTTP-poll)  │
│  /live/  │  /verify ──────────┐  └─────────────────────────┘
│  :id     │                    │               │
└──────────┘                    │               │ poll/signal
     │ GET /api/signaling/      │               ▼
     │ ice-servers              │  ┌────────────────────────┐
     │ (TURN/STUN)              │  │ P2P WebRTC             │
     │                          │  │ host ⇄ opponent        │
     │ Cloudflare Calls         │  │ viewers: HLS/chunks    │
     │ rtc.live.cloudflare.com  │  └────────────────────────┘
     │ (TURN_TOKEN_ID +                  │ MediaRecorder
     │  TURN_API_TOKEN)                  ▼
     │                          │ VideoCompositor (canvas)  │
     │                          │ → 5s chunks (mp4/webm)    │
     │                          │ → ChunkUploader           │
     │                          │ → POST /api/chunks        │
     │                          └────────────────────────┘
                                                  │
                                                  ▼
                                   ┌────────────────────────┐
                                   │ ffmpeg server          │
                                   │ maelshpro.com/ffmpeg   │
                                   │ /finalize.php → VOD    │
                                   │ match_<id>.mp4         │
                                   └────────────────────────┘
                                                  │
                                                  ▼
                                   ┌────────────────────────┐
                                   │ POST /api/competitions │
                                   │ /:id/end {vod_url}     │
                                   │ status → recorded      │
                                   └────────────────────────┘
```

## المراحل بالتفصيل

### 1. الإشارة (Signaling: Worker + Durable Object)
- السيرفر في repo منفصل (`signaling-server`) — الـ Pages لا يستضيفه.
- الـ Pages دورها: `POST /api/signaling/room/create` (تحويل للسيرفر)،
  `POST /api/signaling/verify` (تحقق الجلسة + الدور host/opponent)،
  `GET /api/signaling/config` (اكتشاف الإعدادات).
- العميل (`live/scripts/client/{host,guest,viewer,shared}.ts`) يعمل
  polling عبر `SignalingManager` — لا WebSocket في هذا الإصدار.
- سجلات `[DEBUG]` في هذه الملفات تمر عبر `debugLog()` المشروط
  (`localStorage.setItem('dueli_debug','1')` لتفعيلها).

### 2. ICE/TURN (`GET /api/signaling/ice-servers`) — 7.D
- المسار محمي بالمصادقة (401 لغير المصادق) ويعيد اعتمادات TURN مؤقتة
  قصيرة العمر (TTL 3600s) مُولَّدة خادمياً **لكل جلسة** — لا سر ثابت مشترك
  ولا cache مشترك. المرجع: `TurnCredentialService`.
- **الخلفيات (env فقط — لا قيم حقيقية في المستودع):**
  - `TURN_URL` + `TURN_SECRET` → coturn ذاتي الاستضافة (اعتمادات HMAC-SHA1
    ephemeral بصيغة `username = <expiry>:<userId>`)، مع نسخة `transport=tcp`
    تلقائية للشبكات المقيّدة.
  - `TURN_TOKEN_ID` + `TURN_API_TOKEN` → Cloudflare Calls (طلب لكل جلسة).
- **بدون أي خلفية**: رجوع STUN-only (`turn_available: false`) — يعمل على
  الشبكات المفتوحة ويفشل غالباً خلف symmetric NAT.
- **فشل خلفية TURN**: 502 مع رسالة مترجمة `live.turn_unavailable` (والعميل
  يعرض `live.network_restricted` ويرجع STUN — لا شاشة سوداء).
- `Permissions-Policy` يجب أن يسمح: `camera=(self), microphone=(self)`
  (`src/middleware/security.ts`) — القيمة `camera=()` كانت تمنع البث تماماً.

### 3. P2P (`P2PConnection`)
- نسختان: `src/client/services/P2PConnection.ts` (المستخدمة فعلياً عبر
  `src/client/index.ts`) و`src/lib/services/P2PConnection.ts` (legacy غير
  مستوردة — أُبقيت للتوافق).
- الأدوار: `host` (ينشئ offer) / `opponent` (يرد answer) / `viewer` (مشاهدة).
- السجلات الإنتاجية خُفضت إلى `debugLog()` المشروط؛ `console.error` فقط
  للأخطاء الحقيقية.

### 4. القطع والرفع (Chunks → VOD)
- `VideoCompositor`: يدمج البثين على canvas (1280×480)، يختار mp4 إن أمكن
  (WebM لا يعمل على Safari/iPhone — يُنصح Chrome/Edge للاستضافة)،
  ويقطع كل **5 ثوانٍ**.
- `ChunkUploader`: مزامنة وقت → `POST /api/chunks` لكل قطعة →
  `finalize` عند الإنهاء (`endStream()` تستدعي `/finalize.php` ثم
  `/api/competitions/:id/end` مع `vod_url`).
- التشغيل اللاحق: `GET /api/chunks/playlist/:id`.

## الأعطال المعروفة وحلولها
| العرض | السبب | الحل |
|-------|-------|------|
| كاميرا سوداء / فشل اتصال خلف NAT | TURN غير مضبوط (STUN-only) | ضبط `TURN_TOKEN_ID` + `TURN_API_TOKEN` في داشبورد Cloudflare (Preview **و** Production) |
| الكاميرا ممنوعة في كل المتصفحات | `Permissions-Policy: camera=()` | القيمة الحالية `(self)` — لا ترجعها لـ `()` |
| VOD غير موجود بعد البث | `finalize` لم يُستدعَ | `endStream()` يجب أن تكمل قبل إغلاق الصفحة |

## D1 — حالة Realtime (مغلقة توثيقياً، 2026-09-23)

- **مسار الإنتاج الحالي هو SSE/polling فقط** (`GET /api/sse` بفاصل 10 ثوانٍ عبر
  `SseEventLogModel` + `EventPusher`). لا يوجد WebSocket production flow فعلي.
- **`workers/dueli-realtime` (Durable Objects) ليس جزءاً من production path**:
  مكوّن اختياري لمستقبل التوسع فقط. `REALTIME_WS_URL` غير مضبوط في أي بيئة،
  و`EventPusher` لا يوجّه فعلياً (fire-and-forget بشرط الضبط)، وفرع WebSocket في
  `SseService` خامل (يسقط تلقائياً إلى SSE).
- **لا حاجة حالية إلى**: deployment للـWorker، أو `REALTIME_PUBLISH_SECRET`، أو
  تفعيل WebSocket، أو أي إعداد Durable Objects إنتاجي. لا تنشر Worker لإغلاق D1.
- **لا تحذف الـWorker ولا تعِد تصميم realtime** — الكود يبقى كمسار مستقبلي سليم
  (مصادقة التذاكر C4 مطبقة فيه مسبقاً).
- **إعادة الفتح فقط عند حاجة تشغيلية مثبتة** (مثل تجاوز حدود D1 المقاسة باختبار
  حمل، أو تدهور SSE موثق) — وليس افتراضياً.
