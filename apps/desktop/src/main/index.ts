import { metadataPatch, mayReplaceDescription } from './enrichment-policy';
import { captureBookmark } from './capture';
import { saveFullBackup, restoreFullBackup } from './backup';
import { validateLlmConfig, normalizeApiBase } from './service-url';
import { netFetch } from './net-fetch';
import { askBookmarks } from './assistant';
import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import { join } from 'path';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { randomBytes } from 'crypto';
import type { BookmarkQuery, LlmConfig } from '@zhicang/shared';
import {
  initDb,
  listCategories,
  createCategory,
  renameCategory,
  deleteCategory,
  moveCategory,
  reorderCategories,
  seedRolePreset,
  categoryCounts,
  ensureCategoryByName,
  listTags,
  tagCounts,
  queryBookmarks,
  createBookmark,
  updateBookmark,
  saveBookmarkNotes,
  getDb,
  trashBookmarks,
  purgeTrashedBookmarks,
  restoreBookmarks,
  emptyTrash,
  trashCount,
  moveBookmarks,
  addTagToBookmarks,
  setFavoriteMany,
  setReadStateMany,
  recordVisit,
  findDuplicates,
  mergeDuplicates,
  setSnapshot,
  getSnapshot,
  listSmartFolders,
  createSmartFolder,
  deleteSmartFolder,
  statsOverview,
  getBookmark,
  getBookmarkByUrl,
  nextPendingBookmarks,
  countByAiState,
  getSetting,
  setSetting,
  listBookmarksForGraph,
  upsertEmbedding,
  clearEmbeddings,
  embeddingStats,
} from './db';
import type {
  ReadState,
  SmartFolderRule,
  Bookmark,
  EmbeddingConfig,
  GraphOptions,
} from '@zhicang/shared';
import {
  buildGraph,
  lexicalSearch,
  denseSearch,
  apiEmbed,
  docText,
} from './graph';
import { fetchSiteMeta, aiEnrich, aiChat, checkLink, fetchReadable, fetchArchive, TaskQueue } from './enrich';
import { startBridge, stopBridge, extractUrls } from './bridge';
import {
  importBookmarksHtml,
  exportBookmarksHtml,
  exportJson,
  importJson,
  importCategoriesYaml,
  importCsv,
} from './import-export';
import {
  getLicenseStatus,
  activate,
  deactivate,
  getDeviceId,
  getBackendUrl,
  setBackendUrl,
} from './license';
import { runSync, getLastSyncAt, getSyncConfig, setSyncConfig, initAutoSync } from './sync';
import { initAutoUpdate, checkForUpdates, getUpdateStatus, downloadUpdate } from './updater';

// Portable builds keep data next to the executable; installers use Electron's AppData location.
const dataOverride = process.env.ZHICANG_USER_DATA_DIR || (process.env.PORTABLE_EXECUTABLE_DIR ? join(process.env.PORTABLE_EXECUTABLE_DIR, 'ZhiCang-data') : '');
if (dataOverride) {
  try {
    mkdirSync(join(dataOverride, 'session'), { recursive: true });
    app.setPath('userData', dataOverride);
    app.setPath('sessionData', join(dataOverride, 'session'));
  } catch (error) {
    dialog.showErrorBox('数据目录无法使用', '请把便携版移动到有写入权限的文件夹后重试，或检查 ZHICANG_USER_DATA_DIR。\n' + String(error));
    app.exit(1);
  }
}
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();

let mainWindow: BrowserWindow | null = null;
const queue = new TaskQueue(3);

const DEFAULT_LLM: LlmConfig = {
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-chat',
  temperature: 0.3,
  concurrency: 3,
  enabled: false,
};

function getLlmConfig(): LlmConfig {
  const raw = getSetting('llm');
  if (!raw) return DEFAULT_LLM;
  try {
    return { ...DEFAULT_LLM, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_LLM;
  }
}

const DEFAULT_EMBEDDING: EmbeddingConfig = {
  mode: 'local',
  localModel: 'Xenova/bge-small-zh-v1.5',
  apiModel: 'text-embedding-3-small',
};

function getEmbeddingConfig(): EmbeddingConfig {
  const raw = getSetting('embedding');
  if (!raw) return DEFAULT_EMBEDDING;
  try {
    return { ...DEFAULT_EMBEDDING, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_EMBEDDING;
  }
}

function broadcast(channel: string, payload: unknown): void {
  mainWindow?.webContents.send(channel, payload);
}

function emitAiStatus(): void {
  broadcast('ai:status', { counts: countByAiState(), pending: queue.pending });
}

// 富化单条收藏：抓取站点信息 +（可选）AI 生成描述/标签/分类
async function enrichBookmark(id: number): Promise<void> {
  const bm = getBookmark(id);
  if (!bm || bm.deletedAt) return;
  updateBookmark(id, { aiState: 'processing' });
  emitAiStatus();
  try {
    const meta = await fetchSiteMeta(bm.url);
    const current = getBookmark(id);
    if (!current || current.deletedAt) return;
    const patch = metadataPatch(current, meta);
    updateBookmark(id, patch);

    const cfg = getLlmConfig();
    if (cfg.enabled && cfg.apiKey) {
      const cats = listCategories().map((c) => c.name);
      const beforeAi = getBookmark(id)!;
      const ai = await aiEnrich(beforeAi, meta, cfg, cats);
      const latest = getBookmark(id);
      if (!latest || latest.deletedAt) return;
      const categoryId = ai.suggestedCategory ? ensureCategoryByName(ai.suggestedCategory) : bm.categoryId;
      updateBookmark(id, {
        ...(mayReplaceDescription(bm, beforeAi, latest, meta) ? { description: ai.description || latest.description } : {}),
        tags: [...new Set([...latest.tags, ...ai.tags])],
        categoryId: latest.categoryId ?? categoryId,
        aiState: 'done',
      });
    } else {
      updateBookmark(id, { aiState: cfg.enabled ? 'failed' : 'skipped' });
    }
  } catch (err: any) {
    if (getBookmark(id)) updateBookmark(id, { aiState: 'failed' });
    broadcast('toast', { type: 'error', message: `富化失败：${err?.message ?? err}` });
  } finally {
    const updated = getBookmark(id);
    if (updated) broadcast('bookmark:updated', updated);
    emitAiStatus();
  }
}

const queuedIds = new Set<number>();
function enqueue(id: number): void {
  if (queuedIds.has(id)) return;
  queuedIds.add(id);
  queue.push(async () => { try { await enrichBookmark(id); } finally { queuedIds.delete(id); } });
  emitAiStatus();
}

function resumePending(): void {
  const pending = nextPendingBookmarks(1000);
  for (const b of pending) enqueue(b.id);
}

// 批量探活：并发受限，逐条更新并广播进度
async function checkAllLinks(): Promise<{ checked: number; dead: number }> {
  const { items } = queryBookmarks({ limit: 100000, offset: 0 });
  let checked = 0;
  let dead = 0;
  const concurrency = 6;
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const b = items[cursor++];
      const code = await checkLink(b.url);
      const status = code == null || code >= 400 ? 'dead' : 'active';
      if (status === 'dead') dead++;
      updateBookmark(b.id, { httpStatus: code, lastCheckAt: Date.now(), status });
      checked++;
      broadcast('links:progress', { checked, total: items.length, dead });
      const updated = getBookmark(b.id);
      if (updated) broadcast('bookmark:updated', updated);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { checked, dead };
}

// 完整静态化存档：抓正文 + 内联图片，存入 snapshots 表
async function archiveBookmark(id: number, readableHtml?: string): Promise<{ content: string; images: number } | null> {
  const b = getBookmark(id);
  if (!b) return null;
  const { html, images } = await fetchArchive(b.url, readableHtml);
  setSnapshot(id, html);
  const updated = getBookmark(id);
  if (updated) broadcast('bookmark:updated', updated);
  return { content: html, images };
}

// 从浏览器插件 / 批量粘贴新增收藏（带去重、可选正文存档、自动富化）
async function addBookmarkFromExternal(input: {
  url: string;
  title?: string;
  description?: string;
  html?: string;
  tags?: string[];
}): Promise<{ id: number; created: boolean; title: string }> {
  let b: Bookmark;
  try {
    b = createBookmark({
      url: input.url,
      title: input.title,
      description: input.description,
      tags: input.tags,
    });
  } catch {
    // 已存在：返回现有记录
    const existing = getBookmarkByUrl(input.url, true);
    if (existing?.deletedAt) throw new Error('该网址在回收站，请到桌面端明确恢复后再收藏');
    if (existing) return { id: existing.id, created: false, title: existing.title };
    throw new Error('收藏失败');
  }
  enqueue(b.id);
  // 插件带来了正文 HTML：直接存档，无需再抓取
  if (input.html && input.html.length > 200) {
    archiveBookmark(b.id, input.html).catch(() => undefined);
  }
  broadcast('bookmark:updated', b);
  broadcast('bookmarks:changed', { reason: 'external' });
  broadcast('toast', { type: 'success', message: `已从浏览器收藏：${b.title}` });
  return { id: b.id, created: true, title: b.title };
}

async function addBatchUrls(urls: string[]): Promise<{ created: number; skipped: number }> {
  let createdN = 0;
  let skipped = 0;
  for (const url of urls) {
    try {
      const b = createBookmark({ url });
      enqueue(b.id);
      createdN++;
    } catch {
      skipped++;
    }
  }
  if (createdN) {
    broadcast('bookmarks:changed', { reason: 'batch' });
    broadcast('toast', { type: 'success', message: `批量导入完成：新增 ${createdN}，跳过 ${skipped}` });
  }
  return { created: createdN, skipped };
}

function searchBookmarks(q: string, limit = 20): Bookmark[] {
  if (!q || !q.trim()) return queryBookmarks({ sort: 'created_desc', limit, offset: 0 }).items;
  return queryBookmarks({ keyword: q.trim(), limit, offset: 0 }).items;
}

function recentBookmarks(limit = 20): Bookmark[] {
  return queryBookmarks({ sort: 'created_desc', limit, offset: 0 }).items;
}

async function getArchiveContent(id: number): Promise<{ title: string; content: string } | null> {
  const b = getBookmark(id);
  if (!b) return null;
  let snap = getSnapshot(id);
  if (!snap || !snap.content) {
    const r = await archiveBookmark(id);
    if (r) snap = { content: r.content, savedAt: Date.now() };
  }
  return { title: b.title, content: snap?.content || '' };
}

// 本地桥接访问令牌：首次生成后持久化，供插件/MCP 鉴权使用
function getBridgeToken(): string {
  let token = getSetting('bridgeToken');
  if (!token) {
    token = randomBytes(24).toString('hex');
    setSetting('bridgeToken', token);
  }
  return token;
}

let bridgeRunning = false;
let bridgeError = '';
function bridgeStatus(): { enabled: boolean; running: boolean; port: number; token: string; error: string } {
  return { enabled: getSetting('bridgeEnabled') !== '0', running: bridgeRunning, port: Number(getSetting('bridgePort') || '38121'), token: getBridgeToken(), error: bridgeError };
}
async function startBridgeServer(): Promise<void> {
  bridgeRunning = false; bridgeError = '';
  if (getSetting('bridgeEnabled') === '0') return;
  const port = Number(getSetting('bridgePort') || '38121');
  try {
    await startBridge({ addBookmark: addBookmarkFromExternal, addBatch: addBatchUrls, search: searchBookmarks, getContent: getArchiveContent, recent: recentBookmarks }, { name: 'ZhiCang', version: app.getVersion() }, port, { token: getBridgeToken() });
    bridgeRunning = true;
  } catch (err) {
    bridgeError = String((err as Error).message ?? err);
    broadcast('toast', { type: 'error', message: '本地桥接启动失败：' + bridgeError });
  }
}
async function restartBridge(): Promise<void> {
  await stopBridge(); await startBridgeServer();
  if (bridgeError) throw new Error(bridgeError);
}

function registerIpc(): void {
  // 分类
  ipcMain.handle('categories:list', () => listCategories());
  ipcMain.handle('categories:counts', () => categoryCounts());
  ipcMain.handle('categories:create', (_e, name: string, parentId: number | null, color?: string) =>
    createCategory(name, parentId, color),
  );
  ipcMain.handle('categories:rename', (_e, id: number, name: string) => renameCategory(id, name));
  ipcMain.handle('categories:delete', (_e, id: number) => deleteCategory(id));

  ipcMain.handle('categories:move', (_e, id: number, parentId: number | null, sort: number) =>
    moveCategory(id, parentId, sort),
  );
  ipcMain.handle('categories:reorder', (_e, ids: number[]) => reorderCategories(ids));
  ipcMain.handle('categories:seedPreset', (_e, roleId: string) => seedRolePreset(roleId));

  // 标签
  ipcMain.handle('tags:list', () => listTags());
  ipcMain.handle('tags:counts', () => tagCounts());

  // 收藏
  ipcMain.handle('bookmarks:query', (_e, q: BookmarkQuery) => queryBookmarks(q));
  ipcMain.handle('bookmarks:get', (_e, id: number) => getBookmark(id));
  ipcMain.handle('bookmarks:create', (_e, input: Parameters<typeof captureBookmark>[0]) => {
    const result = captureBookmark(input);
    if (result.created) enqueue(result.bookmark.id);
    return result;
  });
  ipcMain.handle('bookmarks:saveNotes', (_e, id: number, notes: string, expectedNotes: string) => saveBookmarkNotes(id, notes, expectedNotes));
  ipcMain.handle('bookmarks:update', (_e, id: number, patch: any) => updateBookmark(id, patch));
  ipcMain.handle('bookmarks:visit', (_e, id: number) => recordVisit(id));
  ipcMain.handle('bookmarks:delete', (_e, id: number) => trashBookmarks([id]));
  ipcMain.handle('bookmarks:deleteMany', (_e, ids: number[]) => trashBookmarks(ids));
  ipcMain.handle('bookmarks:purge', (_e, ids: number[]) => purgeTrashedBookmarks(ids));
  ipcMain.handle('bookmarks:restore', (_e, ids: number[]) => restoreBookmarks(ids));
  ipcMain.handle('bookmarks:emptyTrash', () => emptyTrash());
  ipcMain.handle('bookmarks:trashCount', () => trashCount());
  ipcMain.handle('bookmarks:move', (_e, ids: number[], categoryId: number | null) =>
    moveBookmarks(ids, categoryId),
  );
  ipcMain.handle('bookmarks:addTag', (_e, ids: number[], tag: string) => addTagToBookmarks(ids, tag));
  ipcMain.handle('bookmarks:favoriteMany', (_e, ids: number[], fav: boolean) => setFavoriteMany(ids, fav));
  ipcMain.handle('bookmarks:readStateMany', (_e, ids: number[], rs: ReadState) => setReadStateMany(ids, rs));
  ipcMain.handle('bookmarks:reenrich', (_e, id: number) => {
    updateBookmark(id, { aiState: 'pending' });
    enqueue(id);
    return true;
  });
  ipcMain.handle('bookmarks:reenrichMany', (_e, ids: number[]) => {
    for (const id of ids) {
      updateBookmark(id, { aiState: 'pending' });
      enqueue(id);
    }
    return true;
  });
  ipcMain.handle('ai:status', () => ({ counts: countByAiState(), pending: queue.pending }));

  // 重复检测
  ipcMain.handle('dup:find', () => findDuplicates());
  ipcMain.handle('dup:merge', () => mergeDuplicates());

  // 链接探活
  ipcMain.handle('links:checkAll', () => checkAllLinks());
  ipcMain.handle('links:check', async (_e, id: number) => {
    const b = getBookmark(id);
    if (!b) return null;
    const code = await checkLink(b.url);
    const status = code == null || code >= 400 ? 'dead' : 'active';
    updateBookmark(id, { httpStatus: code, lastCheckAt: Date.now(), status });
    return { id, url: b.url, httpStatus: code, status };
  });

  // 离线快照
  ipcMain.handle('snapshot:save', async (_e, id: number) => {
    const b = getBookmark(id);
    if (!b) return null;
    const { html } = await fetchReadable(b.url);
    setSnapshot(id, html);
    return { content: html, savedAt: Date.now() };
  });
  ipcMain.handle('snapshot:get', (_e, id: number) => getSnapshot(id));
  // 完整静态化存档（正文 + 内联图片）
  ipcMain.handle('snapshot:archive', (_e, id: number) => archiveBookmark(id));

  // 批量粘贴导入：提取文本中全部 URL 入库
  ipcMain.handle('bookmarks:importPaste', (_e, text: string) => addBatchUrls(extractUrls(text)));

  // 右侧 AI 面板：自然语言检索/问答
  ipcMain.handle('ai:ask', (_e, question: string) => askBookmarks(question, getLlmConfig()));

  // 本地桥接服务状态（供设置面板/插件引导显示端口与访问令牌）
  ipcMain.handle('bridge:status', () => bridgeStatus());
  ipcMain.handle('bridge:configure', async (_e, cfg: { enabled: boolean; port: number }) => {
    if (!Number.isInteger(cfg.port) || cfg.port < 1024 || cfg.port > 65535) throw new Error('桥接端口须为 1024–65535 的整数');
    setSetting('bridgePort', String(cfg.port)); setSetting('bridgeEnabled', cfg.enabled ? '1' : '0');
    await restartBridge(); return bridgeStatus();
  });
  ipcMain.handle('bridge:resetToken', async () => {
    const token = randomBytes(24).toString('hex');
    setSetting('bridgeToken', token); await restartBridge(); return token;
  });

  // 智能文件夹
  ipcMain.handle('smart:list', () => listSmartFolders());
  ipcMain.handle('smart:create', (_e, name: string, rule: SmartFolderRule, color?: string) =>
    createSmartFolder(name, rule, color),
  );
  ipcMain.handle('smart:delete', (_e, id: number) => deleteSmartFolder(id));

  // 统计
  ipcMain.handle('stats:overview', () => statsOverview());

  // 云同步
  ipcMain.handle('sync:run', () => runSync());
  ipcMain.handle('sync:status', () => ({ lastError: getSetting('sync_last_error') || '', backendUrl: getBackendUrl() }));
  ipcMain.handle('sync:lastAt', () => getLastSyncAt());
  ipcMain.handle('sync:getConfig', () => getSyncConfig());
  ipcMain.handle('sync:setConfig', (_e, cfg: { enabled?: boolean; intervalMin?: number }) =>
    setSyncConfig(cfg),
  );

  // 设置 / 大模型
  ipcMain.handle('settings:testLlm', async (_e, cfg: LlmConfig) => {
    validateLlmConfig(cfg);
    const start = Date.now();
    await aiChat(cfg, [{ role: 'user', content: '请只回复 OK，用于连接测试。' }]);
    return { ok: true, elapsedMs: Date.now() - start };
  });
  ipcMain.handle('license:testServer', async (_e, base: string) => {
    const res = await netFetch(normalizeApiBase(base) + '/health', { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error('授权服务连接失败 HTTP ' + res.status);
    const data: any = await res.json();
    if (!data.ok) throw new Error('响应不是智藏健康检查');
    return { ok: true };
  });
  ipcMain.handle('settings:getLlm', () => getLlmConfig());
  ipcMain.handle('settings:setLlm', (_e, cfg: LlmConfig) => {
    if (cfg.enabled) validateLlmConfig(cfg);
    setSetting('llm', JSON.stringify(cfg));
    queue.setConcurrency(cfg.concurrency || 3);
    return getLlmConfig();
  });
  ipcMain.handle('settings:get', (_e, key: string) => getSetting(key));
  ipcMain.handle('settings:set', (_e, key: string, value: string) => setSetting(key, value));

  // 知识图谱 / 语义检索
  ipcMain.handle('graph:getConfig', () => getEmbeddingConfig());
  ipcMain.handle('graph:setConfig', (_e, cfg: EmbeddingConfig) => {
    setSetting('embedding', JSON.stringify(cfg));
    return getEmbeddingConfig();
  });
  ipcMain.handle('graph:status', () => ({ ...embeddingStats(), mode: getEmbeddingConfig().mode }));
  ipcMain.handle('graph:data', (_e, opts: GraphOptions) => buildGraph(opts));
  // 渲染层本地模型需要知道要嵌入哪些文本
  ipcMain.handle('graph:docsForEmbedding', () =>
    listBookmarksForGraph().map((d) => ({ id: d.id, text: docText(d) })),
  );
  // 渲染层（本地模型）算好向量后回传保存
  ipcMain.handle('graph:storeVectors', (_e, items: { id: number; vec: number[] }[], model: string) => {
    for (const it of items) upsertEmbedding(it.id, model, Float32Array.from(it.vec));
    return embeddingStats();
  });
  ipcMain.handle('graph:clearVectors', () => {
    clearEmbeddings();
    return embeddingStats();
  });
  // API 模式：主进程直接批量算向量
  ipcMain.handle('graph:buildApi', async () => {
    const cfg = getEmbeddingConfig();
    const llm = getLlmConfig();
    if (!llm.apiKey) throw new Error('未配置大模型 API Key，无法用 API 模式生成向量');
    const docs = listBookmarksForGraph();
    const model = cfg.apiModel || 'text-embedding-3-small';
    const batch = 64;
    let done = 0;
    for (let i = 0; i < docs.length; i += batch) {
      const slice = docs.slice(i, i + batch);
      const vecs = await apiEmbed(slice.map((d) => docText(d)), llm, model);
      slice.forEach((d, k) => upsertEmbedding(d.id, `api:${model}`, vecs[k]));
      done += slice.length;
      broadcast('graph:progress', { done, total: docs.length });
    }
    return embeddingStats();
  });
  // 语义检索：lexical / api 在主进程算；local 由渲染层算好查询向量后走 searchByVector
  ipcMain.handle('graph:search', async (_e, query: string, k: number) => {
    const cfg = getEmbeddingConfig();
    if (cfg.mode === 'api') {
      const llm = getLlmConfig();
      if (llm.apiKey) {
        try {
          const [qv] = await apiEmbed([query], llm, cfg.apiModel || 'text-embedding-3-small');
          return denseSearch(qv, k);
        } catch {
          return lexicalSearch(query, k);
        }
      }
    }
    // local 模式若已有向量，仍可用 lexical 作为查询兜底（渲染层会优先用 searchByVector）
    return lexicalSearch(query, k);
  });
  ipcMain.handle('graph:searchByVector', (_e, vec: number[], k: number) =>
    denseSearch(Float32Array.from(vec), k),
  );

  // 授权
  ipcMain.handle('license:status', () => getLicenseStatus());
  ipcMain.handle('license:activate', (_e, email: string, code: string) => activate(email, code));
  ipcMain.handle('license:deactivate', () => deactivate());
  ipcMain.handle('license:deviceId', () => getDeviceId());
  ipcMain.handle('license:getBackendUrl', () => getBackendUrl());
  ipcMain.handle('license:setBackendUrl', (_e, url: string) => setBackendUrl(url));

  // 导入导出
  ipcMain.handle('io:backup', async () => {
    const file = await dialog.showSaveDialog({ title: '完整备份（含设置和凭据，请妥善保存）', defaultPath: `ZhiCang-backup-${new Date().toISOString().slice(0, 10)}.zhicang`, filters: [{ name: '智藏完整备份', extensions: ['zhicang'] }] });
    if (file.canceled || !file.filePath) return null;
    await saveFullBackup(file.filePath);
    return { path: file.filePath };
  });
  ipcMain.handle('io:restore', async () => {
    const file = await dialog.showOpenDialog({ title: '恢复智藏完整备份', properties: ['openFile'], filters: [{ name: '智藏完整备份', extensions: ['zhicang', 'db'] }] });
    if (file.canceled || !file.filePaths[0]) return null;
    const confirmation = await dialog.showMessageBox({ type: 'warning', buttons: ['取消', '恢复并重启'], defaultId: 0, cancelId: 0, message: '恢复会替换当前全部收藏、设置和本地授权信息。', detail: '当前库将自动备份到 userData/backups。请确认只使用信任的智藏备份文件。' });
    if (confirmation.response !== 1) return null;
    try {
      const result = await restoreFullBackup(file.filePaths[0]);
      app.relaunch(); app.exit(0);
      return result;
    } catch (e) {
      if (!getDb().open) initDb();
      throw e;
    }
  });
  ipcMain.handle('app:dataPath', () => app.getPath('userData'));
  ipcMain.handle('io:importHtml', async () => {
    const r = await dialog.showOpenDialog({ filters: [{ name: 'Bookmarks', extensions: ['html', 'htm'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    const html = readFileSync(r.filePaths[0], 'utf-8');
    const res = importBookmarksHtml(html);
    resumePending();
    return res;
  });
  ipcMain.handle('io:importJson', async () => {
    const r = await dialog.showOpenDialog({ filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    const res = importJson(readFileSync(r.filePaths[0], 'utf-8'));
    resumePending();
    return res;
  });
  ipcMain.handle('io:importCsv', async () => {
    const r = await dialog.showOpenDialog({ filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    const res = importCsv(readFileSync(r.filePaths[0], 'utf-8'));
    resumePending();
    return res;
  });
  ipcMain.handle('io:importYaml', async () => {
    const r = await dialog.showOpenDialog({ filters: [{ name: 'YAML', extensions: ['yaml', 'yml'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    return importCategoriesYaml(readFileSync(r.filePaths[0], 'utf-8'));
  });
  ipcMain.handle('io:exportHtml', async () => {
    const r = await dialog.showSaveDialog({ defaultPath: 'zhicang-bookmarks.html' });
    if (r.canceled || !r.filePath) return null;
    writeFileSync(r.filePath, exportBookmarksHtml(), 'utf-8');
    return r.filePath;
  });
  ipcMain.handle('io:exportJson', async () => {
    const r = await dialog.showSaveDialog({ defaultPath: 'zhicang-export.json' });
    if (r.canceled || !r.filePath) return null;
    writeFileSync(r.filePath, exportJson(), 'utf-8');
    return r.filePath;
  });

  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    if (!['http:', 'https:'].includes(new URL(url).protocol)) throw new Error('仅允许打开网页链接');
    return shell.openExternal(url);
  });

  // 应用版本与自动更新
  ipcMain.handle('app:downloadUpdate', () => downloadUpdate());
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('update:check', () => checkForUpdates(() => mainWindow));
  ipcMain.handle('update:status', () => getUpdateStatus());
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: '智藏 ZhiCang',
    autoHideMenuBar: true,
    backgroundColor: '#f5f6f8',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true,
      contextIsolation: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-attach-webview', (_event, preferences) => {
    delete preferences.preload;
    preferences.nodeIntegration = false;
    preferences.contextIsolation = true;
    preferences.sandbox = true;
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

if (primaryInstance) app.whenReady().then(() => {
  app.setAppUserModelId('ai.zhicang.desktop');
  initDb();
  registerIpc();
  createWindow();
  startBridgeServer();
  queue.setConcurrency(getLlmConfig().concurrency || 3);
  setTimeout(resumePending, 1500);
  // 延迟启动自动同步：避开冷启动高峰，未激活/未开启时内部静默跳过。
  setTimeout(initAutoSync, 4000);
  // 延迟检查更新：仅打包后的正式版生效，dev 模式内部跳过。
  setTimeout(() => initAutoUpdate(() => mainWindow), 6000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('second-instance', () => {
  if (mainWindow?.isMinimized()) mainWindow.restore();
  mainWindow?.show(); mainWindow?.focus();
});

app.on('window-all-closed', () => {
  stopBridge();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => stopBridge());
