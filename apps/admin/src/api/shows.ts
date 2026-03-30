// ─── Types ────────────────────────────────────────────────────────────────────

export interface GameRound {
  gameType:
    | 'trivia'
    | 'quick_math'
    | 'fruit_cutting'
    | 'knife_at_center'
    | 'spelling_bee'
    | 'find_items'
    | 'memory_grid';
  config: Record<string, unknown>;
}

export interface Show {
  id: string;
  title: string;
  status: 'scheduled' | 'lobby' | 'live' | 'completed' | 'cancelled';
  scheduledAt: string;
  playerCount: number;
  prizePool: number;
  lobbyDurationMs: number;
  gameSequence: GameRound[];
}

export interface CreateShowInput {
  title: string;
  scheduledAt: string;
  prizePool: number;
  lobbyDurationMs?: number;
  videoUrl?: string | null;
  gameSequence: unknown[];
}

// ─── Client ───────────────────────────────────────────────────────────────────

const BASE_URL = `${import.meta.env.VITE_API_URL ?? ''}/api/v1`;

async function handleResponse<T>(res: Response): Promise<T> {
  const body = await res.json() as { success: boolean; data?: T; error?: { message?: string } };
  if (!res.ok || !body.success) {
    const message = body?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(message);
  }
  return body.data as T;
}

export async function getShows(): Promise<Show[]> {
  const res = await fetch(`${BASE_URL}/shows`);
  return handleResponse<Show[]>(res);
}

export async function createShow(data: CreateShowInput): Promise<Show> {
  const res = await fetch(`${BASE_URL}/shows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<Show>(res);
}

export async function startShow(showId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/admin/shows/${showId}/start`, {
    method: 'POST',
  });
  await handleResponse<unknown>(res);
}

export async function updateShow(id: string, data: { title?: string; scheduledAt?: string; lobbyDurationMs?: number; videoUrl?: string | null; gameSequence?: unknown[] }): Promise<Show> {
  const res = await fetch(`${BASE_URL}/shows/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<Show>(res);
}

export async function deleteShow(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/shows/${id}`, { method: 'DELETE' });
  if (res.status === 204) return;
  await handleResponse<void>(res);
}

export async function getShowDetail(id: string): Promise<{ id: string; title: string; scheduledAt: string; status: string; lobbyDurationMs: number; videoUrl: string | null; gameSequence: unknown[] }> {
  const res = await fetch(`${BASE_URL}/shows/${id}/detail`);
  return handleResponse(res);
}

// ─── Media library ────────────────────────────────────────────────────────────

export interface MediaFile {
  url: string;
  filename: string;
  size: number;
  uploadedAt: string;
}

export async function getMediaLibrary(): Promise<MediaFile[]> {
  const res = await fetch(`${BASE_URL}/admin/media`);
  return handleResponse<MediaFile[]>(res);
}

// ─── PlayClips ────────────────────────────────────────────────────────────────

export interface ClipRangeInput {
  startMs: number;
  endMs: number;
  roundIndex: number;
  gameType: string;
  config: Record<string, unknown>;
  gameOffsetMs: number;
}

export interface SavedClip {
  id: string;
  gameType: string;
  clipStartMs: number;
  clipEndMs: number;
  gameOffsetMs: number;
  status: string;
  mediaUrl: string;
}

export async function getShowClips(showId: string): Promise<SavedClip[]> {
  const res = await fetch(`${BASE_URL}/admin/shows/${showId}/clips`);
  return handleResponse<SavedClip[]>(res);
}

export async function createShowClips(
  showId: string,
  ranges: ClipRangeInput[],
): Promise<{ created: number }> {
  const res = await fetch(`${BASE_URL}/admin/shows/${showId}/clips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ranges),
  });
  return handleResponse<{ created: number }>(res);
}

// ─── Trivia questions ─────────────────────────────────────────────────────────

export interface TriviaQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  category: string | null;
  difficulty: number;
}

export async function getTriviaQuestions(): Promise<TriviaQuestion[]> {
  const res = await fetch(`${BASE_URL}/games/trivia/questions`);
  const body = await res.json() as { success?: boolean; data?: TriviaQuestion[] } | TriviaQuestion[];
  // This endpoint returns the array directly (no wrapper) since it uses the controller return value
  if (Array.isArray(body)) return body;
  if ('data' in body && Array.isArray((body as { data: TriviaQuestion[] }).data)) return (body as { data: TriviaQuestion[] }).data;
  return [];
}
