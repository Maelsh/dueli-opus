-- 0014_messages_conversation_alignment.sql
-- B1: align the messages table with the conversations model actually used by
-- MessageModel/ConversationModel (docs/15-ROADMAP.md — Core Messaging Repair).
--
-- Non-destructive: sender_id, receiver_id, is_read and created_at are kept.
-- New columns: conversation_id (nullable during backfill, then filled),
-- read_at (backfilled from is_read).

-- 1) New columns
ALTER TABLE messages ADD COLUMN conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN read_at DATETIME;

-- 2) Create conversations for legacy correspondent pairs that have none.
--    Normalized order (user1_id = MIN, user2_id = MAX) to match
--    ConversationModel.findOrCreate and the UNIQUE(user1_id, user2_id) constraint.
--    last_message_at = newest legacy message of the pair.
INSERT OR IGNORE INTO conversations (user1_id, user2_id, last_message_at, created_at)
SELECT MIN(m.sender_id, m.receiver_id),
       MAX(m.sender_id, m.receiver_id),
       MAX(m.created_at),
       MIN(m.created_at)
FROM messages m
GROUP BY MIN(m.sender_id, m.receiver_id), MAX(m.sender_id, m.receiver_id);

-- 3) Link every legacy message to the conversation of its user pair.
UPDATE messages
SET conversation_id = (
    SELECT c.id
    FROM conversations c
    WHERE (c.user1_id = messages.sender_id AND c.user2_id = messages.receiver_id)
       OR (c.user1_id = messages.receiver_id AND c.user2_id = messages.sender_id)
    LIMIT 1
)
WHERE conversation_id IS NULL;

-- 4) Backfill read_at from is_read (read time unknown -> use message time).
UPDATE messages
SET read_at = created_at
WHERE is_read = 1 AND read_at IS NULL;

-- 5) Indexes for the hot queries
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
    ON messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_unread
    ON messages (receiver_id, is_read);

-- Rollback considerations:
--   DROP INDEX IF EXISTS idx_messages_receiver_unread;
--   DROP INDEX IF EXISTS idx_messages_conversation_created;
--   UPDATE messages SET read_at = NULL;            -- loses derived data only
--   UPDATE messages SET conversation_id = NULL;    -- links re-derivable from pairs
--   ALTER TABLE messages DROP COLUMN read_at;
--   ALTER TABLE messages DROP COLUMN conversation_id;
--   (conversations rows created by step 2 may be kept; they are derivable data.)
