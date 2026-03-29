/**
 * AdminGuard unit tests.
 *
 * Tests canActivate with various user/email combinations.
 * The guard reads ADMIN_EMAILS from ConfigService at construction time.
 */

import { AdminGuard } from './admin.guard';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function buildConfigService(adminEmails: string): ConfigService {
  return {
    get: jest.fn((key: string, defaultValue?: string) => {
      if (key === 'ADMIN_EMAILS') return adminEmails;
      return defaultValue ?? '';
    }),
  } as unknown as ConfigService;
}

function buildExecutionContext(user?: { email?: string; sub?: string }): ExecutionContext {
  return {
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue({ user }),
    }),
  } as unknown as ExecutionContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AdminGuard — canActivate', () => {
  it('returns true when user email is in ADMIN_EMAILS list', () => {
    const guard = new AdminGuard(
      buildConfigService('admin@example.com,ops@example.com'),
    );
    const ctx = buildExecutionContext({ email: 'admin@example.com', sub: 'user-1' });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('returns true for second email in a comma-separated list', () => {
    const guard = new AdminGuard(
      buildConfigService('admin@example.com,ops@example.com'),
    );
    const ctx = buildExecutionContext({ email: 'ops@example.com', sub: 'user-2' });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws ForbiddenException when user email is NOT in ADMIN_EMAILS', () => {
    const guard = new AdminGuard(buildConfigService('admin@example.com'));
    const ctx = buildExecutionContext({ email: 'notadmin@example.com', sub: 'user-3' });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when ADMIN_EMAILS is empty', () => {
    const guard = new AdminGuard(buildConfigService(''));
    const ctx = buildExecutionContext({ email: 'admin@example.com', sub: 'user-1' });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when there is no user on the request', () => {
    const guard = new AdminGuard(buildConfigService('admin@example.com'));
    const ctx = buildExecutionContext(undefined);

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when user has no email field', () => {
    const guard = new AdminGuard(buildConfigService('admin@example.com'));
    const ctx = buildExecutionContext({ sub: 'user-1' }); // no email

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('matches case-insensitively (ADMIN@EXAMPLE.COM matches admin@example.com config)', () => {
    // Config stores lowercase (split+trim+toLowerCase in constructor)
    const guard = new AdminGuard(buildConfigService('admin@example.com'));
    // User JWT might carry mixed-case email
    const ctx = buildExecutionContext({ email: 'ADMIN@EXAMPLE.COM', sub: 'user-1' });

    // Guard lowercases user.email before checking — should pass
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('trims whitespace around emails in ADMIN_EMAILS config', () => {
    const guard = new AdminGuard(
      buildConfigService('  admin@example.com  ,  ops@example.com  '),
    );
    const ctx = buildExecutionContext({ email: 'admin@example.com', sub: 'user-1' });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('ignores empty entries in comma-separated ADMIN_EMAILS (e.g. trailing comma)', () => {
    const guard = new AdminGuard(buildConfigService('admin@example.com,'));
    const ctx = buildExecutionContext({ email: '', sub: 'user-x' });

    // Empty string email should NOT match (empty entries are filtered out)
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
