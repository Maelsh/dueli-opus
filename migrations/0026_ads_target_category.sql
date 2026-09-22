-- Migration 0026: Ad category targeting (Phase 9.B) — ADDITIVE ONLY
--
-- 9.B targeting is language + country + category. language/country already
-- exist (migration 0003); the category dimension was missing, so it is added
-- here as a nullable FK: NULL means "no category restriction" (same NULL
-- semantics as target_language / target_country).
--
-- Source of the value at serve time: competitions.category_id (existing row
-- data) — no new data collection, no behavioral tracking.
--
-- G8 (docs/11) rollback plan: additive step only — no backup/restore
-- procedure required. To reverse: drop the column and the index below.

ALTER TABLE advertisements ADD COLUMN target_category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_advertisements_target_category ON advertisements(target_category_id);
