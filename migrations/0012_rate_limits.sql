-- Migration 0012: distributed rate limiting (SEC-12)
-- docs/12-SECURITY-REMEDIATION.md: in-memory Map() rate limit stores do not
-- share state across Cloudflare Workers isolates/edge locations, so the
-- "10 login attempts / 15 min" limit is trivially bypassed by hitting a
-- different edge location. This table gives rate limiting a durable,
-- atomically-incrementable counter shared across all isolates.

CREATE TABLE IF NOT EXISTS rate_limits (
    key         TEXT NOT NULL,
    window_start INTEGER NOT NULL, -- epoch ms, floored to the window size
    count       INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (key, window_start)
);

-- Old windows are cleaned up periodically by the cron handler (see
-- src/lib/services/ScheduledTaskService.ts) — no index needed beyond the PK
-- since lookups are always by exact (key, window_start).
