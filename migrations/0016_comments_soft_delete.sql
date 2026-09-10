-- 0016_comments_soft_delete.sql
-- B2+B3: soft-delete for comments (deleted_at, no rebuild needed).

ALTER TABLE comments ADD COLUMN deleted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_comments_competition_deleted
    ON comments (competition_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_comments_parent_deleted
    ON comments (parent_id, deleted_at);

-- Rollback: SQLite cannot DROP COLUMN cheaply on old versions; recreate table if needed.
