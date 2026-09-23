-- 0032_cron_run_guard.sql — C6 (SEC-04 operational): D1 execution lock + run logging
--
-- Numbered 0032 on purpose: 0029 (C3b), 0030 (C2), 0031 (C4) live on their own
-- unmerged branches and merge first per the execution order. Independent, additive.
-- Forward-only: two new tables, no historical file touched.
--
-- `cron_locks`: one row per held task lock. Concurrent runners race on the
-- PRIMARY KEY — exactly one INSERT wins, the loser skips (no double payout runs).
-- Stale locks (crashed runner) expire via `expires_at` and are cleared on acquire.
-- `cron_runs`: append-only audit of every trigger (success, skip, failure) for
-- failure visibility. Never stores secrets or credentials.

CREATE TABLE IF NOT EXISTS cron_locks (
    lock_name TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    expires_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS cron_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task TEXT NOT NULL,
    started_at DATETIME NOT NULL,
    finished_at DATETIME NOT NULL,
    success INTEGER NOT NULL CHECK (success IN (0, 1)),
    detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_cron_runs_task_started ON cron_runs(task, started_at);
