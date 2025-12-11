# 📖 Dueli Technical Documentation

**Version 1.0 | December 2024**

---

## 📁 Complete File Map

### Root Configuration
| File | Purpose |
|------|---------|
| `main.ts` | App entry point (Hono, routes, middleware) |
| `countries.ts` | Countries data and utilities |
| `i18n.ts` | i18n re-export |
| `wrangler.jsonc` | Cloudflare Workers config |
| `vite.config.ts` | Vite build config |
| `package.json` | NPM dependencies |

---

## 🔵 Models Layer (`src/models/`)

| File | Class | Methods |
|------|-------|---------|
| `base/BaseModel.ts` | `BaseModel<T>` | `findById()`, `findAll()`, `findOne()`, `findBy()`, `count()`, `countBy()`, `exists()`, `delete()`, `query()`, `queryOne()` |
| `UserModel.ts` | `UserModel` | `findByEmail()`, `findByUsername()`, `findByOAuth()`, `findByVerificationToken()`, `findByResetToken()`, `emailExists()`, `usernameExists()`, `create()`, `update()`, `verifyEmail()`, `setResetToken()`, `updatePassword()`, `findWithStats()` |
| `CompetitionModel.ts` | `CompetitionModel` | `findWithDetails()`, `findByFilters()`, `findByUser()`, `create()`, `update()`, `setOpponent()`, `startLive()`, `complete()`, `incrementViews()` |
| `CategoryModel.ts` | `CategoryModel` | `findParentCategories()`, `findSubcategories()`, `findBySlug()`, `findAllWithSubcategories()`, `create()`, `update()` |
| `CommentModel.ts` | `CommentModel` | `findByCompetition()`, `create()`, `update()` |
| `NotificationModel.ts` | `NotificationModel` | `findByUser()`, `findUnread()`, `countUnread()`, `create()`, `update()`, `markAsRead()`, `markAllAsRead()` |
| `SessionModel.ts` | `SessionModel` | `findBySessionId()`, `findValidSession()`, `create()`, `deleteBySessionId()`, `deleteByUser()`, `cleanExpired()` |

---

## 🟢 Controllers Layer (`src/controllers/`)

| File | Class | Methods |
|------|-------|---------|
| `base/BaseController.ts` | `BaseController` | `getLanguage()`, `t()`, `success()`, `error()`, `notFound()`, `unauthorized()`, `forbidden()`, `validationError()`, `serverError()`, `getCurrentUser()`, `requireAuth()`, `getBody()`, `getQuery()`, `getQueryInt()`, `getParam()`, `getParamInt()` |
| `AuthController.ts` | `AuthController` | `register()`, `verifyEmail()`, `login()`, `logout()`, `forgotPassword()`, `resetPassword()`, `me()` |
| `CompetitionController.ts` | `CompetitionController` | `list()`, `show()`, `create()`, `addComment()`, `requestJoin()` |
| `UserController.ts` | `UserController` | `show()`, `updateProfile()`, `getNotifications()`, `markNotificationRead()`, `markAllNotificationsRead()` |
| `CategoryController.ts` | `CategoryController` | `list()`, `show()`, `getSubcategories()` |

---

## 📚 Library Layer (`src/lib/`)

### OAuth (`src/lib/oauth/`)

| File | Class | Description |
|------|-------|-------------|
| `BaseOAuthProvider.ts` | `BaseOAuthProvider` | Abstract base class with `clientId`, `clientSecret`, `redirectUri`, `getAuthUrl()`, `getUser()`, `normalizeUser()` |
| `OAuthProviderFactory.ts` | `OAuthProviderFactory` | Factory pattern for creating OAuth providers |
| `google.ts` | `GoogleOAuth` | extends BaseOAuthProvider |
| `facebook.ts` | `FacebookOAuth` | extends BaseOAuthProvider |
| `microsoft.ts` | `MicrosoftOAuth` | extends BaseOAuthProvider |
| `tiktok.ts` | `TikTokOAuth` | extends BaseOAuthProvider |
| `types.ts` | - | `OAuthUser`, `OAuthError`, `OAuthProviderConfig` |
| `utils.ts` | - | `ALLOWED_EMAIL_DOMAINS`, `isEmailAllowed()`, `generateState()` |

### Services (`src/lib/services/`)

| File | Class | Methods |
|------|-------|---------|
| `EmailService.ts` | `EmailService` | `sendVerificationEmail()`, `sendPasswordResetEmail()` |
| `CryptoUtils.ts` | `CryptoUtils` | `hashPassword()`, `generateState()`, `generateToken()`, `generateNumericCode()`, `generateHexString()` |

---

## 💻 Client Layer (`src/client/`)

### Core (`src/client/core/`)

| File | Class | Exports |
|------|-------|---------|
| `State.ts` | `State` | `currentUser`, `sessionId`, `lang`, `country`, `isDarkMode`, `getLanguage()`, `getCountry()`, `init()` |
| `ApiClient.ts` | `ApiClient` | `request()`, `get()`, `post()`, `put()`, `delete()` |
| `CookieUtils.ts` | `CookieUtils` | `get()`, `set()`, `remove()` |

### Helpers (`src/client/helpers/`)

| File | Class | Methods |
|------|-------|---------|
| `DateFormatter.ts` | `DateFormatter` | `format()`, `timeAgo()` |
| `NumberFormatter.ts` | `NumberFormatter` | `format()`, `formatLocale()`, `formatCurrency()`, `formatPercent()` |
| `YouTubeHelpers.ts` | `YouTubeHelpers` | `extractVideoId()`, `getEmbedUrl()`, `getThumbnailUrl()` |
| `Utils.ts` | `Utils` | `debounce()`, `throttle()`, `randomString()` |

### Services (`src/client/services/`)

| File | Class | Methods |
|------|-------|---------|
| `AuthService.ts` | `AuthService` | `checkAuth()`, `clearAuth()`, `updateAuthUI()`, `handleOAuthSuccess()`, `handleLogin()`, `handleRegister()`, `handleForgotPassword()`, `handleVerifyResetCode()`, `handleResetPassword()`, `loginWith()`, `logout()` |
| `ThemeService.ts` | `ThemeService` | `init()`, `toggle()`, `apply()`, `isDarkMode` |

### UI (`src/client/ui/`)

| File | Class | Methods |
|------|-------|---------|
| `Modal.ts` | `Modal` | `show()`, `hide()`, `showLogin()`, `hideLogin()`, `showCustom()`, `showAuthMessage()`, `hideAuthMessage()`, `switchAuthTab()`, `showForgotPassword()`, `showLoginForm()`, `showComingSoon()`, `showOAuthError()`, `showHelp()` |
| `Toast.ts` | `Toast` | `show()`, `success()`, `error()`, `warning()`, `info()` |
| `Menu.ts` | `Menu` | `toggleUser()`, `toggleCountry()`, `closeAll()`, `setupClickOutside()` |

---

## 🌐 Internationalization (`src/i18n/`)

| File | Exports |
|------|---------|
| `index.ts` | `TRANSLATED_LANGUAGES`, `TranslatedLanguage`, `Language`, `DEFAULT_LANGUAGE`, `translations`, `getLanguageFromCountry()`, `getUILanguage()`, `t()`, `isRTL()`, `getDir()`, `getLocalizedName()`, `getCategoryName()` |
| `ar.ts` | Arabic translations (~200 keys) |
| `en.ts` | English translations (~200 keys) |

---

## ⚙️ Configuration (`src/config/`)

### types.ts

**Base Interfaces:**
- `BaseEntity` - `id`, `created_at`, `updated_at`
- `TimestampedEntity` - extends BaseEntity
- `Localizable` - `name_key`, `name_ar`, `name_en`

**Types:**
- `Bindings` - Cloudflare env bindings
- `Variables` - Hono context variables
- `Language` - string type
- `CompetitionStatus` - 'pending' | 'accepted' | 'live' | 'completed' | 'cancelled'
- `RequestStatus` - 'pending' | 'accepted' | 'declined'
- `NotificationType` - 'request' | 'follow' | 'comment' | 'rating' | 'system'

**Domain Interfaces:**
- `User` - extends BaseEntity
- `Competition` - extends TimestampedEntity
- `Category` - extends BaseEntity, Localizable
- `Comment` - extends TimestampedEntity
- `Rating` - extends BaseEntity
- `CompetitionRequest` - extends TimestampedEntity
- `Notification` - extends TimestampedEntity
- `Session` - (readonly id)
- `OAuthUser` - OAuth provider user data
- `ApiResponse<T>` - Standard API response

---

## 🗃️ Database Schema

### Tables

```sql
-- users
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT,
    avatar_url TEXT,
    bio TEXT,
    country TEXT DEFAULT 'US',
    language TEXT DEFAULT 'en',
    verification_token TEXT,
    reset_token TEXT,
    reset_token_expires TEXT,
    oauth_provider TEXT,
    oauth_id TEXT,
    is_verified INTEGER DEFAULT 0,
    is_admin INTEGER DEFAULT 0,
    total_competitions INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    total_views INTEGER DEFAULT 0,
    average_rating REAL DEFAULT 0,
    created_at TEXT,
    updated_at TEXT
);

-- sessions
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- categories
CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_key TEXT,
    name_ar TEXT,
    name_en TEXT,
    slug TEXT UNIQUE,
    icon TEXT,
    color TEXT,
    parent_id INTEGER,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    FOREIGN KEY (parent_id) REFERENCES categories(id)
);

-- competitions
CREATE TABLE competitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    rules TEXT NOT NULL,
    category_id INTEGER NOT NULL,
    subcategory_id INTEGER,
    creator_id INTEGER NOT NULL,
    opponent_id INTEGER,
    status TEXT DEFAULT 'pending',
    language TEXT DEFAULT 'en',
    country TEXT,
    scheduled_at TEXT,
    started_at TEXT,
    ended_at TEXT,
    youtube_live_id TEXT,
    youtube_video_url TEXT,
    total_views INTEGER DEFAULT 0,
    total_comments INTEGER DEFAULT 0,
    created_at TEXT,
    updated_at TEXT,
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (creator_id) REFERENCES users(id),
    FOREIGN KEY (opponent_id) REFERENCES users(id)
);

-- comments
CREATE TABLE comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    is_live INTEGER DEFAULT 0,
    created_at TEXT,
    FOREIGN KEY (competition_id) REFERENCES competitions(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- notifications
CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    reference_type TEXT,
    reference_id INTEGER,
    is_read INTEGER DEFAULT 0,
    created_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- competition_requests
CREATE TABLE competition_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL,
    requester_id INTEGER NOT NULL,
    message TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT,
    responded_at TEXT,
    FOREIGN KEY (competition_id) REFERENCES competitions(id),
    FOREIGN KEY (requester_id) REFERENCES users(id)
);

-- ratings
CREATE TABLE ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    competitor_id INTEGER NOT NULL,
    rating INTEGER NOT NULL,
    FOREIGN KEY (competition_id) REFERENCES competitions(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (competitor_id) REFERENCES users(id)
);

-- user_follows
CREATE TABLE user_follows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    follower_id INTEGER NOT NULL,
    following_id INTEGER NOT NULL,
    created_at TEXT,
    FOREIGN KEY (follower_id) REFERENCES users(id),
    FOREIGN KEY (following_id) REFERENCES users(id),
    UNIQUE(follower_id, following_id)
);
```

---

## 🛣️ API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| GET | `/api/auth/verify` | Verify email |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| POST | `/api/auth/forgot-password` | Request reset code |
| POST | `/api/auth/reset-password` | Reset password |
| GET | `/api/auth/me` | Get current user |
| GET | `/api/auth/oauth/:provider` | OAuth redirect |
| GET | `/api/auth/oauth/:provider/callback` | OAuth callback |

### Competitions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/competitions` | List competitions |
| GET | `/api/competitions/:id` | Get competition |
| POST | `/api/competitions` | Create competition |
| POST | `/api/competitions/:id/comments` | Add comment |
| POST | `/api/competitions/:id/request` | Request to join |
| DELETE | `/api/competitions/:id/request` | Cancel request |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/:username` | Get user profile |
| PUT | `/api/users/me` | Update profile |
| GET | `/api/users/me/notifications` | Get notifications |
| POST | `/api/users/me/notifications/:id/read` | Mark as read |

### Categories
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/categories` | List categories |
| GET | `/api/categories/:id` | Get category |
| GET | `/api/categories/:id/subcategories` | Get subcategories |

---

## 📄 Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Home | Main page with competitions |
| `/competition/:id` | Competition | Competition details |
| `/create` | Create | Create competition |
| `/explore` | Explore | Browse competitions |
| `/about` | About | About Dueli |
| `/verify` | Verify | Email verification |
| `/privacy` | Privacy | Privacy policy |
| `/terms` | Terms | Terms of service |
| `/faq` | FAQ | Frequently asked questions |

---

**Total Files: 74 TypeScript files**

**Maelsh Pro** - Technical Excellence
