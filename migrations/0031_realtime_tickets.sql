-- 0031_realtime_tickets.sql — C4 (SEC-11): single-use SSE connection tickets
--
-- Numbered 0031 on purpose: 0029 (C3b) and 0030 (C2) live on their own unmerged
-- branches and merge first per the execution order. Independent, additive table.
-- Forward-only: one new table, no historical file touched.
--
-- Replaces raw `?token=<session>` in URLs (EventSource cannot send headers).
-- A ticket is: 256-bit opaque, 60s TTL, bound to (user_id, channel), single-use
-- (consumed by DELETE on redeem). The raw session secret never appears in URLs,
-- logs, history, or Referer headers again.

CREATE TABLE IF NOT EXISTS realtime_tickets (
    ticket TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_realtime_tickets_expiry ON realtime_tickets(expires_at);
