import React, { useMemo, useState } from 'react';
import { Typography, Tag as AntTag, Modal, Input, Dropdown, Tooltip, App as AntApp } from 'antd';
import {
  FolderOutlined,
  StarOutlined,
  ClockCircleOutlined,
  PlusOutlined,
  TagsOutlined,
  AppstoreOutlined,
  DeleteOutlined,
  InboxOutlined,
  ReadOutlined,
  ThunderboltOutlined,
  EditOutlined,
  MoreOutlined,
  CaretRightOutlined,
  CaretDownOutlined,
} from '@ant-design/icons';
import { useStore, type NavKey } from '../store';
import type { Category } from '@zhicang/shared';
import { tagColor } from '../util';
import { useI18n } from '../i18n';

const DND_MIME = 'application/zhicang-ids';
const CAT_MIME = 'application/zhicang-cat';

const iconFor = (name?: string | null): React.ReactNode => {
  if (name === 'star') return <StarOutlined />;
  if (name === 'clock') return <ClockCircleOutlined />;
  return <FolderOutlined />;
};

function NavItem({
  active,
  icon,
  label,
  count,
  onClick,
  onDrop,
  onCategoryDrop,
  draggable,
  onDragStartItem,
  extra,
  indent = 0,
  leading,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: React.ReactNode;
  count?: number;
  onClick: () => void;
  onDrop?: (ids: number[]) => void;
  onCategoryDrop?: (draggedId: number) => void;
  draggable?: boolean;
  onDragStartItem?: (e: React.DragEvent) => void;
  extra?: React.ReactNode;
  indent?: number;
  leading?: React.ReactNode;
}): React.ReactElement {
  const [over, setOver] = useState(false);
  const acceptsDrop = !!onDrop || !!onCategoryDrop;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={active}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}
      className={`zc-nav-item ${active ? 'active' : ''} ${over ? 'dragover' : ''}`}
      style={indent ? { paddingLeft: 8 + indent * 14 } : undefined}
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStartItem}
      onDragOver={acceptsDrop ? (e) => { e.preventDefault(); setOver(true); } : undefined}
      onDragLeave={acceptsDrop ? () => setOver(false) : undefined}
      onDrop={
        acceptsDrop
          ? (e) => {
              e.preventDefault();
              setOver(false);
              const cat = e.dataTransfer.getData(CAT_MIME);
              if (cat && onCategoryDrop) {
                onCategoryDrop(Number(cat));
                return;
              }
              const raw = e.dataTransfer.getData(DND_MIME);
              if (raw && onDrop) onDrop(JSON.parse(raw) as number[]);
            }
          : undefined
      }
    >
      {leading != null && <span className="zc-nav-caret">{leading}</span>}
      <span className="zc-nav-icon">{icon}</span>
      <span className="zc-nav-label">{label}</span>
      {extra}
      {count != null && count > 0 && <span className="zc-nav-count">{count}</span>}
    </div>
  );
}

// 目录之间的拖拽缝隙：把被拖拽目录放到此处（同级重排 / 上提 / 入子级末尾）
function CatGap({ indent, onDropCategory }: { indent: number; onDropCategory: (draggedId: number) => void }): React.ReactElement {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(CAT_MIME)) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        const raw = e.dataTransfer.getData(CAT_MIME);
        setOver(false);
        if (raw) {
          e.preventDefault();
          onDropCategory(Number(raw));
        }
      }}
      style={{
        height: over ? 16 : 8,
        marginTop: -4,
        marginBottom: -4,
        marginLeft: 8 + indent * 14,
        borderRadius: 4,
        background: over ? 'rgba(22,119,255,0.25)' : 'transparent',
      }}
    />
  );
}

export default function Sidebar(): React.ReactElement {
  const { message, modal } = AntApp.useApp();
  const { t } = useI18n();
  const categories = useStore((s) => s.categories);
  const categoryCounts = useStore((s) => s.categoryCounts);
  const tags = useStore((s) => s.tags);
  const tagCounts = useStore((s) => s.tagCounts);
  const smartFolders = useStore((s) => s.smartFolders);
  const trashCnt = useStore((s) => s.trashCnt);
  const nav = useStore((s) => s.nav);
  const query = useStore((s) => s.query);
  const setNav = useStore((s) => s.setNav);
  const toggleTagFilter = useStore((s) => s.toggleTagFilter);
  const loadCategories = useStore((s) => s.loadCategories);
  const loadSmartFolders = useStore((s) => s.loadSmartFolders);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  // 父分类默认折叠，仅记录被用户展开的节点，避免侧栏一次铺开过长
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const is = (k: NavKey['type']): boolean => nav.type === k;
  const activeTags = query.tags ?? [];

  // 由扁平分类列表（parentId）构建父→子映射，用于在侧栏渲染多级目录树
  const childrenOf = useMemo(() => {
    const map = new Map<number | null, Category[]>();
    for (const c of categories) {
      const pid = c.parentId ?? null;
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid)!.push(c);
    }
    return map;
  }, [categories]);

  const toggleExpand = (id: number): void =>
    setExpanded((m) => ({ ...m, [id]: !m[id] }));

  // 有子节点的父分类 id（用于「全部展开/折叠」切换）
  const parentIds = useMemo(
    () => categories.filter((c) => (childrenOf.get(c.id)?.length ?? 0) > 0).map((c) => c.id),
    [categories, childrenOf],
  );
  const anyExpanded = parentIds.some((id) => expanded[id]);
  const toggleExpandAll = (): void =>
    setExpanded(anyExpanded ? {} : Object.fromEntries(parentIds.map((id) => [id, true])));

  const dropMove = (categoryId: number | null) => async (ids: number[]) => {
    await window.api.bookmarks.move(ids, categoryId);
    await Promise.all([useStore.getState().loadBookmarks(), loadCategories()]);
    useStore.getState().clearSelection();
    message.success(t('sidebar.moved', { n: ids.length }));
  };

  const createCategory = async (): Promise<void> => {
    if (!name.trim()) return;
    await window.api.categories.create(name.trim(), null);
    setName('');
    setAdding(false);
    await loadCategories();
    message.success(t('sidebar.categoryCreated'));
  };

  const addSiblingCategory = (parentId: number | null): void => {
    let val = '';
    modal.confirm({
      title: t('sidebar.siblingTitle'),
      icon: <PlusOutlined />,
      content: <Input placeholder={t('sidebar.siblingNamePlaceholder')} onChange={(e) => (val = e.target.value)} />,
      okText: t('common.create'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        if (val.trim()) {
          await window.api.categories.create(val.trim(), parentId);
          await loadCategories();
          message.success(t('sidebar.siblingCreated'));
        }
      },
    });
  };

  // 目标是否落在被拖拽节点的子树内（含自身）——用于禁止把父目录拖进自己的子孙
  const isWithinSubtree = (candidateId: number, rootId: number): boolean => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    let node = byId.get(candidateId);
    while (node) {
      if (node.id === rootId) return true;
      node = node.parentId != null ? byId.get(node.parentId) : undefined;
    }
    return false;
  };

  // 跨层级移动 / 同级重排：把 draggedId 放到 newParentId 下、beforeId 之前（beforeId 为 null 则追加到末尾）
  const moveCategoryTo = async (
    draggedId: number,
    newParentId: number | null,
    beforeId: number | null,
  ): Promise<void> => {
    if (draggedId === beforeId) return;
    if (newParentId != null && isWithinSubtree(newParentId, draggedId)) return;
    await window.api.categories.move(draggedId, newParentId, 0);
    const sibs = (childrenOf.get(newParentId) ?? []).map((c) => c.id).filter((id) => id !== draggedId);
    const at = beforeId != null && sibs.includes(beforeId) ? sibs.indexOf(beforeId) : sibs.length;
    sibs.splice(at, 0, draggedId);
    await window.api.categories.reorder(sibs);
    if (newParentId != null) setExpanded((m) => ({ ...m, [newParentId]: true }));
    await loadCategories();
    message.success(t('sidebar.catMoved'));
  };

  const addSubCategory = (parentId: number, parentName: string): void => {
    let val = '';
    modal.confirm({
      title: t('sidebar.subUnder', { name: parentName }),
      icon: <PlusOutlined />,
      content: <Input placeholder={t('sidebar.subNamePlaceholder')} onChange={(e) => (val = e.target.value)} />,
      okText: t('common.create'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        if (val.trim()) {
          await window.api.categories.create(val.trim(), parentId);
          setExpanded((m) => ({ ...m, [parentId]: true }));
          await loadCategories();
          message.success(t('sidebar.subCreated'));
        }
      },
    });
  };

  const renameCategory = (id: number, old: string): void => {
    let val = old;
    modal.confirm({
      title: t('sidebar.renameCategory'),
      icon: <EditOutlined />,
      content: <Input defaultValue={old} onChange={(e) => (val = e.target.value)} />,
      okText: t('common.save'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        if (val.trim()) {
          await window.api.categories.rename(id, val.trim());
          await loadCategories();
          message.success(t('sidebar.renamed'));
        }
      },
    });
  };

  const removeCategory = (id: number, label: string): void => {
    modal.confirm({
      title: t('sidebar.deleteCategoryTitle', { name: label }),
      content: t('sidebar.deleteCategoryContent'),
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await window.api.categories.remove(id);
          await loadCategories();
          message.success(t('sidebar.deleted'));
        } catch (e: any) {
          message.error(e?.message ?? t('sidebar.deleteFailed'));
        }
      },
    });
  };

  const removeSmart = async (id: number): Promise<void> => {
    await window.api.smart.remove(id);
    await loadSmartFolders();
    if (nav.type === 'smart' && nav.id === id) await setNav({ type: 'all' });
    message.success(t('sidebar.smartDeleted'));
  };

  // 聚合计数：父分类显示「自身 + 所有子孙」的收藏数
  const aggregateCount = (id: number): number => {
    let sum = categoryCounts[id] ?? 0;
    for (const child of childrenOf.get(id) ?? []) sum += aggregateCount(child.id);
    return sum;
  };

  const renderCategory = (c: Category, depth: number): React.ReactNode => {
    const kids = childrenOf.get(c.id) ?? [];
    const hasKids = kids.length > 0;
    const isOpen = !!expanded[c.id];
    const caret = hasKids ? (
      isOpen ? <CaretDownOutlined /> : <CaretRightOutlined />
    ) : (
      <span style={{ display: 'inline-block', width: 12 }} />
    );
    const parentId = c.parentId ?? null;
    return (
      <React.Fragment key={c.id}>
        {/* 拖到此缝隙：与该节点同级，插入到它之前 */}
        <CatGap indent={depth} onDropCategory={(d) => void moveCategoryTo(d, parentId, c.id)} />
        <Dropdown
          trigger={['contextMenu']}
          menu={{
            items: c.isSystem
              ? [{ key: 'rename', icon: <EditOutlined />, label: t('sidebar.rename') }]
              : [
                  { key: 'rename', icon: <EditOutlined />, label: t('sidebar.rename') },
                  { key: 'sub', icon: <PlusOutlined />, label: t('sidebar.newSubCategory') },
                  { key: 'sibling', icon: <PlusOutlined />, label: t('sidebar.newSiblingCategory') },
                  { key: 'delete', icon: <DeleteOutlined />, label: t('common.delete'), danger: true },
                ],
            onClick: ({ key, domEvent }) => {
              domEvent.stopPropagation();
              if (key === 'rename') renameCategory(c.id, c.name);
              if (key === 'sub') addSubCategory(c.id, c.name);
              if (key === 'sibling') addSiblingCategory(parentId);
              if (key === 'delete') removeCategory(c.id, c.name);
            },
          }}
        >
          <div>
            <NavItem
              active={nav.type === 'category' && nav.id === c.id}
              indent={depth}
              draggable
              onDragStartItem={(e) => {
                e.dataTransfer.setData(CAT_MIME, String(c.id));
                e.dataTransfer.effectAllowed = 'move';
              }}
              leading={
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    if (hasKids) toggleExpand(c.id);
                  }}
                  style={{ cursor: hasKids ? 'pointer' : 'default', fontSize: 10, color: '#999' }}
                >
                  {caret}
                </span>
              }
              icon={iconFor(c.icon)}
              label={<span className="zc-truncate" style={{ maxWidth: 110, display: 'inline-block' }}>{c.name}</span>}
              count={aggregateCount(c.id)}
              onClick={() => setNav({ type: 'category', id: c.id })}
              onDrop={dropMove(c.id)}
              onCategoryDrop={(draggedId) => void moveCategoryTo(draggedId, c.id, null)}
            />
          </div>
        </Dropdown>
        {hasKids && isOpen && (
          <>
            {kids.map((k) => renderCategory(k, depth + 1))}
            {/* 拖到子级末尾缝隙：成为该目录的最后一个子级 */}
            <CatGap indent={depth + 1} onDropCategory={(d) => void moveCategoryTo(d, c.id, null)} />
          </>
        )}
      </React.Fragment>
    );
  };

  return (
    <div className="zc-sider">
      <div className="zc-nav-group">
        <NavItem active={is('inbox')} icon={<InboxOutlined />} label="待整理收件箱" count={categories.filter((c) => c.isSystem).reduce((n, c) => n + (categoryCounts[c.id] ?? 0), 0)} onClick={() => setNav({ type: 'inbox' })} />
        <NavItem active={is('all')} icon={<AppstoreOutlined />} label={t('sidebar.navAll')} onClick={() => setNav({ type: 'all' })} />
        <NavItem active={is('favorite')} icon={<StarOutlined />} label={t('sidebar.navFavorite')} onClick={() => setNav({ type: 'favorite' })} />
        <NavItem active={is('unread')} icon={<ReadOutlined />} label={t('sidebar.navUnread')} onClick={() => setNav({ type: 'unread' })} />
        <NavItem
          active={is('trash')}
          icon={<InboxOutlined />}
          label={t('sidebar.navTrash')}
          count={trashCnt}
          onClick={() => setNav({ type: 'trash' })}
        />
      </div>

      <div className="zc-nav-title">
        <span><FolderOutlined /> {t('sidebar.categoriesTitle')}</span>
        <span style={{ display: 'inline-flex', gap: 2 }}>
          {parentIds.length > 0 && (
            <Tooltip title={anyExpanded ? t('sidebar.collapseAll') : t('sidebar.expandAll')}>
              {anyExpanded ? (
                <CaretDownOutlined className="zc-nav-add" onClick={toggleExpandAll} />
              ) : (
                <CaretRightOutlined className="zc-nav-add" onClick={toggleExpandAll} />
              )}
            </Tooltip>
          )}
          <Tooltip title={t('sidebar.newTopCategory')}>
            <PlusOutlined className="zc-nav-add" onClick={() => setAdding(true)} />
          </Tooltip>
        </span>
      </div>
      <div className="zc-nav-group">
        {(childrenOf.get(null) ?? []).map((c) => renderCategory(c, 0))}
        {/* 拖到根目录末尾缝隙：上提为顶级分类 */}
        <CatGap indent={0} onDropCategory={(d) => void moveCategoryTo(d, null, null)} />
      </div>

      {smartFolders.length > 0 && (
        <>
          <div className="zc-nav-title">
            <span><ThunderboltOutlined /> {t('sidebar.smartFoldersTitle')}</span>
          </div>
          <div className="zc-nav-group">
            {smartFolders.map((f) => (
              <NavItem
                key={f.id}
                active={nav.type === 'smart' && nav.id === f.id}
                icon={<ThunderboltOutlined style={{ color: f.color ?? '#722ed1' }} />}
                label={f.name}
                onClick={() => setNav({ type: 'smart', id: f.id })}
                extra={
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: [{ key: 'del', icon: <DeleteOutlined />, label: t('common.delete'), danger: true }],
                      onClick: ({ domEvent }) => { domEvent.stopPropagation(); void removeSmart(f.id); },
                    }}
                  >
                    <MoreOutlined className="zc-nav-more" onClick={(e) => e.stopPropagation()} />
                  </Dropdown>
                }
              />
            ))}
          </div>
        </>
      )}

      <div className="zc-nav-title">
        <span><TagsOutlined /> {t('sidebar.tagsTitle')}</span>
      </div>
      <div style={{ padding: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {tags.length === 0 && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t('sidebar.noTags')}
          </Typography.Text>
        )}
        {tags.map((tg) => {
          const checked = activeTags.includes(tg.name);
          return (
            <AntTag.CheckableTag
              key={tg.id}
              checked={checked}
              onChange={() => toggleTagFilter(tg.name)}
              style={checked ? { background: tagColor(tg.name), borderColor: tagColor(tg.name) } : { borderColor: tagColor(tg.name), color: tagColor(tg.name) }}
            >
              {tg.name}
              {tagCounts[tg.name] ? ` (${tagCounts[tg.name]})` : ''}
            </AntTag.CheckableTag>
          );
        })}
      </div>

      <Modal
        title={t('sidebar.newCategory')}
        open={adding}
        onOk={createCategory}
        onCancel={() => setAdding(false)}
        okText={t('common.create')}
        cancelText={t('common.cancel')}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('sidebar.categoryNamePlaceholder')} onPressEnter={createCategory} />
      </Modal>
    </div>
  );
}
