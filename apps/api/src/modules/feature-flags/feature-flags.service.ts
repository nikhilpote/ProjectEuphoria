/**
 * FeatureFlagsService — Redis-backed remote config.
 *
 * Architecture:
 * - Redis is the hot cache (sub-millisecond reads)
 * - PostgreSQL is the source of truth
 * - On cache miss, falls back to DB and re-warms the cache
 * - TTL: 60 seconds (configurable). Short enough for LiveOps agility.
 *
 * Redis key pattern: `ff:{key}`
 */

import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kysely } from 'kysely';
import Redis from 'ioredis';
import { DB } from '../../database/schema';
import { KYSELY_TOKEN } from '../../database/database.module';
import { REDIS_CLIENT } from '../../database/redis.module';
import type { FeatureFlag, FeatureFlagsMap } from '@euphoria/types';

const CACHE_TTL_SECONDS = 60;

@Injectable()
export class FeatureFlagsService {
  private readonly logger = new Logger(FeatureFlagsService.name);
  private readonly prefix: string;

  constructor(
    @Inject(KYSELY_TOKEN) private readonly db: Kysely<DB>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    configService: ConfigService,
  ) {
    this.prefix = configService.get<string>('FEATURE_FLAGS_REDIS_PREFIX', 'ff:');
  }

  /** Get a single flag value. Falls back to `defaultValue` if not set. */
  async get<T extends boolean | string | number>(
    key: string,
    defaultValue: T,
  ): Promise<T> {
    const redisKey = this.prefix + key;

    try {
      const cached = await this.redis.get(redisKey);
      if (cached !== null) {
        return JSON.parse(cached) as T;
      }
    } catch (err) {
      this.logger.warn(`Redis read failed for flag "${key}": ${String(err)}`);
    }

    // DB fallback
    const row = await this.db
      .selectFrom('feature_flags')
      .select(['value'])
      .where('key', '=', key)
      .executeTakeFirst();

    if (!row) {
      return defaultValue;
    }

    const value = JSON.parse(row.value) as T;

    // Re-warm cache
    try {
      await this.redis.setex(redisKey, CACHE_TTL_SECONDS, row.value);
    } catch (err) {
      this.logger.warn(`Redis write failed for flag "${key}": ${String(err)}`);
    }

    return value;
  }

  /** Get all flags as a flat map. Pass a key allowlist to restrict output. */
  async getAll(keys?: string[]): Promise<FeatureFlagsMap> {
    let query = this.db.selectFrom('feature_flags').select(['key', 'value']);

    if (keys && keys.length > 0) {
      query = query.where('key', 'in', keys);
    }

    const rows = await query.execute();

    return Object.fromEntries(
      rows.map((r) => [r.key, JSON.parse(r.value) as boolean | string | number]),
    );
  }

  /** Get all flags as a full array with metadata (admin use). */
  async getAllFull(): Promise<FeatureFlag[]> {
    const rows = await this.db
      .selectFrom('feature_flags')
      .selectAll()
      .orderBy('key', 'asc')
      .execute();

    return rows.map((r) => ({
      key: r.key,
      value: JSON.parse(r.value) as boolean | string | number,
      description: r.description ?? undefined,
      updatedAt: r.updated_at.toISOString(),
    }));
  }

  /** Get a single flag as a FeatureFlag shape (includes metadata). */
  async getOne(key: string): Promise<FeatureFlag | null> {
    const row = await this.db
      .selectFrom('feature_flags')
      .selectAll()
      .where('key', '=', key)
      .executeTakeFirst();

    if (!row) return null;

    return {
      key: row.key,
      value: JSON.parse(row.value) as boolean | string | number,
      description: row.description ?? undefined,
      updatedAt: row.updated_at.toISOString(),
    };
  }

  /** Set a flag (upsert). Invalidates Redis cache immediately. */
  async set(
    key: string,
    value: boolean | string | number,
    updatedBy?: string,
    description?: string,
  ): Promise<FeatureFlag> {
    const jsonValue = JSON.stringify(value);

    const row = await this.db
      .insertInto('feature_flags')
      .values({
        key,
        value: jsonValue,
        description: description ?? null,
        updated_by: updatedBy ?? null,
      })
      .onConflict((oc) =>
        oc.column('key').doUpdateSet({
          value: jsonValue,
          description: description ?? null,
          updated_by: updatedBy ?? null,
          updated_at: new Date(),
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();

    // Invalidate cache — next read will re-warm
    try {
      await this.redis.del(this.prefix + key);
    } catch (err) {
      this.logger.warn(`Redis invalidation failed for flag "${key}": ${String(err)}`);
    }

    return {
      key: row.key,
      value,
      description: row.description ?? undefined,
      updatedAt: row.updated_at.toISOString(),
    };
  }

  /** Typed convenience accessors — fall back to defaultValue if flag is absent or wrong type. */

  async getBool(key: string, defaultValue: boolean): Promise<boolean> {
    const raw = await this.get<boolean | string | number>(key, defaultValue);
    if (typeof raw === 'boolean') return raw;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return defaultValue;
  }

  async getNumber(key: string, defaultValue: number): Promise<number> {
    const raw = await this.get<boolean | string | number>(key, defaultValue);
    const n = Number(raw);
    return Number.isFinite(n) ? n : defaultValue;
  }

  async getString(key: string, defaultValue: string): Promise<string> {
    const raw = await this.get<boolean | string | number>(key, defaultValue);
    return raw !== null && raw !== undefined ? String(raw) : defaultValue;
  }

  /** Delete a flag. */
  async delete(key: string): Promise<void> {
    await this.db
      .deleteFrom('feature_flags')
      .where('key', '=', key)
      .execute();

    try {
      await this.redis.del(this.prefix + key);
    } catch (err) {
      this.logger.warn(`Redis del failed for flag "${key}": ${String(err)}`);
    }
  }
}
