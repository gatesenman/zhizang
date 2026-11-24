import React, { useState } from 'react';
import { Modal, Card, Button, Space, Typography, App as AntApp, Steps, Alert, Checkbox } from 'antd';
import {
  ImportOutlined,
  CodeOutlined,
  ProjectOutlined,
  BgColorsOutlined,
  ExperimentOutlined,
  SolutionOutlined,
  AppstoreOutlined,
  FolderOutlined,
} from '@ant-design/icons';
import { CATEGORY_ROLE_PRESETS } from '@zhicang/shared/types';
import { useStore } from '../store';
import { useI18n } from '../i18n';

const { Text } = Typography;

const ROLE_ICONS: Record<string, React.ReactNode> = {
  code: <CodeOutlined />,
  product: <ProjectOutlined />,
  design: <BgColorsOutlined />,
  experiment: <ExperimentOutlined />,
  solution: <SolutionOutlined />,
  appstore: <AppstoreOutlined />,
};

export default function OnboardingModal({
  open,
  onClose,
  onConfigure,
}: {
  open: boolean;
  onClose: () => void;
  onConfigure?: () => void;
}): React.ReactElement {
  const { message } = AntApp.useApp();
  const { t } = useI18n();
  const loadCategories = useStore((s) => s.loadCategories);
  const [step, setStep] = useState(0);
  const [configure, setConfigure] = useState(true);
  const [busy, setBusy] = useState(false);

  const finish = async (): Promise<void> => {
    await window.api.settings.set('onboarded', '1');
    await loadCategories();
    onClose();
    if (configure) onConfigure?.();
  };

  const pickRole = async (roleId: string, label: string): Promise<void> => {
    setBusy(true);
    try {
      const r: { created: number } = await window.api.categories.seedPreset(roleId);
      message.success(t('onboarding.genFor', { label, n: r?.created ?? 0 }));
      await loadCategories(); setStep(1);
    } finally {
      setBusy(false);
    }
  };

  const importYaml = async (): Promise<void> => {
    setBusy(true);
    try {
      const r: { created: number } | null = await window.api.io.importYaml();
      if (r) {
        message.success(t('onboarding.yamlImported', { n: r.created }));
        await loadCategories(); setStep(1);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="首次运行 · 设置你的智藏"
      width={760}
      maskClosable={false}
      closable={false}
      footer={<Space>{step > 0 && <Button disabled={busy} onClick={() => setStep(step - 1)}>上一步</Button>}{step === 0 && <Button icon={<ImportOutlined />} loading={busy} onClick={importYaml}>{t('onboarding.importYamlTree')}</Button>}<Button type="primary" disabled={busy} onClick={() => step < 2 ? setStep(step + 1) : void finish()}>{step === 2 ? '完成并开始使用' : step === 0 ? '暂不选择，下一步' : '下一步'}</Button></Space>}
    >
      <Steps size="small" current={step} items={[{ title: '分类目录' }, { title: '可选服务' }, { title: '开始使用' }]} style={{ marginBottom: 20 }} />
      {step === 0 && <><Alert type="info" showIcon message="本地模式免费开源，不要求购买或填写 API Key" description="收藏、搜索、标签、离线阅读、完整备份都在本机运行；云同步仍需有效商业许可证。" style={{ marginBottom: 12 }} />
      <Text type="secondary">
        {t('onboarding.desc')}
      </Text>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          marginTop: 16,
        }}
      >
        {CATEGORY_ROLE_PRESETS.map((p) => (
          <Card
            key={p.id}
            hoverable
            size="small"
            onClick={() => !busy && void pickRole(p.id, p.label)}
            style={{ cursor: busy ? 'not-allowed' : 'pointer' }}
            styles={{ body: { padding: 14 } }}
          >
            <div style={{ fontSize: 26, lineHeight: 1, color: '#6366f1' }}>
              {ROLE_ICONS[p.icon] ?? <FolderOutlined />}
            </div>
            <div style={{ fontWeight: 600, marginTop: 8 }}>{p.label}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {p.desc}
            </Text>
          </Card>
        ))}
      </div></>}
      {step === 1 && <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Alert type="info" message="AI（可选）" description="设置 → AI：选择 OpenAI 兼容服务，填写自己的 Base URL、模型和 Key，点击真实连接测试，再保存。无 Key 时明确使用本地关键词检索。" />
        <Alert type="info" message="浏览器插件 / MCP（可选）" description="设置 → 网络：开启本机桥接，复制端口与访问令牌填入扩展或 MCP 配置。令牌重置后立即失效，插件需同步更新。" />
        <Alert type="info" message="授权与云同步（可选）" description="设置 → 授权/云服务：填写发行方服务地址并测试，再激活邮箱/激活码。自动同步失败会保留错误，不会当作成功。" />
        <Alert type="warning" message="无需配置更新源也可正常使用" description="默认关闭更新。只有发行方提供有效 HTTPS 更新目录时才开启，不会静默连接原仓库。" />
      </Space>}
      {step === 2 && <Space direction="vertical" size={16} style={{ width: '100%' }}><Alert type="success" message="开始建立你的本地知识库" description="Ctrl+N 新增、Ctrl+K 命令面板；支持浏览器书签/CSV/JSON 导入。设置 → 通用可创建完整备份（含设置/可能的凭据）并恢复；JSON 只是收藏交换文件。" /><Typography.Paragraph>本地数据会保留到下次启动，关闭窗口不会删除收藏。所有可选服务都可稍后在设置中配置；本向导完成后不再自动弹出。</Typography.Paragraph><Checkbox checked={configure} onChange={(e) => setConfigure(e.target.checked)}>完成后打开设置，检查数据目录与可选配置</Checkbox></Space>}
    </Modal>
  );
}
