import { create } from 'zustand';
import { mergeSmartQuery } from './workflow';
import type {
  Bookmark,
  BookmarkQuery,
  Category,
  LicenseStatus,
  ReadState,
  SmartFolder,
  Tag,
} from '@zhicang/shared';

const PAGE_SIZE = 50;
let listRequest = 0;
let selectionRequest = 0;

interface AiStatus {
  counts: Record<string, number>;
  pending: number;
}

// 侧栏导航：全部 / 星标 / 未读 / 回收站 / 分类 / 智能文件夹
export type NavKey =
  | { type: 'all' }
  | { type: 'inbox' }
  | { type: 'favorite' }
  | { type: 'unread' }
  | { type: 'trash' }
  | { type: 'category'; id: number }
  | { type: 'smart'; id: number };

interface State {
  categories: Category[];
  categoryCounts: Record<number, number>;
  tags: Tag[];
  tagCounts: Record<string, number>;
  smartFolders: SmartFolder[];
  bookmarks: Bookmark[];
  total: number;
  trashCnt: number;
  query: BookmarkQuery;
  nav: NavKey;
  view: 'list' | 'card';
  dark: boolean;
  selectedId: number | null;
  selected: Bookmark | null;
  selectedIds: number[];
  aiStatus: AiStatus;
  license: LicenseStatus;
  loading: boolean;
  error: string | null;
  lastSyncAt: number;
  syncing: boolean;

  init: () => Promise<void>;
  loadCategories: () => Promise<void>;
  loadTags: () => Promise<void>;
  loadSmartFolders: () => Promise<void>;
  loadTrashCount: () => Promise<void>;
  loadBookmarks: () => Promise<void>;
  setQuery: (patch: Partial<BookmarkQuery>) => Promise<void>;
  clearFilters: () => Promise<void>;
  searchAll: () => Promise<void>;
  revealBookmark: (id: number) => Promise<void>;
  setNav: (nav: NavKey) => Promise<void>;
  toggleTagFilter: (tag: string) => Promise<void>;
  setView: (v: 'list' | 'card') => void;
  toggleDark: () => void;
  select: (id: number | null) => Promise<void>;
  visit: (id: number) => Promise<void>;
  addBookmark: (input: { url: string; title?: string; categoryId?: number | null; tags?: string[]; restoreTrashed?: boolean }) => Promise<{ duplicate: boolean; trashed?: boolean; restored?: boolean; id?: number }>;
  removeBookmark: (id: number) => Promise<void>;
  refreshLicense: () => Promise<void>;
  applyUpdatedBookmark: (b: Bookmark) => void;
  setAiStatus: (s: AiStatus) => void;

  // 选择
  toggleSelect: (id: number) => void;
  setSelected: (ids: number[]) => void;
  selectAll: () => void;
  clearSelection: () => void;

  // 单条操作
  toggleFavorite: (b: Bookmark) => Promise<void>;
  togglePin: (b: Bookmark) => Promise<void>;
  toggleRead: (b: Bookmark) => Promise<void>;

  // 批量操作
  trashSelected: () => Promise<void>;
  purgeSelected: () => Promise<void>;
  restoreSelected: () => Promise<void>;
  moveSelected: (categoryId: number | null) => Promise<void>;
  tagSelected: (tag: string) => Promise<void>;
  favoriteSelected: (fav: boolean) => Promise<void>;
  readSelected: (rs: ReadState) => Promise<void>;
  reenrichSelected: () => Promise<void>;

  refreshSidebarCounts: () => Promise<void>;
  runSync: () => Promise<{ pushed: number; pulled: number } | null>;
}

function navToQuery(nav: NavKey, base: BookmarkQuery): BookmarkQuery {
  const q: BookmarkQuery = {
    sort: base.sort,
    limit: PAGE_SIZE,
    offset: 0,
    keyword: base.keyword,
    tags: base.tags,
    domain: base.domain,
    status: base.status,
    createdFrom: base.createdFrom,
    createdTo: base.createdTo,
  };
  switch (nav.type) {
    case 'inbox':
      q.uncategorized = true;
      break;
    case 'favorite':
      q.favorite = true;
      break;
    case 'unread':
      q.readState = 'unread';
      break;
    case 'trash':
      q.trashed = true;
      break;
    case 'category':
      q.categoryId = nav.id;
      break;
  }
  return q;
}

export const useStore = create<State>((set, get) => ({
  categories: [],
  categoryCounts: {},
  tags: [],
  tagCounts: {},
  smartFolders: [],
  bookmarks: [],
  total: 0,
  trashCnt: 0,
  query: { sort: 'created_desc', limit: PAGE_SIZE, offset: 0 },
  nav: { type: 'all' },
  view: localStorage.getItem('zc-view') === 'list' ? 'list' : 'card',
  dark: localStorage.getItem('zc-dark') === '1',
  selectedId: null,
  selected: null,
  selectedIds: [],
  aiStatus: { counts: {}, pending: 0 },
  license: { activated: false },
  loading: false,
  error: null,
  lastSyncAt: 0,
  syncing: false,

  init: async () => {
    await Promise.all([
      get().loadCategories(),
      get().loadTags(),
      get().loadSmartFolders(),
      get().loadTrashCount(),
      get().refreshLicense(),
    ]);
    await get().loadBookmarks();
    const [s, lastSyncAt] = await Promise.all([window.api.ai.status(), window.api.sync.lastAt()]);
    set({ aiStatus: s, lastSyncAt });
  },

  loadCategories: async () => {
    const [categories, counts] = await Promise.all([
      window.api.categories.list(),
      window.api.categories.counts(),
    ]);
    set({ categories, categoryCounts: counts });
  },
  loadTags: async () => {
    const [tags, counts] = await Promise.all([window.api.tags.list(), window.api.tags.counts()]);
    set({ tags, tagCounts: counts });
  },
  loadSmartFolders: async () => set({ smartFolders: await window.api.smart.list() }),
  loadTrashCount: async () => set({ trashCnt: await window.api.bookmarks.trashCount() }),

  loadBookmarks: async () => {
    const request = ++listRequest;
    set({ loading: true, error: null });
    const nav = get().nav;
    let query = get().query;
    // 智能文件夹：用其规则覆盖查询
    if (nav.type === 'smart') {
      const sf = get().smartFolders.find((f) => f.id === nav.id);
      if (sf) {
        query = mergeSmartQuery(sf.rule, get().query);
      }
    }
    try {
      const { items, total } = await window.api.bookmarks.query(query);
      if (request !== listRequest) return;
      if (total > 0 && !items.length && (query.offset ?? 0) > 0) {
        set({ query: { ...get().query, offset: Math.floor((total - 1) / PAGE_SIZE) * PAGE_SIZE } });
        return get().loadBookmarks();
      }
      set({ bookmarks: items, total, loading: false });
    } catch (e) {
      if (request === listRequest) set({ loading: false, error: String((e as Error).message ?? e) });
    }
  },

  setQuery: async (patch) => {
    const query = { ...get().query, ...patch, offset: patch.offset ?? 0 };
    set({ query, selectedIds: [] });
    await get().loadBookmarks();
  },

  setNav: async (nav) => {
    const query = navToQuery(nav, get().query);
    ++selectionRequest;
    set({ nav, query, selectedIds: [], selectedId: null, selected: null });
    await get().loadBookmarks();
  },

  clearFilters: async () => {
    set({ query: navToQuery(get().nav, { sort: get().query.sort }), selectedIds: [] });
    await get().loadBookmarks();
  },
  searchAll: async () => {
    set({ nav: { type: 'all' }, query: { keyword: get().query.keyword, sort: get().query.sort, limit: PAGE_SIZE, offset: 0 }, selectedIds: [] });
    await get().loadBookmarks();
  },
  revealBookmark: async (id) => {
    const request = ++selectionRequest;
    const b = await window.api.bookmarks.get(id);
    if (request !== selectionRequest) return;
    if (!b) throw new Error('该收藏已不存在，请刷新检索结果');
    set({ nav: { type: b.deletedAt ? 'trash' : 'all' }, query: { ids: [id], trashed: !!b.deletedAt, sort: 'created_desc', limit: PAGE_SIZE, offset: 0 }, selected: b, selectedId: id, selectedIds: [] });
    await get().loadBookmarks();
  },

  toggleTagFilter: async (tag) => {
    const cur = get().query.tags ?? [];
    const tags = cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag];
    await get().setQuery({ tags: tags.length ? tags : undefined });
  },

  setView: (v) => { localStorage.setItem('zc-view', v); set({ view: v }); },
  toggleDark: () => { const dark = !get().dark; localStorage.setItem('zc-dark', dark ? '1' : '0'); set({ dark }); },

  select: async (id) => {
    const request = ++selectionRequest;
    if (id == null) return set({ selectedId: null, selected: null });
    const b = await window.api.bookmarks.get(id);
    if (request === selectionRequest) set({ selectedId: b ? id : null, selected: b });
  },

  visit: async (id) => {
    await window.api.bookmarks.visit(id);
    const b = await window.api.bookmarks.get(id);
    if (b) get().applyUpdatedBookmark(b);
  },

  addBookmark: async (input) => {
    const r: any = await window.api.bookmarks.create(input);
    const id = r?.bookmark?.id;
    if (r.trashed) return { duplicate: true, trashed: true, id };
    await get().refreshSidebarCounts();
    if (id) {
      if (r.duplicate || r.restored) await get().revealBookmark(id);
      else {
        const nav: NavKey = input.categoryId != null ? { type: 'category', id: input.categoryId } : { type: 'inbox' };
        set({ nav, query: navToQuery(nav, { sort: 'created_desc' }), selectedIds: [] });
        await get().loadBookmarks(); await get().select(id);
      }
    }
    return { duplicate: !!r?.duplicate, restored: !!r?.restored, id };
  },

  removeBookmark: async (id) => {
    await window.api.bookmarks.remove(id);
    if (get().selectedId === id) set({ selectedId: null, selected: null });
    await Promise.all([get().loadBookmarks(), get().refreshSidebarCounts()]);
  },

  refreshLicense: async () => set({ license: await window.api.license.status() }),

  applyUpdatedBookmark: (b) => {
    set((state) => ({
      bookmarks: state.bookmarks.map((x) => (x.id === b.id ? b : x)),
      selected: state.selectedId === b.id ? b : state.selected,
    }));
  },

  setAiStatus: (s) => set({ aiStatus: s }),

  toggleSelect: (id) =>
    set((s) => ({
      selectedIds: s.selectedIds.includes(id)
        ? s.selectedIds.filter((x) => x !== id)
        : [...s.selectedIds, id],
    })),
  setSelected: (ids) => set({ selectedIds: ids }),
  selectAll: () => set((s) => ({ selectedIds: s.bookmarks.map((b) => b.id) })),
  clearSelection: () => set({ selectedIds: [] }),

  toggleFavorite: async (b) => {
    const updated = await window.api.bookmarks.update(b.id, { favorite: !b.favorite });
    get().applyUpdatedBookmark(updated);
    await get().loadBookmarks();
  },
  togglePin: async (b) => {
    await window.api.bookmarks.update(b.id, { pinned: !b.pinned });
    await get().loadBookmarks();
  },
  toggleRead: async (b) => {
    const updated = await window.api.bookmarks.update(b.id, {
      readState: b.readState === 'read' ? 'unread' : 'read',
    });
    get().applyUpdatedBookmark(updated);
    await get().loadBookmarks();
  },

  trashSelected: async () => {
    const ids = get().selectedIds;
    if (!ids.length) return;
    await window.api.bookmarks.removeMany(ids);
    set({ selectedIds: [], selectedId: null, selected: null });
    await Promise.all([get().loadBookmarks(), get().refreshSidebarCounts()]);
  },
  purgeSelected: async () => {
    const ids = get().selectedIds;
    if (!ids.length) return;
    await window.api.bookmarks.purge(ids);
    set({ selectedIds: [], selectedId: null, selected: null });
    await Promise.all([get().loadBookmarks(), get().refreshSidebarCounts()]);
  },
  restoreSelected: async () => {
    const ids = get().selectedIds;
    if (!ids.length) return;
    await window.api.bookmarks.restore(ids);
    set({ selectedIds: [], selectedId: null, selected: null });
    await Promise.all([get().loadBookmarks(), get().refreshSidebarCounts()]);
  },
  moveSelected: async (categoryId) => {
    const ids = get().selectedIds;
    if (!ids.length) return;
    await window.api.bookmarks.move(ids, categoryId);
    set({ selectedIds: [] });
    await Promise.all([get().loadBookmarks(), get().refreshSidebarCounts()]);
  },
  tagSelected: async (tag) => {
    const ids = get().selectedIds;
    if (!ids.length) return;
    await window.api.bookmarks.addTag(ids, tag);
    set({ selectedIds: [] });
    await Promise.all([get().loadBookmarks(), get().loadTags()]);
  },
  favoriteSelected: async (fav) => {
    const ids = get().selectedIds;
    if (!ids.length) return;
    await window.api.bookmarks.favoriteMany(ids, fav);
    set({ selectedIds: [] });
    await get().loadBookmarks();
  },
  readSelected: async (rs) => {
    const ids = get().selectedIds;
    if (!ids.length) return;
    await window.api.bookmarks.readStateMany(ids, rs);
    set({ selectedIds: [] });
    await get().loadBookmarks();
  },
  reenrichSelected: async () => {
    const ids = get().selectedIds;
    if (!ids.length) return;
    await window.api.bookmarks.reenrichMany(ids);
    set({ selectedIds: [] });
  },

  refreshSidebarCounts: async () => {
    await Promise.all([get().loadCategories(), get().loadTags(), get().loadTrashCount()]);
  },

  runSync: async () => {
    if (get().syncing) return null;
    set({ syncing: true });
    try {
      const r = await window.api.sync.run();
      const lastSyncAt = await window.api.sync.lastAt();
      set({ lastSyncAt });
      await Promise.all([get().loadBookmarks(), get().refreshSidebarCounts()]);
      return { pushed: r.pushed, pulled: r.pulled };
    } finally {
      set({ syncing: false });
    }
  },
}));

export { PAGE_SIZE };
