# 智藏 ZhiCang 0.3.1 · Windows 使用说明

预编译安装包下载（GitHub，tag `windows-0.3.1`，避免误触发 `v*` Release 工作流）：

- [ZhiCang-Setup-0.3.1-x64.exe](https://github.com/gatesenman/zhizang/releases/download/windows-0.3.1/ZhiCang-Setup-0.3.1-x64.exe)（83,939,318 字节，SHA256 `16b67174821c252df11e4e8168dd7c42b3468e2016f6f5baa9ee9634084a4db9`）
- [ZhiCang-Portable-0.3.1-x64.exe](https://github.com/gatesenman/zhizang/releases/download/windows-0.3.1/ZhiCang-Portable-0.3.1-x64.exe)（83,721,481 字节，SHA256 `414c68aee3c4cc4e38fe2dfb7753f762a04222ca73e80254c15185d24e158ccb`）

发行页：https://github.com/gatesenman/zhizang/releases/tag/windows-0.3.1


## 本版状态（请先看）

本版包含最新内容区布局、按需展开详情、稳定批量操作、折叠笔记，以及 NSIS 上游安全字符串读取补丁。安装 EXE/便携 EXE 均为本次真实新构建，不是旧包改名。

**这是待完成 Windows 安装回归的候选交付，不是“全部端到端验收通过”。** 原 0.3.0 Setup 在真实 Windows 11 Insider 10.0.27902 上发生 System.dll+0x1581 / 0xC0000005，不能推荐继续用旧 Setup。0.3.1 已将 electron-builder PR9769 的有界读取补丁锁定到依赖和 pnpm lock；构建、补丁重放、79 项测试及归档检查通过，但本轮Windows命令通道无返回后离线；短暂恢复后受限诊断调用又报临时不可达，新Setup尚无实机执行结果。0.3.0 portable 曾在同一真 Windows 启动并通过 SQLite/桥接基础检查，这不等于0.3.1 Setup通过。

Windows 10/11 x64 是目标，当前新版本未完成实机兼容矩阵。EXE **未签名**；不关闭杀软、不更改安全策略，遇系统阻止请停止并保留错误。不需要安装 Node/pnpm 来使用成品。

## 安装包四分卷

将下面 **5 个文件放在同一目录**（可含中文、空格，不改名）：

- `ZhiCangSetup-0.3.1.part01`
- `ZhiCangSetup-0.3.1.part02`
- `ZhiCangSetup-0.3.1.part03`
- `ZhiCangSetup-0.3.1.part04`
- `JoinSetup-0.3.1.cmd`

双击 CMD，按二进制合并并用 Windows 自带 PowerShell 验证 SHA256。脚本已为 Windows PowerShell 5.1 显式加载自身标准模块，避免继承 PowerShell 7 模块路径导致找不到 Get-FileHash；仅零退出码算成功。脚本 **不启动安装、不删除分卷、不改执行策略**。已有同名 EXE 只核验、不覆盖；错误文件需先自行移走再重试。缺片/哈希错误时不要运行 EXE。脚本 ASCII/CRLF；Linux真实拼接与哈希通过，**新版CMD尚未在Windows执行**。

得到：`ZhiCang-Setup-0.3.1-x64.exe`（83,939,318 字节）

SHA256：`16b67174821c252df11e4e8168dd7c42b3468e2016f6f5baa9ee9634084a4db9`

有完整 EXE 则不需要分卷。便携版 `ZhiCang-Portable-0.3.1-x64.exe` 独立提供，未另分卷。不要混用0.3.0/0.2.0分卷。

## 首次使用与日常主线

1. 试用进入本地模式；首次分类/可选服务向导可以跳过。本地收藏无需支付、AI Key、云服务或伪造许可证。
2. Ctrl+N 收藏 HTTP/HTTPS；可手工标题、标签/目录。重复定位原项且保留原数据，回收站项需明确恢复；多 URL 用批量粘贴。
3. 未分类进入待整理收件箱；批量移动目录/打标签。当前范围/筛选摘要可见，范围无结果可扩大搜索。无选中时列表全宽，有选中才展开详情，关闭可回列表。
4. 笔记可折叠，自动保存仍工作；看到已保存再切换/复制带来源的引用。Ctrl+Enter可立即保存；键盘Tab/Space可勾选收藏。
5. 回收站可恢复；永久删除确认后仅删除所选，不清空其他收藏。

实际数据路径以 设置→通用→数据目录 为准。安装版使用当前用户应用数据目录；便携版默认EXE旁的`ZhiCang-data`，迁移要连同该目录一起，不能只移动EXE。测试通过`ZHICANG_USER_DATA_DIR`将数据库和session隔离，不应把测试启动环境作为永久安装配置。

## 迁移与完整备份

- JSON v2 用于交换收藏/目录/标签/笔记/状态，不包含离线正文、Key、许可证/全设置；重复 URL 跳过。URL只规范协议和域名大小写，路径/查询/片段保留大小写。
- 设置→通用 创建完整`.zhicang`备份，包含离线内容和设置，也可能包含API Key；请保密。
- 恢复会先校验、明确确认，覆盖前自动保存`backups/before-restore-*`安全副本，再重启。损坏备份拒绝、替换失败回滚已有真实SQLite测试；原生对话框/重启保留已有Linux GUI验收，不冒充Windows GUI通过。

## AI、扩展、云服务

- 无模型时助手明确本地关键词模式，不伪造总结。AI是可选增强；开启时填写兼容服务Base URL、模型ID和Key，在应用内真实测试连接；不要把秘密发聊天/日志。已有真实本地小模型推理验证属于上一轮证据，不是供应商中文质量/收费验收。
- 解压`ZhiCang-Chrome-0.3.1.zip`，开发者模式加载；Firefox临时加载见扩展README，正式持久安装仍需签名。桌面设置→网络服务开启桥接，扩展填写同端口及令牌并测试。仅ping不算鉴权成功；改端口/重置令牌后同步扩展配置。前轮真实Chrome GUI收藏正文、重复、错误令牌、断线、端口切换、令牌轮换均通过；本轮未重做Windows浏览器GUI。
- MCP见`apps/mcp/README.md`，仅监听本机；不要公开令牌或把桥接暴露公网。
- 生产激活/多设备云同步保留原商业设计，需要发行方服务地址、匹配内置公钥的签名服务及真实授权。个人本地主线不需要这些。支付商户、SMTP、在线AI、真实自动更新源均是可选商业/外部服务，交付不冒充已开通。更新默认关闭；没有真实HTTPS更新资源不启用，不留不可用伪默认。

## 验证范围

本轮：shared5/backend8/desktop61 + packaging5 = **79项通过**；desktop lint/typecheck、主进程/预加载/最新renderer生产构建、双扩展构建、x64 SQLite ABI125/ASAR逐文件和7zip完整性通过；Linux打包后SQLite原生恢复并实际加载通过。Linux GUI新增布局已人工通过，实际约886×594及前轮最大化1280×800；未精测1024×645/1440，也未测空回收站批量。

尚欠：0.3.1真Windows安装/运行/卸载/升级与CMD执行；Windows逐按钮收藏/笔记/备份恢复GUI；签名、正式Firefox安装、线上模型/支付/邮件/生产授权/多设备同步/更新发布。不能称“商业全部验收”。见同目录`VERIFICATION.json`、`功能覆盖与验证矩阵.md`及源码`docs/packaging-0.3.1/`。

连接补充：23:47:49 Asia/Shanghai最小Console命令曾返回exit0；随后仅一次受限安装生命周期诊断调用报临时不可达，结果文件未找到；后续只读状态查询也报不可达。当前不能判定该请求是否实际执行。恢复后应先读C测试目录WINDOWS-031-LIFECYCLE.json并核对v031目录/进程，不盲目重跑；详见WINDOWS-BLOCKER.json。
