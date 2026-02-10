# 🤖 وكيل 5: توثيق Client (Client Agent)
# Agent 5: Client Documentation

**النموذج المقترح:** Giga Potato (مناسب للـ client-side code)

---

## 📁 مهمتك

توثيق كل ملفات `src/client/`.

**المسار:** `d:/projects/opus-dueli/webapp/src/client/`

**الملفات (25+ ملف):**
```
src/client/
├── core/
│   ├── ApiClient.ts         ← ⚠️ مهم - HTTP client
│   ├── CookieUtils.ts
│   ├── index.ts
│   └── State.ts             ← ⚠️ مهم - State management
├── helpers/
│   ├── DateFormatter.ts
│   ├── index.ts
│   ├── InfiniteScroll.ts
│   ├── LiveSearch.ts
│   ├── NumberFormatter.ts
│   ├── RecommendationEngine.ts ← ⚠️ مهم
│   ├── Utils.ts
│   └── YouTubeHelpers.ts
├── index.ts
├── pages/HomePage.ts
└── services/
    ├── AuthService.ts
    ├── ChunkPlayer.ts        ← ⚠️ مهم - Streaming
    ├── ChunkUploader.ts      ← ⚠️ مهم - Streaming
    ├── CompetitionService.ts ← ⚠️ مهم
    ├── index.ts
    ├── InteractionService.ts
    ├── LiveRoom.ts           ← ⚠️ مهم - Live streaming
    ├── MessagingService.ts
    ├── P2PConnection.ts      ← ⚠️ مهم جداً - WebRTC
    ├── SearchService.ts
    ├── SettingsService.ts
    └── ThemeService.ts
└── ui/
    ├── index.ts
    ├── InteractionsUI.ts
    ├── Menu.ts
    ├── MessagesUI.ts
    ├── MessagingUI.ts
    ├── Modal.ts
    ├── NotificationsUI.ts
    ├── ScheduleUI.ts
    ├── SettingsUI.ts
    └── Toast.ts
```

---

## 📝 تنسيق التوثيق

### للـ Services:

```markdown
## الملف: [المسار]

### النوع
Service | Helper | Core | UI Component

### الغرض
[شرح]

### الـ Exports الرئيسية
| الاسم | النوع | الغرض |
|-------|-------|-------|
| AuthService | class | إدارة المصادقة |

### الـ Methods العامة
| الاسم | Parameters | Return | الغرض |
|-------|-----------|--------|-------|
| login | credentials | Promise<User> | تسجيل الدخول |

### الـ Dependencies
- يستدعي: [files/services]
- يُستدعى من: [files/services]

### الـ Event Listeners
- [event] → [handler]

### الـ API Calls للـ Backend
| الـ Endpoint | Method | الغرض |
|------------|--------|-------|
| /api/auth/login | POST | تسجيل الدخول |
```

### للـ UI Components:

```markdown
## الملف: [المسار]

### الغرض
[نوع الـ UI component]

### الـ Methods الرئيسية
| الاسم | الغرض |
|-------|-------|
| show | عرض الـ modal |
| hide | إخفاء الـ modal |

### الـ Event Handlers
- [click, submit, etc.]

### الـ HTML Structure
```html
<div class="modal">...</div>
```
```

---

## 📤 مكان إخراج النتيجة

**أنشئ ملف:** `d:/projects/opus-dueli/webapp/.blackbox/docs/07-client-documentation.md`

---

## ⏱️ الوقت المتوقع

**6-8 ساعات**.

---

## ✅ قائمة التحقق

- [ ] وثقت كل service بالتفصيل
- [ ] وثقت كل UI component
- [ ] حددت الـ dependencies
- [ ] سجلت الـ API calls
- [ ] أنشأت ملف `07-client-documentation.md`

---

**ابدأ فوراً.**
