-- Migration 0045: UNIT41.1 (R4-UI-UX-BROWSER-POLISH-1) — seed the two
-- platform_settings keys the release needs. ADDITIVE ONLY; no schema change.
--
-- Keys (both INSERT OR IGNORE — an existing, owner-customised value is never
-- overwritten by a re-application):
-- - demo_explainer_video_url: the owner-approved default unified explainer
--   shown inside the video box for completed/demo competitions that have no
--   recording of their own. Empty value (or the key absent, before this
--   migration runs) preserves today's behaviour exactly (no video).
-- - public_monetization_enabled: '0' (closed) is the seeded default. While
--   '0', ordinary users are refused on the public money/ads surfaces (pages
--   render a friendly translated notice; APIs answer 403 with the same
--   sentence). Admins and AdminRoleModel holders always pass. Flipped from
--   /admin at any time without a deploy.
--
-- G8 (docs/11) rollback plan: additive, reversible. To reverse: DELETE FROM
-- platform_settings WHERE setting_key IN ('demo_explainer_video_url',
-- 'public_monetization_enabled'); the code falls back to today's behaviour
-- when the keys are absent.

INSERT OR IGNORE INTO platform_settings (setting_key, setting_value, description) VALUES
    ('demo_explainer_video_url', 'https://maelshpro.com/ffmpeg/storage/live/match_fake/fake.mp4', 'UNIT41.1: unified explainer video shown for finished/demo competitions with no recording of their own; empty = no video');

INSERT OR IGNORE INTO platform_settings (setting_key, setting_value, description) VALUES
    ('public_monetization_enabled', '0', 'UNIT41.1: public money/ads gate — 1 = open to everyone, 0 = closed to ordinary users (admins always pass)');
