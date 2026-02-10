# 🤖 توثيق الكنترولرز (Controllers Documentation)
# Agent 2: Controllers Documentation

**النموذج المقترح:** Grok Code Fast (سريع ومناسب للـ API endpoints)

---

## 📁 الملف: `src/controllers/base/BaseController.ts`

### الغرض العام
فئة المتحكم الأساسية المجردة التي توفر أدوات مشتركة لجميع المتحكمات مثل الاستجابات الناجحة/الخاطئة، التحقق من المصادقة، ومعالجة الطلبات.

### الـ API Endpoints

#### getLanguage (سطر 20-22)
- **الـ Endpoint:** غير مباشر - يُستخدم داخلياً
- **الـ Controller:** BaseController
- **الـ Middleware:** لا يوجد

##### الـ Request
```typescript
// لا يوجد طلب مباشر
```

##### الـ Response
```typescript
// يرجع string مثل "ar" أو "en"
```

##### المنطق الرئيسي
1. يحصل على اللغة من السياق أو يستخدم اللغة الافتراضية

##### الـ Models المستدعاة
- لا يوجد

### الـ Validation
- لا يوجد

### الـ Error Handling
- لا يوجد

#### success (سطر 32-34)
- **الـ Endpoint:** غير مباشر
- **الـ Controller:** BaseController
- **الـ Middleware:** لا يوجد

##### الـ Request
```typescript
// Parameters: data: T, status: number = 200
```

##### الـ Response
```typescript
{
  success: true,
  data: T
}
```

##### المنطق الرئيسي
1. يرجع استجابة ناجحة مع البيانات

##### الـ Models المستدعاة
- لا يوجد

#### error (سطر 39-41)
- **الـ Endpoint:** غير مباشر
- **الـ Controller:** BaseController
- **الـ Middleware:** لا يوجد

##### الـ Request
```typescript
// Parameters: message: string, status: number = 400
```

##### الـ Response
```typescript
{
  success: false,
  error: string
}
```

##### المنطق الرئيسي
1. يرجع استجابة خطأ مع الرسالة

##### الـ Models المستدعاة
- لا يوجد

#### getCurrentUser (سطر 76-78)
- **الـ Endpoint:** غير مباشر
- **الـ Controller:** BaseController
- **الـ Middleware:** لا يوجد

##### الـ Request
```typescript
// لا يوجد
```

##### الـ Response
```typescript
// User object أو null
```

##### المنطق الرئيسي
1. يحصل على المستخدم الحالي من السياق

##### الـ Models المستدعاة
- لا يوجد

#### getBody (سطر 88-96)
- **الـ Endpoint:** غير مباشر
- **الـ Controller:** BaseController
- **الـ Middleware:** لا يوجد

##### الـ Request
```typescript
// لا يوجد
```

##### الـ Response
```typescript
// Parsed JSON body أو null
```

##### المنطق الرئيسي
1. يحلل جسم الطلب كـ JSON

##### الـ Models المستدعاة
- لا يوجد

#### getQuery (سطر 98-100)
- **الـ Endpoint:** غير مباشر
- **الـ Controller:** BaseController
- **الـ Middleware:** لا يوجد

##### الـ Request
```typescript
// Parameters: key: string, defaultValue: string = ''
```

##### الـ Response
```typescript
// Query parameter value
```

##### المنطق الرئيسي
1. يحصل على معامل الاستعلام

##### الـ Models المستدعاة
- لا يوجد

#### getParam (سطر 112-114)
- **الـ Endpoint:** غير مباشر
- **الـ Controller:** BaseController
- **الـ Middleware:** لا يوجد

##### الـ Request
```typescript
// Parameters: key: string
```

##### الـ Response
```typescript
// Route parameter value
```

##### المنطق الرئيسي
1. يحصل على معامل المسار

##### الـ Models المستدعاة
- لا يوجد

---

## 📁 الملف: `src/controllers/AdminController.ts`

### الغرض العام
متحكم لوحة الأدمن لإدارة المستخدمين، المنافسات، البلاغات، والإعلانات.

### الـ API Endpoints

#### getStats (سطر 25-58)
- **الـ Endpoint:** `GET /api/admin/stats`
- **الـ Controller:** AdminController
- **الـ Middleware:** auth (يتطلب صلاحية أدمن)

##### الـ Request
```typescript
// Headers
Authorization: Bearer token
```

##### الـ Response
```typescript
// Success (200)
{
  success: true,
  data: {
    users: number,
    competitions: number,
    pendingReports: number,
    activeAds: number,
    competitionsByStatus: Array,
    totalRevenue: number
  }
}

// Error (403)
{
  success: false,
  error: "Forbidden"
}
```

##### المنطق الرئيسي
1. التحقق من صلاحية الأدمن
2. جلب عدد المستخدمين والمنافسات والبلاغات والإعلانات
3. حساب الإيرادات الإجمالية

##### الـ Models المستدعاة
- لا يوجد - استعلامات مباشرة على قاعدة البيانات

### الـ Validation
- يتطلب صلاحية أدمن

### الـ Error Handling
- 403 Forbidden - إذا لم يكن المستخدم أدمن

#### getUsers (سطر 60-95)
- **الـ Endpoint:** `GET /api/admin/users`
- **الـ Controller:** AdminController
- **الـ Middleware:** auth (يتطلب صلاحية أدمن)

##### الـ Request
```typescript
// Query Parameters
?limit=50&offset=0&search=username

// Headers
Authorization: Bearer token
```

##### الـ Response
```typescript
// Success (200)
{
  success: true,
  data: {
    users: Array<User>
  }
}
```

##### المنطق الرئيسي
1. التحقق من صلاحية الأدمن
2. البحث عن المستخدمين مع فلترة البحث
3. ترتيب حسب تاريخ الإنشاء

##### الـ Models المستدعاة
- لا يوجد - استعلام مباشر

#### toggleUserBan (سطر 97-125)
- **الـ Endpoint:** `PUT /api/admin/users/:id/ban`
- **الـ Controller:** AdminController
- **الـ Middleware:** auth (يتطلب صلاحية أدمن)

##### الـ Request
```typescript
// Body
{
  banned: boolean
}

// Headers
Authorization: Bearer token
```

##### الـ Response
```typescript
// Success (200)
{
  success: true,
  data: {
    banned: boolean
  }
}
```

##### المنطق الرئيسي
1. التحقق من صلاحية الأدمن
2. تحديث حالة التحقق للمستخدم (مؤقت)

##### الـ Models المستدعاة
- لا يوجد

#### getReports (سطر 127-142)
- **الـ Endpoint:** `GET /api/admin/reports`
- **الـ Controller:** AdminController
- **الـ Middleware:** auth (يتطلب صلاحية أدمن)

##### الـ Request
```typescript
// Query Parameters
?status=pending&limit=50&offset=0

// Headers
Authorization: Bearer token
```

##### الـ Response
```typescript
// Success (200)
{
  success: true,
  data: {
    reports: Array<Report>
  }
}
```

##### المنطق الرئيسي
1. التحقق من صلاحية الأدمن
2. جلب البلاغات من ReportModel

##### الـ Models المستدعاة
- ReportModel.getReports - جلب البلاغات

#### reviewReport (سطر 144-165)
- **الـ Endpoint:** `PUT /api/admin/reports/:id`
- **الـ Controller:** AdminController
- **الـ Middleware:** auth (يتطلب صلاحية أدمن)

##### الـ Request
```typescript
// Body
{
  status: string,
  action_taken?: string
}

// Headers
Authorization: Bearer token
```

##### الـ Response
```typescript
// Success (200)
{
  success: true,
  data: {
    reviewed: true
  }
}
```

##### المنطق الرئيسي
1. التحقق من صلاحية الأدمن
2. تحديث حالة البلاغ

##### الـ Models المستدعاة
- ReportModel.reviewReport - مراجعة البلاغ

#### getAds (سطر 172-182)
- **الـ Endpoint:** `GET /api/admin/ads`
- **الـ Controller:** AdminController
- **الـ Middleware:** auth (يتطلب صلاحية أدمن)

##### الـ Request
```typescript
// Headers
Authorization: Bearer token
```

##### الـ Response
```typescript
// Success (200)
{
  success: true,
  data: {
    ads: Array<Ad>
  }
}
```

##### المنطق الرئيسي
1. التحقق من صلاحية الأدمن
2. جلب جميع الإعلانات

##### الـ Models المستدعاة
- AdvertisementModel.findAll - جلب الإعلانات

#### createAd (سطر 184-210)
- **الـ Endpoint:** `POST /api/admin/ads`
- **الـ Controller:** AdminController
- **الـ Middleware:** auth (يتطلب صلاحية أدمن)

##### الـ Request
```typescript
// Body
{
  title: string,
  image_url?: string,
  link_url?: string,
  revenue_per_view?: number
}

// Headers
Authorization: Bearer token
```

##### الـ Response
```typescript
// Success (201)
{
  success: true,
  data: {
    ad: Ad
  }
}
```

##### المنطق الرئيسي
1. التحقق من صلاحية الأدمن
2. إنشاء إعلان جديد

##### الـ Models المستدعاة
- AdvertisementModel.create - إنشاء إعلان

#### updateAd (سطر 212-235)
- **الـ Endpoint:** `PUT /api/admin/ads/:id`
- **الـ Controller:** AdminController
- **الـ Middleware:** auth (يتطلب صلاحية أدمن)

##### الـ Request
```typescript
// Body
{
  title?: string,
  image_url?: string,
  link_url?: string,
  is_active?: number,
  revenue_per_view?: number
}

// Headers
Authorization: Bearer token
```

##### الـ Response
```typescript
// Success (200)
{
  success: true,
  data: {
    ad: Ad
  }
}
```

##### المنطق الرئيسي
1. التحقق من صلاحية الأدمن
2. تحديث الإعلان

##### الـ Models المستدعاة
- AdvertisementModel.update - تحديث إعلان

#### deleteAd (سطر 237-252)
- **الـ Endpoint:** `DELETE /api/admin/ads/:id`
- **الـ Controller:** AdminController
- **الـ Middleware:** auth (يتطلب صلاحية أدمن)

##### الـ Request
```typescript
// Headers
Authorization: Bearer token
```

##### الـ Response
```typescript
// Success (200)
{
  success: true,
  data: {
    deleted: true
  }
}
```

##### المنطق الرئيسي
1. التحقق من صلاحية الأدمن
2. حذف الإعلان

##### الـ Models المستدعاة
- AdvertisementModel.delete - حذف إعلان

### الـ Validation
- جميع endpoints تتطلب صلاحية أدمن
- حقول مطلوبة حسب الـ endpoint

### الـ Error Handling
- 403 Forbidden - عدم وجود صلاحية أدمن
- 422 Validation Error - بيانات غير صحيحة
- 500 Server Error - أخطاء الخادم

---

## 📁 الملف: `src/controllers/AuthController.ts`

### الغرض العام
متحكم المصادقة للتسجيل، تسجيل الدخول، التحقق من البريد، وإعادة تعيين كلمة المرور.

### الـ API Endpoints

#### register (سطر 25-89)
- **الـ Endpoint:** `POST /api/auth/register`
- **الـ Controller:** AuthController
- **الـ Middleware:** لا يوجد

##### الـ Request
```typescript
// Body
{
  name: string,
  email: string,
  password: string,
  country?: string,
  language?: string
}
```

##### الـ Response
```typescript
// Success (201)
{
  success: true,
  data: {
    message: string
  }
}

// Error (400)
{
  success: false,
  error: string
}
```

##### المنطق الرئيسي
1. التحقق من صحة البيانات
2. فحص وجود البريد الإلكتروني
3. إنشاء اسم مستخدم فريد
4. تشفير كلمة المرور
5. إنشاء رمز التحقق
6. إرسال بريد التحقق

##### الـ Models المستدعاة
- UserModel.create - إنشاء مستخدم
- UserModel.emailExists - فحص وجود البريد
- UserModel.usernameExists - فحص وجود اسم المستخدم
- UserModel.setVerificationToken - تعيين رمز التحقق

### الـ Validation
- الحقول المطلوبة: name, email, password
- كلمة المرور يجب أن تكون 8 أحرف على الأقل
- البريد الإلكتروني يجب أن يكون فريداً

### الـ Error Handling
- 400 Bad Request - بيانات غير صحيحة أو بريد موجود
- 500 Server Error - خطأ في الخادم

#### verifyEmail (سطر 91-109)
- **الـ Endpoint:** `GET /api/auth/verify`
- **الـ Controller:** AuthController
- **الـ Middleware:** لا يوجد

##### الـ Request
```typescript
// Query Parameters
?token=verification_token
```

##### الـ Response
```typescript
// Success (200)
{
  success: true,
  data: {
    message: string
  }
}
```

##### المنطق الرئيسي
1. فحص صحة رمز التحقق
2. تحديث حالة التحقق للمستخدم

##### الـ Models المستدعاة
- UserModel.findByVerificationToken - البحث برمز التحقق
- UserModel.verifyEmail - تحديث حالة التحقق

#### login (سطر 141-185)
- **الـ Endpoint:** `POST /api/auth/login`
- **الـ Controller:** AuthController
- **الـ Middleware:** لا يوجد

##### الـ Request
```typescript
// Body
{
  email: string,
  password: string
}
```

##### الـ Response
```typescript
// Success (200)
{
  success: true,
  data: {
    sessionId: string,
    user: {
      id: number,
      name: string,
      email: string,
      avatar: string,
      is_admin: number
    }
  }
}
```

##### المنطق الرئيسي
1. فحص صحة البيانات
2. البحث عن المستخدم بالبريد
3. التحقق من كلمة المرور
4. فحص حالة التحقق من البريد
5. إنشاء جلسة جديدة

##### الـ Models المستدعاة
- UserModel.findByEmail - البحث بالبريد
- SessionModel.create - إنشاء جلسة

#### getSession (سطر 187-212)
- **الـ Endpoint:** `GET /api/auth/session`
- **الـ Controller:** AuthController
- **الـ Middleware:** لا يوجد

##### الـ Request
```typescript
// Headers
Authorization: Bearer session_token
```

##### الـ Response
```typescript
// Success (200)
{
  success: true,
  data: {
    user: User | null
  }
}
```

##### المنطق الرئيسي
1. فحص وجود رمز الجلسة
2. البحث عن جلسة صالحة

##### الـ Models المستدعاة
- SessionModel.findValidSession - البحث عن جلسة صالحة

#### forgotPassword (سطر 225-258)
- **الـ Endpoint:** `POST /api/auth/forgot-password`
- **الـ Controller:** AuthController
- **الـ Middleware:** لا يوجد

##### الـ Request
```typescript
// Body
{
  email: string
}
```

##### الـ Response
```typescript
// Success (200)
{
  success: true,
  data: {
    message: string
  }
}
```

##### المنطق الرئيسي
1. فحص وجود المستخدم
2. إنشاء رمز إعادة التعيين
3. إرسال بريد إعادة التعيين

##### الـ Models المستدعاة
- UserModel.findByEmail - البحث بالبريد
- UserModel.setResetToken - تعيين رمز إعادة التعيين

#### resetPassword (سطر 291-325)
- **الـ Endpoint:** `POST /api/auth/reset-password`
- **الـ Controller:** AuthController
- **الـ Middleware:** لا يوجد

##### الـ Request
```typescript
// Body
{
  email: string,
  code: string,
  newPassword: string
}
```

##### الـ Response
```typescript
// Success (200)
{
  success: true,
  data: {
    message: string
  }
}
```

##### المنطق الرئيسي
1. فحص صحة البيانات
2. التحقق من رمز إعادة التعيين
3. تحديث كلمة المرور

##### الـ Models المستدعاة
- UserModel.findByEmail - البحث بالبريد
- UserModel.updatePassword - تحديث كلمة المرور

### الـ Validation
- الحقول المطلوبة حسب الـ endpoint
- كلمة المرور 8 أحرف على الأقل
- البريد الإلكتروني صحيح

### الـ Error Handling
- 400 Bad Request - بيانات غير صحيحة
- 401 Unauthorized - بيانات دخول خاطئة
- 500 Server Error - خطأ في الخادم

---

## 📁 الملف: `src/controllers/CategoryController.ts`

### الغرض العام
متحكم الفئات لعرض الفئات والفئات الفرعية.

### الـ API Endpoints

#### list (سطر 17-22)
- **الـ Endpoint:** `GET /api/categories`
- **الـ Controller:** CategoryController
- **الـ Middleware:** لا يوجد

##### الـ Request
```typescript
// لا يوجد
```

##### الـ Response
```typescript
// Success (200)
{
  success: true,
  data: Array<Category>
}
```

##### المنطق الرئيسي
1. جلب جميع الفئات مع معلومات الأب

##### الـ Models المستدعاة
- CategoryModel.findAllWithParent - جلب الفئات مع الأب

#### show (سطر 24-44)
- **الـ Endpoint:** `GET /api/categories/:id`
- **الـ Controller:** CategoryController
- **الـ Middleware:** لا يوجد

##### الـ Request
```typescript
// Route Parameters
:id (number or slug)
```

##### الـ Response
```typescript
// Success (200)
{
  success: true,
  data: {
    ...category,
    subcategories: Array
  }
}
```

##### المنطق الرئيسي
1. البحث عن الفئة بالـ ID أو الـ slug
2. جلب الفئات الفرعية

##### الـ Models المستدعاة
- CategoryModel.findBySlug - البحث بالـ slug
- CategoryModel.findById - البحث بالـ ID
- CategoryModel.findSubcategories - جلب الفئات الفرعية

#### getSubcategories (سطر 46-54)
- **الـ Endpoint:** `GET /api/categories/:id/subcategories`
- **الـ Controller:** CategoryController
- **الـ Middleware:** لا يوجد

##### الـ Request
```typescript
// Route Parameters
:id (category id)
```

##### الـ Response
```typescript
// Success (200)
{
  success: true,
  data: Array<Category>
}
```

##### المنطق الرئيسي
1. جلب الفئات الفرعية للفئة المحددة

##### الـ Models المستدعاة
- CategoryModel.findSubcategories - جلب الفئات الفرعية

### الـ Validation
- ID صحيح أو slug صحيح

### الـ Error Handling
- 404 Not Found - فئة غير موجودة

---

## 📁 الملف: `src/controllers/CompetitionController.ts`

### الغرض العام
متحكم المنافسات الرئيسي لإدارة المنافسات من الإنشاء إلى الانتهاء.

### الـ API Endpoints

#### list (سطر 108-122)
- **الـ Endpoint:** `GET /api/competitions`
- **الـ Controller:** CompetitionController
- **الـ Middleware:** لا يوجد

##### الـ Request
```typescript
// Query Parameters
?status=pending&category=1&limit=20&offset=0
```

##### الـ Response
```typescript
// Success (200)
{
  success: true,
  data: Array<Competition>
}
```

##### المنطق الرئيسي
1. تطبيق الفلاتر على المنافسات
2. جلب المنافسات المفلترة

##### الـ Models المستدعاة
- CompetitionModel.findByFilters - البحث بالفلاتر

#### show (سطر 124-150)
- **الـ Endpoint:** `GET /api/competitions/:id`
- **الـ Controller:** CompetitionController
- **الـ Middleware:** لا يوجد

##### الـ Request
```typescript
// Route Parameters
:id (competition id)
```

##### الـ Response
```typescript
// Success (200)
{
  success: true,
  data: {
    ...competition,
    comments: Array,
    requests: Array,
    ratings: Array
  }
}
```

##### المنطق الرئيسي
1. جلب تفاصيل المنافسة
2. زيادة عدد المشاهدات
3. جلب التعليقات والطلبات والتقييمات

##### الـ Models المستدعاة
- CompetitionModel.findWithDetails - جلب التفاصيل
- CommentModel.findByCompetition - جلب التعليقات
- RatingModel.findByCompetition - جلب التقييمات

#### create (سطر 152-175)
- **الـ Endpoint:** `POST /api/competitions`
- **الـ Controller:** CompetitionController
- **الـ Middleware:** auth

##### الـ Request
```typescript
// Body
{
  title: string,
  description?: string,
  rules: string,
  category_id: number,
  scheduled_at?: string
}

// Headers
Authorization: Bearer token
```

##### الـ Response
```typescript
// Success (201)
{
  success: true,
  data: Competition
}
```

##### المنطق الرئيسي
1. التحقق من المصادقة
2. التحقق من صحة البيانات
3. إنشاء المنافسة

##### الـ Models المستدعاة
- CompetitionModel.create - إنشاء منافسة

#### update (سطر 177-201)
- **الـ Endpoint:** `PUT /api/competitions/:id`
- **الـ Controller:** CompetitionController
- **الـ Middleware:** auth

##### الـ Request
```typescript
// Body
{
  title?: string,
  description?: string,
  rules?: string
}

// Headers
Authorization: Bearer token
```

##### الـ Response
```typescript
// Success (200)
{
  success: true,
  data: Competition
}
```

##### المنطق الرئيسي
1. التحقق من المصادقة والملكية
2. تحديث المنافسة

##### الـ Models المستدعاة
- CompetitionModel.update - تحديث منافسة

#### delete (سطر 203-225)
- **الـ Endpoint:** `DELETE /api/competitions/:id`
- **الـ Controller:** CompetitionController
- **الـ Middleware:** auth

##### الـ Request
```typescript
// Headers
Authorization: Bearer token
```

##### الـ Response
```typescript
// Success (200)
{
  success: true,
  data: {
    deleted: true
  }
}
```

##### المنطق الرئيسي
1. التحقق من المصادقة والملكية
2. حذف المنافسة

##### الـ Models المستدعاة
- CompetitionModel.delete - حذف منافسة

#### requestJoin (سطر 227-267)
- **الـ Endpoint:** `POST /api/competitions/:id/request`
- **الـ Controller:** CompetitionController
- **الـ Middleware:** auth

##### الـ Request
```typescript
// Body
{
  message?: string
}

// Headers
Authorization: Bearer token
```

##### الـ Response
```typescript
// Success (201)
{
  success: true,
  data: {
    id: number
  }
}
```

##### المنطق الرئيسي
1. التحقق من المصادقة
2. فحص عدم وجود طلب سابق
3. إنشاء طلب الانضمام
4. إرسال إشعار للمنشئ

##### الـ Models المستدعاة
- CompetitionRequestModel.create - إنشاء طلب
- NotificationModel.create - إنشاء إشعار

#### acceptRequest (سطر 295-349)
- **الـ Endpoint:** `POST /api/competitions/:id/accept-request`
- **الـ Controller:** CompetitionController
- **الـ Middleware:** auth

##### الـ Request
```typescript
// Body
{
  request_id: number
}

// Headers
Authorization: Bearer token
```

##### الـ Response
```typescript
// Success (200)
{
  success: true,
  data: {
    accepted: true,
    otherDeclined: number,
    autoDeleted: number
  }
}
```

##### المنطق الرئيسي
1. التحقق من المصادقة والملكية
2. قبول الطلب
3. رفض الطلبات الأخرى
4. حذف المنافسات المتعارضة تلقائياً

##### الـ Models المستدعاة
- CompetitionModel.setOpponent - تعيين الخصم
- NotificationModel.create - إشعار القبول

#### start (سطر 387-418)
- **الـ Endpoint:** `POST /api/competitions/:id/start`
- **الـ Controller:** CompetitionController
- **الـ Middleware:** auth

##### الـ Request
```typescript
// Body
{
  youtube_live_id?: string,
  live_url?: string
}

// Headers
Authorization: Bearer token
```

##### الـ Response
```typescript
// Success (200)
{
  success: true,
  data: {
    started: true,
    status: 'live'
  }
}
```

##### المنطق الرئيسي
1. التحقق من المصادقة والمشاركة
2. فحص وجود خصم
3. بدء البث المباشر

##### الـ Models المستدعاة
- CompetitionModel.startLive - بدء البث

#### end (سطر 420-449)
- **الـ Endpoint:** `POST /api/competitions/:id/end`
- **الـ Controller:** CompetitionController
- **الـ Middleware:** auth

##### الـ Request
```typescript
// Body
{
  youtube_video_url?: string,
  vod_url?: string
}

// Headers
Authorization: Bearer token
```

##### الـ Response
```typescript
// Success (200)
{
  success: true,
  data: {
    ended: true,
    status: 'completed'
  }
}
```

##### المنطق الرئيسي
1. التحقق من المصادقة والملكية
2. إنهاء المنافسة
3. حذف مفاتيح القطع

##### الـ Models المستدعاة
- CompetitionModel.complete - إنهاء المنافسة

#### addComment (سطر 461-489)
- **الـ Endpoint:** `POST /api/competitions/:id/comments`
- **الـ Controller:** CompetitionController
- **الـ Middleware:** auth

##### الـ Request
```typescript
// Body
{
  content: string,
  is_live?: boolean
}

// Headers
Authorization: Bearer token
```

##### الـ Response
```typescript
// Success (201)
{
  success: true,
  data: Comment
}
```

##### المنطق الرئيسي
1. التحقق من المصادقة
2. إنشاء تعليق

##### الـ Models المستدعاة
- CommentModel.create - إنشاء تعليق

#### rate (سطر 511-549)
- **الـ Endpoint:** `POST /api/competitions/:id/rate`
- **الـ Controller:** CompetitionController
- **الـ Middleware:** auth

##### الـ Request
```typescript
// Body
{
  competitor_id: number,
  rating: number
}

// Headers
Authorization: Bearer token
```

##### الـ Response
```typescript
// Success (201)
{
  success: true,
  data: Rating
}
```

##### المنطق الرئيسي
1. التحقق من المصادقة
2. فحص عدم التقييم السابق
3. إنشاء تقييم

##### الـ Models المستدعاة
- RatingModel.create - إنشاء تقييم

### الـ Validation
- الحقول المطلوبة حسب الـ endpoint
- التقييم بين 1-5
- عدم التقييم المتكرر

### الـ Error Handling
- 400 Bad Request - بيانات غير صحيحة
- 403 Forbidden - عدم الصلاحية
- 404 Not Found - منافسة غير موجودة

---

## 📁 الملف: `src/controllers/InteractionController.ts`

### الغرض العام
متحكم التفاعلات للإعجابات والبلاغات.

### الـ API Endpoints

#### likeCompetition (سطر 23-54)
- **الـ Endpoint:** `POST /api/competitions/:id/like`
- **الـ Controller:** InteractionController
- **الـ Middleware:** auth

##### الـ Request
```typescript
// Headers
Authorization: Bearer token
```

##### الـ Response
```typescript
// Success (200)
{
  success: true,
  data: {
    liked: true,
    likeCount: number
  }
}
```

##### المنطق الرئيسي
1. التحقق من المصادقة
2. فحص عدم الإعجاب السابق
3. إضافة إعجاب

##### الـ Models المستدعاة
- LikeModel.hasLiked - فحص الإعجاب
- LikeModel.addLike - إضافة إعجاب
- LikeModel.getLikeCount - عدد الإعجابات

#### unlikeCompetition (سطر 56-79)
- **الـ Endpoint:** `DELETE /api/competitions/:id/like`
- **الـ Controller:** InteractionController
- **الـ Middleware:** auth

##### الـ Request
```typescript
// Headers
Authorization: Bearer token
```

##### الـ Response
```typescript
// Success (200)
{
  success: true,
  data: {
    liked: false,
    likeCount: number
  }
}
```

##### المنطق الرئيسي
1. التحقق من المصادقة
2. إزالة الإعجاب

##### الـ Models المستدعاة
- LikeModel.removeLike - إزالة إعجاب
- LikeModel.getLikeCount - عدد الإعجابات

#### getLikeStatus (سطر 81-102)
- **الـ Endpoint:** `GET /api/competitions/:id/like`
- **الـ Controller:** InteractionController
- **الـ Middleware:** لا يوجد

##### الـ Request
```typescript
// لا يوجد
```

##### الـ Response
```typescript
// Success (200)
{
  success: true,
  data: {
    liked: boolean,
    likeCount: number
  }
}
```

##### المنطق الرئيسي
1. جلب حالة الإعجاب وعدد الإعجابات

##### الـ Models المستدعاة
- LikeModel.hasLiked - فحص الإعجاب
- LikeModel.getLikeCount - عدد الإعجابات

#### submitReport (سطر 119-175)
- **الـ Endpoint:** `POST /api/reports`
- **الـ Controller:** InteractionController
- **الـ Middleware:** auth

##### الـ Request
```typescript
// Body
{
  target_type: 'user' | 'competition' | 'comment',
  target_id: number,
  reason: string,
  description?: string
}

// Headers
Authorization: Bearer token
```

##### الـ Response
```typescript
// Success (200)
{
  success: true,
  data: {
    report_id: number
  }
}
```

##### المنطق الرئيسي
1. التحقق من المصادقة
2. فحص صحة البيانات
3. فحص عدم البلاغ السابق
4. إنشاء بلاغ

##### الـ Models المستدعاة
- ReportModel.hasReported - فحص البلاغ السابق
- ReportModel.createReport - إنشاء بلاغ

#### getReportReasons (سطر 177-180)
- **الـ Endpoint:** `GET /api/reports/reasons`
- **الـ Controller:** InteractionController
- **الـ Middleware:** لا يوجد

##### الـ Request
```typescript
// لا يوجد
```

##### الـ Response
```typescript
// Success (200)
{
  success: true,
  data: {
    reasons: object
  }
}
```

##### المنطق الرئيسي
1. إرجاع أسباب البلاغات المتاحة

##### الـ Models المستدعاة
