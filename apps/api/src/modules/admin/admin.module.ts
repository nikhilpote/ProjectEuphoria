import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ShowModule } from '../show/show.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { TranscodeService } from '../../common/transcode/transcode.service';

@Module({
  imports: [ShowModule, FeatureFlagsModule],
  controllers: [AdminController],
  providers: [AdminService, TranscodeService],
})
export class AdminModule {}
