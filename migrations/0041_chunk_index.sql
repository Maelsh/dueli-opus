-- 0041_chunk_index.sql — R4-CHUNK-INDEX-1 (row 27): D1 chunk metadata authority.
--
-- Numbered 0041 (not 0040) on purpose: 0040_recording_leases.sql lives on the
-- unmerged PR110/HOLD branch (row 30). If PR110 merges first, its 0040 lands
-- before this file; if this merges first, 0040 stays free for it. Neither side
-- is renumbered. Forward-only, additive: two new tables, no historical file
-- touched. LOCAL ONLY until an owner-gated apply (no remote migration, no
-- deploy, no production write from this unit).
--
-- Portable-SQL discipline (15 §3/§7, future MySQL in its own UNIT): standard
-- column types, positional binds, no datetime('now')/RETURNING in DML —
-- timestamps are bound from JS (ISO 8601) by ChunkIndexModel. Video bytes
-- NEVER enter D1 — only locators (object_path) plus verified facts.
--
-- States: uploaded (bytes landed, UNVERIFIED) → ready (storage + duration
-- verified by a trusted receipt) | failed (terminal). Client-declared
-- duration/size live in declared_* columns and can NEVER mark a chunk ready.
-- Competition ended (competitions.status) is distinct from recording
-- finalized (recording_finals row): the marker records what existed at end,
-- it never blocks cutoff/payouts and never deletes anything.

CREATE TABLE IF NOT EXISTS recording_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    generation INTEGER NOT NULL DEFAULT 1,
    sequence INTEGER NOT NULL,
    object_path TEXT NOT NULL,
    object_hash TEXT,
    container TEXT NOT NULL CHECK (container IN ('mp4', 'webm')),
    codec_video TEXT,
    codec_audio TEXT,
    bytes INTEGER,
    declared_duration_ms INTEGER,
    duration_ms INTEGER,
    state TEXT NOT NULL DEFAULT 'uploaded' CHECK (state IN ('uploaded', 'ready', 'failed')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (competition_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_recording_chunks_order
    ON recording_chunks(competition_id, sequence);

CREATE INDEX IF NOT EXISTS idx_recording_chunks_state
    ON recording_chunks(competition_id, state);

CREATE TABLE IF NOT EXISTS recording_finals (
    competition_id INTEGER PRIMARY KEY REFERENCES competitions(id) ON DELETE CASCADE,
    finalized_at TEXT NOT NULL,
    uploaded_count INTEGER NOT NULL DEFAULT 0,
    ready_count INTEGER NOT NULL DEFAULT 0,
    total_ready_ms INTEGER NOT NULL DEFAULT 0,
    marker_generation INTEGER
);
