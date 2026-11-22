import React, { useEffect, useState } from 'react';
import { Modal, Row, Col, Statistic, Card, List, Typography, Empty, Spin } from 'antd';
import type { StatsOverview } from '@zhicang/shared';
import { useStore } from '../store';
import { domainOf } from '../util';
import { useI18n } from '../i18n';

// 简易热力图：最近 ~17 周
function Heatmap({ data }: { data: { date: string; count: number }[] }): React.ReactElement {
  const { t } = useI18n();
  const map = new Map(data.map((d) => [d.date, d.count]));
  const days: { date: string; count: number }[] = [];
  const today = new Date();
  for (let i = 118; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, count: map.get(key) ?? 0 });
  }
  const max = Math.max(1, ...days.map((d) => d.count));
  const color = (c: number): string => {
    if (c === 0) return 'rgba(0,0,0,0.06)';
    const level = Math.ceil((c / max) * 4);
    return ['#d6e4ff', '#85a5ff', '#597ef7', '#2f54eb', '#1d39c4'][Math.min(level, 4) - 1] ?? '#1d39c4';
  };
  return (
    <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 11px)', gridAutoFlow: 'column', gap: 3 }}>
      {days.map((d) => (
        <div
          key={d.date}
          title={t('stats.visitsOnDate', { date: d.date, count: d.count })}
          style={{ width: 11, height: 11, borderRadius: 2, background: color(d.count) }}
        />
      ))}
    </div>
  );
}

export default function StatsModal({ open, onClose }: { open: boolean; onClose: () => void }): React.ReactElement {
  const { t } = useI18n();
  const [data, setData] = useState<StatsOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const select = useStore((s) => s.select);

  useEffect(() => {
    if (open) {
      setLoading(true);
      window.api.stats
        .overview()
        .then((d: StatsOverview) => setData(d))
        .finally(() => setLoading(false));
    }
  }, [open]);

  return (
    <Modal title={t('stats.title')} open={open} onCancel={onClose} footer={null} width={760}>
      {loading || !data ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : (
        <>
          <Row gutter={16}>
            <Col span={6}><Statistic title={t('stats.total')} value={data.total} /></Col>
            <Col span={6}><Statistic title={t('stats.activeDead')} value={`${data.active} / ${data.dead}`} /></Col>
            <Col span={6}><Statistic title={t('stats.unread')} value={data.unread} /></Col>
            <Col span={6}><Statistic title={t('stats.favorite')} value={data.favorite} /></Col>
          </Row>
          <Card size="small" title={t('stats.heatmapTitle')} style={{ marginTop: 16 }}>
            {data.heatmap.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('stats.noVisits')} /> : <Heatmap data={data.heatmap} />}
          </Card>
          <Row gutter={16} style={{ marginTop: 16 }}>
            <Col span={12}>
              <Card size="small" title={t('stats.topDomains')}>
                {data.topDomains.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('stats.noData')} />
                ) : (
                  <List
                    size="small"
                    dataSource={data.topDomains}
                    renderItem={(d) => (
                      <List.Item>
                        <Typography.Text className="zc-truncate" style={{ maxWidth: 220 }}>
                          {d.domain}
                        </Typography.Text>
                        <Typography.Text type="secondary">{d.count}</Typography.Text>
                      </List.Item>
                    )}
                  />
                )}
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small" title={t('stats.topVisited')}>
                {data.topVisited.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('stats.noData')} />
                ) : (
                  <List
                    size="small"
                    dataSource={data.topVisited}
                    renderItem={(b) => (
                      <List.Item
                        style={{ cursor: 'pointer' }}
                        onClick={() => {
                          void select(b.id);
                          onClose();
                        }}
                      >
                        <Typography.Text className="zc-truncate" style={{ maxWidth: 200 }}>
                          {b.title || domainOf(b.url)}
                        </Typography.Text>
                        <Typography.Text type="secondary">{t('stats.visitsN', { n: b.visitCount })}</Typography.Text>
                      </List.Item>
                    )}
                  />
                )}
              </Card>
            </Col>
          </Row>
        </>
      )}
    </Modal>
  );
}
