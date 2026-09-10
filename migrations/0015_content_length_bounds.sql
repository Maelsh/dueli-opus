-- 0015_content_length_bounds.sql
-- B7: content length bounds for comments and messages.
-- docs/15-ROADMAP.md — Result: an abusive user can no longer flood a
-- competition with comments or a user with messages, nor break the UI by
-- injecting a giant text.
--
-- ⚠ WHY THERE IS NO `CHECK (length(content) <= N)` HERE:
--   SQLite cannot ADD a CHECK constraint via ALTER TABLE — it requires a full
--   table rebuild (create-new → copy → drop → rename, the "12-step" procedure).
--   `comments` and `messages` both hold production data, and `messages` carries
--   FK references (conversations) plus backfilled columns from 0014, so a
--   rebuild is too destructive/risky for this migration. Documented in WORKLOG
--   (B7 entry) per the task's sanctioned fallback.
--
-- Equivalent DB-level enforcement WITHOUT a rebuild: BEFORE INSERT triggers
-- that ABORT oversized rows. This complements (never replaces) the model-layer
-- validation in CommentModel/MessageModel, which is the primary enforcement
-- point and the one returning localized 400 responses.

CREATE TRIGGER IF NOT EXISTS trg_comments_content_length
BEFORE INSERT ON comments
WHEN NEW.content IS NOT NULL AND length(NEW.content) > 2000
BEGIN
    SELECT RAISE(ABORT, 'comments.content exceeds 2000 characters');
END;

CREATE TRIGGER IF NOT EXISTS trg_messages_content_length
BEFORE INSERT ON messages
WHEN NEW.content IS NOT NULL AND length(NEW.content) > 4000
BEGIN
    SELECT RAISE(ABORT, 'messages.content exceeds 4000 characters');
END;

-- Rollback considerations:
--   DROP TRIGGER IF EXISTS trg_comments_content_length;
--   DROP TRIGGER IF EXISTS trg_messages_content_length;