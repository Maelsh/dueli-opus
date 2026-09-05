-- Migration 0011: competition_invitations.accepted_at
-- The accept() flow writes accepted_at on invitation acceptance, but the
-- column only existed on competitions (0010) — never on competition_invitations.
-- D1 ALTER TABLE ... ADD COLUMN is idempotent-safe only when the column is
-- missing, so this file must run once via `wrangler d1 migrations apply`.

ALTER TABLE competition_invitations ADD COLUMN accepted_at DATETIME;

-- Backfill: for rows already accepted before this column existed, fall back to
-- updated_at (accept() bumps updated_at), else created_at.
UPDATE competition_invitations
SET accepted_at = COALESCE(updated_at, created_at)
WHERE accepted_at IS NULL
  AND status = 'accepted';

-- NOTE: TURN check (Agent B §3) — GET /api/signaling/ice-servers returns
-- Cloudflare Calls TURN credentials ONLY when TURN_TOKEN_ID + TURN_API_TOKEN
-- are set in the Cloudflare dashboard (Pages → Settings → Environment
-- variables, for BOTH Preview and Production). When either is missing the
-- endpoint intentionally falls back to STUN-only servers and the browser
-- still connects on open networks but may fail behind symmetric NAT.
-- Do NOT commit real token values to the repo.
