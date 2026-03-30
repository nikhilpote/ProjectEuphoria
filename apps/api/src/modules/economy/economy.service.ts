import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { WalletRepository } from './wallet.repository';
import { EarnRatesRepository } from './earn-rates.repository';
import { RewardRulesRepository } from './reward-rules.repository';
import { RewardEngineService } from './reward-engine.service';
import type {
  CreditCoinsPayload,
  DebitCoinsPayload,
  CoinTransaction,
  WalletBalance,
  IAPReceiptValidationRequest,
  EarnRate,
  RewardRule,
  RewardContext,
  RewardPreviewResult,
} from '@euphoria/types';
import type { BatchCreditEntry } from './wallet.repository';

@Injectable()
export class EconomyService {
  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly earnRatesRepository: EarnRatesRepository,
    private readonly rewardRulesRepository: RewardRulesRepository,
    private readonly rewardEngineService: RewardEngineService,
  ) {}

  async getBalance(userId: string): Promise<WalletBalance> {
    const result = await this.walletRepository.getBalance(userId);
    return { userId, ...result };
  }

  async credit(payload: CreditCoinsPayload): Promise<CoinTransaction> {
    if (payload.amount <= 0) {
      throw new BadRequestException('Credit amount must be positive');
    }
    this.validateIdempotencyKey(payload.idempotencyKey);
    return this.walletRepository.credit(payload);
  }

  async debit(payload: DebitCoinsPayload): Promise<CoinTransaction> {
    if (payload.amount <= 0) {
      throw new BadRequestException('Debit amount must be positive');
    }
    this.validateIdempotencyKey(payload.idempotencyKey);
    return this.walletRepository.debit(payload);
  }

  async getTransactionHistory(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ transactions: CoinTransaction[]; page: number; limit: number }> {
    const offset = (page - 1) * limit;
    const transactions = await this.walletRepository.getTransactionHistory(
      userId,
      limit,
      offset,
    );
    return { transactions, page, limit };
  }

  /**
   * IAP receipt validation — validates server-to-server, then credits coins.
   * CONSTRAINT: IAP receipt validation is always server-to-server.
   * Never trust client-reported purchase completion.
   */
  async validateIAPAndCredit(
    _request: IAPReceiptValidationRequest,
  ): Promise<CoinTransaction> {
    // TODO: Implement Apple/Google server-to-server IAP validation.
    // Apple: POST to https://buy.itunes.apple.com/verifyReceipt
    // Google: Use googleapis PlayDeveloper.purchases.products.get
    // After validation, issue coins with idempotency key:
    //   `iap_purchase:{receiptHash}:{userId}`
    throw new Error('IAP validation not yet implemented');
  }

  /**
   * Award coins to multiple users in a single bulk DB operation.
   * Replaces N individual `awardCoins` calls in the show orchestrator with one
   * batched write, reducing DB round-trips from O(n) to O(1).
   * Idempotent: duplicate entries (same referenceId+userId) are silently skipped.
   */
  async awardCoinsBatch(
    userIds: string[],
    amount: number,
    referenceId: string,
  ): Promise<void> {
    if (userIds.length === 0) return;
    const entries: BatchCreditEntry[] = userIds.map((userId) => ({
      userId,
      amount,
      idempotencyKey: `show_winnings:${referenceId}:${userId}`,
      referenceId,
    }));
    await this.walletRepository.creditBatch('show_winnings' as const, amount, entries);
  }

  /**
   * Build an idempotency key per the canonical pattern:
   * `{type}:{referenceId}:{userId}`
   */
  static buildIdempotencyKey(
    type: string,
    referenceId: string,
    userId: string,
  ): string {
    return `${type}:${referenceId}:${userId}`;
  }

  /**
   * Award coins to a user. Used by the show orchestrator for consolation and
   * winner prizes. The referenceId encodes the show context (e.g. showId:winner
   * or showId:eliminated:roundIndex). The idempotency key follows the canonical
   * pattern so duplicate calls are safely de-duped.
   */
  async awardCoins(
    userId: string,
    amount: number,
    referenceId: string,
  ): Promise<void> {
    const idempotencyKey = `show_winnings:${referenceId}:${userId}`;
    await this.walletRepository.credit({
      userId,
      amount,
      type: 'show_winnings',
      referenceId,
      idempotencyKey,
    });
  }

  // ---------------------------------------------------------------------------
  // Earn rates (legacy — kept for backward compatibility)
  // ---------------------------------------------------------------------------

  async getEarnRates(): Promise<EarnRate[]> {
    return this.earnRatesRepository.findAll();
  }

  async updateEarnRate(key: string, patch: { amount?: number; enabled?: boolean }): Promise<EarnRate> {
    const existing = await this.earnRatesRepository.findByKey(key);
    if (!existing) throw new NotFoundException(`Earn rate '${key}' not found`);
    return this.earnRatesRepository.update(key, patch);
  }

  // ---------------------------------------------------------------------------
  // Reward rules CRUD
  // ---------------------------------------------------------------------------

  async getRules(): Promise<RewardRule[]> {
    return this.rewardRulesRepository.findAll();
  }

  async createRule(input: Omit<RewardRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<RewardRule> {
    return this.rewardRulesRepository.create(input);
  }

  async updateRule(id: string, patch: Partial<Omit<RewardRule, 'id' | 'createdAt' | 'updatedAt'>>): Promise<RewardRule> {
    const existing = await this.rewardRulesRepository.findById(id);
    if (!existing) throw new NotFoundException(`Rule ${id} not found`);
    return this.rewardRulesRepository.update(id, patch);
  }

  async deleteRule(id: string): Promise<void> {
    return this.rewardRulesRepository.delete(id);
  }

  async previewReward(ctx: RewardContext): Promise<RewardPreviewResult> {
    return this.rewardEngineService.preview(ctx);
  }

  // ---------------------------------------------------------------------------
  // PlayClip reward
  // ---------------------------------------------------------------------------

  /**
   * Award coins after a PlayClip session completes.
   * Uses the reward rules engine to evaluate all matching rules for the
   * given context. Idempotent — safe to call multiple times for same session.
   */
  async awardPlayClipCoins(
    userId: string,
    sessionId: string,
    correct: boolean,
    score: number,
    gameType: string,
  ): Promise<void> {
    if (!correct) return;

    const ctx: RewardContext = {
      trigger: 'playclip.correct',
      userId,
      gameType,
      score,
      streakDays: 0,      // TODO: wire streak system
      isFirstPlay: false, // TODO: check first play
    };

    const coins = await this.rewardEngineService.evaluate(ctx);
    if (coins <= 0) return;

    await this.walletRepository.credit({
      userId,
      amount: coins,
      type: 'playclip_reward',
      referenceId: sessionId,
      idempotencyKey: `playclip_reward:${sessionId}:${userId}`,
    });
  }

  private validateIdempotencyKey(key: string): void {
    // Key must match pattern: segments separated by colons, min 2 colons
    const parts = key.split(':');
    if (parts.length < 3) {
      throw new BadRequestException(
        'idempotencyKey must follow pattern: {type}:{referenceId}:{userId}',
      );
    }
  }
}
