import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { FeatureFlagsService } from './feature-flags.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import type { FeatureFlag, FeatureFlagsMap } from '@euphoria/types';

/** Keys that are safe to expose to unauthenticated clients */
const PUBLIC_FLAG_KEYS = [
  'coin_earn_rate_multiplier',
  'retry_max_per_show',
  'playclip_streak_multipliers',
  'trivia_time_limit_ms',
] as const;

class UpdateFlagDto {
  value!: boolean | string | number;
  description?: string;
}

// ---------------------------------------------------------------------------
// Admin endpoints — require a valid JWT (global JwtAuthGuard applies)
// ---------------------------------------------------------------------------

@ApiTags('admin / feature-flags')
@ApiBearerAuth()
@Controller('admin/flags')
export class AdminFeatureFlagsController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all feature flags (admin)' })
  getAll(): Promise<FeatureFlag[]> {
    return this.featureFlagsService.getAllFull();
  }

  @Get(':key')
  @ApiOperation({ summary: 'Get a single feature flag by key (admin)' })
  async getOne(@Param('key') key: string): Promise<FeatureFlag> {
    const flag = await this.featureFlagsService.getOne(key);
    if (!flag) throw new NotFoundException(`Feature flag "${key}" not found`);
    return flag;
  }

  @Put(':key')
  @ApiOperation({ summary: 'Update a feature flag value (admin)' })
  @ApiBody({ type: UpdateFlagDto })
  update(
    @Param('key') key: string,
    @Body() body: UpdateFlagDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<FeatureFlag> {
    return this.featureFlagsService.set(key, body.value, user.email, body.description);
  }
}

// ---------------------------------------------------------------------------
// Public endpoint — no auth required
// ---------------------------------------------------------------------------

@ApiTags('feature-flags')
@Controller('flags')
export class PublicFeatureFlagsController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  /**
   * Client-safe flag subset. Returns only the keys in PUBLIC_FLAG_KEYS.
   * No authentication required — called during app bootstrap.
   */
  @Public()
  @Get('public')
  @ApiOperation({ summary: 'Get client-safe feature flags (no auth required)' })
  getPublic(): Promise<FeatureFlagsMap> {
    return this.featureFlagsService.getAll([...PUBLIC_FLAG_KEYS]);
  }
}

// ---------------------------------------------------------------------------
// Legacy controller kept for backward compatibility
// GET /feature-flags — existing mobile clients may poll this
// ---------------------------------------------------------------------------

@ApiTags('feature-flags')
@Controller('feature-flags')
export class FeatureFlagsController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get all feature flags (client bootstrap) — deprecated, use /flags/public' })
  getAll(): Promise<FeatureFlagsMap> {
    return this.featureFlagsService.getAll();
  }
}
