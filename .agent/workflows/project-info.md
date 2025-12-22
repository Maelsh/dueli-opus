---
description: معلومات مهمة للمشروع - لا تنساها!
---

# 🔴 معلومات Dueli المهمة - راجعها دائماً!

## عن المشروع
- **الاسم**: Dueli - منصة المناظرات والحوارات الحية
- **الوصف**: منصة عربية-إنجليزية للمناظرات والبث المباشر بين اثنين
- **المطور**: Maelsh Pro (maelsh.pro)
- **الحالة**: قرب الإطلاق التجريبي (Beta)

---

## ⚠️ المبادئ الإجبارية (من MANDATORY_Guidelines.md)

### 1️⃣ دعم اللغات العالمي
- **كل نص يظهر للمستخدم يجب أن يكون عبر i18n**
- استخدم `t('key', lang)` أو `tr.key`
- أضف المفاتيح في `src/i18n/en.ts` و `src/i18n/ar.ts`

### 2️⃣ البرمجة الكائنية (OOP)
- كل منطق في Classes
- استخدم الوراثة: `extends BaseController`, `extends BaseModel`

### 3️⃣ هيكلة MVC
- **Model**: قاعدة البيانات فقط (src/models/)
- **View**: المكونات المشتركة (src/shared/components/)
- **Controller**: معالجة الطلبات (src/controllers/, src/modules/pages/)

### 4️⃣ إمكانية الوصول (Accessibility)
- كل `<label>` يجب أن يكون له `for="inputId"`
- كل `<button>` يجب أن يكون له `title`
- أزرار الأيقونات تحتاج `aria-label` و `.sr-only`

### 5️⃣ التنسيق المزدوج (Dark/Light Mode)
- كل `bg-*` يرافقه `dark:bg-*`
- كل `text-*` يرافقه `dark:text-*`

---

## 🔧 التقنيات
| التقنية | الاستخدام |
|---------|-----------|
| **Runtime** | Cloudflare Workers (Edge) |
| **Database** | Cloudflare D1 (SQLite) |
| **Framework** | Hono 4.x |
| **Frontend** | Vanilla TypeScript + TailwindCSS 4.x |
| **Build** | Vite + esbuild |
| **بدون ORM** | D1 مباشر عبر BaseModel |

---

## 🌐 روابط المنصة

| البيئة | الرابط |
|--------|--------|
| **الموقع المنشور** | `https://project-8e7c178d.pages.dev` |
| **Demo (README)** | `https://dueli.pages.dev` |

---

## 👤 بيانات الاختبار
```
Host:     host@test.dueli / TestHost123!
Opponent: opponent@test.dueli / TestOppo123!
```

---

## 🎬 سيرفر البث (FFmpeg)
- **URL**: `https://maelsh.pro/ffmpeg`
- **upload.php**: استقبال قطع الفيديو
- **finalize.php**: تجميع القطع في فيديو واحد
- **مسار HLS**: `/storage/live/match_{id}/playlist.m3u8`

---

## 📡 Signaling API (للـ WebRTC)

| الـ Endpoint | الغرض |
|--------------|-------|
| `POST /api/signaling/room/create` | إنشاء غرفة |
| `POST /api/signaling/room/join` | انضمام لغرفة (role: host/opponent/viewer) |
| `POST /api/signaling/signal` | إرسال إشارة (offer/answer/ice-candidate) |
| `GET /api/signaling/poll?room_id=X&role=host` | استقبال إشارات |
| `POST /api/signaling/room/leave` | مغادرة |
| `POST /api/signaling/room/reset` | إعادة تعيين (للاختبار) |
| `GET /api/signaling/room/:id/status` | حالة الغرفة |
| `GET /api/signaling/ice-servers` | سيرفرات STUN/TURN |

---

## 🗄️ قاعدة البيانات

### الإعدادات
- **Database Name**: dueli-db
- **Database ID**: f877f573-e31f-452a-8991-8e5035539d56

### جداول Signaling (0003_signaling_tables.sql)
```sql
signaling_rooms (id, competition_id, host_user_id, opponent_user_id, viewer_count, ...)
signaling_signals (id, room_id, target_role, signal_type, signal_data, consumed, ...)
```

---

## 📝 أوامر التطوير

```bash
# تشغيل محلي
npm run dev:sandbox

# بناء كامل
npm run build

# نشر
git push  # (Pages متصل بـ GitHub تلقائياً)
# أو يدوياً:
npx wrangler pages deploy dist

# قاعدة البيانات
npm run db:migrate:local  # تطبيق migrations
npm run db:seed           # بيانات تجريبية
npm run db:reset          # إعادة تعيين كاملة
```

---

## 📁 ملفات مهمة

### صفحات الاختبار (أنشأناها حديثاً)
- `src/modules/pages/test-stream-page.ts`
  - `/test/host` - الطرف الأول
  - `/test/guest` - الطرف الثاني
  - `/test/viewer` - المشاهد

### البث المباشر
- `src/modules/pages/live-room-page.ts` - صفحة البث الكاملة
- `src/modules/pages/competition-page.ts` - صفحة المنافسة (البث مدمج)
- `src/client/services/P2PConnection.ts` - منطق WebRTC
- `src/client/services/VideoCompositor.ts` - دمج الفيديوهات
- `src/client/services/ChunkUploader.ts` - رفع القطع للسيرفر
- `src/modules/api/signaling/routes.ts` - API الإشارات

### i18n
- `src/i18n/en.ts` - الإنجليزية (~500 مفتاح)
- `src/i18n/ar.ts` - العربية (~500 مفتاح)

### الهيكلة
- `src/main.ts` - نقطة الدخول الرئيسية
- `src/models/base/BaseModel.ts` - قاعدة الـ Models
- `src/controllers/base/BaseController.ts` - قاعدة الـ Controllers

---

## 🚨 المشاكل الحالية (من implementation_plan.md)

### عاجلة:
- [ ] بعض الصور لا تظهر في الرئيسية
- [ ] صورة البروفايل ثابتة بعد تسجيل الدخول
- [ ] زر "تحميل المزيد" لا يعمل
- [ ] تصميم كارت المستخدم

### البث المباشر:
- [x] دمج البث في صفحة المنافسة ✅
- [x] صفحات اختبار مستقلة ✅
- [ ] اختبار WebRTC بين طرفين ← **نحن هنا الآن!**
- [ ] اختبار إرسال chunks للسيرفر
- [ ] اختبار finalize وتجميع الفيديو

---

## 🔍 خطوات الاختبار الحالية

1. افتح: `https://project-8e7c178d.pages.dev/test/host`
2. اضغط "مشاركة الشاشة" ثم "اتصال"
3. من متصفح آخر افتح: `/test/guest`
4. اضغط "مشاركة الشاشة" ثم "الانضمام"
5. يجب أن ترى كل طرف شاشة الآخر

---

## 📚 الوثائق المهمة

| الملف | المحتوى |
|-------|---------|
| `docs/wiki/MANDATORY_Guidelines.md` | قواعد إلزامية للمطورين |
| `docs/wiki/Code_Violations_Report.md` | تقرير المخالفات |
| `docs/wiki/Architecture.md` | الهيكلة العامة |
| `docs/wiki/API_Reference.md` | مرجع الـ APIs |
| `docs/wiki/Database.md` | مخطط قاعدة البيانات |
| `.agent/implementation_plan.md` | خطة التنفيذ الحالية |
| `.agent/workflows/test-stream.md` | خطوات اختبار البث |

---

*آخر تحديث: 2025-12-22*
