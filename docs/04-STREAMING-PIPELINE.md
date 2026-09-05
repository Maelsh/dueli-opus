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

### 2. ICE/TURN (`GET /api/signaling/ice-servers`)
- `fetchCloudflareIceServers()` تطلب بيانات اعتماد قصيرة العمر (TTL 24h)
  من Cloudflare Calls وتخزنها في Cache API ~6h.
- **بدون `TURN_TOKEN_ID` + `TURN_API_TOKEN`**: رجوع STUN-only
  (Google + Cloudflare STUN) — يعمل على الشبكات المفتوحة ويفشل غالباً
  خلف symmetric NAT. هذا سبب عطل "الكاميرا لا تعمل" على Preview.
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
