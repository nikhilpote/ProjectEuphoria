import { API_BASE_URL } from '../config';

export interface ShowSummary {
  id: string;
  title: string;
  status: 'scheduled' | 'lobby' | 'live' | 'completed' | 'cancelled';
  scheduledAt: string;
  playerCount: number;
  prizePool: number;
  roundCount: number;
  lobbyDurationMs: number;
}

export async function getShows(): Promise<ShowSummary[]> {
  const response = await fetch(`${API_BASE_URL}/shows`);
  if (!response.ok) {
    throw new Error(`Failed to fetch shows: ${response.status}`);
  }
  const json = await response.json() as { success: boolean; data?: ShowSummary[] | { shows?: ShowSummary[] } };
  // Handle both array response and wrapped response
  if (Array.isArray(json.data)) return json.data;
  if (json.data && 'shows' in json.data && Array.isArray(json.data.shows)) return json.data.shows;
  return [];
}

// Legacy export kept for any existing callers
export type ActiveShow = ShowSummary;
export async function getActiveShows(): Promise<ShowSummary[]> {
  const all = await getShows();
  return all.filter((s) => s.status === 'scheduled' || s.status === 'lobby');
}
