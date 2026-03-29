import { Module } from '@nestjs/common';
import { EconomyController } from './economy.controller';
import { EconomyService } from './economy.service';
import { WalletRepository } from './wallet.repository';

@Module({
  controllers: [EconomyController],
  providers: [EconomyService, WalletRepository],
  exports: [EconomyService],
})
export class EconomyModule {}
