import { Module, OnModuleInit } from '@nestjs/common';
import { TriviaModule } from './trivia/trivia.module';
import { GameRegistry } from './game-registry.service';
import { TriviaHandler } from './handlers/trivia.handler';
import { QuickMathHandler } from './handlers/quick-math.handler';
import { NumberDashHandler } from './handlers/number-dash.handler';

/**
 * GamesModule aggregates all mini-game sub-modules and the game handler registry.
 *
 * To add a new game type:
 *  1. Create apps/api/src/modules/games/handlers/<type>.handler.ts extending BaseGameHandler
 *  2. Import it here and call this.registry.register(new YourHandler()) in onModuleInit
 *  3. No other files need to change.
 */
@Module({
  imports: [TriviaModule],
  providers: [GameRegistry],
  exports: [TriviaModule, GameRegistry],
})
export class GamesModule implements OnModuleInit {
  constructor(private readonly registry: GameRegistry) {}

  onModuleInit(): void {
    this.registry.register(new TriviaHandler());
    this.registry.register(new QuickMathHandler());
    this.registry.register(new NumberDashHandler());
  }
}
