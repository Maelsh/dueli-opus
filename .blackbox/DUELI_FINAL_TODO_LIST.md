# ✅ قائمة مهام تنفيذ منطق ديولي – النسخة النهائية
# Dueli Implementation TODO List – Final Version

> **"خطة عمل قابلة للتنفيذ فوراً مع توزيع الوكلاء"**

---

## 📋 ملخص الوكلاء والمهام

| الوكيل | المهمة الرئيسية | عدد المهام | الوقت المقدر | الأولوية |
|--------|-----------------|------------|--------------|----------|
| 🤖 وكيل 1 | البنية الأساسية (Schema) | 6 مهام | 16 ساعة | 🔴 P0 |
| 🤖 وكيل 2 | منطق المنافسات والطلبات | 10 مهام | 24 ساعة | 🔴 P0 |
| 🤖 وكيل 3 | المؤقتات والتنظيف التلقائي | 8 مهام | 18 ساعة | 🔴 P0 |
| 🤖 وكيل 4 | الإشعارات الفورية والحظر | 6 مهام | 16 ساعة | 🟡 P1 |
| 🤖 وكيل 5 | البث والتسجيل | 7 مهام | 20 ساعة | 🟡 P1 |
| 🤖 وكيل 6 | التوصيات والسجلات | 8 مهام | 18 ساعة | 🟢 P2 |
| 🤖 وكيل 7 | الاختبار والتكامل | 6 مهام | 14 ساعة | 🟢 P2 |

**المجموع: 51 مهمة – 126 ساعة (3 أسابيع بفريق 3 أشخاص)**

---

## 🤖 الوكيل 1: البنية الأساسية (Foundation Agent)

### المهمة 1.1: إكمال ملف schema.sql

**التعليمات التفصيلية:**

```sql
-- ============================================
-- الجداول المتبقية (19-25)
-- ============================================

-- 19. انطباعات الإعلانات (Ad Impressions)
CREATE TABLE ad_impressions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ad_id INTEGER NOT NULL REFERENCES advertisements(id),
    competition_id INTEGER REFERENCES competitions(id),
    user_id INTEGER REFERENCES users(id),
    impression_type TEXT CHECK (impression_type IN ('banner', 'video', 'overlay')),
    watched_duration INTEGER DEFAULT 0,
    revenue_per_view REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_impressions_ad ON ad_impressions(ad_id);
CREATE INDEX idx_impressions_competition ON ad_impressions(competition_id);

-- 20. أرباح المستخدمين (User Earnings)
CREATE TABLE user_earnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    competition_id INTEGER REFERENCES competitions(id),
    amount REAL NOT NULL,
    earning_type TEXT CHECK (earning_type IN ('competition', 'referral', 'bonus')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'available', 'withdrawn', 'cancelled')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    available_at DATETIME, -- متى تصبح متاحة للسحب
    withdrawn_at DATETIME
);

CREATE INDEX idx_earnings_user ON user_earnings(user_id);
CREATE INDEX idx_earnings_status ON user_earnings(status);

-- 21. أرباح المنصة (Platform Earnings)
CREATE TABLE platform_earnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER REFERENCES competitions(id),
    amount REAL NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 22. التقارير (Reports)
CREATE TABLE reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_id INTEGER NOT NULL REFERENCES users(id),
    reported_id INTEGER REFERENCES users(id),
    competition_id INTEGER REFERENCES competitions(id),
    report_type TEXT NOT NULL CHECK (report_type IN ('user', 'competition', 'comment', 'content')),
    reason TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'dismissed')),
    resolution TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    resolved_by INTEGER REFERENCES users(id)
);

CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_reports_reporter ON reports(reporter_id);

-- 23. الإعدادات (User Settings)
CREATE TABLE user_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id),
    theme TEXT DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
    language TEXT DEFAULT 'ar',
    notifications_enabled BOOLEAN DEFAULT 1,
    email_notifications BOOLEAN DEFAULT 1,
    push_notifications BOOLEAN DEFAULT 1,
    privacy_profile TEXT DEFAULT 'public' CHECK (privacy_profile IN ('public', 'followers', 'private')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 24. منشورات المستخدم (User Posts) - للمحتوى الإضافي
CREATE TABLE user_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    media_url TEXT,
    post_type TEXT DEFAULT 'text' CHECK (post_type IN ('text', 'image', 'video', 'link')),
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    is_pinned BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_posts_user ON user_posts(user_id);
CREATE INDEX idx_posts_created ON user_posts(created_at);

-- 25. تذكيرات المنافسات (Competition Reminders)
CREATE TABLE competition_reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    competition_id INTEGER NOT NULL REFERENCES competitions(id),
    remind_at DATETIME NOT NULL,
    is_sent BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(user_id, competition_id)
);

CREATE INDEX idx_reminders_user ON competition_reminders(user_id);
CREATE INDEX idx_reminders_competition ON competition_reminders(competition_id);
CREATE INDEX idx_reminders_time ON competition_reminders(remind_at, is_sent);
```

**ملاحظات للوكيل:**
- ✅ تأكد من كل `CHECK constraint` صحيح
- ✅ تأكد من كل `FOREIGN KEY` مع `ON DELETE`
- ✅ تأكد من كل `INDEX` على الأعمدة المستخدمة في `WHERE`
- ✅ اختبر الملف بـ `wrangler d1 execute --local --file=schema.sql`

---

### المهمة 1.2: إضافة الحقول المفقودة للجداول الموجودة

**التعليمات:**

```sql
-- إضافة حقول للمنافسات
ALTER TABLE competitions ADD COLUMN accepted_at DATETIME;
ALTER TABLE competitions ADD COLUMN max_duration INTEGER DEFAULT 7200; -- 2 hours in seconds

-- إضافة حقول للمستخدمين
ALTER TABLE users ADD COLUMN is_busy BOOLEAN DEFAULT 0;
ALTER TABLE users ADD COLUMN current_competition_id INTEGER REFERENCES competitions(id);
ALTER TABLE users ADD COLUMN busy_since DATETIME;
ALTER TABLE users ADD COLUMN elo_rating INTEGER DEFAULT 1500;

-- إضافة حقول للطلبات
ALTER TABLE competition_requests ADD COLUMN expires_at DATETIME DEFAULT (datetime('now', '+24 hours'));
```

---

### المهمة 1.3: إنشاء Migration System

**الملف:** `src/lib/db/migrate.ts`

```typescript
export class MigrationManager {
    constructor(private db: D1Database) {}
    
    async migrate(): Promise<void> {
        // جدول لتتبع المigrations
        await this.db.prepare(`
            CREATE TABLE IF NOT EXISTS migrations (
                id INTEGER PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `).run();
        
        // قائمة المigrations
        const migrations = [
            { id: 1, name: '001_initial_schema', file: '001_initial.sql' },
            { id: 2, name: '002_add_busy_status', file: '002_add_busy_status.sql' },
            { id: 3, name: '003_add_competition_expiry', file: '003_add_competition_expiry.sql' },
        ];
        
        for (const migration of migrations) {
            const exists = await this.db.prepare(
                'SELECT 1 FROM migrations WHERE id = ?'
            ).bind(migration.id).first();
            
            if (!exists) {
                const sql = await this.loadMigrationFile(migration.file);
                await this.db.batch(sql.split(';').map(s => this.db.prepare(s)));
                await this.db.prepare(
                    'INSERT INTO migrations (id, name) VALUES (?, ?)'
                ).bind(migration.id, migration.name).run();
                
                console.log(`Applied migration: ${migration.name}`);
            }
        }
    }
}
```

---

### المهمة 1.4: إنشاء Error Classes

**الملف:** `src/lib/errors/AppError.ts`

```typescript
export class AppError extends Error {
    constructor(
        public code: string,
        message: string,
        public statusCode: number = 500,
        public details?: any
    ) {
        super(message);
        this.name = 'AppError';
    }
}

export class ValidationError extends AppError {
    constructor(message: string, details?: any) {
        super('VALIDATION_ERROR', message, 422, details);
    }
}

export class AuthenticationError extends AppError {
    constructor(message: string = 'غير مصرح') {
        super('AUTHENTICATION_ERROR', message, 401);
    }
}

export class AuthorizationError extends AppError {
    constructor(message: string = 'غير مسموح') {
        super('AUTHORIZATION_ERROR', message, 403);
    }
}

export class ConflictError extends AppError {
    constructor(message: string) {
        super('CONFLICT_ERROR', message, 409);
    }
}

export class NotFoundError extends AppError {
    constructor(resource: string) {
        super('NOT_FOUND', `${resource} غير موجود`, 404);
    }
}

export class BusyError extends AppError {
    constructor(message: string = 'المستخدم مشغول في منافسة أخرى') {
        super('USER_BUSY', message, 409);
    }
}

export class TimeConflictError extends AppError {
    constructor(message: string = 'تعارض في المواعيد') {
        super('TIME_CONFLICT', message, 409);
    }
}
```

---

### المهمة 1.5: إنشاء Error Handler Middleware

**الملف:** `src/middleware/error-handler.ts`

```typescript
import { Context, Next } from 'hono';
import { AppError } from '../lib/errors/AppError';

export const errorHandler = async (err: Error, c: Context) => {
    console.error('Error:', err);
    
    if (err instanceof AppError) {
        return c.json({
            success: false,
            error: {
                code: err.code,
                message: err.message,
                details: err.details
            }
        }, err.statusCode);
    }
    
    // Unexpected errors
    return c.json({
        success: false,
        error: {
            code: 'INTERNAL_ERROR',
            message: 'حدث خطأ غير متوقع'
        }
    }, 500);
};
```

---

### المهمة 1.6: إعداد Cron Jobs في wrangler.jsonc

**التعديل على:** `wrangler.jsonc`

```json
{
  "name": "dueli",
  "main": "src/main.ts",
  "compatibility_date": "2024-01-01",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "dueli-db",
      "database_id": "your-db-id"
    }
  ],
  "triggers": {
    "crons": [
      "*/5 * * * *",    // كل 5 دقائق - تنظيف المنافسات
      "0 0 1 * *",      // أول كل شهر - تنظيف الإشعارات
      "0 0 1 1 *",      // أول كل سنة - تنظيف المستخدمين
      "*/1 * * * *"     // كل دقيقة - المهام المجدولة
    ]
  }
}
```

---

## 🤖 الوكيل 2: منطق المنافسات والطلبات (Competition Logic Agent)

### المهمة 2.1: تحديث CompetitionModel

**الملف:** `src/models/CompetitionModel.ts`

**الإضافات المطلوبة:**

```typescript
export class CompetitionModel extends BaseModel<Competition> {
    protected readonly tableName = 'competitions';
    
    // ✅ التحقق من عدم وجود تعارض زمني
    async hasTimeConflict(
        userId: number, 
        scheduledAt: string, 
        excludeCompetitionId?: number
    ): Promise<boolean> {
        const twoHours = 2 * 60 * 60; // ثواني
        
        let query = `
            SELECT 1 FROM competitions 
            WHERE (creator_id = ? OR opponent_id = ?)
            AND status IN ('accepted', 'live')
            AND scheduled_at IS NOT NULL
            AND ABS(strftime('%s', scheduled_at) - strftime('%s', ?)) < ?
        `;
        
        if (excludeCompetitionId) {
            query += ` AND id != ?`;
        }
        
        const result = await this.db.prepare(query)
            .bind(userId, userId, scheduledAt, twoHours, excludeCompetitionId || 0)
            .first();
        
        return result !== null;
    }
    
    // ✅ التحقق من عدد المنافسات المعلقة
    async getPendingCount(userId: number): Promise<number> {
        const result = await this.db.prepare(`
            SELECT COUNT(*) as count FROM competitions 
            WHERE creator_id = ? 
            AND status = 'pending'
            AND opponent_id IS NULL
        `).bind(userId).first();
        
        return result?.count || 0;
    }
    
    // ✅ تحديث حالة المنافسة مع التحقق
    async updateStatus(
        id: number, 
        status: CompetitionStatus, 
        additionalFields?: Partial<Competition>
    ): Promise<boolean> {
        const allowedTransitions: Record<CompetitionStatus, CompetitionStatus[]> = {
            'pending': ['accepted', 'cancelled'],
            'accepted': ['live', 'cancelled'],
            'live': ['completed'],
            'completed': [],
            'cancelled': []
        };
        
        const current = await this.findById(id);
        if (!current) throw new NotFoundError('المنافسة');
        
        if (!allowedTransitions[current.status].includes(status)) {
            throw new ConflictError(
                `لا يمكن التحول من ${current.status} إلى ${status}`
            );
        }
        
        const updates: any = { status, updated_at: new Date().toISOString() };
        
        if (status === 'accepted') {
            updates.accepted_at = new Date().toISOString();
        } else if (status === 'live') {
            updates.started_at = new Date().toISOString();
        } else if (status === 'completed') {
            updates.ended_at = new Date().toISOString();
        }
        
        Object.assign(updates, additionalFields);
        
        const setClause = Object.keys(updates)
            .map(k => `${k} = ?`)
            .join(', ');
        
        const result = await this.db.prepare(`
            UPDATE ${this.tableName} SET ${setClause} WHERE id = ?
        `).bind(...Object.values(updates), id).run();
        
        return result.meta.changes > 0;
    }
    
    // ✅ حذف متتالي (Cascade)
    async deleteWithRelations(id: number): Promise<void> {
        await this.db.batch([
            this.db.prepare('DELETE FROM competition_requests WHERE competition_id = ?').bind(id),
            this.db.prepare('DELETE FROM competition_reminders WHERE competition_id = ?').bind(id),
            this.db.prepare('DELETE FROM competition_heartbeats WHERE competition_id = ?').bind(id),
            this.db.prepare('DELETE FROM competition_scheduled_tasks WHERE competition_id = ?').bind(id),
            this.db.prepare('DELETE FROM notifications WHERE reference_type = ? AND reference_id = ?')
                .bind('competition', id),
            this.db.prepare('DELETE FROM comments WHERE competition_id = ?').bind(id),
            this.db.prepare('DELETE FROM ratings WHERE competition_id = ?').bind(id),
            this.db.prepare('DELETE FROM likes WHERE competition_id = ?').bind(id),
            this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`).bind(id),
        ]);
    }
}
```

---

### المهمة 2.2: إنشاء CompetitionRequestModel

**الملف:** `src/models/CompetitionRequestModel.ts`

```typescript
export interface CompetitionRequest {
    id: number;
    competition_id: number;
    requester_id: number;
    message?: string;
    status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired';
    expires_at: string;
    created_at: string;
    updated_at: string;
}

export class CompetitionRequestModel {
    constructor(private db: D1Database) {}
    
    // ✅ إنشاء طلب جديد مع التحقق
    async create(data: {
        competition_id: number;
        requester_id: number;
        message?: string;
    }): Promise<{ id: number }> {
        // التحقق من عدم وجود طلب معلق
        const existing = await this.findPending(data.competition_id, data.requester_id);
        if (existing) {
            throw new ConflictError('لديك طلب معلق بالفعل لهذه المنافسة');
        }
        
        // التحقق من عدد الطلبات المعلقة للمستخدم
        const pendingCount = await this.getUserPendingCount(data.requester_id);
        if (pendingCount >= 10) {
            throw new ConflictError('لديك 10 طلبات معلقة كحد أقصى');
        }
        
        const result = await this.db.prepare(`
            INSERT INTO competition_requests 
            (competition_id, requester_id, message, status, expires_at, created_at, updated_at)
            VALUES (?, ?, ?, 'pending', datetime('now', '+24 hours'), datetime('now'), datetime('now'))
        `).bind(data.competition_id, data.requester_id, data.message || null).run();
        
        return { id: result.meta.last_row_id as number };
    }
    
    // ✅ قبول طلب (مع حذف الطلبات الأخرى)
    async accept(requestId: number, accepterId: number): Promise<void> {
        const request = await this.findById(requestId);
        if (!request) throw new NotFoundError('الطلب');
        
        // التحقق من أن المقبول هو منشئ المنافسة
        const competition = await this.db.prepare(`
            SELECT * FROM competitions WHERE id = ? AND creator_id = ?
        `).bind(request.competition_id, accepterId).first();
        
        if (!competition) {
            throw new AuthorizationError('فقط منشئ المنافسة يمكنه قبول الطلبات');
        }
        
        // التحقق من أن المنافسة ليس لها خصم
        if (competition.opponent_id) {
            throw new ConflictError('المنافسة لديها خصم بالفعل');
        }
        
        // تنفيذ العملية الذرية
        await this.db.batch([
            // 1. تحديث المنافسة
            this.db.prepare(`
                UPDATE competitions 
                SET opponent_id = ?, status = 'accepted', accepted_at = datetime('now'), updated_at = datetime('now')
                WHERE id = ? AND opponent_id IS NULL
            `).bind(request.requester_id, request.competition_id),
            
            // 2. تحديث الطلب المقبول
            this.db.prepare(`
                UPDATE competition_requests 
                SET status = 'accepted', updated_at = datetime('now')
                WHERE id = ?
            `).bind(requestId),
            
            // 3. حذف الطلبات الأخرى
            this.db.prepare(`
                DELETE FROM competition_requests 
                WHERE competition_id = ? AND id != ?
            `).bind(request.competition_id, requestId),
            
            // 4. إشعار الطلبات المرفوضة
            this.db.prepare(`
                INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, created_at)
                SELECT requester_id, 'request_declined', 'تم اختيار متنافس آخر', 
                       'تم قبول متنافس آخر في المنافسة', 'competition', ?, datetime('now')
                FROM competition_requests 
                WHERE competition_id = ? AND id != ? AND status = 'pending'
            `).bind(request.competition_id, request.competition_id, requestId),
        ]);
    }
    
    // ✅ رفض طلب
    async reject(requestId: number, rejecterId: number): Promise<void> {
        const request = await this.findById(requestId);
        if (!request) throw new NotFoundError('الطلب');
        
        const competition = await this.db.prepare(`
            SELECT creator_id FROM competitions WHERE id = ?
        `).bind(request.competition_id).first();
        
        if (competition?.creator_id !== rejecterId) {
            throw new AuthorizationError();
        }
        
        await this.db.prepare(`
            UPDATE competition_requests 
            SET status = 'rejected', updated_at = datetime('now')
            WHERE id = ?
        `).bind(requestId).run();
    }
    
    // ✅ حذف طلب (من المرسل)
    async cancel(requestId: number, requesterId: number): Promise<void> {
        const request = await this.findById(requestId);
        if (!request) throw new NotFoundError('الطلب');
        
        if (request.requester_id !== requesterId) {
            throw new AuthorizationError('لا يمكنك حذف طلب لم ترسله');
        }
        
        if (request.status !== 'pending') {
            throw new ConflictError('لا يمكن حذف طلب تمت معالجته');
        }
        
        await this.db.prepare(`
            DELETE FROM competition_requests WHERE id = ?
        `).bind(requestId).run();
    }
    
    // ✅ الحصول على الطلبات المعلقة للمستخدم
    async getUserPendingCount(userId: number): Promise<number> {
        const result = await this.db.prepare(`
            SELECT COUNT(*) as count FROM competition_requests 
            WHERE requester_id = ? AND status = 'pending'
        `).bind(userId).first();
        
        return result?.count || 0;
    }
    
    // ✅ البحث عن طلب معلق
    async findPending(competitionId: number, requesterId: number): Promise<CompetitionRequest | null> {
        return await this.db.prepare(`
            SELECT * FROM competition_requests 
            WHERE competition_id = ? AND requester_id = ? AND status = 'pending'
        `).bind(competitionId, requesterId).first();
    }
    
    async findById(id: number): Promise<CompetitionRequest | null> {
        return await this.db.prepare(`
            SELECT * FROM competition_requests WHERE id = ?
        `).bind(id).first();
    }
    
    // ✅ الحصول على طلبات المنافسة
    async findByCompetition(competitionId: number): Promise<CompetitionRequest[]> {
        const result = await this.db.prepare(`
            SELECT r.*, u.display_name, u.avatar_url, u.username
            FROM competition_requests r
            JOIN users u ON r.requester_id = u.id
            WHERE r.competition_id = ? AND r.status = 'pending'
            ORDER BY r.created_at DESC
        `).bind(competitionId).all();
        
        return result.results as CompetitionRequest[];
    }
}
```

---

### المهمة 2.3: تحديث CompetitionController

**الملف:** `src/controllers/CompetitionController.ts`

**التعديلات المطلوبة:**

```typescript
export class CompetitionController extends BaseController {
    
    // ✅ إنشاء منافسة جديدة مع القيود
    async create(c: AppContext): Promise<Response> {
        const user = this.requireAuth(c);
        const data = await c.req.json();
        
        // التحقق من عدد المنافسات المعلقة (حد 3)
        const pendingCount = await this.competitionModel.getPendingCount(user.id);
        if (pendingCount >= 3) {
            throw new ConflictError('لديك 3 منافسات معلقة كحد أقصى. أكمل أو احذف واحدة أولاً.');
        }
        
        // التحقق من عدم وجود تعارض زمني (للمنافسات المجدولة)
        if (data.scheduled_at) {
            const hasConflict = await this.competitionModel.hasTimeConflict(
                user.id, 
                data.scheduled_at
            );
            if (hasConflict) {
                throw new TimeConflictError();
            }
        }
        
        // إنشاء المنافسة
        const competition = await this.competitionModel.create({
            ...data,
            creator_id: user.id,
            status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });
        
        // إنشاء مهمة حذف تلقائي (للفورية: بعد 1 ساعة، للمجدولة: بعد الموعد + 1 ساعة)
        const deleteAt = data.scheduled_at 
            ? new Date(new Date(data.scheduled_at).getTime() + 60 * 60 * 1000)
            : new Date(Date.now() + 60 * 60 * 1000);
        
        await this.scheduleTask(competition.id, 'auto_delete_if_not_live', deleteAt);
        
        return this.success(c, { competition }, 201);
    }
    
    // ✅ عرض المتنافسين المتاحين
    async listAvailableCompetitors(c: AppContext): Promise<Response> {
        const user = this.requireAuth(c);
        const { category_id, exclude_blocked = true } = c.req.query();
        
        let query = `
            SELECT u.id, u.username, u.display_name, u.avatar_url, 
                   u.country, u.language, u.elo_rating, u.is_busy,
                   (SELECT COUNT(*) FROM competitions WHERE creator_id = u.id AND status = 'completed') as total_competitions
            FROM users u
            WHERE u.id != ?
            AND u.is_busy = 0
            AND u.role = 'user'
        `;
        
        const params: any[] = [user.id];
        
        if (exclude_blocked) {
            query += ` AND u.id NOT IN (
                SELECT blocked_id FROM user_blocks WHERE blocker_id = ?
                UNION
                SELECT blocker_id FROM user_blocks WHERE blocked_id = ?
            )`;
            params.push(user.id, user.id);
        }
        
        if (category_id) {
            // المتنافسين في نفس القسم (بناءً على تاريخهم)
            query += ` AND u.id IN (
                SELECT DISTINCT creator_id FROM competitions 
                WHERE category_id = ? AND status = 'completed'
                UNION
                SELECT DISTINCT opponent_id FROM competitions 
                WHERE category_id = ? AND status = 'completed'
            )`;
            params.push(category_id, category_id);
        }
        
        query += ` ORDER BY u.elo_rating DESC, total_competitions DESC LIMIT 50`;
        
        const result = await c.env.DB.prepare(query).bind(...params).all();
        
        return this.success(c, { competitors: result.results });
    }
    
    // ✅ إرسال دعوة (من المنشئ للمتنافس)
    async invite(c: AppContext): Promise<Response> {
        const user = this.requireAuth(c);
        const { competition_id, invitee_id } = await c.req.json();
        
        const competition = await this.competitionModel.findById(competition_id);
        if (!competition) throw new NotFoundError('المنافسة');
        if (competition.creator_id !== user.id) throw new AuthorizationError();
        if (competition.opponent_id) throw new ConflictError('المنافسة لديها خصم بالفعل');
        
        // التحقق من الحظر
        const isBlocked = await this.checkBlock(user.id, invitee_id);
        if (isBlocked) throw new ConflictError('لا يمكنك دعوة هذا المستخدم');
        
        // التحقق من أن المدعو غير مشغول
        const invitee = await this.userModel.findById(invitee_id);
        if (invitee?.is_busy) throw new BusyError('المستخدم مشغول في منافسة أخرى');
        
        // إنشاء الدعوة
        await this.competitionInvitationModel.create({
            competition_id,
            inviter_id: user.id,
            invitee_id,
        });
        
        // إشعار فوري
        await this.notificationService.sendRealtime(invitee_id, {
            type: 'competition_invitation',
            title: 'دعوة للانضمام لمنافسة',
            message: `${user.display_name} يدعوك للانضمام لمنافسة: ${competition.title}`,
            reference_type: 'competition',
            reference_id: competition_id,
        });
        
        return this.success(c, { invited: true });
    }
    
    // ✅ قبول دعوة
    async acceptInvitation(c: AppContext): Promise<Response> {
        const user = this.requireAuth(c);
        const { invitation_id } = await c.req.json();
        
        const invitation = await this.competitionInvitationModel.findById(invitation_id);
        if (!invitation) throw new NotFoundError('الدعوة');
        if (invitation.invitee_id !== user.id) throw new AuthorizationError();
        if (invitation.status !== 'pending') throw new ConflictError('الدعوة تمت معالجتها');
        
        // التحقق من عدم وجود تعارض زمني
        const competition = await this.competitionModel.findById(invitation.competition_id);
        if (competition?.scheduled_at) {
            const hasConflict = await this.competitionModel.hasTimeConflict(
                user.id,
                competition.scheduled_at
            );
            if (hasConflict) throw new TimeConflictError();
        }
        
        // التحقق من أن المنافسة ليس لها خصم
        if (competition?.opponent_id) {
            throw new ConflictError('تم قبول متنافس آخر بالفعل');
        }
        
        // قبول الدعوة + تعيين الخصم
        await this.db.batch([
            this.db.prepare(`
                UPDATE competitions 
                SET opponent_id = ?, status = 'accepted', accepted_at = datetime('now')
                WHERE id = ?
            `).bind(user.id, invitation.competition_id),
            
            this.db.prepare(`
                UPDATE competition_invitations 
                SET status = 'accepted' WHERE id = ?
            `).bind(invitation_id),
            
            // حذف الدعوات الأخرى
            this.db.prepare(`
                DELETE FROM competition_invitations 
                WHERE competition_id = ? AND id != ?
            `).bind(invitation.competition_id, invitation_id),
        ]);
        
        return this.success(c, { accepted: true });
    }
    
    // ✅ حذف منافسة (مع Cascade)
    async delete(c: AppContext): Promise<Response> {
        const user = this.requireAuth(c);
        const { id } = c.req.param();
        
        const competition = await this.competitionModel.findById(id);
        if (!competition) throw new NotFoundError('المنافسة');
        
        // فقط المنشئ يمكنه الحذف، ولا يمكن حذف حية أو مكتملة
        if (competition.creator_id !== user.id) {
            throw new AuthorizationError();
        }
        
        if (competition.status === 'live' || competition.status === 'completed') {
            throw new ConflictError('لا يمكن حذف منافسة حية أو مكتملة');
        }
        
        await this.competitionModel.deleteWithRelations(id);
        
        return this.success(c, { deleted: true });
    }
    
    // ✅ بدء البث (مع تحويل لـ busy)
    async startStreaming(c: AppContext): Promise<Response> {
        const user = this.requireAuth(c);
        const { competition_id } = await c.req.json();
        
        const competition = await this.competitionModel.findById(competition_id);
        if (!competition) throw new NotFoundError('المنافسة');
        
        // التحقق من أن المستخدم طرف في المنافسة
        if (competition.creator_id !== user.id && competition.opponent_id !== user.id) {
            throw new AuthorizationError();
        }
        
        // التحقق من أن المستخدم غير مشغول
        if (user.is_busy && user.current_competition_id !== competition_id) {
            throw new BusyError();
        }
        
        // تحويل المستخدم لمشغول
        await this.userModel.update(user.id, {
            is_busy: true,
            current_competition_id: competition_id,
            busy_since: new Date().toISOString(),
        });
        
        // إذا كان الطرفان يبثان، تحويل المنافسة لحية
        const bothStreaming = await this.checkBothStreaming(competition_id);
        if (bothStreaming && competition.status !== 'live') {
            await this.competitionModel.updateStatus(competition_id, 'live', {
                started_at: new Date().toISOString(),
            });
            
            // إلغاء مهمة الحذف التلقائي
            await this.cancelScheduledTask(competition_id, 'auto_delete_if_not_live');
            
            // إنشاء مهمة إنهاء تلقائي بعد 2 ساعة
            const endTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
            await this.scheduleTask(competition_id, 'auto_end_live', endTime);
        }
        
        return this.success(c, { streaming: true });
    }
    
    // ✅ إنهاء البث
    async endStreaming(c: AppContext): Promise<Response> {
        const user = this.requireAuth(c);
        const { competition_id } = await c.req.json();
        
        // تحرير المستخدم
        await this.userModel.update(user.id, {
            is_busy: false,
            current_competition_id: null,
            busy_since: null,
        });
        
        const competition = await this.competitionModel.findById(competition_id);
        
        // إذا كانت المنافسة حية وانتهى بث أحد الطرفين
        if (competition?.status === 'live') {
            const otherStillStreaming = await this.checkOtherStreaming(
                competition_id, 
                user.id
            );
            
            if (!otherStillStreaming) {
                // الطرف الآخر انتهى أيضاً
                await this.completeCompetition(competition_id);
            } else {
                // انتظار 3 دقائق
                await this.scheduleTask(
                    competition_id, 
                    'check_disconnection', 
                    new Date(Date.now() + 3 *
