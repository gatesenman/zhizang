import React, { useEffect, useState } from 'react';
import { Alert, Button, Form, Input, Space, App as AntApp, Typography } from 'antd';
import { useStore } from '../store';
import { cleanIpcError } from '../util';
export default function LicenseSettings(): React.ReactElement {
  const { message, modal } = AntApp.useApp();
  const license = useStore((s) => s.license);
  const refresh = useStore((s) => s.refreshLicense);
  const [base, setBase] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { window.api.license.getBackendUrl().then(setBase).catch((e) => message.error(cleanIpcError(e))); }, [message]);
  const run = async (activate: boolean): Promise<void> => {
    setBusy(true);
    try {
      await window.api.license.testServer(base);
      await window.api.license.setBackendUrl(base);
      if (activate) {
        if (!email.trim() || !code.trim()) throw new Error('请填写授权邮箱与激活码');
        const status = await window.api.license.activate(email.trim(), code.trim());
        if (!status.activated) throw new Error(status.reason || '激活失败');
        setCode(''); await refresh();
        message.success('授权已激活');
      } else message.success('服务连接正常，地址已保存');
    } catch (e) { message.error(cleanIpcError(e)); }
    finally { setBusy(false); }
  };
  return <Form layout="vertical">
    <Alert type={license.activated ? 'success' : 'info'} showIcon message={license.activated ? '许可证有效 · 可使用云同步' : '本地模式 · 无需激活即可管理本机收藏'} description="云同步需要发行方授权服务和有效许可证。不会模拟激活或替你注册服务。" style={{ marginBottom: 16 }} />
    <Form.Item label="授权/同步服务地址"><Input value={base} onChange={(e) => setBase(e.target.value)} placeholder="https://发行方提供的服务地址/api" /></Form.Item>
    <Form.Item><Button loading={busy} onClick={() => void run(false)}>测试并保存服务地址</Button></Form.Item>
    <Form.Item label="授权邮箱"><Input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Form.Item>
    <Form.Item label="激活码"><Input.Password value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" /></Form.Item>
    <Space><Button type="primary" loading={busy} onClick={() => void run(true)}>激活许可证</Button>{license.activated && <Button danger onClick={() => modal.confirm({ title: '解除本机授权？', content: '仅清除本机许可证，不删除收藏；设备解绑策略由服务端决定。', onOk: async () => { await window.api.license.deactivate(); await refresh(); } })}>解除本机授权</Button>}</Space>
    <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>验签公钥由发行方在构建时内置，需与服务端私钥配对。不要在客户端填写、导入或分享服务端私钥。切换服务地址会重置同步游标，不会删除本地收藏。</Typography.Paragraph>
  </Form>;
}
