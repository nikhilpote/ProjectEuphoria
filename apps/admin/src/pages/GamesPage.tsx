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

interface GameLevel {
  id: string;
  gamePackageId: string;
  name: string;
  config: {
    imageA?: string;
    imageB?: string;
    differences?: string; // JSON string: [{x,y,radius}[]]
    findCount?: number;
    imageAspectRatio?: number;
  };
  createdAt: string;
  updatedAt: string;
}

interface DiffMarker {
  x: number;
  y: number;
  radius: number;
}

interface DrawRect {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
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

function getDrawRect(cw: number, ch: number, iw: number, ih: number): DrawRect {
  const ir = iw / ih;
  const cr = cw / ch;
  if (ir > cr) {
    const dh = cw / ir;
    return { dx: 0, dy: (ch - dh) / 2, dw: cw, dh };
  }
  const dw = ch * ir;
  return { dx: (cw - dw) / 2, dy: 0, dw, dh: ch };
}

function parseDifferences(raw: string | undefined): DiffMarker[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as DiffMarker[];
  } catch {
    return [];
  }
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

// ─── ImageUploadZone ──────────────────────────────────────────────────────────

interface ImageUploadZoneProps {
  uploaded: string;
  uploading: boolean;
  error: string;
  onFile: (file: File) => void;
  onClear: () => void;
}

function ImageUploadZone({ uploaded, uploading, error, onFile, onClear }: ImageUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    onFile(file);
  };

  if (uploading) {
    return (
      <div className="flex items-center justify-center gap-2 h-20 rounded-lg border border-euphoria-border bg-gray-900/40">
        <Spinner />
        <span className="text-xs text-gray-400">Uploading…</span>
      </div>
    );
  }

  if (uploaded) {
    return (
      <div className="flex items-center gap-2.5 p-2.5 rounded-lg border border-euphoria-border bg-gray-900/60">
        <img
          src={uploaded}
          alt=""
          className="h-12 w-12 rounded-md object-cover border border-gray-700 shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-300 font-medium truncate">Image uploaded</p>
          <p className="text-[10px] text-gray-600 truncate">{uploaded.split('/').pop()}</p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="text-gray-500 hover:text-red-400 transition-colors shrink-0 text-base leading-none px-1"
          title="Remove image"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        className={[
          'flex flex-col items-center justify-center gap-1.5 h-20 rounded-lg border-2 border-dashed',
          'cursor-pointer transition-all select-none',
          dragOver
            ? 'border-euphoria-purple bg-euphoria-purple/5'
            : 'border-euphoria-border hover:border-euphoria-purple/40 hover:bg-white/[0.02]',
        ].join(' ')}
      >
        <svg className="h-5 w-5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 18h16.5M3 9.75h.008v.008H3V9.75z" />
        </svg>
        <p className="text-xs text-gray-500">Click or drag to upload</p>
        <p className="text-[10px] text-gray-700">JPG · PNG · WEBP</p>
      </div>
      {error && <p className="text-red-400 text-[10px] mt-1">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}

// ─── SpotDifferenceLevelsPanel ────────────────────────────────────────────────

interface LevelEditorState {
  levelId: string | null; // null = creating new
  name: string;
  imageAUrl: string;      // CDN URL after upload
  imageBUrl: string;      // CDN URL after upload
  imageBLoaded: string;   // set after img.onload — triggers canvas
  uploadingA: boolean;
  uploadingB: boolean;
  uploadErrorA: string;
  uploadErrorB: string;
  markers: DiffMarker[];
  radiusSlider: number;
  findCount: number;
  imageAspectRatio: number | null; // imageB naturalWidth / naturalHeight — for server-side hit correction
}

function makeEmptyEditor(): LevelEditorState {
  return {
    levelId: null,
    name: '',
    imageAUrl: '',
    imageBUrl: '',
    imageBLoaded: '',
    uploadingA: false,
    uploadingB: false,
    uploadErrorA: '',
    uploadErrorB: '',
    markers: [],
    radiusSlider: 7,
    findCount: 1,
    imageAspectRatio: null,
  };
}

interface SpotDifferenceLevelsPanelProps {
  packageId: string;
}

function SpotDifferenceLevelsPanel({ packageId: _packageId }: SpotDifferenceLevelsPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [levels, setLevels] = useState<GameLevel[]>([]);
  const [loadingLevels, setLoadingLevels] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  const [editor, setEditor] = useState<LevelEditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);     // Image B — clickable
  const canvasARef = useRef<HTMLCanvasElement>(null);    // Image A — reference only
  const containerRef = useRef<HTMLDivElement>(null);
  const containerARef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const imgARef = useRef<HTMLImageElement | null>(null);
  const drawRectRef = useRef<DrawRect | null>(null);
  const editorRef = useRef<LevelEditorState | null>(null);

  // Keep editorRef in sync so the canvas click closure is always fresh
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // ── Fetch levels ─────────────────────────────────────────────────────────

  const fetchLevels = useCallback(async () => {
    setLoadingLevels(true);
    setListError(null);
    try {
      const res = await fetch(`${BASE_URL}/admin/games/spot_difference/levels`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json() as { success: boolean; data: GameLevel[] };
      setLevels(Array.isArray(body.data) ? body.data : []);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to load levels');
    } finally {
      setLoadingLevels(false);
      setHasFetched(true);
    }
  }, []);

  useEffect(() => {
    if (expanded && !hasFetched && !loadingLevels) {
      fetchLevels();
    }
  }, [expanded, hasFetched, loadingLevels, fetchLevels]);

  // ── Canvas drawing ────────────────────────────────────────────────────────

  const redraw = useCallback(() => {
    // ── Image B (clickable — markers drawn here) ──────────────────────────
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#0D0D1A';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const img = imgRef.current;
        if (img && img.complete && img.naturalWidth > 0) {
          const dr = getDrawRect(canvas.width, canvas.height, img.naturalWidth, img.naturalHeight);
          drawRectRef.current = dr;
          ctx.drawImage(img, dr.dx, dr.dy, dr.dw, dr.dh);

          const currentMarkers = editorRef.current?.markers ?? [];
          currentMarkers.forEach((m, i) => {
            const cx = dr.dx + m.x * dr.dw;
            const cy = dr.dy + m.y * dr.dh;
            const r = m.radius * dr.dw;

            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(124,58,237,0.25)';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(124,58,237,0.9)';
            ctx.lineWidth = 2;
            ctx.stroke();

            const labelSize = Math.max(11, Math.min(16, r * 0.65));
            ctx.font = `bold ${labelSize}px system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillText(String(i + 1), cx + 1, cy + 1);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(String(i + 1), cx, cy);
          });
        }
      }
    }

    // ── Image A (reference — no markers) ─────────────────────────────────
    const canvasA = canvasARef.current;
    if (canvasA) {
      const ctxA = canvasA.getContext('2d');
      if (ctxA) {
        ctxA.clearRect(0, 0, canvasA.width, canvasA.height);
        ctxA.fillStyle = '#0D0D1A';
        ctxA.fillRect(0, 0, canvasA.width, canvasA.height);

        const imgA = imgARef.current;
        if (imgA && imgA.complete && imgA.naturalWidth > 0) {
          const dr = getDrawRect(canvasA.width, canvasA.height, imgA.naturalWidth, imgA.naturalHeight);
          ctxA.drawImage(imgA, dr.dx, dr.dy, dr.dw, dr.dh);
        }
      }
    }
  }, []);

  // Redraw whenever markers or either image changes
  useEffect(() => {
    redraw();
  }, [editor?.markers, editor?.imageBLoaded, editor?.imageAUrl, redraw]);

  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (canvas && container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }
    const canvasA = canvasARef.current;
    const containerA = containerARef.current;
    if (canvasA && containerA) {
      canvasA.width = containerA.clientWidth;
      canvasA.height = containerA.clientHeight;
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !editor) return;
    const observer = new ResizeObserver(() => {
      syncCanvasSize();
      redraw();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [editor, syncCanvasSize, redraw]);

  // Canvas click handler
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !editor) return;

    const handleClick = (e: MouseEvent) => {
      const dr = drawRectRef.current;
      if (!imgRef.current || !dr) return;

      const rect = canvas.getBoundingClientRect();
      const tapX = e.clientX - rect.left;
      const tapY = e.clientY - rect.top;
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const cx = tapX * scaleX;
      const cy = tapY * scaleY;
      const normX = (cx - dr.dx) / dr.dw;
      const normY = (cy - dr.dy) / dr.dh;

      if (normX < 0 || normX > 1 || normY < 0 || normY > 1) return;

      const currentEditor = editorRef.current;
      if (!currentEditor) return;

      const newMarker: DiffMarker = {
        x: Math.round(normX * 100) / 100,
        y: Math.round(normY * 100) / 100,
        radius: currentEditor.radiusSlider / 100,
      };

      setEditor((prev) => prev ? { ...prev, markers: [...prev.markers, newMarker] } : prev);
    };

    canvas.addEventListener('click', handleClick);
    return () => canvas.removeEventListener('click', handleClick);
  }, [editor?.imageBLoaded]); // re-bind when image changes

  // ── Image upload ──────────────────────────────────────────────────────────

  const uploadImage = async (file: File, which: 'A' | 'B') => {
    if (which === 'A') {
      setEditor((prev) => prev ? { ...prev, uploadingA: true, uploadErrorA: '' } : prev);
    } else {
      imgRef.current = null;
      drawRectRef.current = null;
      setEditor((prev) => prev ? { ...prev, uploadingB: true, uploadErrorB: '', imageBLoaded: '', markers: [] } : prev);
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${BASE_URL}/admin/upload`, { method: 'POST', body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      const body = await res.json() as { success: boolean; data: { url: string } };
      const url = body.data?.url;

      if (which === 'A') {
        const imgA = new Image();
        imgA.onload = () => {
          imgARef.current = imgA;
          setEditor((prev) => prev ? { ...prev, imageAUrl: url, uploadingA: false } : prev);
          syncCanvasSize();
          setTimeout(() => redraw(), 0);
        };
        imgA.onerror = () => {
          setEditor((prev) => prev ? { ...prev, imageAUrl: url, uploadingA: false, uploadErrorA: 'Uploaded but image failed to load.' } : prev);
        };
        imgA.src = url;
      } else {
        // Load Image B into canvas after upload
        const img = new Image();
        img.onload = () => {
          imgRef.current = img;
          const ar = img.naturalWidth > 0 && img.naturalHeight > 0
            ? img.naturalWidth / img.naturalHeight
            : null;
          setEditor((prev) =>
            prev ? { ...prev, imageBUrl: url, imageBLoaded: url, uploadingB: false, imageAspectRatio: ar } : prev
          );
          syncCanvasSize();
          setTimeout(() => redraw(), 0);
        };
        img.onerror = () => {
          setEditor((prev) =>
            prev ? { ...prev, imageBUrl: url, uploadingB: false, uploadErrorB: 'Uploaded but image failed to load.' } : prev
          );
        };
        img.src = url;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      if (which === 'A') {
        setEditor((prev) => prev ? { ...prev, uploadingA: false, uploadErrorA: msg } : prev);
      } else {
        setEditor((prev) => prev ? { ...prev, uploadingB: false, uploadErrorB: msg } : prev);
      }
    }
  };

  // ── Open editor ───────────────────────────────────────────────────────────

  const openNewEditor = () => {
    imgRef.current = null;
    imgARef.current = null;
    drawRectRef.current = null;
    setSaveError(null);
    setEditor(makeEmptyEditor());
  };

  const openEditEditor = (level: GameLevel) => {
    imgRef.current = null;
    drawRectRef.current = null;
    setSaveError(null);

    const markers = parseDifferences(level.config.differences);
    const imageBUrl = level.config.imageB ?? '';

    setEditor({
      levelId: level.id,
      name: level.name,
      imageAUrl: level.config.imageA ?? '',
      imageBUrl,
      imageBLoaded: '',
      uploadingA: false,
      uploadingB: false,
      uploadErrorA: '',
      uploadErrorB: '',
      markers,
      radiusSlider: markers.length > 0 ? Math.round(markers[0].radius * 100) : 7,
      findCount: level.config.findCount ?? 1,
      imageAspectRatio: (level.config.imageAspectRatio as number | undefined) ?? null,
    });

    // Auto-load existing Image A into reference canvas
    const imageAUrl = level.config.imageA ?? '';
    if (imageAUrl) {
      const imgA = new Image();
      imgA.onload = () => {
        imgARef.current = imgA;
        syncCanvasSize();
        setTimeout(() => redraw(), 0);
      };
      imgA.src = imageAUrl;
    }

    // Auto-load existing Image B into clickable canvas
    if (imageBUrl) {
      const img = new Image();
      img.onload = () => {
        imgRef.current = img;
        const ar = img.naturalWidth > 0 && img.naturalHeight > 0
          ? img.naturalWidth / img.naturalHeight
          : null;
        setEditor((prev) => prev ? { ...prev, imageBLoaded: imageBUrl, imageAspectRatio: ar } : prev);
        syncCanvasSize();
        setTimeout(() => redraw(), 0);
      };
      img.src = imageBUrl;
    }
  };

  const closeEditor = () => {
    imgRef.current = null;
    imgARef.current = null;
    drawRectRef.current = null;
    setEditor(null);
    setSaveError(null);
  };

  // ── Save level ────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!editor) return;

    const trimmedName = editor.name.trim();
    if (!trimmedName) {
      setSaveError('Level name is required.');
      return;
    }
    if (!editor.imageBUrl) {
      setSaveError('Image B (the modified image) is required.');
      return;
    }
    if (editor.markers.length < 3) {
      setSaveError(`Place at least 3 differences (currently ${editor.markers.length}).`);
      return;
    }
    if (editor.markers.length > 10) {
      setSaveError('Maximum 10 differences per level.');
      return;
    }
    if (editor.findCount > editor.markers.length) {
      setSaveError(`Find count (${editor.findCount}) can't exceed differences placed (${editor.markers.length}).`);
      return;
    }

    setSaving(true);
    setSaveError(null);

    const differencesStr = JSON.stringify(
      editor.markers.map((m) => ({ x: m.x, y: m.y, radius: m.radius }))
    );

    const payload = {
      name: trimmedName,
      config: {
        imageA: editor.imageAUrl,
        imageB: editor.imageBUrl,
        differences: differencesStr,
        findCount: editor.findCount,
        ...(editor.imageAspectRatio !== null ? { imageAspectRatio: editor.imageAspectRatio } : {}),
      },
    };

    try {
      const url =
        editor.levelId
          ? `${BASE_URL}/admin/games/spot_difference/levels/${editor.levelId}`
          : `${BASE_URL}/admin/games/spot_difference/levels`;
      const method = editor.levelId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
      }

      closeEditor();
      await fetchLevels();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete level ──────────────────────────────────────────────────────────

  const handleDelete = async (level: GameLevel) => {
    const confirmed = window.confirm(
      `Delete level "${level.name}"?\n\nThis cannot be undone.`
    );
    if (!confirmed) return;

    try {
      const res = await fetch(
        `${BASE_URL}/admin/games/spot_difference/levels/${level.id}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      setLevels((prev) => prev.filter((l) => l.id !== level.id));
      if (editor?.levelId === level.id) closeEditor();
    } catch (err) {
      alert(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const diffCount = (level: GameLevel) => parseDifferences(level.config.differences).length;

  return (
    <div className="border-t border-euphoria-border mt-4 pt-4">
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-2 cursor-pointer select-none text-sm font-semibold text-gray-400 hover:text-gray-200 transition-colors w-full text-left"
      >
        <svg
          className={[
            'h-3.5 w-3.5 shrink-0 transition-transform duration-200',
            expanded ? 'rotate-90' : '',
          ].join(' ')}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
            clipRule="evenodd"
          />
        </svg>
        Levels
        {!loadingLevels && (
          <span className="ml-1 text-xs font-normal text-gray-600">({levels.length})</span>
        )}
        {loadingLevels && <Spinner />}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {/* Error banner */}
          {listError && (
            <p className="text-red-400 text-xs">
              Failed to load levels: {listError}{' '}
              <button
                onClick={fetchLevels}
                className="underline hover:text-red-300"
              >
                Retry
              </button>
            </p>
          )}

          {/* Level list */}
          {levels.length > 0 && (
            <div className="space-y-1">
              {levels.map((level) => {
                const count = diffCount(level);
                return (
                  <div
                    key={level.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-900/50 border border-euphoria-border"
                  >
                    <span className="text-sm font-semibold text-gray-200 flex-1 truncate">
                      {level.name}
                    </span>
                    <span className="text-xs text-gray-500 shrink-0">
                      {count} {count === 1 ? 'diff' : 'diffs'}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-euphoria-purple/10 border border-euphoria-purple/20 text-euphoria-purple shrink-0">
                      findCount:{level.config.findCount ?? 1}
                    </span>
                    <button
                      onClick={() => openEditEditor(level)}
                      className="text-xs text-gray-400 hover:text-gray-100 transition-colors shrink-0 px-2 py-1 rounded hover:bg-white/5"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(level)}
                      className="text-xs text-red-500/70 hover:text-red-400 transition-colors shrink-0 px-2 py-1 rounded hover:bg-red-500/5"
                    >
                      Delete
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {!loadingLevels && levels.length === 0 && !listError && (
            <p className="text-xs text-gray-600 italic">No levels yet. Add one below.</p>
          )}

          {/* Add Level button */}
          {!editor && (
            <button
              onClick={openNewEditor}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-euphoria-purple/40 text-euphoria-purple text-xs font-semibold hover:bg-euphoria-purple/10 transition-colors w-full"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
              </svg>
              Add Level
            </button>
          )}

          {/* ── Editor panel ── */}
          {editor && (
            <div className="mt-3 rounded-xl border border-euphoria-border bg-gray-900/40 p-4 space-y-4">
              {/* Level name */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Level name</label>
                <input
                  type="text"
                  value={editor.name}
                  onChange={(e) =>
                    setEditor((prev) => prev ? { ...prev, name: e.target.value } : prev)
                  }
                  placeholder="e.g. beach-scene"
                  className="bg-gray-900 border border-euphoria-border rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-euphoria-purple w-full placeholder-gray-600"
                />
              </div>

              {/* Image uploads */}
              <div className="grid grid-cols-2 gap-3">
                {/* Image A */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">
                    Image A — Original
                  </label>
                  <ImageUploadZone
                    uploaded={editor.imageAUrl}
                    uploading={editor.uploadingA}
                    error={editor.uploadErrorA}
                    onFile={(f) => uploadImage(f, 'A')}
                    onClear={() => {
                      imgARef.current = null;
                      setEditor((prev) => prev ? { ...prev, imageAUrl: '', uploadErrorA: '' } : prev);
                      setTimeout(() => redraw(), 0);
                    }}
                  />
                </div>
                {/* Image B */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">
                    Image B — Modified <span className="text-euphoria-purple">(click to mark)</span>
                  </label>
                  <ImageUploadZone
                    uploaded={editor.imageBUrl}
                    uploading={editor.uploadingB}
                    error={editor.uploadErrorB}
                    onFile={(f) => uploadImage(f, 'B')}
                    onClear={() => {
                      imgRef.current = null;
                      drawRectRef.current = null;
                      setEditor((prev) =>
                        prev
                          ? { ...prev, imageBUrl: '', imageBLoaded: '', uploadErrorB: '', markers: [] }
                          : prev
                      );
                    }}
                  />
                </div>
              </div>

              {/* Dual canvas — Image A (reference) + Image B (clickable) */}
              <div className="grid grid-cols-2 gap-2" style={{ height: 280 }}>
                {/* Image A — original, reference only */}
                <div className="flex flex-col gap-1 min-h-0">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Original</span>
                  <div
                    ref={containerARef}
                    className="flex-1 bg-[#1A1A2E] rounded-xl border border-euphoria-border overflow-hidden"
                  >
                    {!editor.imageAUrl ? (
                      <div className="h-full flex items-center justify-center">
                        <p className="text-[11px] text-gray-600">Upload Image A</p>
                      </div>
                    ) : (
                      <canvas
                        ref={canvasARef}
                        style={{ width: '100%', height: '100%', display: 'block' }}
                      />
                    )}
                  </div>
                </div>

                {/* Image B — modified, click to place markers */}
                <div className="flex flex-col gap-1 min-h-0">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-euphoria-purple">Modified — click to mark</span>
                  <div
                    ref={containerRef}
                    className="flex-1 bg-[#1A1A2E] rounded-xl border border-euphoria-border overflow-hidden cursor-crosshair"
                    style={{ borderColor: editor.imageBLoaded ? undefined : undefined }}
                  >
                    {!editor.imageBLoaded ? (
                      <div className="h-full flex items-center justify-center">
                        <p className="text-[11px] text-gray-600">Upload Image B to mark</p>
                      </div>
                    ) : (
                      <canvas
                        ref={canvasRef}
                        style={{ width: '100%', height: '100%', display: 'block' }}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Marker settings row */}
              <div className="flex items-center gap-6 flex-wrap">
                <div className="flex items-center gap-3 flex-1 min-w-[200px]">
                  <label className="text-xs text-gray-400 shrink-0">Marker radius</label>
                  <input
                    type="range"
                    min={2}
                    max={15}
                    step={1}
                    value={editor.radiusSlider}
                    onChange={(e) =>
                      setEditor((prev) =>
                        prev ? { ...prev, radiusSlider: Number(e.target.value) } : prev
                      )
                    }
                    className="flex-1 accent-euphoria-purple"
                  />
                  <span className="text-xs font-mono text-euphoria-purple w-8 text-right">
                    {editor.radiusSlider}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-400 shrink-0">Find count</label>
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, editor.markers.length)}
                    value={editor.findCount}
                    onChange={(e) =>
                      setEditor((prev) => {
                        if (!prev) return prev;
                        const val = Math.min(
                          Math.max(1, Number(e.target.value)),
                          prev.markers.length || 1,
                        );
                        return { ...prev, findCount: val };
                      })
                    }
                    className="bg-gray-900 border border-euphoria-border rounded-lg px-2 py-1 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-euphoria-purple w-14"
                  />
                  {editor.markers.length > 0 && (
                    <span className="text-[10px] text-gray-600">
                      of {editor.markers.length}
                    </span>
                  )}
                </div>
              </div>

              {/* Difference counter hint */}
              <div className="flex items-center gap-2">
                <span className={[
                  'text-xs font-medium',
                  editor.markers.length < 3 ? 'text-amber-500' :
                  editor.markers.length > 10 ? 'text-red-400' : 'text-emerald-400',
                ].join(' ')}>
                  {editor.markers.length} difference{editor.markers.length !== 1 ? 's' : ''} placed
                </span>
                <span className="text-[10px] text-gray-700">· need 3–10 to save</span>
              </div>

              {/* Marker list */}
              {editor.markers.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 font-semibold uppercase tracking-widest">
                    Markers placed: {editor.markers.length}
                  </p>
                  {editor.markers.map((m, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between bg-gray-900/60 rounded-lg px-2.5 py-1.5"
                    >
                      <span className="text-xs font-mono text-gray-400">
                        #{i + 1}&nbsp;&nbsp;x:{m.x}&nbsp;&nbsp;y:{m.y}&nbsp;&nbsp;r:{m.radius}
                      </span>
                      <button
                        onClick={() =>
                          setEditor((prev) =>
                            prev
                              ? { ...prev, markers: prev.markers.filter((_, idx) => idx !== i) }
                              : prev
                          )
                        }
                        className="text-gray-500 hover:text-red-400 transition-colors ml-2 text-base leading-none"
                        title="Remove marker"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Action row */}
              <div className="flex items-center gap-3 pt-1 flex-wrap">
                {editor.markers.length > 0 && (
                  <button
                    onClick={() =>
                      setEditor((prev) => prev ? { ...prev, markers: [] } : prev)
                    }
                    className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                  >
                    Clear All
                  </button>
                )}
                <div className="flex-1" />
                <button
                  onClick={closeEditor}
                  className="text-xs text-gray-400 hover:text-gray-200 transition-colors px-3 py-1.5"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className={[
                    'inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all',
                    'bg-euphoria-purple text-white hover:bg-violet-500',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-euphoria-purple',
                    saving ? 'opacity-60 cursor-not-allowed' : '',
                  ].join(' ')}
                >
                  {saving ? (
                    <>
                      <Spinner />
                      Saving…
                    </>
                  ) : (
                    'Save Level'
                  )}
                </button>
              </div>

              {saveError && (
                <p className="text-red-400 text-xs">{saveError}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── JsonLevelsPanel (knife_at_center etc.) ──────────────────────────────────

function JsonLevelsPanel({ packageId }: { packageId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [levels, setLevels] = useState<GameLevel[]>([]);
  const [loadingLevels, setLoadingLevels] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  const [editorLevelId, setEditorLevelId] = useState<string | null>(null); // null = new
  const [editorName, setEditorName] = useState('');
  const [editorJson, setEditorJson] = useState('');
  const [editorJsonErr, setEditorJsonErr] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchLevels = useCallback(async () => {
    setLoadingLevels(true);
    setListError(null);
    try {
      const res = await fetch(`${BASE_URL}/admin/games/${packageId}/levels`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json() as { success: boolean; data: GameLevel[] };
      setLevels(Array.isArray(body.data) ? body.data : []);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to load levels');
    } finally {
      setLoadingLevels(false);
      setHasFetched(true);
    }
  }, [packageId]);

  useEffect(() => {
    if (expanded && !hasFetched && !loadingLevels) fetchLevels();
  }, [expanded, hasFetched, loadingLevels, fetchLevels]);

  const openNew = () => {
    setEditorLevelId(null);
    setEditorName('');
    setEditorJson('');
    setEditorJsonErr('');
    setSaveError(null);
    setEditorOpen(true);
  };

  const openEdit = (level: GameLevel) => {
    setEditorLevelId(level.id);
    setEditorName(level.name);
    setEditorJson(JSON.stringify(level.config, null, 2));
    setEditorJsonErr('');
    setSaveError(null);
    setEditorOpen(true);
  };

  const closeEditor = () => setEditorOpen(false);

  const handleJsonChange = (text: string) => {
    setEditorJson(text);
    if (!text.trim()) { setEditorJsonErr(''); return; }
    try { JSON.parse(text); setEditorJsonErr(''); }
    catch (e) { setEditorJsonErr(e instanceof Error ? e.message : 'Invalid JSON'); }
  };

  const handleSave = async () => {
    const name = editorName.trim();
    if (!name) { setSaveError('Level name is required.'); return; }
    if (!editorJson.trim()) { setSaveError('Level JSON is required.'); return; }
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(editorJson);
      if (typeof config !== 'object' || config === null || Array.isArray(config)) throw new Error('Must be an object');
    } catch { setSaveError('Invalid JSON object.'); return; }

    setSaving(true);
    setSaveError(null);
    try {
      const url = editorLevelId
        ? `${BASE_URL}/admin/games/${packageId}/levels/${editorLevelId}`
        : `${BASE_URL}/admin/games/${packageId}/levels`;
      const res = await fetch(url, {
        method: editorLevelId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, config }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      closeEditor();
      await fetchLevels();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (level: GameLevel) => {
    if (!window.confirm(`Delete level "${level.name}"?`)) return;
    try {
      const res = await fetch(`${BASE_URL}/admin/games/${packageId}/levels/${level.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLevels((prev) => prev.filter((l) => l.id !== level.id));
      if (editorLevelId === level.id) closeEditor();
    } catch (err) {
      alert(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  return (
    <div className="border-t border-euphoria-border mt-4 pt-4">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-2 cursor-pointer select-none text-sm font-semibold text-gray-400 hover:text-gray-200 transition-colors w-full text-left"
      >
        <svg className={['h-3.5 w-3.5 shrink-0 transition-transform duration-200', expanded ? 'rotate-90' : ''].join(' ')} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
        </svg>
        Levels
        {!loadingLevels && <span className="ml-1 text-xs font-normal text-gray-600">({levels.length})</span>}
        {loadingLevels && <Spinner />}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {listError && (
            <p className="text-red-400 text-xs">
              Failed to load levels: {listError}{' '}
              <button onClick={fetchLevels} className="underline hover:text-red-300">Retry</button>
            </p>
          )}

          {levels.length > 0 && (
            <div className="space-y-1">
              {levels.map((level) => {
                const cfg = level.config as Record<string, unknown>;
                const diff = (cfg.difficulty as string) ?? '';
                const diffColors: Record<string, string> = {
                  easy: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
                  medium: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
                  hard: 'text-red-400 bg-red-500/10 border-red-500/20',
                  boss: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
                };
                return (
                  <div key={level.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-900/50 border border-euphoria-border">
                    <span className="text-sm font-semibold text-gray-200 flex-1 truncate">{level.name}</span>
                    {diff && <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${diffColors[diff] ?? 'text-gray-400 bg-gray-800 border-gray-700'}`}>{diff}</span>}
                    <button onClick={() => openEdit(level)} className="text-xs text-gray-400 hover:text-gray-100 transition-colors shrink-0 px-2 py-1 rounded hover:bg-white/5">Edit</button>
                    <button onClick={() => handleDelete(level)} className="text-xs text-red-500/70 hover:text-red-400 transition-colors shrink-0 px-2 py-1 rounded hover:bg-red-500/5">Delete</button>
                  </div>
                );
              })}
            </div>
          )}

          {!loadingLevels && levels.length === 0 && !listError && (
            <p className="text-xs text-gray-600 italic">No levels yet.</p>
          )}

          {!editorOpen && (
            <button
              onClick={openNew}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-euphoria-purple/40 text-euphoria-purple text-xs font-semibold hover:bg-euphoria-purple/10 transition-colors w-full"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
              </svg>
              Add Level
            </button>
          )}

          {editorOpen && (
            <div className="rounded-xl border border-euphoria-border bg-gray-900/40 p-4 space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Level name</label>
                <input
                  type="text"
                  value={editorName}
                  onChange={(e) => setEditorName(e.target.value)}
                  placeholder="e.g. Level 1, Boss 3"
                  className="bg-gray-900 border border-euphoria-border rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-euphoria-purple w-full placeholder-gray-600"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Level config (JSON)</label>
                <textarea
                  value={editorJson}
                  onChange={(e) => handleJsonChange(e.target.value)}
                  rows={12}
                  placeholder={'{\n  "difficulty": "easy",\n  "wheelSprite": "spin",\n  "rotationType": "constant",\n  "rotationSpeed": 180,\n  "preplacedKnives": [],\n  "throwCount": 5\n}'}
                  className="w-full bg-gray-900 border border-euphoria-border rounded-lg px-3 py-2 text-xs font-mono text-gray-100 focus:outline-none focus:ring-1 focus:ring-euphoria-purple placeholder-gray-600 resize-y leading-relaxed"
                />
                {editorJsonErr && <p className="text-red-400 text-[10px] mt-1 font-mono">{editorJsonErr}</p>}
              </div>
              <div className="flex items-center gap-3 pt-1 justify-end">
                <button onClick={closeEditor} className="text-xs text-gray-400 hover:text-gray-200 transition-colors px-3 py-1.5">Cancel</button>
                <button
                  onClick={handleSave}
                  disabled={saving || !!editorJsonErr}
                  className={[
                    'inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all',
                    'bg-euphoria-purple text-white hover:bg-violet-500',
                    (saving || !!editorJsonErr) ? 'opacity-60 cursor-not-allowed' : '',
                  ].join(' ')}
                >
                  {saving ? <><Spinner /> Saving…</> : 'Save Level'}
                </button>
              </div>
              {saveError && <p className="text-red-400 text-xs">{saveError}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Packages that get the JSON levels panel ─────────────────────────────────
const JSON_LEVEL_PACKAGES = new Set(['knife_at_center']);

// ─── PackageCard ──────────────────────────────────────────────────────────────

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
          {(pkg.manifest as Record<string, unknown>)?.engine === 'construct3' && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium text-amber-400 bg-amber-400/10 border border-amber-400/20">
              C3
            </span>
          )}
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

        {/* Spot Difference levels panel */}
        {pkg.manifest?.id === 'spot_difference' && (
          <SpotDifferenceLevelsPanel packageId={pkg.id} />
        )}

        {/* JSON levels panel (knife_at_center etc.) */}
        {JSON_LEVEL_PACKAGES.has(pkg.manifest?.id) && (
          <JsonLevelsPanel packageId={pkg.id} />
        )}
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
