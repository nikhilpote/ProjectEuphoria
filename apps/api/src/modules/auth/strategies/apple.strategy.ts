import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import Strategy from 'passport-apple';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import type { AuthenticatedUser } from '@euphoria/types';

interface AppleProfile {
  id: string;
  email?: string;
  name?: { firstName?: string; lastName?: string };
}

@Injectable()
export class AppleStrategy extends (PassportStrategy(Strategy as any, 'apple') as any) {
  constructor(
    configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: configService.getOrThrow<string>('APPLE_CLIENT_ID'),
      teamID: configService.getOrThrow<string>('APPLE_TEAM_ID'),
      keyID: configService.getOrThrow<string>('APPLE_KEY_ID'),
      privateKeyLocation: configService.getOrThrow<string>('APPLE_PRIVATE_KEY_PATH'),
      callbackURL: configService.getOrThrow<string>('APPLE_CALLBACK_URL'),
      passReqToCallback: false,
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    _idToken: string,
    profile: AppleProfile,
  ): Promise<AuthenticatedUser> {
    // Apple only sends name on first sign-in; must be stored then
    const email = profile.email ?? `apple.${profile.id}@placeholder.euphoria`;
    const firstName = profile.name?.firstName ?? '';
    const lastName = profile.name?.lastName ?? '';
    const displayName = [firstName, lastName].filter(Boolean).join(' ') || 'Player';

    return this.authService.findOrCreateUser({
      provider: 'apple',
      providerId: profile.id,
      email,
      displayName,
    });
  }
}
