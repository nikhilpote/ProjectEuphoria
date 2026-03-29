-- Add single video_url column to shows.
-- game_sequence now stores marker-based format:
--   [{ at: number, duration: number, gameType: string, config: {...} }]
-- where `at` = seconds into show video when question spawns,
-- `duration` = seconds the answer window is open.

ALTER TABLE shows ADD COLUMN video_url TEXT;
