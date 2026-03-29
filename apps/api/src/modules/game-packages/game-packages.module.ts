import { Module } from '@nestjs/common';
import { GamePackagesRepository } from './game-packages.repository';
import { GamePackagesService } from './game-packages.service';
import {
  AdminGamePackagesController,
  PublicGamePackagesController,
} from './game-packages.controller';

/**
 * GamePackagesModule — OTA game delivery.
 *
 * DatabaseModule and StorageModule are @Global(), so no explicit imports needed.
 * AdminGuard depends on ConfigService which is also global via ConfigModule.forRoot({ isGlobal: true }).
 */
@Module({
  controllers: [AdminGamePackagesController, PublicGamePackagesController],
  providers: [GamePackagesRepository, GamePackagesService],
  exports: [GamePackagesService],
})
export class GamePackagesModule {}
