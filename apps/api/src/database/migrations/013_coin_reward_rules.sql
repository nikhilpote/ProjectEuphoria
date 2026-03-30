CREATE TABLE coin_reward_rules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  trigger      TEXT NOT NULL,
  conditions   JSONB NOT NULL DEFAULT '[]',
  reward       JSONB NOT NULL,
  stack_mode   TEXT NOT NULL DEFAULT 'additive'
               CHECK (stack_mode IN ('additive', 'multiplier', 'override')),
  priority     INTEGER NOT NULL DEFAULT 100,
  active_from  TIMESTAMPTZ,
  active_until TIMESTAMPTZ,
  enabled      BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_coin_reward_rules_trigger_enabled
  ON coin_reward_rules(trigger, enabled);

-- Seed default rules
INSERT INTO coin_reward_rules (name, description, trigger, conditions, reward, stack_mode, priority)
VALUES
  (
    'Base PlayClip Correct',
    'Award coins for any correct PlayClip answer',
    'playclip.correct',
    '[]',
    '{"type":"fixed","amount":10}',
    'additive',
    100
  ),
  (
    'Perfect Score Bonus',
    'Extra coins for scoring 175 or above',
    'playclip.correct',
    '[{"field":"score","op":"gte","value":175}]',
    '{"type":"fixed","amount":15}',
    'additive',
    110
  ),
  (
    'Quick Math Premium',
    'Extra coins for completing a quick_math game',
    'playclip.correct',
    '[{"field":"game_type","op":"eq","value":"quick_math"}]',
    '{"type":"fixed","amount":5}',
    'additive',
    120
  ),
  (
    'Live Show Winner',
    'Coins awarded for winning a live show',
    'show.won',
    '[]',
    '{"type":"fixed","amount":500}',
    'additive',
    100
  ),
  (
    'Round Survivor',
    'Coins awarded for surviving a show round',
    'show.round_survived',
    '[]',
    '{"type":"fixed","amount":20}',
    'additive',
    100
  ),
  (
    '7-Day Streak Bonus',
    'Multiplier for players on a 7+ day streak',
    'playclip.correct',
    '[{"field":"streak_days","op":"gte","value":7}]',
    '{"type":"multiplier","value":1.5}',
    'multiplier',
    200
  ),
  (
    '30-Day Streak Bonus',
    'Multiplier for players on a 30+ day streak',
    'playclip.correct',
    '[{"field":"streak_days","op":"gte","value":30}]',
    '{"type":"multiplier","value":2.0}',
    'multiplier',
    210
  ),
  (
    'First Play Bonus',
    'Large bonus for a player''s first ever PlayClip',
    'playclip.correct',
    '[{"field":"is_first_play","op":"eq","value":"true"}]',
    '{"type":"fixed","amount":50}',
    'additive',
    90
  )
ON CONFLICT DO NOTHING;
