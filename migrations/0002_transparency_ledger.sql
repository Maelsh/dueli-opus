-- ==============================================================
-- Migration: 0002_transparency_ledger.sql
-- Task 4: The Ultimate Transparency Engine - DB Schema
-- محرك الشفافية النهائي - مخطط قاعدة البيانات
-- ==============================================================

-- ---------------------------------------------------------------
-- Table: platform_financial_logs
-- Tracks every financial event on the platform:
-- ad revenue chunks, operational costs, competitor payouts,
-- platform retained share, and donor funding allocations.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_financial_logs (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Classification
    entry_type          TEXT NOT NULL CHECK (entry_type IN (
                            'ad_revenue',           -- Revenue from ad impressions
                            'competitor_payout',    -- Payment to a competitor
                            'platform_share',       -- Platform's retained cut
                            'server_cost',          -- Hosting / infrastructure
                            'developer_salary',     -- Developer payroll
                            'admin_salary',         -- Admin / ops payroll
                            'donor_allocation',     -- Donor funds applied to ops
                            'other_cost'            -- Miscellaneous operating cost
                        )),

    -- Amounts (all in USD, stored as cents-precision REAL)
    amount              REAL NOT NULL CHECK (amount >= 0),

    -- Optional references (nullable; never expose raw user ids publicly)
    competition_id      INTEGER,                    -- If linked to a competition
    ad_id               INTEGER,                    -- If linked to an ad impression

    -- Description for public feed (sanitized, no PII)
    public_description  TEXT,

    -- Internal memo (NEVER exposed publicly)
    internal_memo       TEXT,

    -- Timestamps
    period_date         TEXT NOT NULL,              -- ISO date: YYYY-MM-DD (accounting period)
    created_at          TEXT DEFAULT (datetime('now')),

    -- Soft FK references (no hard FK on competition/ad to survive cascades)
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE SET NULL,
    FOREIGN KEY (ad_id) REFERENCES advertisements(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pfl_entry_type  ON platform_financial_logs (entry_type);
CREATE INDEX IF NOT EXISTS idx_pfl_period_date ON platform_financial_logs (period_date);
CREATE INDEX IF NOT EXISTS idx_pfl_competition ON platform_financial_logs (competition_id);


-- ---------------------------------------------------------------
-- Table: platform_donations_ledger
-- Public-facing record of every completed donor contribution
-- and how allocated donor funds are spent as operational credits.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_donations_ledger (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Source / purpose
    ledger_type         TEXT NOT NULL CHECK (ledger_type IN (
                            'donation_received',    -- A donor contributed funds
                            'donation_allocated'    -- Funds applied to an expense
                        )),

    amount              REAL NOT NULL CHECK (amount >= 0),

    -- Donor display info (anonymized per user preference)
    donor_display_name  TEXT,                       -- 'Anonymous' or first-name only
    donor_message       TEXT,                       -- Optional public thank-you message

    -- Link back to the raw donations table (internal; not exposed)
    source_donation_id  INTEGER,

    -- If this entry is an allocation, link to the financial log it funds
    linked_log_id       INTEGER,

    -- Public description for the ledger feed
    public_description  TEXT,

    -- Accounting period
    period_date         TEXT NOT NULL,
    created_at          TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (source_donation_id) REFERENCES donations(id) ON DELETE SET NULL,
    FOREIGN KEY (linked_log_id)      REFERENCES platform_financial_logs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pdl_ledger_type ON platform_donations_ledger (ledger_type);
CREATE INDEX IF NOT EXISTS idx_pdl_period_date ON platform_donations_ledger (period_date);


-- ---------------------------------------------------------------
-- Table: admin_audit_logs  (required by Task 2 & 4 spec)
-- Every Admin action is immutably logged here.
-- Public feed uses anonymized role label, never raw admin_id.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id        INTEGER NOT NULL,               -- Internal only
    action_type     TEXT NOT NULL,                  -- e.g. 'resolve_complaint', 'ban_user'
    target_entity   TEXT,                           -- e.g. 'competition', 'user', 'report'
    target_id       INTEGER,
    details         TEXT,                           -- JSON blob with sanitized context
    created_at      TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_aal_admin_id    ON admin_audit_logs (admin_id);
CREATE INDEX IF NOT EXISTS idx_aal_action_type ON admin_audit_logs (action_type);
CREATE INDEX IF NOT EXISTS idx_aal_created_at  ON admin_audit_logs (created_at);
