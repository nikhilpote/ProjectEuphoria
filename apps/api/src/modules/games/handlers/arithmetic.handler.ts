import { BaseGameHandler } from '../base-game-handler';
import type { GameAnswer } from '@euphoria/types';

interface ArithmeticAnswer {
  correct?: boolean;
  score?: number;
  timeTakenMs?: number;
}

export class ArithmeticHandler extends BaseGameHandler {
  readonly type = 'arithmetic';

  private unwrap(config: Record<string, unknown>): Record<string, unknown> {
    return (config['arithmetic'] as Record<string, unknown>) ?? config;
  }

  buildClientPayload(config: Record<string, unknown>): Record<string, unknown> {
    const g = this.unwrap(config);
    return {
      requiredScore: g['requiredScore'] ?? 10,
      difficulty: g['difficulty'] ?? 2,
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
      difficulty: g['difficulty'] ?? 2,
    };
  }

  isCorrect(_config: Record<string, unknown>, answer: GameAnswer): boolean {
    return (answer as ArithmeticAnswer).correct === true;
  }

  getCorrectAnswerText(config: Record<string, unknown>): string {
    const g = this.unwrap(config);
    return `Solve ${g['requiredScore'] ?? 10} equations`;
  }
}
