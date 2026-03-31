-- Migration 014: Game levels table
-- Stores named levels for games that require admin-curated content.
-- Currently used only by spot_difference; other game types manage config inline.

CREATE TABLE game_levels (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  game_package_id TEXT         NOT NULL REFERENCES game_packages(id) ON DELETE CASCADE,
  name            TEXT         NOT NULL,   -- admin-set slug, e.g. 'beach-scene'
  config          JSONB        NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  UNIQUE (game_package_id, name)
);

CREATE INDEX idx_game_levels_package ON game_levels (game_package_id);

CREATE TRIGGER trg_game_levels_updated_at
  BEFORE UPDATE ON game_levels
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
