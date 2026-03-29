import { Injectable, Inject } from '@nestjs/common';
import { Kysely, Selectable } from 'kysely';
import { DB, GamePackagesTable } from '../../database/schema';
import { KYSELY_TOKEN } from '../../database/database.module';

export type GamePackageRow = Selectable<GamePackagesTable>;

@Injectable()
export class GamePackagesRepository {
  constructor(@Inject(KYSELY_TOKEN) private readonly db: Kysely<DB>) {}

  findAll(): Promise<GamePackageRow[]> {
    return this.db
      .selectFrom('game_packages')
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();
  }

  findEnabled(): Promise<GamePackageRow[]> {
    return this.db
      .selectFrom('game_packages')
      .selectAll()
      .where('is_enabled', '=', true)
      .orderBy('created_at', 'desc')
      .execute();
  }

  async findById(id: string): Promise<GamePackageRow | null> {
    const row = await this.db
      .selectFrom('game_packages')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    return row ?? null;
  }

  create(data: {
    id: string;
    name: string;
    version: string;
    description: string | null;
    manifest: object;
    bundleUrl: string;
    thumbnailUrl: string | null;
  }): Promise<GamePackageRow> {
    return this.db
      .insertInto('game_packages')
      .values({
        id: data.id,
        name: data.name,
        version: data.version,
        description: data.description,
        is_enabled: false,
        manifest: JSON.stringify(data.manifest),
        bundle_url: data.bundleUrl,
        thumbnail_url: data.thumbnailUrl,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  setEnabled(id: string, isEnabled: boolean): Promise<GamePackageRow> {
    return this.db
      .updateTable('game_packages')
      .set({ is_enabled: isEnabled, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom('game_packages').where('id', '=', id).execute();
  }
}
