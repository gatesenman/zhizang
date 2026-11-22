'use client';

import React from 'react';
import { useI18n } from '@/lib/i18n';
import type { LegalDocMap } from './content';

export default function LegalDoc({ doc }: { doc: LegalDocMap }): React.ReactElement {
  const { lang, t } = useI18n();
  const content = doc[lang];
  return (
    <main className="container">
      <article className="legal">
        <h1>{content.title}</h1>
        <p className="updated">
          {t('legal.updated')}: {content.updated}
        </p>
        {content.sections.map((s, i) => (
          <section key={i}>
            {s.h && <h2>{s.h}</h2>}
            {s.p?.map((para, j) => (
              <p key={j}>{para}</p>
            ))}
            {s.ul && (
              <ul>
                {s.ul.map((li, k) => (
                  <li key={k}>{li}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
        <a className="btn ghost back" href="/" style={{ width: 'auto' }}>
          {t('legal.backHome')}
        </a>
      </article>
    </main>
  );
}
