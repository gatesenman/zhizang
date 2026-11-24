# 09 · MCP 能力

`apps/mcp` 是一个标准 **MCP（Model Context Protocol）server**，通过 stdio 传输，让 Claude Desktop / Cursor 等 AI 客户端直接检索、阅读、新增用户的收藏。它通过桌面端**本地桥接服务**工作，**使用前需先运行桌面端**。

## 工具（Tools）

| 工具 | 入参 | 说明 | 桥接调用 |
| --- | --- | --- | --- |
| `search_bookmarks` | `query`（必填）, `limit?` | 按关键词全文检索收藏 | `GET /api/search` |
| `add_bookmark` | `url`（必填）, `title?` | 收藏网址，桌面端自动抓取/富化 | `POST /api/capture` |
| `get_bookmark_content` | `id`（必填） | 取某条收藏的离线正文存档 | `GET /api/bookmark/:id/content` |
| `list_recent` | `limit?` | 列出最近收藏 | `GET /api/recent` |

## 工作原理

```mermaid
graph LR
  Client["Claude Desktop / Cursor"] -->|MCP stdio| MCP["zhicang-mcp\nsrc/index.js"]
  MCP -->|HTTP| Bridge["桌面端桥接\n127.0.0.1:38121"]
  Bridge --> Desktop["桌面端收藏库"]
```

- 桥接地址通过环境变量 `ZHICANG_BRIDGE_URL` 配置，默认 `http://127.0.0.1:38121`。
- **访问令牌**：桥接已启用令牌鉴权，需将桌面端「设置 → 本地桥接 → 访问令牌」写入环境变量 `ZHICANG_BRIDGE_TOKEN`；server 经 `X-Zhicang-Token` 头携带（详见 [wiki/03 · 桥接鉴权](./03-Desktop-App.md#本地桥接服务)）。
- 注意：stdout 被 MCP 协议占用，server 日志一律走 stderr。
- 桥接不可达或令牌不匹配时，工具返回友好错误，提示「请确认智藏桌面端正在运行」。

## 接入配置

在 Claude Desktop / Cursor 的 MCP 配置中加入：

```jsonc
{
  "mcpServers": {
    "zhicang": {
      "command": "node",
      "args": ["/绝对路径/marktree/apps/mcp/src/index.js"],
      "env": {
        "ZHICANG_BRIDGE_URL": "http://127.0.0.1:38121",
        "ZHICANG_BRIDGE_TOKEN": "从桌面端设置复制的令牌"
      }
    }
  }
}
```

## 相关源码

- `apps/mcp/src/index.js`（基于 `@modelcontextprotocol/sdk`）
- `apps/mcp/README.md`
- 桥接路由见 [wiki/03 · 本地桥接服务](./03-Desktop-App.md#本地桥接服务)


## 0.4.0 开源版

MCP 协议版本信息改为读取本包 package.json，避免与 0.4.0 版本脱节。桥接令牌与本机服务安全检查保留。

安全整改使用 MCP SDK 1.32.2 与显式 zod 4.6.7 peer；桥接令牌仍必需，不属于软件激活。
