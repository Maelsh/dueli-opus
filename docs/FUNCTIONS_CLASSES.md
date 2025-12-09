# دليل الدوال والكلاسات - منصة ديولي
# Functions & Classes Reference - Dueli Platform

---

## 1. Config Types (`src/config/types.ts`)

### الأنواع | Types

| الاسم | الوصف |
|-------|-------|
| `Bindings` | متغيرات البيئة (D1Database, API Keys) |
| `Variables` | متغيرات السياق (lang, user) |
| `Language` | نوع اللغة ('ar' \| 'en') |
| `User` | واجهة بيانات المستخدم |
| `Competition` | واجهة بيانات المنافسة |
| `Category` | واجهة بيانات الفئة |
| `Comment` | واجهة بيانات التعليق |
| `Rating` | واجهة بيانات التقييم |
| `CompetitionRequest` | واجهة طلب الانضمام |
| `Notification` | واجهة بيانات الإشعار |
| `Session` | واجهة بيانات الجلسة |
| `OAuthUser` | واجهة بيانات مستخدم OAuth |
| `ApiResponse<T>` | واجهة استجابة API |

---

## 2. Auth Helpers (`src/modules/api/auth/helpers.ts`)

### الدوال | Functions

| الدالة | الوصف | المدخلات | المخرجات |
|--------|-------|----------|----------|
| `hashPassword()` | تشفير كلمة المرور بـ SHA-256 | `password: string` | `Promise<string>` |
| `sendVerificationEmail()` | إرسال بريد التحقق | `email, token, name, lang, apiKey, origin` | `Promise<any>` |
| `sendPasswordResetEmail()` | إرسال بريد إعادة التعيين | `email, resetCode, lang, apiKey` | `Promise<any>` |
| `generateState()` | توليد حالة عشوائية لـ OAuth | - | `string` |
| `isEmailAllowed()` | التحقق من صلاحية البريد | `email: string` | `boolean` |

---

## 3. Auth Routes (`src/modules/api/auth/routes.ts`)

### المسارات | Routes

| المسار | الطريقة | الوصف |
|--------|---------|-------|
| `/api/auth/register` | POST | تسجيل مستخدم جديد |
| `/api/auth/verify` | GET | التحقق من البريد |
| `/api/auth/login` | POST | تسجيل الدخول |
| `/api/auth/session` | GET | التحقق من الجلسة |
| `/api/auth/logout` | POST | تسجيل الخروج |
| `/api/auth/resend-verification` | POST | إعادة إرسال التحقق |
| `/api/auth/forgot-password` | POST | طلب إعادة كلمة المرور |
| `/api/auth/verify-reset-code` | POST | التحقق من رمز الإعادة |
| `/api/auth/reset-password` | POST | إعادة تعيين كلمة المرور |
| `/api/auth/oauth` | POST | محاكاة OAuth |

---

## 4. OAuth Routes (`src/modules/api/auth/oauth-routes.ts`)

### الدوال الداخلية | Internal Functions

| الدالة | الوصف |
|--------|-------|
| `getOAuthProvider()` | الحصول على مزود OAuth حسب الاسم |
| `getOAuthErrorHTML()` | توليد صفحة خطأ OAuth |
| `getOAuthSuccessHTML()` | توليد صفحة نجاح OAuth |
| `getOAuthErrorDetailHTML()` | توليد صفحة تفاصيل الخطأ |

### المسارات | Routes

| المسار | الطريقة | الوصف |
|--------|---------|-------|
| `/api/auth/oauth/:provider` | GET | بدء OAuth |
| `/api/auth/oauth/:provider/callback` | GET | رد OAuth |

---

## 5. Categories Routes (`src/modules/api/categories/routes.ts`)

### المسارات | Routes

| المسار | الطريقة | الوصف |
|--------|---------|-------|
| `/api/categories` | GET | جلب كل الفئات |
| `/api/categories/:id` | GET | جلب فئة بالمعرف |
| `/api/categories/:id/subcategories` | GET | جلب الفئات الفرعية |

---

## 6. Competitions Routes (`src/modules/api/competitions/routes.ts`)

### المسارات | Routes

| المسار | الطريقة | الوصف |
|--------|---------|-------|
| `/api/competitions` | GET | جلب المنافسات مع الفلاتر |
| `/api/competitions` | POST | إنشاء منافسة |
| `/api/competitions/:id` | GET | جلب منافسة واحدة |
| `/api/competitions/:id/request` | POST | طلب الانضمام |
| `/api/competitions/:id/request` | DELETE | إلغاء طلب الانضمام |
| `/api/competitions/:id/accept-request` | POST | قبول طلب انضمام |
| `/api/competitions/:id/start` | POST | بدء المنافسة |
| `/api/competitions/:id/end` | POST | إنهاء المنافسة |
| `/api/competitions/:id/comments` | POST | إضافة تعليق |
| `/api/competitions/:id/rate` | POST | إضافة تقييم |

---

## 7. Users Routes (`src/modules/api/users/routes.ts`)

### المسارات | Routes

| المسار | الطريقة | الوصف |
|--------|---------|-------|
| `/api/users/:username` | GET | جلب ملف المستخدم |
| `/api/users/preferences` | PUT | تحديث التفضيلات |
| `/api/users/:id/requests` | GET | جلب طلبات المستخدم |
| `/api/users/:id/follow` | POST | متابعة مستخدم |
| `/api/users/:id/follow` | DELETE | إلغاء المتابعة |

---

## 8. Notifications Routes (`src/modules/api/notifications/routes.ts`)

### المسارات | Routes

| المسار | الطريقة | الوصف |
|--------|---------|-------|
| `/api/notifications` | GET | جلب الإشعارات |
| `/api/notifications/:id/read` | PUT | تعليم كمقروء |
| `/api/notifications/read-all` | PUT | تعليم الكل كمقروء |
| `/api/notifications/:id` | DELETE | حذف إشعار |
| `/api/notifications/unread-count` | GET | عدد غير المقروءة |

---

## 9. Countries Routes (`src/modules/api/countries/routes.ts`)

### المسارات | Routes

| المسار | الطريقة | الوصف |
|--------|---------|-------|
| `/api/countries` | GET | جلب كل الدول |
| `/api/countries/:code` | GET | جلب دولة بالرمز |

---

## 10. Shared Components (`src/shared/components/`)

### الدوال | Functions

| الملف | الدالة | الوصف |
|-------|--------|-------|
| `navigation.ts` | `getNavigation(lang)` | توليد HTML شريط التنقل |
| `login-modal.ts` | `getLoginModal(lang)` | توليد HTML نافذة الدخول |
| `footer.ts` | `getFooter(lang)` | توليد HTML التذييل |

---

## 11. Templates (`src/shared/templates/layout.ts`)

### الدوال | Functions

| الدالة | الوصف | المدخلات |
|--------|-------|----------|
| `generateHTML()` | توليد غلاف HTML الأساسي | `content, lang, title` |

### الثوابت | Constants

| الاسم | الوصف |
|-------|-------|
| `DueliLogo` | شعار ديولي كـ SVG |

---

## 12. Pages (`src/modules/pages/`)

### الدوال | Functions

| الملف | الدالة | الوصف |
|-------|--------|-------|
| `about-page.ts` | `aboutPage(c)` | صفحة عن ديولي |
| `verify-page.ts` | `verifyPage(c)` | صفحة التحقق من البريد |
| `competition-page.ts` | `competitionPage(c)` | صفحة تفاصيل المنافسة |
| `create-page.ts` | `createPage(c)` | صفحة إنشاء منافسة |
| `explore-page.ts` | `explorePage(c)` | صفحة الاستكشاف |
| `static-pages.ts` | Multiple routes | الصفحات الثابتة |

---

## 13. Main Entry (`src/main.ts`)

### الدوال الرئيسية في الصفحة الرئيسية | Home Page Functions (Client-side)

| الدالة | الوصف |
|--------|-------|
| `loadCompetitions()` | تحميل المنافسات |
| `renderEmptyState()` | عرض حالة الفراغ |
| `renderSection()` | عرض قسم منافسات |
| `renderDuelCard()` | عرض بطاقة منافسة |
| `setMainTab()` | تغيير التاب الرئيسي |
| `setSubTab()` | تغيير التاب الفرعي |

---

## 14. OAuth Providers (`src/lib/oauth/`)

### الكلاسات | Classes

| الملف | الكلاس | الوظائف |
|-------|--------|---------|
| `google.ts` | `GoogleOAuth` | `getAuthUrl()`, `getUser()` |
| `facebook.ts` | `FacebookOAuth` | `getAuthUrl()`, `getUser()` |
| `microsoft.ts` | `MicrosoftOAuth` | `getAuthUrl()`, `getUser()` |
| `tiktok.ts` | `TikTokOAuth` | `getAuthUrl()`, `getUser()` |

---

## 15. i18n (`src/i18n.ts`)

### الدوال | Functions

| الدالة | الوصف |
|--------|-------|
| `getDir(lang)` | الحصول على اتجاه الكتابة (rtl/ltr) |

### الثوابت | Constants

| الاسم | الوصف |
|-------|-------|
| `translations` | كائن الترجمات (ar/en) |

---

تاريخ التحديث: 2025-12-08
