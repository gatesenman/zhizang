import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: '智藏 ZhiCang · 免费开源收藏管理',
  description: '本地优先、无需注册码的 AI 收藏管理工具。外部 AI 服务需自备 API Key，第三方可能收费。',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
