import Database from 'better-sqlite3';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { getDb } from './db';

export async function saveFullBackup(destination: string): Promise<void> {
  if (resolve(destination) === resolve(getDb().name)) throw new Error('备份不能覆盖正在使用的数据库');
  await getDb().backup(destination);
}

// Caller must relaunch immediately after successful restore; tests explicitly reopen the DB.
export async function restoreFullBackup(source: string, replaceFile: (from: string, to: string) => void = copyFileSync): Promise<{ safetyBackup: string }> {
  const live = getDb().name;
  if (resolve(source) === resolve(live)) throw new Error('请选择备份文件，而不是当前数据库');
  const sourceDb = new Database(source, { readonly: true, fileMustExist: true });
  const stamp = Date.now();
  const staging = join(dirname(live), `restore-${stamp}.tmp`);
  try {
    const integrity = sourceDb.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') throw new Error('备份完整性检查未通过');
    for (const table of ['bookmarks', 'categories', 'settings']) {
      if (!sourceDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)) throw new Error('不是智藏完整数据库备份');
    }
    sourceDb.prepare('SELECT id,url,url_hash,title FROM bookmarks LIMIT 1').all();
    if ((sourceDb.pragma('foreign_key_check') as unknown[]).length) throw new Error('备份包含损坏的关联记录，未覆盖当前数据库');
    await sourceDb.backup(staging);
  } catch (error) { if (existsSync(staging)) rmSync(staging); throw error; } finally { sourceDb.close(); }
  const safetyDir = join(dirname(live), 'backups');
  mkdirSync(safetyDir, { recursive: true });
  const safetyBackup = join(safetyDir, `before-restore-${stamp}.zhicang`);
  try {
    await getDb().backup(safetyBackup);
    getDb().close();
    try {
      replaceFile(staging, live);
      for (const suffix of ['-wal', '-shm']) if (existsSync(live + suffix)) rmSync(live + suffix);
    } catch (e) {
      copyFileSync(safetyBackup, live);
      throw e;
    }
  } finally { if (existsSync(staging)) rmSync(staging); }
  return { safetyBackup };
}
