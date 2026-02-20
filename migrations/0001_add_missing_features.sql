-- ============================================
-- Dueli Platform - Database Migration
-- إضافة الجداول الجديدة للميزات الناقصة
-- ============================================

-- FR-016: Ad Blocking by Competitors
-- حظر الإعلانات من قبل المتنافسين
CREATE TABLE IF NOT EXISTS ad_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ad_id INTEGER NOT NULL REFERENCES advertisements(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, ad_id)
);

CREATE INDEX IF NOT EXISTS idx_ad_blocks_user ON ad_blocks(user_id);
CREATE INDEX IF NOT EXISTS idx_ad_blocks_ad ON ad_blocks(ad_id);

-- FR-018: Payment Methods
-- طرق الدفع والاستلام
CREATE TABLE IF NOT EXISTS payment_methods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('bank', 'paypal', 'wise')),
    is_default INTEGER DEFAULT 0,
    -- Bank Account
    bank_name TEXT,
    iban TEXT,
    swift_code TEXT,
    account_holder TEXT,
    -- PayPal / Wise
    email TEXT,
    -- Metadata
    is_verified INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_user ON payment_methods(user_id);

-- FR-020: Donations / Grants
-- المنح والتبرعات
CREATE TABLE IF NOT EXISTS donations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL REFERENCES users(id),
    receiver_id INTEGER REFERENCES users(id),  -- NULL = platform donation
    amount REAL NOT NULL CHECK(amount >= 1.0),
    currency TEXT DEFAULT 'USD',
    message TEXT,
    is_public INTEGER DEFAULT 1,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'failed')),
    payment_method TEXT,
    transaction_id TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_donations_sender ON donations(sender_id);
CREATE INDEX IF NOT EXISTS idx_donations_receiver ON donations(receiver_id);
CREATE INDEX IF NOT EXISTS idx_donations_status ON donations(status);

-- FR-012: Report Appeals
-- الطعن في البلاغات
CREATE TABLE IF NOT EXISTS report_appeals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    appellant_id INTEGER NOT NULL REFERENCES users(id),
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'reviewing', 'accepted', 'rejected')),
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at TEXT,
    decision_reason TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_report_appeals_report ON report_appeals(report_id);

-- FR-012: Public audience rating of admin decisions
-- تقييم الجمهور لقرارات الإدارة
CREATE TABLE IF NOT EXISTS report_decision_ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    is_satisfied INTEGER NOT NULL CHECK(is_satisfied IN (0, 1)),  -- 1 = satisfied, 0 = not satisfied
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(report_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_report_decision_ratings_report ON report_decision_ratings(report_id);

-- Admin Transparency: Team members public info
-- شفافية الفريق الإداري
CREATE TABLE IF NOT EXISTS admin_team (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) UNIQUE,
    role TEXT NOT NULL CHECK(role IN ('admin', 'supervisor', 'moderator', 'support')),
    salary_usd REAL DEFAULT 0,
    additional_income REAL DEFAULT 0,
    join_date TEXT NOT NULL,
    reports_handled INTEGER DEFAULT 0,
    avg_response_time_hours REAL DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Admin action log (for transparency)
-- سجل إجراءات الإدارة
CREATE TABLE IF NOT EXISTS admin_action_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL REFERENCES users(id),
    action_type TEXT NOT NULL,  -- 'ban_user', 'review_report', 'delete_competition', etc.
    target_type TEXT,  -- 'user', 'competition', 'comment', 'report'
    target_id INTEGER,
    reason TEXT,
    is_public INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_admin_action_log_admin ON admin_action_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_action_log_type ON admin_action_log(action_type);

-- Add updated_at column to ratings table if not exists
-- إضافة عمود تحديث التقييم للتقييمات المباشرة
-- Note: SQLite doesn't support IF NOT EXISTS for ALTER TABLE
-- This will silently fail if column already exists
-- ALTER TABLE ratings ADD COLUMN updated_at TEXT;

-- Add max_duration_minutes to competitions
-- ALTER TABLE competitions ADD COLUMN max_duration_minutes INTEGER DEFAULT 120;

-- ============================================
-- Ensure existing tables have needed columns
-- ============================================

-- These ALTER TABLE commands may fail if columns already exist - that's OK
-- Run them individually and ignore errors

-- For ratings live update support:
-- ALTER TABLE ratings ADD COLUMN updated_at TEXT;

-- For competition time limit:
-- ALTER TABLE competitions ADD COLUMN max_duration_minutes INTEGER DEFAULT 120;
