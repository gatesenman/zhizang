# 智藏 ZhiCang · 0.4.0 免费开源版

本地优先的 AI 收藏管理桌面应用，支持 Windows / macOS / Linux。**无需注册码、激活、试用期、付费解锁或设备绑定**；本地收藏不要求账号、不依赖授权服务器。

## 实用主线

收藏 → 整理 → 找回 → 阅读 → 复用：浏览器扩展 / 批量粘贴 / HTML、JSON、CSV 导入；分类树、标签、星标、稍后读、回收站；全文与关键词搜索、笔记、网页预览、离线存档；知识图谱、可选 AI 辅助、MCP 本机桥接。已有本机桥接令牌、URL 检查、更新源校验和不删除用户数据的卸载策略保留。

- **本地功能免费**。AI 是可选项，外部 AI 服务需自备服务地址、模型与 API Key，第三方可能收费。本地关键词检索无需 Key，本地嵌入模型首次需联网下载并遵守模型许可。
- **跨设备同步可选、自托管**。账号只保护自己的同步数据，不是软件授权；不提供默认官方服务器，也不承诺第三方服务器免费。
- MIT 适用于项目自有代码/文档。见 [LICENSE](./LICENSE) 与 [第三方声明](./THIRD_PARTY_NOTICES.md)。

## 安全状态（请先阅读）

本次不是依赖安全升级：生产依赖审计仍有 **4 critical / 56 high / 76 moderate / 14 low**（详见 [验证记录](./docs/OPEN-SOURCE-0.4.0.md)）。继承的 Electron / Next.js 等版本需要单独升级回归；**不要将当前后端或项目站未经加固直接暴露公网**。源码构建/测试通过不表示已达到生产安全标准。

## 从源码运行

推荐 Node.js 20 LTS、pnpm 9.15.1。Linux 安装需具备 make / C++ 编译器、Python 3 和 Electron 运行库（GTK / NSS / ALSA）；原生 SQLite 依赖按 Electron ABI 构建。

```bash
pnpm install --frozen-lockfile
pnpm build:shared
pnpm dev:desktop
# 原生模块 ABI 错误时：
pnpm --filter @zhicang/desktop rebuild
```

仅运行桌面端**不需要** `.env`、后端、项目站、支付渠道或任何签名密钥。首次直接进入收藏工作台与分类引导，旧版 `local_mode` / 授权配置被无损忽略。数据目录、appId、收藏数据库及 API Key 配置不变。升级前建议在设置里做完整备份；备份含凭据，请勿公开。

### 可选同步与项目站

```bash
# 仅需要自托管同步时才运行后端
pnpm build:shared
pnpm start:backend                # http://localhost:3001/api
pnpm dev:portal                   # 开源项目介绍站 http://localhost:3002
# 或三者一起：pnpm dev:all
```

后端未设置 DATABASE_URL 时使用 SQL.js SQLite（仅单进程、小型开发场景），生产建议 PostgreSQL。环境配置见 [.env.example](./.env.example)；Docker 示例见 `docker-compose.yml`，默认数据库账号仅供开发，切勿原样部署到公网。部署需配置强随机 JWT_SECRET、HTTPS、数据库凭据、访问控制与备份策略。首次空库可临时 DB_SYNC=true 初始化，现有生产库应 DB_SYNC=false 并先备份审查；示例不包含生产迁移管理工具。

桌面设置 → 同步账号：填写自己信任的同步服务 HTTPS 地址（仅本机调试允许 HTTP），注册/登录后手动同步或在网络服务页启用自动同步。更换服务或账号会关闭自动同步、重置游标，不会删除本地收藏。登录密码不持久化；会话令牌保存在本机设置数据库，需保护数据目录与备份。会话过期应重新登录。

0.3.1 的激活码、公钥、设备绑定、支付订单、发码邮件模块已移除，原授权设置和旧后端商业数据表不主动删除。旧邮箱命名空间的云数据不会自动归属于新注册账号，详见 [后端迁移与安全](./wiki/06-Backend-And-Licensing.md)。

## 扩展与 MCP

```bash
pnpm build:extension
pnpm mcp
```

插件构建产物位于 `apps/extension/dist`；加载方式见 [扩展说明](./apps/extension/README.md)。MCP 连接配置见 [MCP README](./apps/mcp/README.md)。桥接仅监听本机 `127.0.0.1:38121`，访问令牌仍必需（安全凭据，不是注册码）。

## 校验与打包

```bash
pnpm build:shared
pnpm lint
pnpm typecheck
pnpm test
pnpm test:backend:e2e
pnpm test:packaging
pnpm test:edition
pnpm build:all
pnpm build:extension
pnpm --filter @zhicang/desktop dist:linux  # Linux AppImage
pnpm --filter @zhicang/desktop dist:win    # Windows Setup + Portable
pnpm --filter @zhicang/desktop dist:mac    # macOS zip
```

打包产物在 `apps/desktop/release/`，不提交到源码仓库。未签名安装包、跨平台 GUI、真实外部 AI 和部署环境必须另外验收；编译通过不代表 GUI 验证通过。当前版本验证记录见 [迭代记录](./docs/OPEN-SOURCE-0.4.0.md)。

## 目录与贡献

`apps/desktop` 桌面、`apps/backend` 可选同步 API、`apps/portal` 开源介绍站、`apps/extension` 插件、`apps/mcp` MCP、`packages/shared` 领域类型。

见 [CONTRIBUTING.md](./CONTRIBUTING.md) 与 [wiki](./wiki/README.md)。历史 0.2/0.3 验收记录及旧截图仅说明对应旧版本，不能作为 0.4.0 GUI / 发布完成的证据。
