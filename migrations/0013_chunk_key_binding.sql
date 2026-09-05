-- Migration 0013: bind chunk upload keys (SEC-06 / Agent A+)
-- Keys were 32 chars from Math.random() with no owner and no expiry.
-- New keys are cryptographically random, bound to (user, competition, chunk),
-- and short-lived. Enforcement lives in src/modules/api/chunks/routes.ts.

ALTER TABLE chunk_keys ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE chunk_keys ADD COLUMN expires_at DATETIME;

-- Backfill: pre-existing keys expire 10 minutes after creation (they are
-- stale one-time upload keys; in-flight uploads re-register a fresh key).
UPDATE chunk_keys SET expires_at = datetime(created_at, '+10 minutes') WHERE expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chunk_keys_lookup ON chunk_keys(chunk_key);
CREATE INDEX IF NOT EXISTS idx_chunk_keys_owner ON chunk_keys(user_id, competition_id);
