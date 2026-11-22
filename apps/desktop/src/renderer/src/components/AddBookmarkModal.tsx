import React, { useState } from 'react';
import { Modal, Input, Select, Form, App as AntApp, Typography, Alert, Button, Space } from 'antd';
import { normalizeCaptureUrl } from '../workflow';
import { useStore } from '../store';
import { cleanIpcError } from '../util';
import { useI18n } from '../i18n';

export default function AddBookmarkModal({ open, onClose }: { open: boolean; onClose: () => void }): React.ReactElement {
  const { message } = AntApp.useApp();
  const { t, lang } = useI18n();
  const categories = useStore((s) => s.categories);
  const addBookmark = useStore((s) => s.addBookmark);
  const [trashedId, setTrashedId] = useState<number | null>(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = (): void => {
    setTrashedId(null);
    setUrl('');
    setTitle('');
    setTags([]);
    setCategoryId(null);
  };

  const normalized = (() => { try { return normalizeCaptureUrl(url); } catch { return ''; } })();

  const submit = async (restoreTrashed = false): Promise<void> => {
    if (submitting) return;
    let u: string;
    try { u = normalizeCaptureUrl(url); } catch (e) { message.warning(cleanIpcError(e)); return; }
    setSubmitting(true);
    try {
      const r = await addBookmark({ url: u, title: title.trim() || undefined, tags, categoryId, restoreTrashed });
      if (r.trashed) { setTrashedId(r.id ?? null); return; }
      if (r.restored) message.success('已恢复原收藏，原有笔记和标签保持不变');
      else if (r.duplicate) message.info(t('add.dupLocated'));
      else message.success(t('add.addedFetching'));
      reset();
      onClose();
    } catch (e: any) {
      message.error(cleanIpcError(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={t('add.title')}
      open={open}
      onOk={() => void submit()}
      confirmLoading={submitting}
      onCancel={() => {
        reset();
        onClose();
      }}
      okText={t('add.save')}
      cancelText={t('common.cancel')}
    >
      {trashedId != null && <Alert type="warning" showIcon message="此网址在回收站，尚未恢复" description="恢复将保留原有标题、标签与笔记，不会用当前表单覆盖。" action={<Space direction="vertical"><Button size="small" loading={submitting} onClick={() => void submit(true)}>恢复原收藏</Button><Button size="small" onClick={() => { void useStore.getState().revealBookmark(trashedId).then(() => { reset(); onClose(); }).catch((e) => message.error(cleanIpcError(e))); }}>去回收站查看</Button></Space>} />}
      <Form layout="vertical">
        <Form.Item label={t('add.urlLabel')}>
          <Input
            autoFocus
            value={url}
            onChange={(e) => { setUrl(e.target.value); setTrashedId(null); }}
            placeholder={t('add.urlPlaceholder')}
            aria-label="网页链接"
            onPressEnter={(e) => { if (!e.nativeEvent.isComposing) void submit(); }}
          />
        </Form.Item>
        {normalized && <Typography.Paragraph type="secondary" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>将保存：{normalized}</Typography.Paragraph>}
        <Form.Item label={lang === 'zh' ? '标题（可选）' : 'Title (optional)'}><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={lang === 'zh' ? '保留你自己的命名，或自动抓取网页标题' : 'Your title, or fetch it automatically'} /></Form.Item>
        <Form.Item label={lang === 'zh' ? '标签' : 'Tags'}><Select mode="tags" value={tags} onChange={setTags} placeholder={lang === 'zh' ? '输入后回车添加' : 'Type and press Enter'} /></Form.Item>
        <Form.Item label={t('add.categoryLabel')}>
          <Select
            value={categoryId ?? undefined}
            onChange={(v) => setCategoryId(v ?? null)}
            allowClear
            placeholder={t('add.selectCategory')}
            options={categories.map((c) => ({ label: c.name, value: c.id }))}
          />
        </Form.Item>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          未选分类将进入“待整理收件箱”；AI 未配置也能立即保存、搜索和做笔记。多个链接请使用工具栏“批量粘贴”。
        </Typography.Text>
      </Form>
    </Modal>
  );
}
