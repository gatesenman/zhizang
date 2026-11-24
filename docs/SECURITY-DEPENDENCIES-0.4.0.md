# 0.4.0 有边界的安全依赖整改

> 历史0.4.0快照：当前版本、已解决的严重工具链项和解除5000条截断等，以 [0.4.1当前报告](./SECURITY-DEPENDENCIES-0.4.1.md) 为准。以下原始事实不追溯改写。

验证日期：2026-11-24（Asia/Shanghai UTC+8）。本轮仅本地提交，不 push、不建 PR、不发布二进制；不宣称完整渗透测试或生产安全认证。

## 审计与原始证据

| 范围 | critical | high | moderate | low |
| --- | ---: | ---: | ---: | ---: |
| 整改前生产依赖 | 4 | 56 | 76 | 14 |
| 整改后生产依赖 | 0 | 0 | 2 | 0 |
| 整改后全部依赖（含开发/打包） | 1 | 11 | 14 | 1 |

保留原始 [before production](./security/audit-before-production.json)、[after production](./security/audit-after-production.json)、[after all](./security/audit-after-all.json)。两个 after 审计命令均因剩余发现返回 **1**，不冒称审计通过。基线 SHA256：`0d1b754b7a58e99982e2e70d3802cf2bced4441cf6be617581c47dfbec1bc866`，与整改前盒子原件逐字节一致。未取得整改前 all-dependencies 原件，不杜撰该数字。计数是 advisory 数量，不是独立可利用攻击面数。

[实际依赖解析](./security/dependency-resolution.json) 与 [注册表版本/engines/peer 查询证据](./security/registry-evidence.json) 一并保留。没有添加 overrides，没有用删除发现或伪造版本来制造绿色报告。

## 已整改主路径与兼容迁移

| 路径 | 当前处理 |
| --- | --- |
| portal → Next 14.2.35 | **16.4.6**，显式 Webpack 保留原构建方式，类型检查先 `next typegen` |
| backend → Nest / platform-express → Express | Nest **11.2.11** / Express **5.2.1** / proxy-addr **2.0.8** / body-parser **2.4.0** / multer **2.5.0**；TypeORM **0.3.31** |
| Express 5 行为变化 | @types/express 同步 **5.0.6**；同步控制器显式拒绝空/非对象 body，真实 HTTP E2E 校验 400 而不是 500 |
| desktop → Electron 31.7.7（EOL） | **45.4.1**，实测内嵌 Node **24.22.3**、Chromium **156.0.8078.100**；官方 45 EOL 计划为 2027-04-27（暂定），不是永久支持承诺 |
| desktop → better-sqlite3 | **13.2.0 Node-API**。尝试 12.11.1 时 Electron 45/V8 编译失败且无 ABI 150 预编译，未打源码补丁强行绕过，改用实际安装/运行成功的 13 |
| desktop → electron-updater → builder-util-runtime | **6.8.12 → 9.7.1**，独立于旧打包器的 9.2.4；最终 ASAR 也核实为 9.7.1，不仅检查开发目录 |
| HTML 网络依赖 | 锁定解析 Cheerio **1.2.0** / undici **7.30.2**；继续使用 `cheerio/slim` |
| MCP SDK / peer | **1.32.2 / zod 4.6.7**，桥接令牌仍必需 |
| 环境 | 推荐 Node **24 LTS**、最低 **22.12.0**；CI / release / Docker 改 Node 24；@types/node 同步 24 |

React 18.3.1 仍在 Next 16 peer 支持范围，但官方已标 deprecated；本轮未额外扩大为全工作区 React 19 迁移。默认 Turbopack 首次构建曾因磁盘写缓存失败，当前显式 Webpack 路径实际构建成功。Electron 45 首次使用需下载二进制，可先 `pnpm --filter @zhicang/desktop exec install-electron`。

TypeORM 可选 better-sqlite3 peer 仍解析到独立 12.x；后端实际用 SQL.js / PostgreSQL，不调用该原生驱动；桌面正确解析到自身 13.2.0。未改变 appId、数据目录或收藏数据库；旧授权无损忽略，自备 AI API Key 和桥接安全校验保留。

## 两个剩余生产中危的真实边界

1. `backend → @nestjs/typeorm@11.0.3 → typeorm@0.3.31 → glob@10.5.0`（也有直接 TypeORM 路径）：[GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4)，取消 glob 遍历后仍进行文件系统 I/O，资源耗尽；修复需 glob >=14.0.2。
2. 同一路径 `→ glob@10.5.0 → minimatch@9.0.9`：[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)，恶意模式且 optimizationLevel >=2 时放大处理；修复需 minimatch >=11.0.1。

当前 ORM 显式传实体类，不接收用户指定实体 glob / 路径 / 模式，没有对外暴露带 AbortSignal 的文件树遍历端点，因此尚未确认当前 HTTP 请求可达这些触发条件。**若以后开放动态实体/迁移路径或模式配置，必须重评估。** 不越过上游契约强制覆盖不兼容主版本，后续等待兼容修复并补测试。

## 开发、打包与会进入产物的风险

**devDependency 不等于不会产生运行时漏洞。** 原始 all JSON 保留每条路径，以下按家族解释，不能把各行重复计数相加。

| 剩余家族及路径 | 暴露条件与处理 |
| --- | --- |
| **tar 6.2.1**：desktop → electron-builder 24.13.3 → app-builder-lib 24.13.3 → tar（1 critical / 8 high / 3 moderate） | 包括提取/路径/压缩炸弹风险，critical [GHSA-23hp-3jrh-7fpw](https://github.com/advisories/GHSA-23hp-3jrh-7fpw) 修复需 >=7.5.19。已核查该版 app-builder-lib 的直接调用为 `out/targets/archive.js` 的 `tar.create`，不是提取；仍不能宣称库已修复或构建供应链安全。Linux ZIP 不用 tar 归档目标，最终 ASAR 不含 tar；不要给该工具链不可信构建输入或归档。 |
| **app-builder-lib 24.13.3 → AppImage AppRun**（1 high） | [GHSA-7g7r-gx96-252g](https://github.com/advisories/GHSA-7g7r-gx96-252g)：空 LD_LIBRARY_PATH 组件把当前目录加入动态库搜索，攻击者在可写启动目录放库可执行代码，**确实影响生成的运行时 AppImage，不能说只是开发工具问题**。本轮 Linux 改 **ZIP**，不产生 AppRun；`beforePack` 钩子拒绝显式 AppImage target，真实 CLI 已实测拒绝、无产物。发现前生成的试验 AppImage 已删除。恢复 AppImage 是阻塞项，需迁移已核实存在的 builder >=26.15.0 并回归。 |
| **builder-util-runtime 9.2.4**：electron-builder / app-builder-lib / builder-util / electron-publish 构建路径（1 high） | [GHSA-p2f4-r6v6-j797](https://github.com/advisories/GHSA-p2f4-r6v6-j797)：跨源重定向泄露 PRIVATE-TOKEN / 大小写 Authorization 等凭据。不要向旧发布器注入 PAT、仓库或私有下载凭据；桌面 updater 与实际 ASAR 为已修复 **9.7.1**，不是此构建副本。 |
| **Vite 5.4.21**：root、desktop → electron-vite 2.3.0 / plugin-react 4.7.0 → vite（1 high / 6 moderate / 1 low） | dev server / Windows launch-editor / UNC-NTLM / fs allow-deny 等问题；高危 [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm)。发行桌面载静态页面，无 Vite server；但开发者访问恶意网站、本机服务可达、不可信输入仍可能触发，**localhost 不是完整防护**。不暴露公网，不在不可信项目/浏览器环境运行开发服务；需独立协同迁移 electron-vite / Vite / React 插件。 |
| **esbuild 0.21.5**：root、desktop → electron-vite / Vite → esbuild（1 moderate） | [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)：恶意网站读开发服务器响应；纯 transform/build 不是 serve。仍保留发现，不给工具链安全背书。 |
| **glob / minimatch 开发副本** | Nest CLI → glob 13.0.6 → minimatch 10.2.6；打包 config-file-ts → glob 10.5.0；ESLint typescript-estree → minimatch 9.0.9 等，与生产两 advisory 家族重叠。全部路径见原始 JSON。 |

停止扩大范围的理由：builder 24 含既有 Windows NSIS / portable 安全补丁与守卫，跨主版本必须移植补丁并实测 Windows 安装/卸载/分卷；本 Linux 环境没有完成该验收。没有静默删除补丁、无脑 overrides 或无限升级。**正式签名/发布前需专门迁移打包器及开发工具链**；Linux ZIP 是收窄已知产物攻击面的临时方案，不证明整个供应链安全。ZIP 暂不支持 AppImage 自动更新，手动替换程序时保留原数据目录。

## 本轮实际验证

环境 Linux x64，宿主 Node 24.22.1 / pnpm 9.15.9。

| 命令/验证 | 结果 |
| --- | --- |
| 完整依赖安装/原生依赖 | SQLite 13 方案成功；12 方案失败不记为通过 |
| `pnpm install --frozen-lockfile --ignore-scripts --offline` | 通过；仅此冻结一致性检查不执行 postinstall，另有完整安装成功记录 |
| `pnpm lint`、`pnpm typecheck` | 通过，含 Next typegen |
| `pnpm test` | 后端 3 + 桌面 65 全通过；shared 无独立单测，未伪计通过 |
| `pnpm test:edition` / `test:packaging` / `test:security` | 4 / 5 / 4 全通过；涵盖免费边界、原 Windows 安全守卫和 Linux AppImage 拒绝钩子 |
| `pnpm test:backend:e2e` | 实际 Nest HTTP + 临时 SQL.js + Electron 45 / SQLite 13 客户端通过：登录、401、商业路由 404、缺失 body 400、账号隔离、LWW/删除、旧表/云数据保留 |
| `pnpm build:all` / `pnpm build:extension` | shared / backend / Next Webpack / desktop / Chrome 与 Firefox 扩展均通过 |
| Next 16 实际 production HTTP | 本机启动成功，首页 200 且为免费开源内容；/buy、/activate、/pricing 均 404 |
| MCP SDK 实际 stdio 握手 + tools/list | 通过，版本 0.4.0、四个工具；不调用写收藏或网络工具 |
| Linux ZIP 打包/CRC | Electron 45 + SQLite 13 成功；ZIP CRC、相对路径与无 AppRun 校验通过；ASAR runtime 9.7.1、SQLite 13.2.0，未含 Vite/tar |
| 精确 ZIP 解包启动 | **通过**，版本、SQLite 初始化、旧授权配置保留、桥接 ping 0.4.0、私有路由无令牌 401、延迟初始化后仍存活；Main/Preload 与构建 SHA256 一致。见 [结构化结果](./security/linux-package-smoke.json) |
| 显式 `--linux AppImage` CLI | 预期非零、明确 GHSA 原因且未生成 AppImage，见 [拒绝记录](./security/appimage-rejection.json) |

并行刷新审计 JSON 时曾因读取未写完文件导致证据测试失败，改为刷新完毕后串行重跑通过；后续应先写临时文件再原子替换，避免此操作竞态。磁盘空间波动曾导致下载/复制 smoke 失败；最终仅清理本 checkout 可重建输出、暂存/恢复本 checkout 依赖后完成。最终 smoke 通过 SHA256 相同的已有普通磁盘文件硬链接去重，实际从普通可执行磁盘启动精确包内容；RAM 仅存归档/解包/临时测试 profile，不在 noexec 文件系统执行二进制。Electron 与 Next 依赖已恢复，构建也重新执行。旧 Electron 31 的 AppImage smoke 仅为历史阶段，不替代本轮证据。

源码候选与 Git 已提交历史均使用 Gitleaks 8.30.1（脱敏输出）全量扫描，无发现；候选列表另外检查凭据/数据库/安装包/依赖/缓存，不提交 `.env` 或本地数据。扫描不是完整安全审计。

### 未测及验证方式

- **没有可视 GUI 验收**；Xvfb 仅验证进程、SQLite 与本机桥接。未完成新版 Windows/macOS 打包安装卸载、真实 AI / 浏览器扩展 GUI / 线上签名更新 / Docker / PostgreSQL 公网部署验收。
- 普通用户下 `pnpm install --frozen-lockfile && pnpm build:shared`，再 `ZHICANG_USER_DATA_DIR=/tmp/zhicang-0.4-gui pnpm dev:desktop`；或隔离目录运行 ZIP 的 `@zhicangdesktop`。检查首启无激活、旧收藏/授权/API Key 保留、导入分类搜索笔记预览回收站备份、同步切号隔离、桥接令牌拒绝。不要拿唯一原库试验，不应日常以 root/关闭 sandbox 运行。
- 同步仍为可选自托管；无邮箱验证/密码找回/token 自动刷新，5000 条拉取上限、LWW/时钟偏差限制未变。旧邮箱云数据需人工核实归属迁移；部署需强 JWT_SECRET、HTTPS、数据库与备份，不把示例凭据放公网。
- 本地免费不等于第三方 AI / 模型 / 服务免费；自备 Key 保留。MIT 仅覆盖有权许可的原创内容，依赖与旧素材权利见 [第三方声明](../THIRD_PARTY_NOTICES.md)，安全升级不会自动补齐图标/截图来源证明。

## 上游依据

[Next 16 migration](https://nextjs.org/docs/app/guides/upgrading/version-16)、[React version](https://nextjs.org/docs/messages/react-version)、[Electron breaking changes](https://www.electronjs.org/docs/latest/breaking-changes)、[installation](https://www.electronjs.org/docs/latest/tutorial/installation)、[release schedule](https://releases.electronjs.org/schedule)。其余每条 advisory 全文/修复范围、所有路径和版本查询均在随附原始 JSON；没有凭空指定修复版本。
