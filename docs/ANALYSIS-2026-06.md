> 本文为 0.4.0 前的历史设计/验收记录，不代表当前开源版功能或验证状态；当前版见 [OPEN-SOURCE-0.4.0.md](./OPEN-SOURCE-0.4.0.md)。

# 智藏 ZhiCang · 现状分析与上市差距评估

> 评估时间：2026-06 · 评估方式：通读 wiki + 全量源码，并实际安装、构建、启动后端做端到端冒烟测试。

## 一、结论速览

项目**完成度很高**，是一个结构完整的商业化桌面产品（桌面端 + 后端授权服务 + 付费门户 + 浏览器插件 + MCP）。我已实测：

- 6 个子包（desktop / backend / portal / extension / mcp / shared）**全部构建 / 类型检查通过**。
- 后端可启动（无 PostgreSQL 时自动回退 SQLite），启动即自动播种 3 档定价产品（月版 ¥18 / 年版 ¥99 / 终身版 ¥299）。
- **完整购买→授权链路实测打通**：`下单 → mock 收银台确认支付 → 订单变 paid → 生成激活码（绑邮箱）→ 桌面端用 邮箱+激活码 激活 → 返回 RS256 签名许可证 JWT`。邮箱不匹配会被正确拒绝、设备数上限有校验。

也就是说：**核心功能闭环已经成立，但要真正"上市收钱 + 可持续运营"，还差几块关键拼图**——主要在**真实支付履约、发布工程（自动更新/签名）、质量保障（测试/lint/CI）、安全合规**这几个方向。

---

## 二、已完成且实测可用的能力

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| 桌面端收藏管理 | ✔ | 列表/卡片双视图、FTS5 全文搜索、分类树、标签、星标/稍后读/置顶、回收站、批量操作、命令面板 Ctrl+K |
| AI 富化 | ✔ | 抓取标题/描述/图标/正文摘要；可选 LLM（OpenAI 兼容，预置 DeepSeek/通义/智谱）生成描述/标签/分类；无 Key 自动降级 |
| 知识图谱 / 语义检索 | ✔ | 本地力导向图；嵌入三模式（关键词/本地 transformers.js/API），本地存储 |
| 存档/导入导出 | ✔ | 完整静态化存档（图片内联 data URI 离线可读）；HTML/JSON/CSV/YAML 互通；失效链接检测、去重合并、智能文件夹 |
| 后端授权 | ✔ 实测 | 激活码 + 设备绑定 + RS256 许可证签发；离线宽限（exp 本地验签） |
| 后端商业化 | ✔ 实测(mock) | 产品/订单/支付(mock)/邮件(console)/云同步/可配置后台；JWT 鉴权、admin 守卫 |
| 付费门户 | ✔ | Next.js 定价页 + 支付结果页 + 后台管理页 |
| 浏览器插件 | ✔ | Chrome MV3 / Firefox MV2，经本地桥接 127.0.0.1:38121 入库 |
| MCP | ✔ | search/add/get_content/list_recent 工具 |

---

## 三、未完成 / 不完整功能清单（按代码证据）

### A. 支付与履约 —— 上市最关键阻塞项 🔴

1. **Stripe 没有 webhook 回调（真实支付无法自动履约）。**
   - `StripeProvider.createCheckout()` 已实现创建 Checkout Session（`apps/backend/src/payment/providers.ts:29`），但**全仓库没有任何 webhook 路由**（`payment.controller.ts` 只有 mock 路由）。
   - 而设置项里**已预留** `payment.stripe.webhookSecret`（`settings.service.ts:15`），说明设计上本应有 webhook，但从未实现。
   - 后果：真实用户用 Stripe 付款成功后，订单**不会变 paid、不会生成激活码、不会发邮件**——只有 mock 通道调用了 `fulfill()`。
2. **支付宝 / 微信支付是纯占位**：`AlipayProvider` / `WechatProvider` 直接 `throw new Error('…待接入')`（`providers.ts:60, 69`）。
3. 无**退款 / 对账 / webhook 幂等**处理。

### B. 质量保障 🟠

4. **全仓库零自动化测试**（无任何 `*.test.*` / `*.spec.*`）。
5. **几乎没有 lint**：仅 `apps/portal` 有 `lint` 脚本（`next lint`），且**没有任何 eslint 配置文件**；backend/desktop/shared/extension/mcp 都没有 lint 脚本。根 `pnpm lint`（`-r --if-present`）实际只触发 portal。
6. **CI 只打包不校验**：`.github/workflows/release.yml` 仅在打 tag 时构建三端安装包，没有跑构建/类型检查/测试/lint 的 PR 校验流水线。

### C. 桌面端发布工程 🟠

7. **无自动更新**（无 `electron-updater` / `autoUpdater`）——用户装了之后无法平滑升级到新版本。
8. **产物未签名**：macOS 为未签名 zip（非 notarized dmg，首次打开需手动去隔离），Windows 未签名（SmartScreen 警告）。
9. 本次环境中 `electron-builder install-app-deps` 这个 postinstall **报错失败**（pnpm hoisted + electron 版本探测问题）；不影响 dev/构建，但**影响一键打包可靠性**，需固化。

### D. 后端安全 / 运维 🟠

10. **公网端点无限流**（login / activate / checkout 无 `Throttler`），无 `helmet` 安全头——易被刷。
11. **本地桥接无鉴权**：`bridge.ts` 对 127.0.0.1 开放且 CORS `*`、无 origin 校验、无 token——用户浏览的任意网页 JS 都能向 `127.0.0.1:38121/api/capture` 写入收藏（CSRF 类风险）。
12. **admin 引导风险**：「首个注册用户自动成为 admin」（`auth.service.ts:32`），生产环境需收紧。
13. 无**结构化日志 / 错误上报（Sentry）/ 指标 / 就绪探针**。

### E. 合规 / 商务（面向 CNY 定价、国内上市）🟠

14. 门户缺**隐私政策 / 用户协议(EULA) / 退款政策 / ICP 备案**信息页——应用商店上架与支付渠道签约通常强制要求。
15. **许可证私钥生产化**：`keys/*.pem` 不入库（正确），但需在部署/CI 侧安全注入并保管。

### F. 其他 🟡

16. **仅中文 UI**：若只面向国内可接受；若要国际化上市需 i18n。

---

## 四、上市优先级建议（P0 → P2）

### P0（不做就不能真正卖 / 不能交付）
- **P0-1 Stripe webhook + 真实支付履约闭环**：新增 `POST /api/payment/webhook/stripe`，校验签名（用已预留的 `webhookSecret`），处理 `checkout.session.completed` → 调 `fulfill()`（生成码 + 发邮件），幂等防重。这是把"演示"变成"能收钱"的关键一步，且代码骨架已就位，改动可控。
- **P0-2 最小 CI 校验流水线**：PR 触发 `build + typecheck`（+ 现有 lint），保证后续改动不破坏构建。
- **P0-3 后端基础加固**：登录/激活/下单限流 + helmet 安全头。

### P1（上市质量 / 可运营）
- 桌面端自动更新（electron-updater）+ 发布通道。
- 本地桥接加 token 鉴权 / origin 校验。
- 关键路径补单元/集成测试（许可签发与校验、支付履约、FTS 查询）。
- 全仓库统一 eslint + lint 脚本。
- 门户补隐私政策 / EULA / 退款政策页。

### P2（增强 / 锦上添花）
- 支付宝 / 微信支付真实接入。
- 错误上报（Sentry）+ 结构化日志 + 指标。
- i18n（如需国际化）。
- 三端代码签名 / 公证。

---

## 五、需要你确认的几个问题

1. **本次先做哪一档？** 建议先做 **P0 全部**（尤其 P0-1 支付履约闭环），这是"可上市"的硬门槛。是否同意？
2. **支付渠道主推哪个？** Stripe（海外/信用卡）/ 支付宝 / 微信？（建议先把 Stripe webhook 做完整作为范式，其余按需接入。）
3. **目标市场？** 仅国内（CNY，需备案 + 合规页）还是同时海外（需 i18n + Stripe）？
4. **代码托管 / 交付方式？** 本项目当前**不是 git 仓库**。要不要我建 Git 仓库并以 PR 方式提交改动（便于 review 与 CI），还是只交付源码 zip + 安装包？
5. **默认 LLM 供应商**用哪个预设（DeepSeek/通义/智谱/OpenAI）作为出厂默认？

> 注：按本仓库 `AGENTS.md` 约定，我做的任何代码改动都会**同步更新 `wiki/` 对应页面**。
