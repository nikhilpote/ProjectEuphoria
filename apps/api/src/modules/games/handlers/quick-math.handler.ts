import { BaseGameHandler } from '../base-game-handler';
import type { GameAnswer, QuickMathAnswer } from '@euphoria/types';

/**
 * Inline quick_math config shape stored in game_sequence JSONB under config.quickMath.
 * Uses the same selectedOptionId pattern as trivia for UI consistency —
 * the client presents 4 numeric choices as option buttons, not a free-input field.
 */
interface InlineQuickMath {
  expression: string;   // e.g. "12 × 7"
  options: string[];    // 4 answer choices as strings, e.g. ["84", "78", "91", "72"]
  correctIndex: number; // 0–3
}

export class QuickMathHandler extends BaseGameHandler {
  readonly type = 'quick_math';

  buildClientPayload(config: Record<string, unknown>): Record<string, unknown> {
    const qm = config['quickMath'] as InlineQuickMath | undefined;
    if (!qm) return {};
    return {
      expression: qm.expression,
      options: qm.options,
    };
  }

  buildQuestionEvent(
    config: Record<string, unknown>,
    { showId, roundIndex, timeLimitMs }: { showId: string; roundIndex: number; timeLimitMs: number },
  ): Record<string, unknown> {
    const qm = config['quickMath'] as InlineQuickMath | undefined;
    if (!qm) return {};
    return {
      showId,
      roundIndex,
      expression: qm.expression,
      options: qm.options,
      timeLimitMs,
    };
  }

  isCorrect(config: Record<string, unknown>, answer: GameAnswer): boolean {
    const qm = config['quickMath'] as InlineQuickMath | undefined;
    if (!qm) return false;
    const selectedOptionId = (answer as QuickMathAnswer).selectedOptionId;
    if (selectedOptionId === undefined) return false;
    return parseInt(selectedOptionId, 10) === qm.correctIndex;
  }

  getCorrectAnswerText(config: Record<string, unknown>): string {
    const qm = config['quickMath'] as InlineQuickMath | undefined;
    if (!qm) return '';
    return qm.options[qm.correctIndex] ?? '';
  }
}
