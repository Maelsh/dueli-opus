# Dueli Platform - Architecture Plan
# خطة هيكلة منصة ديولي

**Version:** 2.0.0
**Date:** 2025-12-07
**Author:** Claude AI Assistant
**Status:** IMPLEMENTED

---

## 1. Strategic Goal / الهدف الاستراتيجي

Establish a robust, scalable, and strictly OOP foundation for the Opus Dueli application, adhering to the **Vertical Slice Architecture (VSA)** pattern.

إنشاء أساس قوي وقابل للتوسع ومتوافق مع مبادئ البرمجة كائنية التوجه (OOP) لتطبيق Opus Dueli، باتباع نمط **العمارة العمودية الشرائحية (VSA)**.

---

## 2. Architecture Overview / نظرة عامة على الهيكلة

### 2.1 Pattern: Vertical Slice Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Application                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────┐ │
│  │    Auth     │  │Competitions │  │    Users    │  │Categories│ │
│  │   Module    │  │   Module    │  │   Module    │  │  Module  │ │
│  ├─────────────┤  ├─────────────┤  ├─────────────┤  ├─────────┤ │
│  │ Controller  │  │ Controller  │  │ Controller  │  │Controller│ │
│  │  Service    │  │  Service    │  │  Service    │  │   Repo   │ │
│  │ Repository  │  │ Repository  │  │ Repository  │  │          │ │
│  │   Routes    │  │   Routes    │  │   Routes    │  │  Routes  │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                          Core Layer                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │    HTTP     │  │  Database   │  │    i18n     │              │
│  │BaseController│  │BaseRepository│ │ I18nService │              │
│  │  Validator  │  │             │  │             │              │
│  │   Types     │  │             │  │             │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
├─────────────────────────────────────────────────────────────────┤
│                     Infrastructure                               │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │           Cloudflare Workers + D1 Database                  ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Design Patterns Used / أنماط التصميم المستخدمة

| Pattern | Location | Purpose |
|---------|----------|---------|
| **Singleton** | I18nService | Single translation instance |
| **Repository** | BaseRepository, *Repository | Database abstraction |
| **Service Layer** | *Service | Business logic encapsulation |
| **MVC** | Controllers, Services, Routes | Separation of concerns |
| **Factory** | OAuth classes | OAuth provider creation |
| **Dependency Injection** | Constructors | Loose coupling |

---

## 3. Folder Structure / هيكل المجلدات

```
src/
├── core/                          # المكونات الأساسية
│   ├── http/
│   │   ├── types.ts              # All TypeScript interfaces
│   │   ├── Validator.ts          # Generic DTO validator (no Zod!)
│   │   ├── BaseController.ts     # Abstract base controller
│   │   └── index.ts
│   ├── database/
│   │   ├── BaseRepository.ts     # Generic CRUD operations
│   │   └── index.ts
│   ├── i18n/
│   │   ├── I18nService.ts        # Singleton translation service
│   │   └── index.ts
│   └── index.ts
│
├── modules/                       # الوحدات (Vertical Slices)
│   ├── auth/                      # وحدة المصادقة
│   │   ├── AuthRepository.ts     # User & Session repositories
│   │   ├── AuthService.ts        # Authentication business logic
│   │   ├── AuthController.ts     # HTTP request handlers
│   │   ├── routes.ts             # Hono route definitions
│   │   └── index.ts
│   │
│   ├── competitions/              # وحدة المنافسات
│   │   ├── CompetitionRepository.ts
│   │   ├── CompetitionService.ts
│   │   ├── CompetitionController.ts
│   │   ├── routes.ts
│   │   └── index.ts
│   │
│   ├── users/                     # وحدة المستخدمين
│   │   ├── UserRepository.ts     # User, Follow, Notification repos
│   │   ├── UserService.ts
│   │   ├── UserController.ts
│   │   ├── routes.ts
│   │   └── index.ts
│   │
│   ├── categories/                # وحدة التصنيفات
│   │   ├── CategoryRepository.ts
│   │   ├── CategoryController.ts
│   │   ├── routes.ts
│   │   └── index.ts
│   │
│   └── index.ts                   # تصدير جميع الوحدات
│
├── lib/                           # مكتبات خارجية
│   └── oauth/                     # OAuth providers
│
├── routes/                        # مسارات إضافية
│   └── jitsi.ts
│
└── app.ts                         # نقطة الدخول الرئيسية
```

---

## 4. Core Components / المكونات الأساسية

### 4.1 BaseController

```typescript
abstract class BaseController {
  // Response methods
  protected ok<T>(c, data?, message?, status?)
  protected created<T>(c, data, message?)
  protected badRequest(c, error)
  protected unauthorized(c, error?)
  protected notFound(c, error?)
  protected serverError(c, error?)
  
  // Request helpers
  protected parseBody<T>(c)
  protected parseAndValidate<T>(c, schema)
  protected getParam(c, name)
  protected getPagination(c)
  
  // Context helpers
  protected getLang(c)
  protected getUser(c)
  protected getDB(c)
  protected getCookie(c, name)
  protected setCookie(c, name, value, options)
}
```

### 4.2 BaseRepository

```typescript
abstract class BaseRepository<T> {
  // Query methods
  async findById(id): Promise<T | null>
  async findOneBy(conditions): Promise<T | null>
  async findBy(conditions, options): Promise<T[]>
  async findAll(options): Promise<T[]>
  async findPaginated(pagination, conditions?, orderBy?, order?)
  async count(conditions?): Promise<number>
  async exists(conditions): Promise<boolean>
  
  // Mutation methods
  async create(data): Promise<InsertResult>
  async update(id, data): Promise<UpdateResult>
  async delete(id): Promise<DeleteResult>
  
  // Raw queries
  async rawQuery<R>(query, params): Promise<R[]>
  async rawExecute(query, params): Promise<D1Result>
}
```

### 4.3 Validator

```typescript
class Validator {
  // Main validation
  static validate<T>(data, schema): ValidationResult<T>
  
  // Quick validators
  static isEmail(value): boolean
  static isUrl(value): boolean
  static isUuid(value): boolean
  
  // Sanitizers
  static sanitize(value): string
  static toInt(value, defaultValue): number
  static toBool(value): boolean
}
```

### 4.4 I18nService (Singleton)

```typescript
class I18nService {
  static getInstance(): I18nService
  setLocale(locale: Language): void
  getLocale(): Language
  t(key, locale?, params?): string
  isRTL(locale?): boolean
  getDir(locale?): 'rtl' | 'ltr'
}
```

---

## 5. Module Structure / هيكل الوحدة

Each module follows this pattern:
كل وحدة تتبع هذا النمط:

```
module/
├── *Repository.ts    # Data access layer
├── *Service.ts       # Business logic (optional for simple modules)
├── *Controller.ts    # HTTP handlers
├── routes.ts         # Hono routes
└── index.ts          # Public exports
```

### Flow / التدفق:

```
Request → Routes → Controller → Service → Repository → D1 Database
                        ↓
                    Response
```

---

## 6. API Endpoints / نقاط API

### Auth Module
- `POST /api/auth/register` - تسجيل مستخدم جديد
- `POST /api/auth/login` - تسجيل الدخول
- `GET /api/auth/session` - الحصول على الجلسة
- `POST /api/auth/logout` - تسجيل الخروج
- `GET /api/auth/verify` - التحقق من البريد
- `POST /api/auth/forgot-password` - نسيت كلمة المرور
- `POST /api/auth/reset-password` - إعادة تعيين كلمة المرور
- `GET /api/auth/oauth/:provider` - بدء OAuth
- `GET /api/auth/oauth/:provider/callback` - معالجة OAuth

### Competition Module
- `GET /api/competitions` - قائمة المنافسات
- `GET /api/competitions/live` - المنافسات المباشرة
- `GET /api/competitions/:id` - تفاصيل منافسة
- `POST /api/competitions` - إنشاء منافسة
- `POST /api/competitions/:id/join` - الانضمام
- `POST /api/competitions/:id/start` - بدء المنافسة
- `POST /api/competitions/:id/end` - إنهاء المنافسة
- `GET /api/competitions/:id/ratings` - التقييمات
- `POST /api/competitions/:id/ratings` - إضافة تقييم
- `GET /api/competitions/:id/comments` - التعليقات
- `POST /api/competitions/:id/comments` - إضافة تعليق

### User Module
- `GET /api/users/me` - الملف الشخصي
- `PUT /api/users/me` - تحديث الملف
- `PUT /api/users/preferences` - تحديث التفضيلات
- `GET /api/users/search` - بحث المستخدمين
- `GET /api/users/top` - أفضل المستخدمين
- `GET /api/users/:id` - ملف مستخدم
- `POST /api/users/:id/follow` - متابعة
- `POST /api/users/:id/unfollow` - إلغاء المتابعة
- `GET /api/users/:id/followers` - المتابعون
- `GET /api/users/:id/following` - المتابَعون

### Notification Module
- `GET /api/notifications` - الإشعارات
- `POST /api/notifications/read-all` - تحديد الكل مقروء
- `POST /api/notifications/:id/read` - تحديد مقروء
- `DELETE /api/notifications/:id` - حذف إشعار

### Category Module
- `GET /api/categories` - كل التصنيفات
- `GET /api/categories/main` - التصنيفات الرئيسية
- `GET /api/categories/:id` - تفاصيل تصنيف
- `GET /api/categories/:id/subcategories` - التصنيفات الفرعية

---

## 7. Architectural Constraints / القيود المعمارية

1. **Strict OOP** - جميع المنطق في Classes
2. **Zero-Dependency Validation** - بدون Zod أو Joi
3. **Direct D1 Access** - بدون ORM
4. **No React** - الحفاظ على Hono JSX
5. **Singleton Pattern** - للـ I18nService فقط
6. **Repository Pattern** - لجميع عمليات قاعدة البيانات

---

## 8. Benefits / الفوائد

- **Scalability** - سهولة إضافة وحدات جديدة
- **Maintainability** - كل وحدة مستقلة
- **Testability** - سهولة اختبار كل طبقة
- **Code Reuse** - مكونات Core مشتركة
- **Type Safety** - TypeScript في كل مكان
- **Separation of Concerns** - فصل واضح للمسؤوليات

---

## 9. Migration Strategy / استراتيجية الترحيل

1. ✅ إنشاء core/ مع BaseController, Validator, BaseRepository
2. ✅ إنشاء I18nService كـ Singleton
3. ✅ إنشاء modules/auth
4. ✅ إنشاء modules/competitions
5. ✅ إنشاء modules/users
6. ✅ إنشاء modules/categories
7. ✅ إنشاء app.ts الجديد
8. ⏳ ترحيل index.tsx التدريجي (اختياري)
9. ⏳ حذف الملفات القديمة (اختياري)

---

**Status:** All core components implemented and tested.
