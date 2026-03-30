import { Injectable, Inject } from '@nestjs/common';
import { Kysely } from 'kysely';
import { DB } from '../../database/schema';
import { KYSELY_TOKEN } from '../../database/database.module';
import type { EarnRate } from '@euphoria/types';

@Injectable()
export class EarnRatesRepository {
  constructor(
    @Inject(KYSELY_TOKEN)
    private readonly db: Kysely<DB>,
  ) {}

  async findAll(): Promise<EarnRate[]> {
    const rows = await this.db
      .selectFrom('coin_earn_rates')
      .selectAll()
      .orderBy('key', 'asc')
      .execute();

    return rows.map(this.toDto);
  }

  async findByKey(key: string): Promise<EarnRate | undefined> {
    const row = await this.db
      .selectFrom('coin_earn_rates')
      .selectAll()
      .where('key', '=', key)
      .executeTakeFirst();

    return row ? this.toDto(row) : undefined;
  }

  async update(key: string, patch: { amount?: number; enabled?: boolean }): Promise<EarnRate> {
    const row = await this.db
      .updateTable('coin_earn_rates')
      .set({ ...patch, updated_at: new Date() })
      .where('key', '=', key)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.toDto(row);
  }

  private toDto(row: {
    key: string;
    label: string;
    description: string;
    amount: number;
    enabled: boolean;
    updated_at: Date;
  }): EarnRate {
    return {
      key: row.key,
      label: row.label,
      description: row.description,
      amount: row.amount,
      enabled: row.enabled,
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
