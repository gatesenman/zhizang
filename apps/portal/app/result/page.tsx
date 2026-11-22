'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { fetchOrder, yuan, type OrderPublic } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

function CheckIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" fill="currentColor" aria-hidden="true" style={{ verticalAlign: '-0.18em' }}>
      <path d="M512 64a448 448 0 1 0 0 896 448 448 0 0 0 0-896z m214 358L478 670a32 32 0 0 1-45 0L298 535a32 32 0 1 1 45-46l112 113 226-226a32 32 0 0 1 45 46z" />
    </svg>
  );
}

function Result() {
  const { t } = useI18n();
  const params = useSearchParams();
  const orderId = params.get('orderId') || '';
  const canceled = params.get('canceled') === '1';
  const [order, setOrder] = useState<OrderPublic | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const o = await fetchOrder(orderId);
        setOrder(o);
        if (o.status !== 'paid' && tries < 20) {
          tries += 1;
          timer = setTimeout(poll, 1500);
        }
      } catch (e) {
        setError((e as Error).message);
      }
    };
    poll();
    return () => clearTimeout(timer);
  }, [orderId]);

  function copy(code: string) {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (!orderId) return <div className="result-box"><h2>{t('result.errorTitle')}</h2><p className="error">{t('result.missingOrder')}</p><a className="btn" href="/">{t('result.backHome')}</a></div>;
  if (error) return <div className="result-box"><h2>{t('result.errorTitle')}</h2><p className="error">{error}</p><a className="btn" href="/">{t('result.backHome')}</a></div>;
  if (!order) return <div className="result-box"><p className="spin">{t('result.querying')}</p></div>;

  if (canceled && order.status !== 'paid') {
    return (
      <div className="result-box">
        <h2>{t('result.canceledTitle')}</h2>
        <p className="muted">{t('result.orderLabel')} {order.id}</p>
        <a className="btn" href="/">{t('result.reselect')}</a>
      </div>
    );
  }

  if (order.status === 'paid' && order.code) {
    return (
      <div className="result-box">
        <h2 style={{ color: '#16a34a' }}><CheckIcon size={24} /> {t('result.paidTitle')}</h2>
        <p className="muted">{t('result.codeHint')}</p>
        <div className="code-pill">{order.code}</div>
        <div>
          <button className="btn" onClick={() => copy(order.code as string)}>
            {copied ? t('result.copied') : t('result.copy')}
          </button>
        </div>
        <p className="muted" style={{ marginTop: 18 }}>
          {t('result.activateHint')}
        </p>
      </div>
    );
  }

  return (
    <div className="result-box">
      <h2>{t('result.waitingTitle')}</h2>
      <p className="muted">{t('result.orderLabel')} {order.id} · ￥{yuan(order.amountCents)}</p>
      <p className="spin">{t('result.waitingHint')}</p>
    </div>
  );
}

export default function ResultPage() {
  return (
    <main className="container">
      <Suspense fallback={<div className="result-box"><p className="spin">…</p></div>}>
        <Result />
      </Suspense>
    </main>
  );
}
