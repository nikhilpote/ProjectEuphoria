import { Injectable, Inject } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { DB } from '../../database/schema';
import { KYSELY_TOKEN } from '../../database/database.module';
import type { PlayClipSummary, ClipPlaySession } from '@euphoria/types';

@Injectable()
export class PlayClipsRepository {
  constructor(
    @Inject(KYSELY_TOKEN)
    private readonly db: Kysely<DB>,
  ) {}

  async findByShowId(showId: string) {
    const rows = await this.db
      .selectFrom('play_clips')
      .selectAll()
      .where('show_id', '=', showId)
      .orderBy('clip_start_ms', 'asc')
      .execute();

    return rows.map((r) => ({
      id: r.id,
      showId: r.show_id,
      gameType: r.game_type,
      clipStartMs: r.clip_start_ms,
      clipEndMs: r.clip_end_ms,
      gameOffsetMs: r.game_offset_ms,
      status: r.status,
      mediaUrl: r.media_url,
    }));
  }

  /** Returns the next clip this user hasn't completed, ordered by recency. */
  async findNextUnseen(userId: string) {
    return this.db
      .selectFrom('play_clips')
      .selectAll()
      .where('status', '=', 'ready')
      .where('id', 'not in', (qb) =>
        qb
          .selectFrom('clip_play_sessions')
          .select('clip_id')
          .where('user_id', '=', userId)
          .where('completed_at', 'is not', null),
      )
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst();
  }

  async findById(id: string) {
    return this.db
      .selectFrom('play_clips')
      .selectAll()
      .where('id', '=', id)
      .where('status', '=', 'ready')
      .executeTakeFirst();
  }

  async findReady(limit: number = 20, offset: number = 0, userId?: string): Promise<PlayClipSummary[]> {
    let query = this.db
      .selectFrom('play_clips')
      .selectAll()
      .where('status', '=', 'ready');

    if (userId) {
      // Exclude clips this user has already completed
      query = query.where('id', 'not in', (qb) =>
        qb
          .selectFrom('clip_play_sessions')
          .select('clip_id')
          .where('user_id', '=', userId)
          .where('completed_at', 'is not', null),
      );
    }

    const rows = await query
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    return rows.map((r) => ({
      id: r.id,
      showId: r.show_id,
      gameType: r.game_type as PlayClipSummary['gameType'],
      hlsUrl: r.hls_url,
      mediaUrl: r.media_url,
      config: (r.config ?? {}) as Record<string, unknown>,
      clipStartMs: r.clip_start_ms,
      clipEndMs: r.clip_end_ms,
      gameOffsetMs: r.game_offset_ms,
      status: r.status,
      playCount: r.play_count,
    }));
  }

  async deleteClip(clipId: string): Promise<void> {
    await this.db.deleteFrom('play_clips').where('id', '=', clipId).execute();
  }

  async createClip(input: {
    showId: string;
    roundIndex: number;
    gameType: string;
    config: Record<string, unknown>;
    mediaUrl: string;
    clipStartMs: number;
    clipEndMs: number;
    gameOffsetMs: number;
  }) {
    return this.db
      .insertInto('play_clips')
      .values({
        show_id: input.showId,
        round_index: input.roundIndex,
        game_type: input.gameType as never,
        config: JSON.stringify(input.config) as never,
        media_url: input.mediaUrl,
        hls_url: null,
        clip_start_ms: input.clipStartMs,
        clip_end_ms: input.clipEndMs,
        game_offset_ms: input.gameOffsetMs,
        status: 'ready',
        play_count: 0,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async createSession(
    userId: string,
    clipId: string,
    servedAt: number,
  ): Promise<ClipPlaySession> {
    // Increment play count atomically
    await this.db
      .updateTable('play_clips')
      .set((eb) => ({ play_count: eb('play_count', '+', 1) }))
      .where('id', '=', clipId)
      .execute();

    const row = await this.db
      .insertInto('clip_play_sessions')
      .values({
        user_id: userId,
        clip_id: clipId,
        served_at: servedAt,
        client_ts: null,
        score: null,
        completed_at: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      id: row.id,
      userId: row.user_id,
      clipId: row.clip_id,
      servedAt: row.served_at,
      completedAt: row.completed_at?.toISOString() ?? null,
      score: row.score,
    };
  }

  async findSessionById(sessionId: string) {
    return this.db
      .selectFrom('clip_play_sessions')
      .selectAll()
      .where('id', '=', sessionId)
      .executeTakeFirst();
  }

  /** Returns { beaten, total } — how many completed sessions scored below myScore, and total count */
  async getPercentileRank(clipId: string, myScore: number): Promise<{ beaten: number; total: number }> {
    const result = await this.db
      .selectFrom('clip_play_sessions')
      .select([
        sql<number>`COUNT(*)::int`.as('total'),
        sql<number>`COUNT(*) FILTER (WHERE score < ${myScore})::int`.as('beaten'),
      ])
      .where('clip_id', '=', clipId)
      .where('completed_at', 'is not', null)
      .executeTakeFirstOrThrow();

    return { beaten: result.beaten ?? 0, total: result.total ?? 0 };
  }

  async completeSession(
    sessionId: string,
    score: number,
    clientTs: number,
  ): Promise<ClipPlaySession> {
    const row = await this.db
      .updateTable('clip_play_sessions')
      .set({
        completed_at: new Date(),
        score,
        client_ts: clientTs,
      })
      .where('id', '=', sessionId)
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      id: row.id,
      userId: row.user_id,
      clipId: row.clip_id,
      servedAt: row.served_at,
      completedAt: row.completed_at?.toISOString() ?? null,
      score: row.score,
    };
  }
}
