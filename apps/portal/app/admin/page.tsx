'use client';

import { useCallback, useEffect, useState } from 'react';
import { yuan } from '@/lib/api';
import {
  adminApi,
  login,
  type AdminCode,
  type AdminOrder,
  type AdminTag,
} from '@/lib/admin';

const TOKEN_KEY = 'zc_admin_token';
const TABS = ['激活码', '订单', '产品', '标签', '设置'] as const;
type Tab = (typeof TABS)[number];

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('激活码');

  useEffect(() => {
    setToken(localStorage.getItem(TOKEN_KEY));
  }, []);

  function onLogin(t: string) {
    localStorage.setItem(TOKEN_KEY, t);
    setToken(t);
  }
  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }

  if (!token) return <LoginForm onLogin={onLogin} />;

  return (
    <main className="container" style={{ paddingBottom: 60 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 20 }}>
        <h1 style={{ fontSize: 24 }}>后台管理</h1>
        <button className="btn ghost" style={{ width: 'auto' }} onClick={logout}>退出登录</button>
      </div>
      <div className="adminbar">
        {TABS.map((t) => (
          <button key={t} className={`tabbtn${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === '激活码' && <CodesTab token={token} />}
      {tab === '订单' && <OrdersTab token={token} />}
      {tab === '产品' && <ProductsTab token={token} />}
      {tab === '标签' && <TagsTab token={token} />}
      {tab === '设置' && <SettingsTab token={token} />}
    </main>
  );
}

function LoginForm({ onLogin }: { onLogin: (t: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError('');
    try {
      const r = await login(email, password);
      if (r.user.role !== 'admin') throw new Error('该账号不是管理员');
      onLogin(r.token);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container">
      <div className="result-box" style={{ maxWidth: 380 }}>
        <h2>管理员登录</h2>
        <input className="input" placeholder="邮箱" value={email} onChange={(e) => setEmail(e.target.value)} style={{ marginBottom: 10 }} />
        <input className="input" type="password" placeholder="密码" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="error">{error}</p>}
        <button className="btn" disabled={busy} onClick={submit}>{busy ? '登录中…' : '登录'}</button>
        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>首位注册用户自动成为管理员</p>
      </div>
    </main>
  );
}

function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; error: string; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const reload = useCallback(() => {
    fn().then(setData).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => reload(), [reload]);
  return { data, error, reload };
}

function CodesTab({ token }: { token: string }) {
  const { data, error, reload } = useAsync<AdminCode[]>(() => adminApi.listCodes(token), [token]);
  const [count, setCount] = useState(1);
  const [plan, setPlan] = useState('pro');
  const [days, setDays] = useState(365);
  const [maxDev, setMaxDev] = useState(1);
  const [busy, setBusy] = useState(false);

  async function gen() {
    setBusy(true);
    try {
      await adminApi.generateCodes(token, { plan, durationDays: days, maxDevices: maxDev, count });
      reload();
    } finally {
      setBusy(false);
    }
  }
  function exportCsv() {
    if (!data) return;
    const csv = ['code,plan,durationDays,maxDevices,status,email', ...data.map((c) => `${c.code},${c.plan},${c.durationDays},${c.maxDevices},${c.status},${c.email || ''}`)].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'activation-codes.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <label>方案 <select className="input" style={{ width: 110 }} value={plan} onChange={(e) => setPlan(e.target.value)}><option value="pro">pro</option><option value="lifetime">lifetime</option></select></label>
          <label>有效天数 <input className="input" style={{ width: 90 }} type="number" value={days} onChange={(e) => setDays(+e.target.value)} /></label>
          <label>设备数 <input className="input" style={{ width: 70 }} type="number" value={maxDev} onChange={(e) => setMaxDev(+e.target.value)} /></label>
          <label>数量 <input className="input" style={{ width: 70 }} type="number" value={count} onChange={(e) => setCount(+e.target.value)} /></label>
          <button className="btn" style={{ width: 'auto' }} disabled={busy} onClick={gen}>批量生成</button>
          <button className="btn ghost" style={{ width: 'auto' }} onClick={exportCsv}>导出 CSV</button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="card">
        <table>
          <thead><tr><th>激活码</th><th>方案</th><th>天数</th><th>设备</th><th>状态</th><th>邮箱</th><th></th></tr></thead>
          <tbody>
            {(data || []).map((c) => (
              <tr key={c.id}>
                <td style={{ fontFamily: 'monospace' }}>{c.code}</td>
                <td>{c.plan}</td>
                <td>{c.durationDays}</td>
                <td>{c.devices}/{c.maxDevices}</td>
                <td><span className={`tag ${c.status}`}>{c.status}</span></td>
                <td>{c.email || '-'}</td>
                <td>{c.status !== 'revoked' && <button className="btn ghost" style={{ width: 'auto', padding: '4px 10px' }} onClick={() => adminApi.revokeCode(token, c.id).then(reload)}>吊销</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OrdersTab({ token }: { token: string }) {
  const { data, error } = useAsync<AdminOrder[]>(() => adminApi.listOrders(token), [token]);
  return (
    <div className="card">
      {error && <p className="error">{error}</p>}
      <table>
        <thead><tr><th>订单号</th><th>邮箱</th><th>金额</th><th>渠道</th><th>状态</th><th>时间</th></tr></thead>
        <tbody>
          {(data || []).map((o) => (
            <tr key={o.id}>
              <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{o.id.slice(0, 8)}…</td>
              <td>{o.email}</td>
              <td>￥{yuan(o.amountCents)}</td>
              <td>{o.provider}</td>
              <td><span className={`tag ${o.status === 'paid' ? 'paid' : 'pending'}`}>{o.status}</span></td>
              <td>{new Date(o.createdAt).toLocaleString('zh-CN')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductsTab({ token }: { token: string }) {
  const { data, error, reload } = useAsync(() => adminApi.listProducts(token), [token]);
  return (
    <div className="card">
      {error && <p className="error">{error}</p>}
      <table>
        <thead><tr><th>名称</th><th>方案</th><th>价格</th><th>天数</th><th>设备</th><th>上架</th></tr></thead>
        <tbody>
          {(data || []).map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>{p.plan}</td>
              <td>￥{yuan(p.priceCents)}</td>
              <td>{p.durationDays}</td>
              <td>{p.maxDevices}</td>
              <td>
                <button className="btn ghost" style={{ width: 'auto', padding: '4px 10px' }} onClick={() => adminApi.upsertProduct(token, { id: p.id, active: !p.active }).then(reload)}>
                  {p.active ? '已上架' : '已下架'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TagsTab({ token }: { token: string }) {
  const { data, error, reload } = useAsync<AdminTag[]>(() => adminApi.listTags(token), [token]);
  const [name, setName] = useState('');
  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <input className="input" style={{ width: 220 }} placeholder="新增全局标签" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn" style={{ width: 'auto' }} disabled={!name} onClick={() => { adminApi.addTag(token, name).then(() => { setName(''); reload(); }); }}>添加</button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="card">
        <div className="row">
          {(data || []).map((t) => (
            <span key={t.id} className="tag unused" style={{ fontSize: 14, padding: '6px 12px' }}>
              {t.name} <a style={{ cursor: 'pointer', color: '#cf1322' }} onClick={() => adminApi.removeTag(token, t.id).then(reload)}>×</a>
            </span>
          ))}
          {data && data.length === 0 && <span className="muted">暂无标签</span>}
        </div>
      </div>
    </div>
  );
}

const SETTING_FIELDS: { key: string; label: string }[] = [
  { key: 'site.name', label: '站点名称' },
  { key: 'login.allowRegister', label: '开放注册 (true/false)' },
  { key: 'payment.provider', label: '支付渠道 (mock/stripe/alipay/wechat)' },
  { key: 'payment.stripe.secretKey', label: 'Stripe Secret Key' },
  { key: 'payment.alipay.appId', label: '支付宝 AppId' },
  { key: 'payment.wechat.mchId', label: '微信支付 商户号' },
  { key: 'email.provider', label: '邮件渠道 (console/smtp/sendgrid)' },
  { key: 'email.from', label: '发件人地址' },
  { key: 'email.smtp.host', label: 'SMTP Host' },
  { key: 'email.smtp.port', label: 'SMTP Port' },
  { key: 'email.smtp.user', label: 'SMTP 用户名' },
  { key: 'email.smtp.pass', label: 'SMTP 密码' },
  { key: 'email.sendgrid.apiKey', label: 'SendGrid ApiKey' },
];

function SettingsTab({ token }: { token: string }) {
  const { data, error } = useAsync<Record<string, string>>(() => adminApi.getSettings(token), [token]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (data) setForm(data); }, [data]);

  async function save() {
    setBusy(true);
    setSaved(false);
    try {
      const patch: Record<string, string> = {};
      for (const f of SETTING_FIELDS) patch[f.key] = form[f.key] ?? '';
      await adminApi.saveSettings(token, patch);
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      {error && <p className="error">{error}</p>}
      <p className="muted">配置化后台：填写支付/邮件/登录凭证后即时生效（敏感字段保存后留空展示）。</p>
      {SETTING_FIELDS.map((f) => (
        <div key={f.key} style={{ marginBottom: 12 }}>
          <label className="muted" style={{ fontSize: 13 }}>{f.label}</label>
          <input className="input" value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
        </div>
      ))}
      <button className="btn" disabled={busy} onClick={save}>{busy ? '保存中…' : '保存设置'}</button>
      {saved && <p style={{ color: '#08979c', marginTop: 8 }}>已保存</p>}
    </div>
  );
}
