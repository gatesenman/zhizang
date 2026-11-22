# 10 · 构建与发布

## 桌面端打包

桌面端用 electron-vite 编译（main/preload/renderer 三套），再用 electron-builder 产出安装包。

```bash
pnpm dist:desktop                              # 当前平台
pnpm --filter @zhicang/desktop dist:linux      # Linux AppImage
pnpm --filter @zhicang/desktop dist:win        # Windows NSIS + portable (.exe)
pnpm --filter @zhicang/desktop dist:mac        # macOS（本仓库配置为 zip；正规 .dmg 需 macOS 签名）
```

产物在 `apps/desktop/release/`：

| 平台 | 产物 | 备注 |
| --- | --- | --- |
| Windows | `ZhiCang-Setup-0.2.0-x64.exe`、`ZhiCang-Portable-0.2.0-x64.exe` | 实际生成并通过静态/归档校验；Windows 实机未验收 |
| Linux | `ZhiCang-<version>.AppImage` | 免安装；需 FUSE，或用 `--appimage-extract` 解包运行 |
| macOS | `ZhiCang-<version>-mac.zip` | 未签名 app；首次打开需 `xattr -dr com.apple.quarantine ZhiCang.app` 或右键打开 |

> **必须锁定 `electronVersion`**：`apps/desktop/package.json` 的 `build.electronVersion` 固定为 `31.7.7`。pnpm monorepo 下 electron-builder 无法从扁平 node_modules 自动推断 Electron 版本，缺失该字段会导致 `pnpm install`（含 `postinstall: electron-builder install-app-deps`）报错；显式锁定后安装与打包均干净。

## 自动更新（electron-updater）

桌面端集成 `electron-updater`（`apps/desktop/src/main/updater.ts`）。默认停用；配置真实更新源并启用后才检查。发现版本后用户明确点“下载更新”，下载完成再确认重启安装。

- **发布渠道**：0.2.0 移除原 GitHub Provider 默认配置，不连接原仓库。客户端更新默认停用；发行者需提供真实 HTTPS generic 更新目录及 `latest.yml`/安装包等正确资源，再启用客户端更新。交付未部署发布流水线。
- **触发**：仅打包版本且更新启用/源有效时启动定时检查；`autoDownload=false`、`autoInstallOnAppQuit=false`。
- **dev 无副作用**：开发模式明确返回 disabled 状态，不下载/安装。
- **容错**：错误/停用原因与进度经 `update:status` IPC 广播到设置，不吞错伪装成功；检查按钮所有分支恢复状态。
- **交付边界**：未部署实际 feed/更新包托管和签名服务，不能声称线上更新验收通过。

> 详细 IPC 与渲染层交互见 [wiki/03 · 自动更新](./03-Desktop-App.md)。

## 代码质量校验（Lint · Typecheck · Test）

全仓库统一一套校验，本地与 CI 一致：

```bash
pnpm lint        # eslint . --ext .ts,.tsx,.js,.cjs,.mjs --max-warnings 0（零警告门槛）
pnpm typecheck   # pnpm -r --if-present typecheck（各包 tsc --noEmit）
pnpm test        # pnpm -r --if-present test（各包 node --test）
```

- **ESLint**：根 `.eslintrc.cjs`（ESLint 8.57 经典配置，`root:true`）+ `@typescript-eslint` v7 + `eslint-plugin-react` / `react-hooks`。根 `lint` 用 `--max-warnings 0`，任何警告即失败。
  - 关键正确性规则置为 `error`：`@typescript-eslint/no-unused-vars`（`^_` 豁免）、`prefer-const`、`no-var`、`eqeqeq`（`smart`，允许 `== null`）、`no-throw-literal`。
  - 良性提示：`@typescript-eslint` 报「TypeScript 5.9.3 未被官方支持」属警告，**不影响退出码**。
- **测试**：使用 Node 内置 `node --test` + `ts-node/register`（无 vitest/jest），经跨平台运行器 `scripts/run-tests.mjs` 调度。当前 42 个用例：`packages/shared` 5、`apps/backend` 8、`apps/desktop` 29；另有真实 HTTP 后端/桌面授权同步 E2E。
  - 桌面端测试需 `apps/desktop/tsconfig.test.json`（CommonJS + esModuleInterop）供 ts-node 加载。
  - **跨平台**：`scripts/run-tests.mjs` 用 Node 自行发现 `<dir>/*.test.ts` 再交给 `node --test`，规避 `test/*.test.ts` glob 在 Windows/cmd 下不展开的问题；可选 `--project tsconfig.test.json` 跨平台替代内联 `TS_NODE_PROJECT` 环境变量（桌面端用）。

## CI 校验（ci.yml）

仓库附 `.github/workflows/ci.yml`：每次 push / PR 在 `ubuntu-latest` 上跑完整校验链（不打包、不发布）：

```
pnpm install --frozen-lockfile
pnpm --filter @zhicang/shared build   # 先产出 shared/dist 供其余包消费
pnpm lint → pnpm typecheck → pnpm -r test
pnpm --filter @zhicang/{backend,portal,desktop,extension} build  # desktop 仅编译不打包
```

> 与下方「CI 发布」分工：`ci.yml` 负责每次提交的质量门禁；`release.yml` 负责打 tag 后的三端打包/签名/发布。

## 依赖打包策略（重要）

本项目是 **pnpm monorepo**，electron-builder 在收集运行时依赖时对 pnpm 的符号链接 node_modules 处理不完整，曾导致打包产物启动即崩溃。最终采用两条措施保证产物可用：

1. **根 `.npmrc` 设 `node-linker=hoisted`**：让 node_modules 扁平化，electron-builder 能正确收集原生依赖（`better-sqlite3` 及其 `bindings` 子依赖）。
2. **主进程内联打包纯 JS 依赖**（`apps/desktop/electron.vite.config.ts`）：
   ```ts
   externalizeDepsPlugin({ exclude: ['cheerio', 'yaml', '@zhicang/shared'] })
   ```
   - `cheerio` / `yaml` / `@zhicang/shared`（及其 `jsonwebtoken`→`jws` 依赖链）被打进 `out/main/index.js`，不再依赖 node_modules 解析。
   - 只有原生模块 `better-sqlite3` 保持 external（无法 bundle），由 electron-builder 解包到 asar 外。
3. **HTML 解析使用 `cheerio/slim`**：cheerio 1.2 默认引入 `undici`，而 undici 依赖实验性 `node:sqlite`（Electron 的 Node 20 不含），改用 `cheerio/slim` 规避。

### 踩坑记录（回归用）

| 现象 | 根因 | 修复 |
| --- | --- | --- |
| 批量粘贴导入后渲染层白屏「Rendered more hooks」 | 右键菜单 hook 在列表 `.map()` 内调用，收藏数变化导致 hook 数不一致 | 改为纯函数 `contextMenuItems(b, categories, isTrash)`，hook 调用上移到组件顶层 |
| 打包产物启动报 `Cannot find module 'domutils'` | cheerio 的传递依赖未进 asar | 内联打包 cheerio（slim） |
| `No such built-in module: node:sqlite` | bundle 引入 undici | 改用 `cheerio/slim` |
| `Cannot find module 'jws'` | `@zhicang/shared`→jsonwebtoken 依赖链未进 asar | 内联打包 `@zhicang/shared` |
| `Cannot find module 'bindings'` | better-sqlite3 原生子依赖未进 asar | `.npmrc` 改 hoisted 后重装 |
| `pnpm install --frozen-lockfile` 退出 1（postinstall 阶段） | `electron-builder install-app-deps` 在 pnpm 扁平 node_modules 下推断不出 Electron 版本 | `apps/desktop/package.json` 加 `build.electronVersion: "31.7.7"` |
| 知识图谱本地模型加载被 CSP 拦截 | 默认 CSP 不允许 CDN 脚本 / WASM eval | `renderer/index.html` 的 `script-src` 增加 `'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net`，transformers.js 与模型按需在线加载、之后浏览器缓存离线可用 |
| 新增收藏富化报 `fetch failed`、favicon 抓不到（dev 正常、打包 / 代理环境失败） | `enrich.ts` 用 Node `undici` fetch，不复用系统代理与 OS 证书库 | 全部对外请求改用 Electron `net.fetch`（Chromium 网络栈）；favicon 渲染层再加逐级回退。详见 [wiki/05](./05-AI-Enrichment.md) |
| 新增重复 URL 报 `Error invoking remote method 'bookmarks:create'` | 重复时 `createBookmark` 抛异常，IPC 拒绝并把原始错误透传到渲染层 | handler 捕获后返回 `{ bookmark, duplicate:true }`，前端友好提示并定位现有收藏。详见 [wiki/03](./03-Desktop-App.md) |
| 右侧预览空白、无任何提示 | 站点拒绝被嵌入 / 网络 / 证书错误时 webview 静默失败 | 监听 `did-fail-load` 显示可读提示 + 外部打开 / 阅读模式兜底；webview 用标准 Chrome UA + 持久分区 |

> 知识图谱前端用纯 JS 的 `react-force-graph-2d`（canvas 力导向，无原生依赖），可正常被 vite 打包；transformers.js 与嵌入模型**不打进安装包**，运行时从 CDN 动态加载并缓存（控制安装包体积、首次需联网）。

> 修改桌面端依赖或 `electron.vite.config.ts` 后，务必解包 AppImage 实测启动（不能只测 dev 模式）：
> `./ZhiCang-0.1.0.AppImage --appimage-extract && ./squashfs-root/@zhicangdesktop --no-sandbox`，确认无 `Cannot find module` 且桥接 `listening on 127.0.0.1:38121`。

## 浏览器插件打包

```bash
pnpm build:extension   # → apps/extension/dist/zhicang-chrome.zip, zhicang-firefox.zip
```

`apps/extension/build.mjs` 为**自包含跨平台打包器**：复制用 `fs.cpSync`，压缩用内置 `zlib` 自写 ZIP（local/central/EOCD 头 + CRC32），**始终用正斜杠路径**，不依赖系统 `zip`/`cp`/PowerShell，CI 与 Windows / macOS / Linux 产物一致（早期用 `cp`/`zip` 在 Windows 下打包失败，用 PowerShell `Compress-Archive` 又会产生反斜杠路径导致 Chrome 加载异常）。

## CI 发布（推荐三端签名）

仓库附 `.github/workflows/release.yml`：打 tag 后在 `macos-latest` / `windows-latest` / `ubuntu-latest` 上分别产出三端安装包（macOS 可在此完成签名 / 公证产出正规 `.dmg`）。

## 相关源码

- `apps/desktop/electron.vite.config.ts`、`apps/desktop/package.json`（build 配置 + `electronVersion` + `publish`）
- `apps/desktop/src/main/updater.ts`（electron-updater 集成）
- 根 `.npmrc`
- 根 `.eslintrc.cjs`、根 `package.json`（`lint`/`typecheck`/`test` 脚本）
- `apps/desktop/tsconfig.test.json`（桌面端测试 ts-node 配置）
- `.github/workflows/ci.yml`（每次提交质量门禁）
- `.github/workflows/release.yml`（打 tag 三端发布）
- `scripts/run-tests.mjs`（跨平台测试运行器）
- `apps/extension/build.mjs`（自包含跨平台 zip 打包器）


## 2026-11 本地交付补充

本次新增 `scripts/run-desktop-tests.mjs`：桌面测试用 Electron 的 Node 运行时，匹配 postinstall 的 SQLite ABI。`pnpm test:backend:e2e` 使用标准 Node 启动临时后端，测试数据结束清理，仅 mock 支付与 console 邮件。测试/构建日志见 docs/verification，完整命令见交付说明。本次已生成未签名 Windows x64 NSIS/portable EXE，并验证 PE/ASAR/原生模块/归档完整性；未在 Windows 实机安装运行，未发布。GUI 已通过父会话 computerUse 完成隔离库中的核心流程验收，见 docs/verification/GUI-ACCEPTANCE.md；普通/最大化布局通过，任意尺寸未验证。GUI 或构建通过均不等于安装包及商业发布验收。原 build.publish 默认已移除，新源须由发行者正确配置。

Windows 0.2.0 安装/使用/构建与验证边界见根目录 `Windows使用说明.md`、`交付说明.md` 以及 `docs/功能覆盖与验证矩阵.md`。
