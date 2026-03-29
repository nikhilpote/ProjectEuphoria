import { useState, useEffect, useCallback, useRef } from 'react';
import { Badge } from '../components/ui/Badge';

interface LiveShow {
  id: string;
  title: string;
  playerCount: number;
  roundCount: number;
  scheduledAt: string;
}

const BASE_URL = `${import.meta.env.VITE_API_URL ?? ''}/api/v1`;
const POLL_INTERVAL_MS = 10_000;

async function getLiveShows(): Promise<LiveShow[]> {
  const res = await fetch(`${BASE_URL}/shows`);
  const body = await res.json() as { success: boolean; data?: Array<{ id: string; title: string; status: string; playerCount: number; roundCount: number; scheduledAt: string }> };
  if (!res.ok || !body.success || !body.data) return [];
  return body.data
    .filter((s) => s.status === 'live')
    .map((s) => ({ id: s.id, title: s.title, playerCount: s.playerCount, roundCount: s.roundCount, scheduledAt: s.scheduledAt }));
}

export function LiveOpsPage() {
  const [shows, setShows] = useState<LiveShow[]>([]);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchShows = useCallback(async (silent = false) => {
    try {
      const data = await getLiveShows();
      setShows(data);
    } catch {
      // silently ignore poll errors
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShows(false);
    pollRef.current = setInterval(() => fetchShows(true), POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchShows]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-100">Live Operations</h2>
        <p className="mt-1 text-sm text-gray-500">
          Monitor active shows in real time. Refreshes every {POLL_INTERVAL_MS / 1000}s.
        </p>
      </div>

      {loading ? (
        <div className="bg-euphoria-card border border-euphoria-border rounded-xl p-8 text-center text-sm text-gray-600 animate-pulse">
          Loading…
        </div>
      ) : shows.length > 0 ? (
        <div className="space-y-4">
          {shows.map((show) => (
            <div
              key={show.id}
              className="bg-euphoria-card border border-euphoria-border rounded-xl p-6"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-gray-100">{show.title}</h3>
                    <Badge label="LIVE" variant="success" />
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    Scheduled {new Date(show.scheduledAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Players</p>
                  <p className="mt-1 text-2xl font-bold text-gray-100">
                    {show.playerCount.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Total Rounds</p>
                  <p className="mt-1 text-2xl font-bold text-gray-100">{show.roundCount}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-euphoria-card border border-euphoria-border rounded-xl p-12 text-center">
          <p className="text-4xl mb-3">◉</p>
          <p className="text-gray-400 font-medium">No live shows right now</p>
          <p className="text-sm text-gray-600 mt-1">
            Active shows will appear here automatically.
          </p>
        </div>
      )}
    </div>
  );
}
