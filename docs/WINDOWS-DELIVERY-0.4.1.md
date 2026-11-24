# 0.4.1 Windows 构建与交付补丁

## 原因与有边界的修复

- 旧 run [45338021858](https://github.com/gatesenman/zhizang/actions/runs/45338021858) 的 `windows-latest` 实际是 `windows-2025-vs2026`，image `20261116.315.1`。pnpm 9.15.1 内置 node-gyp 10.2.0 无法识别 VS18。
- 官方 [Windows2022 镜像清单](https://github.com/actions/runner-images/blob/main/images/windows/Windows2022-Readme.md) 仍提供 VS2022 17.14。仅固定 Windows 为 `windows-2022`，显式 `--x64`，保留 pnpm 版本与 frozen lockfile，不为打包改变业务依赖。镜像补丁会更新，不冒称位级可复现。
- 根目录与 desktop package 补充标准 repository 元数据，修复 CI 下 builder 仓库自动探测失败。
- workflow 显式 `--publish never` 并移除不需要的 GH_TOKEN 环境；仅上传 Actions artifacts，不创建 Release/标签，不更改权限。
- 原 native `postinstall` / `beforePack` 保留，增加精确 NSIS 模板守卫；未跳过安装脚本或原生重建。

## 真实 Windows smoke

`node scripts/smoke-windows-package.mjs` 只能在 Windows 运行。检查 Electron payload 的 PE AMD64、NSIS stub 的合法 PE、准确 app/Electron/SQLite 版本；在 CI 自己创建的独立 TEMP 中通过打包后的 Electron `ELECTRON_RUN_AS_NODE=1` 加载 app.asar 内的 better-sqlite3，执行中文写入、关闭重开、读回与 integrity_check。任何子进程错误/超时/非零退出或缺失结果均失败。只清理自己创建的唯一 TEMP。

产出 `BUILD-PROVENANCE.json`：包含运行 commit、workflow URL、安装 EXE 的字节数和 SHA256、native 持久化结果及 NSIS 守卫。上传 artifact 前必须通过 smoke。

这不是运行安装器，也不是桌面 GUI、升级/卸载或签名验收。不会在用户电脑运行、安装或构建。最终交付的源码 ZIP、EXE、manifest 与 SHA256 在仓库外独立交付目录生成，必须对应同一个成功 workflow 的 commit；旧交付目录文件保留。用户旧数据不在构建/清理范围内。

## 回归命令

- `pnpm test:packaging`：包含原 NSIS/分卷安全测试及新增 PE/工作流回归。
- `pnpm lint`；`pnpm typecheck`；`pnpm test:edition`；`pnpm test:security`；`pnpm test:tooling`。
- GitHub 原生 workflow 执行 frozen install、真实 native 重建、编译、NSIS x64 打包和 packaged SQLite smoke。具体实际结果以该提交的 CI 及交付 manifest 为准，不以本说明宣称尚未运行的测试通过。
