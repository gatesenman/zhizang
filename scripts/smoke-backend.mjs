// Local-only integration test: disposable DB and account fixtures, no real services.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const root = fileURLToPath(new URL('../', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'zhicang-backend-smoke-'));
const dbFile = join(dir, 'smoke.db');
// Seed pre-upgrade data: old tables and legacy email data must survive, not be claimed.
const SQL = await require('sql.js')();
const legacy = new SQL.Database();
legacy.run("CREATE TABLE activation_codes (id varchar PRIMARY KEY, code varchar); INSERT INTO activation_codes VALUES ('legacy-id', 'not-a-real-activation-code')");
const { writeFileSync } = await import('node:fs');
legacy.run('CREATE TABLE sync_items (id varchar PRIMARY KEY NOT NULL, email varchar NOT NULL, urlHash varchar NOT NULL, payload text NOT NULL, updatedAtMs bigint NOT NULL, deleted boolean NOT NULL DEFAULT 0)');
legacy.run('INSERT INTO sync_items VALUES (?, ?, ?, ?, ?, ?)', ['legacy-sync-id', 'integration@example.test', 'legacy-private-hash', JSON.stringify({ notes: 'private legacy data' }), '1', 0]);
writeFileSync(dbFile, legacy.export()); legacy.close();
const reservation = createServer();
reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
const port = reservation.address().port; await new Promise((done) => reservation.close(done));
const base = `http://127.0.0.1:${port}/api`;
const child = spawn(process.execPath, [join(root, 'apps/backend/dist/main.js')], {
  cwd: join(root, 'apps/backend'),
  env: { ...process.env, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(port), DATABASE_URL: '', SQLITE_PATH: dbFile, JWT_SECRET: randomUUID(), THROTTLE_LIMIT: '500' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', (chunk) => { output += chunk; });
child.stderr.on('data', (chunk) => { output += chunk; });
const post = async (path, body, token) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), redirect: 'manual' });
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Backend startup timed out')), 20000);
    const finish = () => { if (output.includes('[zhicang-backend] listening')) { clearTimeout(timer); resolve(); } };
    child.stdout.on('data', finish);
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Backend exited ${code}`)); });
    finish();
  });
  assert.equal((await fetch(base + '/health')).status, 200);
  for (const path of ['/license/activate', '/payment/checkout', '/payment/mock/confirm', '/admin/codes']) {
    assert.equal((await post(path, {})).status, 404, path);
  }
  assert.equal((await fetch(base + '/products')).status, 404);
  const email = 'integration@example.test';
  const credentials = { email, password: 'fixture-password-only' };
  const registration = await post('/auth/register', credentials);
  assert.equal(registration.status, 201);
  const { token } = await registration.json();
  assert.ok(token);
  assert.equal((await post('/auth/login', { ...credentials, password: 'wrong-password' })).status, 401);
  assert.equal((await post('/auth/register', credentials)).status, 400);
  assert.equal((await post('/auth/login', credentials)).status, 201);
  const client = spawnSync(require('electron'), [join(root, 'scripts/desktop-cloud-smoke.cjs')], {
    cwd: root, encoding: 'utf8', timeout: 180000,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', TS_NODE_PROJECT: join(root, 'apps/desktop/tsconfig.test.json'), ZHICANG_TEST_SERVER: `http://127.0.0.1:${port}` },
  });
  if (client.stdout) process.stdout.write(client.stdout);
  if (client.stderr) process.stderr.write(client.stderr);
  assert.equal(client.status, 0, 'Actual desktop account/sync client must pass');
  assert.equal((await post('/sync', { since: 0, items: [] })).status, 401);
  assert.equal((await post('/sync', { since: 0, items: [] }, token + 'tampered')).status, 401);
  assert.equal((await fetch(base + '/sync', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })).status, 400, 'missing body is rejected, not a 500 after Express 5 migration');
  assert.equal((await post('/sync', { oversized: 'x'.repeat(2_100_000) }, token)).status, 413, 'bounded 2 MB JSON limit remains active');
  const sync = await post('/sync', { since: 0, items: [] }, token);
  assert.equal(sync.status, 201); assert.ok((await sync.json()).serverTime);
  const item = { urlHash: 'fixture-hash', url: 'https://example.test/sync', title: '同步收藏', description: '', tags: ['测试'], favorite: true, pinned: false, readState: 'unread', notes: '云端往返', status: 'active', deleted: false, updatedAt: Date.now() };
  const pushed = await post('/sync', { since: 0, items: [item] }, token);
  assert.equal(pushed.status, 201);
  assert.equal((await pushed.json()).items.find((x) => x.urlHash === item.urlHash).notes, '云端往返');
  const stale = await post('/sync', { since: 0, items: [{ ...item, title: '过期更新', updatedAt: item.updatedAt - 1000 }] }, token);
  assert.equal((await stale.json()).items.find((x) => x.urlHash === item.urlHash).title, '同步收藏');
  const removed = await post('/sync', { since: 0, items: [{ ...item, deleted: true, updatedAt: item.updatedAt + 10 }] }, token);
  assert.equal((await removed.json()).items.find((x) => x.urlHash === item.urlHash).deleted, true);
  const other = await (await post('/auth/register', { email: 'other@example.test', password: credentials.password })).json();
  assert.equal((await (await post('/sync', { since: 0, items: [], email }, other.token)).json()).items.length, 0);
  for (const body of [{ since: -1, items: [] }, { since: 'bad', items: [] }, { items: [null] }, { items: [{ ...item, url: 'javascript:alert(1)' }] }, { items: {} }]) {
    assert.equal((await post('/sync', body, token)).status, 400, JSON.stringify(body));
  }
  // Verify old tables remain; no cleanup touched legacy commercial rows.
  const saved = new SQL.Database(readFileSync(dbFile));
  assert.equal(saved.exec('SELECT code FROM activation_codes')[0].values[0][0], 'not-a-real-activation-code');
  const namespaces = saved.exec('SELECT DISTINCT email FROM sync_items')[0].values.flat();
  assert.ok(namespaces.includes('integration@example.test'), 'legacy cloud rows preserved');
  assert.ok(namespaces.some((namespace) => namespace.startsWith('account:')));
  assert.equal((await (await post('/sync', { since: 0, items: [] }, token)).json()).items.some((entry) => entry.urlHash === 'legacy-private-hash'), false, 'unverified email registration cannot claim old cloud data');
  saved.close();
  console.log('PASS: HTTP + SQLite health → account register/login → authenticated per-account sync/LWW/deletion; missing/tampered tokens and malformed data rejected; removed commercial routes 404; legacy table preserved.');
} catch (error) {
  console.error(output); throw error;
} finally {
  if (child.exitCode == null) { child.kill('SIGTERM'); await once(child, 'exit'); }
  rmSync(dir, { recursive: true, force: true });
}
