-- Migration 0012: Add is_fake column for test data
-- هجرة 0012: إضافة عمود is_fake للبيانات الوهمية

-- Add is_fake column to users table (default true for existing records)
ALTER TABLE users ADD COLUMN is_fake INTEGER DEFAULT 1;

-- Add is_fake column to competitions table (default true for existing records)
ALTER TABLE competitions ADD COLUMN is_fake INTEGER DEFAULT 1;

-- Mark real test users (testhost, testguest) as NOT fake
UPDATE users SET is_fake = 0 WHERE username IN ('testhost', 'testguest');

-- Mark competitions created by real test users as NOT fake
UPDATE competitions SET is_fake = 0 
WHERE creator_id IN (SELECT id FROM users WHERE username IN ('testhost', 'testguest'));

-- Create index for filtering fake data
CREATE INDEX IF NOT EXISTS idx_users_is_fake ON users(is_fake);
CREATE INDEX IF NOT EXISTS idx_competitions_is_fake ON competitions(is_fake);
