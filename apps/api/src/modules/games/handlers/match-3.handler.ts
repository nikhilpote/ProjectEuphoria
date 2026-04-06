import { BaseGameHandler } from '../base-game-handler';
import type { GameAnswer } from '@euphoria/types';

interface Match3Answer {
  correct?: boolean;
  score?: number;
  timeTakenMs?: number;
}

export class Match3Handler extends BaseGameHandler {
  readonly type = 'match-3';

  private unwrap(config: Record<string, unknown>): Record<string, unknown> {
    return (config['match3'] as Record<string, unknown>) ?? config;
  }

  buildClientPayload(config: Record<string, unknown>): Record<string, unknown> {
    const g = this.unwrap(config);
    return { requiredScore: g['requiredScore'] ?? 500 };
  }

  buildQuestionEvent(
    config: Record<string, unknown>,
    { showId, roundIndex, timeLimitMs }: { showId: string; roundIndex: number; timeLimitMs: number },
  ): Record<string, unknown> {
    const g = this.unwrap(config);
    return { showId, roundIndex, timeLimitMs, requiredScore: g['requiredScore'] ?? 500 };
  }

  isCorrect(_config: Record<string, unknown>, answer: GameAnswer): boolean {
    return (answer as Match3Answer).correct === true;
  }

  getCorrectAnswerText(config: Record<string, unknown>): string {
    const g = this.unwrap(config);
    return `Score ${g['requiredScore'] ?? 500} points`;
  }
}
