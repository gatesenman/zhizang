import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Repository } from 'typeorm';
import { SyncService } from '../src/sync/sync.service';
import { buildDbOptions } from '../src/db/data-source';
import type { SyncItem } from '../src/db/entities';
const item = { urlHash: 'fixture-hash', url: 'https://example.test/sync', title: '收藏', description: '', tags: ['test'], favorite: false, pinned: false, readState: 'unread' as const, notes: '', status: 'active' as const, deleted: false, updatedAt: 1000 };

test('validates the whole batch before any write, including unsafe URLs and invalid types', async () => {
  let calls = 0;
  const repo = { findOne: async () => { calls++; return null; }, save: async () => { calls++; }, create: () => { calls++; } } as unknown as Repository<SyncItem>;
  const service = new SyncService(repo);
  for (const invalid of [{ ...item, url: 'file:///tmp/private' }, { ...item, tags: ['safe', 1] }, { ...item, updatedAt: NaN }, null]) {
    await assert.rejects(service.sync('account:fixture', 0, [item, invalid as typeof item]), /格式无效/);
    assert.equal(calls, 0, 'invalid batch must not partially write valid preceding entries');
  }
});
test('invalid cursors and oversized batches are rejected without repository access', async () => {
  const service = new SyncService({} as Repository<SyncItem>);
  await assert.rejects(service.sync('account:fixture', -1, []), /格式无效/);
  await assert.rejects(service.sync('account:fixture', Infinity, []), /格式无效/);
  await assert.rejects(service.sync('account:fixture', 0, Array(5001).fill(item)), /5000/);
});
test('database initialization does not register legacy commercial entities or delete unknown tables', () => {
  const oldUrl = process.env.DATABASE_URL;
  const oldSync = process.env.DB_SYNC;
  try {
    process.env.DATABASE_URL = 'postgres://fixture@127.0.0.1/fixture';
    delete process.env.DB_SYNC;
    const options = buildDbOptions();
    assert.equal(options.synchronize, false, 'existing Postgres schema changes are opt-in');
    assert.notEqual(options.dropSchema, true);
    const entities = options.entities as Array<{ name: string }>;
    assert.deepEqual(entities.map((entity) => entity.name).sort(), ['Setting', 'SyncItem', 'TagDict', 'User']);
    process.env.DB_SYNC = 'true'; assert.equal(buildDbOptions().synchronize, true);
  } finally {
    if (oldUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldUrl;
    if (oldSync === undefined) delete process.env.DB_SYNC; else process.env.DB_SYNC = oldSync;
  }
});
