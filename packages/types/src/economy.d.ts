/**
 * Coin economy / wallet types
 *
 * CONSTRAINT: All wallet mutations require an idempotency key.
 * Pattern: `{type}:{referenceId}:{userId}`
 * Double-processing returns the existing transaction — never a duplicate.
 */
export type CoinTransactionType = 'iap_purchase' | 'show_winnings' | 'show_entry_fee' | 'bonus_grant' | 'refund';
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
//# sourceMappingURL=economy.d.ts.map