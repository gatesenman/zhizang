// Local-only integration test. Uses a disposable SQLite DB and generated TEST keys.
// mock payment + console mail only: no real payment or email is performed.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const { verifyLicense } = require('@zhicang/shared');
const root = fileURLToPath(new URL('../', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'zhicang-backend-smoke-'));
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const reservation = createServer();
reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
const port = reservation.address().port; await new Promise((done) => reservation.close(done));
const base = `http://127.0.0.1:${port}/api`;
const child = spawn(process.execPath, [join(root, 'apps/backend/dist/main.js')], {
  cwd: join(root, 'apps/backend'),
  env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DATABASE_URL: '', SQLITE_PATH: join(dir, 'smoke.db'), JWT_SECRET: randomUUID(), LICENSE_PRIVATE_KEY: privateKey, LICENSE_PUBLIC_KEY: publicKey, PUBLIC_BASE_URL: `http://127.0.0.1:${port}`, PORTAL_URL: 'http://localhost:3002' },
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
  const products = await (await fetch(base + '/products')).json();
  assert.equal(products.length, 3);
  const email = 'integration@example.test';
  const checkoutRes = await post('/payment/checkout', { productId: products[0].id, email });
  assert.equal(checkoutRes.status, 201);
  const checkout = await checkoutRes.json();
  assert.equal(checkout.provider, 'mock');
  const confirm = await post('/payment/mock/confirm', { orderId: checkout.orderId });
  assert.equal(confirm.status, 302);
  const order = await (await fetch(base + '/payment/order/' + checkout.orderId)).json();
  assert.equal(order.status, 'paid'); assert.ok(order.code);
  await post('/payment/mock/confirm', { orderId: checkout.orderId });
  const repeated = await (await fetch(base + '/payment/order/' + checkout.orderId)).json();
  assert.equal(order.code, repeated.code);
  const activationRes = await post('/license/activate', { email, code: order.code, deviceId: 'test-device-one' });
  assert.equal(activationRes.status, 201);
  const activation = await activationRes.json();
  const token = activation.token;
  assert.equal(verifyLicense(token, publicKey).sub, email);
  const client = spawnSync(require('electron'), [join(root, 'scripts/desktop-cloud-smoke.cjs')], {
    cwd: root, encoding: 'utf8', timeout: 45000,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', TS_NODE_PROJECT: join(root, 'apps/desktop/tsconfig.test.json'), ZHICANG_LICENSE_PUBLIC_KEY: publicKey, ZHICANG_TEST_SERVER: `http://127.0.0.1:${port}`, ZHICANG_TEST_CODE: order.code },
  });
  if (client.stdout) process.stdout.write(client.stdout);
  if (client.stderr) process.stderr.write(client.stderr);
  assert.equal(client.status, 0, 'Actual desktop activation/sync client must pass');
  const wrongEmail = await post('/license/activate', { email: 'other@example.test', code: order.code, deviceId: 'test-device-two' });
  assert.equal(wrongEmail.status, 400);
  assert.equal((await post('/sync', { since: 0, items: [] })).status, 401);
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
  assert.equal((await post('/sync', { since: 0, items: [] }, token + 'tampered')).status, 401);
  assert.ok(output.includes('[邮件:console]'));
  assert.ok(readFileSync(join(dir, 'smoke.db')).subarray(0, 16).toString().startsWith('SQLite format 3'));
  console.log('PASS: real HTTP + SQLite health/products → MOCK checkout/fulfillment/idempotency → signed activation → authenticated sync push/pull/LWW/deletion. Console mail only. No live payment/email tested.');
} catch (error) {
  console.error(output); throw error;
} finally {
  if (child.exitCode == null) { child.kill('SIGTERM'); await once(child, 'exit'); }
  rmSync(dir, { recursive: true, force: true });
}
