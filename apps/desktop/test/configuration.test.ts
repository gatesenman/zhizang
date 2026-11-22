import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { normalizeApiBase, validateLlmConfig } from '../src/main/service-url';
import { updatePolicy } from '../src/main/update-policy';
import { aiChat } from '../src/main/enrich';
const cfg = { enabled: true, provider: 'custom', baseUrl: '', apiKey: 'fixture-not-a-real-key', model: 'fixture', temperature: 0.3, concurrency: 1 };
test('服务地址修复 /api 前缀，不重复追加并拒绝危险地址', () => {
  assert.equal(normalizeApiBase('http://localhost:3001'), 'http://localhost:3001/api');
  assert.equal(normalizeApiBase('https://server.test/api/'), 'https://server.test/api');
  assert.throws(() => normalizeApiBase('file:///tmp/x'));
  assert.throws(() => normalizeApiBase('https://user:secret@server.test/api'));
  assert.throws(() => validateLlmConfig({ ...cfg, baseUrl: 'file:///tmp/x' }));
});
test('更新默认明确停用；启用必须配置 HTTPS 或回环开发源', () => {
  assert.equal(updatePolicy(null, null).enabled, false);
  assert.ok(updatePolicy(null, null).reason);
  assert.equal(updatePolicy('1', '').enabled, false);
  assert.equal(updatePolicy('1', 'http://public.test/feed').enabled, false);
  assert.equal(updatePolicy('1', 'https://updates.test/feed/').url, 'https://updates.test/feed');
  assert.equal(updatePolicy('1', 'http://127.0.0.1:38122').enabled, true);
});
test('真实 HTTP 模型协议：成功/401/空内容/无效 JSON 均如实处理（仅本地夹具）', async () => {
  let mode = 'ok';
  const server = http.createServer((_req, res) => {
    if (mode === '401') { res.writeHead(401); res.end('invalid fixture key'); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(mode === 'invalid' ? 'not-json' : JSON.stringify({ choices: [{ message: { content: mode === 'empty' ? '' : 'OK' } }] }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port;
  const config = { ...cfg, baseUrl: `http://127.0.0.1:${port}/v1` };
  try {
    assert.equal(await aiChat(config, [{ role: 'user', content: 'test' }], fetch), 'OK');
    mode = '401'; await assert.rejects(() => aiChat(config, [], fetch), /401/);
    mode = 'empty'; await assert.rejects(() => aiChat(config, [], fetch), /空内容/);
    mode = 'invalid'; await assert.rejects(() => aiChat(config, [], fetch));
  } finally { await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeIdleConnections(); }); }
});
