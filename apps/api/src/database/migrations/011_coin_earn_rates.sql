-- 011_coin_earn_rates.sql
-- Adds a coin_earn_rates config table and extends the coin_transactions type enum.

-- ---------------------------------------------------------------------------
-- 1. Extend coin_transactions.type check constraint to include playclip_reward
-- ---------------------------------------------------------------------------

ALTER TABLE coin_transactions
  DROP CONSTRAINT IF EXISTS coin_transactions_type_check;

ALTER TABLE coin_transactions
  ADD CONSTRAINT coin_transactions_type_check
  CHECK (type IN (
    'iap_purchase',
    'show_winnings',
    'show_entry_fee',
    'bonus_grant',
    'refund',
    'playclip_reward'
  ));

-- ---------------------------------------------------------------------------
-- 2. Create coin_earn_rates table
-- ---------------------------------------------------------------------------

CREATE TABLE coin_earn_rates (
  key         TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  description TEXT NOT NULL,
  amount      INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
  enabled     BOOLEAN NOT NULL DEFAULT true,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 3. Seed default earn rates
-- ---------------------------------------------------------------------------

INSERT INTO coin_earn_rates (key, label, description, amount, enabled) VALUES
  ('playclip_correct',   'PlayClip Correct Answer',      'Coins awarded for answering a PlayClip correctly',                        10,  true),
  ('playclip_perfect',   'PlayClip Perfect Score Bonus', 'Extra coins when speed bonus is ≥ 75% (score ≥ 175) on a PlayClip',      15,  true),
  ('show_correct_answer','Live Show Correct Answer',     'Coins for each correct answer during a live show round',                   5,  true),
  ('show_survivor_round','Live Show Round Survivor',     'Coins for surviving each elimination round in a live show',               20,  true),
  ('show_winner',        'Live Show Winner',             'Grand prize coins awarded to the show winner',                           500,  true),
  ('streak_7day',        '7-Day Streak Milestone',       'Bonus coins for maintaining a 7-day consecutive daily play streak',       50,  true),
  ('streak_30day',       '30-Day Streak Milestone',      'Bonus coins for maintaining a 30-day consecutive daily play streak',     200,  true),
  ('first_play_bonus',   'First Play Bonus',             'One-time coins awarded when a user plays their very first PlayClip',      20,  true)
ON CONFLICT (key) DO NOTHING;
