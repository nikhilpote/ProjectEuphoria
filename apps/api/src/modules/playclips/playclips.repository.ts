import { Injectable, Inject } from '@nestjs/common';
import { Kysely } from 'kysely';
import { DB } from '../../database/schema';
import { KYSELY_TOKEN } from '../../database/database.module';
import type { PlayClipSummary, ClipPlaySession } from '@euphoria/types';

@Injectable()
export class PlayClipsRepository {
  constructor(
    @Inject(KYSELY_TOKEN)
    private readonly db: Kysely<DB>,
  ) {}

  async findById(id: string) {
    return this.db
      .selectFrom('play_clips')
      .selectAll()
      .where('id', '=', id)
      .where('status', '=', 'ready')
      .executeTakeFirst();
  }

  async findReady(limit: number = 20, offset: number = 0): Promise<PlayClipSummary[]> {
    const rows = await this.db
      .selectFrom('play_clips')
      .select(['id', 'show_id', 'game_type', 'hls_url', 'status', 'play_count'])
      .where('status', '=', 'ready')
      .orderBy('play_count', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    return rows.map((r) => ({
      id: r.id,
      showId: r.show_id,
      gameType: r.game_type as PlayClipSummary['gameType'],
      hlsUrl: r.hls_url,
      status: r.status,
      playCount: r.play_count,
    }));
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
