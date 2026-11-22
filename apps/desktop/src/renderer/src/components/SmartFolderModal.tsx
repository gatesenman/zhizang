import React, { useState } from 'react';
import { Modal, Input, Select, Form, InputNumber, App as AntApp } from 'antd';
import type { SmartFolderRule } from '@zhicang/shared';
import { useStore } from '../store';
import { useI18n } from '../i18n';

export default function SmartFolderModal({ open, onClose }: { open: boolean; onClose: () => void }): React.ReactElement {
  const { message } = AntApp.useApp();
  const { t } = useI18n();
  const tags = useStore((s) => s.tags);
  const loadSmartFolders = useStore((s) => s.loadSmartFolders);
  const [name, setName] = useState('');
  const [rule, setRule] = useState<SmartFolderRule>({});

  const submit = async (): Promise<void> => {
    if (!name.trim()) {
      message.warning(t('smart.enterName'));
      return;
    }
    await window.api.smart.create(name.trim(), rule, '#722ed1');
    await loadSmartFolders();
    message.success(t('smart.created'));
    setName('');
    setRule({});
    onClose();
  };

  return (
    <Modal title={t('smart.title')} open={open} onOk={submit} onCancel={onClose} okText={t('common.create')} cancelText={t('common.cancel')}>
      <Form layout="vertical">
        <Form.Item label={t('smart.nameLabel')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('smart.namePlaceholder')} />
        </Form.Item>
        <Form.Item label={t('smart.keywordLabel')}>
          <Input
            value={rule.keyword}
            onChange={(e) => setRule({ ...rule, keyword: e.target.value || undefined })}
            placeholder={t('smart.optional')}
          />
        </Form.Item>
        <Form.Item label={t('smart.tagsLabel')}>
          <Select
            mode="multiple"
            allowClear
            placeholder={t('smart.optional')}
            value={rule.tags}
            onChange={(v) => setRule({ ...rule, tags: v.length ? v : undefined })}
            options={tags.map((tag) => ({ label: tag.name, value: tag.name }))}
          />
        </Form.Item>
        <Form.Item label={t('smart.domainLabel')}>
          <Input
            value={rule.domain}
            onChange={(e) => setRule({ ...rule, domain: e.target.value || undefined })}
            placeholder={t('smart.domainPlaceholder')}
          />
        </Form.Item>
        <Form.Item label={t('smart.statusCond')}>
          <Select
            allowClear
            placeholder={t('smart.optional')}
            style={{ width: '100%' }}
            value={
              rule.favorite
                ? 'fav'
                : rule.readState === 'unread'
                  ? 'unread'
                  : rule.status === 'dead'
                    ? 'dead'
                    : undefined
            }
            onChange={(v) =>
              setRule({
                ...rule,
                favorite: v === 'fav' ? true : undefined,
                readState: v === 'unread' ? 'unread' : undefined,
                status: v === 'dead' ? 'dead' : undefined,
              })
            }
            options={[
              { value: 'fav', label: t('smart.onlyFav') },
              { value: 'unread', label: t('smart.onlyUnread') },
              { value: 'dead', label: t('smart.onlyDead') },
            ]}
          />
        </Form.Item>
        <Form.Item label={t('smart.recentDays')} extra={t('smart.recentDaysExtra')}>
          <InputNumber
            min={1}
            max={3650}
            style={{ width: 160 }}
            value={rule.recentDays}
            onChange={(v) => setRule({ ...rule, recentDays: v ?? undefined })}
            placeholder={t('smart.recentPlaceholder')}
          />
        </Form.Item>
        <Form.Item label={t('smart.aiState')}>
          <Select
            allowClear
            placeholder={t('smart.optional')}
            style={{ width: '100%' }}
            value={rule.hasAi === undefined ? undefined : rule.hasAi ? 'yes' : 'no'}
            onChange={(v) =>
              setRule({ ...rule, hasAi: v === 'yes' ? true : v === 'no' ? false : undefined })
            }
            options={[
              { value: 'yes', label: t('smart.onlyAi') },
              { value: 'no', label: t('smart.onlyNoAi') },
            ]}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
