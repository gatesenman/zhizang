import { app } from 'electron';
import { chmodSync } from 'node:fs';
import { join } from 'path';
import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import type {
  Bookmark,
  BookmarkQuery,
  Category,
  CategoryNode,
  ReadState,
  SmartFolder,
  SmartFolderRule,
  StatsOverview,
  SyncPushItem,
  Tag,
} from '@zhicang/shared';
import { CATEGORY_ROLE_PRESETS } from '@zhicang/shared';

let db: Database.Database;

export function initDb(dbPath = join(app.getPath('userData'), 'zhicang.db')): Database.Database {
  db = new Database(dbPath);
  try {
    if (process.platform !== 'win32' && dbPath !== ':memory:') chmodSync(dbPath, 0o600);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.function('url_hostname', { deterministic: true }, (value: unknown) => { try { return new URL(String(value)).hostname.toLowerCase(); } catch { return ''; } });
    // A failed upgrade must not leave half-migrated user data or a locked handle.
    db.transaction(() => {
      migrate();
      migrateUrlHashes();
      seed();
      migrateLegacySystemCategories();
      db.prepare("UPDATE bookmarks SET ai_state = 'pending' WHERE ai_state = 'processing'").run();
    })();
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function getDb(): Database.Database {
  if (!db) throw new Error('DB 未初始化');
  return db;
}

function addColumnIfMissing(table: string, column: string, def: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
  }
}

function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id INTEGER,
      name TEXT NOT NULL,
      icon TEXT,
      color TEXT,
      sort INTEGER DEFAULT 0,
      is_system INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      url_hash TEXT NOT NULL UNIQUE,
      title TEXT DEFAULT '',
      description TEXT DEFAULT '',
      favicon TEXT,
      image TEXT,
      category_id INTEGER,
      content_excerpt TEXT,
      status TEXT DEFAULT 'active',
      ai_state TEXT DEFAULT 'pending',
      visited_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bookmarks_category ON bookmarks(category_id);
    CREATE INDEX IF NOT EXISTS idx_bookmarks_created ON bookmarks(created_at);
    CREATE INDEX IF NOT EXISTS idx_bookmarks_ai_state ON bookmarks(ai_state);

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS bookmark_tags (
      bookmark_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (bookmark_id, tag_id),
      FOREIGN KEY (bookmark_id) REFERENCES bookmarks(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sync_tombstones (
      url_hash TEXT PRIMARY KEY,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS smart_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT,
      color TEXT,
      rule TEXT NOT NULL,
      sort INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bookmark_id INTEGER NOT NULL,
      visited_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_visits_bm ON visits(bookmark_id);
    CREATE INDEX IF NOT EXISTS idx_visits_at ON visits(visited_at);

    CREATE TABLE IF NOT EXISTS snapshots (
      bookmark_id INTEGER PRIMARY KEY,
      content TEXT,
      saved_at INTEGER NOT NULL,
      FOREIGN KEY (bookmark_id) REFERENCES bookmarks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS embeddings (
      bookmark_id INTEGER PRIMARY KEY,
      model TEXT NOT NULL,
      dim INTEGER NOT NULL,
      vec BLOB NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (bookmark_id) REFERENCES bookmarks(id) ON DELETE CASCADE
    );
  `);

  // 增量列（老库平滑升级）
  addColumnIfMissing('bookmarks', 'favorite', 'INTEGER DEFAULT 0');
  addColumnIfMissing('bookmarks', 'pinned', 'INTEGER DEFAULT 0');
  addColumnIfMissing('bookmarks', 'read_state', "TEXT DEFAULT 'unread'");
  addColumnIfMissing('bookmarks', 'notes', "TEXT DEFAULT ''");
  addColumnIfMissing('bookmarks', 'visit_count', 'INTEGER DEFAULT 0');
  addColumnIfMissing('bookmarks', 'http_status', 'INTEGER');
  addColumnIfMissing('bookmarks', 'last_check_at', 'INTEGER');
  addColumnIfMissing('bookmarks', 'sort_index', 'INTEGER DEFAULT 0');
  addColumnIfMissing('bookmarks', 'deleted_at', 'INTEGER');
  addColumnIfMissing('bookmarks', 'snapshot', 'INTEGER DEFAULT 0');
  addColumnIfMissing('bookmarks', 'snapshot_at', 'INTEGER');
  db.exec('CREATE INDEX IF NOT EXISTS idx_bookmarks_deleted ON bookmarks(deleted_at)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_bookmarks_active_created ON bookmarks(deleted_at, pinned DESC, created_at DESC, id DESC)');

  migrateFts();
}

// FTS5：使用标准（自带内容）表，支持 DELETE/UPDATE。
function migrateFts(): void {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='fts_bookmarks'")
    .get() as { sql?: string } | undefined;
  const needsRebuild = !!row?.sql && /content\s*=\s*''/.test(row.sql);
  if (needsRebuild) db.exec('DROP TABLE IF EXISTS fts_bookmarks');

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS fts_bookmarks USING fts5(
      title, description, content_excerpt, url, tags, tokenize='unicode61'
    );
  `);

  const created = !row || needsRebuild;
  if (created) {
    const rows = db.prepare('SELECT id FROM bookmarks').all() as { id: number }[];
    for (const r of rows) {
      const b = getBookmark(r.id);
      if (b) {
        db.prepare(
          `INSERT INTO fts_bookmarks (rowid, title, description, content_excerpt, url, tags)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(b.id, b.title, b.description, b.contentExcerpt ?? '', b.url, b.tags.join(' '));
      }
    }
  }
}

function seed(): void {
  const count = db.prepare('SELECT COUNT(*) AS c FROM categories').get() as { c: number };
  if (count.c === 0) {
    const now = Date.now();
    const insert = db.prepare(
      `INSERT INTO categories (parent_id, name, icon, color, sort, is_system, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
    );
    insert.run(null, '未分类', 'folder', '#8c8c8c', 0, now);
  }
}

// 旧版本曾种入「稍后读 / 我的收藏」系统分类，与顶部导航「稍后读 / 星标收藏」语义重复。
// 此处幂等移除：其下收藏与子目录上提为未分类（顶级），保持目录为纯粹的分类树。
function migrateLegacySystemCategories(): void {
  const rows = db
    .prepare("SELECT id FROM categories WHERE is_system = 1 AND name IN ('稍后读', '我的收藏')")
    .all() as { id: number }[];
  if (rows.length === 0) return;
  const now = Date.now();
  const tx = db.transaction(() => {
    for (const r of rows) {
      db.prepare('UPDATE categories SET parent_id = NULL WHERE parent_id = ?').run(r.id);
      db.prepare('UPDATE bookmarks SET category_id = NULL, updated_at = ? WHERE category_id = ?').run(now, r.id);
      db.prepare('DELETE FROM categories WHERE id = ?').run(r.id);
    }
  });
  tx();
}

// 收集某分类的「自身 + 所有子孙」id（广度优先），用于按子树聚合查询收藏。
function categorySubtreeIds(id: number): number[] {
  const ids = [id];
  const childStmt = db.prepare('SELECT id FROM categories WHERE parent_id = ?');
  for (let i = 0; i < ids.length; i++) {
    for (const k of childStmt.all(ids[i]) as { id: number }[]) {
      if (!ids.includes(k.id)) ids.push(k.id);
    }
  }
  return ids;
}

export function hashUrl(url: string): string {
  // Scheme/host are case-insensitive; path, query, fragment and user info are not.
  const normalized = url.trim().replace(/^([a-z][a-z0-9+.-]*:)\/\/([^/?#]*)/i, (_all, scheme: string, authority: string) => {
    const at = authority.lastIndexOf('@');
    return scheme.toLowerCase() + '//' + authority.slice(0, at + 1) + authority.slice(at + 1).toLowerCase();
  });
  return createHash('sha1').update(normalized).digest('hex');
}

// Refinement of the legacy hash: no distinct legacy rows can collide under the new rule.
function migrateUrlHashes(): void {
  if (getSetting('url_hash_version') === '2') return;
  db.transaction(() => {
    const rows = db.prepare('SELECT id, url FROM bookmarks').all() as { id: number; url: string }[];
    const update = db.prepare('UPDATE bookmarks SET url_hash = ? WHERE id = ?');
    for (const row of rows) update.run(hashUrl(row.url), row.id);
    setSetting('url_hash_version', '2');
  })();
}

// ---------- Categories ----------
export function listCategories(): Category[] {
  const rows = db.prepare('SELECT * FROM categories ORDER BY sort, id').all() as any[];
  return rows.map(mapCategory);
}

export function categoryCounts(): Record<number, number> {
  const rows = db
    .prepare(
      `SELECT category_id AS cid, COUNT(*) AS c
       FROM bookmarks WHERE deleted_at IS NULL AND category_id IS NOT NULL
       GROUP BY category_id`,
    )
    .all() as any[];
  const out: Record<number, number> = {};
  for (const r of rows) out[r.cid] = r.c;
  const uncategorized = db.prepare('SELECT id FROM categories WHERE is_system = 1 ORDER BY id LIMIT 1').get() as { id: number } | undefined;
  if (uncategorized) {
    const { c } = db.prepare('SELECT COUNT(*) AS c FROM bookmarks WHERE deleted_at IS NULL AND category_id IS NULL').get() as { c: number };
    out[uncategorized.id] = (out[uncategorized.id] ?? 0) + c;
  }
  return out;
}

export function createCategory(name: string, parentId: number | null, color?: string): Category {
  const now = Date.now();
  const maxSort = db.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM categories').get() as { m: number };
  const info = db
    .prepare(
      `INSERT INTO categories (parent_id, name, icon, color, sort, is_system, created_at)
       VALUES (?, ?, 'folder', ?, ?, 0, ?)`,
    )
    .run(parentId, name, color ?? '#1677ff', maxSort.m + 1, now);
  return mapCategory(db.prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid));
}

export function renameCategory(id: number, name: string): void {
  db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name, id);
}

// 删除分类：其下收藏与子目录「上提到上级」（顶级则归为未分类），再删除该分类，避免悬空。
export function deleteCategory(id: number): void {
  const row = db.prepare('SELECT is_system, parent_id FROM categories WHERE id = ?').get(id) as any;
  if (!row) return;
  if (row.is_system) throw new Error('系统默认分类不可删除');
  const parentId = (row.parent_id ?? null) as number | null;
  const now = Date.now();
  const tx = db.transaction(() => {
    db.prepare('UPDATE categories SET parent_id = ? WHERE parent_id = ?').run(parentId, id);
    db.prepare('UPDATE bookmarks SET category_id = ?, updated_at = ? WHERE category_id = ?').run(parentId, now, id);
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  });
  tx();
}

// 移动分类：改父级并重排序
export function moveCategory(id: number, parentId: number | null, sort: number): void {
  if (parentId != null && categorySubtreeIds(id).includes(parentId)) throw new Error('不能移动到自身或子分类');
  db.prepare('UPDATE categories SET parent_id = ?, sort = ? WHERE id = ?').run(parentId, sort, id);
}

// 按一组 id 顺序重排分类
export function reorderCategories(orderedIds: number[]): void {
  const tx = db.transaction((ids: number[]) => {
    const stmt = db.prepare('UPDATE categories SET sort = ? WHERE id = ?');
    ids.forEach((id, i) => stmt.run(i, id));
  });
  tx(orderedIds);
}

export function ensureCategoryByName(name: string): number {
  const existing = db.prepare('SELECT id FROM categories WHERE name = ?').get(name) as any;
  if (existing) return existing.id;
  return createCategory(name, null).id;
}

// 在指定父级下按 name 取或建分类（保留层级，供角色预设 / YAML 树导入复用）
function ensureCategoryUnder(name: string, parentId: number | null, color?: string): number {
  const existing = db
    .prepare('SELECT id FROM categories WHERE name = ? AND parent_id IS ?')
    .get(name, parentId) as any;
  if (existing) return existing.id;
  return createCategory(name, parentId, color).id;
}

// 递归落地分类树，返回新建数量
export function applyCategoryTree(nodes: CategoryNode[], parentId: number | null = null): number {
  let created = 0;
  const tx = db.transaction((list: CategoryNode[], pid: number | null) => {
    const walk = (arr: CategoryNode[], parent: number | null): void => {
      for (const node of arr) {
        if (!node?.name) continue;
        const before = db.prepare('SELECT id FROM categories WHERE name = ? AND parent_id IS ?').get(node.name, parent) as any;
        const id = ensureCategoryUnder(node.name, parent, node.color);
        if (!before) created++;
        if (node.children?.length) walk(node.children, id);
      }
    };
    walk(list, pid);
  });
  tx(nodes, parentId);
  return created;
}

// 按角色预设一键生成分类目录
export function seedRolePreset(roleId: string): { created: number } {
  const preset = CATEGORY_ROLE_PRESETS.find((p) => p.id === roleId);
  if (!preset) return { created: 0 };
  return { created: applyCategoryTree(preset.tree, null) };
}

// ---------- Tags ----------
export function listTags(): Tag[] {
  const rows = db.prepare('SELECT * FROM tags ORDER BY name').all() as any[];
  return rows.map((r) => ({ id: r.id, name: r.name, color: r.color, isActive: !!r.is_active }));
}

export function tagCounts(): Record<string, number> {
  const rows = db
    .prepare(
      `SELECT t.name AS name, COUNT(b.id) AS c
       FROM tags t LEFT JOIN bookmark_tags bt ON bt.tag_id = t.id
       LEFT JOIN bookmarks b ON b.id = bt.bookmark_id AND b.deleted_at IS NULL
       GROUP BY t.name`,
    )
    .all() as any[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.name] = r.c;
  return out;
}

function ensureTag(name: string): number {
  const t = name.trim();
  const existing = db.prepare('SELECT id FROM tags WHERE name = ?').get(t) as any;
  if (existing) return existing.id;
  const info = db.prepare('INSERT INTO tags (name, is_active) VALUES (?, 1)').run(t);
  return Number(info.lastInsertRowid);
}

function setBookmarkTags(bookmarkId: number, tags: string[]): void {
  db.prepare('DELETE FROM bookmark_tags WHERE bookmark_id = ?').run(bookmarkId);
  const link = db.prepare('INSERT OR IGNORE INTO bookmark_tags (bookmark_id, tag_id) VALUES (?, ?)');
  for (const name of tags) {
    if (!name?.trim()) continue;
    link.run(bookmarkId, ensureTag(name));
  }
}

function getBookmarkTags(bookmarkId: number): string[] {
  const rows = db
    .prepare(
      `SELECT t.name FROM tags t JOIN bookmark_tags bt ON bt.tag_id = t.id WHERE bt.bookmark_id = ? ORDER BY t.name`,
    )
    .all(bookmarkId) as any[];
  return rows.map((r) => r.name);
}

// ---------- Bookmarks ----------
function syncFts(b: Bookmark): void {
  db.prepare('DELETE FROM fts_bookmarks WHERE rowid = ?').run(b.id);
  db.prepare(
    `INSERT INTO fts_bookmarks (rowid, title, description, content_excerpt, url, tags)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(b.id, b.title, b.description, b.contentExcerpt ?? '', b.url, b.tags.join(' '));
}

export function createBookmark(input: {
  url: string;
  title?: string;
  description?: string;
  categoryId?: number | null;
  tags?: string[];
}): Bookmark {
  const parsed = new URL(input.url.trim());
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('仅支持不含用户名/密码的 HTTP / HTTPS 网页链接');
  input = { ...input, url: input.url.trim() };
  const urlHash = hashUrl(input.url);
  const tombstone = db.prepare('SELECT updated_at FROM sync_tombstones WHERE url_hash = ?').get(urlHash) as { updated_at: number } | undefined;
  const now = Math.max(Date.now(), (tombstone?.updated_at ?? 0) + 1);
  const existing = db.prepare('SELECT id, deleted_at FROM bookmarks WHERE url_hash = ?').get(urlHash) as any;
  if (existing) {
    if (existing.deleted_at) throw new Error('该网址在回收站，请先明确恢复');
    throw new Error('该网址已收藏');
  }
  const info = db
    .prepare(
      `INSERT INTO bookmarks (url, url_hash, title, description, category_id, status, ai_state, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', 'pending', ?, ?)`,
    )
    .run(
      input.url,
      urlHash,
      input.title ?? input.url,
      input.description ?? '',
      input.categoryId ?? null,
      now,
      now,
    );
  const id = Number(info.lastInsertRowid);
  if (input.tags?.length) setBookmarkTags(id, input.tags);
  const b = getBookmark(id)!;
  syncFts(b);
  db.prepare('DELETE FROM sync_tombstones WHERE url_hash = ?').run(urlHash);
  return b;
}

// 按 URL 取未删除的现有收藏（用于「该网址已收藏」时定位现有记录）
export function getBookmarkByUrl(url: string, includeTrashed = false): Bookmark | null {
  const row = db
    .prepare('SELECT id FROM bookmarks WHERE url_hash = ?' + (includeTrashed ? '' : ' AND deleted_at IS NULL'))
    .get(hashUrl(url)) as any;
  return row ? getBookmark(row.id) : null;
}

export function getBookmark(id: number): Bookmark | null {
  const row = db.prepare('SELECT * FROM bookmarks WHERE id = ?').get(id) as any;
  if (!row) return null;
  return mapBookmark(row, getBookmarkTags(id));
}

type UpdatablePatch = Partial<
  Pick<
    Bookmark,
    | 'title'
    | 'description'
    | 'categoryId'
    | 'favicon'
    | 'image'
    | 'contentExcerpt'
    | 'status'
    | 'aiState'
    | 'visitedAt'
    | 'favorite'
    | 'pinned'
    | 'readState'
    | 'notes'
    | 'visitCount'
    | 'httpStatus'
    | 'lastCheckAt'
    | 'sortIndex'
    | 'deletedAt'
  >
> & { tags?: string[] };

export function updateBookmark(id: number, patch: UpdatablePatch): Bookmark {
  const fields: string[] = [];
  const values: any[] = [];
  const map: Record<string, string> = {
    title: 'title',
    description: 'description',
    categoryId: 'category_id',
    favicon: 'favicon',
    image: 'image',
    contentExcerpt: 'content_excerpt',
    status: 'status',
    aiState: 'ai_state',
    visitedAt: 'visited_at',
    favorite: 'favorite',
    pinned: 'pinned',
    readState: 'read_state',
    notes: 'notes',
    visitCount: 'visit_count',
    httpStatus: 'http_status',
    lastCheckAt: 'last_check_at',
    sortIndex: 'sort_index',
    deletedAt: 'deleted_at',
  };
  for (const [k, col] of Object.entries(map)) {
    if (k in patch && (patch as any)[k] !== undefined) {
      let v = (patch as any)[k];
      if (k === 'favorite' || k === 'pinned') v = v ? 1 : 0;
      fields.push(`${col} = ?`);
      values.push(v);
    }
  }
  fields.push('updated_at = ?');
  values.push(Date.now());
  if (fields.length > 1) {
    db.prepare(`UPDATE bookmarks SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);
  }
  if (patch.tags) setBookmarkTags(id, patch.tags);
  const b = getBookmark(id)!;
  syncFts(b);
  return b;
}

// 硬删除（清空回收站时用）
export function deleteBookmark(id: number): void {
  db.transaction(() => {
    const row = db.prepare('SELECT url_hash, updated_at FROM bookmarks WHERE id = ?').get(id) as { url_hash: string; updated_at: number } | undefined;
    if (row) db.prepare('INSERT INTO sync_tombstones VALUES (?, ?) ON CONFLICT(url_hash) DO UPDATE SET updated_at=excluded.updated_at').run(row.url_hash, Math.max(Date.now(), row.updated_at + 1));
    db.prepare('DELETE FROM bookmarks WHERE id = ?').run(id);
    db.prepare('DELETE FROM fts_bookmarks WHERE rowid = ?').run(id);
  })();
}

// 仅允许永久删除回收站内记录；混入正常收藏时整批拒绝。
export function purgeTrashedBookmarks(ids: number[]): void {
  db.transaction(() => {
    for (const id of ids) {
      const b = getBookmark(id);
      if (b && !b.deletedAt) throw new Error('请先将收藏移入回收站');
    }
    for (const id of ids) deleteBookmark(id);
  })();
}

// 软删除（进回收站）
export function trashBookmarks(ids: number[]): void {
  const now = Date.now();
  const tx = db.transaction((arr: number[]) => {
    const stmt = db.prepare("UPDATE bookmarks SET deleted_at = ?, updated_at = ?, ai_state = CASE WHEN ai_state IN ('pending', 'processing') THEN 'skipped' ELSE ai_state END WHERE id = ?");
    for (const id of arr) stmt.run(now, now, id);
  });
  tx(ids);
}

export function restoreBookmarks(ids: number[]): void {
  const now = Date.now();
  const tx = db.transaction((arr: number[]) => {
    const stmt = db.prepare('UPDATE bookmarks SET deleted_at = NULL, updated_at = ? WHERE id = ?');
    for (const id of arr) stmt.run(now, id);
  });
  tx(ids);
}

export function emptyTrash(): number {
  const rows = db.prepare('SELECT id FROM bookmarks WHERE deleted_at IS NOT NULL').all() as { id: number }[];
  const tx = db.transaction(() => {
    for (const r of rows) deleteBookmark(r.id);
  });
  tx();
  return rows.length;
}

// 批量操作
export function moveBookmarks(ids: number[], categoryId: number | null): void {
  const now = Date.now();
  const tx = db.transaction((arr: number[]) => {
    const stmt = db.prepare('UPDATE bookmarks SET category_id = ?, updated_at = ? WHERE id = ?');
    for (const id of arr) stmt.run(categoryId, now, id);
  });
  tx(ids);
}

export function addTagToBookmarks(ids: number[], tag: string): void {
  if (typeof tag !== 'string' || !tag.trim()) throw new Error('标签不能为空');
  if (!ids.length) return;
  const now = Date.now();
  const tx = db.transaction((arr: number[]) => {
    const tagId = ensureTag(tag);
    const link = db.prepare('INSERT OR IGNORE INTO bookmark_tags (bookmark_id, tag_id) VALUES (?, ?)');
    const touch = db.prepare('UPDATE bookmarks SET updated_at = ? WHERE id = ?');
    for (const id of arr) {
      link.run(id, tagId);
      touch.run(now, id);
      const b = getBookmark(id);
      if (b) syncFts(b);
    }
  });
  tx(ids);
}

export function setFavoriteMany(ids: number[], favorite: boolean): void {
  const now = Date.now();
  const tx = db.transaction((arr: number[]) => {
    const stmt = db.prepare('UPDATE bookmarks SET favorite = ?, updated_at = ? WHERE id = ?');
    for (const id of arr) stmt.run(favorite ? 1 : 0, now, id);
  });
  tx(ids);
}

export function setReadStateMany(ids: number[], readState: ReadState): void {
  const now = Date.now();
  const tx = db.transaction((arr: number[]) => {
    const stmt = db.prepare('UPDATE bookmarks SET read_state = ?, updated_at = ? WHERE id = ?');
    for (const id of arr) stmt.run(readState, now, id);
  });
  tx(ids);
}

// 记录一次访问
export function recordVisit(id: number): void {
  const now = Date.now();
  db.prepare(
    'UPDATE bookmarks SET visited_at = ?, visit_count = COALESCE(visit_count,0) + 1, read_state = ?, updated_at = ? WHERE id = ?',
  ).run(now, 'read', now, id);
  db.prepare('INSERT INTO visits (bookmark_id, visited_at) VALUES (?, ?)').run(id, now);
}

function buildWhere(q: BookmarkQuery): { from: string; where: string[]; params: any[] } {
  const where: string[] = [];
  const params: any[] = [];
  const from = 'FROM bookmarks b';

  where.push(q.trashed ? 'b.deleted_at IS NOT NULL' : 'b.deleted_at IS NULL');

  if (q.keyword?.trim()) {
    // unicode61 不会为中文自动分词；补充逐词字面子串检索，并覆盖笔记和标签。
    const terms = q.keyword.trim().split(/\s+/).slice(0, 20);
    const literal = terms.map(() => `(b.title LIKE ? ESCAPE '!' OR b.description LIKE ? ESCAPE '!' OR COALESCE(b.content_excerpt, '') LIKE ? ESCAPE '!' OR b.url LIKE ? ESCAPE '!' OR COALESCE(b.notes, '') LIKE ? ESCAPE '!' OR EXISTS (SELECT 1 FROM bookmark_tags bt JOIN tags t ON t.id = bt.tag_id WHERE bt.bookmark_id = b.id AND t.name LIKE ? ESCAPE '!'))`).join(' AND ');
    where.push(`(b.id IN (SELECT rowid FROM fts_bookmarks WHERE fts_bookmarks MATCH ?) OR (${literal}))`);
    params.push(ftsQuery(q.keyword));
    for (const term of terms) {
      const pattern = `%${term.replace(/[!%_]/g, '!$&')}%`;
      params.push(pattern, pattern, pattern, pattern, pattern, pattern);
    }
  }
  if (q.ids) {
    const ids = [...new Set(q.ids.filter((id) => Number.isSafeInteger(id) && id > 0))];
    where.push(ids.length ? `b.id IN (${ids.map(() => '?').join(',')})` : '0');
    params.push(...ids);
  }
  if (q.uncategorized) where.push('(b.category_id IS NULL OR b.category_id IN (SELECT id FROM categories WHERE is_system = 1))');
  if (q.categoryId != null) {
    // 点击分类显示「自身 + 所有子孙」的收藏，与侧栏聚合计数一致
    const ids = categorySubtreeIds(q.categoryId);
    const category = db.prepare('SELECT is_system FROM categories WHERE id = ?').get(q.categoryId) as { is_system: number } | undefined;
    where.push(`(b.category_id IN (${ids.map(() => '?').join(',')})${category?.is_system ? ' OR b.category_id IS NULL' : ''})`);
    params.push(...ids);
  }
  if (q.status) {
    where.push('b.status = ?');
    params.push(q.status);
  }
  if (q.favorite) where.push('b.favorite = 1');
  if (q.pinned) where.push('b.pinned = 1');
  if (q.readState) {
    where.push('b.read_state = ?');
    params.push(q.readState);
  }
  if (q.domain) {
    let host = '';
    try { host = new URL(q.domain.includes('://') ? q.domain : 'https://' + q.domain).hostname.toLowerCase(); } catch { /* Invalid host must not broaden the query. */ }
    if (!host) where.push('0');
    else {
      where.push("(url_hostname(b.url) = ? OR url_hostname(b.url) LIKE ? ESCAPE '!')");
      params.push(host, '%.' + host.replace(/[!%_]/g, (c) => '!' + c));
    }
  }
  if (q.createdFrom != null) {
    where.push('b.created_at >= ?');
    params.push(q.createdFrom);
  }
  if (q.createdTo != null) {
    where.push('b.created_at <= ?');
    params.push(q.createdTo);
  }
  // 最近 N 天（智能文件夹「最近添加」规则）
  if (q.recentDays != null && q.recentDays > 0) {
    where.push('b.created_at >= ?');
    params.push(Date.now() - q.recentDays * 86400000);
  }
  // 是否已 AI 富化（ai_state='done'）
  if (q.hasAi != null) {
    where.push(q.hasAi ? "b.ai_state = 'done'" : "b.ai_state != 'done'");
  }
  // 单标签（向后兼容）
  if (q.tag) {
    where.push(
      'b.id IN (SELECT bt.bookmark_id FROM bookmark_tags bt JOIN tags t ON t.id = bt.tag_id WHERE t.name = ?)',
    );
    params.push(q.tag);
  }
  // 多标签（AND）
  if (q.tags?.length) {
    for (const tg of q.tags) {
      where.push(
        'b.id IN (SELECT bt.bookmark_id FROM bookmark_tags bt JOIN tags t ON t.id = bt.tag_id WHERE t.name = ?)',
      );
      params.push(tg);
    }
  }
  return { from, where, params };
}

export function queryBookmarks(q: BookmarkQuery): { items: Bookmark[]; total: number } {
  const { from, where, params } = buildWhere(q);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  let order = 'b.created_at DESC';
  switch (q.sort) {
    case 'created_asc':
      order = 'b.created_at ASC';
      break;
    case 'title_asc':
      order = 'b.title ASC';
      break;
    case 'visited_desc':
      order = 'b.visited_at DESC';
      break;
    case 'visit_count_desc':
      order = 'b.visit_count DESC, b.created_at DESC';
      break;
    case 'manual':
      order = 'b.sort_index ASC, b.created_at DESC';
      break;
  }
  // 置顶优先（回收站视图不置顶）
  const pinnedFirst = q.trashed ? '' : 'b.pinned DESC, ';

  const total = (
    db.prepare(`SELECT COUNT(*) AS c ${from} ${whereSql}`).get(...params) as { c: number }
  ).c;

  const limit = Number.isFinite(q.limit) ? Math.max(1, Math.min(100000, Math.floor(q.limit!))) : 50;
  const offset = Number.isFinite(q.offset) ? Math.max(0, Math.floor(q.offset!)) : 0;
  const rows = db
    .prepare(`SELECT b.* ${from} ${whereSql} ORDER BY ${pinnedFirst}${order}, b.id ${q.sort === 'created_asc' || q.sort === 'title_asc' ? 'ASC' : 'DESC'} LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as any[];
  const items = rows.map((r) => mapBookmark(r, getBookmarkTags(r.id)));
  return { items, total };
}

// 取下一批待处理 AI 任务
export function nextPendingBookmarks(limit: number): Bookmark[] {
  const rows = db
    .prepare(`SELECT * FROM bookmarks WHERE ai_state = 'pending' AND deleted_at IS NULL ORDER BY created_at ASC LIMIT ?`)
    .all(limit) as any[];
  return rows.map((r) => mapBookmark(r, getBookmarkTags(r.id)));
}

export function countByAiState(): Record<string, number> {
  const rows = db
    .prepare('SELECT ai_state, COUNT(*) AS c FROM bookmarks WHERE deleted_at IS NULL GROUP BY ai_state')
    .all() as any[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.ai_state] = r.c;
  return out;
}

export function trashCount(): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM bookmarks WHERE deleted_at IS NOT NULL').get() as { c: number }).c;
}

// ---------- 重复检测 ----------
export function findDuplicates(): { url: string; ids: number[] }[] {
  // 同一规范化 URL（去 query/fragment/末尾斜杠）视为重复
  const rows = db.prepare('SELECT id, url FROM bookmarks WHERE deleted_at IS NULL ORDER BY created_at ASC').all() as any[];
  const groups = new Map<string, number[]>();
  for (const r of rows) {
    const key = normalizeForDup(r.url);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r.id);
  }
  const out: { url: string; ids: number[] }[] = [];
  for (const [, ids] of groups) {
    if (ids.length > 1) {
      const first = db.prepare('SELECT url FROM bookmarks WHERE id = ?').get(ids[0]) as any;
      out.push({ url: first.url, ids });
    }
  }
  return out;
}

function normalizeForDup(url: string): string {
  try {
    const u = new URL(url);
    const p = u.pathname.replace(/\/$/, '');
    return `${u.hostname}${p}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

// 合并重复：保留首个，其余软删除
export function mergeDuplicates(): number {
  const dups = findDuplicates();
  let merged = 0;
  for (const g of dups) {
    const [, ...rest] = g.ids;
    trashBookmarks(rest);
    merged += rest.length;
  }
  return merged;
}

// ---------- 快照 ----------
export function setSnapshot(id: number, content: string): void {
  const now = Date.now();
  db.prepare(
    'INSERT INTO snapshots (bookmark_id, content, saved_at) VALUES (?, ?, ?) ON CONFLICT(bookmark_id) DO UPDATE SET content = ?, saved_at = ?',
  ).run(id, content, now, content, now);
  db.prepare('UPDATE bookmarks SET snapshot = 1, snapshot_at = ? WHERE id = ?').run(now, id);
}

export function getSnapshot(id: number): { content: string; savedAt: number } | null {
  const row = db.prepare('SELECT content, saved_at FROM snapshots WHERE bookmark_id = ?').get(id) as any;
  return row ? { content: row.content, savedAt: row.saved_at } : null;
}

// ---------- 智能文件夹 ----------
export function listSmartFolders(): SmartFolder[] {
  const rows = db.prepare('SELECT * FROM smart_folders ORDER BY sort, id').all() as any[];
  return rows.map(mapSmartFolder);
}

export function createSmartFolder(name: string, rule: SmartFolderRule, color?: string): SmartFolder {
  const now = Date.now();
  const maxSort = db.prepare('SELECT COALESCE(MAX(sort),0) AS m FROM smart_folders').get() as { m: number };
  const info = db
    .prepare('INSERT INTO smart_folders (name, icon, color, rule, sort, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(name, 'filter', color ?? '#13c2c2', JSON.stringify(rule), maxSort.m + 1, now);
  return mapSmartFolder(db.prepare('SELECT * FROM smart_folders WHERE id = ?').get(info.lastInsertRowid));
}

export function deleteSmartFolder(id: number): void {
  db.prepare('DELETE FROM smart_folders WHERE id = ?').run(id);
}

// ---------- 统计 ----------
export function statsOverview(): StatsOverview {
  const base = 'FROM bookmarks WHERE deleted_at IS NULL';
  const num = (sql: string, ...p: any[]): number => (db.prepare(sql).get(...p) as { c: number }).c;
  const total = num(`SELECT COUNT(*) AS c ${base}`);
  const active = num(`SELECT COUNT(*) AS c ${base} AND status = 'active'`);
  const dead = num(`SELECT COUNT(*) AS c ${base} AND status = 'dead'`);
  const unread = num(`SELECT COUNT(*) AS c ${base} AND read_state = 'unread'`);
  const favorite = num(`SELECT COUNT(*) AS c ${base} AND favorite = 1`);
  const withAi = num(`SELECT COUNT(*) AS c ${base} AND ai_state = 'done'`);

  const all = db.prepare(`SELECT url FROM bookmarks WHERE deleted_at IS NULL`).all() as any[];
  const domainMap = new Map<string, number>();
  for (const r of all) {
    let host = '';
    try {
      host = new URL(r.url).hostname.replace(/^www\./, '');
    } catch {
      host = '其他';
    }
    domainMap.set(host, (domainMap.get(host) ?? 0) + 1);
  }
  const topDomains = [...domainMap.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const topVisited = (
    db
      .prepare(
        `SELECT id, title, url, visit_count AS visitCount ${base} AND visit_count > 0 ORDER BY visit_count DESC LIMIT 8`,
      )
      .all() as any[]
  ).map((r) => ({ id: r.id, title: r.title || r.url, url: r.url, visitCount: r.visitCount }));

  // 近 90 天 heatmap（按收藏创建日）
  const since = Date.now() - 90 * 86400000;
  const rows = db
    .prepare('SELECT created_at FROM bookmarks WHERE deleted_at IS NULL AND created_at >= ?')
    .all(since) as any[];
  const dayMap = new Map<string, number>();
  for (const r of rows) {
    const d = new Date(r.created_at).toISOString().slice(0, 10);
    dayMap.set(d, (dayMap.get(d) ?? 0) + 1);
  }
  const heatmap = [...dayMap.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => (a.date < b.date ? -1 : 1));

  return { total, active, dead, unread, favorite, withAi, topDomains, topVisited, heatmap };
}

// ---------- 同步 ----------
// 导出指定时间后变更的收藏（含软删除墓碑），用于推送到云端
export function changedSince(since: number): SyncPushItem[] {
  const rows = db.prepare('SELECT * FROM bookmarks WHERE updated_at > ?').all(since) as any[];
  const cats = new Map(listCategories().map((c) => [c.id, c.name]));
  const live: SyncPushItem[] = rows.map((r) => ({
    urlHash: r.url_hash,
    url: r.url,
    title: r.title,
    description: r.description,
    favicon: r.favicon,
    image: r.image,
    categoryName: r.category_id ? cats.get(r.category_id) ?? null : null,
    tags: getBookmarkTags(r.id),
    favorite: !!r.favorite,
    pinned: !!r.pinned,
    readState: (r.read_state ?? 'unread') as ReadState,
    notes: r.notes ?? '',
    status: r.status,
    deleted: !!r.deleted_at,
    updatedAt: r.updated_at,
  }));
  const deleted = db.prepare('SELECT * FROM sync_tombstones WHERE updated_at > ?').all(since) as { url_hash: string; updated_at: number }[];
  return live.concat(deleted.map((row) => ({ urlHash: row.url_hash, url: '', title: '', description: '', notes: '', tags: [], favorite: false,
    pinned: false, readState: 'unread' as const, status: 'active' as const, deleted: true, updatedAt: row.updated_at })));
}

// 应用云端下发的变更（按 url_hash 做 last-write-wins）
export function applyRemote(items: SyncPushItem[]): { applied: number } {
  let applied = 0;
  const tx = db.transaction((list: SyncPushItem[]) => {
    for (const remote of list) {
      // Older cloud clients used the legacy hash. Recompute by actual URL to avoid duplicates.
      const minimalDelete = remote.deleted === true && remote.url === '' && /^[a-f0-9]{40}$/.test(remote.urlHash);
      const it = { ...remote, urlHash: minimalDelete ? remote.urlHash : hashUrl(remote.url) };
      const tombstone = db.prepare('SELECT updated_at FROM sync_tombstones WHERE url_hash = ?').get(it.urlHash) as { updated_at: number } | undefined;
      if (tombstone && tombstone.updated_at >= it.updatedAt) continue;
      const local = db.prepare('SELECT id, updated_at FROM bookmarks WHERE url_hash = ?').get(it.urlHash) as any;
      if (local && local.updated_at >= it.updatedAt) continue; // 本地更新，跳过
      if (minimalDelete) {
        if (local) db.prepare('UPDATE bookmarks SET deleted_at=?, updated_at=? WHERE id=?').run(it.updatedAt, it.updatedAt, local.id);
        else db.prepare('INSERT INTO sync_tombstones VALUES (?, ?) ON CONFLICT(url_hash) DO UPDATE SET updated_at=excluded.updated_at').run(it.urlHash, it.updatedAt);
        applied++;
        continue;
      }
      db.prepare('DELETE FROM sync_tombstones WHERE url_hash = ?').run(it.urlHash);
      const categoryId = it.categoryName ? ensureCategoryByName(it.categoryName) : null;
      if (local) {
        db.prepare(
          `UPDATE bookmarks SET url=?, title=?, description=?, favicon=?, image=?, category_id=?, favorite=?, pinned=?, read_state=?, notes=?, status=?, deleted_at=?, updated_at=? WHERE id=?`,
        ).run(
          it.url,
          it.title,
          it.description,
          it.favicon ?? null,
          it.image ?? null,
          categoryId,
          it.favorite ? 1 : 0,
          it.pinned ? 1 : 0,
          it.readState,
          it.notes,
          it.status,
          it.deleted ? it.updatedAt : null,
          it.updatedAt,
          local.id,
        );
        setBookmarkTags(local.id, it.tags);
        const b = getBookmark(local.id);
        if (b) syncFts(b);
      } else {
        const info = db
          .prepare(
            `INSERT INTO bookmarks (url, url_hash, title, description, favicon, image, category_id, status, ai_state, favorite, pinned, read_state, notes, deleted_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'skipped', ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            it.url,
            it.urlHash,
            it.title,
            it.description,
            it.favicon ?? null,
            it.image ?? null,
            categoryId,
            it.status,
            it.favorite ? 1 : 0,
            it.pinned ? 1 : 0,
            it.readState,
            it.notes,
            it.deleted ? it.updatedAt : null,
            it.updatedAt,
            it.updatedAt,
          );
        const id = Number(info.lastInsertRowid);
        setBookmarkTags(id, it.tags);
        const b = getBookmark(id);
        if (b) syncFts(b);
      }
      applied++;
    }
  });
  tx(items);
  return { applied };
}

// ---------- Settings ----------
export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any;
  return row ? row.value : null;
}

export function setSetting(key: string, value: string): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').run(
    key,
    value,
    value,
  );
}

// ---------- 嵌入向量（知识图谱 / 语义检索） ----------
// 所有未删除收藏，附带用于嵌入/图谱展示的文本与归属。
export function listBookmarksForGraph(): {
  id: number;
  title: string;
  description: string;
  url: string;
  contentExcerpt: string | null;
  categoryId: number | null;
  favorite: boolean;
  tags: string[];
}[] {
  const rows = db
    .prepare(
      `SELECT id, title, description, url, content_excerpt, category_id, favorite
       FROM bookmarks WHERE deleted_at IS NULL ORDER BY id`,
    )
    .all() as any[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title ?? '',
    description: r.description ?? '',
    url: r.url ?? '',
    contentExcerpt: r.content_excerpt ?? null,
    categoryId: r.category_id ?? null,
    favorite: !!r.favorite,
    tags: getBookmarkTags(r.id),
  }));
}

export function upsertEmbedding(bookmarkId: number, model: string, vec: Float32Array): void {
  const buf = Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
  db.prepare(
    `INSERT INTO embeddings (bookmark_id, model, dim, vec, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(bookmark_id) DO UPDATE SET model = ?, dim = ?, vec = ?, updated_at = ?`,
  ).run(bookmarkId, model, vec.length, buf, Date.now(), model, vec.length, buf, Date.now());
}

export function clearEmbeddings(): void {
  db.prepare('DELETE FROM embeddings').run();
}

// 读取所有向量（仅未删除收藏）。返回与 listBookmarksForGraph 对齐的 id→向量。
export function getAllEmbeddings(): { id: number; model: string; vec: Float32Array }[] {
  const rows = db
    .prepare(
      `SELECT e.bookmark_id AS id, e.model AS model, e.dim AS dim, e.vec AS vec
       FROM embeddings e JOIN bookmarks b ON b.id = e.bookmark_id
       WHERE b.deleted_at IS NULL`,
    )
    .all() as any[];
  return rows.map((r) => {
    const buf: Buffer = r.vec;
    const vec = new Float32Array(buf.buffer, buf.byteOffset, r.dim);
    // 拷贝一份，避免共享底层 buffer
    return { id: r.id, model: r.model, vec: Float32Array.from(vec) };
  });
}

export function embeddingStats(): { total: number; embedded: number; dim: number; model: string } {
  const total = (db.prepare('SELECT COUNT(*) AS n FROM bookmarks WHERE deleted_at IS NULL').get() as any).n as number;
  const embedded = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM embeddings e JOIN bookmarks b ON b.id = e.bookmark_id WHERE b.deleted_at IS NULL`,
      )
      .get() as any
  ).n as number;
  const meta = db.prepare('SELECT dim, model FROM embeddings LIMIT 1').get() as any;
  return { total, embedded, dim: meta?.dim ?? 0, model: meta?.model ?? '' };
}

// ---------- mappers / helpers ----------
function mapCategory(r: any): Category {
  return {
    id: r.id,
    parentId: r.parent_id,
    name: r.name,
    icon: r.icon,
    color: r.color,
    sort: r.sort,
    isSystem: !!r.is_system,
    createdAt: r.created_at,
  };
}

function mapSmartFolder(r: any): SmartFolder {
  let rule: SmartFolderRule = {};
  try {
    rule = JSON.parse(r.rule);
  } catch {
    rule = {};
  }
  return { id: r.id, name: r.name, icon: r.icon, color: r.color, rule, sort: r.sort, createdAt: r.created_at };
}

function mapBookmark(r: any, tags: string[]): Bookmark {
  return {
    id: r.id,
    url: r.url,
    urlHash: r.url_hash,
    title: r.title,
    description: r.description,
    favicon: r.favicon,
    image: r.image,
    categoryId: r.category_id,
    contentExcerpt: r.content_excerpt,
    status: r.status,
    aiState: r.ai_state,
    tags,
    favorite: !!r.favorite,
    pinned: !!r.pinned,
    readState: (r.read_state ?? 'unread') as ReadState,
    notes: r.notes ?? '',
    visitCount: r.visit_count ?? 0,
    hasSnapshot: !!r.snapshot,
    snapshotAt: r.snapshot_at ?? null,
    httpStatus: r.http_status ?? null,
    lastCheckAt: r.last_check_at ?? null,
    sortIndex: r.sort_index ?? 0,
    deletedAt: r.deleted_at ?? null,
    visitedAt: r.visited_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// 把用户输入转成安全的 FTS 前缀匹配查询
function ftsQuery(keyword: string): string {
  const terms = keyword
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/["*]/g, ''))
    .filter(Boolean)
    .map((t) => `"${t}"*`);
  return terms.join(' ') || '""';
}

// Atomic compare-and-set prevents a delayed autosave overwriting another window/editor.
export function saveBookmarkNotes(id: number, notes: string, expectedNotes: string): { bookmark: Bookmark; conflict: boolean } {
  if (typeof notes !== 'string' || notes.length > 100000 || typeof expectedNotes !== 'string') throw new Error('笔记格式无效或超过 100000 字符');
  return db.transaction(() => {
    const current = getBookmark(id);
    if (!current || current.deletedAt) throw new Error('收藏不存在或已移入回收站，草稿未覆盖数据库');
    if (current.notes !== expectedNotes) return { bookmark: current, conflict: true };
    return { bookmark: updateBookmark(id, { notes }), conflict: false };
  })();
}
