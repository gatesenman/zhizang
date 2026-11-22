import { test } from 'node:test';
import assert from 'node:assert/strict';
import { libraryEmptyState, libraryPreviewState, type LibraryScope } from '../src/renderer/src/library-presentation';

test('空库仅引导首条收藏，星标与分类空态不误导新增', () => {
  assert.equal(libraryEmptyState('all', false, 'zh').action, 'add');
  for (const scope of ['favorite', 'category', 'smart', 'unread'] as LibraryScope[]) {
    const empty = libraryEmptyState(scope, false, 'zh');
    assert.equal(empty.action, 'all');
    assert.doesNotMatch(empty.actionLabel, /添加|新增/);
  }
  assert.match(libraryEmptyState('favorite', false, 'zh').title, /星标/);
});
test('筛选无结果与真实空库区分，任何范围仅提供清除条件这个主动作', () => {
  for (const scope of ['all', 'favorite', 'category', 'inbox', 'trash', 'smart', 'unread'] as LibraryScope[]) {
    const empty = libraryEmptyState(scope, true, 'zh');
    assert.equal(empty.action, 'clear');
    assert.match(empty.title, /匹配/);
    assert.doesNotMatch(empty.title, /丢失|整理完/);
  }
});
test('收件箱完成态与空回收站各有上下文，不给回收站新增入口', () => {
  assert.match(libraryEmptyState('inbox', false, 'zh').title, /整理完/);
  assert.equal(libraryEmptyState('trash', false, 'zh').action, null);
});
test('空态英文不混入中文提示，单个主动作可达', () => {
  for (const filtered of [true, false]) for (const scope of ['all', 'favorite', 'category', 'inbox', 'trash', 'smart', 'unread'] as LibraryScope[]) {
    const empty = libraryEmptyState(scope, filtered, 'en');
    assert.doesNotMatch(empty.title + empty.description + empty.actionLabel, /[\u4e00-\u9fff]/);
    if (empty.action) assert.ok(empty.actionLabel.length > 0);
  }
});
test('未选中不占预览，空列表与筛选掉的旧选中不展示过期详情', () => {
  assert.deepEqual(libraryPreviewState(null, [1, 2], null), { available: false, visible: false });
  assert.deepEqual(libraryPreviewState(1, [], null), { available: false, visible: false });
  assert.deepEqual(libraryPreviewState(1, [2], null), { available: false, visible: false });
});
test('选择后展开；关闭仅折叠，重新展开和切换收藏都可恢复，不改列表顺序', () => {
  const ids = [3, 1, 2];
  assert.deepEqual(libraryPreviewState(1, ids, null), { available: true, visible: true });
  assert.deepEqual(libraryPreviewState(1, ids, 1), { available: true, visible: false });
  assert.deepEqual(libraryPreviewState(2, ids, 1), { available: true, visible: true });
  assert.deepEqual(libraryPreviewState(1, ids, null), { available: true, visible: true });
  assert.deepEqual(ids, [3, 1, 2]);
});
