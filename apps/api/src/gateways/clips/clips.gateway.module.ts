import { Module } from '@nestjs/common';
import { ClipsGateway } from './clips.gateway';
import { AuthModule } from '../../modules/auth/auth.module';
import { PlayClipsModule } from '../../modules/playclips/playclips.module';
import { GamesModule } from '../../modules/games/games.module';
import { GamePackagesModule } from '../../modules/game-packages/game-packages.module';

@Module({
  imports: [AuthModule, PlayClipsModule, GamesModule, GamePackagesModule],
  providers: [ClipsGateway],
  exports: [ClipsGateway],
})
export class ClipsGatewayModule {}
