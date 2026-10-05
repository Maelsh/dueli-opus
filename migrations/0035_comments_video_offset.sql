-- R2-L2: VOD timed comments — playback offset (seconds) carried by post-live comments.
-- Additive, forward-only. NULL = live/unsynced comment (pre-existing rows stay NULL).
-- No backfill: historical comments have no meaningful playback position.
ALTER TABLE comments ADD COLUMN video_offset REAL;
