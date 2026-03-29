-- Migration 006: Game packages table
-- Stores OTA game packages uploaded as ZIPs and deployed to S3.
-- Each row represents one installed game version; id is the game slug (e.g. 'trivia').

CREATE TABLE game_packages (
  id            TEXT         PRIMARY KEY,          -- e.g. 'trivia', 'quick_math'
  name          TEXT         NOT NULL,             -- display name
  version       TEXT         NOT NULL,             -- semver, e.g. '1.0.0'
  description   TEXT,
  is_enabled    BOOLEAN      NOT NULL DEFAULT true,
  manifest      JSONB        NOT NULL,             -- full manifest.json contents
  bundle_url    TEXT         NOT NULL,             -- CloudFront URL to web/index.html
  thumbnail_url TEXT,                              -- preview image URL
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_game_packages_enabled ON game_packages (is_enabled);

CREATE TRIGGER trg_game_packages_updated_at
  BEFORE UPDATE ON game_packages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
