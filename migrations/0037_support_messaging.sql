-- R2-M (H6): independent admin-messaging store.
-- Additive, forward-only. Deliberately SEPARATE tables from personal
-- messaging (messages/conversations): admin threads must never be stored
-- as a personal conversation with a staff account. No seed rows.
CREATE TABLE IF NOT EXISTS support_threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS support_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL REFERENCES support_threads(id) ON DELETE CASCADE,
    sender_kind TEXT NOT NULL CHECK (sender_kind IN ('user', 'admin')),
    sender_id INTEGER NOT NULL REFERENCES users(id),
    content TEXT NOT NULL CHECK (length(content) <= 4000),
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_support_threads_user ON support_threads (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_support_threads_status ON support_threads (status, updated_at);
CREATE INDEX IF NOT EXISTS idx_support_messages_thread ON support_messages (thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_support_messages_unread ON support_messages (thread_id, sender_kind, is_read);
