import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { initDb, getDb, createBookmark, getBookmark, setSetting, getSetting } from '../src/main/db';
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
