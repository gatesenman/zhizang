# 0.4.1 交付与复验

日期：2026-11-24，Asia/Shanghai UTC+8。分支 feat/open-source-edition；以705e931为新十轮起点，非重复计数旧开源工作。仅开PR到main、不合并；不改PR#1的分支，README/Windows文档/library-components测试与其有历史重叠，合并由维护者协调。

## 实际结果

| 检查 | 实际结果 |
| --- | --- |
| 完整冻结安装 + 桌面限定原生重建 | 成功；另有冻结离线ignore-scripts锁一致性检查（不将其冒充完整安装） |
| pnpm lint / typecheck | 通过；Next typegen与桌面main/renderer均包含 |
| pnpm test | 桌面80、后端4全部通过；shared是类型定义，以构建/消费端检查，不设0测试伪成功 |
| test:edition / packaging / security / tooling | 4 / 5 / 5 / 1 全通过 |
| build:all / build:extension | shared、Nest、Next Webpack、Electron Vite、Chrome/Firefox全部成功 |
| test:backend:e2e | 真实Nest/SQL.js HTTP + 两个独立Electron/SQLite客户端，5005+分页、未来服务时间后继续上传、账号隔离、墓碑不复活及重启持久化成功；规模夹具全局限流500，非生产默认120限流压测 |
| Next production HTTP | 0.4.1免费页200，buy/activate/pricing404 |
| MCP actual stdio | 0.4.1握手与四工具list成功；单测另含实际桥接/SQLite工具读写及扩展原始脚本传输 |
| Linux ZIP + 精确包启动 | builder26真实打包，CRC/路径/无AppRun、Main/Preload字节一致、ASAR未混Vite/tar；实际renderer preload→受保护IPC，收藏/归类/标签/笔记CAS/搜索/访问/离线读/无Key引用、应用重启后持久化及桥接401全部成功 |
| live audit --audit-level high | 退出0；完整raw audit仍有生产2/全部4中危，默认audit退出1，不是零漏洞 |

Linux smoke脚本为 scripts/smoke-linux-package.py / probe-desktop-renderer.cjs。ZIP 135359505字节，SHA256 `87778fa6413c0c20b39c752c7827967ab09736afd9f80935c5918e22ffbfe184`。临时loopback调试器只用于新建测试profile，进程退出即关闭；离线HTML为测试库插入夹具，不声称抓取外站成功；Xvfb程序化测试/截图不是人工GUI验收。第一次probe错误把libvulkan.so.1当主程序而失败，已修正唯一应用ELF筛选并重跑；不是把该失败算通过。

结构化证据见 [Linux smoke](./security/0.4.1/linux-package-smoke.json) 与 [测试汇总](./security/0.4.1/validation.json)。所有轮次及失败/范围见 ITERATION-10-ROUNDS.md。原始审计/剩余路径与暴露条件见 SECURITY-DEPENDENCIES-0.4.1.md。

## 未测及剩余风险

- 未做Windows/macOS安装卸载/portable、人工GUI完整交互、真实AI计费服务/模型下载、浏览器扩展GUI、签名更新、Docker/PostgreSQL公网部署或渗透测试。NSIS模板SHA/语义与分卷安全测试通过不等于Windows实测。
- 同步全量分页有带宽成本；LWW时钟/同毫秒冲突、SQL.js单进程限制、缺少邮箱验证/找回/自动刷新仍在。协议2客户端和后端一起升级。
- DNS检查未绑定Chromium/代理连接，rebinding TOCTOU及旧媒体/主动webview联网仍在；POSIX主库0600不是加密/历史WAL/备份/Windows ACL保证。生产/工具链中危完整保留，不无限覆盖主版本。
- MIT只覆盖有权许可的原创代码/文档；图标/旧截图创作凭据仍待核实，第三方许可证/模型/API/素材不再许可。外部服务可能收费，保留自备Key和必要认证，不恢复激活。

## 人工GUI与截图需求（普通用户，独立数据目录）

```bash
pnpm install --frozen-lockfile && pnpm build:shared
ZHICANG_USER_DATA_DIR="$(mktemp -d -t zhizang-gui-XXXXXX)" pnpm dev:desktop
# 或构建 pnpm --filter @zhicang/desktop dist:linux，再隔离目录运行ZIP里的 @zhicangdesktop
```

不要拿唯一原库验证，不要日常root/关闭sandbox。需要旧数据验证时先做完整备份，仅用明确拷贝的测试副本；备份含Key/会话，不上传公开。

请保留以下截图/操作结果（API Key/令牌须遮挡）：
1. 首启工作台无激活；HTML/CSV/JSON采集与重复导入，待整理→分类/标签/批量→撤销/回收站，不误删其它收藏。
2. 中文标题/标签/笔记搜索、翻页稳定及异常重试；选中阅读、离线图文、不可嵌入原站的外部打开兜底。
3. 快速笔记/在途清空/切换收藏、冲突提示与重开恢复；收藏助手无Key显示真实引用、不冒充AI总结。
4. API设置仍可自备Key，本机AI地址可用；同步切号/断线/多页/删除重开；桥接错误令牌被拒绝。
5. Windows需另外构建和验证非管理员Setup安装路径、portable隔离目录、分卷合并哈希、卸载不删用户数据；macOS也需独立打包/启动/权限验证。

## 获取与边界

清洁源码归档：`/workspace/zhizang-artifacts/zhizang-0.4.1-source.zip`；SHA256及最终commit/测试/扫描摘要在同目录 DELIVERY-0.4.1.json。源码不含.git、真实env/凭据、依赖、构建缓存、安装包、用户收藏/笔记数据库；apps/desktop/build的图标是已跟踪源码资产，保留第三方权属限制，非构建缓存。未发布安装包或合并main。
