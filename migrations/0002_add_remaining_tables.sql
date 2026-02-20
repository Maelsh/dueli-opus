-- ============================================
-- Migration 0002: Add Remaining Tables & Columns
-- الجداول والأعمدة المتبقية من الخطة الرئيسية
-- ============================================

-- 1. نبضات المنافسة (Heartbeats) – للكشف عن الانقطاع
CREATE TABLE IF NOT EXISTS competition_heartbeats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(competition_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_heartbeats_competition ON competition_heartbeats(competition_id);
CREATE INDEX IF NOT EXISTS idx_heartbeats_last_seen ON competition_heartbeats(last_seen);

-- 2. المهام المجدولة (Scheduled Tasks)
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
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    result_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    executed_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_execute ON competition_scheduled_tasks(execute_at, status);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_competition ON competition_scheduled_tasks(competition_id);

-- 3. الحظر بين المستخدمين (User Blocks)
CREATE TABLE IF NOT EXISTS user_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON user_blocks(blocked_id);

-- 4. سجل المشاهدات (User Views)
CREATE TABLE IF NOT EXISTS user_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    watched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    watch_duration INTEGER DEFAULT 0,
    completed BOOLEAN DEFAULT 0,
    UNIQUE(user_id, competition_id)
);

CREATE INDEX IF NOT EXISTS idx_views_user ON user_views(user_id);
CREATE INDEX IF NOT EXISTS idx_views_competition ON user_views(competition_id);
CREATE INDEX IF NOT EXISTS idx_views_watched ON user_views(watched_at);

-- 5. المنافسات المخفية (Hidden Competitions)
CREATE TABLE IF NOT EXISTS user_hidden_competitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    hidden_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, competition_id)
);

-- 6. كلمات البحث (Search Keywords)
CREATE TABLE IF NOT EXISTS user_search_keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    keyword TEXT NOT NULL,
    search_count INTEGER DEFAULT 1,
    last_searched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, keyword)
);

CREATE INDEX IF NOT EXISTS idx_keywords_user ON user_search_keywords(user_id);
CREATE INDEX IF NOT EXISTS idx_keywords_keyword ON user_search_keywords(keyword);

-- 7. أرباح المنصة (Platform Earnings)
CREATE TABLE IF NOT EXISTS platform_earnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER REFERENCES competitions(id),
    amount REAL NOT NULL,
    earning_type TEXT DEFAULT 'ad_revenue' CHECK (earning_type IN ('ad_revenue', 'commission', 'donation', 'other')),
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_platform_earnings_competition ON platform_earnings(competition_id);
