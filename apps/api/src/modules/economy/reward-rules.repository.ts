import { Injectable, Inject } from '@nestjs/common';
import { Kysely } from 'kysely';
import { DB } from '../../database/schema';
import { KYSELY_TOKEN } from '../../database/database.module';
import type { RewardRule, RuleCondition, RuleReward } from '@euphoria/types';

@Injectable()
export class RewardRulesRepository {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Kysely<DB>) {}

  async findAll(): Promise<RewardRule[]> {
    const rows = await this.db
      .selectFrom('coin_reward_rules')
      .selectAll()
      .orderBy('priority', 'asc')
      .execute();
    return rows.map(this.toDto);
  }

  async findByTrigger(trigger: string): Promise<RewardRule[]> {
    const rows = await this.db
      .selectFrom('coin_reward_rules')
      .selectAll()
      .where('trigger', '=', trigger)
      .where('enabled', '=', true)
      .orderBy('priority', 'asc')
      .execute();
    return rows.map(this.toDto);
  }

  async findById(id: string): Promise<RewardRule | undefined> {
    const row = await this.db
      .selectFrom('coin_reward_rules')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? this.toDto(row) : undefined;
  }

  async create(input: Omit<RewardRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<RewardRule> {
    const row = await this.db
      .insertInto('coin_reward_rules')
      .values({
        name: input.name,
        description: input.description,
        trigger: input.trigger,
        conditions: JSON.stringify(input.conditions) as never,
        reward: JSON.stringify(input.reward) as never,
        stack_mode: input.stackMode,
        priority: input.priority,
        active_from: input.activeFrom ? new Date(input.activeFrom) : null,
        active_until: input.activeUntil ? new Date(input.activeUntil) : null,
        enabled: input.enabled,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.toDto(row);
  }

  async update(id: string, patch: Partial<Omit<RewardRule, 'id' | 'createdAt' | 'updatedAt'>>): Promise<RewardRule> {
    const setValue: Record<string, unknown> = { updated_at: new Date() };
    if (patch.name !== undefined) setValue.name = patch.name;
    if (patch.description !== undefined) setValue.description = patch.description;
    if (patch.trigger !== undefined) setValue.trigger = patch.trigger;
    if (patch.conditions !== undefined) setValue.conditions = JSON.stringify(patch.conditions);
    if (patch.reward !== undefined) setValue.reward = JSON.stringify(patch.reward);
    if (patch.stackMode !== undefined) setValue.stack_mode = patch.stackMode;
    if (patch.priority !== undefined) setValue.priority = patch.priority;
    if (patch.activeFrom !== undefined) setValue.active_from = patch.activeFrom ? new Date(patch.activeFrom) : null;
    if (patch.activeUntil !== undefined) setValue.active_until = patch.activeUntil ? new Date(patch.activeUntil) : null;
    if (patch.enabled !== undefined) setValue.enabled = patch.enabled;

    const row = await this.db
      .updateTable('coin_reward_rules')
      .set(setValue as never)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.toDto(row);
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom('coin_reward_rules').where('id', '=', id).execute();
  }

  private toDto(row: {
    id: string; name: string; description: string; trigger: string;
    conditions: unknown; reward: unknown; stack_mode: string;
    priority: number; active_from: Date | null; active_until: Date | null;
    enabled: boolean; created_at: Date; updated_at: Date;
  }): RewardRule {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      trigger: row.trigger,
      conditions: (typeof row.conditions === 'string' ? JSON.parse(row.conditions) : row.conditions) as RuleCondition[],
      reward: (typeof row.reward === 'string' ? JSON.parse(row.reward) : row.reward) as RuleReward,
      stackMode: row.stack_mode as RewardRule['stackMode'],
      priority: row.priority,
      activeFrom: row.active_from?.toISOString() ?? null,
      activeUntil: row.active_until?.toISOString() ?? null,
      enabled: row.enabled,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
