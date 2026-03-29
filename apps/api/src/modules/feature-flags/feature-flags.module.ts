import { Module } from '@nestjs/common';
import {
  FeatureFlagsController,
  AdminFeatureFlagsController,
  PublicFeatureFlagsController,
} from './feature-flags.controller';
import { FeatureFlagsService } from './feature-flags.service';

@Module({
  controllers: [
    FeatureFlagsController,          // GET /feature-flags (legacy)
    AdminFeatureFlagsController,     // GET|PUT /admin/flags[/:key]
    PublicFeatureFlagsController,    // GET /flags/public
  ],
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
