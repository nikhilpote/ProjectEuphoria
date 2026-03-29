import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GamePackage {
  id: string;
  name: string;
  version: string;
  description: string | null;
  isEnabled: boolean;
  manifest: {
    id: string;
    name: string;
    version: string;
    configSchema: Record<string, unknown>;
  };
  bundleUrl: string;
  thumbnailUrl: string | null;
  createdAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = `${import.meta.env.VITE_API_URL ?? ''}/api/v1`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Spinner({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'h-5 w-5' : 'h-3.5 w-3.5';
  return (
    <svg className={`animate-spin ${cls}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}

function ToggleSwitch({ checked, onChange, disabled }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-euphoria-purple focus-visible:ring-offset-2 focus-visible:ring-offset-euphoria-card',
        'transition-colors duration-300 ease-in-out',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        checked ? 'bg-euphoria-purple shadow-[0_0_12px_rgba(124,58,237,0.5)]' : 'bg-gray-700',
      ].join(' ')}
    >
      <span
        className={[
          'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md',
          'transition-transform duration-300 ease-in-out',
          checked ? 'translate-x-6' : 'translate-x-1',
        ].join(' ')}
      />
    </button>
  );
}

function GamepadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="6" width="20" height="12" rx="4" />
      <path d="M6 12h4M8 10v4" />
      <circle cx="15" cy="11" r="1" fill="currentColor" stroke="none" />
      <circle cx="17" cy="13" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-euphoria-card rounded-xl border border-euphoria-border p-5 flex gap-4 animate-pulse">
      <div className="h-20 w-20 rounded-lg bg-gray-800 shrink-0" />
      <div className="flex flex-col gap-2 flex-1 min-w-0">
        <div className="h-4 w-36 bg-gray-800 rounded" />
        <div className="h-3 w-24 bg-gray-800 rounded" />
        <div className="h-3 w-full bg-gray-800 rounded mt-1" />
        <div className="flex gap-2 mt-auto">
          <div className="h-7 w-20 bg-gray-800 rounded-lg" />
          <div className="h-7 w-16 bg-gray-800 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

interface PackageCardProps {
  pkg: GamePackage;
  onToggle: (id: string, isEnabled: boolean) => Promise<void>;
  onDelete: (id: string, name: string) => Promise<void>;
}

function PackageCard({ pkg, onToggle, onDelete }: PackageCardProps) {
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [localEnabled, setLocalEnabled] = useState(pkg.isEnabled);

  // Keep in sync if parent state updates
  useEffect(() => {
    setLocalEnabled(pkg.isEnabled);
  }, [pkg.isEnabled]);

  const handleToggle = async (val: boolean) => {
    setToggling(true);
    setLocalEnabled(val); // optimistic
    try {
      await onToggle(pkg.id, val);
    } catch {
      setLocalEnabled(!val); // revert on failure
    } finally {
      setToggling(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(pkg.id, pkg.name);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className={[
        'bg-euphoria-card rounded-xl border p-5 flex gap-4 transition-all duration-200 group',
        'border-euphoria-border hover:border-euphoria-purple/40 hover:shadow-[0_0_0_1px_rgba(124,58,237,0.2)]',
      ].join(' ')}
    >
      {/* Thumbnail */}
      <div className="h-20 w-20 rounded-lg shrink-0 overflow-hidden bg-gray-800 border border-euphoria-border flex items-center justify-center">
        {pkg.thumbnailUrl ? (
          <img
            src={pkg.thumbnailUrl}
            alt={pkg.name}
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
              (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty('display', 'flex');
            }}
          />
        ) : null}
        <div
          className={[
            'h-full w-full items-center justify-center',
            pkg.thumbnailUrl ? 'hidden' : 'flex',
          ].join(' ')}
          style={{ display: pkg.thumbnailUrl ? 'none' : 'flex' }}
        >
          <GamepadIcon className="h-8 w-8 text-gray-600" />
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        {/* Name + badges row */}
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-gray-100 truncate">{pkg.name}</h3>
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono text-gray-500 bg-gray-800 border border-gray-700">
            {pkg.manifest.id ?? pkg.id}
          </span>
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono text-euphoria-purple bg-euphoria-purple/10 border border-euphoria-purple/20">
            {pkg.version}
          </span>
        </div>

        {/* Description */}
        <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
          {pkg.description ?? 'No description provided.'}
        </p>

        {/* Installed date */}
        <p className="text-[11px] text-gray-700">Installed {formatDate(pkg.createdAt)}</p>

        {/* Actions row */}
        <div className="flex items-center gap-3 mt-auto pt-1 flex-wrap">
          {/* Enabled toggle */}
          <div className="flex items-center gap-2">
            <ToggleSwitch
              checked={localEnabled}
              onChange={handleToggle}
              disabled={toggling}
            />
            <span
              className={[
                'text-xs font-medium',
                localEnabled ? 'text-emerald-400' : 'text-gray-500',
              ].join(' ')}
            >
              {localEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Delete */}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className={[
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              'border border-red-500/20 text-red-400 hover:bg-red-500/10 hover:border-red-500/40',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500',
              deleting ? 'opacity-50 cursor-not-allowed' : '',
            ].join(' ')}
          >
            {deleting ? (
              <>
                <Spinner />
                Deleting…
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                </svg>
                Delete
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function GamesPage() {
  const [packages, setPackages] = useState<GamePackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchPackages = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/admin/games`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json() as { success: boolean; data: GamePackage[] };
      setPackages(Array.isArray(body.data) ? body.data : []);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load game packages');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  // ── Upload ─────────────────────────────────────────────────────────────────

  const uploadFile = async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      setUploadError('Only .zip game packages are accepted.');
      return;
    }

    setUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${BASE_URL}/admin/games/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
      }

      const body = await res.json() as { success: boolean; data: GamePackage };
      setPackages((prev) => [body.data, ...prev]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // ── Drag & drop handlers ───────────────────────────────────────────────────

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setDragOver(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    // Reset so re-selecting same file triggers onChange
    e.target.value = '';
  };

  // ── Toggle ─────────────────────────────────────────────────────────────────

  const handleToggle = async (id: string, isEnabled: boolean) => {
    const res = await fetch(`${BASE_URL}/admin/games/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isEnabled }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
    }
    const body = await res.json() as { success: boolean; data: GamePackage };
    setPackages((prev) => prev.map((p) => (p.id === id ? body.data : p)));
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string, name: string) => {
    const confirmed = window.confirm(
      `Delete "${name}"?\n\nThis will permanently remove the game package. Shows using this game will be affected.`
    );
    if (!confirmed) return;

    const res = await fetch(`${BASE_URL}/admin/games/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
    }
    setPackages((prev) => prev.filter((p) => p.id !== id));
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Games Library</h2>
          <p className="mt-1 text-sm text-gray-500">
            Manage game packages available for shows
          </p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className={[
            'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all shrink-0',
            'bg-euphoria-purple text-white hover:bg-violet-500',
            'shadow-[0_0_16px_rgba(124,58,237,0.3)] hover:shadow-[0_0_20px_rgba(124,58,237,0.45)]',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-euphoria-purple',
            uploading ? 'opacity-60 cursor-not-allowed' : '',
          ].join(' ')}
        >
          {uploading ? (
            <>
              <Spinner />
              Uploading…
            </>
          ) : (
            <>
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M9.25 13.25a.75.75 0 001.5 0V4.636l2.955 3.129a.75.75 0 001.09-1.03l-4.25-4.5a.75.75 0 00-1.09 0l-4.25 4.5a.75.75 0 101.09 1.03L9.25 4.636v8.614z" />
                <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
              </svg>
              Upload Game
            </>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Upload error banner */}
      {uploadError && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-9.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zm.75 6a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
          </svg>
          <span>
            <span className="font-semibold">Upload failed</span> — {uploadError}
          </span>
          <button
            onClick={() => setUploadError(null)}
            className="ml-auto text-xs underline hover:text-red-300 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Load error banner */}
      {loadError && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-9.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zm.75 6a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
          </svg>
          <span>
            <span className="font-semibold">API unreachable</span> — {loadError}
          </span>
          <button
            onClick={fetchPackages}
            className="ml-auto text-xs underline hover:text-red-300 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Drag & drop zone */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={[
          'relative flex flex-col items-center justify-center gap-3 rounded-xl',
          'border-2 border-dashed px-6 py-10 text-center cursor-pointer',
          'transition-all duration-200 select-none',
          dragOver
            ? 'border-euphoria-purple bg-euphoria-purple/5 shadow-[0_0_0_4px_rgba(124,58,237,0.15)] animate-pulse'
            : 'border-euphoria-border hover:border-euphoria-purple/40 hover:bg-white/[0.02]',
          uploading ? 'pointer-events-none opacity-60' : '',
        ].join(' ')}
      >
        {uploading ? (
          <>
            <Spinner size="md" />
            <p className="text-sm text-gray-400 font-medium">Uploading package…</p>
          </>
        ) : dragOver ? (
          <>
            <div className="h-10 w-10 rounded-full bg-euphoria-purple/20 flex items-center justify-center">
              <svg className="h-5 w-5 text-euphoria-purple" viewBox="0 0 20 20" fill="currentColor">
                <path d="M9.25 13.25a.75.75 0 001.5 0V4.636l2.955 3.129a.75.75 0 001.09-1.03l-4.25-4.5a.75.75 0 00-1.09 0l-4.25 4.5a.75.75 0 101.09 1.03L9.25 4.636v8.614z" />
              </svg>
            </div>
            <p className="text-sm text-euphoria-purple font-medium">Drop to upload</p>
          </>
        ) : (
          <>
            <div className="h-10 w-10 rounded-full bg-gray-800 border border-euphoria-border flex items-center justify-center">
              <GamepadIcon className="h-5 w-5 text-gray-500" />
            </div>
            <div>
              <p className="text-sm text-gray-400 font-medium">
                Drop a <span className="font-mono text-gray-300">.zip</span> game package here or{' '}
                <span className="text-euphoria-purple underline underline-offset-2">click to browse</span>
              </p>
              <p className="text-xs text-gray-600 mt-1">
                Packages must include a valid <span className="font-mono">manifest.json</span>
              </p>
            </div>
          </>
        )}
      </div>

      {/* Package list */}
      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
        ) : packages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-600">
            <GamepadIcon className="h-10 w-10" />
            <p className="text-sm">No games installed.</p>
            <p className="text-xs text-gray-700">Upload a .zip package to get started.</p>
          </div>
        ) : (
          packages.map((pkg) => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      {/* Footer note */}
      {!loading && packages.length > 0 && (
        <p className="text-xs text-gray-700 pt-2">
          {packages.length} package{packages.length !== 1 ? 's' : ''} installed.
          Disabled packages are hidden from show configuration.
        </p>
      )}
    </div>
  );
}
