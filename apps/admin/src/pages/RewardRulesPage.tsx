import { useState, useEffect, useCallback } from 'react';
import {
  getRules,
  createRule,
  updateRule,
  deleteRule,
  previewReward,
} from '../api/economy';
import type { RewardRule, RewardContext, PreviewResult } from '../api/economy';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRIGGERS = [
  { value: 'playclip.correct', label: 'PlayClip Correct' },
  { value: 'show.won', label: 'Show Won' },
  { value: 'show.round_survived', label: 'Round Survived' },
  { value: 'streak.milestone', label: 'Streak Milestone' },
  { value: 'first_play', label: 'First Play' },
];

const FIELDS = [
  { value: 'game_type', label: 'game_type' },
  { value: 'score', label: 'score' },
  { value: 'streak_days', label: 'streak_days' },
  { value: 'is_first_play', label: 'is_first_play' },
  { value: 'show_player_count', label: 'show_player_count' },
  { value: 'round_index', label: 'round_index' },
];

const OPS = [
  { value: 'eq', label: '= (eq)' },
  { value: 'neq', label: '≠ (neq)' },
  { value: 'gte', label: '>= (gte)' },
  { value: 'lte', label: '<= (lte)' },
  { value: 'gt', label: '> (gt)' },
  { value: 'lt', label: '< (lt)' },
];

const TRIGGER_COLORS: Record<string, string> = {
  'playclip.correct': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'show.won': 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  'show.round_survived': 'bg-green-500/20 text-green-300 border-green-500/30',
  'streak.milestone': 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  'first_play': 'bg-pink-500/20 text-pink-300 border-pink-500/30',
};

const STACK_BORDER: Record<string, string> = {
  additive: 'border-l-purple-500',
  multiplier: 'border-l-amber-500',
  override: 'border-l-red-500',
};

const STACK_BADGE: Record<string, string> = {
  additive: 'bg-purple-500/15 text-purple-300 border-purple-500/25',
  multiplier: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  override: 'bg-red-500/15 text-red-300 border-red-500/25',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatReward(reward: RewardRule['reward']): string {
  if (reward.type === 'fixed') return `+${reward.amount ?? 0} coins`;
  if (reward.type === 'multiplier') return `×${reward.value ?? 1}`;
  if (reward.type === 'range') return `${reward.min ?? 0}–${reward.max ?? 0} coins`;
  return '—';
}

function formatConditions(conditions: RewardRule['conditions']): string {
  if (!conditions || conditions.length === 0) return '';
  return conditions
    .map((c) => `${c.field} ${c.op} ${c.value}`)
    .join(', ');
}

function isCurrentlyActive(rule: RewardRule): boolean {
  const now = Date.now();
  const from = rule.activeFrom ? new Date(rule.activeFrom).getTime() : null;
  const until = rule.activeUntil ? new Date(rule.activeUntil).getTime() : null;
  if (from && now < from) return false;
  if (until && now > until) return false;
  return true;
}

function hasTimeLimits(rule: RewardRule): boolean {
  return !!(rule.activeFrom || rule.activeUntil);
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 16); // "YYYY-MM-DDTHH:MM"
}

function fromDatetimeLocal(val: string): string | null {
  if (!val) return null;
  return new Date(val).toISOString();
}

// ---------------------------------------------------------------------------
// Blank form state
// ---------------------------------------------------------------------------

type ConditionRow = { field: string; op: string; value: string };

interface FormState {
  name: string;
  description: string;
  trigger: string;
  conditions: ConditionRow[];
  rewardType: 'fixed' | 'multiplier' | 'range';
  rewardAmount: string;
  rewardValue: string;
  rewardMin: string;
  rewardMax: string;
  stackMode: 'additive' | 'multiplier' | 'override';
  priority: string;
  activeFrom: string;
  activeUntil: string;
  enabled: boolean;
}

const BLANK_FORM: FormState = {
  name: '',
  description: '',
  trigger: 'playclip.correct',
  conditions: [],
  rewardType: 'fixed',
  rewardAmount: '10',
  rewardValue: '1.5',
  rewardMin: '0',
  rewardMax: '100',
  stackMode: 'additive',
  priority: '100',
  activeFrom: '',
  activeUntil: '',
  enabled: true,
};

function ruleToForm(rule: RewardRule): FormState {
  return {
    name: rule.name,
    description: rule.description,
    trigger: rule.trigger,
    conditions: rule.conditions.map((c) => ({
      field: c.field,
      op: c.op,
      value: String(c.value),
    })),
    rewardType: rule.reward.type,
    rewardAmount: String(rule.reward.amount ?? 10),
    rewardValue: String(rule.reward.value ?? 1.5),
    rewardMin: String(rule.reward.min ?? 0),
    rewardMax: String(rule.reward.max ?? 100),
    stackMode: rule.stackMode,
    priority: String(rule.priority),
    activeFrom: toDatetimeLocal(rule.activeFrom),
    activeUntil: toDatetimeLocal(rule.activeUntil),
    enabled: rule.enabled,
  };
}

function formToPayload(form: FormState): Omit<RewardRule, 'id' | 'createdAt' | 'updatedAt'> {
  const reward: RewardRule['reward'] =
    form.rewardType === 'fixed'
      ? { type: 'fixed', amount: Number(form.rewardAmount) }
      : form.rewardType === 'multiplier'
      ? { type: 'multiplier', value: Number(form.rewardValue) }
      : { type: 'range', min: Number(form.rewardMin), max: Number(form.rewardMax) };

  return {
    name: form.name.trim(),
    description: form.description.trim(),
    trigger: form.trigger,
    conditions: form.conditions.map((c) => ({
      field: c.field,
      op: c.op,
      value: c.value,
    })),
    reward,
    stackMode: form.stackMode,
    priority: Number(form.priority),
    activeFrom: fromDatetimeLocal(form.activeFrom),
    activeUntil: fromDatetimeLocal(form.activeUntil),
    enabled: form.enabled,
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        checked ? 'bg-euphoria-purple' : 'bg-white/10'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-4.5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${className ?? ''}`}
    >
      {children}
    </span>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-euphoria-card border border-euphoria-border rounded-xl p-4 animate-pulse border-l-4 border-l-white/10">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-white/10 rounded w-2/3" />
          <div className="h-3 bg-white/5 rounded w-1/2" />
          <div className="h-3 bg-white/5 rounded w-3/4" />
        </div>
        <div className="h-8 w-16 bg-white/5 rounded-lg" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rule card
// ---------------------------------------------------------------------------

function RuleCard({
  rule,
  onEdit,
  onToggle,
}: {
  rule: RewardRule;
  onEdit: (rule: RewardRule) => void;
  onToggle: (rule: RewardRule, enabled: boolean) => void;
}) {
  const active = isCurrentlyActive(rule);
  const timed = hasTimeLimits(rule);
  const condSummary = formatConditions(rule.conditions);
  const triggerColor = TRIGGER_COLORS[rule.trigger] ?? 'bg-gray-500/20 text-gray-300 border-gray-500/30';

  return (
    <div
      className={[
        'group relative bg-euphoria-card border border-euphoria-border rounded-xl p-4 border-l-4 transition-all duration-200',
        STACK_BORDER[rule.stackMode] ?? 'border-l-gray-500',
        !rule.enabled && 'opacity-50',
        timed && active && 'shadow-[0_0_12px_rgba(251,191,36,0.15)] border-yellow-500/30',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Time-limited indicator */}
      {timed && (
        <span
          title={`Active: ${rule.activeFrom ?? '∞'} → ${rule.activeUntil ?? '∞'}`}
          className={`absolute top-3 right-3 text-xs ${active ? 'text-yellow-400' : 'text-gray-600'}`}
        >
          {active ? '⏰' : '🕐'}
        </span>
      )}

      {/* Top row: name + toggle + edit */}
      <div className="flex items-start gap-2 pr-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white truncate">{rule.name}</span>
            <Badge className={triggerColor}>{rule.trigger}</Badge>
          </div>

          {/* Conditions */}
          <p className="mt-1 text-xs text-gray-500 italic truncate">
            {condSummary || 'No conditions'}
          </p>

          {/* Badges row */}
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            {/* Reward */}
            <span className="inline-flex items-center rounded-md bg-white/5 border border-white/10 px-2 py-0.5 text-xs font-mono text-green-300">
              {formatReward(rule.reward)}
            </span>
            {/* Stack mode */}
            <Badge className={STACK_BADGE[rule.stackMode] ?? ''}>
              {rule.stackMode}
            </Badge>
            {/* Priority */}
            <span className="text-xs text-gray-600 font-mono">p{rule.priority}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <Toggle
            checked={rule.enabled}
            onChange={(v) => onToggle(rule, v)}
          />
          <button
            onClick={() => onEdit(rule)}
            className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors text-xs"
            title="Edit rule"
          >
            ✎
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rule editor panel
// ---------------------------------------------------------------------------

function RuleEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: FormState;
  onSave: (form: FormState) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = useCallback(<K extends keyof FormState>(key: K, val: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: val }));
    setErrors((e) => { const n = { ...e }; delete n[key]; return n; });
  }, []);

  const addCondition = () => {
    set('conditions', [...form.conditions, { field: 'score', op: 'gte', value: '0' }]);
  };

  const removeCondition = (i: number) => {
    set('conditions', form.conditions.filter((_, idx) => idx !== i));
  };

  const updateCondition = (i: number, key: keyof ConditionRow, val: string) => {
    set(
      'conditions',
      form.conditions.map((c, idx) => (idx === i ? { ...c, [key]: val } : c)),
    );
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (form.rewardType === 'fixed' && !form.rewardAmount) errs.rewardAmount = 'Amount required';
    if (form.rewardType === 'multiplier' && !form.rewardValue) errs.rewardValue = 'Multiplier required';
    if (form.rewardType === 'range' && !form.rewardMin) errs.rewardMin = 'Min required';
    if (form.rewardType === 'range' && !form.rewardMax) errs.rewardMax = 'Max required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  const inputCls = (errKey?: string) =>
    `w-full bg-euphoria-dark border ${
      errKey && errors[errKey] ? 'border-red-500' : 'border-euphoria-border'
    } rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-euphoria-purple transition-colors`;

  const labelCls = 'text-sm text-gray-400 font-medium';

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* Name */}
        <div className="space-y-1.5">
          <label className={labelCls}>Name *</label>
          <input
            className={inputCls('name')}
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. Perfect Score Bonus"
          />
          {errors.name && <p className="text-xs text-red-400">{errors.name}</p>}
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className={labelCls}>Description</label>
          <input
            className={inputCls()}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Optional description"
          />
        </div>

        {/* Trigger */}
        <div className="space-y-1.5">
          <label className={labelCls}>Trigger</label>
          <select
            className={inputCls()}
            value={form.trigger}
            onChange={(e) => set('trigger', e.target.value)}
          >
            {TRIGGERS.map((t) => (
              <option key={t.value} value={t.value}>{t.label} ({t.value})</option>
            ))}
          </select>
        </div>

        {/* Conditions */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className={labelCls}>Conditions</label>
            <button
              type="button"
              onClick={addCondition}
              className="text-xs text-euphoria-purple hover:text-white transition-colors"
            >
              + Add Condition
            </button>
          </div>

          {form.conditions.length === 0 && (
            <p className="text-xs text-gray-600 italic">No conditions — rule matches all events for this trigger.</p>
          )}

          <div className="space-y-2">
            {form.conditions.map((cond, i) => (
              <div key={i} className="flex gap-2 items-center">
                <select
                  className="flex-1 bg-euphoria-dark border border-euphoria-border rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-euphoria-purple"
                  value={cond.field}
                  onChange={(e) => updateCondition(i, 'field', e.target.value)}
                >
                  {FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
                <select
                  className="w-24 bg-euphoria-dark border border-euphoria-border rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-euphoria-purple"
                  value={cond.op}
                  onChange={(e) => updateCondition(i, 'op', e.target.value)}
                >
                  {OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input
                  className="flex-1 bg-euphoria-dark border border-euphoria-border rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-euphoria-purple"
                  value={cond.value}
                  onChange={(e) => updateCondition(i, 'value', e.target.value)}
                  placeholder="value"
                />
                <button
                  type="button"
                  onClick={() => removeCondition(i)}
                  className="p-1.5 text-gray-600 hover:text-red-400 transition-colors rounded"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Reward */}
        <div className="space-y-2.5">
          <label className={labelCls}>Reward</label>

          {/* Type radio */}
          <div className="flex gap-3">
            {(['fixed', 'multiplier', 'range'] as const).map((t) => (
              <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="rewardType"
                  value={t}
                  checked={form.rewardType === t}
                  onChange={() => set('rewardType', t)}
                  className="accent-purple-500"
                />
                <span className="text-sm text-gray-300 capitalize">{t}</span>
              </label>
            ))}
          </div>

          {form.rewardType === 'fixed' && (
            <div className="space-y-1">
              <label className={labelCls}>Amount (coins)</label>
              <input
                type="number"
                className={inputCls('rewardAmount')}
                value={form.rewardAmount}
                onChange={(e) => set('rewardAmount', e.target.value)}
                min={0}
              />
              {errors.rewardAmount && <p className="text-xs text-red-400">{errors.rewardAmount}</p>}
            </div>
          )}

          {form.rewardType === 'multiplier' && (
            <div className="space-y-1">
              <label className={labelCls}>Multiplier (e.g. 1.5)</label>
              <input
                type="number"
                step="0.1"
                className={inputCls('rewardValue')}
                value={form.rewardValue}
                onChange={(e) => set('rewardValue', e.target.value)}
                min={0}
              />
              {errors.rewardValue && <p className="text-xs text-red-400">{errors.rewardValue}</p>}
            </div>
          )}

          {form.rewardType === 'range' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className={labelCls}>Min coins</label>
                <input
                  type="number"
                  className={inputCls('rewardMin')}
                  value={form.rewardMin}
                  onChange={(e) => set('rewardMin', e.target.value)}
                  min={0}
                />
                {errors.rewardMin && <p className="text-xs text-red-400">{errors.rewardMin}</p>}
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Max coins</label>
                <input
                  type="number"
                  className={inputCls('rewardMax')}
                  value={form.rewardMax}
                  onChange={(e) => set('rewardMax', e.target.value)}
                  min={0}
                />
                {errors.rewardMax && <p className="text-xs text-red-400">{errors.rewardMax}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Stack Mode */}
        <div className="space-y-2.5">
          <label className={labelCls}>Stack Mode</label>
          <div className="space-y-2">
            {[
              { value: 'additive', label: 'Additive', desc: 'Coins from this rule are added to others' },
              { value: 'multiplier', label: 'Multiplier', desc: 'Multiplies the sum of all additive rules' },
              { value: 'override', label: 'Override', desc: 'Replaces all other rules; highest priority wins' },
            ].map((sm) => (
              <label key={sm.value} className="flex items-start gap-2.5 cursor-pointer group">
                <input
                  type="radio"
                  name="stackMode"
                  value={sm.value}
                  checked={form.stackMode === sm.value}
                  onChange={() => set('stackMode', sm.value as FormState['stackMode'])}
                  className="mt-0.5 accent-purple-500"
                />
                <div>
                  <span className="text-sm text-gray-200 font-medium">{sm.label}</span>
                  <p className="text-xs text-gray-500">{sm.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Priority */}
        <div className="space-y-1.5">
          <label className={labelCls}>Priority <span className="text-gray-600">(lower = evaluated first)</span></label>
          <input
            type="number"
            className={inputCls()}
            value={form.priority}
            onChange={(e) => set('priority', e.target.value)}
            min={0}
          />
        </div>

        {/* Active Period */}
        <div className="space-y-2">
          <label className={labelCls}>Active Period <span className="text-gray-600">(optional)</span></label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-500">From</label>
              <input
                type="datetime-local"
                className={inputCls()}
                value={form.activeFrom}
                onChange={(e) => set('activeFrom', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Until</label>
              <input
                type="datetime-local"
                className={inputCls()}
                value={form.activeUntil}
                onChange={(e) => set('activeUntil', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Enabled */}
        <label className="flex items-center gap-3 cursor-pointer">
          <Toggle checked={form.enabled} onChange={(v) => set('enabled', v)} />
          <span className="text-sm text-gray-300">Enabled</span>
        </label>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-euphoria-border flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 bg-euphoria-purple hover:bg-euphoria-purple/80 disabled:opacity-60 text-white text-sm font-medium rounded-lg py-2 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Rule'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 bg-white/5 hover:bg-white/10 text-gray-300 text-sm rounded-lg py-2 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview calculator panel
// ---------------------------------------------------------------------------

function PreviewCalculator() {
  const [trigger, setTrigger] = useState('playclip.correct');
  const [gameType, setGameType] = useState('');
  const [score, setScore] = useState('');
  const [streakDays, setStreakDays] = useState('');
  const [isFirstPlay, setIsFirstPlay] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const calculate = async () => {
    setLoading(true);
    setError(null);
    try {
      const ctx: RewardContext = {
        trigger,
        userId: 'preview-user',
        ...(gameType && { gameType }),
        ...(score !== '' && { score: Number(score) }),
        ...(streakDays !== '' && { streakDays: Number(streakDays) }),
        isFirstPlay,
      };
      const res = await previewReward(ctx);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Calculation failed');
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    'w-full bg-euphoria-dark border border-euphoria-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-euphoria-purple transition-colors';
  const labelCls = 'text-sm text-gray-400 font-medium';

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        <div className="space-y-1.5">
          <label className={labelCls}>Trigger</label>
          <select className={inputCls} value={trigger} onChange={(e) => setTrigger(e.target.value)}>
            {TRIGGERS.map((t) => (
              <option key={t.value} value={t.value}>{t.label} ({t.value})</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className={labelCls}>Game Type</label>
            <input
              className={inputCls}
              value={gameType}
              onChange={(e) => setGameType(e.target.value)}
              placeholder="e.g. quick_math"
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Score</label>
            <input
              type="number"
              className={inputCls}
              value={score}
              onChange={(e) => setScore(e.target.value)}
              placeholder="e.g. 185"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className={labelCls}>Streak Days</label>
          <input
            type="number"
            className={inputCls}
            value={streakDays}
            onChange={(e) => setStreakDays(e.target.value)}
            placeholder="e.g. 7"
          />
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isFirstPlay}
            onChange={(e) => setIsFirstPlay(e.target.checked)}
            className="accent-purple-500 h-4 w-4"
          />
          <span className="text-sm text-gray-300">Is First Play</span>
        </label>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-4 pt-2">
            <div className="h-px bg-euphoria-border" />

            {/* Total */}
            <div className="text-center">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Total Coins</p>
              <p className="text-5xl font-bold text-white tabular-nums">
                {result.totalCoins}
              </p>
              <p className="mt-1 text-xs font-mono text-gray-400">{result.breakdown}</p>
            </div>

            {/* Matched rules */}
            {result.matchedRules.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500 italic">No rules matched this context.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 uppercase tracking-widest">Matched Rules</p>
                {result.matchedRules.map((m, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-white/3 border border-euphoria-border rounded-lg px-3 py-2"
                  >
                    <span className="text-sm text-gray-200">{m.rule.name}</span>
                    <span className="font-mono text-sm text-green-300 font-semibold">
                      {m.contribution}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-6 py-4 border-t border-euphoria-border">
        <button
          onClick={calculate}
          disabled={loading}
          className="w-full bg-euphoria-purple hover:bg-euphoria-purple/80 disabled:opacity-60 text-white text-sm font-medium rounded-lg py-2 transition-colors"
        >
          {loading ? 'Calculating...' : 'Calculate Reward'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type RightPanel = 'editor' | 'preview' | null;

export function RewardRulesPage() {
  const [rules, setRules] = useState<RewardRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const [editingRule, setEditingRule] = useState<RewardRule | null>(null);
  const [formState, setFormState] = useState<FormState>(BLANK_FORM);

  const loadRules = useCallback(async () => {
    try {
      const data = await getRules();
      setRules(data);
    } catch {
      // silently fail — rules will just be empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  const openNew = () => {
    setEditingRule(null);
    setFormState(BLANK_FORM);
    setRightPanel('editor');
  };

  const openEdit = (rule: RewardRule) => {
    setEditingRule(rule);
    setFormState(ruleToForm(rule));
    setRightPanel('editor');
  };

  const openPreview = () => {
    setRightPanel((p) => (p === 'preview' ? null : 'preview'));
  };

  const cancelEditor = () => {
    setRightPanel(null);
    setEditingRule(null);
  };

  const handleSave = async (form: FormState) => {
    const payload = formToPayload(form);
    if (editingRule) {
      const updated = await updateRule(editingRule.id, payload);
      setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } else {
      const created = await createRule(payload);
      setRules((prev) => [...prev, created]);
    }
    setRightPanel(null);
    setEditingRule(null);
  };

  const handleToggle = async (rule: RewardRule, enabled: boolean) => {
    // Optimistic update
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled } : r)));
    try {
      const updated = await updateRule(rule.id, { enabled });
      setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch {
      // Revert on failure
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: rule.enabled } : r)));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this rule? This cannot be undone.')) return;
    await deleteRule(id);
    setRules((prev) => prev.filter((r) => r.id !== id));
    if (editingRule?.id === id) {
      setRightPanel(null);
      setEditingRule(null);
    }
  };
  void handleDelete; // referenced in future use

  const panelTitle = rightPanel === 'preview'
    ? 'Preview Calculator'
    : editingRule
    ? 'Edit Rule'
    : 'New Rule';

  return (
    <div className="flex h-full bg-euphoria-dark">
      {/* ── Left panel: rule list ── */}
      <div
        className={`flex flex-col border-r border-euphoria-border transition-all duration-200 ${
          rightPanel ? 'w-[42%]' : 'w-full'
        }`}
      >
        {/* Header */}
        <div className="shrink-0 px-6 py-4 border-b border-euphoria-border flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-white">Reward Rules</h1>
            <p className="text-xs text-gray-500">{rules.length} rule{rules.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={openPreview}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              rightPanel === 'preview'
                ? 'bg-euphoria-purple/20 border-euphoria-purple text-euphoria-purple'
                : 'bg-white/5 border-euphoria-border text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            ◈ Preview
          </button>
          <button
            onClick={openNew}
            className="px-3 py-1.5 text-xs bg-euphoria-purple hover:bg-euphoria-purple/80 text-white rounded-lg transition-colors font-medium"
          >
            + New Rule
          </button>
        </div>

        {/* Rule list */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          ) : rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <div className="text-4xl mb-4 opacity-30">◎</div>
              <p className="text-gray-500 text-sm">No reward rules yet.</p>
              <p className="text-gray-600 text-xs mt-1">Create your first rule to get started.</p>
              <button
                onClick={openNew}
                className="mt-4 px-4 py-2 bg-euphoria-purple hover:bg-euphoria-purple/80 text-white text-sm rounded-lg transition-colors"
              >
                Create Rule
              </button>
            </div>
          ) : (
            rules.map((rule) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                onEdit={openEdit}
                onToggle={handleToggle}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right panel: editor or preview ── */}
      {rightPanel && (
        <div className="flex-1 flex flex-col min-w-0 bg-euphoria-card">
          {/* Panel header */}
          <div className="shrink-0 px-6 py-4 border-b border-euphoria-border flex items-center gap-3">
            <h2 className="flex-1 text-base font-semibold text-white">{panelTitle}</h2>
            {rightPanel !== 'preview' && (
              <button
                onClick={cancelEditor}
                className="p-1.5 text-gray-500 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
              >
                ✕
              </button>
            )}
          </div>

          {rightPanel === 'editor' ? (
            <RuleEditor
              key={editingRule?.id ?? 'new'}
              initial={formState}
              onSave={handleSave}
              onCancel={cancelEditor}
            />
          ) : (
            <PreviewCalculator />
          )}
        </div>
      )}
    </div>
  );
}
