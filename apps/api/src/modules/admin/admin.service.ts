import { Injectable, Inject } from '@nestjs/common';
import { Kysely } from 'kysely';
import { DB } from '../../database/schema';
import { KYSELY_TOKEN } from '../../database/database.module';
import { ShowService } from '../show/show.service';
import { ShowOrchestrator } from '../show/show.orchestrator';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import type {
  AdminStatsResponse,
  ShowSummary,
  CreateShowPayload,
  FeatureFlag,
} from '@euphoria/types';

@Injectable()
export class AdminService {
  constructor(
    @Inject(KYSELY_TOKEN) private readonly db: Kysely<DB>,
    private readonly showService: ShowService,
    private readonly showOrchestrator: ShowOrchestrator,
    private readonly featureFlagsService: FeatureFlagsService,
  ) {}

  async getStats(): Promise<AdminStatsResponse> {
    const [userCount, activeShows, coinStats] = await Promise.all([
      this.db
        .selectFrom('users')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow(),
      this.db
        .selectFrom('shows')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .where('status', 'in', ['lobby', 'live'])
        .executeTakeFirstOrThrow(),
      this.db
        .selectFrom('users')
        .select((eb) => eb.fn.sum<number>('coin_balance').as('total'))
        .executeTakeFirstOrThrow(),
    ]);

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const showsThisWeek = await this.db
      .selectFrom('shows')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('created_at', '>=', oneWeekAgo)
      .executeTakeFirstOrThrow();

    return {
      totalUsers: Number(userCount.count),
      activeShows: Number(activeShows.count),
      totalCoinsInCirculation: Number(coinStats.total ?? 0),
      showsThisWeek: Number(showsThisWeek.count),
    };
  }

  async createShow(payload: CreateShowPayload): Promise<ShowSummary> {
    return this.showService.create(payload);
  }

  async startShow(showId: string): Promise<void> {
    await this.showOrchestrator.startShow(showId);
  }

  async setFeatureFlag(
    key: string,
    value: boolean | string | number,
    updatedBy: string,
    description?: string,
  ): Promise<FeatureFlag> {
    return this.featureFlagsService.set(key, value, updatedBy, description);
  }

  async deleteFeatureFlag(key: string): Promise<void> {
    return this.featureFlagsService.delete(key);
  }
}
