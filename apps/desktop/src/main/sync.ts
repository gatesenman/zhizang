import type { SyncPushItem, SyncResponse } from '@zhicang/shared';
import { changedSince, applyRemote, getSetting, setSetting } from './db';
import { getBackendUrl, getSyncSession } from './sync-account';
import { netFetch } from './net-fetch';

const LAST_SYNC_KEY = 'last_sync_local_v2';

export function getLastSyncAt(): number {
  const value = Number(getSetting(LAST_SYNC_KEY) || 0);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  serverTime: number;
}

// Bound both record count and UTF-8 request size (backend JSON body limit is 2 MB).
export function chunkSyncItems(items: SyncPushItem[]): SyncPushItem[][] {
  const chunks: SyncPushItem[][] = []; let chunk: SyncPushItem[] = []; let bytes = 0;
  for (const item of items) {
    const size = Buffer.byteLength(JSON.stringify(item), 'utf8') + 1;
    if (size > 1_000_000) throw new Error('单条同步数据过大，请先缩短笔记或描述');
    if (chunk.length && (chunk.length >= 500 || bytes + size > 1_000_000)) { chunks.push(chunk); chunk = []; bytes = 0; }
    chunk.push(item); bytes += size;
  }
  if (chunk.length) chunks.push(chunk);
  return chunks;
}
let inFlight: Promise<SyncResult> | null = null;
export function runSync(transport: typeof fetch = netFetch): Promise<SyncResult> {
  if (inFlight) return inFlight;
  inFlight = runSyncOnce(transport).finally(() => { inFlight = null; });
  return inFlight;
}
async function runSyncOnce(transport: typeof fetch): Promise<SyncResult> {
  const session = getSyncSession();
  const base = getBackendUrl();
  const startedAt = Date.now();
  try {
    if (!session) throw new Error('请在设置中连接自己的同步账号（本地功能不受影响）');
    const token = session.token;
    const currentAccount = (): boolean => getSyncSession()?.token === token && getBackendUrl() === base;
    const request = async (items: SyncPushItem[], pushOnly: boolean, cursor?: string): Promise<SyncResponse> => {
      if (!currentAccount()) throw new Error('同步账号已更改，未应用旧响应');
      const res = await transport(`${base.replace(/\/$/, '')}/sync`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ protocol: 2, since: 0, items, pushOnly, ...(cursor ? { cursor } : {}) }),
      });
      if (!res.ok) throw new Error(`同步失败 (${res.status})`);
      const data = (await res.json()) as SyncResponse;
      if (!currentAccount()) throw new Error('同步账号已更改，未应用旧响应');
      if (!data || !Array.isArray(data.items) || !Number.isFinite(data.serverTime)) throw new Error('同步响应格式无效，未更新同步游标');
      if (data.protocol !== 2 || (data.nextCursor !== null && (typeof data.nextCursor !== 'string' || !data.nextCursor || data.nextCursor.length > 256))) throw new Error('同步服务器需升级至分页协议 2，未更新同步游标');
      if (data.items.length > 500 || (data.nextCursor && (!data.items.length || data.nextCursor !== data.items[data.items.length - 1].urlHash || (cursor && data.nextCursor <= cursor)))) throw new Error('同步分页游标无效，未更新同步游标');
      return data;
    };
    await request([], true); // Negotiate before sending local content to an old server.
    const previous = getLastSyncAt();
    const local = changedSince(startedAt < previous ? 0 : previous);
    for (const chunk of chunkSyncItems(local)) await request(chunk, true);
    let pulled = 0; let cursor: string | undefined; let serverTime = 0;
    do {
      const data = await request([], false, cursor);
      pulled += applyRemote(data.items).applied;
      serverTime = data.serverTime;
      cursor = data.nextCursor ?? undefined;
    } while (cursor);
    // Local upload cutoff is not the server clock; overlap one millisecond for concurrent edits.
    setSetting(LAST_SYNC_KEY, String(Math.max(0, startedAt - 1)));
    setSetting('sync_last_error', '');
    return { pushed: local.length, pulled, serverTime };
  } catch (e) {
    if (getSyncSession()?.token === session?.token && getBackendUrl() === base) setSetting('sync_last_error', String((e as Error).message ?? e));
    throw e;
  }
}

// ---------- 定时自动同步 ----------
const AUTO_ENABLED_KEY = 'sync_auto_enabled_v2';
const AUTO_INTERVAL_KEY = 'sync_auto_interval_min';
const DEFAULT_INTERVAL_MIN = 30;
const MIN_INTERVAL_MIN = 5;

export interface SyncConfig {
  enabled: boolean;
  intervalMin: number;
}

export function getSyncConfig(): SyncConfig {
  const intervalMin = Number(getSetting(AUTO_INTERVAL_KEY) || DEFAULT_INTERVAL_MIN);
  return {
    enabled: getSetting(AUTO_ENABLED_KEY) === '1',
    intervalMin: Number.isFinite(intervalMin) && intervalMin >= MIN_INTERVAL_MIN ? intervalMin : DEFAULT_INTERVAL_MIN,
  };
}

let autoTimer: ReturnType<typeof setInterval> | null = null;

// 启动 / 重启定时器：仅在开启时生效；每次执行前由 runSync 校验同步账号。
// 返回当前生效配置，供设置页回显。变更间隔或开关后调用即可热更新。
export function scheduleAutoSync(): SyncConfig {
  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
  }
  const cfg = getSyncConfig();
  if (!cfg.enabled) return cfg;
  const ms = cfg.intervalMin * 60 * 1000;
  autoTimer = setInterval(() => {
    // 未登录 / 网络异常时静默跳过，不打断用户。
    runSync().catch(() => undefined);
  }, ms);
  if (autoTimer.unref) autoTimer.unref();
  return cfg;
}

export function setSyncConfig(cfg: Partial<SyncConfig>): SyncConfig {
  if (cfg.enabled && !getSyncSession()) throw new Error('请先连接自己的同步账号');
  if (cfg.intervalMin != null && !Number.isFinite(cfg.intervalMin)) throw new Error('同步间隔无效');
  if (cfg.enabled != null) setSetting(AUTO_ENABLED_KEY, cfg.enabled ? '1' : '0');
  if (cfg.intervalMin != null) {
    const v = Math.max(MIN_INTERVAL_MIN, Math.floor(cfg.intervalMin));
    setSetting(AUTO_INTERVAL_KEY, String(v));
  }
  return scheduleAutoSync();
}

// app 启动时调用：若已开启自动同步则先尝试同步一次，并启动定时器。
export function initAutoSync(): void {
  const cfg = scheduleAutoSync();
  if (cfg.enabled) runSync().catch(() => undefined);
}
