-- 0042_chunk_key_binding.sql — R4-CHUNK-UPLOAD-SAFE-1 (row 28): mandatory bound keys.
--
-- Forward-only, additive: three NULLABLE columns on chunk_keys (migration
-- 0013), no historical file touched. LOCAL ONLY until an owner-gated apply
-- (no remote migration, no deploy, no production write from this unit).
--
-- Each issued key is bound to (competition, sequence, lease generation,
-- object identity, byte ceiling). verify() enforces the binding and consumes
-- the key atomically (single-use → replay fails); fencing compares the bound
-- generation against the CURRENT lease generation (takeover kills old keys
-- immediately, clean-end drain tails still verify while unexpired).
-- NULL generation = pre-binding legacy key → rejected (fail closed; no live
-- legacy keys exist because no client path used register before SAFE28).
-- Portable-SQL discipline: standard ALTER ADD COLUMN only.

ALTER TABLE chunk_keys ADD COLUMN lease_generation INTEGER;
ALTER TABLE chunk_keys ADD COLUMN object_path TEXT;
ALTER TABLE chunk_keys ADD COLUMN max_bytes INTEGER;

CREATE INDEX IF NOT EXISTS idx_chunk_keys_bound
    ON chunk_keys(competition_id, chunk_index);
