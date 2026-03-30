-- Add game config, clip timing columns to play_clips
-- Config stores the full game payload so answer evaluation doesn't need a join to game_definitions
ALTER TABLE play_clips
  ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS clip_start_ms INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clip_end_ms   INTEGER NOT NULL DEFAULT 0;
