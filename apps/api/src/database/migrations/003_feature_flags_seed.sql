-- Migration 003: Feature flags seed data
-- The feature_flags table was created in 001_initial_schema.sql.
-- This migration inserts the canonical default flags for LiveOps.
-- Safe to re-run — uses INSERT ... ON CONFLICT DO NOTHING.

INSERT INTO feature_flags (key, value, description) VALUES
  ('coin_earn_rate_multiplier', '1.0',                               'Global multiplier on all coin earnings'),
  ('retry_max_per_show',        '3',                                 'Max retries a player can buy per show'),
  ('playclip_streak_multipliers','{"0":1,"5":1.5,"10":2,"15":3}',   'Streak level to multiplier map'),
  ('show_join_enabled',         'true',                              'Kill switch: disable show joining'),
  ('guest_coin_bonus',          '100',                               'Coins given to new guest accounts'),
  ('trivia_time_limit_ms',      '15000',                             'Time limit for trivia questions in ms'),
  ('show_schedule_enabled',     'true',                              'Whether scheduled shows run automatically')
ON CONFLICT (key) DO NOTHING;
