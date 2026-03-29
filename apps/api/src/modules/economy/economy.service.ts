import { Injectable, BadRequestException } from '@nestjs/common';
import { WalletRepository } from './wallet.repository';
import type {
  CreditCoinsPayload,
  DebitCoinsPayload,
  CoinTransaction,
  WalletBalance,
  IAPReceiptValidationRequest,
} from '@euphoria/types';
import type { BatchCreditEntry } from './wallet.repository';

@Injectable()
export class EconomyService {
  constructor(private readonly walletRepository: WalletRepository) {}

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
