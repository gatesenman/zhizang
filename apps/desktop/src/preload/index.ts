import { contextBridge, ipcRenderer } from 'electron';
import type {
  BookmarkQuery,
  Bookmark,
  EmbeddingConfig,
  GraphOptions,
  LlmConfig,
  ReadState,
  SmartFolderRule,
} from '@zhicang/shared';

const api = {
  categories: {
    list: () => ipcRenderer.invoke('categories:list'),
    counts: () => ipcRenderer.invoke('categories:counts'),
    create: (name: string, parentId: number | null, color?: string) =>
      ipcRenderer.invoke('categories:create', name, parentId, color),
    rename: (id: number, name: string) => ipcRenderer.invoke('categories:rename', id, name),
    remove: (id: number) => ipcRenderer.invoke('categories:delete', id),
    move: (id: number, parentId: number | null, sort: number) =>
      ipcRenderer.invoke('categories:move', id, parentId, sort),
    reorder: (ids: number[]) => ipcRenderer.invoke('categories:reorder', ids),
    seedPreset: (roleId: string) => ipcRenderer.invoke('categories:seedPreset', roleId),
  },
  tags: {
    list: () => ipcRenderer.invoke('tags:list'),
    counts: () => ipcRenderer.invoke('tags:counts'),
  },
  bookmarks: {
    saveNotes: (id: number, notes: string, expectedNotes: string): Promise<{ bookmark: Bookmark; conflict: boolean }> => ipcRenderer.invoke('bookmarks:saveNotes', id, notes, expectedNotes),
    query: (q: BookmarkQuery) => ipcRenderer.invoke('bookmarks:query', q),
    get: (id: number) => ipcRenderer.invoke('bookmarks:get', id),
    create: (input: { url: string; title?: string; categoryId?: number | null; tags?: string[]; restoreTrashed?: boolean }) =>
      ipcRenderer.invoke('bookmarks:create', input),
    update: (id: number, patch: any) => ipcRenderer.invoke('bookmarks:update', id, patch),
    visit: (id: number) => ipcRenderer.invoke('bookmarks:visit', id),
    remove: (id: number) => ipcRenderer.invoke('bookmarks:delete', id),
    removeMany: (ids: number[]) => ipcRenderer.invoke('bookmarks:deleteMany', ids),
    purge: (ids: number[]) => ipcRenderer.invoke('bookmarks:purge', ids),
    restore: (ids: number[]) => ipcRenderer.invoke('bookmarks:restore', ids),
    emptyTrash: () => ipcRenderer.invoke('bookmarks:emptyTrash'),
    trashCount: () => ipcRenderer.invoke('bookmarks:trashCount'),
    move: (ids: number[], categoryId: number | null) => ipcRenderer.invoke('bookmarks:move', ids, categoryId),
    addTag: (ids: number[], tag: string) => ipcRenderer.invoke('bookmarks:addTag', ids, tag),
    favoriteMany: (ids: number[], fav: boolean) => ipcRenderer.invoke('bookmarks:favoriteMany', ids, fav),
    readStateMany: (ids: number[], rs: ReadState) => ipcRenderer.invoke('bookmarks:readStateMany', ids, rs),
    reenrich: (id: number) => ipcRenderer.invoke('bookmarks:reenrich', id),
    reenrichMany: (ids: number[]) => ipcRenderer.invoke('bookmarks:reenrichMany', ids),
    importPaste: (text: string) => ipcRenderer.invoke('bookmarks:importPaste', text),
  },
  dup: {
    find: () => ipcRenderer.invoke('dup:find'),
    merge: () => ipcRenderer.invoke('dup:merge'),
  },
  links: {
    checkAll: () => ipcRenderer.invoke('links:checkAll'),
    check: (id: number) => ipcRenderer.invoke('links:check', id),
  },
  snapshot: {
    save: (id: number) => ipcRenderer.invoke('snapshot:save', id),
    get: (id: number) => ipcRenderer.invoke('snapshot:get', id),
    archive: (id: number) => ipcRenderer.invoke('snapshot:archive', id),
  },
  smart: {
    list: () => ipcRenderer.invoke('smart:list'),
    create: (name: string, rule: SmartFolderRule, color?: string) =>
      ipcRenderer.invoke('smart:create', name, rule, color),
    remove: (id: number) => ipcRenderer.invoke('smart:delete', id),
  },
  stats: {
    overview: () => ipcRenderer.invoke('stats:overview'),
  },
  sync: {
    run: () => ipcRenderer.invoke('sync:run'),
    status: () => ipcRenderer.invoke('sync:status'),
    lastAt: () => ipcRenderer.invoke('sync:lastAt'),
    getConfig: () => ipcRenderer.invoke('sync:getConfig'),
    setConfig: (cfg: { enabled?: boolean; intervalMin?: number }) =>
      ipcRenderer.invoke('sync:setConfig', cfg),
  },
  ai: {
    status: () => ipcRenderer.invoke('ai:status'),
    ask: (question: string) => ipcRenderer.invoke('ai:ask', question),
  },
  graph: {
    getConfig: (): Promise<EmbeddingConfig> => ipcRenderer.invoke('graph:getConfig'),
    setConfig: (cfg: EmbeddingConfig) => ipcRenderer.invoke('graph:setConfig', cfg),
    status: () => ipcRenderer.invoke('graph:status'),
    data: (opts: GraphOptions) => ipcRenderer.invoke('graph:data', opts),
    docsForEmbedding: (): Promise<{ id: number; text: string }[]> =>
      ipcRenderer.invoke('graph:docsForEmbedding'),
    storeVectors: (items: { id: number; vec: number[] }[], model: string) =>
      ipcRenderer.invoke('graph:storeVectors', items, model),
    clearVectors: () => ipcRenderer.invoke('graph:clearVectors'),
    buildApi: () => ipcRenderer.invoke('graph:buildApi'),
    search: (query: string, k: number) => ipcRenderer.invoke('graph:search', query, k),
    searchByVector: (vec: number[], k: number) => ipcRenderer.invoke('graph:searchByVector', vec, k),
  },
  bridge: {
    configure: (cfg: { enabled: boolean; port: number }) => ipcRenderer.invoke('bridge:configure', cfg),
    status: () => ipcRenderer.invoke('bridge:status'),
    resetToken: () => ipcRenderer.invoke('bridge:resetToken'),
  },
  settings: {
    testLlm: (cfg: LlmConfig) => ipcRenderer.invoke('settings:testLlm', cfg),
    getLlm: () => ipcRenderer.invoke('settings:getLlm'),
    setLlm: (cfg: LlmConfig) => ipcRenderer.invoke('settings:setLlm', cfg),
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
  },
  license: {
    testServer: (base: string) => ipcRenderer.invoke('license:testServer', base),
    status: () => ipcRenderer.invoke('license:status'),
    activate: (email: string, code: string) => ipcRenderer.invoke('license:activate', email, code),
    deactivate: () => ipcRenderer.invoke('license:deactivate'),
    deviceId: () => ipcRenderer.invoke('license:deviceId'),
    getBackendUrl: () => ipcRenderer.invoke('license:getBackendUrl'),
    setBackendUrl: (url: string) => ipcRenderer.invoke('license:setBackendUrl', url),
  },
  io: {
    backup: () => ipcRenderer.invoke('io:backup'),
    restore: () => ipcRenderer.invoke('io:restore'),
    importHtml: () => ipcRenderer.invoke('io:importHtml'),
    importJson: () => ipcRenderer.invoke('io:importJson'),
    importCsv: () => ipcRenderer.invoke('io:importCsv'),
    importYaml: () => ipcRenderer.invoke('io:importYaml'),
    exportHtml: () => ipcRenderer.invoke('io:exportHtml'),
    exportJson: () => ipcRenderer.invoke('io:exportJson'),
  },
  app: {
    downloadUpdate: () => ipcRenderer.invoke('app:downloadUpdate'),
    dataPath: () => ipcRenderer.invoke('app:dataPath'),
    version: (): Promise<string> => ipcRenderer.invoke('app:version'),
    checkUpdate: () => ipcRenderer.invoke('update:check'),
    updateStatus: () => ipcRenderer.invoke('update:status'),
  },
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  on: (channel: string, cb: (payload: any) => void) => {
    const listener = (_e: unknown, payload: any) => cb(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
