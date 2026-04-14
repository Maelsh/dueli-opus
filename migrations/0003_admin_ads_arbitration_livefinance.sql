-- Migration 0002: Admin Roles, Audit Logs, Platform Settings, Advertiser Portal, Arbitration, Live Finance

-- ============================================
-- Task 1: Advertiser Portal & Dynamic Ads
-- ============================================

ALTER TABLE advertisements ADD COLUMN advertiser_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE advertisements ADD COLUMN budget REAL DEFAULT 0;
ALTER TABLE advertisements ADD COLUMN budget_remaining REAL DEFAULT 0;
ALTER TABLE advertisements ADD COLUMN target_language TEXT DEFAULT NULL;
ALTER TABLE advertisements ADD COLUMN target_country TEXT DEFAULT NULL;
ALTER TABLE advertisements ADD COLUMN campaign_status TEXT DEFAULT 'active' CHECK(campaign_status IN ('active', 'paused', 'depleted', 'archived'));

-- ============================================
-- Task 2: Advanced Governance & Admin Layer
-- ============================================

CREATE TABLE IF NOT EXISTS admin_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK(role IN ('SuperAdmin', 'Auditor', 'Moderator')) DEFAULT 'Moderator',
    granted_by INTEGER,
    granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL
);




CREATE TABLE IF NOT EXISTS platform_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setting_key TEXT UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    description TEXT,
    updated_by INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Seed default platform settings
INSERT INTO platform_settings (setting_key, setting_value, description) VALUES
    ('platform_share_percentage', '20', 'Percentage of ad revenue retained by the platform'),
    ('min_withdrawal_amount', '50', 'Minimum withdrawal amount in USD'),
    ('ad_revenue_hold_hours', '72', 'Hours to hold ad revenue before making it available'),
    ('max_reports_per_user_daily', '10', 'Maximum reports a user can submit per day');

-- ============================================
-- Task 3: Arbitration & Complaint System
-- ============================================

-- Add arbitration fields to reports table
ALTER TABLE reports ADD COLUMN assigned_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE reports ADD COLUMN arbitration_status TEXT DEFAULT 'submitted' CHECK(arbitration_status IN ('submitted', 'under_review', 'investigation', 'resolved', 'rejected'));
ALTER TABLE reports ADD COLUMN arbitration_notes TEXT;
ALTER TABLE reports ADD COLUMN resolved_at DATETIME;
ALTER TABLE reports ADD COLUMN resolution_reason TEXT;

CREATE TABLE IF NOT EXISTS report_state_transitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL,
    from_state TEXT NOT NULL,
    to_state TEXT NOT NULL,
    admin_id INTEGER,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_report_state_transitions_report_id ON report_state_transitions(report_id);

-- ============================================
-- Task 5: Live Finance Engine
-- ============================================

CREATE TABLE IF NOT EXISTS competition_revenue_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL,
    total_ad_revenue REAL DEFAULT 0,
    platform_share REAL DEFAULT 0,
    creator_share REAL DEFAULT 0,
    opponent_share REAL DEFAULT 0,
    creator_rating_at_time REAL DEFAULT 0,
    opponent_rating_at_time REAL DEFAULT 0,
    platform_percentage REAL DEFAULT 20,
    finalized INTEGER DEFAULT 0,
    finalized_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_competition_revenue_logs_competition ON competition_revenue_logs(competition_id);






