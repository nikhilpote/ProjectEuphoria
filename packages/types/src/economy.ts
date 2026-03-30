/**
 * Coin economy / wallet types
 *
 * CONSTRAINT: All wallet mutations require an idempotency key.
 * Pattern: `{type}:{referenceId}:{userId}`
 * Double-processing returns the existing transaction — never a duplicate.
 */

export type CoinTransactionType =
  | 'iap_purchase' // in-app purchase credit
  | 'show_winnings' // prize from show
  | 'show_entry_fee' // debit to enter show
  | 'bonus_grant' // admin bonus
  | 'refund' // refund of entry fee or IAP
  | 'playclip_reward'; // earned by playing a PlayClip

export interface EarnRate {
  key: string;
  label: string;
  description: string;
  amount: number;
  enabled: boolean;
  updatedAt: string;
}

export interface CoinTransaction {
  id: string;
  userId: string;
  /** Positive = credit, negative = debit */
  amount: number;
  type: CoinTransactionType;
  /** External reference: showId, iapReceiptId, etc. */
  referenceId: string | null;
  /**
   * Idempotency key — format: `{type}:{referenceId}:{userId}`
   * Unique constraint in DB. Insert-ignore on conflict.
   */
  idempotencyKey: string;
  balanceAfter: number;
  createdAt: string;
}

export interface WalletBalance {
  userId: string;
  balance: number;
  /** Server timestamp of last mutation */
  updatedAt: string;
}

export interface CreditCoinsPayload {
  userId: string;
  amount: number;
  type: CoinTransactionType;
  referenceId?: string;
  idempotencyKey: string;
}

export interface DebitCoinsPayload {
  userId: string;
  amount: number;
  type: CoinTransactionType;
  referenceId?: string;
  idempotencyKey: string;
}

export interface IAPReceiptValidationRequest {
  userId: string;
  platform: 'ios' | 'android';
  /** Raw receipt data or purchase token — validated server-to-server */
  receiptData: string;
  productId: string;
}

export interface IAPProduct {
  id: string;
  platform: 'ios' | 'android';
  productId: string;
  coinAmount: number;
  priceUsd: number;
}

// ---------------------------------------------------------------------------
// Reward rules engine
// ---------------------------------------------------------------------------

export interface RuleCondition {
  field: string;
  op: 'eq' | 'neq' | 'gte' | 'lte' | 'gt' | 'lt';
  value: string | number | boolean;
}

export interface RuleReward {
  type: 'fixed' | 'multiplier' | 'range';
  amount?: number;    // for 'fixed'
  value?: number;     // for 'multiplier' (e.g. 1.5 = 1.5x)
  min?: number;       // for 'range'
  max?: number;       // for 'range'
}

export interface RewardRule {
  id: string;
  name: string;
  description: string;
  trigger: string;
  conditions: RuleCondition[];
  reward: RuleReward;
  stackMode: 'additive' | 'multiplier' | 'override';
  priority: number;
  activeFrom: string | null;
  activeUntil: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RewardContext {
  trigger: string;
  userId: string;
  gameType?: string;
  score?: number;
  streakDays?: number;
  isFirstPlay?: boolean;
  showPlayerCount?: number;
  roundIndex?: number;
}

export interface RewardPreviewResult {
  totalCoins: number;
  matchedRules: Array<{
    rule: RewardRule;
    contribution: string;  // e.g. '+10' or '×1.5'
  }>;
  breakdown: string;  // e.g. '(10 + 15 + 5) × 1.5 = 45'
}
