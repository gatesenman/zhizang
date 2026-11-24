#!/usr/bin/env node
/**
 * 智藏 ZhiCang MCP Server
 * 通过桌面端本地桥接服务（默认 http://127.0.0.1:38121）暴露收藏夹能力：
 *   - search_bookmarks(query, limit)
 *   - add_bookmark(url, title?)
 *   - get_bookmark_content(id)
 *   - list_recent(limit)
 * 通过 stdio 传输，可接入 Claude Desktop / Cursor 等支持 MCP 的客户端。
 */
import { readFileSync } from 'node:fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const BRIDGE = process.env.ZHICANG_BRIDGE_URL || 'http://127.0.0.1:38121';
// 桥接访问令牌：从桌面端「设置 → 本地桥接服务 → 访问令牌」复制后写入此环境变量
const BRIDGE_TOKEN = process.env.ZHICANG_BRIDGE_TOKEN || '';

async function bridge(path, options = {}) {
  const headers = Object.assign({}, options.headers || {});
  if (BRIDGE_TOKEN) headers['X-Zhicang-Token'] = BRIDGE_TOKEN;
  const res = await fetch(`${BRIDGE}${path}`, { ...options, headers, signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`桥接服务返回 ${res.status}: ${t}`);
  }
  return res.json();
}

const TOOLS = [
  {
    name: 'search_bookmarks',
    description: '在用户的智藏收藏夹中按关键词检索收藏（标题/描述/标签/正文全文）。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '检索关键词' },
        limit: { type: 'number', description: '返回数量上限，默认 20' },
      },
      required: ['query'],
    },
  },
  {
    name: 'add_bookmark',
    description: '把一个网址收藏到用户的智藏收藏夹，桌面端会自动抓取标题/分类/标签。',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '要收藏的网址' },
        title: { type: 'string', description: '可选标题' },
      },
      required: ['url'],
    },
  },
  {
    name: 'get_bookmark_content',
    description: '获取某条收藏的离线正文存档内容（用于阅读/总结）。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: '收藏 ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_recent',
    description: '列出用户最近收藏的网站。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '返回数量上限，默认 20' },
      },
    },
  },
];

const server = new Server(
  { name: 'zhicang-mcp', version },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    if (name === 'search_bookmarks') {
      const q = encodeURIComponent(args.query || '');
      const limit = Number(args.limit) || 20;
      const data = await bridge(`/api/search?q=${q}&limit=${limit}`);
      return { content: [{ type: 'text', text: JSON.stringify(data.items, null, 2) }] };
    }
    if (name === 'add_bookmark') {
      const data = await bridge('/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: args.url, title: args.title }),
      });
      return {
        content: [
          {
            type: 'text',
            text: data.created ? `已收藏：${data.title}（id=${data.id}）` : `该网址已收藏（id=${data.id}）`,
          },
        ],
      };
    }
    if (name === 'get_bookmark_content') {
      const data = await bridge(`/api/bookmark/${Number(args.id)}/content`);
      return { content: [{ type: 'text', text: `# ${data.title}\n\n${data.content}` }] };
    }
    if (name === 'list_recent') {
      const limit = Number(args.limit) || 20;
      const data = await bridge(`/api/recent?limit=${limit}`);
      return { content: [{ type: 'text', text: JSON.stringify(data.items, null, 2) }] };
    }
    throw new Error(`未知工具：${name}`);
  } catch (e) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `调用失败：${e?.message ?? e}。请确认智藏桌面端正在运行（桥接地址：${BRIDGE}）。`,
        },
      ],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // 注意：stdout 由 MCP 协议占用，日志走 stderr
  console.error(`[zhicang-mcp] 已启动，桥接地址 ${BRIDGE}`);
}

main().catch((e) => {
  console.error('[zhicang-mcp] 启动失败', e);
  process.exit(1);
});
