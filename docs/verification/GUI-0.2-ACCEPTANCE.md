# 0.2.0 新增 GUI 验收 · 最终记录

最终确认时间：2026-11-22T19:36:48.357979+08:00（Asia/Shanghai，UTC+8）。状态：以下限定范围由父会话 computerUse 实际操作通过；执行者另只读核验隔离备份/最终库与进程清理。仅更新文档、证据和源码交付包，Windows EXE 未修改，未扩大自动测试范围。

## 已实际通过

- 原试用入口后完成首次向导，可跳过可选服务并打开设置。
- 设置显示正确隔离数据目录 `/workspace/zhicang-gui-v020-20261122/profile`。
- 默认更新关闭；点击检查后 loading 结束，并明确未配置更新源。
- 保存 `https://example.com`，标题“备份前A”；通过原生保存对话框创建 `/workspace/zhicang-gui-v020-20261122/gui-backup.zhicang`。
- 新增 `https://example.org`，标题“恢复后应消失B”；通过原生文件/确认对话框恢复，应用自动重启后 A 在、B 消失；向导与授权/试用门禁不重复出现。
- 无 Key 的连接测试明确提示“请填写API Key与模型名称”，未模拟模型成功。
- 桥接 38122 占用准确报错，38123 保存成功；重置 token 提示重启生效。
- 手动关闭不会自动重开是正常退出，不是故障。父会话另行启动 PID 1048000，最终复核通过：直接进入工作台，无重复门禁/向导，仅 A 保留、B 不在；端口 38123 持久化，桥接开启并显示“桥接正在运行”，令牌遮蔽；云同步明确提示本地模式需先激活，不伪造成功。验收完成后按父会话要求仅正常结束其 GUI 主进程 1048004；启动器 1048000 和全部已确认子进程均已退出，详见 GUI-0.2-CLEANUP.json。

## 备份文件独立核验（执行者，只读）

已核验原备份与恢复前自动安全副本都实际存在，均为 114688 字节，`PRAGMA integrity_check` 为 `ok`，`PRAGMA foreign_key_check` 为零行。原备份仅含 A，安全副本含 A+B，符合恢复前自动保护与恢复后回退的真实证据。

- 原备份：`/workspace/zhicang-gui-v020-20261122/gui-backup.zhicang`
- 安全副本：`/workspace/zhicang-gui-v020-20261122/profile/backups/before-restore-1795347038287.zhicang`
- 完整表结构与哈希/标题检查见 `GUI-0.2-BACKUP-CHECK.json`。没有读取或导出数据库中的设置/API Key/token。

## 截图

原始 WebP 已逐字节复制到 `docs/screenshots/`；来源、大小与 SHA256 见 `GUI-0.2-SCREENSHOTS.json`。

1. 首次运行向导-0.2验收.webp
2. 设置与数据目录-0.2验收.webp
3. 完整备份恢复后仅A保留-0.2验收.webp
4. 无Key连接测试明确报错-0.2验收.webp
5. 重启后桥接端口持久化-0.2验收.webp
6. 重启后工作台仅A保留-0.2验收.webp

## 保留限制

本次为 Linux 编译产物在隔离库中的 GUI 交互，不是 Windows 安装版/便携版实机运行，不是线上模型、支付、授权或多设备云同步验收。Windows 实际运行、签名和线上服务等限制继续保留。最终隔离库已只读复核：仅 A、桥接端口 38123、开启状态持久化（GUI-0.2-FINAL-STATE.json）；没有读取 token/API Key 内容。手动关闭不自动重开为正常行为。
