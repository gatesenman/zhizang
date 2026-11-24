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
