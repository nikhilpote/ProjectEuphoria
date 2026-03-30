import { Module } from '@nestjs/common';
import { EconomyController } from './economy.controller';
import { EconomyService } from './economy.service';
import { WalletRepository } from './wallet.repository';
import { EarnRatesRepository } from './earn-rates.repository';
import { RewardRulesRepository } from './reward-rules.repository';
import { RewardEngineService } from './reward-engine.service';

@Module({
  controllers: [EconomyController],
  providers: [
    EconomyService,
    WalletRepository,
    EarnRatesRepository,
    RewardRulesRepository,
    RewardEngineService,
  ],
  exports: [EconomyService],
})
export class EconomyModule {}
