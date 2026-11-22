import type { Metadata } from 'next';
import './globals.css';
import SiteChrome from './SiteChrome';

export const metadata: Metadata = {
  title: '智藏 ZhiCang · AI 收藏夹管理',
  description: 'AI 驱动的跨端收藏夹管理桌面程序 — 在线购买激活码 / AI-powered cross-platform bookmark manager',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
