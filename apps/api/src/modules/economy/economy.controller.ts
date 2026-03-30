import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  HttpCode,
  Query,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EconomyService } from './economy.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import type {
  WalletBalance,
  CoinTransaction,
  EarnRate,
  RewardRule,
  RewardContext,
  RewardPreviewResult,
} from '@euphoria/types';

class UpdateEarnRateDto {
  amount?: number;
  enabled?: boolean;
}

@ApiTags('economy')
@Controller('economy')
export class EconomyController {
  constructor(private readonly economyService: EconomyService) {}

  @Get('balance')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current coin balance' })
  getBalance(@CurrentUser() user: JwtPayload): Promise<WalletBalance> {
    return this.economyService.getBalance(user.sub);
  }

  @Get('transactions')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get coin transaction history' })
  getTransactions(
    @CurrentUser() user: JwtPayload,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ): Promise<{ transactions: CoinTransaction[]; page: number; limit: number }> {
    return this.economyService.getTransactionHistory(user.sub, page, limit);
  }

  @Get('earn-rates')
  @ApiOperation({ summary: 'List all earn rates (legacy)' })
  getEarnRates(): Promise<EarnRate[]> {
    return this.economyService.getEarnRates();
  }

  @Patch('earn-rates/:key')
  @ApiOperation({ summary: 'Update an earn rate (legacy admin)' })
  updateEarnRate(
    @Param('key') key: string,
    @Body() body: UpdateEarnRateDto,
  ): Promise<EarnRate> {
    return this.economyService.updateEarnRate(key, body);
  }

  // ---------------------------------------------------------------------------
  // Reward rules
  // ---------------------------------------------------------------------------

  @Get('reward-rules')
  @ApiOperation({ summary: 'List all reward rules' })
  getRules(): Promise<RewardRule[]> {
    return this.economyService.getRules();
  }

  @Post('reward-rules')
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a new reward rule' })
  createRule(
    @Body() body: Omit<RewardRule, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<RewardRule> {
    return this.economyService.createRule(body);
  }

  @Patch('reward-rules/:id')
  @ApiOperation({ summary: 'Update a reward rule' })
  updateRule(
    @Param('id') id: string,
    @Body() body: Partial<RewardRule>,
  ): Promise<RewardRule> {
    return this.economyService.updateRule(id, body);
  }

  @Delete('reward-rules/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a reward rule' })
  deleteRule(@Param('id') id: string): Promise<void> {
    return this.economyService.deleteRule(id);
  }

  @Post('reward-rules/preview')
  @ApiOperation({ summary: 'Preview reward calculation for a given context' })
  previewReward(@Body() body: RewardContext): Promise<RewardPreviewResult> {
    return this.economyService.previewReward(body);
  }
}
