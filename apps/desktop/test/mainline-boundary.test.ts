import { runInNewContext } from 'node:vm';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initDb, getDb, createBookmark, queryBookmarks, updateBookmark, getBookmark, setSnapshot, getSnapshot } from '../src/main/db';
import { saveFullBackup, restoreFullBackup } from '../src/main/backup';
import { exportJson, importJson } from '../src/main/import-export';
import { startBridge, stopBridge } from '../src/main/bridge';
import { captureBookmark } from '../src/main/capture';
const dir = mkdtempSync(join(tmpdir(), 'zhicang-mainline-boundary-'));
const live = join(dir, 'live.db'); initDb(live);
after(async () => { await stopBridge(); if (getDb().open) getDb().close(); rmSync(dir, { recursive: true, force: true }); });

test('5000 条真实实库：筛选分页/JSON跨库往返/笔记检索/整库快照', async () => {
  getDb().transaction(() => { for (let i = 0; i < 5000; i++) createBookmark({ url: 'https://scale.example.test/Case/' + i, title: '主线规模资料 ' + i }); })();
  assert.equal(queryBookmarks({ domain: 'scale.example.test' }).total, 5000);
  assert.equal(queryBookmarks({ offset: 4950, limit: 50 }).items.length, 50);
  const first = queryBookmarks({ limit: 1 }).items[0]; updateBookmark(first.id, { notes: '五千条中可找回的独特笔记' });
  assert.equal(queryBookmarks({ keyword: '独特笔记' }).total, 1);
  const json = exportJson(); const backup = join(dir, 'scale.zhicang'); await saveFullBackup(backup);
  getDb().close(); initDb(join(dir, 'roundtrip.db'));
  importJson(json); assert.equal(queryBookmarks({ domain: 'scale.example.test' }).total, 5000);
  assert.equal(queryBookmarks({ keyword: '独特笔记' }).total, 1);
  getDb().close(); initDb(live);
});

test('损坏/截断备份拒绝且当前库不变；替换中途写失败后真实安全副本回滚', async () => {
  const first = queryBookmarks({ limit: 1 }).items[0];
  const original = join(dir, 'original.zhicang'); await saveFullBackup(original);
  updateBookmark(first.id, { notes: '恢复前必须保留的最新内容' });
  for (const [name, data] of [['invalid.zhicang', Buffer.from('not SQLite')], ['truncated.zhicang', readFileSync(original).subarray(0, 100)] ] as const) {
    const file = join(dir, name); writeFileSync(file, data);
    await assert.rejects(() => restoreFullBackup(file));
    assert.equal(getBookmark(first.id)?.notes, '恢复前必须保留的最新内容');
  }
  await assert.rejects(() => restoreFullBackup(original, (_source, dest) => { writeFileSync(dest, 'PARTIAL FAILED WRITE'); throw new Error('故障注入：替换写入失败'); }), /故障注入/);
  assert.equal(getDb().open, false); initDb(live);
  assert.equal(getBookmark(first.id)?.notes, '恢复前必须保留的最新内容');
  assert.equal(queryBookmarks({ domain: 'scale.example.test' }).total, 5000);
});

test('真实 MCP stdio → SDK → 鉴权桥接 → SQLite/离线内容；断线与端口/令牌切换', async () => {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
  const clients: InstanceType<typeof Client>[] = [];
  const handlers = {
    addBookmark: async (input: any) => { const r = captureBookmark(input); if (r.trashed) throw new Error('该网址在回收站，请先恢复'); return { id: r.bookmark.id, title: r.bookmark.title, created: r.created }; },
    addBatch: async () => ({ created: 0, skipped: 0 }), search: (q: string, limit: number) => queryBookmarks({ keyword: q, limit }).items,
    getContent: async (id: number) => { const b = getBookmark(id); return b ? { title: b.title, content: getSnapshot(id)?.content ?? '' } : null; },
    recent: (limit: number) => queryBookmarks({ limit }).items,
  };
  async function client(port: number, token: string) {
    const c = new Client({ name: 'zhicang-real-e2e', version: 'test' }); clients.push(c);
    await c.connect(new StdioClientTransport({ command: process.execPath, args: [join(__dirname, '../../mcp/src/index.js')], env: { ...Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined)) as Record<string,string>, ELECTRON_RUN_AS_NODE: '1', ZHICANG_BRIDGE_URL: 'http://127.0.0.1:' + port, ZHICANG_BRIDGE_TOKEN: token }, stderr: 'pipe' }));
    return c;
  }
  try {
    await startBridge(handlers, { name: 'test', version: 'test' }, 38211, { token: 'test-old-token' });
    const c = await client(38211, 'test-old-token');
    assert.equal((await c.listTools()).tools.length, 4);
    const result: any = await c.callTool({ name: 'add_bookmark', arguments: { url: 'https://mcp.example.test/mainline', title: 'MCP 主线真实收藏' } });
    assert.ok(!result.isError); assert.match(result.content[0].text, /已收藏/);
    const search: any = await c.callTool({ name: 'search_bookmarks', arguments: { query: 'MCP 主线真实' } });
    const b = JSON.parse(search.content[0].text)[0]; assert.ok(b.id);
    setSnapshot(b.id, '<p>MCP 真实离线内容</p>');
    const content: any = await c.callTool({ name: 'get_bookmark_content', arguments: { id: b.id } }); assert.match(content.content[0].text, /真实离线内容/);
    const duplicate: any = await c.callTool({ name: 'add_bookmark', arguments: { url: b.url } }); assert.match(duplicate.content[0].text, /该网址已收藏/);
    const bad = await client(38211, 'wrong-test-token'); const denied: any = await bad.callTool({ name: 'list_recent', arguments: {} }); assert.equal(denied.isError, true); assert.match(denied.content[0].text, /401/);
    await stopBridge(); const offline: any = await c.callTool({ name: 'list_recent', arguments: {} }); assert.equal(offline.isError, true);
    await startBridge(handlers, { name: 'test', version: 'test' }, 38212, { token: 'test-new-token' });
    const moved = await client(38212, 'test-new-token'); const recent: any = await moved.callTool({ name: 'list_recent', arguments: {} }); assert.ok(!recent.isError);
    const oldToken = await client(38212, 'test-old-token'); const rejected: any = await oldToken.callTool({ name: 'list_recent', arguments: {} }); assert.equal(rejected.isError, true);
  } finally { for (const c of clients) await c.close(); await stopBridge(); }
});

// No browser or GUI is driven: only chrome.storage is a test fixture. HTTP bridge and SQLite are real.
test('扩展原始传输脚本 → 真实桥接/SQLite：鉴权、收藏、重复、批量、断线和端口切换', async () => {
  let port = 38213; let token = 'extension-test-original';
  const handlers = {
    addBookmark: async (input: any) => { const r = captureBookmark(input); return { id: r.bookmark.id, title: r.bookmark.title, created: r.created }; },
    addBatch: async (urls: string[]) => { let created = 0; for (const url of urls) if (captureBookmark({ url }).created) created++; return { created, skipped: urls.length - created }; },
    search: (q: string, limit: number) => queryBookmarks({ keyword: q, limit }).items,
    getContent: async () => null, recent: (limit: number) => queryBookmarks({ limit }).items,
  };
  const context: any = { fetch, AbortSignal, chrome: { storage: { local: { get: (_keys: string[], cb: (x: any) => void) => cb({ bridgePort: port, bridgeToken: token }) } } } };
  runInNewContext(readFileSync(join(__dirname, '../../extension/common.js'), 'utf8') + '\nglobalThis.transport = { ping, capture, captureBatch };', context);
  const transport = context.transport;
  try {
    await startBridge(handlers, { name: 'extension-test', version: 'test' }, port, { token });
    assert.equal((await transport.ping()).ok, true);
    const input = { url: 'https://extension.example.test/CaseSensitive', title: '扩展传输真实收藏' };
    const first = await transport.capture(input); assert.equal(first.created, true);
    assert.equal(getBookmark(first.id)?.title, input.title);
    assert.equal((await transport.capture(input)).created, false);
    const batch = await transport.captureBatch([input.url, 'https://extension.example.test/Second']);
    assert.equal(batch.created, 1); assert.equal(batch.skipped, 1);
    token = 'extension-test-wrong';
    await assert.rejects(() => transport.ping(), /令牌无效/);
    await assert.rejects(() => transport.capture(input), /令牌无效/);
    await stopBridge(); await assert.rejects(() => transport.ping());
    port = 38214; await startBridge(handlers, { name: 'extension-test', version: 'test' }, port, { token: 'extension-test-new' });
    await assert.rejects(() => transport.ping(), /令牌无效/);
    token = 'extension-test-new'; assert.equal((await transport.ping()).ok, true);
    assert.equal((await transport.capture(input)).created, false);
  } finally { await stopBridge(); }
});
