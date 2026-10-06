-- R2-P: saved payout method link + immutable execution snapshot.
-- Additive, forward-only. Legacy rows keep working: payout_method_id is
-- NULL and payout_snapshot defaults to '{}' (readers fall back to the
-- free-text payment_method/payment_details columns). The snapshot is
-- written once at creation and never updated, so editing or deleting a
-- saved method can never alter an old request. Deleting a method NULLs
-- the link (ON DELETE SET NULL) while the snapshot stays intact.
ALTER TABLE withdrawal_requests ADD COLUMN payout_method_id INTEGER REFERENCES payment_methods(id) ON DELETE SET NULL;
ALTER TABLE withdrawal_requests ADD COLUMN payout_snapshot TEXT NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_payout_method ON withdrawal_requests (payout_method_id);
