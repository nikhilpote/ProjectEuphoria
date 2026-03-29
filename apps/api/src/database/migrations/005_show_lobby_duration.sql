-- Add lobby_duration_ms to shows
-- This controls how long the lobby stays open before the show auto-starts.
-- Default: 60 seconds.

ALTER TABLE shows
  ADD COLUMN IF NOT EXISTS lobby_duration_ms INTEGER NOT NULL DEFAULT 60000;
