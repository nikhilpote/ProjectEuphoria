import { BaseGameHandler } from '../base-game-handler';
import type { GameAnswer } from '@euphoria/types';

/**
 * Wording — word-finding game.
 *
 * Config: { wording: { requiredScore: number, levelId: string } }
 * The show orchestrator resolves the levelId from game_levels table and merges
 * the full config (board, words) into the question event.
 *
 * Answer from client: { correct: boolean, score: number, timeTakenMs: number }
 * Elimination: player passes if correct === true (reached requiredScore).
 */

interface WordingAnswer {
  correct?: boolean;
  score?: number;
  timeTakenMs?: number;
}

export class WordingHandler extends BaseGameHandler {
  readonly type = 'wording';

  private unwrap(config: Record<string, unknown>): Record<string, unknown> {
    return (config['wording'] as Record<string, unknown>) ?? config;
  }

  buildClientPayload(config: Record<string, unknown>): Record<string, unknown> {
    const g = this.unwrap(config);
    return {
      requiredScore: g['requiredScore'] ?? 10,
    };
  }

  buildQuestionEvent(
    config: Record<string, unknown>,
    { showId, roundIndex, timeLimitMs }: { showId: string; roundIndex: number; timeLimitMs: number },
  ): Record<string, unknown> {
    const g = this.unwrap(config);
    return {
      showId,
      roundIndex,
      timeLimitMs,
      requiredScore: g['requiredScore'] ?? 10,
      board: g['board'] ?? '',
      words: g['words'] ?? [],
    };
  }

  isCorrect(_config: Record<string, unknown>, answer: GameAnswer): boolean {
    return (answer as WordingAnswer).correct === true;
  }

  getCorrectAnswerText(config: Record<string, unknown>): string {
    const g = this.unwrap(config);
    return `Score ${g['requiredScore'] ?? 10} points`;
  }
}
