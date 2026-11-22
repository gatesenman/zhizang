# 02 · 快速开始

## 环境要求

- Node.js ≥ 20、pnpm 9（`corepack enable`）
- 可选：PostgreSQL（不配 `DATABASE_URL` 时后端自动回退到本地 SQLite）
- 打包桌面端：Linux 可原生产出 AppImage / Windows nsis / macOS（未签名）zip；正规 macOS `.dmg` 需在 macOS 上签名公证

## 安装

```bash
pnpm install
cp .env.example .env   # 按需修改
```

## 本地开发

### 一键启动（后端 + 门户 + 桌面端）

```bash
pnpm dev:all           # = bash scripts/dev.sh
```

### 单独启动

```bash
pnpm start:backend     # 后端  http://localhost:3001/api
pnpm start:portal      # 门户  http://localhost:3002
pnpm start:desktop     # 桌面端（Electron）

# 桌面端首次 / 切换 Node 版本后如遇 better-sqlite3 ABI 报错：
bash scripts/run-desktop.sh --rebuild
```

> 桌面端启动后在 `127.0.0.1:38121` 开启**本地桥接服务**，供浏览器插件与 MCP 通信（仅监听本机）。

## 一键部署（后端 + 门户 + 数据库）

```bash
cp .env.example .env       # 修改 JWT_SECRET 等
pnpm deploy                # = bash scripts/deploy.sh
```

`scripts/deploy.sh` 会：
1. 缺 `.env` 时从模板生成；
2. 缺许可证密钥时用 openssl 自动生成 RS256 密钥对（`keys/`）；
3. `docker compose up -d --build` 启动 PostgreSQL + 后端 + 门户；
4. 等待后端就绪并打印访问地址。

| 服务 | 地址 |
| --- | --- |
| 后端 API | http://localhost:3001/api |
| 健康检查 | http://localhost:3001/api/health |
| 付费门户 | http://localhost:3002 |
| PostgreSQL | postgres://zhicang:zhicang@localhost:5432/zhicang |

停止：`docker compose down`；日志：`docker compose logs -f`。

## 环境变量

见 `.env.example`，关键项：

| 变量 | 说明 |
| --- | --- |
| `PORT` | 后端端口（默认 3001） |
| `DATABASE_URL` | Postgres 连接串；不设则用 SQLite |
| `JWT_SECRET` | 鉴权密钥，生产必须改 |
| `LICENSE_PRIVATE_KEY_PATH` / `LICENSE_PUBLIC_KEY_PATH` | 许可证 RS256 密钥路径 |
| `PORTAL_URL` / `PUBLIC_BASE_URL` | 对外地址（支付回跳 / 回调 URL 拼接） |
| `NEXT_PUBLIC_API_BASE` | 门户访问后端的地址（构建期注入） |
| `THROTTLE_TTL` / `THROTTLE_LIMIT` | 全局限流窗口毫秒 / 次数（默认 60000 / 120） |

> **支付 / 邮件 / 登录渠道及凭证不走 `.env`**，而是在**管理后台 → 设置**中配置（持久化到 `settings` 表，可热切换）。留空即默认走本地 mock 收银台 / console 打印邮件，便于先跑通流程，凭证后填。详见 [wiki/06](./06-Backend-And-Licensing.md)。

## 脚本一览

| 脚本 | 作用 |
| --- | --- |
| `scripts/dev.sh` | 一键并行起后端 + 门户 + 桌面端 dev |
| `scripts/run-desktop.sh` | 单独起桌面端（`--rebuild` 重建原生模块） |
| `scripts/run-backend.sh` / `scripts/run-portal.sh` | 单独起后端 / 门户 |
| `scripts/deploy.sh` | Docker 一键部署后端 + 门户 + Postgres |

## 相关源码

- `README.md`、`.env.example`、`docker-compose.yml`
- `scripts/`（dev.sh / run-*.sh / deploy.sh）


## 2026-11 本地交付补充

最新中文快速启动和边界见 [交付说明](../交付说明.md)。本次实测 Node20.20.2/pnpm9.15.9；桌面本地功能可通过原有试用入口使用，不要求伪造激活。模板 DATABASE_URL 指向 Docker 的 db，本机开发无 Postgres 时应清空。后端本地 SQL.js 不再要求切换 Electron/Node 原生 SQLite binding。
