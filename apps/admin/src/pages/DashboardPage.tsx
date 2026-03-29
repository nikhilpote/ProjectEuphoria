import { useEffect, useState } from 'react';
import { StatCard } from '../components/ui/StatCard';

interface PlatformStats {
  totalUsers: number;
  activeShows: number;
  totalCoinsInCirculation: number;
  showsThisWeek: number;
}

const BASE_URL = `${import.meta.env.VITE_API_URL ?? ''}/api/v1`;

async function getStats(): Promise<PlatformStats> {
  const res = await fetch(`${BASE_URL}/admin/stats`);
  const body = await res.json() as { success: boolean; data?: PlatformStats };
  if (!res.ok || !body.success || !body.data) throw new Error('Failed to load stats');
  return body.data;
}

export function DashboardPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  const totalUsers = stats?.totalUsers ?? 0;
  const activeShows = stats?.activeShows ?? 0;
  const totalCoins = stats?.totalCoinsInCirculation ?? 0;
  const showsThisWeek = stats?.showsThisWeek ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-100">Platform Overview</h2>
        <p className="mt-1 text-sm text-gray-500">
          Live metrics for the Euphoria platform.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Users"
          value={loading ? '—' : totalUsers.toLocaleString()}
          subtext="Registered accounts"
          trend="up"
        />
        <StatCard
          label="Active Shows"
          value={loading ? '—' : activeShows}
          subtext="Lobby or live now"
          trend="neutral"
        />
        <StatCard
          label="Coins in Circulation"
          value={loading ? '—' : totalCoins >= 1_000_000 ? `${(totalCoins / 1_000_000).toFixed(1)}M` : totalCoins.toLocaleString()}
          subtext="Across all wallets"
          trend="neutral"
        />
        <StatCard
          label="Shows This Week"
          value={loading ? '—' : showsThisWeek}
          subtext="Created in last 7 days"
          trend="up"
        />
      </div>

      {/* Placeholder chart area */}
      <div className="bg-euphoria-card border border-euphoria-border rounded-xl p-6">
        <h3 className="text-sm font-medium text-gray-400 mb-4">Player Activity (7d)</h3>
        <div className="h-40 flex items-end gap-2">
          {[42, 68, 55, 90, 75, 88, 100].map((h, i) => (
            <div key={i} className="flex-1 flex flex-col justify-end">
              <div
                className="rounded-t bg-gradient-to-t from-euphoria-purple to-euphoria-pink opacity-80"
                style={{ height: `${h}%` }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <span key={d} className="text-xs text-gray-600 flex-1 text-center">
              {d}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
