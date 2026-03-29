import { Injectable, Inject } from '@nestjs/common';
import { Kysely } from 'kysely';
import { DB } from '../../database/schema';
import { KYSELY_TOKEN } from '../../database/database.module';
import type { CreateUserPayload, UpgradeGuestPayload } from '@euphoria/types';

@Injectable()
export class UserRepository {
  constructor(
    @Inject(KYSELY_TOKEN)
    private readonly db: Kysely<DB>,
  ) {}

  async findById(id: string) {
    return this.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async findByEmail(email: string) {
    return this.db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', email)
      .executeTakeFirst();
  }

  async findByAppleId(appleId: string) {
    return this.db
      .selectFrom('users')
      .selectAll()
      .where('apple_id', '=', appleId)
      .executeTakeFirst();
  }

  async findByGoogleId(googleId: string) {
    return this.db
      .selectFrom('users')
      .selectAll()
      .where('google_id', '=', googleId)
      .executeTakeFirst();
  }

  async create(payload: CreateUserPayload) {
    return this.db
      .insertInto('users')
      .values({
        email: payload.email ?? null,
        display_name: payload.displayName,
        avatar_url: payload.avatarUrl ?? null,
        apple_id: payload.provider === 'apple' ? (payload.providerId ?? null) : null,
        google_id: payload.provider === 'google' ? (payload.providerId ?? null) : null,
        social_provider: payload.provider ?? null,
        is_guest: payload.isGuest ?? false,
        coin_balance: 0,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /**
   * Link a social identity to an existing guest account, clearing the guest flag.
   * Returns the updated row.
   */
  async linkSocialIdentity(payload: UpgradeGuestPayload) {
    return this.db
      .updateTable('users')
      .set({
        ...(payload.provider === 'apple'
          ? { apple_id: payload.socialId }
          : { google_id: payload.socialId }),
        social_provider: payload.provider,
        is_guest: false,
        ...(payload.email ? { email: payload.email } : {}),
        ...(payload.displayName ? { display_name: payload.displayName } : {}),
        ...(payload.avatarUrl !== undefined ? { avatar_url: payload.avatarUrl } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', payload.guestUserId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateDisplayName(id: string, displayName: string) {
    return this.db
      .updateTable('users')
      .set({ display_name: displayName, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateAvatarUrl(id: string, avatarUrl: string | null) {
    return this.db
      .updateTable('users')
      .set({ avatar_url: avatarUrl, updated_at: new Date() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
