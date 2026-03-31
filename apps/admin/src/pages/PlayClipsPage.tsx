import { useState, useEffect, useCallback } from 'react';
import { getAllClips, deleteShowClip, type AdminClip } from '../api/shows';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(startMs: number, endMs: number): string {
  const totalSecs = Math.round((endMs - startMs) / 1000);
  if (totalSecs < 60) return `${totalSecs}s`;
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ─── Badge components ─────────────────────────────────────────────────────────

function GameTypeBadge({ gameType }: { gameType: string }) {
  const styles: Record<string, string> = {
    trivia: 'bg-purple-500/15 text-purple-300 border-purple-500/25',
    quick_math: 'bg-blue-500/15 text-blue-300 border-blue-500/25',
    spot_difference: 'bg-green-500/15 text-green-300 border-green-500/25',
  };
  const cls = styles[gameType] ?? 'bg-gray-500/15 text-gray-300 border-gray-500/25';
  const label = gameType.replace(/_/g, ' ');
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border capitalize ${cls}`}>
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ready: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
    archived: 'bg-gray-500/15 text-gray-400 border-gray-500/25',
    processing: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/25',
  };
  const cls = styles[status] ?? 'bg-gray-500/15 text-gray-400 border-gray-500/25';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border capitalize ${cls}`}>
      {status}
    </span>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5 text-euphoria-purple" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ─── TrashIcon ────────────────────────────────────────────────────────────────

function TrashIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
    </svg>
  );
}

// ─── PlayClipsPage ────────────────────────────────────────────────────────────

export function PlayClipsPage() {
  const [clips, setClips] = useState<AdminClip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready' | 'archived'>('all');
  const [deleting, setDeleting] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllClips();
      setClips(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load clips');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (clip: AdminClip) => {
    if (!window.confirm(`Delete clip from "${clip.showTitle}"? This cannot be undone.`)) return;
    setDeleting((prev) => new Set(prev).add(clip.id));
    try {
      await deleteShowClip(clip.showId, clip.id);
      setClips((prev) => prev.filter((c) => c.id !== clip.id));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete clip');
    } finally {
      setDeleting((prev) => {
        const next = new Set(prev);
        next.delete(clip.id);
        return next;
      });
    }
  };

  const filtered = clips.filter((c) => {
    const matchesSearch =
      search.trim() === '' ||
      c.showTitle.toLowerCase().includes(search.toLowerCase()) ||
      c.gameType.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="flex flex-col gap-6 p-6 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-100">PlayClips</h1>
          {!loading && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-euphoria-purple/20 text-euphoria-purple border border-euphoria-purple/30">
              {filtered.length} {filtered.length === 1 ? 'clip' : 'clips'}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-gray-100 hover:bg-white/5 border border-euphoria-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 4v6h-6" />
            <path d="M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by show or game type..."
            className="w-full bg-euphoria-card border border-euphoria-border rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-euphoria-purple/50 focus:border-euphoria-purple/50 transition-colors"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | 'ready' | 'archived')}
          className="bg-euphoria-card border border-euphoria-border rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-euphoria-purple/50 focus:border-euphoria-purple/50 transition-colors cursor-pointer"
        >
          <option value="all">All statuses</option>
          <option value="ready">Ready</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <Spinner />
            <p className="text-sm text-gray-500">Loading clips...</p>
          </div>
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="h-12 w-12 rounded-full bg-red-500/10 flex items-center justify-center">
              <svg className="h-6 w-6 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-300">Failed to load clips</p>
              <p className="text-xs text-gray-500 mt-1">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="px-4 py-2 rounded-lg bg-euphoria-purple/20 text-euphoria-purple text-sm font-medium hover:bg-euphoria-purple/30 border border-euphoria-purple/30 transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="h-12 w-12 rounded-full bg-gray-800 flex items-center justify-center text-2xl">
              ▶
            </div>
            <p className="text-sm font-medium text-gray-400">No PlayClips found</p>
            {(search || statusFilter !== 'all') && (
              <p className="text-xs text-gray-600">Try adjusting your search or filter</p>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-euphoria-card border border-euphoria-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-euphoria-border">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Show</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Game Type</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Play Count</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-euphoria-border">
              {filtered.map((clip) => (
                <tr key={clip.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-gray-200 font-medium max-w-[180px] truncate block" title={clip.showTitle}>
                      {clip.showTitle}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <GameTypeBadge gameType={clip.gameType} />
                  </td>
                  <td className="px-4 py-3 text-gray-400 tabular-nums">
                    {formatDuration(clip.clipStartMs, clip.clipEndMs)}
                  </td>
                  <td className="px-4 py-3 text-gray-400 tabular-nums">
                    {clip.playCount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={clip.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {formatDate(clip.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void handleDelete(clip)}
                      disabled={deleting.has(clip.id)}
                      title="Delete clip"
                      className="p-1.5 rounded-md text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {deleting.has(clip.id) ? (
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <TrashIcon />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
