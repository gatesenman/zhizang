import type { SyncPushItem, SyncResponse } from '@zhicang/shared';
import { changedSince, applyRemote, getSetting, setSetting } from './db';
import { getBackendUrl, getLicenseToken, getLicenseStatus } from './license';
import { netFetch } from './net-fetch';

const LAST_SYNC_KEY = 'last_sync_at';

export function getLastSyncAt(): number {
  return Number(getSetting(LAST_SYNC_KEY) || 0);
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  serverTime: number;
}

// 双向同步：把本地自上次同步以来的变更推送到云端，并拉取云端变更（last-write-wins）
export async function runSync(transport: typeof fetch = netFetch): Promise<SyncResult> {
  const token = getLicenseToken();
  if (!token || !getLicenseStatus().activated) throw new Error('未激活或许可证失效，无法同步');
  try {
  const since = getLastSyncAt();
  const local: SyncPushItem[] = changedSince(since);

  const res = await transport(`${getBackendUrl().replace(/\/$/, '')}/sync`, {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ since, items: local }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`同步失败 (${res.status}) ${t.slice(0, 120)}`);
  }
  const data = (await res.json()) as SyncResponse;
  if (!data || !Array.isArray(data.items) || !Number.isFinite(data.serverTime)) throw new Error('同步响应格式无效，未更新同步游标');
  const { applied } = applyRemote(data.items || []);
  setSetting(LAST_SYNC_KEY, String(data.serverTime || Date.now()));
  setSetting('sync_last_error', '');
  return { pushed: local.length, pulled: applied, serverTime: data.serverTime };
  } catch (e) {
    setSetting('sync_last_error', String((e as Error).message ?? e));
    throw e;
  }
}

// ---------- 定时自动同步 ----------
const AUTO_ENABLED_KEY = 'sync_auto_enabled';
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

// 启动 / 重启定时器：仅在开启时生效；每次执行前由 runSync 校验是否已激活。
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
    // 未激活 / 网络异常时静默跳过，不打断用户。
    runSync().catch(() => undefined);
  }, ms);
  if (autoTimer.unref) autoTimer.unref();
  return cfg;
}

export function setSyncConfig(cfg: Partial<SyncConfig>): SyncConfig {
  if (cfg.enabled && !getLicenseStatus().activated) throw new Error('请先激活有效许可证，再开启自动同步');
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
