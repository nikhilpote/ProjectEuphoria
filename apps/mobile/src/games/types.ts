import type { GameAnswer } from '@euphoria/types';

/**
 * Standard props every game renderer receives.
 * The show screen doesn't know which game is running — it just passes these props.
 */
export interface GameRendererProps {
  roundIndex: number;
  totalRounds: number;
  gameType: string;
  /** Client-safe display payload from server (no correct answers) */
  payload: Record<string, unknown>;
  timeLimitMs: number;
  playersRemaining: number;
  onSubmit: (answer: GameAnswer) => void;
  selectedAnswer: GameAnswer | null;
  isLocked: boolean;
  /** CloudFront URL to the game bundle's web/index.html. When present, renders via WebView. */
  bundleUrl?: string | null;
}

export type GameRendererComponent = React.ComponentType<GameRendererProps>;
