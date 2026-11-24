import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicWebUrl, fetchPublicWeb, readLimitedText, readLimitedBytes } from '../src/main/public-web-fetch';
import { fetchSiteMeta } from '../src/main/enrich';
import { assertTrustedIpc } from '../src/main/ipc-trust';
const publicDns = async () => [{ address: '93.184.216.34', family: 4 }];

test('R8 automatic fetch rejects private, obfuscated, reserved and mixed DNS targets without blocking explicit AI configuration', async () => {
  for (const url of ['http://127.0.0.1', 'http://2130706433', 'http://0x7f000001', 'http://169.254.169.254/latest/meta-data', 'http://10.0.0.1', 'http://100.64.0.1', 'http://[::1]', 'http://[::ffff:127.0.0.1]', 'http://[fc00::1]', 'http://localhost.', 'file:///etc/passwd', 'https://user:pass@public.example.test']) await assert.rejects(assertPublicWebUrl(url, publicDns));
  await assert.rejects(assertPublicWebUrl('https://mixed.example.test', async () => [{ address: '8.8.8.8', family: 4 }, { address: '192.168.1.1', family: 4 }]), /内网/);
  await assertPublicWebUrl('https://public.example.test/path', publicDns);
  await assertPublicWebUrl('https://[2606:4700:4700::1111]/', publicDns);
});
test('R8 each redirect is revalidated; public fetch strips ambient credentials and never forwards a private redirect', async () => {
  let calls = 0;
  await assert.rejects(fetchPublicWeb('https://public.example.test/', { headers: { Authorization: 'fixture-only', Cookie: 'fixture-only', 'X-Api-Key': 'fixture-only' } }, async (_url, init) => {
    calls++; const headers = new Headers(init?.headers);
    assert.equal(headers.get('authorization'), null); assert.equal(headers.get('cookie'), null); assert.equal(headers.get('x-api-key'), null);
    assert.equal(init?.credentials, 'omit'); assert.equal(init?.redirect, 'manual');
    return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } });
  }, publicDns), /内网|保留/);
  assert.equal(calls, 1);
  await assert.rejects(fetchPublicWeb('https://public.example.test/', { method: 'POST', body: 'must not transmit' }, async () => { throw new Error('not called'); }, publicDns), /GET\/HEAD/);
});
test('R8 streamed bodies enforce byte limits even when content-length is missing or lies', async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(6)); controller.enqueue(new Uint8Array(6)); }, cancel() { cancelled = true; } });
  await assert.rejects(readLimitedBytes(new Response(stream), 10), /大小限制/); assert.equal(cancelled, true);
  await assert.rejects(readLimitedText(new Response('ok', { headers: { 'content-length': '100' } }), 10), /大小限制/);
  assert.equal(await readLimitedText(new Response('small'), 10), 'small');
});
test('R8 IPC requires the actual main window/main frame plus exact app URL, not just an allowed protocol', () => {
  const sender = {}; const frame = { url: 'file:///app/renderer/index.html#notes' }; const url = 'file:///app/renderer/index.html';
  assertTrustedIpc({ sender, senderFrame: frame }, sender, frame, url);
  assert.throws(() => assertTrustedIpc({ sender: {}, senderFrame: frame }, sender, frame, url));
  assert.throws(() => assertTrustedIpc({ sender, senderFrame: { url } }, sender, frame, url));
  assert.throws(() => assertTrustedIpc({ sender, senderFrame: null }, sender, frame, url));
  frame.url = 'https://untrusted.example.test/'; assert.throws(() => assertTrustedIpc({ sender, senderFrame: frame }, sender, frame, url));
});

test('R8 every registered IPC uses the trust wrapper and offline reader makes no remote image requests', () => {
  const source = readFileSync(join(__dirname, '../src/main/index.ts'), 'utf8');
  assert.equal((source.match(/ipcMain\.handle\(/g) ?? []).length, 1);
  assert.match(source, /assertTrustedIpc\(event/);
  const reader = readFileSync(join(__dirname, '../src/renderer/src/components/WebPreview.tsx'), 'utf8');
  assert.match(reader, /sandbox=""/); assert.match(reader, /img-src data:;/); assert.ok(!reader.includes('img-src data: https:'));
});

test('R8 metadata cannot introduce new private-network image URLs; aborted DNS never reaches transport', async () => {
  const result = await fetchSiteMeta('https://public.example.test/', async () => new Response('<html><head><meta property="og:image" content="http://10.0.0.1/private"><link rel="icon" href="http://127.0.0.1/favicon.ico"></head><body>public</body></html>', { headers: { 'content-type': 'text/html' } }), (url) => assertPublicWebUrl(url, publicDns));
  assert.equal(result.image, ''); assert.equal(result.favicon, '');
  const controller = new AbortController(); let calls = 0;
  const pending = fetchPublicWeb('https://public.example.test/', { signal: controller.signal }, async () => { calls++; return new Response(); }, () => new Promise(() => undefined));
  controller.abort(); await assert.rejects(pending); assert.equal(calls, 0);
});
