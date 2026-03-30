-- Migration 009: Add game_offset_ms to play_clips
-- game_offset_ms = ms from clip start when the game overlay should appear
ALTER TABLE play_clips
  ADD COLUMN IF NOT EXISTS game_offset_ms INTEGER NOT NULL DEFAULT 0;
