import React, { useEffect, useRef, useState } from 'react';
import { Drawer, Input, Button, Empty, Spin, Tag, List } from 'antd';
import { RobotOutlined, SendOutlined, LinkOutlined } from '@ant-design/icons';
import { bookmarkMarkdown } from '../workflow';
import { App as AntApp } from 'antd';
import { cleanIpcError } from '../util';
import { useStore } from '../store';
import { useI18n } from '../i18n';

interface Ref {
  id: number;
  title: string;
  url: string;
}
interface Turn {
  role: 'user' | 'assistant';
  text: string;
  refs?: Ref[];
  mode?: string;
}

export default function AIPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): React.ReactElement {
  const { message } = AntApp.useApp();
  const { t, lang } = useI18n();
  const [configured, setConfigured] = useState(false);
  useEffect(() => { window.api.settings.getLlm().then((cfg) => setConfigured(!!cfg.enabled && !!cfg.apiKey)).catch(() => setConfigured(false)); }, [open]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const reveal = useStore((s) => s.revealBookmark);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, loading]);

  const ask = async (): Promise<void> => {
    const question = q.trim();
    if (!question || loading) return;
    setTurns((prev) => [...prev, { role: 'user', text: question }]);
    setQ('');
    setLoading(true);
    try {
      const r: { answer: string; refs: Ref[]; mode: string } = await window.api.ai.ask(question);
      setTurns((prev) => [...prev, { role: 'assistant', text: r.answer, refs: r.refs, mode: r.mode }]);
    } catch (e: any) {
      setTurns((prev) => [...prev, { role: 'assistant', text: t('ai.error', { msg: String(e?.message ?? e) }) }]);
    } finally {
      setLoading(false);
    }
  };

  const openRef = (r: Ref): void => {
    void reveal(r.id).then(onClose).catch((e) => message.error(cleanIpcError(e))); 
  };

  const samples = [t('ai.sample1'), t('ai.sample2'), t('ai.sample3')];

  return (
    <Drawer
      title={
        <span>
          <RobotOutlined style={{ color: '#7c3aed', marginRight: 8 }} />
          {t('ai.title')}
        </span>
      }
      placement="right"
      width={400}
      open={open}
      onClose={onClose}
      styles={{ body: { display: 'flex', flexDirection: 'column', padding: 0 } }}
    >
      <div className="zc-assistant-notice">{configured ? (lang === 'zh' ? 'AI 问答 · 仅依据命中的收藏回答' : 'AI answers grounded in matching bookmarks') : (lang === 'zh' ? '本地关键词模式 · 未连接大模型，不生成 AI 总结' : 'Local keyword mode · AI is not connected')}</div>
      <div ref={bodyRef} style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {turns.length === 0 && (
          <div style={{ marginTop: 24 }}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t('ai.emptyDesc')}
            />
            <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {samples.map((s) => (
                <Tag
                  key={s}
                  style={{ cursor: 'pointer', padding: '4px 10px', borderRadius: 14 }}
                  color="purple"
                  onClick={() => setQ(s)}
                >
                  {s}
                </Tag>
              ))}
            </div>
          </div>
        )}
        {turns.map((turn, i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: turn.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <div
                style={{
                  maxWidth: '88%',
                  padding: '8px 12px',
                  borderRadius: 12,
                  whiteSpace: 'pre-wrap',
                  fontSize: 13,
                  lineHeight: 1.6,
                  background: turn.role === 'user' ? '#7c3aed' : 'rgba(124,58,237,0.08)',
                  color: turn.role === 'user' ? '#fff' : 'inherit',
                }}
              >
                {turn.text}
                {turn.mode === 'keyword' && (
                  <Tag color="default" style={{ marginLeft: 6 }}>
                    {t('ai.keywordMode')}
                  </Tag>
                )}
              </div>
            </div>
            {turn.refs && turn.refs.length > 0 && (
              <List
                size="small"
                style={{ marginTop: 8 }}
                dataSource={turn.refs}
                renderItem={(r, idx) => (
                  <List.Item
                    style={{ cursor: 'pointer', padding: '6px 8px', borderRadius: 8 }}
                    actions={[<Button key="copy" size="small" onClick={() => { navigator.clipboard.writeText(bookmarkMarkdown(r)).then(() => message.success('引用已复制'), () => message.error('复制失败')); }}>复制引用</Button>]}
                  >
                    <Button type="link" onClick={() => openRef(r)} style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 12 }} title={r.url}>
                      <span style={{ color: '#7c3aed', marginRight: 6 }}>[{idx + 1}]</span>
                      <LinkOutlined style={{ marginRight: 4 }} />
                      {r.title}
                    </Button>
                  </List.Item>
                )}
              />
            )}
          </div>
        ))}
        {loading && (
          <div style={{ textAlign: 'center', padding: 16 }}>
            <Spin /> <span style={{ marginLeft: 8, color: '#999' }}>{t('ai.searching')}</span>
          </div>
        )}
      </div>
      <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', padding: 12, display: 'flex', gap: 8 }}>
        <Input.TextArea
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('ai.inputPlaceholder')}
          autoSize={{ minRows: 1, maxRows: 3 }}
          onPressEnter={(e) => {
            if (!e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              ask();
            }
          }}
        />
        <Button aria-label={lang === 'zh' ? '发送问题' : 'Ask'} type="primary" icon={<SendOutlined />} onClick={ask} disabled={!q.trim()} loading={loading} />
      </div>
    </Drawer>
  );
}
