import { BaseGameHandler } from '../base-game-handler';
import type { GameAnswer } from '@euphoria/types';

/**
 * Knife at Center — skill game.
 *
 * Config in game_sequence JSONB: { knifeAtCenter: { level: 'Level5' } }
 * Show orchestrator resolves the level from game_levels table and merges
 * the full config (wheelSprite, rotation, knives, apples, throwCount) into
 * knifeAtCenter before calling buildQuestionEvent.
 *
 * Answer from client: { correct: boolean, score: number, ... }
 * Elimination: player passes if correct === true (all knives stuck).
 */
interface ResolvedKnifeAtCenter {
  level: string;
  wheelSprite?: string;
  rotationType?: string;
  rotationSpeed?: number;
  oscillationPeriod?: number;
  oscillationMagnitude?: number;
  throwCount?: number;
  preplacedKnives?: Array<{ angleDeg: number }>;
  apples?: Array<{ x: number; y: number }>;
  knifeSkin?: number;
}

interface KnifeAtCenterAnswer {
  correct?: boolean;
  score?: number;
  knivesStuck?: number;
  applesCollected?: number;
}

export class KnifeAtCenterHandler extends BaseGameHandler {
  readonly type = 'knife_at_center';

  buildClientPayload(config: Record<string, unknown>): Record<string, unknown> {
    const kac = config['knifeAtCenter'] as ResolvedKnifeAtCenter | undefined;
    if (!kac) return {};
    // Only send level name for preload — full config sent via round_question
    return { level: kac.level };
  }

  buildQuestionEvent(
    config: Record<string, unknown>,
    { showId, roundIndex, timeLimitMs }: { showId: string; roundIndex: number; timeLimitMs: number },
  ): Record<string, unknown> {
    const kac = config['knifeAtCenter'] as ResolvedKnifeAtCenter | undefined;
    if (!kac) return {};
    // Send full resolved level config — the game HTML receives this directly
    return {
      showId,
      roundIndex,
      timeLimitMs,
      wheelSprite: kac.wheelSprite,
      rotationType: kac.rotationType,
      rotationSpeed: kac.rotationSpeed,
      oscillationPeriod: kac.oscillationPeriod,
      oscillationMagnitude: kac.oscillationMagnitude,
      throwCount: kac.throwCount,
      preplacedKnives: kac.preplacedKnives,
      apples: kac.apples,
      knifeSkin: kac.knifeSkin,
    };
  }

  isCorrect(_config: Record<string, unknown>, answer: GameAnswer): boolean {
    const submitted = answer as KnifeAtCenterAnswer;
    return submitted.correct === true;
  }

  getCorrectAnswerText(_config: Record<string, unknown>): string {
    return 'Clear the level — stick all knives!';
  }
}
