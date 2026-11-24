# 0.4.1 安全与依赖边界（当前）

日期：2026-11-24，Asia/Shanghai UTC+8。0.4.0 原始报告/审计仍保留为历史，不能用旧计数描述当前版；不是渗透测试或“完全安全”证明。

## 原始审计（没有 overrides）

| 范围 | critical | high | moderate | low |
| --- | ---: | ---: | ---: | ---: |
| 本次 before 生产 | 0 | 0 | 2 | 0 |
| 本次 before 全部 | 1 | 11 | 14 | 1 |
| 本次 after 生产 | 0 | 0 | 2 | 0 |
| 本次 after 全部 | 0 | 0 | 4 | 0 |

原件：[before production](./security/0.4.1/audit-before-production.json)、[before all](./security/0.4.1/audit-before-all.json)、[after production](./security/0.4.1/audit-after-production.json)、[after all](./security/0.4.1/audit-after-all.json)。均保留全部 finding/path，没有删除剩余项；默认 audit 仍退出1。CI 的 high 阈值只是阻止新严重发现，**不代表中危已解决**。计数不能相加当作独立可利用攻击数量。

## 本轮实际升级与迁移

- electron-builder / app-builder-lib **26.18.0**；显式匹配 required peer electron-builder-squirrel-windows **26.18.0**，避免 pnpm 保留旧24打包器。上游 tar **7.5.23**、打包 builder-util-runtime **9.7.0**；桌面 updater 自己解析 **9.7.1**。旧 tar6 critical、AppImage advisory、旧发布器高危依赖路径不再在当前锁文件。
- NSIS **上游已含原安全修复**：逐项审查 bounded lstrcpynW、回退目录、Push/Pop寄存器、非空指针释放，并锁定模板 SHA256。见 [26版证据](./packaging-0.4.1/NSIS-PATCH.json)；原24补丁/声明仅保留为历史，不作为 active patchedDependencies。**没有做 Windows 安装/卸载/portable 执行验收**。
- electron-vite **6.0.0** / Vite **7.3.8** / React 插件 **5.2.0**，按官方迁移使用 build.externalizeDeps，保留 Cheerio/YAML/shared 纯JS打包与 SQLite 原生外置。根/桌面显式对齐 Vite7 peer，避免自动引入另一套 Vite8/Rolldown；不扩大 React19 重写。
- 新 builder 默认会跨工作区重建不使用的 TypeORM optional SQLite12，实际 Electron45/V8 编译失败。改为官方 @electron/rebuild API，projectRootPath/buildPath 限定桌面，onlyModules=better-sqlite3；postinstall 与 beforePack 均执行**当前平台/目标架构**重建。npmRebuild=false 只关闭错误的全工作区重建，不是放弃原生验证。实际 SQLite13 运行与最终解包检查另做。
- Electron **45.4.1** / SQLite **13.2.0 Node-API** / Next **16.4.6** / Nest **11.2.11** 保持。实际解析见 [版本证据](./security/0.4.1/dependency-resolution.json)。Linux 仍只 ZIP；新版工具不等于 AppImage launcher 已验收，钩子继续拒绝 AppImage。

## 剩余风险的真实路径/触发条件

1. **生产2个中危**：`backend → @nestjs/typeorm@11.0.3 → typeorm@0.3.31 → glob@10.5.0 → minimatch@9.0.9`（也有直接 typeorm 路径）。GHSA-3g3m-2fjr-6pw4 为取消遍历后的额外文件系统IO/资源消耗，修复 glob>=14.0.2；GHSA-g3hv-75wg-m249 为恶意模式+optimizationLevel>=2 的处理放大，修复 minimatch>=11.0.1。当前实体显式类列表、无用户实体路径/glob/AbortSignal 遍历端点，尚未确认 HTTP 可达触发点；不强制覆盖不兼容上游主版本。新增动态实体/迁移配置必须重评。
2. **开发/构建同家族中危**：Nest CLI11.0.24→glob13.0.6→minimatch10.2.6；typescript-eslint7→typescript-estree7→minimatch9.0.9；builder26→minimatch10.2.6，builder→@electron/universal2.0.3→minimatch9.0.9。需要受控的恶意构建/CLI匹配模式、相应 optimizationLevel/取消遍历条件；不是当前收藏内容直接调用的网络API。不运行不可信仓库/构建配置；CI 执行外部贡献本来就是代码执行边界。原始 JSON 列出全部重复路径。不以无依据 overrides 或大规模 lint/ORM 重写隐藏发现。
3. ESLint8/typescript-eslint7 与若干间接库仍 deprecated；非零审计与 EOL 工具需后续规划迁移，本轮已消除可控严重工具链项后停止扩大范围。

## 网络、数据和同步限制

- 逐跳 DNS 私网检查和取消、正文5MB/图片1.5MB流式上限、元数据图片目标检查减少自动抓取 SSRF；**未绑定 Chromium/代理实际DNS连接，仍有 rebinding TOCTOU**。严苛部署加出口过滤。旧媒体/主动 webview 仍联网，非“完全离线无跟踪”。离线 reader sandbox+CSP只 data 图片；需图片可用完整存档安全抓取内联。
- IPC 真实主窗口/主帧/准确入口限制不替代 renderer 本身安全；自备AI/同步地址仍允许明确的本机调试设置，桥接令牌/HTTPS等认证保留。本地 SQLite/备份存有明文Key/会话，应保护目录/备份；POSIX主库0600不是加密或 Windows ACL 承诺。
- 协议2完整按键分页，每页<=500并受响应预算限制，上传<=500条/1MB、服务器JSON2MB，响应10MB上限；本地游标不信任服务器墙钟。完整拉取有带宽成本，不是增量服务端日志；纯hash墓碑避免永久删除复活。客户端/自托管服务一起升级，旧版遇截断明确失败。
- LWW 仍受设备时钟/同毫秒冲突影响；SQL.js 仅单进程小型自托管，不承诺多实例SaaS一致性。登录无邮箱验证/密码找回/自动刷新；公网部署仍需HTTPS、强密钥、数据库及备份。第三方 AI/同步服务可能收费，不恢复软件激活。

验证命令、实际结果与未测项见 [十轮记录](./ITERATION-10-ROUNDS.md) 和最终交付指南。MIT 仅覆盖有权许可的原创部分，第三方素材来源限制见 THIRD_PARTY_NOTICES，不因升级扩大授权。
