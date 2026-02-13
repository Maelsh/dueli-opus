-- ============================================
-- Migration 0003: Add Missing Columns to Existing Tables
-- إضافة الأعمدة المفقودة للجداول الموجودة
-- ============================================

-- Users: busy status fields
ALTER TABLE users ADD COLUMN is_busy BOOLEAN DEFAULT 0;
ALTER TABLE users ADD COLUMN current_competition_id INTEGER REFERENCES competitions(id);
ALTER TABLE users ADD COLUMN busy_since DATETIME;
ALTER TABLE users ADD COLUMN elo_rating INTEGER DEFAULT 1500;

-- Competitions: accepted timestamp
ALTER TABLE competitions ADD COLUMN accepted_at DATETIME;

-- Competition requests: expiry TTL (set in app code, not as default)
ALTER TABLE competition_requests ADD COLUMN expires_at DATETIME;
