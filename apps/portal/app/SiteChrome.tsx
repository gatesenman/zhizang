'use client';

import React from 'react';
import { I18nProvider, LangSwitch, useI18n } from '@/lib/i18n';

function Nav(): React.ReactElement {
  const { t } = useI18n();
  return (
    <div className="container">
      <nav className="nav">
        <a className="brand" href="/">
          智藏 <span>ZhiCang</span>
        </a>
        <div className="row">
          <a href="/">{t('nav.pricing')}</a>
          <a href="/admin">{t('nav.admin')}</a>
          <LangSwitch />
        </div>
      </nav>
    </div>
  );
}

function Footer(): React.ReactElement {
  const { t } = useI18n();
  return (
    <div className="footer">
      <div className="row" style={{ justifyContent: 'center', marginBottom: 8 }}>
        <a href="/legal/privacy">{t('nav.privacy')}</a>
        <a href="/legal/eula">{t('nav.eula')}</a>
        <a href="/legal/refund">{t('nav.refund')}</a>
      </div>
      © {new Date().getFullYear()} 智藏 ZhiCang · {t('footer.rights')}
    </div>
  );
}

export default function SiteChrome({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <I18nProvider>
      <Nav />
      {children}
      <Footer />
    </I18nProvider>
  );
}
