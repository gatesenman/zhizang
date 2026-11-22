'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type Lang = 'zh' | 'en';

// 门户面向购买者的界面文案（中/英）。后台管理为运营者内部工具，保持中文。
const STRINGS: Record<Lang, Record<string, unknown>> = {
  zh: {
    nav: { pricing: '价格', admin: '后台管理', privacy: '隐私政策', eula: '用户协议', refund: '退款政策' },
    footer: { rights: 'AI 驱动的收藏夹管理', legal: '法律条款' },
    home: {
      heroTitle: 'AI 驱动的收藏夹，值得付费',
      heroDesc:
        '自动抓取网站信息、智能分类与标签、AI 描述、左目录右网页实时预览。跨 Windows / macOS / Linux，在线购买激活码，立即解锁全部能力。',
      loading: '正在加载方案…',
      popular: '最受欢迎',
      lifetime: '买断',
      days: '天',
      maxDevices: '最多 {n} 台设备',
      allAI: '全部 AI 富化能力',
      importExport: '导入导出 / 全文搜索',
      buyNow: '立即购买',
      modalTitle: '购买「{name}」',
      modalDesc: '激活码将发送至下方邮箱',
      emailPlaceholder: 'your@email.com',
      creating: '正在创建订单…',
      goPay: '前往支付',
      cancel: '取消',
      invalidEmail: '请输入有效邮箱（激活码将发送到此邮箱并绑定）',
    },
    result: {
      errorTitle: '出错了',
      backHome: '返回首页',
      missingOrder: '缺少订单号',
      querying: '正在查询订单…',
      loading: '加载中…',
      canceledTitle: '支付已取消',
      orderLabel: '订单',
      reselect: '重新选择方案',
      paidTitle: '支付成功',
      codeHint: '你的激活码（已发送至邮箱）：',
      copy: '复制激活码',
      copied: '已复制',
      activateHint: '打开桌面客户端 →「激活」→ 输入购买邮箱与此激活码即可解锁。',
      waitingTitle: '等待支付确认…',
      waitingHint: '支付完成后此页会自动显示激活码。',
    },
    legal: { updated: '最后更新', backHome: '返回首页' },
  },
  en: {
    nav: { pricing: 'Pricing', admin: 'Admin', privacy: 'Privacy', eula: 'Terms', refund: 'Refunds' },
    footer: { rights: 'AI-powered bookmark manager', legal: 'Legal' },
    home: {
      heroTitle: 'An AI-powered bookmark manager worth paying for',
      heroDesc:
        'Auto-fetch site metadata, smart categories & tags, AI descriptions, live preview with folders on the left and the page on the right. Cross-platform on Windows / macOS / Linux — buy an activation code online and unlock everything instantly.',
      loading: 'Loading plans…',
      popular: 'Most popular',
      lifetime: 'lifetime',
      days: 'days',
      maxDevices: 'Up to {n} devices',
      allAI: 'All AI enrichment features',
      importExport: 'Import / export · full-text search',
      buyNow: 'Buy now',
      modalTitle: 'Buy “{name}”',
      modalDesc: 'The activation code will be sent to the email below',
      emailPlaceholder: 'your@email.com',
      creating: 'Creating order…',
      goPay: 'Proceed to payment',
      cancel: 'Cancel',
      invalidEmail: 'Please enter a valid email (the code is sent to and bound to this address)',
    },
    result: {
      errorTitle: 'Something went wrong',
      backHome: 'Back to home',
      missingOrder: 'Missing order id',
      querying: 'Looking up your order…',
      loading: 'Loading…',
      canceledTitle: 'Payment canceled',
      orderLabel: 'Order',
      reselect: 'Choose another plan',
      paidTitle: 'Payment successful',
      codeHint: 'Your activation code (also sent to your email):',
      copy: 'Copy code',
      copied: 'Copied',
      activateHint: 'Open the desktop app → “Activate” → enter your purchase email and this code to unlock.',
      waitingTitle: 'Waiting for payment confirmation…',
      waitingHint: 'This page will show your activation code automatically once payment completes.',
    },
    legal: { updated: 'Last updated', backHome: 'Back to home' },
  },
};

type I18nCtx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nCtx | null>(null);

function lookup(lang: Lang, key: string): string {
  const val = key.split('.').reduce<unknown>(
    (acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined),
    STRINGS[lang],
  );
  return typeof val === 'string' ? val : key;
}

export function I18nProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [lang, setLangState] = useState<Lang>('zh');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('lang');
      if (saved === 'zh' || saved === 'en') {
        setLangState(saved);
        return;
      }
    } catch {
      /* ignore */
    }
    if (typeof navigator !== 'undefined' && navigator.language && !navigator.language.toLowerCase().startsWith('zh')) {
      setLangState('en');
    }
  }, []);

  useEffect(() => {
    try {
      document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    } catch {
      /* ignore */
    }
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem('lang', l);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      let s = lookup(lang, key);
      if (vars) {
        for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
      return s;
    },
    [lang],
  );

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nCtx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

export function LangSwitch(): React.ReactElement {
  const { lang, setLang } = useI18n();
  return (
    <button className="langswitch" type="button" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
      {lang === 'zh' ? 'EN' : '中文'}
    </button>
  );
}
