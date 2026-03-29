import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type FlagType = 'boolean' | 'number' | 'json' | 'string';

interface FeatureFlag {
  key: string;
  value: boolean | number | string;
  description?: string;
  updatedAt: string;
}

type SaveState = 'idle' | 'saving' | 'success' | 'error';

// ─── Static config ────────────────────────────────────────────────────────────

const FLAG_TYPES: Record<string, FlagType> = {
  coin_earn_rate_multiplier: 'number',
  retry_max_per_show: 'number',
  playclip_streak_multipliers: 'json',
  show_join_enabled: 'boolean',
  guest_coin_bonus: 'number',
  trivia_time_limit_ms: 'number',
  show_schedule_enabled: 'boolean',
};

const FLAG_DESCRIPTIONS: Record<string, string> = {
  coin_earn_rate_multiplier: 'Multiplier applied to all coin earn events platform-wide',
  retry_max_per_show: 'Maximum retry attempts a player can use in a single show',
  playclip_streak_multipliers: 'JSON array of multipliers applied per streak milestone',
  show_join_enabled: 'Allow players to join live shows — disable for emergency lockout',
  guest_coin_bonus: 'Bonus coins awarded to guest accounts on first play',
  trivia_time_limit_ms: 'Per-question time limit for trivia rounds in milliseconds',
  show_schedule_enabled: 'Allow the scheduler to automatically queue upcoming shows',
};

const BASE_URL = `${import.meta.env.VITE_API_URL ?? ''}/api/v1`;
const POLL_INTERVAL_MS = 10_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleDateString();
}

function serializeForDisplay(value: boolean | number | string, type: FlagType): string {
  if (type === 'json') {
    try {
      return JSON.stringify(typeof value === 'string' ? JSON.parse(value) : value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function parseEditValue(raw: string, type: FlagType): boolean | number | string {
  if (type === 'boolean') return raw === 'true';
  if (type === 'number') return Number(raw);
  if (type === 'json') return raw; // send as string, API will parse
  return raw;
}

function isValidEdit(raw: string, type: FlagType): boolean {
  if (type === 'number') return !isNaN(Number(raw)) && raw.trim() !== '';
  if (type === 'json') {
    try { JSON.parse(raw); return true; } catch { return false; }
  }
  return true;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

interface FlagCardProps {
  flag: FeatureFlag;
  type: FlagType;
  onSave: (key: string, value: boolean | number | string) => Promise<void>;
}

function FlagCard({ flag, type, onSave }: FlagCardProps) {
  const [editValue, setEditValue] = useState(() => serializeForDisplay(flag.value, type));
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [localFlag, setLocalFlag] = useState(flag);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep in sync when poll updates come in (only if not mid-edit)
  useEffect(() => {
    setLocalFlag(flag);
    if (saveState === 'idle') {
      setEditValue(serializeForDisplay(flag.value, type));
    }
  }, [flag, type]); // eslint-disable-line react-hooks/exhaustive-deps

  const originalValue = serializeForDisplay(localFlag.value, type);
  const isDirty = editValue !== originalValue;
  const isValid = isValidEdit(editValue, type);

  const triggerFlash = (state: 'success' | 'error') => {
    setSaveState(state);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSaveState('idle'), 2000);
  };

  const handleSave = async () => {
    if (!isDirty || !isValid || saveState === 'saving') return;
    setSaveState('saving');
    try {
      const parsed = parseEditValue(editValue, type);
      await onSave(flag.key, parsed);
      setLocalFlag((prev) => ({ ...prev, value: parsed, updatedAt: new Date().toISOString() }));
      triggerFlash('success');
    } catch {
      triggerFlash('error');
    }
  };

  const handleToggle = async (val: boolean) => {
    setSaveState('saving');
    try {
      await onSave(flag.key, val);
      setLocalFlag((prev) => ({ ...prev, value: val, updatedAt: new Date().toISOString() }));
      setEditValue(String(val));
      triggerFlash('success');
    } catch {
      triggerFlash('error');
    }
  };

  const borderClass =
    saveState === 'success'
      ? 'border-emerald-500 shadow-[0_0_0_1px_#10B981]'
      : saveState === 'error'
        ? 'border-red-500 shadow-[0_0_0_1px_#EF4444]'
        : 'border-euphoria-border hover:border-euphoria-purple/40';

  return (
    <div
      className={[
        'bg-euphoria-card rounded-xl border p-5 flex flex-col gap-4 transition-all duration-300',
        borderClass,
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <code className="text-sm font-mono font-semibold text-euphoria-purple break-all">
            {flag.key}
          </code>
          {FLAG_DESCRIPTIONS[flag.key] && (
            <p className="mt-1 text-xs text-gray-500 leading-relaxed">
              {FLAG_DESCRIPTIONS[flag.key]}
            </p>
          )}
        </div>

        {/* Type pill */}
        <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-medium bg-gray-800 text-gray-500 border border-gray-700 uppercase tracking-wide">
          {type}
        </span>
      </div>

      {/* Control */}
      <div className="flex flex-col gap-3">
        {type === 'boolean' ? (
          <div className="flex items-center justify-between">
            <span className={[
              'text-sm font-semibold',
              localFlag.value ? 'text-emerald-400' : 'text-gray-500',
            ].join(' ')}>
              {localFlag.value ? 'Enabled' : 'Disabled'}
            </span>
            <ToggleSwitch
              checked={Boolean(localFlag.value)}
              onChange={handleToggle}
              disabled={saveState === 'saving'}
            />
          </div>
        ) : type === 'json' ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              rows={5}
              spellCheck={false}
              className={[
                'w-full px-3 py-2 rounded-lg bg-euphoria-dark border font-mono text-xs text-gray-100',
                'resize-y leading-relaxed',
                'focus:outline-none focus:border-euphoria-purple transition-colors',
                !isValid && isDirty ? 'border-red-500/70' : 'border-euphoria-border',
              ].join(' ')}
            />
            {!isValid && isDirty && (
              <p className="text-[11px] text-red-400">Invalid JSON</p>
            )}
          </div>
        ) : (
          <input
            type="number"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className={[
              'w-full px-3 py-2 rounded-lg bg-euphoria-dark border font-mono text-sm text-gray-100',
              'focus:outline-none focus:border-euphoria-purple transition-colors',
              !isValid && isDirty ? 'border-red-500/70' : 'border-euphoria-border',
            ].join(' ')}
          />
        )}

        {/* Save button — only shown when dirty (non-boolean) */}
        {type !== 'boolean' && (
          <div className="flex items-center justify-between gap-3 min-h-[28px]">
            <span className="text-[11px] text-gray-700">
              Updated {formatTimestamp(localFlag.updatedAt)}
            </span>
            {isDirty && (
              <button
                onClick={handleSave}
                disabled={!isValid || saveState === 'saving'}
                className={[
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-euphoria-purple',
                  isValid && saveState !== 'saving'
                    ? 'bg-euphoria-purple text-white hover:bg-violet-500 shadow-[0_0_12px_rgba(124,58,237,0.3)]'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed',
                ].join(' ')}
              >
                {saveState === 'saving' ? (
                  <>
                    <Spinner />
                    Saving…
                  </>
                ) : (
                  'Save'
                )}
              </button>
            )}
          </div>
        )}

        {/* Timestamp for boolean flags */}
        {type === 'boolean' && (
          <span className="text-[11px] text-gray-700">
            Updated {formatTimestamp(localFlag.updatedAt)}
          </span>
        )}
      </div>

      {/* Flash feedback strip */}
      {(saveState === 'success' || saveState === 'error') && (
        <div className={[
          'text-[11px] font-medium px-2 py-1 rounded-md',
          saveState === 'success'
            ? 'bg-emerald-500/10 text-emerald-400'
            : 'bg-red-500/10 text-red-400',
        ].join(' ')}>
          {saveState === 'success' ? 'Saved and propagating…' : 'Save failed — check API connection'}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-3 w-3"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function LiveBadge({ connected }: { connected: boolean }) {
  return (
    <span className={[
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold tracking-wide',
      connected
        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
        : 'bg-gray-800 text-gray-500 border border-gray-700',
    ].join(' ')}>
      <span className={[
        'h-1.5 w-1.5 rounded-full',
        connected ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600',
      ].join(' ')} />
      {connected ? 'LIVE' : 'OFFLINE'}
    </span>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-euphoria-card rounded-xl border border-euphoria-border p-5 flex flex-col gap-4 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-2 flex-1">
          <div className="h-4 w-48 bg-gray-800 rounded" />
          <div className="h-3 w-full bg-gray-800 rounded" />
        </div>
        <div className="h-5 w-14 bg-gray-800 rounded-md ml-2 shrink-0" />
      </div>
      <div className="h-9 w-full bg-gray-800 rounded-lg" />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ConfigPage() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchFlags = useCallback(async (silent = false) => {
    try {
      const res = await fetch(`${BASE_URL}/admin/flags`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json() as { success: boolean; data: FeatureFlag[] };
      setFlags(Array.isArray(body.data) ? body.data : []);
      setConnected(true);
      if (!silent) setLoadError(null);
    } catch (err) {
      setConnected(false);
      if (!silent) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load flags');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Initial load + polling
  useEffect(() => {
    fetchFlags(false);
    pollRef.current = setInterval(() => fetchFlags(true), POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchFlags]);

  const handleSave = async (key: string, value: boolean | number | string) => {
    const res = await fetch(`${BASE_URL}/admin/flags/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.message ?? `HTTP ${res.status}`);
    }
    // Optimistically update local flags list so next poll won't clobber the card
    setFlags((prev) =>
      prev.map((f) =>
        f.key === key ? { ...f, value, updatedAt: new Date().toISOString() } : f,
      ),
    );
  };

  // Determine display order: known flags first (in FLAG_TYPES order), then any extras
  const knownKeys = Object.keys(FLAG_TYPES);
  const sortedFlags = [
    ...knownKeys.flatMap((k) => flags.filter((f) => f.key === k)),
    ...flags.filter((f) => !knownKeys.includes(f.key)),
  ];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">LiveOps Config</h2>
          <p className="mt-1 text-sm text-gray-500">
            Changes take effect immediately&nbsp;&mdash;&nbsp;no deploy required
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0 pt-1">
          <LiveBadge connected={connected} />
          <span className="text-xs text-gray-700">
            Polls every {POLL_INTERVAL_MS / 1000}s
          </span>
        </div>
      </div>

      {/* Load error banner */}
      {loadError && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-9.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zm.75 6a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
          </svg>
          <span>
            <span className="font-semibold">API unreachable</span> — {loadError}. Showing last known state.
          </span>
          <button
            onClick={() => fetchFlags(false)}
            className="ml-auto text-xs underline hover:text-red-300 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Flag grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading
          ? Array.from({ length: 7 }).map((_, i) => <SkeletonCard key={i} />)
          : sortedFlags.length === 0
            ? (
              <div className="col-span-3 flex flex-col items-center justify-center py-20 gap-3 text-gray-600">
                <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2 9m13-9l2 9M9 21h6" />
                </svg>
                <p className="text-sm">No flags returned from API</p>
              </div>
            )
            : sortedFlags.map((flag) => (
              <FlagCard
                key={flag.key}
                flag={flag}
                type={FLAG_TYPES[flag.key] ?? 'string'}
                onSave={handleSave}
              />
            ))
        }
      </div>

      {/* Footer note */}
      {!loading && sortedFlags.length > 0 && (
        <p className="text-xs text-gray-700 pt-2">
          Flag values are hot-patched via Redis and sourced from PostgreSQL. Auth guard (JWT) will be added in Phase 2.
        </p>
      )}
    </div>
  );
}
