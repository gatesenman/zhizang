import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Input } from 'antd';
import {
  SearchOutlined,
  PlusOutlined,
  AppstoreOutlined,
  StarOutlined,
  ReadOutlined,
  InboxOutlined,
  BulbOutlined,
  SettingOutlined,
  SyncOutlined,
  BarChartOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import { useStore } from '../store';
import { domainOf } from '../util';
import { useI18n } from '../i18n';

interface Cmd {
  key: string;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  run: () => void;
}

export default function CommandPalette({
  open,
  onClose,
  onAdd,
  onSettings,
  onStats,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: () => void;
  onSettings: () => void;
  onStats: () => void;
}): React.ReactElement {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<any>(null);
  const setNav = useStore((s) => s.setNav);
  const setView = useStore((s) => s.setView);
  const toggleDark = useStore((s) => s.toggleDark);
  const runSync = useStore((s) => s.runSync);
  const setQuery = useStore((s) => s.setQuery);
  const bookmarks = useStore((s) => s.bookmarks);
  const select = useStore((s) => s.select);
  const visit = useStore((s) => s.visit);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const actions: Cmd[] = useMemo(
    () => [
      { key: 'add', icon: <PlusOutlined />, label: t('cmd.add'), hint: 'Ctrl+N', run: onAdd },
      { key: 'all', icon: <AppstoreOutlined />, label: t('cmd.goAll'), run: () => setNav({ type: 'all' }) },
      { key: 'fav', icon: <StarOutlined />, label: t('cmd.goFav'), run: () => setNav({ type: 'favorite' }) },
      { key: 'unread', icon: <ReadOutlined />, label: t('cmd.goUnread'), run: () => setNav({ type: 'unread' }) },
      { key: 'trash', icon: <InboxOutlined />, label: t('cmd.goTrash'), run: () => setNav({ type: 'trash' }) },
      { key: 'card', icon: <AppstoreOutlined />, label: t('cmd.toCard'), run: () => setView('card') },
      { key: 'list', icon: <AppstoreOutlined />, label: t('cmd.toList'), run: () => setView('list') },
      { key: 'dark', icon: <BulbOutlined />, label: t('cmd.toggleTheme'), run: toggleDark },
      { key: 'sync', icon: <SyncOutlined />, label: t('cmd.syncNow'), run: () => void runSync() },
      { key: 'stats', icon: <BarChartOutlined />, label: t('cmd.openStats'), run: onStats },
      { key: 'settings', icon: <SettingOutlined />, label: t('cmd.openSettings'), run: onSettings },
    ],
    [onAdd, onSettings, onStats, setNav, setView, toggleDark, runSync, t],
  );

  const isSearch = q.trim().length > 0;
  const lower = q.trim().toLowerCase();
  const filteredActions = isSearch
    ? actions.filter((a) => a.label.toLowerCase().includes(lower))
    : actions;
  const matchedBookmarks = isSearch
    ? bookmarks
        .filter(
          (b) =>
            (b.title || '').toLowerCase().includes(lower) ||
            b.url.toLowerCase().includes(lower) ||
            b.tags.some((tag) => tag.toLowerCase().includes(lower)),
        )
        .slice(0, 6)
    : [];

  type Row = { type: 'action'; cmd: Cmd } | { type: 'bm'; id: number; title: string; url: string };
  const rows: Row[] = [
    ...filteredActions.map((cmd) => ({ type: 'action' as const, cmd })),
    ...matchedBookmarks.map((b) => ({ type: 'bm' as const, id: b.id, title: b.title || b.url, url: b.url })),
  ];

  const exec = (row: Row): void => {
    if (row.type === 'action') row.cmd.run();
    else {
      select(row.id);
      void visit(row.id);
    }
    onClose();
  };

  const onSearchEnter = (): void => {
    // 没有匹配项时，把输入作为全局搜索关键词
    if (rows.length === 0 || (isSearch && filteredActions.length === 0 && matchedBookmarks.length === 0)) {
      setQuery({ keyword: q });
      onClose();
      return;
    }
    const row = rows[active] ?? rows[0];
    if (row) exec(row);
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      className="zc-cmd"
      width={560}
      styles={{ body: { padding: 0 } }}
      destroyOnClose
    >
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <Input
          ref={inputRef}
          className="zc-cmd-input"
          variant="borderless"
          prefix={<SearchOutlined style={{ color: '#999' }} />}
          placeholder={t('cmd.placeholder')}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, Math.max(rows.length - 1, 0)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              onSearchEnter();
            }
          }}
        />
      </div>
      <div style={{ maxHeight: 380, overflowY: 'auto', padding: '6px 0' }}>
        {rows.length === 0 && (
          <div style={{ padding: 16, color: '#999' }}>{t('cmd.searchFor', { q })}</div>
        )}
        {rows.map((row, i) => (
          <div
            key={row.type === 'action' ? `a-${row.cmd.key}` : `b-${row.id}`}
            className={`zc-cmd-item ${i === active ? 'active' : ''}`}
            onMouseEnter={() => setActive(i)}
            onClick={() => exec(row)}
          >
            {row.type === 'action' ? (
              <>
                <span style={{ color: '#4f46e5' }}>{row.cmd.icon}</span>
                <span style={{ flex: 1 }}>{row.cmd.label}</span>
                {row.cmd.hint && <kbd style={{ fontSize: 11, color: '#999' }}>{row.cmd.hint}</kbd>}
              </>
            ) : (
              <>
                <ExportOutlined style={{ color: '#52c41a' }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.title}
                </span>
                <span style={{ fontSize: 11, color: '#999' }}>{domainOf(row.url)}</span>
              </>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
