import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startBridge, stopBridge, extractUrls, BridgeHandlers } from '../src/main/bridge';

const PORT = 38199;
const TOKEN = 'test-token-abc123';

const handlers: BridgeHandlers = {
  addBookmark: async () => ({ id: 1, created: true, title: 't' }),
  addBatch: async () => ({ created: 0, skipped: 0 }),
  search: () => [],
  getContent: async () => null,
  recent: () => [],
};

// 原生 http.request：可设置 fetch 禁止覆盖的 Host 头
function call(opts: {
  path: string;
  method?: string;
  host?: string;
  origin?: string;
  token?: string;
  tokenHeader?: 'bearer' | 'x';
}): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (opts.host !== undefined) headers['Host'] = opts.host;
    if (opts.origin) headers['Origin'] = opts.origin;
    if (opts.token) {
      if (opts.tokenHeader === 'bearer') headers['Authorization'] = `Bearer ${opts.token}`;
      else headers['X-Zhicang-Token'] = opts.token;
    }
    const req = http.request(
      { hostname: '127.0.0.1', port: PORT, path: opts.path, method: opts.method || 'GET', headers },
      (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve({ status: res.statusCode || 0 }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

before(async () => {
  await startBridge(handlers, { name: 'ZhiCang', version: '0.0.0-test' }, PORT, { token: TOKEN });
});

after(() => stopBridge());

test('extractUrls 提取并去重 URL', () => {
  const urls = extractUrls('see https://a.com/x, and https://a.com/x and http://b.io)');
  assert.deepEqual(urls.sort(), ['http://b.io', 'https://a.com/x']);
});

test('/api/ping 免令牌可访问 -> 200', async () => {
  assert.equal((await call({ path: '/api/ping' })).status, 200);
});

test('非 ping 路由缺令牌 -> 401', async () => {
  assert.equal((await call({ path: '/api/recent' })).status, 401);
});

test('正确令牌（X-Zhicang-Token）-> 200', async () => {
  assert.equal((await call({ path: '/api/recent', token: TOKEN })).status, 200);
});

test('正确令牌（Bearer）-> 200', async () => {
  assert.equal((await call({ path: '/api/recent', token: TOKEN, tokenHeader: 'bearer' })).status, 200);
});

test('错误令牌 -> 401', async () => {
  assert.equal((await call({ path: '/api/recent', token: 'wrong' })).status, 401);
});

test('非法 Host（DNS-rebinding）-> 403', async () => {
  assert.equal((await call({ path: '/api/ping', host: 'evil.example.com', token: TOKEN })).status, 403);
});

test('合法 Host 127.0.0.1:port -> 通过', async () => {
  assert.equal((await call({ path: '/api/ping', host: `127.0.0.1:${PORT}` })).status, 200);
});

test('网页来源 Origin -> 403', async () => {
  assert.equal((await call({ path: '/api/recent', origin: 'https://evil.com', token: TOKEN })).status, 403);
});

test('扩展来源 Origin（chrome-extension://）-> 200', async () => {
  assert.equal(
    (await call({ path: '/api/recent', origin: 'chrome-extension://abcdef', token: TOKEN })).status,
    200,
  );
});
