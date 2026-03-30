import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ShowModule } from '../show/show.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { PlayClipsModule } from '../playclips/playclips.module';
import { TranscodeService } from '../../common/transcode/transcode.service';
import { StorageService } from '../../common/storage/storage.service';

@Module({
  imports: [ShowModule, FeatureFlagsModule, PlayClipsModule],
  controllers: [AdminController],
  providers: [AdminService, TranscodeService, StorageService],
})
export class AdminModule {}
