import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { initDb, getDb, createBookmark, getBookmark, setSetting, getSetting, queryBookmarks, updateBookmark, addTagToBookmarks, listTags } from '../src/main/db';
import { importCsv, importJson, exportJson } from '../src/main/import-export';
const folder = mkdtempSync(join(tmpdir(), 'zhicang-deep-rounds-'));
const path = join(folder, 'live.db');
initDb(path);
after(() => { if (getDb().open) getDb().close(); rmSync(folder, { recursive: true, force: true }); });

test('R1 failed upgrade rolls back earlier migration writes and closes the handle without deleting settings or bookmarks', () => {
  const b = createBookmark({ url: 'https://rounds.example.test/legacy', title: '旧数据保留' });
  setSetting('license_token', 'expired-fixture-only'); setSetting('llm', 'external-key-fixture-only');
  getDb().exec("DELETE FROM categories; DELETE FROM settings WHERE key='url_hash_version'; CREATE TRIGGER fail_seed BEFORE INSERT ON categories BEGIN SELECT RAISE(ABORT, 'fixture failed migration'); END;");
  getDb().close();
  assert.throws(() => initDb(path), /fixture failed migration/);
  assert.equal(getDb().open, false);
  const old = new Database(path);
  assert.equal(old.prepare("SELECT value FROM settings WHERE key='url_hash_version'").get(), undefined);
  assert.equal((old.prepare('SELECT title FROM bookmarks WHERE id=?').get(b.id) as any).title, '旧数据保留');
  old.exec('DROP TRIGGER fail_seed'); old.close(); initDb(path);
  assert.equal(getSetting('license_token'), 'expired-fixture-only');
  assert.equal(getSetting('llm'), 'external-key-fixture-only');
  assert.ok(getBookmark(b.id));
});

test('R2 CSV broken quotes are rejected before writes; BOM/multiline and JSON archived metadata survive roundtrip', () => {
  const count = queryBookmarks({}).total;
  assert.throws(() => importCsv('url,title\nhttps://rounds.example.test/half,ok\nhttps://rounds.example.test/bad,"broken'), /引号/);
  assert.equal(queryBookmarks({}).total, count);
  assert.equal(importCsv('\ufeffurl,title\r\nhttps://rounds.example.test/csv,"multi\nline"').imported, 1);
  assert.equal(importCsv('url,title\nhttps://rounds.example.test/csv,duplicate').skipped, 1);
  const b = createBookmark({ url: 'https://rounds.example.test/archive-roundtrip' });
  updateBookmark(b.id, { status: 'archived', visitedAt: 12345 });
  const record = JSON.parse(exportJson()).bookmarks.find((x: any) => x.id === b.id);
  record.url = 'https://rounds.example.test/archive-restored';
  assert.equal(importJson(JSON.stringify({ bookmarks: [record] })).imported, 1);
  const restored = queryBookmarks({ keyword: 'archive-restored' }).items[0];
  assert.equal(restored.status, 'archived'); assert.equal(restored.visitedAt, 12345);
});

test('R3 failed mixed-ID tag batch rolls back bookmarks AND tag creation; empty batches do not create orphan tags', () => {
  const b = createBookmark({ url: 'https://rounds.example.test/batch', tags: ['old-tag'] });
  assert.throws(() => addTagToBookmarks([b.id, 987654321], 'rollback-tag'));
  assert.deepEqual(getBookmark(b.id)?.tags, ['old-tag']);
  assert.ok(!listTags().some(t => t.name === 'rollback-tag'));
  addTagToBookmarks([], 'empty-batch-tag');
  assert.ok(!listTags().some(t => t.name === 'empty-batch-tag'));
  assert.throws(() => addTagToBookmarks([b.id], '   '), /不能为空/);
  addTagToBookmarks([b.id, b.id], 'new-tag');
  assert.deepEqual(getBookmark(b.id)?.tags, ['new-tag', 'old-tag']);
});

test('R4 tied timestamps have deterministic nonoverlapping pages; default library traversal has a covering order index', () => {
  const ids: number[] = [];
  for (let i = 0; i < 12; i++) ids.push(createBookmark({ url: 'https://pages.rounds.test/' + i, title: 'same pagination title' }).id);
  getDb().prepare("UPDATE bookmarks SET created_at=123456 WHERE url LIKE 'https://pages.rounds.test/%'").run();
  const a = queryBookmarks({ domain: 'pages.rounds.test', limit: 6 }).items.map(x => x.id);
  const b = queryBookmarks({ domain: 'pages.rounds.test', limit: 6, offset: 6 }).items.map(x => x.id);
  assert.deepEqual([...a, ...b], [...ids].reverse());
  assert.deepEqual(queryBookmarks({ domain: 'pages.rounds.test', sort: 'created_asc' }).items.map(x => x.id), ids);
  const plan = getDb().prepare('EXPLAIN QUERY PLAN SELECT * FROM bookmarks WHERE deleted_at IS NULL ORDER BY pinned DESC, created_at DESC, id DESC LIMIT 50').all();
  assert.match(JSON.stringify(plan), /idx_bookmarks_active_created/);
});
