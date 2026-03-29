import { Module } from '@nestjs/common';
import { ShowGateway } from './show.gateway';
import { ShowModule } from '../../modules/show/show.module';
import { AuthModule } from '../../modules/auth/auth.module';
import { GamesModule } from '../../modules/games/games.module';
import { GamePackagesModule } from '../../modules/game-packages/game-packages.module';

/**
 * ShowGatewayModule — wires the WebSocket gateway for live show play.
 *
 * Imports ShowModule to access ShowRepository and ShowOrchestrator.
 * Imports AuthModule to access JwtService for socket-level JWT verification.
 * Imports GamesModule to access GameRegistry for building show_content payloads on join.
 * Imports GamePackagesModule to resolve bundleUrls for WebView game rounds.
 */
@Module({
  imports: [ShowModule, AuthModule, GamesModule, GamePackagesModule],
  providers: [ShowGateway],
  exports: [ShowGateway],
})
export class ShowGatewayModule {}
