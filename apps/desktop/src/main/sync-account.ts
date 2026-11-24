import { getSetting, setSetting } from './db';
import { normalizeSyncBase } from './service-url';
import { netFetch } from './net-fetch';

const URL_KEY = 'sync_backend_url';
const SESSION_KEY = 'sync_account_session';
interface Session { token: string; email: string; backendUrl: string }

export function getBackendUrl(): string {
  const value = getSetting(URL_KEY);
  return value ? normalizeSyncBase(value) : '';
}

export function getSyncSession(): Session | null {
  try {
    const session = JSON.parse(getSetting(SESSION_KEY) || 'null') as Session | null;
    return session?.token && session.email && session.backendUrl === getBackendUrl() ? session : null;
  } catch { return null; }
}

export function getSyncAccountStatus(): { connected: boolean; email?: string; backendUrl: string } {
  const session = getSyncSession();
  return { connected: !!session, email: session?.email, backendUrl: getBackendUrl() };
}

export function disconnectSyncAccount(): void {
  setSetting(SESSION_KEY, '');
  setSetting('sync_auto_enabled_v2', '0');
  setSetting('last_sync_at', '0');
}

export function setBackendUrl(url: string): void {
  const next = url.trim() ? normalizeSyncBase(url) : '';
  if (getBackendUrl() !== next) disconnectSyncAccount();
  setSetting(URL_KEY, next);
}

export async function connectSyncAccount(email: string, password: string, register = false, transport: typeof fetch = netFetch): Promise<ReturnType<typeof getSyncAccountStatus>> {
  const backendUrl = getBackendUrl();
  if (!backendUrl) throw new Error('请先配置自己的同步服务地址');
  if (!email.trim() || !password) throw new Error('请输入同步账号和密码');
  const res = await transport(`${backendUrl}/auth/${register ? 'register' : 'login'}`, {
    method: 'POST', signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  if (!res.ok) throw new Error(`同步账号登录/注册失败 (${res.status})`);
  const data = await res.json() as { token?: string; user?: { email?: string } };
  if (!data.token || !data.user?.email) throw new Error('同步服务响应无效');
  // Do not persist passwords. Changing account must not reuse another account's cursor.
  if (getBackendUrl() !== backendUrl) throw new Error('同步服务地址已更改，请重试');
  disconnectSyncAccount();
  setSetting(SESSION_KEY, JSON.stringify({ token: data.token, email: data.user.email, backendUrl }));
  return getSyncAccountStatus();
}
