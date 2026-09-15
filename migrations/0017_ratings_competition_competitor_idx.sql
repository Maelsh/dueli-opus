-- 0017_ratings_competition_competitor_idx.sql
-- B11: speed up anonymous summary GROUP BY (competition_id, competitor_id).
-- No schema change beyond the index; safe to apply on existing data.

CREATE INDEX IF NOT EXISTS idx_ratings_competition_competitor
    ON ratings (competition_id, competitor_id);

-- Rollback: DROP INDEX idx_ratings_competition_competitor;
