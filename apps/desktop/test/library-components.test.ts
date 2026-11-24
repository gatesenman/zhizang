import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { App as AntApp } from 'antd';

// Deliberately controlled renderer state, not an end-to-end database fixture.
const memory = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v) };
const load = createRequire(__filename);
const storeModule = load('../src/renderer/src/store');
const original = storeModule.useStore;
const initial = original.getState();
let state = { ...initial };
storeModule.useStore = Object.assign((selector: any) => selector(state), { getState: () => state });
const { I18nProvider } = load('../src/renderer/src/i18n');
const ListToolbar = load('../src/renderer/src/components/ListToolbar').default;
const BookmarkPanel = load('../src/renderer/src/components/BookmarkPanel').default;
function render(component: any): string {
  return renderToStaticMarkup(React.createElement(I18nProvider, null, React.createElement(AntApp, null, React.createElement(component))));
}

test('内容头只有一个标题，计数合并，无条件不显示重复扩大范围或新增', () => {
  state = { ...initial, nav: { type: 'favorite' } };
  const html = render(ListToolbar);
  assert.equal((html.match(/<h1/g) || []).length, 1);
  assert.match(html, /星标收藏/);
  assert.match(html, /zc-library-count/);
  assert.doesNotMatch(html, /在全部收藏中搜索|搜索全部收藏|新增收藏/);
  assert.doesNotMatch(html, /zc-filter-summary/);
  assert.match(html, /disabled=""[^>]*><span>全选当前页/);
});
test('批量模式保留范围标题和条件，只替换操作行且取消有可访问名称', () => {
  state = { ...initial, nav: { type: 'favorite' }, total: 2, selectedIds: [1, 2], query: { tags: ['设计'] } };
  const html = render(ListToolbar);
  assert.equal((html.match(/<h1/g) || []).length, 1);
  assert.match(html, /星标收藏/);
  assert.match(html, /zc-batchbar/);
  assert.match(html, /退出批量选择/);
  assert.match(html, /标签：设计/);
  assert.doesNotMatch(html, /zc-library-actions/);
});
test('星标空态只给一次全库入口，不冒充空库新增', () => {
  state = { ...initial, nav: { type: 'favorite' } };
  const html = render(BookmarkPanel);
  assert.match(html, /还没有星标收藏/);
  assert.equal((html.match(/查看全部收藏/g) || []).length, 1);
  assert.doesNotMatch(html, /添加第一条|新增收藏/);
});
test('加载失败保留错误与重试，不能呈现空库完成态', () => {
  state = { ...initial, error: '测试边界错误' };
  const html = render(BookmarkPanel);
  assert.match(html, /收藏加载失败/);
  assert.match(html, /测试边界错误/);
  assert.match(html, /重\s*试/);
  assert.doesNotMatch(html, /zc-library-empty/);
});
test('收藏行和复选框有标题名称，长标签保留全文title', () => {
  const b = { id: 1, title: '长标题收藏', url: 'https://example.test/a', tags: ['非常长的中文标签'], createdAt: Date.now(), readState: 'unread', description: '' };
  state = { ...initial, view: 'list', total: 1, bookmarks: [b] };
  const html = render(BookmarkPanel);
  assert.match(html, /data-bookmark-id="1"/);
  assert.match(html, /aria-label="选择收藏：长标题收藏"/);
  assert.match(html, /title="非常长的中文标签"/);
});
