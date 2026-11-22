# 智藏 ZhiCang MCP Server

把你的收藏夹接入支持 [MCP](https://modelcontextprotocol.io) 的 AI 客户端（Claude Desktop、Cursor 等），让 AI 直接检索、阅读、新增你的收藏。

## 前置条件

- 已安装并运行**智藏桌面端**（MCP 通过桌面端本地桥接服务 `http://127.0.0.1:38121` 工作）
- Node.js ≥ 18

## 安装

```bash
pnpm --filter @zhicang/mcp install   # 或在本目录执行 npm install
```

## 提供的工具

| 工具 | 说明 |
| --- | --- |
| `search_bookmarks(query, limit?)` | 按关键词全文检索收藏 |
| `add_bookmark(url, title?)` | 新增一条收藏（桌面端自动富化） |
| `get_bookmark_content(id)` | 读取某条收藏的离线正文 |
| `list_recent(limit?)` | 最近收藏列表 |

## 接入 Claude Desktop

编辑 `claude_desktop_config.json`（macOS: `~/Library/Application Support/Claude/`，Windows: `%APPDATA%\Claude\`）：

```json
{
  "mcpServers": {
    "zhicang": {
      "command": "node",
      "args": ["/绝对路径/marktree/apps/mcp/src/index.js"],
      "env": {
        "ZHICANG_BRIDGE_URL": "http://127.0.0.1:38121"
      }
    }
  }
}
```

## 接入 Cursor

`Settings → MCP → Add new MCP server`：

```json
{
  "mcpServers": {
    "zhicang": {
      "command": "node",
      "args": ["/绝对路径/marktree/apps/mcp/src/index.js"]
    }
  }
}
```

## 自定义端口

若桌面端改了桥接端口，设置环境变量 `ZHICANG_BRIDGE_URL=http://127.0.0.1:<你的端口>`。
