import { test } from 'node:test';
import assert from 'node:assert/strict';
const memory = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v) };
(globalThis as any).window = { api: {} };
// Store unit tests use a controlled IPC boundary; database integration is in library.test.ts.
// eslint-disable-next-line @typescript-eslint/no-var-requires -- Install the localStorage fixture before importing the store.
const { useStore } = require('../src/renderer/src/store');
function deferred(): any {
  let resolve: any;
  let reject: any;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
test('快速检索只采用最后请求；过期响应不能覆盖新结果', async () => {
  const a = deferred(); const b = deferred();
  let count = 0;
  window.api = { bookmarks: { query: () => (++count === 1 ? a.promise : b.promise) } } as any;
  useStore.setState({ nav: { type: 'all' }, query: {}, bookmarks: [] });
  const first = useStore.getState().setQuery({ keyword: '旧' });
  const second = useStore.getState().setQuery({ keyword: '新' });
  b.resolve({ items: [{ id: 2, title: '新' }], total: 1 }); await second;
  a.resolve({ items: [{ id: 1, title: '旧' }], total: 1 }); await first;
  assert.equal(useStore.getState().bookmarks[0].id, 2);
  assert.equal(useStore.getState().loading, false);
});
test('查询错误退出 loading 并可重试，不伪装为空列表成功', async () => {
  window.api = { bookmarks: { query: async () => { throw new Error('真实错误'); } } } as any;
  await useStore.getState().loadBookmarks();
  assert.equal(useStore.getState().loading, false);
  assert.match(useStore.getState().error, /真实错误/);
  window.api.bookmarks.query = async () => ({ items: [], total: 0 });
  await useStore.getState().loadBookmarks();
  assert.equal(useStore.getState().error, null);
});
test('选择竞态：慢返回的旧详情不能覆盖最新选择', async () => {
  const a = deferred(); const b = deferred();
  window.api = { bookmarks: { get: (id: number) => id === 1 ? a.promise : b.promise } } as any;
  const first = useStore.getState().select(1);
  const second = useStore.getState().select(2);
  b.resolve({ id: 2 }); await second;
  a.resolve({ id: 1 }); await first;
  assert.equal(useStore.getState().selectedId, 2);
});
test('智能目录关键词规则不被空白搜索覆盖', async () => {
  let actual: any;
  window.api = { bookmarks: { query: async (q: any) => { actual = q; return { items: [], total: 0 }; } } } as any;
  useStore.setState({ nav: { type: 'smart', id: 1 }, smartFolders: [{ id: 1, rule: { keyword: '设计' } }], query: { keyword: '' } });
  await useStore.getState().loadBookmarks();
  assert.equal(actual.keyword, '设计');
});
test('界面偏好持久化到本地，切换不修改业务数据', () => {
  useStore.getState().setView('list');
  assert.equal(memory.get('zc-view'), 'list');
  useStore.getState().toggleDark();
  assert.equal(memory.get('zc-dark'), useStore.getState().dark ? '1' : '0');
});


test('筛选变化清空旧多选；清除全部条件保留收件箱范围；全库搜索明确退出范围', async () => {
  const queries: any[] = [];
  window.api = { bookmarks: { query: async (q: any) => { queries.push(q); return { items: [], total: 0 }; } } } as any;
  useStore.setState({ nav: { type: 'inbox' }, query: { uncategorized: true, keyword: '设计', domain: 'a.test', tags: ['交互'] }, selectedIds: [99] });
  await useStore.getState().setQuery({ keyword: '新' }); assert.deepEqual(useStore.getState().selectedIds, []);
  await useStore.getState().clearFilters(); assert.equal(queries.at(-1).uncategorized, true); assert.equal(queries.at(-1).keyword, undefined); assert.equal(queries.at(-1).domain, undefined);
  await useStore.getState().setQuery({ keyword: '设计' }); await useStore.getState().searchAll();
  assert.equal(useStore.getState().nav.type, 'all'); assert.equal(queries.at(-1).keyword, '设计'); assert.equal(queries.at(-1).uncategorized, undefined);
});
test('引用定位清除旧筛选并展示真实记录，回收站条目不冒充活跃收藏', async () => {
  let query: any;
  window.api = { bookmarks: { get: async (id: number) => ({ id, title: '原引用', deletedAt: id === 2 ? 123 : null }), query: async (q: any) => { query = q; return { items: [], total: 0 }; } } } as any;
  useStore.setState({ nav: { type: 'category', id: 4 }, query: { keyword: '不相关', tags: ['不相关'] } });
  await useStore.getState().revealBookmark(1); assert.deepEqual(query.ids, [1]); assert.equal(query.keyword, undefined); assert.equal(useStore.getState().selectedId, 1);
  await useStore.getState().revealBookmark(2); assert.equal(useStore.getState().nav.type, 'trash'); assert.equal(query.trashed, true);
});


test('连续快速收藏回到可批量整理的收件箱，而不是把列表锁在单条定位', async () => {
  let query: any;
  window.api = { categories: { list: async () => [], counts: async () => ({}) }, tags: { list: async () => [], counts: async () => ({}) }, bookmarks: { create: async () => ({ bookmark: { id: 5 }, created: true }), get: async () => ({ id: 5 }), query: async (q: any) => { query = q; return { items: [{ id: 5 }], total: 1 }; }, trashCount: async () => 0 } } as any;
  await useStore.getState().addBookmark({ url: 'https://example.test/new-capture' });
  assert.equal(useStore.getState().nav.type, 'inbox'); assert.equal(query.uncategorized, true); assert.equal(query.ids, undefined);
});
