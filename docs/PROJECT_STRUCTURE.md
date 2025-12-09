# هيكلية المشروع النهائية - منصة ديولي
# Final Project Structure - Dueli Platform

**تاريخ التحديث:** 2025-12-09
**Version:** 3.0.0

---

## الهيكل الكامل | Complete Structure

```
dueli-platform/
├── 📁 docs/                           # التوثيق
│   ├── PROJECT_STRUCTURE.md           # هذا الملف
│   ├── ARCHITECTURE_PLAN.md
│   └── API_REFERENCE.md
│
├── 📁 public/                         # الملفات الثابتة
│   └── static/
│       ├── styles.css
│       ├── dueli-icon.png
│       └── about/
│
├── 📁 src/                            # الكود المصدري
│   │
│   ├── 📁 config/                     # الإعدادات والأنواع
│   │   └── types.ts                   # تعريفات TypeScript الرئيسية
│   │
│   ├── 📁 client/                     # 🆕 Frontend Client Modules
│   │   ├── index.ts                   # نقطة الدخول للعميل
│   │   ├── 📁 core/                   # المكونات الأساسية
│   │   │   ├── State.ts               # إدارة الحالة
│   │   │   ├── ApiClient.ts           # عميل API
│   │   │   ├── CookieUtils.ts         # أدوات الكوكيز
│   │   │   └── index.ts
│   │   ├── 📁 services/               # الخدمات
│   │   │   ├── AuthService.ts         # خدمة المصادقة
│   │   │   ├── ThemeService.ts        # الوضع الليلي
│   │   │   ├── CountryService.ts      # الدول واللغات
│   │   │   └── index.ts
│   │   ├── 📁 ui/                     # مكونات UI
│   │   │   ├── Toast.ts               # الإشعارات
│   │   │   ├── Modal.ts               # النوافذ المنبثقة
│   │   │   ├── Menu.ts                # القوائم المنسدلة
│   │   │   └── index.ts
│   │   └── 📁 helpers/                # الأدوات المساعدة
│   │       ├── DateFormatter.ts       # تنسيق التاريخ
│   │       ├── NumberFormatter.ts     # تنسيق الأرقام
│   │       ├── YouTubeHelpers.ts      # أدوات يوتيوب
│   │       ├── Utils.ts               # أدوات عامة
│   │       └── index.ts
│   │
│   ├── 📁 modules/                    # الوحدات الرئيسية (VSA)
│   │   │
│   │   ├── 📁 api/                    # API Routes
│   │   │   ├── 📁 auth/               # المصادقة
│   │   │   │   ├── helpers.ts
│   │   │   │   ├── routes.ts
│   │   │   │   └── oauth-routes.ts
│   │   │   ├── 📁 categories/         # الفئات
│   │   │   ├── 📁 competitions/       # المنافسات
│   │   │   ├── 📁 countries/          # الدول
│   │   │   ├── 📁 notifications/      # الإشعارات
│   │   │   └── 📁 users/              # المستخدمين
│   │   │
│   │   ├── 📁 auth/                   # Auth Module (OOP)
│   │   │   ├── AuthRepository.ts
│   │   │   ├── AuthService.ts
│   │   │   ├── AuthController.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── 📁 competitions/           # Competitions Module
│   │   │   ├── CompetitionRepository.ts
│   │   │   ├── CompetitionService.ts
│   │   │   ├── CompetitionController.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── 📁 users/                  # Users Module
│   │   │   ├── UserRepository.ts
│   │   │   ├── UserService.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── 📁 categories/             # Categories Module
│   │   │
│   │   └── 📁 pages/                  # صفحات HTML
│   │       ├── about-page.ts
│   │       ├── verify-page.ts
│   │       ├── competition-page.ts
│   │       ├── create-page.ts
│   │       ├── explore-page.ts
│   │       └── static-pages.ts
│   │
│   ├── 📁 shared/                     # المكونات المشتركة
│   │   ├── 📁 components/
│   │   │   ├── navigation.ts
│   │   │   ├── login-modal.ts
│   │   │   └── footer.ts
│   │   └── 📁 templates/
│   │       └── layout.ts
│   │
│   ├── 📁 i18n/                       # نظام الترجمة
│   │   ├── translations.ts            # النصوص المترجمة
│   │   ├── types.ts                   # أنواع الترجمة
│   │   └── index.ts
│   │
│   ├── 📁 lib/                        # المكتبات الخارجية
│   │   └── 📁 oauth/
│   │       ├── google.ts
│   │       ├── facebook.ts
│   │       ├── microsoft.ts
│   │       └── tiktok.ts
│   │
│   ├── 📁 routes/                     # مسارات إضافية
│   │   └── jitsi.ts
│   │
│   ├── countries.ts                   # بيانات الدول
│   ├── styles.css                     # CSS
│   └── main.ts                        # ⭐ نقطة الدخول الرئيسية
│
├── vite.config.ts                     # إعدادات Vite + Client bundling
├── tsconfig.json
├── package.json
└── wrangler.jsonc
```

---

## الملفات الجديدة (v3.0) | New Files

### src/client/ - Frontend Client Modules (16 files)

| File | Description |
|------|-------------|
| `index.ts` | Main entry, window.dueli API |
| `core/State.ts` | Global state management |
| `core/ApiClient.ts` | HTTP client with auth |
| `core/CookieUtils.ts` | Cookie utilities |
| `services/AuthService.ts` | Login, OAuth, logout |
| `services/ThemeService.ts` | Dark/light mode |
| `services/CountryService.ts` | Country/language selection |
| `ui/Toast.ts` | Toast notifications |
| `ui/Modal.ts` | Modal dialogs |
| `ui/Menu.ts` | Dropdown menus |
| `helpers/DateFormatter.ts` | Date formatting |
| `helpers/NumberFormatter.ts` | Number formatting |
| `helpers/YouTubeHelpers.ts` | YouTube utilities |
| `helpers/Utils.ts` | General utilities |

---

## التبعيات | Dependencies

```
main.ts (Backend)
├── config/types.ts
├── i18n/
├── modules/api/*
├── modules/pages/*
├── shared/components/*
└── lib/oauth/*

client/index.ts (Frontend - Bundled by Vite)
├── client/core/*
├── client/services/*
├── client/ui/*
└── client/helpers/*
```

---

## Vite Build Outputs

```
dist/
├── index.js           # Backend (Cloudflare Worker)
└── static/
    └── client.js      # Frontend bundle
```

---

تاريخ التحديث: 2025-12-09
