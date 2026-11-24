import React, { useEffect, useState } from 'react';
import { Alert, App, Button, Form, Input, Space } from 'antd';
import { cleanIpcError } from '../util';

export default function SyncAccountSettings({ onSessionChange }: { onSessionChange: () => void }): React.ReactElement {
  const { message } = App.useApp();
  const [base, setBase] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [account, setAccount] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = async (): Promise<void> => {
    const status = await window.api.sync.accountStatus();
    setBase(status.backendUrl); setAccount(status.connected ? status.email || '' : '');
  };
  useEffect(() => { void refresh().catch((e) => message.error(cleanIpcError(e))); }, [message]);
  const connect = async (register: boolean): Promise<void> => {
    setBusy(true);
    try {
      await window.api.sync.setBackendUrl(base);
      await window.api.sync.testServer(base);
      await window.api.sync.connect(email, password, register);
      setPassword(''); await refresh(); onSessionChange(); message.success('同步账号已连接，请按需开启自动同步');
    } catch (e) { message.error(cleanIpcError(e)); }
    finally { setBusy(false); }
  };
  return <Form layout="vertical">
    <Alert type="info" showIcon message="免费开源 · 本地无需账号、注册码或试用期" description="仅当需要跨设备同步时，连接你自己部署或信任的智藏服务。账号用于隔离私人收藏，不是付费授权。服务运营及外部 AI API 可能产生第三方费用。旧版授权设置会被忽略，不会删除收藏。" style={{ marginBottom: 16 }} />
    {account && <Alert type="success" message={`已连接：${account}（会话过期后需重新登录）`} />}
    <Form.Item label="自托管同步服务地址" extra="HTTPS；仅本机调试允许 HTTP。切换地址/账号会重置同步游标并关闭自动同步，不删除本地收藏。同步会上传收藏及笔记，请先备份。"><Input value={base} onChange={(e) => setBase(e.target.value)} placeholder="https://sync.example.com/api" /></Form.Item>
    <Form.Item label="同步账号邮箱"><Input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></Form.Item>
    <Form.Item label="同步账号密码（不会保存密码）"><Input.Password value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Form.Item>
    <Space wrap>
      <Button loading={busy} type="primary" onClick={() => void connect(false)}>登录同步服务</Button>
      <Button loading={busy} onClick={() => void connect(true)}>注册同步账号</Button>
      <Button disabled={busy} onClick={() => { void window.api.sync.disconnect().then(async () => { await refresh(); onSessionChange(); }).catch((e) => message.error(cleanIpcError(e))); }}>断开同步（保留收藏）</Button>
    </Space>
  </Form>;
}
