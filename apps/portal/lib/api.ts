export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001/api';

export interface Product {
  id: string;
  name: string;
  plan: string;
  priceCents: number;
  currency: string;
  durationDays: number;
  maxDevices: number;
  description: string | null;
  active: boolean;
  sort: number;
}

export interface OrderPublic {
  id: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  amountCents: number;
  currency: string;
  code: string | null;
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message || `请求失败 ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchProducts(): Promise<Product[]> {
  return http<Product[]>('/products');
}

export function createCheckout(productId: string, email: string): Promise<{ orderId: string; payUrl: string; provider: string }> {
  return http('/payment/checkout', { method: 'POST', body: JSON.stringify({ productId, email }) });
}

export function fetchOrder(orderId: string): Promise<OrderPublic> {
  return http<OrderPublic>(`/payment/order/${orderId}`);
}

export function yuan(cents: number): string {
  return (cents / 100).toFixed(2);
}
