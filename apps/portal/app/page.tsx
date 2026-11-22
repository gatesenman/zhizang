'use client';

import { useEffect, useState } from 'react';
import { createCheckout, fetchProducts, yuan, type Product } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

export default function HomePage() {
  const { t } = useI18n();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<Product | null>(null);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchProducts()
      .then(setProducts)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function buy() {
    if (!picked) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError(t('home.invalidEmail'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const { payUrl } = await createCheckout(picked.id, email);
      window.location.href = payUrl;
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <main className="container">
      <section className="hero">
        <h1>{t('home.heroTitle')}</h1>
        <p>{t('home.heroDesc')}</p>
      </section>

      {loading && <p className="spin" style={{ textAlign: 'center' }}>{t('home.loading')}</p>}
      {error && !picked && <p className="error" style={{ textAlign: 'center' }}>{error}</p>}

      <section className="grid">
        {products.map((p, i) => (
          <div key={p.id} className={`card${i === 1 ? ' featured' : ''}`}>
            {i === 1 && <div className="badge">{t('home.popular')}</div>}
            <h3>{p.name}</h3>
            <div className="price">
              <small>￥</small>
              {yuan(p.priceCents)}
              <small> / {p.plan === 'lifetime' ? t('home.lifetime') : `${p.durationDays} ${t('home.days')}`}</small>
            </div>
            <div className="feat">· {p.description}</div>
            <div className="feat">· {t('home.maxDevices', { n: p.maxDevices })}</div>
            <div className="feat">· {t('home.allAI')}</div>
            <div className="feat">· {t('home.importExport')}</div>
            <button className="btn" onClick={() => { setPicked(p); setError(''); }}>
              {t('home.buyNow')}
            </button>
          </div>
        ))}
      </section>

      {picked && (
        <div className="modal-mask" onClick={() => !submitting && setPicked(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{t('home.modalTitle', { name: picked.name })}</h3>
            <p className="muted">￥{yuan(picked.priceCents)} · {t('home.modalDesc')}</p>
            <input
              className="input"
              type="email"
              placeholder={t('home.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
            {error && <p className="error">{error}</p>}
            <button className="btn" disabled={submitting} onClick={buy}>
              {submitting ? t('home.creating') : t('home.goPay')}
            </button>
            <button className="btn ghost" disabled={submitting} onClick={() => setPicked(null)} style={{ marginTop: 8 }}>
              {t('home.cancel')}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
