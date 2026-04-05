import { BaseGameHandler } from '../base-game-handler';
import type { GameAnswer } from '@euphoria/types';

/**
 * Hangman — word-guessing game.
 *
 * Config in game_sequence JSONB: { hangman: { category: 'Animals' } }
 * Show orchestrator resolves a random level from game_levels where
 * config->>'clue' matches the chosen category, then merges { clue, answer }
 * into the hangman config before calling buildQuestionEvent.
 *
 * Answer from client: { won: boolean, guesses: string[], ... }
 * Elimination: player passes if won === true.
 */
interface ResolvedHangman {
  category?: string;
  clue?: string;
  answer?: string;
}

interface HangmanAnswer {
  won?: boolean;
  guesses?: string[];
  attemptsUsed?: number;
}

export class HangmanHandler extends BaseGameHandler {
  readonly type = 'hangman';

  buildClientPayload(config: Record<string, unknown>): Record<string, unknown> {
    const h = config['hangman'] as ResolvedHangman | undefined;
    if (!h) return {};
    // Only send category for preload — answer is never exposed pre-round
    return { category: h.category };
  }

  buildQuestionEvent(
    config: Record<string, unknown>,
    { showId, roundIndex, timeLimitMs }: { showId: string; roundIndex: number; timeLimitMs: number },
  ): Record<string, unknown> {
    const h = config['hangman'] as ResolvedHangman | undefined;
    if (!h) return {};
    return {
      showId,
      roundIndex,
      timeLimitMs,
      clue: h.clue,
      answer: h.answer,
    };
  }

  isCorrect(_config: Record<string, unknown>, answer: GameAnswer): boolean {
    const submitted = answer as HangmanAnswer;
    return submitted.won === true;
  }

  getCorrectAnswerText(config: Record<string, unknown>): string {
    const h = config['hangman'] as ResolvedHangman | undefined;
    return h?.answer ?? 'Unknown';
  }
}
