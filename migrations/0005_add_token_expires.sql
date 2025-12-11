-- Add missing token expiry columns to users table
-- إضافة أعمدة انتهاء صلاحية الرموز المفقودة

-- Add reset_token_expires if not exists (some DBs have reset_expires instead)
ALTER TABLE users ADD COLUMN reset_token_expires DATETIME;

-- Add verification_token_expires if not exists
ALTER TABLE users ADD COLUMN verification_token_expires DATETIME;

-- Copy data from old columns if they exist (migration compatibility)
UPDATE users SET reset_token_expires = reset_expires WHERE reset_expires IS NOT NULL AND reset_token_expires IS NULL;
UPDATE users SET verification_token_expires = verification_expires WHERE verification_expires IS NOT NULL AND verification_token_expires IS NULL;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token);
