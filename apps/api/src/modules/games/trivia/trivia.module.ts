import { Module } from '@nestjs/common';
import { TriviaController } from './trivia.controller';
import { TriviaService } from './trivia.service';
import { FeatureFlagsModule } from '../../feature-flags/feature-flags.module';

@Module({
  imports: [FeatureFlagsModule], // provides FeatureFlagsService
  controllers: [TriviaController],
  providers: [TriviaService],
  exports: [TriviaService], // exposed for ShowGateway if needed later
})
export class TriviaModule {}
