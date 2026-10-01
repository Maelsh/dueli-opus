-- 0033_explore_result_sessions.sql — R3-B7: stable result-session store
--
-- Forward-only, additive: two new tables, no historical file touched.
-- A result session freezes ONE ordered ID list (the B7 Explore shuffle, later
-- the D1/D2 approved ranking providers) in bounded chunks at creation time
-- (T0). Page reads walk the frozen snapshot with an opaque cursor and re-check
-- eligibility per row — never RANDOM()+OFFSET per batch, never a total cap.
--
-- `surface` is intentionally NOT check-constrained: D1/D2 reuse this same
-- store with new surface names (one browsing engine, no second store).
-- Guest identity is a first-party token (never IP, never a secret URL param).
-- Expiry is enforced lazily on read/create; no cron gate is introduced.

CREATE TABLE IF NOT EXISTS explore_result_sessions (
    id TEXT PRIMARY KEY,
    surface TEXT NOT NULL,
    identity_kind TEXT NOT NULL CHECK (identity_kind IN ('user', 'guest')),
    identity_key TEXT NOT NULL,
    filters_canonical TEXT NOT NULL,
    lang TEXT NOT NULL DEFAULT 'ar',
    status TEXT NOT NULL DEFAULT 'building' CHECK (status IN ('building', 'ready')),
    total_count INTEGER NOT NULL DEFAULT 0 CHECK (total_count >= 0),
    chunk_size INTEGER NOT NULL DEFAULT 100 CHECK (chunk_size > 0),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_explore_sessions_identity
    ON explore_result_sessions(identity_kind, identity_key, surface);
CREATE INDEX IF NOT EXISTS idx_explore_sessions_expiry
    ON explore_result_sessions(expires_at);

CREATE TABLE IF NOT EXISTS explore_result_chunks (
    session_id TEXT NOT NULL REFERENCES explore_result_sessions(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
    ids_json TEXT NOT NULL,
    PRIMARY KEY (session_id, chunk_index)
);
