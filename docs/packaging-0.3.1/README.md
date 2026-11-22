# 0.3.1 打包修复与续测断点

## 根因与最小修改

旧Setup真Windows失败：2026-11-22 22:30:10 Asia/Shanghai，System.dll+0x1581，c0000005；退出-1073741819。见原始事件/命令记录`windows-0.3.0-original-crash.txt`。fresh per-user路径尚无安装目录/注册记录，在multiUser.nsh取LocalAppDataPrograms时，旧`System::Call '*$2(&w${NSIS_MAX_STRLEN} .s)'`固定宽度读取OS分配的NUL结尾缓冲区，可能越界。上游对应修复：https://github.com/electron-userland/electron-builder/pull/9769 。

锁定electron-builder24.13.3，仅回移该模板有界`KERNEL32::lstrcpynW`和非空CoTaskMemFree/寄存器保存；保留fallback、per-user/all-user和原身份。没有伪注册、提权allusers或关闭安全策略。`patches/app-builder-lib@24.13.3.patch`由pnpm.patchedDependencies和lock固化；`assert-windows-packaging.mjs`核对真实解析的传递依赖模板精确hash，并作为dist:win/dist前置守卫。实际`pnpm patch ... --edit-dir`重放后hash一致，见PNPM-PATCH-REPRODUCIBILITY.json。**这是源码/构建级修复证据，尚不是新安装器实机修复通过。**

## 构建与回归

79项测试（shared5/backend8/desktop61/packaging5），desktop lint/typecheck、打包脚本lint、完整main/preload/最新renderer与Chrome/Firefox构建通过。打包日志windows-build-0.3.1.log，47.4秒exit0。命令为electron-builder --win nsis portable --x64 --publish never -c.npmRebuild=false，私有Wine前缀仅作rcedit构建工具。Windows SQLite来自同Electron31.7.7/ABI125/相同依赖的0.3.0正式产物，已真Windows加载，其sha256为cd436f5af1781f2c234a1259ed4ae30a9e7022a51eb29b74c8093a29a06e0ae3；新包再次检验PE/x64/ABI和ASAR内所有新构建文件一致。退出trap恢复Linux native原hash，并以真实Electron内存库integrity_check验证，不把Win模块留给Linux。

CMD使用ASCII/CRLF、%~dp0引号、禁延迟展开、自带WindowsPowerShell绝对路径、显式导入自身标准模块，严格零退出码；不自动安装、不删分卷、不改执行策略。SPLIT-VERIFICATION.json为整83,939,318字节真实拼接与逐字节相等结果，不是小样本代替。

## Windows续测（未执行）

具体阻塞见WINDOWS-BLOCKER.json。官方工具已传完11个8MB运输片到C:\Users\Administrator\ZhiCang-E2E-Packets-031-20261122-2330；尚无合并/运行新Setup的返回证据，不应盲目重复执行。不能推断所有挂起命令已经执行，也不要重复排队安装。

等桌面本机执行恢复连接后：先核对三个自有诊断作业和旧0.3.0测试进程身份；只读查看当前注册/未知同名进程。把`Test-Setup-0.3.1.ps1`经CopyFromBox传到该C目录。脚本只在已授权E任务根的新v031子目录测试，已有v031/任何安装身份/未知同名进程/已有智藏快捷方式均中止，绝不覆盖旧库。它将验证安装SHA、正常静默Setup/S/currentuser及最后/D=独立绝对路径、exit0/文件版本/真实注册、私有ZHICANG_USER_DATA_DIR和TEMP、两次真实启动/SQLite/owned-loopback38121/ping版本/未鉴权401、仅自有进程停止、原生卸载/登记移除/库保留。脚本避免WMI，正常启动EXE，不驱动GUI、不篡改门禁/授权/令牌。结果写入C目录WINDOWS-031-LIFECYCLE.json；若失败保留证据，不自动重试，不强杀安装器。该脚本目前仅静态核查，未在Windows解析执行，后续仍需准确验证。

不要以该基础设施脚本代替Windows人工收藏/编辑/笔记/备份恢复GUI；不要把portable载荷通过当Setup安装成功。Windows签名/真实升级/线上商业服务仍未完成。父会话应先处理电脑重新上线；公开论坛重启桌面App建议仅为通用参考，不是已知本次根因。

连接补充：23:47:49 Asia/Shanghai最小Console命令曾返回exit0；随后仅一次受限安装生命周期诊断调用报临时不可达，结果文件未找到；后续只读状态查询也报不可达。当前不能判定该请求是否实际执行。恢复后应先读C测试目录WINDOWS-031-LIFECYCLE.json并核对v031目录/进程，不盲目重跑；详见WINDOWS-BLOCKER.json。
