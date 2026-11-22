import { app, dialog, BrowserWindow } from 'electron';
import pkg from 'electron-updater';
import { getSetting } from './db';
import { updatePolicy } from './update-policy';
const { autoUpdater } = pkg;
export type UpdateStatus =
  | { state: 'disabled'; message: string }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'none' }
  | { state: 'progress'; percent: number; transferred: number; total: number; bytesPerSecond: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };
let wired = false;
let lastStatus: UpdateStatus = { state: 'disabled', message: '未配置更新源' };
let windowProvider: () => BrowserWindow | null = () => null;
function broadcast(status: UpdateStatus): UpdateStatus {
  lastStatus = status; windowProvider()?.webContents.send('update:status', status); return status;
}
function fail(err: unknown): UpdateStatus {
  return broadcast({ state: 'error', message: String((err as Error)?.message ?? err).split('\n')[0].slice(0, 180) });
}
function configure(getWindow: () => BrowserWindow | null): boolean {
  windowProvider = getWindow;
  const policy = updatePolicy(getSetting('update_enabled'), getSetting('update_url'));
  if (!policy.enabled || !app.isPackaged) {
    broadcast({ state: 'disabled', message: policy.reason || '源码开发模式不检查更新；安装版仍需发行方配置更新源。' }); return false;
  }
  autoUpdater.setFeedURL({ provider: 'generic', url: policy.url });
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = null;
  if (!wired) {
    wired = true;
    autoUpdater.on('checking-for-update', () => broadcast({ state: 'checking' }));
    autoUpdater.on('update-available', (info) => broadcast({ state: 'available', version: info.version }));
    autoUpdater.on('update-not-available', () => broadcast({ state: 'none' }));
    autoUpdater.on('download-progress', (p) => broadcast({ state: 'progress', percent: Math.round(p.percent), transferred: p.transferred, total: p.total, bytesPerSecond: p.bytesPerSecond }));
    autoUpdater.on('error', fail);
    autoUpdater.on('update-downloaded', async (info) => {
      broadcast({ state: 'downloaded', version: info.version });
      const options = { type: 'info' as const, title: '更新已下载', message: `新版本 ${info.version} 已准备就绪`, detail: '选择立即重启安装，或稍后继续使用当前版本。', buttons: ['稍后', '重启安装'], defaultId: 0, cancelId: 0 };
      const win = windowProvider();
      const r = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options);
      if (r.response === 1) autoUpdater.quitAndInstall();
    });
  }
  return true;
}
export function initAutoUpdate(getWindow: () => BrowserWindow | null): void {
  if (configure(getWindow)) void autoUpdater.checkForUpdates().catch(fail);
}
export async function checkForUpdates(getWindow: () => BrowserWindow | null): Promise<UpdateStatus> {
  if (!configure(getWindow)) return lastStatus;
  try { await autoUpdater.checkForUpdates(); } catch (e) { fail(e); }
  return lastStatus;
}
export async function downloadUpdate(): Promise<UpdateStatus> {
  if (!configure(windowProvider)) return lastStatus;
  if (lastStatus.state !== 'available') throw new Error('请先检查到可用更新，再下载');
  try { await autoUpdater.downloadUpdate(); } catch (e) { fail(e); }
  return lastStatus;
}
export function getUpdateStatus(): UpdateStatus { return lastStatus; }
