import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import type { JwtPayload } from '../decorators/current-user.decorator';

/**
 * AdminGuard — restricts access to users whose email is in the ADMIN_EMAILS env list.
 *
 * Requires JwtAuthGuard to run first (so request.user is populated).
 *
 * ADMIN_EMAILS is a comma-separated list of admin email addresses, e.g.:
 *   ADMIN_EMAILS=alice@example.com,bob@example.com
 */
@Injectable()
export class AdminGuard implements CanActivate {
  private readonly adminEmails: Set<string>;

  constructor(private readonly configService: ConfigService) {
    const raw = configService.get<string>('ADMIN_EMAILS', '');
    this.adminEmails = new Set(
      raw
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const user = request.user;

    if (!user?.email) {
      throw new ForbiddenException('Admin access required');
    }

    if (!this.adminEmails.has(user.email.toLowerCase())) {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}
