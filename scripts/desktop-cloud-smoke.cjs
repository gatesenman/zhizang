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
    const status = await account.connectSyncAccount('desktop-scale@example.test', 'fixture-password-only', true, fetch);
    assert.equal(status.connected, true);
    const b = db.createBookmark({ url: 'https://example.test/real-desktop-sync', title: '桌面同步实测' });
    db.updateBookmark(b.id, { notes: '真实桌面数据库往返' });
    db.getDb().transaction(() => { for (let i = 0; i < 5005; i++) db.createBookmark({ url: 'https://scale-sync.example.test/' + i, title: '分页实测 ' + i }); })();
    const skewed = async (...args) => { const response = await fetch(...args); const data = await response.json(); data.serverTime = Date.now() + 86400000; return new Response(JSON.stringify(data), { status: response.status }); };
    const result = await sync.runSync(skewed);
    assert.ok(result.pushed > 5000);
    assert.ok(sync.getLastSyncAt() <= Date.now(), 'future server clock is not the local upload cursor');
    db.updateBookmark(b.id, { notes: '服务器时钟超前后仍同步' });
    assert.ok((await sync.runSync(fetch)).pushed > 0);
    assert.ok(result.pushed > 0);
    assert.ok(sync.getLastSyncAt() > 0);
    // A second real desktop database downloads every page, not only the first 5000.
    db.getDb().close(); const second = path.join(dir, 'second.db'); db.initDb(second);
    account.setBackendUrl(process.env.ZHICANG_TEST_SERVER);
    await account.connectSyncAccount('desktop-scale@example.test', 'fixture-password-only', false, fetch);
    const pulled = await sync.runSync(fetch); assert.ok(pulled.pulled > 5000);
    assert.equal(db.queryBookmarks({ domain: 'scale-sync.example.test' }).total, 5005);
    const remote = db.getBookmarkByUrl(b.url); assert.equal(remote.notes, '服务器时钟超前后仍同步');
    db.trashBookmarks([remote.id]); db.purgeTrashedBookmarks([remote.id]);
    await sync.runSync(fetch); assert.equal(db.getBookmarkByUrl(b.url, true), null);
    db.getDb().close(); db.initDb(file); await sync.runSync(fetch);
    assert.ok(db.getBookmarkByUrl(b.url, true).deletedAt, 'deletion propagates to the other client');
    db.getDb().close(); db.initDb(second); await sync.runSync(fetch);
    assert.equal(db.getBookmarkByUrl(b.url, true), null, 'purged item stays purged after restart and full pull');
    db.getDb().close(); db.initDb(file);
    assert.equal(account.getSyncAccountStatus().connected, true);
    assert.ok(account.getBackendUrl().endsWith('/api'));
    assert.ok(sync.getLastSyncAt() > 0);
    console.log('PASS: real Electron/SQLite clients ↔ Nest/SQL.js HTTP: >5000 paged records, future server-clock metadata, deletion tombstones, account/cursor restart persistence. Isolated fixtures; scale-only global request quota 500.');
  } finally { db.getDb().close(); rmSync(dir, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
