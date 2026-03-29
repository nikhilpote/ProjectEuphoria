import type { GameRendererComponent } from './types';
import { TriviaGame } from './trivia/TriviaGame';
import { QuickMathGame } from './quick-math/QuickMathGame';

/**
 * Registry maps gameType string → renderer component.
 * To add a new game: implement GameRendererComponent, import here, add entry.
 * Server activates games via show config — no app update needed for new instances.
 */
const GAME_REGISTRY: Record<string, GameRendererComponent> = {
  trivia: TriviaGame,
  quick_math: QuickMathGame,
};

export function getGameRenderer(gameType: string): GameRendererComponent | null {
  return GAME_REGISTRY[gameType] ?? null;
}
