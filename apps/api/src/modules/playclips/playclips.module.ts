import { Module } from '@nestjs/common';
import { PlayClipsController } from './playclips.controller';
import { PlayClipsService } from './playclips.service';
import { PlayClipsRepository } from './playclips.repository';

@Module({
  controllers: [PlayClipsController],
  providers: [PlayClipsService, PlayClipsRepository],
  exports: [PlayClipsService],
})
export class PlayClipsModule {}
