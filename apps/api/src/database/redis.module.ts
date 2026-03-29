import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

/** Returns a new Redis client — used for pub/sub subscribers that need a dedicated connection */
export const REDIS_SUBSCRIBER_FACTORY = 'REDIS_SUBSCRIBER_FACTORY';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService): Redis => {
        const client = new Redis(configService.getOrThrow<string>('REDIS_URL'), {
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          lazyConnect: false,
        });

        client.on('error', (err: Error) => {
          console.error('[Redis] Client error:', err.message);
        });

        client.on('connect', () => {
          console.log('[Redis] Connected');
        });

        return client;
      },
      inject: [ConfigService],
    },
    {
      provide: REDIS_SUBSCRIBER_FACTORY,
      useFactory: (configService: ConfigService) => {
        return (): Redis => {
          return new Redis(configService.getOrThrow<string>('REDIS_URL'), {
            maxRetriesPerRequest: null, // infinite retry for long-lived subscribers
            enableReadyCheck: true,
          });
        };
      },
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_CLIENT, REDIS_SUBSCRIBER_FACTORY],
})
export class RedisModule {}
