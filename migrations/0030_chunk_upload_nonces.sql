-- 0030_chunk_upload_nonces.sql — C2 (SEC-03): replay protection for upload-server HMAC auth
--
-- Numbered 0030 (not 0029) on purpose: C3b's `0029_drop_unused_posts.sql` lives on
-- its own unmerged branch and merges first per the execution order. If C3b has not
-- merged yet, this chain simply lacks 0029 — every migration here is independent.
-- Forward-only, additive: one new table, no historical file touched.
--
-- `chunk_upload_nonces` stores consumed X-Nonce values so a captured
-- (signature, timestamp, nonce) triple cannot be replayed. Rows are tiny and
-- opportunistically pruned (created_at older than 10 minutes) on each verified
-- request; a periodic cron cleanup may be added later if the table ever grows.

CREATE TABLE IF NOT EXISTS chunk_upload_nonces (
    nonce TEXT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
