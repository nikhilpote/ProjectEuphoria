const BASE_URL = `${import.meta.env.VITE_API_URL ?? ''}/api/v1`;

export interface FeatureFlag {
  key: string;
  value: string | number | boolean;
  description: string | null;
  updatedAt: string;
  updatedBy: string | null;
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

export async function getFlag(key: string): Promise<FeatureFlag> {
  const res = await fetch(`${BASE_URL}/admin/flags/${encodeURIComponent(key)}`, {
    headers: { ...authHeaders() },
  });
  return handleResponse<FeatureFlag>(res);
}

export async function setFlag(key: string, value: string | number | boolean): Promise<FeatureFlag> {
  const res = await fetch(`${BASE_URL}/admin/flags/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ value }),
  });
  return handleResponse<FeatureFlag>(res);
}
