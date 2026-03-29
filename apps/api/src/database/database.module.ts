import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { DB } from './schema';

export const KYSELY_TOKEN = 'KYSELY_DB';

@Global()
@Module({
  providers: [
    {
      provide: KYSELY_TOKEN,
      useFactory: (configService: ConfigService): Kysely<DB> => {
        const pool = new Pool({
          connectionString: configService.getOrThrow<string>('DATABASE_URL'),
          min: configService.get<number>('DATABASE_POOL_MIN', 2),
          max: configService.get<number>('DATABASE_POOL_MAX', 50),
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 5_000,
        });

        return new Kysely<DB>({
          dialect: new PostgresDialect({ pool }),
          log: (event) => {
            if (
              process.env['NODE_ENV'] === 'development' &&
              event.level === 'error'
            ) {
              console.error('Kysely query error:', event.error);
            }
          },
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [KYSELY_TOKEN],
})
export class DatabaseModule {}
