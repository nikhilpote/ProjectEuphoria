-- Migration 010: Drop the unique constraint on (show_id, round_index) for play_clips.
-- A show round can have multiple clip segments (different start/end ranges),
-- and the admin should be able to re-save clips without hitting duplicate errors.
ALTER TABLE play_clips DROP CONSTRAINT IF EXISTS play_clips_show_id_round_index_key;
