import NoteEditor from './NoteEditor';
import { bookmarkMarkdown } from '../workflow';
import React, { useEffect, useRef, useState } from 'react';
import { Button, Typography, Tag, Space, Tooltip, Modal, Input, Select, Spin, Segmented, Dropdown } from 'antd';
import {
  ExportOutlined,
  ReloadOutlined,
  GlobalOutlined,
  LoadingOutlined,
  ReadOutlined,
  FileTextOutlined,
  ArrowLeftOutlined,
  SaveOutlined,
  CloseOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import { App as AntApp } from 'antd';
import { useStore } from '../store';
import { tagColor, relativeTime } from '../util';
import { useI18n, translate, getLang } from '../i18n';

export default function WebPreview({ onClose }: { onClose?: () => void } = {}): React.ReactElement {
  const { t, lang } = useI18n();
  const selected = useStore((s) => s.selected);
  const categories = useStore((s) => s.categories);
  const loadBookmarks = useStore((s) => s.loadBookmarks);
  const select = useStore((s) => s.select);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const toggleRead = useStore((s) => s.toggleRead);
  const applyUpdatedBookmark = useStore((s) => s.applyUpdatedBookmark);
  const { message } = AntApp.useApp();
  const activeId = useRef(selected?.id);
  activeId.current = selected?.id;
  const webviewRef = useRef<HTMLElement | null>(null);
  const [loadingPage, setLoadingPage] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: '', description: '', categoryId: null as number | null, tags: [] as string[] });
  const [reader, setReader] = useState<{ title: string; html: string } | null>(null);
  const [readerLoading, setReaderLoading] = useState(false);
  const [readerTheme, setReaderTheme] = useState<'default' | 'warm' | 'dark'>('default');
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [expandedTags, setExpandedTags] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setEditing(false);
    setExpandedTags(false);
    setReaderLoading(false);
    setLoadingPage(false);
    setReader(null); // 切换收藏时退出阅读模式
    setLoadError(null);
  }, [selected?.id]);

  useEffect(() => {
    const wv = webviewRef.current as any;
    if (!wv) return;
    const start = (): void => {
      setLoadingPage(true);
      setLoadError(null);
    };
    const stop = (): void => setLoadingPage(false);
    // 加载失败（被站点拒绝嵌入 / 网络问题 / 证书错误）时给出可读提示与「外部打开」兜底，
    // 避免右侧出现莫名空白。errorCode -3 是被主动中断（重定向等），忽略。
    const fail = (e: any): void => {
      if (e?.errorCode === -3) return;
      if (e?.isMainFrame === false) return;
      setLoadingPage(false);
      setLoadError(e?.errorDescription || translate(getLang(), 'preview.pageLoadFailed'));
    };
    wv.addEventListener('did-start-loading', start);
    wv.addEventListener('did-stop-loading', stop);
    wv.addEventListener('did-fail-load', fail);
    return () => {
      wv.removeEventListener('did-start-loading', start);
      wv.removeEventListener('did-stop-loading', stop);
      wv.removeEventListener('did-fail-load', fail);
    };
  }, [selected?.id, reader, readerLoading, loadError]);

  if (!selected) {
    return (
      <div className="zc-empty">
        <GlobalOutlined style={{ fontSize: 48 }} />
        <Typography.Text type="secondary">{t('preview.selectToPreview')}</Typography.Text>
      </div>
    );
  }

  const openEdit = (): void => {
    setDraft({
      title: selected.title,
      description: selected.description,
      categoryId: selected.categoryId,
      tags: selected.tags,
    });
    setEditing(true);
  };

  const saveEdit = async (): Promise<void> => {
    setSaving(true);
    try {
      await window.api.bookmarks.update(selected.id, draft);
      setEditing(false);
      await Promise.all([loadBookmarks(), useStore.getState().refreshSidebarCounts()]);
      if (activeId.current === selected.id) await select(selected.id);
      message.success(t('preview.saved'));
    } catch (e: any) {
      message.error(String(e?.message ?? e));
    } finally { setSaving(false); }
  };

  const enterReader = async (): Promise<void> => {
    if (readerLoading) return;
    const requestedId = selected.id;
    setReaderLoading(true);
    try {
      let snap = await window.api.snapshot.get(selected.id);
      if (!snap || !snap.content) {
        snap = await window.api.snapshot.save(selected.id);
        const updated = await window.api.bookmarks.get(selected.id);
        if (updated) applyUpdatedBookmark(updated);
      }
      if (activeId.current !== selected.id) return;
      setReader({ title: selected.title, html: snap?.content || `<p>${t('preview.noContent')}</p>` });
    } catch {
      if (activeId.current === requestedId) message.error(t('preview.readerFailed'));
    } finally {
      if (activeId.current === requestedId) setReaderLoading(false);
    }
  };

  const doArchive = async (): Promise<void> => {
    setArchiving(true);
    try {
      const r: { content: string; images: number } | null = await window.api.snapshot.archive(selected.id);
      const updated = await window.api.bookmarks.get(selected.id);
      if (updated) applyUpdatedBookmark(updated);
      if (r && activeId.current === selected.id) {
        setReader({ title: selected.title, html: r.content });
        message.success(t('preview.archived', { n: r.images }));
      }
    } catch {
      message.error(t('preview.archiveFailed'));
    } finally {
      setArchiving(false);
    }
  };

  const reloadPage = (): void => {
    setLoadError(null);
    const wv = webviewRef.current as any;
    if (wv?.reload) wv.reload();
  };

  return (
    <div className="zc-detail-shell">
      <div className="zc-detail-meta">
        <div className="zc-detail-title">
          {selected.favicon ? <img className="zc-fav" src={selected.favicon} alt="" /> : <GlobalOutlined />}
          <Typography.Text strong className="zc-truncate" title={selected.title || selected.url} style={{ flex: 1, minWidth: 0 }}>
            {selected.title || selected.url}
          </Typography.Text>
          <Button type="text" icon={<CloseOutlined />} aria-label={lang === 'zh' ? '关闭详情' : 'Close details'} title={lang === 'zh' ? '关闭详情' : 'Close details'} onClick={onClose} />
        </div>
        <div className="zc-detail-actions">
          <Button loading={readerLoading} type={reader ? 'primary' : 'default'} icon={<FileTextOutlined />} onClick={() => (reader ? setReader(null) : void enterReader())}>{reader ? t('preview.back') : t('preview.readerMode')}</Button>
          <Button type="text" icon={<ExportOutlined />} onClick={() => window.api.openExternal(selected.url)}>{lang === 'zh' ? '浏览器打开' : 'Open in browser'}</Button>
          <Dropdown menu={{ items: [
            { key: 'copy', label: lang === 'zh' ? '复制引用与笔记' : 'Copy citation & notes' },
            { key: 'star', label: selected.favorite ? t('preview.unstar') : t('preview.star') },
            { key: 'read', label: selected.readState === 'read' ? t('preview.markUnread') : t('preview.markRead') },
            { type: 'divider' },
            { key: 'edit', label: t('preview.editTip') },
            { key: 'archive', label: t('preview.archiveTip'), disabled: archiving },
            { key: 'reenrich', label: t('preview.reenrichTip') },
          ], onClick: ({ key }) => {
            if (key === 'copy') navigator.clipboard.writeText(bookmarkMarkdown(selected)).then(() => message.success(lang === 'zh' ? '已复制 Markdown 引用与已保存笔记' : 'Citation and saved notes copied'), () => message.error(lang === 'zh' ? '复制失败，请手动复制链接' : 'Could not copy. Please copy the link manually.'));
            if (key === 'star') void toggleFavorite(selected);
            if (key === 'read') void toggleRead(selected);
            if (key === 'edit') openEdit();
            if (key === 'archive') void doArchive();
            if (key === 'reenrich') void window.api.bookmarks.reenrich(selected.id).then(() => message.info(t('preview.queuedAi')), () => message.error(t('preview.readerFailed')));
          } }}><Button type="text" icon={<MoreOutlined />} aria-label={lang === 'zh' ? '更多收藏操作' : 'More bookmark actions'} /></Dropdown>
        </div>
        {selected.description && (
          <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ fontSize: 12, margin: '6px 0 0' }}>
            {selected.description}
          </Typography.Paragraph>
        )}
        {!selected.deletedAt && <NoteEditor key={selected.id} bookmark={selected} />}
        <div className="zc-detail-tags">
          {(expandedTags ? selected.tags : selected.tags.slice(0, 3)).map((tag) => (
            <Tag key={tag} title={tag} color={tagColor(tag)} style={{ margin: 0 }}>
              {tag}
            </Tag>
          ))}
          {selected.tags.length > 3 && <Button size="small" type="text" aria-expanded={expandedTags} onClick={() => setExpandedTags((v) => !v)}>{expandedTags ? (lang === 'zh' ? '收起标签' : 'Fewer tags') : `+${selected.tags.length - 3} ${lang === 'zh' ? '个标签' : 'tags'}`}</Button>}
          {selected.visitCount > 0 && (
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {t('preview.visitTimes', { n: selected.visitCount, time: relativeTime(selected.visitedAt, lang) })}
            </Typography.Text>
          )}
        </div>
      </div>

      {/* 地址栏 */}
      <div className="zc-addr">
        {reader ? (
          <Button size="small" type="text" icon={<ArrowLeftOutlined />} onClick={() => setReader(null)}>
            {t('preview.back')}
          </Button>
        ) : (
          <Tooltip title={t('preview.refresh')}>
            <Button size="small" type="text" icon={<ReloadOutlined />} onClick={reloadPage} />
          </Tooltip>
        )}
        <span className="zc-addr-url" title={selected.url}>{selected.url}</span>
        {selected.hasSnapshot && <Tooltip title={t('preview.hasSnapshot')}><SaveOutlined style={{ color: '#52c41a' }} /></Tooltip>}
      </div>

      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex' }}>
        {loadingPage && !reader && (
          <div style={{ position: 'absolute', top: 8, right: 12, zIndex: 2 }}>
            <Spin indicator={<LoadingOutlined spin />} size="small" />
          </div>
        )}
        {readerLoading ? (
          <div className="zc-empty zc-reader-loading" role="status" aria-live="polite"><Spin indicator={<LoadingOutlined spin />} /><Typography.Text type="secondary">{t('preview.extracting')}</Typography.Text></div>
        ) : reader ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ padding: '6px 12px', display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('preview.readerStyle')}:</Typography.Text>
                <Segmented
                  size="small"
                  value={readerTheme}
                  onChange={(val) => setReaderTheme(val as 'default' | 'warm' | 'dark')}
                  options={[
                    { label: t('preview.readerDefault'), value: 'default' },
                    { label: t('preview.readerWarm'), value: 'warm' },
                    { label: t('preview.readerDark'), value: 'dark' },
                  ]}
                />
              </div>
              <iframe
                title={lang === 'zh' ? '离线阅读内容（沙箱隔离）' : 'Sandboxed offline reader'}
                sandbox=""
                referrerPolicy="no-referrer"
                style={{ flex: 1, border: 0, width: '100%', background: readerTheme === 'dark' ? '#1a1a2e' : readerTheme === 'warm' ? '#faf5eb' : '#fff' }}
                srcDoc={`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline';"><style>body{max-width:780px;margin:auto;padding:28px;font:15px/1.85 system-ui,sans-serif;overflow-wrap:anywhere;background:${readerTheme === 'dark' ? '#1a1a2e' : readerTheme === 'warm' ? '#faf5eb' : '#fff'};color:${readerTheme === 'dark' ? '#e0e0e0' : '#242c3d'}}img,video,table{max-width:100%;height:auto}pre{white-space:pre-wrap}h1{font-size:24px;line-height:1.4}a{color:#8175df}</style></head><body><h1>${reader.title.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))}</h1>${reader.html}</body></html>`}
              />
            </div>
        ) : loadError ? (
          <div className="zc-empty" style={{ flex: 1, gap: 12 }}>
            <GlobalOutlined style={{ fontSize: 40 }} />
            <Typography.Text type="secondary">{t('preview.cannotEmbed', { err: loadError })}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t('preview.cannotEmbedHint')}
            </Typography.Text>
            <Space wrap>
              <Button icon={<ReloadOutlined />} onClick={reloadPage}>
                {t('preview.retry')}
              </Button>
              <Button type="primary" icon={<ExportOutlined />} onClick={() => window.api.openExternal(selected.url)}>
                {t('preview.openInBrowser')}
              </Button>
              <Button icon={<ReadOutlined />} onClick={() => void enterReader()}>
                {t('preview.readerMode')}
              </Button>
            </Space>
          </div>
        ) : (
          React.createElement('webview', {
            ref: webviewRef,
            src: selected.url,
            className: 'zc-webview',
            key: selected.id,
            // 用标准桌面 Chrome UA：部分站点对 Electron / 未知 UA 返回空白或拒绝。
            useragent:
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
            // 持久分区：保留 cookie / 登录态，避免需要登录的站点反复空白。
            partition: 'persist:webview',
            style: { flex: 1 },
          })
        )}
      </div>

      <Modal title={t('preview.editTitle')} open={editing} confirmLoading={saving} onOk={saveEdit} onCancel={() => setEditing(false)} okText={t('common.save')} cancelText={t('common.cancel')}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={t('preview.titlePlaceholder')} />
          <Input.TextArea
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder={t('preview.descPlaceholder')}
            rows={3}
          />
          <Select mode="tags" aria-label={lang === 'zh' ? '标签' : 'Tags'} placeholder={lang === 'zh' ? '标签（回车添加）' : 'Tags'} value={draft.tags} onChange={(tags) => setDraft({ ...draft, tags })} style={{ width: '100%' }} />
          <Select
            style={{ width: '100%' }}
            value={draft.categoryId ?? undefined}
            placeholder={t('preview.selectCategory')}
            allowClear
            onChange={(v) => setDraft({ ...draft, categoryId: v ?? null })}
            options={categories.map((c) => ({ label: c.name, value: c.id }))}
          />
        </Space>
      </Modal>
    </div>
  );
}
