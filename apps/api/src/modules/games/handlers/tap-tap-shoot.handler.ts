import { BaseGameHandler } from '../base-game-handler';
import type { GameAnswer } from '@euphoria/types';

/**
 * Tap Tap Shoot — Construct 3 basketball game.
 *
 * Config: { requiredScore: number }
 * The C3 game runs locally via the SDK bundled in the app.
 * The bridge monitors the C3 Level variable and submits when the
 * player reaches requiredScore.
 *
 * Answer from client: { correct: boolean, score: number, timeTakenMs: number }
 * Elimination: player passes if correct === true (reached the required level).
 */

interface TapTapShootAnswer {
  correct?: boolean;
  score?: number;
  timeTakenMs?: number;
}

export class TapTapShootHandler extends BaseGameHandler {
  readonly type = 'tap_tap_shoot';

  private unwrap(config: Record<string, unknown>): Record<string, unknown> {
    return (config['tapTapShoot'] as Record<string, unknown>) ?? config;
  }

  buildClientPayload(config: Record<string, unknown>): Record<string, unknown> {
    const tts = this.unwrap(config);
    return {
      requiredScore: tts['requiredScore'] ?? 4,
    };
  }

  buildQuestionEvent(
    config: Record<string, unknown>,
    { showId, roundIndex, timeLimitMs }: { showId: string; roundIndex: number; timeLimitMs: number },
  ): Record<string, unknown> {
    const tts = this.unwrap(config);
    return {
      showId,
      roundIndex,
      timeLimitMs,
      requiredScore: tts['requiredScore'] ?? 4,
    };
  }

  isCorrect(_config: Record<string, unknown>, answer: GameAnswer): boolean {
    const submitted = answer as TapTapShootAnswer;
    return submitted.correct === true;
  }

  getCorrectAnswerText(config: Record<string, unknown>): string {
    const tts = this.unwrap(config);
    const level = tts['requiredScore'] ?? 4;
    return `Score ${level} points`;
  }
}
