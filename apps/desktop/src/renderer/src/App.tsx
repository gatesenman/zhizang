import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Input, Button, Segmented, Space, Dropdown, Tooltip, Tag, App as AntApp } from 'antd';
import {
  PlusOutlined,
  SettingOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  ImportOutlined,
  ExportOutlined,
  SearchOutlined,
  BulbOutlined,
  RobotOutlined,
  SyncOutlined,
  BarChartOutlined,
  ToolOutlined,
  ThunderboltOutlined,
  LinkOutlined,
  CopyOutlined,
  DeploymentUnitOutlined,
  GlobalOutlined,
} from '@ant-design/icons';
import Sidebar from './components/Sidebar';
import BookmarkPanel from './components/BookmarkPanel';
import ListToolbar from './components/ListToolbar';
import WebPreview from './components/WebPreview';
import { useStore } from './store';
import { libraryPreviewState } from './library-presentation';
import { useI18n } from './i18n';

// 弹窗/面板按需懒加载：仅在打开时才加载对应代码块，缩小启动主包、加快冷启动。
// 其中 GraphModal 依赖较重的 react-force-graph-2d（含 d3），收益最明显。
const SettingsModal = lazy(() => import('./components/SettingsModal'));
const AddBookmarkModal = lazy(() => import('./components/AddBookmarkModal'));
const CommandPalette = lazy(() => import('./components/CommandPalette'));
const StatsModal = lazy(() => import('./components/StatsModal'));
const SmartFolderModal = lazy(() => import('./components/SmartFolderModal'));
const AIPanel = lazy(() => import('./components/AIPanel'));
const GraphModal = lazy(() => import('./components/GraphModal'));
const PasteImportModal = lazy(() => import('./components/PasteImportModal'));
const OnboardingModal = lazy(() => import('./components/OnboardingModal'));

export default function App(): React.ReactElement {
  const { message, modal } = AntApp.useApp();
  const { t, lang, setLang } = useI18n();
  const init = useStore((s) => s.init);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const setQuery = useStore((s) => s.setQuery);
  const toggleDark = useStore((s) => s.toggleDark);
  const dark = useStore((s) => s.dark);
  const aiStatus = useStore((s) => s.aiStatus);
  const applyUpdatedBookmark = useStore((s) => s.applyUpdatedBookmark);
  const setAiStatus = useStore((s) => s.setAiStatus);
  const loadBookmarks = useStore((s) => s.loadBookmarks);
  const loadCategories = useStore((s) => s.loadCategories);
  const loadTags = useStore((s) => s.loadTags);
  const runSync = useStore((s) => s.runSync);
  const syncing = useStore((s) => s.syncing);
  const lastSyncAt = useStore((s) => s.lastSyncAt);
  const loadTrashCount = useStore((s) => s.loadTrashCount);

  const [initError, setInitError] = useState('');
  const [initializing, setInitializing] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [smartOpen, setSmartOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [graphOpen, setGraphOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [onboardOpen, setOnboardOpen] = useState(false);
  const selectedId = useStore((s) => s.selectedId);
  const bookmarks = useStore((s) => s.bookmarks);
  const [collapsedPreviewId, setCollapsedPreviewId] = useState<number | null>(null);
  const { available: previewAvailable, visible: previewVisible } = libraryPreviewState(selectedId, bookmarks.map((b) => b.id), collapsedPreviewId);
  const closePreview = (): void => {
    setCollapsedPreviewId(selectedId);
    // Keep the panel mounted: pending note saves and the webview survive collapsing.
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-bookmark-id="${selectedId}"]`)?.focus({ preventScroll: true }));
  };
  useEffect(() => {
    const focusReadingSheet = (): void => {
      if (previewVisible && (document.querySelector('.zc-library-workspace')?.clientWidth ?? Infinity) <= 710
        && !document.querySelector('.zc-preview')?.contains(document.activeElement)) {
        document.querySelector<HTMLButtonElement>('.zc-detail-title button')?.focus({ preventScroll: true });
      }
    };
    focusReadingSheet();
    window.addEventListener('resize', focusReadingSheet);
    return () => window.removeEventListener('resize', focusReadingSheet);
  }, [previewVisible, selectedId]);
  const [keyword, setKeyword] = useState('');
  const queryKeyword = useStore((s) => s.query.keyword);
  useEffect(() => { setKeyword(queryKeyword ?? ''); }, [queryKeyword]);
  const [linkProgress, setLinkProgress] = useState<{ checked: number; total: number } | null>(null);

  useEffect(() => {
    init().catch((e) => setInitError(String(e?.message ?? e))).finally(() => setInitializing(false));
    const offUpd = window.api.on('bookmark:updated', (b) => {
      applyUpdatedBookmark(b);
      void loadTags();
      void loadCategories();
      void loadBookmarks();
    });
    const offAi = window.api.on('ai:status', (s) => setAiStatus(s));
    const offToast = window.api.on('toast', (toast: { type: string; message: string }) => {
      if (toast.type === 'error') message.error(toast.message);
      else message.info(toast.message);
    });
    const offLinks = window.api.on('links:progress', (p: { checked: number; total: number }) => {
      setLinkProgress(p);
      if (p.checked >= p.total) {
        setTimeout(() => setLinkProgress(null), 1500);
        void loadBookmarks();
      }
    });
    const offChanged = window.api.on('bookmarks:changed', () => {
      void loadBookmarks();
      void loadCategories();
      void loadTags();
    });
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || (e.target instanceof HTMLElement && e.target.closest('.zc-note-editor'))) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setAddOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      offUpd();
      offAi();
      offToast();
      offLinks();
      offChanged();
      window.removeEventListener('keydown', onKey);
    };
    // 仅挂载时初始化一次（注册 IPC 监听与快捷键），依赖刻意留空。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (initializing || initError) return;
    window.api.settings.get('onboarded').then((v: string | null) => {
      if (v !== '1') setOnboardOpen(true);
    });
  }, [initializing, initError]);

  // 深色模式同步到 <body>：Antd 的弹窗/抽屉/下拉/全局提示通过 portal 渲染到 body，
  // 不在 App 根节点内，需把 zc-dark 挂到 body 才能让这些浮层与全局背景一并跟随主题。
  useEffect(() => {
    document.body.classList.toggle('zc-dark', dark);
    return () => document.body.classList.remove('zc-dark');
  }, [dark]);

  const doImport = async (kind: 'html' | 'json' | 'yaml' | 'csv'): Promise<void> => {
    const fnMap = {
      html: window.api.io.importHtml,
      json: window.api.io.importJson,
      yaml: window.api.io.importYaml,
      csv: window.api.io.importCsv,
    };
    const res: any = await fnMap[kind]();
    if (!res) return;
    if (kind === 'yaml') message.success(t('header.importedCategories', { n: res.created }));
    else message.success(t('header.importDone', { imported: res.imported, skipped: res.skipped }));
    await Promise.all([loadBookmarks(), loadCategories()]);
  };

  const doExport = async (kind: 'html' | 'json'): Promise<void> => {
    const path = await (kind === 'html' ? window.api.io.exportHtml() : window.api.io.exportJson());
    if (path) message.success(t('header.exportedTo', { path }));
  };

  const checkLinks = async (): Promise<void> => {
    message.info(t('header.checkLinksStart'));
    const res: any = await window.api.links.checkAll();
    await loadBookmarks();
    message.success(t('header.checkLinksDone', { dead: res?.dead ?? 0, checked: res?.checked ?? 0 }));
  };

  const dedupe = async (): Promise<void> => {
    const groups: any[] = await window.api.dup.find();
    if (!groups.length) {
      message.success(t('header.noDup'));
      return;
    }
    modal.confirm({
      title: t('header.dupTitle', { n: groups.length }),
      content: t('header.dupContent'),
      okText: t('header.merge'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        const removed: number = await window.api.dup.merge();
        await Promise.all([loadBookmarks(), loadTrashCount()]);
        message.success(t('header.dupMerged', { n: removed ?? 0 }));
      },
    });
  };

  const doSync = async (): Promise<void> => {
    const r = await runSync();
    if (r) message.success(t('header.syncDone', { pushed: r.pushed, pulled: r.pulled }));
  };

  if (initializing || initError) return <div className="zc-startup"><div className="zc-logo-badge">智</div><h2>{initError ? '启动失败' : '正在打开知识库…'}</h2>{initError && <><p>{initError}</p><Button onClick={() => window.location.reload()}>重新加载</Button></>}</div>;


  const processing = (aiStatus.counts.processing ?? 0) + (aiStatus.counts.pending ?? 0);

  return (
    <div className={`zc-shell ${dark ? 'zc-dark' : ''}`}>
      <div className="zc-header">
        <div className="zc-logo">
          <span className="zc-logo-badge">智</span>
          <span>{t('header.appName')}</span>
        </div>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder={t('header.searchPlaceholder')}
          style={{ maxWidth: 420 }}
          value={keyword}
          aria-label={lang === 'zh' ? '搜索收藏' : 'Search bookmarks'}
          onChange={(e) => { setKeyword(e.target.value); void setQuery({ keyword: e.target.value }); }}
          onPressEnter={() => setQuery({ keyword })}
          onClear={() => setQuery({ keyword: '' })}
          suffix={
            <Tooltip title={t('header.cmdTip')}>
              <span
                onClick={() => setCmdOpen(true)}
                style={{
                  cursor: 'pointer',
                  fontSize: 11,
                  color: '#9aa0aa',
                  border: '1px solid rgba(0,0,0,0.12)',
                  borderRadius: 5,
                  padding: '0 5px',
                  lineHeight: '16px',
                }}
              >
                Ctrl K
              </span>
            </Tooltip>
          }
        />
        <div style={{ flex: 1 }} />
        <Space>
          {linkProgress && (
            <Tag icon={<LinkOutlined />} color="blue">
              {t('header.linkProbe', { checked: linkProgress.checked, total: linkProgress.total })}
            </Tag>
          )}
          {processing > 0 && (
            <Tooltip title={t('header.aiProcessing', { n: processing })}>
              <Tag icon={<RobotOutlined spin />} color="processing">
                {processing}
              </Tag>
            </Tooltip>
          )}
          <Segmented
            value={view}
            onChange={(v) => setView(v as 'list' | 'card')}
            options={[
              { value: 'card', icon: <Tooltip title={t('header.cardView')}><AppstoreOutlined /></Tooltip> },
              { value: 'list', icon: <Tooltip title={t('header.listView')}><UnorderedListOutlined /></Tooltip> },
            ]}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
            {t('header.addBookmark')}
          </Button>
          <Dropdown
            menu={{
              items: [
                { type: 'group', label: t('settings.importGroup'), children: [
                  { key: 'imp-paste', icon: <CopyOutlined />, label: t('header.impPaste') },
                  { key: 'imp-html', icon: <ImportOutlined />, label: t('header.impHtml') },
                  { key: 'imp-json', icon: <ImportOutlined />, label: t('header.impJson') },
                  { key: 'imp-csv', icon: <ImportOutlined />, label: t('header.impCsv') },
                  { key: 'imp-yaml', icon: <ImportOutlined />, label: t('header.impYaml') },
                ]},
                { type: 'divider' },
                { type: 'group', label: t('settings.exportGroup'), children: [
                  { key: 'exp-html', icon: <ExportOutlined />, label: t('header.expHtml') },
                  { key: 'exp-json', icon: <ExportOutlined />, label: t('header.expJson') },
                ]},
              ],
              onClick: ({ key }) => {
                if (key === 'imp-paste') setPasteOpen(true);
                if (key === 'imp-html') doImport('html');
                if (key === 'imp-json') doImport('json');
                if (key === 'imp-csv') doImport('csv');
                if (key === 'imp-yaml') doImport('yaml');
                if (key === 'exp-html') doExport('html');
                if (key === 'exp-json') doExport('json');
              },
            }}
          >
            <Button icon={<ImportOutlined />}>{t('header.importExport')}</Button>
          </Dropdown>
        </Space>
      </div>
      <div className="zc-commandbar">
        <span className="zc-workspace-label">{lang === 'zh' ? '工作空间 / 本地知识库' : 'Workspace / Local library'}</span>
        <Space size={6}>
          <Dropdown
            menu={{
              items: [
                { key: 'links', icon: <LinkOutlined />, label: t('header.toolLinks') },
                { key: 'dedupe', icon: <CopyOutlined />, label: t('header.toolDedupe') },
                { key: 'smart', icon: <ThunderboltOutlined />, label: t('header.toolSmart') },
              ],
              onClick: ({ key }) => {
                if (key === 'links') checkLinks();
                if (key === 'dedupe') dedupe();
                if (key === 'smart') setSmartOpen(true);
              },
            }}
          >
            <Tooltip title={t('header.toolsTip')}>
              <Button icon={<ToolOutlined />} />
            </Tooltip>
          </Dropdown>
          <Tooltip title={t('header.aiTip')}>
            <Button icon={<RobotOutlined />} onClick={() => setAiOpen(true)}>{lang === 'zh' ? '收藏助手' : 'Assistant'}</Button>
          </Tooltip>
          <Tooltip title={t('header.graphTip')}>
            <Button icon={<DeploymentUnitOutlined />} onClick={() => setGraphOpen(true)} />
          </Tooltip>
          <Tooltip title={t('header.statsTip')}>
            <Button icon={<BarChartOutlined />} onClick={() => setStatsOpen(true)} />
          </Tooltip>
          <Tooltip title={lastSyncAt ? t('header.lastSyncTip', { time: new Date(lastSyncAt).toLocaleString() }) : t('header.syncTip')}>
            <Button icon={<SyncOutlined spin={syncing} />} onClick={doSync} />
          </Tooltip>
          <Tooltip title={t('header.darkTip')}>
            <Button icon={<BulbOutlined />} onClick={toggleDark} />
          </Tooltip>
          <Tooltip title={t('header.langTip')}>
            <Button icon={<GlobalOutlined />} onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
              {lang === 'zh' ? 'EN' : '中'}
            </Button>
          </Tooltip>
          <Button aria-label={lang === 'zh' ? '设置' : 'Settings'} icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)} />
        </Space>
      </div>


      <div className="zc-body">
        <Sidebar />
        <main className={`zc-library-workspace ${previewVisible ? 'has-preview' : ''}`} aria-label={lang === 'zh' ? '收藏工作区' : 'Bookmark workspace'}>
          <section className="zc-list-panel" aria-label={lang === 'zh' ? '收藏列表' : 'Bookmarks'}>
            <ListToolbar onPaste={() => setPasteOpen(true)} onShowPreview={previewAvailable && !previewVisible ? () => setCollapsedPreviewId(null) : undefined} />
            <div className="zc-list-scroll">
              <BookmarkPanel onAdd={() => setAddOpen(true)} onOpenPreview={() => setCollapsedPreviewId(null)} />
            </div>
          </section>
          <aside className="zc-preview" hidden={!previewVisible} aria-label={lang === 'zh' ? '收藏详情' : 'Bookmark details'}>
            <WebPreview onClose={closePreview} />
          </aside>
        </main>
      </div>

      <footer className="zc-statusbar"><span><i className="zc-status-dot" />{lang === 'zh' ? 'SQLite · 本地存储' : 'SQLite · Local storage'}</span><span>{processing > 0 ? `AI · ${processing}` : (lang === 'zh' ? '就绪' : 'Ready')}</span><span style={{ marginLeft: 'auto' }}>Ctrl K · {lang === 'zh' ? '命令面板' : 'Commands'}<span style={{ marginLeft: 18 }}>Ctrl N · {lang === 'zh' ? '新增收藏' : 'New bookmark'}</span></span></footer>

      {/* 懒加载弹窗：仅在打开时挂载，关闭即卸载；fallback=null 不打断主界面 */}
      <Suspense fallback={null}>
        {settingsOpen && <SettingsModal open onClose={() => setSettingsOpen(false)} />}
        {addOpen && <AddBookmarkModal open onClose={() => setAddOpen(false)} />}
        {cmdOpen && (
          <CommandPalette
            open
            onClose={() => setCmdOpen(false)}
            onAdd={() => setAddOpen(true)}
            onSettings={() => setSettingsOpen(true)}
            onStats={() => setStatsOpen(true)}
          />
        )}
        {statsOpen && <StatsModal open onClose={() => setStatsOpen(false)} />}
        {smartOpen && <SmartFolderModal open onClose={() => setSmartOpen(false)} />}
        {aiOpen && <AIPanel open onClose={() => setAiOpen(false)} />}
        {graphOpen && <GraphModal open onClose={() => setGraphOpen(false)} />}
        {pasteOpen && <PasteImportModal open onClose={() => setPasteOpen(false)} />}
        {onboardOpen && <OnboardingModal open onClose={() => setOnboardOpen(false)} onConfigure={() => setSettingsOpen(true)} />}
      </Suspense>
    </div>
  );
}
