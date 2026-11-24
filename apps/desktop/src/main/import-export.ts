import * as cheerio from 'cheerio/slim';
import YAML from 'yaml';
import type { CategoryNode } from '@zhicang/shared';
import {
  createBookmark,
  createCategory,
  updateBookmark,
  getDb,
  ensureCategoryByName,
  listCategories,
  queryBookmarks,
  applyCategoryTree,
} from './db';

// 导入 Chrome / Edge 书签 HTML（Netscape 格式）
export function importBookmarksHtml(html: string): { imported: number; skipped: number } {
  const $ = cheerio.load(html);
  let imported = 0;
  let skipped = 0;

  // 用每个 <A> 最近的上层 <H3> 作为分类名
  $('a').each((_, el) => {
    const url = $(el).attr('href');
    if (!url || !/^https?:/i.test(url)) {
      skipped++;
      return;
    }
    const title = $(el).text().trim() || url;
    const folder = $(el).closest('dl').prevAll('h3').first().text().trim();
    const categoryId = folder ? ensureCategoryByName(folder) : null;
    try {
      createBookmark({ url, title, categoryId });
      imported++;
    } catch {
      skipped++;
    }
  });
  return { imported, skipped };
}

// 导出为 Netscape 书签 HTML
export function exportBookmarksHtml(): string {
  const { items } = queryBookmarks({ limit: 100000, offset: 0 });
  const cats = new Map(listCategories().map((c) => [c.id, c.name]));
  const groups = new Map<string, typeof items>();
  for (const b of items) {
    const key = b.categoryId ? cats.get(b.categoryId) ?? '未分类' : '未分类';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(b);
  }
  let body = '';
  for (const [folder, list] of groups) {
    body += `    <DT><H3>${escapeHtml(folder)}</H3>\n    <DL><p>\n`;
    for (const b of list) {
      const ts = Math.floor(b.createdAt / 1000);
      body += `        <DT><A HREF="${escapeHtml(b.url)}" ADD_DATE="${ts}">${escapeHtml(
        b.title,
      )}</A>\n`;
    }
    body += '    </DL><p>\n';
  }
  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>ZhiCang Bookmarks</H1>
<DL><p>
${body}</DL><p>
`;
}

// JSON 全量导出
export function exportJson(): string {
  const { items } = queryBookmarks({ limit: 100000, offset: 0 });
  return JSON.stringify({ version: 2, categories: listCategories(), bookmarks: items }, null, 2);
}

// JSON 导入
export function importJson(text: string): { imported: number; skipped: number } {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.bookmarks) || (data.categories != null && !Array.isArray(data.categories))) {
    throw new Error('JSON 格式错误：需要 bookmarks 数组');
  }
  const categories = data.categories ?? [];
  const source = new Map<number, any>();
  for (const c of categories) {
    if (!Number.isInteger(c.id) || typeof c.name !== 'string' || !c.name.trim() || source.has(c.id)) throw new Error('分类数据格式错误');
    source.set(c.id, c);
  }
  // 在写入之前校验分类树，避免坏文件导致无限递归或半导入。
  const validate = (id: number, path = new Set<number>()): void => {
    if (path.has(id)) throw new Error('分类数据包含循环引用');
    const c = source.get(id);
    if (c?.parentId != null) {
      if (!source.has(c.parentId)) throw new Error('分类的父目录不存在');
      validate(c.parentId, new Set([...path, id]));
    }
  };
  for (const id of source.keys()) validate(id);
  let imported = 0;
  let skipped = 0;
  getDb().transaction(() => {
    const catMap = new Map<number, number>();
    const resolve = (id: number): number => {
      if (catMap.has(id)) return catMap.get(id)!;
      const c = source.get(id);
      const parentId = c.parentId == null ? null : resolve(c.parentId);
      const existing = listCategories().find((x) => x.name === c.name && x.parentId === parentId);
      const category = existing ?? createCategory(c.name, parentId, c.color);
      catMap.set(id, category.id);
      return category.id;
    };
    for (const id of source.keys()) resolve(id);
    for (const item of data.bookmarks) {
      // 单条事务：无效收藏整条回滚，不能留下写入一半的记录。
      try {
        getDb().transaction(() => {
          const b = createBookmark({
            url: item.url, title: item.title, description: item.description,
            categoryId: catMap.get(item.categoryId) ?? null,
            tags: Array.isArray(item.tags) ? item.tags.filter((t: unknown) => typeof t === 'string') : [],
          });
          updateBookmark(b.id, {
            notes: typeof item.notes === 'string' ? item.notes : '',
            favorite: item.favorite === true, pinned: item.pinned === true,
            readState: item.readState === 'read' ? 'read' : 'unread',
            status: ['active', 'dead', 'archived'].includes(item.status) ? item.status : 'active',
            visitedAt: Number.isSafeInteger(item.visitedAt) && item.visitedAt > 0 ? item.visitedAt : null,
            contentExcerpt: typeof item.contentExcerpt === 'string' ? item.contentExcerpt : '',
            visitCount: Number.isSafeInteger(item.visitCount) && item.visitCount >= 0 ? item.visitCount : 0,
          });
          if (Number.isSafeInteger(item.createdAt) && item.createdAt > 0) {
            getDb().prepare('UPDATE bookmarks SET created_at = ? WHERE id = ?').run(item.createdAt, b.id);
          }
        })();
        imported++;
      } catch {
        skipped++;
      }
    }
  })();
  return { imported, skipped };
}

// 导入 YAML 分类模板：支持 list 或 {categories: [...]}，支持嵌套 children，保留层级
export function importCategoriesYaml(text: string): { created: number } {
  const doc = YAML.parse(text);
  const list = Array.isArray(doc) ? doc : doc?.categories ?? [];
  const normalize = (nodes: any[]): CategoryNode[] =>
    (Array.isArray(nodes) ? nodes : [])
      .map((node): CategoryNode | null => {
        const name = typeof node === 'string' ? node : node?.name;
        if (!name) return null;
        const color = typeof node === 'object' ? node?.color : undefined;
        const children = typeof node === 'object' && node?.children ? normalize(node.children) : undefined;
        return { name: String(name), color, children };
      })
      .filter((n): n is CategoryNode => n != null);
  return { created: applyCategoryTree(normalize(list), null) };
}

// 导入 CSV（Raindrop / Pocket 等）。自动识别 url/title/tags/folder 列。
export function importCsv(text: string): { imported: number; skipped: number } {
  const rows = parseCsv(text);
  if (rows.length === 0) return { imported: 0, skipped: 0 };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (names: string[]): number => header.findIndex((h) => names.includes(h));
  const urlIdx = idx(['url', 'link']);
  const titleIdx = idx(['title', 'name']);
  const tagsIdx = idx(['tags', 'labels']);
  const folderIdx = idx(['folder', 'category']);
  let imported = 0;
  let skipped = 0;
  // 无表头（如部分 Pocket 导出）则按列位置兜底
  const hasHeader = urlIdx >= 0;
  const start = hasHeader ? 1 : 0;
  for (let i = start; i < rows.length; i++) {
    const row = rows[i];
    const url = (hasHeader ? row[urlIdx] : row[0])?.trim();
    if (!url || !/^https?:/i.test(url)) {
      skipped++;
      continue;
    }
    const title = (hasHeader && titleIdx >= 0 ? row[titleIdx] : row[1])?.trim() || url;
    const tags =
      hasHeader && tagsIdx >= 0 && row[tagsIdx]
        ? row[tagsIdx].split(/[|,]/).map((t) => t.trim()).filter(Boolean)
        : [];
    const folder = hasHeader && folderIdx >= 0 ? row[folderIdx]?.trim() : '';
    const categoryId = folder ? ensureCategoryByName(folder) : null;
    try {
      createBookmark({ url, title, categoryId, tags });
      imported++;
    } catch {
      skipped++;
    }
  }
  return { imported, skipped };
}

// 极简 CSV 解析（支持引号、逗号、换行）
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f.length)) rows.push(row);
      row = [];
    } else field += c;
  }
  if (inQuotes) throw new Error('CSV 引号未闭合，未导入任何数据');
  if (field.length || row.length) {
    row.push(field);
    if (row.some((f) => f.length)) rows.push(row);
  }
  return rows;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
