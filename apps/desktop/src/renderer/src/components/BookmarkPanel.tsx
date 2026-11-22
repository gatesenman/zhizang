import { filterChips } from '../workflow';
import { libraryEmptyState } from '../library-presentation';
import React from 'react';
import { Tag, Typography, Dropdown, Pagination, Tooltip, Checkbox, Skeleton, Alert, Button } from 'antd';
import type { MenuProps } from 'antd';
import {
  ReloadOutlined,
  DeleteOutlined,
  ExportOutlined,
  StarFilled,
  StarOutlined,
  PushpinFilled,
  PushpinOutlined,
  ReadOutlined,
  FolderOpenOutlined,
  SaveOutlined,
  WarningFilled,
  UndoOutlined,
  CheckCircleTwoTone,
  PlusOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import { App as AntApp } from 'antd';
import type { Bookmark } from '@zhicang/shared';
import { useStore, PAGE_SIZE } from '../store';
import { tagColor, domainOf, relativeTime, faviconCandidates } from '../util';
import { useI18n, type Translate } from '../i18n';

function Favicon({ b, size = 18 }: { b: Bookmark; size?: number }): React.ReactElement {
  const style = { width: size, height: size };
  // 依次尝试：富化得到的 favicon → 站点 /favicon.ico → 公共 favicon 服务；全失败再退化为首字母占位。
  const candidates = React.useMemo(() => faviconCandidates(b.favicon, b.url), [b.favicon, b.url]);
  const candidatesKey = candidates.join('|');
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => setIdx(0), [candidatesKey]);
  if (idx >= candidates.length) {
    return (
      <span className="zc-fav zc-fav-ph" style={style}>
        {domainOf(b.url).slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      className="zc-fav"
      style={style}
      src={candidates[idx]}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setIdx((i) => i + 1)}
    />
  );
}

function contextMenuItems(
  b: Bookmark,
  categories: { id: number; name: string }[],
  isTrash: boolean,
  t: Translate,
): MenuProps['items'] {
  if (isTrash) {
    return [
      { key: 'restore', icon: <UndoOutlined />, label: t('bookmark.restore') },
      { key: 'delete', icon: <DeleteOutlined />, label: t('bookmark.deleteForever'), danger: true },
    ];
  }
  return [
    { key: 'open', icon: <ExportOutlined />, label: t('bookmark.openInBrowser') },
    {
      key: 'star',
      icon: b.favorite ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />,
      label: b.favorite ? t('bookmark.unstar') : t('bookmark.star'),
    },
    {
      key: 'pin',
      icon: b.pinned ? <PushpinFilled style={{ color: '#1677ff' }} /> : <PushpinOutlined />,
      label: b.pinned ? t('bookmark.unpin') : t('bookmark.pin'),
    },
    {
      key: 'read',
      icon: <ReadOutlined />,
      label: b.readState === 'read' ? t('bookmark.markUnread') : t('bookmark.markRead'),
    },
    { type: 'divider' },
    {
      key: 'move',
      icon: <FolderOpenOutlined />,
      label: t('bookmark.moveTo'),
      children: [
        { key: 'move:0', label: t('bookmark.uncategorized') },
        ...categories.map((c) => ({ key: `move:${c.id}`, label: c.name })),
      ],
    },
    { key: 'snapshot', icon: <SaveOutlined />, label: t('bookmark.saveSnapshot') },
    { key: 'check', icon: <WarningFilled />, label: t('bookmark.checkLink') },
    { key: 'reenrich', icon: <ReloadOutlined />, label: t('bookmark.reenrich') },
    { type: 'divider' },
    { key: 'delete', icon: <DeleteOutlined />, label: t('bookmark.moveToTrash'), danger: true },
  ];
}

function useItemActions(): (key: string, b: Bookmark) => Promise<void> {
  const { message, modal } = AntApp.useApp();
  const { t } = useI18n();
  const store = useStore;
  return async (key, b) => {
    const s = store.getState();
    if (key === 'open') window.api.openExternal(b.url);
    else if (key === 'star') await s.toggleFavorite(b);
    else if (key === 'pin') await s.togglePin(b);
    else if (key === 'read') await s.toggleRead(b);
    else if (key === 'reenrich') {
      await window.api.bookmarks.reenrich(b.id);
      message.info(t('bookmark.queuedAi'));
    } else if (key === 'snapshot') {
      message.loading({ content: t('bookmark.snapshotLoading'), key: 'snap' });
      try {
        await window.api.snapshot.save(b.id);
        message.success({ content: t('bookmark.snapshotSaved'), key: 'snap' });
      } catch {
        message.error({ content: t('bookmark.snapshotFailed'), key: 'snap' });
      }
    } else if (key === 'check') {
      const r = await window.api.links.check(b.id);
      const updated = await window.api.bookmarks.get(b.id);
      if (updated) s.applyUpdatedBookmark(updated);
      message.info(
        r && r.status === 'dead'
          ? t('bookmark.linkDead', { status: r.httpStatus ?? t('bookmark.timeout') })
          : t('bookmark.linkOk'),
      );
    } else if (key === 'restore') {
      await window.api.bookmarks.restore([b.id]);
      await s.select(null);
      await Promise.all([s.loadBookmarks(), s.refreshSidebarCounts()]);
      message.success(t('bookmark.restored'));
    } else if (key === 'delete') {
      if (s.nav.type === 'trash') {
        modal.confirm({
          title: t('bookmark.deleteForever'), content: b.title, okText: t('bookmark.deleteForever'),
          okButtonProps: { danger: true }, cancelText: t('common.cancel'),
          onOk: async () => {
            await window.api.bookmarks.purge([b.id]);
            await s.select(null);
            await Promise.all([s.loadBookmarks(), s.refreshSidebarCounts()]);
            message.success(t('bookmark.deletedForever'));
          },
        });
        return;
      } else {
        await s.removeBookmark(b.id);
      }
      message.success(t('bookmark.movedToTrash'));
    } else if (key.startsWith('move:')) {
      const cid = Number(key.slice(5)) || null;
      await window.api.bookmarks.move([b.id], cid);
      await Promise.all([s.loadBookmarks(), s.loadCategories()]);
      message.success(t('bookmark.moved'));
    }
  };
}

function HoverActions({ b }: { b: Bookmark }): React.ReactElement {
  const run = useItemActions();
  const { t } = useI18n();
  const stop = (e: React.MouseEvent): void => e.stopPropagation();
  return (
    <div className="zc-card-actions" onClick={stop}>
      <Tooltip title={b.favorite ? t('bookmark.unstar') : t('bookmark.starShort')}>
        <button type="button" className="zc-act" aria-label={b.favorite ? t('bookmark.unstar') : t('bookmark.starShort')} onClick={() => void run('star', b)}>
          {b.favorite ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
        </button>
      </Tooltip>
      <Tooltip title={b.pinned ? t('bookmark.unpin') : t('bookmark.pin')}>
        <button type="button" className="zc-act" aria-label={b.pinned ? t('bookmark.unpin') : t('bookmark.pin')} onClick={() => void run('pin', b)}>
          {b.pinned ? <PushpinFilled style={{ color: '#1677ff' }} /> : <PushpinOutlined />}
        </button>
      </Tooltip>
      <Tooltip title={t('bookmark.openShort')}>
        <button type="button" className="zc-act" aria-label={t('bookmark.openShort')} onClick={() => void run('open', b)}>
          <ExportOutlined />
        </button>
      </Tooltip>
    </div>
  );
}

function TagChips({ tags, max = 4 }: { tags: string[]; max?: number }): React.ReactElement {
  return (
    <>
      {tags.slice(0, max).map((tag) => (
        <Tag key={tag} title={tag} color={tagColor(tag)} style={{ margin: 0, fontSize: 11, lineHeight: '18px', padding: '0 6px' }}>
          {tag}
        </Tag>
      ))}
      {tags.length > max && <span style={{ fontSize: 11, color: '#999' }}>+{tags.length - max}</span>}
    </>
  );
}

interface BookmarkPanelProps {
  onAdd?: () => void;
  onOpenPreview?: () => void;
}

export default function BookmarkPanel({ onAdd, onOpenPreview }: BookmarkPanelProps = {}): React.ReactElement {
  const view = useStore((s) => s.view);
  const bookmarks = useStore((s) => s.bookmarks);
  const total = useStore((s) => s.total);
  const loading = useStore((s) => s.loading);
  const error = useStore((s) => s.error);
  const reload = useStore((s) => s.loadBookmarks);
  const selectedId = useStore((s) => s.selectedId);
  const selectedIds = useStore((s) => s.selectedIds);
  const select = useStore((s) => s.select);
  const visit = useStore((s) => s.visit);
  const toggleSelect = useStore((s) => s.toggleSelect);
  const query = useStore((s) => s.query);
  const setQuery = useStore((s) => s.setQuery);
  const run = useItemActions();
  const { t, lang } = useI18n();
  const categories = useStore((s) => s.categories);
  const nav = useStore((s) => s.nav);
  const isTrash = nav.type === 'trash';
  const ctxItemsFor = (b: Bookmark): MenuProps['items'] =>
    contextMenuItems(b, categories, isTrash, t);

  const onItemClick = (e: React.MouseEvent, b: Bookmark): void => {
    if (e.ctrlKey || e.metaKey) {
      toggleSelect(b.id);
      return;
    }
    onOpenPreview?.();
    select(b.id);
    void visit(b.id);
  };

  const onDragStart = (e: React.DragEvent, b: Bookmark): void => {
    const ids = selectedIds.includes(b.id) ? selectedIds : [b.id];
    e.dataTransfer.setData('application/zhicang-ids', JSON.stringify(ids));
    e.dataTransfer.effectAllowed = 'move';
  };

  if (error) return <Alert type="error" showIcon message={lang === 'zh' ? '收藏加载失败' : 'Unable to load bookmarks'} description={error} action={<Button onClick={() => void reload()}>{lang === 'zh' ? '重试' : 'Retry'}</Button>} />;

  if (loading && bookmarks.length === 0) {
    return (
      <div style={{ padding: 4 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="zc-card" style={{ padding: 12, marginBottom: 10 }}>
            <Skeleton active avatar paragraph={{ rows: 2 }} title={{ width: '60%' }} />
          </div>
        ))}
      </div>
    );
  }

  if (bookmarks.length === 0) {
    const empty = libraryEmptyState(nav.type, filterChips(query).length > 0, lang);
    return (
      <section className="zc-library-empty" aria-label={empty.title}>
        <div className="zc-empty-symbol" aria-hidden="true">{isTrash ? <DeleteOutlined /> : nav.type === 'favorite' ? <StarOutlined /> : <FolderOpenOutlined />}</div>
        <h2>{empty.title}</h2>
        <p>{empty.description}</p>
        {empty.action && <Button type="primary" icon={empty.action === 'add' ? <PlusOutlined /> : empty.action === 'all' ? <ArrowRightOutlined /> : undefined} onClick={() => {
          if (empty.action === 'add') onAdd?.();
          if (empty.action === 'clear') void useStore.getState().clearFilters();
          if (empty.action === 'all') void useStore.getState().searchAll();
        }}>{empty.actionLabel}</Button>}
      </section>
    );
  }

  const pager =
    total > PAGE_SIZE ? (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
        <Pagination
          size="small"
          current={Math.floor((query.offset ?? 0) / PAGE_SIZE) + 1}
          pageSize={PAGE_SIZE}
          total={total}
          showSizeChanger={false}
          onChange={(p) => setQuery({ offset: (p - 1) * PAGE_SIZE })}
        />
      </div>
    ) : null;

  // 卡片视图
  if (view === 'card') {
    return (
      <div>
        <div className="zc-grid">
          {bookmarks.map((b) => {
            const picked = selectedIds.includes(b.id);
            return (
              <Dropdown
                key={b.id}
                trigger={['contextMenu']}
                menu={{ items: ctxItemsFor(b), onClick: ({ key, domEvent }) => { domEvent.stopPropagation(); void run(key, b); } }}
              >
                <div
                  className={`zc-card zc-card-grid ${selectedId === b.id ? 'selected' : ''} ${picked ? 'picked' : ''}`}
                  data-bookmark-id={b.id}
                  aria-label={b.title || b.url}
                  draggable
                  onDragStart={(e) => onDragStart(e, b)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpenPreview?.(); void select(b.id); void visit(b.id); } }}
              onClick={(e) => onItemClick(e, b)}
                >
                  <div className="zc-card-cover">
                    {b.image ? (
                      <img src={b.image} alt="" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
                    ) : (
                      <div className="zc-card-cover-ph" style={{ background: `linear-gradient(135deg, ${tagColor(domainOf(b.url))}33, ${tagColor(domainOf(b.url))}11)` }}>
                        <Favicon b={b} size={32} />
                      </div>
                    )}
                    <Checkbox
                      aria-label={`${lang === 'zh' ? '选择收藏' : 'Select bookmark'}：${b.title || b.url}`}
                      className="zc-card-check"
                      checked={picked}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleSelect(b.id)}
                    />
                    {b.pinned && <PushpinFilled className="zc-card-pin" />}
                    {b.favorite && <StarFilled className="zc-card-star" />}
                    <HoverActions b={b} />
                  </div>
                  <div style={{ padding: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Favicon b={b} size={14} />
                      <span className="zc-domain-chip">{domainOf(b.url)}</span>
                      {b.status === 'dead' && (
                        <Tooltip title={t('bookmark.linkDead', { status: b.httpStatus ?? '' })}>
                          <WarningFilled style={{ color: '#ff4d4f', fontSize: 12 }} />
                        </Tooltip>
                      )}
                      {b.readState === 'unread' && <span className="zc-unread-dot" />}
                    </div>
                    <Typography.Text strong title={b.title || b.url} className="zc-truncate" style={{ display: 'block', marginTop: 6 }}>
                      {b.title || b.url}
                    </Typography.Text>
                    <Typography.Paragraph
                      type="secondary"
                      ellipsis={{ rows: 2 }}
                      style={{ fontSize: 12, margin: '4px 0 8px', minHeight: 32 }}
                    >
                      {b.description || ' '}
                    </Typography.Paragraph>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                      <TagChips tags={b.tags} />
                    </div>
                  </div>
                </div>
              </Dropdown>
            );
          })}
        </div>
        {pager}
      </div>
    );
  }

  // 列表视图
  return (
    <div>
      {bookmarks.map((b) => {
        const picked = selectedIds.includes(b.id);
        return (
          <Dropdown
            key={b.id}
            trigger={['contextMenu']}
            menu={{ items: ctxItemsFor(b), onClick: ({ key, domEvent }) => { domEvent.stopPropagation(); void run(key, b); } }}
          >
            <div
              className={`zc-list-item ${selectedId === b.id ? 'selected' : ''} ${picked ? 'picked' : ''}`}
              data-bookmark-id={b.id}
              aria-label={b.title || b.url}
              draggable
              onDragStart={(e) => onDragStart(e, b)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpenPreview?.(); void select(b.id); void visit(b.id); } }}
              onClick={(e) => onItemClick(e, b)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Checkbox
                  aria-label={`${lang === 'zh' ? '选择收藏' : 'Select bookmark'}：${b.title || b.url}`}
                  className="zc-list-check"
                  checked={picked}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleSelect(b.id)}
                />
                <Favicon b={b} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {b.pinned && <PushpinFilled style={{ color: '#1677ff', fontSize: 12 }} />}
                    {b.favorite && <StarFilled style={{ color: '#faad14', fontSize: 12 }} />}
                    <Typography.Text title={b.title || b.url} strong={b.readState === 'unread'} className="zc-truncate" style={{ flex: 1 }}>
                      {b.title || b.url}
                    </Typography.Text>
                    {b.readState === 'unread' && <span className="zc-unread-dot" />}
                  </div>
                  <div className="zc-list-metadata">
                    <span className="zc-domain-chip">{domainOf(b.url)}</span>
                    {b.status === 'dead' && <WarningFilled style={{ color: '#ff4d4f', fontSize: 11 }} />}
                    <span className="zc-item-time">{relativeTime(b.createdAt, lang)}</span>
                    <TagChips tags={b.tags} max={3} />
                  </div>
                </div>
                {b.aiState === 'done' && <CheckCircleTwoTone twoToneColor="#52c41a" title={t('bookmark.aiDone')} />}
                <HoverActions b={b} />
              </div>
            </div>
          </Dropdown>
        );
      })}
      {pager}
    </div>
  );
}
