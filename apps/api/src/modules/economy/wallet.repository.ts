/**
 * WalletRepository — all wallet mutations run inside a transaction with
 * SELECT ... FOR UPDATE on the user row to prevent double-spend.
 *
 * CONSTRAINT: Every mutation requires an idempotency_key.
 * On conflict (duplicate key), we return the existing transaction record —
 * never create a duplicate debit or credit.
 */

import { Injectable, Inject, ConflictException } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { DB, CoinTransactionType } from '../../database/schema';
import { KYSELY_TOKEN } from '../../database/database.module';
import type { CreditCoinsPayload, DebitCoinsPayload, CoinTransaction } from '@euphoria/types';

export interface BatchCreditEntry {
  userId: string;
  amount: number;
  idempotencyKey: string;
  referenceId: string | null;
}

@Injectable()
export class WalletRepository {
  constructor(
    @Inject(KYSELY_TOKEN)
    private readonly db: Kysely<DB>,
  ) {}

  /**
   * Credit coins to a user's wallet.
   * Runs in a serialized transaction with FOR UPDATE row lock.
   * Returns the existing transaction if idempotency_key already used.
   */
  async credit(payload: CreditCoinsPayload): Promise<CoinTransaction> {
    return this.db.transaction().execute(async (trx) => {
      // Idempotency check — return existing if already processed
      const existing = await trx
        .selectFrom('coin_transactions')
        .selectAll()
        .where('idempotency_key', '=', payload.idempotencyKey)
        .executeTakeFirst();

      if (existing) {
        return this.toDto(existing);
      }

      // Lock the user row — prevents concurrent wallet mutations
      const user = await trx
        .selectFrom('users')
        .select(['id', 'coin_balance'])
        .where('id', '=', payload.userId)
        .forUpdate()
        .executeTakeFirstOrThrow();

      const newBalance = user.coin_balance + payload.amount;

      // Update balance
      await trx
        .updateTable('users')
        .set({ coin_balance: newBalance, updated_at: new Date() })
        .where('id', '=', payload.userId)
        .execute();

      // Record transaction
      const txn = await trx
        .insertInto('coin_transactions')
        .values({
          user_id: payload.userId,
          amount: payload.amount,
          type: payload.type,
          reference_id: payload.referenceId ?? null,
          idempotency_key: payload.idempotencyKey,
          balance_after: newBalance,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return this.toDto(txn);
    });
  }

  /**
   * Debit coins from a user's wallet.
   * Throws ConflictException if insufficient balance.
   * Runs in a serialized transaction with FOR UPDATE row lock.
   * Returns the existing transaction if idempotency_key already used.
   */
  async debit(payload: DebitCoinsPayload): Promise<CoinTransaction> {
    return this.db.transaction().execute(async (trx) => {
      // Idempotency check
      const existing = await trx
        .selectFrom('coin_transactions')
        .selectAll()
        .where('idempotency_key', '=', payload.idempotencyKey)
        .executeTakeFirst();

      if (existing) {
        return this.toDto(existing);
      }

      // Lock user row
      const user = await trx
        .selectFrom('users')
        .select(['id', 'coin_balance'])
        .where('id', '=', payload.userId)
        .forUpdate()
        .executeTakeFirstOrThrow();

      if (user.coin_balance < payload.amount) {
        throw new ConflictException(
          `Insufficient balance: have ${user.coin_balance}, need ${payload.amount}`,
        );
      }

      const newBalance = user.coin_balance - payload.amount;

      await trx
        .updateTable('users')
        .set({ coin_balance: newBalance, updated_at: new Date() })
        .where('id', '=', payload.userId)
        .execute();

      const txn = await trx
        .insertInto('coin_transactions')
        .values({
          user_id: payload.userId,
          amount: -payload.amount, // stored as negative for debits
          type: payload.type,
          reference_id: payload.referenceId ?? null,
          idempotency_key: payload.idempotencyKey,
          balance_after: newBalance,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return this.toDto(txn);
    });
  }

  /**
   * Batch credit coins to multiple users in a single DB round-trip.
   * Uses ON CONFLICT (idempotency_key) DO NOTHING so duplicate calls are safe.
   * After inserting, updates coin_balance only for the users whose transaction
   * was actually inserted (not skipped as a duplicate).
   *
   * NOTE: This method does NOT use per-row FOR UPDATE locking. It is intended
   * only for append-only award paths (show_winnings) where over-crediting is
   * preferable to a deadlock under spike load. Standard credit/debit still uses
   * the locked single-row transaction.
   */
  async creditBatch(type: CoinTransactionType, amount: number, entries: BatchCreditEntry[]): Promise<void> {
    if (entries.length === 0) return;

    await this.db.transaction().execute(async (trx) => {
      // Bulk insert — rows already seen (same idempotency_key) are silently skipped.
      // returning('idempotency_key') lets us know which rows were actually inserted.
      const inserted = await trx
        .insertInto('coin_transactions')
        .values(
          entries.map((e) => ({
            user_id: e.userId,
            amount,
            type,
            reference_id: e.referenceId,
            idempotency_key: e.idempotencyKey,
            // balance_after is approximate in batch mode — accurate per-user
            // balance requires a FOR UPDATE round-trip we deliberately skip here.
            balance_after: 0,
          })),
        )
        .onConflict((oc) => oc.column('idempotency_key').doNothing())
        .returning('idempotency_key')
        .execute();

      if (inserted.length === 0) return;

      const insertedKeys = new Set(inserted.map((r) => r.idempotency_key));
      const insertedUserIds = entries
        .filter((e) => insertedKeys.has(e.idempotencyKey))
        .map((e) => e.userId);

      if (insertedUserIds.length === 0) return;

      // Single UPDATE to increment balance for all users whose row was inserted.
      await trx
        .updateTable('users')
        .set((eb) => ({
          coin_balance: eb('coin_balance', '+', amount),
          updated_at: new Date(),
        }))
        .where('id', 'in', insertedUserIds)
        .execute();
    });
  }

  async getBalance(userId: string): Promise<{ balance: number; updatedAt: string }> {
    const user = await this.db
      .selectFrom('users')
      .select(['coin_balance', 'updated_at'])
      .where('id', '=', userId)
      .executeTakeFirstOrThrow();

    return {
      balance: user.coin_balance,
      updatedAt: user.updated_at.toISOString(),
    };
  }

  async getTransactionHistory(
    userId: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<CoinTransaction[]> {
    const rows = await this.db
      .selectFrom('coin_transactions')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    return rows.map((r) => this.toDto(r));
  }

  private toDto(row: {
    id: string;
    user_id: string;
    amount: number;
    type: string;
    reference_id: string | null;
    idempotency_key: string;
    balance_after: number;
    created_at: Date;
  }): CoinTransaction {
    return {
      id: row.id,
      userId: row.user_id,
      amount: row.amount,
      type: row.type as CoinTransaction['type'],
      referenceId: row.reference_id,
      idempotencyKey: row.idempotency_key,
      balanceAfter: row.balance_after,
      createdAt: row.created_at.toISOString(),
    };
  }
}
