import type { AuthenticatedUser, AuthTokens, ApiSuccess } from '@euphoria/types';
import { API_BASE_URL } from '../config';

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface AuthResponse {
  user: AuthenticatedUser;
  tokens: AuthTokens;
}

// Actual shape returned by the API (flat, not nested under "tokens")
interface AuthApiData {
  user: AuthenticatedUser;
  accessToken: string;
  refreshToken: string;
}

type AuthApiSuccess = ApiSuccess<AuthApiData>;
type MeApiSuccess = ApiSuccess<AuthenticatedUser>;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

class ApiRequestError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function post<T>(path: string, body: unknown, accessToken?: string): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const json = (await response.json()) as { success: boolean; error?: { code: string; message: string } } & T;

  if (!json.success) {
    const err = (json as { error?: { code: string; message: string } }).error;
    throw new ApiRequestError(
      response.status,
      err?.code ?? 'UNKNOWN',
      err?.message ?? 'An unexpected error occurred',
    );
  }

  return json as T;
}

async function get<T>(path: string, accessToken: string, timeoutMs = 5000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const json = (await response.json()) as { success: boolean; error?: { code: string; message: string } } & T;

  if (!json.success) {
    const err = (json as { error?: { code: string; message: string } }).error;
    throw new ApiRequestError(
      response.status,
      err?.code ?? 'UNKNOWN',
      err?.message ?? 'An unexpected error occurred',
    );
  }

  return json as T;
}

// ---------------------------------------------------------------------------
// Public auth functions
// ---------------------------------------------------------------------------

function toAuthResponse(data: AuthApiData): AuthResponse {
  return {
    user: data.user,
    tokens: { accessToken: data.accessToken, refreshToken: data.refreshToken },
  };
}

export async function loginWithApple(idToken: string): Promise<AuthResponse> {
  const result = await post<AuthApiSuccess>('/auth/apple', { idToken });
  return toAuthResponse(result.data);
}

export async function loginWithGoogle(idToken: string): Promise<AuthResponse> {
  const result = await post<AuthApiSuccess>('/auth/google', { idToken });
  return toAuthResponse(result.data);
}

export async function createGuestAccount(): Promise<AuthResponse> {
  const result = await post<AuthApiSuccess>('/auth/guest', {});
  return toAuthResponse(result.data);
}

export async function getMe(accessToken: string): Promise<AuthenticatedUser> {
  const result = await get<MeApiSuccess>('/auth/me', accessToken);
  return result.data;
}

export { ApiRequestError };
