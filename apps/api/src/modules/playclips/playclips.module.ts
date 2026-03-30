import { Module } from '@nestjs/common';
import { PlayClipsController } from './playclips.controller';
import { PlayClipsService } from './playclips.service';
import { PlayClipsRepository } from './playclips.repository';
import { EconomyModule } from '../economy/economy.module';

@Module({
  imports: [EconomyModule],
  controllers: [PlayClipsController],
  providers: [PlayClipsService, PlayClipsRepository],
  exports: [PlayClipsService, PlayClipsRepository],
})
export class PlayClipsModule {}
