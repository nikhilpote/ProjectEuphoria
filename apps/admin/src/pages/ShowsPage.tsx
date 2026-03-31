import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  getShows,
  createShow,
  updateShow,
  deleteShow,
  getShowDetail,
  getMediaLibrary,
  createShowClips,
  getShowClips,
  deleteShowClip,
  type Show,
  type CreateShowInput,
  type MediaFile,
  type ClipRangeInput,
} from '../api/shows';

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 10_000;
const UPLOAD_URL = `${import.meta.env.VITE_API_URL ?? ''}/api/v1/admin/upload`;
const MARKER_COLORS = ['#7C3AED', '#2563EB', '#16A34A', '#DC2626', '#D97706', '#0891B2', '#DB2777'];
const DEFAULT_VIDEO_DURATION = 300;

const GAME_TYPES = [
  'trivia',
  'quick_math',
  'fruit_cutting',
  'knife_at_center',
  'spelling_bee',
  'find_items',
  'memory_grid',
];

const GAME_TYPE_LABELS: Record<string, string> = {
  trivia: 'Trivia',
  quick_math: 'Quick Math',
  fruit_cutting: 'Fruit Cutting',
  knife_at_center: 'Knife at Center',
  spelling_bee: 'Spelling Bee',
  find_items: 'Find Items',
  memory_grid: 'Memory Grid',
};

const GAME_TYPE_SHORT: Record<string, string> = {
  trivia: 'TRV',
  quick_math: 'QM',
  fruit_cutting: 'FC',
  knife_at_center: 'KC',
  spelling_bee: 'SB',
  find_items: 'FI',
  memory_grid: 'MG',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface UIMarker {
  id: string;
  at: number;
  duration: number;
  gameType: string;
  config: Record<string, unknown>;
}

interface UIClipRange {
  id: string;
  startAt: number; // seconds
  endAt: number;   // seconds
  saved: boolean;  // true = already in DB, false = pending save
  saving?: boolean;
}

type ToastVariant = 'success' | 'error';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _uidCounter = 0;
function uid(): string {
  return `m_${Date.now()}_${++_uidCounter}`;
}

function formatScheduledAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function defaultScheduledAt(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function formatSeconds(s: number): string {
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
}

async function uploadFile(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(UPLOAD_URL, { method: 'POST', body: form });
  const body = (await res.json()) as { data?: { url: string } };
  const url = body?.data?.url;
  if (!url) throw new Error('No URL returned from server');
  return url;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function defaultConfig(gameType: string): Record<string, unknown> {
  if (gameType === 'trivia')
    return {
      trivia: {
        question: { text: '' },
        options: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }],
        correctIndex: 0,
      },
    };
  if (gameType === 'quick_math')
    return {
      quickMath: { expression: '', options: ['', '', '', ''], correctIndex: 0 },
    };
  return {};
}

function rawSequenceToUIMarkers(seq: unknown[]): UIMarker[] {
  return (seq as Array<Record<string, unknown>>).map((m) => ({
    id: uid(),
    at: typeof m['at'] === 'number' ? m['at'] : 0,
    duration: typeof m['duration'] === 'number' ? m['duration'] : 20,
    gameType: typeof m['gameType'] === 'string' ? m['gameType'] : 'trivia',
    config: (m['config'] as Record<string, unknown>) ?? {},
  }));
}

function placeMarkersFromGames(
  games: Array<{ gameType: string; config: Record<string, unknown>; timeLimitMs?: number }>,
  videoDuration: number,
): UIMarker[] {
  const total = games.length;
  if (total === 0) return [];
  const slotSize = (videoDuration * 0.85) / total;
  return games.map((g, i) => {
    const duration = typeof g.timeLimitMs === 'number' ? Math.round(g.timeLimitMs / 1000) : 20;
    const slotStart = videoDuration * 0.05 + i * slotSize;
    const at = Math.round(slotStart + Math.random() * Math.max(0, slotSize - duration - 5));
    return {
      id: uid(),
      at: Math.max(0, at),
      duration,
      gameType: g.gameType,
      config: g.config,
    };
  });
}

const GAME_TEMPLATE = [
  {
    gameType: 'trivia',
    config: {
      trivia: {
        question: { text: 'What is the capital of France?' },
        options: [{ text: 'Paris' }, { text: 'London' }, { text: 'Berlin' }, { text: 'Madrid' }],
        correctIndex: 0,
      },
    },
  },
  {
    gameType: 'quick_math',
    config: {
      quickMath: {
        expression: '12 × 7 = ?',
        options: ['84', '72', '96', '88'],
        correctIndex: 0,
      },
    },
  },
  {
    gameType: 'spot_difference',
    config: {
      spotDifference: {
        levelId: 'beach-scene',
      },
    },
    timeLimitMs: 20000,
  },
];

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Show['status'] }) {
  const styles: Record<Show['status'], string> = {
    scheduled: 'bg-gray-700/60 text-gray-300 border-gray-600',
    lobby: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    live: 'bg-green-500/15 text-green-400 border-green-500/30',
    completed: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    cancelled: 'bg-red-500/15 text-red-400 border-red-500/30',
  };
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold border',
        styles[status],
      ].join(' ')}
    >
      {status === 'live' && (
        <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
      )}
      {status.toUpperCase()}
    </span>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function ToastStack({
  messages,
  onDismiss,
}: {
  messages: { id: number; variant: ToastVariant; text: string }[];
  onDismiss: (id: number) => void;
}) {
  if (messages.length === 0) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 items-end">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={[
            'flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium shadow-xl',
            'animate-in slide-in-from-bottom-2 duration-200',
            msg.variant === 'success'
              ? 'bg-green-500/10 border-green-500/30 text-green-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300',
          ].join(' ')}
        >
          <span>{msg.text}</span>
          <button onClick={() => onDismiss(msg.id)} className="ml-1 opacity-60 hover:opacity-100">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-[#2A2A4A] animate-pulse">
      {[140, 80, 60, 80, 100, 80].map((w, i) => (
        <td key={i} className="px-5 py-4">
          <div className="h-4 bg-gray-800 rounded" style={{ width: w }} />
        </td>
      ))}
    </tr>
  );
}

// ─── Trivia config form ───────────────────────────────────────────────────────

interface TriviaConfigData {
  question: { text: string };
  options: { text: string }[];
  correctIndex: number;
}

function TriviaConfigForm({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  const trivia = (config['trivia'] as TriviaConfigData | undefined) ?? {
    question: { text: '' },
    options: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }],
    correctIndex: 0,
  };

  const update = (patch: Partial<TriviaConfigData>) =>
    onChange({ trivia: { ...trivia, ...patch } });

  const setOption = (idx: number, text: string) => {
    const options = trivia.options.map((o, i) => (i === idx ? { text } : o));
    update({ options });
  };

  const LETTERS = ['A', 'B', 'C', 'D'];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
          Question
        </label>
        <input
          type="text"
          value={trivia.question.text}
          onChange={(e) => update({ question: { text: e.target.value } })}
          placeholder="What is the capital of France?"
          className="w-full px-3 py-2 rounded-lg bg-[#0A0A14] border border-[#2A2A4A] text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-[#7C3AED] transition-colors"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
          Options
        </label>
        {LETTERS.map((letter, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span
              className="shrink-0 w-6 h-6 rounded flex items-center justify-center text-xs font-bold"
              style={{
                background: trivia.correctIndex === idx ? '#7C3AED22' : '#ffffff08',
                color: trivia.correctIndex === idx ? '#A78BFA' : '#6B7280',
                border: `1px solid ${trivia.correctIndex === idx ? '#7C3AED55' : '#2A2A4A'}`,
              }}
            >
              {letter}
            </span>
            <input
              type="text"
              value={trivia.options[idx]?.text ?? ''}
              onChange={(e) => setOption(idx, e.target.value)}
              placeholder={`Option ${letter}`}
              className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#0A0A14] border border-[#2A2A4A] text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-[#7C3AED] transition-colors"
            />
            <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
              <input
                type="radio"
                name="trivia-correct"
                checked={trivia.correctIndex === idx}
                onChange={() => update({ correctIndex: idx })}
                className="accent-violet-500 w-3.5 h-3.5"
              />
              <span className="text-[10px] text-gray-600">Correct</span>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Quick Math config form ───────────────────────────────────────────────────

interface QuickMathConfigData {
  expression: string;
  options: string[];
  correctIndex: number;
}

function QuickMathConfigForm({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  const qm = (config['quickMath'] as QuickMathConfigData | undefined) ?? {
    expression: '',
    options: ['', '', '', ''],
    correctIndex: 0,
  };

  const update = (patch: Partial<QuickMathConfigData>) =>
    onChange({ quickMath: { ...qm, ...patch } });

  const setOption = (idx: number, val: string) => {
    const options = qm.options.map((o, i) => (i === idx ? val : o));
    update({ options });
  };

  const LETTERS = ['A', 'B', 'C', 'D'];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
          Expression
        </label>
        <input
          type="text"
          value={qm.expression}
          onChange={(e) => update({ expression: e.target.value })}
          placeholder="12 × 7 = ?"
          className="w-full px-3 py-2 rounded-lg bg-[#0A0A14] border border-[#2A2A4A] text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-[#7C3AED] transition-colors"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
          Options
        </label>
        {LETTERS.map((letter, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span
              className="shrink-0 w-6 h-6 rounded flex items-center justify-center text-xs font-bold"
              style={{
                background: qm.correctIndex === idx ? '#7C3AED22' : '#ffffff08',
                color: qm.correctIndex === idx ? '#A78BFA' : '#6B7280',
                border: `1px solid ${qm.correctIndex === idx ? '#7C3AED55' : '#2A2A4A'}`,
              }}
            >
              {letter}
            </span>
            <input
              type="text"
              value={qm.options[idx] ?? ''}
              onChange={(e) => setOption(idx, e.target.value)}
              placeholder={`Answer ${letter}`}
              className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#0A0A14] border border-[#2A2A4A] text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-[#7C3AED] transition-colors"
            />
            <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
              <input
                type="radio"
                name="qm-correct"
                checked={qm.correctIndex === idx}
                onChange={() => update({ correctIndex: idx })}
                className="accent-violet-500 w-3.5 h-3.5"
              />
              <span className="text-[10px] text-gray-600">Correct</span>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Marker card ──────────────────────────────────────────────────────────────

function MarkerCard({
  marker,
  index,
  isSelected,
  videoDuration,
  cardRef,
  onSelect,
  onUpdate,
  onDelete,
}: {
  marker: UIMarker;
  index: number;
  isSelected: boolean;
  videoDuration: number;
  cardRef?: React.RefObject<HTMLDivElement | null>;
  onSelect: () => void;
  onUpdate: (patch: Partial<UIMarker>) => void;
  onDelete: () => void;
}) {
  const color = MARKER_COLORS[index % MARKER_COLORS.length];

  const handleGameTypeChange = (gt: string) => {
    onUpdate({ gameType: gt, config: defaultConfig(gt) });
  };

  const handleAtChange = (val: number) => {
    const clamped = Math.max(0, Math.min(val, videoDuration - marker.duration));
    onUpdate({ at: clamped });
  };

  const handleDurationChange = (val: number) => {
    const clamped = Math.max(5, Math.min(val, videoDuration - marker.at));
    onUpdate({ duration: clamped });
  };

  const renderConfigForm = () => {
    if (marker.gameType === 'trivia') {
      return (
        <TriviaConfigForm config={marker.config} onChange={(c) => onUpdate({ config: c })} />
      );
    }
    if (marker.gameType === 'quick_math') {
      return (
        <QuickMathConfigForm config={marker.config} onChange={(c) => onUpdate({ config: c })} />
      );
    }
    return (
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
          Raw Config (JSON)
        </label>
        <textarea
          rows={6}
          value={JSON.stringify(marker.config, null, 2)}
          onChange={(e) => {
            try {
              onUpdate({ config: JSON.parse(e.target.value) as Record<string, unknown> });
            } catch {
              // allow invalid json while typing
            }
          }}
          spellCheck={false}
          className="w-full px-3 py-2 rounded-lg bg-[#0A0A14] border border-[#2A2A4A] text-xs text-gray-200 font-mono focus:outline-none focus:border-[#7C3AED] transition-colors resize-none leading-relaxed"
        />
      </div>
    );
  };

  return (
    <div
      ref={cardRef}
      onClick={onSelect}
      className={[
        'rounded-xl border transition-all cursor-pointer',
        isSelected
          ? 'border-[#7C3AED]/60 bg-[#7C3AED]/5'
          : 'border-[#2A2A4A] bg-[#0F0F1A] hover:border-[#3A3A5A]',
      ].join(' ')}
    >
      {/* Card header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="shrink-0 w-2 h-2 rounded-full" style={{ background: color }} />
        <span className="text-xs font-bold text-gray-400">#{index + 1}</span>
        <span className="text-xs font-semibold text-gray-200">
          {GAME_TYPE_LABELS[marker.gameType] ?? marker.gameType}
        </span>
        <span className="text-[10px] text-gray-500 font-mono">
          {formatTime(marker.at)} &rarr; {formatTime(marker.at + marker.duration)}
        </span>
        <span className="text-[10px] text-gray-600 font-mono">({marker.duration}s)</span>
        <div className="flex-1" />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="text-gray-600 hover:text-red-400 transition-colors text-lg leading-none px-1"
        >
          ×
        </button>
      </div>

      {/* Expanded body — always shown when selected */}
      {isSelected && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="px-3 pb-3 flex flex-col gap-3 border-t border-[#2A2A4A]"
        >
          {/* Game type selector */}
          <div className="pt-3 flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
              Game Type
            </label>
            <select
              value={marker.gameType}
              onChange={(e) => handleGameTypeChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#0A0A14] border border-[#2A2A4A] text-sm text-gray-100 focus:outline-none focus:border-[#7C3AED] transition-colors"
            >
              {GAME_TYPES.map((gt) => (
                <option key={gt} value={gt}>
                  {GAME_TYPE_LABELS[gt]}
                </option>
              ))}
            </select>
          </div>

          {/* Config form */}
          {renderConfigForm()}

          {/* At / Duration number inputs */}
          <div className="grid grid-cols-2 gap-3 pt-1 border-t border-[#2A2A4A]">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                Start (s)
              </label>
              <input
                type="number"
                min={0}
                max={videoDuration - marker.duration}
                value={marker.at}
                onChange={(e) => handleAtChange(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-[#0A0A14] border border-[#2A2A4A] text-sm text-gray-100 focus:outline-none focus:border-[#7C3AED] transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                Duration (s)
              </label>
              <input
                type="number"
                min={5}
                max={videoDuration - marker.at}
                value={marker.duration}
                onChange={(e) => handleDurationChange(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-[#0A0A14] border border-[#2A2A4A] text-sm text-gray-100 focus:outline-none focus:border-[#7C3AED] transition-colors"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── VideoThumbnail ───────────────────────────────────────────────────────────

function VideoThumbnail({ url }: { url: string }) {
  return (
    <video
      src={url}
      preload="metadata"
      muted
      playsInline
      onLoadedMetadata={(e) => {
        e.currentTarget.currentTime = 0.01;
      }}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  );
}

// ─── MediaLibraryModal ────────────────────────────────────────────────────────

const LIBRARY_PAGE_SIZE = 12;

function MediaLibraryModal({
  files,
  loading,
  onClose,
  onPick,
}: {
  files: MediaFile[];
  loading: boolean;
  onClose: () => void;
  onPick: (entry: MediaFile) => void;
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'latest' | 'oldest' | 'name'>('latest');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let result = [...files];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((f) => f.filename.toLowerCase().includes(q));
    }
    if (sort === 'latest')
      result.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    else if (sort === 'oldest')
      result.sort((a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime());
    else
      result.sort((a, b) => a.filename.localeCompare(b.filename));
    return result;
  }, [files, search, sort]);

  const totalPages = Math.ceil(filtered.length / LIBRARY_PAGE_SIZE);
  const pageFiles = filtered.slice(page * LIBRARY_PAGE_SIZE, (page + 1) * LIBRARY_PAGE_SIZE);

  useEffect(() => setPage(0), [search, sort]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] bg-[#0D0D18] border border-[#2A2A4A] rounded-2xl flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center gap-3 px-5 py-3 border-b border-[#2A2A4A]">
          <h2 className="text-sm font-bold text-gray-100">Media Library</h2>
          {!loading && (
            <span className="text-xs text-gray-500">
              {filtered.length} video{filtered.length !== 1 ? 's' : ''}
            </span>
          )}
          <div className="flex-1" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="px-3 py-1.5 rounded-lg bg-[#13131F] border border-[#2A2A4A] text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#7C3AED] w-44 transition-colors"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as 'latest' | 'oldest' | 'name')}
            className="px-2.5 py-1.5 rounded-lg bg-[#13131F] border border-[#2A2A4A] text-xs text-gray-300 focus:outline-none focus:border-[#7C3AED] [color-scheme:dark]"
          >
            <option value="latest">Latest</option>
            <option value="oldest">Oldest</option>
            <option value="name">Name A–Z</option>
          </select>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-600 hover:text-gray-300 text-xl leading-none px-1"
          >
            ×
          </button>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-xs text-gray-600">
              Loading from S3…
            </div>
          ) : pageFiles.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-xs text-gray-600">
              {search.trim() ? 'No videos match your search.' : 'No videos uploaded yet.'}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {pageFiles.map((entry) => (
                <button
                  key={entry.url}
                  type="button"
                  onClick={() => onPick(entry)}
                  className="group rounded-xl border border-[#2A2A4A] hover:border-[#7C3AED] bg-[#08080F] overflow-hidden text-left transition-all"
                >
                  <div className="relative bg-black" style={{ paddingTop: '56.25%' }}>
                    <div style={{ position: 'absolute', inset: 0 }}>
                      <VideoThumbnail url={entry.url} />
                    </div>
                  </div>
                  <div className="px-2.5 py-2">
                    <p className="text-xs font-medium text-gray-200 truncate group-hover:text-violet-300 transition-colors">
                      {entry.filename}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-gray-600">{formatFileSize(entry.size)}</span>
                      <span className="text-[10px] text-gray-700">·</span>
                      <span className="text-[10px] text-gray-600">
                        {new Date(entry.uploadedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="shrink-0 flex items-center justify-between px-5 py-2.5 border-t border-[#2A2A4A] bg-[#08080F]">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 text-xs rounded-lg bg-[#13131F] border border-[#2A2A4A] text-gray-400 hover:border-[#7C3AED] hover:text-violet-300 disabled:opacity-30 transition-all"
            >
              ← Previous
            </button>
            <span className="text-xs text-gray-600">
              Page {page + 1} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1 text-xs rounded-lg bg-[#13131F] border border-[#2A2A4A] text-gray-400 hover:border-[#7C3AED] hover:text-violet-300 disabled:opacity-30 transition-all"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Show Editor Modal ────────────────────────────────────────────────────────

interface ShowEditorModalProps {
  onClose: () => void;
  onSaved: () => void;
  onToast: (variant: ToastVariant, text: string) => void;
  editShow?: {
    id: string;
    title: string;
    status: string;
    scheduledAt: string;
    lobbyDurationMs?: number;
    videoUrl: string | null;
    gameSequence: unknown[];
  };
}

function ShowEditorModal({ onClose, onSaved, onToast, editShow }: ShowEditorModalProps) {
  const isEditing = editShow !== undefined;

  // ── Show metadata
  const [title, setTitle] = useState(isEditing ? editShow!.title : '');
  const [scheduledAt, setScheduledAt] = useState(
    isEditing ? isoToDatetimeLocal(editShow!.scheduledAt) : defaultScheduledAt(),
  );
  const [lobbyDurationMs, setLobbyDurationMs] = useState(
    isEditing ? (editShow!.lobbyDurationMs ?? 10000) : 10000,
  );

  // ── Video
  const [videoUrl, setVideoUrl] = useState(isEditing ? (editShow!.videoUrl ?? '') : '');
  const [videoDuration, setVideoDuration] = useState(DEFAULT_VIDEO_DURATION);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPlayOverlay, setShowPlayOverlay] = useState(true);
  const [videoUploading, setVideoUploading] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [videoLibrary, setVideoLibrary] = useState<MediaFile[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);

  // ── Timeline zoom
  const [zoom, setZoom] = useState(1);
  const [viewStart, setViewStart] = useState(0);

  // ── Markers
  const [markers, setMarkers] = useState<UIMarker[]>(() =>
    isEditing ? rawSequenceToUIMarkers(editShow!.gameSequence) : [],
  );
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);

  // ── Clip ranges (completed shows only)
  const isCompleted = editShow?.status === 'completed';
  const [clipRanges, setClipRanges] = useState<UIClipRange[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [savingClips, setSavingClips] = useState(false);

  // Load existing saved clips when opening a completed show
  useEffect(() => {
    if (!isCompleted || !editShow?.id) return;
    getShowClips(editShow.id)
      .then((saved) => {
        setClipRanges(saved.map((c) => ({
          id: c.id,
          startAt: c.clipStartMs / 1000,
          endAt: c.clipEndMs / 1000,
          saved: true,
        })));
      })
      .catch(() => {/* ignore — user can add manually */});
  }, [isCompleted, editShow?.id]);
  const clipRangeRef = useRef<HTMLDivElement>(null);
  const clipDragRef = useRef<{
    clipId: string;
    type: 'move' | 'resize';
    startX: number;
    startAt: number;
    startEnd: number;
  } | null>(null);

  // ── Misc
  const [submitting, setSubmitting] = useState(false);

  // ── Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);
  const gameJsonFileRef = useRef<HTMLInputElement>(null);
  const selectedCardRef = useRef<HTMLDivElement>(null);
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timelineDragRef = useRef<{
    type: 'scrub' | 'move' | 'resize';
    markerId?: string;
    startX: number;
    startAt?: number;
    startDuration?: number;
    barWidth: number;
    viewDuration: number;
  } | null>(null);

  // ── Effects

  useEffect(() => {
    setLibraryLoading(true);
    getMediaLibrary()
      .then((files) => setVideoLibrary(files))
      .catch(() => setVideoLibrary([]))
      .finally(() => setLibraryLoading(false));
  }, []);

  // Wire up video events
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const onTimeUpdate = () => setCurrentTime(vid.currentTime);
    const onMeta = () => {
      if (vid.duration && isFinite(vid.duration)) setVideoDuration(vid.duration);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    vid.addEventListener('timeupdate', onTimeUpdate);
    vid.addEventListener('loadedmetadata', onMeta);
    vid.addEventListener('play', onPlay);
    vid.addEventListener('pause', onPause);
    vid.addEventListener('ended', onEnded);
    return () => {
      vid.removeEventListener('timeupdate', onTimeUpdate);
      vid.removeEventListener('loadedmetadata', onMeta);
      vid.removeEventListener('play', onPlay);
      vid.removeEventListener('pause', onPause);
      vid.removeEventListener('ended', onEnded);
    };
  }, []);

  // When videoUrl changes, reload the video element
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.load();
  }, [videoUrl]);

  // Auto-scroll selected marker card into view
  useEffect(() => {
    if (selectedCardRef.current) {
      selectedCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedMarkerId]);

  // ── Overlay fade
  const resetOverlayTimer = useCallback(() => {
    setShowPlayOverlay(true);
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    overlayTimerRef.current = setTimeout(() => setShowPlayOverlay(false), 1500);
  }, []);

  // ── Video controls

  const togglePlay = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      vid.play().catch(() => {});
    } else {
      vid.pause();
    }
    resetOverlayTimer();
  }, [resetOverlayTimer]);

  const seekTo = useCallback((time: number) => {
    const vid = videoRef.current;
    if (!vid) return;
    const clamped = Math.max(0, Math.min(time, vid.duration || videoDuration));
    vid.currentTime = clamped;
    setCurrentTime(clamped);
  }, [videoDuration]);

  // ── Video upload

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoUploading(true);
    try {
      const url = await uploadFile(file);
      setVideoUrl(url);
      getMediaLibrary().then(setVideoLibrary).catch(() => {});
      onToast('success', 'Video uploaded');
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setVideoUploading(false);
      if (videoFileRef.current) videoFileRef.current.value = '';
    }
  };

  const handleLibraryPick = (entry: MediaFile) => {
    setVideoUrl(entry.url);
    setShowLibrary(false);
  };

  // ── Markers

  const addMarker = useCallback(
    (at: number) => {
      const newMarker: UIMarker = {
        id: uid(),
        at: Math.max(0, Math.min(Math.round(at), videoDuration - 20)),
        duration: 20,
        gameType: 'trivia',
        config: defaultConfig('trivia'),
      };
      setMarkers((prev) => [...prev, newMarker]);
      setSelectedMarkerId(newMarker.id);
    },
    [videoDuration],
  );

  const updateMarker = useCallback((id: string, patch: Partial<UIMarker>) => {
    setMarkers((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const deleteMarker = useCallback((id: string) => {
    setMarkers((prev) => prev.filter((m) => m.id !== id));
    setSelectedMarkerId((cur) => (cur === id ? null : cur));
  }, []);

  // ── Game JSON import

  const handleImportGames = useCallback(
    (games: Array<{ gameType: string; config: Record<string, unknown>; timeLimitMs?: number }>) => {
      const placed = placeMarkersFromGames(games, videoDuration);
      setMarkers(placed);
      setSelectedMarkerId(null);
      onToast('success', `Imported ${placed.length} game${placed.length !== 1 ? 's' : ''} onto timeline`);
    },
    [videoDuration, onToast],
  );

  const handleGameJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as unknown[];
        if (!Array.isArray(parsed)) throw new Error('Expected a JSON array');
        // Detect exported config format: items have numeric `at` field
        const first = parsed[0] as Record<string, unknown> | undefined;
        if (first && typeof first['at'] === 'number') {
          // Full config format — restore markers at exact positions
          const placed = rawSequenceToUIMarkers(parsed);
          setMarkers(placed);
          setSelectedMarkerId(null);
          onToast('success', `Restored ${placed.length} marker${placed.length !== 1 ? 's' : ''} from config`);
        } else {
          // Game-only format — distribute evenly across video
          handleImportGames(
            parsed as Array<{ gameType: string; config: Record<string, unknown>; timeLimitMs?: number }>,
          );
        }
      } catch (err) {
        onToast('error', `Invalid JSON: ${err instanceof Error ? err.message : 'parse error'}`);
      }
    };
    reader.readAsText(file);
    if (gameJsonFileRef.current) gameJsonFileRef.current.value = '';
  };

  const handleDownloadTemplate = () => {
    const blob = new Blob([JSON.stringify(GAME_TEMPLATE, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'game-template.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleDownloadConfig = () => {
    if (markers.length === 0) {
      onToast('error', 'No markers to export');
      return;
    }
    const config = [...markers]
      .sort((a, b) => a.at - b.at)
      .map(({ id: _id, ...rest }) => rest);
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${title.trim().replace(/\s+/g, '-').toLowerCase() || 'show'}-config.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ── Timeline zoom derived
  const viewDuration = videoDuration / zoom;
  const clampedViewStart = Math.max(0, Math.min(viewStart, videoDuration - viewDuration));

  // ── Timeline drag logic

  const getTimeFromClientX = useCallback(
    (clientX: number): number => {
      if (!timelineRef.current) return 0;
      const rect = timelineRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return clampedViewStart + ratio * viewDuration;
    },
    [clampedViewStart, viewDuration],
  );

  const handleTimelineWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;
      const ratio = (e.clientX - rect.left) / rect.width;
      const cursorTime = clampedViewStart + ratio * viewDuration;
      const factor = e.deltaY < 0 ? 1.3 : 1 / 1.3;
      const newZoom = Math.max(1, Math.min(30, zoom * factor));
      const newViewDuration = videoDuration / newZoom;
      const newViewStart = Math.max(
        0,
        Math.min(cursorTime - ratio * newViewDuration, videoDuration - newViewDuration),
      );
      setZoom(newZoom);
      setViewStart(newViewStart);
    },
    [zoom, clampedViewStart, viewDuration, videoDuration],
  );

  const handleTimelineMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only handle direct clicks on the timeline container (not on markers)
      if (e.currentTarget !== e.target) return;
      e.preventDefault();
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      timelineDragRef.current = {
        type: 'scrub',
        startX: e.clientX,
        barWidth: rect.width,
        viewDuration,
      };
      const t = getTimeFromClientX(e.clientX);
      seekTo(t);

      const onMouseMove = (me: MouseEvent) => {
        const ds = timelineDragRef.current;
        if (!ds || ds.type !== 'scrub') return;
        seekTo(getTimeFromClientX(me.clientX));
      };
      const onMouseUp = () => {
        timelineDragRef.current = null;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [getTimeFromClientX, seekTo],
  );

  const handleMarkerMouseDown = useCallback(
    (e: React.MouseEvent, type: 'move' | 'resize', marker: UIMarker) => {
      e.preventDefault();
      e.stopPropagation();
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      timelineDragRef.current = {
        type,
        markerId: marker.id,
        startX: e.clientX,
        startAt: marker.at,
        startDuration: marker.duration,
        barWidth: rect.width,
        viewDuration,
      };
      setSelectedMarkerId(marker.id);

      const onMouseMove = (me: MouseEvent) => {
        const ds = timelineDragRef.current;
        if (!ds || !ds.markerId) return;
        const dx = me.clientX - ds.startX;
        const deltaSec = (dx / ds.barWidth) * ds.viewDuration;
        if (ds.type === 'move') {
          setMarkers((prev) => {
            const m = prev.find((mk) => mk.id === ds.markerId);
            if (!m) return prev;
            const newAt = Math.max(
              0,
              Math.min((ds.startAt ?? 0) + deltaSec, videoDuration - m.duration),
            );
            const rounded = Math.round(newAt);
            seekTo(rounded);
            return prev.map((mk) => (mk.id === ds.markerId ? { ...mk, at: rounded } : mk));
          });
        } else {
          setMarkers((prev) => {
            const m = prev.find((mk) => mk.id === ds.markerId);
            if (!m) return prev;
            const newDur = Math.max(
              5,
              Math.min((ds.startDuration ?? 20) + deltaSec, videoDuration - m.at),
            );
            return prev.map((mk) =>
              mk.id === ds.markerId ? { ...mk, duration: Math.round(newDur) } : mk,
            );
          });
        }
      };

      const onMouseUp = () => {
        timelineDragRef.current = null;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [videoDuration, viewDuration, seekTo],
  );

  // Timeline click-to-add (double-click on empty area to add marker)
  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.currentTarget !== e.target) return;
      // single click = seek; double-click = add marker
      if (e.detail === 2) {
        addMarker(getTimeFromClientX(e.clientX));
      }
    },
    [addMarker, getTimeFromClientX],
  );

  // ── Save

  const handleSave = async () => {
    if (submitting) return;
    setSubmitting(true);

    const gameSequence = [...markers]
      .sort((a, b) => a.at - b.at)
      .map(({ id: _id, ...rest }) => rest);

    try {
      if (isEditing) {
        await updateShow(editShow!.id, {
          title: title.trim(),
          scheduledAt: new Date(scheduledAt).toISOString(),
          lobbyDurationMs,
          videoUrl: videoUrl.trim() || null,
          gameSequence,
        });
        onToast('success', `"${title.trim()}" updated`);
      } else {
        const payload: CreateShowInput = {
          title: title.trim(),
          scheduledAt: new Date(scheduledAt).toISOString(),
          prizePool: 0,
          lobbyDurationMs,
          videoUrl: videoUrl.trim() || null,
          gameSequence,
        };
        await createShow(payload);
        onToast('success', `"${payload.title}" created`);
      }
      onSaved();
      onClose();
    } catch (err) {
      onToast('error', `Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Clip range drag handlers
  const handleClipMouseDown = useCallback((e: React.MouseEvent, clipId: string, type: 'move' | 'resize') => {
    e.stopPropagation();
    const clip = clipRanges.find((c) => c.id === clipId);
    if (!clip || !clipRangeRef.current) return;
    clipDragRef.current = { clipId, type, startX: e.clientX, startAt: clip.startAt, startEnd: clip.endAt };
    setSelectedClipId(clipId);

    const onMove = (ev: MouseEvent) => {
      const ds = clipDragRef.current;
      if (!ds || !clipRangeRef.current) return;
      const rect = clipRangeRef.current.getBoundingClientRect();
      const dx = ev.clientX - ds.startX;
      const dtSec = (dx / rect.width) * viewDuration;
      setClipRanges((prev) => prev.map((c) => {
        if (c.id !== ds.clipId) return c;
        if (ds.type === 'move') {
          const dur = ds.startEnd - ds.startAt;
          const newStart = Math.max(0, Math.min(videoDuration - dur, ds.startAt + dtSec));
          return { ...c, startAt: Math.round(newStart), endAt: Math.round(newStart + dur) };
        } else {
          const newEnd = Math.max(ds.startAt + 5, Math.min(videoDuration, ds.startEnd + dtSec));
          return { ...c, endAt: Math.round(newEnd) };
        }
      }));
    };
    const onUp = () => {
      clipDragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [clipRanges, viewDuration, videoDuration]);

  const addClipRange = useCallback(() => {
    const dur = 30;
    const startAt = Math.max(0, Math.min(videoDuration - dur, Math.round(currentTime)));
    const newClip: UIClipRange = { id: uid(), startAt, endAt: startAt + dur, saved: false };
    setClipRanges((prev) => [...prev, newClip]);
    setSelectedClipId(newClip.id);
  }, [currentTime, videoDuration]);

  const deleteClipRange = useCallback(async (id: string) => {
    const clip = clipRanges.find((c) => c.id === id);
    if (clip?.saved && editShow?.id) {
      await deleteShowClip(editShow.id, id).catch(() => {});
    }
    setClipRanges((prev) => prev.filter((c) => c.id !== id));
    setSelectedClipId((cur) => (cur === id ? null : cur));
  }, [clipRanges, editShow?.id]);

  const handleSaveClips = async () => {
    if (savingClips || !editShow) return;

    const unsaved = clipRanges.filter((c) => !c.saved);
    if (!unsaved.length) { onToast('error', 'No new clips to save'); return; }

    const sortedGames = [...markers].sort((a, b) => a.at - b.at);

    // Validate all clips have a matching game marker before saving any
    for (const clip of unsaved) {
      const match = sortedGames.find(
        (m) => m.at >= clip.startAt && m.at + m.duration <= clip.endAt + 5,
      );
      if (!match) {
        onToast('error', `Clip ${formatTime(clip.startAt)}–${formatTime(clip.endAt)} has no game inside it`);
        return;
      }
    }

    setSavingClips(true);
    let savedCount = 0;

    for (const clip of unsaved) {
      // Mark this specific clip as saving
      setClipRanges((prev) => prev.map((c) => c.id === clip.id ? { ...c, saving: true } : c));

      const match = sortedGames.find(
        (m) => m.at >= clip.startAt && m.at + m.duration <= clip.endAt + 5,
      )!;

      try {
        await createShowClips(editShow.id, [{
          startMs: Math.round(clip.startAt * 1000),
          endMs: Math.round(clip.endAt * 1000),
          roundIndex: sortedGames.indexOf(match),
          gameType: match.gameType,
          config: { ...match.config, timeLimitMs: Math.round(match.duration * 1000) },
          gameOffsetMs: Math.max(0, Math.round((match.at - clip.startAt) * 1000)),
        }]);
        savedCount++;
        // Mark as saved
        setClipRanges((prev) => prev.map((c) => c.id === clip.id ? { ...c, saved: true, saving: false } : c));
      } catch (err) {
        setClipRanges((prev) => prev.map((c) => c.id === clip.id ? { ...c, saving: false } : c));
        onToast('error', `Failed to save clip ${formatTime(clip.startAt)}–${formatTime(clip.endAt)}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    setSavingClips(false);
    if (savedCount > 0) {
      onToast('success', `${savedCount} clip${savedCount !== 1 ? 's' : ''} saved`);
    }
  };

  // ── Derived

  const sortedMarkers = [...markers].sort((a, b) => a.at - b.at);
  const playheadPct = viewDuration > 0
    ? ((currentTime - clampedViewStart) / viewDuration) * 100
    : 0;
  const playheadInView = currentTime >= clampedViewStart && currentTime <= clampedViewStart + viewDuration;

  // Time ruler ticks — based on visible window
  const rulerStep = viewDuration <= 30 ? 5 : viewDuration <= 120 ? 15 : viewDuration <= 600 ? 30 : 60;
  const rulerTicks: number[] = [];
  const tickStart = Math.ceil(clampedViewStart / rulerStep) * rulerStep;
  for (let t = tickStart; t <= clampedViewStart + viewDuration + 0.001; t += rulerStep) {
    rulerTicks.push(Math.round(t * 1000) / 1000);
  }

  // ── Render

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center">
      <div className="w-full max-w-5xl h-[96vh] bg-[#0D0D18] border border-[#2A2A4A] rounded-2xl flex flex-col overflow-hidden shadow-2xl">

        {/* ── Header ── */}
        <div className="shrink-0 flex items-center gap-3 px-6 py-3 border-b border-[#2A2A4A] bg-[#0D0D18]">
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-200 transition-colors"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
            </svg>
            Cancel
          </button>

          <div className="flex-1 flex items-center gap-3 min-w-0">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Show title…"
              required
              className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-[#13131F] border border-[#2A2A4A] text-sm font-semibold text-gray-100 placeholder-gray-600 focus:outline-none focus:border-[#7C3AED] transition-colors"
            />
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              required
              className="shrink-0 px-3 py-1.5 rounded-lg bg-[#13131F] border border-[#2A2A4A] text-sm text-gray-300 focus:outline-none focus:border-[#7C3AED] transition-colors [color-scheme:dark]"
            />
            <select
              value={lobbyDurationMs}
              onChange={(e) => setLobbyDurationMs(Number(e.target.value))}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-[#13131F] border border-[#2A2A4A] text-sm text-gray-300 focus:outline-none focus:border-[#7C3AED] transition-colors"
            >
              <option value={10000}>Lobby 10s</option>
              <option value={30000}>Lobby 30s</option>
              <option value={60000}>Lobby 1m</option>
              <option value={120000}>Lobby 2m</option>
              <option value={300000}>Lobby 5m</option>
              <option value={600000}>Lobby 10m</option>
            </select>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={submitting}
            className={[
              'shrink-0 px-5 py-1.5 rounded-lg text-sm font-semibold text-white transition-all',
              submitting
                ? 'bg-[#7C3AED]/50 cursor-not-allowed'
                : 'bg-[#7C3AED] hover:bg-violet-500 shadow-[0_0_14px_rgba(124,58,237,0.4)]',
            ].join(' ')}
          >
            {submitting ? (isEditing ? 'Saving…' : 'Creating…') : isEditing ? 'Save Changes' : 'Create Show'}
          </button>
        </div>

        {/* ── Body: two-column layout ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── Left column: portrait video preview + controls ── */}
          <div className="w-[220px] shrink-0 flex flex-col border-r border-[#2A2A4A] bg-[#08080F] overflow-hidden">

            {/* Portrait video (9:16) */}
            <div className="relative bg-black" style={{ paddingTop: '177.78%' }}>
              <video
                ref={videoRef}
                src={videoUrl || undefined}
                onClick={togglePlay}
                onMouseMove={resetOverlayTimer}
                muted={false}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
              />

              {/* No-video placeholder */}
              {!videoUrl && (
                <div style={{ position: 'absolute', inset: 0 }} className="flex flex-col items-center justify-center gap-2 bg-[#08080F]">
                  <svg className="h-8 w-8 text-gray-700" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M4 4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2H4zm2 3h12v9H6V7zm5 2v5l4-2.5L11 9z" />
                  </svg>
                  <span className="text-xs text-gray-600 text-center px-3">No video selected</span>
                </div>
              )}

              {/* Play/pause overlay */}
              {videoUrl && (
                <div
                  onClick={togglePlay}
                  style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: showPlayOverlay ? 1 : 0,
                    transition: 'opacity 0.3s ease',
                    pointerEvents: showPlayOverlay ? 'auto' : 'none',
                  }}
                >
                  <div className="w-12 h-12 rounded-full bg-black/50 border border-white/20 flex items-center justify-center backdrop-blur-sm">
                    {isPlaying ? (
                      <svg className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M5.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75A.75.75 0 007.25 3h-1.5zM12.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5 text-white ml-0.5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.841z" />
                      </svg>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Video controls — stacked in left column */}
            <div className="flex flex-col gap-2 px-3 py-2.5 bg-[#0A0A14] flex-1 overflow-y-auto">
              {/* Play row + time */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={togglePlay}
                  disabled={!videoUrl}
                  className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-gray-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30"
                >
                  {isPlaying ? (
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M5.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75A.75.75 0 007.25 3h-1.5zM12.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.841z" />
                    </svg>
                  )}
                </button>
                <span className="text-xs font-mono text-gray-400 tabular-nums">
                  {formatTime(currentTime)} / {formatTime(videoDuration)}
                </span>
              </div>

              {/* Scrubber */}
              <input
                type="range"
                min={0}
                max={videoDuration}
                step={0.1}
                value={currentTime}
                disabled={!videoUrl}
                onChange={(e) => {
                  const t = Number(e.target.value);
                  if (videoRef.current) videoRef.current.currentTime = t;
                  setCurrentTime(t);
                }}
                className="w-full h-1.5 accent-violet-500 cursor-pointer disabled:opacity-30"
              />

              {/* URL input */}
              <input
                type="text"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="Paste video URL…"
                className="w-full px-2.5 py-1.5 rounded-lg bg-[#13131F] border border-[#2A2A4A] text-xs text-gray-200 placeholder-gray-600 font-mono focus:outline-none focus:border-[#7C3AED] transition-colors"
              />

              {/* Upload button */}
              <input ref={videoFileRef} type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
              <button
                type="button"
                disabled={videoUploading}
                onClick={() => videoFileRef.current?.click()}
                className={[
                  'w-full px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all text-center',
                  videoUploading
                    ? 'bg-violet-500/10 border-violet-500/20 text-violet-400 cursor-not-allowed'
                    : 'bg-[#13131F] border-[#2A2A4A] text-gray-400 hover:border-[#7C3AED] hover:text-violet-300',
                ].join(' ')}
              >
                {videoUploading ? 'Uploading…' : 'Upload Video'}
              </button>

              {/* S3 Library */}
              <button
                type="button"
                onClick={() => {
                  setLibraryLoading(true);
                  getMediaLibrary()
                    .then(setVideoLibrary)
                    .catch(() => {})
                    .finally(() => setLibraryLoading(false));
                  setShowLibrary(true);
                }}
                className="w-full px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#2A2A4A] bg-[#13131F] text-gray-400 hover:border-[#7C3AED] hover:text-violet-300 transition-all flex items-center justify-between gap-1"
              >
                <span>Media Library</span>
                {videoLibrary.length > 0 && (
                  <span className="bg-violet-500/20 text-violet-400 rounded-full px-1.5 text-[9px] font-bold">
                    {videoLibrary.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* ── Right column: timeline + markers ── */}
          <div className="flex-1 flex flex-col overflow-hidden">

        {/* ── Timeline Section ── */}
        <div className="shrink-0 px-4 py-3 bg-[#08080F] border-b border-[#2A2A4A]">
          {/* Ruler */}
          <div className="relative h-5 select-none mb-1">
            {rulerTicks.map((t) => {
              const pct = ((t - clampedViewStart) / viewDuration) * 100;
              return (
                <span
                  key={t}
                  className="absolute text-[9px] text-gray-600 font-mono"
                  style={{
                    left: `${pct}%`,
                    transform: pct < 1 ? 'none' : 'translateX(-50%)',
                    top: 0,
                  }}
                >
                  {formatTime(t)}
                </span>
              );
            })}
            {/* Ruler tick lines */}
            {rulerTicks.map((t) => (
              <div
                key={`line_${t}`}
                className="absolute bottom-0 w-px bg-[#2A2A4A]"
                style={{ left: `${((t - clampedViewStart) / viewDuration) * 100}%`, height: 4 }}
              />
            ))}
          </div>

          {/* Timeline track */}
          <div
            ref={timelineRef}
            onMouseDown={handleTimelineMouseDown}
            onClick={handleTimelineClick}
            onWheel={handleTimelineWheel}
            className="relative rounded-lg bg-[#0A0A14] border border-[#1E1E35] overflow-visible cursor-crosshair select-none"
            style={{ height: 62 }}
          >
            {/* Grid lines */}
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="absolute inset-y-0 border-l border-[#1E1E35]"
                style={{ left: `${(i + 1) * 10}%` }}
              />
            ))}

            {/* Playhead */}
            {playheadInView && <div
              style={{
                position: 'absolute',
                left: `${playheadPct}%`,
                top: 0,
                bottom: 0,
                width: 2,
                background: '#EF4444',
                zIndex: 20,
                pointerEvents: 'none',
              }}
            >
              {/* Diamond at top */}
              <div
                style={{
                  position: 'absolute',
                  top: -4,
                  left: '50%',
                  transform: 'translateX(-50%) rotate(45deg)',
                  width: 8,
                  height: 8,
                  background: '#EF4444',
                }}
              />
            </div>}

            {/* Marker blocks */}
            {sortedMarkers.map((marker, idx) => {
              const markerOriginalIdx = markers.indexOf(marker);
              // Skip markers fully outside the visible window
              if (marker.at + marker.duration < clampedViewStart) return null;
              if (marker.at > clampedViewStart + viewDuration) return null;
              const leftPct = ((marker.at - clampedViewStart) / viewDuration) * 100;
              const widthPct = Math.max((marker.duration / viewDuration) * 100, 2);
              const color = MARKER_COLORS[markerOriginalIdx % MARKER_COLORS.length];
              const isSelected = selectedMarkerId === marker.id;

              return (
                <div
                  key={marker.id}
                  onMouseDown={(e) => handleMarkerMouseDown(e, 'move', marker)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedMarkerId(marker.id);
                    seekTo(marker.at);
                  }}
                  title={`${GAME_TYPE_LABELS[marker.gameType] ?? marker.gameType} — at ${formatTime(marker.at)} for ${marker.duration}s`}
                  style={{
                    position: 'absolute',
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    top: 11,
                    height: 40,
                    backgroundColor: color,
                    opacity: isSelected ? 1 : 0.72,
                    borderRadius: 5,
                    border: isSelected ? '2px solid rgba(255,255,255,0.9)' : '2px solid transparent',
                    cursor: 'grab',
                    display: 'flex',
                    alignItems: 'center',
                    overflow: 'hidden',
                    zIndex: isSelected ? 10 : idx + 1,
                    boxShadow: isSelected ? `0 0 0 1px ${color}` : 'none',
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'rgba(255,255,255,0.92)',
                      paddingLeft: 5,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      userSelect: 'none',
                    }}
                  >
                    #{markerOriginalIdx + 1} {GAME_TYPE_SHORT[marker.gameType] ?? '??'}
                  </span>
                  {/* Resize handle */}
                  <div
                    onMouseDown={(e) => handleMarkerMouseDown(e, 'resize', marker)}
                    style={{
                      width: 8,
                      alignSelf: 'stretch',
                      cursor: 'col-resize',
                      background: 'rgba(0,0,0,0.25)',
                      borderRadius: '0 3px 3px 0',
                      flexShrink: 0,
                    }}
                  />
                </div>
              );
            })}
          </div>
          <p className="mt-1.5 text-[10px] text-gray-700 select-none">
            Click to seek · Double-click empty area to add marker · Drag block to move · Drag right edge to resize
          </p>

          {/* Clip range row — completed shows only */}
          {isCompleted && (
            <div className="mt-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] font-semibold text-amber-500/70 uppercase tracking-wider">Clip Ranges</span>
                {selectedClipId && (
                  <button
                    type="button"
                    onClick={() => deleteClipRange(selectedClipId)}
                    className="text-[9px] text-red-400/70 hover:text-red-400 transition-colors"
                  >
                    ✕ Remove
                  </button>
                )}
              </div>
              <div
                ref={clipRangeRef}
                className="relative rounded-lg bg-[#0A0A14] border border-amber-500/20 overflow-visible select-none"
                style={{ height: 28 }}
                onClick={(e) => {
                  if (e.target === clipRangeRef.current) setSelectedClipId(null);
                }}
              >
                {/* Grid lines */}
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="absolute inset-y-0 border-l border-[#1E1E35]" style={{ left: `${(i + 1) * 10}%` }} />
                ))}
                {clipRanges.map((clip) => {
                  if (clip.endAt < clampedViewStart || clip.startAt > clampedViewStart + viewDuration) return null;
                  const leftPct = ((clip.startAt - clampedViewStart) / viewDuration) * 100;
                  const widthPct = Math.max(((clip.endAt - clip.startAt) / viewDuration) * 100, 1);
                  const isSelected = selectedClipId === clip.id;
                  return (
                    <div
                      key={clip.id}
                      onMouseDown={(e) => !clip.saved && handleClipMouseDown(e, clip.id, 'move')}
                      title={`Clip ${formatTime(clip.startAt)} – ${formatTime(clip.endAt)}${clip.saved ? ' (saved)' : ''}`}
                      style={{
                        position: 'absolute',
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        top: 3,
                        height: 22,
                        backgroundColor: clip.saved
                          ? 'rgba(16,185,129,0.15)'
                          : isSelected ? 'rgba(245,158,11,0.35)' : 'rgba(245,158,11,0.18)',
                        border: clip.saved
                          ? '1.5px solid rgba(16,185,129,0.5)'
                          : isSelected ? '1.5px solid rgba(245,158,11,0.9)' : '1.5px solid rgba(245,158,11,0.4)',
                        borderRadius: 4,
                        cursor: clip.saved ? 'default' : 'grab',
                        display: 'flex',
                        alignItems: 'center',
                        overflow: 'hidden',
                        zIndex: isSelected ? 5 : 2,
                        opacity: clip.saving ? 0.6 : 1,
                      }}
                    >
                      <span style={{ flex: 1, fontSize: 9, fontWeight: 700, color: clip.saved ? 'rgba(16,185,129,0.9)' : 'rgba(245,158,11,0.9)', paddingLeft: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', userSelect: 'none' }}>
                        {clip.saving ? '⏳ ' : clip.saved ? '✓ ' : ''}{formatTime(clip.startAt)}–{formatTime(clip.endAt)}
                      </span>
                      {/* Resize handle — only for unsaved clips */}
                      {!clip.saved && (
                        <div
                          onMouseDown={(e) => handleClipMouseDown(e, clip.id, 'resize')}
                          style={{ width: 6, alignSelf: 'stretch', cursor: 'col-resize', background: 'rgba(245,158,11,0.3)', borderRadius: '0 3px 3px 0', flexShrink: 0 }}
                        />
                      )}
                    </div>
                  );
                })}
                {clipRanges.length === 0 && (
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] text-amber-500/30 pointer-events-none">
                    Press "Add Clip Range" to mark segments for PlayClips
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Timeline Toolbar ── */}
        <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-[#0A0A14] border-b border-[#1A1A30]">
          <input
            ref={gameJsonFileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleGameJsonUpload}
          />
          <button
            type="button"
            onClick={() => gameJsonFileRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#13131F] text-gray-300 border border-[#2A2A4A] hover:border-[#7C3AED] hover:text-violet-300 transition-all"
          >
            <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v8.69l2.22-2.22a.75.75 0 111.06 1.06l-3.5 3.5a.75.75 0 01-1.06 0l-3.5-3.5a.75.75 0 111.06-1.06l2.22 2.22V3.75A.75.75 0 0110 3zm-9 13a.75.75 0 01.75-.75h16.5a.75.75 0 010 1.5H1.75A.75.75 0 011 16z" clipRule="evenodd" style={{ transform: 'rotate(180deg)', transformOrigin: 'center' }} />
            </svg>
            Upload Game JSON
          </button>
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#13131F] text-gray-400 border border-[#2A2A4A] hover:border-[#7C3AED] hover:text-violet-300 transition-all"
          >
            <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v8.69l2.22-2.22a.75.75 0 111.06 1.06l-3.5 3.5a.75.75 0 01-1.06 0l-3.5-3.5a.75.75 0 111.06-1.06l2.22 2.22V3.75A.75.75 0 0110 3zm-9 13a.75.75 0 01.75-.75h16.5a.75.75 0 010 1.5H1.75A.75.75 0 011 16z" clipRule="evenodd" />
            </svg>
            Download Template
          </button>
          <button
            type="button"
            onClick={handleDownloadConfig}
            disabled={markers.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#13131F] text-green-400 border border-green-500/30 hover:bg-green-500/10 hover:border-green-400/50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v8.69l2.22-2.22a.75.75 0 111.06 1.06l-3.5 3.5a.75.75 0 01-1.06 0l-3.5-3.5a.75.75 0 111.06-1.06l2.22 2.22V3.75A.75.75 0 0110 3zm-9 13a.75.75 0 01.75-.75h16.5a.75.75 0 010 1.5H1.75A.75.75 0 011 16z" clipRule="evenodd" />
            </svg>
            Export Config
          </button>
          <button
            type="button"
            onClick={() => addMarker(currentTime > 0 ? currentTime : videoDuration * 0.5)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#7C3AED]/15 text-violet-300 border border-[#7C3AED]/30 hover:bg-[#7C3AED]/25 transition-all"
          >
            <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            Add Marker
          </button>

          {/* Clip range controls — completed shows only */}
          {isCompleted && (
            <>
              <div className="w-px h-4 bg-[#2A2A4A] mx-1" />
              <button
                type="button"
                onClick={addClipRange}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-all"
              >
                <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                </svg>
                Add Clip Range
              </button>
              <button
                type="button"
                onClick={handleSaveClips}
                disabled={savingClips || clipRanges.filter((c) => !c.saved).length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-400/40 hover:bg-amber-500/25 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {savingClips ? 'Saving…' : (() => { const n = clipRanges.filter((c) => !c.saved).length; return `Save ${n} Clip${n !== 1 ? 's' : ''}`; })()}
              </button>
            </>
          )}

          <div className="flex-1" />
          {/* Zoom controls */}
          <div className="flex items-center gap-1 ml-2">
            <button
              type="button"
              onClick={() => {
                const newZoom = Math.max(1, zoom / 1.5);
                const newVd = videoDuration / newZoom;
                const center = clampedViewStart + viewDuration / 2;
                setZoom(newZoom);
                setViewStart(Math.max(0, Math.min(center - newVd / 2, videoDuration - newVd)));
              }}
              disabled={zoom <= 1}
              className="w-6 h-6 flex items-center justify-center rounded bg-[#13131F] border border-[#2A2A4A] text-gray-400 hover:border-[#7C3AED] hover:text-violet-300 disabled:opacity-30 transition-all text-sm font-bold"
            >
              −
            </button>
            <span className="text-[10px] text-gray-600 font-mono w-8 text-center tabular-nums">
              {zoom <= 1.05 ? '1×' : `${zoom.toFixed(1)}×`}
            </span>
            <button
              type="button"
              onClick={() => {
                const newZoom = Math.min(30, zoom * 1.5);
                const newVd = videoDuration / newZoom;
                const center = clampedViewStart + viewDuration / 2;
                setZoom(newZoom);
                setViewStart(Math.max(0, Math.min(center - newVd / 2, videoDuration - newVd)));
              }}
              disabled={zoom >= 30}
              className="w-6 h-6 flex items-center justify-center rounded bg-[#13131F] border border-[#2A2A4A] text-gray-400 hover:border-[#7C3AED] hover:text-violet-300 disabled:opacity-30 transition-all text-sm font-bold"
            >
              +
            </button>
          </div>
          <span className="text-xs text-gray-600 font-mono ml-3">
            {markers.length} marker{markers.length !== 1 ? 's' : ''}
            {videoDuration !== DEFAULT_VIDEO_DURATION && ` · ${formatSeconds(videoDuration)}`}
          </span>
        </div>

        {/* ── Markers Config (scrollable) ── */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {sortedMarkers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-700">
              <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
              </svg>
              <p className="text-sm">No game markers yet</p>
              <p className="text-xs text-gray-800">
                Double-click the timeline or use "Add Marker" to place a game event
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {sortedMarkers.map((marker, idx) => {
                const isSelected = selectedMarkerId === marker.id;
                return (
                  <MarkerCard
                    key={marker.id}
                    marker={marker}
                    index={idx}
                    isSelected={isSelected}
                    videoDuration={videoDuration}
                    cardRef={isSelected ? selectedCardRef : undefined}
                    onSelect={() => {
                      setSelectedMarkerId(marker.id);
                      seekTo(marker.at);
                    }}
                    onUpdate={(patch) => updateMarker(marker.id, patch)}
                    onDelete={() => deleteMarker(marker.id)}
                  />
                );
              })}
            </div>
          )}
        </div>

          </div>{/* end right column */}
        </div>{/* end two-column body */}

      </div>

      {/* Media Library full-screen modal */}
      {showLibrary && (
        <MediaLibraryModal
          files={videoLibrary}
          loading={libraryLoading}
          onClose={() => setShowLibrary(false)}
          onPick={(entry) => {
            handleLibraryPick(entry);
            setShowLibrary(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ShowsPage() {
  const [shows, setShows] = useState<Show[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: number; variant: ToastVariant; text: string }[]>([]);
  const toastCounter = useRef(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [editingShow, setEditingShow] = useState<{
    id: string;
    title: string;
    status: string;
    scheduledAt: string;
    lobbyDurationMs?: number;
    videoUrl: string | null;
    gameSequence: unknown[];
  } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const pushToast = useCallback((variant: ToastVariant, text: string) => {
    const id = ++toastCounter.current;
    setToasts((prev) => [...prev, { id, variant, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const fetchShows = useCallback(async (silent = false) => {
    try {
      const data = await getShows();
      setShows(data);
      if (!silent) setLoadError(null);
    } catch (err) {
      if (!silent) setLoadError(err instanceof Error ? err.message : 'Failed to load shows');
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

  const handleCopyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* ignore */
    }
  };

  const handleEdit = async (show: Show) => {
    try {
      const detail = await getShowDetail(show.id);
      setEditingShow({
        id: detail.id,
        title: detail.title,
        status: detail.status,
        scheduledAt: detail.scheduledAt,
        lobbyDurationMs: detail.lobbyDurationMs,
        videoUrl: detail.videoUrl,
        gameSequence: detail.gameSequence,
      });
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to load show');
    }
  };

  const handleDelete = async (show: Show) => {
    if (confirmDeleteId !== show.id) {
      setConfirmDeleteId(show.id);
      return;
    }
    setConfirmDeleteId(null);
    try {
      await deleteShow(show.id);
      pushToast('success', `"${show.title}" deleted`);
      await fetchShows(true);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const canDelete = (s: Show) => s.status !== 'live';

  return (
    <>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-100">Live Shows</h2>
            <p className="mt-1 text-sm text-gray-500">
              LiveOps management — auto-refreshes every {POLL_INTERVAL_MS / 1000}s
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-[#7C3AED] hover:bg-violet-500 text-white text-sm font-semibold rounded-lg shadow-[0_0_14px_rgba(124,58,237,0.35)] transition-all"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            Create Show
          </button>
        </div>

        {/* Load error */}
        {loadError && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            <span>
              <span className="font-semibold">API unreachable</span> — {loadError}
            </span>
            <button
              onClick={() => fetchShows(false)}
              className="ml-auto text-xs underline hover:text-red-300"
            >
              Retry
            </button>
          </div>
        )}

        {/* Table */}
        <div className="bg-[#1A1A2E] border border-[#2A2A4A] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2A2A4A]">
                {['Title', 'Status', 'Scheduled At', 'Players', 'Prize Pool', 'Actions'].map(
                  (col, i) => (
                    <th
                      key={col}
                      className={[
                        'px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider',
                        i >= 2 ? 'text-right' : 'text-left',
                      ].join(' ')}
                    >
                      {col}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2A2A4A]">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
              ) : shows.length === 0 && !loadError ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center text-gray-600 text-sm">
                    No shows yet. Create one to get started.
                  </td>
                </tr>
              ) : (
                shows.map((show) => (
                  <tr key={show.id} className="hover:bg-white/[0.03] transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-medium text-gray-100">{show.title}</div>
                      <button
                        onClick={() => handleCopyId(show.id)}
                        title="Click to copy ID"
                        className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-mono text-gray-600 hover:text-gray-400 transition-colors"
                      >
                        {copiedId === show.id ? (
                          <span className="text-green-400">Copied!</span>
                        ) : (
                          show.id
                        )}
                      </button>
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={show.status} />
                    </td>
                    <td className="px-5 py-4 text-right text-gray-400 text-xs whitespace-nowrap">
                      {formatScheduledAt(show.scheduledAt)}
                    </td>
                    <td className="px-5 py-4 text-right text-gray-400">
                      {show.playerCount.toLocaleString()}
                    </td>
                    <td className="px-5 py-4 text-right text-gray-400">
                      {show.prizePool.toLocaleString()}
                      <span className="text-gray-600 ml-0.5 text-xs">c</span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex items-center gap-2 justify-end">
                        <button
                          onClick={() => handleEdit(show)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all text-violet-400 border border-violet-500/30 hover:bg-violet-500/10 hover:border-violet-400/50"
                        >
                          <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                          </svg>
                          Edit
                        </button>
                        {canDelete(show) && (
                          <button
                            onClick={() => handleDelete(show)}
                            title={
                              confirmDeleteId === show.id ? 'Click again to confirm' : 'Delete show'
                            }
                            className={[
                              'inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                              confirmDeleteId === show.id
                                ? 'bg-red-600 border-red-500 text-white hover:bg-red-500'
                                : 'text-gray-500 hover:text-red-400 border-transparent hover:border-red-500/30 hover:bg-red-500/10',
                            ].join(' ')}
                          >
                            {confirmDeleteId === show.id ? (
                              'Confirm?'
                            ) : (
                              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path
                                  fillRule="evenodd"
                                  d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <ShowEditorModal
          onClose={() => setShowModal(false)}
          onSaved={() => fetchShows(true)}
          onToast={pushToast}
        />
      )}

      {editingShow && (
        <ShowEditorModal
          onClose={() => setEditingShow(null)}
          onSaved={() => fetchShows(true)}
          onToast={pushToast}
          editShow={editingShow}
        />
      )}

      <ToastStack messages={toasts} onDismiss={dismissToast} />
    </>
  );
}
