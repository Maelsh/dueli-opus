-- Migration 0009: Add Live Streaming Fields
-- هجرة 0009: إضافة حقول البث المباشر
-- Adds fields for P2P streaming, HLS URLs, and VOD storage

-- Add live streaming URL (HLS playlist URL)
ALTER TABLE competitions ADD COLUMN live_url TEXT;

-- Add VOD (Video on Demand) URL after stream ends
ALTER TABLE competitions ADD COLUMN vod_url TEXT;

-- Add stream status field
-- Values: 'idle', 'connecting', 'live', 'processing', 'ready', 'error'
ALTER TABLE competitions ADD COLUMN stream_status TEXT DEFAULT 'idle';

-- Add stream started timestamp
ALTER TABLE competitions ADD COLUMN stream_started_at TEXT;

-- Add stream ended timestamp
ALTER TABLE competitions ADD COLUMN stream_ended_at TEXT;

-- Create index for stream status queries
CREATE INDEX IF NOT EXISTS idx_competitions_stream_status ON competitions(stream_status);

-- Create index for live streams
CREATE INDEX IF NOT EXISTS idx_competitions_live ON competitions(status, stream_status);
