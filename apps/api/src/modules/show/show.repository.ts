import { Injectable, Inject } from '@nestjs/common';
import { Kysely } from 'kysely';
import { DB, ShowStatus } from '../../database/schema';
import { KYSELY_TOKEN } from '../../database/database.module';
import type { ShowSummary, CreateShowPayload, ShowParticipant } from '@euphoria/types';

@Injectable()
export class ShowRepository {
  constructor(
    @Inject(KYSELY_TOKEN)
    private readonly db: Kysely<DB>,
  ) {}

  async findById(id: string) {
    return this.db
      .selectFrom('shows')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async findUpcoming(limit: number = 20): Promise<ShowSummary[]> {
    const rows = await this.db
      .selectFrom('shows')
      .selectAll()
      .where('status', 'in', ['scheduled', 'lobby'])
      .orderBy('scheduled_at', 'asc')
      .limit(limit)
      .execute();

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      scheduledAt: r.scheduled_at.toISOString(),
      status: r.status,
      playerCount: r.player_count,
      prizePool: r.prize_pool,
      roundCount: (r.game_sequence as { roundIndex: number }[]).length,
      lobbyDurationMs: r.lobby_duration_ms,
    }));
  }

  async create(payload: CreateShowPayload) {
    return this.db
      .insertInto('shows')
      .values({
        title: payload.title,
        scheduled_at: new Date(payload.scheduledAt),
        game_sequence: JSON.stringify(payload.gameSequence) as unknown as string,
        prize_pool: payload.prizePool,
        player_count: 0,
        status: 'scheduled' as const,
        lobby_duration_ms: payload.lobbyDurationMs ?? 60000,
        video_url: payload.videoUrl ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async update(id: string, payload: { title?: string; scheduledAt?: string; gameSequence?: unknown[]; lobbyDurationMs?: number; videoUrl?: string | null }) {
    return this.db
      .updateTable('shows')
      .set({
        ...(payload.title !== undefined ? { title: payload.title } : {}),
        ...(payload.scheduledAt !== undefined ? { scheduled_at: new Date(payload.scheduledAt) } : {}),
        ...(payload.gameSequence !== undefined ? { game_sequence: JSON.stringify(payload.gameSequence) as unknown as string } : {}),
        ...(payload.lobbyDurationMs !== undefined ? { lobby_duration_ms: payload.lobbyDurationMs } : {}),
        ...('videoUrl' in payload ? { video_url: payload.videoUrl ?? null } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async delete(id: string) {
    await this.db
      .deleteFrom('shows')
      .where('id', '=', id)
      .execute();
  }

  async findAll(limit: number = 50): Promise<ShowSummary[]> {
    const rows = await this.db
      .selectFrom('shows')
      .selectAll()
      .orderBy('scheduled_at', 'desc')
      .limit(limit)
      .execute();

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      scheduledAt: r.scheduled_at.toISOString(),
      status: r.status,
      playerCount: r.player_count,
      prizePool: r.prize_pool,
      roundCount: (r.game_sequence as unknown[]).length,
      lobbyDurationMs: r.lobby_duration_ms,
    }));
  }

  async updateStatus(id: string, status: ShowStatus) {
    return this.db
      .updateTable('shows')
      .set({ status, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async findGameDefinition(id: string) {
    return this.db
      .selectFrom('game_definitions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /**
   * Mark a batch of participants as eliminated at a given round.
   * No-op for empty array.
   */
  async updateParticipantsEliminated(
    showId: string,
    roundIndex: number,
    userIds: string[],
  ): Promise<void> {
    if (userIds.length === 0) return;
    await this.db
      .updateTable('show_participants')
      .set({ status: 'eliminated', round_reached: roundIndex })
      .where('show_id', '=', showId)
      .where('user_id', 'in', userIds)
      .execute();
  }

  /**
   * Mark a batch of participants as winners.
   * No-op for empty array.
   */
  async updateParticipantsWinner(
    showId: string,
    userIds: string[],
  ): Promise<void> {
    if (userIds.length === 0) return;
    await this.db
      .updateTable('show_participants')
      .set({ status: 'winner', coins_earned: 500 })
      .where('show_id', '=', showId)
      .where('user_id', 'in', userIds)
      .execute();
  }

  /**
   * Fetch public user profiles for a list of user IDs (used to build
   * the winner list in show_ended event).
   * Returns rows in arbitrary order.
   */
  async findUserProfiles(userIds: string[]) {
    if (userIds.length === 0) return [];
    return this.db
      .selectFrom('users')
      .select(['id', 'display_name', 'avatar_url', 'coin_balance'])
      .where('id', 'in', userIds)
      .execute();
  }

  async findScheduledToOpen(): Promise<Array<{ id: string; lobby_duration_ms: number; scheduled_at: Date }>> {
    return this.db
      .selectFrom('shows')
      .select(['id', 'lobby_duration_ms', 'scheduled_at'])
      .where('status', '=', 'scheduled')
      .where('scheduled_at', '<=', new Date())
      .execute();
  }

  async findLobbyToStart(): Promise<Array<{ id: string; lobby_duration_ms: number; scheduled_at: Date; video_url: string | null }>> {
    return this.db
      .selectFrom('shows')
      .select(['id', 'lobby_duration_ms', 'scheduled_at', 'video_url'])
      .where('status', '=', 'lobby')
      .execute();
  }

  async registerParticipant(
    userId: string,
    showId: string,
  ): Promise<ShowParticipant> {
    const row = await this.db
      .insertInto('show_participants')
      .values({
        user_id: userId,
        show_id: showId,
        status: 'registered',
        round_reached: 0,
        coins_earned: 0,
      })
      .onConflict((oc) => oc.columns(['user_id', 'show_id']).doNothing())
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      id: row.id,
      userId: row.user_id,
      showId: row.show_id,
      status: row.status,
      roundReached: row.round_reached,
      coinsEarned: row.coins_earned,
      joinedAt: row.joined_at.toISOString(),
    };
  }
}
