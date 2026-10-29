-- Migration 0044: UNIT36.1 market ad pricing, fixed media, competitor policy,
-- Dueli house ads — ADDITIVE ONLY.
--
-- Scope:
-- - advertisements.is_house: 0 = third-party paid ad, 1 = Dueli house ad.
--   House rows never consume a campaign budget, never write paid ledger
--   entries, and are never blockable by a competitor policy or ad_blocks.
-- - advertisements.media_kind: one fixed slot accepts image / GIF / video.
-- - advertisements.duration_sec: exact video-creative duration in seconds,
--   used only by the admin duration multiplier keyed by that value.
-- - ad_impressions.charged_cents: the effective integer-cents price actually
--   charged for that impression. 0 means legacy/direct-insert (revenue falls
--   back to advertisements.revenue_per_view) or a house impression (no paid
--   revenue). The ledger remains the money SSOT; this column only preserves
--   the per-impression price for the 80/20 payout calculation.
-- - user_ad_policy + user_ad_grants: one competitor ad-control mode per user
--   and the explicit grants used by manual mode.
--
-- No prices, multipliers, or house creative content are seeded. An empty
-- pricing configuration preserves the existing campaign cost exactly.
--
-- G8 (docs/11) rollback plan: additive step only — no backup/restore required.
-- To reverse: DROP TABLE user_ad_grants, user_ad_policy; drop the three new
-- indexes and columns. Existing defaults keep serving and money paths intact
-- until the columns are removed.

ALTER TABLE advertisements ADD COLUMN is_house INTEGER NOT NULL DEFAULT 0
    CHECK (is_house IN (0, 1));
ALTER TABLE advertisements ADD COLUMN media_kind TEXT NOT NULL DEFAULT 'image'
    CHECK (media_kind IN ('image', 'gif', 'video'));
ALTER TABLE advertisements ADD COLUMN duration_sec INTEGER
    CHECK (duration_sec IS NULL OR duration_sec > 0);

ALTER TABLE ad_impressions ADD COLUMN charged_cents INTEGER NOT NULL DEFAULT 0
    CHECK (charged_cents >= 0);

CREATE INDEX IF NOT EXISTS idx_advertisements_house
    ON advertisements(is_house, is_active);
CREATE INDEX IF NOT EXISTS idx_ad_impressions_competition_charged
    ON ad_impressions(competition_id, charged_cents);

CREATE TABLE IF NOT EXISTS user_ad_policy (
    user_id INTEGER PRIMARY KEY,
    mode TEXT NOT NULL DEFAULT 'auto'
        CHECK (mode IN ('auto', 'allow', 'manual', 'block')),
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_ad_grants (
    user_id INTEGER NOT NULL,
    ad_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, ad_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (ad_id) REFERENCES advertisements(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_ad_grants_ad ON user_ad_grants(ad_id);
