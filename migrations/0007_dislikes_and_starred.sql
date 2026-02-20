-- Migration 0007: Dislikes Table and Notification Starring
-- جدول عدم الإعجاب وتمييز الإشعارات
-- Date: 2024-12-13

-- ============================================
-- Dislikes Table - جدول عدم الإعجاب
-- ============================================
CREATE TABLE IF NOT EXISTS dislikes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    competition_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
    UNIQUE(user_id, competition_id)
);

-- ============================================
-- Add is_starred to notifications - إضافة حقل التمييز للإشعارات
-- ============================================
ALTER TABLE notifications ADD COLUMN is_starred INTEGER DEFAULT 0;

-- ============================================
-- Add competition_type to competitions - نوع المنافسة (فورية/مجدولة)
-- ============================================
ALTER TABLE competitions ADD COLUMN competition_type TEXT DEFAULT 'instant' CHECK (competition_type IN ('instant', 'scheduled'));

-- ============================================
-- Add likes_count and dislikes_count to competitions for faster queries
-- ============================================
ALTER TABLE competitions ADD COLUMN likes_count INTEGER DEFAULT 0;
ALTER TABLE competitions ADD COLUMN dislikes_count INTEGER DEFAULT 0;

-- ============================================
-- Indexes for new tables
-- ============================================
CREATE INDEX IF NOT EXISTS idx_dislikes_competition ON dislikes(competition_id);
CREATE INDEX IF NOT EXISTS idx_dislikes_user ON dislikes(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_starred ON notifications(is_starred);
