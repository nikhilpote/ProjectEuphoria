import { useEffect, useState, useCallback } from 'react';
import { getEarnRates, updateEarnRate, type EarnRate } from '../api/economy';
import { getFlag, setFlag } from '../api/flags';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface CurrencyIdentity {
  name: string;
  symbol: string;
  nameSaveState: SaveState;
  symbolSaveState: SaveState;
}

interface RateRow {
  rate: EarnRate;
  draft: number;         // edited amount (not yet saved)
  dirty: boolean;
  saveState: SaveState;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function EarnRatesPage() {
  const [rows, setRows] = useState<RateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState<CurrencyIdentity>({
    name: 'Coins',
    symbol: '◈',
    nameSaveState: 'idle',
    symbolSaveState: 'idle',
  });

  const load = useCallback(async () => {
    try {
      const [rates, nameFlag, symbolFlag] = await Promise.all([
        getEarnRates(),
        getFlag('currency_name').catch(() => null),
        getFlag('currency_symbol').catch(() => null),
      ]);
      setRows(rates.map((r) => ({ rate: r, draft: r.amount, dirty: false, saveState: 'idle' })));
      setCurrency((prev) => ({
        ...prev,
        name: nameFlag ? String(nameFlag.value) : prev.name,
        symbol: symbolFlag ? String(symbolFlag.value) : prev.symbol,
      }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load earn rates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCurrencySave = async (field: 'name' | 'symbol') => {
    const flagKey = field === 'name' ? 'currency_name' : 'currency_symbol';
    setCurrency((prev) => ({ ...prev, [`${field}SaveState`]: 'saving' }));
    try {
      await setFlag(flagKey, currency[field]);
      setCurrency((prev) => ({ ...prev, [`${field}SaveState`]: 'saved' }));
    } catch {
      setCurrency((prev) => ({ ...prev, [`${field}SaveState`]: 'error' }));
    }
  };

  const handleAmountChange = (key: string, value: string) => {
    const num = parseInt(value, 10);
    setRows((prev) =>
      prev.map((r) =>
        r.rate.key === key
          ? { ...r, draft: isNaN(num) ? 0 : num, dirty: true, saveState: 'idle' }
          : r,
      ),
    );
  };

  const handleToggle = async (key: string, enabled: boolean) => {
    setRows((prev) =>
      prev.map((r) =>
        r.rate.key === key ? { ...r, saveState: 'saving' } : r,
      ),
    );
    try {
      const updated = await updateEarnRate(key, { enabled });
      setRows((prev) =>
        prev.map((r) =>
          r.rate.key === key
            ? { ...r, rate: updated, draft: updated.amount, dirty: false, saveState: 'saved' }
            : r,
        ),
      );
    } catch {
      setRows((prev) =>
        prev.map((r) => (r.rate.key === key ? { ...r, saveState: 'error' } : r)),
      );
    }
  };

  const handleSave = async (key: string) => {
    const row = rows.find((r) => r.rate.key === key);
    if (!row) return;
    setRows((prev) =>
      prev.map((r) => (r.rate.key === key ? { ...r, saveState: 'saving' } : r)),
    );
    try {
      const updated = await updateEarnRate(key, { amount: row.draft });
      setRows((prev) =>
        prev.map((r) =>
          r.rate.key === key
            ? { ...r, rate: updated, draft: updated.amount, dirty: false, saveState: 'saved' }
            : r,
        ),
      );
    } catch {
      setRows((prev) =>
        prev.map((r) => (r.rate.key === key ? { ...r, saveState: 'error' } : r)),
      );
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-euphoria-card rounded animate-pulse" />
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-16 bg-euphoria-card rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <p className="text-red-400">{error}</p>
        <button
          onClick={load}
          className="px-4 py-2 rounded-lg bg-euphoria-purple text-white text-sm font-medium hover:opacity-90"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Earn Rates</h1>
        <p className="text-sm text-gray-400 mt-1">
          Configure how many coins players earn for each action. Changes take effect immediately.
        </p>
      </div>

      {/* Currency Identity */}
      <div className="bg-euphoria-card border border-euphoria-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">Currency Identity</h2>
        <div className="flex flex-wrap gap-6">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-gray-400">Currency Name</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={currency.name}
                onChange={(e) => setCurrency((prev) => ({ ...prev, name: e.target.value, nameSaveState: 'idle' }))}
                placeholder="Coins"
                maxLength={20}
                className="w-36 px-3 py-1.5 rounded-lg bg-euphoria-dark border border-euphoria-border text-white text-sm focus:outline-none focus:border-euphoria-purple"
              />
              <button
                onClick={() => handleCurrencySave('name')}
                disabled={currency.nameSaveState === 'saving'}
                className="px-3 py-1.5 rounded-lg bg-euphoria-purple text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
              >
                {currency.nameSaveState === 'saving' ? '…' : 'Save'}
              </button>
              {currency.nameSaveState === 'saved' && <span className="text-green-400 text-xs">✓</span>}
              {currency.nameSaveState === 'error' && <span className="text-red-400 text-xs">!</span>}
            </div>
            <p className="text-xs text-gray-500">Shown in UI as "1,200 {currency.name}"</p>
          </div>

          {/* Symbol */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-gray-400">Currency Symbol</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={currency.symbol}
                onChange={(e) => setCurrency((prev) => ({ ...prev, symbol: e.target.value, symbolSaveState: 'idle' }))}
                placeholder="◈"
                maxLength={4}
                className="w-20 px-3 py-1.5 rounded-lg bg-euphoria-dark border border-euphoria-border text-white text-sm text-center focus:outline-none focus:border-euphoria-purple"
              />
              <button
                onClick={() => handleCurrencySave('symbol')}
                disabled={currency.symbolSaveState === 'saving'}
                className="px-3 py-1.5 rounded-lg bg-euphoria-purple text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
              >
                {currency.symbolSaveState === 'saving' ? '…' : 'Save'}
              </button>
              {currency.symbolSaveState === 'saved' && <span className="text-green-400 text-xs">✓</span>}
              {currency.symbolSaveState === 'error' && <span className="text-red-400 text-xs">!</span>}
            </div>
            <p className="text-xs text-gray-500">Icon shown next to balance: {currency.symbol} 1,200</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-euphoria-card border border-euphoria-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-euphoria-border">
              <th className="text-left px-5 py-3 text-gray-400 font-medium">Action</th>
              <th className="text-left px-5 py-3 text-gray-400 font-medium hidden md:table-cell">Description</th>
              <th className="text-center px-5 py-3 text-gray-400 font-medium w-32">Coins</th>
              <th className="text-center px-5 py-3 text-gray-400 font-medium w-24">Enabled</th>
              <th className="text-right px-5 py-3 text-gray-400 font-medium w-28 hidden sm:table-cell">Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={row.rate.key}
                className={[
                  'border-b border-euphoria-border last:border-0',
                  !row.rate.enabled ? 'opacity-50' : '',
                  idx % 2 === 0 ? '' : 'bg-white/[0.02]',
                ].join(' ')}
              >
                {/* Label + key */}
                <td className="px-5 py-4">
                  <p className="text-white font-medium">{row.rate.label}</p>
                  <p className="text-gray-500 text-xs font-mono mt-0.5">{row.rate.key}</p>
                </td>

                {/* Description */}
                <td className="px-5 py-4 text-gray-400 hidden md:table-cell">
                  {row.rate.description}
                </td>

                {/* Amount input + save */}
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2 justify-center">
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-yellow-400 text-xs">◈</span>
                      <input
                        type="number"
                        min={0}
                        value={row.draft}
                        onChange={(e) => handleAmountChange(row.rate.key, e.target.value)}
                        disabled={!row.rate.enabled || row.saveState === 'saving'}
                        className="w-20 pl-6 pr-2 py-1.5 rounded-lg bg-euphoria-dark border border-euphoria-border text-white text-sm text-right focus:outline-none focus:border-euphoria-purple disabled:opacity-50"
                      />
                    </div>
                    {row.dirty && (
                      <button
                        onClick={() => handleSave(row.rate.key)}
                        disabled={row.saveState === 'saving'}
                        className="px-2.5 py-1.5 rounded-lg bg-euphoria-purple text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
                      >
                        {row.saveState === 'saving' ? '…' : 'Save'}
                      </button>
                    )}
                    {row.saveState === 'saved' && !row.dirty && (
                      <span className="text-green-400 text-xs">✓</span>
                    )}
                    {row.saveState === 'error' && (
                      <span className="text-red-400 text-xs">!</span>
                    )}
                  </div>
                </td>

                {/* Toggle */}
                <td className="px-5 py-4 text-center">
                  <button
                    onClick={() => handleToggle(row.rate.key, !row.rate.enabled)}
                    disabled={row.saveState === 'saving'}
                    className={[
                      'relative inline-flex h-5 w-9 rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50',
                      row.rate.enabled ? 'bg-euphoria-purple' : 'bg-gray-600',
                    ].join(' ')}
                    aria-label={row.rate.enabled ? 'Disable' : 'Enable'}
                  >
                    <span
                      className={[
                        'inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform duration-200',
                        row.rate.enabled ? 'translate-x-4' : 'translate-x-0.5',
                      ].join(' ')}
                    />
                  </button>
                </td>

                {/* Updated at */}
                <td className="px-5 py-4 text-right text-gray-500 text-xs hidden sm:table-cell">
                  {formatRelative(row.rate.updatedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="bg-euphoria-card border border-euphoria-border rounded-xl p-4 text-xs text-gray-500 space-y-1">
        <p><span className="text-gray-300 font-medium">playclip_correct</span> — awarded for any correct PlayClip answer</p>
        <p><span className="text-gray-300 font-medium">playclip_perfect</span> — additional bonus when speed bonus ≥ 75% (score ≥ 175)</p>
        <p><span className="text-gray-300 font-medium">show_survivor_round</span> — awarded per round survived (multiplied by rounds reached)</p>
      </div>
    </div>
  );
}
