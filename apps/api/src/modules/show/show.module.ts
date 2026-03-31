import { Module } from '@nestjs/common';
import { ShowController } from './show.controller';
import { ShowService } from './show.service';
import { ShowRepository } from './show.repository';
import { ShowOrchestrator } from './show.orchestrator';
import { ShowSchedulerService } from './show.scheduler';
import { EconomyModule } from '../economy/economy.module';
import { GamesModule } from '../games/games.module';
import { GamePackagesModule } from '../game-packages/game-packages.module';
import { AdminGuard } from '../../common/guards/admin.guard';

@Module({
  imports: [EconomyModule, GamesModule, GamePackagesModule],
  controllers: [ShowController],
  providers: [ShowService, ShowRepository, ShowOrchestrator, ShowSchedulerService, AdminGuard],
  exports: [ShowService, ShowRepository, ShowOrchestrator, ShowSchedulerService],
})
export class ShowModule {}
