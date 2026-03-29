import { Injectable, Logger } from '@nestjs/common';
import { BaseGameHandler } from './base-game-handler';
import type { GameAnswer } from '@euphoria/types';

/**
 * GameRegistry — central lookup for all registered game type handlers.
 *
 * Handlers are registered in GamesModule.onModuleInit. The registry is
 * exported from GamesModule and injected wherever game-type dispatch is needed
 * (ShowOrchestrator, ShowGateway) without creating circular dependencies.
 *
 * All methods are null-safe: unknown game types return sensible zero-values
 * so callers do not need to guard every call site.
 */
@Injectable()
export class GameRegistry {
  private readonly logger = new Logger(GameRegistry.name);
  private readonly handlers = new Map<string, BaseGameHandler>();

  register(handler: BaseGameHandler): void {
    this.handlers.set(handler.type, handler);
    this.logger.log(`Registered game handler: ${handler.type}`);
  }

  get(type: string): BaseGameHandler | null {
    return this.handlers.get(type) ?? null;
  }

  getTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  buildClientPayload(type: string, config: Record<string, unknown>): Record<string, unknown> {
    return this.get(type)?.buildClientPayload(config) ?? {};
  }

  buildQuestionEvent(
    type: string,
    config: Record<string, unknown>,
    context: { showId: string; roundIndex: number; timeLimitMs: number },
  ): Record<string, unknown> | null {
    return this.get(type)?.buildQuestionEvent(config, context) ?? null;
  }

  isCorrect(type: string, config: Record<string, unknown>, answer: GameAnswer): boolean {
    return this.get(type)?.isCorrect(config, answer) ?? false;
  }

  getCorrectAnswerText(type: string, config: Record<string, unknown>): string {
    return this.get(type)?.getCorrectAnswerText(config) ?? '';
  }
}
