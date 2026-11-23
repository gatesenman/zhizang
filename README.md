> **2026-11 · 0.3.1 候选交付**：收藏→整理→找回→阅读→复用已在隔离 Linux 桌面 / 真 Chrome 扩展上验收。当前推荐 Windows 包为 **0.3.1** Setup / Portable（不要使用已知会崩溃的 0.3.0 Setup）。先看 [Windows使用说明](./Windows使用说明.md)、[主线优化与验收说明](./主线优化与验收说明.md)、[源码运行说明](./交付说明.md)。安装包未签名；0.3.1 尚未完成 Windows 真机安装/运行验收；线上商业服务未验收。

# 智藏 ZhiCang · AI 驱动的收藏夹管理桌面程序

跨端（Windows / macOS / Linux）AI 收藏夹管理器，含**桌面端 + 后端授权服务 + 付费门户 + 浏览器插件 + MCP 能力**的项目；生产商业服务需独立配置与专项验收。

## 下载（Windows x64，0.3.1）

GitHub 发行页：[windows-0.3.1](https://github.com/gatesenman/zhizang/releases/tag/windows-0.3.1)

| 包 | 用途 | 大小 | SHA256 |
|---|---|---|---|
| [ZhiCang-Setup-0.3.1-x64.exe](https://github.com/gatesenman/zhizang/releases/download/windows-0.3.1/ZhiCang-Setup-0.3.1-x64.exe) | NSIS 图形安装向导（推荐） | 83,939,318 字节 | `16b67174821c252df11e4e8168dd7c42b3468e2016f6f5baa9ee9634084a4db9` |
| [ZhiCang-Portable-0.3.1-x64.exe](https://github.com/gatesenman/zhizang/releases/download/windows-0.3.1/ZhiCang-Portable-0.3.1-x64.exe) | 便携版 | 83,721,481 字节 | `414c68aee3c4cc4e38fe2dfb7753f762a04222ca73e80254c15185d24e158ccb` |

详细安装、分卷合并与已知限制见 [Windows使用说明](./Windows使用说明.md)。

**诚实限制：** 0.3.0 Setup 曾在真实 Windows 11 上崩溃（System.dll / 0xC0000005），不要再用。0.3.1 已纳入 electron-builder 有界读取补丁；本轮对 0.3.1 包做了文件类型、体积与 SHA256 核对（与 `VERIFICATION.json` / 本地构建产物一致），**尚未在 Windows 真机上安装或启动**，不能称为已完成 Windows 烟测。安装包未代码签名。

未使用正式 tag `v0.3.1` 发布，是为避免触发 `.github/workflows/release.yml` 中 `v*` 标签的 ubuntu/windows/macos 打包作业。维护者若要打正式 `v*` tag，请先确认不会意外启动付费 Actions。

## 界面截图

仓库中已有验收时拍摄的真实界面（Linux 桌面，2026-11-22），不是本轮 Windows 安装后的新截图，也不是生成图。

<p><img src="docs/screenshots/工作台与本机网页预览-验收截图.webp" alt="智藏工作台与本机网页预览（既有验收截图）" width="800"></p>

<p><img src="docs/layout-polish/screenshots/全宽列表.webp" alt="智藏全部收藏全宽列表（既有布局验收截图）" width="800"></p>

更多见 `docs/screenshots/` 与 `docs/layout-polish/screenshots/`。


- 桌面端：Electron + React + TypeScript + SQLite(FTS5)
- 后端：NestJS + PostgreSQL（许可证签发 / 设备绑定 / 可插拔支付与邮件 / 云同步）
- 门户：Next.js（在线购码）
- 浏览器插件：Chrome (MV3) + Firefox
- MCP server：接入 Claude Desktop / Cursor

> 本次本地交付：先读 [中文运行与验收说明](./交付说明.md)，变更与验证见 [验收记录](./docs/DELIVERY-2026-11.md)。

---

## 目录结构

```
marktree/
├── apps/
│   ├── desktop/      # 桌面端（Electron）
│   ├── backend/      # 后端（NestJS）
│   ├── portal/       # 付费门户（Next.js）
│   ├── extension/    # 浏览器插件（Chrome / Firefox）
│   └── mcp/          # MCP server（stdio）
├── packages/shared/  # 共享类型
├── keys/             # 许可证 RS256 密钥（勿入库）
├── scripts/          # 运行 / 部署脚本
├── docker-compose.yml
└── .env.example
```

---

## 一、本地开发

### 前置

- Node.js 20 LTS（本次实测 20.20.2）、pnpm 9（`corepack enable`）
- 可选：PostgreSQL（不配 `DATABASE_URL` 时后端通过 SQL.js 回退到本地 SQLite（单进程开发用途））

### 安装

```bash
pnpm install
cp .env.example .env   # 按需修改
```

### 一键启动（后端 + 门户 + 桌面端）

```bash
pnpm dev:all           # = bash scripts/dev.sh
```

### 单独启动

```bash
pnpm start:backend     # 后端  http://localhost:3001/api
pnpm start:portal      # 门户  http://localhost:3002
pnpm start:desktop     # 桌面端（Electron）
# 桌面端首次/换 Node 版本后如遇 better-sqlite3 报错：
bash scripts/run-desktop.sh --rebuild
```

> 桌面端启动后会在 `127.0.0.1:38121` 开启**本地桥接服务**，供浏览器插件与 MCP 通信（仅监听本机）。

---

## 二、打包桌面端安装包

```bash
pnpm dist:desktop                              # 当前平台
pnpm --filter @zhicang/desktop dist:linux      # Linux AppImage
pnpm --filter @zhicang/desktop dist:win        # Windows NSIS
pnpm --filter @zhicang/desktop dist:mac        # macOS dmg（需在 macOS 上执行签名/公证）
```

产物在 `apps/desktop/release/`。三端签名版建议用 GitHub Actions（见 `.github/workflows/release.yml`）：打 tag 后在 `macos-latest` / `windows-latest` / `ubuntu-latest` 自动产出三端安装包。

---

## 三、一键部署（后端 + 门户 + 数据库）

```bash
cp .env.example .env       # 修改 JWT_SECRET 等
pnpm deploy                # = bash scripts/deploy.sh
```

`scripts/deploy.sh` 会：
1. 缺 `.env` 时从模板生成；
2. 缺许可证密钥时用 openssl 自动生成 RS256 密钥对；
3. `docker compose up -d --build` 启动 PostgreSQL + 后端 + 门户；
4. 等待后端就绪并打印访问地址。

| 服务 | 地址 |
| --- | --- |
| 后端 API | http://localhost:3001/api |
| 健康检查 | http://localhost:3001/api/health |
| 付费门户 | http://localhost:3002 |
| PostgreSQL | postgres://zhicang:zhicang@localhost:5432/zhicang |

停止：`docker compose down`，查看日志：`docker compose logs -f`。

---

## 四、浏览器插件（Chrome / Firefox）

一键收藏当前页 / 所有标签页 / 右键收藏链接 / 剪藏选中内容，自动抓取正文用于离线存档。**需先运行桌面端**。

```bash
pnpm build:extension       # 生成 apps/extension/dist/zhicang-chrome.zip 与 zhicang-firefox.zip
```

- Chrome / Edge：`chrome://extensions` → 开发者模式 → 加载已解压的扩展程序 → 选 `apps/extension`
- Firefox：`about:debugging` → 临时载入附加组件（先用 `manifest.firefox.json`）

详见 `apps/extension/README.md`。

---

## 五、MCP 能力（Claude Desktop / Cursor）

让 AI 客户端直接检索/阅读/新增你的收藏。**需先运行桌面端**。

```jsonc
{
  "mcpServers": {
    "zhicang": {
      "command": "node",
      "args": ["/绝对路径/marktree/apps/mcp/src/index.js"],
      "env": { "ZHICANG_BRIDGE_URL": "http://127.0.0.1:38121" }
    }
  }
}
```

工具：`search_bookmarks` / `add_bookmark` / `get_bookmark_content` / `list_recent`。详见 `apps/mcp/README.md`。

---

## 六、核心功能一览

**收藏管理**：列表/卡片双视图、FTS5 全文搜索、分类树、彩色标签、星标/稍后读/置顶、回收站、拖拽归类、批量操作、右键菜单、命令面板（Ctrl+K）。

**AI 能力**：自动抓取标题/描述/图标、AI 自动生成描述/标签/分类（OpenAI 兼容，预置 DeepSeek/通义/智谱，支持自定义 KEY），右侧 AI 面板自然语言检索（无 Key 降级关键词检索）。

**存档/导入**：网站完整静态化存档（正文 + 图片内联 data URI，断网可读）、批量粘贴链接导入、HTML/JSON/CSV/YAML 导入导出、失效链接检测、重复检测合并、智能文件夹、访问统计热力图。

**商业化**：激活码授权 + 设备绑定 + 离线宽限、云同步、付费门户在线购码、可配置后台（支付/邮件/登录渠道策略可插拔）。

---

## 七、环境变量

见 `.env.example`，关键项：

| 变量 | 说明 |
| --- | --- |
| `PORT` | 后端端口（默认 3001） |
| `DATABASE_URL` | Postgres 连接串；不设则用 SQLite |
| `JWT_SECRET` | 鉴权密钥，生产必须改 |
| `LICENSE_PRIVATE_KEY_PATH` / `LICENSE_PUBLIC_KEY_PATH` | 许可证 RS256 密钥路径 |
| `PORTAL_URL` / `PUBLIC_BASE_URL` | 对外地址 |
| `NEXT_PUBLIC_API_BASE` | 门户访问后端的地址（构建期注入） |

支付/邮件渠道留空即走本地 mock / console，便于先跑通流程，凭证后填。


---

## English

# ZhiCang — AI bookmark manager

**0.3.1 (candidate).** A cross-platform (Windows / macOS / Linux) AI bookmark manager with a desktop app, license backend, payment portal, browser extension, and MCP server. Production commercial services need their own configuration and acceptance.

### Download (Windows x64)

Release: [windows-0.3.1](https://github.com/gatesenman/zhizang/releases/tag/windows-0.3.1)

- Setup (NSIS, recommended): [ZhiCang-Setup-0.3.1-x64.exe](https://github.com/gatesenman/zhizang/releases/download/windows-0.3.1/ZhiCang-Setup-0.3.1-x64.exe) — 83,939,318 bytes, SHA256 `16b67174821c252df11e4e8168dd7c42b3468e2016f6f5baa9ee9634084a4db9`
- Portable: [ZhiCang-Portable-0.3.1-x64.exe](https://github.com/gatesenman/zhizang/releases/download/windows-0.3.1/ZhiCang-Portable-0.3.1-x64.exe) — 83,721,481 bytes, SHA256 `414c68aee3c4cc4e38fe2dfb7753f762a04222ca73e80254c15185d24e158ccb`

The 0.3.0 Setup is **not** recommended (it crashed on a real Windows 11 machine). 0.3.1 packages were checked for file type, size, and hash. They have **not** been installed or launched on Windows in this pass. Builds are unsigned. A formal `v0.3.1` tag was not pushed, to avoid triggering the multi-OS Release workflow.

### Screenshots

The images above are existing acceptance screenshots from a Linux desktop (2026-11-22), not new Windows 0.3.1 captures and not generated artwork. More files live under `docs/screenshots/` and `docs/layout-polish/screenshots/`.

### Run from source

Requires Node.js 20+ and pnpm 9. See the Chinese sections for install, packaging, deploy, extension, MCP, features, and environment variables. Start here: [Windows使用说明](./Windows使用说明.md) and [交付说明.md](./交付说明.md).

```bash
pnpm install
cp .env.example .env
pnpm dev:all
```

Windows installers can also be built with `pnpm --filter @zhicang/desktop dist:win` (outputs under `apps/desktop/release/`).
