-- Migration 0010: Missing columns used by CompetitionRequestModel / CompetitionInvitationModel
-- These columns are referenced in live INSERT/UPDATE statements today but do not exist in the
-- 0001 schema. Every call to createRequest()/createInvitation() currently throws a D1 "no such
-- column" error. This migration makes the schema match the code that already ships.

-- competition_requests: written by CompetitionRequestModel.createRequest() / .update() / .expireOldRequests()
-- Note: D1 rejects ADD COLUMN with a non-constant default (CURRENT_TIMESTAMP), so these are
-- added nullable and backfilled below. The application always writes both columns explicitly
-- on INSERT (via datetime('now')), so the missing default has no effect on new rows.
ALTER TABLE competition_requests ADD COLUMN expires_at DATETIME;
ALTER TABLE competition_requests ADD COLUMN updated_at DATETIME;

-- competition_invitations: written by CompetitionInvitationModel.createInvitation() / .update()
ALTER TABLE competition_invitations ADD COLUMN expires_at DATETIME;
ALTER TABLE competition_invitations ADD COLUMN updated_at DATETIME;

-- competitions: written by both models' accept() methods
-- (competitions.updated_at already exists from 0001; only accepted_at is missing)
ALTER TABLE competitions ADD COLUMN accepted_at DATETIME;

-- Backfill: for any pre-existing pending rows, set expires_at 24h after created_at so the
-- cron-based expireOldRequests() job doesn't treat them as already-expired the moment this runs.
UPDATE competition_requests SET expires_at = datetime(created_at, '+24 hours') WHERE expires_at IS NULL;
UPDATE competition_invitations SET expires_at = datetime(created_at, '+24 hours') WHERE expires_at IS NULL;
UPDATE competition_requests SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE competition_invitations SET updated_at = created_at WHERE updated_at IS NULL;
