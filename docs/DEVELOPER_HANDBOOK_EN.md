# 🛠️ Dueli Developer Handbook (English)

<div align="center">

![Dueli Logo](../public/static/dueli-icon.png)

**Technical Reference for Developers**

</div>

---

## 📖 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Mandatory Principles](#mandatory-principles)
3. [Project Structure](#project-structure)
4. [Database Layer](#database-layer)
5. [API Layer](#api-layer)
6. [Client-Side Architecture](#client-side-architecture)
7. [Incomplete Features](#incomplete-features)
8. [Technical Warnings](#technical-warnings)
9. [Development Guidelines](#development-guidelines)
10. [Testing & Debugging](#testing--debugging)

---

## Architecture Overview

### MVC Pattern

Dueli follows a strict MVC (Model-View-Controller) architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │    State    │  │   Services  │  │     UI      │         │
│  │  (Storage)  │  │  (Logic)    │  │  (Render)   │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        SERVER                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Routes    │──│ Controllers │──│   Models    │         │
│  │  (API/HTML) │  │  (Logic)    │  │  (Data)     │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                              │                               │
│                              ▼                               │
│                    ┌─────────────┐                          │
│                    │  D1 Database │                          │
│                    │   (SQLite)  │                          │
│                    └─────────────┘                          │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Runtime | Cloudflare Workers | Serverless execution |
| Framework | Hono 4.x | HTTP routing & middleware |
| Database | Cloudflare D1 | SQLite database |
| Language | TypeScript 5.x | Type safety |
| Styling | TailwindCSS 4.x | Utility-first CSS |
| Build | Vite 7.x | Bundling & dev server |
| Client | Vanilla JS/TS | No framework dependencies |

---

## Mandatory Principles

### 1. Type Safety

**All code must be fully typed.**

```typescript
// ✅ CORRECT
interface User {
    id: number;
    email: string;
    username: string;
}

function getUser(id: number): Promise<User | null> {
    return this.db.prepare('SELECT * FROM users WHERE id = ?')
        .bind(id)
        .first<User>();
}

// ❌ WRONG
function getUser(id) {
    return this.db.prepare('SELECT * FROM users WHERE id = ?')
        .bind(id)
        .first();
}
```

### 2. Error Handling

**All async operations must have proper error handling.**

```typescript
// ✅ CORRECT
try {
    const user = await UserModel.findById(db, userId);
    if (!user) {
        return c.json({ success: false, error: 'User not found' }, 404);
    }
    return c.json({ success: true, data: user });
} catch (error) {
    console.error('Error fetching user:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
}

// ❌ WRONG
const user = await UserModel.findById(db, userId);
return c.json({ data: user });
```

### 3. SQL Injection Prevention

**Always use parameterized queries.**

```typescript
// ✅ CORRECT
const result = await db.prepare('SELECT * FROM users WHERE email = ?')
    .bind(email)
    .all();

// ❌ WRONG - SQL Injection vulnerability
const result = await db.prepare(`SELECT * FROM users WHERE email = '${email}'`)
    .all();
```

### 4. Authentication Middleware

**Protected routes must use auth middleware.**

```typescript
// ✅ CORRECT
app.post('/api/competitions', authMiddleware, async (c) => {
    const user = c.get('user');
    // ... create competition
});

// ❌ WRONG - No auth check
app.post('/api/competitions', async (c) => {
    // ... create competition without auth
});
```

### 5. Internationalization

**All user-facing text must be translatable.**

```typescript
// ✅ CORRECT
const tr = translations[getUILanguage(lang)];
const message = tr.competition_created;

// ❌ WRONG - Hardcoded text
const message = 'Competition created successfully';
```

---

## Project Structure

### Directory Layout

```
src/
├── main.ts                    # Entry point, Hono app setup
├── config/
│   ├── types.ts               # TypeScript interfaces
│   ├── defaults.ts            # Default configuration
│   └── pwa.ts                 # PWA configuration
│
├── models/
│   ├── base/
│   │   └── BaseModel.ts       # Abstract base model
│   ├── UserModel.ts
│   ├── CompetitionModel.ts
│   └── ...                    # Other models
│
├── controllers/
│   ├── base/
│   │   └── BaseController.ts  # Base controller
│   ├── AuthController.ts
│   ├── CompetitionController.ts
│   └── ...                    # Other controllers
│
├── modules/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── routes.ts      # Auth API routes
│   │   │   ├── helpers.ts     # Auth helpers
│   │   │   └── oauth-routes.ts # OAuth routes
│   │   └── ...                # Other API modules
│   │
│   └── pages/
│       ├── home-page.ts
│       ├── competition-page.ts
│       └── ...                # Other pages
│
├── client/
│   ├── index.ts               # Client entry point
│   ├── core/
│   │   ├── State.ts           # State management
│   │   ├── ApiClient.ts       # HTTP client
│   │   └── CookieUtils.ts     # Cookie utilities
│   ├── services/
│   │   ├── AuthService.ts
│   │   ├── ThemeService.ts
│   │   └── ...                # Other services
│   ├── helpers/
│   │   ├── DateFormatter.ts
│   │   ├── NumberFormatter.ts
│   │   └── ...                # Other helpers
│   └── ui/
│       ├── Toast.ts
│       ├── Modal.ts
│       └── ...                # Other UI components
│
├── shared/
│   ├── components/
│   │   ├── competition-card.ts
│   │   ├── user-card.ts
│   │   └── ...                # Shared components
│   └── templates/
│       └── layout.ts          # HTML layout template
│
├── lib/
│   ├── oauth/
│   │   ├── BaseOAuthProvider.ts
│   │   ├── google.ts
│   │   └── ...                # OAuth providers
│   └── services/
│       ├── EmailService.ts
│       ├── CryptoUtils.ts
│       └── ...                # Utility services
│
├── i18n/
│   ├── ar.ts                  # Arabic translations
│   ├── en.ts                  # English translations
│   └── index.ts               # i18n utilities
│
├── middleware/
│   ├── auth.ts                # Authentication middleware
│   └── index.ts               # Middleware exports
│
└── countries.ts               # Country data
```

---

## Database Layer

### BaseModel Class

All models extend the BaseModel class:

```typescript
// src/models/base/BaseModel.ts
export abstract class BaseModel {
    protected db: D1Database;
    protected tableName: string;

    constructor(db: D1Database, tableName: string) {
        this.db = db;
        this.tableName = tableName;
    }

    async findById<T>(id: number): Promise<T | null> {
        return this.db.prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`)
            .bind(id)
            .first<T>();
    }

    async findAll<T>(options?: QueryOptions): Promise<T[]> {
        let query = `SELECT * FROM ${this.tableName}`;
        // ... apply options
        const result = await this.db.prepare(query).all<T>();
        return result.results || [];
    }

    async delete(id: number): Promise<boolean> {
        const result = await this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`)
            .bind(id)
            .run();
        return result.success;
    }
}
```

### Model Example

```typescript
// src/models/UserModel.ts
export class UserModel extends BaseModel {
    constructor(db: D1Database) {
        super(db, 'users');
    }

    async findByEmail(email: string): Promise<User | null> {
        return this.db.prepare('SELECT * FROM users WHERE email = ?')
            .bind(email)
            .first<User>();
    }

    async findByUsername(username: string): Promise<User | null> {
        return this.db.prepare('SELECT * FROM users WHERE username = ?')
            .bind(username)
            .first<User>();
    }

    async create(data: CreateUserData): Promise<User> {
        const result = await this.db.prepare(`
            INSERT INTO users (email, username, password_hash, display_name, avatar_url, country, language)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
            data.email,
            data.username,
            data.password_hash,
            data.display_name,
            data.avatar_url || null,
            data.country || 'SA',
            data.language || 'ar'
        ).run();

        return this.findById<User>(result.meta.last_row_id);
    }

    async update(id: number, data: UpdateUserData): Promise<User | null> {
        const fields: string[] = [];
        const values: any[] = [];

        Object.entries(data).forEach(([key, value]) => {
            if (value !== undefined) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        });

        if (fields.length === 0) return this.findById(id);

        values.push(id);
        await this.db.prepare(`
            UPDATE users SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).bind(...values).run();

        return this.findById(id);
    }
}
```

---

## API Layer

### Route Definition

```typescript
// src/modules/api/users/routes.ts
import { Hono } from 'hono';
import { authMiddleware } from '../../../middleware/auth';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Public routes
app.get('/:id', async (c) => {
    const db = c.env.DB;
    const id = parseInt(c.req.param('id'));
    
    const user = await UserModel.findById(db, id);
    if (!user) {
        return c.json({ success: false, error: 'User not found' }, 404);
    }
    
    return c.json({ success: true, data: user });
});

// Protected routes
app.put('/:id', authMiddleware, async (c) => {
    const currentUser = c.get('user');
    const targetId = parseInt(c.req.param('id'));
    
    // Only allow users to update their own profile
    if (currentUser.id !== targetId) {
        return c.json({ success: false, error: 'Unauthorized' }, 403);
    }
    
    const body = await c.req.json();
    const updated = await UserModel.update(c.env.DB, targetId, body);
    
    return c.json({ success: true, data: updated });
});

export default app;
```

### Controller Pattern

```typescript
// src/controllers/UserController.ts
export class UserController extends BaseController {
    async getProfile(c: Context): Promise<Response> {
        const userId = this.getCurrentUserId(c);
        const user = await UserModel.findById(this.db, userId);
        
        if (!user) {
            return this.notFound('User not found');
        }
        
        return this.success(user);
    }

    async updateProfile(c: Context): Promise<Response> {
        const userId = this.getCurrentUserId(c);
        const body = await c.req.json();
        
        // Validate input
        const validation = this.validate(body, {
            display_name: { required: true, minLength: 2 },
            bio: { maxLength: 500 }
        });
        
        if (!validation.valid) {
            return this.validationError(validation.errors);
        }
        
        const updated = await UserModel.update(this.db, userId, body);
        return this.success(updated);
    }
}
```

---

## Client-Side Architecture

### State Management

```typescript
// src/client/core/State.ts
export class State {
    private static _currentUser: User | null = null;
    private static _sessionId: string | null = null;
    private static _lang: Language = 'ar';
    private static _isDarkMode: boolean = false;
    private static _country: string = 'SA';

    static get currentUser(): User | null {
        return this._currentUser;
    }

    static set currentUser(user: User | null) {
        this._currentUser = user;
        this.notifyListeners('user', user);
    }

    static init(): void {
        // Load from cookies
        this._sessionId = CookieUtils.get('session');
        this._lang = CookieUtils.get('lang') as Language || 'ar';
        this._isDarkMode = CookieUtils.get('theme') === 'dark';
        this._country = CookieUtils.get('country') || 'SA';
    }

    private static listeners: Map<string, Function[]> = new Map();

    static subscribe(key: string, callback: Function): () => void {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, []);
        }
        this.listeners.get(key)!.push(callback);
        
        // Return unsubscribe function
        return () => {
            const callbacks = this.listeners.get(key);
            const index = callbacks?.indexOf(callback) ?? -1;
            if (index > -1) {
                callbacks?.splice(index, 1);
            }
        };
    }

    private static notifyListeners(key: string, value: any): void {
        const callbacks = this.listeners.get(key);
        callbacks?.forEach(cb => cb(value));
    }
}
```

### API Client

```typescript
// src/client/core/ApiClient.ts
export class ApiClient {
    private static async request<T>(
        method: string,
        url: string,
        data?: any
    ): Promise<T> {
        const options: RequestInit = {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
        };

        if (data) {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(url, options);
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Request failed');
        }

        return result;
    }

    static get<T>(url: string): Promise<T> {
        return this.request<T>('GET', url);
    }

    static post<T>(url: string, data?: any): Promise<T> {
        return this.request<T>('POST', url, data);
    }

    static put<T>(url: string, data?: any): Promise<T> {
        return this.request<T>('PUT', url, data);
    }

    static delete<T>(url: string): Promise<T> {
        return this.request<T>('DELETE', url);
    }
}
```

---

## Incomplete Features

### 1. Account Deletion

**Location**: `src/modules/pages/settings-page.ts:220`

**Current State**:
```typescript
// TODO: Implement account deletion
alert('Account deletion will be implemented soon.');
```

**Required Implementation**:
1. Add DELETE endpoint in `/api/users/me`
2. Delete user data from all related tables
3. Delete user sessions
4. Delete user files (avatar, etc.)
5. Anonymize or delete user content (comments, etc.)

**Database Tables to Update**:
- `users` - Delete record
- `sessions` - Delete all user sessions
- `competitions` - Handle creator/opponent references
- `comments` - Delete or anonymize
- `notifications` - Delete all user notifications
- `messages` - Delete or anonymize
- `likes`, `dislikes`, `ratings` - Delete

### 2. Withdrawal Request System

**Location**: `src/modules/pages/earnings-page.ts:166`

**Current State**:
```typescript
// TODO: Implement withdrawal request
alert('Withdrawal request will be implemented soon.');
```

**Required Implementation**:
1. Create `withdrawal_requests` table
2. Add API endpoints for withdrawal requests
3. Add admin panel for processing withdrawals
4. Integrate with payment provider (PayPal, Bank Transfer)

**Database Schema**:
```sql
CREATE TABLE withdrawal_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL,
    payment_details TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    processed_at TEXT,
    processed_by INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (processed_by) REFERENCES users(id)
);
```

### 3. Payment Integration for Donations

**Location**: `src/modules/pages/donate-page.ts:135`

**Current State**:
```typescript
// TODO: Integrate with payment processor
alert(`Thank you for your donation of $${amount}! Payment processing will be implemented soon.`);
```

**Required Implementation**:
1. Integrate with payment provider (Stripe, PayPal)
2. Create `donations` table
3. Add donation API endpoints
4. Handle payment webhooks
5. Update creator earnings

**Database Schema**:
```sql
CREATE TABLE donations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    donor_id INTEGER,
    recipient_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    payment_method TEXT NOT NULL,
    payment_id TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (donor_id) REFERENCES users(id),
    FOREIGN KEY (recipient_id) REFERENCES users(id)
);
```

### 4. Ad Reporting System

**Location**: `src/modules/pages/live-room-page.ts:807`

**Current State**:
```typescript
// TODO: Send report to server
log('Ad reported', 'info');
```

**Required Implementation**:
1. Add `ad_reports` table or extend `reports` table
2. Create API endpoint for ad reports
3. Add admin panel for reviewing ad reports

### 5. Toast Notification in Live Room

**Location**: `src/modules/pages/live-room-page.ts:962`

**Current State**:
```typescript
// TODO: Implement toast notification
console.log('[' + type + ']', msg);
```

**Required Implementation**:
- Use existing Toast service from `src/client/ui/Toast.ts`

---

## Technical Warnings

### ⚠️ Critical Issues

1. **Missing Database Migrations**
   - No migration files found in repository
   - Database schema is defined in `seed.sql` only
   - Need to create proper migration system

2. **Session Security**
   - Sessions stored in database without encryption
   - Consider encrypting session tokens
   - Add CSRF protection

3. **Rate Limiting**
   - No rate limiting on API endpoints
   - Vulnerable to brute force attacks
   - Add rate limiting middleware

### ⚠️ Performance Considerations

1. **Database Queries**
   - Some queries lack proper indexing
   - Add indexes on frequently queried columns
   - Use query analysis for optimization

2. **Client Bundle Size**
   - Client bundle is ~13KB (minified)
   - Consider code splitting for pages

3. **Image Optimization**
   - No image optimization pipeline
   - Consider using Cloudflare Images

### ⚠️ Security Recommendations

1. **Input Validation**
   - Add comprehensive input validation
   - Use a validation library (e.g., Zod)

2. **Content Security Policy**
   - Add CSP headers
   - Restrict inline scripts

3. **CORS Configuration**
   - Review CORS settings
   - Restrict allowed origins in production

---

## Development Guidelines

### Code Style

```typescript
// Use const for constants
const MAX_RETRIES = 3;

// Use async/await over .then()
async function fetchData() {
    try {
        const data = await ApiClient.get('/api/data');
        return data;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

// Use destructuring
const { id, name, email } = user;

// Use template literals
const message = `User ${name} created successfully`;

// Use optional chaining
const avatar = user?.profile?.avatar_url;

// Use nullish coalescing
const lang = user.language ?? 'ar';
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `user-model.ts` |
| Classes | PascalCase | `UserModel` |
| Functions | camelCase | `getUserById` |
| Constants | SCREAMING_SNAKE | `MAX_RETRIES` |
| Interfaces | PascalCase | `User` |
| Types | PascalCase | `Language` |

### Git Commit Messages

```
feat: add user profile page
fix: resolve authentication issue
docs: update API documentation
style: format code with prettier
refactor: restructure models
test: add unit tests for UserModel
chore: update dependencies
```

---

## Testing & Debugging

### Local Development

```bash
# Start development server with D1 sandbox
npm run dev:sandbox

# Build CSS
npm run build:css

# Build client bundle
npm run build:client

# Reset database
npm run db:reset
```

### Debugging

```typescript
// Use console.log with prefix
console.log('[AuthService]', 'Checking auth...');

// Use debug flag
const DEBUG = true;
if (DEBUG) {
    console.log('State:', State);
}
```

### Database Debugging

```bash
# Connect to local D1 database
wrangler d1 execute dueli-db --local --command "SELECT * FROM users LIMIT 5"

# Check database schema
wrangler d1 execute dueli-db --local --command ".schema"
```

---

## Quick Reference

### Environment Variables

```env
# Required
DB=D1Database (auto-injected)
EMAIL_API_KEY=your_key
EMAIL_API_URL=your_url

# OAuth
GOOGLE_CLIENT_ID=your_id
GOOGLE_CLIENT_SECRET=your_secret
FACEBOOK_CLIENT_ID=your_id
FACEBOOK_CLIENT_SECRET=your_secret
MICROSOFT_CLIENT_ID=your_id
MICROSOFT_CLIENT_SECRET=your_secret
MICROSOFT_TENANT_ID=your_tenant
TIKTOK_CLIENT_KEY=your_key
TIKTOK_CLIENT_SECRET=your_secret

# Streaming
STREAMING_URL=https://stream.maelsh.pro
UPLOAD_URL=https://maelsh.pro/ffmpeg
TURN_URL=turn:maelsh.pro:3000
TURN_SECRET=your_secret
```

### Common Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run dev:sandbox` | Start with D1 sandbox |
| `npm run build` | Build for production |
| `npm run deploy` | Deploy to Cloudflare |
| `npm run db:migrate:local` | Run migrations |
| `npm run db:seed` | Seed database |
| `npm run db:reset` | Reset database |

---

<div align="center">

**Made with ❤️ by Maelsh Pro**

</div>
