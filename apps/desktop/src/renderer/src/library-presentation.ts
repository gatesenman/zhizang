/** Pure presentation policy. Does not change selection, queries, or stored data. */
export type LibraryScope = 'all' | 'inbox' | 'favorite' | 'unread' | 'trash' | 'category' | 'smart';
export type EmptyAction = 'add' | 'clear' | 'all' | null;

export function libraryEmptyState(scope: LibraryScope, filtered: boolean, lang: 'zh' | 'en'): { title: string; description: string; action: EmptyAction; actionLabel: string } {
  const zh = lang === 'zh';
  if (filtered) return { title: zh ? '没有找到匹配的收藏' : 'No matching bookmarks', description: zh ? '试试减少筛选条件；已保存的内容不会受影响。' : 'Try fewer filters. Your saved items have not changed.', action: 'clear', actionLabel: zh ? '清除筛选条件' : 'Clear filters' };
  if (scope === 'all') return { title: zh ? '从第一条收藏开始' : 'Save your first bookmark', description: zh ? '保存有价值的链接，随时整理、阅读与记录。' : 'Save a useful link to organize, read, and annotate.', action: 'add', actionLabel: zh ? '添加第一条收藏' : 'Add your first bookmark' };
  if (scope === 'trash') return { title: zh ? '回收站是空的' : 'Trash is empty', description: zh ? '移入回收站的收藏会显示在这里，方便恢复。' : 'Deleted bookmarks appear here so you can restore them.', action: null, actionLabel: '' };
  if (scope === 'inbox') return { title: zh ? '收件箱已整理完' : 'Inbox is all clear', description: zh ? '新的未分类收藏会出现在这里。' : 'New uncategorized bookmarks will appear here.', action: 'all', actionLabel: zh ? '查看全部收藏' : 'View all bookmarks' };
  const title = scope === 'favorite' ? (zh ? '还没有星标收藏' : 'No favorites yet') : scope === 'unread' ? (zh ? '没有待阅读的收藏' : 'Nothing to read later') : scope === 'smart' ? (zh ? '暂无符合规则的收藏' : 'No items match these rules') : (zh ? '这个分类还没有收藏' : 'This folder is empty');
  const description = scope === 'favorite' ? (zh ? '为重要的收藏点亮星标，就能在这里快速找到。' : 'Star important bookmarks to find them here quickly.') : (zh ? '可以到全部收藏中查找，再继续整理。' : 'Browse all bookmarks to find and organize your saved items.');
  return { title, description, action: 'all', actionLabel: zh ? '查看全部收藏' : 'View all bookmarks' };
}

export function libraryPreviewState(selectedId: number | null, visibleIds: number[], collapsedId: number | null): { available: boolean; visible: boolean } {
  const available = selectedId !== null && visibleIds.includes(selectedId);
  return { available, visible: available && collapsedId !== selectedId };
}
