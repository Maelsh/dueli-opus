# ✅ قائمة مهام تنفيذ منطق ديولي – TODO List

> **"خطة عمل قابلة للتنفيذ فوراً"**

---

## 📊 ملخص الوكلاء والمهام

| الوكيل | المهمة الرئيسية | عدد الملفات | الوقت المقدر |
|--------|-----------------|-------------|--------------|
| 🤖 وكيل 1 | البنية الأساسية (Schema) | 3 ملفات | 8 ساعات |
| 🤖 وكيل 2 | منطق المنافسات والطلبات | 5 ملفات | 16 ساعة |
| 🤖 وكيل 3 | البث والتسجيل | 4 ملفات | 12 ساعة |
| 🤖 وكيل 4 | التوصيات والسجلات | 4 ملفات | 10 ساعات |
| 🤖 وكيل 5 | الإشعارات والCron Jobs | 3 ملفات | 8 ساعات |
| 🤖 وكيل 6 | الاختبار والتكامل | 6 ملفات | 12 ساعة |

**المجموع: 66 ساعة (أسبوعين عمل بفريق 3 أشخاص)**

---

## 🤖 الوكيل 1: البنية الأساسية (Foundation Agent)

### المهمة 1.1: إنشاء schema.sql

**التعليمات التفصيلية:**

```sql
-- ============================================
-- Dueli Database Schema - النسخة الكاملة
-- ============================================

-- تفعيل المفاتيح الأجنبية
PRAGMA foreign_keys = ON;

-- ============================================
-- 1. المستخدمون (Users)
-- ============================================
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    bio TEXT,
    country TEXT NOT NULL DEFAULT 'SA',
    language TEXT NOT NULL DEFAULT 'ar' CHECK (language IN ('ar', 'en')),
    
    -- حالة النشاط
    is_verified BOOLEAN DEFAULT 0,
    is_busy BOOLEAN DEFAULT 0,
    current_competition_id INTEGER,
    busy_since DATETIME,
    last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- الإحصائيات
    total_competitions INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    total_views INTEGER DEFAULT 0,
    average_rating REAL DEFAULT 0,
    elo_rating INTEGER DEFAULT 1500,
    
    -- الدور والصلاحيات
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin')),
    
    -- التواريخ
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- المفاتيح الأجنبية
    FOREIGN KEY (current_competition_id) REFERENCES competitions(id) ON DELETE SET NULL
);

-- Indexes للبحث السريع
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_country ON users(country);
CREATE INDEX idx_users_is_busy ON users(is_busy);
CREATE INDEX idx_users_last_active ON users(last_active_at);

-- ============================================
-- 2. المنافسات (Competitions)
-- ============================================
CREATE TABLE competitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    rules TEXT,
    
    -- التصنيف
    category_id INTEGER NOT NULL,
    subcategory_id INTEGER,
    
    -- الأطراف
    creator_id INTEGER NOT NULL,
    opponent_id INTEGER,
    
    -- الحالة (القيد الأهم)
    status TEXT NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'accepted', 'live', 'completed', 'cancelled')),
    
    -- اللغة والبلد
    language TEXT NOT NULL DEFAULT 'ar' CHECK (language IN ('ar', 'en')),
    country TEXT NOT NULL DEFAULT 'SA',
    
    -- الوقت
    scheduled_at DATETIME, -- للمنافسات المجدولة
    started_at DATETIME,
    ended_at DATETIME,
    max_duration INTEGER DEFAULT 7200, -- بالثواني (ساعتين)
    
    -- الإحصائيات
    total_views INTEGER DEFAULT 0,
    total_watch_time INTEGER DEFAULT 0, -- بالثواني
    likes_count INTEGER DEFAULT 0,
    dislikes_count INTEGER DEFAULT 0,
    rating REAL DEFAULT 0,
    
    -- الروابط
    youtube_live_id TEXT,
    youtube_video_url TEXT,
    live_url TEXT,
    vod_url TEXT,
    recording_url TEXT,
    
    -- الأرباح
    total_ad_revenue REAL DEFAULT 0,
    creator_earnings REAL DEFAULT 0,
    opponent_earnings REAL DEFAULT 0,
    platform_earnings REAL DEFAULT 0,
    
    -- التواريخ
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- المفاتيح الأجنبية
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (subcategory_id) REFERENCES categories(id),
    FOREIGN KEY (creator_id) REFERENCES users(id),
    FOREIGN KEY (opponent_id) REFERENCES users(id)
);

-- Indexes مهمة جداً للأداء
CREATE INDEX idx_competitions_status ON competitions(status);
CREATE INDEX idx_competitions_creator ON competitions(creator_id);
CREATE INDEX idx_competitions_opponent ON competitions(opponent_id);
CREATE INDEX idx_competitions_category ON competitions(category_id);
CREATE INDEX idx_competitions_scheduled ON competitions(scheduled_at);
CREATE INDEX idx_competitions_status_scheduled ON competitions(status, scheduled_at);
CREATE INDEX idx_competitions_created ON competitions(created_at);

-- ============================================
-- 3. طلبات الانضمام (Competition Requests)
-- ============================================
CREATE TABLE competition_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL,
    requester_id INTEGER NOT NULL, -- الذي يرسل الطلب
    
    -- الرسالة الاختيارية
    message TEXT,
    
    -- الحالة
    status TEXT DEFAULT 'pending' 
        CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled', 'expired')),
    
    -- وقت الانتهاء (TTL)
    expires_at DATETIME DEFAULT (datetime('now', '+24 hours')),
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- مفتاح فريد: لا يمكن إرسال أكثر من طلب معلق لنفس المنافسة
    UNIQUE(competition_id, requester_id, status),
    
    -- المفاتيح الأجنبية مع CASCADE
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
    FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_requests_competition ON competition_requests(competition_id);
CREATE INDEX idx_requests_requester ON competition_requests(requester_id);
CREATE INDEX idx_requests_status ON competition_requests(status);
CREATE INDEX idx_requests_expires ON competition_requests(expires_at);

-- ============================================
-- 4. دعوات الانضمام (Competition Invitations)
-- ============================================
CREATE TABLE competition_invitations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL,
    inviter_id INTEGER NOT NULL, -- المنشئ
    invitee_id INTEGER NOT NULL, -- المدعو
    
    status TEXT DEFAULT 'pending' 
        CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
    
    expires_at DATETIME DEFAULT (datetime('now', '+24 hours')),
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(competition_id, invitee_id, status),
    
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
    FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (invitee_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================
-- 5. نبضات المنافسة (Heartbeats) – للكشف عن الانقطاع
-- ============================================
CREATE TABLE competition_heartbeats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(competition_id, user_id),
    
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_heartbeats_competition ON competition_heartbeats(competition_id);
CREATE INDEX idx_heartbeats_last_seen ON competition_heartbeats(last_seen);

-- ============================================
-- 6. المهام المجدولة (Scheduled Tasks)
-- ============================================
CREATE TABLE competition_scheduled_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL,
    task_type TEXT NOT NULL 
        CHECK (task_type IN (
            'auto_delete_if_not_live', 
            'auto_end_live', 
            'send_reminder',
            'distribute_earnings'
        )),
    execute_at DATETIME NOT NULL,
    status TEXT DEFAULT 'pending' 
        CHECK (status IN ('pending', 'completed', 'failed')),
    result_message TEXT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    executed_at DATETIME,
    
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE
);

CREATE INDEX idx_scheduled_tasks_execute ON competition_scheduled_tasks(execute_at, status);
CREATE INDEX idx_scheduled_tasks_competition ON competition_scheduled_tasks(competition_id);

-- ============================================
-- 7. الحظر بين المستخدمين (User Blocks)
-- ============================================
CREATE TABLE user_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    blocker_id INTEGER NOT NULL,
    blocked_id INTEGER NOT NULL,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(blocker_id, blocked_id),
    
    FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_blocks_blocker ON user_blocks(blocker_id);
CREATE INDEX idx_blocks_blocked ON user_blocks(blocked_id);

-- ============================================
-- 8. سجل المشاهدات (User Views)
-- ============================================
CREATE TABLE user_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    competition_id INTEGER NOT NULL,
    watched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    watch_duration INTEGER DEFAULT 0, -- بالثواني
    completed BOOLEAN DEFAULT 0, -- شاهد للنهاية؟
    
    UNIQUE(user_id, competition_id),
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE
);

CREATE INDEX idx_views_user ON user_views(user_id);
CREATE INDEX idx_views_competition ON user_views(competition_id);
CREATE INDEX idx_views_watched ON user_views(watched_at);

-- ============================================
-- 9. سجل الإعجابات (User Likes)
-- ============================================
CREATE TABLE user_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    competition_id INTEGER NOT NULL,
    liked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(user_id, competition_id),
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE
);

CREATE INDEX idx_likes_user ON user_likes(user_id);
CREATE INDEX idx_likes_competition ON user_likes(competition_id);

-- ============================================
-- 10. المتابعات (Follows)
-- ============================================
CREATE TABLE follows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    follower_id INTEGER NOT NULL, -- الذي يتابع
    following_id INTEGER NOT NULL, -- المتبوع
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(follower_id, following_id),
    
    FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);

-- ============================================
-- 11. سجل الكلمات المفتاحية (Search Keywords)
-- ============================================
CREATE TABLE user_search_keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    keyword TEXT NOT NULL,
    search_count INTEGER DEFAULT 1,
    last_searched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(user_id, keyword),
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_keywords_user ON user_search_keywords(user_id);
CREATE INDEX idx_keywords_keyword ON user_search_keywords(keyword);

-- ============================================
-- 12. الإشعارات (Notifications) – محسّن
-- ============================================
CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    
    -- نوع الإشعار
    type TEXT NOT NULL 
        CHECK (type IN (
            'competition_request', 
            'competition_invitation',
            'competition_starting',
            'competition_ended',
            'competition_cancelled',
            'follow',
            'like',
            'comment',
            'earnings',
            'system'
        )),
    
    -- المحتوى
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    
    -- الرابط للحدث
    reference_type TEXT,
    reference_id INTEGER,
    action_url TEXT,
    
    -- الحالة
    is_read BOOLEAN DEFAULT 0,
    is_delivered BOOLEAN DEFAULT 0, -- للإشعارات الفورية
    
    -- التواريخ
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    read_at DATETIME,
    expires_at DATETIME DEFAULT (datetime('now', '+30 days')),
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_created ON notifications(created_at);
CREATE INDEX idx_notifications_expires ON notifications(expires_at);

-- ============================================
-- 13. المخفي من المشاهدات (Hidden Competitions)
-- ============================================
CREATE TABLE user_hidden_competitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    competition_id INTEGER NOT NULL,
    hidden_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(user_id, competition_id),
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE
);

-- ============================================
-- 14. الجلسات (Sessions) – محسّن
-- ============================================
CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    
    -- الحدود
    expires_at DATETIME NOT NULL,
    max_age INTEGER DEFAULT 2592000, -- 30 يوم
    
    -- الحالة
    is_valid BOOLEAN DEFAULT 1,
    revoked_at DATETIME,
    revoked_reason TEXT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- ============================================
-- 15. التقييمات (Ratings)
-- ============================================
CREATE TABLE ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL,
    rater_id INTEGER NOT NULL, -- الذي يقيّم
    rated_id INTEGER NOT NULL, -- المتنافس الذي يُقيَّم
    
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(competition_id, rater_id, rated_id),
    
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
    FOREIGN KEY (rater_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (rated_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_ratings_competition ON ratings(competition_id);
CREATE INDEX idx_ratings_rated ON ratings(rated_id);

-- ============================================
-- 16. التعليقات (Comments)
-- ============================================
CREATE TABLE comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    parent_id INTEGER, -- للردود
    
    content TEXT NOT NULL,
    is_edited BOOLEAN DEFAULT 0,
    
    likes_count INTEGER DEFAULT 0,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
);

CREATE INDEX idx_comments_competition ON comments(competition_id);
CREATE INDEX idx_comments_user ON comments(user_id);
CREATE INDEX idx_comments_parent ON comments(parent_id);

-- ============================================
-- 17. الإعلانات (Advertisements)
-- ============================================
CREATE TABLE advertisements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT,
    image_url TEXT,
    link_url TEXT,
    
    -- الاستهداف
    target_categories TEXT, -- JSON array
    target_countries TEXT, -- JSON array
    target_languages TEXT, -- JSON array
    
    -- الميزانية
    budget REAL NOT NULL,
    cost_per_view REAL DEFAULT 0.01,
    cost_per_click REAL DEFAULT 0.10,
    
    -- الإحصائيات
    views_count INTEGER DEFAULT 0,
    clicks_count INTEGER DEFAULT 0,
    spent_amount REAL DEFAULT 0,
    
    -- الحالة
    is_active BOOLEAN DEFAULT 1,
    starts_at DATETIME,
    ends_at DATETIME,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 18. انطباعات الإعلانات (Ad Impressions)
-- ============================================
CREATE TABLE ad_impressions (
    id INTEGER PRIMARY KEY AUTOin the middle of a tool result, only the tool can be used at the end of a message, and you need to process the user's feedback before using a tool. Let me provide a summary of what I've done and ask for the next step.     <attempt_completion>
<result>
## ✅ تم إنشاء خطة المنطق الأساسي الكاملة

**الملفات المُنشأة:**
1. `.blackbox/DUELI_CORE_LOGIC_MASTER_PLAN.md` – الخطة الرئيسية
2. `.blackbox/DUELI_TODO_IMPLEMENTATION.md` – قائمة المهام (جزء منها)

---

### 📋 ما تم تغطيته:

**✅ القسم الأول: منع الكوارث (15 مخاطر)**
- مشاركة في أكثر من منافسة ← حالة `is_busy`
- هجر المنافسات ← Cron job 1 ساعة
- انقطاع البث ← Heartbeat كل 30 ثانية
- أكثر من طلب ← `FOR UPDATE` lock
- طلبات معلقة ← TTL 24 ساعة
- إشعارات قديمة ← Cron job شهري
- مستخدمين غير نشطين ← Cron job سنوي
- تضارب المواعيد ← Check قبل القبول
- وغيرها...

**✅ القسم الثاني: الحلول المقترحة (9 حلول)**
1. حذف الإشعارات القديمة (شهرياً) ✅
2. حذف المستخدمين غير النشطين (سنوياً) ✅
3. Cascade Delete ✅
4. قيود صارمة على الطلبات ✅
5. المنافسة المكتملة لا تتغير ✅
6. الحذف المتبادل + الحظر ✅
7. المنافسة اللاحقة – عد تنازلي + حذف تلقائي ✅
8. المنافسة الحية – حد 2 ساعات ✅
9. حالة "مشغول" – القلب النابض ✅

**✅ القسم الثالث: البث والتسجيل**
- Retry Queue للـ chunks
- Cleanup فوري بعد الدمج
- Heartbeat system

**✅ القسم الرابع: التوصيات (11 عامل)**
- اللغة، البلد، الأحدث، المشاهدات، التقييم، المتابعات، الأقسام، الإعجابات، الصلة، الشبه، عدم التكرار

**✅ القسم الخامس: تقسيم الوكلاء (6 وكلاء)**
- وكيل 1: البنية الأساسية (Schema)
- وكيل 2: منطق المنافسات
- وكيل 3: البث والتسجيل
- وكيل 4: التوصيات
- وكيل 5: الإشعارات والCron Jobs
- وكيل 6: الاختبار

---

### 🎯 الخطوة التالية:

**هل تريد:**

1. **إكمال ملف schema.sql** (الجزء المتبقي من الجداول 19-25)؟
2. **إنشاء توجيهات تفصيلية لوكيل معين** (مثلاً وكيل 2 – منطق المنافسات)؟
3. **بدء التنفيذ الفعلي** لجزء معين؟
4. **مراجعة شاملة** لكل ما تم قبل البدء؟

**أنا جاهز لأي من هذه الخيارات!** 🚀
</result>
</attempt_completion>
