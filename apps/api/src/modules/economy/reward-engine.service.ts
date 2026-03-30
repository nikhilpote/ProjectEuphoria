import { Injectable } from '@nestjs/common';
import { RewardRulesRepository } from './reward-rules.repository';
import type { RewardRule, RewardContext, RewardPreviewResult, RuleCondition } from '@euphoria/types';

@Injectable()
export class RewardEngineService {
  constructor(private readonly rulesRepository: RewardRulesRepository) {}

  /**
   * Evaluate all active rules for the given context and return total coins to award.
   * Evaluation order:
   *   1. Filter: trigger match, enabled, within active_from/until window, all conditions pass
   *   2. Separate into additive / multiplier / override buckets
   *   3. If any override rules match -> return highest-priority override amount
   *   4. Otherwise: sum additive, then apply each multiplier in priority order
   */
  async evaluate(ctx: RewardContext): Promise<number> {
    const rules = await this.rulesRepository.findByTrigger(ctx.trigger);
    const active = this.filterActive(rules, ctx);
    return this.compute(active);
  }

  /** Same as evaluate but returns matched rules + breakdown string for the admin preview */
  async preview(ctx: RewardContext): Promise<RewardPreviewResult> {
    const rules = await this.rulesRepository.findByTrigger(ctx.trigger);
    const active = this.filterActive(rules, ctx);
    return this.buildPreview(active);
  }

  private filterActive(rules: RewardRule[], ctx: RewardContext): RewardRule[] {
    const now = new Date();
    return rules.filter((r) => {
      if (r.activeFrom && new Date(r.activeFrom) > now) return false;
      if (r.activeUntil && new Date(r.activeUntil) < now) return false;
      return this.matchesConditions(r.conditions, ctx);
    });
  }

  private matchesConditions(conditions: RuleCondition[], ctx: RewardContext): boolean {
    return conditions.every((c) => this.matchesCondition(c, ctx));
  }

  private matchesCondition(c: RuleCondition, ctx: RewardContext): boolean {
    const raw = (ctx as unknown as Record<string, unknown>)[c.field];
    const fieldVal = raw ?? null;
    const condVal = c.value;

    switch (c.op) {
      case 'eq':  return String(fieldVal) === String(condVal);
      case 'neq': return String(fieldVal) !== String(condVal);
      case 'gte': return Number(fieldVal) >= Number(condVal);
      case 'lte': return Number(fieldVal) <= Number(condVal);
      case 'gt':  return Number(fieldVal) >  Number(condVal);
      case 'lt':  return Number(fieldVal) <  Number(condVal);
      default:    return false;
    }
  }

  private compute(active: RewardRule[]): number {
    const overrides   = active.filter((r) => r.stackMode === 'override');
    const additives   = active.filter((r) => r.stackMode === 'additive');
    const multipliers = active.filter((r) => r.stackMode === 'multiplier');

    if (overrides.length > 0) {
      return this.rewardAmount(overrides[0].reward);
    }

    let base = additives.reduce((sum, r) => sum + this.rewardAmount(r.reward), 0);
    for (const r of multipliers) {
      base = Math.round(base * (r.reward.value ?? 1));
    }
    return Math.max(0, base);
  }

  private rewardAmount(reward: RewardRule['reward']): number {
    if (reward.type === 'fixed')      return reward.amount ?? 0;
    if (reward.type === 'multiplier') return 0; // handled separately
    if (reward.type === 'range') {
      const min = reward.min ?? 0;
      const max = reward.max ?? min;
      return Math.round(min + Math.random() * (max - min));
    }
    return 0;
  }

  private buildPreview(active: RewardRule[]): RewardPreviewResult {
    const overrides   = active.filter((r) => r.stackMode === 'override');
    const additives   = active.filter((r) => r.stackMode === 'additive');
    const multipliers = active.filter((r) => r.stackMode === 'multiplier');

    const matchedRules: RewardPreviewResult['matchedRules'] = [];

    if (overrides.length > 0) {
      const r = overrides[0];
      const coins = this.rewardAmount(r.reward);
      matchedRules.push({ rule: r, contribution: `=${coins}` });
      return { totalCoins: coins, matchedRules, breakdown: `${coins} (override)` };
    }

    let base = 0;
    const additiveParts: string[] = [];
    for (const r of additives) {
      const amt = this.rewardAmount(r.reward);
      base += amt;
      additiveParts.push(`${amt}`);
      matchedRules.push({ rule: r, contribution: `+${amt}` });
    }

    let total = base;
    const multiplierParts: string[] = [];
    for (const r of multipliers) {
      const mult = r.reward.value ?? 1;
      total = Math.round(total * mult);
      multiplierParts.push(`x${mult}`);
      matchedRules.push({ rule: r, contribution: `x${mult}` });
    }

    const addStr  = additiveParts.length > 1 ? `(${additiveParts.join(' + ')})` : (additiveParts[0] ?? '0');
    const multStr = multiplierParts.join(' ');
    const breakdown = multiplierParts.length > 0
      ? `${addStr} ${multStr} = ${total}`
      : `${addStr} = ${total}`;

    return { totalCoins: total, matchedRules, breakdown };
  }
}
