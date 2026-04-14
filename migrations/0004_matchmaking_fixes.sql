-- Migration 0004: Matchmaking Fixes (Task 10)
-- إصلاحات المطابقة والدعوات

-- 1. Add is_online, last_seen_at, and is_busy columns to users table
--    (is_busy was referenced in ScheduledTaskService.ts but never existed in the schema)
ALTER TABLE users ADD COLUMN is_online INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN last_seen_at DATETIME;
ALTER TABLE users ADD COLUMN is_busy INTEGER DEFAULT 0;

-- 2. Create user_blocks table (IF NOT EXISTS to be safe)
CREATE TABLE IF NOT EXISTS user_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    blocker_id INTEGER NOT NULL,
    blocked_id INTEGER NOT NULL,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(blocker_id, blocked_id)
);

-- 3. Add UNIQUE constraint to competition_invites to prevent double-inviting spam
--    SQLite cannot ALTER TABLE ADD CONSTRAINT, so we create a unique index instead
CREATE UNIQUE INDEX IF NOT EXISTS idx_competition_invites_unique
    ON competition_invites(competition_id, invitee_id);

-- 4. Add UNIQUE constraint to competition_requests to prevent double-requesting
CREATE UNIQUE INDEX IF NOT EXISTS idx_competition_requests_unique
    ON competition_requests(competition_id, requester_id);

-- 5. Also add the same constraint to competition_invitations (the second invitations table)
CREATE UNIQUE INDEX IF NOT EXISTS idx_competition_invitations_unique
    ON competition_invitations(competition_id, invitee_id);
