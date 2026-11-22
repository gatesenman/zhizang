import type { Bookmark, BookmarkQuery } from '@zhicang/shared';

export function normalizeCaptureUrl(value: string): string {
  const input = value.trim();
  if (!input) throw new Error('请粘贴一个网页链接');
  if (/\s/.test(input)) throw new Error('请一次输入一个完整链接。若有多个链接，请使用工具栏“批量粘贴”。');
  if (/^[a-z][a-z\d+.-]*:/i.test(input) && !/^https?:\/\//i.test(input)) throw new Error('仅支持 HTTP / HTTPS 网页链接');
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(input) ? input : 'https://' + input); } catch { throw new Error('链接格式无效，请粘贴完整网页地址'); }
  if (!['http:', 'https:'].includes(u.protocol) || !u.hostname) throw new Error('请输入有效的网页链接');
  if (u.username || u.password) throw new Error('链接中请勿包含用户名或密码');
  // Keep path/query/fragment case and URL spelling; do not introduce slash-based duplicates.
  return /^https?:\/\//i.test(input) ? input : 'https://' + input;
}

export function mergeSmartQuery(rule: BookmarkQuery, explicit: BookmarkQuery): BookmarkQuery {
  const patch = Object.fromEntries(Object.entries(explicit).filter(([, v]) => v !== undefined && v !== ''));
  const q: BookmarkQuery = { ...rule, ...patch };
  q.keyword = [rule.keyword, explicit.keyword].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' ') || undefined;
  q.tags = [...new Set([...(rule.tags ?? []), ...(explicit.tags ?? [])])];
  if (!q.tags.length) delete q.tags;
  if (rule.status && explicit.status && rule.status !== explicit.status) q.ids = [];
  if (rule.domain && explicit.domain) {
    const host = (v: string): string => { try { return new URL(v.includes('://') ? v : 'https://' + v).hostname; } catch { return ''; } };
    const a = host(rule.domain); const b = host(explicit.domain);
    if (!a || !b) q.ids = [];
    else if (a === b || b.endsWith('.' + a)) q.domain = b;
    else if (a.endsWith('.' + b)) q.domain = a;
    else q.ids = [];
  }
  if (rule.createdFrom != null || explicit.createdFrom != null) q.createdFrom = Math.max(rule.createdFrom ?? 0, explicit.createdFrom ?? 0);
  if (rule.createdTo != null || explicit.createdTo != null) q.createdTo = Math.min(rule.createdTo ?? Infinity, explicit.createdTo ?? Infinity);
  return q;
}

export function bookmarkMarkdown(b: Pick<Bookmark, 'title' | 'url'> & Partial<Pick<Bookmark, 'description' | 'notes' | 'tags'>>): string {
  const title = (b.title || b.url).replace(/[\r\n]+/g, ' ').replace(/([[\]\\])/g, '\\$1');
  const url = b.url.replace(/</g, '%3C').replace(/>/g, '%3E').replace(/[\r\n]/g, '');
  return [`[${title}](<${url}>)`, b.description?.trim(), b.tags?.length ? '标签：' + b.tags.join('、') : '', b.notes?.trim() ? '## 我的笔记\n\n' + b.notes.trim() : ''].filter(Boolean).join('\n\n');
}

export function filterChips(q: BookmarkQuery): { key: string; label: string; clear: Partial<BookmarkQuery> }[] {
  const chips: { key: string; label: string; clear: Partial<BookmarkQuery> }[] = [];
  if (q.keyword) chips.push({ key: 'keyword', label: '搜索：' + q.keyword, clear: { keyword: undefined } });
  for (const tag of q.tags ?? []) chips.push({ key: 'tag:' + tag, label: '标签：' + tag, clear: { tags: q.tags?.filter((x) => x !== tag) } });
  if (q.domain) chips.push({ key: 'domain', label: '域名：' + q.domain, clear: { domain: undefined } });
  if (q.status) chips.push({ key: 'status', label: '状态：' + ({ active: '正常', dead: '失效', archived: '归档' }[q.status] || q.status), clear: { status: undefined } });
  if (q.createdFrom != null || q.createdTo != null) chips.push({ key: 'date', label: '日期：' + (q.createdFrom ? new Date(q.createdFrom).toLocaleDateString('zh-CN') : '不限') + ' ~ ' + (q.createdTo ? new Date(q.createdTo).toLocaleDateString('zh-CN') : '不限'), clear: { createdFrom: undefined, createdTo: undefined } });
  if (q.ids) chips.push({ key: 'focus', label: '正在定位收藏 #' + q.ids.join('、'), clear: { ids: undefined } });
  return chips;
}
