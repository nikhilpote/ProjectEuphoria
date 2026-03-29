import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import type { AuthenticatedUser } from '@euphoria/types';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): Promise<AuthenticatedUser> {
    const email = profile.emails?.[0]?.value;
    const displayName = profile.displayName ?? email ?? 'User';
    const avatarUrl = profile.photos?.[0]?.value ?? undefined;

    if (!email) {
      throw new Error('Google profile did not include an email address');
    }

    return this.authService.findOrCreateUser({
      provider: 'google',
      providerId: profile.id,
      email,
      displayName,
      avatarUrl,
    });
  }
}
