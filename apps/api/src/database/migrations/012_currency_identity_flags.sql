-- 012_currency_identity_flags.sql
-- Seeds the currency name and symbol feature flags.

INSERT INTO feature_flags (key, value, description) VALUES
  ('currency_name',   '"Coins"', 'Display name for the in-app currency (e.g. "Coins", "Gems", "Stars")'),
  ('currency_symbol', '"◈"',     'Icon/symbol shown next to the currency amount in the UI')
ON CONFLICT (key) DO NOTHING;
