import * as cheerio from 'cheerio/slim';
import type { AiEnrichResult, Bookmark, LlmConfig } from '@zhicang/shared';
import { validateLlmConfig } from './service-url';
import { netFetch } from './net-fetch';
import { abortable, assertPublicWebUrl, publicWebFetch, readLimitedText, readLimitedBytes } from './public-web-fetch';

export interface SiteMeta {
  title: string;
  description: string;
  favicon: string;
  image: string;
  excerpt: string;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export async function fetchSiteMeta(rawUrl: string, transport: typeof fetch = publicWebFetch, checkAsset: (url: string) => Promise<void> = assertPublicWebUrl): Promise<SiteMeta> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await transport(rawUrl, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      signal: controller.signal,
      redirect: 'follow',
    });
    await assertWebResponse(res);
    const html = await readLimitedText(res);
    const $ = cheerio.load(html);
    const origin = new URL(res.url || rawUrl).href;

    const title =
      $('meta[property="og:title"]').attr('content') ||
      $('title').first().text() ||
      '';
    const description =
      $('meta[name="description"]').attr('content') ||
      $('meta[property="og:description"]').attr('content') ||
      '';
    let image = absolutize($('meta[property="og:image"]').attr('content') || '', origin);
    let favicon =
      $('link[rel="icon"]').attr('href') ||
      $('link[rel="shortcut icon"]').attr('href') ||
      '/favicon.ico';
    favicon = absolutize(favicon, origin);
    const safeAsset = async (url: string): Promise<string> => { if (!url) return ''; try { await abortable(checkAsset(url), controller.signal); return url; } catch { return ''; } };
    [favicon, image] = await Promise.all([safeAsset(favicon), safeAsset(image)]);

    $('script, style, noscript, svg, nav, footer, header').remove();
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    const excerpt = bodyText.slice(0, 1500);

    return {
      title: title.trim().slice(0, 300),
      description: description.trim().slice(0, 600),
      favicon,
      image,
      excerpt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// 探活：返回 HTTP 状态码（失败返回 null）
export async function checkLink(url: string): Promise<number | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    let res = await publicWebFetch(url, { method: 'HEAD', headers: { 'User-Agent': UA }, signal: controller.signal, redirect: 'follow' });
    // 部分站点不支持 HEAD，回退 GET
    if (res.status === 405 || res.status === 501) {
      res = await publicWebFetch(url, { method: 'GET', headers: { 'User-Agent': UA }, signal: controller.signal, redirect: 'follow' });
    }
    const status = res.status; await res.body?.cancel(); return status;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// 提取正文为可读 HTML（离线快照 / 阅读模式）
export async function fetchReadable(rawUrl: string, transport: typeof fetch = publicWebFetch): Promise<{ title: string; html: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await transport(rawUrl, { headers: { 'User-Agent': UA }, signal: controller.signal, redirect: 'follow' });
    await assertWebResponse(res);
    const raw = await readLimitedText(res);
    const $ = cheerio.load(raw);
    const title = $('meta[property="og:title"]').attr('content') || $('title').first().text() || rawUrl;
    $('script, style, noscript, iframe, svg, nav, footer, header, form, button, input').remove();
    // 选最可能的正文容器
    const candidates = ['article', 'main', '[role=main]', '#content', '.content', '.article', '.post', 'body'];
    let node: any = $('body');
    for (const sel of candidates) {
      const el = $(sel).first();
      if (el.length && el.text().trim().length > 200) {
        node = el;
        break;
      }
    }
    const origin = new URL(res.url || rawUrl).href;
    node.find('img').each((_: number, el: any) => {
      const src = $(el).attr('src');
      if (src) $(el).attr('src', absolutize(src, origin));
    });
    node.find('a').each((_: number, el: any) => {
      const href = $(el).attr('href');
      if (href) $(el).attr('href', absolutize(href, origin));
    });
    const inner = node.html() ?? '';
    return { title: title.trim(), html: inner };
  } finally {
    clearTimeout(timeout);
  }
}

async function assertWebResponse(response: Response): Promise<void> {
  if (!response.ok) { await response.body?.cancel(); throw new Error(`网页请求失败 (${response.status})`); }
  const type = response.headers.get('content-type') || '';
  if (type && !/^(text\/(html|plain)|application\/xhtml\+xml)(;|$)/i.test(type)) { await response.body?.cancel(); throw new Error('不支持的网页内容类型'); }
}

function absolutize(u: string, origin: string): string {
  if (!u) return '';
  try {
    return new URL(u, origin).href;
  } catch {
    return '';
  }
}

// 完整静态化存档：抓取正文 HTML，并把图片下载内联为 data URI，断网也可读。
// 给定 readableHtml 时复用，避免重复抓取（如插件已带正文）。
export async function fetchArchive(
  rawUrl: string,
  readableHtml?: string,
): Promise<{ title: string; html: string; images: number }> {
  let title = rawUrl;
  let html = readableHtml ?? '';
  if (!html) {
    const r = await fetchReadable(rawUrl);
    title = r.title;
    html = r.html;
  }
  const $ = cheerio.load(`<div id="zc-archive-root">${html}</div>`, null, false);
  const imgEls = $('#zc-archive-root img').toArray();
  let inlined = 0;
  // 最多内联 40 张图，单张上限 1.5MB，整体控制体积
  const limit = imgEls.slice(0, 40);
  await Promise.all(
    limit.map(async (el) => {
      const src = $(el).attr('src');
      if (!src || src.startsWith('data:')) return;
      try {
        const dataUri = await imageToDataUri(src);
        if (dataUri) {
          $(el).attr('src', dataUri);
          $(el).removeAttr('srcset');
          inlined++;
        }
      } catch {
        /* 跳过失败的图片 */
      }
    }),
  );
  return { title, html: $('#zc-archive-root').html() ?? html, images: inlined };
}

async function imageToDataUri(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await publicWebFetch(url, { headers: { 'User-Agent': UA }, signal: controller.signal });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || 'image/png';
    if (!type.startsWith('image/')) return null;
    const buf = Buffer.from(await readLimitedBytes(res, 1_500_000));
    if (buf.length > 1_500_000) return null;
    return `data:${type};base64,${buf.toString('base64')}`;
  } finally {
    clearTimeout(timeout);
  }
}

// 通用大模型对话（供右侧 AI 面板做自然语言检索/问答）
export async function aiChat(
  cfg: LlmConfig,
  messages: { role: string; content: string }[],
  transport: typeof fetch = netFetch,
): Promise<string> {
  validateLlmConfig(cfg);
  const res = await transport(`${cfg.baseUrl.trim().replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: cfg.temperature ?? 0.3,
      messages,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`大模型调用失败 ${res.status}: ${t.slice(0, 200)}`);
  }
  const data: any = await res.json();
  const answer = data?.choices?.[0]?.message?.content;
  if (typeof answer !== 'string' || !answer.trim()) throw new Error('大模型返回空内容，请检查模型和服务配置');
  return answer;
}

export async function aiEnrich(
  bookmark: Bookmark,
  meta: SiteMeta,
  cfg: LlmConfig,
  categories: string[],
): Promise<AiEnrichResult> {
  const sys =
    '你是一个中文收藏夹智能助理。根据网页信息，输出 JSON：{"description":"一句话中文摘要(50字内)","tags":["中文标签"],"suggestedCategory":"分类"}。' +
    'tags 最多 5 个，必须是中文短词。suggestedCategory 必须从给定分类列表里选一个最贴切的，没有合适的就用"未分类"。只输出 JSON，不要解释。';
  const user = `网页标题：${meta.title || bookmark.title}
网址：${bookmark.url}
原始描述：${meta.description}
正文节选：${meta.excerpt.slice(0, 1200)}
可选分类：${categories.join('、')}`;

  validateLlmConfig(cfg);
  const res = await netFetch(`${cfg.baseUrl.trim().replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: cfg.temperature ?? 0.3,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`大模型调用失败 ${res.status}: ${t.slice(0, 200)}`);
  }
  const data: any = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? '{}';
  const parsed = safeParse(content);
  if (!parsed || typeof parsed.description !== 'string' || !Array.isArray(parsed.tags)) throw new Error('大模型返回格式无效，请重试');
  return {
    description: String(parsed.description ?? meta.description ?? '').slice(0, 200),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map((t: any) => String(t)).slice(0, 5) : [],
    suggestedCategory: String(parsed.suggestedCategory ?? '未分类'),
  };
}

function safeParse(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* ignore */
      }
    }
    throw new Error('大模型返回了无效 JSON');
  }
}

// 并发受限的简单队列
export class TaskQueue {
  private running = 0;
  private queue: (() => Promise<void>)[] = [];
  constructor(private concurrency: number) {}

  setConcurrency(n: number): void {
    this.concurrency = Math.max(1, n);
  }

  push(task: () => Promise<void>): void {
    this.queue.push(task);
    this.drain();
  }

  get pending(): number {
    return this.queue.length + this.running;
  }

  private drain(): void {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift()!;
      this.running++;
      task()
        .catch(() => undefined)
        .finally(() => {
          this.running--;
          this.drain();
        });
    }
  }
}
