import { Module } from '@nestjs/common';
import { PlayClipsController } from './playclips.controller';
import { PlayClipsService } from './playclips.service';
import { PlayClipsRepository } from './playclips.repository';
import { EconomyModule } from '../economy/economy.module';
import { GamePackagesModule } from '../game-packages/game-packages.module';

@Module({
  imports: [EconomyModule, GamePackagesModule],
  controllers: [PlayClipsController],
  providers: [PlayClipsService, PlayClipsRepository],
  exports: [PlayClipsService, PlayClipsRepository],
})
export class PlayClipsModule {}
