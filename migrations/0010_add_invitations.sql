-- Migration: Add competition invitations table
-- ترحيل: إضافة جدول دعوات المنافسة

-- Invitations: when competition creator invites someone to join
CREATE TABLE IF NOT EXISTS competition_invitations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL,
    inviter_id INTEGER NOT NULL,
    invitee_id INTEGER NOT NULL,
    message TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'declined', 'expired')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    responded_at DATETIME,
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
    FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (invitee_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_invitations_invitee ON competition_invitations(invitee_id, status);
CREATE INDEX IF NOT EXISTS idx_invitations_competition ON competition_invitations(competition_id, status);

-- Add auto_deleted_reason column to competitions for tracking
ALTER TABLE competitions ADD COLUMN auto_deleted_reason TEXT;
