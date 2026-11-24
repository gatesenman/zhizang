# 0.4.1：十轮真实主线迭代

起点：705e9313b587d5d61637aae5897a91743570cd73（不是重计前三轮开源/依赖整改）。日期 2026-11-24，Asia/Shanghai UTC+8。按用户要求在既有本机 checkout 工作，不使用云代理、不触碰用户目录；最终只 push 一次功能分支，PR 到 main、不合并。

开始前已 fetch/read：远程 main 为 8c596e971a5923092204cbf1d2eb2c80e2acda9c，尚无同名远程分支/同主题 PR。PR #1（fix/ci-eslint-and-windows-packages）修改 README、Windows使用说明、library-components.test.ts；本工作不合并/改写其分支，最终 PR 明示这些重叠。

## 第1轮：升级失败也不能损坏旧库
- 审查发现：initDb 的多阶段迁移各自提交，后续 seed 失败会留下 earlier hash/version 写入且数据库句柄未关闭。
- 修改：db.ts 将完整升级/种子/任务恢复置于一个事务，失败关闭句柄；deep-rounds.test.ts 用真实 SQLite trigger 注入中途失败，验证迁移标记回滚、旧收藏/授权配置/自备 Key 均保留且可重新打开。
- 回归：`pnpm --filter @zhicang/desktop test`，全部通过（含新失败注入用例），日志 /workspace/zhizang-round-01.log；不是 GUI 验收。仅临时测试库，无用户目录操作。

## 第2轮：导入质量与元数据往返
- 审查发现 CSV 未闭合引号会静默吞入后续行，JSON 往返将 archived/dead 状态及访问时间丢失；BOM/重复导入路径原本可用，不重复发明。
- 修改 import-export.ts：CSV 解析结束前拒绝未闭合引号（任何写入之前），JSON 恢复合法 status/visitedAt；deep-rounds.test.ts 覆盖恶意截断、BOM、多行标题、去重、archived 跨记录往返。
- 回归 `pnpm --filter @zhicang/desktop test` 全通过，/workspace/zhizang-round-02.log。HTML/JSON/CSV 为手动导入，不自动读取用户文件；没有宣称全量 GUI 通过。

## 第3轮：批处理原子性与空操作
- 审查收件箱/多选/回收站恢复链路：已有筛选换页清选、回收站/撤销测试保持；发现批量打标签在事务外建标签，混入失效 ID 时会遗留孤儿标签，空批次也会建标签。
- 修改 db.ts 将标签创建纳入整批事务、空批次不写入、拒绝空白标签。deep-rounds.test.ts 用真实 FK 失败验证整批回滚，验证重复 ID 幂等和原标签保留。
- 回归 `pnpm --filter @zhicang/desktop test` 全通过，/workspace/zhizang-round-03.log；未声称可视撤销交互已重新验收。

## 第4轮：可预测分页与列表查询计划
- 审查发现同毫秒/同标题记录没有 ID 排序键，分页顺序未被 SQL 契约固定；默认列表缺少删除状态+置顶+时间联合排序索引。已有 LIKE 转义/中文笔记回退保留。
- db.ts 添加非破坏性联合索引与 ID tie-breaker；新增同时间两页无重叠/升降序及真实 EXPLAIN QUERY PLAN 索引命中回归。
- 初始并行测试遭共享机器 IO 阻塞（子进程 disk-sleep），只终止本任务测试，未算通过；NODE_OPTIONS 不接受该 Node 参数的尝试亦记失败。改用实际支持的串行命令后全通过：在 apps/desktop 下 `ELECTRON_RUN_AS_NODE=1 TS_NODE_PROJECT=tsconfig.test.json ../../node_modules/electron/dist/electron --require ts-node/register --test --test-concurrency=1 test/*.test.ts`，/workspace/zhizang-round-04.log。后续轮暂用同一串行等价命令，最终统一修正测试入口；没有给并发写入期间 OFFSET 分页作快照一致性承诺。

## 第5轮：阅读真实失败与相对资源
- 审查发现 404/500 页面会作为成功正文缓存，PDF 等非网页响应被当 HTML；重定向后相对图片/链接仍以旧站点根目录解析。
- enrich.ts 明确校验 HTTP 状态/内容类型，以最终文档 URL 为相对资源基准；可注入 transport 以隔离网络回归。deep-rounds.test.ts 验证 404、PDF、跨源重定向后的文章目录相对链接与标题。
- 第4轮串行等价测试命令全通过，/workspace/zhizang-round-05.log。响应夹具不是实际外站/GUI 验收；保留现有错误提示、外部打开与离线阅读兜底。

## 第6轮：笔记在途清空也要可恢复
- 审查 NoteDraft 的 SQLite CAS/冲突/引用复用：已有版本冲突与切换保护保留；发现先保存 A、请求未返回时清空至旧 base，会提前删除本机草稿；若此刻崩溃，A 可能提交而清空意图丢失。
- note-draft.ts 在请求在途时即使 text==旧 base 也保留草稿，全部串行 CAS 结束才清理。deep-rounds.test.ts 用 Promise 屏障+真实 SQLite 保存验证清空意图持久化、两次 CAS、最终空笔记与草稿清理。
- 第4轮串行等价完整桌面测试通过，/workspace/zhizang-round-06.log；没有模拟成用户真的崩溃重启或可视编辑器已验收。

## 第7轮：超过 5000 条也完整同步，时钟与永久删除不再漏数
- 审查发现：服务端 take 5000 后却返回墙钟高水位，客户端把服务端时钟当本地上传游标；大批上传超过请求体默认 100KB；旧硬删除没有持久墓碑，完整拉取会复活已清空记录。
- 改 shared/types、backend sync.service/controller/main、desktop sync/sync-account/db：协商协议2，按 urlHash keyset 分页（每页最多500），上传按500条/1MB双重拆分，显式2MB服务端JSON上限；完整按键遍历避免把不可信客户端时间当服务端分页游标。上传本地截止时间独立且重叠1ms、时钟回退重扫、单飞防并行、每页继续校验账号/服务地址及分页进度。服务端事务+队列防止 SQL.js 写批次交错；旧协议遇截断/新版最小墓碑明确拒绝而非伪成功。
- 本地永久删除只留下 urlHash+时间两列墓碑，无 URL/标题/笔记/Key；重新收藏可覆盖旧墓碑；全量拉取不复活旧删除。未删除既有用户表或配置。
- 新增/更新 deep-rounds、open-source、backend/sync 单测与真实 desktop-cloud-smoke：两份独立 Electron/SQLite 库经实际 Nest/SQL.js HTTP 往返5005+条，未来服务器时间不影响后续上传，永久删除跨端/重启不复活。最初真实 E2E 报413后查明默认100KB瓶颈并修复，未把失败计通过。
- `pnpm build:shared`、`pnpm typecheck`、backend 单测、串行全部桌面测试通过（round-07*.log）；`pnpm test:backend:e2e`最终通过（/workspace/zhizang-round-07-e2e.log）。规模夹具将临时服务全局配额设500，不是默认限流/负载测试，生产默认120不变，认证仍真实执行。
- 边界：协议2要求客户端与自托管服务一起升级；目前每轮全量分页拉取，以带宽换正确性，不冒称增量服务端变更日志。LWW 对真实设备时钟偏差、同毫秒冲突仍有固有限制；多进程/高并发 SaaS 不在 SQL.js 小型自托管保证范围。
