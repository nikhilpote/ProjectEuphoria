import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './database/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { ShowModule } from './modules/show/show.module';
import { EconomyModule } from './modules/economy/economy.module';
import { PlayClipsModule } from './modules/playclips/playclips.module';
import { AdminModule } from './modules/admin/admin.module';
import { FeatureFlagsModule } from './modules/feature-flags/feature-flags.module';
import { GamesModule } from './modules/games/games.module';
import { GamePackagesModule } from './modules/game-packages/game-packages.module';
import { ShowGatewayModule } from './gateways/show/show.gateway.module';
import { ClipsGatewayModule } from './gateways/clips/clips.gateway.module';
import { StorageModule } from './common/storage/storage.module';

@Module({
  imports: [
    // Config — must be first
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Logging
    WinstonModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        transports: [
          new winston.transports.Console({
            level: configService.get<string>('LOG_LEVEL', 'info'),
            format: winston.format.combine(
              winston.format.timestamp(),
              configService.get('NODE_ENV') === 'production'
                ? winston.format.json()
                : winston.format.prettyPrint(),
            ),
          }),
        ],
      }),
      inject: [ConfigService],
    }),

    // Rate limiting
    ThrottlerModule.forRootAsync({
      useFactory: (configService: ConfigService) => [
        {
          ttl: configService.get<number>('THROTTLE_TTL_SECONDS', 60) * 1000,
          limit: configService.get<number>('THROTTLE_LIMIT', 100),
        },
      ],
      inject: [ConfigService],
    }),

    // Scheduling
    ScheduleModule.forRoot(),

    // Infrastructure
    DatabaseModule,
    RedisModule,
    StorageModule,

    // Feature flags (must be before other modules that depend on flags)
    FeatureFlagsModule,

    // Domain modules
    AuthModule,
    UserModule,
    ShowModule,
    EconomyModule,
    PlayClipsModule,
    AdminModule,
    GamesModule,
    GamePackagesModule,

    // WebSocket Gateways
    ShowGatewayModule,
    ClipsGatewayModule,
  ],
})
export class AppModule {}
