# 🎯 Dueli - منصة المناظرات والحوارات

<div align="center">

![Dueli Logo](public/static/dueli-icon.png)

[![License](https://img.shields.io/badge/license-Maelsh%20Pro-blue.svg)](LICENSE.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Hono](https://img.shields.io/badge/Hono-4.0-orange.svg)](https://hono.dev/)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers-orange.svg)](https://workers.cloudflare.com/)

**منصة عربية-إنجليزية للمناظرات والحوارات الحية**

[🌐 Demo](https://dueli.pages.dev) | [📖 Documentation](DOCUMENTATION.md) | [🔒 Privacy](PRIVACY.md)

</div>

---

## ✨ Features | المميزات

| Feature | الميزة |
|---------|--------|
| 🎤 **Live Debates** | مناظرات حية مباشرة |
| 🌍 **Bilingual (AR/EN)** | ثنائي اللغة عربي/إنجليزي |
| 📱 **Responsive Design** | تصميم متجاوب |
| 🌙 **Dark Mode** | الوضع الليلي |
| 🔐 **OAuth Login** | تسجيل دخول بـ Google, Facebook, Microsoft |
| 📊 **Categories** | فئات متعددة (سياسة، رياضة، تقنية...) |
| 💬 **Live Comments** | تعليقات مباشرة |
| ⭐ **Rating System** | نظام تقييم |

---

## 🏗 Architecture | الهيكلة

```
📦 dueli/
├── 📂 src/
│   ├── 📂 models/        # 🔵 Data Layer (MVC)
│   ├── 📂 controllers/   # 🟢 Logic Layer (MVC)
│   ├── 📂 routes/        # 🛣️ API Routes
│   ├── 📂 modules/       # 📄 Pages & API (Legacy)
│   ├── 📂 lib/           # 📚 OAuth, Services
│   ├── 📂 client/        # 💻 Client-side JS
│   ├── 📂 shared/        # 🔄 Shared Components
│   ├── 📂 config/        # ⚙️ Types & Config
│   ├── 📂 i18n/          # 🌐 Translations
│   └── 📄 main.ts        # 🚀 Entry Point
├── 📂 public/            # 🖼️ Static Assets
└── 📂 migrations/        # 🗃️ Database Migrations
```

---

## 🚀 Quick Start | البدء السريع

### Prerequisites | المتطلبات

- Node.js 18+
- npm or yarn
- Cloudflare account

### Installation | التثبيت

```bash
# Clone the repository
git clone https://github.com/Maelsh/dueli-opus.git
cd dueli-opus/webapp

# Install dependencies
npm install

# Setup environment
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your API keys

# Run locally
npm run dev:sandbox
```

### Environment Variables | متغيرات البيئة

```env
RESEND_API_KEY=your_resend_api_key
GOOGLE_CLIENT_ID=your_google_id
GOOGLE_CLIENT_SECRET=your_google_secret
FACEBOOK_CLIENT_ID=your_facebook_id
FACEBOOK_CLIENT_SECRET=your_facebook_secret
MICROSOFT_CLIENT_ID=your_microsoft_id
MICROSOFT_CLIENT_SECRET=your_microsoft_secret
MICROSOFT_TENANT_ID=your_microsoft_tenant
TIKTOK_CLIENT_KEY=your_tiktok_key
TIKTOK_CLIENT_SECRET=your_tiktok_secret
```

---

## 🛠 Tech Stack | التقنيات

| Category | Technology |
|----------|------------|
| **Runtime** | Cloudflare Workers |
| **Framework** | Hono 4.x |
| **Database** | Cloudflare D1 (SQLite) |
| **Styling** | TailwindCSS 4.x |
| **Language** | TypeScript 5.x |
| **Build** | Vite |
| **Email** | Resend API |

---

## 📁 Project Structure | هيكل المشروع

### Models (MVC)
- `UserModel` - إدارة المستخدمين
- `CompetitionModel` - إدارة المنافسات
- `CategoryModel` - إدارة الفئات
- `CommentModel` - إدارة التعليقات
- `NotificationModel` - إدارة الإشعارات
- `SessionModel` - إدارة الجلسات

### Controllers (MVC)
- `AuthController` - المصادقة والتسجيل
- `CompetitionController` - المنافسات
- `UserController` - المستخدمين
- `CategoryController` - الفئات

### Services (OOP)
- `EmailService` - إرسال البريد
- `CryptoUtils` - التشفير
- `BaseOAuthProvider` - مزودي OAuth

---

## 🔐 Authentication | المصادقة

Dueli supports multiple authentication methods:

- ✅ Email/Password with verification
- ✅ Google OAuth
- ✅ Facebook OAuth
- ✅ Microsoft OAuth
- ✅ TikTok OAuth

---

## 🌐 Internationalization | التعريب

Dueli is fully bilingual with RTL support:

```typescript
// Arabic
t('app_title', 'ar') // "ديولي"

// English
t('app_title', 'en') // "Dueli"
```

Supported languages: **Arabic (ar)**, **English (en)**

---

## 📜 Scripts | الأوامر

```bash
# Development
npm run dev           # Start dev server
npm run dev:sandbox   # Start with D1 sandbox

# Build
npm run build         # Build for production
npm run build:css     # Build TailwindCSS

# Database
npm run db:migrate    # Run migrations
npm run db:seed       # Seed database

# Deploy
npm run deploy        # Deploy to Cloudflare
```

---

## 🤝 Contributing | المساهمة

Contributions are welcome! See [Contributing Guide](CONTRIBUTING.md).

---

## 📄 License | الترخيص

This project is **open source** under the **Maelsh Pro License**.

- ✅ Free to use and modify
- ✅ Free to fork and learn from
- ❌ Commercial use requires permission from Maelsh Pro
- ❌ Selling or monetizing without permission is prohibited

See [LICENSE.md](LICENSE.md) for details.

---

## 🏢 About Maelsh Pro

**Maelsh Pro** is the company behind Dueli, dedicated to building innovative Arabic-first platforms.

- 🌐 Website: [maelsh.pro](https://maelsh.pro)
- 📧 Contact: contact@maelsh.pro

---

<div align="center">

**Made with ❤️ by Maelsh Pro**

</div>
