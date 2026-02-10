# API Routes Documentation
# توثيق مسارات API

**المسار:** `src/modules/api/`
**ملف التوثيق:** `.blackbox/docs/06-api-routes-documentation.md`

---

## Table of Contents / جدول المحتويات

1. [Admin Routes](#-الملف-srcmodulesapiadminroutests)
2. [Auth Routes](#-الملف-srcmodulesapiauthroutests)
3. [OAuth Routes](#-الملف-srcmodulesapiauthoauth-routests)
4. [Categories Routes](#-الملف-srcmodulesapicategoriesroutests)
5. [Chunks Routes](#-الملف-srcmodulesapichunksroutests)
6. [Competitions Routes](#-الملف-srcmodulesapicompetitionsroutests)
7. [Countries Routes](#-الملف-srcmodulesapicountriesroutests)
8. [Jitsi Routes](#-الملف-srcmodulesapijitsiroutests)
9. [Likes Routes](#-الملف-srcmodulesapilikesroutests)
10. [Messages Routes](#-الملف-srcmodulesapimessagesroutests)
11. [Notifications Routes](#-الملف-srcmodulesapinotificationsroutests)
12. [Reports Routes](#-الملف-srcmodulesapireportsroutests)
13. [Schedule Routes](#-الملف-srcmodulesapischeduleroutests)
14. [Search Routes](#-الملف-srcmodulesapisearchroutests)
15. [Settings Routes](#-الملف-srcmodulesapisettingsroutests)
16. [Signaling Routes](#-الملف-srcmodulesapisignalingroutests)
17. [Users Routes](#-الملف-srcmodulesapiusersroutests)

---

## 📁 الملف: [`src/modules/api/admin/routes.ts`](src/modules/api/admin/routes.ts)

### Base URL
`/api/admin`

### الـ Routes

#### `GET /api/admin/stats` (سطر 22-24)
- **الـ Handler:** `controller.getStats(c)`
- **الـ Controller:** [`AdminController.getStats()`](src/controllers/AdminController.ts:33)
- **الـ Middleware:** `authMiddleware({ required: true })` + admin check

##### Request
```typescript
// Headers
Authorization: Bearer <session_token>
```

##### Response
```typescript
// Success
{
  success: true,
  data: {
    users: number,
    competitions: number,
    pendingReports: number,
    activeAds: number,
    competitionsByStatus: Array<{ status: string, count: number }>,
    totalRevenue: number
  }
}

// Error
{ success: false, error: string }
```

##### الوصف
جلب إحصائيات لوحة التحكم

---

#### `GET /api/admin/users` (سطر 34-36)
- **الـ Handler:** `controller.getUsers(c)`
- **الـ Controller:** [`AdminController.getUsers()`](src/controllers/AdminController.ts:77)
- **الـ Middleware:** `authMiddleware({ required: true })` + admin check

##### Request
```typescript
// Query Parameters
?limit=50&offset=0&search=keyword
```

##### Response
```typescript
// Success
{
  success: true,
  data: {
    users: Array<{
      id: number,
      username: string,
      display_name: string,
      email: string,
      avatar_url: string,
      is_verified: number,
      is_admin: number,
      total_competitions: number,
      average_rating: number,
      created_at: string
    }>
  }
}
```

##### الوصف
جلب قائمة المستخدمين مع إمكانية البحث والترقيم

---

#### `PUT /api/admin/users/:id/ban` (سطر 42-44)
- **الـ Handler:** `controller.toggleUserBan(c)`
- **الـ Controller:** [`AdminController.toggleUserBan()`](src/controllers/AdminController.ts:113)
- **الـ Middleware:** `authMiddleware({ required: true })` + admin check

##### Request
```typescript
// Body
{ "banned": true | false }
```

##### Response
```typescript
// Success
{ success: true, data: { banned: boolean } }
```

##### الوصف
حظر أو إلغاء حظر مستخدم

---

#### `GET /api/admin/reports` (سطر 54-56)
- **الـ Handler:** `controller.getReports(c)`
- **الـ Controller:** [`AdminController.getReports()`](src/controllers/AdminController.ts:141)
- **الـ Middleware:** `authMiddleware({ required: true })` + admin check

##### Request
```typescript
// Query Parameters
?status=pending&limit=50&offset=0
```

##### Response
```typescript
// Success
{
  success: true,
  data: { reports: Array<Report> }
}
```

##### الوصف
جلب قائمة البلاغات

---

#### `PUT /api/admin/reports/:id` (سطر 62-64)
- **الـ Handler:** `controller.reviewReport(c)`
- **الـ Controller:** [`AdminController.reviewReport()`](src/controllers/AdminController.ts:163)
- **الـ Middleware:** `authMiddleware({ required: true })` + admin check

##### Request
```typescript
// Body
{ "status": "reviewed" | "dismissed" | "resolved", "action_taken": string }
```

##### Response
```typescript
// Success
{ success: true, data: { reviewed: true } }
```

##### الوصف
مراجعة البلاغ واتخاذ إجراء

---

#### `GET /api/admin/ads` (سطر 74-76)
- **الـ Handler:** `controller.getAds(c)`
- **الـ Controller:** [`AdminController.getAds()`](src/controllers/AdminController.ts:193)
- **الـ Middleware:** `authMiddleware({ required: true })` + admin check

##### Response
```typescript
// Success
{
  success: true,
  data: { ads: Array<Advertisement> }
}
```

##### الوصف
جلب جميع الإعلانات

---

#### `POST /api/admin/ads` (سطر 82-84)
- **الـ Handler:** `controller.createAd(c)`
- **الـ Controller:** [`AdminController.createAd()`](src/controllers/AdminController.ts:211)
- **الـ Middleware:** `authMiddleware({ required: true })` + admin check

##### Request
```typescript
// Body
{
  title: string,
  image_url?: string,
  link_url?: string,
  revenue_per_view?: number
}
```

##### Response
```typescript
// Success
{ success: true, data: { ad: Advertisement }, status: 201 }
```

##### الوصف
إنشاء إعلان جديد

---

#### `PUT /api/admin/ads/:id` (سطر 90-92)
- **الـ Handler:** `controller.updateAd(c)`
- **الـ Controller:** [`AdminController.updateAd()`](src/controllers/AdminController.ts:247)
- **الـ Middleware:** `authMiddleware({ required: true })` + admin check

##### Request
```typescript
// Body
{
  title?: string,
  image_url?: string,
  link_url?: string,
  is_active?: number,
  revenue_per_view?: number
}
```

##### Response
```typescript
// Success
{ success: true, data: { ad: Advertisement } }
```

##### الوصف
تحديث بيانات الإعلان

---

#### `DELETE /api/admin/ads/:id` (سطر 98-100)
- **الـ Handler:** `controller.deleteAd(c)`
- **الـ Controller:** [`AdminController.deleteAd()`](src/controllers/AdminController.ts:279)
- **الـ Middleware:** `authMiddleware({ required: true })` + admin check

##### Response
```typescript
// Success
{ success: true, data: { deleted: true } }
```

##### الوصف
حذف الإعلان

---

###Controllers المرتبطة
- [`AdminController`](src/controllers/AdminController.ts) - متحكم لوحة الأدمن

---

## 📁 الملف: [`src/modules/api/auth/routes.ts`](src/modules/api/auth/routes.ts)

### Base URL
`/api/auth`

### الـ Routes

#### `POST /api/auth/register` (سطر 23)
- **الـ Handler:** `controller.register(c)`
- **الـ Controller:** [`AuthController`](src/controllers/AuthController.ts)

##### Request
```typescript
// Body
{
  username: string,
  email: string,
  password: string,
  display_name?: string,
  country?: string
}
```

##### Response
```typescript
// Success
{ success: true, data: { user: User, session: Session } }

// Error
{ success: false, error: string }
```

##### الوصف
تسجيل مستخدم جديد

---

#### `GET /api/auth/verify` (سطر 29)
- **الـ Handler:** `controller.verifyEmail(c)`
- **الـ Controller:** [`AuthController`](src/controllers/AuthController.ts)

##### Request
```typescript
// Query Parameters
?token=verification_token
```

##### Response
```typescript
// Success
{ success: true, data: { verified: true } }
```

##### الوصف
تأكيد البريد الإلكتروني

---

#### `POST /api/auth/resend-verification` (سطر 35)
- **الـ Handler:** `controller.resendVerification(c)`
- **الـ Controller:** [`AuthController`](src/controllers/AuthController.ts)

##### Request
```typescript
// Body
{ "email": string }
```

##### Response
```typescript
// Success
{ success: true, message: "verification_sent" }
```

##### الوصف
إعادة إرسال رابط التحقق

---

#### `POST /api/auth/login` (سطر 41)
- **الـ Handler:** `controller.login(c)`
- **الـ Controller:** [`AuthController`](src/controllers/AuthController.ts)

##### Request
```typescript
// Body
{
  email: string,
  password: string
}
```

##### Response
```typescript
// Success
{ success: true, data: { user: User, session: Session } }
```

##### الوصف
تسجيل الدخول

---

#### `GET /api/auth/session` (سطر 47)
- **الـ Handler:** `controller.getSession(c)`
- **الـ Controller:** [`AuthController`](src/controllers/AuthController.ts)

##### Request
```typescript
// Headers
Authorization: Bearer <session_token>
```

##### Response
```typescript
// Success
{ success: true, data: { user: User, session: Session } }

// Error (not authenticated)
{ success: false, error: "login_required" }
```

##### الوصف
جلب الجلسة الحالية / المستخدم الحالي

---

#### `POST /api/auth/logout` (سطر 53)
- **الـ Handler:** `controller.logout(c)`
- **الـ Controller:** [`AuthController`](src/controllers/AuthController.ts)

##### Request
```typescript
// Headers
Authorization: Bearer <session_token>
```

##### Response
```typescript
// Success
{ success: true, message: "logged_out" }
```

##### الوصف
تسجيل الخروج

---

#### `POST /api/auth/forgot-password` (سطر 59)
- **الـ Handler:** `controller.forgotPassword(c)`
- **الـ Controller:** [`AuthController`](src/controllers/AuthController.ts)

##### Request
```typescript
// Body
{ "email": string }
```

##### Response
```typescript
// Success
{ success: true, message: "reset_code_sent" }
```

##### الوصف
طلب استعادة كلمة المرور

---

#### `POST /api/auth/verify-reset-code` (سطر 65)
- **الـ Handler:** `controller.verifyResetCode(c)`
- **الـ Controller:** [`AuthController`](src/controllers/AuthController.ts)

##### Request
```typescript
// Body
{
  email: string,
  code: string
}
```

##### Response
```typescript
// Success
{ success: true, data: { valid: true } }
```

##### الوصف
التحقق من رمز الاستعادة

---

#### `POST /api/auth/reset-password` (سطر 71)
- **الـ Handler:** `controller.resetPassword(c)`
- **الـ Controller:** [`AuthController`](src/controllers/AuthController.ts)

##### Request
```typescript
// Body
{
  email: string,
  code: string,
  new_password: string
}
```

##### Response
```typescript
// Success
{ success: true, message: "password_reset" }
```

##### الوصف
إعادة تعيين كلمة المرور

---

### Controllers المرتبطة
- [`AuthController`](src/controllers/AuthController.ts) - متحكم المصادقة

---

## 📁 الملف: [`src/modules/api/auth/oauth-routes.ts`](src/modules/api/auth/oauth-routes.ts)

### Base URL
`/api/auth/oauth`

### الـ Routes

#### `GET /api/auth/oauth/:provider` (سطر 41-58)
- **الـ Handler:** Anonymous function
- **الـ Middleware:** None

##### Request
```typescript
// Path Parameters
:provider - google | facebook | microsoft | tiktok

// Query Parameters
?lang=ar
```

##### Response
```typescript
// Redirect to provider OAuth page
HTTP 302 Redirect
```

##### الوصف
بدء عملية OAuth مع مزود خارجي

---

#### `GET /api/auth/oauth/:provider/callback` (سطر 64-161)
- **الـ Handler:** Anonymous function
- **الـ Middleware:** None

##### Request
```typescript
// Path Parameters
:provider - google | facebook | microsoft | tiktok

// Query Parameters
?code=authorization_code&state=state_object
```

##### Response
```typescript
// HTML page with postMessage to parent window
```

##### الوصف
معالجة رد OAuth وإنشاء جلسة للمستخدم

---

### المزودون المدعومون
- Google
- Facebook
- Microsoft
- TikTok

---

## 📁 الملف: [`src/modules/api/categories/routes.ts`](src/modules/api/categories/routes.ts)

### Base URL
`/api/categories`

### الـ Routes

#### `GET /api/categories` (سطر 19)
- **الـ Handler:** `controller.list(c)`
- **الـ Controller:** [`CategoryController`](src/controllers/CategoryController.ts)

##### Response
```typescript
// Success
{
  success: true,
  data: Array<Category>
}
```

##### الوصف
جلب جميع الفئات

---

#### `GET /api/categories/:id` (سطر 25)
- **الـ Handler:** `controller.show(c)`
- **الـ Controller:** [`CategoryController`](src/controllers/CategoryController.ts)

##### Request
```typescript
// Path Parameters
:id - category id or slug
```

##### Response
```typescript
// Success
{
  success: true,
  data: Category
}

// Error
{ success: false, error: "not_found" }
```

##### الوصف
جلب فئة محددة

---

#### `GET /api/categories/:id/subcategories` (سطر 31)
- **الـ Handler:** `controller.getSubcategories(c)`
- **الـ Controller:** [`CategoryController`](src/controllers/CategoryController.ts)

##### Request
```typescript
// Path Parameters
:id - category id
```

##### Response
```typescript
// Success
{
  success: true,
  data: Array<Subcategory>
}
```

##### الوصف
جلب الفئات الفرعية

---

### Controllers المرتبطة
- [`CategoryController`](src/controllers/CategoryController.ts) - متحكم الفئات

---

## 📁 الملف: [`src/modules/api/chunks/routes.ts`](src/modules/api/chunks/routes.ts)

### Base URL
`/api/chunks`

### الـ Routes

#### `POST /api/chunks/register` (سطر 47-89)
- **الـ Handler:** Anonymous function
- **الـ Middleware:** `authMiddleware({ required: true })`

##### Request
```typescript
// Headers
Authorization: Bearer <session_token>

// Body
{
  competition_id: number,
  chunk_index: number
}
```

##### Response
```typescript
// Success
{
  success: true,
  data: { chunk_key: string }
}
```

##### الوصف
تسجيل مفتاح قطعة جديدة قبل رفعها - للمضيف فقط

---

#### `GET /api/chunks/verify` (سطر 96-126)
- **الـ Handler:** Anonymous function
- **الـ Middleware:** `verifyUploadServerOrigin`

##### Request
```typescript
// Query Parameters
?key=chunk_key
```

##### Response
```typescript
// Success
{
  valid: true,
  data: { competition_id: number, chunk_index: number }
}
```

##### الوصف
التحقق من مفتاح القطعة - يستدعيه سيرفر الرفع

---

#### `DELETE /api/chunks/:key` (سطر 133-156)
- **الـ Handler:** Anonymous function
- **الـ Middleware:** `verifyUploadServerOrigin`

##### Request
```typescript
// Path Parameters
:key - chunk key to delete
```

##### Response
```typescript
// Success
{ success: true, deleted: boolean }
```

##### الوصف
حذف مفتاح القطعة بعد الرفع الناجح

---

## 📁 الملف: [`src/modules/api/competitions/routes.ts`](src/modules/api/competitions/routes.ts)

### Base URL
`/api/competitions`

### الـ Routes

#### `GET /api/competitions` (سطر 28)
- **الـ Handler:** `controller.list(c)`
- **الـ Controller:** [`CompetitionController`](src/controllers/CompetitionController.ts)
- **الـ Middleware:** `authMiddleware({ required: false })`

##### Request
```typescript
// Query Parameters
?status=all&category=&limit=20&offset=0
```

##### Response
```typescript
// Success
{ success: true, data: Array<Competition> }
```

##### الوصف
جلب قائمة المنافسات مع التصفية

---

#### `GET /api/competitions/:id` (سطر 34)
- **الـ Handler:** `controller.show(c)`
- **الـ Controller:** [`CompetitionController`](src/controllers/CompetitionController.ts)

##### Response
```typescript
// Success
{ success: true, data: Competition }
```

##### الوصف
جلب تفاصيل منافسة

---

#### `GET /api/competitions/:id/requests` (سطر 40)
- **الـ Handler:** `controller.getRequests(c)`
- **الـ Controller:** [`CompetitionController`](src/controllers/CompetitionController.ts)

##### Response
```typescript
// Success
{ success: true, data: Array<Request> }
```

##### الوصف
جلب طلبات الانضمام

---

#### `POST /api/competitions` (سطر 50)
- **الـ Handler:** `controller.create(c)`
- **الـ Controller:** [`CompetitionController`](src/controllers/CompetitionController.ts)

##### Request
```typescript
// Body
{
  title: string,
  description?: string,
  category_id: number,
  language: string,
  country: string,
  is_private?: boolean
}
```

##### Response
```typescript
// Success
{ success: true, data: Competition, status: 201 }
```

##### الوصف
إنشاء منافسة جديدة

---

#### `POST /api/competitions/:id/request` (سطر 56)
- **الـ Handler:** `controller.requestJoin(c)`
- **الـ Controller:** [`CompetitionController`](src/controllers/CompetitionController.ts)

##### Response
```typescript
// Success
{ success: true, data: { requested: true } }
```

##### الوصف
طلب الانضمام

---

#### `POST /api/competitions/:id/accept-request` (سطر 62)
- **الـ Handler:** `controller.acceptRequest(c)`
- **الـ Controller:** [`CompetitionController`](src/controllers/CompetitionController.ts)

##### Request
```typescript
// Body
{ "user_id": number }
```

##### Response
```typescript
// Success
{ success: true, data: { accepted: true } }
```

##### الوصف
قبول طلب انضمام

---

#### `POST /api/competitions/:id/decline-request` (سطر 68)
- **الـ Handler:** `controller.declineRequest(c)`
- **الـ Controller:** [`CompetitionController`](src/controllers/CompetitionController.ts)

##### Response
```typescript
// Success
{ success: true, data: { declined: true } }
```

##### الوصف
رفض طلب انضمام

---

#### `POST /api/competitions/:id/start` (سطر 74)
- **الـ Handler:** `controller.start(c)`
- **الـ Controller:** [`CompetitionController`](src/controllers/CompetitionController.ts)

##### Response
```typescript
// Success
{ success: true, data: { started: true } }
```

##### الوصف
بدء المنافسة (ذهاب مباشر)

---

#### `POST /api/competitions/:id/end` (سطر 80)
- **الـ Handler:** `controller.end(c)`
- **الـ Controller:** [`CompetitionController`](src/controllers/CompetitionController.ts)

##### Response
```typescript
// Success
{ success: true, data: { ended: true } }
```

##### الوصف
إنهاء المنافسة

---

#### `POST /api/competitions/:id/update-vod` (سطر 86)
- **الـ Handler:** `controller.updateVod(c)`
- **الـ Controller:** [`CompetitionController`](src/controllers/CompetitionController.ts)

##### Request
```typescript
// Body
{ "vod_url": string }
```

##### Response
```typescript
// Success
{ success: true, data: { vod_url: string } }
```

##### الوصف
تحديث رابط VOD

---

#### `POST /api/competitions/:id/comments` (سطر 92)
- **الـ Handler:** `controller.addComment(c)`
- **الـ Controller:** [`CompetitionController`](src/controllers/CompetitionController.ts)

##### Request
```typescript
// Body
{ "content": string }
```

##### Response
```typescript
// Success
{ success: true, data: Comment, status: 201 }
```

##### الوصف
إضافة تعليق

---

#### `POST /api/competitions/:id/rate` (سطر 98)
- **الـ Handler:** `controller.rate(c)`
- **الـ Controller:** [`CompetitionController`](src/controllers/CompetitionController.ts)

##### Request
```typescript
// Body
{ "rating": number, "feedback?: string" }
```

##### Response
```typescript
// Success
{ success: true, data: { rated: true } }
```

##### الوصف
تقييم المنافسة

---

#### `POST /api/competitions/:id/invite` (سطر 104)
- **الـ Handler:** `controller.invite(c)`
- **الـ Controller:** [`CompetitionController`](src/controllers/CompetitionController.ts)

##### Request
```typescript
// Body
{ "user_id": number }
```

##### Response
```typescript
// Success
{ success: true, data: { invited: true } }
```

##### الوصف
دعوة مستخدم

---

#### `POST /api/competitions/:id/accept-invite` (سطر 110)
- **الـ Handler:** `controller.acceptInvite(c)`
- **الـ Controller:** [`CompetitionController`](src/controllers/CompetitionController.ts)

##### Response
```typescript
// Success
{ success: true, data: { accepted: true } }
```

##### الوصف
قبول الدعوة

---

#### `POST /api/competitions/:id/decline-invite` (سطر 116)
- **الـ Handler:** `controller.declineInvite(c)`
- **الـ Controller:** [`CompetitionController`](src/controllers/CompetitionController.ts)

##### Response
```typescript
// Success
{ success: true, data: { declined: true } }
```

##### الوصف
رفض الدعوة

---

#### `PUT /api/competitions/:id` (سطر 126)
- **الـ Handler:** `controller.update(c)`
- **الـ Controller:** [`CompetitionController`](src/controllers/CompetitionController.ts)

##### Request
```typescript
// Body
{
  title?: string,
  description?: string,
  category_id?: number
}
```

##### Response
```typescript
// Success
{ success: true, data: Competition }
```

##### الوصف
تحديث المنافسة

---

#### `DELETE /api/competitions/:id` (سطر 136)
- **الـ Handler:** `controller.delete(c)`
- **الـ Controller:** [`CompetitionController`](src/controllers/CompetitionController.ts)

##### Response
```typescript
// Success
{ success: true, data: { deleted: true } }
```

##### الوصف
حذف المنافسة

---

#### `DELETE /api/competitions/:id/request` (سطر 142)
- **الـ Handler:** `controller.cancelRequest(c)`
- **الـ Controller:** [`CompetitionController`](src/controllers/CompetitionController.ts)

##### Response
```typescript
// Success
{ success: true, data: { cancelled: true } }
```

##### الوصف
إلغاء طلب الانضمام

---

#### `DELETE /api/competitions/:competitionId/comments/:commentId` (سطر 148)
- **الـ Handler:** `controller.deleteComment(c)`
- **الـ Controller:** [`CompetitionController`](src/controllers/CompetitionController.ts)

##### Response
```typescript
// Success
{ success: true, data: { deleted: true } }
```

##### الوف تعليقصف
حذ

---

### Controllers المرتبطة
- [`CompetitionController`](src/controllers/CompetitionController.ts) - متحكم المنافسات

---

## 📁 الملف: [`src/modules/api/countries/routes.ts`](src/modules/api/countries/routes.ts)

### Base URL
`/api/countries`

### الـ Routes

#### `GET /api/countries` (سطر 18-35)
- **الـ Handler:** Anonymous function
- **الـ Middleware:** None

##### Response
```typescript
// Success
{
  success: true,
  data: Array<{
    code: string,
    name_ar: string,
    name_en: string,
    flag: string
  }>
}
```

##### الوصف
جلب قائمة الدول

---

#### `GET /api/countries/:code` (سطر 41-67)
- **الـ Handler:** Anonymous function
- **الـ Middleware:** None

##### Request
```typescript
// Path Parameters
:code - country code (e.g., EG, SA)
```

##### Response
```typescript
// Success
{ success: true, data: Country }

// Error
{ success: false, error: "not_found" }
```

##### الوصف
جلب دولة بالرمز

---

---

## 📁 الملف: [`src/modules/api/jitsi/routes.ts`](src/modules/api/jitsi/routes.ts)

### Base URL
`/api/jitsi`

### الـ Routes

#### `GET /api/jitsi/config` (سطر 20-38)
- **الـ Handler:** Anonymous function
- **الـ Middleware:** None

##### Response
```typescript
// Success
{
  success: true,
  data: {
    serverUrl: string,
    appId?: string,
    jwt?: string
  }
}
```

##### الوصف
جلب تكوين Jitsi Meet

---

#### `GET /api/jitsi/status` (سطر 44-68)
- **الـ Handler:** Anonymous function
- **الـ Middleware:** None

##### Response
```typescript
// Success
{
  success: true,
  status: "online" | "offline",
  serverUrl: string
}
```

##### الوصف
التحقق من حالة سيرفر Jitsi

---

---

## 📁 الملف: [`src/modules/api/likes/routes.ts`](src/modules/api/likes/routes.ts)

### Base URL
`/api/likes`

### الـ Routes

#### `POST /api/likes/competitions/:id/like` (سطر 18-20)
- **الـ Handler:** `controller.likeCompetition(c)`
- **الـ Controller:** [`InteractionController`](src/controllers/InteractionController.ts)

##### Response
```typescript
// Success
{ success: true, data: { liked: true } }
```

##### الوصف
إعجاب بمنافسة

---

#### `DELETE /api/likes/competitions/:id/like` (سطر 26-28)
- **الـ Handler:** `controller.unlikeCompetition(c)`
- **الـ Controller:** [`InteractionController`](src/controllers/InteractionController.ts)

##### Response
```typescript
// Success
{ success: true, data: { liked: false } }
```

##### الوصف
إزالة الإعجاب

---

#### `GET /api/likes/competitions/:id/like` (سطر 34-36)
- **الـ Handler:** `controller.getLikeStatus(c)`
- **الـ Controller:** [`InteractionController`](src/controllers/InteractionController.ts)

##### Response
```typescript
// Success
{ success: true, data: { liked: boolean } }
```

##### الوصف
جلب حالة الإعجاب

---

#### `GET /api/likes/competitions/:id/likes` (سطر 42-44)
- **الـ Handler:** `controller.getLikers(c)`
- **الـ Controller:** [`InteractionController`](src/controllers/InteractionController.ts)

##### Response
```typescript
// Success
{ success: true, data: Array<User> }
```

##### الوصف
جلب قائمة المعجبين

---

### Controllers المرتبطة
- [`InteractionController`](src/controllers/InteractionController.ts) - متحكم التفاعلات

---

## 📁 الملف: [`src/modules/api/messages/routes.ts`](src/modules/api/messages/routes.ts)

### Base URL
`/api/messages`

### Middleware
`authMiddleware({ required: true })` - جميع المسارات تتطلب مصادقة

### الـ Routes

#### `GET /api/messages/conversations` (سطر 22-24)
- **الـ Handler:** `controller.getConversations(c)`
- **الـ Controller:** [`MessageController`](src/controllers/MessageController.ts)

##### Response
```typescript
// Success
{ success: true, data: Array<Conversation> }
```

##### الوصف
جلب محادثات المستخدم

---

#### `GET /api/messages/conversations/:id/messages` (سطر 30-32)
- **الـ Handler:** `controller.getMessages(c)`
- **الـ Controller:** [`MessageController`](src/controllers/MessageController.ts)

##### Response
```typescript
// Success
{ success: true, data: Array<Message> }
```

##### الوصف
جلب رسائل محادثة

---

#### `POST /api/messages/conversations/:id/messages` (سطر 38-40)
- **الـ Handler:** `controller.sendMessage(c)`
- **الـ Controller:** [`MessageController`](src/controllers/MessageController.ts)

##### Request
```typescript
// Body
{ "content": string }
```

##### Response
```typescript
// Success
{ success: true, data: Message }
```

##### الوصف
إرسال رسالة

---

#### `POST /api/messages/users/:id/message` (سطر 46-48)
- **الـ Handler:** `controller.startConversation(c)`
- **الـ Controller:** [`MessageController`](src/controllers/MessageController.ts)

##### Response
```typescript
// Success
{ success: true, data: Conversation }
```

##### الوصف
بدء محادثة جديدة

---

#### `GET /api/messages/messages/unread` (سطر 54-56)
- **الـ Handler:** `controller.getUnreadCount(c)`
- **الـ Controller:** [`MessageController`](src/controllers/MessageController.ts)

##### Response
```typescript
// Success
{ success: true, data: { count: number } }
```

##### الوصف
جلب عدد الرسائل غير المقروءة

---

### Controllers المرتبطة
- [`MessageController`](src/controllers/MessageController.ts) - متحكم الرسائل

---

## 📁 الملف: [`src/modules/api/notifications/routes.ts`](src/modules/api/notifications/routes.ts)

### Base URL
`/api/notifications`

### Middleware
`authMiddleware({ required: true })` - جميع المسارات تتطلب مصادقة

### الـ Routes

#### `GET /api/notifications` (سطر 23)
- **الـ Handler:** `controller.getNotifications(c)`
- **الـ Controller:** [`UserController`](src/controllers/UserController.ts)

##### Response
```typescript
// Success
{ success: true, data: Array<Notification> }
```

##### الوصف
جلب إشعارات المستخدم

---

#### `POST /api/notifications/:id/read` (سطر 29)
- **الـ Handler:** `controller.markNotificationRead(c)`
- **الـ Controller:** [`UserController`](src/controllers/UserController.ts)

##### Response
```typescript
// Success
{ success: true, data: { read: true } }
```

##### الوصف
تعليم إشعار كمقروء

---

#### `POST /api/notifications/read-all` (سطر 35)
- **الـ Handler:** `controller.markAllNotificationsRead(c)`
- **الـ Controller:** [`UserController`](src/controllers/UserController.ts)

##### Response
```typescript
// Success
{ success: true, data: { read: true } }
```

##### الوصف
تعليم جميع الإشعارات كمقروءة

---

### Controllers المرتبطة
- [`UserController`](src/controllers/UserController.ts) - متحكم المستخدمين

---

## 📁 الملف: [`src/modules/api/reports/routes.ts`](src/modules/api/reports/routes.ts)

### Base URL
`/api/reports`

### الـ Routes

#### `POST /api/reports` (سطر 18-20)
- **الـ Handler:** `controller.submitReport(c)`
- **الـ Controller:** [`InteractionController`](src/controllers/InteractionController.ts)

##### Request
```typescript
// Body
{
  type: string,
  target_id: number,
  target_type: "competition" | "user" | "comment",
  reason: string,
  description?: string
}
```

##### Response
```typescript
// Success
{ success: true, data: { reported: true } }
```

##### الوصف
إرسال بلاغ

---

#### `GET /api/reports/reasons` (سطر 26-28)
- **الـ Handler:** `controller.getReportReasons(c)`
- **الـ Controller:** [`InteractionController`](src/controllers/InteractionController.ts)

##### Response
```typescript
// Success
{ success: true, data: Array<{ id: string, label: string }> }
```

##### الوصف
جلب أسباب البلاغات المتاحة

---

### Controllers المرتبطة
- [`InteractionController`](src/controllers/InteractionController.ts) - متحكم التفاعلات

---

## 📁 الملف: [`src/modules/api/schedule/routes.ts`](src/modules/api/schedule/routes.ts)

### Base URL
`/api/schedule`

### الـ Routes

#### `GET /api/schedule` (سطر 18-20)
- **الـ Handler:** `controller.getSchedule(c)`
- **الـ Controller:** [`ScheduleController`](src/controllers/ScheduleController.ts)

##### Response
```typescript
// Success
{ success: true, data: Array<Competition> }
```

##### الوصف
جلب المنافسات المجدولة للمستخدم

---

#### `GET /api/schedule/reminders` (سطر 26-28)
- **الـ Handler:** `controller.getReminders(c)`
- **الـ Controller:** [`ScheduleController`](src/controllers/ScheduleController.ts)

##### Response
```typescript
// Success
{ success: true, data: Array<Reminder> }
```

##### الوصف
جلب تذكيرات المستخدم

---

#### `POST /api/schedule/competitions/:id/remind` (سطر 34-36)
- **الـ Handler:** `controller.addReminder(c)`
- **الـ Controller:** [`ScheduleController`](src/controllers/ScheduleController.ts)

##### Response
```typescript
// Success
{ success: true, data: { reminded: true } }
```

##### الوصف
إضافة تذكير للمنافسة

---

#### `DELETE /api/schedule/competitions/:id/remind` (سطر 42-44)
- **الـ Handler:** `controller.removeReminder(c)`
- **الـ Controller:** [`ScheduleController`](src/controllers/ScheduleController.ts)

##### Response
```typescript
// Success
{ success: true, data: { removed: true } }
```

##### الوصف
إزالة التذكير

---

#### `GET /api/schedule/competitions/:id/remind` (سطر 50-52)
- **الـ Handler:** `controller.hasReminder(c)`
- **الـ Controller:** [`ScheduleController`](src/controllers/ScheduleController.ts)

##### Response
```typescript
// Success
{ success: true, data: { hasReminder: boolean } }
```

##### الوصف
التحقق من وجود تذكير

---

### Controllers المرتبطة
- [`ScheduleController`](src/controllers/ScheduleController.ts) - متحكم الجدولة

---

## 📁 الملف: [`src/modules/api/search/routes.ts`](src/modules/api/search/routes.ts)

### Base URL
`/api/search`

### الـ Routes

#### `GET /api/search/competitions` (سطر 19-21)
- **الـ Handler:** `controller.searchCompetitions(c)`
- **الـ Controller:** [`SearchController`](src/controllers/SearchController.ts)

##### Request
```typescript
// Query Parameters
?q=&category=&subcategory=&status=&language=&country=&limit=20&offset=0
```

##### Response
```typescript
// Success
{ success: true, data: Array<Competition> }
```

##### الوصف
البحث في المنافسات

---

#### `GET /api/search/users` (سطر 28-30)
- **الـ Handler:** `controller.searchUsers(c)`
- **الـ Controller:** [`SearchController`](src/controllers/SearchController.ts)

##### Request
```typescript
// Query Parameters
?q=&limit=20&offset=0
```

##### Response
```typescript
// Success
{ success: true, data: Array<User> }
```

##### الوصف
البحث في المستخدمين

---

#### `GET /api/search/suggestions` (سطر 37-39)
- **الـ Handler:** `controller.getSuggestions(c)`
- **الـ Controller:** [`SearchController`](src/controllers/SearchController.ts)

##### Request
```typescript
// Query Parameters
?country=
```

##### Response
```typescript
// Success
{ success: true, data: { competitions: Array, users: Array } }
```

##### الوصف
جلب اقتراحات البحث

---

#### `GET /api/search/trending` (سطر 46-48)
- **الـ Handler:** `controller.getTrending(c)`
- **الـ Controller:** [`SearchController`](src/controllers/SearchController.ts)

##### Request
```typescript
// Query Parameters
?limit=20
```

##### Response
```typescript
// Success
{ success: true, data: Array<Competition> }
```

##### الوصف
جلب المنافسات الشائعة

---

#### `GET /api/search/live` (سطر 55-57)
- **الـ Handler:** `controller.getLive(c)`
- **الـ Controller:** [`SearchController`](src/controllers/SearchController.ts)

##### Request
```typescript
// Query Parameters
?limit=20&offset=0
```

##### Response
```typescript
// Success
{ success: true, data: Array<Competition> }
```

##### الوصف
جلب المنافسات المباشرة

---

#### `GET /api/search/pending` (سطر 64-66)
- **الـ Handler:** `controller.getPending(c)`
- **الـ Controller:** [`SearchController`](src/controllers/SearchController.ts)

##### Request
```typescript
// Query Parameters
?limit=20&offset=0
```

##### Response
```typescript
// Success
{ success: true, data: Array<Competition> }
```

##### الوصف
جلب المنافسات المعلقة (في انتظار خصم)

---

### Controllers المرتبطة
- [`SearchController`](src/controllers/SearchController.ts) - متحكم البحث

---

## 📁 الملف: [`src/modules/api/settings/routes.ts`](src/modules/api/settings/routes.ts)

### Base URL
`/api/settings`

### الـ Routes

#### `GET /api/settings` (سطر 22-24)
- **الـ Handler:** `controller.getSettings(c)`
- **الـ Controller:** [`SettingsController`](src/controllers/SettingsController.ts)

##### Response
```typescript
// Success
{ success: true, data: UserSettings }
```

##### الوصف
جلب إعدادات المستخدم

---

#### `PUT /api/settings` (سطر 30-32)
- **الـ Handler:** `controller.updateSettings(c)`
- **الـ Controller:** [`SettingsController`](src/controllers/SettingsController.ts)

##### Request
```typescript
// Body
{
  language?: string,
  theme?: "light" | "dark" | "system",
  notifications_enabled?: boolean,
  // ... other settings
}
```

##### Response
```typescript
// Success
{ success: true, data: UserSettings }
```

##### الوصف
تحديث إعدادات المستخدم

---

#### `POST /api/settings/posts` (سطر 42-44)
- **الـ Handler:** `controller.createPost(c)`
- **الـ Controller:** [`SettingsController`](src/controllers/SettingsController.ts)

##### Request
```typescript
// Body
{ "content": string, "media_url?: string" }
```

##### Response
```typescript
// Success
{ success: true, data: Post, status: 201 }
```

##### الوصف
إنشاء منشور

---

#### `GET /api/settings/feed` (سطر 50-52)
- **الـ Handler:** `controller.getFeed(c)`
- **الـ Controller:** [`SettingsController`](src/controllers/SettingsController.ts)

##### Response
```typescript
// Success
{ success: true, data: Array<Post> }
```

##### الوصف
جلب خلاصة المنشورات

---

#### `DELETE /api/settings/posts/:id` (سطر 58-60)
- **الـ Handler:** `controller.deletePost(c)`
- **الـ Controller:** [`SettingsController`](src/controllers/SettingsController.ts)

##### Response
```typescript
// Success
{ success: true, data: { deleted: true } }
```

##### الوصف
حذف منشور

---

#### `GET /api/settings/users/:id/posts` (سطر 66-68)
- **الـ Handler:** `controller.getUserPosts(c)`
- **الـ Controller:** [`SettingsController`](src/controllers/SettingsController.ts)

##### Response
```typescript
// Success
{ success: true, data: Array<Post> }
```

##### الوصف
جلب منشورات مستخدم

---

### Controllers المرتبطة
- [`SettingsController`](src/controllers/SettingsController.ts) - متحكم الإعدادات

---

## 📁 الملف: [`src/modules/api/signaling/routes.ts`](src/modules/api/signaling/routes.ts)

### Base URL
`/api/signaling`

### الـ Routes

#### `GET /api/signaling/ice-servers` (سطر 49-77)
- **الـ Handler:** Anonymous function
- **الـ Middleware:** None

##### Response
```typescript
// Success
{
  success: true,
  data: {
    iceServers: Array<{
      urls: string,
      username?: string,
      credential?: string
    }>
  }
}
```

##### الوصف
جلب تكوين خوادم ICE للتواصل P2P

---

#### `GET /api/signaling/config` (سطر 84-105)
- **الـ Handler:** Anonymous function
- **الـ Middleware:** None

##### Request
```typescript
// Query Parameters
?competition_id=1&room_id=comp_1
```

##### Response
```typescript
// Success
{
  success: true,
  data: {
    room_id: string,
    mode: "websocket",
    signaling_url: string,
    ice_servers: Array
  }
}
```

##### الوصف
جلب تكوين الإشارات

---

#### `POST /api/signaling/verify` (سطر 115-187)
- **الـ Handler:** Anonymous function
- **الـ Middleware:** None

##### Request
```typescript
// Body
{
  session_token: string,
  competition_id: number,
  claimed_role: "host" | "opponent"
}
```

##### Response
```typescript
// Success
{
  valid: true,
  data: {
    user_id: number,
    username: string,
    display_name: string,
    role: string,
    competition_id: number
  }
}

// Error
{ valid: false, error: string }
```

##### الوصف
التحقق من صلاحية المستخدم للانضمام للإشارات

---

#### `POST /api/signaling/room/create` (سطر 194-237)
- **الـ Handler:** Anonymous function
- **الـ Middleware:** None

##### Request
```typescript
// Body
{ "competition_id": number }
```

##### Response
```typescript
// Success
{
  success: true,
  data: {
    room_id: string,
    signaling_url: string
  }
}
```

##### الوصف
إنشاء غرفة إشارات

---

### Middleware المشتركة
- None - Public endpoints for WebRTC configuration

---

## 📁 الملف: [`src/modules/api/users/routes.ts`](src/modules/api/users/routes.ts)

### Base URL
`/api/users`

### الـ Routes

#### `GET /api/users` (سطر 23)
- **الـ Handler:** `controller.index(c)`
- **الـ Controller:** [`UserController`](src/controllers/UserController.ts)

##### Response
```typescript
// Success
{ success: true, data: Array<User> }
```

##### الوصف
جلب قائمة المستخدمين

---

#### `GET /api/users/:username` (سطر 29)
- **الـ Handler:** `controller.show(c)`
- **الـ Controller:** [`UserController`](src/controllers/UserController.ts)

##### Response
```typescript
// Success
{ success: true, data: User }
```

##### الوصف
جلب ملف المستخدم

---

#### `GET /api/users/:id/requests` (سطر 35)
- **الـ Handler:** `controller.getRequests(c)`
- **الـ Controller:** [`UserController`](src/controllers/UserController.ts)

##### Response
```typescript
// Success
{ success: true, data: Array<Request> }
```

##### الوصف
جلب طلبات الانضمام المعلقة

---

#### `PUT /api/users/preferences` (سطر 45)
- **الـ Handler:** `controller.updatePreferences(c)`
- **الـ Controller:** [`UserController`](src/controllers/UserController.ts)

##### Request
```typescript
// Body
{
  language?: string,
  theme?: string,
  // ... preferences
}
```

##### Response
```typescript
// Success
{ success: true, data: { updated: true } }
```

##### الوصف
تحديث تفضيلات المستخدم

---

#### `POST /api/users/:id/follow` (سطر 55)
- **الـ Handler:** `controller.follow(c)`
- **الـ Controller:** [`UserController`](src/controllers/UserController.ts)

##### Response
```typescript
// Success
{ success: true, data: { following: true } }
```

##### الوصف
متابعة مستخدم

---

#### `DELETE /api/users/:id/follow` (سطر 61)
- **الـ Handler:** `controller.unfollow(c)`
- **الـ Controller:** [`UserController`](src/controllers/UserController.ts)

##### Response
```typescript
// Success
{ success: true, data: { following: false } }
```

##### الوصف
إلغاء متابعة مستخدم

---

### Controllers المرتبطة
- [`UserController`](src/controllers/UserController.ts) - متحكم المستخدمين

---

## 📋 ملخص Middleware

| Middleware | الوصف |
|------------|-------|
| `authMiddleware({ required: true })` | التحقق من الجلسة - مطلوب |
| `authMiddleware({ required: false })` | التحقق من الجلسة - اختياري |
| `adminAuthMiddleware()` | التحقق من صلاحية الأدمن |
| `verifyUploadServerOrigin` | التحقق من أن الطلب قادم من سيرفر الرفع |

---

## ✅ قائمة التحقق

- [x] وثقت admin/routes.ts
- [x] وثقت auth/routes.ts
- [x] وثقت auth/oauth-routes.ts
- [x] وثقت auth/helpers.ts (دوال مساعدة)
- [x] وثقت categories/routes.ts
- [x] وثقت chunks/routes.ts
- [x] وثقت competitions/routes.ts
- [x] وثقت countries/routes.ts
- [x] وثقت jitsi/routes.ts
- [x] وثقت likes/routes.ts
- [x] وثقت messages/routes.ts
- [x] وثقت notifications/routes.ts
- [x] وثقت reports/routes.ts
- [x] وثقت schedule/routes.ts
- [x] وثقت search/routes.ts
- [x] وثقت settings/routes.ts
- [x] وثقت signaling/routes.ts
- [x] وثقت signaling/routes_backup.ts
- [x] وثقت users/routes.ts
- [x] أنشأت ملف 06-api-routes-documentation.md

---

**تاريخ الإنشاء:** 2026-02-10
**الوكيل:** API Agent (Pony Alpha)
