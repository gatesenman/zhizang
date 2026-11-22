import http from 'http';
import type { Bookmark } from '@zhicang/shared';

// 本地桥接服务：供浏览器插件与 MCP 复用。
// 仅监听 127.0.0.1，默认端口 38121，避免暴露到公网。
export interface BridgeHandlers {
  addBookmark: (input: {
    url: string;
    title?: string;
    description?: string;
    html?: string;
    tags?: string[];
  }) => Promise<{ id: number; created: boolean; title: string }>;
  addBatch: (urls: string[]) => Promise<{ created: number; skipped: number }>;
  search: (q: string, limit?: number) => Bookmark[];
  getContent: (id: number) => Promise<{ title: string; content: string } | null>;
  recent: (limit?: number) => Bookmark[];
}

export interface BridgeInfo {
  name: string;
  version: string;
}

export interface BridgeOptions {
  // 访问令牌：非空时，除 /api/ping 与预检外的所有请求都必须携带匹配令牌
  token?: string;
}

let server: http.Server | null = null;

// 仅放行扩展来源（chrome-/moz-extension）与本机来源；其余网页来源一律拒绝，
// 以防任意网页通过用户浏览器向本地桥接发起 CSRF / DNS-rebinding 写入。
function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // 原生客户端（MCP / curl）无 Origin
  return (
    origin.startsWith('chrome-extension://') ||
    origin.startsWith('moz-extension://') ||
    origin === 'http://127.0.0.1' ||
    origin === 'http://localhost' ||
    /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)
  );
}

// 防 DNS-rebinding：Host 头必须指向本机回环地址。
function isAllowedHost(host: string | undefined, port: number): boolean {
  if (!host) return false;
  const h = host.toLowerCase();
  return (
    h === `127.0.0.1:${port}` ||
    h === `localhost:${port}` ||
    h === '127.0.0.1' ||
    h === 'localhost'
  );
}

function extractToken(req: http.IncomingMessage): string {
  const auth = req.headers['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const x = req.headers['x-zhicang-token'];
  if (typeof x === 'string') return x.trim();
  return '';
}

export function extractUrls(text: string): string[] {
  if (!text) return [];
  const re = /https?:\/\/[^\s"'<>()]+/gi;
  const found = text.match(re) ?? [];
  const cleaned = found.map((u) => u.replace(/[.,;:)\]]+$/, ''));
  return Array.from(new Set(cleaned));
}

function send(res: http.ServerResponse, status: number, body: unknown, allowOrigin = '*'): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': allowOrigin,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Zhicang-Token',
  });
  res.end(data);
}

function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 5_000_000) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

export function startBridge(
  handlers: BridgeHandlers,
  info: BridgeInfo,
  port = 38121,
  options: BridgeOptions = {},
): Promise<number> {
  const token = options.token || '';
  return new Promise((resolve, reject) => {
    server = http.createServer(async (req, res) => {
      const origin = req.headers['origin'] as string | undefined;
      const originOk = isAllowedOrigin(origin);
      const allowOrigin = origin && originOk ? origin : '*';
      if (req.method === 'OPTIONS') {
        send(res, 204, {}, allowOrigin);
        return;
      }
      // 防 DNS-rebinding：校验 Host 头
      if (!isAllowedHost(req.headers['host'], port)) {
        send(res, 403, { error: 'forbidden host' }, allowOrigin);
        return;
      }
      // 拒绝非扩展/非本机的网页来源
      if (!originOk) {
        send(res, 403, { error: 'forbidden origin' }, allowOrigin);
        return;
      }
      const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
      const path = url.pathname;
      // 令牌校验：/api/ping 用于发现，可免令牌；其余路由必须携带匹配令牌
      if (token && path !== '/api/ping' && extractToken(req) !== token) {
        send(res, 401, { error: 'unauthorized' }, allowOrigin);
        return;
      }
      try {
        if (req.method === 'GET' && path === '/api/ping') {
          send(res, 200, { ok: true, name: info.name, version: info.version });
          return;
        }
        if (req.method === 'GET' && path === '/api/search') {
          const q = url.searchParams.get('q') || '';
          const limit = Number(url.searchParams.get('limit') || '20');
          const items = handlers.search(q, limit).map((b) => ({
            id: b.id,
            title: b.title,
            url: b.url,
            description: b.description,
            tags: b.tags,
            categoryId: b.categoryId,
          }));
          send(res, 200, { items });
          return;
        }
        if (req.method === 'GET' && path === '/api/recent') {
          const limit = Number(url.searchParams.get('limit') || '20');
          const items = handlers.recent(limit).map((b) => ({
            id: b.id,
            title: b.title,
            url: b.url,
            description: b.description,
            tags: b.tags,
          }));
          send(res, 200, { items });
          return;
        }
        const contentMatch = path.match(/^\/api\/bookmark\/(\d+)\/content$/);
        if (req.method === 'GET' && contentMatch) {
          const id = Number(contentMatch[1]);
          const c = await handlers.getContent(id);
          if (!c) {
            send(res, 404, { error: 'not found' });
            return;
          }
          send(res, 200, c);
          return;
        }
        if (req.method === 'POST' && path === '/api/capture') {
          const body = await readBody(req);
          if (!body.url) {
            send(res, 400, { error: 'url required' });
            return;
          }
          const r = await handlers.addBookmark({
            url: String(body.url),
            title: body.title ? String(body.title) : undefined,
            description: body.description ? String(body.description) : undefined,
            html: body.html ? String(body.html) : undefined,
            tags: Array.isArray(body.tags) ? body.tags.map(String) : undefined,
          });
          send(res, 200, r);
          return;
        }
        if (req.method === 'POST' && path === '/api/capture/batch') {
          const body = await readBody(req);
          let urls: string[] = Array.isArray(body.urls) ? body.urls.map(String) : [];
          if (body.text) urls = urls.concat(extractUrls(String(body.text)));
          urls = Array.from(new Set(urls));
          if (!urls.length) {
            send(res, 400, { error: 'no urls' });
            return;
          }
          const r = await handlers.addBatch(urls);
          send(res, 200, r);
          return;
        }
        send(res, 404, { error: 'unknown route' });
      } catch (err: any) {
        send(res, 500, { error: String(err?.message ?? err) });
      }
    });
    server.on('error', (err) => reject(err));
    server.listen(port, '127.0.0.1', () => resolve(port));
  });
}

export function stopBridge(): Promise<void> {
  const current = server;
  server = null;
  if (!current) return Promise.resolve();
  return new Promise((resolve) => {
    current.close(() => resolve());
    current.closeIdleConnections();
  });
}
