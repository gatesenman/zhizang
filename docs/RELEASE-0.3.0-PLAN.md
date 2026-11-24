> 本文为 0.4.0 前的历史设计/验收记录，不代表当前开源版功能或验证状态；当前版见 [OPEN-SOURCE-0.4.0.md](./OPEN-SOURCE-0.4.0.md)。

> 本计划已完成：GUI收口，0.3.0全构建/63测试及新Windows工件检查通过，Linux原生模块恢复校验通过。独立Wine前缀12.8秒创建；自定义TMPDIR故障已定位，恢复标准/tmp完成构建。Wine启动尝试不计Windows通过，私有前缀已清理。最终结论以`VERIFICATION.json`为准。以下为原阶段计划。

# 0.3.0打包与回退方案（已执行，保留计划与回退记录）

## 状态和版本

- 本轮主线桌面A/B已由父computerUse实际通过；当前Chrome扩展GUI仍进行。
- 活动桌面与Chrome、测试库、Linux原生模块均不触碰。当前源码元信息尚是0.2.0/扩展0.1.0，**不以该名字发布本轮功能**。
- 最终阶段将桌面`apps/desktop/package.json`版本升0.3.0；修改过的扩展`package.json`、Chrome/Firefox两个manifest同时升0.3.0。其他未改工作区包保持各自版本，根工作区版本不冒充桌面发布版本。
- 正式新文件明确命名`ZhiCang-Setup-0.3.0-x64.exe`、`ZhiCang-Portable-0.3.0-x64.exe`、`ZhiCang-Source-0.3.0.zip`、`ZhiCang-Chrome-0.3.0.zip`、`ZhiCang-Firefox-0.3.0.zip`，单列正式`0.3.0/`交付目录，保留旧0.2.0已发产物及原上传ZIP。新分卷脚本内文件名/预期SHA256须重新生成，不能沿用旧值。

## 安全次序

1. 收齐桌面/Chrome实际验收结果和截图，记录范围；修正中文小项目前仅改源码，未刷新活动GUI。
2. 由父确认GUI结束后才结束本任务GUI/扩展进程，不碰其他服务。先保存当前Linux SQLite原生模块的私有备份及SHA256（已有`/workspace/zhicang-build-tools/better_sqlite3-linux-electron125.node`，仍要与当前模块比对），避免Windows rebuild后遗留PE模块。
3. 在shell包装中设置EXIT trap/finally，无论成功失败都恢复原Linux模块并验证SHA256和Electron ABI125内存库查询；严禁让仍运行的LinuxGUI同时加载/覆盖Windows模块。不要用链接到活动node_modules的所谓隔离副本执行rebuild。
4. 执行最终lint/typecheck/全测试；元信息升版后构建桌面与扩展。Windows打包使用`--publish never`，不开上传/签名账户、不部署。
5. 本机Wine10的64/32位依赖已装，未初始化新前缀。优先做一次短时、普通的任务私有前缀可用性检查，时间预算不超过60秒；失败保留原始日志，不长时间折腾或下载替代环境。
6. 验证新版真实PE/ASAR/SQLite原生机器类型、ASAR与本轮构建哈希、`7za test`、版本/文件名、分卷二进制重组与SHA256。Windows实机未运行和未签名仍如实标注，不能以静态检查替代运行/安装验收。
7. 校验完成才把新附件逐个拷贝正式持久目录。保留旧附件，不用内存盘当正式交付。最后记录新SHA256及体积，更新运行说明和覆盖矩阵；本次GUI不能推导支付/线上服务通过。

## 空间证据与约束

本任务已回收321392640字节（两个31.7.7缓存移至内存盘、一个105.5MB完全重复临时下载删除），记录在`/workspace/zhicang-mainline-review-20261122/owned-cache-reclamation.json`。所有其他agent文件/共享Wine前缀/已发附件/当前node_modules/真实模型和测试库保留。

共享根盘空闲在106–501MiB之间快速波动，刚才约295MiB，不能保证其他任务不继续占用。`/dev/shm`约7.4GiB空闲，可放ZIP、静态解包、编译输出和安装器暂存；有效`noexec`，Linux原生执行工具仍须在原可执行文件系统，Wine前缀在此是否可用尚未实际验证，绝不为此remount或绕过保护。

Windows完整前缀可能需要GiB级空间；现有全局`/home/box/.wine`约3.4GiB且有早于本任务的会话，禁止复用、移动或清理。若短时私有前缀失败，则记录实际错误/磁盘数值并请父协调容量；不能声称空间已经保证、不能伪造新版或发送旧包冒充。若可用，尽量把生成安装器/静态临时内容放任务内存盘目录，减少根盘高水位，打包期间监测内存和空间。

本机可继续正常开发/GUI验收；当前未重新编译/打包Windows、未换Linux原生模块、未启动新的Wine窗口。
