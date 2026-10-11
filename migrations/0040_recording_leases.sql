-- 0040_recording_leases.sql — R4-CHUNK-DOWNLOAD-1 (row 27): single active host recorder
--
-- Forward-only, additive: one new table, no historical file touched.
-- LOCAL ONLY: applied with `npm run db:migrate:local` for local dev/tests.
-- Never applied to production by this unit (no remote migration, no deploy).
--
-- `recording_leases` gives the host recorder a server-backed exclusive,
-- expiring ownership (lease/fencing) per competition so two tabs, browsers
-- or devices of the same host cannot record/upload the same competition at
-- the same time. localStorage/BroadcastChannel alone cannot do this (they
-- do not cross browsers/devices); the server row is the arbiter.
--
-- Semantics (enforced in RecordingLeaseModel, not here):
--  - one row per competition (PRIMARY KEY);
--  - holder_hash = sha256 of the holder's session token (server-derived
--    from the Authorization header — the client never sends it);
--  - generation bumps on every ownership change (fencing token: a stale
--    session whose generation no longer matches must stop uploading);
--  - TTL via last_heartbeat_at + ttl_seconds: a crashed/closed browser
--    stops heartbeating, the lease expires, and a new session may take
--    over — a competition is NEVER locked forever and expiry NEVER ends
--    the competition (end happens only via POST /api/competitions/:id/end);
--  - released_at marks a clean handover (end/release) without waiting TTL.
--
-- Residual, documented honestly: upload BYTES go straight to the external
-- ffmpeg server (upload.php), whose contract this unit must not change, so
-- a stale tab is fenced at the next ownership check (bounded detection
-- window ≈ heartbeat interval), not mid-byte. Byte-level fencing would
-- need the external server to verify per-upload keys (see WORKLOG).

CREATE TABLE IF NOT EXISTS recording_leases (
    competition_id INTEGER PRIMARY KEY REFERENCES competitions(id) ON DELETE CASCADE,
    holder_hash TEXT NOT NULL,
    generation INTEGER NOT NULL DEFAULT 1,
    acquired_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_heartbeat_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ttl_seconds INTEGER NOT NULL DEFAULT 45,
    released_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_recording_leases_holder
    ON recording_leases(holder_hash);
