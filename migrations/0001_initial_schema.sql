-- Dueli Database Schema
-- منصة المنافسات والحوارات

-- جدول المستخدمين
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    bio TEXT,
    country TEXT DEFAULT 'SA',
    language TEXT DEFAULT 'ar',
    youtube_channel_id TEXT,
    youtube_access_token TEXT,
    youtube_refresh_token TEXT,
    total_competitions INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    total_views INTEGER DEFAULT 0,
    average_rating REAL DEFAULT 0,
    total_earnings REAL DEFAULT 0,
    is_verified INTEGER DEFAULT 0,
    is_admin INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- جدول الأقسام الرئيسية
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name_ar TEXT NOT NULL,
    name_en TEXT NOT NULL,
    description_ar TEXT,
    description_en TEXT,
    icon TEXT,
    color TEXT DEFAULT '#3B82F6',
    parent_id INTEGER,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES categories(id)
);

-- جدول المنافسات
CREATE TABLE IF NOT EXISTS competitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    rules TEXT NOT NULL,
    category_id INTEGER NOT NULL,
    subcategory_id INTEGER,
    creator_id INTEGER NOT NULL,
    opponent_id INTEGER,
    status TEXT DEFAULT 'pending', -- pending, accepted, live, completed, cancelled
    language TEXT DEFAULT 'ar',
    country TEXT,
    scheduled_at DATETIME,
    started_at DATETIME,
    ended_at DATETIME,
    youtube_live_id TEXT,
    youtube_video_url TEXT,
    total_views INTEGER DEFAULT 0,
    total_comments INTEGER DEFAULT 0,
    creator_rating REAL DEFAULT 0,
    opponent_rating REAL DEFAULT 0,
    creator_earnings REAL DEFAULT 0,
    opponent_earnings REAL DEFAULT 0,
    ad_revenue REAL DEFAULT 0,
    is_featured INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (subcategory_id) REFERENCES categories(id),
    FOREIGN KEY (creator_id) REFERENCES users(id),
    FOREIGN KEY (opponent_id) REFERENCES users(id)
);

-- جدول دعوات المنافسة
CREATE TABLE IF NOT EXISTS competition_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL,
    inviter_id INTEGER NOT NULL,
    invitee_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, accepted, declined
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    responded_at DATETIME,
    FOREIGN KEY (competition_id) REFERENCES competitions(id),
    FOREIGN KEY (inviter_id) REFERENCES users(id),
    FOREIGN KEY (invitee_id) REFERENCES users(id)
);

-- جدول طلبات المشاركة في المنافسة
CREATE TABLE IF NOT EXISTS competition_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL,
    requester_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, accepted, declined
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    responded_at DATETIME,
    FOREIGN KEY (competition_id) REFERENCES competitions(id),
    FOREIGN KEY (requester_id) REFERENCES users(id)
);

-- جدول التقييمات
CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    competitor_id INTEGER NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (competition_id) REFERENCES competitions(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (competitor_id) REFERENCES users(id),
    UNIQUE(competition_id, user_id, competitor_id)
);

-- جدول التعليقات
CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    parent_id INTEGER,
    is_live INTEGER DEFAULT 0,
    likes_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (competition_id) REFERENCES competitions(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (parent_id) REFERENCES comments(id)
);

-- جدول المتابعات
CREATE TABLE IF NOT EXISTS follows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    follower_id INTEGER NOT NULL,
    following_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (follower_id) REFERENCES users(id),
    FOREIGN KEY (following_id) REFERENCES users(id),
    UNIQUE(follower_id, following_id)
);

-- جدول الإشعارات
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL, -- invite, request, follow, comment, rating, competition_start
    title TEXT NOT NULL,
    message TEXT,
    reference_type TEXT, -- competition, user, comment
    reference_id INTEGER,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- جدول المنشورات (Posts)
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT,
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- جدول إعجابات المنشورات
CREATE TABLE IF NOT EXISTS post_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(post_id, user_id)
);

-- جدول الرسائل الخاصة
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (receiver_id) REFERENCES users(id)
);

-- جدول جدول المنافسات القادمة
CREATE TABLE IF NOT EXISTS scheduled_competitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    competition_id INTEGER NOT NULL,
    scheduled_at DATETIME NOT NULL,
    reminder_sent INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (competition_id) REFERENCES competitions(id)
);

-- جدول الدول
CREATE TABLE IF NOT EXISTS countries (
    code TEXT PRIMARY KEY,
    name_ar TEXT NOT NULL,
    name_en TEXT NOT NULL,
    flag_emoji TEXT
);

-- جدول جلسات المستخدمين
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- الفهارس
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_country ON users(country);
CREATE INDEX IF NOT EXISTS idx_users_language ON users(language);

CREATE INDEX IF NOT EXISTS idx_competitions_status ON competitions(status);
CREATE INDEX IF NOT EXISTS idx_competitions_category ON competitions(category_id);
CREATE INDEX IF NOT EXISTS idx_competitions_creator ON competitions(creator_id);
CREATE INDEX IF NOT EXISTS idx_competitions_language ON competitions(language);
CREATE INDEX IF NOT EXISTS idx_competitions_country ON competitions(country);
CREATE INDEX IF NOT EXISTS idx_competitions_scheduled ON competitions(scheduled_at);

CREATE INDEX IF NOT EXISTS idx_comments_competition ON comments(competition_id);
CREATE INDEX IF NOT EXISTS idx_ratings_competition ON ratings(competition_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
