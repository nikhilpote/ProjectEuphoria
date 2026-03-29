-- Migration 002: Social auth & guest accounts
-- Adds guest support and normalises the social_provider column.
-- Safe to run multiple times — all changes use IF NOT EXISTS / IF EXISTS guards.

-- Allow email to be NULL (guest accounts have no email until upgraded)
ALTER TABLE users
  ALTER COLUMN email DROP NOT NULL;

-- Which provider created this account: 'apple' | 'google' | 'guest'
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS social_provider TEXT
    CHECK (social_provider IN ('apple', 'google', 'guest'));

-- Flag rows that are unupgraded guest accounts
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NOT NULL DEFAULT false;

-- Back-fill: all existing rows are real social accounts (apple or google)
UPDATE users
SET
  social_provider = CASE
    WHEN apple_id  IS NOT NULL THEN 'apple'
    WHEN google_id IS NOT NULL THEN 'google'
    ELSE NULL
  END,
  is_guest = false
WHERE social_provider IS NULL;

-- Index to find all guest accounts efficiently (e.g. for cleanup jobs)
CREATE INDEX IF NOT EXISTS idx_users_is_guest
  ON users (is_guest)
  WHERE is_guest = true;
