-- Add OAuth columns to users table
-- Note: These columns have been moved to 0001_initial_schema.sql
-- This migration is now empty and kept for historical record

-- OAuth columns are now in the initial schema
-- Index creation is also in 0001_initial_schema.sql


-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_oauth ON users(oauth_provider, oauth_id);
