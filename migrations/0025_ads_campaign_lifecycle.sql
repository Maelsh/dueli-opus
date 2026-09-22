-- Migration 0025: Ad campaign lifecycle (Phase 9.A)
--
-- States: draft → pending_review → active → paused → ended (guarded in SQL).
--
-- Money rule (9.A): LedgerService (migration 0019) is the ONLY source of
-- truth for campaign budgets. A campaign budget lives in ledger_entries
-- under the account `reserve:campaign_<id>`, funded at creation through a
-- balanced ledger transaction. The advertisements table keeps only
-- non-financial config: budget_cents (declared budget, display metadata)
-- and cost_per_impression_cents. The legacy REAL columns budget /
-- budget_remaining are REMOVED so no parallel money column can compete
-- with the ledger.
--
-- Legacy status mapping: 'depleted' / 'archived' → 'ended'.
-- Legacy 'active' rows keep their status but hold ZERO ledger balance,
-- so the atomic serving guard (balance >= cost) simply never serves them
-- until they are explicitly funded through the ledger — a safe default.

CREATE TABLE advertisements_lifecycle_v2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    image_url TEXT,
    link_url TEXT,
    is_active INTEGER DEFAULT 1,
    views_count INTEGER DEFAULT 0,
    clicks_count INTEGER DEFAULT 0,
    revenue_per_view REAL DEFAULT 0.001,
    created_by INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    advertiser_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    budget_cents INTEGER NOT NULL DEFAULT 0 CHECK (budget_cents >= 0),
    cost_per_impression_cents INTEGER NOT NULL DEFAULT 1 CHECK (cost_per_impression_cents > 0),
    target_language TEXT DEFAULT NULL,
    target_country TEXT DEFAULT NULL,
    campaign_status TEXT NOT NULL DEFAULT 'draft'
        CHECK (campaign_status IN ('draft', 'pending_review', 'active', 'paused', 'ended'))
);

INSERT INTO advertisements_lifecycle_v2
    (id, title, image_url, link_url, is_active, views_count, clicks_count,
     revenue_per_view, created_by, created_at, advertiser_id,
     budget_cents, cost_per_impression_cents, target_language, target_country,
     campaign_status)
SELECT
    id, title, image_url, link_url, is_active, views_count, clicks_count,
    revenue_per_view, created_by, created_at, advertiser_id,
    CAST(ROUND(COALESCE(budget, 0) * 100) AS INTEGER),
    MAX(1, CAST(ROUND(COALESCE(revenue_per_view, 0.001) * 100) AS INTEGER)),
    target_language, target_country,
    CASE campaign_status
        WHEN 'active' THEN 'active'
        WHEN 'paused' THEN 'paused'
        ELSE 'ended'
    END
FROM advertisements;

DROP TABLE advertisements;
ALTER TABLE advertisements_lifecycle_v2 RENAME TO advertisements;

CREATE INDEX IF NOT EXISTS idx_advertisements_serving ON advertisements(campaign_status, is_active);
CREATE INDEX IF NOT EXISTS idx_advertisements_advertiser ON advertisements(advertiser_id);