-- Signaling tables for WebRTC P2P
-- جداول الإشارات لاتصال P2P

-- Rooms table
CREATE TABLE IF NOT EXISTS signaling_rooms (
    id TEXT PRIMARY KEY,
    competition_id INTEGER NOT NULL,
    host_user_id INTEGER,
    host_joined_at TEXT,
    opponent_user_id INTEGER,
    opponent_joined_at TEXT,
    viewer_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Signals table for SDP/ICE exchange
CREATE TABLE IF NOT EXISTS signaling_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    target_role TEXT NOT NULL CHECK(target_role IN ('host', 'opponent')),
    signal_type TEXT NOT NULL CHECK(signal_type IN ('offer', 'answer', 'ice-candidate')),
    signal_data TEXT NOT NULL,
    consumed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (room_id) REFERENCES signaling_rooms(id) ON DELETE CASCADE
);

-- Index for faster polling
CREATE INDEX IF NOT EXISTS idx_signals_target ON signaling_signals(room_id, target_role, consumed);

-- Cleanup old signals (will be done via scheduled task)
-- DELETE FROM signaling_signals WHERE created_at < datetime('now', '-1 minute');
