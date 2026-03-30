const BASE_URL = `${import.meta.env.VITE_API_URL ?? ''}/api/v1`;

export interface EarnRate {
  key: string;
  label: string;
  description: string;
  amount: number;
  enabled: boolean;
  updatedAt: string;
}

export interface RewardRule {
  id: string;
  name: string;
  description: string;
  trigger: string;
  conditions: Array<{ field: string; op: string; value: string | number | boolean }>;
  reward: {
    type: 'fixed' | 'multiplier' | 'range';
    amount?: number;
    value?: number;
    min?: number;
    max?: number;
  };
  stackMode: 'additive' | 'multiplier' | 'override';
  priority: number;
  activeFrom: string | null;
  activeUntil: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RewardContext {
  trigger: string;
  userId: string;
  gameType?: string;
  score?: number;
  streakDays?: number;
  isFirstPlay?: boolean;
}

export interface PreviewResult {
  totalCoins: number;
  matchedRules: Array<{ rule: RewardRule; contribution: string }>;
  breakdown: string;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('accessToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleResponse<T>(res: Response): Promise<T> {
  const body = await res.json() as { success: boolean; data?: T; error?: { message?: string } };
  if (!res.ok) throw new Error((body.error?.message) ?? `HTTP ${res.status}`);
  return (body.data ?? body) as T;
}

export async function getEarnRates(): Promise<EarnRate[]> {
  const res = await fetch(`${BASE_URL}/economy/earn-rates`, {
    headers: { ...authHeaders() },
  });
  return handleResponse<EarnRate[]>(res);
}

export async function updateEarnRate(
  key: string,
  patch: { amount?: number; enabled?: boolean },
): Promise<EarnRate> {
  const res = await fetch(`${BASE_URL}/economy/earn-rates/${encodeURIComponent(key)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(patch),
  });
  return handleResponse<EarnRate>(res);
}

export async function getRules(): Promise<RewardRule[]> {
  const res = await fetch(`${BASE_URL}/economy/reward-rules`, {
    headers: { ...authHeaders() },
  });
  return handleResponse<RewardRule[]>(res);
}

export async function createRule(
  input: Omit<RewardRule, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<RewardRule> {
  const res = await fetch(`${BASE_URL}/economy/reward-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(input),
  });
  return handleResponse<RewardRule>(res);
}

export async function updateRule(
  id: string,
  patch: Partial<RewardRule>,
): Promise<RewardRule> {
  const res = await fetch(`${BASE_URL}/economy/reward-rules/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(patch),
  });
  return handleResponse<RewardRule>(res);
}

export async function deleteRule(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/economy/reward-rules/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  });
  if (!res.ok) {
    const body = await res.json() as { error?: { message?: string } };
    throw new Error((body.error?.message) ?? `HTTP ${res.status}`);
  }
}

export async function previewReward(ctx: RewardContext): Promise<PreviewResult> {
  const res = await fetch(`${BASE_URL}/economy/reward-rules/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(ctx),
  });
  return handleResponse<PreviewResult>(res);
}
