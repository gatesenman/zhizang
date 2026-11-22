import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Input,
  Space,
  Button,
  Switch,
  Slider,
  Tag,
  Tooltip,
  Progress,
  Typography,
  App as AntApp,
} from 'antd';
import {
  SearchOutlined,
  CloudDownloadOutlined,
  DeleteOutlined,
  AimOutlined,
} from '@ant-design/icons';
import ForceGraph2D from 'react-force-graph-2d';
import type { GraphData, GraphOptions, EmbeddingConfig, SemanticHit } from '@zhicang/shared';
import { useStore } from '../store';
import { ensureModel, embedTexts, embedOne } from '../embedder';
import { useI18n } from '../i18n';

interface Props {
  open: boolean;
  onClose: () => void;
}

const DEFAULT_OPTIONS: GraphOptions = {
  category: true,
  tag: true,
  semantic: true,
  semanticK: 3,
  semanticThreshold: 0.55,
  hubs: true,
};

export default function GraphModal({ open, onClose }: Props): React.ReactElement {
  const { message } = AntApp.useApp();
  const { t } = useI18n();
  const dark = useStore((s) => s.dark);
  const select = useStore((s) => s.select);
  const fgRef = useRef<any>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const [data, setData] = useState<GraphData>({ nodes: [], links: [] });
  const [opts, setOpts] = useState<GraphOptions>(DEFAULT_OPTIONS);
  const [cfg, setCfg] = useState<EmbeddingConfig | null>(null);
  const [status, setStatus] = useState<{ total: number; embedded: number; dim: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [buildPct, setBuildPct] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState<Set<string>>(new Set());
  const [dims, setDims] = useState({ w: 800, h: 560 });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [d, st, c] = await Promise.all([
        window.api.graph.data(opts),
        window.api.graph.status(),
        window.api.graph.getConfig(),
      ]);
      setData(d);
      setStatus(st);
      setCfg(c);
    } finally {
      setLoading(false);
    }
  }, [opts]);

  useEffect(() => {
    if (open) void loadData();
  }, [open, loadData]);

  // 测量容器尺寸
  useEffect(() => {
    if (!open) return;
    const measure = (): void => {
      const el = wrapRef.current;
      if (el) setDims({ w: el.clientWidth, h: el.clientHeight });
    };
    const timer = setTimeout(measure, 60);
    window.addEventListener('resize', measure);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', measure);
    };
  }, [open]);

  // API 构建进度
  useEffect(() => {
    const off = window.api.on('graph:progress', (p: { done: number; total: number }) => {
      setBuildPct(p.total ? Math.round((p.done / p.total) * 100) : null);
    });
    return () => {
      off();
    };
  }, []);

  const doSearch = async (): Promise<void> => {
    const q = query.trim();
    if (!q) {
      setHighlight(new Set());
      return;
    }
    setLoading(true);
    try {
      let hits: SemanticHit[] = [];
      // local 模式且模型已就绪：本地算查询向量后在已存向量内检索
      if (cfg?.mode === 'local' && status && status.embedded > 0) {
        try {
          await ensureModel(cfg.localModel);
          const vec = await embedOne(q);
          hits = await window.api.graph.searchByVector(vec, 30);
        } catch {
          hits = await window.api.graph.search(q, 30);
        }
      } else {
        hits = await window.api.graph.search(q, 30);
      }
      const ids = new Set(hits.filter((h) => h.score > 0.05).map((h) => `b:${h.id}`));
      setHighlight(ids);
      if (ids.size && fgRef.current) {
        setTimeout(() => fgRef.current?.zoomToFit(600, 80, (n: any) => ids.has(n.id)), 100);
      }
      if (!ids.size) message.info(t('graph.noResults'));
    } finally {
      setLoading(false);
    }
  };

  // 构建/重建向量
  const rebuild = async (): Promise<void> => {
    if (!cfg) return;
    setBuilding(true);
    setBuildPct(0);
    try {
      if (cfg.mode === 'api') {
        await window.api.graph.buildApi();
        message.success(t('graph.apiBuilt'));
      } else if (cfg.mode === 'local') {
        const docs = await window.api.graph.docsForEmbedding();
        if (!docs.length) {
          message.info(t('graph.noBookmarksForVec'));
          return;
        }
        message.info(t('graph.loadingLocalModel'));
        await ensureModel(cfg.localModel, (p) => {
          if (p.ratio != null) setBuildPct(Math.round(p.ratio));
        });
        setBuildPct(0);
        const vecs = await embedTexts(
          docs.map((d) => d.text),
          (done, total) => setBuildPct(Math.round((done / total) * 100)),
        );
        await window.api.graph.storeVectors(
          docs.map((d, i) => ({ id: d.id, vec: vecs[i] })),
          `local:${cfg.localModel}`,
        );
        message.success(t('graph.localBuilt'));
      } else {
        message.success(t('graph.tfidfInstant'));
      }
      await loadData();
    } catch (e: any) {
      message.error(t('graph.buildVecFailed', { msg: String(e?.message ?? e) }));
    } finally {
      setBuilding(false);
      setBuildPct(null);
    }
  };

  const onNodeClick = (node: any): void => {
    if (node?.kind === 'bookmark' && node.refId != null) {
      void select(node.refId);
      onClose();
    }
  };

  const bg = dark ? '#0f1115' : '#fafafa';
  const labelColor = dark ? 'rgba(230,230,230,0.9)' : 'rgba(20,20,20,0.85)';
  const hasHighlight = highlight.size > 0;

  const paintNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, scale: number) => {
      const r = Math.max(2, (node.val ?? 1) + (node.kind === 'bookmark' ? 1.5 : 3));
      const dim = hasHighlight && !highlight.has(node.id);
      ctx.globalAlpha = dim ? 0.12 : 1;
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = node.color || '#94a3b8';
      ctx.fill();
      if (node.favorite) {
        ctx.lineWidth = 1.2 / scale;
        ctx.strokeStyle = '#faad14';
        ctx.stroke();
      }
      // 标签：放大后或枢纽/高亮节点才画，避免拥挤
      const showLabel = scale > 1.6 || node.kind !== 'bookmark' || highlight.has(node.id);
      if (showLabel && node.label) {
        const fontSize = Math.min(5, 11 / scale);
        ctx.font = `${fontSize}px -apple-system, "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = labelColor;
        const text = node.label.length > 18 ? node.label.slice(0, 18) + '…' : node.label;
        ctx.fillText(text, node.x, node.y + r + 1);
      }
      ctx.globalAlpha = 1;
    },
    [hasHighlight, highlight, labelColor],
  );

  const linkColor = useCallback(
    (link: any) => {
      if (link.kind === 'semantic') return dark ? 'rgba(99,102,241,0.35)' : 'rgba(99,102,241,0.4)';
      if (link.kind === 'tag') return dark ? 'rgba(245,158,11,0.25)' : 'rgba(245,158,11,0.35)';
      return dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)';
    },
    [dark],
  );

  const modeLabel = cfg
    ? { lexical: t('graph.modeLexical'), local: t('graph.modeLocal'), api: t('graph.modeApi') }[cfg.mode]
    : '';

  const stats = useMemo(() => {
    const bm = data.nodes.filter((n) => n.kind === 'bookmark').length;
    return { bm, edges: data.links.length };
  }, [data]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width="92vw"
      style={{ top: 24, maxWidth: 1400 }}
      styles={{ body: { padding: 0 } }}
      title={
        <Space wrap size={8}>
          <span>{t('graph.title')}</span>
          <Tag color="blue">{t('graph.nBookmarks', { n: stats.bm })}</Tag>
          <Tag>{t('graph.nRelations', { n: stats.edges })}</Tag>
          <Tag color={cfg?.mode === 'lexical' ? 'default' : 'green'}>{modeLabel}</Tag>
          {status && cfg?.mode !== 'lexical' && (
            <Tag color={status.embedded >= status.total && status.total > 0 ? 'green' : 'orange'}>
              {t('graph.vectorNM', { embedded: status.embedded, total: status.total })}
            </Tag>
          )}
        </Space>
      }
    >
      <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <Space wrap size={10} style={{ width: '100%' }}>
          <Input
            allowClear
            style={{ width: 320 }}
            prefix={<SearchOutlined />}
            placeholder={t('graph.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onPressEnter={doSearch}
            onClear={() => setHighlight(new Set())}
          />
          <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={doSearch}>
            {t('graph.searchBtn')}
          </Button>
          {hasHighlight && (
            <Tag color="purple">{t('graph.hitN', { n: highlight.size })}</Tag>
          )}
          <span style={{ flex: 1 }} />
          <Tooltip title={t('graph.relayoutTip')}>
            <Button
              icon={<AimOutlined />}
              onClick={() => fgRef.current?.zoomToFit(600, 60)}
            />
          </Tooltip>
          <Tooltip
            title={
              cfg?.mode === 'lexical'
                ? t('graph.buildTipLexical')
                : t('graph.buildTipOther')
            }
          >
            <Button icon={<CloudDownloadOutlined />} loading={building} onClick={rebuild}>
              {cfg?.mode === 'local' ? t('graph.buildLocal') : cfg?.mode === 'api' ? t('graph.buildApi') : t('graph.rebuild')}
            </Button>
          </Tooltip>
          {cfg?.mode !== 'lexical' && status && status.embedded > 0 && (
            <Tooltip title={t('graph.clearVecTip')}>
              <Button
                icon={<DeleteOutlined />}
                onClick={async () => {
                  await window.api.graph.clearVectors();
                  await loadData();
                }}
              />
            </Tooltip>
          )}
        </Space>
        {buildPct != null && (
          <Progress percent={buildPct} size="small" style={{ marginTop: 8 }} status="active" />
        )}
        <Space wrap size={16} style={{ marginTop: 10 }}>
          <Space size={6}>
            <Switch
              size="small"
              checked={opts.semantic}
              onChange={(v) => setOpts({ ...opts, semantic: v })}
            />
            <Typography.Text type="secondary">{t('graph.semanticEdges')}</Typography.Text>
          </Space>
          <Space size={6}>
            <Switch size="small" checked={opts.category} onChange={(v) => setOpts({ ...opts, category: v })} />
            <Typography.Text type="secondary">{t('graph.category')}</Typography.Text>
          </Space>
          <Space size={6}>
            <Switch size="small" checked={opts.tag} onChange={(v) => setOpts({ ...opts, tag: v })} />
            <Typography.Text type="secondary">{t('graph.tag')}</Typography.Text>
          </Space>
          <Space size={6}>
            <Switch size="small" checked={opts.hubs} onChange={(v) => setOpts({ ...opts, hubs: v })} />
            <Typography.Text type="secondary">{t('graph.hubs')}</Typography.Text>
          </Space>
          <Space size={6} style={{ minWidth: 200 }}>
            <Typography.Text type="secondary">{t('graph.semanticK')}</Typography.Text>
            <Slider
              style={{ width: 110 }}
              min={1}
              max={8}
              value={opts.semanticK}
              onChange={(v) => setOpts({ ...opts, semanticK: v as number })}
            />
            <Tag>{opts.semanticK}</Tag>
          </Space>
        </Space>
      </div>

      <div
        ref={wrapRef}
        style={{ height: '70vh', background: bg, position: 'relative', overflow: 'hidden' }}
      >
        {data.nodes.length === 0 ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(0,0,0,0.35)',
            }}
          >
            {loading ? t('graph.loadingGraph') : t('graph.emptyGraph')}
          </div>
        ) : (
          <ForceGraph2D
            ref={fgRef}
            width={dims.w}
            height={dims.h}
            graphData={data}
            backgroundColor={bg}
            nodeId="id"
            nodeLabel={(n: any) => `${n.label}`}
            nodeRelSize={4}
            nodeCanvasObject={paintNode}
            nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
              const r = Math.max(3, (node.val ?? 1) + 3);
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
              ctx.fill();
            }}
            linkColor={linkColor}
            linkWidth={(l: any) => (l.kind === 'semantic' ? Math.max(0.5, (l.weight || 0.5) * 1.5) : 0.6)}
            linkDirectionalParticles={0}
            cooldownTicks={120}
            onNodeClick={onNodeClick}
            onEngineStop={() => {
              if (!hasHighlight) fgRef.current?.zoomToFit(400, 40);
            }}
          />
        )}
      </div>
    </Modal>
  );
}
