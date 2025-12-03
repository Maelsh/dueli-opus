-- Add OAuth columns to users table
ALTER TABLE users ADD COLUMN oauth_provider TEXT;
ALTER TABLE users ADD COLUMN oauth_id TEXT;
ALTER TABLE users ADD COLUMN avatar_url TEXT;
ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1;

-- Create index for faster lookups
CREATE INDEX idx_users_oauth ON users(oauth_provider, oauth_id);
