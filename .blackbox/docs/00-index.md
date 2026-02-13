# 📚 فهرس توثيق مشروع Dueli
# Dueli Project Documentation Index

**تاريخ الإنشاء:** 2026-02-10  
**الوكلاء المشاركون:** 7 وكلاء (Minimax, Grok, GLM, Pony, Giga, Arcee, Gemini)

---

## 📁 هيكل التوثيق

```
.blackbox/docs/
├── 00-index.md                    ← أنت هنا (الفهرس)
├── 03-models-documentation.md     ← وكيل 1: الموديلز (15 ملف)
├── 04-controllers-documentation.md ← وكيل 2: الكنترولرز (12 ملف)
├── 05-pages-documentation.md      ← وكيل 3: الصفحات (20+ ملف)
├── 06-api-routes-documentation.md ← وكيل 4: API Routes (20+ ملف)
├── 07-client-documentation.md       ← وكيل 5: Client (25+ ملف)
├── 08-lib-config-documentation.md ← وكيل 6: Lib & Config (25+ ملف)
├── 09-shared-routes-documentation.md ← وكيل 7: Shared & Routes (15+ ملف)
└── 10-SRS-Software-Requirements-Specification.md ← مواصفات المتطلبات (SRS)
```


---

## 📊 ملخص التوثيق

| الوثيقة | الوكيل | الملفات | الحالة |
|---------|--------|---------|--------|
| [03-models](03-models-documentation.md) | Minimax M2.1 | 15 ملف | ✅ مكتمل |
| [04-controllers](04-controllers-documentation.md) | Grok Code Fast | 12 ملف | ✅ مكتمل |
| [05-pages](05-pages-documentation.md) | Z.AI: GLM 4.7 | 20+ ملف | ✅ مكتمل |
| [06-api-routes](06-api-routes-documentation.md) | Pony Alpha | 20+ ملف | ✅ مكتمل |
| [07-client](07-client-documentation.md) | Giga Potato | 25+ ملف | ✅ مكتمل |
| [08-lib-config](08-lib-config-documentation.md) | Arcee AI: Trinity | 25+ ملف | ✅ مكتمل |
| [09-shared-routes](09-shared-routes-documentation.md) | Gemini 3 Flash | 15+ ملف | ✅ مكتمل |
| [10-SRS](10-SRS-Software-Requirements-Specification.md) | Blackbox | SRS كامل | ✅ مكتمل |

**المجموع:** 8 وثائق | ~132 ملف + SRS | **الحالة: مكتملة بالكامل** ✅


---

## 🎯 محتوى كل وثيقة

### 03 - Models Documentation
- BaseModel (الأساس)
- AdvertisementModel & EarningsModel
- CategoryModel
- CommentModel
- CompetitionModel (قلب المنصة)
- LikeModel
- MessageModel & ConversationModel
- NotificationModel
- ReportModel
- ScheduleModel
- SearchModel
- SessionModel
- UserModel
- UserSettingsModel & UserPostModel

### 04 - Controllers Documentation
- BaseController (الأساس)
- AdminController
- AuthController
- CategoryController
- CompetitionController (قلب المنصة)
- InteractionController
- MessageController
- ScheduleController
- SearchController
- SettingsController
- UserController

### 05 - Pages Documentation
- about-page.ts
- competition-page.ts
- create-page.ts
- donate-page.ts
- earnings-page.ts
- explore-page.ts
- messages-page.ts
- my-competitions-page.ts
- my-requests-page.ts
- profile-page.ts
- reports-page.ts
- settings-page.ts
- static-pages.ts
- verify-page.ts
- live-room-page.ts (⚠️ كبير)
- test-stream-page.ts (⚠️ كبير)
- live/ (مجلد منظم)

### 06 - API Routes Documentation
- admin/routes.ts
- auth/routes.ts & oauth-routes.ts
- categories/routes.ts
- chunks/routes.ts
- competitions/routes.ts
- countries/routes.ts
- jitsi/index.ts
- likes/routes.ts
- messages/routes.ts
- notifications/routes.ts
- reports/routes.ts
- schedule/routes.ts
- search/routes.ts
- seed/routes.ts
- settings/routes.ts
- signaling/routes.ts
- users/routes.ts

### 07 - Client Documentation
- Core: ApiClient, CookieUtils, State
- Helpers: DateFormatter, InfiniteScroll, LiveSearch, NumberFormatter, RecommendationEngine, Utils, YouTubeHelpers
- Pages: HomePage
- Services: AuthService, ChunkPlayer, ChunkUploader, CompetitionService, InteractionService, LiveRoom, MessagingService, P2PConnection, SearchService, SettingsService, ThemeService, VideoCompositor
- UI: InteractionsUI, Menu, MessagesUI, MessagingUI, Modal, NotificationsUI, ScheduleUI, SettingsUI, Toast

### 08 - Lib & Config Documentation
- lib/jitsi-config.ts
- lib/oauth/: BaseOAuthProvider, GoogleOAuth, MicrosoftOAuth, FacebookOAuth, TikTokOAuth, OAuthProviderFactory, types, utils
- lib/services/: CryptoUtils, EmailService
- config/defaults.ts, pwa.ts, types.ts
- middleware/auth.ts
- i18n/ar.ts, en.ts, index.ts

### 09 - Shared & Routes Documentation
- shared/components/: competition-card, competition-section, footer, login-modal, navigation, user-card
- shared/templates/layout.ts
- shared/constants.ts, seed-data.ts
- routes/api.ts, index.ts, jitsi.ts
- main.ts (⚠️ مهم جداً)

---

## 🔍 كيفية الاستخدام

### للمطورين:
1. ابحث عن الملف في الفهرس أعلاه
2. اذهب إلى الوثيقة المقابلة
3. اقرأ التوثيق التفصيلي للملف

### للمحللين:
1. ابدأ بـ `03-models` لفهم البنية البيانية
2. انتقل إلى `04-controllers` لفهم المنطق
3. راجع `06-api-routes` لفهم الـ endpoints
4. اطلع على `07-client` لفهم الواجهة

### للمديرين:
1. راجع `05-pages` لفهم الصفحات المتاحة
2. راجع `08-lib-config` لفهم الإعدادات
3. راجع `09-shared-routes` لفهم التدفق العام

---

## ⚠️ ملاحظات هامة

### الملفات الكبيرة (> 1000 سطر):
- `competition-page.ts` (1034 سطر) - صفحة المنافسة الرئيسية
- `live-room-page.ts` (983 سطر) - غرفة البث المباشر
- `test-stream-page.ts` (1540 سطر) - اختبار البث (يحتاج تقسيم)

### الميزات غير المكتملة:
- TikTok OAuth (يحتاج اختبار)
- نظام الدفع/التبرع (TODO)
- بعض ميزات البث (قيد التطوير)

### الميزات المكتملة:
- ✅ Google OAuth
- ✅ Microsoft OAuth
- ✅ Facebook OAuth
- ✅ نظام المنافسات الكامل
- ✅ نظام التقييمات والأرباح
- ✅ البث المباشر (P2P + HLS)
- ✅ الترجمة (i18n)
- ✅ الوضع الليلي/النهاري

---

## 📞 دعم

للاستفسارات أو التحديثات، راجع:
- `.blackbox/agents/MASTER_COORDINATION.md` - تعليمات الوكلاء
- `.blackbox/CODE_DOCUMENTATION_PLAN.md` - خطة التوثيق الأصلية

---

**تم التوثيق بنجاح بواسطة 7 وكلاء AI متخصصين** 🤖✨
