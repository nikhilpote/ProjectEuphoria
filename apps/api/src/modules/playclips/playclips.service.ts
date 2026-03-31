import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PlayClipsRepository } from './playclips.repository';
import { EconomyService } from '../economy/economy.service';
import { GamePackagesService } from '../game-packages/game-packages.service';
import { validateSpotDifferenceTaps } from '../games/handlers/spot-difference.handler';
import type { PlayClipSummary, ClipPlaySession } from '@euphoria/types';

// Score formula: base 100 pts if correct, bonus up to 100 pts for speed
// responseTimeMs is capped at timeLimitMs for scoring purposes
function calculateScore(correct: boolean, responseTimeMs: number, timeLimitMs: number): number {
  if (!correct) return 0;
  const capped = Math.min(responseTimeMs, timeLimitMs);
  const speedBonus = Math.round(100 * (1 - capped / timeLimitMs));
  return 100 + speedBonus;
}

function evaluateAnswer(
  gameType: string,
  config: Record<string, unknown>,
  answer: unknown,
): boolean {
  if (gameType === 'trivia') {
    const trivia = config['trivia'] as { correctIndex: number } | undefined;
    const submitted = answer as { selectedOptionId?: string } | null;
    if (!trivia || !submitted) return false;
    return String(trivia.correctIndex) === String(submitted.selectedOptionId);
  }

  if (gameType === 'quick_math') {
    const qm = config['quickMath'] as { correctIndex: number } | undefined;
    const submitted = answer as { selectedOptionId?: string } | null;
    if (!qm || !submitted) return false;
    return String(qm.correctIndex) === String(submitted.selectedOptionId);
  }

  // spot_difference is validated asynchronously — see submitAnswer()
  return false;
}

@Injectable()
export class PlayClipsService {
  constructor(
    private readonly playClipsRepository: PlayClipsRepository,
    private readonly economyService: EconomyService,
    private readonly gamePackagesService: GamePackagesService,
  ) {}

  async listReady(page: number = 0, limit: number = 20, userId?: string): Promise<PlayClipSummary[]> {
    const offset = page * limit;
    return this.playClipsRepository.findReady(limit, offset, userId);
  }

  async startSession(userId: string, clipId: string): Promise<ClipPlaySession> {
    const clip = await this.playClipsRepository.findById(clipId);
    if (!clip) throw new NotFoundException(`Clip ${clipId} not found or not ready`);
    const servedAt = Date.now();
    return this.playClipsRepository.createSession(userId, clipId, servedAt);
  }

  async submitAnswer(
    sessionId: string,
    clientTs: number,
    answer: unknown,
  ): Promise<{
    correct: boolean;
    score: number;
    responseTimeMs: number;
    percentile: number;   // 0-100: percentage of players beaten
    totalPlayers: number;
    correctAnswer: string | null;
  }> {
    const session = await this.playClipsRepository.findSessionById(sessionId);
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);
    if (session.completed_at) throw new BadRequestException('Session already completed');

    const clip = await this.playClipsRepository.findById(session.clip_id);
    if (!clip) throw new NotFoundException(`Clip not found`);

    const config = (clip.config ?? {}) as Record<string, unknown>;
    // timeLimitMs is the game round duration stored by the admin when clipping
    const timeLimitMs = (config['timeLimitMs'] as number | undefined)
      ?? (clip.clip_end_ms - clip.clip_start_ms - clip.game_offset_ms);
    // responseTimeMs = time from when game question fired to when user answered (clientTs)
    const gameStartedAt = session.served_at + clip.game_offset_ms;
    const responseTimeMs = Math.min(Math.max(clientTs - gameStartedAt, 0), timeLimitMs);

    // spot_difference: validate taps server-side against stored level differences
    let correct: boolean;
    if (clip.game_type === 'spot_difference') {
      const levelId = config['levelId'] as string | undefined;
      const submitted = answer as { taps?: Array<{ x: number; y: number }> } | null;
      if (!levelId || !submitted?.taps?.length) {
        correct = false;
      } else {
        const level = await this.gamePackagesService.getLevelCached('spot_difference', levelId);
        if (!level) {
          correct = false;
        } else {
          const diffs = JSON.parse((level.config['differences'] as string | undefined) ?? '[]') as Array<{ x: number; y: number; radius: number }>;
          const findCount = (level.config['findCount'] as number | undefined) ?? 1;
          const aspectRatio = (level.config['imageAspectRatio'] as number | undefined) ?? 1;
          correct = validateSpotDifferenceTaps(diffs, findCount, submitted.taps, aspectRatio);
        }
      }
    } else {
      correct = evaluateAnswer(clip.game_type, config, answer);
    }
    const score = calculateScore(correct, responseTimeMs, Math.max(timeLimitMs, 5000));

    await this.playClipsRepository.completeSession(sessionId, score, clientTs);

    // Award coins — fire-and-forget, never block the response
    this.economyService.awardPlayClipCoins(session.user_id, sessionId, correct, score, clip.game_type).catch(() => {});

    // Calculate percentile after completing (includes this attempt)
    const { beaten, total } = await this.playClipsRepository.getPercentileRank(session.clip_id, score);
    const percentile = total > 1 ? Math.round((beaten / (total - 1)) * 100) : 100;

    // Build correct answer text for display
    let correctAnswer: string | null = null;
    if (clip.game_type === 'trivia') {
      const trivia = config['trivia'] as { options: { text: string }[]; correctIndex: number } | undefined;
      if (trivia) correctAnswer = trivia.options[trivia.correctIndex]?.text ?? null;
    } else if (clip.game_type === 'quick_math') {
      const qm = config['quickMath'] as { options: string[]; correctIndex: number } | undefined;
      if (qm) correctAnswer = qm.options[qm.correctIndex] ?? null;
    }

    return { correct, score, responseTimeMs, percentile, totalPlayers: total, correctAnswer };
  }

  /**
   * Picks the next unseen clip for this user and creates a play session.
   * Returns null when the user has completed every available clip.
   */
  async prepareNextSession(userId: string): Promise<{
    session: ClipPlaySession;
    gameType: string;
    config: Record<string, unknown>;
    timeLimitMs: number;
    gameOffsetMs: number;
    mediaUrl: string;
    clipDurationMs: number;
    playCount: number;
  } | null> {
    const clip = await this.playClipsRepository.findNextUnseen(userId);
    if (!clip) return null;
    const servedAt = Date.now();
    const session = await this.playClipsRepository.createSession(userId, clip.id, servedAt);
    return {
      session,
      gameType: clip.game_type,
      config: (clip.config ?? {}) as Record<string, unknown>,
      timeLimitMs: (config['timeLimitMs'] as number | undefined) ?? (clip.clip_end_ms - clip.clip_start_ms - clip.game_offset_ms),
      gameOffsetMs: clip.game_offset_ms,
      mediaUrl: clip.media_url,
      clipDurationMs: clip.clip_end_ms - clip.clip_start_ms,
      playCount: clip.play_count,
    };
  }
}
