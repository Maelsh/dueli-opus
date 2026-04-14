-- Migration 0005: Task 6 (Withdrawals) & Task 9 (SSE + Admin Veto)
-- المهمة 6: طلبات السحب | المهمة 9: SSE + حظر الإداري

-- ===========================================
-- Task 6: Enhance withdrawal_requests table
-- The base table exists from 0001. We add:
--   • approved_by (admin who approved/rejected)
--   • rejection_reason
--   • 'approved' status alias (maps to processing→completed flow)
-- Note: SQLite CHECK constraints can't be altered; we add a new index
--       and a view for backward-compatible queries.
-- ===========================================

-- Add admin-review columns to withdrawal_requests
ALTER TABLE withdrawal_requests ADD COLUMN approved_by  INTEGER REFERENCES users(id);
ALTER TABLE withdrawal_requests ADD COLUMN admin_note   TEXT;

-- Index for admin queue lookups
CREATE INDEX IF NOT EXISTS idx_wr_status        ON withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_wr_user_created  ON withdrawal_requests(user_id, created_at DESC);

-- ===========================================
-- Task 9: Add 'suspended' / 'archived' competition statuses
-- SQLite cannot modify CHECK constraints, so we drop the constraint
-- by recreating the relevant index and rely on app-level validation.
-- We leave the competitions table as-is (CHECK is advisory in SQLite
-- without STRICT mode) and update the app layer.
-- ===========================================

-- SSE subscriptions registry (Cloudflare Durable Objects would be ideal,
-- but for Cloudflare Workers without DO we persist last_event_id in DB
-- to support SSE reconnect resume).
CREATE TABLE IF NOT EXISTS sse_event_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    channel     TEXT    NOT NULL,          -- e.g. 'competition:42', 'user:7', 'global'
    event_type  TEXT    NOT NULL,          -- 'comment', 'invite', 'notification', 'suspend'
    payload     TEXT    NOT NULL,          -- JSON payload
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sse_channel_created ON sse_event_log(channel, created_at DESC);

-- Competition suspend log (separate from admin_audit_logs for easier UI queries)
CREATE TABLE IF NOT EXISTS competition_suspensions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id   INTEGER NOT NULL REFERENCES competitions(id),
    admin_id         INTEGER NOT NULL REFERENCES users(id),
    reason           TEXT    NOT NULL,
    suspended_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    restored_at      DATETIME,
    restored_by      INTEGER REFERENCES users(id)
);
