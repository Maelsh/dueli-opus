-- Migration 0028: Ad dedup identity + mint-key (Phase 9.C remediation) — ADDITIVE ONLY
--
-- Context: 0027 keyed ad_impression_dedup by `key` alone (PRIMARY KEY), while
-- the lookup semantics are (key, ad, user). A random key collision across ads
-- or identities would wrongly suppress a legitimate second delivery (fail-safe
-- — never a double charge — but wrong isolation). This migration aligns the
-- constraint with the semantics: (key, ad_id, user NULL-safe).
--
-- What changes (0027 itself is historical and untouched):
-- 1. ad_impression_dedup is rebuilt with the SAME columns and ALL rows copied
--    over (INSERT INTO ... SELECT — no data loss, no reorder), then renamed
--    back. The single-column PRIMARY KEY is replaced by a NULL-safe composite
--    UNIQUE index (key, ad_id, COALESCE(user_id, -1)): anonymous deliveries
--    without an id share the -1 sentinel bucket, exactly like the IS-comparison
--    in the lookup query. Expression indexes require SQLite 3.9+ (D1 qualifies).
-- 2. ad_click_tokens gains a nullable mint_key TEXT column (pure ADD COLUMN)
--    backfilled as 'user:<id>' (or 'anon'), with a serving index on
--    (ad_id, mint_key). It records which rate-identity a token was minted for
--    so the per-identity live-token cap counts correctly. user_id stays the
--    audit/binding column — nothing is reinterpreted.
--
-- Money rule (unchanged): no money column, no ledger change, integer cents only.
--
-- G8 (docs/11) rollback plan: additive step only — to reverse, drop the two
-- indexes below and the mint_key column (SQLite DROP COLUMN), or restore the
-- single-column PRIMARY KEY via the same copy-rebuild pattern in reverse.
-- Dedup rows are ephemeral (24h window); token rows expire in 10 minutes.

-- ── 1. dedup composite identity (copy-preserving rebuild) ──────────────
CREATE TABLE ad_impression_dedup_new (
    key TEXT NOT NULL,
    ad_id INTEGER NOT NULL REFERENCES advertisements(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    served INTEGER NOT NULL DEFAULT 1,
    spent_cents INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Pre-existing keys were unique by construction (old PRIMARY KEY), so the new
-- composite uniqueness holds trivially over the copied rows.
INSERT INTO ad_impression_dedup_new (key, ad_id, user_id, served, spent_cents, created_at)
    SELECT key, ad_id, user_id, served, spent_cents, created_at FROM ad_impression_dedup;

DROP TABLE ad_impression_dedup;

ALTER TABLE ad_impression_dedup_new RENAME TO ad_impression_dedup;

CREATE INDEX IF NOT EXISTS idx_ad_impression_dedup_ad ON ad_impression_dedup(ad_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_impression_dedup_identity
    ON ad_impression_dedup(key, ad_id, COALESCE(user_id, -1));

-- ── 2. token mint identity (additive column + backfill + index) ─────────
ALTER TABLE ad_click_tokens ADD COLUMN mint_key TEXT;

UPDATE ad_click_tokens
SET mint_key = CASE WHEN user_id IS NULL THEN 'anon' ELSE 'user:' || user_id END
WHERE mint_key IS NULL;

CREATE INDEX IF NOT EXISTS idx_ad_click_tokens_mint ON ad_click_tokens(ad_id, mint_key);
