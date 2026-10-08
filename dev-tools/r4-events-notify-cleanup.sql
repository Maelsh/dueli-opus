-- ============================================================================
-- R4-EVENTS-NOTIFY-1 — one-time notification read-state cleanup (OWNER APPROVED)
-- ============================================================================
-- Owner decision (08 + 12 §10.2, 2026-10-08T03:31:39Z): mark the notifications
-- that existed BEFORE that moment as read, once, because the platform is still
-- in testing and nothing in it is real yet.
--
-- TARGET (production only, after leader review): dueli-db (remote).
--   NEVER run against any other database. NEVER run STEP 3 before the leader
--   has reviewed THIS exact file and approved the run in writing.
--
-- SCOPE: notification read-state ONLY (is_read 0 -> 1 for qualifying rows).
--   NO DELETE. NO change to personal/support messages, invites, requests,
--   roles, or any other table. NOT a permanent closed=read policy.
--
-- BASIS — UTC: notifications.created_at is written by SQLite datetime('now')
--   (NotificationModel.create) or DEFAULT CURRENT_TIMESTAMP (migrations/0001),
--   both UTC 'YYYY-MM-DD HH:MM:SS'. The cutoff below is therefore compared in
--   UTC with datetime('2026-10-08T03:31:39Z') -> '2026-10-08 03:31:39'.
--   There is NO read_at/read-timestamp column on notifications, so there is no
--   read-timestamp contract to follow — is_read is the whole read state.
--
-- IDEMPOTENCY: STEP 3 is guarded by `is_read = 0`. Re-running it after a
--   successful run changes 0 rows. Rows created AFTER the cutoff keep their
--   state (the cutoff is a FIXED literal, never now()).
--
-- HOW TO RUN (leader): paste each STEP separately into
--   `wrangler d1 execute dueli-db --remote --command "<STEP>" --json`
--   and record the outputs. Do NOT run the whole file blindly.
-- ============================================================================

-- STEP 1 — schema guard (read-only). EXPECTED: one row whose sql contains
--   `is_read` and `created_at`. If the shape differs: STOP, no writes.
SELECT sql AS notifications_ddl FROM sqlite_master WHERE name = 'notifications';

-- STEP 2 — count before (read-only). Record both numbers in WORKLOG/PR.
SELECT COUNT(*) AS old_unread_before FROM notifications WHERE is_read = 0 AND created_at < datetime('2026-10-08T03:31:39Z');
SELECT COUNT(*) AS total_before FROM notifications;

-- STEP 3 — guarded one-time update. *** LEADER APPROVAL REQUIRED ***
-- EXPECTED: changes == old_unread_before from STEP 2, and nothing else.
UPDATE notifications SET is_read = 1 WHERE is_read = 0 AND created_at < datetime('2026-10-08T03:31:39Z');

-- STEP 4 — count after (read-only). EXPECTED: old_unread_after == 0 and
--   total_after == total_before (no row added or removed, only flags flipped).
SELECT COUNT(*) AS old_unread_after FROM notifications WHERE is_read = 0 AND created_at < datetime('2026-10-08T03:31:39Z');
SELECT COUNT(*) AS total_after FROM notifications;

-- STEP 5 — idempotency proof (optional re-run of STEP 3). EXPECTED: 0 changes.
-- UPDATE notifications SET is_read = 1 WHERE is_read = 0 AND created_at < datetime('2026-10-08T03:31:39Z');

-- EXPECTED-RESULTS TEMPLATE (leader fills in from production outputs):
--   old_unread_before = ?
--   total_before      = ?
--   step3_changes     = ?  (must equal old_unread_before)
--   old_unread_after  = 0
--   total_after       = ?  (must equal total_before)
