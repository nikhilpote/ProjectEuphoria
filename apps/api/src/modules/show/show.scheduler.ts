import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../database/redis.module';
import { ShowRepository } from './show.repository';
import { StorageService } from '../../common/storage/storage.service';
import type { ShowGateway } from '../../gateways/show/show.gateway';
import type { ShowCountdownEvent } from '@euphoria/types';

/** Seconds before show start to reveal the signed video URL for pre-buffering */
const VIDEO_PREBUFFER_THRESHOLD_S = 60;

@Injectable()
export class ShowSchedulerService {
  private readonly logger = new Logger(ShowSchedulerService.name);
  private gateway: ShowGateway | null = null;
  private orchestrator: { startShow: (id: string) => Promise<void> } | null = null;

  /** Track shows already handed off to orchestrator to avoid double-firing */
  private readonly pendingStarts = new Set<string>();
  /** Track shows that have already had their signed URL broadcast to avoid re-signing every tick */
  private readonly prebufferSent = new Set<string>();

  constructor(
    private readonly showRepository: ShowRepository,
    private readonly storageService: StorageService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  setGateway(gateway: ShowGateway): void {
    this.gateway = gateway;
  }

  setOrchestrator(o: { startShow: (id: string) => Promise<void> }): void {
    this.orchestrator = o;
  }

  /** Every 10 seconds: open lobbies, broadcast countdown, auto-start shows */
  @Cron(CronExpression.EVERY_10_SECONDS)
  async checkScheduledShows(): Promise<void> {
    try {
      // Transition scheduled → lobby for shows whose scheduledAt has passed
      const toOpen = await this.showRepository.findScheduledToOpen();
      for (const show of toOpen) {
        await this.showRepository.updateStatus(show.id, 'lobby');
        await this.redis.set(`show:${show.id}:status`, 'lobby');
        this.logger.log(`Show ${show.id} → lobby`);
        this.gateway?.broadcastToShow(show.id, 'lobby_opened', {
          showId: show.id,
          lobbyDurationMs: show.lobby_duration_ms,
        });
      }

      // Auto-start shows whose lobby duration has elapsed
      const inLobby = await this.showRepository.findLobbyToStart();
      const now = Date.now();
      for (const show of inLobby) {
        const startAt = new Date(show.scheduled_at).getTime() + show.lobby_duration_ms;
        const secondsRemaining = Math.max(0, Math.round((startAt - now) / 1000));

        // Broadcast countdown tick to all clients in the lobby
        const countdownEvent: ShowCountdownEvent = {
          showId: show.id,
          startsAt: startAt,
          secondsRemaining,
          videoUrl: null, // withheld until pre-buffer window
        };

        // Reveal signed video URL only within the pre-buffer threshold
        if (
          secondsRemaining <= VIDEO_PREBUFFER_THRESHOLD_S &&
          !this.prebufferSent.has(show.id) &&
          show.video_url
        ) {
          try {
            // Sign for show duration + 2h buffer; expires well after show ends
            const signedUrl = await this.storageService.signVideoUrl(show.video_url, 7200);
            countdownEvent.videoUrl = signedUrl;
            this.prebufferSent.add(show.id);
            this.logger.log(`Show ${show.id} — signed video URL sent for pre-buffering`);
          } catch (err) {
            this.logger.error(`Failed to sign video URL for show ${show.id}: ${(err as Error).message}`);
          }
        }

        this.gateway?.broadcastToShow(show.id, 'show_countdown', countdownEvent);

        // Auto-start when lobby has elapsed
        if (now >= startAt && !this.pendingStarts.has(show.id)) {
          this.pendingStarts.add(show.id);
          this.prebufferSent.delete(show.id); // clean up
          this.logger.log(`Show ${show.id} lobby elapsed → auto-starting`);
          this.orchestrator
            ?.startShow(show.id)
            .catch((e: Error) => {
              this.logger.error(`Auto-start failed for ${show.id}: ${e.message}`);
              this.pendingStarts.delete(show.id);
            });
        }
      }
    } catch (err) {
      this.logger.error('ShowScheduler error:', (err as Error).message);
    }
  }
}
