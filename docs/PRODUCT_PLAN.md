> 本文为 0.4.0 前的历史设计/验收记录，不代表当前开源版功能或验证状态；当前版见 [OPEN-SOURCE-0.4.0.md](./OPEN-SOURCE-0.4.0.md)。

# 智藏 ZhiCang · AI 驱动的收藏夹管理桌面程序 — 产品与技术总体规划

> 工作代号：**ZhiCang / MarkTree**　|　文档版本：v1.0　|　角色：产品经理 + 架构师 + 前端 + 后端 + 资深收藏夹用户

本规划覆盖：产品定位与角色洞察、功能范围、技术选型、系统架构、数据模型、模块拆解、授权体系、可配置后台、付费门户、里程碑与交付物。下面每一节都标注了对应「角色视角」，方便你看清每个决策背后的考量。

---

## 0. TL;DR（一页看懂）

- **产品**：跨平台桌面端 AI 收藏夹（Windows / macOS / Linux），左侧目录树 + 右侧网页实时预览，列表/卡片双视图，全中文。
- **AI 增强**：自动抓取站点信息（标题/描述/favicon/正文摘要）、自动分类、自动打标签、自动生成描述；大数据量走后台异步队列，UI 不卡。
- **商业化**：注册 + 激活码授权才能使用；配套「付费门户」在线购买激活码；「可配置后台」管理激活码、标签库、以及登录/支付/邮件等可后续配置的能力。
- **技术栈建议**：Electron + React + TypeScript + Vite + SQLite(FTS5)（桌面端）；NestJS + Prisma + PostgreSQL（后端）；Next.js（门户）；Ant Design Pro（后台）。pnpm monorepo 统一管理。
- **交付**：完整源码压缩包 + 三端安装包（exe/dmg/AppImage）。
- **建议先做的 MVP**：桌面端核心（收藏 CRUD + 左目录右网页 + 列表/卡片 + 搜索 + 导入导出）+ AI 富化 + 本地授权校验，后端/门户给可运行骨架，分期完善。

---

## 1. 产品定位与用户洞察（产品经理 + 资深收藏夹用户视角）

### 1.1 目标用户
- 重度信息工作者：研究员、产品/运营、开发者、自媒体、律师/咨询、学生。
- 痛点：浏览器原生收藏夹「只能存 URL + 标题」，无描述、无智能分类、搜不到、跨设备乱、越存越像垃圾场（"收藏=永不再看"）。

### 1.2 资深收藏夹用户的真实诉求（我作为重度用户的清单）
1. **存的时候零负担**：粘贴 URL，剩下的（标题、摘要、分类、标签）AI 自动补全，我只确认。
2. **找得回来**：全文搜索（标题/描述/标签/正文摘要/URL），秒级响应，哪怕几万条。
3. **看得清**：左目录右预览，点一条直接看网页内容，不用来回切浏览器。
4. **不重复**：自动去重（同 URL 提示已存在）。
5. **可迁移**：能从 Chrome/Edge 一键导入，也能随时全量导出（不绑架数据）。
6. **死链可感知**：定期/手动检测链接是否失效。
7. **隐私可控**：数据默认本地，AI 调用用我自己的 Key，可关。

### 1.3 与 Chrome 原生收藏夹的能力对齐 + 增强
| Chrome 原生能力 | 本产品对齐 | 增强 |
|---|---|---|
| 添加书签 / 文件夹 | ✔ 收藏 + 多级目录树 | + AI 自动分类、自动摘要、自动标签 |
| 书签栏 / 拖拽排序 | ✔ 拖拽移动、排序 | + 卡片视图 / 列表视图切换 |
| 搜索书签 | ✔ 关键字搜索 | + 全文检索(FTS5) + 标签/分类过滤 |
| 导入/导出 HTML | ✔ Netscape HTML 导入导出 | + JSON / YAML 分类导入导出 |
| 同步（账号） | 账号登录（后端可配） | + 设备绑定授权、可选云同步（后续） |
| 打开书签 | ✔ 右侧内嵌网页预览 + 外部浏览器打开 | + 站点信息抓取、死链检测 |

---

## 2. 功能范围（PM 拆解，按优先级 P0/P1/P2）

### P0 — MVP 必须（桌面端可独立跑起来卖第一版）
- 收藏 CRUD：新增（粘贴 URL 即可）、编辑、删除、批量操作。
- 目录树：多级分类，系统默认分类「未分类/稍后读/收藏夹」，自定义增删改、拖拽。
- 双视图：列表视图 + 卡片视图（带 favicon/缩略图），可切换。
- 搜索：全文检索 + 分类/标签过滤 + 排序（时间/名称/访问）。
- 左目录右网页：左侧目录树，右侧选中项的网页实时预览 + 元信息面板。
- 导入导出：Chrome 书签 HTML 导入/导出；JSON 全量导入/导出；YAML 分类导入。
- AI 富化（P0 子集）：自动抓站点 meta（title/description/favicon/og:image）+ 调 LLM 出「描述 + 标签 + 建议分类」，单条与批量。
- 大模型配置页：Provider（OpenAI 兼容 / 自定义 baseURL）、API Key、模型名、温度、并发数、开关。
- 授权：注册/登录 + 激活码激活（设备绑定）；未授权进入受限/试用态。
- 大数据量不卡：列表虚拟滚动、分页、SQLite 索引、后台任务队列。

### P1 — 商业闭环
- 付费门户：商品/价格页、下单、在线支付、支付成功自动发激活码到邮箱。
- 可配置后台（Admin）：激活码生成/吊销/查询、标签库维护、分类模板维护、用户与订单查看；登录/支付/邮件等 Provider 的配置化开关。
- 死链检测、自动去重、回收站、标签后台维护与合并。

### P2 — 进阶
- 云同步（端到端可选加密）、多设备、团队空间。
- 浏览器扩展「一键收藏到 ZhiCang」。
- 网页快照（正文/PDF 存档）、全文离线检索。
- AI 智能整理建议（重复/相似聚类、过期清理）。

---

## 3. 技术选型（架构师视角，含取舍理由）

### 3.1 桌面端：**Electron + React + TypeScript + Vite**
- 为什么不是 Tauri：需求「右侧实时预览任意网页」「覆盖 Chrome 全部能力」，Electron 本身即 Chromium，`<webview>`/`BrowserView` 原生内嵌任意网页最稳；Tauri 内嵌外部页面跨平台一致性弱、能力受限。
- 取舍：Electron 包体较大（~100MB+），但换来能力与一致性，对「卖给客户、要稳」更重要。
- 打包：`electron-builder`（Win: NSIS exe / mac: dmg / Linux: AppImage）。

### 3.2 本地存储：**SQLite（better-sqlite3）+ FTS5 全文索引**
- 同步 API、单文件、可承载几十万条；FTS5 做秒级全文搜索；为大数据量准备分页 + 索引 + 虚拟列表。

### 3.3 UI 体系：候选二选一（见第 11 节问题）
- **方案 A（推荐做"快"）**：Ant Design 5 + 自定义 Design Token，内置 zh-CN、组件全、出活快、企业级稳。
- **方案 B（推荐做"美"）**：Tailwind CSS + shadcn/ui(Radix) + 自绘设计系统，更现代/bespoke 的视觉。
- UX 设计语言：明暗双主题、统一圆角/阴影/间距 token、空状态/加载骨架/Toast 反馈、键盘可达性。

### 3.4 后端：**NestJS + Prisma + PostgreSQL**
- 与桌面/门户统一 TypeScript，模块化（auth / license / payment / email / admin），Provider 用策略模式做「配置化、可后插」。
- 部署：Docker Compose（postgres + api + admin + portal）。

### 3.5 门户：**Next.js**（营销页 + 在线购买 + 支付回调）。
### 3.6 后台 Admin：**Ant Design Pro（React）** 或并入 Next.js。

### 3.7 工程化：**pnpm monorepo**
```
zhicang/
├─ apps/
│  ├─ desktop/        # Electron + React 桌面端
│  ├─ backend/        # NestJS API（授权/支付/邮件/后台 API）
│  ├─ admin/          # 可配置后台 Web
│  └─ portal/         # Next.js 付费门户
├─ packages/
│  ├─ shared/         # 共享类型、激活码/许可证签名验签、协议
│  └─ ui/             # 共享 UI（可选）
└─ docs/
```

---

## 4. 系统架构

```
┌────────────────────────── 桌面端 (Electron) ──────────────────────────┐
│  Renderer (React)                         Main (Node)                  │
│  ┌───────────────┐  IPC   ┌───────────────────────────────────────┐   │
│  │ 目录树/列表/卡片│ <────> │ DB(SQLite+FTS5) · 任务队列 · 抓取/AI    │   │
│  │ 右侧 webview   │        │ 授权校验 · 导入导出 · 配置             │   │
│  └───────────────┘        └───────────────────────────────────────┘   │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │ HTTPS（激活/校验/可选同步）
                                 ▼
┌──────────────── 后端 (NestJS + PostgreSQL) ────────────────┐
│ Auth · License(签发/校验/吊销) · Payment(策略) · Email(策略) │
│ Admin API · Settings(配置化) · Webhook(支付回调)            │
└───────▲───────────────────────────────▲────────────────────┘
        │                               │
   ┌────┴─────┐                   ┌──────┴───────┐
   │ Portal   │ 在线下单/支付/取码 │ Admin 后台    │ 配置/激活码/标签库
   └──────────┘                   └──────────────┘
```

**大数据量「不卡」设计**：抓取与 AI 富化在 Main 进程的并发受限队列（p-queue，可配并发）逐条/批处理 → 写回 SQLite → Renderer 用虚拟滚动只渲染可见行；搜索走 FTS5 索引；批量导入用事务 + 分块。

---

## 5. 核心数据模型（桌面端 SQLite）

```
categories(id, parent_id, name, icon, color, sort, is_system, created_at)
bookmarks(id, url, url_hash, title, description, favicon, image,
          category_id, content_excerpt, status,           -- status: active/dead/archived
          ai_state,                                        -- pending/processing/done/failed
          visited_at, created_at, updated_at)
tags(id, name, color, is_active)                            -- 后台可维护
bookmark_tags(bookmark_id, tag_id)
jobs(id, bookmark_id, type, state, attempts, error, payload, created_at) -- 抓取/AI 任务
settings(key, value)                                        -- LLM 配置、主题等
fts_bookmarks(...)  -- FTS5 虚表：title/description/excerpt/url/tags
license(device_id, code, token, status, expire_at, activated_at) -- 本地许可缓存
```
- `url_hash` 去重；`category_id` 树形；FTS5 同步触发器维护索引。

**后端（PostgreSQL）**：`users, license_codes, devices, orders, payments, email_logs, settings(配置化), tags_catalog, category_templates`。

---

## 6. AI 富化流水线（后端工程 + AI 视角）

1. 用户粘贴 URL → 立即落库（status=active, ai_state=pending）→ 入队。
2. 抓取阶段：HTTP 取 HTML → cheerio 解析 title / meta description / og:image / favicon / 正文摘要（去脚本样式，截断）。
3. AI 阶段：调用「OpenAI 兼容」接口，Prompt 输出结构化 JSON：`{description, tags[], suggested_category}`（强制中文、限定 tags 数量、给定可选分类集合做约束）。
4. 写回 + 更新 FTS。失败重试（指数退避，最多 N 次），可在 UI 看任务状态。
5. 并发受控（配置 concurrency，默认 3），尊重站点礼貌延迟；批量导入时整体排队，不阻塞 UI。

LLM Provider 抽象：`{name, baseURL, apiKey, model, temperature}`，默认 OpenAI 兼容，可填自建/国内大模型兼容端点。

---

## 7. 授权与激活体系（架构师 + 后端视角）

- **设备指纹**：machine-id + 应用盐，生成 `device_id`。
- **激活流程**：登录 → 输入激活码 → 后端校验（未用/未过期/绑定数未超）→ 签发 **许可证 Token（JWT，服务端私钥签名）** → 本地缓存。
- **离线宽限**：App 内置公钥校验 Token 签名与过期；断网可离线用到 Token 过期，到期需联网续期，避免「断网即不可用」。
- **吊销**：后台可吊销激活码/设备；联网时校验失败则降级为受限态。
- **试用态**：未激活可体验只读/限量，引导购买。

---

## 8. 可配置后台 Admin（PM + 后端视角）

> 你的要求：「后台先实现（配置化），登录/支付/邮件后续我再配上去」。做法 = **Provider 策略模式 + Settings 表 + Admin 配置界面**，先留好插槽，后台开箱即用，凭证后填。

- **激活码管理**：批量生成（数量/有效期/绑定设备数/套餐）、查询、吊销、导出。
- **标签库维护**：标签增删改、启用/停用、合并、同义词（供 AI 约束）。
- **分类模板**：维护可下发的 YAML 默认分类模板。
- **配置化能力（可后插）**：
  - 登录：本地账号密码 / 邮箱验证码 / OAuth（GitHub/Google/微信，留接口）。
  - 支付：策略接口 `PaymentProvider`，预置 Stripe / 支付宝 / 微信支付适配器（先空实现 + 配置位）。
  - 邮件：策略接口 `EmailProvider`，预置 SMTP / SendGrid（先配置位）。
  - 各 Provider 的开关与密钥从 Settings/.env 读取，Admin 可视化填写。
- **订单/用户**：查看订单、支付状态、发码记录。

---

## 9. 付费门户 Portal（PM 视角）

- 落地页（产品卖点/截图/价格）→ 选套餐 → 下单 → 调支付（配置化 Provider）→ 支付回调 → 后端生成激活码 → 邮件发码 + 页面展示。
- 全中文、SEO 友好（Next.js SSR）、移动端自适应。
- 价格/套餐、文案、支付开关均可在 Admin/配置中调整。

---

## 10. 里程碑与交付物（项目经理视角）

| 阶段 | 内容 | 产出 |
|---|---|---|
| **M1 桌面端 MVP** | 项目骨架 + UI 系统 + 收藏 CRUD + 左目录右网页 + 列表/卡片 + 搜索 + 导入导出 | 可运行桌面端 + 安装包 |
| **M2 AI 富化** | 抓取 + LLM 描述/标签/分类 + 配置页 + 异步队列 + 大数据量优化 | AI 能力可用 |
| **M3 授权体系** | 注册/登录 + 激活码 + 设备绑定 + 离线宽限 | 授权可用 |
| **M4 后端 + 后台** | NestJS API + Admin（激活码/标签/配置化插槽） | 可配置后台可运行 |
| **M5 付费门户** | Next.js 门户 + 支付策略 + 发码邮件（配置化） | 商业闭环骨架 |
| **M6 打包交付** | 三端打包 + 源码压缩包 + 部署说明 | 安装包 + 源码 zip |

> 因整体工作量很大，建议**按 M1→M2→M3 优先交付一个可独立售卖的桌面端**，M4/M5 以可运行骨架 + 配置化插槽交付，凭证后补。

---

## 11. 需要你确认的关键决策（影响我马上开工的方向）

1. **桌面 UI 风格**：方案 A（Ant Design，偏企业/出活快）还是方案 B（Tailwind+shadcn，偏现代精致）？或你有参考产品/配色偏好？
2. **首期范围**：是否同意「先把桌面端 MVP（M1+M2+M3）做扎实并打包交付，后端/门户给可运行骨架 + 配置插槽」？还是要一次性把门户+支付也打通？
3. **支付渠道**：门户上线要对接哪个（Stripe / 支付宝 / 微信支付 / 先留空配置位）？
4. **代码托管**：是否要我建 Git 仓库并提 PR？还是只交付源码压缩包 + 安装包即可？（当前没有已克隆仓库）
5. **大模型默认 Provider**：默认用「OpenAI 兼容」端点即可吗？是否需要预置某个国内大模型（如通义/智谱/DeepSeek 兼容端点）？

确认后我立即按 M1 开始编码。
