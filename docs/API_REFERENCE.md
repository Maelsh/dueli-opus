# Dueli Platform - API Reference
# مرجع الدوال والكلاسات

**Version:** 2.0.0
**Last Updated:** 2025-12-07

---

## Table of Contents / جدول المحتويات

1. [Core Classes](#1-core-classes)
2. [Auth Module](#2-auth-module)
3. [Competition Module](#3-competition-module)
4. [User Module](#4-user-module)
5. [Category Module](#5-category-module)
6. [Types & Interfaces](#6-types--interfaces)

---

## 1. Core Classes

### 1.1 BaseController

**File:** `src/core/http/BaseController.ts`
**Type:** Abstract Class

المتحكم الأساسي - يجب على جميع المتحكمات الوراثة منه.

```typescript
abstract class BaseController {
  protected readonly controllerName: string;
  
  constructor(name: string);
}
```

#### Response Methods / دوال الاستجابة

| Method | Parameters | Return | Description |
|--------|------------|--------|-------------|
| `ok<T>()` | `c, data?, message?, status?` | `Response` | استجابة ناجحة (200) |
| `created<T>()` | `c, data, message?` | `Response` | إنشاء ناجح (201) |
| `noContent()` | `c` | `Response` | بدون محتوى (204) |
| `badRequest()` | `c, error` | `Response` | طلب خاطئ (400) |
| `unauthorized()` | `c, error?` | `Response` | غير مصرح (401) |
| `forbidden()` | `c, error?` | `Response` | محظور (403) |
| `notFound()` | `c, error?` | `Response` | غير موجود (404) |
| `conflict()` | `c, error` | `Response` | تعارض (409) |
| `validationError()` | `c, errors` | `Response` | خطأ تحقق (422) |
| `serverError()` | `c, error?` | `Response` | خطأ الخادم (500) |

#### Request Helpers / دوال الطلبات

| Method | Parameters | Return | Description |
|--------|------------|--------|-------------|
| `parseBody<T>()` | `c` | `Promise<T \| null>` | تحليل JSON body |
| `parseAndValidate<T>()` | `c, schema` | `Promise<ValidationResult<T>>` | تحليل وتحقق |
| `getParam()` | `c, name` | `string \| undefined` | معامل URL |
| `getParamInt()` | `c, name, default?` | `number` | معامل رقمي |
| `getQuery()` | `c, name, default?` | `string \| undefined` | معامل query |
| `getQueryInt()` | `c, name, default?` | `number` | معامل query رقمي |
| `getPagination()` | `c` | `{ limit, offset }` | صفحات |

#### Context Helpers / دوال السياق

| Method | Parameters | Return | Description |
|--------|------------|--------|-------------|
| `getLang()` | `c` | `Language` | اللغة الحالية |
| `getUser()` | `c` | `any` | المستخدم الحالي |
| `getDB()` | `c` | `D1Database` | قاعدة البيانات |
| `getEnv()` | `c, key` | `Bindings[K]` | متغير بيئة |
| `getOrigin()` | `c` | `string` | رابط الأصل |
| `getCookie()` | `c, name` | `string \| undefined` | قراءة كوكي |
| `setCookie()` | `c, name, value, options?` | `void` | تعيين كوكي |
| `deleteCookie()` | `c, name` | `void` | حذف كوكي |

---

### 1.2 Validator

**File:** `src/core/http/Validator.ts`
**Type:** Static Class

مدقق البيانات العام - بدون مكتبات خارجية.

```typescript
class Validator {
  static validate<T>(data: unknown, schema: ValidationSchema<T>): ValidationResult<T>;
  static isEmail(value: string): boolean;
  static isUrl(value: string): boolean;
  static isUuid(value: string): boolean;
  static sanitize(value: string): string;
  static toInt(value: any, defaultValue?: number): number;
  static toFloat(value: any, defaultValue?: number): number;
  static toBool(value: any): boolean;
}
```

#### Validation Rules / قواعد التحقق

| Rule | Type | Description |
|------|------|-------------|
| `'required'` | string | حقل مطلوب |
| `'string'` | string | يجب أن يكون نصاً |
| `'number'` | string | يجب أن يكون رقماً |
| `'boolean'` | string | يجب أن يكون منطقياً |
| `'email'` | string | بريد إلكتروني صالح |
| `'url'` | string | رابط صالح |
| `'array'` | string | مصفوفة |
| `'object'` | string | كائن |
| `'date'` | string | تاريخ صالح |
| `'uuid'` | string | UUID صالح |
| `{ min: n }` | object | الحد الأدنى للرقم |
| `{ max: n }` | object | الحد الأقصى للرقم |
| `{ minLength: n }` | object | الحد الأدنى لطول النص |
| `{ maxLength: n }` | object | الحد الأقصى لطول النص |
| `{ pattern: regex }` | object | نمط regex |
| `{ enum: [...] }` | object | قائمة قيم مسموحة |
| `{ custom: fn }` | object | دالة تحقق مخصصة |

#### Usage Example / مثال الاستخدام

```typescript
const schema: ValidationSchema<CreateUserDTO> = {
  email: ['required', 'email'],
  password: ['required', 'string', { minLength: 8 }],
  name: ['required', 'string', { maxLength: 100 }],
  age: ['number', { min: 13, max: 120 }]
};

const result = Validator.validate(data, schema);
if (!result.success) {
  console.log(result.errors);
}
```

---

### 1.3 BaseRepository<T>

**File:** `src/core/database/BaseRepository.ts`
**Type:** Abstract Generic Class

المستودع الأساسي للتعامل مع قاعدة البيانات D1.

```typescript
abstract class BaseRepository<T extends { id?: number }> {
  protected db: D1Database;
  protected tableName: string;
  
  constructor(db: D1Database, tableName: string);
}
```

#### Query Methods / دوال الاستعلام

| Method | Parameters | Return | Description |
|--------|------------|--------|-------------|
| `findById()` | `id` | `Promise<T \| null>` | بحث بالمعرف |
| `findOneBy()` | `conditions` | `Promise<T \| null>` | بحث بشروط (واحد) |
| `findBy()` | `conditions, options?` | `Promise<T[]>` | بحث بشروط |
| `findAll()` | `options?` | `Promise<T[]>` | كل السجلات |
| `findPaginated()` | `pagination, conditions?, orderBy?, order?` | `Promise<PaginatedResult<T>>` | مع صفحات |
| `count()` | `conditions?` | `Promise<number>` | عدد السجلات |
| `exists()` | `conditions` | `Promise<boolean>` | هل موجود؟ |

#### Mutation Methods / دوال التعديل

| Method | Parameters | Return | Description |
|--------|------------|--------|-------------|
| `create()` | `data` | `Promise<InsertResult>` | إدراج سجل |
| `update()` | `id, data` | `Promise<UpdateResult>` | تحديث بالمعرف |
| `updateBy()` | `conditions, data` | `Promise<UpdateResult>` | تحديث بشروط |
| `delete()` | `id` | `Promise<DeleteResult>` | حذف بالمعرف |
| `deleteBy()` | `conditions` | `Promise<DeleteResult>` | حذف بشروط |

#### Raw Query Methods / استعلامات مباشرة

| Method | Parameters | Return | Description |
|--------|------------|--------|-------------|
| `rawQuery<R>()` | `query, params?` | `Promise<R[]>` | استعلام SELECT مخصص |
| `rawQueryFirst<R>()` | `query, params?` | `Promise<R \| null>` | استعلام واحد |
| `rawExecute()` | `query, params?` | `Promise<D1Result>` | أمر SQL مخصص |

---

### 1.4 I18nService

**File:** `src/core/i18n/I18nService.ts`
**Type:** Singleton Class

خدمة الترجمة المركزية.

```typescript
class I18nService {
  static getInstance(translations?: Translations): I18nService;
  static resetInstance(): void;
  
  setLocale(locale: Language): void;
  getLocale(): Language;
  t(key: string, locale?: Language, params?: Record<string, string | number>): string;
  isRTL(locale?: Language): boolean;
  getDir(locale?: Language): 'rtl' | 'ltr';
  getTranslations(locale?: Language): TranslationSet;
  addTranslations(locale: Language, translations: TranslationSet): void;
}
```

#### Helper Functions / دوال مساعدة

```typescript
// دالة ترجمة مختصرة
function t(key: string, locale?: Language, params?: Record<string, string | number>): string;

// اتجاه النص
function getDir(locale?: Language): 'rtl' | 'ltr';

// هل RTL؟
function isRTL(locale?: Language): boolean;
```

---

## 2. Auth Module

### 2.1 UserRepository

**File:** `src/modules/auth/AuthRepository.ts`

```typescript
class UserRepository extends BaseRepository<User> {
  findByEmail(email: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  findByOAuth(provider: string, oauthId: string): Promise<User | null>;
  findByVerificationToken(token: string): Promise<User | null>;
  findByResetToken(token: string): Promise<User | null>;
  createUser(data: CreateUserData): Promise<InsertResult>;
  createOAuthUser(data: CreateOAuthUserData): Promise<InsertResult>;
  verifyEmail(userId: number): Promise<boolean>;
  setResetToken(userId: number, token: string, expires: string): Promise<boolean>;
  updatePassword(userId: number, passwordHash: string): Promise<boolean>;
  linkOAuth(userId: number, provider: string, oauthId: string): Promise<boolean>;
  getPasswordHash(email: string): Promise<string | null>;
  isEmailUnique(email: string): Promise<boolean>;
  isUsernameUnique(username: string): Promise<boolean>;
}
```

### 2.2 SessionRepository

```typescript
class SessionRepository extends BaseRepository<Session> {
  findByToken(token: string): Promise<Session | null>;
  createSession(data: CreateSessionData): Promise<InsertResult>;
  deleteByToken(token: string): Promise<boolean>;
  deleteByUserId(userId: number): Promise<boolean>;
  cleanExpired(): Promise<number>;
  findSessionWithUser(token: string): Promise<(Session & { user: User }) | null>;
}
```

### 2.3 AuthService

```typescript
class AuthService {
  constructor(db: D1Database, resendApiKey: string);
  
  // Password helpers
  hashPassword(password: string): Promise<string>;
  verifyPassword(password: string, hash: string): Promise<boolean>;
  generateToken(length?: number): string;
  generateCode(length?: number): string;
  
  // Registration
  register(data: RegisterData, origin: string): Promise<AuthResult>;
  
  // Login
  login(data: LoginData, lang?: Language): Promise<AuthResult>;
  
  // OAuth
  handleOAuth(oauthUser: OAuthUser, lang?: Language): Promise<AuthResult>;
  
  // Session
  validateSession(token: string): Promise<User | null>;
  logout(token: string): Promise<boolean>;
  logoutAll(userId: number): Promise<boolean>;
  
  // Email verification
  verifyEmail(token: string): Promise<{ success: boolean; error?: string }>;
  resendVerification(email: string, origin: string, lang?: Language): Promise<{ success: boolean; error?: string }>;
  
  // Password reset
  forgotPassword(email: string, lang?: Language): Promise<{ success: boolean; error?: string }>;
  verifyResetCode(email: string, code: string): Promise<{ success: boolean; error?: string }>;
  resetPassword(email: string, code: string, newPassword: string): Promise<{ success: boolean; error?: string }>;
}
```

### 2.4 AuthController

```typescript
class AuthController extends BaseController {
  // Endpoints
  register(c: ControllerContext): Promise<Response>;
  login(c: ControllerContext): Promise<Response>;
  getSession(c: ControllerContext): Promise<Response>;
  logout(c: ControllerContext): Promise<Response>;
  verifyEmail(c: ControllerContext): Promise<Response>;
  resendVerification(c: ControllerContext): Promise<Response>;
  forgotPassword(c: ControllerContext): Promise<Response>;
  verifyResetCode(c: ControllerContext): Promise<Response>;
  resetPassword(c: ControllerContext): Promise<Response>;
  startOAuth(c: ControllerContext): Promise<Response>;
  handleOAuthCallback(c: ControllerContext): Promise<Response>;
  debugOAuth(c: ControllerContext): Promise<Response>;
}
```

---

## 3. Competition Module

### 3.1 CompetitionRepository

```typescript
class CompetitionRepository extends BaseRepository<Competition> {
  findWithDetails(filters: CompetitionFilters, pagination: PaginationOptions): Promise<{ data: CompetitionWithDetails[]; total: number }>;
  findByIdWithDetails(id: number): Promise<CompetitionWithDetails | null>;
  createCompetition(data: CreateCompetitionData): Promise<InsertResult>;
  joinAsOpponent(competitionId: number, opponentId: number): Promise<boolean>;
  startCompetition(competitionId: number): Promise<boolean>;
  endCompetition(competitionId: number): Promise<boolean>;
  cancelCompetition(competitionId: number): Promise<boolean>;
  updateVideoUrl(competitionId: number, userId: number, videoUrl: string, isCreator: boolean): Promise<boolean>;
  findByUserId(userId: number, pagination: PaginationOptions): Promise<{ data: CompetitionWithDetails[]; total: number }>;
  findLive(pagination: PaginationOptions): Promise<{ data: CompetitionWithDetails[]; total: number }>;
}
```

### 3.2 RatingRepository

```typescript
class RatingRepository extends BaseRepository<Rating> {
  addRating(competitionId: number, userId: number, competitorId: number, score: number): Promise<InsertResult>;
  getCompetitionRatings(competitionId: number): Promise<{ creator: { total: number; average: number }; opponent: { total: number; average: number } }>;
  getUserRating(competitionId: number, userId: number): Promise<Rating[]>;
}
```

### 3.3 CommentRepository

```typescript
class CommentRepository extends BaseRepository<Comment> {
  addComment(competitionId: number, userId: number, content: string): Promise<InsertResult>;
  getCompetitionComments(competitionId: number, pagination: PaginationOptions): Promise<{ data: (Comment & { user_name: string; user_avatar?: string })[]; total: number }>;
  deleteByOwner(commentId: number, userId: number): Promise<boolean>;
}
```

### 3.4 CompetitionService

```typescript
class CompetitionService {
  constructor(db: D1Database);
  
  // Queries
  getCompetitions(filters: CompetitionFilters, pagination: PaginationOptions): Promise<{ data: CompetitionWithDetails[]; total: number; hasMore: boolean }>;
  getCompetition(id: number): Promise<CompetitionWithDetails | null>;
  getLiveCompetitions(pagination: PaginationOptions): Promise<...>;
  getUserCompetitions(userId: number, pagination: PaginationOptions): Promise<...>;
  
  // Mutations
  createCompetition(data: CreateCompetitionData, user: User, lang?: Language): Promise<CompetitionResult>;
  joinCompetition(competitionId: number, user: User, lang?: Language): Promise<CompetitionResult>;
  startCompetition(competitionId: number, user: User, lang?: Language): Promise<CompetitionResult>;
  endCompetition(competitionId: number, user: User, lang?: Language): Promise<CompetitionResult>;
  cancelCompetition(competitionId: number, user: User, lang?: Language): Promise<CompetitionResult>;
  
  // Ratings
  addRating(competitionId: number, competitorId: number, score: number, user: User, lang?: Language): Promise<{ success: boolean; error?: string }>;
  getCompetitionRatings(competitionId: number): Promise<...>;
  
  // Comments
  addComment(competitionId: number, content: string, user: User, lang?: Language): Promise<{ success: boolean; comment?: any; error?: string }>;
  getComments(competitionId: number, pagination: PaginationOptions): Promise<...>;
  deleteComment(commentId: number, user: User, lang?: Language): Promise<{ success: boolean; error?: string }>;
}
```

### 3.5 CompetitionController

```typescript
class CompetitionController extends BaseController {
  list(c: ControllerContext): Promise<Response>;
  get(c: ControllerContext): Promise<Response>;
  getLive(c: ControllerContext): Promise<Response>;
  create(c: ControllerContext): Promise<Response>;
  join(c: ControllerContext): Promise<Response>;
  start(c: ControllerContext): Promise<Response>;
  end(c: ControllerContext): Promise<Response>;
  cancel(c: ControllerContext): Promise<Response>;
  addRating(c: ControllerContext): Promise<Response>;
  getRatings(c: ControllerContext): Promise<Response>;
  addComment(c: ControllerContext): Promise<Response>;
  getComments(c: ControllerContext): Promise<Response>;
  deleteComment(c: ControllerContext): Promise<Response>;
}
```

---

## 4. User Module

### 4.1 UserProfileRepository

```typescript
class UserProfileRepository extends BaseRepository<User> {
  findProfileWithStats(userId: number): Promise<UserWithStats | null>;
  findProfileByUsername(username: string): Promise<UserWithStats | null>;
  updateProfile(userId: number, data: UpdateUserData): Promise<boolean>;
  updatePreferences(userId: number, preferences: UserPreferences): Promise<boolean>;
  updateAvatar(userId: number, avatarUrl: string): Promise<boolean>;
  searchUsers(query: string, pagination: PaginationOptions): Promise<{ data: User[]; total: number }>;
  getTopUsers(limit?: number): Promise<UserWithStats[]>;
}
```

### 4.2 FollowRepository

```typescript
class FollowRepository extends BaseRepository<Follow> {
  follow(followerId: number, followingId: number): Promise<boolean>;
  unfollow(followerId: number, followingId: number): Promise<boolean>;
  isFollowing(followerId: number, followingId: number): Promise<boolean>;
  getFollowers(userId: number, pagination: PaginationOptions): Promise<{ data: User[]; total: number }>;
  getFollowing(userId: number, pagination: PaginationOptions): Promise<{ data: User[]; total: number }>;
}
```

### 4.3 NotificationRepository

```typescript
class NotificationRepository extends BaseRepository<Notification> {
  createNotification(userId: number, type: string, title: string, message: string, data?: any): Promise<InsertResult>;
  getUserNotifications(userId: number, pagination: PaginationOptions): Promise<{ data: Notification[]; total: number; unread: number }>;
  markAsRead(notificationId: number, userId: number): Promise<boolean>;
  markAllAsRead(userId: number): Promise<boolean>;
  deleteNotification(notificationId: number, userId: number): Promise<boolean>;
  deleteOld(daysOld?: number): Promise<number>;
}
```

### 4.4 UserService & UserController

Similar pattern to other modules - handles profile management, follow system, and notifications.

---

## 5. Category Module

### 5.1 CategoryRepository

```typescript
class CategoryRepository extends BaseRepository<Category> {
  findAllWithParents(): Promise<CategoryWithParent[]>;
  findMainCategories(): Promise<Category[]>;
  findSubcategories(parentId: number): Promise<Category[]>;
  findWithSubcategories(categoryId: number): Promise<{ category: Category | null; subcategories: Category[] }>;
  search(query: string): Promise<Category[]>;
}
```

### 5.2 CategoryController

```typescript
class CategoryController extends BaseController {
  list(c: ControllerContext): Promise<Response>;
  listMain(c: ControllerContext): Promise<Response>;
  get(c: ControllerContext): Promise<Response>;
  getSubcategories(c: ControllerContext): Promise<Response>;
  search(c: ControllerContext): Promise<Response>;
}
```

---

## 6. Types & Interfaces

### Core Types

```typescript
type Language = 'ar' | 'en';

type Bindings = {
  DB: D1Database;
  RESEND_API_KEY: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  FACEBOOK_CLIENT_ID: string;
  FACEBOOK_CLIENT_SECRET: string;
  MICROSOFT_CLIENT_ID: string;
  MICROSOFT_CLIENT_SECRET: string;
  MICROSOFT_TENANT_ID: string;
  TIKTOK_CLIENT_KEY: string;
  TIKTOK_CLIENT_SECRET: string;
};

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

interface PaginationOptions {
  limit: number;
  offset: number;
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}
```

### Entity Types

```typescript
interface User {
  id: number;
  email: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
  country_code?: string;
  preferred_language?: Language;
  is_verified: boolean;
  is_active: boolean;
  oauth_provider?: string;
  oauth_id?: string;
  created_at: string;
  updated_at?: string;
}

interface Competition {
  id: number;
  title: string;
  description?: string;
  category_id: number;
  creator_id: number;
  opponent_id?: number;
  status: 'pending' | 'waiting' | 'live' | 'completed' | 'cancelled';
  scheduled_at?: string;
  started_at?: string;
  ended_at?: string;
  creator_video_url?: string;
  opponent_video_url?: string;
  rules?: string;
  is_public: boolean;
  created_at: string;
  updated_at?: string;
}

interface Category {
  id: number;
  name_ar: string;
  name_en: string;
  description_ar?: string;
  description_en?: string;
  icon?: string;
  parent_id?: number;
  sort_order: number;
  is_active: boolean;
}
```

---

**End of API Reference**
