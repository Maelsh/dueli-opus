-- Migration 0012: allow reports.target_type = 'ad' (live-room ad reports)
-- SQLite/D1 cannot ALTER a CHECK constraint, so the table is rebuilt with the
-- same columns (including 0003 arbitration columns) plus 'ad' in the CHECK.

CREATE TABLE reports_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_id INTEGER NOT NULL,
    target_type TEXT NOT NULL CHECK (target_type IN ('user', 'competition', 'comment', 'ad')),
    target_id INTEGER NOT NULL,
    reason TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
    reviewed_by INTEGER,
    reviewed_at TEXT,
    action_taken TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    assigned_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    arbitration_status TEXT DEFAULT 'submitted' CHECK(arbitration_status IN ('submitted', 'under_review', 'investigation', 'resolved', 'rejected')),
    arbitration_notes TEXT,
    resolved_at DATETIME,
    resolution_reason TEXT,
    FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO reports_new (
    id, reporter_id, target_type, target_id, reason, description, status,
    reviewed_by, reviewed_at, action_taken, created_at,
    assigned_admin_id, arbitration_status, arbitration_notes, resolved_at, resolution_reason
)
SELECT
    id, reporter_id, target_type, target_id, reason, description, status,
    reviewed_by, reviewed_at, action_taken, created_at,
    assigned_admin_id, arbitration_status, arbitration_notes, resolved_at, resolution_reason
FROM reports;

DROP TABLE reports;

ALTER TABLE reports_new RENAME TO reports;
