import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { UserService } from '../user/user.service';
import type { AuthTokens, AuthenticatedUser, AuthResponse } from '@euphoria/types';

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

class AppleLoginDto {
  @IsString()
  @IsNotEmpty()
  idToken!: string;

  /** Sent by Apple SDK on first sign-in only */
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;
}

class GoogleLoginDto {
  @IsString()
  @IsNotEmpty()
  idToken!: string;
}

class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

class UpgradeGuestDto {
  @IsString()
  @IsNotEmpty()
  idToken!: string;

  @IsString()
  @IsNotEmpty()
  provider!: 'apple' | 'google';

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {}

  // ---- Mobile SDK id_token endpoints ----------------------------------------

  @Public()
  @Post('apple')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with Apple (mobile SDK id_token flow)' })
  @ApiBody({ type: AppleLoginDto })
  loginWithApple(@Body() body: AppleLoginDto): Promise<AuthResponse> {
    return this.authService.loginWithApple(body.idToken, body.firstName, body.lastName);
  }

  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with Google (mobile SDK id_token flow)' })
  @ApiBody({ type: GoogleLoginDto })
  loginWithGoogle(@Body() body: GoogleLoginDto): Promise<AuthResponse> {
    return this.authService.loginWithGoogle(body.idToken);
  }

  // ---- Guest account --------------------------------------------------------

  @Public()
  @Post('guest')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an anonymous guest account and receive a JWT' })
  createGuest(): Promise<AuthResponse> {
    return this.authService.createGuestAccount();
  }

  // ---- Guest upgrade --------------------------------------------------------

  @Post('upgrade')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Link a social identity to an existing guest account' })
  @ApiBody({ type: UpgradeGuestDto })
  upgradeGuest(
    @CurrentUser() user: JwtPayload,
    @Body() body: UpgradeGuestDto,
  ): Promise<AuthResponse> {
    return this.authService.upgradeGuestToSocial(
      user.sub,
      body.idToken,
      body.provider,
      body.firstName,
      body.lastName,
    );
  }

  // ---- Token refresh --------------------------------------------------------

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a refresh token for a new access token' })
  @ApiBody({ type: RefreshTokenDto })
  refresh(@Body() body: RefreshTokenDto): Promise<AuthTokens> {
    return this.authService.refreshTokens(body.refreshToken);
  }

  // ---- Current user profile -------------------------------------------------

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  async me(@CurrentUser() jwtUser: JwtPayload): Promise<AuthenticatedUser> {
    return this.userService.getProfile(jwtUser.sub);
  }

  // ---- OAuth redirect flow (web / server-side) ------------------------------

  @Public()
  @Get('google/oauth')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Initiate Google OAuth redirect flow' })
  googleOAuth(): void {
    // Passport redirects automatically
  }

  @Public()
  @Get('google/oauth/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth redirect callback' })
  googleOAuthCallback(
    @Req() req: Request & { user: AuthenticatedUser },
  ): AuthTokens {
    return this.authService.issueTokens(req.user);
  }

  @Public()
  @Post('apple/callback')
  @UseGuards(AuthGuard('apple'))
  @ApiOperation({ summary: 'Apple OAuth redirect callback (server-side flow)' })
  appleCallback(
    @Req() req: Request & { user: AuthenticatedUser },
  ): AuthTokens {
    return this.authService.issueTokens(req.user);
  }
}
