/**
 * ShowOrchestrator — drives the show state machine.
 *
 * Architecture (single-video + markers):
 *   - One video plays end-to-end for the entire show.
 *   - `game_sequence` is a marker array: [{ at, duration, gameType, config }]
 *     - `at`: seconds into the show video when the question spawns
 *     - `duration`: seconds the answer window is open
 *   - All marker timers are scheduled upfront at show start.
 *   - If all survivors are eliminated mid-show, remaining timers are abandoned
 *     (they check Redis status before acting) and show ends early.
 *
 * State flow:
 *   scheduled → live (in_progress) → completed
 *
 * Redis keys:
 *   show:{showId}:status          — current status string
 *   show:{showId}:current_round   — active marker index (-1 = none)
 *   show:{showId}:players         — SET of userId strings (connected players)
 *   show:{showId}:round:{n}:answers — HASH: userId → JSON answer data
 *   show:{showId}:survivors       — SET of userId strings (still in game)
 *
 * Coin awards:
 *   Eliminated player: 10 coins (consolation)
 *   Winner:           500 coins
 */

import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import Redis from 'ioredis';
import { Kysely } from 'kysely';
import { REDIS_CLIENT } from '../../database/redis.module';
import { KYSELY_TOKEN } from '../../database/database.module';
import { DB } from '../../database/schema';
import { ShowRepository } from './show.repository';
import { EconomyService } from '../economy/economy.service';
import { GameRegistry } from '../games/game-registry.service';
import { GamePackagesService } from '../game-packages/game-packages.service';
import { StorageService } from '../../common/storage/storage.service';
import type { ShowGateway } from '../../gateways/show/show.gateway';
import type {
  RoundResultEvent,
  PlayerEliminatedEvent,
  ShowEndedEvent,
  ShowStartedEvent,
  ShowCountdownEvent,
  GameAnswer,
} from '@euphoria/types';

/** Seconds before show start when the signed video URL is revealed for pre-buffering */
const VIDEO_PREBUFFER_THRESHOLD_S = 60;

/** How many ms before marker.at to send round_question so client can buffer it */
const QUESTION_PRELOAD_MS = 500;

/** Marker stored in game_sequence JSONB */
interface ShowMarker {
  at: number;        // seconds into show video when question spawns
  duration: number;  // seconds the answer window is open
  gameType: string;
  config: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Redis key helpers
// ---------------------------------------------------------------------------

const rk = {
  status: (showId: string) => `show:${showId}:status`,
  currentRound: (showId: string) => `show:${showId}:current_round`,
  players: (showId: string) => `show:${showId}:players`,
  answers: (showId: string, roundIndex: number) =>
    `show:${showId}:round:${roundIndex}:answers`,
  survivors: (showId: string) => `show:${showId}:survivors`,
  roundDeadline: (showId: string, roundIndex: number) =>
    `show:${showId}:round:${roundIndex}:deadline`,
};

// ---------------------------------------------------------------------------
// Answer data stored in Redis hash
// ---------------------------------------------------------------------------

export interface StoredAnswer {
  answer: unknown;
  serverTs: number;
  clientTs: number;
}

// ---------------------------------------------------------------------------
// ShowOrchestrator
// ---------------------------------------------------------------------------

@Injectable()
export class ShowOrchestrator {
  private readonly logger = new Logger(ShowOrchestrator.name);

  /** Injected lazily to avoid circular dependency at module init */
  private gateway: ShowGateway | null = null;

  /** All timers scheduled for a show — keyed by showId */
  private readonly roundTimers = new Map<string, ReturnType<typeof setTimeout>[]>();

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(KYSELY_TOKEN) private readonly db: Kysely<DB>,
    private readonly showRepository: ShowRepository,
    private readonly economyService: EconomyService,
    private readonly gameRegistry: GameRegistry,
    private readonly gamePackagesService: GamePackagesService,
    private readonly storageService: StorageService,
  ) {}

  setGateway(gateway: ShowGateway): void {
    this.gateway = gateway;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Start a show. Schedules all marker timers upfront so the video + questions
   * are fully synchronised without round-by-round chaining.
   */
  async startShow(showId: string): Promise<void> {
    const show = await this.showRepository.findById(showId);
    if (!show) {
      throw new NotFoundException(`Show ${showId} not found`);
    }
    if (show.status !== 'scheduled' && show.status !== 'lobby') {
      throw new Error(
        `Show ${showId} cannot be started from status "${show.status}"`,
      );
    }

    await this.showRepository.updateStatus(showId, 'live');
    await this.redis.set(rk.status(showId), 'live');
    await this.redis.set(rk.currentRound(showId), '-1');

    const players = await this.redis.smembers(rk.players(showId));
    if (players.length > 0) {
      await this.redis.sadd(rk.survivors(showId), ...players);
    }

    const markers = show.game_sequence as unknown as ShowMarker[];
    const videoUrl = show.video_url ?? null;
    const startedAt = Date.now();

    const showStartedEvent: ShowStartedEvent = {
      showId,
      totalRounds: markers.length,
      startedAt,
      videoUrl,
    };
    this.broadcast(showId, 'show_started', showStartedEvent);

    this.logger.log(
      `Show ${showId} started — ${markers.length} markers, videoUrl=${videoUrl ?? 'none'}`,
    );

    const timers: ReturnType<typeof setTimeout>[] = [];

    for (let i = 0; i < markers.length; i++) {
      const marker = markers[i];
      const openAt = Math.max(0, marker.at * 1000);
      const closeAt = (marker.at + marker.duration) * 1000;

      // Pre-calculate deadline deterministically at show start time
      const deadlineEpochMs = startedAt + closeAt;

      // Timer 1: Question preload — fires QUESTION_PRELOAD_MS before marker.at.
      // Sets Redis currentRound + deadline so answer submissions are accepted from
      // this moment, and sends round_question with spawnAtVideoSeconds so the client
      // can hold it until the video reaches the right position.
      const preloadAt = Math.max(0, openAt - QUESTION_PRELOAD_MS);
      const preloadTimer = setTimeout(async () => {
        const status = await this.redis.get(rk.status(showId));
        if (status !== 'live') return;

        // Set currentRound and deadline so gateway enforces submission window
        await this.redis
          .set(rk.currentRound(showId), String(i))
          .catch((err: Error) =>
            this.logger.error(`currentRound set error show=${showId} round=${i}: ${err.message}`),
          );
        await this.redis
          .set(rk.roundDeadline(showId, i), String(deadlineEpochMs), 'EX', 3600)
          .catch((err: Error) =>
            this.logger.error(`roundDeadline set error show=${showId} round=${i}: ${err.message}`),
          );

        // For spot_difference: resolve the level so imageA/imageB/differences are
        // available to buildQuestionEvent (the config only stores levelId).
        let questionConfig = marker.config;
        if (marker.gameType === 'spot_difference') {
          const sd = (marker.config['spotDifference'] ?? marker.config) as Record<string, unknown>;
          const levelId = sd['levelId'] as string | undefined;
          if (levelId) {
            const level = await this.gamePackagesService.getLevelCached('spot_difference', levelId);
            if (level) {
              const resolvedFindCount = (sd['findCount'] as number | undefined)
                ?? (level.config['findCount'] as number | undefined) ?? 1;
              questionConfig = {
                ...marker.config,
                spotDifference: {
                  ...sd,
                  imageA: level.config['imageA'],
                  imageB: level.config['imageB'],
                  differences: level.config['differences'],
                  findCount: resolvedFindCount,
                  imageAspectRatio: level.config['imageAspectRatio'],
                },
              };
            } else {
              this.logger.warn(`spot_difference level "${levelId}" not found — round ${i} will have no images`);
            }
          }
        }

        // For knife_at_center: resolve the level config from DB
        if (marker.gameType === 'knife_at_center') {
          const kac = (marker.config['knifeAtCenter'] ?? marker.config) as Record<string, unknown>;
          const levelName = kac['level'] as string | undefined;
          if (levelName) {
            const level = await this.gamePackagesService.getLevelCached('knife_at_center', levelName);
            if (level) {
              // Merge the full level config into the payload so the game HTML receives it directly
              questionConfig = {
                ...marker.config,
                knifeAtCenter: {
                  ...kac,
                  ...level.config,
                },
              };
            } else {
              this.logger.warn(`knife_at_center level "${levelName}" not found — round ${i} will use defaults`);
            }
          }
        }

        if (marker.gameType === 'knife_at_center') {
          this.logger.debug(`[KAC] questionConfig = ${JSON.stringify(questionConfig)}`);
        }

        const questionEvent = this.gameRegistry.buildQuestionEvent(
          marker.gameType,
          questionConfig,
          { showId, roundIndex: i, timeLimitMs: marker.duration * 1000 },
        );
        if (questionEvent && Object.keys(questionEvent).length > 0) {
          this.broadcast(showId, 'round_question', {
            ...questionEvent,
            gameType: marker.gameType,
            totalRounds: markers.length,
            spawnAtVideoSeconds: marker.at,
            deadlineEpochMs,
          });
          this.logger.log(
            `Show ${showId} round ${i} — question preloaded (fires at video t=${marker.at}s, deadline=${new Date(deadlineEpochMs).toISOString()})`,
          );
        } else {
          this.logger.warn(
            `Show ${showId} round ${i}: no question event for gameType=${marker.gameType}`,
          );
        }
      }, preloadAt);
      timers.push(preloadTimer);

      // Timer 2: Round open — fires at marker.at.
      // Redis state already set by preloadTimer; this only emits the round_start HUD event.
      const openTimer = setTimeout(() => {
        this.openQuestion(showId, i, marker, markers.length, deadlineEpochMs).catch((err: Error) =>
          this.logger.error(`openQuestion error show=${showId} round=${i}: ${err.message}`),
        );
      }, openAt);
      timers.push(openTimer);

      const closeTimer = setTimeout(() => {
        this.closeSubmissions(showId, i).catch((err: Error) =>
          this.logger.error(`closeSubmissions error show=${showId} round=${i}: ${err.message}`),
        );
      }, closeAt);
      timers.push(closeTimer);
    }

    // Schedule show end 5s after the last marker's submission window closes
    if (markers.length > 0) {
      const last = markers[markers.length - 1];
      const endAt = (last.at + last.duration) * 1000 + 5_000;
      const endTimer = setTimeout(() => {
        this.endShow(showId).catch((err: Error) =>
          this.logger.error(`endShow error show=${showId}: ${err.message}`),
        );
      }, endAt);
      timers.push(endTimer);
    } else {
      // No markers — end immediately after brief delay
      const endTimer = setTimeout(() => {
        this.endShow(showId).catch((err: Error) =>
          this.logger.error(`endShow error show=${showId}: ${err.message}`),
        );
      }, 3_000);
      timers.push(endTimer);
    }

    this.roundTimers.set(showId, timers);
  }

  /**
   * Fire at marker.at seconds into the show. Emits only the round_start HUD event.
   * Redis currentRound and roundDeadline are already set by the preload timer
   * (QUESTION_PRELOAD_MS earlier), and round_question was already broadcast then.
   */
  async openQuestion(
    showId: string,
    markerIndex: number,
    marker: ShowMarker,
    totalRounds: number,
    deadlineEpochMs: number,
  ): Promise<void> {
    const status = await this.redis.get(rk.status(showId));
    if (status !== 'live') return;

    const survivorCount = await this.redis.scard(rk.survivors(showId));
    const startsAt = Date.now();
    const timeLimitMs = marker.duration * 1000;

    // Round HUD update only — question overlay was already sent by preloadTimer
    this.broadcast(showId, 'round_start', {
      showId,
      roundIndex: markerIndex,
      totalRounds,
      gameType: marker.gameType,
      playersRemaining: survivorCount,
      startsAt,
      videoDurationMs: timeLimitMs,
      questionSpawnAt: 0,
    });

    this.logger.log(
      `Show ${showId} round ${markerIndex} — open at=${marker.at}s duration=${marker.duration}s gameType=${marker.gameType} deadline=${new Date(deadlineEpochMs).toISOString()}`,
    );
  }

  /**
   * Fire at (marker.at + marker.duration) seconds. Evaluates answers, emits
   * round_result + targeted player_eliminated events, awards consolation coins.
   * If all survivors are eliminated, schedules early show end.
   */
  async closeSubmissions(showId: string, roundIndex: number): Promise<void> {
    const status = await this.redis.get(rk.status(showId));
    if (status !== 'live') return;

    const show = await this.showRepository.findById(showId);
    if (!show) return;

    const markers = show.game_sequence as unknown as ShowMarker[];
    const marker = markers[roundIndex];
    if (!marker) return;

    const answersHash = await this.redis.hgetall(rk.answers(showId, roundIndex));
    const survivors = await this.redis.smembers(rk.survivors(showId));

    const correctAnswerText = this.gameRegistry.getCorrectAnswerText(
      marker.gameType,
      marker.config,
    );
    const correctAnswer: unknown = correctAnswerText || null;

    const correct = new Set<string>();
    const incorrect = new Set<string>();

    // For spot_difference: resolve the level once before the player loop so we
    // can validate tap coordinates server-side without a per-player DB call.
    let evalConfig = marker.config;
    if (marker.gameType === 'spot_difference') {
      const sd = (marker.config['spotDifference'] ?? marker.config) as Record<string, unknown>;
      const levelId = sd['levelId'] as string | undefined;
      if (levelId) {
        const level = await this.gamePackagesService.getLevelCached('spot_difference', levelId);
        if (level) {
          // findCount: show config overrides level default (admin can set "find 2 of 5" per round)
          const configFindCount = sd['findCount'] as number | undefined;
          evalConfig = {
            ...marker.config,
            _resolvedDifferences: level.config['differences'] as string,
            _resolvedFindCount: configFindCount ?? (level.config['findCount'] as number | undefined) ?? 1,
            _resolvedAspectRatio: (level.config['imageAspectRatio'] as number | undefined) ?? 1,
          };
        } else {
          this.logger.warn(`spot_difference level "${levelId}" not found — falling back to client trust`);
        }
      }
    }

    for (const userId of survivors) {
      const raw = answersHash[userId];
      if (!raw) {
        incorrect.add(userId);
        continue;
      }
      let stored: StoredAnswer;
      try {
        stored = JSON.parse(raw) as StoredAnswer;
      } catch {
        incorrect.add(userId);
        continue;
      }
      if (this.isAnswerCorrect(marker.gameType, evalConfig, stored.answer as GameAnswer)) {
        correct.add(userId);
      } else {
        incorrect.add(userId);
      }
    }

    const eliminated = [...incorrect];
    const remaining = [...correct];

    this.logger.log(
      `Show ${showId} round ${roundIndex} closed — correct=${correct.size} eliminated=${eliminated.length}`,
    );

    const roundResultEvent: RoundResultEvent = {
      showId,
      roundIndex,
      correctAnswer,
      playersCorrect: correct.size,
      playersEliminated: eliminated.length,
      playersRemaining: remaining.length,
      playerCorrect: false,
    };
    this.broadcast(showId, 'round_result', roundResultEvent);

    if (this.gateway && eliminated.length > 0) {
      for (const userId of eliminated) {
        const eliminationEvent: PlayerEliminatedEvent = {
          showId,
          roundIndex,
          coinsEarned: 10,
        };
        this.gateway.emitToUser(showId, userId, 'player_eliminated', eliminationEvent);
      }
    }

    this.awardEliminationCoins(showId, roundIndex, eliminated).catch((err: Error) =>
      this.logger.error(`awardEliminationCoins error: ${err.message}`),
    );

    if (eliminated.length > 0) {
      await this.redis.srem(rk.survivors(showId), ...eliminated);
    }

    await this.showRepository.updateParticipantsEliminated(showId, roundIndex, eliminated);

    // Early termination if all players are eliminated before the last marker
    const survivorsLeft = await this.redis.scard(rk.survivors(showId));
    if (survivorsLeft === 0) {
      this.logger.log(`Show ${showId} round ${roundIndex} — all eliminated, ending early`);
      setTimeout(() => {
        this.endShow(showId).catch((err: Error) =>
          this.logger.error(`endShow error show=${showId}: ${err.message}`),
        );
      }, 5_000);
    }
    // No else — remaining markers are already scheduled and will check status before acting
  }

  /**
   * End the show. Idempotent — safe to call from both the scheduled timer and
   * an early-termination path.
   */
  async endShow(showId: string): Promise<void> {
    // Idempotency: only one call proceeds
    const currentStatus = await this.redis.get(rk.status(showId));
    if (currentStatus === 'completed') return;

    const winners = await this.redis.smembers(rk.survivors(showId));
    const players = await this.redis.smembers(rk.players(showId));

    this.logger.log(
      `Show ${showId} ending — winners=${winners.length} totalPlayers=${players.length}`,
    );

    await this.showRepository.updateStatus(showId, 'completed');
    await this.redis.set(rk.status(showId), 'completed');

    if (winners.length > 0) {
      await this.showRepository.updateParticipantsWinner(showId, winners);
    }

    this.awardWinnerCoins(showId, winners).catch((err: Error) =>
      this.logger.error(`awardWinnerCoins error: ${err.message}`),
    );

    const [winnerProfiles, participantResults, show] = await Promise.all([
      this.showRepository.findUserProfiles(winners),
      this.showRepository.getParticipantResults(showId),
      this.showRepository.findById(showId),
    ]);

    const winnerSet = new Set(winners);
    const resultByUser = new Map(participantResults.map((r) => [r.userId, r]));
    const totalRounds = show
      ? (show.game_sequence as unknown as unknown[]).length
      : 0;

    const baseWinners = winnerProfiles.map((u) => ({
      user: {
        id: u.id,
        displayName: u.display_name,
        avatarUrl: u.avatar_url,
        coinBalance: u.coin_balance,
      },
      coinsEarned: 500,
    }));

    // Emit a personalised show_ended to every connected player so each one
    // sees the correct winner/eliminated status and their own coins earned.
    if (this.gateway) {
      for (const userId of players) {
        const isWinner = winnerSet.has(userId);
        const result = resultByUser.get(userId);
        const personalEvent: ShowEndedEvent = {
          showId,
          winners: baseWinners,
          totalPlayers: players.length,
          playerResult: {
            status: isWinner ? 'winner' : 'eliminated',
            roundReached: isWinner ? totalRounds : (result?.roundReached ?? 0),
            coinsEarned: result?.coinsEarned ?? (isWinner ? 500 : 0),
          },
        };
        this.gateway.emitToUser(showId, userId, 'show_ended', personalEvent);
      }
    }

    this.cleanupRedisKeys(showId).catch((err: Error) =>
      this.logger.warn(`Redis cleanup error for show ${showId}: ${err.message}`),
    );
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private broadcast(showId: string, event: string, data: unknown): void {
    if (this.gateway) {
      this.gateway.broadcastToShow(showId, event, data);
    } else {
      this.logger.warn(`broadcast called before gateway set — show=${showId} event=${event}`);
    }
  }

  private isAnswerCorrect(
    gameType: string,
    config: Record<string, unknown>,
    answer: GameAnswer,
  ): boolean {
    if (this.gameRegistry.get(gameType)) {
      return this.gameRegistry.isCorrect(gameType, config, answer);
    }
    // Game type not registered — fail closed. Register the game in GameRegistry.
    this.logger.warn(`isAnswerCorrect: unregistered gameType "${gameType}", rejecting answer`);
    return false;
  }

  private async awardEliminationCoins(
    showId: string,
    roundIndex: number,
    userIds: string[],
  ): Promise<void> {
    if (userIds.length === 0) return;
    await this.economyService.awardCoinsBatch(
      userIds,
      10,
      `${showId}:eliminated:${roundIndex}`,
    );
  }

  private async awardWinnerCoins(showId: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    await this.economyService.awardCoinsBatch(userIds, 500, `${showId}:winner`);
  }

  private async cleanupRedisKeys(showId: string): Promise<void> {
    const show = await this.showRepository.findById(showId);
    const markers = show ? (show.game_sequence as unknown as ShowMarker[]) : [];

    const keys = [
      rk.status(showId),
      rk.currentRound(showId),
      rk.players(showId),
      rk.survivors(showId),
      ...markers.map((_, i) => rk.answers(showId, i)),
      ...markers.map((_, i) => rk.roundDeadline(showId, i)),
    ];

    if (keys.length > 0) {
      await this.redis.del(...keys);
    }

    // Cancel any pending timers
    const timers = this.roundTimers.get(showId);
    if (timers) {
      for (const t of timers) clearTimeout(t);
      this.roundTimers.delete(showId);
    }
  }
}
