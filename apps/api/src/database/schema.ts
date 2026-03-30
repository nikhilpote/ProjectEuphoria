/**
 * Kysely database schema types.
 * These types mirror the SQL schema exactly and are used for compile-time
 * safety in all database queries. Update alongside SQL migrations.
 *
 * Naming: snake_case to match PostgreSQL column names.
 */

import type { ColumnType, Generated, JSONColumnType } from 'kysely';

// ---------------------------------------------------------------------------
// Shared column helpers
// ---------------------------------------------------------------------------

/** Auto-generated primary key */
type PK = Generated<string>;

/** Timestamps managed by PostgreSQL defaults */
type CreatedAt = ColumnType<Date, never, never>;
type UpdatedAt = ColumnType<Date, never, Date>;

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

export type SocialProvider = 'apple' | 'google' | 'guest';

export interface UsersTable {
  id: PK;
  /** Null for guest accounts that have never provided an email */
  email: string | null;
  display_name: string;
  avatar_url: string | null;
  coin_balance: ColumnType<number, number, number>;
  apple_id: string | null;
  google_id: string | null;
  /** Set on creation; 'guest' until upgraded via social login. */
  social_provider: ColumnType<SocialProvider | null, SocialProvider | null, SocialProvider | null>;
  is_guest: ColumnType<boolean, boolean, boolean>;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

// ---------------------------------------------------------------------------
// refresh_tokens
// ---------------------------------------------------------------------------

export interface RefreshTokensTable {
  id: PK;
  user_id: string;
  token_hash: string; // bcrypt hash of the actual token
  expires_at: Date;
  revoked_at: Date | null;
  created_at: CreatedAt;
}

// ---------------------------------------------------------------------------
// shows
// ---------------------------------------------------------------------------

export type ShowStatus = 'scheduled' | 'lobby' | 'live' | 'completed' | 'cancelled';

export interface ShowRoundRow {
  roundIndex: number;
  gameType: string;
  gameDefinitionId: string;
}

export interface ShowsTable {
  id: PK;
  title: string;
  scheduled_at: Date;
  status: ColumnType<ShowStatus, ShowStatus, ShowStatus>;
  game_sequence: JSONColumnType<ShowRoundRow[]>;
  player_count: ColumnType<number, number, number>;
  prize_pool: number;
  lobby_duration_ms: number;
  /** Single video that plays end-to-end for the entire show */
  video_url: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

// ---------------------------------------------------------------------------
// show_participants
// ---------------------------------------------------------------------------

export type ParticipantStatus = 'registered' | 'active' | 'eliminated' | 'winner';

export interface ShowParticipantsTable {
  id: PK;
  user_id: string;
  show_id: string;
  status: ColumnType<ParticipantStatus, ParticipantStatus, ParticipantStatus>;
  round_reached: ColumnType<number, number, number>;
  coins_earned: ColumnType<number, number, number>;
  joined_at: CreatedAt;
}

// ---------------------------------------------------------------------------
// coin_transactions
// ---------------------------------------------------------------------------

export type CoinTransactionType =
  | 'iap_purchase'
  | 'show_winnings'
  | 'show_entry_fee'
  | 'bonus_grant'
  | 'refund'
  | 'playclip_reward';

export interface CoinTransactionsTable {
  id: PK;
  user_id: string;
  /** Positive = credit, negative = debit */
  amount: number;
  type: ColumnType<CoinTransactionType, CoinTransactionType, CoinTransactionType>;
  reference_id: string | null;
  /**
   * Idempotency key — unique constraint in DB.
   * Format: `{type}:{referenceId}:{userId}`
   */
  idempotency_key: string;
  balance_after: number;
  created_at: CreatedAt;
}

// ---------------------------------------------------------------------------
// game_definitions
// ---------------------------------------------------------------------------

export type GameType =
  | 'trivia'
  | 'spot_difference'
  | 'quick_math'
  | 'spelling_bee'
  | 'fruit_cutting'
  | 'knife_at_center'
  | 'find_items';

export interface GameDefinitionsTable {
  id: PK;
  game_type: ColumnType<GameType, GameType, GameType>;
  /** Full game config JSONB — encrypted answer fields included */
  config: JSONColumnType<Record<string, unknown>>;
  difficulty: ColumnType<'easy' | 'medium' | 'hard', 'easy' | 'medium' | 'hard', 'easy' | 'medium' | 'hard'>;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

// ---------------------------------------------------------------------------
// play_clips
// ---------------------------------------------------------------------------

export type ClipStatus = 'processing' | 'ready' | 'archived';

export interface PlayClipsTable {
  id: PK;
  show_id: string;
  round_index: number;
  game_type: ColumnType<string, string, string>;
  /** Full game config — stores question, options, correct answer etc. */
  config: JSONColumnType<Record<string, unknown>>;
  media_url: string;
  hls_url: string | null;
  /** Start of this clip within the original show video (ms) */
  clip_start_ms: number;
  /** End of this clip within the original show video (ms) */
  clip_end_ms: number;
  /** Ms from clip start when game overlay should appear */
  game_offset_ms: number;
  status: ColumnType<ClipStatus, ClipStatus, ClipStatus>;
  play_count: ColumnType<number, number, number>;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

// ---------------------------------------------------------------------------
// clip_play_sessions
// ---------------------------------------------------------------------------

export interface ClipPlaySessionsTable {
  id: PK;
  user_id: string;
  clip_id: string;
  /** Server-authoritative Unix ms timestamp when clip was served */
  served_at: number;
  completed_at: Date | null;
  score: number | null;
  /** Client-reported timestamp stored for anti-cheat, never authoritative */
  client_ts: number | null;
  created_at: CreatedAt;
}

// ---------------------------------------------------------------------------
// feature_flags (DB-backed; Redis is the hot cache)
// ---------------------------------------------------------------------------

export interface FeatureFlagsTable {
  id: PK;
  key: string;
  value: string; // JSON-encoded value
  description: string | null;
  updated_at: UpdatedAt;
  updated_by: string | null;
}

// ---------------------------------------------------------------------------
// trivia_questions
// ---------------------------------------------------------------------------

export interface TriviaQuestionsTable {
  id: PK;
  question: string;
  /** JSON array of 4 option strings, e.g. ["Paris","London","Berlin","Madrid"] */
  options: JSONColumnType<string[]>;
  /** 0-3 — the correct index into options. NEVER sent to clients. */
  correct_index: number;
  category: string | null;
  difficulty: ColumnType<number, number, number>;
  is_active: ColumnType<boolean, boolean, boolean>;
  created_at: CreatedAt;
}

// ---------------------------------------------------------------------------
// game_packages
// ---------------------------------------------------------------------------

export interface GameManifestField {
  type: 'string' | 'number' | 'boolean' | 'string[4]';
  label: string;
  min?: number;
  max?: number;
}

export type GameLayout = 'overlay_bottom' | 'fullscreen' | 'overlay_top';

export interface GameManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  layout: GameLayout;
  /** Drives the admin config form automatically */
  configSchema: Record<string, GameManifestField>;
}

export interface GamePackagesTable {
  id: string;                              // user-provided slug, not auto-generated
  name: string;
  version: string;
  description: string | null;
  is_enabled: ColumnType<boolean, boolean, boolean>;
  manifest: JSONColumnType<GameManifest>;
  bundle_url: string;
  thumbnail_url: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

// ---------------------------------------------------------------------------
// coin_reward_rules
// ---------------------------------------------------------------------------

export interface RuleCondition {
  field: string;
  op: 'eq' | 'neq' | 'gte' | 'lte' | 'gt' | 'lt';
  value: string | number | boolean;
}

export interface RuleReward {
  type: 'fixed' | 'multiplier' | 'range';
  amount?: number;
  value?: number;
  min?: number;
  max?: number;
}

export interface CoinRewardRulesTable {
  id: PK;
  name: string;
  description: string;
  trigger: string;
  conditions: JSONColumnType<RuleCondition[]>;
  reward: JSONColumnType<RuleReward>;
  stack_mode: ColumnType<'additive' | 'multiplier' | 'override', 'additive' | 'multiplier' | 'override', 'additive' | 'multiplier' | 'override'>;
  priority: ColumnType<number, number, number>;
  active_from: Date | null;
  active_until: Date | null;
  enabled: ColumnType<boolean, boolean, boolean>;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

// ---------------------------------------------------------------------------
// coin_earn_rates
// ---------------------------------------------------------------------------

export interface CoinEarnRatesTable {
  key: string;
  label: string;
  description: string;
  amount: ColumnType<number, number, number>;
  enabled: ColumnType<boolean, boolean, boolean>;
  updated_at: UpdatedAt;
}

// ---------------------------------------------------------------------------
// Database interface (root type passed to Kysely<DB>)
// ---------------------------------------------------------------------------

export interface DB {
  users: UsersTable;
  refresh_tokens: RefreshTokensTable;
  shows: ShowsTable;
  show_participants: ShowParticipantsTable;
  coin_transactions: CoinTransactionsTable;
  game_definitions: GameDefinitionsTable;
  play_clips: PlayClipsTable;
  clip_play_sessions: ClipPlaySessionsTable;
  feature_flags: FeatureFlagsTable;
  trivia_questions: TriviaQuestionsTable;
  game_packages: GamePackagesTable;
  coin_earn_rates: CoinEarnRatesTable;
  coin_reward_rules: CoinRewardRulesTable;
}
