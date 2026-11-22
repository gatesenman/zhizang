// 渲染层通用工具
import { getLang, translate, type Lang } from './i18n';

const TAG_COLORS = [
  '#f5222d',
  '#fa541c',
  '#fa8c16',
  '#faad14',
  '#13c2c2',
  '#52c41a',
  '#1677ff',
  '#2f54eb',
  '#722ed1',
  '#eb2f96',
];

// 按标签名稳定 hash 出颜色
export function tagColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function faviconFallback(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}/favicon.ico`;
  } catch {
    return '';
  }
}

// 渲染层逐级回退的 favicon 候选：富化得到的 → 站点 /favicon.ico → 公共 favicon 服务。
// 即使后台富化抓取失败（favicon 为空），仍能显示出图标，规避「图标缺失」。
export function faviconCandidates(stored: string | null | undefined, url: string): string[] {
  const out: string[] = [];
  if (stored) out.push(stored);
  try {
    const u = new URL(url);
    const ico = `${u.origin}/favicon.ico`;
    if (!out.includes(ico)) out.push(ico);
    out.push(`https://www.google.com/s2/favicons?sz=64&domain=${u.hostname}`);
  } catch {
    /* 非法 URL：仅用已有 */
  }
  return out;
}

// Electron IPC 拒绝时的报错会带前缀「Error invoking remote method 'x': Error: 真正信息」，
// 这里剥掉前缀，只给用户看真正信息。
export function cleanIpcError(e: any): string {
  const fallback = translate(getLang(), 'error.generic');
  const raw = String(e?.message ?? e ?? fallback);
  const m = raw.match(/Error:\s*([^]*)$/);
  const msg = (m ? m[1] : raw).trim();
  return msg || fallback;
}

export function relativeTime(ts?: number | null, lang: Lang = getLang()): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return translate(lang, 'time.justNow');
  if (m < 60) return translate(lang, 'time.minutesAgo', { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return translate(lang, 'time.hoursAgo', { n: h });
  const d = Math.floor(h / 24);
  if (d < 30) return translate(lang, 'time.daysAgo', { n: d });
  const mo = Math.floor(d / 30);
  if (mo < 12) return translate(lang, 'time.monthsAgo', { n: mo });
  return translate(lang, 'time.yearsAgo', { n: Math.floor(mo / 12) });
}
