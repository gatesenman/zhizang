# 主线优化覆盖矩阵· 0.3.0正式构建

| 用户任务 | 已实现的真实变化 | 自动/集成验证 | 本轮 GUI |
|---|---|---|---|
| 快速收藏 | URL校验、明确存放位置；已有项定位；回收站必须明确恢复、保留原标题/笔记/标签 | 真实SQLite、捕获服务、store受控IPC；路径大小写/重复/回收站通过 | 已通过（父实际computerUse桌面A/B） |
| 整理 | 待整理收件箱及计数；当前页批量选择与整理反馈；标签计数不再含回收站 | SQLite筛选/计数/恢复通过；批量操作错误反馈已实现 | 已通过（父实际computerUse桌面A/B） |
| 找回 | 可移除条件摘要、清除/全库检索；准确空态；筛选清空旧多选；域名精确主机匹配 | 实库筛选/域名欺骗边界/智能条件交集与store测试通过 | 已通过（父实际computerUse桌面A/B） |
| 阅读 | 行内自动保存笔记、持久草稿/失败重试/冲突提示/快速切换不串写；慢抓取不覆盖人工修改 | NoteDraft对真实SQLite并发/失败/重试/CAS通过；元信息策略单元回归通过 | 已通过（父实际computerUse桌面A/B） |
| 复用 | 笔记与真实来源Markdown复制；助手引用键盘可达、跨筛选定位；无AI也可用 | 引用格式/定位store/关键词和引用编号守门通过 | 已通过（父实际computerUse桌面A/B） |
| 备份边界 | 损坏/截断拒绝；替换中途写失败可从安全副本回滚 | 5000条实库、跨库JSON往返、实际文件故障注入回滚通过；上轮原生备份GUI已过 | 新主线无原生备份改动，保留上轮记录 |
| MCP | 真SDK stdio→本地HTTP鉴权→实库/正文 | 收藏/去重/搜索/真实离线内容、断线/端口和令牌变化通过 | 无MCP GUI需求 |
| 浏览器扩展 | 修复vundefined、明确鉴权错误、单次/批量10s提交超时 | 原common.js在Node VM执行到真实桥接/实库通过；仅storage为替身，非浏览器GUI | 已通过（父实际Chrome扩展GUI） |
| 真实AI | 本机CPU小模型真实推理；无效编号拒绝展示并降级；服务离线不阻断主线 | Electron net.fetch→llama.cpp→SQLite引用链通过；实际模型确曾编造[2]/[3]，守门后回退 | 可用本机模型GUI复测；不代表生产中文质量 |
| Windows/线上服务 | 保留原商业设计，无外部假成功 | 新0.3.0 Setup/Portable真实重建，PE/x64/ABI125/全部ASAR构建文件/归档/分卷核验通过；Wine尝试未接受为运行通过 | 未验；未签名；支付/邮件/线上激活/同步/更新需合法配置 |

63项测试（shared5/backend8/desktop50）全通过；lint、类型检查、桌面/双浏览器扩展构建、后端真实HTTP E2E、真实本地模型测试通过。证据：`verification/MAINLINE-VERIFICATION.json`、`mainline-tests.log`、`mainline-backend-e2e.log`、`REAL-MODEL-E2E.json`、`real-model-e2e.log`；最终全工作区构建输出`verification/build-all-0.3.0.log`，检查链`verification/final-checks-0.3.0.log`。GUI清单：`MAINLINE-GUI-ACCEPTANCE.md`。

正式本轮文件全部以0.3.0新名存入独立目录；旧0.2.0附件保留但不是新版。桌面A/B和Chrome已实际通过；本地化小改已由自动回归与最终编译包核对覆盖，未另称视觉复验。Windows实机仍未测。
