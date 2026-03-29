import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRepository } from './user.repository';
import type { CreateUserPayload, AuthenticatedUser, UpgradeGuestPayload } from '@euphoria/types';

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async findById(id: string): Promise<AuthenticatedUser | null> {
    const user = await this.userRepository.findById(id);
    return user ? this.toAuthenticatedUser(user) : null;
  }

  async findOrCreate(payload: CreateUserPayload): Promise<AuthenticatedUser> {
    // Look up by provider ID first (fastest path, handles email changes)
    let existing =
      payload.provider === 'apple' && payload.providerId
        ? await this.userRepository.findByAppleId(payload.providerId)
        : payload.provider === 'google' && payload.providerId
          ? await this.userRepository.findByGoogleId(payload.providerId)
          : null;

    // Fallback: email match (e.g. user previously used a different provider)
    if (!existing && payload.email) {
      existing = await this.userRepository.findByEmail(payload.email);
    }

    if (existing) {
      return this.toAuthenticatedUser(existing);
    }

    const created = await this.userRepository.create(payload);
    return this.toAuthenticatedUser(created);
  }

  async createGuestAccount(displayName: string): Promise<AuthenticatedUser> {
    const created = await this.userRepository.create({
      displayName,
      provider: 'guest',
      isGuest: true,
    });
    return this.toAuthenticatedUser(created);
  }

  async upgradeGuestToSocial(payload: UpgradeGuestPayload): Promise<AuthenticatedUser> {
    const updated = await this.userRepository.linkSocialIdentity(payload);
    return this.toAuthenticatedUser(updated);
  }

  async getProfile(id: string): Promise<AuthenticatedUser> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  private toAuthenticatedUser(row: {
    id: string;
    email: string | null;
    display_name: string;
    avatar_url: string | null;
    coin_balance: number;
    is_guest: boolean;
    created_at: Date;
  }): AuthenticatedUser {
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      coinBalance: row.coin_balance,
      isGuest: row.is_guest,
      createdAt: row.created_at.toISOString(),
    };
  }
}
