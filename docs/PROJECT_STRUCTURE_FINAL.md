# هيكلية المشروع النهائية - منصة ديولي
# Final Project Structure - Dueli Platform

---

## الهيكل الكامل | Complete Structure

```
dueli-platform/
├── 📁 docs/                           # التوثيق
│   ├── REFACTORING_FINAL_REPORT.md
│   ├── PROJECT_STRUCTURE_FINAL.md
│   ├── API_REFERENCE_FINAL.md
│   └── FUNCTIONS_CLASSES.md
│
├── 📁 public/                         # الملفات الثابتة
│   └── static/
│       ├── app.js
│       ├── styles.css
│       ├── dueli-icon.png
│       └── about/
│
├── 📁 src/                            # الكود المصدري
│   │
│   ├── 📁 config/                     # الإعدادات والأنواع
│   │   └── types.ts                   # تعريفات TypeScript
│   │
│   ├── 📁 modules/                    # الوحدات الرئيسية
│   │   │
│   │   ├── 📁 api/                    # API Routes
│   │   │   ├── 📁 auth/               # المصادقة
│   │   │   │   ├── helpers.ts         # دوال المساعدة
│   │   │   │   ├── routes.ts          # مسارات المصادقة الأساسية
│   │   │   │   └── oauth-routes.ts    # مسارات OAuth
│   │   │   │
│   │   │   ├── 📁 categories/         # الفئات
│   │   │   │   └── routes.ts          # CRUD الفئات
│   │   │   │
│   │   │   ├── 📁 competitions/       # المنافسات
│   │   │   │   └── routes.ts          # CRUD المنافسات + التعليقات + التقييم
│   │   │   │
│   │   │   ├── 📁 countries/          # الدول
│   │   │   │   └── routes.ts          # جلب الدول
│   │   │   │
│   │   │   ├── 📁 notifications/      # الإشعارات
│   │   │   │   └── routes.ts          # إدارة الإشعارات
│   │   │   │
│   │   │   └── 📁 users/              # المستخدمين
│   │   │       └── routes.ts          # الملف الشخصي + المتابعة
│   │   │
│   │   └── 📁 pages/                  # صفحات HTML
│   │       ├── index.ts               # فهرس التصدير
│   │       ├── about-page.ts          # صفحة عن ديولي
│   │       ├── verify-page.ts         # صفحة تأكيد البريد
│   │       ├── competition-page.ts    # صفحة تفاصيل المنافسة
│   │       ├── create-page.ts         # صفحة إنشاء منافسة
│   │       ├── explore-page.ts        # صفحة الاستكشاف
│   │       └── static-pages.ts        # الصفحات الثابتة (privacy, etc)
│   │
│   ├── 📁 shared/                     # المكونات المشتركة
│   │   │
│   │   ├── 📁 components/             # UI Components
│   │   │   ├── index.ts               # فهرس التصدير
│   │   │   ├── navigation.ts          # شريط التنقل
│   │   │   ├── login-modal.ts         # نافذة تسجيل الدخول
│   │   │   └── footer.ts              # التذييل
│   │   │
│   │   └── 📁 templates/              # قوالب HTML
│   │       └── layout.ts              # القالب الأساسي
│   │
│   ├── 📁 lib/                        # المكتبات الخارجية
│   │   └── 📁 oauth/                  # OAuth Providers
│   │       ├── google.ts
│   │       ├── facebook.ts
│   │       ├── microsoft.ts
│   │       └── tiktok.ts
│   │
│   ├── 📁 routes/                     # مسارات إضافية
│   │   └── jitsi.ts                   # Jitsi integration
│   │
│   ├── i18n.ts                        # نظام الترجمة
│   └── main.ts                        # ⭐ نقطة الدخول الرئيسية
│
├── vite.config.ts                     # إعدادات Vite
├── tsconfig.json                      # إعدادات TypeScript
├── package.json                       # الحزم
└── wrangler.toml                      # إعدادات Cloudflare
```

---

## تفاصيل الملفات | File Details

### 1. نقطة الدخول | Entry Point

| الملف | الوصف | الحجم |
|-------|-------|-------|
| `src/main.ts` | نقطة الدخول الرئيسية للتطبيق | 431 سطر |

### 2. الإعدادات | Configuration

| الملف | الوصف | الحجم |
|-------|-------|-------|
| `src/config/types.ts` | تعريفات TypeScript للأنواع | 83 سطر |

### 3. API Routes

| الملف | الوصف | الحجم |
|-------|-------|-------|
| `src/modules/api/auth/helpers.ts` | دوال المصادقة المساعدة | 142 سطر |
| `src/modules/api/auth/routes.ts` | مسارات المصادقة | 421 سطر |
| `src/modules/api/auth/oauth-routes.ts` | مسارات OAuth | 193 سطر |
| `src/modules/api/categories/routes.ts` | مسارات الفئات | 95 سطر |
| `src/modules/api/competitions/routes.ts` | مسارات المنافسات | 398 سطر |
| `src/modules/api/countries/routes.ts` | مسارات الدول | 48 سطر |
| `src/modules/api/notifications/routes.ts` | مسارات الإشعارات | 89 سطر |
| `src/modules/api/users/routes.ts` | مسارات المستخدمين | 135 سطر |

### 4. Pages

| الملف | الوصف | الحجم |
|-------|-------|-------|
| `src/modules/pages/about-page.ts` | صفحة عن ديولي | 185 سطر |
| `src/modules/pages/verify-page.ts` | صفحة التحقق | 67 سطر |
| `src/modules/pages/competition-page.ts` | صفحة المنافسة | 292 سطر |
| `src/modules/pages/create-page.ts` | صفحة الإنشاء | 159 سطر |
| `src/modules/pages/explore-page.ts` | صفحة الاستكشاف | 86 سطر |
| `src/modules/pages/static-pages.ts` | الصفحات الثابتة | 163 سطر |

### 5. Shared Components

| الملف | الوصف | الحجم |
|-------|-------|-------|
| `src/shared/components/navigation.ts` | شريط التنقل | 127 سطر |
| `src/shared/components/login-modal.ts` | نافذة تسجيل الدخول | 287 سطر |
| `src/shared/components/footer.ts` | التذييل | 27 سطر |
| `src/shared/templates/layout.ts` | القالب الأساسي | 58 سطر |

---

## التبعيات بين الملفات | File Dependencies

```
main.ts
├── config/types.ts
├── i18n.ts
├── modules/api/auth/routes.ts
│   └── modules/api/auth/helpers.ts
├── modules/api/auth/oauth-routes.ts
│   ├── lib/oauth/google.ts
│   ├── lib/oauth/facebook.ts
│   ├── lib/oauth/microsoft.ts
│   └── lib/oauth/tiktok.ts
├── modules/api/categories/routes.ts
├── modules/api/competitions/routes.ts
├── modules/api/countries/routes.ts
├── modules/api/notifications/routes.ts
├── modules/api/users/routes.ts
├── modules/pages/*
│   └── shared/components/*
│       └── shared/templates/layout.ts
└── routes/jitsi.ts
```

---

## الملفات القديمة (يمكن حذفها) | Legacy Files

```
src/
├── index.tsx          # ❌ تم استبداله بـ main.ts
├── app.ts             # ❌ ملف قديم
├── api/               # ❌ تم نقله إلى modules/api/
├── templates/         # ❌ تم نقله إلى shared/templates/
├── components/        # ❌ تم نقله إلى shared/components/
├── pages/             # ❌ تم نقله إلى modules/pages/
├── middleware/        # ❌ يمكن دمجه في main.ts
├── utils/             # ❌ يمكن نقله إلى shared/
├── constants/         # ❌ يمكن دمجه في config/
└── core/              # ❌ محاولة سابقة، يمكن حذفها
```

---

## كيفية الإضافة | How to Add

### إضافة API جديد
1. أنشئ مجلد في `src/modules/api/{feature}/`
2. أنشئ ملف `routes.ts`
3. أضف المسار في `src/main.ts`

### إضافة صفحة جديدة
1. أنشئ ملف في `src/modules/pages/{page-name}.ts`
2. صدّر الدالة من `src/modules/pages/index.ts`
3. أضف المسار في `src/main.ts`

### إضافة مكون مشترك
1. أنشئ ملف في `src/shared/components/{component}.ts`
2. صدّر من `src/shared/components/index.ts`
3. استخدمه في أي صفحة

---

تاريخ التحديث: 2025-12-08
