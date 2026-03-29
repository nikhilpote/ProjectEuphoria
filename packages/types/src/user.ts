/**
 * User domain types
 */

export type AuthProvider = 'apple' | 'google' | 'guest';

export interface User {
  id: string; // UUID
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  coinBalance: number;
  appleId: string | null;
  googleId: string | null;
  isGuest: boolean;
  socialProvider: AuthProvider | null;
  createdAt: string; // ISO 8601
  updatedAt: string;
}

/** Safe public projection — never includes auth provider IDs */
export interface PublicUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  coinBalance: number;
}

export interface AuthenticatedUser extends PublicUser {
  email: string | null;
  isGuest: boolean;
  createdAt: string;
}

/** Shape returned by all auth endpoints */
export interface UserProfile {
  id: string;
  displayName: string;
  avatarUrl?: string;
  isGuest: boolean;
  coinBalance: number;
}

/** Unified auth response shape for all login/guest endpoints */
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
}

export interface CreateUserPayload {
  email?: string;
  displayName: string;
  avatarUrl?: string;
  provider: AuthProvider;
  providerId?: string;
  isGuest?: boolean;
}

export interface UpgradeGuestPayload {
  guestUserId: string;
  provider: Exclude<AuthProvider, 'guest'>;
  socialId: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
}
