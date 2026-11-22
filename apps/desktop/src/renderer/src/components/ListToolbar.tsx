import dayjs from 'dayjs';
import { cleanIpcError } from '../util';
import { filterChips } from '../workflow';
import React, { useState } from 'react';
import { Select, Button, Space, Dropdown, Input, DatePicker, Tag, App as AntApp } from 'antd';
import {
  DeleteOutlined,
  UndoOutlined,
  CheckSquareOutlined,
  SortAscendingOutlined,
  FilterOutlined,
  CopyOutlined,
  RightOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import type { BookmarkSort } from '@zhicang/shared';
import { useStore } from '../store';
import { useI18n } from '../i18n';

interface ListToolbarProps {
  onPaste?: () => void;
  onShowPreview?: () => void;
}

export default function ListToolbar({ onPaste, onShowPreview }: ListToolbarProps = {}): React.ReactElement {
  const { message, modal } = AntApp.useApp();
  const { t, lang } = useI18n();
  const sortOptions: { value: BookmarkSort; label: string }[] = [
    { value: 'created_desc', label: t('toolbar.sortCreatedDesc') },
    { value: 'created_asc', label: t('toolbar.sortCreatedAsc') },
    { value: 'visited_desc', label: t('toolbar.sortVisitedDesc') },
    { value: 'visit_count_desc', label: t('toolbar.sortVisitCountDesc') },
    { value: 'title_asc', label: t('toolbar.sortTitleAsc') },
  ];
  const total = useStore((s) => s.total);
  const pageCount = useStore((s) => s.bookmarks.length);
  const query = useStore((s) => s.query);
  const setQuery = useStore((s) => s.setQuery);
  const nav = useStore((s) => s.nav);
  const categories = useStore((s) => s.categories);
  const selectedIds = useStore((s) => s.selectedIds);
  const selectAll = useStore((s) => s.selectAll);
  const clearSelection = useStore((s) => s.clearSelection);
  const moveSelected = useStore((s) => s.moveSelected);
  const tagSelected = useStore((s) => s.tagSelected);
  const favoriteSelected = useStore((s) => s.favoriteSelected);
  const readSelected = useStore((s) => s.readSelected);
  const trashSelected = useStore((s) => s.trashSelected);
  const purgeSelected = useStore((s) => s.purgeSelected);
  const restoreSelected = useStore((s) => s.restoreSelected);
  const reenrichSelected = useStore((s) => s.reenrichSelected);

  const smartFolders = useStore((s) => s.smartFolders);
  const titles = lang === 'zh' ? { inbox: '待整理收件箱', all: '全部收藏', favorite: '星标收藏', unread: '稍后阅读', trash: '回收站' } : { inbox: 'Inbox', all: 'All bookmarks', favorite: 'Favorites', unread: 'Read later', trash: 'Trash' };
  const title = (nav.type === 'category' ? categories.find((c) => c.id === nav.id)?.name : nav.type === 'smart' ? smartFolders.find((f) => f.id === nav.id)?.name : titles[nav.type]) || (lang === 'zh' ? '收藏列表' : 'Bookmarks');
  const [showFilters, setShowFilters] = useState(false);
  const isTrash = nav.type === 'trash';
  const chips = filterChips(query);
  const clearFilters = useStore((s) => s.clearFilters);
  const searchAll = useStore((s) => s.searchAll);
  const n = selectedIds.length;

  const [batchBusy, setBatchBusy] = useState(false);
  const batch = async (task: () => Promise<void>, success: string): Promise<void> => {
    if (batchBusy) return;
    setBatchBusy(true);
    try { await task(); message.success(success); } catch (e) { message.error('操作未完成或刷新失败：' + cleanIpcError(e)); }
    finally { setBatchBusy(false); }
  };
  const checkedAction = async (task: () => Promise<void>): Promise<void> => {
    try { await task(); } catch (e) { message.error(cleanIpcError(e)); throw e; }
  };
  const promptTag = (): void => {
    let val = '';
    modal.confirm({
      title: t('toolbar.tagSelectedTitle'),
      content: <Input placeholder={t('toolbar.tagNamePlaceholder')} onChange={(e) => (val = e.target.value)} />,
      okText: t('toolbar.tagAdd'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        if (val.trim()) {
          await checkedAction(() => tagSelected(val.trim()));
          message.success(t('toolbar.tagged'));
        }
      },
    });
  };

  const moveItems = categories.map((c) => ({ key: `${c.id}`, label: c.name }));
  moveItems.unshift({ key: '0', label: t('toolbar.uncategorized') });

  const description = query.keyword
    ? `${lang === 'zh' ? '当前范围搜索' : 'Search in this collection'} · ${query.keyword}`
    : isTrash ? (lang === 'zh' ? '误删的内容可以恢复，永久删除前请确认' : 'Restore deleted items, or permanently remove them')
      : nav.type === 'inbox' ? (lang === 'zh' ? '先收下，再用分类与标签轻松整理' : 'Capture first. Organize with folders and tags later')
        : nav.type === 'smart' ? (lang === 'zh' ? '按目录规则自动汇集，支持继续搜索与筛选' : 'Automatically collected by rules. Search to refine')
          : nav.type === 'favorite' ? (lang === 'zh' ? '已标星的收藏，集中在这里查找' : 'Your starred bookmarks in one place')
            : nav.type === 'unread' ? (lang === 'zh' ? '尚未读完的收藏，方便接着阅读' : 'Unread bookmarks, ready to pick up again')
              : (lang === 'zh' ? '所有已保存的链接与阅读笔记' : 'All your saved links and reading notes');

  return (
    <div className="zc-list-toolbar">
      <header className="zc-library-heading">
        <div className="zc-library-title"><h1 title={title}>{title}</h1><span className="zc-library-count" aria-label={t('toolbar.totalN', { n: total })}>{total}</span></div>
        <p title={description}>{description}</p>
      </header>
      {n > 0 ? (
      <div className="zc-batchbar" aria-busy={batchBusy}>
        <CheckSquareOutlined />
        <span style={{ fontWeight: 600 }}>{t('toolbar.selectedN', { n })}</span>
        <div style={{ flex: 1 }} />
        {isTrash ? (
          <Space size={0}>
            <Button disabled={batchBusy} type="text" icon={<UndoOutlined />} onClick={() => void batch(restoreSelected, '已恢复所选收藏')}>
              {t('toolbar.restore')}
            </Button>
            <Button disabled={batchBusy} type="text" danger icon={<DeleteOutlined />} onClick={() => modal.confirm({ title: t('toolbar.deleteForever'), content: t('toolbar.selectedN', { n }), okButtonProps: { danger: true }, okText: t('toolbar.deleteForever'), cancelText: t('common.cancel'), onOk: () => checkedAction(purgeSelected) })}>
              {t('toolbar.deleteForever')}
            </Button>
          </Space>
        ) : (
          <Space size={4}>
            <Dropdown disabled={batchBusy}
              menu={{ items: moveItems, onClick: ({ key }) => void batch(() => moveSelected(Number(key) || null), '已移动所选收藏') }}
            >
              <Button disabled={batchBusy} type="text">
                {t('toolbar.moveTo')}
              </Button>
            </Dropdown>
            <Button disabled={batchBusy} type="text" onClick={promptTag}>
              {t('toolbar.tag')}
            </Button>
            <Dropdown disabled={batchBusy} menu={{ items: [
              { key: 'star', label: t('toolbar.star') },
              { key: 'read', label: t('toolbar.markRead') },
              { key: 'reenrich', label: t('toolbar.reenrich') },
              { type: 'divider' },
              { key: 'trash', label: t('toolbar.delete'), danger: true },
            ], onClick: ({ key }) => {
              if (key === 'star') void batch(() => favoriteSelected(true), lang === 'zh' ? '已星标所选收藏' : 'Added to favorites');
              if (key === 'read') void batch(() => readSelected('read'), lang === 'zh' ? '已标记为已读' : 'Marked as read');
              if (key === 'reenrich') void batch(reenrichSelected, lang === 'zh' ? '已加入重新分析队列' : 'Queued for analysis');
              if (key === 'trash') void batch(trashSelected, lang === 'zh' ? '已移入回收站，可随时恢复' : 'Moved to trash');
            } }}><Button type="text" icon={<MoreOutlined />} aria-label={lang === 'zh' ? '更多批量操作' : 'More batch actions'} /></Dropdown>
          </Space>
        )}
        <Button aria-label={lang === 'zh' ? '退出批量选择' : 'Cancel selection'} disabled={batchBusy} type="text" onClick={clearSelection}>{lang === 'zh' ? '取消' : 'Cancel'}</Button>
      </div>
      ) : (
      <div className="zc-library-actions" role="group" aria-label={lang === 'zh' ? '收藏操作' : 'Library actions'}>
        <div className="zc-library-utilities">
          {!isTrash && <Button className="zc-paste-action" aria-label={lang === 'zh' ? '批量粘贴链接' : 'Paste links'} type="text" icon={<CopyOutlined />} onClick={onPaste}>{lang === 'zh' ? '批量粘贴' : 'Paste links'}</Button>}
          {onShowPreview && <Button className="zc-show-preview-action" aria-label={lang === 'zh' ? '展开详情' : 'Show details'} type="text" icon={<RightOutlined />} onClick={onShowPreview}>{lang === 'zh' ? '展开详情' : 'Show details'}</Button>}
        </div>
        <div className="zc-library-controls">
        <Select
          aria-label={lang === 'zh' ? '收藏排序' : 'Sort bookmarks'}
          className="zc-sort-select"
          suffixIcon={<SortAscendingOutlined />}
          value={query.sort ?? 'created_desc'}
          onChange={(v) => setQuery({ sort: v })}
          options={sortOptions}
        />
        <Button
          className="zc-filter-action"
          aria-expanded={showFilters}
          aria-controls="zc-library-filters"
          type={showFilters ? 'primary' : 'text'}
          aria-label={lang === 'zh' ? '展开或收起筛选' : 'Toggle filters'}
          icon={<FilterOutlined />}
          onClick={() => setShowFilters((v) => !v)}
        >{lang === 'zh' ? '筛选' : 'Filter'}</Button>
        <Button type="text" disabled={pageCount === 0} onClick={selectAll}>
          {lang === 'zh' ? '全选当前页' : 'Select page'}
        </Button>
        </div>
      </div>
      )}

      {chips.length > 0 && (
        <div className="zc-filter-summary" aria-label={lang === 'zh' ? '当前搜索与筛选条件' : 'Active filters'}>
          {chips.map((chip) => <Tag key={chip.key} closable onClose={(e) => { e.preventDefault(); void setQuery(chip.clear); }}>{chip.label}</Tag>)}
          <Button size="small" type="link" onClick={() => void clearFilters()}>{lang === 'zh' ? '清除条件' : 'Clear filters'}</Button>
          {total > 0 && nav.type !== 'all' && <Button size="small" type="link" onClick={() => void searchAll()}>{lang === 'zh' ? '搜索全部收藏' : 'Search all bookmarks'}</Button>}
        </div>
      )}
      {showFilters && (
        <div id="zc-library-filters" className="zc-library-filters">
          <Input
            size="small"
            allowClear
            aria-label={t('toolbar.domainFilterPlaceholder')}
            placeholder={t('toolbar.domainFilterPlaceholder')}
            style={{ width: 180 }}
            value={query.domain ?? ''}
            onChange={(e) => setQuery({ domain: e.target.value || undefined })}
          />
          <Select
            size="small"
            allowClear
            aria-label={t('toolbar.status')}
            placeholder={t('toolbar.status')}
            style={{ width: 120 }}
            value={query.status}
            onChange={(v) => setQuery({ status: v })}
            options={[
              { value: 'active', label: t('toolbar.statusActive') },
              { value: 'dead', label: t('toolbar.statusDead') },
              { value: 'archived', label: t('toolbar.statusArchived') },
            ]}
          />
          <DatePicker.RangePicker
            size="small"
            value={query.createdFrom != null || query.createdTo != null ? [query.createdFrom ? dayjs(query.createdFrom) : null, query.createdTo ? dayjs(query.createdTo) : null] : null}
            onChange={(range) => {
              setQuery({
                createdFrom: range?.[0] ? range[0].startOf('day').valueOf() : undefined,
                createdTo: range?.[1] ? range[1].endOf('day').valueOf() : undefined,
              });
            }}
          />
          <Button
            size="small"
            type="link"
            onClick={() =>
              clearFilters()
            }
          >
            {t('toolbar.clearFilters')}
          </Button>
        </div>
      )}
    </div>
  );
}
