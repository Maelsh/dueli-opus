# 🛠️ دليل مطور ديولي (العربية)

<div align="center">

![شعار ديولي](../public/static/dueli-icon.png)

**مرجع تقني للمطورين**

</div>

---

## 📖 فهرس المحتويات

1. [نظرة عامة على الهندسة](#نظرة-عامة-على-الهندسة)
2. [المبادئ الإلزامية](#المبادئ-الإلزامية)
3. [هيكل المشروع](#هيكل-المشروع)
4. [طبقة قاعدة البيانات](#طبقة-قاعدة-البيانات)
5. [طبقة API](#طبقة-api)
6. [هندسة جانب العميل](#هندسة-جانب-العميل)
7. [الميزات غير المكتملة](#الميزات-غير-المكتملة)
8. [التحذيرات التقنية](#التحذيرات-التقنية)
9. [إرشادات التطوير](#إرشادات-التطوير)
10. [الاختبار والتصحيح](#الاختبار-والتصحيح)

---

## نظرة عامة على الهندسة

### نمط MVC

تتبع ديولي هندسة MVC (النموذج-العرض-المتحكم) الصارمة:

```
┌─────────────────────────────────────────────────────────────┐
│                        العميل                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │    الحالة   │  │   الخدمات   │  │   الواجهة   │         │
│  │  (التخزين)  │  │  (المنطق)   │  │  (العرض)    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        الخادم                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   المسارات  │──│ المتحكمات   │──│   النماذج   │         │
│  │ (API/HTML)  │  │  (المنطق)   │  │  (البيانات) │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                              │                               │
│                              ▼                               │
│                    ┌─────────────┐                          │
│                    │ قاعدة D1    │                          │
│                    │  (SQLite)   │                          │
│                    └─────────────┘                          │
└─────────────────────────────────────────────────────────────┘
```

### حزمة التقنيات

| الطبقة | التقنية | الغرض |
|--------|---------|-------|
| وقت التشغيل | Cloudflare Workers | تنفيذ بلا خادم |
| الإطار | Hono 4.x | توجيه HTTP والبرمجيات الوسيطة |
| قاعدة البيانات | Cloudflare D1 | قاعدة بيانات SQLite |
| اللغة | TypeScript 5.x | أمان الأنواع |
| التنسيق | TailwindCSS 4.x | CSS أولاً بالأدوات |
| البناء | Vite 7.x | الحزم وخادم التطوير |
| العميل | Vanilla JS/TS | بدون تبعيات إطار عمل |

---

## المبادئ الإلزامية

### 1. أمان الأنواع

**يجب أن يكون جميع الكود مكتوب الأنواع بالكامل.**

```typescript
// ✅ صحيح
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

// ❌ خطأ
function getUser(id) {
    return this.db.prepare('SELECT * FROM users WHERE id = ?')
        .bind(id)
        .first();
}
```

### 2. معالجة الأخطاء

**يجب أن تحتوي جميع العمليات غير المتزامنة على معالجة أخطاء مناسبة.**

```typescript
// ✅ صحيح
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

// ❌ خطأ
const user = await UserModel.findById(db, userId);
return c.json({ data: user });
```

### 3. منع حقن SQL

**استخدم دائماً استعلامات ذات معلمات.**

```typescript
// ✅ صحيح
const result = await db.prepare('SELECT * FROM users WHERE email = ?')
    .bind(email)
    .all();

// ❌ خطأ - ثغرة حقن SQL
const result = await db.prepare(`SELECT * FROM users WHERE email = '${email}'`)
    .all();
```

### 4. برمجية المصادقة الوسيطة

**المسارات المحمية يجب أن تستخدم برمجية المصادقة الوسيطة.**

```typescript
// ✅ صحيح
app.post('/api/competitions', authMiddleware, async (c) => {
    const user = c.get('user');
    // ... إنشاء المنافسة
});

// ❌ خطأ - بدون فحص مصادقة
app.post('/api/competitions', async (c) => {
    // ... إنشاء المنافسة بدون مصادقة
});
```

### 5. التدويل

**جميع النصوص التي تظهر للمستخدم يجب أن تكون قابلة للترجمة.**

```typescript
// ✅ صحيح
const tr = translations[getUILanguage(lang)];
const message = tr.competition_created;

// ❌ خطأ - نص ثابت
const message = 'تم إنشاء المنافسة بنجاح';
```

---

## هيكل المشروع

### تخطيط الدليل

```
src/
├── main.ts                    # نقطة الدخول، إعداد تطبيق Hono
├── config/
│   ├── types.ts               # واجهات TypeScript
│   ├── defaults.ts            # التكوين الافتراضي
│   └── pwa.ts                 # تكوين PWA
│
├── models/
│   ├── base/
│   │   └── BaseModel.ts       # النموذج الأساسي المجرد
│   ├── UserModel.ts
│   ├── CompetitionModel.ts
│   └── ...                    # نماذج أخرى
│
├── controllers/
│   ├── base/
│   │   └── BaseController.ts  # المتحكم الأساسي
│   ├── AuthController.ts
│   ├── CompetitionController.ts
│   └── ...                    # متحكمات أخرى
│
├── modules/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── routes.ts      # مسارات API للمصادقة
│   │   │   ├── helpers.ts     # مساعدات المصادقة
│   │   │   └── oauth-routes.ts # مسارات OAuth
│   │   └── ...                # وحدات API أخرى
│   │
│   └── pages/
│       ├── home-page.ts
│       ├── competition-page.ts
│       └── ...                # صفحات أخرى
│
├── client/
│   ├── index.ts               # نقطة دخول العميل
│   ├── core/
│   │   ├── State.ts           # إدارة الحالة
│   │   ├── ApiClient.ts       # عميل HTTP
│   │   └── CookieUtils.ts     # أدوات الكوكيز
│   ├── services/
│   │   ├── AuthService.ts
│   │   ├── ThemeService.ts
│   │   └── ...                # خدمات أخرى
│   ├── helpers/
│   │   ├── DateFormatter.ts
│   │   ├── NumberFormatter.ts
│   │   └── ...                # مساعدات أخرى
│   └── ui/
│       ├── Toast.ts
│       ├── Modal.ts
│       └── ...                # مكونات واجهة أخرى
│
├── shared/
│   ├── components/
│   │   ├── competition-card.ts
│   │   ├── user-card.ts
│   │   └── ...                # مكونات مشتركة
│   └── templates/
│       └── layout.ts          # قالب تخطيط HTML
│
├── lib/
│   ├── oauth/
│   │   ├── BaseOAuthProvider.ts
│   │   ├── google.ts
│   │   └── ...                # مزودو OAuth
│   └── services/
│       ├── EmailService.ts
│       ├── CryptoUtils.ts
│       └── ...                # خدمات مساعدة
│
├── i18n/
│   ├── ar.ts                  # ترجمات العربية
│   ├── en.ts                  # ترجمات الإنجليزية
│   └── index.ts               # أدوات التدويل
│
├── middleware/
│   ├── auth.ts                # برمجية المصادقة الوسيطة
│   └── index.ts               # تصديرات البرمجيات الوسيطة
│
└── countries.ts               # بيانات الدول
```

---

## طبقة قاعدة البيانات

### فئة BaseModel

جميع النماذج ترث من فئة BaseModel:

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
        // ... تطبيق الخيارات
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

### مثال على النموذج

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

## طبقة API

### تعريف المسار

```typescript
// src/modules/api/users/routes.ts
import { Hono } from 'hono';
import { authMiddleware } from '../../../middleware/auth';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// المسارات العامة
app.get('/:id', async (c) => {
    const db = c.env.DB;
    const id = parseInt(c.req.param('id'));
    
    const user = await UserModel.findById(db, id);
    if (!user) {
        return c.json({ success: false, error: 'User not found' }, 404);
    }
    
    return c.json({ success: true, data: user });
});

// المسارات المحمية
app.put('/:id', authMiddleware, async (c) => {
    const currentUser = c.get('user');
    const targetId = parseInt(c.req.param('id'));
    
    // السماح فقط للمستخدمين بتحديث ملفهم الخاص
    if (currentUser.id !== targetId) {
        return c.json({ success: false, error: 'Unauthorized' }, 403);
    }
    
    const body = await c.req.json();
    const updated = await UserModel.update(c.env.DB, targetId, body);
    
    return c.json({ success: true, data: updated });
});

export default app;
```

### نمط المتحكم

```typescript
// src/controllers/UserController.ts
export class UserController extends BaseController {
    async getProfile(c: Context): Promise<Response> {
        const userId = this.getCurrentUserId(c);
        const user = await UserModel.findById(this.db, userId);
        
        if (!user) {
            return this.notFound('المستخدم غير موجود');
        }
        
        return this.success(user);
    }

    async updateProfile(c: Context): Promise<Response> {
        const userId = this.getCurrentUserId(c);
        const body = await c.req.json();
        
        // التحقق من المدخلات
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

## هندسة جانب العميل

### إدارة الحالة

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
        // التحميل من الكوكيز
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
        
        // إرجاع دالة إلغاء الاشتراك
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

### عميل API

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
            throw new Error(result.error || 'فشل الطلب');
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

## الميزات غير المكتملة

### 1. حذف الحساب

**الموقع**: `src/modules/pages/settings-page.ts:220`

**الحالة الحالية**:
```typescript
// TODO: Implement account deletion
alert('Account deletion will be implemented soon.');
```

**التنفيذ المطلوب**:
1. إضافة نقطة نهاية DELETE في `/api/users/me`
2. حذف بيانات المستخدم من جميع الجداول المرتبطة
3. حذف جلسات المستخدم
4. حذف ملفات المستخدم (الصورة الرمزية، إلخ)
5. تجريد أو حذف محتوى المستخدم (التعليقات، إلخ)

**جداول قاعدة البيانات للتحديث**:
- `users` - حذف السجل
- `sessions` - حذف جميع جلسات المستخدم
- `competitions` - معالجة مراجع المنشئ/الخصم
- `comments` - حذف أو تجريد الهوية
- `notifications` - حذف جميع إشعارات المستخدم
- `messages` - حذف أو تجريد الهوية
- `likes`, `dislikes`, `ratings` - حذف

### 2. نظام طلب السحب

**الموقع**: `src/modules/pages/earnings-page.ts:166`

**الحالة الحالية**:
```typescript
// TODO: Implement withdrawal request
alert('Withdrawal request will be implemented soon.');
```

**التنفيذ المطلوب**:
1. إنشاء جدول `withdrawal_requests`
2. إضافة نقاط نهاية API لطلبات السحب
3. إضافة لوحة مشرف لمعالجة السحوبات
4. التكامل مع مزود الدفع (PayPal، التحويل البنكي)

**مخطط قاعدة البيانات**:
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

### 3. تكامل الدفع للتبرعات

**الموقع**: `src/modules/pages/donate-page.ts:135`

**الحالة الحالية**:
```typescript
// TODO: Integrate with payment processor
alert(`Thank you for your donation of $${amount}! Payment processing will be implemented soon.`);
```

**التنفيذ المطلوب**:
1. التكامل مع مزود الدفع (Stripe، PayPal)
2. إنشاء جدول `donations`
3. إضافة نقاط نهاية API للتبرعات
4. معالجة webhooks الدفع
5. تحديث أرباح المنشئ

**مخطط قاعدة البيانات**:
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

### 4. نظام الإبلاغ عن الإعلانات

**الموقع**: `src/modules/pages/live-room-page.ts:807`

**الحالة الحالية**:
```typescript
// TODO: Send report to server
log('Ad reported', 'info');
```

**التنفيذ المطلوب**:
1. إضافة جدول `ad_reports` أو توسيع جدول `reports`
2. إنشاء نقطة نهاية API للإبلاغ عن الإعلانات
3. إضافة لوحة مشرف لمراجعة تقارير الإعلانات

### 5. إشعار Toast في الغرفة المباشرة

**الموقع**: `src/modules/pages/live-room-page.ts:962`

**الحالة الحالية**:
```typescript
// TODO: Implement toast notification
console.log('[' + type + ']', msg);
```

**التنفيذ المطلوب**:
- استخدام خدمة Toast الموجودة من `src/client/ui/Toast.ts`

---

## التحذيرات التقنية

### ⚠️ مشاكل حرجة

1. **ملفات ترحيل قاعدة البيانات مفقودة**
   - لم يتم العثور على ملفات ترحيل في المستودع
   - مخطط قاعدة البيانات معرف في `seed.sql` فقط
   - الحاجة لإنشاء نظام ترحيل مناسب

2. **أمان الجلسة**
   - الجلسات مخزنة في قاعدة البيانات بدون تشفير
   - النظر في تشفير رموز الجلسة
   - إضافة حماية CSRF

3. **تحديد المعدل**
   - لا يوجد تحديد معدل على نقاط نهاية API
   - عرضة لهجمات القوة الغاشمة
   - إضافة برمجية تحديد المعدل الوسيطة

### ⚠️ اعتبارات الأداء

1. **استعلامات قاعدة البيانات**
   - بعض الاستعلامات تفتقر إلى الفهرسة المناسبة
   - إضافة فهارس على الأعمدة التي يتم الاستعلام عنها بشكل متكرر
   - استخدام تحليل الاستعلام للتحسين

2. **حجم حزمة العميل**
   - حزمة العميل حوالي ~13KB (مضغوطة)
   - النظر في تقسيم الكود للصفحات

3. **تحسين الصور**
   - لا توجد خط أنابيب لتحسين الصور
   - النظر في استخدام Cloudflare Images

### ⚠️ توصيات الأمان

1. **التحقق من المدخلات**
   - إضافة تحقق شامل من المدخلات
   - استخدام مكتبة تحقق (مثل Zod)

2. **سياسة أمان المحتوى**
   - إضافة رؤوس CSP
   - تقييد النصوص المضمنة

3. **تكوين CORS**
   - مراجعة إعدادات CORS
   - تقييد الأصول المسموح بها في الإنتاج

---

## إرشادات التطوير

### نمط الكود

```typescript
// استخدم const للثوابت
const MAX_RETRIES = 3;

// استخدم async/await بدلاً من .then()
async function fetchData() {
    try {
        const data = await ApiClient.get('/api/data');
        return data;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

// استخدم التفكيك
const { id, name, email } = user;

// استخدم القوالب الحرفية
const message = `تم إنشاء المستخدم ${name} بنجاح`;

// استخدم السلسلة الاختيارية
const avatar = user?.profile?.avatar_url;

// استخدم عامل الدمج الفارغ
const lang = user.language ?? 'ar';
```

### اصطلاحات التسمية

| النوع | الاصطلاح | المثال |
|-------|----------|--------|
| الملفات | kebab-case | `user-model.ts` |
| الفئات | PascalCase | `UserModel` |
| الدوال | camelCase | `getUserById` |
| الثوابت | SCREAMING_SNAKE | `MAX_RETRIES` |
| الواجهات | PascalCase | `User` |
| الأنواع | PascalCase | `Language` |

### رسائل التزام Git

```
feat: إضافة صفحة ملف المستخدم
fix: حل مشكلة المصادقة
docs: تحديث وثائق API
style: تنسيق الكود مع prettier
refactor: إعادة هيكلة النماذج
test: إضافة اختبارات وحدة لـ UserModel
chore: تحديث التبعيات
```

---

## الاختبار والتصحيح

### التطوير المحلي

```bash
# بدء خادم التطوير مع وضع D1 sandbox
npm run dev:sandbox

# بناء CSS
npm run build:css

# بناء حزمة العميل
npm run build:client

# إعادة تعيين قاعدة البيانات
npm run db:reset
```

### التصحيح

```typescript
// استخدم console.log مع بادئة
console.log('[AuthService]', 'Checking auth...');

// استخدم علم التصحيح
const DEBUG = true;
if (DEBUG) {
    console.log('State:', State);
}
```

### تصحيح قاعدة البيانات

```bash
# الاتصال بقاعدة بيانات D1 المحلية
wrangler d1 execute dueli-db --local --command "SELECT * FROM users LIMIT 5"

# فحص مخطط قاعدة البيانات
wrangler d1 execute dueli-db --local --command ".schema"
```

---

## مرجع سريع

### متغيرات البيئة

```env
# مطلوب
DB=D1Database (يُحقن تلقائياً)
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

# البث
STREAMING_URL=https://stream.maelshpro.com
UPLOAD_URL=https://maelshpro.com/ffmpeg
TURN_URL=turn:maelshpro.com:3000
TURN_SECRET=your_secret
```

### الأوامر الشائعة

| الأمر | الوصف |
|-------|-------|
| `npm run dev` | بدء خادم التطوير |
| `npm run dev:sandbox` | بدء مع وضع D1 sandbox |
| `npm run build` | بناء للإنتاج |
| `npm run deploy` | نشر على Cloudflare |
| `npm run db:migrate:local` | تشغيل الترحيلات |
| `npm run db:seed` | بذر قاعدة البيانات |
| `npm run db:reset` | إعادة تعيين قاعدة البيانات |

---

<div align="center">

**صُنع بـ ❤️ من قبل Maelsh Pro**

</div>
