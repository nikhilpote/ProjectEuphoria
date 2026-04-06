import { BaseGameHandler } from '../base-game-handler';
import type { GameAnswer } from '@euphoria/types';

interface EmojiPuzzleAnswer {
  correct?: boolean;
  score?: number;
  timeTakenMs?: number;
}

export class EmojiPuzzleHandler extends BaseGameHandler {
  readonly type = 'emoji-puzzle';

  private unwrap(config: Record<string, unknown>): Record<string, unknown> {
    return (config['emojiPuzzle'] as Record<string, unknown>) ?? config;
  }

  buildClientPayload(config: Record<string, unknown>): Record<string, unknown> {
    const g = this.unwrap(config);
    return {
      requiredScore: g['requiredScore'] ?? 4,
      level: g['level'] ?? 0,
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
      requiredScore: g['requiredScore'] ?? 4,
      level: g['level'] ?? 0,
    };
  }

  isCorrect(_config: Record<string, unknown>, answer: GameAnswer): boolean {
    return (answer as EmojiPuzzleAnswer).correct === true;
  }

  getCorrectAnswerText(config: Record<string, unknown>): string {
    const g = this.unwrap(config);
    return `Match ${g['requiredScore'] ?? 4} pairs`;
  }
}
