> 本文为 0.4.0 前的历史设计/验收记录，不代表当前开源版功能或验证状态；当前版见 [OPEN-SOURCE-0.4.0.md](./OPEN-SOURCE-0.4.0.md)。

> 本文件保留前两轮历史实施记录；当前版本为0.3.0、63项测试、桌面和真Chrome扩展已验收。最新运行/Windows包/边界以根目录`主线优化与验收说明.md`、`Windows使用说明.md`和`docs/VERIFICATION.json`为准。

# 本地交付与验收记录 · 2026-11-22 · 0.2.0 Windows 补齐版

## 工作范围

上传内容是 AI 收藏夹管理软件。按其现有方向完成核心收藏工作流加固与中文桌面工作台 UI；没有改造成营销网站，没有连接或修改远端仓库。

## 主要变更（源码证据）

| 范围 | 变更 | 相关文件 |
|---|---|---|
| 工作台 UI | 主/次工具栏、分类标题与检索上下文、三栏独立滚动、底部本地状态、深浅色、密度与边界统一、窄窗口布局 | `App.tsx`, `styles.css`, `theme.ts`, `ListToolbar.tsx` |
| 新增/编辑 | 可填标题/标签；新增清理旧过滤；编辑标签、错误反馈、防旧详情覆盖 | `AddBookmarkModal.tsx`, `WebPreview.tsx`, `store.ts` |
| 检索 | 保留 FTS，补中文子串与笔记/标签字面检索；`%`/`_` 不作通配符 | `main/db.ts` |
| 分类 | NULL 未分类能被打开及计数；阻止移动到子孙目录，遍历防环 | `main/db.ts` |
| 回收站 | 修复单条永久删除误用 emptyTrash 的严重问题；修复批量永久删除重复软删除；新增 `bookmarks:purge` IPC，仅对所选回收站记录硬删，UI 确认 | `main/db.ts`, `main/index.ts`, `preload/index.ts`, `BookmarkPanel.tsx`, `ListToolbar.tsx`, `store.ts` |
| AI | 独立可测的检索服务；中文问法归一化；无命中不回退最近收藏；明确关键词模式；超时/空响应/坏 JSON 报错，保留手工标签，任务去重 | `main/assistant.ts`, `main/enrich.ts`, `main/index.ts`, `AIPanel.tsx` |
| 导入导出 | JSON v2 保留层级与同名子目录、笔记、标签、星标、置顶、阅读状态、创建时间；循环引用预检、单条导入事务 | `main/import-export.ts` |
| 安全隔离 | 离线正文不再直接注入拥有 preload 的渲染页，改无脚本沙箱 iframe；外部打开仅 HTTP(S)，webview 不附 preload/Node | `WebPreview.tsx`, `main/index.ts` |
| 前端状态 | 旧查询与旧详情不覆盖新请求；加载失败可重试；智能目录关键词保留；视图和主题持久化，删除末页可回到有效页 | `store.ts`, `BookmarkPanel.tsx` |
| 本地后端 | SQL.js 自动持久化 SQLite，避免与 Electron 原生 ABI 冲突；HOST 可配置；PostgreSQL 分支不变 | `backend/src/db/data-source.ts`, `backend/src/main.ts`, package/lock |
| 工程验证 | Electron 原生运行时的桌面测试运行器、实库/状态测试、临时后端 HTTP 测试；启动脚本不再吞共享包编译错误 | `scripts/`, `desktop/test/` |

## 验证分类

- 单元测试中受控 IPC fixture 仅用于测试前端并发状态，不能当作真实前后端完成证明。
- 桌面业务集成使用真实 better-sqlite3，包含关闭重开数据库和跨库导入；HTTP 桥接测试连接真实 SQLite handlers。
- 后端测试启动真实 NestJS 服务，用标准 Node + SQL.js 落盘，HTTP 完成模拟支付/许可证/同步链路。mock 支付与 console 邮件是明确的本地测试渠道，非真实支付/邮件。
- GUI 已由父会话 computerUse 在隔离库完成操作验收，原始截图已纳入 `docs/screenshots/`；详细通过范围与限制见 [GUI 验收补充](./verification/GUI-ACCEPTANCE.md)。普通/最大化无明显遮挡，任意尺寸未验证。不是安装包、真实模型、支付或线上同步验收。

## 执行日志

`docs/verification/install.log`、`build.log`、`extension.log`、`lint.log`、`typecheck.log`、`tests.log`、`backend-e2e.log`。最终结果以日志和 `VERIFICATION.json` 为准。

## 不在完成声明内

真实商户/邮件/模型凭证与部署、真实第三方网站预览、PostgreSQL/Docker、多设备真实同步、签名安装包、自动更新和商业安全认证。更多边界见根目录 `交付说明.md`。

历史 `ANALYSIS-2026-06.md` 保留作为历史材料，其中“没有测试”等旧结论不是本次现状。

## GUI 证据补充

2026-11-22（Asia/Shanghai，UTC+8）更新了运行说明、验证元数据和截图证据；这是上一轮 GUI 证据补充的记录；本轮 0.2.0 另有功能修改及重跑验证，不扩大上一轮 GUI 覆盖范围。自有测试 GUI/HTTP 进程已结束。

## 0.2.0 端到端与 Windows 补齐

- 实际生成 NSIS 安装 EXE 与 portable EXE（x64），Wine32 缺失的真实打包阻塞已通过安装正常依赖解决。最终构建与 PE/ASAR/7za 校验见 `verification/windows/`；没有使用 Windows 实机，不能声称运行安装验收通过。EXE 未做商业签名。
- 保留试用和商业授权，增加持久本地模式及三步首次运行向导；配置界面覆盖授权/服务健康测试、实际模型请求测试、网络桥接、同步错误和明确停用的更新状态。
- 修复 API 根地址遗漏 `/api` 导致授权/同步断点；激活后的云同步验证本机许可证有效性。服务地址更换重置游标，错误保留，不伪装成功。
- URL 哈希仅归一化协议/主机名；迁移旧哈希，保留路径/查询/片段大小写；云端旧哈希按 URL 重算。
- 整库在线 SQLite `.zhicang` 备份、校验恢复、覆盖前安全副本与应用重启；JSON 仍作为交换格式，不冒称完整备份。
- 浏览器扩展连接测试真实受保护接口并校验响应，拒绝缺失/错误令牌；端口和令牌变更即时重启桥接，配置失败明确反馈。
- 移除原 GitHub 默认更新源，默认停用，无真实更新源不假装完成检查；用户显式下载和确认安装。
- 单实例与 portable 独立随身数据目录、中文 Windows 说明。macOS 原方向保留，未新增 macOS 安装包。
- 测试共 42 项；真实 Nest HTTP E2E 另调用实际桌面授权/同步代码与真实 SQLite，并验证重开持久化；签名键/支付/邮件仅使用隔离 fixture，不是线上服务。

完整覆盖边界见 [功能覆盖与验证矩阵](./功能覆盖与验证矩阵.md)，Windows 使用步骤见根目录 `Windows使用说明.md`。本轮新增向导/设置/原生备份恢复/自动重启/手动重开持久化/桥接状态与错误已在隔离 Linux GUI 实际通过，六张新截图、只读实库证据和清理结果见 `verification/GUI-0.2-ACCEPTANCE.md`。旧截图保留；Windows 实机安装运行、签名和线上服务仍未验证。
