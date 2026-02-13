-- ============================================
-- Dueli Platform - Complete Database Schema
-- مخطط قاعدة بيانات منصة ديولي الكامل
-- ============================================
-- Version: 1.0
-- Last Updated: 2026-02-13
-- Description: Complete database structure for Dueli competition platform
-- Total Tables: 29

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ============================================
-- 1. CATEGORIES TABLE (الأقسام)
-- ============================================
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name_ar TEXT NOT NULL,
    name_en TEXT NOT NULL,
    description_ar TEXT,
    description_en TEXT,
    icon TEXT,
    color TEXT,
    parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_categories_slug ON categories(slug);
CREATE INDEX idx_categories_parent ON categories(parent_id);
CREATE INDEX idx_categories_active ON categories(is_active);

-- ============================================
-- 2. COUNTRIES TABLE (الدول)
-- ============================================
CREATE TABLE IF NOT EXISTS countries (
    code TEXT PRIMARY KEY,
    name_ar TEXT NOT NULL,
    name_en TEXT NOT NULL,
    flag_emoji TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 3. USERS TABLE (المستخدمون)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    display_name TEXT NOT NULL,
    bio TEXT,
    avatar_url TEXT,
    country_code TEXT REFERENCES countries(code),
    language TEXT DEFAULT 'ar',
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin', 'super_admin')),
    is_verified BOOLEAN DEFAULT 0,
    verification_token TEXT,
    reset_password_token TEXT,
    reset_password_expires DATETIME,
    oauth_provider TEXT,
    oauth_id TEXT,
    total_competitions INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    average_rating REAL DEFAULT 0,
    follower_count INTEGER DEFAULT 0,
    following_count INTEGER DEFAULT 0,
    is_banned BOOLEAN DEFAULT 0,
    ban_reason TEXT,
    banned_until DATETIME,
    -- NEW: Busy status fields
    is_busy BOOLEAN DEFAULT 0,
    current_competition_id INTEGER REFERENCES competitions(id) ON DELETE SET NULL,
    busy_since DATETIME,
    -- NEW: ELO rating
    elo_rating INTEGER DEFAULT 1500,
    -- NEW: Last active tracking
    last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_country ON users(country_code);
CREATE INDEX idx_users_is_busy ON users(is_busy);
CREATE INDEX idx_users_elo ON users(elo_rating);
CREATE INDEX idx_users_last_active ON users(last_active_at);
CREATE UNIQUE INDEX idx_users_oauth ON users(oauth_provider, oauth_id) WHERE oauth_provider IS NOT NULL;

-- ============================================
-- 4. USER_SETTINGS TABLE (إعدادات المستخدم)
-- ============================================
CREATE TABLE IF NOT EXISTS user_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    theme TEXT DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
    language TEXT DEFAULT 'ar',
    notifications_enabled BOOLEAN DEFAULT 1,
    email_notifications BOOLEAN DEFAULT 1,
    push_notifications BOOLEAN DEFAULT 1,
    privacy_profile TEXT DEFAULT 'public' CHECK (privacy_profile IN ('public', 'followers', 'private')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_settings_user ON user_settings(user_id);

-- ============================================
-- 5. SESSIONS TABLE (الجلسات)
-- ============================================
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- ============================================
-- 6. COMPETITIONS TABLE (المنافسات)
-- ============================================
CREATE TABLE IF NOT EXISTS competitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    opponent_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'live', 'completed', 'cancelled')),
    scheduled_at DATETIME,
    accepted_at DATETIME,
    started_at DATETIME,
    ended_at DATETIME,
    max_duration INTEGER DEFAULT 7200, -- 2 hours in seconds
    recording_url TEXT,
    total_views INTEGER DEFAULT 0,
    total_likes INTEGER DEFAULT 0,
    total_dislikes INTEGER DEFAULT 0,
    creator_score REAL DEFAULT 0,
    opponent_score REAL DEFAULT 0,
    winner_id INTEGER REFERENCES users(id),
    rules TEXT,
    language TEXT DEFAULT 'ar',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_competitions_creator ON competitions(creator_id);
CREATE INDEX idx_competitions_opponent ON competitions(opponent_id);
CREATE INDEX idx_competitions_category ON competitions(category_id);
CREATE INDEX idx_competitions_status ON competitions(status);
CREATE INDEX idx_competitions_scheduled ON competitions(scheduled_at);
CREATE INDEX idx_competitions_created ON competitions(created_at);

-- ============================================
-- 7. COMPETITION_REQUESTS TABLE (طلبات الانضمام)
-- ============================================
CREATE TABLE IF NOT EXISTS competition_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled', 'expired')),
    expires_at DATETIME DEFAULT (datetime('now', '+24 hours')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(competition_id, requester_id)
);

CREATE INDEX idx_requests_competition ON competition_requests(competition_id);
CREATE INDEX idx_requests_requester ON competition_requests(requester_id);
CREATE INDEX idx_requests_status ON competition_requests(status);
CREATE INDEX idx_requests_expires ON competition_requests(expires_at);

-- ============================================
-- 8. COMPETITION_INVITATIONS TABLE (دعوات المنافسة)
-- ============================================
CREATE TABLE IF NOT EXISTS competition_invitations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    inviter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invitee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
    expires_at DATETIME DEFAULT (datetime('now', '+24 hours')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(competition_id, invitee_id)
);

CREATE INDEX idx_invitations_competition ON competition_invitations(competition_id);
CREATE INDEX idx_invitations_inviter ON competition_invitations(inviter_id);
CREATE INDEX idx_invitations_invitee ON competition_invitations(invitee_id);
CREATE INDEX idx_invitations_status ON competition_invitations(status);

-- ============================================
-- 9. COMPETITION_REMINDERS TABLE (تذكيرات المنافسات)
-- ============================================
CREATE TABLE IF NOT EXISTS competition_reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    remind_at DATETIME NOT NULL,
    is_sent BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, competition_id)
);

CREATE INDEX idx_reminders_user ON competition_reminders(user_id);
CREATE INDEX idx_reminders_competition ON competition_reminders(competition_id);
CREATE INDEX idx_reminders_time ON competition_reminders(remind_at, is_sent);

-- ============================================
-- 10. COMPETITION_HEARTBEATS TABLE (نبضات المنافسة)
-- ============================================
CREATE TABLE IF NOT EXISTS competition_heartbeats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(competition_id, user_id)
);

CREATE INDEX idx_heartbeats_competition ON competition_heartbeats(competition_id);
CREATE INDEX idx_heartbeats_user ON competition_heartbeats(user_id);
CREATE INDEX idx_heartbeats_last_seen ON competition_heartbeats(last_seen);

-- ============================================
-- 11. COMPETITION_SCHEDULED_TASKS TABLE (المهام المجدولة)
-- ============================================
CREATE TABLE IF NOT EXISTS competition_scheduled_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    task_type TEXT NOT NULL CHECK (task_type IN (
        'auto_delete_if_not_live',
        'auto_end_live',
        'send_reminder',
        'distribute_earnings',
        'check_disconnection'
    )),
    execute_at DATETIME NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    result_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    executed_at DATETIME
);

CREATE INDEX idx_scheduled_tasks_execute ON competition_scheduled_tasks(execute_at, status);
CREATE INDEX idx_scheduled_tasks_competition ON competition_scheduled_tasks(competition_id);

-- ============================================
-- 12. RATINGS TABLE (التقييمات)
-- ============================================
CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    creator_rating INTEGER CHECK (creator_rating >= 0 AND creator_rating <= 100),
    opponent_rating INTEGER CHECK (opponent_rating >= 0 AND opponent_rating <= 100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(competition_id, user_id)
);

CREATE INDEX idx_ratings_competition ON ratings(competition_id);
CREATE INDEX idx_ratings_user ON ratings(user_id);

-- ============================================
-- 13. COMMENTS TABLE (التعليقات)
-- ============================================
CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    timestamp_seconds INTEGER DEFAULT 0,
    likes_count INTEGER DEFAULT 0,
    replies_count INTEGER DEFAULT 0,
    parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
    is_deleted BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_comments_competition ON comments(competition_id);
CREATE INDEX idx_comments_user ON comments(user_id);
CREATE INDEX idx_comments_timestamp ON comments(timestamp_seconds);
CREATE INDEX idx_comments_parent ON comments(parent_id);

-- ============================================
-- 14. LIKES TABLE (الإعجابات)
-- ============================================
CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    competition_id INTEGER REFERENCES competitions(id) ON DELETE CASCADE,
    comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, competition_id, comment_id),
    CHECK ((competition_id IS NOT NULL AND comment_id IS NULL) OR (competition_id IS NULL AND comment_id IS NOT NULL))
);

CREATE INDEX idx_likes_user ON likes(user_id);
CREATE INDEX idx_likes_competition ON likes(competition_id);
CREATE INDEX idx_likes_comment ON likes(comment_id);

-- ============================================
-- 15. DISLIKES TABLE (عدم الإعجاب)
-- ============================================
CREATE TABLE IF NOT EXISTS dislikes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    competition_id INTEGER REFERENCES competitions(id) ON DELETE CASCADE,
    comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, competition_id, comment_id),
    CHECK ((competition_id IS NOT NULL AND comment_id IS NULL) OR (competition_id IS NULL AND comment_id IS NOT NULL))
);

CREATE INDEX idx_dislikes_user ON dislikes(user_id);
CREATE INDEX idx_dislikes_competition ON dislikes(competition_id);
CREATE INDEX idx_dislikes_comment ON dislikes(comment_id);

-- ============================================
-- 16. FOLLOWS TABLE (المتابعات)
-- ============================================
CREATE TABLE IF NOT EXISTS follows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(follower_id, following_id),
    CHECK(follower_id != following_id)
);

CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);

-- ============================================
-- 17. USER_BLOCKS TABLE (الحظر)
-- ============================================
CREATE TABLE IF NOT EXISTS user_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(blocker_id, blocked_id),
    CHECK(blocker_id != blocked_id)
);

CREATE INDEX idx_blocks_blocker ON user_blocks(blocker_id);
CREATE INDEX idx_blocks_blocked ON user_blocks(blocked_id);

-- ============================================
-- 18. CONVERSATIONS TABLE (المحادثات)
-- ============================================
CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    participant1_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    participant2_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(participant1_id, participant2_id),
    CHECK(participant1_id < participant2_id)
);

CREATE INDEX idx_conversations_p1 ON conversations(participant1_id);
CREATE INDEX idx_conversations_p2 ON conversations(participant2_id);
CREATE INDEX idx_conversations_last_message ON conversations(last_message_at);

-- ============================================
-- 19. MESSAGES TABLE (الرسائل)
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_created ON messages(created_at);

-- ============================================
-- 20. NOTIFICATIONS TABLE (الإشعارات)
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN (
        'competition_request',
        'competition_invitation',
        'request_accepted',
        'request_declined',
        'competition_starting',
        'competition_ended',
        'competition_cancelled',
        'follow',
        'like',
        'comment',
        'earnings',
        'busy_conflict',
        'system'
    )),
    title TEXT NOT NULL,
    message TEXT,
    reference_type TEXT CHECK (reference_type IN ('competition', 'user', 'comment', 'message')),
    reference_id INTEGER,
    is_read BOOLEAN DEFAULT 0,
    is_delivered BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);
CREATE INDEX idx_notifications_created ON notifications(created_at);

-- ============================================
-- 21. REPORTS TABLE (البلاغات)
-- ============================================
CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    competition_id INTEGER REFERENCES competitions(id) ON DELETE CASCADE,
    comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
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
CREATE INDEX idx_reports_reported ON reports(reported_id);

-- ============================================
-- 22. ADVERTISEMENTS TABLE (الإعلانات)
-- ============================================
CREATE TABLE IF NOT EXISTS advertisements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    target_url TEXT,
    advertiser_name TEXT,
    budget REAL NOT NULL,
    spent REAL DEFAULT 0,
    category_id INTEGER REFERENCES categories(id),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'completed')),
    starts_at DATETIME,
    ends_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ads_status ON advertisements(status);
CREATE INDEX idx_ads_category ON advertisements(category_id);

-- ============================================
-- 23. AD_IMPRESSIONS TABLE (انطباعات الإعلانات)
-- ============================================
CREATE TABLE IF NOT EXISTS ad_impressions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ad_id INTEGER NOT NULL REFERENCES advertisements(id) ON DELETE CASCADE,
    competition_id INTEGER REFERENCES competitions(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    impression_type TEXT CHECK (impression_type IN ('banner', 'video', 'overlay')),
    watched_duration INTEGER DEFAULT 0,
    revenue_per_view REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_impressions_ad ON ad_impressions(ad_id);
CREATE INDEX idx_impressions_competition ON ad_impressions(competition_id);

-- ============================================
-- 24. USER_EARNINGS TABLE (أرباح المستخدمين)
-- ============================================
CREATE TABLE IF NOT EXISTS user_earnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    competition_id INTEGER REFERENCES competitions(id) ON DELETE SET NULL,
    amount REAL NOT NULL,
    earning_type TEXT CHECK (earning_type IN ('competition', 'referral', 'bonus')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'available', 'withdrawn', 'cancelled')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    available_at DATETIME,
    withdrawn_at DATETIME
);

CREATE INDEX idx_earnings_user ON user_earnings(user_id);
CREATE INDEX idx_earnings_status ON user_earnings(status);

-- ============================================
-- 25. PLATFORM_EARNINGS TABLE (أرباح المنصة)
-- ============================================
CREATE TABLE IF NOT EXISTS platform_earnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER REFERENCES competitions(id) ON DELETE SET NULL,
    amount REAL NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 26. USER_POSTS TABLE (منشورات المستخدم)
-- ============================================
CREATE TABLE IF NOT EXISTS user_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

-- ============================================
-- 27. WATCH_HISTORY TABLE (سجل المشاهدات)
-- ============================================
CREATE TABLE IF NOT EXISTS watch_history (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    watched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    watch_duration_seconds INTEGER DEFAULT 0,
    completed BOOLEAN DEFAULT 0,
    PRIMARY KEY (user_id, competition_id)
);

CREATE INDEX idx_watch_history_user ON watch_history(user_id);
CREATE INDEX idx_watch_history_watched ON watch_history(watched_at);
CREATE INDEX idx_watch_history_competition ON watch_history(competition_id);

-- ============================================
-- 28. USER_KEYWORDS TABLE (كلمات مفتاحية المستخدم)
-- ============================================
CREATE TABLE IF NOT EXISTS user_keywords (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    keyword TEXT NOT NULL,
    weight REAL DEFAULT 1.0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, keyword)
);

CREATE INDEX idx_keywords_user ON user_keywords(user_id);

-- ============================================
-- 29. WATCH_LATER TABLE (قائمة المشاهدة اللاحقة)
-- ============================================
CREATE TABLE IF NOT EXISTS watch_later (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, competition_id)
);

CREATE INDEX idx_watch_later_user ON watch_later(user_id);
CREATE INDEX idx_watch_later_added ON watch_later(added_at);

-- ============================================
-- 30. USER_HIDDEN_COMPETITIONS TABLE (المنافسات المخفية)
-- ============================================
CREATE TABLE IF NOT EXISTS user_hidden_competitions (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    hidden_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, competition_id)
);

CREATE INDEX idx_hidden_user ON user_hidden_competitions(user_id);

-- ============================================
-- 31. MIGRATIONS TABLE (جدول الترحيلات)
-- ============================================
CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- TRIGGERS (المشغلات التلقائية)
-- ============================================

-- Update timestamp on users table
CREATE TRIGGER IF NOT EXISTS update_users_timestamp 
AFTER UPDATE ON users
FOR EACH ROW
BEGIN
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Update timestamp on competitions table
CREATE TRIGGER IF NOT EXISTS update_competitions_timestamp 
AFTER UPDATE ON competitions
FOR EACH ROW
BEGIN
    UPDATE competitions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Update follower count
CREATE TRIGGER IF NOT EXISTS increment_follower_count
AFTER INSERT ON follows
FOR EACH ROW
BEGIN
    UPDATE users SET follower_count = follower_count + 1 WHERE id = NEW.following_id;
    UPDATE users SET following_count = following_count + 1 WHERE id = NEW.follower_id;
END;

CREATE TRIGGER IF NOT EXISTS decrement_follower_count
AFTER DELETE ON follows
FOR EACH ROW
BEGIN
    UPDATE users SET follower_count = CASE WHEN follower_count > 0 THEN follower_count - 1 ELSE 0 END WHERE id = OLD.following_id;
    UPDATE users SET following_count = CASE WHEN following_count > 0 THEN following_count - 1 ELSE 0 END WHERE id = OLD.follower_id;
END;

-- Update competition views
CREATE TRIGGER IF NOT EXISTS update_competition_views
AFTER INSERT ON watch_history
FOR EACH ROW
BEGIN
    UPDATE competitions SET total_views = total_views + 1 WHERE id = NEW.competition_id;
END;

-- Update likes count on competitions
CREATE TRIGGER IF NOT EXISTS update_competition_likes
AFTER INSERT ON likes
FOR EACH ROW
WHEN NEW.competition_id IS NOT NULL
BEGIN
    UPDATE competitions SET total_likes = total_likes + 1 WHERE id = NEW.competition_id;
END;

CREATE TRIGGER IF NOT EXISTS decrement_competition_likes
AFTER DELETE ON likes
FOR EACH ROW
WHEN OLD.competition_id IS NOT NULL
BEGIN
    UPDATE competitions SET total_likes = CASE WHEN total_likes > 0 THEN total_likes - 1 ELSE 0 END WHERE id = OLD.competition_id;
END;

-- Update dislikes count on competitions
CREATE TRIGGER IF NOT EXISTS update_competition_dislikes
AFTER INSERT ON dislikes
FOR EACH ROW
WHEN NEW.competition_id IS NOT NULL
BEGIN
    UPDATE competitions SET total_dislikes = total_dislikes + 1 WHERE id = NEW.competition_id;
END;

CREATE TRIGGER IF NOT EXISTS decrement_competition_dislikes
AFTER DELETE ON dislikes
FOR EACH ROW
WHEN OLD.competition_id IS NOT NULL
BEGIN
    UPDATE competitions SET total_dislikes = CASE WHEN total_dislikes > 0 THEN total_dislikes - 1 ELSE 0 END WHERE id = OLD.competition_id;
END;

-- Update likes count on comments
CREATE TRIGGER IF NOT EXISTS update_comment_likes
AFTER INSERT ON likes
FOR EACH ROW
WHEN NEW.comment_id IS NOT NULL
BEGIN
    UPDATE comments SET likes_count = likes_count + 1 WHERE id = NEW.comment_id;
END;

CREATE TRIGGER IF NOT EXISTS decrement_comment_likes
AFTER DELETE ON likes
FOR EACH ROW
WHEN OLD.comment_id IS NOT NULL
BEGIN
    UPDATE comments SET likes_count = CASE WHEN likes_count > 0 THEN likes_count - 1 ELSE 0 END WHERE id = OLD.comment_id;
END;

-- Update last message timestamp in conversations
CREATE TRIGGER IF NOT EXISTS update_conversation_timestamp
AFTER INSERT ON messages
FOR EACH ROW
BEGIN
    UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = NEW.conversation_id;
END;

-- ============================================
-- END OF SCHEMA
-- ============================================
