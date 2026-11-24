import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initDb, getDb, getSetting, setSetting, createBookmark, getBookmark } from '../src/main/db';
import { getBackendUrl, setBackendUrl, getSyncSession, getSyncAccountStatus, connectSyncAccount, disconnectSyncAccount } from '../src/main/sync-account';
import { normalizeSyncBase } from '../src/main/service-url';
import { runSync, getSyncConfig, setSyncConfig, getLastSyncAt } from '../src/main/sync';
const folder = mkdtempSync(join(tmpdir(), 'zhicang-open-source-'));
before(() => initDb(join(folder, 'fixture.db')));
after(() => { getDb().close(); rmSync(folder, { recursive: true, force: true }); });
const response = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status });

test('expired/malformed legacy licensing configuration is ignored without deleting content, settings or AI keys', async () => {
  for (const key of ['license_token', 'license_email', 'device_salt', 'backend_url', 'local_mode', 'sync_auto_enabled']) setSetting(key, key === 'sync_auto_enabled' ? '1' : 'legacy fixture');
  setSetting('llm', JSON.stringify({ apiKey: 'not-a-real-api-key', enabled: false }));
  const bookmark = createBookmark({ url: 'https://example.test/open-source', title: '保留收藏' });
  assert.equal(getBookmark(bookmark.id)?.title, '保留收藏');
  assert.equal(getBackendUrl(), ''); assert.equal(getSyncAccountStatus().connected, false);
  assert.equal(getSyncConfig().enabled, false);
  let called = false;
  await assert.rejects(runSync(async () => { called = true; return response({}); }), /连接自己的同步账号/);
  assert.equal(called, false);
  assert.equal(getSetting('license_token'), 'legacy fixture');
  assert.equal(JSON.parse(getSetting('llm')!).apiKey, 'not-a-real-api-key');
});
test('sync endpoint validation keeps credentials private without breaking local HTTP model settings', () => {
  for (const url of ['http://public.test', 'https://a:b@server.test', 'file:///tmp/data', 'https://server.test?a=b']) assert.throws(() => normalizeSyncBase(url));
  assert.equal(normalizeSyncBase('http://127.0.0.1:3001/'), 'http://127.0.0.1:3001/api');
  assert.equal(normalizeSyncBase('https://server.test/api/'), 'https://server.test/api');
});
test('self-hosted account login, credential minimization, error reporting, cursor reset and disconnect preserve bookmarks', async () => {
  setBackendUrl('https://server.test');
  await assert.rejects(connectSyncAccount('fixture@example.test', 'fixture-password', false, async () => response({}, 401)), /401/);
  assert.equal(getSyncSession(), null);
  await connectSyncAccount('fixture@example.test', 'fixture-password', false, async (url, init) => {
    assert.equal(url, 'https://server.test/api/auth/login');
    assert.equal(init?.redirect, 'error');
    assert.equal(JSON.parse(String(init?.body)).password, 'fixture-password');
    return response({ token: 'fixture-session-token', user: { email: 'fixture@example.test' } });
  });
  assert.doesNotMatch(getSetting('sync_account_session')!, /fixture-password/);
  setSyncConfig({ enabled: true, intervalMin: 30 });
  assert.equal(getSyncConfig().enabled, true);
  await runSync(async (_url, init) => {
    assert.equal(init?.redirect, 'error');
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer fixture-session-token');
    return response({ items: [], serverTime: 100 });
  });
  assert.equal(getLastSyncAt(), 100);
  await assert.rejects(runSync(async () => response({}, 401)), /401/);
  assert.match(getSetting('sync_last_error')!, /401/);
  assert.equal(getLastSyncAt(), 100);
  await assert.rejects(runSync(async () => response({ items: [] })), /响应格式无效/);
  assert.equal(getLastSyncAt(), 100);
  setBackendUrl('https://other.test');
  assert.equal(getSyncSession(), null); assert.equal(getLastSyncAt(), 0); assert.equal(getSyncConfig().enabled, false);
  disconnectSyncAccount(); setSyncConfig({ enabled: false });
  assert.ok(getBookmark(1)); assert.equal(getSetting('license_token'), 'legacy fixture');
});
test('a response from the previous sync account is not applied after an account switch', async () => {
  await connectSyncAccount('fixture@example.test', 'fixture-password', false, async () => response({ token: 'fixture-token-2', user: { email: 'fixture@example.test' } }));
  await assert.rejects(runSync(async () => { disconnectSyncAccount(); return response({ items: [], serverTime: 200 }); }), /账号已更改/);
  assert.equal(getLastSyncAt(), 0);
});
