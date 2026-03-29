import { BaseGameHandler } from '../base-game-handler';
import type { GameAnswer, NumberDashAnswer } from '@euphoria/types';

/**
 * number_dash — score-based elimination game.
 *
 * Numbers fall from the sky; players tap them in order (1, 2, 3…).
 * Non-prime tap = 5 pts, prime tap = 20 pts.
 *
 * Delivered as a WebView bundle (game_packages id = "number_dash").
 * Elimination cutoff: players with score < cutoffScore are eliminated.
 */
interface InlineNumberDash {
  difficulty: 'easy' | 'medium' | 'hard';
  maxNumber: number;   // 10–20
  cutoffScore: number; // players below this are eliminated
}

export class NumberDashHandler extends BaseGameHandler {
  readonly type = 'number_dash';

  buildClientPayload(config: Record<string, unknown>): Record<string, unknown> {
    const nd = config['numberDash'] as InlineNumberDash | undefined;
    if (!nd) return {};
    return {
      difficulty: nd.difficulty,
      maxNumber: nd.maxNumber,
      cutoffScore: nd.cutoffScore,
    };
  }

  buildQuestionEvent(
    config: Record<string, unknown>,
    { showId, roundIndex, timeLimitMs }: { showId: string; roundIndex: number; timeLimitMs: number },
  ): Record<string, unknown> {
    const nd = config['numberDash'] as InlineNumberDash | undefined;
    if (!nd) return {};
    return {
      showId,
      roundIndex,
      difficulty: nd.difficulty,
      maxNumber: nd.maxNumber,
      cutoffScore: nd.cutoffScore,
      timeLimitMs,
    };
  }

  isCorrect(config: Record<string, unknown>, answer: GameAnswer): boolean {
    const nd = config['numberDash'] as InlineNumberDash | undefined;
    if (!nd) return false;
    const { score } = answer as NumberDashAnswer;
    return (score ?? 0) >= nd.cutoffScore;
  }

  getCorrectAnswerText(config: Record<string, unknown>): string {
    const nd = config['numberDash'] as InlineNumberDash | undefined;
    if (!nd) return '';
    return `Score ≥ ${nd.cutoffScore}`;
  }
}
