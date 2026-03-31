import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import { Kysely } from 'kysely';
import * as path from 'path';
import * as os from 'os';
import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { DB } from '../../database/schema';
import { KYSELY_TOKEN } from '../../database/database.module';
import { ShowService } from '../show/show.service';
import { ShowOrchestrator } from '../show/show.orchestrator';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { PlayClipsRepository } from '../playclips/playclips.repository';
import { TranscodeService } from '../../common/transcode/transcode.service';
import { StorageService } from '../../common/storage/storage.service';
import type {
  AdminStatsResponse,
  ShowSummary,
  CreateShowPayload,
  FeatureFlag,
} from '@euphoria/types';

export interface ClipRangeInput {
  startMs: number;
  endMs: number;
  roundIndex: number;
  gameType: string;
  config: Record<string, unknown>;
  /** Ms from clip start when game overlay should appear */
  gameOffsetMs: number;
}

@Injectable()
export class AdminService {
  constructor(
    @Inject(KYSELY_TOKEN) private readonly db: Kysely<DB>,
    private readonly showService: ShowService,
    private readonly showOrchestrator: ShowOrchestrator,
    private readonly featureFlagsService: FeatureFlagsService,
    private readonly playClipsRepository: PlayClipsRepository,
    private readonly transcodeService: TranscodeService,
    private readonly storageService: StorageService,
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

  async getShowClips(showId: string) {
    return this.playClipsRepository.findByShowId(showId);
  }

  async getAllClips(): Promise<Array<{
    id: string;
    showId: string;
    showTitle: string;
    gameType: string;
    clipStartMs: number;
    clipEndMs: number;
    gameOffsetMs: number;
    status: string;
    mediaUrl: string;
    playCount: number;
    createdAt: string;
  }>> {
    const rows = await this.db
      .selectFrom('play_clips')
      .innerJoin('shows', 'shows.id', 'play_clips.show_id')
      .select([
        'play_clips.id',
        'play_clips.show_id',
        'shows.title as show_title',
        'play_clips.game_type',
        'play_clips.clip_start_ms',
        'play_clips.clip_end_ms',
        'play_clips.game_offset_ms',
        'play_clips.status',
        'play_clips.media_url',
        'play_clips.play_count',
        'play_clips.created_at',
      ])
      .orderBy('play_clips.created_at', 'desc')
      .execute();

    return rows.map((r) => ({
      id: r.id,
      showId: r.show_id,
      showTitle: r.show_title,
      gameType: r.game_type,
      clipStartMs: r.clip_start_ms,
      clipEndMs: r.clip_end_ms,
      gameOffsetMs: r.game_offset_ms,
      status: r.status,
      mediaUrl: r.media_url,
      playCount: r.play_count,
      createdAt: r.created_at.toISOString(),
    }));
  }

  async deleteClip(showId: string, clipId: string): Promise<void> {
    const clips = await this.playClipsRepository.findByShowId(showId);
    const clip = clips.find((c) => c.id === clipId);
    if (!clip) throw new NotFoundException(`Clip ${clipId} not found in show ${showId}`);
    // Best-effort delete the clip video from storage
    await this.storageService.deleteGameBundle(clip.mediaUrl).catch(() => {});
    await this.playClipsRepository.deleteClip(clipId);
  }

  async createShowClips(showId: string, ranges: ClipRangeInput[]): Promise<{ created: number }> {
    if (!ranges.length) throw new BadRequestException('No clip ranges provided');

    // Fetch show to get video URL
    const show = await this.db
      .selectFrom('shows')
      .select(['id', 'video_url', 'status'])
      .where('id', '=', showId)
      .executeTakeFirst();

    if (!show) throw new NotFoundException(`Show ${showId} not found`);
    if (!show.video_url) throw new BadRequestException('Show has no video URL');

    // Resolve the video to a local path ffmpeg can read
    const { filePath: videoPath, isTmp: videoIsTmp } = await this.storageService.getReadablePath(show.video_url);

    let created = 0;
    try {
      for (const range of ranges) {
        const clipFilename = `clip_${uuidv4()}.mp4`;
        const tmpOut = path.join(os.tmpdir(), clipFilename);

        try {
          await this.transcodeService.extractClip(videoPath, range.startMs, range.endMs, tmpOut);
          const mediaUrl = await this.storageService.upload(tmpOut, clipFilename);

          await this.playClipsRepository.createClip({
            showId,
            roundIndex: range.roundIndex,
            gameType: range.gameType,
            config: range.config,
            mediaUrl,
            clipStartMs: range.startMs,
            clipEndMs: range.endMs,
            gameOffsetMs: range.gameOffsetMs,
          });

          created++;
        } finally {
          await fs.unlink(tmpOut).catch(() => {});
        }
      }
    } finally {
      if (videoIsTmp) await fs.unlink(videoPath).catch(() => {});
    }

    return { created };
  }
}
