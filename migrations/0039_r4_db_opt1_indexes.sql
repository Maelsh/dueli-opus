-- 0039_r4_db_opt1_indexes.sql
-- R4-DB-OPT-1: read-path covering indexes for the DIAG-proven scans
-- (R4-DB-DIAG-1 EXPLAIN E1/E2/E4/E8/E9 — SCAN measured locally, no guessing).
-- Indexes only: no tables, no columns, no data rewrite, no drops.
-- Owner-gated application: included in the PR with local tests, NOT applied
-- to production here (protocol §5/§9 — production apply needs its own
-- pre-merge authorization with target+hash+baseline proof).
--
-- What each index serves (same rows, same order — ranking H7-v1 untouched):
-- - idx_ratings_competitor ........ H7SignalsModel.loadProfiles sums
--   (WHERE competitor_id IN … — the (competition_id, competitor_id) index
--   cannot serve a competitor-only filter; full-index SCAN today).
-- - idx_competitions_creator ...... loadProfiles creatorCounts
--   (WHERE creator_id IN … — SCAN today, no creator index exists).
-- - idx_competitions_opponent ..... loadProfiles opponentCounts
--   (WHERE opponent_id IN … — SCAN today) + Profile shelf findByUser
--   (creator = ? OR opponent = ? — second leg of the OR).
-- - idx_users_active .............. UserSignalsModel.findAllActiveUserIds
--   (WHERE is_active = 1 — SCAN of users on every user-search call today).
-- - idx_user_blocks_blocked ....... UserSignalsModel.loadBlockedIds reverse leg
--   (WHERE blocked_id = ? — SCAN of the covering UNIQUE today).
-- - idx_sse_channel_id ............ SseEventLogModel.getAfter
--   (WHERE channel = ? AND id > ? ORDER BY id — the (channel, created_at)
--   index serves the channel but forces a TEMP B-TREE sort per 10s poll).
-- Rollback: DROP INDEX <name>; (one line per index, no data effect).

CREATE INDEX IF NOT EXISTS idx_ratings_competitor
    ON ratings (competitor_id);

CREATE INDEX IF NOT EXISTS idx_competitions_creator
    ON competitions (creator_id);

CREATE INDEX IF NOT EXISTS idx_competitions_opponent
    ON competitions (opponent_id);

CREATE INDEX IF NOT EXISTS idx_users_active
    ON users (is_active);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked
    ON user_blocks (blocked_id);

CREATE INDEX IF NOT EXISTS idx_sse_channel_id
    ON sse_event_log (channel, id);
