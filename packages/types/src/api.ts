/**
 * REST API response envelope types.
 * All endpoints return these wrapper shapes.
 */

// ---------------------------------------------------------------------------
// Response envelope
// ---------------------------------------------------------------------------

export interface ApiSuccess<T> {
  success: true;
  data: T;
  /** ISO 8601 server timestamp */
  timestamp: string;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    /** Field-level validation errors */
    details?: Record<string, string[]>;
  };
  timestamp: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasNext: boolean;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Auth endpoints
// ---------------------------------------------------------------------------

export interface AuthTokens {
  accessToken: string;
  /** JWT — long-lived, stored securely on device */
  refreshToken: string;
  expiresIn: number;
}

export interface RefreshTokenPayload {
  refreshToken: string;
}

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

export interface FeatureFlag {
  key: string;
  value: boolean | string | number;
  description?: string;
  updatedAt: string;
}

export interface FeatureFlagsMap {
  [key: string]: boolean | string | number;
}

// ---------------------------------------------------------------------------
// Admin endpoints
// ---------------------------------------------------------------------------

export interface AdminShowCreateResponse {
  showId: string;
  scheduledAt: string;
}

export interface AdminStatsResponse {
  totalUsers: number;
  activeShows: number;
  totalCoinsInCirculation: number;
  showsThisWeek: number;
}
