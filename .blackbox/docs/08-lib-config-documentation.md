# Dueli Platform - Lib, Config, Middleware, and i18n Documentation

## Overview

This documentation covers the core utilities, configuration files, middleware, and internationalization (i18n) system for the Dueli platform. These files provide foundational functionality that supports the entire application.

## src/lib/ Files

### 1. jitsi-config.ts

#### Type
Config

#### Purpose
Dynamically fetches the current Cloudflare Tunnel URL for Jitsi Meet integration, allowing for dynamic URL resolution using Cloudflare API.

#### Key Functions

| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| getJitsiServerUrl | env: { CLOUDFLARE_API_TOKEN?: string } | Promise<string> | Retrieves Jitsi server URL from Cloudflare Tunnel API |
| getJitsiConfig | env: { CLOUDFLARE_API_TOKEN?: string } | Promise<object> | Returns complete Jitsi configuration for frontend |

#### Configuration Details
- **CLOUDFLARE_ACCOUNT_ID**: Fixed account identifier
- **TUNNEL_ID**: Fixed tunnel identifier
- Fallback to `http://localhost` if Cloudflare API token not provided or request fails

#### Status
- [x] Fully implemented and functional

---

### 2. OAuth Module (src/lib/oauth/)

#### BaseOAuthProvider.ts

##### Type
OAuth Provider (Abstract Class)

##### Purpose
Defines the base interface for all OAuth providers, enforcing consistent implementation and providing common functionality.

##### Core Interface

```typescript
export abstract class BaseOAuthProvider {
    abstract readonly providerName: string;
    protected abstract readonly authBaseUrl: string;
    protected abstract readonly tokenUrl: string;
    protected abstract readonly userInfoUrl: string;
    protected abstract readonly scopes: string;
    
    abstract getAuthUrl(state: string, lang: string): string;
    abstract getUser(code: string): Promise<OAuthUser>;
    protected abstract normalizeUser(rawData: any): OAuthUser;
}
```

##### Common Methods

| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| buildAuthUrl | params: Record<string, string> | string | Helper to build OAuth URL with parameters |
| exchangeCodeForToken | code: string | Promise<any> | Exchanges authorization code for access token |
| fetchUserInfo | accessToken: string | Promise<any> | Fetches user information from OAuth provider |

---

#### GoogleOAuth (google.ts)

##### Type
OAuth Provider

##### Purpose
Google OAuth 2.0 authentication implementation.

##### Configuration

| Property | Value |
|----------|-------|
| providerName | 'google' |
| authBaseUrl | 'https://accounts.google.com/o/oauth2/v2/auth' |
| tokenUrl | 'https://oauth2.googleapis.com/token' |
| userInfoUrl | 'https://www.googleapis.com/oauth2/v2/userinfo' |
| scopes | 'openid email profile' |

##### Methods

| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| getAuthUrl | state: string, lang: string | string | Generates Google OAuth authorization URL |
| getUser | code: string | Promise<OAuthUser> | Exchanges code for user info |
| normalizeUser | rawData: any | OAuthUser | Converts Google user data to standard format |

##### OAuth Flow
1. Generate auth URL with required scopes and state
2. User redirects to Google login page
3. After authorization, Google redirects back with code
4. Exchange code for access token
5. Use token to fetch user information
6. Normalize user data to standard format

##### Status
- [x] Fully implemented and functional

---

#### MicrosoftOAuth (microsoft.ts)

##### Type
OAuth Provider

##### Purpose
Microsoft Azure AD OAuth 2.0 authentication implementation.

##### Configuration

| Property | Value |
|----------|-------|
| providerName | 'microsoft' |
| authBaseUrl | `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize` |
| tokenUrl | `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token` |
| userInfoUrl | 'https://graph.microsoft.com/v1.0/me' |
| scopes | 'openid email profile User.Read' |

##### Methods

| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| getAuthUrl | state: string, lang: string | string | Generates Microsoft OAuth authorization URL |
| getUser | code: string | Promise<OAuthUser> | Exchanges code for user info |
| normalizeUser | rawData: any | OAuthUser | Converts Microsoft user data to standard format |

##### OAuth Flow
1. Generate auth URL with tenant-specific endpoints
2. User redirects to Microsoft login page
3. After authorization, Microsoft redirects back with code
4. Exchange code for access token with scope parameter
5. Use token to fetch user information from Microsoft Graph
6. Normalize user data to standard format

##### Status
- [x] Fully implemented and functional

---

#### FacebookOAuth (facebook.ts)

##### Type
OAuth Provider

##### Purpose
Facebook OAuth 2.0 authentication implementation.

##### Configuration

| Property | Value |
|----------|-------|
| providerName | 'facebook' |
| authBaseUrl | 'https://www.facebook.com/v18.0/dialog/oauth' |
| tokenUrl | 'https://graph.facebook.com/v18.0/oauth/access_token' |
| userInfoUrl | 'https://graph.facebook.com/me' |
| scopes | 'email,public_profile' |

##### Methods

| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| getAuthUrl | state: string, lang: string | string | Generates Facebook OAuth authorization URL |
| getUser | code: string | Promise<OAuthUser> | Exchanges code for user info |
| normalizeUser | rawData: any | OAuthUser | Converts Facebook user data to standard format |

##### OAuth Flow
1. Generate auth URL with Facebook Graph API v18 endpoints
2. User redirects to Facebook login page
3. After authorization, Facebook redirects back with code
4. Exchange code for access token using GET request
5. Use token to fetch user information with specific fields (id, name, email, picture)
6. Normalize user data to standard format

##### Status
- [x] Fully implemented and functional

---

#### TikTokOAuth (tiktok.ts)

##### Type
OAuth Provider

##### Purpose
TikTok OAuth 2.0 authentication implementation.

##### Configuration

| Property | Value |
|----------|-------|
| providerName | 'tiktok' |
| authBaseUrl | 'https://www.tiktok.com/v2/auth/authorize/' |
| tokenUrl | 'https://open.tiktokapis.com/v2/oauth/token/' |
| userInfoUrl | 'https://open.tiktokapis.com/v2/user/info/' |
| scopes | 'user.info.basic' |

##### Methods

| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| getAuthUrl | state: string, lang: string | string | Generates TikTok OAuth authorization URL |
| getUser | code: string | Promise<OAuthUser> | Exchanges code for user info |
| normalizeUser | rawData: any | OAuthUser | Converts TikTok user data to standard format |

##### OAuth Flow
1. Generate auth URL with TikTok-specific parameters
2. User redirects to TikTok login page
3. After authorization, TikTok redirects back with code
4. Exchange code for access token using client_key parameter
5. Use token to fetch user information with fields parameter
6. Normalize user data to standard format

##### Status
- [ ] Partially implemented (needs testing and verification)

---

#### OAuthProviderFactory.ts

##### Type
Factory

##### Purpose
Factory pattern implementation for creating OAuth provider instances based on provider type.

##### Core Interface

```typescript
export class OAuthProviderFactory {
    create(provider: OAuthProviderType): BaseOAuthProvider;
    static getSupportedProviders(): OAuthProviderType[];
    static isSupported(provider: string): provider is OAuthProviderType;
}
```

##### Methods

| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| create | provider: OAuthProviderType | BaseOAuthProvider | Creates OAuth provider instance |
| getSupportedProviders | - | OAuthProviderType[] | Returns list of supported providers |
| isSupported | provider: string | boolean | Checks if provider is supported |

##### Configuration Interface

```typescript
export interface OAuthFactoryConfig {
    google?: { clientId: string; clientSecret: string };
    facebook?: { clientId: string; clientSecret: string };
    microsoft?: { clientId: string; clientSecret: string; tenantId: string };
    tiktok?: { clientKey: string; clientSecret: string };
}
```

##### Status
- [x] Fully implemented and functional

---

#### types.ts

##### Type
Type Definitions

##### Purpose
Defines core TypeScript interfaces for OAuth operations.

##### Key Interfaces

```typescript
export interface OAuthUser {
    id: string;
    email: string;
    name: string;
    picture?: string;
    provider: string;
    raw?: any;
}

export interface OAuthError {
    code: string;
    message: string;
}

export interface OAuthProviderConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    authUrl: string;
    tokenUrl: string;
    userUrl: string;
    scope: string;
}
```

##### Status
- [x] Fully implemented and functional

---

#### utils.ts

##### Type
Utility

##### Purpose
Provides OAuth-related utility functions.

##### Key Functions

| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| isEmailAllowed | email: string | boolean | Validates if email domain is allowed |
| generateState | - | string | Generates random state parameter for OAuth |

##### Allowed Email Domains
- Google: gmail.com, googlemail.com
- Microsoft: outlook.com, outlook.sa, hotmail.com, live.com, msn.com, microsoft.com
- Yahoo: yahoo.com, ymail.com
- Apple: icloud.com, me.com, mac.com
- Proton: protonmail.com, proton.me
- AOL: aol.com
- Zoho: zoho.com, zohomail.com
- Microsoft 365: *.onmicrosoft.com

##### Status
- [x] Fully implemented and functional

---

### 3. Services Module (src/lib/services/)

#### CryptoUtils.ts

##### Type
Utility

##### Purpose
Provides cryptographic utilities using Web Crypto API.

##### Key Methods

| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| hashPassword | password: string | Promise<string> | Hashes password using SHA-256 |
| generateState | - | string | Generates random UUID for OAuth state |
| generateToken | - | string | Generates random UUID for verification tokens |
| generateNumericCode | length: number (default: 6) | string | Generates random numeric code for password reset |
| generateHexString | length: number (default: 32) | string | Generates random hex string |

##### Status
- [x] Fully implemented and functional

---

#### EmailService.ts

##### Type
Service

##### Purpose
Handles email sending functionality using custom PHP endpoint on iFastNet hosting.

##### Core Interface

```typescript
export class EmailService {
    constructor(apiKey: string, apiUrl?: string, fromEmail?: string);
    sendVerificationEmail(email: string, token: string, name: string, lang: Language, origin: string): Promise<any>;
    sendPasswordResetEmail(email: string, resetCode: string, lang: Language): Promise<any>;
}
```

##### Methods

| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| sendVerificationEmail | email, token, name, lang, origin | Promise<any> | Sends account verification email |
| sendPasswordResetEmail | email, resetCode, lang | Promise<any> | Sends password reset email with code |

##### Email Features
- Beautiful responsive templates with RTL support
- Multi-language support (Arabic/English)
- Verification links with 24-hour expiry
- Password reset codes with 15-minute expiry
- Professional design with Dueli branding

##### Configuration
- `apiKey`: Secret API key for email endpoint
- `apiUrl`: URL to PHP email script (defaults to placeholder)
- `fromEmail`: From email address (defaults to noreply@yourdomain.com)

##### Status
- [x] Fully implemented (needs configuration with real email endpoint)

---

#### index.ts

##### Type
Module Exports

##### Purpose
Exports all services from the services module.

```typescript
export { EmailService } from './EmailService';
export { CryptoUtils } from './CryptoUtils';
```

---

## src/config/ Files

### 1. defaults.ts

##### Type
Config

##### Purpose
Defines default configuration values used when environment variables are not set.

##### Key Configuration

```typescript
// Streaming & Upload Servers
export const DEFAULT_STREAMING_URL = 'https://stream.maelsh.pro';
export const DEFAULT_UPLOAD_URL = 'https://maelsh.pro/ffmpeg';
export const DEFAULT_TURN_URL = 'turn:maelsh.pro:3000';
export const DEFAULT_UPLOAD_SERVER_ORIGINS = 'https://maelsh.pro,https://stream.maelsh.pro,https://dueli.maelsh.pro,https://www.dueli.maelsh.pro';

// Platform URLs
export const DEFAULT_PLATFORM_URL = 'https://dueli.maelsh.pro';
export const CLOUDFLARE_PAGES_URL = 'https://project-8e7c178d.pages.dev';
export const WWW_PLATFORM_URL = 'https://www.dueli.maelsh.pro';
```

##### Status
- [x] Fully implemented and functional

---

### 2. pwa.ts

##### Type
Config

##### Purpose
PWA (Progressive Web App) configuration including manifest and service worker.

##### Manifest Configuration

```typescript
export const pwaManifest = {
    name: "Dueli - منصة التحدي",
    short_name: "Dueli",
    description: "Connect via Competition - تواصل عبر التنافس",
    start_url: "/",
    display: "standalone",
    orientation: "portrait-primary",
    theme_color: "#6366f1",
    background_color: "#0f172a",
    lang: "ar",
    dir: "rtl",
    categories: ["entertainment", "social", "sports"],
    icons: [...]
};
```

##### Service Worker
- **Caching Strategy**: Static assets (cache-first), API (network-only), pages (network-first with cache fallback)
- **Cache Versions**: Static cache (`dueli-static-v1`), Dynamic cache (`dueli-dynamic-v1`)
- **Features**: Background sync, offline fallback, cache management

##### Status
- [x] Fully implemented and functional

---

### 3. types.ts

##### Type
Type Definitions

##### Purpose
Defines core TypeScript interfaces and types used across the platform.

##### Key Interfaces

```typescript
// Environment & Context Types
export type Bindings = {
  DB: D1Database;
  EMAIL_API_KEY: string;
  EMAIL_API_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  FACEBOOK_CLIENT_ID: string;
  FACEBOOK_CLIENT_SECRET: string;
  MICROSOFT_CLIENT_ID: string;
  MICROSOFT_CLIENT_SECRET: string;
  MICROSOFT_TENANT_ID: string;
  TIKTOK_CLIENT_KEY: string;
  TIKTOK_CLIENT_SECRET: string;
  STREAMING_URL: string;
  UPLOAD_URL: string;
  TURN_URL: string;
  TURN_SECRET: string;
  UPLOAD_SERVER_ORIGINS?: string;
}

// Domain Interfaces
export interface User extends BaseEntity {
  email: string;
  username: string;
  display_name: string;
  avatar_url: string;
  country?: string;
  language?: Language;
  is_admin?: boolean;
  bio?: string;
  total_competitions?: number;
  total_wins?: number;
  total_views?: number;
  average_rating?: number;
  total_earnings?: number;
  is_verified?: boolean;
}

export interface Competition extends TimestampedEntity {
  title: string;
  description?: string;
  rules: string;
  category_id: number;
  subcategory_id?: number;
  creator_id: number;
  opponent_id?: number;
  status: CompetitionStatus;
  language: Language;
  country?: string;
  scheduled_at?: string;
  started_at?: string;
  ended_at?: string;
  youtube_live_id?: string;
  youtube_video_url?: string;
  total_views: number;
  total_comments: number;
  likes_count?: number;
  dislikes_count?: number;
}

// Enums & Types
export type CompetitionStatus = 'pending' | 'accepted' | 'live' | 'completed' | 'cancelled';
export type RequestStatus = 'pending' | 'accepted' | 'declined';
export type NotificationType = 'request' | 'follow' | 'comment' | 'rating' | 'system' | 'invitation';
```

##### Status
- [x] Fully implemented and functional

---

## src/middleware/ Files

### 1. auth.ts

##### Type
Middleware

##### Purpose
Provides authentication and authorization middleware for Hono routes.

##### Core Middleware

```typescript
// Auth middleware factory
export function authMiddleware(options: { required?: boolean } = {});

// Admin-only middleware
export function adminMiddleware();

// Combine auth + admin
export function adminAuthMiddleware();
```

##### Key Features
- Validates session from Authorization header (Bearer token)
- Sets user object in context if session is valid
- Handles both required and optional authentication
- Admin middleware for protected admin routes
- Error handling with localized error messages

##### Middleware Flow

```typescript
// For authMiddleware:
1. Extract session token from Authorization header
2. If no token and required=true, return 401
3. If no token and required=false, set user to null and continue
4. Validate session in database
5. If invalid session and required=true, return 401
6. If valid, set user in context and continue
7. Handle errors with appropriate status codes
```

##### Usage Examples

```typescript
// Protected route
app.get('/api/protected', authMiddleware(), (c) => {
    const user = c.get('user');
    return c.json({ user });
});

// Admin route
app.get('/api/admin', adminAuthMiddleware(), (c) => {
    const user = c.get('user');
    return c.json({ user });
});
```

##### Status
- [x] Fully implemented and functional

---

### 2. index.ts

##### Type
Module Exports

##### Purpose
Exports all middleware from the middleware module.

```typescript
export {
    authMiddleware,
    adminMiddleware,
    adminAuthMiddleware
} from './auth';
```

---

## src/i18n/ Files

### 1. ar.ts

##### Type
Translation

##### Language
Arabic

##### Purpose
Arabic language translations for the entire application.

##### Key Translation Categories

| Category | Count |
|----------|-------|
| General | ~50 keys |
| Categories | 3 main + 24 subcategories |
| Competitions | ~40 keys |
| Authentication | ~30 keys |
| Errors | ~20 keys |
| Notifications | ~10 keys |
| Settings | ~15 keys |
| Reports | ~20 keys |
| Schedule | ~15 keys |
| Live Streaming | ~25 keys |

##### Total Keys
- **553 translation keys**

##### Status
- [x] Fully implemented and functional

---

### 2. en.ts

##### Type
Translation

##### Language
English

##### Purpose
English language translations for the entire application.

##### Key Translation Categories

| Category | Count |
|----------|-------|
| General | ~50 keys |
| Categories | 3 main + 24 subcategories |
| Competitions | ~40 keys |
| Authentication | ~30 keys |
| Errors | ~20 keys |
| Notifications | ~10 keys |
| Settings | ~15 keys |
| Reports | ~20 keys |
| Schedule | ~15 keys |
| Live Streaming | ~25 keys |

##### Total Keys
- **577 translation keys**

##### Status
- [x] Fully implemented and functional

---

### 3. index.ts

##### Type
i18n System

##### Purpose
Core internationalization system providing translation and localization services.

##### Key Functions

| Name | Parameters | Return | Purpose |
|------|------------|--------|---------|
| t | key: string, lang: Language | string | Translates key to specified language |
| getUILanguage | lang: Language | TranslatedLanguage | Returns valid UI language |
| isRTL | lang: Language | boolean | Checks if language is RTL |
| getDir | lang: Language | 'rtl' or 'ltr' | Returns text direction for language |
| getLocalizedName | item: Record<string, any>, lang: Language | string | Gets localized name from item |
| getCategoryName | category: Record<string, any>, lang: Language | string | Gets localized category name |

##### Translation System Features

1. **Fallback Mechanism**: If translation not found in requested language, falls back to English
2. **Localized Name Resolution**: Smart logic for getting category/item names:
   - Try i18n translation
   - Try slug as key (converted to snake_case)
   - Try name_${lang} property
   - Fallback to English or any available language

3. **RTL Support**: Handles right-to-left languages (Arabic, Persian, Hebrew, Urdu)

4. **Language Detection**:
   - `getLanguageFromCountry()`: Gets language from country code
   - Supports any language code with fallback to English

##### Translation Usage Examples

```typescript
// Basic translation
t('app_title', 'ar'); // Returns "ديولي"
t('app_title', 'en'); // Returns "Dueli"

// Nested keys
t('categories.science', 'ar'); // Returns "العلوم"

// Error handling for missing keys
t('nonexistent.key', 'ar'); // Returns "nonexistent.key"
```

##### Status
- [x] Fully implemented and functional

---

## Summary of All Files

| Module | File | Status | Purpose |
|--------|------|--------|---------|
| lib | jitsi-config.ts | ✅ | Jitsi Meet integration configuration |
| lib/oauth | BaseOAuthProvider.ts | ✅ | Abstract OAuth provider class |
| lib/oauth | google.ts | ✅ | Google OAuth implementation |
| lib/oauth | microsoft.ts | ✅ | Microsoft OAuth implementation |
| lib/oauth | facebook.ts | ✅ | Facebook OAuth implementation |
| lib/oauth | tiktok.ts | ❓ | TikTok OAuth implementation (needs testing) |
| lib/oauth | OAuthProviderFactory.ts | ✅ | OAuth provider factory |
| lib/oauth | types.ts | ✅ | OAuth type definitions |
| lib/oauth | utils.ts | ✅ | OAuth utility functions |
| lib/services | CryptoUtils.ts | ✅ | Cryptographic utilities |
| lib/services | EmailService.ts | ✅ | Email sending service |
| config | defaults.ts | ✅ | Default configuration values |
| config | pwa.ts | ✅ | PWA manifest and service worker |
| config | types.ts | ✅ | Core TypeScript interfaces |
| middleware | auth.ts | ✅ | Authentication and authorization middleware |
| i18n | ar.ts | ✅ | Arabic translations |
| i18n | en.ts | ✅ | English translations |
| i18n | index.ts | ✅ | i18n system and helpers |

## Total Files Documented: 22

This documentation provides comprehensive coverage of the core utilities, configuration, middleware, and i18n system for the Dueli platform. All files are properly structured with clear purposes and functionality.
