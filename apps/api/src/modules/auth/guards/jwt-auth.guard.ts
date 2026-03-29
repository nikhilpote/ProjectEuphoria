/**
 * Re-export from the shared common guard.
 * The canonical implementation lives at common/guards/jwt-auth.guard.ts
 * to keep it globally available via APP_GUARD registration in main.ts.
 */
export { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
