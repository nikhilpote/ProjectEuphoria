import type { GameAnswer } from '@euphoria/types';

/**
 * Contract every game type must implement.
 *
 * Register handlers in GamesModule.onModuleInit — ShowOrchestrator and
 * ShowGateway consume them via GameRegistry without knowing the concrete type.
 *
 * Rules:
 * - buildClientPayload MUST NOT include any correct-answer fields.
 * - buildQuestionEvent payload is broadcast to all players; same rule applies.
 * - isCorrect is the single source of truth for answer evaluation.
 */
export abstract class BaseGameHandler {
  abstract readonly type: string;

  /**
   * Client-safe display data extracted from the inline round config.
   * Returned as the `gamePayload` field in ShowContentEvent — pre-loaded
   * during lobby before any round begins.
   * NEVER include correct answers.
   */
  abstract buildClientPayload(config: Record<string, unknown>): Record<string, unknown>;

  /**
   * Payload for the `round_question` event, emitted after `questionSpawnAt`
   * seconds into the video. May overlap with buildClientPayload fields;
   * the question event is sent live with authoritative timing context.
   */
  abstract buildQuestionEvent(
    config: Record<string, unknown>,
    context: { showId: string; roundIndex: number; timeLimitMs: number },
  ): Record<string, unknown>;

  /** Return true if the submitted answer is correct. */
  abstract isCorrect(config: Record<string, unknown>, answer: GameAnswer): boolean;

  /** Human-readable correct answer text included in the round_result event. */
  abstract getCorrectAnswerText(config: Record<string, unknown>): string;
}
