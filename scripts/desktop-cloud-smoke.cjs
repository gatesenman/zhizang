// Isolated test client, not part of the shipped application. All credentials are fixtures.
require('../node_modules/ts-node/register/transpile-only');
const assert = require('node:assert/strict');
const path = require('node:path');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const db = require('../apps/desktop/src/main/db.ts');
const account = require('../apps/desktop/src/main/sync-account.ts');
const sync = require('../apps/desktop/src/main/sync.ts');
const dir = mkdtempSync(path.join(tmpdir(), 'zhicang-desktop-cloud-'));
const file = path.join(dir, 'client.db');
(async () => {
  db.initDb(file);
  try {
    account.setBackendUrl(process.env.ZHICANG_TEST_SERVER);
    assert.ok(account.getBackendUrl().endsWith('/api'));
    const status = await account.connectSyncAccount('integration@example.test', 'fixture-password-only', false, fetch);
    assert.equal(status.connected, true);
    const b = db.createBookmark({ url: 'https://example.test/real-desktop-sync', title: '桌面同步实测' });
    db.updateBookmark(b.id, { notes: '真实桌面数据库往返' });
    const result = await sync.runSync(fetch);
    assert.ok(result.pushed > 0);
    assert.ok(sync.getLastSyncAt() > 0);
    const response = await fetch(account.getBackendUrl() + '/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + account.getSyncSession().token }, body: JSON.stringify({ since: 0, items: [] }) });
    const payload = await response.json();
    assert.ok(payload.items.some((x) => x.url === b.url && x.notes === '真实桌面数据库往返'));
    db.getDb().close(); db.initDb(file);
    assert.equal(account.getSyncAccountStatus().connected, true);
    assert.ok(account.getBackendUrl().endsWith('/api'));
    assert.ok(sync.getLastSyncAt() > 0);
    console.log('PASS: actual desktop account/API-base/SQLite/sync code → isolated Nest HTTP backend → restart persistence. Disposable fixture account only.');
  } finally { db.getDb().close(); rmSync(dir, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
