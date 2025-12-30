-- Migration: Add chunk_keys table for upload security
-- جدول مفاتيح القطع لتأمين الرفع
-- الحذف يتم برمجياً عند تحول المنافسة من live إلى completed

CREATE TABLE IF NOT EXISTS chunk_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    chunk_key TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (competition_id) REFERENCES competitions(id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_chunk_keys_key ON chunk_keys(chunk_key);
CREATE INDEX IF NOT EXISTS idx_chunk_keys_competition ON chunk_keys(competition_id);
