import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'node:path';
import { Setting, SyncItem, TagDict, User } from './entities';

const entities = [User, Setting, TagDict, SyncItem];

export function buildDbOptions(): TypeOrmModuleOptions {
  const url = process.env.DATABASE_URL;
  if (url) {
    return {
      type: 'postgres',
      url,
      entities,
      synchronize: process.env.DB_SYNC !== 'false',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    };
  }
  const file = process.env.SQLITE_PATH || join(process.cwd(), 'zhicang-backend.db');
  return {
    // 本地开发使用 WASM SQLite，避免与 Electron 的 better-sqlite3 原生 ABI 相互覆盖。
    // SQL.js 单进程、整库内存，仅供本地/小型调试；生产仍使用 PostgreSQL。
    type: 'sqljs',
    location: file,
    autoSave: true,
    entities,
    synchronize: true,
  };
}
