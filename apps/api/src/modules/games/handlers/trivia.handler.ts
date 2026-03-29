import { BaseGameHandler } from '../base-game-handler';
import type { GameAnswer, TriviaAnswer } from '@euphoria/types';

/**
 * Inline trivia config shape stored in game_sequence JSONB under config.trivia.
 * This is the server-side inline format — distinct from the TriviaConfig type
 * in @euphoria/types which describes the external API/DB shape.
 */
interface InlineTrivia {
  question: { text: string; imageUrl?: string | null };
  options: Array<{ text: string; imageUrl?: string | null }>;
  correctIndex: number;
}

export class TriviaHandler extends BaseGameHandler {
  readonly type = 'trivia';

  buildClientPayload(config: Record<string, unknown>): Record<string, unknown> {
    const trivia = config['trivia'] as InlineTrivia | undefined;
    if (!trivia) return {};
    return {
      question: trivia.question.text,
      questionImageUrl: trivia.question.imageUrl ?? null,
      options: trivia.options.map((o) => o.text),
      optionImageUrls: trivia.options.map((o) => o.imageUrl ?? null),
      category: null,
      difficulty: 1,
    };
  }

  buildQuestionEvent(
    config: Record<string, unknown>,
    { showId, roundIndex, timeLimitMs }: { showId: string; roundIndex: number; timeLimitMs: number },
  ): Record<string, unknown> {
    const trivia = config['trivia'] as InlineTrivia | undefined;
    if (!trivia) return {};
    return {
      showId,
      roundIndex,
      question: trivia.question.text,
      options: trivia.options.map((o) => o.text),
      questionImageUrl: trivia.question.imageUrl ?? null,
      optionImageUrls: trivia.options.map((o) => o.imageUrl ?? null),
      category: null,
      difficulty: 1,
      timeLimitMs,
    };
  }

  isCorrect(config: Record<string, unknown>, answer: GameAnswer): boolean {
    const trivia = config['trivia'] as InlineTrivia | undefined;
    if (!trivia) return false;
    const selectedOptionId = (answer as TriviaAnswer).selectedOptionId;
    if (selectedOptionId === undefined) return false;
    return parseInt(selectedOptionId, 10) === trivia.correctIndex;
  }

  getCorrectAnswerText(config: Record<string, unknown>): string {
    const trivia = config['trivia'] as InlineTrivia | undefined;
    if (!trivia) return '';
    return trivia.options[trivia.correctIndex]?.text ?? '';
  }
}
