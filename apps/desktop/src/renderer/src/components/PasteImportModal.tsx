import React, { useMemo, useState } from 'react';
import { Modal, Input, Typography, Tag } from 'antd';
import { App as AntApp } from 'antd';
import { useStore } from '../store';
import { useI18n } from '../i18n';

const URL_RE = /https?:\/\/[^\s"'<>()]+/gi;

export default function PasteImportModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): React.ReactElement {
  const { message } = AntApp.useApp();
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const loadBookmarks = useStore((s) => s.loadBookmarks);
  const loadTags = useStore((s) => s.loadTags);

  const urls = useMemo(() => {
    const found = (text.match(URL_RE) ?? []).map((u) => u.replace(/[.,;:)\]]+$/, ''));
    return Array.from(new Set(found));
  }, [text]);

  const submit = async (): Promise<void> => {
    if (!urls.length) {
      message.warning(t('paste.noLinks'));
      return;
    }
    setLoading(true);
    try {
      const r: { created: number; skipped: number } = await window.api.bookmarks.importPaste(text);
      message.success(t('paste.importDone', { created: r.created, skipped: r.skipped }));
      await Promise.all([loadBookmarks(), loadTags()]);
      setText('');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={t('paste.title')}
      open={open}
      onCancel={onClose}
      onOk={submit}
      okText={t('paste.importN', { n: urls.length })}
      okButtonProps={{ disabled: !urls.length, loading }}
      cancelText={t('common.cancel')}
      width={560}
    >
      <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
        {t('paste.hint')}
      </Typography.Paragraph>
      <Input.TextArea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('paste.placeholder')}
        autoSize={{ minRows: 6, maxRows: 14 }}
      />
      <div style={{ marginTop: 10 }}>
        <Tag color={urls.length ? 'purple' : 'default'}>{t('paste.detectedN', { n: urls.length })}</Tag>
        {urls.slice(0, 6).map((u) => (
          <Tag key={u} style={{ marginTop: 4 }}>
            {u.length > 42 ? u.slice(0, 42) + '…' : u}
          </Tag>
        ))}
        {urls.length > 6 && <span style={{ color: '#999', fontSize: 12 }}>{t('paste.andN', { n: urls.length })}</span>}
      </div>
    </Modal>
  );
}
