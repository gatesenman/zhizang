import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Alert, Button, Input, Space, App as AntApp } from 'antd';
import type { Bookmark } from '@zhicang/shared';
import { useI18n } from '../i18n';
import { NoteDraft } from '../note-draft';
import { useStore } from '../store';

export default function NoteEditor({ bookmark }: { bookmark: Bookmark }): React.ReactElement {
  const { message } = AntApp.useApp();
  const { lang } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [draft] = useState(() => new NoteDraft({ bookmark, storage: localStorage, save: window.api.bookmarks.saveNotes, onSaved: (b) => useStore.getState().applyUpdatedBookmark(b as Bookmark) }));
  const state = useSyncExternalStore(draft.subscribe, draft.snapshot);
  useEffect(() => { draft.observe(bookmark.notes || ''); }, [draft, bookmark.notes]);
  useEffect(() => { void draft.flush(); return draft.detach; }, [draft]);
  return <section className="zc-note-editor" aria-label={lang === 'zh' ? '我的笔记' : 'My notes'}>
    <div className="zc-note-heading"><Button className="zc-note-toggle" size="small" type="text" aria-expanded={expanded} aria-controls={`zc-note-body-${bookmark.id}`} onClick={() => setExpanded((v) => !v)}>{lang === 'zh' ? '我的笔记' : 'My notes'}<span aria-hidden="true">{expanded ? '−' : '+'}</span></Button><span role="status" aria-live="polite">{(lang === 'zh' ? { saved: '已保存', pending: '等待保存', saving: '正在保存…', error: '保存失败', conflict: '发现版本冲突' } : { saved: 'Saved', pending: 'Pending', saving: 'Saving…', error: 'Save failed', conflict: 'Version conflict' })[state.status]}</span>{expanded && <Button size="small" type="text" onClick={() => { navigator.clipboard.writeText(state.text).then(() => message.success(lang === 'zh' ? '笔记已复制' : 'Notes copied'), () => message.error(lang === 'zh' ? '复制失败，请手动选择文本复制' : 'Could not copy notes')); }}>{lang === 'zh' ? '复制' : 'Copy'}</Button>}</div>
    <div id={`zc-note-body-${bookmark.id}`} hidden={!expanded}>
    <Input.TextArea aria-label="编辑我的笔记" placeholder="边读边记，停止输入后自动保存；Ctrl/Cmd+Enter 立即保存" autoSize={{ minRows: 2, maxRows: 6 }} value={state.text} maxLength={100000} onChange={(e) => draft.edit(e.target.value)} onBlur={() => void draft.flush()} onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void draft.flush(); } }} />
    </div>
    {(state.error || !state.durable) && <Alert type="warning" showIcon message={state.error} description={state.durable ? '未保存草稿保留在此设备，切换收藏后可继续。' : '本机草稿尚未可靠写入，请立即保存或复制。'} />}
    {state.status === 'error' && <Button size="small" onClick={() => void draft.flush()}>重试保存</Button>}
    {state.status === 'conflict' && <Space><Button size="small" onClick={draft.useSaved}>使用数据库版本</Button><Button size="small" type="primary" onClick={draft.keepDraft}>保留我的草稿并保存</Button></Space>}
  </section>;
}
