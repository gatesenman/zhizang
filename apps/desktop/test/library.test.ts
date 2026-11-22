import { detectInitialLang } from '../src/renderer/src/i18n';
import { metadataPatch, mayReplaceDescription } from '../src/main/enrichment-policy';
import { captureBookmark } from '../src/main/capture';
import { NoteDraft, noteDraftKey } from '../src/renderer/src/note-draft';
import { normalizeCaptureUrl, mergeSmartQuery, bookmarkMarkdown, filterChips } from '../src/renderer/src/workflow';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { saveFullBackup, restoreFullBackup } from '../src/main/backup';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initDb, getDb, createBookmark, updateBookmark, queryBookmarks, getBookmark,
  listCategories, createCategory, categoryCounts, moveCategory, trashBookmarks,
  restoreBookmarks, purgeTrashedBookmarks, setSnapshot, getSnapshot, recordVisit,
  saveBookmarkNotes, moveBookmarks, tagCounts,
  createSmartFolder, listSmartFolders, hashUrl, getSetting, setSetting, applyRemote } from '../src/main/db';
import { askBookmarks, questionTerms, hasValidCitations } from '../src/main/assistant';
import { importJson, exportJson, importCsv } from '../src/main/import-export';
import { startBridge, stopBridge } from '../src/main/bridge';
import type { LlmConfig } from '@zhicang/shared';
const folder = mkdtempSync(join(tmpdir(), 'zhicang-test-'));
const path = join(folder, 'library.db');
const config: LlmConfig = { enabled: false, provider: 'custom', baseUrl: '', apiKey: '', model: '', temperature: 0.3, concurrency: 1 };
before(() => { initDb(path); });
after(() => { getDb().close(); rmSync(folder, { recursive: true, force: true }); });

test('真实 SQLite：新增 → 去重 → 中文/笔记/标签检索 → 编辑', () => {
  const b = createBookmark({ url: 'https://example.test/design', title: '现代界面设计系统指南', tags: ['交互设计'] });
  assert.throws(() => createBookmark({ url: b.url }), /已收藏/);
  updateBookmark(b.id, { notes: '项目验收记事', description: '100% 完整_版', favorite: true });
  for (const keyword of ['设计系统', '验收', '交互', '100%', '完整_版']) {
    assert.ok(queryBookmarks({ keyword }).items.some((x) => x.id === b.id), keyword);
  }
  assert.equal(queryBookmarks({ keyword: '界面 不存在词' }).total, 0);
  assert.equal(queryBookmarks({ keyword: '%' }).total, 1);
  assert.doesNotThrow(() => queryBookmarks({ keyword: '"* : OR ()' }));
  assert.equal(queryBookmarks({ favorite: true }).items[0].id, b.id);
  assert.throws(() => createBookmark({ url: 'javascript:alert(1)' }), /HTTP/);
});

test('分类：未分类含 NULL，父目录包含子孙，禁止循环移动', () => {
  const uncategorized = listCategories().find((x) => x.isSystem)!;
  assert.ok(queryBookmarks({ categoryId: uncategorized.id }).total >= 1);
  assert.ok(categoryCounts()[uncategorized.id] >= 1);
  const parent = createCategory('工作', null);
  const child = createCategory('参考', parent.id);
  const b = createBookmark({ url: 'https://example.test/work', categoryId: child.id });
  assert.ok(queryBookmarks({ categoryId: parent.id }).items.some((x) => x.id === b.id));
  assert.throws(() => moveCategory(parent.id, child.id, 0), /子分类/);
});

test('回收站：只永久删除指定项，不清空其他项，拒绝直接硬删正常收藏', () => {
  const a = createBookmark({ url: 'https://example.test/trash-a' });
  const b = createBookmark({ url: 'https://example.test/trash-b' });
  const c = createBookmark({ url: 'https://example.test/keep' });
  setSnapshot(a.id, '<article>离线正文</article>');
  trashBookmarks([a.id, b.id]);
  assert.equal(queryBookmarks({ keyword: 'trash-a' }).total, 0);
  assert.throws(() => purgeTrashedBookmarks([a.id, c.id]), /回收站/);
  assert.ok(getBookmark(a.id));
  purgeTrashedBookmarks([a.id]);
  assert.equal(getBookmark(a.id), null);
  assert.equal(getSnapshot(a.id), null);
  assert.ok(getBookmark(b.id)?.deletedAt);
  restoreBookmarks([b.id]);
  assert.equal(getBookmark(b.id)?.deletedAt, null);
});

test('无 Key 助手：中文自然问法命中真实引用，无命中不得冒充最近收藏', async () => {
  assert.deepEqual(questionTerms('帮我找一些关于设计系统的收藏'), ['设计系统']);
  const r = await askBookmarks('帮我找一些关于设计系统的收藏', config);
  assert.equal(r.mode, 'keyword');
  assert.ok(r.refs.some((x) => x.url === 'https://example.test/design'));
  const empty = await askBookmarks('木星探测器资料', config);
  assert.equal(empty.refs.length, 0);
  assert.match(empty.answer, /没有找到/);
  await assert.rejects(() => askBookmarks('', config), /请输入/);
});

test('真实持久化：重开数据库保留笔记、访问、离线存档、智能目录', () => {
  const b = createBookmark({ url: 'https://example.test/persist', title: '持久化验证' });
  updateBookmark(b.id, { notes: '重启后仍存在', pinned: true });
  recordVisit(b.id);
  setSnapshot(b.id, '<article>断网正文</article>');
  createSmartFolder('已读内容', { readState: 'read' });
  getDb().close(); initDb(path);
  assert.equal(getBookmark(b.id)?.notes, '重启后仍存在');
  assert.equal(getBookmark(b.id)?.visitCount, 1);
  assert.ok(getBookmark(b.id)?.pinned);
  assert.match(getSnapshot(b.id)!.content, /断网正文/);
  assert.ok(listSmartFolders().some((x) => x.name === '已读内容'));
});

test('CSV/JSON 导入导出走真实数据库，重复导入不生成副本', () => {
  const result = importCsv('url,title,tags\nhttps://example.test/csv,"逗号,标题",前端|参考');
  assert.equal(result.imported, 1);
  assert.equal(queryBookmarks({ keyword: '逗号' }).items[0].tags.length, 2);
  const backup = exportJson();
  const again = importJson(backup);
  assert.equal(again.imported, 0);
  assert.ok(again.skipped > 0);
});


test('JSON 跨库恢复保留层级、同名子分类、笔记、星标和阅读状态', () => {
  const first = createCategory('项目甲', null);
  const second = createCategory('项目乙', null);
  const subA = createCategory('共享名称', first.id);
  const subB = createCategory('共享名称', second.id);
  const a = createBookmark({ url: 'https://example.test/backup-a', categoryId: subA.id });
  createBookmark({ url: 'https://example.test/backup-b', categoryId: subB.id });
  updateBookmark(a.id, { notes: '跨库笔记', favorite: true, pinned: true, readState: 'read' });
  const json = exportJson();
  getDb().close(); initDb(join(folder, 'restored.db'));
  try {
    assert.ok(importJson(json).imported > 0);
    const restored = queryBookmarks({ keyword: '跨库笔记' }).items[0];
    assert.equal(restored.notes, '跨库笔记');
    assert.ok(restored.favorite && restored.pinned);
    assert.equal(restored.readState, 'read');
    const cats = listCategories();
    const children = cats.filter((x) => x.name === '共享名称');
    assert.equal(children.length, 2);
    assert.notEqual(children[0].parentId, children[1].parentId);
    const before = cats.length;
    assert.throws(() => importJson(JSON.stringify({ categories: [{ id: 1, name: '循环', parentId: 1 }], bookmarks: [] })), /循环/);
    assert.equal(listCategories().length, before);
    assert.throws(() => importJson('{}'), /格式/);
  } finally { getDb().close(); initDb(path); }
});


test('本地 HTTP 桥接 → 真实入库 → 中文搜索 → 离线内容读取', async () => {
  const port = 38201;
  await startBridge({
    addBookmark: async (input) => { const b = createBookmark(input); return { id: b.id, title: b.title, created: true }; },
    addBatch: async () => ({ created: 0, skipped: 0 }),
    search: (q, limit) => queryBookmarks({ keyword: q, limit }).items,
    getContent: async (id) => { const b = getBookmark(id); return b ? { title: b.title, content: getSnapshot(id)?.content ?? '' } : null; },
    recent: (limit) => queryBookmarks({ limit }).items,
  }, { name: 'ZhiCang-test', version: 'test' }, port, { token: 'local-test-token' });
  try {
    const base = `http://127.0.0.1:${port}`;
    const headers = { 'Content-Type': 'application/json', 'X-Zhicang-Token': 'local-test-token' };
    assert.equal((await fetch(base + '/api/search?q=test')).status, 401);
    const response = await fetch(base + '/api/capture', { method: 'POST', headers, body: JSON.stringify({ url: 'https://example.test/bridge-real', title: '浏览器剪藏联调验证' }) });
    assert.equal(response.status, 200);
    const created: any = await response.json();
    assert.equal(getBookmark(created.id)?.title, '浏览器剪藏联调验证');
    setSnapshot(created.id, '<article>离线剪藏</article>');
    const search: any = await (await fetch(base + '/api/search?q=' + encodeURIComponent('剪藏联调'), { headers })).json();
    assert.equal(search.items[0].id, created.id);
    const content: any = await (await fetch(base + `/api/bookmark/${created.id}/content`, { headers })).json();
    assert.match(content.content, /离线剪藏/);
    // Run the exact extension communication script, stubbing only browser storage.
    // Network, auth, handlers and SQLite remain real (no browser UI automation).
    let extensionToken = 'local-test-token';
    const sdk: any = runInNewContext(readFileSync(join(__dirname, '../../extension/common.js'), 'utf8') + '\n;({ ping, capture })', {
      chrome: { storage: { local: { get: (_keys: string[], cb: (x: unknown) => void) => cb({ bridgePort: port, bridgeToken: extensionToken }) } } }, fetch, AbortSignal,
    });
    assert.equal((await sdk.ping()).ok, true);
    extensionToken = 'wrong-token'; await assert.rejects(() => sdk.ping(), /令牌无效/);
    extensionToken = ''; await assert.rejects(() => sdk.ping(), /填写桌面访问令牌/);
    extensionToken = 'local-test-token';
    const sdkCreated = await sdk.capture({ url: 'https://example.test/extension-script-real', title: '扩展真实脚本剪藏' });
    assert.equal(getBookmark(sdkCreated.id)?.title, '扩展真实脚本剪藏');
  } finally { await stopBridge(); }
});


test('URL 去重保留路径/查询大小写，旧库迁移不丢记录并兼容旧云哈希', () => {
  assert.equal(hashUrl('HTTPS://EXAMPLE.test/Path?q=A'), hashUrl('https://example.test/Path?q=A'));
  assert.notEqual(hashUrl('https://example.test/Path?q=A'), hashUrl('https://example.test/path?q=A'));
  assert.notEqual(hashUrl('https://example.test/Path?q=A'), hashUrl('https://example.test/Path?q=a'));
  const url = 'https://example.test/CaseSensitive?Key=VALUE';
  const b = createBookmark({ url, title: '旧数据', tags: ['迁移'] });
  const legacy = createHash('sha1').update(url.toLowerCase()).digest('hex');
  getDb().prepare('UPDATE bookmarks SET url_hash=? WHERE id=?').run(legacy, b.id);
  setSetting('url_hash_version', '1'); getDb().close(); initDb(path);
  assert.equal((getDb().prepare('SELECT url_hash FROM bookmarks WHERE id=?').get(b.id) as any).url_hash, hashUrl(url));
  assert.deepEqual(getBookmark(b.id)?.tags, ['迁移']);
  const sibling = createBookmark({ url: 'https://example.test/casesensitive?Key=VALUE' });
  assert.notEqual(b.id, sibling.id);
  const original = getBookmark(b.id)!;
  applyRemote([{ ...original, urlHash: legacy, title: '云端新版本', updatedAt: original.updatedAt + 100, deleted: false }]);
  assert.equal(getBookmark(b.id)?.title, '云端新版本');
  assert.equal(queryBookmarks({ keyword: 'CaseSensitive?Key=VALUE' }).items.filter((x) => x.url === url).length, 1);
});

test('完整备份恢复含离线正文/设置/智能目录，并保留恢复前安全副本', async () => {
  const b = createBookmark({ url: 'https://example.test/full-backup', title: '备份前标题' });
  setSnapshot(b.id, '<article>完整离线正文</article>');
  setSetting('fixture-preference', 'before');
  const file = join(folder, 'full.zhicang');
  await saveFullBackup(file);
  updateBookmark(b.id, { title: '恢复前修改' }); setSetting('fixture-preference', 'after');
  const result = await restoreFullBackup(file);
  initDb(path);
  assert.equal(getBookmark(b.id)?.title, '备份前标题');
  assert.equal(getSetting('fixture-preference'), 'before');
  assert.match(getSnapshot(b.id)!.content, /完整离线正文/);
  assert.ok(listSmartFolders().some((x) => x.name === '已读内容'));
  const safety = new Database(result.safetyBackup, { readonly: true });
  assert.equal((safety.prepare('SELECT title FROM bookmarks WHERE id=?').get(b.id) as any).title, '恢复前修改'); safety.close();
  const invalid = new Database(join(folder, 'not-zhicang.db')); invalid.exec('CREATE TABLE other (id INTEGER)'); invalid.close();
  await assert.rejects(() => restoreFullBackup(join(folder, 'not-zhicang.db')), /不是智藏/);
  assert.ok(getDb().open);
});

test('配置与本地进入状态真实持久化，重开后仍存在', () => {
  setSetting('local_mode', '1'); setSetting('onboarded', '1');
  setSetting('update_enabled', '0'); setSetting('bridgePort', '38122');
  setSetting('llm', JSON.stringify({ ...config, model: 'fixture-model', apiKey: '' }));
  getDb().close(); initDb(path);
  assert.equal(getSetting('local_mode'), '1'); assert.equal(getSetting('onboarded'), '1');
  assert.equal(getSetting('bridgePort'), '38122'); assert.equal(getSetting('update_enabled'), '0');
  assert.equal(JSON.parse(getSetting('llm')!).model, 'fixture-model');
});


test('快速收藏：重复不覆盖，回收站需显式恢复且保留原笔记/标签/富化状态', () => {
  const url = 'https://example.test/product-explicit-restore';
  const first = captureBookmark({ url, title: '原始标题', tags: ['手动标签'] });
  assert.equal(first.created, true);
  updateBookmark(first.bookmark.id, { notes: '不可覆盖的笔记', aiState: 'done' });
  const duplicate = captureBookmark({ url, title: '不应覆盖', tags: ['别的标签'] });
  assert.equal(duplicate.duplicate, true); assert.equal(duplicate.bookmark.title, '原始标题');
  trashBookmarks([first.bookmark.id]);
  const trashed = captureBookmark({ url });
  assert.equal(trashed.trashed, true); assert.ok(getBookmark(first.bookmark.id)?.deletedAt);
  assert.throws(() => createBookmark({ url }), /回收站/);
  const restored = captureBookmark({ url, restoreTrashed: true });
  assert.equal(restored.restored, true); assert.equal(restored.created, false);
  assert.equal(restored.bookmark.notes, '不可覆盖的笔记'); assert.equal(restored.bookmark.aiState, 'done');
  assert.deepEqual(restored.bookmark.tags, ['手动标签']);
});

test('待整理收件箱：NULL/系统默认归类、批量整理、定位查询与回收站隔离', () => {
  const a = createBookmark({ url: 'https://example.test/inbox-a' });
  const b = createBookmark({ url: 'https://example.test/inbox-b' });
  const category = createCategory('待整理验收去向', null);
  assert.ok(queryBookmarks({ uncategorized: true, ids: [a.id, b.id] }).total === 2);
  moveBookmarks([a.id, b.id], category.id);
  assert.equal(queryBookmarks({ uncategorized: true, ids: [a.id, b.id] }).total, 0);
  assert.equal(queryBookmarks({ categoryId: category.id, ids: [a.id, b.id] }).total, 2);
  trashBookmarks([b.id]);
  assert.equal(queryBookmarks({ ids: [b.id] }).total, 0);
  assert.equal(queryBookmarks({ ids: [b.id], trashed: true }).total, 1);
  assert.equal(queryBookmarks({ ids: [] }).total, 0);
});

test('原子笔记保存：新旧版本冲突不覆盖，FTS/中文检索即时更新，回收站拒绝写入', () => {
  const b = createBookmark({ url: 'https://example.test/atomic-notes' });
  assert.equal(saveBookmarkNotes(b.id, '主线复用检索', '').conflict, false);
  assert.equal(saveBookmarkNotes(b.id, '迟到的旧稿', '').conflict, true);
  assert.equal(getBookmark(b.id)?.notes, '主线复用检索');
  assert.ok(queryBookmarks({ keyword: '复用检索' }).items.some((x) => x.id === b.id));
  trashBookmarks([b.id]); assert.throws(() => saveBookmarkNotes(b.id, '不应写入', '主线复用检索'), /回收站/);
});

function noteStorage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); }, removeItem: (k: string) => { map.delete(k); } };
}
test('笔记真实实库：快速编辑串行保存、切换两收藏不串写、草稿清除', async () => {
  const storage = noteStorage();
  const a = createBookmark({ url: 'https://example.test/draft-a' });
  const b = createBookmark({ url: 'https://example.test/draft-b' });
  let release: (() => void) | undefined;
  let first = true;
  const editorA = new NoteDraft({ bookmark: a, storage, save: async (id, notes, expected) => {
    if (first) { first = false; await new Promise<void>((resolve) => { release = resolve; }); }
    return saveBookmarkNotes(id, notes, expected);
  } });
  const editorB = new NoteDraft({ bookmark: b, storage, save: async (...args) => saveBookmarkNotes(...args) });
  editorA.edit('第一稿'); const pending = editorA.flush(); editorA.edit('最终稿');
  editorB.edit('另一篇独立笔记'); await editorB.flush(); editorA.detach(); release!(); await pending;
  assert.equal(getBookmark(a.id)?.notes, '最终稿'); assert.equal(getBookmark(b.id)?.notes, '另一篇独立笔记');
  assert.equal(editorA.snapshot().status, 'saved'); assert.equal(storage.getItem(noteDraftKey(a)), null);
  editorB.detach();
});

test('笔记断线/重开：失败不冒充已保存，草稿恢复、重试、外部冲突需显式选择', async () => {
  const storage = noteStorage(); const b = createBookmark({ url: 'https://example.test/draft-retry' });
  const failed = new NoteDraft({ bookmark: b, storage, save: async () => { throw new Error('连接已断开'); } });
  failed.edit('需要保留的草稿'); await failed.flush(); assert.equal(failed.snapshot().status, 'error');
  assert.equal(getBookmark(b.id)?.notes, ''); assert.ok(storage.getItem(noteDraftKey(b)));
  const resumed = new NoteDraft({ bookmark: getBookmark(b.id)!, storage, save: async (...args) => saveBookmarkNotes(...args) });
  await resumed.flush(); assert.equal(getBookmark(b.id)?.notes, '需要保留的草稿');
  resumed.edit('我后续写的版本'); saveBookmarkNotes(b.id, '其他编辑器版本', '需要保留的草稿');
  await resumed.flush(); assert.equal(resumed.snapshot().status, 'conflict'); assert.equal(getBookmark(b.id)?.notes, '其他编辑器版本');
  resumed.keepDraft(); await resumed.flush(); assert.equal(getBookmark(b.id)?.notes, '我后续写的版本');
  resumed.edit(''); resumed.edit('我后续写的版本'); await resumed.flush(); assert.equal(resumed.snapshot().status, 'saved');
  resumed.detach();
});

test('主线工具：危险协议/多链接/凭据拒绝；智能筛选真实叠加；Markdown 引用保留笔记', () => {
  assert.equal(normalizeCaptureUrl(' example.com/Case?q=A '), 'https://example.com/Case?q=A');
  for (const input of ['', 'javascript:alert(1)', 'file:///etc/passwd', 'https://a.test https://b.test', 'https://user:pass@example.test']) assert.throws(() => normalizeCaptureUrl(input));
  const q = mergeSmartQuery({ keyword: '设计', tags: ['规则'], status: 'active' }, { keyword: '系统', tags: ['手动'], domain: 'example.test' });
  assert.equal(q.keyword, '设计 系统'); assert.deepEqual(q.tags, ['规则', '手动']); assert.equal(q.domain, 'example.test');
  assert.deepEqual(mergeSmartQuery({ status: 'active' }, { status: 'dead' }).ids, []);
  assert.equal(filterChips({ keyword: '中文', tags: ['标签'], domain: 'example.test', ids: [1] }).length, 4);
  assert.match(bookmarkMarkdown({ title: '设计[系统]', url: 'https://example.test/a(b)', notes: '我的摘录' }), /我的摘录/);
  assert.ok(bookmarkMarkdown({ title: '设计[系统]', url: 'https://example.test' }).includes('设计\\[系统\\]'));
});


test('域名筛选按真实主机与子域名匹配，不命中相似恶意后缀或通配符', () => {
  const a = createBookmark({ url: 'https://example.test/domain-real' });
  const b = createBookmark({ url: 'https://sub.example.test/domain-real' });
  const c = createBookmark({ url: 'https://example.test.evil/domain-fake' });
  const ids = [a.id, b.id, c.id];
  assert.deepEqual(queryBookmarks({ ids, domain: 'EXAMPLE.TEST' }).items.map((x) => x.id).sort((x,y) => x-y), [a.id, b.id]);
  assert.equal(queryBookmarks({ ids, domain: '%' }).total, 0);
  assert.equal(mergeSmartQuery({ domain: 'EXAMPLE.TEST' }, { domain: 'sub.example.test' }).domain, 'sub.example.test');
});

test('恢复不同库即使复用同一 ID，旧笔记草稿也不串到另一个 URL', () => {
  const old = { id: 900, url: 'https://example.test/old-library', notes: '' };
  const restored = { id: 900, url: 'https://example.test/restored-library', notes: '' };
  assert.notEqual(noteDraftKey(old), noteDraftKey(restored));
  const storage = noteStorage(); storage.setItem(noteDraftKey(old), JSON.stringify({ text: '旧库私有笔记', base: '' }));
  const draft = new NoteDraft({ bookmark: restored, storage, save: async () => { throw new Error('不应提交旧稿'); } });
  assert.equal(draft.snapshot().text, ''); assert.equal(draft.snapshot().status, 'saved');
  draft.detach();
});


test('助手引用守门：模型编造不存在序号或无引用不当作已验证总结', () => {
  assert.equal(hasValidCitations('依据 [1] 和 [2]', 2), true);
  assert.equal(hasValidCitations('依据 [1] 和不存在的 [3]', 2), false);
  assert.equal(hasValidCitations('未注明引用的生成内容', 2), false);
  assert.equal(hasValidCitations('错误编号 [0]', 2), false);
});


test('慢抓取/模型返回不覆盖用户期间修改的标题与描述', () => {
  const b = createBookmark({ url: 'https://example.test/enrich-race' });
  updateBookmark(b.id, { title: '用户自己的标题', description: '手工写的描述' });
  const current = getBookmark(b.id)!;
  const meta: any = { title: '网页原标题', description: '网页描述', excerpt: '网页摘要', favicon: '', image: '' };
  updateBookmark(b.id, metadataPatch(current, meta));
  assert.equal(getBookmark(b.id)?.title, '用户自己的标题'); assert.equal(getBookmark(b.id)?.description, '手工写的描述');
  assert.equal(mayReplaceDescription(b, current, getBookmark(b.id)!, meta), false);
  assert.equal(mayReplaceDescription(b, { ...b, description: '网页描述' }, { ...b, description: '网页描述' }, meta), true);
  assert.equal(mayReplaceDescription(b, { ...b, description: '网页描述' }, current, meta), false);
});

// Real SQLite lifecycle: restoring an interrupted enrichment must not leave a permanent spinner.
test('trashing pending/processing bookmarks cancels their state without losing completed data', () => {
  for (const state of ['pending', 'processing', 'done'] as const) {
    const b = createBookmark({ url: `https://lifecycle.test/${state}`, title: '保留人工标题' });
    updateBookmark(b.id, { aiState: state, notes: '保留笔记' });
    trashBookmarks([b.id]);
    assert.equal(getBookmark(b.id)!.aiState, state === 'done' ? 'done' : 'skipped');
    restoreBookmarks([b.id]);
    assert.equal(getBookmark(b.id)!.title, '保留人工标题');
    assert.equal(getBookmark(b.id)!.notes, '保留笔记');
    assert.notEqual(getBookmark(b.id)!.aiState, 'processing');
  }
});

test('标签计数只统计当前非回收站记录，与标签筛选结果一致', () => {
  const b = createBookmark({ url: 'https://tagcount.test/mainline', tags: ['计数验收唯一标签'] });
  assert.equal(tagCounts()['计数验收唯一标签'], 1);
  trashBookmarks([b.id]);
  assert.equal(tagCounts()['计数验收唯一标签'], 0);
  assert.equal(queryBookmarks({ tags: ['计数验收唯一标签'] }).total, 0);
  restoreBookmarks([b.id]);
  assert.equal(tagCounts()['计数验收唯一标签'], 1);
});

test('单条收藏的多链接提示明确使用中文并引导批量粘贴', () => {
  for (const input of ['https://a.test https://b.test', 'https://a.test\nhttps://b.test']) {
    assert.throws(() => normalizeCaptureUrl(input), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, '请一次输入一个完整链接。若有多个链接，请使用工具栏“批量粘贴”。');
      assert.doesNotMatch(error.message, /Multiple links|batch paste/i);
      return true;
    });
  }
});

test('首次启动优先中文，显式英文选择保留，存储不可用也可启动', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    for (const [saved, expected] of [[null, 'zh'], ['zh', 'zh'], ['en', 'en'], ['invalid', 'zh']] as const) {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => saved } });
      assert.equal(detectInitialLang(), expected);
    }
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('storage unavailable'); } });
    assert.equal(detectInitialLang(), 'zh');
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
