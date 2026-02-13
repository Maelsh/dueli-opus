# 🎯 Dueli Platform Documentation

<div align="center">

![Dueli Logo](public/static/dueli-icon.png)

**منصة المناظرات والحوارات - Debate & Dialogue Platform**

[![License](https://img.shields.io/badge/license-Maelsh%20Pro-blue.svg)](LICENSE.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Hono](https://img.shields.io/badge/Hono-4.0-orange.svg)](https://hono.dev/)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers-orange.svg)](https://workers.cloudflare.com/)

</div>

---

## 📖 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Features](#features)
4. [API Reference](#api-reference)
5. [Database Schema](#database-schema)
6. [Client-Side Architecture](#client-side-architecture)
7. [Authentication](#authentication)
8. [Internationalization](#internationalization)
9. [Streaming & Live Features](#streaming--live-features)
10. [Deployment](#deployment)

---

## Overview

Dueli is a bilingual (Arabic/English) platform for live debates, dialogues, and competitions. It supports real-time streaming, user interactions, and a comprehensive competition system.

### Key Technologies

| Category | Technology |
|----------|------------|
| **Runtime** | Cloudflare Workers |
| **Framework** | Hono 4.x |
| **Database** | Cloudflare D1 (SQLite) |
| **Styling** | TailwindCSS 4.x |
| **Language** | TypeScript 5.x |
| **Build** | Vite |
| **Email** | Resend API / iFastNet SMTP |

---

## Architecture

### Project Structure

```
📦 dueli/
├── 📂 src/
│   ├── 📂 models/           # Data Layer (MVC)
│   │   ├── base/            # Base model class
│   │   ├── UserModel.ts
│   │   ├── CompetitionModel.ts
│   │   ├── CategoryModel.ts
│   │   ├── CommentModel.ts
│   │   ├── NotificationModel.ts
│   │   ├── SessionModel.ts
│   │   ├── SearchModel.ts
│   │   ├── LikeModel.ts
│   │   ├── ReportModel.ts
│   │   ├── MessageModel.ts
│   │   ├── AdvertisementModel.ts
│   │   ├── UserSettingsModel.ts
│   │   └── ScheduleModel.ts
│   │
│   ├── 📂 controllers/      # Logic Layer (MVC)
│   │   ├── base/            # Base controller class
│   │   ├── AuthController.ts
│   │   ├── CompetitionController.ts
│   │   ├── UserController.ts
│   │   ├── CategoryController.ts
│   │   ├── SearchController.ts
│   │   ├── InteractionController.ts
│   │   ├── MessageController.ts
│   │   ├── AdminController.ts
│   │   ├── SettingsController.ts
│   │   └── ScheduleController.ts
│   │
│   ├── 📂 modules/          # Pages & API Routes
│   │   ├── 📂 api/          # API endpoints
│   │   │   ├── auth/
│   │   │   ├── categories/
│   │   │   ├── competitions/
│   │   │   ├── users/
│   │   │   ├── notifications/
│   │   │   ├── countries/
│   │   │   ├── jitsi/
│   │   │   ├── signaling/
│   │   │   ├── chunks/
│   │   │   ├── search/
│   │   │   ├── likes/
│   │   │   ├── reports/
│   │   │   ├── messages/
│   │   │   ├── admin/
│   │   │   ├── settings/
│   │   │   └── schedule/
│   │   │
│   │   └── 📂 pages/        # Page templates
│   │       ├── about-page.ts
│   │       ├── competition-page.ts
│   │       ├── create-page.ts
│   │       ├── donate-page.ts
│   │       ├── earnings-page.ts
│   │       ├── explore-page.ts
│   │       ├── live-room-page.ts
│   │       ├── messages-page.ts
│   │       ├── my-competitions-page.ts
│   │       ├── my-requests-page.ts
│   │       ├── profile-page.ts
│   │       ├── reports-page.ts
│   │       ├── settings-page.ts
│   │       ├── test-stream-page.ts
│   │       ├── verify-page.ts
│   │       └── live/
│   │
│   ├── 📂 client/           # Client-side JS
│   │   ├── core/            # State, API, Cookies
│   │   ├── services/        # Auth, Theme, Streaming
│   │   ├── helpers/         # Date, Number, Search
│   │   ├── pages/           # HomePage
│   │   └── ui/              # Toast, Modal, Menu
│   │
│   ├── 📂 shared/           # Shared Components
│   │   ├── components/      # Competition card, User card, etc.
│   │   └── templates/       # Layout templates
│   │
│   ├── 📂 lib/              # Libraries
│   │   ├── oauth/           # OAuth providers
│   │   └── services/        # Email, Crypto
│   │
│   ├── 📂 config/           # Configuration
│   │   ├── types.ts         # TypeScript types
│   │   ├── defaults.ts      # Default values
│   │   └── pwa.ts           # PWA configuration
│   │
│   ├── 📂 i18n/             # Internationalization
│   │   ├── ar.ts            # Arabic translations
│   │   ├── en.ts            # English translations
│   │   └── index.ts         # i18n utilities
│   │
│   ├── 📂 middleware/       # Hono middleware
│   │   └── auth.ts          # Authentication middleware
│   │
│   └── main.ts              # Entry point
│
├── 📂 public/               # Static assets
│   ├── static/              # CSS, images
│   ├── manifest.json        # PWA manifest
│   ├── sw.js                # Service worker
│   └── *.html               # Static pages
│
├── 📂 migrations/           # Database migrations
├── seed.sql                 # Seed data
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── wrangler.jsonc           # Cloudflare config
```

---

## Features

### Core Features

| Feature | Description | Status |
|---------|-------------|--------|
| 🎤 **Live Debates** | Real-time streaming competitions | ✅ Complete |
| 🌍 **Bilingual** | Arabic/English with RTL support | ✅ Complete |
| 📱 **Responsive** | Mobile-first design | ✅ Complete |
| 🌙 **Dark Mode** | Theme switching | ✅ Complete |
| 🔐 **OAuth** | Google, Facebook, Microsoft, TikTok | ✅ Complete |
| 📊 **Categories** | Dialogue, Science, Talents | ✅ Complete |
| 💬 **Comments** | Live and recorded comments | ✅ Complete |
| ⭐ **Ratings** | Competition rating system | ✅ Complete |
| 🔔 **Notifications** | Real-time notifications | ✅ Complete |
| 📨 **Messaging** | Private messaging system | ✅ Complete |
| 📈 **Earnings** | Ad revenue tracking | ⚠️ Partial |
| 💰 **Donations** | Support creators | ⚠️ Partial |
| 🗑️ **Account Deletion** | GDPR compliance | ⚠️ TODO |

### Competition Types

1. **Dialogue (الحوار)**
   - Religions, Sects, Politics, Economics
   - Ethnic Conflicts, Local Events, Global Events, Other Disputes

2. **Science (العلوم)**
   - Physics, Chemistry, Mathematics, Astronomy
   - Biology, Technology, Energy, Economics Science
   - Mixed Sciences, Other Sciences

3. **Talents (المواهب)**
   - Physical, Mental, Vocal, Poetry
   - Psychological, Creative, Crafts, Other Talents

---

## API Reference

### Authentication Endpoints

```
POST   /api/auth/register           # Register new user
POST   /api/auth/login              # Login user
POST   /api/auth/logout             # Logout user
POST   /api/auth/forgot-password    # Request password reset
POST   /api/auth/reset-password     # Reset password
POST   /api/auth/verify-email       # Verify email
GET    /api/auth/me                 # Get current user
GET    /api/auth/oauth/:provider    # OAuth login
GET    /api/auth/oauth/:provider/callback  # OAuth callback
```

### Competition Endpoints

```
GET    /api/competitions            # List competitions
GET    /api/competitions/:id        # Get competition
POST   /api/competitions            # Create competition
PUT    /api/competitions/:id        # Update competition
DELETE /api/competitions/:id        # Delete competition
POST   /api/competitions/:id/join   # Request to join
POST   /api/competitions/:id/accept # Accept join request
GET    /api/competitions/live       # Get live competitions
GET    /api/competitions/upcoming   # Get upcoming competitions
GET    /api/competitions/recorded   # Get recorded competitions
```

### User Endpoints

```
GET    /api/users/:id               # Get user profile
PUT    /api/users/:id               # Update user profile
GET    /api/users/:id/competitions  # Get user competitions
GET    /api/users/:id/followers     # Get user followers
GET    /api/users/:id/following     # Get user following
POST   /api/users/:id/follow        # Follow user
DELETE /api/users/:id/follow        # Unfollow user
```

### Category Endpoints

```
GET    /api/categories              # List all categories
GET    /api/categories/:id          # Get category
GET    /api/categories/:id/subcategories  # Get subcategories
```

### Interaction Endpoints

```
POST   /api/likes                   # Toggle like
POST   /api/dislikes                # Toggle dislike
POST   /api/comments                # Add comment
GET    /api/comments/:competitionId # Get comments
POST   /api/ratings                 # Submit rating
POST   /api/reports                 # Submit report
```

### Search Endpoints

```
GET    /api/search                  # Global search
GET    /api/search/users            # Search users
GET    /api/search/competitions     # Search competitions
```

### Messaging Endpoints

```
GET    /api/messages/conversations  # Get conversations
GET    /api/messages/:conversationId # Get messages
POST   /api/messages                # Send message
POST   /api/messages/conversations  # Create conversation
```

### Notification Endpoints

```
GET    /api/notifications           # Get notifications
PUT    /api/notifications/:id/read  # Mark as read
PUT    /api/notifications/read-all  # Mark all as read
```

### Admin Endpoints

```
GET    /api/admin/users             # List all users
PUT    /api/admin/users/:id         # Update user
DELETE /api/admin/users/:id         # Delete user
GET    /api/admin/reports           # List reports
PUT    /api/admin/reports/:id       # Update report status
GET    /api/admin/analytics         # Get analytics
```

---

## Database Schema

### Core Tables

#### Users
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    bio TEXT,
    country TEXT,
    language TEXT DEFAULT 'ar',
    is_admin INTEGER DEFAULT 0,
    is_verified INTEGER DEFAULT 0,
    total_competitions INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    total_views INTEGER DEFAULT 0,
    average_rating REAL DEFAULT 0,
    total_earnings REAL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

#### Competitions
```sql
CREATE TABLE competitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    rules TEXT,
    category_id INTEGER NOT NULL,
    subcategory_id INTEGER,
    creator_id INTEGER NOT NULL,
    opponent_id INTEGER,
    status TEXT DEFAULT 'pending',
    language TEXT DEFAULT 'ar',
    country TEXT,
    scheduled_at TEXT,
    started_at TEXT,
    ended_at TEXT,
    youtube_live_id TEXT,
    youtube_video_url TEXT,
    total_views INTEGER DEFAULT 0,
    total_comments INTEGER DEFAULT 0,
    likes_count INTEGER DEFAULT 0,
    dislikes_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (creator_id) REFERENCES users(id),
    FOREIGN KEY (opponent_id) REFERENCES users(id)
);
```

#### Categories
```sql
CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name_ar TEXT NOT NULL,
    name_en TEXT NOT NULL,
    description_ar TEXT,
    description_en TEXT,
    icon TEXT,
    color TEXT,
    parent_id INTEGER,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    FOREIGN KEY (parent_id) REFERENCES categories(id)
);
```

#### Comments
```sql
CREATE TABLE comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    is_live INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (competition_id) REFERENCES competitions(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### Notifications
```sql
CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    reference_type TEXT,
    reference_id INTEGER,
    is_read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### Messages & Conversations
```sql
CREATE TABLE conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user1_id INTEGER NOT NULL,
    user2_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user1_id) REFERENCES users(id),
    FOREIGN KEY (user2_id) REFERENCES users(id)
);

CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id),
    FOREIGN KEY (sender_id) REFERENCES users(id)
);
```

---

## Client-Side Architecture

### State Management

The client uses a centralized state management pattern via `State` class:

```typescript
// src/client/core/State.ts
class State {
    static currentUser: User | null = null;
    static sessionId: string | null = null;
    static lang: Language = 'ar';
    static isDarkMode: boolean = false;
    static country: string = 'SA';
    
    static init(): void { ... }
    static setUser(user: User | null): void { ... }
    static setLanguage(lang: Language): void { ... }
}
```

### API Client

```typescript
// src/client/core/ApiClient.ts
class ApiClient {
    static async get<T>(url: string): Promise<T>;
    static async post<T>(url: string, data: any): Promise<T>;
    static async put<T>(url: string, data: any): Promise<T>;
    static async delete<T>(url: string): Promise<T>;
}
```

### Services

| Service | Purpose |
|---------|---------|
| `AuthService` | Authentication, OAuth, session management |
| `ThemeService` | Dark/light mode switching |
| `P2PConnection` | WebRTC peer-to-peer connections |
| `VideoCompositor` | Video layout composition |
| `ChunkUploader` | Chunked file uploads |
| `SearchService` | Live search functionality |
| `InteractionService` | Likes, comments, ratings |
| `MessagingService` | Private messaging |
| `SettingsService` | User settings management |

---

## Authentication

### OAuth Providers

Dueli supports multiple OAuth providers:

1. **Google OAuth 2.0**
   - Scopes: `openid`, `email`, `profile`
   - Flow: Authorization Code

2. **Facebook OAuth**
   - Scopes: `email`, `public_profile`
   - Flow: Authorization Code

3. **Microsoft OAuth**
   - Scopes: `openid`, `email`, `profile`
   - Supports multi-tenant

4. **TikTok OAuth**
   - Scopes: `user.info.basic`
   - Flow: Authorization Code

### Session Management

Sessions are stored in D1 database with secure HTTP-only cookies:

```typescript
interface Session {
    id: string;
    user_id: number;
    expires_at: string;
    created_at: string;
}
```

---

## Internationalization

### Supported Languages

- **Arabic (ar)**: RTL layout, Arabic translations
- **English (en)**: LTR layout, English translations

### Usage

```typescript
import { t, isRTL } from './i18n';

// Get translation
const title = t('app_title', 'ar'); // "ديولي"

// Check RTL
const rtl = isRTL('ar'); // true
```

### Translation Structure

```typescript
// src/i18n/ar.ts
export const arTranslations = {
    app_title: 'ديولي',
    home: 'الرئيسية',
    live: 'مباشر',
    // ... more translations
};
```

---

## Streaming & Live Features

### WebRTC Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Streamer  │────▶│   Server    │────▶│   Viewer    │
│  (WebRTC)   │     │  (Signaling)│     │  (WebRTC)   │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       └───────────────────┴───────────────────┘
                      P2P Connection
```

### Components

1. **P2PConnection**: WebRTC peer connection management
2. **VideoCompositor**: Multi-participant video layout
3. **ChunkUploader**: Chunked video upload for recordings
4. **Signaling Server**: WebSocket signaling for WebRTC

### Live Room Features

- Real-time video streaming
- Live comments
- Viewer count
- Ad integration
- Recording capability

---

## Deployment

### Prerequisites

- Node.js 18+
- Cloudflare account
- D1 database created
- Environment variables configured

### Environment Variables

```env
# Email
EMAIL_API_KEY=your_email_api_key
EMAIL_API_URL=your_email_endpoint
EMAIL_FROM=noreply@dueli.com

# OAuth
GOOGLE_CLIENT_ID=your_google_id
GOOGLE_CLIENT_SECRET=your_google_secret
FACEBOOK_CLIENT_ID=your_facebook_id
FACEBOOK_CLIENT_SECRET=your_facebook_secret
MICROSOFT_CLIENT_ID=your_microsoft_id
MICROSOFT_CLIENT_SECRET=your_microsoft_secret
MICROSOFT_TENANT_ID=your_microsoft_tenant
TIKTOK_CLIENT_KEY=your_tiktok_key
TIKTOK_CLIENT_SECRET=your_tiktok_secret

# Streaming
STREAMING_URL=https://stream.maelsh.pro
UPLOAD_URL=https://maelsh.pro/ffmpeg
TURN_URL=turn:maelsh.pro:3000
TURN_SECRET=your_turn_secret
```

### Deployment Commands

```bash
# Install dependencies
npm install

# Build CSS
npm run build:css

# Build client
npm run build:client

# Build for production
npm run build

# Deploy to Cloudflare
npm run deploy

# Deploy to production
npm run deploy:prod
```

### Database Setup

```bash
# Run migrations locally
npm run db:migrate:local

# Seed database
npm run db:seed

# Reset database
npm run db:reset
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

This project is licensed under the **Maelsh Pro License**. See [LICENSE.md](LICENSE.md) for details.

---

<div align="center">

**Made with ❤️ by Maelsh Pro**

</div>
