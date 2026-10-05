-- R2-L1: qualified daily views (H2) — one counted view per identity/competition/day.
-- Additive, forward-only. watch_history stays the H1 duration source for
-- logged-in users; this table is the day-grained dedup store both identities share.
CREATE TABLE IF NOT EXISTS competition_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    identity_kind TEXT NOT NULL CHECK (identity_kind IN ('user', 'guest')),
    identity_key TEXT NOT NULL,
    view_day TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (competition_id, identity_key, view_day)
);
CREATE INDEX IF NOT EXISTS idx_competition_views_day ON competition_views (competition_id, view_day);
