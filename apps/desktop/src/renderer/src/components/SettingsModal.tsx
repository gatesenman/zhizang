import SyncAccountSettings from './SyncAccountSettings';
import { cleanIpcError } from '../util';
import React, { useEffect, useState } from 'react';
import { Modal, Form, Select, Input, Switch, Slider, InputNumber, Button, Typography, App as AntApp, Tabs, Alert, Space } from 'antd';
import { LLM_PRESETS, EMBEDDING_PRESETS } from '@zhicang/shared/types';
import type { LlmConfig, EmbeddingConfig } from '@zhicang/shared/types';
import { useI18n, translate, getLang, type Lang } from '../i18n';

export default function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }): React.ReactElement {
  const { message } = AntApp.useApp();
  const { t, lang, setLang } = useI18n();
  const [cfg, setCfg] = useState<LlmConfig | null>(null);
  const [bridgePort, setBridgePort] = useState<number>(38121);
  const [bridgeToken, setBridgeToken] = useState<string>('');
  const [emb, setEmb] = useState<EmbeddingConfig | null>(null);
  const [autoSync, setAutoSync] = useState<{ enabled: boolean; intervalMin: number }>({
    enabled: false,
    intervalMin: 30,
  });
  const [appVersion, setAppVersion] = useState<string>('');
  const [updateText, setUpdateText] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [bridgeEnabled, setBridgeEnabled] = useState(true);
  const [bridgeState, setBridgeState] = useState('');
  const [syncError, setSyncError] = useState('');
  const [dataPath, setDataPath] = useState('');
  const [updateEnabled, setUpdateEnabled] = useState(false);
  const [updateUrl, setUpdateUrl] = useState('');
  const [available, setAvailable] = useState(false);
  const [checking, setChecking] = useState<boolean>(false);

  useEffect(() => {
    if (open) {
      window.api.settings.getLlm().then(setCfg);
      window.api.bridge.status().then((s) => {
        setBridgeEnabled(s.enabled);
        setBridgeState(s.error || (s.running ? '桥接正在运行' : '桥接未运行'));
        setBridgePort(s.port);
        setBridgeToken(s.token || '');
      });
      window.api.graph.getConfig().then(setEmb);
      window.api.sync.getConfig().then(setAutoSync);
      window.api.app.version().then(setAppVersion);
      window.api.app.dataPath().then(setDataPath);
      window.api.sync.status().then((s) => setSyncError(s.lastError));
      window.api.settings.get('update_enabled').then((v) => setUpdateEnabled(v === '1'));
      window.api.settings.get('update_url').then((v) => setUpdateUrl(v || ''));
    }
  }, [open]);

  // 订阅主进程推送的更新状态
  useEffect(() => {
    const off = window.api.on('update:status', (s: { state: string; version?: string; percent?: number; message?: string }) => {
      const tr = (key: string, vars?: Record<string, string | number>): string => translate(getLang(), key, vars);
      if (s.state === 'disabled') setUpdateText(s.message || '未配置更新源');
      else if (s.state === 'checking') setUpdateText(tr('settings.checkingUpdate'));
      else if (s.state === 'available') { setAvailable(true); setUpdateText(tr('settings.updateAvailable', { v: s.version ?? '' })); }
      else if (s.state === 'none') setUpdateText(tr('settings.upToDate'));
      else if (s.state === 'progress') setUpdateText(tr('settings.downloading', { p: s.percent ?? 0 }));
      else if (s.state === 'downloaded') setUpdateText(tr('settings.updateReady', { v: s.version ?? '' }));
      else if (s.state === 'error') {
        // 截断过长的错误信息，避免暴露原始 HTTP 响应
        const raw = s.message ?? '';
        const short = raw.length > 80 ? raw.slice(0, 80) + '…' : raw;
        setUpdateText(tr('settings.updateError', { msg: short }));
      }
      if (s.state !== 'checking' && s.state !== 'progress') setChecking(false);
    });
    return () => {
      off();
    };
  }, []);

  const checkUpdate = async (): Promise<void> => {
    setChecking(true); setAvailable(false);
    setUpdateText(t('settings.checkingUpdate'));
    try {
      const s = await window.api.app.checkUpdate();
      if (s.state === 'none') setUpdateText(t('settings.upToDate'));
      else if (s.state === 'disabled' || s.state === 'error') setUpdateText(s.message);
      else if (s.state === 'available') { setAvailable(true); setUpdateText(`发现版本 ${s.version}`); }
    } catch (e) { setUpdateText(cleanIpcError(e)); }
    finally { setChecking(false); }
  };

  const updateEmb = (patch: Partial<EmbeddingConfig>): void => setEmb((c) => (c ? { ...c, ...patch } : c));

  const update = (patch: Partial<LlmConfig>): void => setCfg((c) => (c ? { ...c, ...patch } : c));

  const applyPreset = (provider: string): void => {
    const p = LLM_PRESETS[provider];
    update({ provider, baseUrl: p.baseUrl || cfg?.baseUrl || '', model: p.model || cfg?.model || '' });
  };

  const save = async (): Promise<void> => {
    if (!cfg) return;
    // 启用 AI 时校验自定义 KEY 配置完整性
    if (cfg.enabled) {
      if (!cfg.baseUrl?.trim() || !cfg.apiKey?.trim() || !cfg.model?.trim()) {
        message.error(t('settings.aiIncomplete'));
        return;
      }
      try {
        // eslint-disable-next-line no-new
        new URL(cfg.baseUrl);
      } catch {
        message.error(t('settings.baseUrlInvalid'));
        return;
      }
    }
    setSaving(true);
    try {
      if (updateEnabled) {
        const u = new URL(updateUrl);
        if (u.username || u.password || u.search || u.hash || (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)))) throw new Error('更新源必须为发行方提供的 HTTPS 地址');
      }
      await window.api.settings.setLlm(cfg);
      const bridge = await window.api.bridge.configure({ enabled: bridgeEnabled, port: bridgePort });
      setBridgeState(bridge.running ? '桥接正在运行' : '桥接已关闭');
      if (emb) await window.api.graph.setConfig(emb);
      await window.api.sync.setConfig(autoSync);
      await window.api.settings.set('update_url', updateUrl.trim());
      await window.api.settings.set('update_enabled', updateEnabled ? '1' : '0');
      message.success(t('settings.saved')); onClose();
    } catch (e) { message.error(cleanIpcError(e)); }
    finally { setSaving(false); }
  };

  const test = async (): Promise<void> => {
    if (!cfg) return;
    setTesting(true); message.loading({ content: t('settings.testing'), key: 'test' });
    try {
      const r = await window.api.settings.testLlm(cfg);
      message.success({ content: `真实模型请求成功（${r.elapsedMs} ms）`, key: 'test' });
    } catch (e) { message.error({ content: cleanIpcError(e), key: 'test' }); }
    finally { setTesting(false); }
  };

  // --- Tab: 通用 ---
  const tabGeneral = (
    <Form layout="vertical">
      <Form.Item label={t('settings.language')}>
        <Select
          value={lang}
          onChange={(v) => setLang(v as Lang)}
          options={[
            { label: '简体中文', value: 'zh' },
            { label: 'English', value: 'en' },
          ]}
          style={{ width: 200 }}
        />
      </Form.Item>
      <Alert type="info" showIcon message="本地收藏不依赖 AI、云服务或支付配置" style={{ marginBottom: 16 }} />
      <Form.Item label="数据目录"><Typography.Text copyable style={{ wordBreak: 'break-all' }}>{dataPath}</Typography.Text></Form.Item>
      <Form.Item label="完整备份 / 恢复"><Space wrap><Button onClick={async () => { try { const r = await window.api.io.backup(); if (r) message.success('完整备份已保存：' + r.path); } catch (e) { message.error(cleanIpcError(e)); } }}>创建完整备份</Button><Button danger onClick={async () => { try { await window.api.io.restore(); } catch (e) { message.error(cleanIpcError(e)); } }}>恢复备份并重启</Button></Space><Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>完整备份含离线正文、目录、设置和可能的 API Key，请只保存到可信位置。JSON 仅用于收藏交换。恢复前自动保留当前库的安全副本。</Typography.Paragraph></Form.Item>
      <Form.Item label="发行方更新服务"><Switch checked={updateEnabled} onChange={setUpdateEnabled} /><Input style={{ marginTop: 8 }} disabled={!updateEnabled} value={updateUrl} onChange={(e) => setUpdateUrl(e.target.value)} placeholder="发行方提供的 HTTPS 更新目录，默认不启用" /><Typography.Text type="secondary">修改后先点保存，再重新打开设置检查；无更新源时明确停用，不连接原仓库。</Typography.Text></Form.Item>
      <Form.Item label={t('settings.aboutDivider')}>
        <Typography.Text>{appVersion ? `v${appVersion}` : '—'}</Typography.Text>
        <Button style={{ marginLeft: 12 }} loading={checking} onClick={checkUpdate}>
          {t('settings.checkUpdate')}
        </Button>
        {available && <Button style={{ marginLeft: 8 }} onClick={async () => { try { await window.api.app.downloadUpdate(); } catch (e) { message.error(cleanIpcError(e)); } }}>下载更新</Button>}
        {updateText && (
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0, wordBreak: 'break-all' }}>
            {updateText}
          </Typography.Paragraph>
        )}
      </Form.Item>
    </Form>
  );

  // --- Tab: AI 配置 ---
  const tabAi = cfg ? (
    <Form layout="vertical">
      <Form.Item label={t('settings.enableAi')}>
        <Switch checked={cfg.enabled} onChange={(v) => update({ enabled: v })} />
      </Form.Item>
      <Form.Item label={t('settings.provider')}>
        <Select
          value={cfg.provider}
          onChange={applyPreset}
          options={Object.entries(LLM_PRESETS).map(([k, v]) => ({ label: v.label, value: k }))}
        />
      </Form.Item>
      <Form.Item label={t('settings.baseUrl')}>
        <Input value={cfg.baseUrl} onChange={(e) => update({ baseUrl: e.target.value })} placeholder="https://api.openai.com/v1" />
      </Form.Item>
      <Form.Item label="API Key">
        <Input.Password value={cfg.apiKey} onChange={(e) => update({ apiKey: e.target.value })} placeholder="sk-..." />
      </Form.Item>
      <Form.Item label={t('settings.modelName')}>
        <Input value={cfg.model} onChange={(e) => update({ model: e.target.value })} placeholder="gpt-4o-mini" />
      </Form.Item>
      <Form.Item label={t('settings.temperature', { t: cfg.temperature })}>
        <Slider min={0} max={1} step={0.1} value={cfg.temperature} onChange={(v) => update({ temperature: v })} />
      </Form.Item>
      <Form.Item label={t('settings.concurrency')}>
        <InputNumber min={1} max={10} value={cfg.concurrency} onChange={(v) => update({ concurrency: v ?? 3 })} />
      </Form.Item>
      <Button loading={testing} onClick={test} type="primary">{t('settings.testConn')}</Button>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
        {t('settings.aiHint')}
      </Typography.Paragraph>
    </Form>
  ) : null;

  // --- Tab: 知识图谱 ---
  const tabGraph = emb ? (
    <Form layout="vertical">
      <Form.Item label={t('settings.embedSource')} extra={t('settings.embedSourceExtra')}>
        <Select
          value={emb.mode}
          onChange={(v) => updateEmb({ mode: v })}
          options={[
            { label: t('settings.embedLocal'), value: 'local' },
            { label: t('settings.embedApi'), value: 'api' },
            { label: t('settings.embedLexical'), value: 'lexical' },
          ]}
        />
      </Form.Item>
      {emb.mode === 'local' && (
        <Form.Item label={t('settings.localModel')}>
          <Select
            value={emb.localModel}
            onChange={(v) => updateEmb({ localModel: v })}
            options={EMBEDDING_PRESETS.map((p) => ({
              label: `${p.label}（${p.size}）`,
              value: p.value,
            }))}
          />
        </Form.Item>
      )}
      {emb.mode === 'api' && (
        <Form.Item label={t('settings.apiEmbedModel')}>
          <Input
            value={emb.apiModel}
            onChange={(e) => updateEmb({ apiModel: e.target.value })}
            placeholder="text-embedding-3-small"
          />
        </Form.Item>
      )}
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
        {t('settings.graphHint')}
      </Typography.Paragraph>
    </Form>
  ) : null;

  // --- Tab: 网络服务 ---
  const tabNetwork = (
    <Form layout="vertical">
      <Alert type="info" showIcon message="可选的自托管同步，不影响免费本地功能" description={syncError ? '上次同步错误：' + syncError : '自动同步错误会保留在此处，不会伪装为同步成功。'} style={{ marginBottom: 16 }} />
      <Form.Item label="启用本机插件 / MCP 桥接"><Switch checked={bridgeEnabled} onChange={setBridgeEnabled} /><Typography.Paragraph type="secondary">{bridgeState}。修改端口、开关或重置令牌后即时重启桥接；旧令牌失效，插件需更新配置。</Typography.Paragraph></Form.Item>
      <Form.Item label={t('settings.autoSync')} extra={t('settings.autoSyncExtra')}>
        <Switch checked={autoSync.enabled} onChange={(v) => setAutoSync((s) => ({ ...s, enabled: v }))} />
      </Form.Item>
      {autoSync.enabled && (
        <Form.Item label={t('settings.syncInterval')}>
          <InputNumber
            min={5}
            max={1440}
            value={autoSync.intervalMin}
            onChange={(v) => setAutoSync((s) => ({ ...s, intervalMin: v ?? 30 }))}
            style={{ width: 160 }}
          />
        </Form.Item>
      )}
      <Form.Item label={t('settings.bridgePort')} extra={t('settings.bridgePortExtra')}>
        <InputNumber min={1024} max={65535} value={bridgePort} onChange={(v) => setBridgePort(v ?? 38121)} style={{ width: 160 }} />
        <Typography.Text type="secondary" style={{ marginLeft: 12, fontSize: 12 }}>
          http://127.0.0.1:{bridgePort}
        </Typography.Text>
      </Form.Item>
      <Form.Item label={t('settings.accessToken')} extra={t('settings.accessTokenExtra')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Input.Password
            readOnly
            value={bridgeToken}
            style={{ width: 280 }}
            visibilityToggle
          />
          <Button
            onClick={() => {
              navigator.clipboard.writeText(bridgeToken).then(
                () => message.success(t('settings.tokenCopied')),
                () => message.error(t('settings.copyFailed')),
              );
            }}
          >
            {t('common.copy')}
          </Button>
          <Button
            danger
            onClick={() => {
              window.api.bridge.resetToken().then((tok: string) => {
                setBridgeToken(tok);
                message.success(t('settings.tokenReset'));
              }).catch((e) => message.error(cleanIpcError(e))).finally(() => {
                window.api.bridge.status().then((s) => { setBridgeToken(s.token || ''); setBridgeState(s.error || (s.running ? '桥接正在运行' : '桥接未运行')); }).catch((e) => message.error(cleanIpcError(e)));
              });
            }}
          >
            {t('common.reset')}
          </Button>
        </div>
      </Form.Item>
    </Form>
  );

  const tabItems = [
    { key: 'general', label: t('settings.tabGeneral'), children: tabGeneral },
    { key: 'sync-account', label: '同步账号', children: <SyncAccountSettings /> },
    { key: 'ai', label: t('settings.tabAi'), children: tabAi },
    { key: 'graph', label: t('settings.tabGraph'), children: tabGraph },
    { key: 'network', label: t('settings.tabNetwork'), children: tabNetwork },
  ];

  return (
    <Modal
      title={t('settings.title')}
      open={open}
      onCancel={onClose}
      onOk={save}
      confirmLoading={saving}
      okText={t('common.save')}
      cancelText={t('common.cancel')}
      width={600}
      styles={{ body: { paddingTop: 0 } }}
    >
      {cfg && (
        <Tabs items={tabItems} size="small" style={{ marginTop: -8 }} />
      )}
    </Modal>
  );
}
