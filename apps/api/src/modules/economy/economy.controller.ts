import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EconomyService } from './economy.service';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import type { WalletBalance, CoinTransaction } from '@euphoria/types';

@ApiTags('economy')
@ApiBearerAuth()
@Controller('economy')
export class EconomyController {
  constructor(private readonly economyService: EconomyService) {}

  @Get('balance')
  @ApiOperation({ summary: 'Get current coin balance' })
  getBalance(@CurrentUser() user: JwtPayload): Promise<WalletBalance> {
    return this.economyService.getBalance(user.sub);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Get coin transaction history' })
  getTransactions(
    @CurrentUser() user: JwtPayload,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ): Promise<{ transactions: CoinTransaction[]; page: number; limit: number }> {
    return this.economyService.getTransactionHistory(user.sub, page, limit);
  }
}
