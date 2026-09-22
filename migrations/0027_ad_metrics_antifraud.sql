-- Migration 0027: Ad metrics & anti-fraud (Phase 9.C) — ADDITIVE ONLY
--
-- 9.C proves the advertiser pays for REAL views/clicks and sees stats derived
-- from the SAME source the money was taken from:
-- - ad_click_tokens: server-issued, single-use, expiring click tokens. A click
--   is only countable with a valid unconsumed token (anti-forgery). No secret
--   ever reaches the client: tokens are opaque 256-bit random values minted
--   server-side (crypto.randomUUID × 2) and validated against this table.
-- - ad_clicks: one row per COUNTED click, written atomically with the token
--   consumption in the same batch (UNIQUE(token) = no double-count, even under
--   concurrency). Analytics counts THESE rows, never the legacy counters.
-- - ad_impression_dedup: idempotency keys for impression delivery. Retrying the
--   same delivery (same key, same ad+user) within the approved 24h repeat
--   window returns the original result WITHOUT a second ledger charge.
--   Distinct keys (genuinely new servings) still charge normally, so the 9.B
--   frequency-cap behavior is untouched when no key is sent (legacy path).
--
-- Money rule (unchanged): LedgerService (migration 0019) stays the ONLY money
-- source of truth. Spend = SUM of the ad_impression ledger credits on
-- reserve:campaign_<id>; this migration adds NO money column and changes NO
-- ledger semantics. All amounts stay integer cents — no floating point.
--
-- G8 (docs/11) rollback plan: additive step only — no backup/restore required.
-- To reverse: DROP TABLE ad_clicks, ad_click_tokens, ad_impression_dedup.
-- The legacy counters (views_count/clicks_count) are left in place (now
-- display-compat only) so rollback cannot break reads.

CREATE TABLE ad_click_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ad_id INTEGER NOT NULL REFERENCES advertisements(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ad_click_tokens_token ON ad_click_tokens(token);
CREATE INDEX IF NOT EXISTS idx_ad_click_tokens_ad ON ad_click_tokens(ad_id);

CREATE TABLE ad_clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ad_id INTEGER NOT NULL REFERENCES advertisements(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    token TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ad_clicks_ad ON ad_clicks(ad_id);

CREATE TABLE ad_impression_dedup (
    key TEXT PRIMARY KEY,
    ad_id INTEGER NOT NULL REFERENCES advertisements(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    served INTEGER NOT NULL DEFAULT 1,
    spent_cents INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ad_impression_dedup_ad ON ad_impression_dedup(ad_id);
