-- 0043_competition_early_end.sql — UNIT30.4 / R4-COMP-CONTROLS-EARLY-END-1.
--
-- Forward-only, additive. The official end transition records the
-- server-measured duration and the human actor, while the system result
-- credit lives in a separate ledger. `ratings` stays the real 1..5 viewer
-- vote table (CHECK 1..5, one effective row per viewer/competitor), so a
-- 10/0 SYSTEM_EARLY_END credit can never become a fake viewer vote, inflate
-- unique viewers, or leak into LivePayoutEngine's raw-rating sums.
--
-- Historical rows keep NULL/0 defaults: no retroactive winner, bonus or
-- rating rewrite. Unknown/inconsistent durations are treated as normal
-- (quality tier 1) by the ranking layer, never guessed into a penalty.

ALTER TABLE competitions ADD COLUMN ended_early INTEGER NOT NULL DEFAULT 0;
ALTER TABLE competitions ADD COLUMN ended_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE competitions ADD COLUMN end_reason TEXT;
ALTER TABLE competitions ADD COLUMN result_source TEXT;
ALTER TABLE competitions ADD COLUMN duration_seconds INTEGER;
ALTER TABLE competitions ADD COLUMN result_version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_competitions_result_source
    ON competitions(result_source, ended_early);

-- One system credit per competition/competitor/source. The UNIQUE key is the
-- retry/reload/simultaneous-END idempotency boundary. 0 is the ending
-- competitor's system result; 10 is the opponent's two-five-star equivalent.
CREATE TABLE IF NOT EXISTS competition_result_credits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    competitor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stars INTEGER NOT NULL CHECK (stars IN (0, 10)),
    source TEXT NOT NULL CHECK (source IN ('SYSTEM_EARLY_END')),
    reason TEXT NOT NULL,
    duration_seconds INTEGER,
    version INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(competition_id, competitor_id, source)
);

CREATE INDEX IF NOT EXISTS idx_result_credits_competitor
    ON competition_result_credits(competitor_id, source);
