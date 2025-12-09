# Dueli Platform - Project Structure
# هيكلة مشروع ديولي

**Version:** 2.0.0
**Last Updated:** 2025-12-07

---

## Complete File Tree / شجرة الملفات الكاملة

```
dueli/
├── 📁 docs/                           # Documentation
│   ├── ARCHITECTURE_PLAN.md          # خطة الهيكلة
│   ├── REFACTORING_REPORT.md         # تقرير إعادة الهيكلة
│   ├── PROJECT_STRUCTURE.md          # هيكلة المشروع (هذا الملف)
│   └── API_REFERENCE.md              # مرجع الدوال والكلاسات
│
├── 📁 src/                            # Source Code
│   │
│   ├── 📁 core/                       # ═══ CORE LAYER ═══
│   │   │
│   │   ├── 📁 http/                   # HTTP Components
│   │   │   ├── types.ts              # 🔷 All TypeScript interfaces
│   │   │   ├── Validator.ts          # 🔷 Generic DTO Validator class
│   │   │   ├── BaseController.ts     # 🔷 Abstract BaseController class
│   │   │   └── index.ts              # Exports
│   │   │
│   │   ├── 📁 database/               # Database Components
│   │   │   ├── BaseRepository.ts     # 🔷 Generic BaseRepository class
│   │   │   └── index.ts              # Exports
│   │   │
│   │   ├── 📁 i18n/                   # Internationalization
│   │   │   ├── I18nService.ts        # 🔷 Singleton I18nService class
│   │   │   └── index.ts              # Exports
│   │   │
│   │   └── index.ts                   # Core exports
│   │
│   ├── 📁 modules/                    # ═══ MODULES (Vertical Slices) ═══
│   │   │
│   │   ├── 📁 auth/                   # 🔐 Authentication Module
│   │   │   ├── AuthRepository.ts     # 🔷 UserRepository, SessionRepository
│   │   │   ├── AuthService.ts        # 🔷 AuthService class
│   │   │   ├── AuthController.ts     # 🔷 AuthController class
│   │   │   ├── routes.ts             # Hono routes
│   │   │   └── index.ts              # Exports
│   │   │
│   │   ├── 📁 competitions/           # 🏆 Competition Module
│   │   │   ├── CompetitionRepository.ts  # 🔷 Competition, Rating, Comment repos
│   │   │   ├── CompetitionService.ts     # 🔷 CompetitionService class
│   │   │   ├── CompetitionController.ts  # 🔷 CompetitionController class
│   │   │   ├── routes.ts             # Hono routes
│   │   │   └── index.ts              # Exports
│   │   │
│   │   ├── 📁 users/                  # 👤 User Module
│   │   │   ├── UserRepository.ts     # 🔷 UserProfile, Follow, Notification repos
│   │   │   ├── UserService.ts        # 🔷 UserService class
│   │   │   ├── UserController.ts     # 🔷 UserController class
│   │   │   ├── routes.ts             # Hono routes
│   │   │   └── index.ts              # Exports
│   │   │
│   │   ├── 📁 categories/             # 📂 Category Module
│   │   │   ├── CategoryRepository.ts # 🔷 CategoryRepository class
│   │   │   ├── CategoryController.ts # 🔷 CategoryController class
│   │   │   ├── routes.ts             # Hono routes
│   │   │   └── index.ts              # Exports
│   │   │
│   │   └── index.ts                   # All modules export
│   │
│   ├── 📁 lib/                        # ═══ EXTERNAL LIBRARIES ═══
│   │   └── 📁 oauth/                  # OAuth Providers
│   │       ├── google.ts             # 🔷 GoogleOAuth class
│   │       ├── facebook.ts           # 🔷 FacebookOAuth class
│   │       ├── microsoft.ts          # 🔷 MicrosoftOAuth class
│   │       ├── tiktok.ts             # 🔷 TikTokOAuth class
│   │       ├── types.ts              # OAuth types
│   │       └── utils.ts              # OAuth utilities
│   │
│   ├── 📁 routes/                     # ═══ ADDITIONAL ROUTES ═══
│   │   └── jitsi.ts                  # Jitsi integration routes
│   │
│   ├── app.ts                         # 🚀 NEW Main Application Entry
│   ├── index.tsx                      # 📜 OLD Monolithic file (legacy)
│   ├── styles.css                     # TailwindCSS source
│   ├── i18n.ts                        # Legacy i18n
│   └── countries.ts                   # Country data
│
├── 📁 public/                         # Static Files
│   ├── 📁 static/
│   │   ├── app.js                    # Frontend JavaScript
│   │   └── styles.css                # Compiled CSS
│   ├── privacy-policy.html
│   └── data-deletion.html
│
├── 📁 migrations/                     # Database Migrations
│   ├── 0001_initial_schema.sql
│   ├── 0002_add_auth_fields.sql
│   └── 0003_add_oauth_fields.sql
│
├── 📁 dist/                           # Build Output
│   └── _worker.js                    # Compiled worker
│
├── 📄 Configuration Files
│   ├── package.json                  # npm configuration
│   ├── tsconfig.json                 # TypeScript config
│   ├── vite.config.ts                # Vite config
│   ├── tailwind.config.js            # TailwindCSS config
│   ├── postcss.config.js             # PostCSS config
│   ├── wrangler.jsonc                # Cloudflare Wrangler config
│   └── ecosystem.config.cjs          # PM2 config
│
├── 📄 Documentation
│   ├── README.md                     # Main readme
│   ├── ROADMAP.md                    # Development roadmap
│   ├── GIT_WORKFLOW.md               # Git workflow guide
│   └── JITSI_LOCAL_SETUP.md          # Jitsi setup guide
│
└── 📄 Other Files
    ├── .gitignore
    ├── LICENSE
    └── seed.sql                      # Database seed data
```

---

## Module Architecture / هيكلة الوحدات

### Each Module Contains / كل وحدة تحتوي على:

```
module/
├── *Repository.ts    # Data Access Layer (DAL)
│   └── Extends BaseRepository<T>
│   └── Direct D1 database operations
│
├── *Service.ts       # Business Logic Layer (BLL)
│   └── Business rules and validation
│   └── Orchestrates repository operations
│
├── *Controller.ts    # Presentation Layer
│   └── Extends BaseController
│   └── HTTP request/response handling
│
├── routes.ts         # Route Definitions
│   └── Hono route bindings
│   └── Maps URLs to controller methods
│
└── index.ts          # Public Exports
    └── Re-exports all public components
```

---

## Import Hierarchy / تسلسل الاستيراد

```
┌─────────────────────────────────────────────────────────────┐
│                         app.ts                               │
│                    (Application Entry)                       │
└───────────────────────────┬─────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   modules/  │    │    core/    │    │    lib/     │
│   routes    │    │             │    │             │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │
       ▼                  │                  │
┌─────────────┐           │                  │
│ Controllers │◄──────────┤                  │
└──────┬──────┘           │                  │
       │                  │                  │
       ▼                  │                  │
┌─────────────┐           │                  │
│  Services   │◄──────────┼──────────────────┤
└──────┬──────┘           │                  │
       │                  │                  │
       ▼                  │                  │
┌─────────────┐           │                  │
│Repositories │◄──────────┘                  │
└──────┬──────┘                              │
       │                                     │
       ▼                                     │
┌─────────────────────────────────────────────────────────────┐
│                    D1 Database (Cloudflare)                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Key File Descriptions / وصف الملفات الرئيسية

### Core Files

| File | Purpose | Size |
|------|---------|------|
| `core/http/types.ts` | All shared TypeScript types and interfaces | 4.3KB |
| `core/http/Validator.ts` | Generic validation without external dependencies | 9.8KB |
| `core/http/BaseController.ts` | Abstract class with HTTP helper methods | 10.4KB |
| `core/database/BaseRepository.ts` | Generic CRUD operations for D1 | 13.9KB |
| `core/i18n/I18nService.ts` | Singleton translation service | 13.7KB |

### Module Files

| Module | Files | Total Size |
|--------|-------|------------|
| auth/ | 5 files | ~42KB |
| competitions/ | 5 files | ~37KB |
| users/ | 5 files | ~31KB |
| categories/ | 4 files | ~7KB |

### Entry Points

| File | Purpose |
|------|---------|
| `app.ts` | New modular entry point |
| `index.tsx` | Legacy monolithic file (deprecated) |

---

## Naming Conventions / اصطلاحات التسمية

| Type | Convention | Example |
|------|------------|---------|
| Class | PascalCase | `AuthController` |
| Interface | PascalCase | `ApiResponse` |
| Type | PascalCase | `Language` |
| Function | camelCase | `validateSession` |
| Variable | camelCase | `currentUser` |
| Constant | UPPER_SNAKE | `HTTP_STATUS` |
| File | PascalCase.ts | `AuthService.ts` |
| Module folder | lowercase | `auth/` |

---

## File Size Summary / ملخص أحجام الملفات

```
Total New Code:     ~120KB
├── Core:           ~52KB (43%)
├── Auth Module:    ~42KB (35%)
├── Competitions:   ~37KB (31%)
├── Users:          ~31KB (26%)
└── Categories:     ~7KB  (6%)

Old Monolithic:     ~140KB
New Distributed:    ~120KB
Savings:            ~20KB (14%)
```

---

**Legend / المفتاح:**
- 🔷 = Class
- 📁 = Directory
- 📄 = File
- 🚀 = Entry Point
- 🔐 = Auth related
- 🏆 = Competition related
- 👤 = User related
- 📂 = Category related
