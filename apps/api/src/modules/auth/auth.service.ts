import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Kysely } from 'kysely';
import { JwksClient } from 'jwks-rsa';
import * as jwt from 'jsonwebtoken';
import { UserService } from '../user/user.service';
import { KYSELY_TOKEN } from '../../database/database.module';
import type {
  AuthTokens,
  AuthenticatedUser,
  AuthResponse,
  UserProfile,
} from '@euphoria/types';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import type { DB } from '../../database/schema';

/** Claims we extract from an Apple id_token */
interface AppleIdTokenClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
}

/** Claims from a Google id_token */
interface GoogleIdTokenClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

const APPLE_JWKS_URI = 'https://appleid.apple.com/auth/keys';
const GOOGLE_JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';
const APPLE_ISSUER = 'https://appleid.apple.com';
const GOOGLE_ISSUERS: [string, ...string[]] = ['https://accounts.google.com', 'accounts.google.com'];

/** Random 4-char alphanumeric suffix for guest display names. */
function randomGuestSuffix(): string {
  // Omit easily confused chars (0/O, 1/l/I)
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

@Injectable()
export class AuthService {
  private readonly appleJwksClient: JwksClient;
  private readonly googleJwksClient: JwksClient;

  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(KYSELY_TOKEN)
    private readonly db: Kysely<DB>,
  ) {
    this.appleJwksClient = new JwksClient({
      jwksUri: APPLE_JWKS_URI,
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 600_000, // 10 minutes
    });

    this.googleJwksClient = new JwksClient({
      jwksUri: GOOGLE_JWKS_URI,
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 600_000,
    });
  }

  // ---------------------------------------------------------------------------
  // Apple id_token login (mobile SDK flow)
  // ---------------------------------------------------------------------------

  /**
   * Verifies an Apple id_token and finds or creates a user.
   * firstName/lastName are only provided by Apple on the very first sign-in.
   */
  async loginWithApple(
    idToken: string,
    firstName?: string,
    lastName?: string,
  ): Promise<AuthResponse> {
    const claims = await this.verifyAppleIdToken(idToken);

    const displayName =
      [firstName, lastName].filter(Boolean).join(' ').trim() ||
      `Player_${randomGuestSuffix()}`;

    const user = await this.userService.findOrCreate({
      provider: 'apple',
      providerId: claims.sub,
      email: claims.email,
      displayName,
    });

    return this.buildAuthResponse(user);
  }

  // ---------------------------------------------------------------------------
  // Google id_token login (mobile SDK flow)
  // ---------------------------------------------------------------------------

  /** Verifies a Google id_token and finds or creates a user. */
  async loginWithGoogle(idToken: string): Promise<AuthResponse> {
    const claims = await this.verifyGoogleIdToken(idToken);

    const user = await this.userService.findOrCreate({
      provider: 'google',
      providerId: claims.sub,
      email: claims.email,
      displayName: claims.name ?? claims.email ?? `Player_${randomGuestSuffix()}`,
      avatarUrl: claims.picture,
    });

    return this.buildAuthResponse(user);
  }

  // ---------------------------------------------------------------------------
  // Guest account
  // ---------------------------------------------------------------------------

  /** Creates an anonymous guest account and issues tokens immediately. */
  async createGuestAccount(): Promise<AuthResponse> {
    const displayName = `Player_${randomGuestSuffix()}`;
    const user = await this.userService.createGuestAccount(displayName);
    return this.buildAuthResponse(user);
  }

  // ---------------------------------------------------------------------------
  // Guest → social upgrade
  // ---------------------------------------------------------------------------

  /**
   * Links a social identity (Apple or Google) to an existing guest account,
   * converting it to a full account. Throws ConflictException if the social
   * identity is already owned by a different account.
   */
  async upgradeGuestToSocial(
    guestUserId: string,
    idToken: string,
    provider: 'apple' | 'google',
    firstName?: string,
    lastName?: string,
  ): Promise<AuthResponse> {
    let socialId: string;
    let email: string | undefined;
    let displayName: string | undefined;
    let avatarUrl: string | undefined;

    if (provider === 'apple') {
      const claims = await this.verifyAppleIdToken(idToken);
      socialId = claims.sub;
      email = claims.email;
      displayName = [firstName, lastName].filter(Boolean).join(' ').trim() || undefined;

      await this.assertSocialIdNotTaken('apple_id', socialId, guestUserId);
    } else {
      const claims = await this.verifyGoogleIdToken(idToken);
      socialId = claims.sub;
      email = claims.email;
      displayName = claims.name;
      avatarUrl = claims.picture;

      await this.assertSocialIdNotTaken('google_id', socialId, guestUserId);
    }

    const user = await this.userService.upgradeGuestToSocial({
      guestUserId,
      provider,
      socialId,
      email,
      displayName,
      avatarUrl,
    });

    return this.buildAuthResponse(user);
  }

  // ---------------------------------------------------------------------------
  // Named token helpers (per spec)
  // ---------------------------------------------------------------------------

  /** Signs a short-lived access JWT (default 15 min). */
  generateJwt(userId: string): string {
    const payload: JwtPayload = { sub: userId, email: '' };
    return this.jwtService.sign(payload, {
      expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
    });
  }

  /** Signs a long-lived refresh JWT (default 30 days). */
  generateRefreshToken(userId: string): string {
    const payload: JwtPayload = { sub: userId, email: '' };
    const secret = this.configService.get<string>(
      'JWT_REFRESH_SECRET',
      this.configService.getOrThrow<string>('JWT_SECRET'),
    );
    return this.jwtService.sign(payload, {
      secret,
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '30d'),
    });
  }

  // ---------------------------------------------------------------------------
  // Legacy / redirect-flow methods (used by passport-apple / passport-google)
  // ---------------------------------------------------------------------------

  async findOrCreateUser(payload: import('@euphoria/types').CreateUserPayload): Promise<AuthenticatedUser> {
    return this.userService.findOrCreate(payload);
  }

  /**
   * Used by the OAuth redirect flow (GET /auth/google/callback, POST /auth/apple/callback).
   * Returns AuthTokens (no user profile) to keep the redirect response slim.
   */
  issueTokens(user: AuthenticatedUser): AuthTokens {
    const jwtPayload: JwtPayload = { sub: user.id, email: user.email ?? '' };
    const accessToken = this.jwtService.sign(jwtPayload);
    const refreshToken = this.jwtService.sign(jwtPayload, {
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '30d'),
    });
    return { accessToken, refreshToken, expiresIn: 900 };
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    const secret = this.configService.get<string>(
      'JWT_REFRESH_SECRET',
      this.configService.getOrThrow<string>('JWT_SECRET'),
    );

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, { secret });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.userService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.issueTokens(user);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildAuthResponse(user: AuthenticatedUser): AuthResponse {
    const jwtPayload: JwtPayload = { sub: user.id, email: user.email ?? '' };
    const accessToken = this.jwtService.sign(jwtPayload);
    const refreshToken = this.generateRefreshToken(user.id);

    const profile: UserProfile = {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl ?? undefined,
      isGuest: user.isGuest,
      coinBalance: user.coinBalance,
    };

    return { accessToken, refreshToken, user: profile };
  }

  private async assertSocialIdNotTaken(
    column: 'apple_id' | 'google_id',
    socialId: string,
    currentUserId: string,
  ): Promise<void> {
    const existing = await this.db
      .selectFrom('users')
      .select('id')
      .where(column, '=', socialId)
      .executeTakeFirst();

    if (existing && existing.id !== currentUserId) {
      const provider = column === 'apple_id' ? 'Apple' : 'Google';
      throw new ConflictException(
        `This ${provider} account is already linked to a different user`,
      );
    }
  }

  private async verifyAppleIdToken(idToken: string): Promise<AppleIdTokenClaims> {
    const clientId = this.configService.getOrThrow<string>('APPLE_CLIENT_ID');

    let kid: string;
    try {
      const decoded = jwt.decode(idToken, { complete: true });
      if (!decoded || typeof decoded !== 'object' || !decoded.header?.kid) {
        throw new Error('Missing kid in token header');
      }
      kid = decoded.header.kid as string;
    } catch (err) {
      throw new UnauthorizedException(`Apple id_token is malformed: ${String(err)}`);
    }

    let publicKey: string;
    try {
      const signingKey = await this.appleJwksClient.getSigningKey(kid);
      publicKey = signingKey.getPublicKey();
    } catch (err) {
      throw new UnauthorizedException(`Failed to fetch Apple signing key: ${String(err)}`);
    }

    try {
      const claims = jwt.verify(idToken, publicKey, {
        algorithms: ['RS256'],
        issuer: APPLE_ISSUER,
        audience: clientId,
      }) as AppleIdTokenClaims;

      if (!claims.sub) {
        throw new Error('Missing sub claim');
      }

      return claims;
    } catch (err) {
      throw new UnauthorizedException(`Apple id_token verification failed: ${String(err)}`);
    }
  }

  private async verifyGoogleIdToken(idToken: string): Promise<GoogleIdTokenClaims> {
    const clientId = this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID');

    let kid: string;
    try {
      const decoded = jwt.decode(idToken, { complete: true });
      if (!decoded || typeof decoded !== 'object' || !decoded.header?.kid) {
        throw new Error('Missing kid in token header');
      }
      kid = decoded.header.kid as string;
    } catch (err) {
      throw new UnauthorizedException(`Google id_token is malformed: ${String(err)}`);
    }

    let publicKey: string;
    try {
      const signingKey = await this.googleJwksClient.getSigningKey(kid);
      publicKey = signingKey.getPublicKey();
    } catch (err) {
      throw new UnauthorizedException(`Failed to fetch Google signing key: ${String(err)}`);
    }

    try {
      const claims = jwt.verify(idToken, publicKey, {
        algorithms: ['RS256'],
        issuer: GOOGLE_ISSUERS,
        audience: clientId,
      }) as GoogleIdTokenClaims;

      if (!claims.sub) {
        throw new Error('Missing sub claim');
      }

      return claims;
    } catch (err) {
      throw new UnauthorizedException(`Google id_token verification failed: ${String(err)}`);
    }
  }
}
