# 00 · 项目概览

## 产品定位

智藏 ZhiCang 是一款**面向重度收藏夹用户的 AI 收藏管理桌面程序**，目标是「覆盖浏览器书签的全部能力，并用 AI 增强自动获取信息 / 分类 / 标签 / 描述」，**中/英双语界面（面向全球）**，跨 Windows / macOS / Linux。


0.4.0 为免费开源、本地优先版本，无注册码/试用门禁；可选同步账号仅用于保护私人云数据。外部 AI 服务需自备 Key，可能收费。MIT 范围与第三方素材权利见根目录声明。

## 能力总览

| 领域 | 能力 |
| --- | --- |
| 收藏管理 | 列表 / 卡片双视图、FTS5 全文搜索、分类树、彩色标签、星标 / 稍后读 / 置顶、回收站（软删除）、拖拽归类、批量操作、右键菜单、命令面板（Ctrl+K）；首启按角色（程序员/产品/设计/测试/方案顾问/通用）一键生成标准多级分类目录，或导入 YAML 分类树 |
| AI 能力 | 自动抓取标题/描述/图标、AI 生成描述/标签/分类（OpenAI 兼容，**出厂默认 DeepSeek**，预置通义/智谱/OpenAI，支持自定义 KEY）、右侧 AI 面板自然语言检索（无 Key 降级关键词检索） |
| 知识图谱 | 本地知识图谱（类 Obsidian，力导向图：收藏=节点，分类/标签/语义相似=边，可缩放拖拽、点节点开收藏）+ 语义检索（一句话高亮命中收藏）。嵌入向量来源可选：本地模型（transformers.js 在线安装、之后离线）/ API `/embeddings` / TF-IDF 兜底，默认本地，全部本地存储不上传 |
| 存档 / 导入 | 网站完整静态化存档（正文+图片内联 data URI，断网可读）、批量粘贴链接导入、HTML/JSON/CSV/YAML 导入导出、失效链接检测、重复检测合并、智能文件夹、访问统计热力图 |
| 桌面更新 | **electron-updater 自动更新**（GitHub Releases 渠道，静默下载 + 重启安装，更新弹窗中/英本地化） |
| 国际化 | **中/英双语**（桌面渲染层 + 主进程更新弹窗 + 门户公共页），一键切换、随系统语言自动探测 |
| 安全加固 | 后端 helmet 安全头 + 全局限流（throttler）；本地桥接服务 token 鉴权 + Origin/Host 校验 |
| 集成 | 浏览器插件（Chrome MV3 / Firefox，桥接携带访问令牌）、MCP server（Claude Desktop / Cursor，`ZHICANG_BRIDGE_TOKEN`） |

## 技术栈

| 模块 | 选型 |
| --- | --- |
| 桌面端 | Electron 31 + React 18 + TypeScript + Ant Design 5 + Vite（electron-vite）+ better-sqlite3（SQLite + FTS5） |
| 门户 | Next.js 14（App Router）+ React 18 |
| 插件 | 原生 JS，Chrome MV3 / Firefox MV2，webextension-polyfill |
| MCP | Node + `@modelcontextprotocol/sdk`（stdio 传输） |
| 工程 | pnpm monorepo（workspace）、共享类型包 `@zhicang/shared` |

## 仓库结构

```
marktree/
├── apps/
│   ├── desktop/      # 桌面端（Electron）       —— 见 wiki/03
│   ├── backend/      # 后端（NestJS）            —— 见 wiki/06
│   ├── portal/       # 开源项目站（Next.js）       —— 见 wiki/07
│   ├── extension/    # 浏览器插件（Chrome/FF）   —— 见 wiki/08
│   └── mcp/          # MCP server（stdio）       —— 见 wiki/09
├── packages/shared/  # 共享领域类型 —— 见 wiki/04
├── scripts/          # 运行 / 部署脚本
├── docs/PRODUCT_PLAN.md  # 产品规划文档
├── docker-compose.yml
└── .env.example
```

## 相关源码

- `README.md` — 项目根说明
- `docs/PRODUCT_PLAN.md` — 完整产品 / 技术规划
- `pnpm-workspace.yaml`、`package.json` — monorepo 工作区与脚本入口
