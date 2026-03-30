import { API_BASE_URL } from '@/config';

export interface PlayClipSummary {
  id: string;
  showId: string;
  gameType: string;
  mediaUrl: string;
  hlsUrl: string | null;
  status: 'processing' | 'ready' | 'archived';
  playCount: number;
  config: Record<string, unknown>;
  clipStartMs: number;
  clipEndMs: number;
  /** Ms from clip start when game overlay should appear */
  gameOffsetMs: number;
}

export interface ClipSession {
  id: string;
  clipId: string;
  servedAt: number;
}

export interface ClipResult {
  correct: boolean;
  score: number;
  responseTimeMs: number;
  percentile: number;      // 0-100: % of players beaten
  totalPlayers: number;
  correctAnswer: string | null;
}

export async function getPlayClips(
  page = 0,
  limit = 10,
  accessToken?: string | null,
): Promise<PlayClipSummary[]> {
  const res = await fetch(
    `${API_BASE_URL}/playclips?page=${page}&limit=${limit}`,
    accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json() as { success: boolean; data?: PlayClipSummary[] };
  return body.data ?? [];
}

export async function startClipSession(
  clipId: string,
  accessToken: string,
): Promise<ClipSession> {
  const res = await fetch(`${API_BASE_URL}/playclips/${clipId}/start`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json() as { success: boolean; data?: ClipSession };
  return body.data!;
}

export async function submitClipAnswer(
  sessionId: string,
  answer: unknown,
  accessToken: string,
): Promise<ClipResult> {
  const res = await fetch(`${API_BASE_URL}/playclips/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ sessionId, clientTs: Date.now(), answer }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json() as { success: boolean; data?: ClipResult };
  return body.data!;
}
