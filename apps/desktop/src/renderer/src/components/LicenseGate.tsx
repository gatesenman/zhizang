import React, { useEffect, useState } from 'react';
import { Card, Input, Button, Typography, Space, Divider, Collapse, App as AntApp, Tag } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import { useStore } from '../store';
import { useI18n } from '../i18n';

export default function LicenseGate({ onTrial }: { onTrial: () => void }): React.ReactElement {
  const { message } = AntApp.useApp();
  const { t } = useI18n();
  const refreshLicense = useStore((s) => s.refreshLicense);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [backendUrl, setBackendUrl] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    window.api.license.deviceId().then(setDeviceId);
    window.api.license.getBackendUrl().then(setBackendUrl);
  }, []);

  const activate = async (): Promise<void> => {
    if (!email.trim() || !code.trim()) {
      message.warning(t('license.fillEmailCode'));
      return;
    }
    setLoading(true);
    try {
      if (backendUrl) await window.api.license.setBackendUrl(backendUrl.trim());
      const status = await window.api.license.activate(email.trim(), code.trim());
      if (status.activated) {
        message.success(t('license.activateSuccess'));
        await refreshLicense();
      } else {
        message.error(status.reason ?? t('license.activateFailed'));
      }
    } catch (e: any) {
      message.error(e?.message ?? t('license.activateFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="zc-gate">
      <Card style={{ width: 460 }} variant="borderless">
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div className="zc-logo-badge" style={{ width: 48, height: 48, margin: '0 auto 12px', fontSize: 24 }}>
            智
          </div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {t('license.appName')}
          </Typography.Title>
          <Typography.Text type="secondary">{t('license.tagline')}</Typography.Text>
        </div>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Input prefix={<SafetyCertificateOutlined />} placeholder={t('license.emailPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input placeholder={t('license.codePlaceholder')} value={code} onChange={(e) => setCode(e.target.value)} />
          <Button type="primary" block loading={loading} onClick={activate}>
            {t('license.activate')}
          </Button>
          <Button type="link" block onClick={onTrial}>
            {t('license.tryLimited')}
          </Button>
        </Space>
        <Divider style={{ margin: '12px 0' }} />
        <Collapse
          ghost
          size="small"
          items={[
            {
              key: 'adv',
              label: t('license.advanced'),
              children: (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {t('license.backendUrl')}
                  </Typography.Text>
                  <Input value={backendUrl} onChange={(e) => setBackendUrl(e.target.value)} placeholder="http://localhost:3001" />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {t('license.deviceCode')}<Tag>{deviceId.slice(0, 16)}…</Tag>
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {t('license.noCode')}
                  </Typography.Text>
                </Space>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
