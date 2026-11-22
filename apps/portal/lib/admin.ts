import { API_BASE, type Product } from './api';

export interface AdminCode {
  id: string;
  code: string;
  plan: string;
  durationDays: number;
  maxDevices: number;
  status: 'unused' | 'active' | 'revoked';
  email: string | null;
  note: string | null;
  createdAt: string;
  devices: number;
}

export interface AdminOrder {
  id: string;
  productId: string;
  email: string;
  amountCents: number;
  currency: string;
  provider: string;
  status: string;
  codeId: string | null;
  createdAt: string;
}

export interface AdminTag {
  id: string;
  name: string;
  group: string | null;
}

async function authHttp<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message || `请求失败 ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function login(email: string, password: string): Promise<{ token: string; user: { role: string } }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message || '登录失败');
  }
  return res.json();
}

export const adminApi = {
  getSettings: (t: string) => authHttp<Record<string, string>>(t, '/admin/settings'),
  saveSettings: (t: string, body: Record<string, string>) =>
    authHttp<Record<string, string>>(t, '/admin/settings', { method: 'PUT', body: JSON.stringify(body) }),
  listCodes: (t: string) => authHttp<AdminCode[]>(t, '/admin/codes'),
  generateCodes: (t: string, body: { plan: string; durationDays: number; maxDevices: number; count: number; note?: string }) =>
    authHttp<AdminCode[]>(t, '/admin/codes', { method: 'POST', body: JSON.stringify(body) }),
  revokeCode: (t: string, id: string) =>
    authHttp<AdminCode>(t, `/admin/codes/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'revoked' }) }),
  listOrders: (t: string) => authHttp<AdminOrder[]>(t, '/admin/orders'),
  listProducts: (t: string) => authHttp<Product[]>(t, '/admin/products'),
  upsertProduct: (t: string, body: Partial<Product>) =>
    authHttp<Product>(t, '/admin/products', { method: 'POST', body: JSON.stringify(body) }),
  listTags: (t: string) => authHttp<AdminTag[]>(t, '/admin/tags'),
  addTag: (t: string, name: string, group?: string) =>
    authHttp<AdminTag>(t, '/admin/tags', { method: 'POST', body: JSON.stringify({ name, group }) }),
  removeTag: (t: string, id: string) => authHttp<void>(t, `/admin/tags/${id}`, { method: 'DELETE' }),
};
