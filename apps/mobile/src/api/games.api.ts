import type { ApiSuccess } from '@euphoria/types';
import { API_BASE_URL } from '../config';

// ---------------------------------------------------------------------------
// Public types
//
// These mirror the server-side TriviaConfig / GameDefinition shapes but strip
// encrypted fields — the client only ever sees the public surface.
// ---------------------------------------------------------------------------

export interface TriviaOption {
  id: string; // 'A' | 'B' | 'C' | 'D'
  text: string;
}

export interface TriviaQuestionPublic {
  id: string;
  question: string;
  options: [TriviaOption, TriviaOption, TriviaOption, TriviaOption];
  timeLimitMs: number;
  difficulty: 'easy' | 'medium' | 'hard';
  coinsOnCorrect: number;
}

export interface TriviaAnswerResult {
  questionId: string;
  isCorrect: boolean;
  correctOptionId: string;
  coinsAwarded: number;
  serverTimestamp: number;
}

// ---------------------------------------------------------------------------
// Error class — mirrors auth.api.ts pattern
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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function get<T>(path: string, accessToken?: string): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const response = await fetch(`${API_BASE_URL}${path}`, { method: 'GET', headers });
  const json = (await response.json()) as { success: boolean; error?: { code: string; message: string } } & T;

  if (!json.success) {
    const err = (json as { error?: { code: string; message: string } }).error;
    throw new ApiRequestError(response.status, err?.code ?? 'UNKNOWN', err?.message ?? 'Request failed');
  }

  return json as T;
}

async function post<T>(path: string, body: unknown, accessToken?: string): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const json = (await response.json()) as { success: boolean; error?: { code: string; message: string } } & T;

  if (!json.success) {
    const err = (json as { error?: { code: string; message: string } }).error;
    throw new ApiRequestError(response.status, err?.code ?? 'UNKNOWN', err?.message ?? 'Request failed');
  }

  return json as T;
}

// ---------------------------------------------------------------------------
// Public API functions
// ---------------------------------------------------------------------------

type QuestionsApiSuccess = ApiSuccess<TriviaQuestionPublic[]>;
type AnswerApiSuccess = ApiSuccess<TriviaAnswerResult>;

/**
 * Fetch `count` random trivia questions, pre-loaded before gameplay begins.
 * Optionally pass specific question IDs (live show mode where questions are
 * server-pushed in advance).
 */
export async function getRandomTriviaQuestions(
  count: number,
  questionIds?: string[],
  accessToken?: string,
): Promise<TriviaQuestionPublic[]> {
  const params = new URLSearchParams({ count: String(count) });
  if (questionIds?.length) {
    questionIds.forEach((id) => params.append('ids', id));
  }
  const result = await get<QuestionsApiSuccess>(`/games/trivia/questions?${params}`, accessToken);
  return result.data;
}

/**
 * Validate the player's answer server-side.
 *
 * `clientTimestamp` is `Date.now()` at the moment of tap — used server-side
 * for reaction-time scoring and anti-cheat latency checks.
 *
 * Optimistic UI: call this fire-and-forget; the screen advances immediately
 * based on the returned promise, but the UI has already highlighted the
 * selection before awaiting.
 */
export async function validateTriviaAnswer(
  questionId: string,
  selectedOptionId: string,
  clientTimestamp: number,
  accessToken?: string,
): Promise<TriviaAnswerResult> {
  const result = await post<AnswerApiSuccess>(
    '/games/trivia/answer',
    { questionId, selectedOptionId, clientTimestamp },
    accessToken,
  );
  return result.data;
}

// ─── Game packages ────────────────────────────────────────────────────────────

export interface GamePackageSummary {
  id: string;       // matches gameType string e.g. 'number_dash'
  name: string;
  version: string;
  bundleUrl: string;
  isEnabled: boolean;
}

export async function getGamePackages(): Promise<GamePackageSummary[]> {
  const res = await fetch(`${API_BASE_URL}/games`);
  if (!res.ok) return [];
  const body = await res.json() as { success: boolean; data?: GamePackageSummary[] };
  return body.data ?? [];
}

export { ApiRequestError };
