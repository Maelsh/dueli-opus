-- Migration 0025: Ad campaign lifecycle (Phase 9.A) — ADDITIVE ONLY
--
-- States: draft → pending_review → active → paused → ended (guarded in SQL).
--
-- Money rule (9.A): LedgerService (migration 0019) is the ONLY source of
-- truth for campaign budgets. A campaign budget lives in ledger_entries
-- under the account `reserve:campaign_<id>`, funded at creation through a
-- balanced ledger transaction. The advertisements table keeps only
-- non-financial config: budget_cents (declared budget, display metadata)
-- and cost_per_impression_cents. The legacy REAL columns budget /
-- budget_remaining are DEPRECATED (left for reference) but no longer
-- written by application code — ledger_entries is the single money SSOT.
--
-- Legacy status mapping: 'depleted' / 'archived' → 'ended'.
-- Legacy 'active' rows keep their status but hold ZERO ledger balance,
-- so the atomic serving guard (balance >= cost) simply never serves them
-- until they are explicitly funded through the ledger — a safe default.
--
-- This migration is ADDITIVE ONLY — the advertisements row NEVER moves,
-- so ad_impressions, ad_blocks and platform_financial_logs(ad_id)
-- references keep working by construction (no FK cascade side effects,
-- with or without PRAGMA foreign_keys).
--
-- G8 (docs/11) rollback plan: additive step only — no backup/restore
-- procedure required. To reverse: drop the added columns
-- (campaign_lifecycle_status, budget_cents, cost_per_impression_cents)
-- and the two indexes below; ledger_entries stays the money SSOT either way.

-- Add new integer-cents budget columns (display metadata only; ledger is SSOT)
ALTER TABLE advertisements ADD COLUMN budget_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE advertisements ADD COLUMN cost_per_impression_cents INTEGER NOT NULL DEFAULT 1;

-- Add lifecycle status column (replaces dual-status workaround)
ALTER TABLE advertisements ADD COLUMN campaign_lifecycle_status TEXT;

-- Backfill new columns from legacy REAL money columns
UPDATE advertisements
SET budget_cents = CAST(ROUND(COALESCE(budget, 0) * 100) AS INTEGER),
    cost_per_impression_cents = MAX(1, CAST(ROUND(COALESCE(revenue_per_view, 0.001) * 100) AS INTEGER));

-- Backfill lifecycle status from legacy campaign_status
UPDATE advertisements
SET campaign_lifecycle_status = CASE campaign_status
    WHEN 'active' THEN 'active'
    WHEN 'paused' THEN 'paused'
    ELSE 'ended'
END;

-- Set default for any NULL lifecycle status (new rows will use application default)
UPDATE advertisements
SET campaign_lifecycle_status = 'draft'
WHERE campaign_lifecycle_status IS NULL;

-- Add indexes for serving queries
CREATE INDEX IF NOT EXISTS idx_advertisements_serving ON advertisements(campaign_lifecycle_status, is_active);
CREATE INDEX IF NOT EXISTS idx_advertisements_advertiser ON advertisements(advertiser_id);